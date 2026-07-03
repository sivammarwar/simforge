"""
Material Database API Routes
GET /api/material/search - Search materials
GET /api/material/{material_id} - Get material details
GET /api/material/categories - List categories
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
from pathlib import Path

router = APIRouter()

# Load materials database
MATERIALS_PATH = Path(__file__).parent.parent / "data" / "materials.json"

def load_materials():
    """Load materials from JSON file"""
    if not MATERIALS_PATH.exists():
        return {}
    with open(MATERIALS_PATH, 'r') as f:
        return json.load(f)

MATERIALS_DB = load_materials()

# ─── DATA MODELS ──────────────────────────────────────────────────────────

class Material(BaseModel):
    name: str
    category: str
    properties: Dict[str, Any]

class MaterialSearchResult(BaseModel):
    materials: List[Material]
    total: int

# ─── API ENDPOINTS ────────────────────────────────────────────────────────

@router.get("/material/search")
async def search_materials(q: str, limit: int = 5):
    """Full-text search across material name + category"""
    if not MATERIALS_DB:
        raise HTTPException(status_code=503, detail="Material database not loaded")
    
    query_lower = q.lower()
    results = []
    
    for mat_id, mat_data in MATERIALS_DB.items():
        name = mat_data.get("name", "")
        category = mat_data.get("category", "")
        
        # Search in name and category
        if query_lower in name.lower() or query_lower in category.lower():
            results.append({
                "id": mat_id,
                **mat_data
            })
    
    # Sort by relevance (exact match first)
    results.sort(key=lambda x: (
        query_lower not in x["name"].lower(),
        x["name"].lower()
    ))
    
    return MaterialSearchResult(
        materials=results[:limit],
        total=len(results)
    )

@router.get("/material/{material_id}")
async def get_material(material_id: str):
    """Get full material record"""
    if not MATERIALS_DB:
        raise HTTPException(status_code=503, detail="Material database not loaded")
    
    if material_id not in MATERIALS_DB:
        raise HTTPException(status_code=404, detail=f"Material {material_id} not found")
    
    return {
        "id": material_id,
        **MATERIALS_DB[material_id]
    }

@router.get("/material/categories")
async def list_categories():
    """Return list of categories"""
    if not MATERIALS_DB:
        raise HTTPException(status_code=503, detail="Material database not loaded")
    
    categories = set()
    for mat_data in MATERIALS_DB.values():
        category = mat_data.get("category", "Unknown")
        categories.add(category)
    
    return {"categories": sorted(list(categories))}
