/**
 * Thermal Domain Input Generator
 * Generates Elmer input files from thermal parameters
 */

/**
 * Generate Elmer input file for Heat Sink
 * @param {Object} params - Thermal parameters
 * @returns {string} - Elmer .sif file content
 */
function generateHeatSinkInput(params) {
  const { 
    power_dissipation = 25, 
    base_width = 50, 
    base_height = 50, 
    thermal_conductivity = 200, 
    youngs_modulus = 69000, 
    thermal_expansion = 23e-6,
    heat_transfer_coefficient = 10,
    ambient_temp = 25
  } = params;
  
  // Convert to meters for Elmer
  const W = base_width / 1000;
  const H = base_height / 1000;
  
  return `Header
  CHECK KEYWORDS Warn
  Mesh DB "." "."
  Include Path ""
  Results Directory ""
End

Simulation
  Max Output Level = 5
  Coordinate System = Cartesian
  Coordinate Mapping(3) = 1 2 3
  Simulation Type = Steady state
  Steady State Max Iterations = 1
  Output File = "heat_sink.result"
  Post File = "heat_sink.pvtu"
End

Constants
  Stefan Boltzmann = 5.670374419e-8
End

Body 1
  Target Bodies(1) = 1
  Name = "Heat Sink"
  Equation = 1
  Material = 1
  Initial Condition = 1
End

Solver 1
  Equation = Heat Equation
  Procedure = "HeatSolver" "HeatSolver"
  Variable = Temperature
  Exec Solver = Always
  Steady State Convergence Tolerance = 1.0e-5
  Nonlinear System Convergence Tolerance = 1.0e-7
  Nonlinear System Max Iterations = 20
  Nonlinear System Newton After Iterations = 3
  Nonlinear System Relaxation Factor = 1
  Linear System Solver = Iterative
  Linear System Iterative Method = BiCGStab
  Linear System Max Iterations = 500
  Linear System Convergence Tolerance = 1.0e-10
  Linear System Preconditioning = ILU0
  Linear System ILU0 Fill In Limit = 5
  BiCGstabl polynomial degree = 2
End

Equation 1
  Active Solvers(1) = 1
End

Material 1
  Heat Conductivity = ${thermal_conductivity}
  Heat Capacity = 900
  Density = 2700
  Youngs Modulus = ${youngs_modulus}
  Poisson Ratio = 0.33
  Thermal Expansion = ${thermal_expansion}
End

Initial Condition 1
  Temperature = ${ambient_temp}
End

Boundary Condition 1
  Target Boundaries(1) = 1
  Name = "Heat Source"
  Heat Flux BC = True
  Heat Flux = ${power_dissipation / (W * H)}
End

Boundary Condition 2
  Target Boundaries(1) = 2
  Name = "Convection"
  Heat Transfer Coefficient = ${heat_transfer_coefficient}
  External Temperature = ${ambient_temp}
End
`;
}

/**
 * Generate Elmer input file based on system type
 * @param {string} systemType - Type of thermal system
 * @param {Object} params - Thermal parameters
 * @returns {string} - Elmer .sif file content
 */
export function generateInputFile(systemType, params) {
  const generators = {
    'Heat Sink': generateHeatSinkInput,
    'Heat Conduction': generateHeatSinkInput, // Similar structure
    'Convection': generateHeatSinkInput, // Similar structure
    'Radiation': generateHeatSinkInput, // Placeholder
    'Heat Exchanger': generateHeatSinkInput, // Placeholder
    'Thermal Stress': generateHeatSinkInput // Placeholder
  };
  
  const generator = generators[systemType];
  if (!generator) {
    // Generic template for unknown system types
    return `Header
  CHECK KEYWORDS Warn
End

Simulation
  Simulation Type = Steady state
End
`;
  }
  
  return generator(params);
}

/**
 * Parse parameters from input file (reverse operation)
 * @param {string} inputFile - Elmer .sif file content
 * @returns {Object} - Extracted parameters
 */
export function parseInputFileParameters(inputFile) {
  const params = {};
  
  // Parse thermal conductivity
  const conductivityMatch = inputFile.match(/Heat Conductivity\s*=\s*([\d.eE+-]+)/);
  if (conductivityMatch) {
    params.thermal_conductivity = parseFloat(conductivityMatch[1]);
  }
  
  // Parse heat flux
  const fluxMatch = inputFile.match(/Heat Flux\s*=\s*([\d.eE+-]+)/);
  if (fluxMatch) {
    const flux = parseFloat(fluxMatch[1]);
    params.heat_flux = flux;
  }
  
  // Parse heat transfer coefficient
  const htcMatch = inputFile.match(/Heat Transfer Coefficient\s*=\s*([\d.eE+-]+)/);
  if (htcMatch) {
    params.heat_transfer_coefficient = parseFloat(htcMatch[1]);
  }
  
  // Parse external temperature
  const tempMatch = inputFile.match(/External Temperature\s*=\s*([\d.eE+-]+)/);
  if (tempMatch) {
    params.ambient_temp = parseFloat(tempMatch[1]);
  }
  
  return params;
}
