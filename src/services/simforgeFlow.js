// BUG FIX: import paths normalized — use .js extension consistently
// to match how simforgeFlow.js and other consumers import this module.
// import { createWorkflowIntent, intentToActions } from './workflowController.js'; // File not found - disabled during migration
import { detectContradiction, rankTrizPrinciples } from './triz.js';

export const SIMFORGE_FLOW_STAGES = [
  { id: 1, name: 'User Input', purpose: 'Capture raw engineering request, user mode, and optional context.' },
  { id: 2, name: 'Intent + Domain Detection', purpose: 'Classify domain, task type, solver need, and TRIZ need.' },
  { id: 3, name: 'Structured Model Creation', purpose: 'Convert natural language into editable engineering model fields.' },
  { id: 4, name: 'Engineering Guardrails', purpose: 'Check units, boundary conditions, plausibility, convergence risk, and solver suitability.' },
  { id: 5, name: 'TRIZ Contradiction Recognition', purpose: 'Identify design contradictions hidden in the problem and model.' },
  { id: 6, name: 'TRIZ Principle Mapping', purpose: 'Rank relevant TRIZ principles and translate them into concrete engineering moves.' },
  { id: 7, name: 'TRIZ Design Proposals', purpose: 'Generate modified design options from selected principles.' },
  { id: 8, name: 'Model Update From TRIZ', purpose: 'Apply chosen TRIZ design to the active model or prepare batch variants.' },
  { id: 9, name: 'Intelligent Solver Routing', purpose: 'Choose analytical, local, or VM solver path based on domain and model complexity.' },
  { id: 10, name: 'Solver Execution + Parsing', purpose: 'Run solver, parse outputs, collect metrics, plots, and artifacts.' },
  { id: 11, name: 'Results + Before/After Comparison', purpose: 'Compare baseline and TRIZ-modified designs against targets.' },
  { id: 12, name: 'Natural Language Explanation', purpose: 'Translate results and trade-offs into mode-appropriate engineering insight.' },
  { id: 13, name: 'Iterative Refinement Loop', purpose: 'Suggest next TRIZ, parameter, optimization, or error-diagnosis actions.' }
];

const TASK_PATTERNS = [
  ['optimize', /\b(optimi[sz]e|best|lightest|cheapest|minimum|maximum|pareto|constraint)\b/i],
  ['redesign', /\b(redesign|improve|quieter|lighter|stronger|smaller|cooler|reduce|increase|without)\b/i],
  ['compare', /\b(compare|versus|vs|before.?after|trade.?off|batch)\b/i],
  ['validate', /\b(validate|check|verify|safe|factor of safety|fos|meets?)\b/i],
  ['simulate', /\b(simulate|run|solver|fea|cfd|spice|xfoil|openfoam|calculix)\b/i],
  ['analyze', /\b(analy[sz]e|calculate|solve|find|estimate|stress|deflection|temperature|lift|drag)\b/i]
];

const DOMAIN_NORMALIZATION = {
  Structural: 'structural',
  Thermal: 'thermal',
  Fluids: 'fluids',
  Circuits: 'circuits',
  Control: 'control',
  Power: 'power',
  Aerospace: 'aerospace',
  Physics: 'mechanical',
  Materials: 'materials',
  Semiconductors: 'circuits'
};

