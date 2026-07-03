/**
 * Control Domain Validator
 * Validates control systems parameters before simulation
 */

const CONTROL_PARAMETERS = {
  'Second-Order System': {
    required: ['natural_frequency', 'damping_ratio'],
    optional: ['input_type', 'input_amplitude', 'simulation_time'],
    ranges: {
      natural_frequency: { min: 0.1, max: 1000, unit: 'rad/s' },
      damping_ratio: { min: 0, max: 2, unit: '-' },
      input_amplitude: { min: 0.01, max: 1000, unit: '-' },
      simulation_time: { min: 0.1, max: 1000, unit: 's' }
    }
  },
  'PID Controller': {
    required: ['kp', 'ki', 'kd'],
    optional: ['setpoint', 'process_variable', 'simulation_time'],
    ranges: {
      kp: { min: -1000, max: 1000, unit: '-' },
      ki: { min: -1000, max: 1000, unit: '-' },
      kd: { min: -1000, max: 1000, unit: '-' },
      setpoint: { min: -1000, max: 1000, unit: '-' },
      simulation_time: { min: 0.1, max: 1000, unit: 's' }
    }
  },
  'Step Response': {
    required: ['natural_frequency', 'damping_ratio'],
    optional: ['input_amplitude', 'simulation_time'],
    ranges: {
      natural_frequency: { min: 0.1, max: 1000, unit: 'rad/s' },
      damping_ratio: { min: 0, max: 2, unit: '-' },
      input_amplitude: { min: 0.01, max: 1000, unit: '-' },
      simulation_time: { min: 0.1, max: 1000, unit: 's' }
    }
  },
  'Bode Plot': {
    required: ['natural_frequency', 'damping_ratio'],
    optional: ['frequency_min', 'frequency_max'],
    ranges: {
      natural_frequency: { min: 0.1, max: 1000, unit: 'rad/s' },
      damping_ratio: { min: 0, max: 2, unit: '-' },
      frequency_min: { min: 0.01, max: 1e6, unit: 'rad/s' },
      frequency_max: { min: 0.01, max: 1e6, unit: 'rad/s' }
    }
  },
  'Generic Control': {
    required: [],
    optional: [],
    ranges: {}
  }
};

/**
 * Validate control parameters
 * @param {string} systemType - Type of control system
 * @param {Object} parameters - Parameter values
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateControlParameters(systemType, parameters) {
  const schema = CONTROL_PARAMETERS[systemType] || CONTROL_PARAMETERS['Generic Control'];
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
  
  // Control-specific validations
  if (parameters.damping_ratio && parseFloat(parameters.damping_ratio) < 0) {
    errors.push('Damping ratio cannot be negative');
  }
  
  if (parameters.damping_ratio && parseFloat(parameters.damping_ratio) > 1) {
    warnings.push('Damping ratio > 1 indicates overdamped system');
  }
  
  if (parameters.damping_ratio && parseFloat(parameters.damping_ratio) === 1) {
    warnings.push('Damping ratio = 1 indicates critically damped system');
  }
  
  if (parameters.damping_ratio && parseFloat(parameters.damping_ratio) < 1 && parseFloat(parameters.damping_ratio) > 0) {
    warnings.push('Damping ratio < 1 indicates underdamped system (oscillatory response)');
  }
  
  if (parameters.natural_frequency && parseFloat(parameters.natural_frequency) <= 0) {
    errors.push('Natural frequency must be positive');
  }
  
  if (parameters.frequency_min && parameters.frequency_max && parseFloat(parameters.frequency_min) >= parseFloat(parameters.frequency_max)) {
    errors.push('frequency_min must be less than frequency_max');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get solver name for control domain
 * @returns {string} - Solver name
 */
export function getSolverName() {
  return 'python';
}

/**
 * Get default parameters for a control system type
 * @param {string} systemType - Type of control system
 * @returns {Object} - Default parameter values
 */
export function getDefaultParameters(systemType) {
  const defaults = {
    'Second-Order System': {
      natural_frequency: 5,
      damping_ratio: 0.5,
      input_type: 'step',
      input_amplitude: 1,
      simulation_time: 10
    },
    'PID Controller': {
      kp: 1,
      ki: 0,
      kd: 0,
      setpoint: 1,
      process_variable: 0,
      simulation_time: 10
    },
    'Step Response': {
      natural_frequency: 5,
      damping_ratio: 0.5,
      input_amplitude: 1,
      simulation_time: 10
    },
    'Bode Plot': {
      natural_frequency: 5,
      damping_ratio: 0.5,
      frequency_min: 0.1,
      frequency_max: 100
    }
  };
  
  return defaults[systemType] || {};
}
