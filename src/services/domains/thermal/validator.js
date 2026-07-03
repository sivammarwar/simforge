/**
 * Thermal Domain Validator
 * Validates thermal parameters before simulation
 */

const THERMAL_PARAMETERS = {
  'Heat Sink': {
    required: ['power_dissipation', 'base_width', 'base_height', 'thermal_conductivity'],
    optional: ['youngs_modulus', 'thermal_expansion', 'heat_transfer_coefficient', 'ambient_temp'],
    ranges: {
      power_dissipation: { min: 0.1, max: 10000, unit: 'W' },
      base_width: { min: 1, max: 1000, unit: 'mm' },
      base_height: { min: 1, max: 1000, unit: 'mm' },
      thermal_conductivity: { min: 1, max: 500, unit: 'W/(m·K)' },
      youngs_modulus: { min: 1000, max: 500000, unit: 'MPa' },
      thermal_expansion: { min: 1e-6, max: 50e-6, unit: '1/K' },
      heat_transfer_coefficient: { min: 1, max: 10000, unit: 'W/(m²·K)' },
      ambient_temp: { min: -100, max: 500, unit: '°C' }
    }
  },
  'Heat Conduction': {
    required: ['thermal_conductivity', 'temperature_diff', 'thickness'],
    optional: ['area', 'heat_flux'],
    ranges: {
      thermal_conductivity: { min: 0.1, max: 500, unit: 'W/(m·K)' },
      temperature_diff: { min: 0.1, max: 1000, unit: 'K' },
      thickness: { min: 0.1, max: 1000, unit: 'mm' },
      area: { min: 1, max: 100000, unit: 'mm²' },
      heat_flux: { min: 1, max: 1e6, unit: 'W/m²' }
    }
  },
  'Convection': {
    required: ['heat_transfer_coefficient', 'surface_area', 'temperature_diff'],
    optional: ['fluid_velocity', 'fluid_type'],
    ranges: {
      heat_transfer_coefficient: { min: 1, max: 10000, unit: 'W/(m²·K)' },
      surface_area: { min: 1, max: 100000, unit: 'mm²' },
      temperature_diff: { min: 0.1, max: 1000, unit: 'K' },
      fluid_velocity: { min: 0.01, max: 100, unit: 'm/s' }
    }
  },
  'Generic Thermal': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Get solver name for thermal domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'Elmer';
}

/**
 * Validate thermal parameters
 * @param {string} systemType - Type of thermal system
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateThermalParameters(systemType, parameters) {
  const schema = THERMAL_PARAMETERS[systemType] || THERMAL_PARAMETERS['Generic Thermal'];
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
  
  // Thermal-specific validations
  if (parameters.power_dissipation && parameters.thermal_conductivity && parameters.base_width && parameters.base_height) {
    const area = (parseFloat(parameters.base_width) * parseFloat(parameters.base_height)) / 1e6; // m²
    const maxTemp = 293.15 + parseFloat(parameters.power_dissipation) / (parseFloat(parameters.thermal_conductivity) * area) * 0.01;
    
    if (maxTemp > 500) {
      warnings.push(`Predicted max temperature ${maxTemp.toFixed(1)}K exceeds typical operating limits`);
    }
  }
  
  if (parameters.thermal_conductivity && parseFloat(parameters.thermal_conductivity) < 10) {
    warnings.push('Thermal conductivity < 10 W/(m·K) suggests insulating material');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default parameters for a thermal system type
 * @param {string} systemType - Type of thermal system
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(systemType) {
  const defaults = {
    'Heat Sink': {
      power_dissipation: 25,
      base_width: 50,
      base_height: 50,
      thermal_conductivity: 200, // Aluminum
      youngs_modulus: 69000,
      thermal_expansion: 23e-6,
      heat_transfer_coefficient: 10,
      ambient_temp: 25
    },
    'Heat Conduction': {
      thermal_conductivity: 200,
      temperature_diff: 50,
      thickness: 10,
      area: 10000
    },
    'Convection': {
      heat_transfer_coefficient: 100,
      surface_area: 10000,
      temperature_diff: 30,
      fluid_velocity: 1
    }
  };
  
  return defaults[systemType] || {};
}