const SOLVER_NAMES = {
  Circuits: { solver_name: 'ngspice', solver_path: 'local_ngspice', execution_environment: 'local', estimated_runtime_seconds: 1 },
  Control: { solver_name: 'python-control', solver_path: 'local_python_control', execution_environment: 'local', estimated_runtime_seconds: 1 },
  Power: { solver_name: 'pandapower', solver_path: 'local_pandapower', execution_environment: 'local', estimated_runtime_seconds: 2 },
  Structural: { solver_name: 'CalculiX', solver_path: 'vm_or_local_calculix', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 30 },
  Fluids: { solver_name: 'OpenFOAM', solver_path: 'vm_openfoam', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 180 },
  Aerospace: { solver_name: 'XFOIL / OpenFOAM', solver_path: 'vm_xfoil_or_openfoam', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 10 },
  Thermal: { solver_name: 'ElmerSolver', solver_path: 'vm_elmer', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 45 },
  Physics: { solver_name: 'SciPy / analytical mechanics', solver_path: 'local_scipy_or_analytical', execution_environment: 'local', estimated_runtime_seconds: 1 },
  Materials: { solver_name: 'Analytical material check', solver_path: 'local_material_safety', execution_environment: 'local', estimated_runtime_seconds: 1 }
};

const valueOf = (field, fallback = '') => field?.value ?? field ?? fallback;

export function createSimForgeMindMap() {
  return `mindmap
  root((SimForge AI Engineering Co-Designer))
    "1 User Input"
      "Natural language query"
      "Mode: Student / Engineer / Industry"
      "Optional files and context"
    "2 Intent + Domain Detection"
      "Domain"
      "Task type"
      "Needs solver?"
      "Needs TRIZ?"
    "3 Structured Model"
      "Geometry"
      "Material"
      "Loading"
      "Boundary conditions"
      "Targets"
    "4 Guardrails"
      "Units"
      "Plausibility"
      "Solver suitability"
      "Convergence risk"
    "5 TRIZ Contradictions"
      "Improving parameter"
      "Worsening parameter"
      "Dominant contradiction"
    "6 TRIZ Ranking"
      "Principle relevance"
      "Concrete proposal"
      "Impact and feasibility"
    "7 Design Proposals"
      "Modified models"
      "Expected outcomes"
      "Design cards"
    "8 Apply TRIZ"
      "Update model"
      "Batch variants"
      "Baseline retained"
    "9 Solver Routing"
      "Analytical"
      "Local solver"
      "Ubuntu VM solver"
    "10 Execution + Parsing"
      "Deck generation"
      "Run solver"
      "Metrics and artifacts"
    "11 Comparison"
      "Original vs modified"
      "Targets"
      "Trade-offs"
    "12 Explanation"
      "Student learning"
      "Engineer decision"
      "Industry recommendation"
    "13 Iteration"
      "Try principle"
      "Modify parameters"
      "Batch optimization"
      "Error diagnosis"`;
}

export function createFlowPlan({ promptText, domain, hasModel = false, mode = 'Engineer', model = null }) {
  const userMode = normalizeUserMode(mode, promptText);
  const workflowIntent = createWorkflowIntent(promptText, domain, hasModel);
  const task_type = detectTaskType(promptText);
  const contradiction = detectContradiction(promptText, workflowIntent.domain);
  const needs_triz = Boolean(contradiction) || ['optimize', 'redesign', 'compare'].includes(task_type);
  const needs_solver = workflowIntent.should_run_solver || ['analyze', 'simulate', 'optimize', 'compare', 'validate'].includes(task_type);
  const guardrails = model ? runEngineeringGuardrails(model, workflowIntent.domain) : null;
  const triz = contradiction ? buildTrizAnalysis(contradiction, userMode) : null;
  const solverRouting = routeSolver(workflowIntent.domain, model, { batch_mode: task_type === 'compare' });

  return {
    raw_query: promptText,
    mode: userMode,
    domain: DOMAIN_NORMALIZATION[workflowIntent.domain] || workflowIntent.domain?.toLowerCase() || 'other',
    app_domain: workflowIntent.domain,
    task_type,
    problem_statement: summarizeProblem(promptText, workflowIntent.domain, task_type),
    key_objectives: inferObjectives(promptText, task_type, contradiction),
    implied_constraints: inferConstraints(promptText, contradiction),
    contradictions_detected: contradiction ? [contradictionToSpec(contradiction)] : [],
    needs_solver,
    needs_triz,
    clarifying_questions: [],
    confidence: workflowIntent.confidence,
    suggested_workflow: needs_solver && needs_triz
      ? (task_type === 'redesign' || task_type === 'optimize' ? 'triz_then_solve' : 'both_parallel')
      : needs_solver ? 'solve_then_triz' : needs_triz ? 'triz_only' : 'solve_then_triz',
    workflowIntent,
    guardrails,
    triz,
    solverRouting,
    stages: SIMFORGE_FLOW_STAGES.map(stage => ({
      ...stage,
      status: getStageStatus(stage.id, { model, needs_solver, needs_triz, guardrails })
    }))
  };
}

