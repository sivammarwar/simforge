/**
 * Fluids Domain Validator
 * Validates fluids parameters before simulation
 */

const FLUIDS_PARAMETERS = {
  'Pipe Flow': {
    required: ['diameter', 'length', 'velocity_inlet', 'viscosity', 'density'],
    optional: ['pressure_outlet', 'roughness', 'temperature'],
    ranges: {
      diameter: { min: 1, max: 10000, unit: 'mm' },
      length: { min: 10, max: 100000, unit: 'mm' },
      velocity_inlet: { min: 0.001, max: 1000, unit: 'm/s' },
      viscosity: { min: 1e-6, max: 10, unit: 'Pa·s' },
      density: { min: 0.5, max: 20000, unit: 'kg/m³' },
      pressure_outlet: { min: 0, max: 1e8, unit: 'Pa' },
      roughness: { min: 0, max: 10, unit: 'mm' },
      temperature: { min: -100, max: 1000, unit: '°C' }
    }
  },
  'Airfoil Analysis': {
    required: ['airfoil', 'reynolds', 'mach', 'aoa_min', 'aoa_max', 'aoa_step'],
    optional: ['ncrit', 'freestream_velocity'],
    ranges: {
      reynolds: { min: 1e3, max: 1e9, unit: '-' },
      mach: { min: 0, max: 10, unit: '-' },
      aoa_min: { min: -180, max: 180, unit: 'deg' },
      aoa_max: { min: -180, max: 180, unit: 'deg' },
      aoa_step: { min: 0.1, max: 10, unit: 'deg' },
      ncrit: { min: 1, max: 20, unit: '-' },
      freestream_velocity: { min: 0.1, max: 1000, unit: 'm/s' }
    }
  },
  'Channel Flow': {
    required: ['width', 'depth', 'length', 'velocity_inlet', 'viscosity', 'density'],
    optional: ['slope', 'roughness'],
    ranges: {
      width: { min: 10, max: 100000, unit: 'mm' },
      depth: { min: 1, max: 10000, unit: 'mm' },
      length: { min: 10, max: 100000, unit: 'mm' },
      velocity_inlet: { min: 0.001, max: 50, unit: 'm/s' },
      viscosity: { min: 1e-6, max: 10, unit: 'Pa·s' },
      density: { min: 0.5, max: 20000, unit: 'kg/m³' },
      slope: { min: 0, max: 1, unit: '-' },
      roughness: { min: 0, max: 100, unit: 'mm' }
    }
  },
  'Generic Fluids': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Get solver name for fluids domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'OpenFOAM';
}

/**
 * Validate fluids parameters
 * @param {string} systemType - Type of fluids system
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateFluidsParameters(systemType, parameters) {
  const schema = FLUIDS_PARAMETERS[systemType] || FLUIDS_PARAMETERS['Generic Fluids'];
  const errors = [];
  const warnings = [];
  
  // Check required parameters
  for (const param of schema.required) {
    if (parameters[param] === undefined || parameters[param] === null) {
      errors.push(`Missing required parameter: ${param}`);
    }
  }
  
  // Check parameter ranges
  for (const [param, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) continue;
    
    const range = schema.ranges?.[param];
    if (range) {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        errors.push(`Parameter ${param} must be a number`);
        continue;
      }
      
      if (numValue < range.min || numValue > range.max) {
        warnings.push(
          `Parameter ${param} = ${numValue}${range.unit || ''} is outside typical range [${range.min}, ${range.max}${range.unit || ''}]`
        );
      }
    }
  }
  
  // Fluids-specific validations
  if (systemType === 'Pipe Flow' && parameters.diameter && parameters.velocity_inlet && parameters.viscosity && parameters.density) {
    const D = parseFloat(parameters.diameter) / 1000; // m
    const V = parseFloat(parameters.velocity_inlet);
    const mu = parseFloat(parameters.viscosity);
    const rho = parseFloat(parameters.density);
    
    const reynolds = (rho * V * D) / mu;
    
    if (reynolds < 2300) {
      warnings.push(`Reynolds number ${reynolds.toFixed(0)} indicates laminar flow`);
    } else if (reynolds > 4000) {
      warnings.push(`Reynolds number ${reynolds.toFixed(0)} indicates turbulent flow`);
    }
  }
  
  if (systemType === 'Airfoil Analysis' && parameters.aoa_min && parameters.aoa_max && parameters.aoa_step) {
    if (parseFloat(parameters.aoa_min) >= parseFloat(parameters.aoa_max)) {
      errors.push('aoa_min must be less than aoa_max');
    }
  }
  
  if (parameters.mach && parseFloat(parameters.mach) > 0.8) {
    warnings.push('Mach number > 0.8 indicates compressible flow effects');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default parameters for a fluids system type
 * @param {string} systemType - Type of fluids system
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(systemType) {
  const defaults = {
    'Pipe Flow': {
      diameter: 50,
      length: 1000,
      velocity_inlet: 1,
      viscosity: 1e-3, // Water
      density: 1000, // Water
      pressure_outlet: 101325,
      roughness: 0.05,
      temperature: 20
    },
    'Airfoil Analysis': {
      airfoil: 'naca0012',
      reynolds: 1e6,
      mach: 0.0,
      aoa_min: -5,
      aoa_max: 15,
      aoa_step: 1,
      ncrit: 9,
      freestream_velocity: 50
    },
    'Channel Flow': {
      width: 1000,
      depth: 500,
      length: 10000,
      velocity_inlet: 1,
      viscosity: 1e-3,
      density: 1000,
      slope: 0.001,
      roughness: 1
    }
  };
  
  return defaults[systemType] || {};
}
