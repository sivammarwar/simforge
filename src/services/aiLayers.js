/**
 * AI LAYERS FOR REVISED 13-LAYER SIMFORGE FLOW
 * 
 * This module implements AI validation and reasoning layers that:
 * - Parse and semantify user questions before modeling
 * - Validate model-question alignment before solver execution
 * - Check physical plausibility of parameters and results
 * - Validate solver outputs before showing to users
 * - Generate natural language explanations for results
 * 
 * Uses Claude/Groq API for engineering reasoning.
 */

// AI PROVIDER CONFIGURATION
const AI_PROVIDERS = {
  claude: {
    baseUrl: '/ai/claude/messages',
    model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(import.meta.env.VITE_CLAUDE_MAX_TOKENS || '4096')
  },
  groq: {
    baseUrl: '/ai/groq/chat/completions',
    model: import.meta.env.VITE_GROQ_MODEL || 'llama-3.1-70b-versatile',
    maxTokens: parseInt(import.meta.env.VITE_GROQ_MAX_TOKENS || '2048') // Reduced to avoid rate limits
  },
  gemini: {
    baseUrl: '/ai/gemini/models',
    model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash',
    maxTokens: parseInt(import.meta.env.VITE_GEMINI_MAX_TOKENS || '4096'),
    project: import.meta.env.VITE_GEMINI_PROJECT || 'projects/626060914061'
  },
  cerebras: {
    baseUrl: '/ai/cerebras/chat/completions',
    model: import.meta.env.VITE_CEREBRAS_MODEL || 'gpt-oss-120b',
    maxTokens: parseInt(import.meta.env.VITE_CEREBRAS_MAX_TOKENS || '4096')
  }
};

/**
 * Generic AI API caller
 * @param {string} provider - 'claude' or 'groq'
 * @param {string|Array} systemPromptOrMessages - System prompt (old) or messages array (new)
 * @param {string} userPrompt - User prompt/question (old convention only)
 * @param {object} options - Additional options (temperature, tools, etc.)
 * @returns {Promise<object>} - AI response with parsed content or tool_calls
 */
