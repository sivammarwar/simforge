/**
 * aiModelExtractor.js - Pure AI-Powered Natural Language to Model Extraction
 * 
 * This service replaces ALL regex-based parameter extraction with pure AI extraction.
 * The AI understands context, detects implicit requirements, flags trade-offs, and returns
 * structured models matching DEFAULT_MODELS format with confidence scoring.
 * 
 * NO REGEX FALLBACK - AI is the ONLY extraction path.
 */

import { chatWithEngineeringBrain } from './llmClient.js';

/**
 * Extract engineering model from natural language using AI
 * 
 * @param {string} promptText - User's natural language question
 * @param {string} domain - Detected domain (e.g., 'Circuits', 'Structural')
 * @param {object} DEFAULT_MODELS - Default model schemas from App.jsx
 * @param {string} provider - AI provider (default: 'groq')
 * @returns {object} Extracted model with confidence scores
 */
export async function extractModelWithAI(promptText, domain, DEFAULT_MODELS, provider = 'groq') {
  // Get the schema for this domain
  const domainSchema = DEFAULT_MODELS[domain];
  if (!domainSchema) {
    throw new Error(`Unknown domain: ${domain}. Available domains: ${Object.keys(DEFAULT_MODELS).join(', ')}`);
  }

  // Build the extraction prompt with complete schema
  const extractionPrompt = buildExtractionPrompt(promptText, domain, domainSchema);

  // Call AI with the extraction prompt
  const aiResponse = await chatWithEngineeringBrain({
    message: extractionPrompt,
    domain,
    provider,
    conversationHistory: []
  });

  if (!aiResponse.success) {
    throw new Error(`AI extraction failed: ${aiResponse.error}`);
  }

  // Parse AI response into structured model
  const extractedModel = parseAIResponse(aiResponse.content, domain, domainSchema);

  return extractedModel;
}

/**
 * Build extraction prompt with complete schema context
 */
function buildExtractionPrompt(promptText, domain, schema) {
  // Convert schema to readable format for AI
  const schemaDescription = formatSchemaForAI(domain, schema);

  return `You are an expert engineering parameter extraction system. Your task is to extract engineering parameters from natural language and return them in a structured JSON format matching the provided schema.

USER QUESTION: "${promptText}"

DOMAIN: ${domain}

SCHEMA STRUCTURE:
${schemaDescription}

INSTRUCTIONS:
1. Extract ALL parameters mentioned in the user's question
2. Identify implicit requirements based on context (e.g., "battery-powered" = efficiency priority, "small board" = size priority)
3. Detect missing critical parameters and suggest reasonable defaults with explanations
4. Flag trade-offs when multiple valid interpretations exist
5. Assign confidence scores (0.0-1.0) to each extracted parameter based on how explicitly it was stated
6. Return the result in this exact JSON format:

{
  "domain": "${domain}",
  "system_type": "extracted system type or null",
  "extracted_fields": [
    {
      "section": "section name from schema",
      "field": "field name from schema",
      "value": "extracted value with unit",
      "confidence": 0.95,
      "source": "explicit | implicit | default",
      "explanation": "brief explanation if implicit or default"
    }
  ],
  "missing_critical_fields": [
    {
      "section": "section name",
      "field": "field name",
      "suggested_default": "value with unit",
      "reason": "why this default is reasonable"
    }
  ],
  "detected_trade_offs": [
    {
      "description": "trade-off description",
      "options": ["option 1", "option 2"],
      "recommendation": "recommended option with reason"
    }
  ]
}

IMPORTANT:
- Match field names EXACTLY as they appear in the schema
- Include units in values (e.g., "12 V", "2 A", "500 mm")
- Confidence scores: 1.0 = explicitly stated, 0.8 = strongly implied, 0.5 = reasonable inference, 0.3 = weak inference
- If a parameter is not mentioned and not critical, don't include it in extracted_fields
- For missing critical parameters, provide engineering-justified defaults
- Consider the engineering context when suggesting defaults`;
}

/**
 * Format schema for AI consumption
 */