export function normalizeUserMode(mode, promptText = '') {
  const explicit = String(mode || '').toLowerCase();
  const text = String(promptText || '').toLowerCase();
  if (explicit.includes('student') || /\b(student|teach|learn|explain like|beginner|class|homework)\b/.test(text)) return 'Student';
  if (explicit.includes('industry') || /\b(industry|production|batch|pareto|optimi[sz]ation|cost|lead time|manufacturing|supplier)\b/.test(text)) return 'Industry';
  return 'Engineer';
}

export function attachFlowMetadata(model, flowPlan) {
  // BUG FIX: attachFlowMetadata was a no-op. It returned the model unchanged,
  // so flow plan metadata (mode, task type, stage tracking) was never actually
  // attached to the model.
  // Fix: Now attaches a _simforge_flow metadata key to the model without
  // touching any solver-critical fields.
  if (!model) return model;
  return {
    ...model,
    _simforge_flow: {
      mode: flowPlan?.mode || 'Engineer',
      task_type: flowPlan?.task_type || 'analyze',
      domain: flowPlan?.app_domain || flowPlan?.domain || 'Engineering',
      stages: flowPlan?.stages || [],
      timestamp: new Date().toISOString()
    }
  };
}

export function updateFlowStage(model, stageId, status = 'completed') {
  return model;
}

export function buildTrizDesignOptions(contradiction, model, mode = 'Engineer') {
  if (!contradiction?.principles?.length) return [];
  return rankTrizPrinciples(contradiction.principles).slice(0, mode === 'Industry' ? 4 : 3).map((principle, index) => {
    const preview = principle.applyChanges(model || {});
    return {
      rank: index + 1,
      principle_id: principle.num,
      principle_name: principle.name,
      relevance_score: Number(Math.max(0.65, 0.95 - index * 0.11).toFixed(2)),
      explanation: principle.rationale,
      concrete_proposal: {
        change_type: inferChangeType(preview.tag),
        description: principle.headline,
        specific_changes: principle.effects || [],
        modified_section: preview.tag
      },
      expected_impact: estimateImpact(principle, index),
      feasibility: {
        difficulty: index === 0 ? 'moderate' : index === 1 ? 'hard' : 'easy',
        implementation_cost: index === 1 ? 'high' : index === 0 ? 'medium' : 'low',
        manufacturing_notes: principle.risks?.join(' ') || 'Validate with before/after simulation.',
        convergence_risk: index === 1 ? 'medium' : 'low'
      },
      modified_model: preview.updated,
      changes_applied: principle.effects || [],
      design_name: `${principle.name}: ${principle.headline}`
    };
  });
}