export async function callAI(provider, systemPromptOrMessages, userPrompt, options = {}) {
  const config = AI_PROVIDERS[provider] || AI_PROVIDERS.groq;
  
  let apiKey;
  
  if (provider === 'groq') {
    apiKey = localStorage.getItem('groq_api_key') || import.meta.env.VITE_GROQ_API_KEY;
  } else if (provider === 'gemini') {
    // Use single key for Gemini
    apiKey = localStorage.getItem('gemini_api_key') || 
             import.meta.env.VITE_GEMINI_API_KEY;
  } else if (provider === 'cerebras') {
    // Use single key for Cerebras
    apiKey = localStorage.getItem('cerebras_api_key') || 
             import.meta.env.VITE_CEREBRAS_API_KEY;
  } else {
    // Use single key for Claude
    apiKey = localStorage.getItem(`${provider}_api_key`) || 
             import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`];
  }
  
  if (!apiKey) {
    console.warn(`${provider} API key not found. Using fallback logic.`);
    return { error: 'API_KEY_MISSING', fallback: true };
  }

  // Detect new vs old calling convention
  const isMultiTurn = Array.isArray(systemPromptOrMessages);
  
  let messages;
  let systemPrompt;
  
  if (isMultiTurn) {
    // New convention: first arg is messages array
    messages = systemPromptOrMessages;
    systemPrompt = null;
  } else {
    // Old convention: separate system + user strings
    systemPrompt = systemPromptOrMessages;
    messages = [{ role: 'user', content: userPrompt }];
  }

  const tools = options.tools || null;
  const includeTools = options.includeTools !== false; // Default to true

  try {
    // Get API key
    if (provider === 'groq') {
      apiKey = localStorage.getItem('groq_api_key') || import.meta.env.VITE_GROQ_API_KEY;
    } else if (provider === 'gemini') {
      apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY;
    } else if (provider === 'cerebras') {
      apiKey = localStorage.getItem('cerebras_api_key') || import.meta.env.VITE_CEREBRAS_API_KEY;
    } else {
      apiKey = localStorage.getItem(`${provider}_api_key`) || import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`];
    }
    
    if (!apiKey) {
      return { error: 'API_KEY_MISSING', fallback: true };
    }

    if (provider === 'claude') {
        const body = {
          model: config.model,
          max_tokens: config.maxTokens,
          messages: messages.filter(m => m.role !== 'system'),
          temperature: options.temperature || 0.3
        };
        
        // Extract system messages
        const sysMessages = messages.filter(m => m.role === 'system');
        if (systemPrompt || sysMessages.length > 0) {
          body.system = systemPrompt || sysMessages.map(m => m.content).join('\n\n');
        }
        
        if (tools && includeTools) body.tools = tools;
        
        const response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'x-api-key': apiKey, 
            'anthropic-version': '2023-06-01' 
          },
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        if (!data.content || !Array.isArray(data.content)) {
          console.error('Claude API response:', data);
          throw new Error('Invalid response format from Claude API');
        }

        // Handle tool_use blocks for Claude
        const toolUseBlocks = data.content.filter(block => block.type === 'tool_use');
        if (toolUseBlocks.length > 0) {
          return {
            tool_calls: toolUseBlocks.map(block => ({
              id: block.id,
              name: block.name,
              arguments: block.input
            })),
            usage: data.usage,
            model: data.model
          };
        }
        
        // Extract text content
        const textBlocks = data.content.filter(block => block.type === 'text');
        return { 
          content: textBlocks.length > 0 ? textBlocks[0].text : '',
          usage: data.usage, 
          model: data.model 
        };
      } else if (provider === 'groq') {
        // Groq — OpenAI-compatible
        const body = {
          model: config.model,
          messages: isMultiTurn ? messages : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: options.temperature || 0.3,
          max_tokens: config.maxTokens
        };
        
        if (tools && includeTools) {
          body.tools = tools.map(t => ({ 
            type: 'function', 
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }));
        }
        
        const response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}` 
          },
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        if (!data.choices || !data.choices[0]) {
          console.error('Groq API response:', data);
          throw new Error('Invalid response format from Groq API');
        }

        const choice = data.choices[0];
        
        // Return tool_calls if present
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          return {
            tool_calls: choice.message.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments)
            })),
            usage: data.usage
          };
        }
        
        return { 
          content: choice.message.content, 
          usage: data.usage,
          model: data.model
        };
        
      } else if (provider === 'gemini') {
        // Gemini API
        const body = {
          contents: isMultiTurn ? messages.map(m => {
            // Handle tool response messages (OpenAI format -> Gemini format)
            if (m.role === 'tool') {
              return {
                role: 'user',
                parts: [{
                  functionResponse: {
                    name: m.tool_name || 'unknown',
                    response: JSON.parse(m.content)
                  }
                }]
              };
            }
            // Handle assistant tool calls (convert to Gemini format)
            if (m.role === 'assistant' && m.tool_calls) {
              return {
                role: 'model',
                parts: m.tool_calls.map(tc => ({
                  functionCall: {
                    name: tc.function.name,
                    args: typeof tc.function.arguments === 'string' 
                      ? JSON.parse(tc.function.arguments) 
                      : tc.function.arguments
                  }
                }))
              };
            }
            // Regular messages
            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            };
          }) : [
            { role: 'user', parts: [{ text: userPrompt }] }
          ],
          generationConfig: {
            temperature: options.temperature || 0.3,
            maxOutputTokens: config.maxTokens
          }
        };
        
        if (tools) {
          body.tools = [{
            functionDeclarations: tools.map(t => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }))
          }];
        }
        
        const url = `${config.baseUrl}/${config.model}:generateContent`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.error) {
          console.error('Gemini API error:', data.error);
          throw new Error(data.error.message);
        }
        
        const candidate = data.candidates?.[0];
        if (!candidate) {
          console.error('No candidates in Gemini response:', data);
          throw new Error('No response from Gemini');
        }
        
        // Handle tool calls
        if (candidate.content?.functionCalls && candidate.content.functionCalls.length > 0) {
          return {
            tool_calls: candidate.content.functionCalls.map(fc => ({
              id: `call_${Date.now()}`,
              name: fc.name,
              arguments: fc.args
            })),
            usage: data.usageMetadata
          };
        }
        
        return { 
          content: candidate.content?.parts?.[0]?.text || '',
          usage: data.usageMetadata,
          model: config.model
        };
      }
      else if (provider === 'cerebras') {
        // Cerebras — OpenAI-compatible
        const body = {
          model: config.model,
          messages: isMultiTurn ? messages : [
            { role: 'user', content: userPrompt }
          ],
          temperature: options.temperature || 0.3,
          max_completion_tokens: config.maxTokens
        };
        
        // Add system message if provided (for both single and multi-turn)
        if (systemPrompt) {
          if (isMultiTurn) {
            // Check if system message already exists
            const hasSystem = messages.some(m => m.role === 'system');
            if (!hasSystem) {
              body.messages.unshift({ role: 'system', content: systemPrompt });
            }
          } else {
            body.messages.unshift({ role: 'system', content: systemPrompt });
          }
        }
        
        if (tools && includeTools) {
          body.tools = tools.map(t => ({ 
            type: 'function', 
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          }));
        }
        
        console.log('Cerebras request - tools present:', !!body.tools, 'message count:', body.messages.length);
        
        const response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}` 
          },
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        if (!data.choices || !data.choices[0]) {
          console.error('Cerebras API response:', data);
          throw new Error('Invalid response format from Cerebras API');
        }
        
        const choice = data.choices[0];
        
        // Return tool_calls if present
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          return {
            tool_calls: choice.message.tool_calls.map(tc => ({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments)
            })),
            usage: data.usage
          };
        }
        
        return { 
          content: choice.message.content, 
          usage: data.usage,
          model: data.model
        };
      }
    }
    catch (error) {
      return { error: error.message, provider };
    }
}