function formatSchemaForAI(domain, schema) {
  let description = '';
  
  Object.entries(schema).forEach(([section, fields]) => {
    if (typeof fields !== 'object' || Array.isArray(fields)) return;
    
    description += `\nSECTION: ${section}\n`;
    Object.entries(fields).forEach(([fieldName, fieldData]) => {
      const value = fieldData?.value;
      const explanation = fieldData?.explanation;
      const tag = fieldData?.tag;
      
      description += `  - ${fieldName}: `;
      if (value !== null && value !== undefined) {
        description += `default="${value}" `;
      }
      if (tag) {
        description += `[${tag}] `;
      }
      if (explanation) {
        description += `(${explanation})`;
      }
      description += '\n';
    });
  });
  
  return description;
}

/**
 * Parse AI response into structured model
 */
function parseAIResponse(aiContent, domain, schema) {
  try {
    // Extract JSON from AI response (AI might wrap it in markdown)
    const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                     aiContent.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }
    
    const jsonString = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonString);
    
    // Validate structure
    if (!parsed.extracted_fields || !Array.isArray(parsed.extracted_fields)) {
      throw new Error('AI response missing extracted_fields array');
    }
    
    // Convert extracted fields to model format matching DEFAULT_MODELS
    const model = {};
    
    // Initialize model with schema structure
    Object.keys(schema).forEach(section => {
      if (typeof schema[section] !== 'object' || Array.isArray(schema[section])) return;
      model[section] = {};
      
      Object.keys(schema[section]).forEach(fieldName => {
        const fieldData = schema[section][fieldName];
        model[section][fieldName] = fieldData ? { ...fieldData } : { value: null, tag: null };
      });
    });
    
    // Apply extracted values
    parsed.extracted_fields.forEach(extraction => {
      const { section, field, value, confidence, source, explanation } = extraction;
      
      if (model[section] && model[section][field] !== undefined) {
        model[section][field] = {
          value: value,
          tag: source === 'explicit' ? 'stated' : source === 'implicit' ? 'inferred' : 'default',
          explanation: explanation,
          confidence: confidence
        };
      }
    });
    
    // Add system type if detected
    if (parsed.system_type) {
      model.SYSTEM_TYPE = parsed.system_type;
    }
    
    // Add metadata about extraction
    model._extraction_metadata = {
      domain: parsed.domain || domain,
      missing_critical_fields: parsed.missing_critical_fields || [],
      detected_trade_offs: parsed.detected_trade_offs || [],
      extraction_confidence: calculateOverallConfidence(parsed.extracted_fields)
    };
    
    return model;
    
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    throw new Error(`Failed to parse AI extraction response: ${error.message}`);
  }
}

/**
 * Calculate overall extraction confidence
 */
function calculateOverallConfidence(extractedFields) {
  if (!extractedFields || extractedFields.length === 0) return 0;
  
  const sum = extractedFields.reduce((acc, field) => acc + (field.confidence || 0), 0);
  return sum / extractedFields.length;
}

/**
 * Validate extracted model against schema requirements
 */
export function validateExtractedModel(model, domain, DEFAULT_MODELS) {
  const schema = DEFAULT_MODELS[domain];
  if (!schema) {
    return { valid: false, errors: [`Unknown domain: ${domain}`] };
  }
  
  const errors = [];
  const warnings = [];
  
  // Check for null critical fields
  Object.entries(schema).forEach(([section, fields]) => {
    if (typeof fields !== 'object' || Array.isArray(fields)) return;
    
    Object.entries(fields).forEach(([fieldName, fieldData]) => {
      const tag = fieldData?.tag;
      const isCritical = tag === 'confirmed' || tag === 'stated';
      
      if (isCritical && (!model[section] || model[section][fieldName]?.value === null)) {
        errors.push(`Missing critical field: ${section}.${fieldName}`);
      }
      
      const confidence = model[section]?.[fieldName]?.confidence;
      if (confidence !== undefined && confidence < 0.5) {
        warnings.push(`Low confidence extraction for ${section}.${fieldName}: ${confidence}`);
      }
    });
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
