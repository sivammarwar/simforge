"""
SQLAlchemy ORM Models for SimForge
Task, SimulationResult, MaterialCache
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, JSON, 
    ForeignKey, Index, Enum, Text, Boolean, ARRAY
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from db.database import Base
import enum
import uuid

# ─── ENUMS ────────────────────────────────────────────────────────────

class TaskStatus(str, enum.Enum):
    """Task status enumeration"""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

# ─── TASK MODEL ────────────────────────────────────────────────────────

class Task(Base):
    """
    Simulation task record
    Tracks status, progress, and timing of solver execution
    """
    __tablename__ = "tasks"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Submission info
    domain = Column(String(50), nullable=False, index=True)  # Structural, Fluids, Thermal, etc.
    system_type = Column(String(100), nullable=False)        # Cantilever Beam, Pipe Flow, etc.
    solver_name = Column(String(50), nullable=False, index=True)  # CalculiX, OpenFOAM, etc.
    execution_environment = Column(String(20), default="docker")  # docker, local
    
    # Status tracking
    status = Column(Enum(TaskStatus), default=TaskStatus.QUEUED, nullable=False, index=True)
    progress = Column(Integer, default=0)  # 0-100
    stage = Column(String(100), default="Queued")  # Current execution stage
    
    # Timing
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Data
    model = Column(JSON, nullable=False)  # Full model definition
    options = Column(JSON, default={})    # Solver options (mesh_size, etc.)
    
    # Results
    result = Column(JSON, nullable=True)  # Complete result with metrics
    error = Column(Text, nullable=True)   # Error message if failed
    
    # Files
    mesh_file_id = Column(String(255), nullable=True)  # MinIO object ID for mesh
    result_files = Column(ARRAY(String), default=[])   # List of MinIO object IDs for results
    celery_task_id = Column(String(255), nullable=True)  # Celery task ID for tracking
    
    # Relationships
    result_record = relationship("SimulationResult", back_populates="task", uselist=False)
    
    # Indexes
    __table_args__ = (
        Index('ix_tasks_domain_created', 'domain', 'created_at'),
        Index('ix_tasks_solver_status', 'solver_name', 'status'),
    )
    
    def to_dict(self):
        """Convert to dictionary for JSON response"""
        return {
            "task_id": self.id,
            "domain": self.domain,
            "system_type": self.system_type,
            "solver_name": self.solver_name,
            "status": self.status.value,
            "progress": self.progress,
            "stage": self.stage,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "elapsed_time": self._get_elapsed_time(),
            "result": self.result,
            "error": self.error
        }
    
    def _get_elapsed_time(self) -> float:
        """Calculate elapsed time in seconds"""
        from datetime import timezone
        end_time = self.completed_at or datetime.now(timezone.utc)
        start_time = self.created_at
        if start_time:
            # Ensure both datetimes are timezone-aware
            if start_time.tzinfo is None:
                start_time = start_time.replace(tzinfo=timezone.utc)
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
            return (end_time - start_time).total_seconds()
        return 0.0

# ─── SIMULATION RESULT MODEL ──────────────────────────────────────────

class SimulationResult(Base):
    """
    Detailed simulation results
    Metrics, contour data, convergence info
    """
    __tablename__ = "results"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, unique=True, index=True)
    
    # Result data
    metrics = Column(JSON, nullable=False)  # [{name, value, unit, rawValue}, ...]
    contour_field = Column(JSON, nullable=True)  # {x, y, z, stress, ...}
    time_series = Column(JSON, nullable=True)  # {t, y, ...}
    frequency_response = Column(JSON, nullable=True)  # {freq, mag, phase}
    
    # Metadata
    convergence_history = Column(JSON, nullable=True)  # Residuals, etc.
    mesh_stats = Column(JSON, nullable=True)  # {nodes: N, elements: M, quality: Q}
    computational_cost = Column(JSON, nullable=True)  # {cpu_time: T, memory: M, ...}
    
    # Relationships
    task = relationship("Task", back_populates="result_record")
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# ─── MATERIAL CACHE MODEL ────────────────────────────────────────────

class MaterialCache(Base):
    """
    Cache for material properties from external sources
    Reduces lookup time and provides audit trail
    """
    __tablename__ = "material_cache"
    
    id = Column(String(50), primary_key=True)  # Material ID (AISI_1020_Steel, etc.)
    
    # Cached data
    properties = Column(JSON, nullable=False)
    source = Column(String(100), nullable=True)  # matWeb, ASM, etc.
    
    # Metadata
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_accessed = Column(DateTime(timezone=True), onupdate=func.now())
    access_count = Column(Integer, default=0)

# ─── PARAMETER SWEEP MODEL ────────────────────────────────────────────

class ParameterSweep(Base):
    """
    Parameter sweep job tracking
    Multi-task optimization runs
    """
    __tablename__ = "sweeps"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Sweep definition
    base_task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False)
    sweep_parameters = Column(JSON, nullable=False)  # [{name, min, max, points}, ...]
    total_points = Column(Integer, nullable=False)
    completed_points = Column(Integer, default=0)
    
    # Status
    status = Column(String(20), default="running")  # running, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Results
    task_ids = Column(ARRAY(String), default=[])  # IDs of all tasks in sweep
    pareto_front = Column(JSON, nullable=True)  # Pareto optimal points

# ─── SESSION MODEL ─────────────────────────────────────────────────────

class UserSession(Base):
    """
    User session for tracking simulation history
    Simple session tracking (no auth system yet)
    """
    __tablename__ = "sessions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_token = Column(String(255), unique=True, nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_activity = Column(DateTime(timezone=True), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    # Task history
    task_ids = Column(ARRAY(String), default=[])  # List of task IDs in this session