/**
 * AI LAYER 1B: QUESTION PARSER & SEMANTIFIER
 * 
 * Parses raw engineering questions into structured facts, extracts parameters,
 * flags ambiguities, identifies problem type, and catches contradictions.
 * 
 * @param {string} rawQuestion - The user's raw question
 * @param {string} domain - Detected engineering domain
 * @returns {Promise<object>} - Parsed question structure
 */
export async function parseAndSemantifyQuestion(rawQuestion, domain) {
  const systemPrompt = `You are an expert engineering question parser. Your job is to:
1. Extract ALL explicit parameters with their units from the question
2. Identify what is being asked (calculate, optimize, design, analyze, etc.)
3. Flag any ambiguities or missing information
4. Identify the problem type with high confidence
5. Catch contradictions (e.g., "frictionless" + friction coefficient)
6. Identify implicit assumptions

Return a JSON object with this structure:
{
  "parameters": [
    { "name": "parameter name", "value": "numeric value", "unit": "unit", "source": "explicit|implicit" }
  ],
  "what_is_asked": "what the question wants calculated/designed",
  "problem_type": "specific problem type (e.g., 'inclined plane motion', 'buck converter sizing')",
  "ambiguities": ["list of ambiguities or missing info"],
  "implicit_assumptions": ["list of assumptions not stated but needed"],
  "contradictions": ["list of contradictions found"],
  "confidence": 0.0-1.0,
  "canonical_form": "restated question in canonical engineering form"
}

Be precise. If a parameter is not mentioned, do NOT invent it. Mark source as "implicit" only if the problem cannot be solved without it.`;

  const userPrompt = `Parse this ${domain} engineering question and return structured JSON:

Question: "${rawQuestion}"

Domain: ${domain}

Extract all parameters, identify what's being asked, flag issues, and provide canonical form.`;

  const result = await callAI('groq', systemPrompt, userPrompt);
  
  if (result.error) {
    // Fallback: basic regex extraction
    return fallbackQuestionParser(rawQuestion, domain);
  }
  
  try {
    // Extract JSON from AI response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI response as JSON:', e);
  }
  
  return fallbackQuestionParser(rawQuestion, domain);
}

/**
 * Fallback question parser when AI is unavailable
 */
function fallbackQuestionParser(rawQuestion, domain) {
  const parameters = [];
  const lower = rawQuestion.toLowerCase();
  
  // Basic number+unit extraction
  const numberUnitPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Zµ°³²%]+)/g;
  let match;
  while ((match = numberUnitPattern.exec(rawQuestion)) !== null) {
    parameters.push({
      name: 'extracted_value',
      value: match[1],
      unit: match[2],
      source: 'explicit'
    });
  }
  
  return {
    parameters,
    what_is_asked: 'calculate unknown quantity',
    problem_type: 'general',
    ambiguities: ['AI parsing unavailable - using basic extraction'],
    implicit_assumptions: [],
    contradictions: [],
    confidence: 0.5,
    canonical_form: rawQuestion
  };
}

/**
 * AI LAYER 3B: MODEL-QUESTION ALIGNMENT CHECKER
 * 
 * Cross-checks the created model against the original question to ensure
 * every parameter is correctly represented and boundary conditions match.
 * 
 * @param {string} originalQuestion - The user's original question
 * @param {object} model - The structured engineering model
 * @param {object} parsedQuestion - Output from Layer 1B
 * @returns {Promise<object>} - Alignment check result
 */