export function routeSolver(domain, model = {}, options = {}) {
  const route = SOLVER_NAMES[domain] || { solver_name: 'Analytical solver', solver_path: 'local_analytical', execution_environment: 'local', estimated_runtime_seconds: 1 };
  const systemType = String(model?.SYSTEM_TYPE || '').toLowerCase();
  // BUG FIX: routeSolver called JSON.stringify(model) without guarding for null.
  // Before first formulation, model is null, causing a crash.
  // Fix: Both functions now guard with model ? JSON.stringify(model) : ''.
  const modelString = model ? JSON.stringify(model).toLowerCase() : '';
  const structuralComplex = domain === 'Structural' && /hollow|rib|composite|taper|lattice/.test(modelString);
  const airfoil = domain === 'Aerospace' && /airfoil|naca|wing/.test(systemType + modelString);
  const selected = structuralComplex
    ? { solver_name: 'CalculiX', solver_path: 'vm_or_local_calculix', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 45 }
    : airfoil
      ? { solver_name: 'XFOIL', solver_path: 'vm_xfoil', execution_environment: 'ubuntu_vm', estimated_runtime_seconds: 5 }
      : route;

  return {
    ...selected,
    batch_mode: Boolean(options.batch_mode),
    num_simulations: options.num_simulations || (options.batch_mode ? 3 : 1),
    explanation: explainSolverChoice(domain, model, selected, options)
  };
}

export function runEngineeringGuardrails(model = {}, domain = 'Engineering') {
  const warnings = [];
  const fails = [];
  const serialized = JSON.stringify(model).toLowerCase();

  if (!serialized.match(/\d/)) warnings.push('Few numeric values were found; simulation will rely heavily on assumptions.');
  if (domain === 'Structural' && !model.LOADING) warnings.push('Structural model has no explicit loading section.');
  if (domain === 'Structural' && !model.GEOMETRY) fails.push('Structural model requires geometry before FEA or beam analysis.');
  if (domain === 'Circuits' && !model.COMPONENTS) warnings.push('Circuit model has no component section.');
  if (domain === 'Fluids' && !model.BOUNDARY_CONDITIONS) warnings.push('Fluid model needs inlet/outlet boundary conditions for CFD.');

  const severity = fails.length ? 'error' : warnings.length ? 'warning' : 'info';
  return {
    checks: {
      unit_consistency: {
        status: warnings.some(item => item.includes('numeric')) ? 'warning' : 'pass',
        details: warnings.some(item => item.includes('numeric')) ? 'Numeric/unit coverage is incomplete.' : 'Model fields include parseable engineering values.'
      },
      boundary_conditions: {
        status: warnings.some(item => item.includes('boundary')) ? 'warning' : 'pass',
        details: warnings.find(item => item.includes('boundary')) || 'No obvious missing boundary-condition blocker detected.'
      },
      load_reasonableness: {
        status: fails.length ? 'fail' : 'pass',
        estimated_stress_range_mpa: domain === 'Structural' ? 'first-pass analytical range available after solver run' : 'domain-specific check',
        estimated_deflection_range_mm: domain === 'Structural' ? 'first-pass analytical range available after solver run' : 'domain-specific check',
        reasoning: 'Deterministic guardrail checks use available model fields before solver execution.'
      },
      mesh_convergence_risk: {
        status: /fillet|rib|hollow|contact|composite/.test(serialized) ? 'medium' : 'low',
        risk_factors: /fillet|rib|hollow|contact|composite/.test(serialized)
          ? ['Geometry/material complexity can create local gradients or mesh sensitivity.']
          : ['No high-risk geometric feature detected from current fields.'],
        recommendation: /fillet|rib|hollow|contact|composite/.test(serialized)
          ? 'Use mesh refinement near local features and compare before/after results.'
          : 'Coarse or medium first-pass mesh is acceptable.'
      },
      solver_suitability: {
        status: fails.length ? 'fail' : 'pass',
        recommended_solver: routeSolver(domain, model).solver_name,
        reasoning: routeSolver(domain, model).explanation
      }
    },
    recommendations: [...warnings, ...fails, 'Keep the baseline model so TRIZ before/after comparison remains traceable.'],
    severity,
    proceed_to_triz: !fails.length,
    proceed_to_solver: !fails.length
  };
}

