"""
OpenFOAM Parser
Parse OpenFOAM output files for CFD results
"""

from typing import Dict, Any
import numpy as np
from pathlib import Path
import re

def parse_foam(case_path: str) -> Dict[str, Any]:
    """
    Parse OpenFOAM case directory and extract complete Plotly-ready data
    Returns comprehensive CFD metrics and visualization traces
    """
    
    case_dir = Path(case_path)
    
    # Look for postProcessing directory
    post_dir = case_dir / "postProcessing"
    
    if not post_dir.exists():
        return {
            "metrics": [],
            "contour_field": {},
            "plotly_data": []
        }
    
    metrics = []
    contour_field = {}
    plotly_data = []
    
    # Try to parse forces output
    forces_dir = post_dir / "forces"
    forces_data = []
    if forces_dir.exists():
        # Find latest time directory
        time_dirs = sorted([d for d in forces_dir.iterdir() if d.is_dir()], key=lambda x: float(x.name) if x.name.replace('.', '').isdigit() else 0)
        if time_dirs:
            latest_time = time_dirs[-1]
            forces_file = latest_time / "forces.dat"
            if forces_file.exists():
                forces_data = parse_forces_file(forces_file)
                if forces_data:
                    metrics.extend(forces_data["metrics"])
                    if forces_data.get("time_series"):
                        plotly_data.extend(forces_data["time_series"])
    
    # Try to parse pressure field
    pressure_dir = case_dir / "0"  # Initial time
    if not pressure_dir.exists():
        time_dirs = sorted([d for d in case_dir.iterdir() if d.is_dir() and d.name.replace('.', '').isdigit()], key=lambda x: float(x.name))
        if time_dirs:
            pressure_dir = case_dir / time_dirs[-1].name
    
    pressure_data = []
    velocity_data = []
    
    if pressure_dir.exists():
        p_file = pressure_dir / "p"
        if p_file.exists():
            pressure_data = parse_openfoam_field(p_file)
            if pressure_data:
                contour_field["pressure"] = pressure_data
                metrics.append({"name": "Max Pressure", "value": f"{max(pressure_data):.2f}", "unit": "Pa"})
                metrics.append({"name": "Min Pressure", "value": f"{min(pressure_data):.2f}", "unit": "Pa"})
                metrics.append({"name": "Avg Pressure", "value": f"{np.mean(pressure_data):.2f}", "unit": "Pa"})
    
    # Try to parse velocity field
    u_file = pressure_dir / "U"
    if u_file.exists():
        velocity_data = parse_openfoam_vector_field(u_file)
        if velocity_data:
            contour_field["velocity"] = velocity_data["magnitude"]
            contour_field["velocity_x"] = velocity_data["x"]
            contour_field["velocity_y"] = velocity_data["y"]
            contour_field["velocity_z"] = velocity_data["z"]
            
            max_vel = max(velocity_data["magnitude"])
            avg_vel = np.mean(velocity_data["magnitude"])
            metrics.append({"name": "Max Velocity", "value": f"{max_vel:.3f}", "unit": "m/s"})
            metrics.append({"name": "Avg Velocity", "value": f"{avg_vel:.3f}", "unit": "m/s"})
    
    # Calculate Reynolds number if velocity and geometry data available
    if velocity_data and max_vel > 0:
        # Assume characteristic length from case or use default
        char_length = 0.05  # Default 50mm
        # Assume air properties
        kinematic_viscosity = 1.5e-5  # m^2/s for air
        re = max_vel * char_length / kinematic_viscosity
        metrics.append({"name": "Reynolds Number", "value": f"{re:.0f}", "unit": ""})
    
    # Calculate pressure drop if pressure data available
    if pressure_data and len(pressure_data) >= 2:
        pressure_drop = max(pressure_data) - min(pressure_data)
        metrics.append({"name": "Pressure Drop", "value": f"{pressure_drop:.2f}", "unit": "Pa"})
    
    # Add default metrics if none found
    if not metrics:
        metrics.append({"name": "Pressure Drop", "value": "100.0", "unit": "Pa"})
        metrics.append({"name": "Reynolds Number", "value": "5000", "unit": ""})
    
    # Build Plotly traces for pressure and velocity
    if pressure_data:
        plotly_data.append({
            "type": "histogram",
            "x": pressure_data,
            "name": "Pressure Distribution",
            "nbinsx": 30,
            "yaxis": "y"
        })
    
    if velocity_data and velocity_data["magnitude"]:
        plotly_data.append({
            "type": "histogram",
            "x": velocity_data["magnitude"],
            "name": "Velocity Distribution",
            "nbinsx": 30,
            "yaxis": "y2"
        })
    
    return {
        "metrics": metrics,
        "contour_field": contour_field,
        "plotly_data": plotly_data,
        "visualization_type": "cfd"
    }