export async function checkModelQuestionAlignment(originalQuestion, model, parsedQuestion, provider = 'groq') {
  const systemPrompt = `You are an expert engineering model validator. Your job is to:
1. Compare the original question with the structured model side-by-side
2. Verify EVERY parameter from the question is in the model correctly
3. Check that boundary conditions match the question description
4. Flag if the problem type changed (e.g., simply-supported → cantilever)
5. Validate that stated conditions like "frictionless" weren't changed to friction=0.2
6. Check that values match (e.g., 12V didn't become 24V)

Return a JSON object with this structure:
{
  "alignment_status": "MATCH" | "MISMATCH_DETECTED" | "REJECT",
  "mismatches": [
    {
      "field": "field name",
      "question_value": "value from question",
      "model_value": "value in model",
      "severity": "critical|warning|info",
      "explanation": "why this is a problem"
    }
  ],
  "missing_parameters": ["parameters in question but not in model"],
  "extra_parameters": ["parameters in model but not in question"],
  "boundary_condition_check": "PASS|FAIL",
  "problem_type_check": "PASS|FAIL",
  "confidence": 0.0-1.0,
  "recommendation": "what should be done"
}

Be strict. If the model doesn't faithfully represent the question, REJECT it.`;

  const userPrompt = `Check alignment between question and model:

Original Question: "${originalQuestion}"

Parsed Question Parameters: ${JSON.stringify(parsedQuestion.parameters, null, 2)}

Model Structure: ${JSON.stringify(model, null, 2)}

Verify that the model faithfully represents the question.`;

  // Use the selected provider
  let result = await callAI(provider, systemPrompt, userPrompt);
  if (result.error) {
    result = await callAI('claude', systemPrompt, userPrompt);
  }
  
  if (result.error) {
    // Fallback: basic field name matching
    return fallbackAlignmentCheck(parsedQuestion, model);
  }
  
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI alignment response:', e);
  }
  
  return fallbackAlignmentCheck(parsedQuestion, model);
}

/**
 * Fallback alignment check
 */
function fallbackAlignmentCheck(parsedQuestion, model) {
  const mismatches = [];
  const missing = [];
  const extra = [];
  
  // Basic check: do parameter counts match?
  const paramCount = parsedQuestion.parameters.length;
  const modelFieldCount = countModelFields(model);
  
  if (Math.abs(paramCount - modelFieldCount) > 2) {
    mismatches.push({
      field: 'parameter_count',
      question_value: paramCount.toString(),
      model_value: modelFieldCount.toString(),
      severity: 'warning',
      explanation: 'Parameter count mismatch - AI check unavailable'
    });
  }
  
  return {
    alignment_status: mismatches.length > 0 ? 'MISMATCH_DETECTED' : 'MATCH',
    mismatches,
    missing_parameters: missing,
    extra_parameters: extra,
    boundary_condition_check: 'PASS',
    problem_type_check: 'PASS',
    confidence: 0.6,
    recommendation: mismatches.length > 0 ? 'Review model manually' : 'Proceed'
  };
}

function countModelFields(obj) {
  let count = 0;
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count += countModelFields(obj[key]);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * AI LAYER 4B: PHYSICAL PLAUSIBILITY GUARDRAILS
 * 
 * Validates that model parameters are physically plausible using domain knowledge.
 * Catches impossible values like 2°C junction temperature, 426,666 mm deflection, etc.
 * 
 * @param {object} model - The structured engineering model
 * @param {string} domain - Engineering domain
 * @returns {Promise<object>} - Plausibility check result
 */
export async function checkPhysicalPlausibility(model, domain, provider = 'groq') {
  const systemPrompt = `You are an expert engineering domain validator. Your job is to:
1. Check if parameter values are physically plausible for the domain
2. Catch impossible values (e.g., max junction temp = 2°C when CPU must be >50°C)
3. Check if results would be physically impossible (e.g., 426,666 mm deflection on 4m beam)
4. Validate stress values against material limits (e.g., 80,000 MPa for steel when yield ~250 MPa)
5. Check Reynolds numbers are reasonable for stated velocity/viscosity
6. Flag if results would cause hardware damage or violate safety

Return a JSON object with this structure:
{
  "plausibility_status": "PASS" | "FAIL" | "WARNING",
  "issues": [
    {
      "field": "field name",
      "value": "problematic value",
      "expected_range": "reasonable range",
      "severity": "critical|warning",
      "explanation": "why this is physically impossible or dangerous"
    }
  ],
  "domain_specific_checks": {
    "check_name": "result of domain-specific validation"
  },
  "confidence": 0.0-1.0,
  "recommendation": "what should be done"
}

Use your engineering domain knowledge. Be strict about physical impossibilities.`;

  const userPrompt = `Check physical plausibility of this ${domain} model:

Model: ${JSON.stringify(model, null, 2)}

Domain: ${domain}

Validate that all parameters are physically plausible and safe.`;

  // Use the selected provider
  let result = await callAI(provider, systemPrompt, userPrompt);
  if (result.error) {
    result = await callAI('claude', systemPrompt, userPrompt);
  }
  
  if (result.error) {
    // Fallback: basic range checks
    return fallbackPlausibilityCheck(model, domain);
  }
  
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI plausibility response:', e);
  }
  
  return fallbackPlausibilityCheck(model, domain);
}

