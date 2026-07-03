"""
Fluid Database Helper
Load and query fluid properties
"""

import json
from pathlib import Path

FLUIDS_PATH = Path(__file__).parent / "fluids.json"

def get_fluid_properties(fluid_id: str) -> dict:
    """Get fluid properties by ID"""
    try:
        with open(FLUIDS_PATH, 'r') as f:
            fluids = json.load(f)
        
        if fluid_id in fluids:
            return fluids[fluid_id]
        else:
            # Try to find by name
            for fluid_id, fluid_data in fluids.items():
                if fluid_id.lower() in fluid_data["name"].lower():
                    return fluid_data
            
            # Return default water properties if not found
            return {
                "density": 1000,
                "viscosity": 0.001,
                "thermal_conductivity": 0.6,
                "specific_heat": 4184,
                "prandtl": 6.99,
                "thermal_expansion": 207e-6
            }
    except FileNotFoundError:
        # Return default properties if file not found
        return {
            "density": 1000,
            "viscosity": 0.001,
            "thermal_conductivity": 0.6,
            "specific_heat": 4184,
            "prandtl": 6.99,
            "thermal_expansion": 207e-6
        }
