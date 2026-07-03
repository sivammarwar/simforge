"""
Mesh Generation API Routes
POST /api/mesh - Generate mesh
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

router = APIRouter()

# ─── DATA MODELS ──────────────────────────────────────────────────────────

class MeshRequest(BaseModel):
    domain: str
    geometry: Dict[str, Any]
    mesh_size: str = "medium"  # "coarse" | "medium" | "fine"

class MeshResponse(BaseModel):
    mesh_id: str
    status: str
    nodes: int
    elements: int
    mesh_file: str

# ─── API ENDPOINTS ────────────────────────────────────────────────────────

@router.post("/mesh", response_model=MeshResponse)
async def generate_mesh(request: MeshRequest):
    """Generate mesh using Gmsh"""
    try:
        from mesh.gmsh_mesh import generate_beam_mesh, generate_pipe_mesh, generate_airfoil_mesh
        
        mesh_id = f"mesh_{hash(str(request.geometry))}"
        
        if request.domain == "Structural":
            # Extract beam parameters
            length = request.geometry.get("length", 2000)
            width = request.geometry.get("width", 120)
            height = request.geometry.get("height", 200)
            wall_thickness = request.geometry.get("wall_thickness", 6)
            ribs = request.geometry.get("ribs", 0)
            
            mesh_path = generate_beam_mesh(length, width, height, wall_thickness, ribs, request.mesh_size)
            
        elif request.domain == "Fluids":
            # Extract pipe parameters
            diameter = request.geometry.get("diameter", 50)
            length = request.geometry.get("length", 1000)
            
            mesh_path = generate_pipe_mesh(diameter, length, mesh_id, request.mesh_size)
            
        elif request.domain == "Aerospace":
            # Extract airfoil parameters
            chord = request.geometry.get("chord", 200)
            span = request.geometry.get("span", 1000)
            
            mesh_path = generate_airfoil_mesh(chord, span, mesh_id)
            
        else:
            raise HTTPException(status_code=400, detail=f"Mesh generation not supported for domain: {request.domain}")
        
        # TODO: Parse mesh file to get node/element count
        nodes = 0
        elements = 0
        
        return MeshResponse(
            mesh_id=mesh_id,
            status="completed",
            nodes=nodes,
            elements=elements,
            mesh_file=mesh_path
        )
        
    except ImportError:
        raise HTTPException(status_code=503, detail="Mesh generation module not available")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mesh generation failed: {str(e)}")