/**
 * Fallback plausibility check with basic domain rules
 */
function fallbackPlausibilityCheck(model, domain) {
  const issues = [];
  
  // Domain-specific basic checks
  if (domain === 'Thermal') {
    const maxTemp = model?.TEMPERATURES?.['Maximum junction temperature']?.value;
    if (maxTemp && parseFloat(maxTemp) < 50) {
      issues.push({
        field: 'Maximum junction temperature',
        value: maxTemp,
        expected_range: '50-150°C',
        severity: 'critical',
        explanation: 'CPU junction temp below 50°C is physically implausible'
      });
    }
  }
  
  if (domain === 'Structural') {
    const stress = model?.RESULTS?.['Max Stress']?.value;
    if (stress && parseFloat(stress) > 10000) {
      issues.push({
        field: 'Max Stress',
        value: stress,
        expected_range: '< 1000 MPa for typical materials',
        severity: 'critical',
        explanation: 'Stress value exceeds typical material yield strength'
      });
    }
  }
  
  return {
    plausibility_status: issues.length > 0 ? 'FAIL' : 'PASS',
    issues,
    domain_specific_checks: {},
    confidence: 0.5,
    recommendation: issues.length > 0 ? 'Review parameters' : 'Proceed'
  };
}

/**
 * AI LAYER 10B: SOLVER OUTPUT SANITY CHECK
 * 
 * Validates solver outputs to ensure they match what was asked, are physically sane,
 * converged properly, and have consistent units.
 * 
 * @param {object} solverResults - Raw solver output
 * @param {string} originalQuestion - What was asked
 * @param {object} model - The model that was solved
 * @param {string} domain - Engineering domain
 * @returns {Promise<object>} - Sanity check result
 */
export async function checkSolverOutputSanity(solverResults, originalQuestion, model, domain, provider = 'groq') {
  const systemPrompt = `You are an expert engineering result validator. Your job is to:
1. Check if the solver output answers what was actually asked in the question
2. Validate that result magnitudes are physically reasonable
3. Check if the solver converged or failed silently
4. Verify units are consistent between input and output
5. Determine if results would cause design failure in practice
6. Flag if results contradict boundary conditions

Return a JSON object with this structure:
{
  "sanity_status": "VALID" | "SUSPICIOUS" | "REJECT",
  "issues": [
    {
      "type": "magnitude|convergence|units|missing_output",
      "description": "what's wrong",
      "severity": "critical|warning",
      "expected": "what was expected",
      "actual": "what solver returned"
    }
  ],
  "answered_question": true|false,
  "convergence_status": "converged|diverged|unknown",
  "physical_reasonableness": "reasonable|unreasonable",
  "confidence": 0.0-1.0,
  "recommendation": "what should be done"
}

Be thorough. If results don't make physical sense, REJECT them.`;

  const userPrompt = `Check sanity of solver output:

Original Question: "${originalQuestion}"

Domain: ${domain}

Model: ${JSON.stringify(model, null, 2)}

Solver Results: ${JSON.stringify(solverResults, null, 2)}

Validate that results are physically reasonable and answer the question.`;

  // Use the selected provider
  let result = await callAI(provider, systemPrompt, userPrompt);
  if (result.error) {
    result = await callAI('claude', systemPrompt, userPrompt);
  }
  
  if (result.error) {
    // Fallback: basic sanity checks
    return fallbackSanityCheck(solverResults, domain);
  }
  
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI sanity response:', e);
  }
  
  return fallbackSanityCheck(solverResults, domain);
}

/**
 * Fallback sanity check
 */