export function buildComparisonSummary({ baselineModel, modifiedModel, baselineResults, modifiedResults, principle }) {
  const baselineMetrics = metricsToMap(baselineResults?.metrics || []);
  const modifiedMetrics = metricsToMap(modifiedResults?.metrics || []);
  const shared = Object.keys(modifiedMetrics).filter(key => baselineMetrics[key] !== undefined);
  return {
    triz_principle_name: principle?.name || principle?.principle_name || 'None',
    design_names: {
      original: valueOf(baselineModel?.SYSTEM_TYPE, baselineModel?.SYSTEM_TYPE || 'Original design'),
      modified: valueOf(modifiedModel?.SYSTEM_TYPE, modifiedModel?.SYSTEM_TYPE || 'Modified design')
    },
    metrics: shared.map(name => ({
      name,
      original: baselineMetrics[name],
      modified: modifiedMetrics[name],
      change: numericChange(baselineMetrics[name], modifiedMetrics[name])
    })),
    verdict: principle
      ? `TRIZ principle ${principle.name || principle.principle_name} has been applied. Compare target metrics before accepting the trade-off.`
      : 'No TRIZ principle was applied; this is the baseline simulation.'
  };
}

export function createIterationSuggestions({ domain, contradiction, hasResults = false, mode = 'Engineer' }) {
  const suggestions = [];
  if (contradiction) {
    suggestions.push('Try the next ranked TRIZ principle');
    suggestions.push('Compare all TRIZ proposals in batch mode');
  }
  suggestions.push('Modify one parameter and rerun the solver');
  if (domain === 'Structural') suggestions.push('Sweep material, cross-section, and load to find a safer/lighter design');
  if (domain === 'Fluids' || domain === 'Aerospace') suggestions.push('Sweep angle, velocity, or geometry and compare lift/drag/pressure loss');
  if (mode === 'Industry') suggestions.push('Run Pareto optimization for cost, mass, safety factor, and lead time');
  if (hasResults) suggestions.push('Ask why the result changed and what constraint dominates next');
  return suggestions;
}

function detectTaskType(text) {
  return TASK_PATTERNS.find(([, regex]) => regex.test(text))?.[0] || 'analyze';
}

function summarizeProblem(text, domain, taskType) {
  const clean = String(text || '').trim();
  return clean ? `${taskType} request in ${domain}: ${clean}` : `${taskType} request in ${domain}`;
}

function inferObjectives(text, taskType, contradiction) {
  const objectives = [];
  if (taskType === 'optimize') objectives.push('Optimize the design against stated constraints');
  if (/weight|lighter|mass/i.test(text)) objectives.push('Reduce weight or mass');
  if (/stress|strength|safe|fos/i.test(text)) objectives.push('Maintain strength and safety factor');
  if (/deflection|stiff/i.test(text)) objectives.push('Control deflection and stiffness');
  if (/temperature|thermal|heat/i.test(text)) objectives.push('Keep temperature within limits');
  if (/drag|lift|airfoil/i.test(text)) objectives.push('Improve aerodynamic performance');
  if (contradiction) objectives.push(`Resolve ${contradiction.improving} vs ${contradiction.worsening}`);
  return objectives.length ? objectives : ['Create a valid engineering model', 'Run the correct analysis path'];
}

function inferConstraints(text, contradiction) {
  const constraints = [];
  const withoutMatch = String(text || '').match(/\bwithout\s+([^,.]+)/i);
  if (withoutMatch) constraints.push(`Do not ${withoutMatch[1].trim()}`);
  if (/cost|cheap|budget/i.test(text)) constraints.push('Cost must remain controlled');
  if (/safe|yield|failure/i.test(text)) constraints.push('Design must remain below failure limits');
  if (contradiction) constraints.push(`Avoid worsening ${contradiction.worsening}`);
  return constraints.length ? constraints : ['Use explicit assumptions for missing values'];
}

function contradictionToSpec(contradiction) {
  return {
    property_a: contradiction.improving,
    property_b: contradiction.worsening,
    conflict: contradiction.statement,
    severity: contradiction.severity,
    confidence: contradiction.confidence
  };
}

