"""
Material Database Helper
Load and query material properties
"""

import json
from pathlib import Path

MATERIALS_PATH = Path(__file__).parent / "materials.json"

def get_material_properties(material_id: str) -> dict:
    """Get material properties by ID"""
    try:
        with open(MATERIALS_PATH, 'r') as f:
            materials = json.load(f)
        
        if material_id in materials:
            return materials[material_id]
        else:
            # Try to find by name
            for mat_id, mat_data in materials.items():
                if material_id.lower() in mat_data["name"].lower():
                    return mat_data
            
            # Return default steel properties if not found
            return {
                "youngs_modulus": 200,
                "poissons_ratio": 0.29,
                "density": 7850,
                "yield_strength": 250,
                "ultimate_strength": 420,
                "thermal_conductivity": 51.9,
                "thermal_expansion": 11.5e-6,
                "specific_heat": 486
            }
    except FileNotFoundError:
        # Return default properties if file not found
        return {
            "youngs_modulus": 200,
            "poissons_ratio": 0.29,
            "density": 7850,
            "yield_strength": 250,
            "ultimate_strength": 420,
            "thermal_conductivity": 51.9,
            "thermal_expansion": 11.5e-6,
            "specific_heat": 486
        }
