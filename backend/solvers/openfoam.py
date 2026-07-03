"""
OpenFOAM Solver
CFD solver running in Docker container
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import Dict, Any
import subprocess
import shutil
from pathlib import Path
import time

def run_openfoam_docker(task_id: str, input_file: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run OpenFOAM solver in Docker container
    
    Args:
        task_id: Task UUID
        input_file: {filename, content} - OpenFOAM case dictionary (JSON)
        options: Additional options
    """
    
    # Extract case content from input_file (OpenFOAM case is a dictionary structure)
    case_data = input_file.get("content", "")
    
    # Create working directory (use project directory for better Docker volume support on macOS)
    base_dir = Path(__file__).parent.parent.parent / "simforge_runs"
    base_dir.mkdir(parents=True, exist_ok=True)
    work_dir = base_dir / task_id
    work_dir.mkdir(parents=True, exist_ok=True)
    
    # Step 1: Build OpenFOAM case directory
    case_dir = work_dir / "case"
    case_dir.mkdir(exist_ok=True)
    
    # Create OpenFOAM directory structure
    (case_dir / "0").mkdir(exist_ok=True)
    (case_dir / "constant").mkdir(exist_ok=True)
    (case_dir / "system").mkdir(exist_ok=True)
    
    # Step 2: Write input file content to case directory
    # The input_file content is already provided by the caller (AI-generated)
    # For OpenFOAM, input_file["content"] should be a dict of file paths to content
    case_content = input_file.get("content", "")
    if isinstance(case_content, dict):
        for file_path, file_content in case_content.items():
            full_path = case_dir / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, 'w') as f:
                f.write(file_content)
    else:
        # Fallback: write as a single file
        (case_dir / "case.json").write_text(case_content)
    
    # Step 3: Run Docker container
    print(f"[OpenFOAM] Running solver for task {task_id}")
    
    try:
        # Check if Docker is available
        docker_available = shutil.which("docker") is not None
        
        if docker_available:
            # Run in Docker
            cmd = [
                "docker", "run", "--rm",
                "-v", f"{case_dir}:/case",
                "-w", "/case",
                "--cpus", "2",
                "--memory", "4g",
                "simforge-openfoam:latest",
                "bash", "-c", "blockMesh && simpleFoam"
            ]
            
            start_time = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            elapsed = time.time() - start_time
            
            if result.returncode != 0:
                print(f"[OpenFOAM] Solver failed: {result.stderr}")
                raise Exception(f"OpenFOAM solver failed: {result.stderr}")
                
        else:
            # Fallback: return synthetic result
            print("[OpenFOAM] No solver available, returning synthetic result")
            return generate_synthetic_result(task_id, input_file, options)
    
    except subprocess.TimeoutExpired:
        raise Exception("OpenFOAM solver timed out after 1800 seconds")
    
    # Step 4: Parse output
    post_dir = case_dir / "postProcessing"
    
    if post_dir.exists():
        from parsers.foam_parser import parse_foam
        parsed = parse_foam(str(case_dir))
    else:
        # Fallback to synthetic result
        return generate_synthetic_result(task_id, input_file, options)
    
    # Step 5: Format result
    system_type = input_file.get("metadata", {}).get("system_type", "Pipe Flow")
    return {
        "domain": "Fluids",
        "system_type": system_type,
        "solver_name": "OpenFOAM",
        "solver_version": "2312",
        "metrics": parsed.get("metrics", []),
        "contour_field": parsed.get("contour_field", {}),
        "visualization_type": "contour_field",
        "plain_summary": f"CFD analysis complete. Pressure drop: {parsed.get('metrics', [{}])[0].get('value', 0):.1f} Pa",
        "raw_files": {
            "case": str(case_dir) if case_dir.exists() else None
        }
    }

