"""
Task Management API Routes
GET /api/task/:task_id - Get task status
DELETE /api/task/:task_id - Delete task
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from db import get_db, Task, TaskStatus

router = APIRouter()

# ─── DATA MODELS ──────────────────────────────────────────────────────────

class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: int = 0
    stage: str = ""
    elapsed_time: float = 0.0
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class TaskList(BaseModel):
    tasks: List[TaskStatus]
    total: int

# ─── API ENDPOINTS ────────────────────────────────────────────────────────

@router.get("/tasks")
async def list_tasks(status: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    """List all tasks, optionally filtered by status"""
    from datetime import datetime
    
    query = db.query(Task)
    if status:
        query = query.filter(Task.status == status)
    
    tasks = query.order_by(Task.created_at.desc()).limit(limit).all()
    
    task_list = []
    for task in tasks:
        elapsed = 0.0
        if task.status in ["running", "completed", "failed"]:
            elapsed = (datetime.utcnow() - task.created_at).total_seconds()
        
        task_list.append(TaskStatus(
            task_id=str(task.id),
            status=task.status.value if hasattr(task.status, 'value') else task.status,
            progress=task.progress or 0,
            stage=task.stage or "",
            elapsed_time=elapsed,
            result=task.result if task.status == "completed" else None,
            error=task.error if task.status == "failed" else None
        ))
    
    return TaskList(tasks=task_list, total=len(task_list))

@router.get("/task/{task_id}")
async def get_task(task_id: str, db: Session = Depends(get_db)):
    """Get task status by ID"""
    from datetime import datetime
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    elapsed = 0.0
    if task.status in ["running", "completed", "failed"]:
        elapsed = (datetime.utcnow() - task.created_at).total_seconds()
    
    return TaskStatus(
        task_id=str(task.id),
        status=task.status.value if hasattr(task.status, 'value') else task.status,
        progress=task.progress or 0,
        stage=task.stage or "",
        elapsed_time=elapsed,
        result=task.result if task.status == "completed" else None,
        error=task.error if task.status == "failed" else None
    )

@router.delete("/task/{task_id}")
async def delete_task(task_id: str, db: Session = Depends(get_db)):
    """Delete a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    db.delete(task)
    db.commit()
    return {"message": f"Task {task_id} deleted"}
