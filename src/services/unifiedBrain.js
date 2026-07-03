/**
 * unifiedBrain.js — Single AI Decision System
 * 
 * This is the ONE brain that makes all decisions:
 * - Domain detection
 * - Parameter extraction
 * - Solver selection (local vs VM)
 * - Schematic template selection
 * - Missing parameter detection
 * 
 * All previous decision systems (chatOrchestrator regex, extractParameterUpdates,
 * individual AI layers) are now fallback paths only.
 * 
 * The brain returns a structured decision object that the code mechanically executes.
 */

import { callAI } from './aiLayers.js';
import { detectDomainFromPrompt } from './chatOrchestrator.js';
import { applyNaturalLanguageUpdates } from './chatOrchestrator.js';
import { routeSolver } from './simforgeFlow.js';

// ─── TOOL/SOLVER MANIFEST ───────────────────────────────────────────
// This manifest tells the AI what tools actually exist
const SOLVER_MANIFEST = {
  domains: {
    Physics: {
      system_types: ['Ladder', 'Spool', 'Spring-Pulley', 'Circular Motion', 'Wave Motion', 'Pulley-Block'],
      solver: 'local',
      schematic_templates: ['ladder', 'spool', 'spring_pulley', 'circular', 'wave', 'pulley_block'],
      capabilities: ['mechanics', 'shm', 'collisions', 'momentum', 'centripetal', 'waves']
    },
    Circuits: {
      system_types: ['Voltage Divider', 'Buck Converter', 'Filter', 'Amplifier'],
      solver: 'ngspice (local)',
      schematic_templates: ['voltage_divider', 'buck_converter', 'filter', 'amplifier'],
      capabilities: ['dc_analysis', 'transient', 'ac_analysis', 'ripple', 'frequency_response']
    },
    Structural: {
      system_types: ['Cantilever', 'Truss', 'Frame', 'Pulley', 'Weld'],
      solver: 'CalculiX (local) or ubuntu_vm for complex geometries',
      schematic_templates: ['cantilever', 'truss', 'frame', 'pulley', 'weld'],
      capabilities: ['beam_deflection', 'stress', 'safety_factor', 'joint_strength']
    },
    Fluids: {
      system_types: ['Internal Flow', 'External Flow', 'Nozzle'],
      solver: 'OpenFOAM (ubuntu_vm)',
      schematic_templates: ['pipe_flow', 'external_flow', 'nozzle'],
      capabilities: ['pressure_drop', 'flow_field', 'reynolds', 'cfd']
    },
    Semiconductors: {
      system_types: ['MOSFET', 'Diode', 'BJT'],
      solver: 'SPICE TCAD (ubuntu_vm)',
      schematic_templates: ['mosfet', 'diode', 'bjt'],
      capabilities: ['iv_curves', 'carrier_concentration', 'electric_potential']
    },
    Aerospace: {
      system_types: ['Finite Wing', 'Nozzle'],
      solver: 'local analytical or ubuntu_vm for CFD',
      schematic_templates: ['wing', 'nozzle'],
      capabilities: ['lift_distribution', 'induced_drag', 'mach_number', 'thrust']
    },
    Thermal: {
      system_types: ['Heat Sink', 'PCB Thermal'],
      solver: 'local analytical',
      schematic_templates: ['heatsink', 'pcb_thermal'],
      capabilities: ['thermal_resistance', 'temperature_rise', 'junction_temp']
    },
    Control: {
      system_types: ['PID Controller'],
      solver: 'local analytical',
      schematic_templates: ['pid'],
      capabilities: ['settling_time', 'overshoot', 'gain_scheduling']
    },
    Materials: {
      system_types: ['Material Selection'],
      solver: 'local database lookup',
      schematic_templates: ['material_comparison'],
      capabilities: ['yield_strength', 'fatigue', 'safety_factor']
    },
    Power: {
      system_types: ['Power Budget'],
      solver: 'local analytical',
      schematic_templates: ['power_budget'],
      capabilities: ['power_consumption', 'efficiency', 'thermal_budget']
    }
  }
};

/**
 * Single entry point for all AI decisions
 * 
 * @param {string} rawQuestion - User's raw question
 * @param {object} currentModel - Current model state (if exists)
 * @param {string} currentDomain - Current active domain
 * @returns {Promise<object>} - Structured decision object
 */
