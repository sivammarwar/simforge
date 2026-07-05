"""
Solver Worker
Master solver dispatcher that routes to appropriate solvers
RUNS IN SEPARATE CELERY WORKER PROCESS(ES)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workers.celery_app import celery_app
from typing import Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from db import SessionLocal, Task, TaskStatus, SimulationResult
import logging
import traceback

logger = logging.getLogger(__name__)

# ─── CELERY TASK ──────────────────────────────────────────────────────

@celery_app.task(bind=True, acks_late=True, max_retries=2)
def dispatch_solver(self, task_id: str, request: Dict[str, Any]):
    """
    Master solver dispatcher. Runs inside Celery worker.
    acks_late=True means task is marked complete AFTER successful execution
    max_retries=2 means we retry on transient failures
    
    Args:
        task_id: UUID of the task
        request: {domain, solver_name, input_file, options}
    
    Returns:
        {status: "completed"|"failed", result_or_error: ...}
    """
    
    db = SessionLocal()
    
    try:
        # ─── UPDATE STATUS TO RUNNING ────────────────────────────────
        
        logger.info(f"[Worker] Task {task_id}: Starting solver {request['solver_name']}")
        
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            logger.error(f"[Worker] Task {task_id}: Not found in database!")
            return {"status": "failed", "error": "Task not found"}
        
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        task.stage = "Preparing inputs"
        task.progress = 5
        db.commit()
        
        # Broadcast progress to WebSocket
        broadcast_progress(task_id, "Preparing inputs", 5, solver=request["solver_name"])
        
        # ─── ROUTE TO APPROPRIATE SOLVER ──────────────────────────────
        
        domain = request["domain"]
        solver_name = request["solver_name"]
        input_file = request.get("input_file") or request.get("model")  # Prefer input_file, fall back to model for compatibility
        options = request.get("options", {})
        
        result = None
        
        try:
            if solver_name == "ngspice":
                from solvers.ngspice import run_ngspice_docker
                result = run_ngspice_docker(task_id, input_file, options)
            
            else:
                raise Exception(f"Solver {solver_name} is not supported. Circuits/ngspice is the only registered solver.")
            
            if not result:
                raise Exception(f"Solver {solver_name} returned None")
            
        except Exception as solver_error:
            logger.error(f"[Worker] Task {task_id}: Solver failed: {str(solver_error)}")
            logger.error(traceback.format_exc())
            raise solver_error
        
        # ─── STORE RESULT IN DATABASE ────────────────────────────────
        
        logger.info(f"[Worker] Task {task_id}: Solver completed successfully")
        
        task.result = result
        task.status = TaskStatus.COMPLETED
        task.progress = 100
        task.stage = "Complete"
        task.completed_at = datetime.utcnow()
        db.commit()
        
        # Store detailed result in SimulationResult table
        try:
            sim_result = SimulationResult(
                task_id=task_id,
                metrics=result.get("metrics", []),
                contour_field=result.get("contour_field"),
                time_series=result.get("time_series"),
                frequency_response=result.get("frequency_response"),
                convergence_history=result.get("convergence_history"),
                mesh_stats=result.get("mesh_stats")
            )
            db.add(sim_result)
            db.commit()
        except Exception as e:
            logger.warning(f"[Worker] Task {task_id}: Failed to store detailed result: {e}")
            # Don't fail the whole task for this
        
        # ─── STORE FILES IN MINIO ────────────────────────────────────
        
        # Temporarily disabled due to MinIO 503 errors
        # try:
        #     from storage.minio_client import minio_client
        #     
        #     # Store result files if they exist
        #     raw_files = result.get("raw_files", {})
        #     minio_ids = []
        #     
        #     for file_type, file_path in raw_files.items():
        #         try:
        #             object_name = f"results/{task_id}/{file_type}"
        #             minio_client.upload_file(file_path, object_name)
        #             minio_ids.append(object_name)
        #             logger.info(f"[Worker] Task {task_id}: Uploaded {file_type} to MinIO")
        #         except Exception as e:
        #             logger.warning(f"[Worker] Task {task_id}: Failed to upload {file_type}: {e}")
        #     
        #     task.result_files = minio_ids
        #     db.commit()
        #     
        # except Exception as e:
        #     logger.warning(f"[Worker] Task {task_id}: MinIO storage failed: {e}")
        
        # Broadcast completion
        broadcast_progress(task_id, "Complete", 100, solver=solver_name)
        
        return {
            "status": "completed",
            "task_id": task_id,
            "result": result
        }
    
    except Exception as e:
        # ─── HANDLE FAILURE ───────────────────────────────────────────
        
        logger.error(f"[Worker] Task {task_id}: ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        
        try:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.FAILED
                task.stage = "Failed"
                task.error = str(e)
                task.completed_at = datetime.utcnow()
                db.commit()
            
            broadcast_progress(task_id, "Failed", 0, detail=str(e), solver="")
        except Exception as db_error:
            logger.error(f"[Worker] Task {task_id}: Failed to update error state: {db_error}")
        
        return {
            "status": "failed",
            "task_id": task_id,
            "error": str(e)
        }
    
    finally:
        db.close()

# ─── PROGRESS BROADCASTING ────────────────────────────────────────────

def broadcast_progress(task_id: str, stage: str, progress: int, 
                      detail: str = "", solver: str = ""):
    """
    Broadcast progress update via Redis pub/sub
    
    This allows WebSocket connections to receive real-time updates
    from worker processes without direct connection
    
    Args:
        task_id: Task UUID
        stage: Current execution stage
        progress: 0-100 percentage
        detail: Optional detail message
        solver: Solver name for context
    """
    
    try:
        import redis
        import json
        
        import os
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(redis_url)
        
        progress_data = {
            "type": "progress",
            "task_id": task_id,
            "stage": stage,
            "progress": progress,
            "detail": detail,
            "solver": solver,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Publish to Redis channel
        r.publish(f"progress:{task_id}", json.dumps(progress_data))
        
    except Exception as e:
        logger.warning(f"Failed to broadcast progress: {e}")
        # Don't fail the whole worker if broadcasting fails
