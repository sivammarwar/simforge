"""
Database Configuration and Session Management
SQLAlchemy + PostgreSQL integration for Seemulator
"""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
import os
from logging import getLogger

logger = getLogger(__name__)

# Database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://simforge:simforge@localhost:5432/simforge"
)

# Create engine with proper connection pooling
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,  # Important for Docker/Kubernetes
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    connect_args={"connect_timeout": 10}
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False
)

# Base class for ORM models
Base = declarative_base()

def get_db():
    """Dependency injection for database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database (create all tables)"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        logger.warning("Continuing without database — DB-dependent features will be unavailable.")

def check_db_connection():
    """Check if database is accessible"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False

# Event listener for connection pool
@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    """Configure connection on creation"""
    cursor = dbapi_conn.cursor()
    cursor.execute("SET TIME ZONE 'UTC'")
    cursor.close()
