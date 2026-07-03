/**
 * Structural Domain Validator
 * Validates structural parameters before simulation
 */

const STRUCTURAL_PARAMETERS = {
  'Cantilever Beam': {
    required: ['length', 'width', 'height', 'load_magnitude', 'youngs_modulus'],
    optional: ['wall_thickness', 'ribs', 'poisson_ratio', 'density'],
    ranges: {
      length: { min: 1, max: 10000, unit: 'mm' },
      width: { min: 1, max: 1000, unit: 'mm' },
      height: { min: 1, max: 1000, unit: 'mm' },
      wall_thickness: { min: 0.1, max: 100, unit: 'mm' },
      ribs: { min: 0, max: 20 },
      load_magnitude: { min: 0.1, max: 100000, unit: 'N' },
      youngs_modulus: { min: 1000, max: 500000, unit: 'MPa' },
      poisson_ratio: { min: 0.1, max: 0.5 },
      density: { min: 1000, max: 20000, unit: 'kg/m³' }
    }
  },
  'Simply Supported Beam': {
    required: ['length', 'width', 'height', 'load_magnitude', 'youngs_modulus'],
    optional: ['poisson_ratio', 'density'],
    ranges: {
      length: { min: 10, max: 20000, unit: 'mm' },
      width: { min: 1, max: 1000, unit: 'mm' },
      height: { min: 1, max: 1000, unit: 'mm' },
      load_magnitude: { min: 1, max: 1000000, unit: 'N' },
      youngs_modulus: { min: 1000, max: 500000, unit: 'MPa' },
      poisson_ratio: { min: 0.1, max: 0.5 },
      density: { min: 1000, max: 20000, unit: 'kg/m³' }
    }
  },
  'Column Buckling': {
    required: ['length', 'cross_section_area', 'load_magnitude', 'youngs_modulus'],
    optional: ['moment_of_inertia', 'end_condition'],
    ranges: {
      length: { min: 100, max: 10000, unit: 'mm' },
      cross_section_area: { min: 1, max: 100000, unit: 'mm²' },
      load_magnitude: { min: 1, max: 1000000, unit: 'N' },
      youngs_modulus: { min: 1000, max: 500000, unit: 'MPa' },
      moment_of_inertia: { min: 1, max: 1e9, unit: 'mm⁴' }
    }
  },
  'Generic Structural': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Get solver name for structural domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'CalculiX';
}

/**
 * Validate structural parameters
 * @param {string} systemType - Type of structural system
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateStructuralParameters(systemType, parameters) {
  const schema = STRUCTURAL_PARAMETERS[systemType] || STRUCTURAL_PARAMETERS['Generic Structural'];
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
  
  // Structural-specific validations
  if (systemType === 'Cantilever Beam' || systemType === 'Simply Supported Beam') {
    if (parameters.length && parameters.width && parameters.height) {
      const aspectRatio = parseFloat(parameters.length) / Math.max(parseFloat(parameters.width), parseFloat(parameters.height));
      if (aspectRatio > 100) {
        warnings.push('Beam length-to-depth ratio > 100 may cause numerical issues');
      }
    }
    
    if (parameters.wall_thickness && parameters.width && parameters.height) {
      const minDim = Math.min(parseFloat(parameters.width), parseFloat(parameters.height));
      if (parseFloat(parameters.wall_thickness) > minDim / 2) {
        errors.push('Wall thickness cannot exceed half of minimum cross-section dimension');
      }
    }
  }
  
  if (parameters.youngs_modulus && parseFloat(parameters.youngs_modulus) < 10000) {
    warnings.push('Young\'s modulus < 10 GPa suggests non-metallic material');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default parameters for a structural system type
 * @param {string} systemType - Type of structural system
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(systemType) {
  const defaults = {
    'Cantilever Beam': {
      length: 100,
      width: 20,
      height: 20,
      wall_thickness: 2,
      ribs: 0,
      load_magnitude: 100,
      youngs_modulus: 200000, // Steel
      poisson_ratio: 0.29,
      density: 7850
    },
    'Simply Supported Beam': {
      length: 1000,
      width: 50,
      height: 50,
      load_magnitude: 1000,
      youngs_modulus: 200000,
      poisson_ratio: 0.29,
      density: 7850
    },
    'Column Buckling': {
      length: 2000,
      cross_section_area: 1000,
      moment_of_inertia: 1e6,
      load_magnitude: 10000,
      youngs_modulus: 200000,
      end_condition: 'pinned-pinned'
    }
  };
  
  return defaults[systemType] || {};
}