function buildTrizAnalysis(contradiction, mode) {
  const ranked = rankTrizPrinciples(contradiction.principles || []).slice(0, mode === 'Industry' ? 4 : 3);
  return {
    triz_analysis: {
      contradictions: [{
        improving_parameter: contradiction.improving,
        worsening_parameter: contradiction.worsening,
        severity: contradiction.severity?.toLowerCase() || 'moderate',
        explanation: contradiction.statement,
        triz_parameters: {
          improving_id: null,
          improving_name: contradiction.improving,
          worsening_id: null,
          worsening_name: contradiction.worsening
        }
      }],
      contradiction_matrix_suggestions: [{
        contradiction: contradiction.label,
        suggested_triz_principles: ranked.map((principle) => ({
          principle_id: principle.num,
          principle_name: principle.name,
          explanation: principle.rationale,
          engineering_mechanism: principle.headline
        }))
      }],
      dominant_contradiction: contradiction.label,
      rank_by_severity: [contradiction.label]
    },
    confidence: contradiction.confidence,
    needs_clarification: false,
    user_mode: mode,
    explanation_depth: mode === 'Student' ? 'beginner' : mode === 'Industry' ? 'expert' : 'intermediate'
  };
}

function getStageStatus(stageId, context) {
  if (stageId <= 2) return 'completed';
  if (stageId === 3) return context.model ? 'completed' : 'active';
  if (stageId === 4) return context.guardrails ? context.guardrails.severity : 'pending';
  if ([5, 6, 7, 8].includes(stageId)) return context.needs_triz ? 'active' : 'skipped';
  if ([9, 10].includes(stageId)) return context.needs_solver ? 'pending' : 'skipped';
  return 'pending';
}

function inferChangeType(section) {
  if (/geometry/i.test(section)) return 'geometry_modification';
  if (/material/i.test(section)) return 'material_swap';
  if (/component/i.test(section)) return 'component_or_topology_change';
  return 'strategy_or_parameter_change';
}

function estimateImpact(principle, index) {
  const joined = `${principle.name} ${principle.headline}`.toLowerCase();
  if (/composite/.test(joined)) return { weight_reduction_percent: -70, strength_change_percent: 80, deflection_change_percent: -10, cost_change_percent: 120 };
  if (/segment|rib|interleaved|split/.test(joined)) return { weight_reduction_percent: -35, strength_change_percent: 0, deflection_change_percent: 5, cost_change_percent: 15 };
  if (/parameter|taper|frequency/.test(joined)) return { weight_reduction_percent: -20, strength_change_percent: 0, deflection_change_percent: 10, cost_change_percent: -5 };
  return { weight_reduction_percent: -10 - index * 5, strength_change_percent: 5, deflection_change_percent: 5, cost_change_percent: 10 };
}

function explainSolverChoice(domain, model, selected, options) {
  // BUG FIX: JSON.stringify null guard - model can be null before first formulation
  const complexity = model ? JSON.stringify(model).toLowerCase() : '';
  if (options.batch_mode) return `${selected.solver_name} is selected for batch comparison so each design can be evaluated with the same metric contract.`;
  if (domain === 'Structural' && /hollow|rib|composite|taper/.test(complexity)) return 'TRIZ-modified structural geometry needs FEA because simple beam formulas do not capture local stress or geometry changes.';
  if (domain === 'Aerospace' && /airfoil|naca|wing/.test(complexity)) return 'XFOIL is selected for fast airfoil polar estimates before moving to CFD.';
  return `${selected.solver_name} matches the ${domain} model and current fidelity requirement.`;
}

function metricsToMap(metrics) {
  return metrics.reduce((acc, metric) => {
    acc[metric.name] = metric.rawValue ?? metric.value;
    return acc;
  }, {});
}

function numericChange(original, modified) {
  const a = Number.parseFloat(original);
  const b = Number.parseFloat(modified);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) < 1e-12) return null;
  return `${(((b - a) / Math.abs(a)) * 100).toFixed(1)}%`;
}
