"""
WebSocket Progress Streaming
Real-time solver progress updates via WebSocket + Redis pub/sub
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import asyncio
import logging
import redis.asyncio as redis

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── CONNECTION MANAGER ────────────────────────────────────────────────────

class ConnectionManager:
    """Manage WebSocket connections and broadcast messages"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.redis_client: redis.Redis = None
    
    async def _ensure_redis(self):
        """Lazy initialize Redis connection"""
        if self.redis_client is None:
            import os
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            self.redis_client = await redis.from_url(redis_url)
    
    async def connect(self, websocket: WebSocket, task_id: str):
        """Accept WebSocket connection and subscribe to progress updates"""
        await websocket.accept()
        
        if task_id not in self.active_connections:
            self.active_connections[task_id] = set()
        
        self.active_connections[task_id].add(websocket)
        logger.info(f"[WebSocket] Client connected for task {task_id}")
    
    def disconnect(self, task_id: str, websocket: WebSocket):
        """Remove closed WebSocket connection"""
        if task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
        logger.info(f"[WebSocket] Client disconnected for task {task_id}")
    
    async def send_progress(self, task_id: str, progress_data: dict):
        """Broadcast progress to all connected clients"""
        if task_id not in self.active_connections:
            return
        
        disconnected = set()
        for websocket in self.active_connections[task_id]:
            try:
                await websocket.send_json(progress_data)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.add(websocket)
        
        # Clean up disconnected
        for ws in disconnected:
            self.disconnect(task_id, ws)

manager = ConnectionManager()

# ─── WEBSOCKET ENDPOINTS ──────────────────────────────────────────────────

@router.websocket("/progress/{task_id}")
async def websocket_progress(websocket: WebSocket, task_id: str):
    """
    WebSocket endpoint for real-time progress updates
    
    Client connects with: ws://localhost:8787/ws/progress/{task_id}
    
    Receives messages like:
    {
        "type": "progress",
        "stage": "Running solver",
        "progress": 45,
        "solver": "CalculiX",
        "detail": "Computing stresses..."
    }
    """
    
    await manager.connect(websocket, task_id)
    
    try:
        # ─── SUBSCRIBE TO REDIS CHANNEL ─────────────────────────────
        
        await manager._ensure_redis()
        
        # Create Redis pub/sub for this task's progress channel
        pubsub = manager.redis_client.pubsub()
        await pubsub.subscribe(f"progress:{task_id}")
        
        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "task_id": task_id,
            "message": "Progress stream connected"
        })
        
        # ─── LISTEN FOR MESSAGES FROM REDIS ───────────────────────────
        
        async def listen_redis():
            """Listen for progress updates from Redis pub/sub"""
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        progress_data = json.loads(message["data"])
                        await manager.send_progress(task_id, progress_data)
                    except json.JSONDecodeError:
                        logger.error("Failed to decode progress message from Redis")
        
        # ─── LISTEN FOR CLIENT MESSAGES ───────────────────────────────
        
        async def listen_websocket():
            """Listen for client messages (ping/keepalive)"""
            try:
                while True:
                    data = await websocket.receive_text()
                    
                    if data == "ping":
                        await websocket.send_json({"type": "pong"})
                    else:
                        logger.debug(f"Received message from client: {data}")
            
            except WebSocketDisconnect:
                manager.disconnect(task_id, websocket)
                await pubsub.unsubscribe(f"progress:{task_id}")
                logger.info(f"Client disconnected from task {task_id}")
        
        # ─── RUN BOTH LISTENERS CONCURRENTLY ──────────────────────────
        
        # Listen for Redis messages and client messages in parallel
        await asyncio.gather(
            listen_redis(),
            listen_websocket(),
            return_exceptions=True
        )
    
    except Exception as e:
        logger.error(f"WebSocket error for task {task_id}: {e}")
        manager.disconnect(task_id, websocket)
        raise
