const DOMAIN_PATTERNS = [
  ['Physics', /\b(physics|pulley|atwood|block a|block b|inclined plane|spring|shm|circular motion|centripetal|wave|collision|momentum)\b/i],
  ['Circuits', /\b(circuit|voltage divider|buck|converter|filter|mosfet|op.?amp|resistor|capacitor|inductor|spice)\b/i],
  ['Structural', /\b(beam|cantilever|truss|frame|weld|fea|stress|deflection|buckling)\b/i],
  ['Thermal', /\b(thermal|heat sink|heatsink|junction|ambient|convection|temperature)\b/i],
  ['Aerospace', /\b(wing|airfoil|naca|nozzle|mach|thrust|rocket|drag|lift)\b/i],
  ['Control', /\b(pid|controller|transfer function|settling|overshoot|stability)\b/i],
  ['Materials', /\b(material|fatigue|yield|ultimate|endurance|alloy)\b/i],
  ['Power', /\b(transformer|power flow|kwh|energy|efficiency|losses|pandapower)\b/i]
];

const PROBLEM_PATTERNS = [
  ['spring_pulley_shm', /\b(spring|stiffness|shm|unstretched)\b/i],
  ['voltage_divider', /\bvoltage\s+divider\b/i],
  ['buck_converter', /\bbuck|converter|ripple\b/i],
  ['cantilever_beam', /\bcantilever|beam\b/i],
  ['finite_wing', /\bwing|airfoil|naca\b/i],
  ['nozzle', /\bnozzle|throat|mach\b/i],
  ['heatsink', /\bheat\s*sink|heatsink\b/i],
  ['pid_tuning', /\bpid\b/i],
  ['fatigue', /\bfatigue|cycles\b/i],
  ['transformer', /\btransformer\b/i]
];

export function routeIntent(message, fallbackDomain = 'Engineering') {
  const text = String(message || '');
  const domainMatch = DOMAIN_PATTERNS.find(([, regex]) => regex.test(text));
  const problemMatch = PROBLEM_PATTERNS.find(([, regex]) => regex.test(text));
  const wantsUpdate = /\b(change|set|update|modify|increase|decrease|tune)\b/i.test(text);
  const wantsRun = /\b(run|simulate|solve|calculate|compute|design|analyze|plot)\b/i.test(text);
  const wantsExplain = /\b(explain|why|how does|what does)\b/i.test(text) && !wantsRun && !wantsUpdate;

  return {
    domain: domainMatch?.[0] || fallbackDomain,
    problem_type: problemMatch?.[0] || 'general',
    action: wantsUpdate ? 'update_and_run' : wantsRun ? 'formulate_and_run' : wantsExplain ? 'explain' : 'formulate',
    confidence: domainMatch ? 0.88 : 0.55,
    source: 'server_intent_router'
  };
}
