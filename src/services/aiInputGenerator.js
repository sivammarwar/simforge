/**
 * aiInputGenerator.js - Pure AI-Powered Model to Tool Input Conversion
 * 
 * This service replaces ALL hardcoded template generators with pure AI generation.
 * Each solver uses ONLY AI to generate tool-specific input files from the structured model.
 * 
 * NO HARDCODED TEMPLATES - AI is the ONLY input generation path.
 */

import { chatWithEngineeringBrain } from './llmClient.js';

/**
 * Generate tool input file using AI
 * 
 * @param {string} solverName - Solver name (ngspice, calculix, xfoil, openfoam, elmer)
 * @param {object} model - Structured model from AI extraction
 * @param {string} provider - AI provider (default: 'groq')
 * @returns {object} Generated input file content and metadata
 */
export async function generateInputFileWithAI(solverName, model, provider = 'groq') {
  const generator = SOLVER_GENERATORS[solverName];
  
  if (!generator) {
    throw new Error(`Unknown solver: ${solverName}. Available solvers: ${Object.keys(SOLVER_GENERATORS).join(', ')}`);
  }
  
  return await generator(model, provider);
}

/**
 * Solver-specific AI generators
 */
const SOLVER_GENERATORS = {
  ngspice: generateNgspiceInput,
  calculix: generateCalculiXInput,
  xfoil: generateXFOILInput,
  openfoam: generateOpenFOAMInput,
  elmer: generateElmerInput
};

/**
 * Generate ngspice netlist using AI
 */
async function generateNgspiceInput(model, provider) {
  const prompt = buildNgspicePrompt(model);
  
  const aiResponse = await chatWithEngineeringBrain({
    message: prompt,
    domain: 'Circuits',
    provider,
    conversationHistory: []
  });
  
  if (!aiResponse.success) {
    throw new Error(`AI ngspice generation failed: ${aiResponse.error}`);
  }
  
  const netlist = extractCodeBlock(aiResponse.content, 'spice') || extractCodeBlock(aiResponse.content, 'text') || aiResponse.content;
  
  return {
    solver: 'ngspice',
    filename: 'circuit.cir',
    content: netlist,
    metadata: {
      system_type: model.SYSTEM_TYPE,
      generated_by: 'ai'
    }
  };
}

/**
 * Generate CalculiX input file using AI
 */
async function generateCalculiXInput(model, provider) {
  const prompt = buildCalculiXPrompt(model);
  
  const aiResponse = await chatWithEngineeringBrain({
    message: prompt,
    domain: 'Structural',
    provider,
    conversationHistory: []
  });
  
  if (!aiResponse.success) {
    throw new Error(`AI CalculiX generation failed: ${aiResponse.error}`);
  }
  
  const inpFile = extractCodeBlock(aiResponse.content, 'inp') || extractCodeBlock(aiResponse.content, 'text') || aiResponse.content;
  
  return {
    solver: 'calculix',
    filename: 'ccx.inp',
    content: inpFile,
    metadata: {
      system_type: model.SYSTEM_TYPE,
      generated_by: 'ai'
    }
  };
}

/**
 * Generate XFOIL script using AI
 */
async function generateXFOILInput(model, provider) {
  const prompt = buildXFOILPrompt(model);
  
  const aiResponse = await chatWithEngineeringBrain({
    message: prompt,
    domain: 'Aerospace',
    provider,
    conversationHistory: []
  });
  
  if (!aiResponse.success) {
    throw new Error(`AI XFOIL generation failed: ${aiResponse.error}`);
  }
  
  const script = extractCodeBlock(aiResponse.content, 'txt') || extractCodeBlock(aiResponse.content, 'text') || aiResponse.content;
  
  return {
    solver: 'xfoil',
    filename: 'xfoil_script.txt',
    content: script,
    metadata: {
      system_type: model.SYSTEM_TYPE,
      generated_by: 'ai'
    }
  };
}

/**
 * Generate OpenFOAM case using AI
 */
async function generateOpenFOAMInput(model, provider) {
  const prompt = buildOpenFOAMPrompt(model);
  
  const aiResponse = await chatWithEngineeringBrain({
    message: prompt,
    domain: 'Fluids',
    provider,
    conversationHistory: []
  });
  
  if (!aiResponse.success) {
    throw new Error(`AI OpenFOAM generation failed: ${aiResponse.error}`);
  }
  
  // OpenFOAM generates multiple files, return as dictionary
  const blockDict = extractCodeBlock(aiResponse.content, 'json') || aiResponse.content;
  
  return {
    solver: 'openfoam',
    filename: 'case_files',
    content: blockDict,
    metadata: {
      system_type: model.SYSTEM_TYPE,
      generated_by: 'ai',
      multi_file: true
    }
  };
}

/**
 * Generate Elmer input file using AI
 */
async function generateElmerInput(model, provider) {
  const prompt = buildElmerPrompt(model);
  
  const aiResponse = await chatWithEngineeringBrain({
    message: prompt,
    domain: 'Thermal',
    provider,
    conversationHistory: []
  });
  
  if (!aiResponse.success) {
    throw new Error(`AI Elmer generation failed: ${aiResponse.error}`);
  }
  
  const sifFile = extractCodeBlock(aiResponse.content, 'sif') || extractCodeBlock(aiResponse.content, 'text') || aiResponse.content;
  
  return {
    solver: 'elmer',
    filename: 'case.sif',
    content: sifFile,
    metadata: {
      system_type: model.SYSTEM_TYPE,
      generated_by: 'ai'
    }
  };
}

/**
 * Build ngspice generation prompt
 */
function buildNgspicePrompt(model) {
  return `You are an expert SPICE netlist generator. Generate a syntactically correct ngspice netlist for the following circuit model.

MODEL:
${JSON.stringify(model, null, 2)}

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
.end`;
}

/**
 * Build CalculiX generation prompt
 */
function buildCalculiXPrompt(model) {
  return `You are an expert CalculiX input file generator. Generate a syntactically correct CalculiX input deck (.inp file) for the following structural model.

MODEL:
${JSON.stringify(model, null, 2)}

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
*END STEP`;
}

/**
 * Build XFOIL generation prompt
 */
function buildXFOILPrompt(model) {
  return `You are an expert XFOIL script generator. Generate a syntactically correct XFOIL script for the following aerodynamic model.

MODEL:
${JSON.stringify(model, null, 2)}

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
DUMP polar.dat`;
}

/**
 * Build OpenFOAM generation prompt
 */
function buildOpenFOAMPrompt(model) {
  return `You are an expert OpenFOAM case generator. Generate the necessary OpenFOAM configuration files for the following CFD model.

MODEL:
${JSON.stringify(model, null, 2)}

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
{
  "system/blockMeshDict": "vertices (...); blocks (...);",
  "system/controlDict": "application simpleFoam; startTime 0;",
  "constant/transportProperties": "transportModel Newtonian; nu 1.5e-05;"
}`;
}

/**
 * Build Elmer generation prompt
 */
function buildElmerPrompt(model) {
  return `You are an expert Elmer input file generator. Generate a syntactically correct Elmer input file (.sif) for the following thermal model.

MODEL:
${JSON.stringify(model, null, 2)}

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
End`;
}

/**
 * Extract code block from AI response
 */
function extractCodeBlock(content, language) {
  const patterns = [
    new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\\s*\`\`\``),
    new RegExp(`\`\`\`([\\s\\S]*?)\\s*\`\`\``)
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1] || match[0].replace(/```\w*\n?/gy, '').replace(/```/g, '');
    }
  }
  
  return null;
}
