/**
 * AI Orchestrator - SINGLE AI Entry Point
 * Consolidates all AI interactions into one unified interface
 * Replaces fragmented AI entry points (aiLayers, unifiedBrain, aiModelExtractor, etc.)
 */

import { callAI } from './llmClient';

// Circuits-only classifier
import { classifyCircuit } from './domains/circuits/classifier';

/**
 * Classify domain from user question
 * @param {string} question - User's question
 * @returns {Object} - { domain: string, systemType: string, confidence: number, solver: string }
 */
export function classifyDomain(question) {
  // Circuits-only classification
  const result = classifyCircuit(question);
  if (result.isCircuit) {
    return {
      domain: 'Circuits',
      systemType: result.circuitType || result.systemType,
      confidence: result.confidence,
      solver: result.getSolverName ? result.getSolverName() : null
    };
  }
  return { domain: 'Unknown', systemType: 'Unknown', confidence: 0, solver: null };
}

/**
 * Extract parameters from user question using AI
 * @param {string} question - User's question
 * @param {string} domain - Classified domain
 * @param {string} systemType - Classified system type
 * @param {Object} defaults - Default parameters for the system type
 * @param {string} provider - AI provider to use
 * @returns {Object} - { extracted: Object, missing: string[], synthetic: string[] }
 */
export async function extractParametersWithAI(question, domain, systemType, defaults, provider = 'openai') {
  const context = {
    domain,
    systemType,
    defaults,
    question
  };
  
  const prompt = `Extract engineering parameters from this question for a ${domain} simulation (${systemType}).

Question: ${question}

Available parameters with defaults:
${JSON.stringify(defaults, null, 2)}

Return a JSON object with:
1. "extracted": parameters found in the question
2. "missing": parameters not found (will use defaults)
3. "assumptions": any assumptions made

Only return valid JSON, no markdown.`;
  
  try {
    const response = await callAI(provider, prompt, context);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const responseText = response.content || '';
    
    // Parse JSON response
    let result = null;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
    
    if (!result) {
      // Fallback: return all as missing
      return {
        extracted: {},
        missing: Object.keys(defaults),
        assumptions: []
      };
    }
    
    // Merge with defaults
    const finalParams = { ...defaults, ...result.extracted };
    
    return {
      extracted: finalParams,
      missing: result.missing || [],
      assumptions: result.assumptions || []
    };
    
  } catch (error) {
    console.error('[AI Orchestrator] Parameter extraction error:', error);
    // Fallback to defaults
    return {
      extracted: defaults,
      missing: [],
      assumptions: ['Using all defaults due to AI error']
    };
  }
}

/**
 * Generate input file using AI (for complex cases)
 * @param {string} question - User's question
 * @param {string} domain - Classified domain
 * @param {string} systemType - Classified system type
 * @param {Object} parameters - Extracted parameters
 * @param {string} provider - AI provider to use
 * @returns {Object} - { filename: string, content: string, metadata: Object }
 */
export async function generateInputFileWithAI(question, domain, systemType, parameters, provider = 'openai') {
  const context = {
    domain,
    systemType,
    parameters,
    question
  };
  
  const prompt = `Generate a complete solver input file for ${domain} simulation (${systemType}).

Question: ${question}

Parameters:
${JSON.stringify(parameters, null, 2)}

Return a JSON object with:
1. "filename": appropriate filename with extension
2. "content": complete input file content
3. "metadata": { system_type, generated_by: "ai" }

Only return valid JSON, no markdown.`;
  
  try {
    const response = await callAI(provider, prompt, context);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const responseText = response.content || '';
    
    // Parse JSON response
    let result = null;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
    
    if (!result) {
      throw new Error('AI did not return valid JSON');
    }
    
    return result;
    
  } catch (error) {
    console.error('[AI Orchestrator] Input file generation error:', error);
    throw error;
  }
}

/**
 * Make engineering decision using AI
 * @param {string} question - User's question
 * @param {string} domain - Classified domain
 * @param {Object} context - Additional context
 * @param {string} provider - AI provider to use
 * @returns {Object} - AI decision object
 */
export async function makeEngineeringDecision(question, domain, context = {}, provider = 'openai') {
  const prompt = `You are an engineering AI assistant. Analyze this request and provide a decision.

Question: ${question}
Domain: ${domain}

Context:
${JSON.stringify(context, null, 2)}

Return a JSON object with:
1. "action": recommended action (simulate, analyze, optimize, etc.)
2. "confidence": your confidence (0-1)
3. "reasoning": brief explanation
4. "suggested_parameters": any parameters you suggest

Only return valid JSON, no markdown.`;
  
  try {
    const response = await callAI(provider, prompt, context);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const responseText = response.content || '';
    
    // Parse JSON response
    let result = null;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
    
    return result || { action: 'simulate', confidence: 0.5, reasoning: 'Default action' };
    
  } catch (error) {
    console.error('[AI Orchestrator] Decision error:', error);
    return { action: 'simulate', confidence: 0.5, reasoning: 'Default action due to error' };
  }
}

/**
 * Main entry point for AI interactions
 * @param {string} task - Task type ('classify', 'extract', 'generate', 'decide')
 * @param {Object} params - Task parameters
 * @param {string} provider - AI provider
 * @returns {Object} - AI response
 */
export async function askEngineeringBrain(task, params, provider = 'openai') {
  switch (task) {
    case 'classify':
      return classifyDomain(params.question);
    
    case 'extract':
      return extractParametersWithAI(
        params.question,
        params.domain,
        params.systemType,
        params.defaults,
        provider
      );
    
    case 'generate':
      return generateInputFileWithAI(
        params.question,
        params.domain,
        params.systemType,
        params.parameters,
        provider
      );
    
    case 'decide':
      return makeEngineeringDecision(
        params.question,
        params.domain,
        params.context,
        provider
      );
    
    default:
      throw new Error(`Unknown AI task: ${task}`);
  }
}