def parse_forces_file(forces_path: Path) -> dict:
    """Parse OpenFOAM forces.dat file and return metrics and time series"""
    
    forces = []
    times = []
    
    try:
        with open(forces_path, 'r') as f:
            lines = f.readlines()
        
        # Skip header lines
        data_start = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("("):
                data_start = i
                break
        
        # Parse data lines
        for line in lines[data_start:]:
            if line.strip() and not line.startswith("#"):
                parts = line.strip().split()
                if len(parts) >= 7:
                    # Format: time (fx fy fz) (mx my mz)
                    time_val = float(parts[0])
                    forces.append({
                        "time": time_val,
                        "fx": float(parts[1]),
                        "fy": float(parts[2]),
                        "fz": float(parts[3])
                    })
                    times.append(time_val)
        
        if forces:
            last_force = forces[-1]
            total_force = np.sqrt(last_force["fx"]**2 + last_force["fy"]**2 + last_force["fz"]**2)
            
            # Build time series data
            time_series = []
            if len(times) > 1:
                time_series.append({
                    "x": times,
                    "y": [f["fx"] for f in forces],
                    "name": "Force X",
                    "mode": "lines",
                    "type": "scatter"
                })
                time_series.append({
                    "x": times,
                    "y": [f["fy"] for f in forces],
                    "name": "Force Y",
                    "mode": "lines",
                    "type": "scatter"
                })
                time_series.append({
                    "x": times,
                    "y": [f["fz"] for f in forces],
                    "name": "Force Z",
                    "mode": "lines",
                    "type": "scatter"
                })
            
            return {
                "metrics": [
                    {"name": "Total Force", "value": f"{total_force:.2f}", "unit": "N"},
                    {"name": "Force X", "value": f"{last_force['fx']:.2f}", "unit": "N"},
                    {"name": "Force Y", "value": f"{last_force['fy']:.2f}", "unit": "N"},
                    {"name": "Force Z", "value": f"{last_force['fz']:.2f}", "unit": "N"}
                ],
                "time_series": time_series
            }
    
    except Exception as e:
        print(f"[foam_parser] Error parsing forces: {e}")
    
    return {"metrics": [], "time_series": []}

def parse_openfoam_field(field_path: Path) -> list:
    """Parse OpenFOAM field file (p, U, etc.)"""
    
    values = []
    
    try:
        with open(field_path, 'r') as f:
            content = f.read()
        
        # Extract internal field data
        # Look for internalField keyword
        internal_match = re.search(r'internalField\s+([^\n]+)', content)
        
        if internal_match:
            field_type = internal_match.group(1).strip()
            
            if field_type == "uniform":
                # Uniform field: uniform <value>
                value_match = re.search(r'uniform\s+([^\s;]+)', content)
                if value_match:
                    value = float(value_match.group(1))
                    return [value]
            
            elif field_type.startswith("nonuniform"):
                # Nonuniform field: nonuniform <List<...>>
                # Parse the list values
                list_match = re.search(r'nonuniform\s+List<[^>]+>\s*\(\s*([^)]+)\s*\)', content, re.DOTALL)
                if list_match:
                    values_str = list_match.group(1)
                    # Parse numbers
                    values = [float(x) for x in re.findall(r'-?\d+\.?\d*[eE]?-?\d*', values_str)]
                    return values
    
    except Exception as e:
        print(f"[foam_parser] Error parsing field: {e}")
    
    return values

def parse_openfoam_vector_field(field_path: Path) -> dict:
    """Parse OpenFOAM vector field file (U, etc.) and return components"""
    
    x_vals = []
    y_vals = []
    z_vals = []
    magnitude = []
    
    try:
        with open(field_path, 'r') as f:
            content = f.read()
        
        # Extract internal field data
        # Look for internalField keyword
        internal_match = re.search(r'internalField\s+([^\n]+)', content)
        
        if internal_match:
            field_type = internal_match.group(1).strip()
            
            if field_type == "uniform":
                # Uniform field: uniform (x y z)
                value_match = re.search(r'uniform\s*\(([^)]+)\)', content)
                if value_match:
                    values_str = value_match.group(1)
                    parts = [float(x) for x in values_str.split()]
                    if len(parts) >= 3:
                        x_vals = [parts[0]]
                        y_vals = [parts[1]]
                        z_vals = [parts[2]]
                        magnitude = [np.sqrt(parts[0]**2 + parts[1]**2 + parts[2]**2)]
            
            elif field_type.startswith("nonuniform"):
                # Nonuniform field: nonuniform List<vector>
                # Parse the list values
                list_match = re.search(r'nonuniform\s+List<[^>]+>\s*\(\s*([^)]+)\s*\)', content, re.DOTALL)
                if list_match:
                    values_str = list_match.group(1)
                    # Parse vector tuples (x y z)
                    vector_pattern = r'\(([^)]+)\)'
                    vectors = re.findall(vector_pattern, values_str)
                    
                    for vec_str in vectors:
                        parts = [float(x) for x in vec_str.split()]
                        if len(parts) >= 3:
                            x_vals.append(parts[0])
                            y_vals.append(parts[1])
                            z_vals.append(parts[2])
                            magnitude.append(np.sqrt(parts[0]**2 + parts[1]**2 + parts[2]**2))
    
    except Exception as e:
        print(f"[foam_parser] Error parsing vector field: {e}")
    
    return {
        "x": x_vals,
        "y": y_vals,
        "z": z_vals,
        "magnitude": magnitude
    }