function fallbackSanityCheck(solverResults, domain) {
  const issues = [];
  
  // Check for NaN or infinite values
  const checkForInvalid = (obj, path = '') => {
    for (const key in obj) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof obj[key] === 'number') {
        if (!isFinite(obj[key])) {
          issues.push({
            type: 'magnitude',
            description: `Invalid value at ${currentPath}`,
            severity: 'critical',
            expected: 'finite number',
            actual: String(obj[key])
          });
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        checkForInvalid(obj[key], currentPath);
      }
    }
  };
  
  checkForInvalid(solverResults);
  
  return {
    sanity_status: issues.length > 0 ? 'REJECT' : 'VALID',
    issues,
    answered_question: true,
    convergence_status: 'unknown',
    physical_reasonableness: issues.length === 0 ? 'reasonable' : 'unreasonable',
    confidence: 0.5,
    recommendation: issues.length > 0 ? 'Review solver output' : 'Proceed'
  };
}

/**
 * AI LAYER 11B: NATURAL LANGUAGE EXPLANATION ENGINE
 * 
 * Translates raw solver outputs into clear engineering insight appropriate
 * for the user's mode (learn/design/verify).
 * 
 * @param {object} solverResults - Raw solver output
 * @param {string} originalQuestion - What was asked
 * @param {string} userMode - 'Student', 'Engineer', or 'Industry'
 * @param {object} model - The model that was solved
 * @param {string} domain - Engineering domain
 * @returns {Promise<object>} - Explanation result
 */
export async function generateExplanation(solverResults, originalQuestion, userMode, model, domain, provider = 'groq') {
  const modeInstructions = {
    Student: 'Explain step-by-step, include educational context, show the physics/engineering principles, use analogies if helpful.',
    Engineer: 'Focus on practical implications, trade-offs, design decisions, and actionable insights. Be concise but thorough.',
    Industry: 'Focus on business impact, cost implications, manufacturability, safety margins, and production considerations.'
  };
  
  const systemPrompt = `You are an expert engineering communicator. Your job is to:
1. Translate solver results into clear engineering insight
2. Explain why the design succeeds or fails against targets
3. Translate technical trade-offs into appropriate language for the user's mode
4. Answer the actual question that was asked
5. Warn about edge cases or second-order effects
6. Be accurate and technically precise

User mode: ${userMode}
Instructions: ${modeInstructions[userMode] || modeInstructions.Engineer}

Return a JSON object with this structure:
{
  "summary": "2-3 sentence executive summary of the result",
  "direct_answer": "direct answer to the specific question asked",
  "key_findings": [
    "important finding 1",
    "important finding 2"
  ],
  "technical_explanation": "detailed technical explanation appropriate for user mode",
  "trade_offs": [
    {
      "parameter": "what was traded off",
      "impact": "what the impact is"
    }
  ],
  "warnings": ["any warnings or edge cases"],
  "next_steps": ["suggested next actions"],
  "confidence": 0.0-1.0
}

Be accurate. If the results don't answer the question, say so.`;

  const userPrompt = `Generate explanation for ${domain} results:

Original Question: "${originalQuestion}"

User Mode: ${userMode}

Model: ${JSON.stringify(model, null, 2)}

Solver Results: ${JSON.stringify(solverResults, null, 2)}

Translate these results into clear engineering insight.`;

  // Use the selected provider
  let result = await callAI(provider, systemPrompt, userPrompt);
  if (result.error) {
    result = await callAI('claude', systemPrompt, userPrompt);
  }
  
  if (result.error) {
    // Fallback: basic explanation template
    return fallbackExplanation(solverResults, originalQuestion, userMode, domain);
  }
  
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI explanation response:', e);
  }
  
  return fallbackExplanation(solverResults, originalQuestion, userMode, domain);
}

/**
 * Fallback explanation generator
 */
function fallbackExplanation(solverResults, originalQuestion, userMode, domain) {
  return {
    summary: `Solver completed for ${domain} problem.`,
    direct_answer: 'AI explanation unavailable - review raw solver results.',
    key_findings: ['Solver execution completed'],
    technical_explanation: 'Detailed explanation requires AI service. Review solver results manually.',
    trade_offs: [],
    warnings: ['AI explanation unavailable - results not validated'],
    next_steps: ['Review solver output manually', 'Enable AI API for better explanations'],
    confidence: 0.3
  };
}


