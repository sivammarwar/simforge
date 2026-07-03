/**
 * Aerospace Domain Validator
 * Validates aerospace parameters before simulation
 */

const AEROSPACE_PARAMETERS = {
  'Airfoil Analysis': {
    required: ['airfoil', 'reynolds', 'mach', 'aoa_min', 'aoa_max', 'aoa_step'],
    optional: ['ncrit', 'freestream_velocity', 'air_density'],
    ranges: {
      airfoil: { min: 0, max: 100, unit: 'string' },
      reynolds: { min: 1e3, max: 1e9, unit: '-' },
      mach: { min: 0, max: 10, unit: '-' },
      aoa_min: { min: -180, max: 180, unit: 'deg' },
      aoa_max: { min: -180, max: 180, unit: 'deg' },
      aoa_step: { min: 0.1, max: 10, unit: 'deg' },
      ncrit: { min: 1, max: 20, unit: '-' },
      freestream_velocity: { min: 0.1, max: 1000, unit: 'm/s' },
      air_density: { min: 0.01, max: 100, unit: 'kg/m³' }
    }
  },
  'Nozzle Flow': {
    required: ['throat_diameter', 'exit_diameter', 'chamber_pressure', 'exit_pressure'],
    optional: ['nozzle_length', 'expansion_ratio', 'gas_constant', 'specific_heat_ratio'],
    ranges: {
      throat_diameter: { min: 1, max: 1000, unit: 'mm' },
      exit_diameter: { min: 1, max: 5000, unit: 'mm' },
      nozzle_length: { min: 10, max: 10000, unit: 'mm' },
      chamber_pressure: { min: 1e5, max: 1e8, unit: 'Pa' },
      exit_pressure: { min: 1e3, max: 1e7, unit: 'Pa' },
      expansion_ratio: { min: 1, max: 100, unit: '-' },
      gas_constant: { min: 100, max: 1000, unit: 'J/(kg·K)' },
      specific_heat_ratio: { min: 1.1, max: 1.67, unit: '-' }
    }
  },
  'Generic Aerospace': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Get solver name for aerospace domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'XFOIL';
}

/**
 * Validate aerospace parameters
 * @param {string} systemType - Type of aerospace system
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateAerospaceParameters(systemType, parameters) {
  const schema = AEROSPACE_PARAMETERS[systemType] || AEROSPACE_PARAMETERS['Generic Aerospace'];
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
      if (param === 'airfoil') {
        // String parameter, just check if not empty
        if (!value || value.trim() === '') {
          errors.push('Airfoil name cannot be empty');
        }
        continue;
      }
      
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
  
  // Aerospace-specific validations
  if (systemType === 'Airfoil Analysis' && parameters.aoa_min && parameters.aoa_max && parameters.aoa_step) {
    if (parseFloat(parameters.aoa_min) >= parseFloat(parameters.aoa_max)) {
      errors.push('aoa_min must be less than aoa_max');
    }
    
    const numSteps = (parseFloat(parameters.aoa_max) - parseFloat(parameters.aoa_min)) / parseFloat(parameters.aoa_step);
    if (numSteps > 100) {
      warnings.push(`Number of AoA steps (${numSteps.toFixed(0)}) is large, consider increasing step size`);
    }
  }
  
  if (parameters.mach && parseFloat(parameters.mach) > 1) {
    warnings.push('Mach number > 1 indicates supersonic flow - XFOIL may have limited accuracy');
  }
  
  if (parameters.mach && parseFloat(parameters.mach) > 0.8) {
    warnings.push('Mach number > 0.8 indicates compressible flow effects');
  }
  
  if (systemType === 'Nozzle Flow' && parameters.throat_diameter && parameters.exit_diameter) {
    if (parseFloat(parameters.exit_diameter) <= parseFloat(parameters.throat_diameter)) {
      errors.push('Exit diameter must be greater than throat diameter for convergent-divergent nozzle');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default parameters for an aerospace system type
 * @param {string} systemType - Type of aerospace system
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(systemType) {
  const defaults = {
    'Airfoil Analysis': {
      airfoil: 'naca0012',
      reynolds: 1e6,
      mach: 0.0,
      aoa_min: -5,
      aoa_max: 15,
      aoa_step: 1,
      ncrit: 9,
      freestream_velocity: 50,
      air_density: 1.225
    },
    'Nozzle Flow': {
      throat_diameter: 50,
      exit_diameter: 100,
      nozzle_length: 200,
      chamber_pressure: 5e6,
      exit_pressure: 1e5,
      expansion_ratio: 4,
      gas_constant: 287,
      specific_heat_ratio: 1.4
    }
  };
  
  return defaults[systemType] || {};
}
