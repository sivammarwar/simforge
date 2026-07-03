/**
 * Circuits Domain Validator
 * Validates circuit parameters before simulation
 */

const CIRCUIT_PARAMETERS = {
  'RC Low-Pass Filter': {
    required: ['R1', 'C1', 'vin'],
    optional: ['frequency', 'load_resistance'],
    ranges: {
      R1: { min: 1, max: 1e9, unit: 'Ω' },
      C1: { min: 1e-12, max: 1, unit: 'F' },
      vin: { min: 0.1, max: 1000, unit: 'V' },
      frequency: { min: 1, max: 1e9, unit: 'Hz' },
      load_resistance: { min: 1, max: 1e9, unit: 'Ω' }
    }
  },
  'Voltage Divider': {
    required: ['R1', 'R2', 'vin'],
    optional: ['load_resistance'],
    ranges: {
      R1: { min: 1, max: 1e9, unit: 'Ω' },
      R2: { min: 1, max: 1e9, unit: 'Ω' },
      vin: { min: 0.1, max: 1000, unit: 'V' },
      load_resistance: { min: 1, max: 1e9, unit: 'Ω' }
    }
  },
  'Buck Converter': {
    required: ['vin', 'vout', 'L1', 'C1', 'frequency'],
    optional: ['load_resistance', 'duty_cycle'],
    ranges: {
      vin: { min: 1, max: 100, unit: 'V' },
      vout: { min: 0.5, max: 50, unit: 'V' },
      L1: { min: 1e-9, max: 1e-3, unit: 'H' },
      C1: { min: 1e-9, max: 1e-3, unit: 'F' },
      frequency: { min: 1e3, max: 1e7, unit: 'Hz' },
      load_resistance: { min: 1, max: 1e6, unit: 'Ω' },
      duty_cycle: { min: 0.1, max: 0.9 }
    }
  },
  'Common Emitter Amplifier': {
    required: ['Rc', 'Re', 'Rb1', 'Rb2', 'Vcc', 'beta'],
    optional: ['Rin', 'Rout', 'frequency'],
    ranges: {
      Rc: { min: 100, max: 1e6, unit: 'Ω' },
      Re: { min: 10, max: 1e5, unit: 'Ω' },
      Rb1: { min: 1e3, max: 1e7, unit: 'Ω' },
      Rb2: { min: 1e3, max: 1e7, unit: 'Ω' },
      Vcc: { min: 1, max: 50, unit: 'V' },
      beta: { min: 10, max: 1000 },
      frequency: { min: 1, max: 1e9, unit: 'Hz' }
    }
  },
  'Generic Circuit': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Get solver name for circuits domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'ngspice';
}

/**
 * Validate circuit parameters
 * @param {string} circuitType - Type of circuit
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateCircuitParameters(circuitType, parameters) {
  const schema = CIRCUIT_PARAMETERS[circuitType] || CIRCUIT_PARAMETERS['Generic Circuit'];
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
  
  // Circuit-specific validations
  if (circuitType === 'Buck Converter') {
    if (parameters.vin && parameters.vout && parameters.vin <= parameters.vout) {
      errors.push('Buck converter requires vin > vout');
    }
  }
  
  if (circuitType === 'Voltage Divider') {
    if (parameters.R1 && parameters.R2 && parameters.R1 <= 0 && parameters.R2 <= 0) {
      errors.push('Voltage divider requires positive resistances');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default parameters for a circuit type
 * @param {string} circuitType - Type of circuit
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(circuitType) {
  const defaults = {
    'RC Low-Pass Filter': {
      R1: 1000,
      C1: 1e-6,
      vin: 5,
      frequency: 1000
    },
    'Voltage Divider': {
      R1: 10000,
      R2: 10000,
      vin: 12
    },
    'Buck Converter': {
      vin: 12,
      vout: 5,
      L1: 22e-6,
      C1: 47e-6,
      frequency: 500000
    },
    'Common Emitter Amplifier': {
      Rc: 4700,
      Re: 1000,
      Rb1: 47000,
      Rb2: 10000,
      Vcc: 12,
      beta: 100
    }
  };
  
  return defaults[circuitType] || {};
}
