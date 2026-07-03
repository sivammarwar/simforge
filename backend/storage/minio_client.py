"""
MinIO Client
S3-compatible object storage for simulation results
"""

from minio import Minio
from minio.error import S3Error
import os
from pathlib import Path
from typing import Optional

class MinIOClient:
    """MinIO client for file storage"""
    
    def __init__(self):
        self.endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
        self.access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        self.secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        self.bucket_name = os.getenv("MINIO_BUCKET", "simforge-results")
        
        self.client = None
        self._initialize()
    
    def _initialize(self):
        """Initialize MinIO client"""
        try:
            self.client = Minio(
                self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=False  # Use HTTP for local development
            )
            
            # Create bucket if it doesn't exist
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                print(f"[MinIO] Created bucket: {self.bucket_name}")
            else:
                print(f"[MinIO] Bucket exists: {self.bucket_name}")
                
        except S3Error as e:
            print(f"[MinIO] Initialization error: {e}")
            self.client = None
    
    def upload_file(self, file_path: str, object_name: str) -> Optional[str]:
        """Upload file to MinIO"""
        if not self.client:
            print("[MinIO] Client not initialized")
            return None
        
        try:
            self.client.fput_object(
                self.bucket_name,
                object_name,
                file_path
            )
            print(f"[MinIO] Uploaded: {object_name}")
            return f"{self.bucket_name}/{object_name}"
        except S3Error as e:
            print(f"[MinIO] Upload error: {e}")
            return None
    
    def download_file(self, object_name: str, file_path: str) -> bool:
        """Download file from MinIO"""
        if not self.client:
            print("[MinIO] Client not initialized")
            return False
        
        try:
            self.client.fget_object(
                self.bucket_name,
                object_name,
                file_path
            )
            print(f"[MinIO] Downloaded: {object_name}")
            return True
        except S3Error as e:
            print(f"[MinIO] Download error: {e}")
            return False
    
    def delete_file(self, object_name: str) -> bool:
        """Delete file from MinIO"""
        if not self.client:
            print("[MinIO] Client not initialized")
            return False
        
        try:
            self.client.remove_object(self.bucket_name, object_name)
            print(f"[MinIO] Deleted: {object_name}")
            return True
        except S3Error as e:
            print(f"[MinIO] Delete error: {e}")
            return False
    
    def get_presigned_url(self, object_name: str, expires: int = 3600) -> Optional[str]:
        """Get presigned URL for file download"""
        if not self.client:
            print("[MinIO] Client not initialized")
            return None
        
        try:
            url = self.client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=expires
            )
            return url
        except S3Error as e:
            print(f"[MinIO] Presigned URL error: {e}")
            return None
    
    def list_buckets(self):
        """List all buckets - for health checks"""
        if not self.client:
            print("[MinIO] Client not initialized")
            return None
        
        try:
            buckets = self.client.list_buckets()
            return buckets
        except S3Error as e:
            print(f"[MinIO] List buckets error: {e}")
            return None

# Global MinIO client instance
minio_client = MinIOClient()
