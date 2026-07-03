"""
Analytical Solver
Fallback solver for simple problems using analytical formulas
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import Dict, Any
import math

def run_analytical_solver(domain: str, input_file: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run analytical solver for simple problems
    This is a fallback when real solvers are not available
    
    Args:
        domain: Engineering domain
        input_file: {filename, content} - may contain model data for analytical fallback
    """
    
    # For analytical solver, we still need to extract model-like data
    # This is a temporary compatibility layer
    model = input_file if isinstance(input_file, dict) and "content" not in input_file else {}
    
    if domain == "Physics":
        return solve_physics_analytical(model)
    elif domain == "Materials":
        return solve_materials_analytical(model)
    else:
        # Generic fallback
        return {
            "domain": domain,
            "system_type": model.get("SYSTEM_TYPE", "Unknown"),
            "solver_name": "analytical",
            "solver_version": "1.0",
            "metrics": [
                {"name": "Solver", "value": "Analytical approximation", "unit": ""},
                {"name": "Note", "value": "Real solver not available", "unit": ""}
            ],
            "visualization_type": "none",
            "plain_summary": "Analytical approximation used. Real solver not available for this problem."
        }

def solve_physics_analytical(model: Dict[str, Any]) -> Dict[str, Any]:
    """Simple physics problems using analytical formulas"""
    
    system_type = model.get("SYSTEM_TYPE", "").lower()
    
    if "projectile" in system_type:
        # Projectile motion
        v0 = model.get("INITIAL_VELOCITY", {}).get("value", 10)
        angle_deg = model.get("LAUNCH_ANGLE", {}).get("value", 45)
        angle_rad = math.radians(angle_deg)
        g = 9.81
        
        # Calculate trajectory
        t_flight = 2 * v0 * math.sin(angle_rad) / g
        max_height = (v0 * math.sin(angle_rad))**2 / (2 * g)
        range_distance = v0**2 * math.sin(2 * angle_rad) / g
        
        # Generate time series
        t = []
        x = []
        y = []
        for i in range(100):
            ti = i * t_flight / 99
            xi = v0 * math.cos(angle_rad) * ti
            yi = v0 * math.sin(angle_rad) * ti - 0.5 * g * ti**2
            t.append(ti)
            x.append(xi)
            y.append(max(0, yi))
        
        return {
            "domain": "Physics",
            "system_type": model.get("SYSTEM_TYPE"),
            "solver_name": "analytical",
            "solver_version": "1.0",
            "metrics": [
                {"name": "Flight Time", "value": f"{t_flight:.2f}", "unit": "s"},
                {"name": "Max Height", "value": f"{max_height:.2f}", "unit": "m"},
                {"name": "Range", "value": f"{range_distance:.2f}", "unit": "m"}
            ],
            "time_series": {
                "t": t,
                "x": x,
                "y": y
            },
            "visualization_type": "time_series",
            "plain_summary": f"Projectile motion: {t_flight:.2f}s flight time, {max_height:.2f}m max height, {range_distance:.2f}m range."
        }
    
    else:
        return {
            "domain": "Physics",
            "system_type": model.get("SYSTEM_TYPE"),
            "solver_name": "analytical",
            "metrics": [{"name": "Note", "value": "Analytical physics not implemented for this type", "unit": ""}],
            "visualization_type": "none",
            "plain_summary": "Analytical physics solver not implemented for this problem type."
        }

def solve_materials_analytical(model: Dict[str, Any]) -> Dict[str, Any]:
    """Simple materials calculations"""
    
    # Extract material properties
    material = model.get("MATERIAL", {}).get("value", "Steel")
    stress = model.get("APPLIED_STRESS", {}).get("value", 100)
    
    # Simple safety factor calculation
    yield_strength = 250  # MPa default for steel
    safety_factor = yield_strength / stress
    
    return {
        "domain": "Materials",
        "system_type": model.get("SYSTEM_TYPE"),
        "solver_name": "analytical",
        "solver_version": "1.0",
        "metrics": [
            {"name": "Material", "value": material, "unit": ""},
            {"name": "Applied Stress", "value": f"{stress}", "unit": "MPa"},
            {"name": "Yield Strength", "value": f"{yield_strength}", "unit": "MPa"},
            {"name": "Safety Factor", "value": f"{safety_factor:.2f}", "unit": ""}
        ],
        "visualization_type": "none",
        "plain_summary": f"Material: {material}, Applied stress: {stress} MPa, Safety factor: {safety_factor:.2f}"
    }
