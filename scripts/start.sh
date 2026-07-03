#!/bin/bash

# SimForge Backend Startup Script
# Starts the backend services using docker-compose

set -e

echo "=========================================="
echo "SimForge Backend Startup"
echo "=========================================="

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "Error: docker-compose or docker is not installed"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Project root: $PROJECT_ROOT"
echo "Changing to project directory..."
cd "$PROJECT_ROOT"

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p /tmp/simforge
mkdir -p /tmp/simforge/chromadb

# Set environment variables if not already set
export DATABASE_URL=${DATABASE_URL:-"postgresql://simforge:simforge@postgres:5432/simforge"}
export REDIS_URL=${REDIS_URL:-"redis://redis:6379/0"}
export MINIO_ENDPOINT=${MINIO_ENDPOINT:-"minio:9000"}
export MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-"simforge"}
export MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-"simforge123"}

# Check if .env file exists, if not create a basic one
if [ ! -f .env ]; then
    echo "Creating .env file with default values..."
    cat > .env << EOF
DATABASE_URL=postgresql://simforge:simforge@postgres:5432/simforge
REDIS_URL=redis://redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=simforge
MINIO_SECRET_KEY=simforge123
EOF
fi

# Start services
echo ""
echo "Starting services with docker-compose..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker/docker-compose.yml up -d
else
    docker compose -f docker/docker-compose.yml up -d
fi

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "Checking service status..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker/docker-compose.yml ps
else
    docker compose -f docker/docker-compose.yml ps
fi

echo ""
echo "=========================================="
echo "Backend services started!"
echo "=========================================="
echo ""
echo "Services:"
echo "  - FastAPI Backend: http://localhost:8787"
echo "  - Health Check: http://localhost:8787/health"
echo "  - MinIO Console: http://localhost:9001"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker/docker-compose.yml logs -f"
echo ""
echo "To stop services:"
echo "  docker-compose -f docker/docker-compose.yml down"
echo ""
