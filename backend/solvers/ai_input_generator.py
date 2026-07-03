"""
AI Input Generator - Pure AI-Powered Model to Tool Input Conversion
Replaces ALL hardcoded template generators with pure AI generation
"""

import json
import os
import requests
from typing import Dict, Any

# Backend API URL for AI chat
BACKEND_API_URL = os.environ.get('BACKEND_API_URL', 'http://localhost:8787')

def generate_input_file_with_ai(solver_name: str, model: Dict[str, Any], provider: str = 'groq') -> Dict[str, Any]:
    """
    Generate tool input file using AI
    
    Args:
        solver_name: Solver name (ngspice, calculix, xfoil, openfoam, elmer)
        model: Structured model from AI extraction
        provider: AI provider (default: 'groq')
    
    Returns:
        Generated input file content and metadata
    """
    generators = {
        'ngspice': generate_ngspice_input,
        'calculix': generate_calculix_input,
        'xfoil': generate_xfoil_input,
        'openfoam': generate_openfoam_input,
        'elmer': generate_elmer_input
    }
    
    generator = generators.get(solver_name)
    if not generator:
        raise ValueError(f"Unknown solver: {solver_name}. Available solvers: {list(generators.keys())}")
    
    return generator(model, provider)


def generate_ngspice_input(model: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Generate ngspice netlist using AI"""
    prompt = build_ngspice_prompt(model)
    
    ai_response = call_ai_backend(prompt, 'Circuits', provider)
    
    netlist = extract_code_block(ai_response, 'spice') or extract_code_block(ai_response, 'text') or ai_response
    
    return {
        'solver': 'ngspice',
        'filename': 'circuit.cir',
        'content': netlist,
        'metadata': {
            'system_type': model.get('SYSTEM_TYPE'),
            'generated_by': 'ai'
        }
    }


def generate_calculix_input(model: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Generate CalculiX input file using AI"""
    prompt = build_calculix_prompt(model)
    
    ai_response = call_ai_backend(prompt, 'Structural', provider)
    
    inp_file = extract_code_block(ai_response, 'inp') or extract_code_block(ai_response, 'text') or ai_response
    
    return {
        'solver': 'calculix',
        'filename': 'ccx.inp',
        'content': inp_file,
        'metadata': {
            'system_type': model.get('SYSTEM_TYPE'),
            'generated_by': 'ai'
        }
    }


def generate_xfoil_input(model: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Generate XFOIL script using AI"""
    prompt = build_xfoil_prompt(model)
    
    ai_response = call_ai_backend(prompt, 'Aerospace', provider)
    
    script = extract_code_block(ai_response, 'txt') or extract_code_block(ai_response, 'text') or ai_response
    
    return {
        'solver': 'xfoil',
        'filename': 'xfoil_script.txt',
        'content': script,
        'metadata': {
            'system_type': model.get('SYSTEM_TYPE'),
            'generated_by': 'ai'
        }
    }


def generate_openfoam_input(model: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Generate OpenFOAM case using AI"""
    prompt = build_openfoam_prompt(model)
    
    ai_response = call_ai_backend(prompt, 'Fluids', provider)
    
    # OpenFOAM generates multiple files, return as dictionary
    try:
        block_dict = json.loads(extract_code_block(ai_response, 'json') or ai_response)
    except json.JSONDecodeError:
        block_dict = {'system/controlDict': ai_response}
    
    return {
        'solver': 'openfoam',
        'filename': 'case_files',
        'content': block_dict,
        'metadata': {
            'system_type': model.get('SYSTEM_TYPE'),
            'generated_by': 'ai',
            'multi_file': True
        }
    }


def generate_elmer_input(model: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """Generate Elmer input file using AI"""
    prompt = build_elmer_prompt(model)
    
    ai_response = call_ai_backend(prompt, 'Thermal', provider)
    
    sif_file = extract_code_block(ai_response, 'sif') or extract_code_block(ai_response, 'text') or ai_response
    
    return {
        'solver': 'elmer',
        'filename': 'case.sif',
        'content': sif_file,
        'metadata': {
            'system_type': model.get('SYSTEM_TYPE'),
            'generated_by': 'ai'
        }
    }


def call_ai_backend(prompt: str, domain: str, provider: str) -> str:
    """Call the AI backend via HTTP API"""
    try:
        response = requests.post(
            f"{BACKEND_API_URL}/api/chat",
            json={
                'message': prompt,
                'domain': domain,
                'provider': provider,
                'conversationHistory': []
            },
            timeout=60
        )
        response.raise_for_status()
        
        data = response.json()
        if not data.get('success'):
            raise Exception(f"AI backend error: {data.get('error', 'Unknown error')}")
        
        return data.get('content', '')
        
    except requests.RequestException as e:
        raise Exception(f"Failed to call AI backend: {str(e)}")


def extract_code_block(content: str, language: str = '') -> str:
    """Extract code block from AI response"""
    import re
    
    # Try with language specifier
    pattern = rf'```{language}\s*([\s\S]*?)\s*```'
    match = re.search(pattern, content)
    if match:
        return match.group(1).strip()
    
    # Try without language specifier
    pattern = r'```([\s\S]*?)```'
    match = re.search(pattern, content)
    if match:
        return match.group(1).strip()
    
    return None


def build_ngspice_prompt(model: Dict[str, Any]) -> str:
    """Build ngspice generation prompt"""
    return f"""You are an expert SPICE netlist generator. Generate a syntactically correct ngspice netlist for the following circuit model.

MODEL:
{json.dumps(model, indent=2)}

INSTRUCTIONS:
1. Generate a complete ngspice netlist (.cir file)
2. Include proper component definitions (R, L, C, V sources, etc.)
3. Include analysis commands (.tran, .ac, .op, etc.)
4. Include output commands (.print, .plot)
5. Use proper ngspice syntax and units
6. Ensure the netlist is complete and runnable
7. Return ONLY the netlist in a code block

EXAMPLE ngspice syntax:
* Buck Converter Example
Vin 1 0 DC 12
L1 1 2 22u
C1 2 0 47u
Rload 2 0 10
.tran 1u 500u
.print tran V(2)
.end"""


def build_calculix_prompt(model: Dict[str, Any]) -> str:
    """Build CalculiX generation prompt"""
    return f"""You are an expert CalculiX input file generator. Generate a syntactically correct CalculiX input deck (.inp file) for the following structural model.

MODEL:
{json.dumps(model, indent=2)}

INSTRUCTIONS:
1. Generate a complete CalculiX input file
2. Include proper sections:
   - *HEADING
   - *NODE (node coordinates)
   - *ELEMENT (element connectivity, C3D8R for 3D solid)
   - *MATERIAL (material properties: Young's modulus, Poisson's ratio, density)
   - *SOLID SECTION
   - *BOUNDARY (boundary conditions, DOF 1-3 for solid elements)
   - *CLOAD (applied loads)
   - *STEP (analysis step)
   - *OUTPUT (output requests)
3. Use proper CalculiX syntax and format
4. Ensure the input file is complete and runnable
5. Return ONLY the input file in a code block

EXAMPLE CalculiX syntax:
*HEADING
Cantilever Beam Analysis
*NODE, NSET=Nall
1, 0.0, 0.0, 0.0
2, 1.0, 0.0, 0.0
*ELEMENT, TYPE=C3D8R, ELSET=Eall
1, 1, 2, 3, 4, 5, 6, 7, 8
*MATERIAL, NAME=Steel
*ELASTIC
200000, 0.29
*DENSITY
7850
*SOLID SECTION, MATERIAL=Steel, ELSET=Eall
*BOUNDARY
Nfix, 1, 3
*CLOAD
Nload, 3, -1000
*STEP
*STATIC
*OUTPUT, FIELD
*NODE FILE
*EL FILE
*END STEP"""


def build_xfoil_prompt(model: Dict[str, Any]) -> str:
    """Build XFOIL generation prompt"""
    return f"""You are an expert XFOIL script generator. Generate a syntactically correct XFOIL script for the following aerodynamic model.

MODEL:
{json.dumps(model, indent=2)}

INSTRUCTIONS:
1. Generate a complete XFOIL script
2. Include proper commands:
   - LOAD (airfoil)
   - PANE (paneling)
   - OPER (operating conditions: Reynolds number, Mach number)
   - ASEQ (angle of attack sweep)
   - PACC (polar accumulation)
   - DUMP (output polar data)
3. Use proper XFOIL command syntax
4. Ensure the script is complete and runnable
5. Return ONLY the script in a code block

EXAMPLE XFOIL syntax:
LOAD naca4412.dat
PANE
OPER
VISC 500000
MACH 0.15
ASEQ 0 18 1
PACC
DUMP polar.dat"""


def build_openfoam_prompt(model: Dict[str, Any]) -> str:
    """Build OpenFOAM generation prompt"""
    return f"""You are an expert OpenFOAM case generator. Generate the necessary OpenFOAM configuration files for the following CFD model.

MODEL:
{json.dumps(model, indent=2)}

INSTRUCTIONS:
1. Generate the key OpenFOAM dictionary files:
   - blockMeshDict (mesh generation)
   - controlDict (solver control)
   - transportProperties (fluid properties)
   - turbulenceProperties (turbulence model)
   - fvSchemes (discretization schemes)
   - fvSolution (linear solver settings)
2. Use proper OpenFOAM dictionary syntax
3. Ensure the case is complete and runnable
4. Return the files as a JSON object with filenames as keys and file contents as values

EXAMPLE OpenFOAM format:
{{
  "system/blockMeshDict": "vertices (...); blocks (...);",
  "system/controlDict": "application simpleFoam; startTime 0;",
  "constant/transportProperties": "transportModel Newtonian; nu 1.5e-05;"
}}"""


def build_elmer_prompt(model: Dict[str, Any]) -> str:
    """Build Elmer generation prompt"""
    return f"""You are an expert Elmer input file generator. Generate a syntactically correct Elmer input file (.sif) for the following thermal model.

MODEL:
{json.dumps(model, indent=2)}

INSTRUCTIONS:
1. Generate a complete Elmer input file
2. Include proper sections:
   - Header
   - Simulation
   - Constants
   - Body 1 (material properties)
   - Equation 1 (heat equation)
   - Solver 1 (heat solver)
   - Boundary Condition 1 (boundary conditions)
   - Material 1 (material definition)
3. Use proper Elmer syntax and format
4. Ensure the input file is complete and runnable
5. Return ONLY the input file in a code block

EXAMPLE Elmer syntax:
Header
  Mesh DB "." "mesh"
End

Simulation
  Max Output Level = 5
  Coordinate System = Cartesian
  Coordinate Mapping(3) = 1 2 3
  Simulation Type = Steady state
  Steady State Max Iterations = 1
End

Constants
  Heat Conductivity = 237.0
  Density = 2700.0
  Heat Capacity = 900.0
End

Body 1
  Target Bodies(1) = 1
  Name = "Aluminum"
  Equation = 1
  Material = 1
End

Equation 1
  Active Solvers(1) = 1
End

Solver 1
  Equation = Heat Equation
  Procedure = "HeatSolve" "HeatSolver"
End"""
