#!/bin/bash

# SimForge Solver Docker Images Build Script
# Builds Docker images for all solver containers

set -e

echo "=========================================="
echo "SimForge Solver Docker Images Build"
echo "=========================================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "Project root: $PROJECT_ROOT"
echo "Docker directory: $DOCKER_DIR"
echo "Changing to docker directory..."
cd "$DOCKER_DIR"

# List of solver Dockerfiles
SOLVERS=(
    "calculix"
    "openfoam"
    "elmer"
    "xfoil"
    "ngspice"
    "su2"
)

# Function to build a single solver image
build_solver() {
    local solver=$1
    local dockerfile="Dockerfile.$solver"
    local image_name="simforge-$solver"
    
    echo ""
    echo "------------------------------------------"
    echo "Building $solver solver..."
    echo "------------------------------------------"
    
    if [ ! -f "$dockerfile" ]; then
        echo "Warning: $dockerfile not found, skipping $solver"
        return 1
    fi
    
    docker build -f "$dockerfile" -t "$image_name:latest" .
    
    if [ $? -eq 0 ]; then
        echo "✓ Successfully built $image_name:latest"
        return 0
    else
        echo "✗ Failed to build $image_name:latest"
        return 1
    fi
}

# Parse command line arguments
SOLVER_TO_BUILD=""
SKIP_ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --solver)
            SOLVER_TO_BUILD="$2"
            shift 2
            ;;
        --skip-all)
            SKIP_ALL=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --solver <name>    Build only the specified solver (calculix, openfoam, elmer, xfoil, ngspice, su2)"
            echo "  --skip-all         Skip building solver images (useful if already built)"
            echo "  --help             Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Build all solver images"
            echo "  $0 --solver calculix  # Build only CalculiX solver"
            echo "  $0 --skip-all        # Skip solver builds"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Skip all if flag is set
if [ "$SKIP_ALL" = true ]; then
    echo ""
    echo "Skipping solver builds (--skip-all flag set)"
    echo ""
    exit 0
fi

# Build specific solver if requested
if [ -n "$SOLVER_TO_BUILD" ]; then
    echo "Building only $SOLVER_TO_BUILD solver..."
    build_solver "$SOLVER_TO_BUILD"
    exit $?
fi

# Build all solvers
echo ""
echo "Building all solver images..."
echo ""

FAILED_BUILDS=()
SUCCESS_BUILDS=()

for solver in "${SOLVERS[@]}"; do
    if build_solver "$solver"; then
        SUCCESS_BUILDS+=("$solver")
    else
        FAILED_BUILDS+=("$solver")
    fi
done

# Print summary
echo ""
echo "=========================================="
echo "Build Summary"
echo "=========================================="
echo ""
echo "Successfully built (${#SUCCESS_BUILDS[@]}):"
for solver in "${SUCCESS_BUILDS[@]}"; do
    echo "  ✓ simforge-$solver:latest"
done

if [ ${#FAILED_BUILDS[@]} -gt 0 ]; then
    echo ""
    echo "Failed to build (${#FAILED_BUILDS[@]}):"
    for solver in "${FAILED_BUILDS[@]}"; do
        echo "  ✗ simforge-$solver:latest"
    fi
    echo ""
    echo "Some builds failed. Check the output above for details."
    exit 1
fi

echo ""
echo "All solver images built successfully!"
echo ""
echo "Built images:"
for solver in "${SOLVERS[@]}"; do
    echo "  - simforge-$solver:latest"
done
echo ""
echo "To view images:"
echo "  docker images | grep simforge"
echo ""
