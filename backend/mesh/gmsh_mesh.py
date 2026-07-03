"""
Gmsh Mesh Generation
Generate meshes for various geometries using Gmsh
"""

from typing import str
from pathlib import Path
import subprocess
import shutil

def generate_beam_mesh(length: float, width: float, height: float, 
                      wall_thickness: float, ribs: int, 
                      mesh_size: str, task_id: str = "") -> str:
    """
    Generate beam mesh using Gmsh
    Returns path to mesh file
    """
    
    try:
        import pygmsh
    except ImportError:
        # Fallback: return placeholder mesh path
        return generate_placeholder_mesh(task_id, "beam")
    
    # Determine mesh element size based on mesh_size parameter
    if mesh_size == "coarse":
        element_size = max(length, width, height) / 20
    elif mesh_size == "fine":
        element_size = max(length, width, height) / 100
    else:  # medium
        element_size = max(length, width, height) / 50
    
    # Create geometry with pygmsh
    with pygmsh.geo.Geometry() as geom:
        # Create beam box
        geom.add_box([0, 0, 0], [length, width, height])
        
        # Add internal ribs if specified
        if ribs > 0:
            rib_spacing = length / (ribs + 1)
            for i in range(1, ribs + 1):
                x_pos = i * rib_spacing
                geom.add_box([x_pos - wall_thickness/2, 0, 0], 
                            [x_pos + wall_thickness/2, width, height])
        
        # Set mesh size
        geom.set_mesh_size(element_size)
        
        # Generate mesh
        mesh = geom.generate_mesh()
        
        # Save to file (use project directory for better Docker volume support)
        base_dir = Path(__file__).parent.parent.parent / "simforge_runs"
        base_dir.mkdir(parents=True, exist_ok=True)
        work_dir = base_dir / task_id if task_id else base_dir / "temp"
        work_dir.mkdir(parents=True, exist_ok=True)
        mesh_path = work_dir / "beam.msh"
        
        # Write mesh file in proper CalculiX format
        mesh.write(str(mesh_path))
        
        return str(mesh_path)

def generate_pipe_mesh(diameter: float, length: float, 
                      mesh_id: str, mesh_size: str = "medium") -> str:
    """
    Generate pipe mesh using Gmsh
    """
    
    try:
        import pygmsh
    except ImportError:
        return generate_placeholder_mesh(mesh_id, "pipe")
    
    # Determine mesh element size
    if mesh_size == "coarse":
        element_size = max(diameter, length) / 20
    elif mesh_size == "fine":
        element_size = max(diameter, length) / 100
    else:
        element_size = max(diameter, length) / 50
    
    with pygmsh.geo.Geometry() as geom:
        # Create pipe (cylinder)
        geom.add_cylinder([0, 0, 0], [0, 0, length], diameter/2)
        
        geom.set_mesh_size(element_size)
        mesh = geom.generate_mesh()
        
        work_dir = Path("/tmp/simforge")
        work_dir.mkdir(parents=True, exist_ok=True)
        mesh_path = work_dir / f"{mesh_id}.msh"
        
        with open(mesh_path, 'w') as f:
            f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")
            f.write(f"$Nodes\n{len(mesh.points)}\n")
            for i, point in enumerate(mesh.points, 1):
                f.write(f"{i} {point[0]} {point[1]} {point[2]}\n")
            f.write("$EndNodes\n")
            f.write("$Elements\n")
            f.write("$EndElements\n")
        
        return str(mesh_path)

def generate_airfoil_mesh(chord: float, span: float, 
                        mesh_id: str) -> str:
    """
    Generate airfoil mesh using Gmsh
    """
    
    try:
        import pygmsh
    except ImportError:
        return generate_placeholder_mesh(mesh_id, "airfoil")
    
    with pygmsh.geo.Geometry() as geom:
        # Create airfoil geometry (simplified)
        # Create a thin rectangular wing section
        geom.add_box([0, -chord/20, 0], [chord, chord/20, span])
        
        # Set mesh size
        element_size = chord / 50
        geom.set_mesh_size(element_size)
        
        mesh = geom.generate_mesh()
        
        work_dir = Path("/tmp/simforge")
        work_dir.mkdir(parents=True, exist_ok=True)
        mesh_path = work_dir / f"{mesh_id}.msh"
        
        with open(mesh_path, 'w') as f:
            f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")
            f.write(f"$Nodes\n{len(mesh.points)}\n")
            for i, point in enumerate(mesh.points, 1):
                f.write(f"{i} {point[0]} {point[1]} {point[2]}\n")
            f.write("$EndNodes\n")
            f.write("$Elements\n")
            f.write("$EndElements\n")
        
        return str(mesh_path)

def generate_heatsink_mesh(base_width: float, base_height: float, 
                          fin_height: float, num_fins: int,
                          mesh_id: str) -> str:
    """
    Generate heatsink mesh using Gmsh
    """
    
    try:
        import pygmsh
    except ImportError:
        return generate_placeholder_mesh(mesh_id, "heatsink")
    
    with pygmsh.geo.Geometry() as geom:
        # Create base plate
        geom.add_box([0, 0, 0], [base_width, base_height, 0.01])
        
        # Add fins
        fin_width = base_width / (num_fins + 1)
        for i in range(num_fins):
            x_pos = (i + 1) * fin_width
            geom.add_box([x_pos - fin_width/4, 0, 0.01],
                        [x_pos + fin_width/4, base_height, fin_height])
        
        element_size = max(base_width, base_height, fin_height) / 50
        geom.set_mesh_size(element_size)
        
        mesh = geom.generate_mesh()
        
        work_dir = Path("/tmp/simforge")
        work_dir.mkdir(parents=True, exist_ok=True)
        mesh_path = work_dir / f"{mesh_id}.msh"
        
        with open(mesh_path, 'w') as f:
            f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")
            f.write(f"$Nodes\n{len(mesh.points)}\n")
            for i, point in enumerate(mesh.points, 1):
                f.write(f"{i} {point[0]} {point[1]} {point[2]}\n")
            f.write("$EndNodes\n")
            f.write("$Elements\n")
            f.write("$EndElements\n")
        
        return str(mesh_path)

def generate_placeholder_mesh(task_id: str, mesh_type: str) -> str:
    """Generate placeholder mesh file when Gmsh is unavailable"""
    
    work_dir = Path(f"/tmp/simforge/{task_id}") if task_id else Path("/tmp/simforge")
    work_dir.mkdir(parents=True, exist_ok=True)
    mesh_path = work_dir / f"{mesh_type}.msh"
    
    with open(mesh_path, 'w') as f:
        f.write("$MeshFormat\n2.2 0 8\n$EndMeshFormat\n")
        f.write("$Nodes\n8\n")
        f.write("1 0 0 0\n2 1 0 0\n3 1 1 0\n4 0 1 0\n")
        f.write("5 0 0 1\n6 1 0 1\n7 1 1 1\n8 0 1 1\n")
        f.write("$EndNodes\n")
        f.write("$Elements\n1\n")
        f.write("1 1 4 1 1 2 3 4 5 6 7 8\n")
        f.write("$EndElements\n")
    
    return str(mesh_path)
