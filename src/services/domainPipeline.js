/**
 * Domain Pipeline - SINGLE Orchestrator for All Domains
 * Main entry point for all domain operations
 * Replaces fragmented domain-specific logic
 */

import { askEngineeringBrain } from './aiOrchestrator';
import { validateParameters, validateSimulationRequest } from './dataValidator';
import { generatePlotFromBackendResult, generateAllPlotsFromBackendResult } from './plotFactory';
import { runSolverWithBackend } from './solvers';

// Domain services — Circuits only
import { getSolverName as getCircuitsSolver, getDefaultParameters as getCircuitsDefaults } from './domains/circuits/validator';
import { generateNetlist as generateCircuitsInput } from './domains/circuits/netlister';
import { parseBackendResult as parseCircuitsResult } from './domains/circuits/outputParser';
import { generateCircuitSchematic } from './domains/circuits/schematicGenerator';

/**
 * Get domain configuration
 * @param {string} domain - Domain name
 * @returns {Object} - Domain configuration
 */
function getDomainConfig(domain) {
  const configs = {
    'Circuits': {
      solver: getCircuitsSolver(),
      getDefaults: getCircuitsDefaults,
      generateInput: generateCircuitsInput,
      parseResult: parseCircuitsResult,
      generateSchematic: generateCircuitSchematic
    }
  };
  
  return configs[domain];
}

/**
 * Process user question through complete pipeline
 * @param {string} question - User's question
 * @param {Object} options - Processing options
 * @returns {Object} - Pipeline result
 */
