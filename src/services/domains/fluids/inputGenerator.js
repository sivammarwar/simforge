/**
 * Fluids Domain Input Generator
 * Generates OpenFOAM input files from fluids parameters
 */

/**
 * Generate OpenFOAM input file for Pipe Flow
 * @param {Object} params - Fluids parameters
 * @returns {string} - OpenFOAM case structure (simplified)
 */
function generatePipeFlowInput(params) {
  const { 
    diameter = 50, 
    length = 1000, 
    velocity_inlet = 1, 
    viscosity = 1e-3, 
    density = 1000,
    pressure_outlet = 101325,
    roughness = 0.05
  } = params;
  
  // Convert to meters for OpenFOAM
  const D = diameter / 1000;
  const L = length / 1000;
  
  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2112                                 |
|   \\\\  /    A nd           | Website:  www.openfoam.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      transportProperties;
}
transportModel  Newtonian;
nu              ${viscosity / density};
rho             ${density};

/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2112                                 |
|   \\\\  /    A nd           | Website:  www.openfoam.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}
application     simpleFoam;
startFrom       latestTime;
startTime       0;
stopAt          endTime;
endTime         500;
deltaT          1;
writeControl    timeStep;
writeInterval   50;
purgeWrite      0;
writeFormat     ascii;
writePrecision  6;
writeCompression off;
timeFormat      general;
runTimeModifiable true;

/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2112                                 |
|   \\\\  /    A nd           | Website:  www.openfoam.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    object      U;
}
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform (0 0 0);
boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform (${velocity_inlet} 0 0);
    }
    outlet
    {
        type            zeroGradient;
    }
    walls
    {
        type            noSlip;
    }
}

/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2112                                 |
|   \\\\  /    A nd           | Website:  www.openfoam.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      p;
}
dimensions      [0 2 -2 0 0 0 0];
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
    walls
    {
        type            zeroGradient;
    }
}
`;
}

/**
 * Generate OpenFOAM input file based on system type
 * @param {string} systemType - Type of fluids system
 * @param {Object} params - Fluids parameters
 * @returns {string} - OpenFOAM case structure
 */
export function generateInputFile(systemType, params) {
  const generators = {
    'Pipe Flow': generatePipeFlowInput,
    'Airfoil Analysis': generatePipeFlowInput, // Similar structure
    'Channel Flow': generatePipeFlowInput, // Similar structure
    'Turbulent Flow': generatePipeFlowInput, // Placeholder
    'Laminar Flow': generatePipeFlowInput, // Placeholder
    'Boundary Layer': generatePipeFlowInput // Placeholder
  };
  
  const generator = generators[systemType];
  if (!generator) {
    // Generic template for unknown system types
    return `/* OpenFOAM Case */
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
}
`;
  }
  
  return generator(params);
}

/**
 * Parse parameters from input file (reverse operation)
 * @param {string} inputFile - OpenFOAM input file content
 * @returns {Object} - Extracted parameters
 */
export function parseInputFileParameters(inputFile) {
  const params = {};
  
  // Parse kinematic viscosity
  const nuMatch = inputFile.match(/nu\s+([\d.eE+-]+)/);
  if (nuMatch) {
    params.nu = parseFloat(nuMatch[1]);
  }
  
  // Parse density
  const rhoMatch = inputFile.match(/rho\s+([\d.eE+-]+)/);
  if (rhoMatch) {
    params.density = parseFloat(rhoMatch[1]);
  }
  
  // Parse inlet velocity
  const velocityMatch = inputFile.match(/uniform\s+\(([\d.eE+-]+)\s/);
  if (velocityMatch) {
    params.velocity_inlet = parseFloat(velocityMatch[1]);
  }
  
  return params;
}