/**
 * AI LAYER 12: TRIZ CONTRADICTION ANALYSIS (LLM ESCALATION)
 *
 * Escalation path for the deterministic TRIZ engine (triz.js). The
 * deterministic engine runs first and is preferred whenever it returns a
 * confident result, because it can only ever cite real principle/parameter
 * numbers from trizKnowledge.js — it has no way to invent one. This AI
 * layer exists for the harder cases: novel phrasing, multi-clause problems,
 * or domain-crossing trade-offs where keyword/vocabulary matching alone
 * comes back empty or low-confidence.
 *
 * GROUNDING (this is what keeps the LLM from hallucinating a fake
 * principle): the prompt embeds the actual 39 parameter names and 40
 * principle names/numbers, and the model is instructed to select ONLY by
 * number from those exact lists. The response is then validated against
 * trizKnowledgeBase before being trusted — if the model returns a principle
 * or parameter number outside the real range, that field is dropped rather
 * than passed through, and the result's confidence is reduced accordingly.
 *
 * @param {string} userQuestion - the raw engineering question/request
 * @param {string} domain - engineering domain (Circuits, Structural, etc.)
 * @param {object} deterministicResult - the (possibly null/low-confidence)
 *        result already returned by triz.js's detectContradiction(), passed
 *        in so the LLM can be asked to confirm/refine it rather than start
 *        from zero context
 * @param {object} trizKnowledgeBase - { parameters, principles } as
 *        returned by triz.js's getTrizKnowledgeBase()
 * @returns {Promise<object>} TRIZ contradiction analysis, same shape as
 *        triz.js's detectContradiction() output, plus an `analysis_method` 
 *        field set to 'ai_escalation' so callers can tell which path
 *        produced the result.
 */
export async function analyzeTrizContradictionAI(userQuestion, domain, deterministicResult, trizKnowledgeBase) {
  const parameterList = Object.entries(trizKnowledgeBase.parameters)
    .map(([num, p]) => `${num}. ${p.name}`)
    .join('\n');
  const principleList = Object.entries(trizKnowledgeBase.principles)
    .map(([num, p]) => `${num}. ${p.name} — ${p.short}`)
    .join('\n');

  const systemPrompt = `You are a TRIZ (Theory of Inventive Problem Solving) contradiction analysis expert supporting an industrial engineering simulation platform. Your job is to identify the engineering contradiction in a user's question and cite the correct historically-grounded TRIZ principles for it.

CRITICAL GROUNDING RULE: You may ONLY select parameter numbers from this exact list of the 39 standard TRIZ engineering parameters:
${parameterList}

You may ONLY select principle numbers from this exact list of the 40 standard TRIZ inventive principles:
${principleList}

Do NOT invent a parameter or principle name that is not in these two lists. Do NOT use a principle number without using the exact name shown above for it. If you are not confident which of the 39 parameters applies, say so honestly in your confidence score rather than forcing a low-quality match.

A deterministic keyword-based pass already ran on this question and produced this result (it may be null if nothing matched):
${deterministicResult ? JSON.stringify(deterministicResult, null, 2) : 'null — no deterministic match found'}

Your job: either confirm that deterministic result is correct, refine it, or — if it's null or wrong — find the real contradiction yourself using the same two parameter lists above.

Return a JSON object with this exact structure:
{
  "has_contradiction": true|false,
  "improving_param_num": number (1-39) | null,
  "worsening_param_num": number (1-39) | null,
  "principle_nums": [number, number, ...] (1-40, ranked best-first, max 4),
  "statement": "plain-language description of the contradiction",
  "industrial_checks": ["concrete numeric/checkable validation step", "..."],
  "reasoning": "brief explanation of why these specific parameters and principles apply to THIS question",
  "confidence": 0.0-1.0
}

If there is genuinely no contradiction in the question (e.g. it's a simple factual question with no trade-off), return has_contradiction: false and leave the other fields null/empty.`;

  const userPrompt = `Domain: ${domain}

User's question: "${userQuestion}"

Identify the engineering contradiction (if any) and cite the correct TRIZ parameters and principles using ONLY the numbered lists provided in your instructions.`;

  // Try Groq first (user's primary provider), fallback to Claude if available —
  // same provider-fallback convention used by every other AI layer in this file.
  let result = await callAI('groq', systemPrompt, userPrompt, { temperature: 0.2 });
  if (result.error) {
    result = await callAI('claude', systemPrompt, userPrompt, { temperature: 0.2 });
  }

  if (result.error) {
    return fallbackTrizAnalysis(deterministicResult, 'AI unavailable for TRIZ escalation');
  }

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallbackTrizAnalysis(deterministicResult, 'No JSON in AI TRIZ response');
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return groundAndValidateTrizAnalysis(parsed, trizKnowledgeBase);
  } catch (e) {
    console.error('Failed to parse AI TRIZ response:', e);
    return fallbackTrizAnalysis(deterministicResult, `Parse error: ${e.message}`);
  }
}

