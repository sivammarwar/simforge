export const DOMAIN_SCHEMAS = {
  Default: {
    label: 'Auto Detect',
    problemTypes: ['auto_detect'],
    tools: ['intent_router']
  },
  Physics: {
    label: 'Physics Mechanics',
    problemTypes: ['pulley_block', 'inclined_pulley', 'spring_pulley_shm', 'ladder_slip', 'spool_rolling', 'circular_motion', 'wave_motion', 'collision_momentum', 'rotational_dynamics'],
    requiredSignals: ['mass', 'force', 'friction', 'spring', 'radius', 'velocity', 'frequency', 'angle'],
    tools: ['scipy_mechanics', 'analytical_mechanics']
  },
  Circuits: {
    label: 'Circuits & Electronics',
    problemTypes: ['voltage_divider', 'buck_converter', 'rc_filter', 'mosfet_amplifier'],
    requiredSignals: ['voltage', 'current', 'resistance', 'capacitance', 'inductance', 'frequency'],
    tools: ['ngspice', 'ltspice', 'analytical_circuits']
  },
  Structural: {
    label: 'Structural & Mechanical FEA',
    problemTypes: ['cantilever_beam', 'truss', 'frame', 'weld', 'fatigue_structural'],
    requiredSignals: ['length', 'load', 'material', 'youngs_modulus', 'section'],
    tools: ['calculix', 'analytical_structural']
  },
  Fluids: {
    label: 'Fluid Dynamics CFD',
    problemTypes: ['internal_flow', 'duct_flow', 'sudden_expansion', 'pressure_drop'],
    requiredSignals: ['diameter', 'length', 'velocity', 'flow_rate', 'fluid', 'viscosity'],
    tools: ['openfoam', 'analytical_fluids']
  },
  Semiconductors: {
    label: 'Semiconductor TCAD',
    problemTypes: ['mosfet_iv', 'tcad_setup'],
    requiredSignals: ['gate_length', 'width', 'oxide', 'bias'],
    tools: ['spice_level1', 'analytical_semiconductor']
  },
  Aerospace: {
    label: 'Aerospace & Aerodynamics',
    problemTypes: ['finite_wing', 'airfoil', 'nozzle'],
    requiredSignals: ['span', 'chord', 'airfoil', 'mach', 'pressure', 'temperature'],
    tools: ['xfoil', 'openfoam', 'isentropic_solver', 'lifting_line']
  },
  Thermal: {
    label: 'Thermal & Heat Transfer',
    problemTypes: ['heatsink', 'thermal_via', 'thermal_network'],
    requiredSignals: ['power', 'temperature', 'thermal_resistance', 'convection'],
    tools: ['elmer', 'thermal_budget']
  },
  Control: {
    label: 'Control Systems',
    problemTypes: ['pid_tuning', 'step_response', 'stability'],
    requiredSignals: ['transfer_function', 'settling_time', 'overshoot'],
    tools: ['python_control', 'analytical_control']
  },
  Materials: {
    label: 'Materials Engineering',
    problemTypes: ['fatigue', 'material_selection', 'yield_check'],
    requiredSignals: ['stress', 'cycles', 'yield_strength', 'ultimate_strength'],
    tools: ['material_database', 'analytical_materials']
  },
  Power: {
    label: 'Power & Energy Systems',
    problemTypes: ['transformer', 'energy_cost', 'power_flow', 'load_flow'],
    requiredSignals: ['buses', 'voltage', 'current', 'power', 'efficiency'],
    tools: ['pandapower', 'power_balance']
  }
};

export const PROBLEM_TYPE_PATTERNS = [
  ['Semiconductors', 'mosfet_iv', /\b(mosfet|n-channel|n channel|vgs|vds|threshold voltage|drain current|oxide thickness|channel length|tcad|carrier concentration|electric potential)\b/i],
  ['Fluids', 'sudden_expansion', /\b(sudden\s+(?:pipe\s+)?expansion|pipe expansion|inlet diameter|outlet diameter|flow rate|recirculation|streamline|velocity contour|pressure contour)\b/i],
  ['Power', 'load_flow', /\b(load flow|power flow|slack bus|pv bus|pq bus|bus voltages|line losses|reactive power|single-line|single line|5-bus|5 bus)\b/i],
  ['Physics', 'ladder_slip', /\b(ladder|smooth wall|rough floor|climb|climbs|slipping|slip occurs|maximum distance)\b/i],
  ['Physics', 'spool_rolling', /\b(spool|inner radius|outer radius|string wound|critical angle|motion reverses|rolling spool)\b/i],
  ['Physics', 'spring_pulley_shm', /\b(spring|stiffness|shm|oscillat|unstretched)\b.*\b(pulley|block|string|rope)\b|\b(pulley|block|string|rope)\b.*\b(spring|stiffness|shm|oscillat|unstretched)\b/i],
  ['Physics', 'inclined_pulley', /\b(incline|inclined plane|slope)\b.*\b(pulley|block|string|rope|tension)\b/i],
  ['Physics', 'pulley_block', /\b(pulley|atwood|block a|block b|hanging block|tension|string|rope)\b/i],
  ['Physics', 'circular_motion', /\b(circular motion|centripetal|radius|angular velocity|rpm)\b/i],
  ['Physics', 'wave_motion', /\b(wave|standing wave|wavelength|frequency|amplitude)\b/i],
  ['Circuits', 'voltage_divider', /\bvoltage\s+divider|divider\b/i],
  ['Circuits', 'buck_converter', /\bbuck|dc.?dc|converter|ripple|inductor|esr\b/i],
  ['Circuits', 'rc_filter', /\brc|filter|cutoff|bode|low.pass|high.pass\b/i],
  ['Structural', 'cantilever_beam', /\bcantilever|beam|deflection|bending|von mises|fea\b/i],
  ['Structural', 'truss', /\btruss|member force|method of joints\b/i],
  ['Aerospace', 'finite_wing', /\bwing|airfoil|naca|lift|induced drag|span|chord|uav\b/i],
  ['Aerospace', 'nozzle', /\bnozzle|throat|mach|rocket|thrust|expansion ratio\b/i],
  ['Thermal', 'heatsink', /\bheat\s*sink|heatsink|thermal resistance|junction|ambient|convection\b/i],
  ['Control', 'pid_tuning', /\bpid|controller|transfer function|settling|overshoot|step response\b/i],
  ['Materials', 'fatigue', /\bfatigue|cycles|endurance|goodman|yield|ultimate|material\b/i],
  ['Power', 'transformer', /\btransformer|primary voltage|secondary voltage|efficiency|losses\b/i]
];

export function detectProblemType(promptText, fallbackDomain = 'Default') {
  const matched = PROBLEM_TYPE_PATTERNS.find(([, , pattern]) => pattern.test(promptText));
  if (matched) {
    const [domain, problemType] = matched;
    return { domain, problemType, confidence: 0.9 };
  }
  return {
    domain: fallbackDomain === 'Default' ? 'Default' : fallbackDomain,
    problemType: 'general',
    confidence: 0.55
  };
}

export function getDomainSchema(domain) {
  return DOMAIN_SCHEMAS[domain] || DOMAIN_SCHEMAS.Default;
}
