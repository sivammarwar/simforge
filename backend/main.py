"""
Seemulator Solver API - Main Entry Point
Production-grade backend for engineering simulation platform
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
from logging.config import dictConfig
import logging
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Database
from db import init_db, check_db_connection

# API routes
from api import routes_simulate, routes_task, routes_chat
from circuits.api_routes import router as circuits_router
from websocket.progress_ws import router as ws_router

# ─── LOGGING CONFIGURATION ─────────────────────────────────────────────

dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "[%(levelname)s] %(name)s - %(message)s"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default"
        }
    },
    "loggers": {
        "": {
            "level": os.getenv("LOG_LEVEL", "INFO"),
            "handlers": ["console"]
        }
    }
})

logger = logging.getLogger(__name__)

# ─── LIFESPAN MANAGEMENT ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle
    
    - On startup: Initialize database, check connections
    - On shutdown: Clean up resources
    """
    
    # ─── STARTUP ───────────────────────────────────────────────────────
    
    logger.info("Seemulator API starting up...")
    
    try:
        # Initialize database tables
        logger.info("Initializing database...")
        init_db()
        logger.info("Database initialized successfully")
        
        # Check database connection
        if check_db_connection():
            logger.info("Database connection verified")
        else:
            logger.warning("Database connection check failed - continuing anyway")
        
        # Check Redis connection (optional - worker uses it)
        try:
            import redis
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            r = redis.from_url(redis_url)
            r.ping()
            logger.info("Redis connection verified")
        except Exception as e:
            logger.warning(f"Redis connection check failed: {e}")
        
        # Check MinIO connection (optional - for file storage)
        try:
            from storage.minio_client import minio_client
            minio_client.list_buckets()
            logger.info("MinIO connection verified")
        except Exception as e:
            logger.warning(f"MinIO connection check failed: {e}")
        
        logger.info("Seemulator API startup complete")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    
    # ─── YIELD CONTROL TO APPLICATION ─────────────────────────────────
    
    yield
    
    # ─── SHUTDOWN ─────────────────────────────────────────────────────
    
    logger.info("Seemulator API shutting down...")
    logger.info("Shutdown complete")

# ─── FASTAPI APPLICATION ───────────────────────────────────────────────

app = FastAPI(
    title="Seemulator Solver API",
    version="2.0.0",
    description="Production-grade engineering simulation backend with real FEA/CFD solvers",
    lifespan=lifespan
)

# ─── MIDDLEWARE ─────────────────────────────────────────────────────────

# CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# GZip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── CUSTOM MIDDLEWARE ───────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request, call_next):
    """Log all incoming requests"""
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"{request.method} {request.url.path} - {response.status_code}")
    return response

# ─── ROUTERS ───────────────────────────────────────────────────────────

app.include_router(routes_simulate.router, prefix="/api", tags=["simulate"])
app.include_router(routes_task.router, prefix="/api", tags=["tasks"])
app.include_router(routes_chat.router, tags=["chat"])
app.include_router(circuits_router, tags=["circuits"])
app.include_router(ws_router, prefix="/ws", tags=["websocket"])

# ─── ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "name": "Seemulator Solver API",
        "version": "2.0.0",
        "status": "running",
        "solvers": [
            "ngspice (Circuits)"
        ]
    }

@app.get("/health")
async def health():
    """
    Detailed health check
    
    Returns status of all dependencies:
    - API: Always healthy if endpoint reachable
    - Database: PostgreSQL connection status
    - Redis: Celery broker status
    - MinIO: Object storage status
    """
    
    health_status = {
        "api": "healthy",
        "database": "unknown",
        "redis": "unknown",
        "minio": "unknown"
    }
    
    # Check database
    try:
        if check_db_connection():
            health_status["database"] = "healthy"
        else:
            health_status["database"] = "unhealthy"
    except Exception as e:
        health_status["database"] = f"error: {str(e)}"
    
    # Check Redis
    try:
        import redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(redis_url)
        r.ping()
        health_status["redis"] = "healthy"
    except Exception as e:
        health_status["redis"] = f"error: {str(e)}"
    
    # Check MinIO
    try:
        from storage.minio_client import minio_client
        minio_client.list_buckets()
        health_status["minio"] = "healthy"
    except Exception as e:
        health_status["minio"] = f"error: {str(e)}"
    
    # Overall status
    overall_healthy = all(
        status == "healthy" 
        for status in health_status.values()
    )
    
    return {
        "status": "healthy" if overall_healthy else "degraded",
        "checks": health_status
    }

# ─── GLOBAL EXCEPTION HANDLER ───────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Catch all unhandled exceptions"""
    logger.error(f"Unhandled exception: {exc}")
    return {
        "error": "Internal server error",
        "detail": str(exc)
    }

# ─── MAIN ENTRY POINT ───────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("API_PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true",
        log_level="info"
    )