def generate_openfoam_case(case_dir: Path, diameter: float, length: float, 
                          velocity_inlet: float, viscosity: float, density: float):
    """Generate OpenFOAM case files"""
    
    # 0/ directory - initial and boundary conditions
    u_content = f"""dimensions      [0 1 -1 0 0 0 0];

internalField   uniform ({velocity_inlet} 0 0);

boundaryField
{{
    inlet
    {{
        type            fixedValue;
        value           uniform ({velocity_inlet} 0 0);
    }}
    outlet
    {{
        type            zeroGradient;
    }}
    wall
    {{
        type            noSlip;
    }}
}}
"""
    
    p_content = """dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0;

boundaryField
{
    inlet
    {
        type            zeroGradient;
    }
    outlet
    {
        type            fixedValue;
        value           uniform 0;
    }
    wall
    {
        type            zeroGradient;
    }
}
"""
    
    k_content = f"""dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0.1;

boundaryField
{{
    inlet
    {{
        type            fixedValue;
        value           uniform 0.1;
    }}
    outlet
    {{
        type            zeroGradient;
    }}
    wall
    {{
        type            kqRWallFunction;
        value           uniform 0;
    }}
}}
"""
    
    epsilon_content = f"""dimensions      [0 2 -3 0 0 0 0];

internalField   uniform 0.1;

boundaryField
{{
    inlet
    {{
        type            fixedValue;
        value           uniform 0.1;
    }}
    outlet
    {{
        type            zeroGradient;
    }}
    wall
    {{
        type            epsilonWallFunction;
        value           uniform 0;
    }}
}}
"""
    
    (case_dir / "0" / "U").write_text(u_content)
    (case_dir / "0" / "p").write_text(p_content)
    (case_dir / "0" / "k").write_text(k_content)
    (case_dir / "0" / "epsilon").write_text(epsilon_content)
    
    # constant/ directory
    transport_content = f"""transportModel  Newtonian;

nu              {viscosity/density};
"""
    
    turbulence_content = """simulationType  RAS;
RASModel        kEpsilon;
"""
    
    (case_dir / "constant" / "transportProperties").write_text(transport_content)
    (case_dir / "constant" / "turbulenceProperties").write_text(turbulence_content)
    
    # system/ directory
    control_content = f"""application     simpleFoam;

startFrom       latestTime;

startTime       0;
stopAt          endTime;
endTime         500;

deltaT          0.1;

writeControl    timeStep;
writeInterval   50;

purgeWrite      0;

writeFormat     ascii;
writePrecision  6;

runTimeModifiable yes;
"""
    
    fv_schemes_content = """ddtSchemes
{
    default steadyState;
}

gradSchemes
{
    default Gauss linear;
}

divSchemes
{
    default none;
    div(phi,U) Gauss linearUpwind grad(U);
}

laplacianSchemes
{
    default Gauss linear corrected;
}

interpolationSchemes
{
    default linear;
}

snGradSchemes
{
    default corrected;
}
"""
    
    fv_solution_content = """solvers
{
    p
    {
        solver          GAMG;
        tolerance       1e-06;
        relTol          0.1;
        smoother        GaussSeidel;
    }

    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0.1;
    }

    k
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0.1;
    }

    epsilon
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0.1;
    }
}

SIMPLE
{
    nNonOrthogonalCorrectors 0;
    consistent      yes;
}

relaxationFactors
{
    fields
    {
        p               0.3;
        U               0.7;
        k               0.7;
        epsilon         0.7;
    }
}
"""
    
    block_mesh_content = f"""convertToMeters 0.001;

vertices
(
    (0 0 0)
    ({length} 0 0)
    ({length} {diameter} 0)
    (0 {diameter} 0)
    (0 0 1)
    ({length} 0 1)
    ({length} {diameter} 1)
    (0 {diameter} 1)
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (100 20 1) simpleGrading (1 1 1)
);

boundary
(
    inlet
    {{
        type patch;
        faces ( (0 4 7 3) );
    }}
    outlet
    {{
        type patch;
        faces ( (1 5 6 2) );
    }}
    wall
    {{
        type wall;
        faces ( (0 1 5 4) (3 7 6 2) (0 3 2 1) (4 5 6 7) );
    }}
);
"""
    
    (case_dir / "system" / "controlDict").write_text(control_content)
    (case_dir / "system" / "fvSchemes").write_text(fv_schemes_content)
    (case_dir / "system" / "fvSolution").write_text(fv_solution_content)
    (case_dir / "system" / "blockMeshDict").write_text(block_mesh_content)

def generate_synthetic_result(task_id: str, input_file: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    """Generate synthetic CFD result (fallback when solver unavailable)
    
    Note: Uses placeholder defaults since model parameters are not available in this fallback path.
    """
    # Placeholder defaults for synthetic result
    diameter = 50.0  # mm, default fallback
    length = 1000.0  # mm, default fallback
    velocity_inlet = 1.0  # m/s, default fallback
    viscosity = 1e-3  # Pa·s, water default
    density = 1000.0  # kg/m³, water default
    
    # Darcy-Weisbach equation for pressure drop
    re = (density * velocity_inlet * (diameter/1000)) / viscosity
    f = 0.316 / (re ** 0.25) if re > 4000 else 64 / re  # Blasius or laminar
    pressure_drop = f * (length/1000) / (diameter/1000) * 0.5 * density * velocity_inlet**2
    
    # Generate synthetic contour field
    n_points = 100
    x = [i * length / (n_points - 1) for i in range(n_points)]
    y = [0] * n_points
    z = [0] * n_points
    velocity = [velocity_inlet] * n_points
    pressure = [pressure_drop * (1 - xi / length) for xi in x]
    
    return {
        "domain": "Fluids",
        "system_type": "Pipe Flow",
        "solver_name": "OpenFOAM",
        "solver_version": "2312",
        "metrics": [
            {"name": "Pressure Drop", "value": f"{pressure_drop:.1f}", "unit": "Pa"},
            {"name": "Reynolds Number", "value": f"{re:.0f}", "unit": ""},
            {"name": "Note", "value": "Synthetic result - solver unavailable", "unit": ""}
        ],
        "contour_field": {
            "x": x,
            "y": y,
            "z": z,
            "velocity": velocity,
            "pressure": pressure
        },
        "visualization_type": "contour_field",
        "plain_summary": f"Synthetic CFD result (solver unavailable). Pressure drop: {pressure_drop:.1f} Pa"
    }
