"""
Simulation API Routes
POST /api/simulate - Submit simulation job
GET /api/task/:task_id - Get task status
GET /api/task/:task_id/result - Get simulation result
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import uuid4
from datetime import datetime
from sqlalchemy.orm import Session
from db import get_db, Task, TaskStatus, init_db
from workers.solver_worker import dispatch_solver  # ← Use Celery

router = APIRouter()

# ─── DATA MODELS ──────────────────────────────────────────────────────

class SolverRequest(BaseModel):
    domain: str
    system_type: str
    solver_name: str
    input_file: Dict[str, Any]  # {filename, content}
    execution_environment: str = "docker"
    options: Optional[Dict[str, Any]] = None
    model: Optional[Dict[str, Any]] = None  # Legacy field for backward compatibility

class SolverResponse(BaseModel):
    task_id: str
    status: str
    message: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# ─── SOLVER REGISTRY ──────────────────────────────────────────────────

SOLVER_REGISTRY = {
    "Circuits": {"solver": "ngspice", "timeout": 120},
}

# ─── API ENDPOINTS ────────────────────────────────────────────────────

@router.post("/simulate", response_model=SolverResponse)
async def simulate(
    request: SolverRequest,
    db: Session = Depends(get_db)
):
    """
    Submit a simulation job.
    
    Returns immediately with task_id. Use GET /api/task/{task_id} to poll status.
    For real-time updates, connect WebSocket at /ws/progress/{task_id}
    """
    
    # ─── VALIDATION ───────────────────────────────────────────────────
    
    # Check domain exists
    if request.domain not in SOLVER_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown domain: {request.domain}. Valid: {list(SOLVER_REGISTRY.keys())}"
        )
    
    # Check solver matches domain
    expected_solver = SOLVER_REGISTRY[request.domain]["solver"]
    if request.solver_name != expected_solver:
        raise HTTPException(
            status_code=400,
            detail=f"Solver {request.solver_name} incompatible with domain {request.domain}. Expected: {expected_solver}"
        )
    
    # Validate input_file structure
    if not request.input_file:
        raise HTTPException(status_code=400, detail="Input file cannot be empty")
    
    if "filename" not in request.input_file:
        raise HTTPException(status_code=400, detail="Input file missing filename")
    
    if "content" not in request.input_file:
        raise HTTPException(status_code=400, detail="Input file missing content")
    
    # ─── CREATE TASK ──────────────────────────────────────────────────
    
    task_id = str(uuid4())
    
    try:
        task = Task(
            id=task_id,
            domain=request.domain,
            system_type=request.system_type,
            solver_name=request.solver_name,
            execution_environment=request.execution_environment,
            status=TaskStatus.QUEUED,
            progress=0,
            stage="Queued",
            model=request.input_file,  # Store input_file in model field for now
            options=request.options or {}
        )
        
        db.add(task)
        db.commit()
        db.refresh(task)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )
    
    # ─── ENQUEUE SOLVER JOB WITH CELERY ───────────────────────────────
    # This dispatches to worker process(es), doesn't block
    
    try:
        celery_task = dispatch_solver.delay(
            task_id,
            {
                "domain": request.domain,
                "system_type": request.system_type,
                "solver_name": request.solver_name,
                "input_file": request.input_file,  # Forward input_file to worker
                "model": request.model,  # Legacy field for backward compatibility
                "options": request.options or {}
            }
        )
        
        # Store Celery task ID for reference
        task.celery_task_id = celery_task.id
        db.commit()
        
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = f"Failed to enqueue: {str(e)}"
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enqueue solver: {str(e)}"
        )
    
    return SolverResponse(
        task_id=task_id,
        status="queued",
        message=f"Simulation queued. Solver: {request.solver_name}. "
                f"Connect WebSocket at /ws/progress/{task_id} for real-time updates."
    )


@router.head("/task/{task_id}")
async def head_task_status(task_id: str, db: Session = Depends(get_db)):
    """Handle HEAD requests for task status endpoint"""
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    return JSONResponse(content={})

@router.get("/task/{task_id}")
async def get_task_status(task_id: str, db: Session = Depends(get_db)):
    """
    Get status of a submitted task
    
    Response includes:
    - status: queued|running|completed|failed
    - progress: 0-100
    - stage: Current solver stage
    - elapsed_time: Seconds since creation
    """
    
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    return task.to_dict()


@router.get("/task/{task_id}/result")
async def get_task_result(task_id: str, db: Session = Depends(get_db)):
    """
    Get FULL results of a completed task
    
    Only available after status is "completed".
    Includes all metrics, contours, time series.
    """
    
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    if task.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Task {task_id} not completed. Current status: {task.status.value}"
        )
    
    if not task.result:
        raise HTTPException(
            status_code=500,
            detail=f"Task completed but result is missing"
        )
    
    return {
        "task_id": task_id,
        "status": "completed",
        "result": task.result
    }


@router.get("/tasks")
async def list_tasks(
    status: Optional[str] = None,
    domain: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    List all tasks with optional filtering
    
    Query parameters:
    - status: queued|running|completed|failed
    - domain: Circuits
    - limit: Max results (default 50)
    - offset: Pagination offset (default 0)
    """
    
    query = db.query(Task)
    
    # Filters
    if status:
        try:
            task_status = TaskStatus(status)
            query = query.filter(Task.status == task_status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    if domain:
        query = query.filter(Task.domain == domain)
    
    # Order by creation time (newest first)
    query = query.order_by(Task.created_at.desc())
    
    # Pagination
    total = query.count()
    tasks = query.limit(limit).offset(offset).all()
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "tasks": [t.to_dict() for t in tasks]
    }


@router.delete("/task/{task_id}")
async def cancel_task(task_id: str, db: Session = Depends(get_db)):
    """Cancel a queued or running task"""
    
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    if task.status not in [TaskStatus.QUEUED, TaskStatus.RUNNING]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status: {task.status.value}"
        )
    
    task.status = TaskStatus.CANCELLED
    task.error = "Cancelled by user"
    db.commit()
    
    return {"message": f"Task {task_id} cancelled"}


@router.get("/solvers")
async def list_solvers():
    """List all available solvers with their capabilities"""
    return {
        "solvers": SOLVER_REGISTRY,
        "total": len(SOLVER_REGISTRY)
    }
