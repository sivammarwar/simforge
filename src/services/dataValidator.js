/**
 * Data Validator - SINGLE Validation Layer
 * Centralized validation for all data types across domains
 * Replaces fragmented validation logic
 */

// Domain validators
import { validateCircuitParameters } from './domains/circuits/validator';
import { validateStructuralParameters } from './domains/structural/validator';
import { validateThermalParameters } from './domains/thermal/validator';
import { validateFluidsParameters } from './domains/fluids/validator';
import { validateAerospaceParameters } from './domains/aerospace/validator';

/**
 * Validate parameters based on domain
 * @param {string} domain - Domain name
 * @param {string} systemType - System type within domain
 * @param {Object} parameters - Parameter values to validate
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateParameters(domain, systemType, parameters) {
  const validators = {
    'Circuits': validateCircuitParameters,
    'Structural': validateStructuralParameters,
    'Thermal': validateThermalParameters,
    'Fluids': validateFluidsParameters,
    'Aerospace': validateAerospaceParameters
  };
  
  const validator = validators[domain];
  if (!validator) {
    return {
      valid: true,
      errors: [`Unknown domain: ${domain}`],
      warnings: []
    };
  }
  
  return validator(systemType, parameters);
}

/**
 * Validate solver result structure
 * @param {Object} result - Solver result to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateSolverResult(result) {
  const errors = [];
  
  if (!result) {
    errors.push('Result is null or undefined');
    return { valid: false, errors };
  }
  
  // Check required fields
  const requiredFields = ['metrics', 'plain_summary'];
  for (const field of requiredFields) {
    if (!result[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate metrics structure
  if (result.metrics && !Array.isArray(result.metrics)) {
    errors.push('metrics must be an array');
  }
  
  // Validate visualization_type if present
  if (result.visualization_type && typeof result.visualization_type !== 'string') {
    errors.push('visualization_type must be a string');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate input file structure
 * @param {Object} inputFile - Input file object to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateInputFile(inputFile) {
  const errors = [];
  
  if (!inputFile) {
    errors.push('Input file is null or undefined');
    return { valid: false, errors };
  }
  
  // Check required fields
  const requiredFields = ['filename', 'content'];
  for (const field of requiredFields) {
    if (!inputFile[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate content is not empty
  if (inputFile.content && inputFile.content.trim() === '') {
    errors.push('Input file content is empty');
  }
  
  // Validate metadata structure if present
  if (inputFile.metadata) {
    if (typeof inputFile.metadata !== 'object') {
      errors.push('metadata must be an object');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate plot configuration
 * @param {Object} plotConfig - Plot configuration to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePlotConfig(plotConfig) {
  const errors = [];
  
  if (!plotConfig) {
    errors.push('Plot config is null or undefined');
    return { valid: false, errors };
  }
  
  // Check required fields
  if (!plotConfig.data) {
    errors.push('Missing required field: data');
  }
  
  if (!plotConfig.layout) {
    errors.push('Missing required field: layout');
  }
  
  // Validate data is array
  if (plotConfig.data && !Array.isArray(plotConfig.data)) {
    errors.push('data must be an array');
  }
  
  // Validate layout is object
  if (plotConfig.layout && typeof plotConfig.layout !== 'object') {
    errors.push('layout must be an object');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate numeric parameter
 * @param {any} value - Value to validate
 * @param {Object} range - Range constraints { min, max, unit }
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateNumber(value, range) {
  if (value === undefined || value === null) {
    return { valid: false, error: 'Value is null or undefined' };
  }
  
  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return { valid: false, error: 'Value is not a number' };
  }
  
  if (range) {
    if (numValue < range.min || numValue > range.max) {
      return { 
        valid: false, 
        error: `Value ${numValue}${range.unit || ''} outside range [${range.min}, ${range.max}${range.unit || ''}]`
      };
    }
  }
  
  return { valid: true, error: null };
}

/**
 * Validate string parameter
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options { minLength, maxLength, allowedValues }
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateString(value, options = {}) {
  if (value === undefined || value === null) {
    return { valid: false, error: 'Value is null or undefined' };
  }
  
  if (typeof value !== 'string') {
    return { valid: false, error: 'Value is not a string' };
  }
  
  if (options.minLength && value.length < options.minLength) {
    return { valid: false, error: `String length < ${options.minLength}` };
  }
  
  if (options.maxLength && value.length > options.maxLength) {
    return { valid: false, error: `String length > ${options.maxLength}` };
  }
  
  if (options.allowedValues && !options.allowedValues.includes(value)) {
    return { valid: false, error: `Value not in allowed values: ${options.allowedValues.join(', ')}` };
  }
  
  return { valid: true, error: null };
}

/**
 * Validate array parameter
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options { minLength, maxLength, itemValidator }
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateArray(value, options = {}) {
  if (value === undefined || value === null) {
    return { valid: false, error: 'Value is null or undefined' };
  }
  
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Value is not an array' };
  }
  
  if (options.minLength && value.length < options.minLength) {
    return { valid: false, error: `Array length < ${options.minLength}` };
  }
  
  if (options.maxLength && value.length > options.maxLength) {
    return { valid: false, error: `Array length > ${options.maxLength}` };
  }
  
  // Validate each item if validator provided
  if (options.itemValidator) {
    for (let i = 0; i < value.length; i++) {
      const itemResult = options.itemValidator(value[i]);
      if (!itemResult.valid) {
        return { valid: false, error: `Item ${i} invalid: ${itemResult.error}` };
      }
    }
  }
  
  return { valid: true, error: null };
}

/**
 * Validate complete simulation request
 * @param {Object} request - Simulation request to validate
 * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateSimulationRequest(request) {
  const errors = [];
  const warnings = [];
  
  if (!request) {
    errors.push('Request is null or undefined');
    return { valid: false, errors, warnings };
  }
  
  // Validate domain
  if (!request.domain) {
    errors.push('Missing required field: domain');
  }
  
  // Validate system_type
  if (!request.system_type) {
    errors.push('Missing required field: system_type');
  }
  
  // Validate parameters
  if (request.parameters) {
    const paramValidation = validateParameters(request.domain, request.system_type, request.parameters);
    errors.push(...paramValidation.errors);
    warnings.push(...paramValidation.warnings);
  }
  
  // Validate input_file if present
  if (request.input_file) {
    const inputFileValidation = validateInputFile(request.input_file);
    errors.push(...inputFileValidation.errors);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Sanitize user input to prevent injection attacks
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}