export async function makeEngineeringDecision(rawQuestion, currentModel = null, currentDomain = 'Default') {
  const systemPrompt = `You are the central engineering brain for SimForge. Your job is to:
1. Detect the engineering domain from the question
2. Extract ALL parameters with their units
3. Identify the SYSTEM_TYPE (problem type) that matches
4. Select the appropriate solver (local vs VM)
5. Choose the correct schematic template
6. Flag missing or ambiguous information
7. Identify contradictions

AVAILABLE DOMAINS AND CAPABILITIES:
${JSON.stringify(SOLVER_MANIFEST, null, 2)}

Return a JSON object with this structure:
{
  "domain": "detected domain (one of: Physics, Circuits, Structural, Fluids, Semiconductors, Aerospace, Thermal, Control, Materials, Power)",
  "system_type": "specific SYSTEM_TYPE that matches (must be one of the available system_types for this domain)",
  "solver": {
    "name": "solver name (e.g., ngspice, CalculiX, OpenFOAM)",
    "execution_environment": "local or ubuntu_vm",
    "reasoning": "why this solver was chosen"
  },
  "schematic_template": "template name for schematic generation (must be one of the available schematic_templates)",
  "parameters": [
    { "name": "parameter name", "value": "numeric value", "unit": "unit", "category": "model category (e.g., GEOMETRY, LOADING, COMPONENTS)", "source": "explicit|implicit" }
  ],
  "what_is_asked": "what the question wants calculated/designed/analyzed",
  "missing_parameters": ["list of parameters that are needed but not provided"],
  "ambiguities": ["list of ambiguities or unclear aspects"],
  "contradictions": ["list of contradictions found"],
  "confidence": 0.0-1.0,
  "canonical_form": "restated question in canonical engineering form",
  "actions": {
    "formulate": true/false,
    "update_model": true/false,
    "run_solver": true/false,
    "explain_only": true/false
  }
}

CRITICAL RULES:
- Only use system_types and schematic_templates that exist in the manifest
- If no matching system_type exists, set system_type to null and explain why in missing_parameters
- If no matching schematic exists, set schematic_template to null and explain why
- Do NOT invent capabilities that don't exist
- Mark parameters as "implicit" only if the problem cannot be solved without them
- If the question is casual/greeting, set domain to "casual" and actions.explain_only to true`;

  const userPrompt = `Make an engineering decision for this question:

Question: "${rawQuestion}"

Current domain: ${currentDomain}
Current model exists: ${currentModel ? 'yes' : 'no'}

Analyze the question and return structured JSON with domain, system_type, solver selection, schematic template, parameters, and actions.`;

  try {
    const result = await callAI('groq', systemPrompt, userPrompt);
    
    if (result.error) {
      console.warn('Unified brain AI call failed, falling back to regex systems:', result.error);
      return fallbackDecision(rawQuestion, currentModel, currentDomain);
    }

    const decision = parseAIResponse(result.content);
    
    // Validate decision against manifest
    const validated = validateDecision(decision);
    
    return validated;
  } catch (error) {
    console.error('Unified brain error, falling back to regex systems:', error);
    return fallbackDecision(rawQuestion, currentModel, currentDomain);
  }
}

/**
 * Parse AI response and extract JSON
 */
function parseAIResponse(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse AI response as JSON:', e);
  }
  return null;
}

/**
 * Validate decision against solver manifest
 */
function validateDecision(decision) {
  if (!decision) return null;
  
  const domainManifest = SOLVER_MANIFEST.domains[decision.domain];
  
  if (domainManifest) {
    // Validate system_type exists
    if (decision.system_type && !domainManifest.system_types.includes(decision.system_type)) {
      console.warn(`Invalid system_type "${decision.system_type}" for domain ${decision.domain}`);
      decision.system_type = null;
      decision.missing_parameters = decision.missing_parameters || [];
      decision.missing_parameters.push(`No matching system_type for this problem in ${decision.domain} domain`);
    }
    
    // Validate schematic_template exists
    if (decision.schematic_template && !domainManifest.schematic_templates.includes(decision.schematic_template)) {
      console.warn(`Invalid schematic_template "${decision.schematic_template}" for domain ${decision.domain}`);
      decision.schematic_template = null;
    }
  }
  
  return decision;
}

/**
 * Fallback decision using existing regex systems
 * Used when AI fails or is rate-limited
 */
function fallbackDecision(rawQuestion, currentModel, currentDomain) {
  const domain = detectDomainFromPrompt(rawQuestion, currentDomain);
  
  // Use existing chatOrchestrator logic as fallback
  const intent = analyzeEngineeringIntentFallback(rawQuestion, domain);
  
  return {
    domain,
    system_type: intent.category,
    solver: {
      name: 'fallback',
      execution_environment: 'local',
      reasoning: 'AI unavailable, using regex-based fallback'
    },
    schematic_template: null,
    parameters: [],
    what_is_asked: intent.action,
    missing_parameters: [],
    ambiguities: [],
    contradictions: [],
    confidence: 0.7,
    canonical_form: rawQuestion,
    actions: {
      formulate: true,
      update_model: false,
      run_solver: false,
      explain_only: false
    },
    _fallback: true
  };
}

/**
 * Simplified intent analysis for fallback
 */
function analyzeEngineeringIntentFallback(promptText, domain) {
  const lower = promptText.toLowerCase();
  
  // Very basic category detection based on domain
  const categories = {
    Physics: ['mechanics', 'motion', 'force', 'spring', 'pulley'],
    Circuits: ['voltage', 'current', 'resistor', 'capacitor', 'inductor'],
    Structural: ['beam', 'deflection', 'stress', 'truss', 'frame'],
    Fluids: ['flow', 'pressure', 'pipe', 'duct', 'cfd'],
    Semiconductors: ['mosfet', 'diode', 'transistor', 'iv', 'tcad'],
    Aerospace: ['wing', 'lift', 'drag', 'nozzle', 'mach'],
    Thermal: ['heat', 'temperature', 'thermal', 'heatsink'],
    Control: ['pid', 'controller', 'feedback', 'settling'],
    Materials: ['material', 'strength', 'yield', 'fatigue'],
    Power: ['power', 'watts', 'efficiency', 'budget']
  };
  
  const domainCategories = categories[domain] || [];
  const matchedCategory = domainCategories.find(cat => lower.includes(cat)) || 'General';
  
  return {
    category: matchedCategory,
    action: `Analyze ${matchedCategory} problem in ${domain} domain`
  };
}
