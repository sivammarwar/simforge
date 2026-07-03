/**
 * AI Parameter Tuner
 * AI-powered parameter dependency understanding and live parameter tuning
 * Replaces regex-based parameter extraction with AI-native approach
 */

import { chatWithEngineeringBrain } from './llmClient.js';

/**
 * Build AI prompt for parameter dependency analysis
 */
function buildDependencyPrompt(model, domain) {
  const modelStr = JSON.stringify(model, null, 2);
  
  return `You are an engineering expert. Analyze the following ${domain} simulation model and identify parameter dependencies.

Model:
${modelStr}

Return a JSON object with this structure:
{
  "dependencies": [
    {
      "parameter": "parameter_name",
      "section": "section_name",
      "affects": ["affected_param_1", "affected_param_2"],
      "sensitivity": "high|medium|low",
      "description": "Brief description of the dependency"
    }
  ],
  "critical_parameters": ["param_1", "param_2"],
  "recommended_ranges": {
    "param_name": {"min": value, "max": value, "optimal": value}
  }
}

Focus on physical relationships (e.g., stress depends on load and geometry, lift depends on angle of attack and airspeed).`;
}

/**
 * Build AI prompt for parameter update extraction
 */
function buildUpdatePrompt(promptText, model, domain, dependencies = []) {
  const modelStr = JSON.stringify(model, null, 2);
  const depsStr = JSON.stringify(dependencies, null, 2);
  
  return `You are an engineering assistant. The user wants to update simulation parameters based on this request: "${promptText}"

Current model:
${modelStr}

Known parameter dependencies:
${depsStr}

Extract the parameter updates. Return a JSON object with this structure:
{
  "updates": [
    {
      "section": "section_name",
      "fieldName": "field_name",
      "value": "new_value",
      "confidence": 0.95,
      "reasoning": "Brief explanation"
    }
  ],
  "cascading_updates": [
    {
      "section": "section_name",
      "fieldName": "field_name",
      "suggested_value": "value",
      "reason": "Due to dependency on X"
    }
  ]
}

Only extract parameters explicitly mentioned or clearly implied. Do not hallucinate values.`;
}

/**
 * Parse AI response for dependencies
 */
function parseDependencyResponse(aiResponse) {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        dependencies: parsed.dependencies || [],
        critical_parameters: parsed.critical_parameters || [],
        recommended_ranges: parsed.recommended_ranges || {}
      };
    }
  } catch (e) {
    console.error('[aiParameterTuner] Failed to parse dependency response:', e);
  }
  return { dependencies: [], critical_parameters: [], recommended_ranges: {} };
}

/**
 * Parse AI response for parameter updates
 */
function parseUpdateResponse(aiResponse) {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        updates: parsed.updates || [],
        cascading_updates: parsed.cascading_updates || []
      };
    }
  } catch (e) {
    console.error('[aiParameterTuner] Failed to parse update response:', e);
  }
  return { updates: [], cascading_updates: [] };
}

/**
 * Analyze parameter dependencies using AI
 */
export async function analyzeParameterDependencies(model, domain, provider = 'groq') {
  try {
    const prompt = buildDependencyPrompt(model, domain);
    const response = await chatWithEngineeringBrain(prompt, provider);
    
    if (response && response.content) {
      return parseDependencyResponse(response.content);
    }
  } catch (e) {
    console.error('[aiParameterTuner] Error analyzing dependencies:', e);
  }
  
  return { dependencies: [], critical_parameters: [], recommended_ranges: {} };
}

/**
 * Extract parameter updates using AI with dependency awareness
 */
export async function extractParameterUpdates(promptText, model, domain, dependencies = [], provider = 'groq') {
  try {
    const prompt = buildUpdatePrompt(promptText, model, domain, dependencies);
    const response = await chatWithEngineeringBrain(prompt, provider);
    
    if (response && response.content) {
      return parseUpdateResponse(response.content);
    }
  } catch (e) {
    console.error('[aiParameterTuner] Error extracting updates:', e);
  }
  
  return { updates: [], cascading_updates: [] };
}

/**
 * Apply parameter updates with cascading suggestions
 */
export function applyParameterUpdates(model, updates, cascadingUpdates = [], tag = 'edited') {
  const next = JSON.parse(JSON.stringify(model || {}));
  
  // Apply direct updates
  updates.forEach(update => {
    if (!next[update.section]) next[update.section] = {};
    next[update.section][update.fieldName] = {
      ...(next[update.section][update.fieldName] || {}),
      value: update.value,
      tag,
      confidence: update.confidence,
      reasoning: update.reasoning
    };
  });
  
  // Apply cascading updates as suggestions (different tag)
  cascadingUpdates.forEach(update => {
    if (!next[update.section]) next[update.section] = {};
    next[update.section][update.fieldName] = {
      ...(next[update.section][update.fieldName] || {}),
      value: update.suggested_value,
      tag: 'suggested',
      reason: update.reason
    };
  });
  
  return next;
}

/**
 * Validate parameter values against recommended ranges
 */
export function validateParameters(model, recommendedRanges) {
  const warnings = [];
  
  Object.entries(recommendedRanges || {}).forEach(([paramPath, range]) => {
    const [section, fieldName] = paramPath.split('.');
    if (model[section] && model[section][fieldName]) {
      const value = parseFloat(model[section][fieldName].value);
      if (!isNaN(value)) {
        if (range.min !== undefined && value < range.min) {
          warnings.push({
            parameter: paramPath,
            value,
            issue: 'below minimum',
            min: range.min,
            message: `${paramPath} is ${value}, below recommended minimum of ${range.min}`
          });
        }
        if (range.max !== undefined && value > range.max) {
          warnings.push({
            parameter: paramPath,
            value,
            issue: 'above maximum',
            max: range.max,
            message: `${paramPath} is ${value}, above recommended maximum of ${range.max}`
          });
        }
      }
    }
  });
  
  return warnings;
}

/**
 * Get tuning suggestions based on current model state
 */
export async function getTuningSuggestions(model, domain, targetMetric, provider = 'groq') {
  const modelStr = JSON.stringify(model, null, 2);
  
  const prompt = `You are an engineering optimization expert. Analyze this ${domain} simulation model and suggest parameter adjustments to optimize: "${targetMetric}"

Current model:
${modelStr}

Return a JSON object with this structure:
{
  "suggestions": [
    {
      "section": "section_name",
      "fieldName": "field_name",
      "current_value": "current",
      "suggested_value": "suggested",
      "expected_impact": "description of expected change",
      "confidence": 0.85
    }
  ]
}

Consider physical constraints and realistic ranges. Focus on parameters that have high impact on the target metric.`;

  try {
    const response = await chatWithEngineeringBrain(prompt, provider);
    if (response && response.content) {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.suggestions || [];
      }
    }
  } catch (e) {
    console.error('[aiParameterTuner] Error getting tuning suggestions:', e);
  }
  
  return [];
}