export async function processQuestion(question, options = {}) {
  const { provider = 'openai', useAI = true } = options;
  
  try {
    // Step 1: Classify domain
    const classification = await askEngineeringBrain('classify', { question });
    
    if (!classification.domain || classification.domain === 'Unknown') {
      return {
        success: false,
        error: 'Could not classify domain from question',
        classification
      };
    }
    
    // Step 2: Get domain configuration
    const domainConfig = getDomainConfig(classification.domain);
    if (!domainConfig) {
      return {
        success: false,
        error: `Unknown domain: ${classification.domain}`,
        classification
      };
    }
    
    // Step 3: Get default parameters
    const defaults = domainConfig.getDefaults(classification.systemType);
    
    // Step 4: Extract parameters (with AI if enabled)
    let parameters = defaults;
    let extractionInfo = null;
    
    if (useAI) {
      extractionInfo = await askEngineeringBrain('extract', {
        question,
        domain: classification.domain,
        systemType: classification.systemType,
        defaults
      });
      parameters = extractionInfo.extracted;
    }
    
    // Step 5: Validate parameters
    const validation = validateParameters(
      classification.domain,
      classification.systemType,
      parameters
    );
    
    if (!validation.valid) {
      return {
        success: false,
        error: 'Parameter validation failed',
        validation,
        classification,
        parameters
      };
    }
    
    // Step 6: Generate input file
    const inputContent = domainConfig.generateInput(classification.systemType, parameters);
    
    const inputFile = {
      filename: `${classification.systemType.toLowerCase().replace(/\s+/g, '_')}.input`,
      content: inputContent,
      metadata: {
        system_type: classification.systemType,
        domain: classification.domain,
        generated_by: 'template'
      }
    };
    
    return {
      success: true,
      classification,
      parameters,
      validation,
      inputFile,
      extractionInfo,
      warnings: validation.warnings
    };
    
  } catch (error) {
    console.error('[Domain Pipeline] Process question error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Run simulation for a domain
 * @param {string} domain - Domain name
 * @param {string} systemType - System type
 * @param {Object} parameters - Simulation parameters
 * @param {Object} inputFile - Input file object
 * @returns {Object} - Simulation result
 */
export async function runSimulation(domain, systemType, parameters, inputFile) {
  try {
    const domainConfig = getDomainConfig(domain);
    if (!domainConfig) {
      return {
        success: false,
        error: `Unknown domain: ${domain}`
      };
    }
    
    // Run solver via backend
    // Pass domain name to backend, not solver name
    const onProgress = (stage, percent, elapsed) => {
      console.log(`[Domain Pipeline] Progress: ${stage} - ${percent}%`);
    };
    
    const solverResult = await runSolverWithBackend(
      domain,
      inputFile,
      onProgress
    );
    
    if (!solverResult) {
      return {
        success: false,
        error: 'Solver returned no result'
      };
    }
    
    // Parse result using domain-specific parser
    const parsedResult = domainConfig.parseResult(solverResult);
    
    return {
      success: true,
      solverResult,
      parsedResult,
      domain,
      systemType
    };
    
  } catch (error) {
    console.error('[Domain Pipeline] Run simulation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate plots from simulation result
 * @param {Object} simulationResult - Simulation result from runSimulation
 * @returns {Object} - Plot configurations
 */
export function generatePlots(simulationResult) {
  if (!simulationResult || !simulationResult.parsedResult) {
    return {
      success: false,
      error: 'Invalid simulation result'
    };
  }
  
  try {
    const domain = simulationResult.domain;
    const parsedResult = simulationResult.parsedResult;
    
    // Add domain to parsed result for plot factory
    const resultWithDomain = {
      ...parsedResult,
      domain
    };
    
    // Generate primary plot
    const primaryPlot = generatePlotFromBackendResult(resultWithDomain);
    
    // Generate all plots
    const allPlots = generateAllPlotsFromBackendResult(resultWithDomain);
    
    return {
      success: true,
      primaryPlot,
      allPlots,
      visualizationType: parsedResult.visualization_type
    };
    
  } catch (error) {
    console.error('[Domain Pipeline] Generate plots error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate schematic from system type and parameters
 * @param {string} domain - Domain name
 * @param {string} systemType - System type
 * @param {Object} parameters - System parameters
 * @returns {Object} - Schematic SVG string
 */
export function generateSchematic(domain, systemType, parameters) {
  const domainConfig = getDomainConfig(domain);
  if (!domainConfig || !domainConfig.generateSchematic) {
    return {
      success: false,
      error: `No schematic generator for domain: ${domain}`
    };
  }
  
  try {
    const schematicSVG = domainConfig.generateSchematic(systemType, parameters);
    
    return {
      success: true,
      schematic: schematicSVG,
      domain,
      systemType
    };
    
  } catch (error) {
    console.error('[Domain Pipeline] Generate schematic error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Complete pipeline: classify -> extract -> validate -> simulate -> plot
 * @param {string} question - User's question
 * @param {Object} options - Pipeline options
 * @returns {Object} - Complete pipeline result
 */
export async function executeFullPipeline(question, options = {}) {
  const { provider = 'openai', useAI = true, runSolver = true } = options;
  
  try {
    // Step 1-5: Process question (classify, extract, validate, generate input)
    const processingResult = await processQuestion(question, { provider, useAI });
    
    if (!processingResult.success) {
      return {
        success: false,
        error: processingResult.error,
        stage: 'processing',
        ...processingResult
      };
    }
    
    // Step 6: Run simulation (if enabled)
    let simulationResult = null;
    if (runSolver) {
      simulationResult = await runSimulation(
        processingResult.classification.domain,
        processingResult.classification.systemType,
        processingResult.parameters,
        processingResult.inputFile
      );
      
      if (!simulationResult.success) {
        return {
          success: false,
          error: simulationResult.error,
          stage: 'simulation',
          processingResult
        };
      }
    }
    
    // Step 7: Generate plots (if simulation ran)
    let plotResult = null;
    if (simulationResult && simulationResult.success) {
      plotResult = generatePlots(simulationResult);
    }
    
    return {
      success: true,
      processingResult,
      simulationResult,
      plotResult
    };
    
  } catch (error) {
    console.error('[Domain Pipeline] Full pipeline error:', error);
    return {
      success: false,
      error: error.message,
      stage: 'pipeline'
    };
  }
}

/**
 * Get supported domains
 * @returns {string[]} - List of supported domains
 */
export function getSupportedDomains() {
  return ['Circuits'];
}

/**
 * Get domain info
 * @param {string} domain - Domain name
 * @returns {Object} - Domain information
 */
export function getDomainInfo(domain) {
  const config = getDomainConfig(domain);
  if (!config) {
    return null;
  }
  
  return {
    domain,
    solver: config.solver,
    description: `${domain} simulation using ${config.solver}`
  };
}

/**
 * Validate complete pipeline request
 * @param {Object} request - Pipeline request
 * @returns {Object} - Validation result
 */
export function validatePipelineRequest(request) {
  return validateSimulationRequest(request);
}