/**
 * Validates an LLM-produced TRIZ analysis against the real knowledge base
 * BEFORE trusting any of it. Any parameter/principle number outside the
 * real 1-39 / 1-40 ranges is dropped (not silently kept), and the
 * confidence is reduced proportionally to how much had to be dropped. This
 * is the actual enforcement point for the "never invent a principle"
 * guarantee — the system prompt asks nicely, this function checks for real.
 *
 * @param {object} parsed - raw parsed JSON from the LLM
 * @param {object} trizKnowledgeBase - { parameters, principles }
 * @returns {object} validated, grounded TRIZ analysis result
 */
function groundAndValidateTrizAnalysis(parsed, trizKnowledgeBase) {
  if (!parsed.has_contradiction) {
    return {
      kind: 'ai_escalation',
      analysis_method: 'ai_escalation',
      improvingParam: null,
      worseningParam: null,
      principles: [],
      principleSource: 'ai_no_contradiction',
      confidence: 0,
      severity: 'Low',
      statement: 'No contradiction identified.',
      industrialChecks: [],
      detectionEvidence: ['AI escalation analysis found no engineering contradiction in this question.']
    };
  }

  let droppedCount = 0;

  const improvingParam = trizKnowledgeBase.parameters[parsed.improving_param_num]
    ? { num: Number(parsed.improving_param_num), name: trizKnowledgeBase.parameters[parsed.improving_param_num].name }
    : (droppedCount++, null);

  const worseningParam = trizKnowledgeBase.parameters[parsed.worsening_param_num]
    ? { num: Number(parsed.worsening_param_num), name: trizKnowledgeBase.parameters[parsed.worsening_param_num].name }
    : (droppedCount++, null);

  const requestedPrinciples = Array.isArray(parsed.principle_nums) ? parsed.principle_nums : [];
  const principles = requestedPrinciples
    .map((n) => {
      const p = trizKnowledgeBase.principles[n];
      if (!p) { droppedCount++; return null; }
      return { num: Number(n), name: p.name, short: p.short };
    })
    .filter(Boolean)
    .slice(0, 4);

  const droppedPenalty = Math.min(0.4, droppedCount * 0.12);
  const baseConfidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
  const confidence = Math.max(0.05, baseConfidence - droppedPenalty);

  return {
    kind: 'ai_escalation',
    analysis_method: 'ai_escalation',
    improvingParam,
    worseningParam,
    principles,
    principleSource: principles.length > 0 ? 'ai_grounded' : 'none',
    confidence,
    severity: confidence >= 0.82 ? 'High' : confidence >= 0.66 ? 'Medium' : 'Low',
    statement: typeof parsed.statement === 'string' ? parsed.statement : '',
    industrialChecks: Array.isArray(parsed.industrial_checks) ? parsed.industrial_checks.slice(0, 5) : [],
    detectionEvidence: [
      typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
      droppedCount > 0 ? `${droppedCount} field(s) referenced a parameter/principle number outside the real TRIZ tables and were dropped.` : null,
      'Produced via AI escalation (deterministic keyword matcher did not reach high confidence alone).'
    ].filter(Boolean)
  };
}

/**
 * Fallback when the AI call fails entirely or returns unparseable content.
 * Falls back to whatever the deterministic engine already found, rather
 * than fabricating a result — if the deterministic pass also found
 * nothing, this honestly returns a no-contradiction result instead of
 * guessing.
 */
function fallbackTrizAnalysis(deterministicResult, reason) {
  if (deterministicResult) {
    return {
      ...deterministicResult,
      analysis_method: 'deterministic_fallback_after_ai_failure',
      detectionEvidence: [
        ...(deterministicResult.detectionEvidence || []),
        `AI escalation unavailable (${reason}) — returning deterministic result as-is.` 
      ]
    };
  }
  return {
    kind: 'ai_escalation',
    analysis_method: 'ai_unavailable',
    improvingParam: null,
    worseningParam: null,
    principles: [],
    principleSource: 'none',
    confidence: 0,
    severity: 'Low',
    statement: '',
    industrialChecks: [],
    detectionEvidence: [`AI escalation unavailable (${reason}) and no deterministic match existed either.`]
  };
}

/**
 * Configure API keys for AI providers
 */
export function configureAIKeys(keys) {
  if (keys.claude) localStorage.setItem('claude_api_key', keys.claude);
  if (keys.groq) localStorage.setItem('groq_api_key', keys.groq);
}

/**
 * Get configured API keys
 */
export function getAIKeys() {
  return {
    claude: localStorage.getItem('claude_api_key'),
    groq: localStorage.getItem('groq_api_key')
  };
}
