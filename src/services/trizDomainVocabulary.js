/**
 * trizDomainVocabulary.js — Domain language -> TRIZ parameter mapping
 *
 * PROBLEM THIS SOLVES:
 * The original triz.js hand-wrote ~12 fully bespoke contradiction objects
 * (one scenario per domain, mostly). That tops out fast: every new kind of
 * trade-off needs a brand-new hand-authored object with its own keyword
 * lists, statement text, and principle write-ups. It cannot generalize to
 * problem #500 or #1000 unless someone manually writes problem #500.
 *
 * INSTEAD: each domain gets a vocabulary map — a list of (TRIZ parameter
 * number, the words/phrases that signal it in THIS domain's language).
 * Detection becomes: "which two parameters does this sentence touch?" ->
 * look up that exact pair in the real 39x39 matrix (trizKnowledge.js) ->
 * get back historically-grounded, real principle numbers.
 *
 * This scales combinatorially: 9 domains x ~12-18 parameters each already
 * covers the vast majority of (improving, worsening) pairs a real
 * engineering question can express, without writing new code per scenario.
 * New scenarios are handled automatically as long as the words used map to
 * a parameter already in the vocabulary — which is far more durable than
 * matching one scenario's exact phrasing.
 *
 * Each parameter mapping carries:
 *   - param: the TRIZ parameter number (1-39) this maps to
 *   - terms: words/phrases in THIS domain that signal that parameter
 *   - industrialNote: a domain-specific reminder of what to check
 *     numerically when this parameter is involved (keeps the
 *     "trustable to engineers" bar — concrete, checkable, not just prose)
 */

const dv = (param, terms, industrialNote) => ({ param, terms, industrialNote });

export const DOMAIN_VOCABULARY = {
  Circuits: [
    dv(11, ['ripple', 'ripple voltage', 'noise', 'stability', 'regulation', 'load regulation'],
      'Quantify ripple as peak-to-peak and as % of nominal output; check against the datasheet/spec limit, not a feeling of "too noisy".'),
    dv(7, ['size', 'volume', 'footprint', 'large', 'bulky', 'compact', 'small'],
      'State the actual board area or component volume (mm³/mm²) before and after — "smaller" is not a verifiable claim without it.'),
    dv(22, ['loss', 'efficiency', 'switching loss', 'conduction loss', 'power loss'],
      'Break total loss into conduction + switching + magnetic/core loss separately; a single aggregate efficiency number hides which term dominates.'),
    dv(17, ['heat', 'temperature', 'thermal', 'hot', 'overheat'],
      'Check junction/case temperature against the component\'s absolute maximum rating with margin, not just "it feels warm".'),
    dv(9, ['speed', 'switching frequency', 'fast', 'slew rate', 'bandwidth'],
      'Confirm the controller/compensation loop is still stable at the new switching frequency before claiming the change is free.'),
    dv(27, ['reliability', 'lifetime', 'stress', 'derating', 'mtbf'],
      'Check component stress (voltage, current, thermal) against datasheet derating guidelines, not just nominal operating point.'),
    dv(14, ['accuracy', 'precision', 'tolerance', 'accurate'],
      'State the accuracy requirement as a numeric tolerance (e.g. ±1%) and verify worst-case component tolerance stack-up meets it.'),
    dv(21, ['current draw', 'power draw', 'quiescent current', 'battery drain'],
      'Quantify current draw at the actual operating point, not just "low power" — battery life depends on the real number.'),
    dv(36, ['complexity', 'parts count', 'bom', 'component count'],
      'Count added components/interfaces explicitly; complexity has a real reliability and cost cost, not just an aesthetic one.'),
    dv(33, ['manufacturability', 'assembly', 'soldering', 'layout'],
      'Check footprint/clearance/thermal-via rules against the actual PCB manufacturing capability, not an idealized layout.')
  ],

  Structural: [
    dv(14, ['strength', 'strong', 'yield', 'failure', 'safety factor', 'stress'],
      'Compare peak stress to yield/ultimate strength with an explicit numeric safety factor, separated from deflection/serviceability checks.'),
    dv(1, ['weight', 'mass', 'heavy', 'light', 'lighter'],
      'State actual mass in kg/lb before and after the change, not a qualitative "lighter".'),
    dv(13, ['stiffness', 'stiff', 'deflection', 'bend', 'rigid', 'flex'],
      'Check deflection against a serviceability limit (e.g. L/240) independently from the strength/yield check.'),
    dv(32, ['manufacturability', 'machine', 'weld', 'cast', 'fabricate'],
      'Verify the new geometry/material is actually weldable/machinable at the tolerances assumed, not just theoretically possible.'),
    dv(36, ['complexity', 'joints', 'connections', 'parts'],
      'Count new joints/connections; each one is a real stress concentration and inspection point, not free complexity.'),
    dv(27, ['fatigue', 'cyclic', 'life', 'durability'],
      'Run an explicit fatigue/S-N or Goodman check if the load is cyclic — static yield margin alone does not establish fatigue life.')
    // NOTE: cost is intentionally NOT mapped to any of the 39 parameters
    // here. Classic TRIZ has no dedicated "cost" parameter, and mapping it
    // onto "weight of stationary object" (an earlier draft's mistake) would
    // silently mislabel the contradiction. If cost language is the only
    // signal detected, the engine should fall through to a domain-neutral
    // fallback rather than cite a parameter that doesn't actually mean cost.
  ],

  Fluids: [
    dv(9, ['flow', 'flow rate', 'velocity', 'throughput', 'faster flow'],
      'State the flow rate/velocity numerically and the Reynolds number regime (laminar/turbulent) it implies.'),
    dv(22, ['pressure drop', 'loss', 'friction', 'drag', 'head loss'],
      'Separate major (wall friction) losses from minor losses (bends, contractions, expansions) instead of one lumped pressure-drop number.'),
    dv(31, ['noise', 'acoustic', 'vibration', 'cavitation'],
      'Check cavitation margin (NPSH) and flow-induced noise sources explicitly if velocity is increased.'),
    dv(21, ['pump power', 'fan power', 'energy', 'pumping power'],
      'Recompute pump/fan operating point against the system curve after any geometry change — power doesn\'t scale linearly with flow.'),
    dv(7, ['size', 'envelope', 'compact', 'diameter', 'duct size'],
      'State actual duct/pipe cross-section dimensions; "bigger" needs a number for downstream packaging checks.'),
    dv(28, ['accuracy', 'measurement', 'sensor'],
      'Verify flow/pressure sensor placement avoids disturbed flow regions that bias the reading.')
  ],

  Semiconductors: [
    dv(10, ['drive current', 'on current', 'transconductance', 'gm', 'current'],
      'Report drive current at a stated Vgs/Vds operating point — current alone without bias conditions is not comparable.'),
    dv(31, ['leakage', 'tunneling', 'subthreshold leakage', 'off current'],
      'Quantify leakage as Ioff at the rated Vds, and separate gate leakage from subthreshold leakage — they have different root causes.'),
    dv(17, ['heat', 'power density', 'self-heating', 'thermal'],
      'Check power density (W/mm²) against the package\'s thermal resistance, not just total power.'),
    dv(9, ['speed', 'switching speed', 'fast', 'frequency'],
      'Check switching speed against the gate-drive capability and parasitic capacitance, not in isolation.'),
    dv(35, ['scaling', 'channel length', 'node', 'process'],
      'State the actual technology node/channel length; short-channel effects (DIBL, Vth roll-off) depend on this explicitly.'),
    dv(27, ['reliability', 'breakdown', 'degradation', 'hot carrier'],
      'Check oxide breakdown voltage and hot-carrier degradation margin against the actual operating voltage, with margin.')
  ],

  Aerospace: [
    dv(21, ['thrust', 'isp', 'specific impulse', 'performance'],
      'State Isp and thrust at the specific operating condition (sea level vs vacuum) — they are not interchangeable numbers.'),
    dv(1, ['weight', 'mass', 'heavy', 'payload'],
      'State actual mass budget impact in kg, tied to the specific subsystem, not a generic "lighter is better".'),
    dv(7, ['size', 'length', 'envelope', 'packaging'],
      'Check the launch/stowed envelope constraint explicitly, separate from the deployed/operational envelope.'),
    dv(17, ['thermal', 'heat', 'cooling', 'reentry heating'],
      'Check wall/structure temperature against material limits at the worst-case point in the trajectory, not an average.'),
    dv(27, ['reliability', 'redundancy', 'failure', 'single point failure'],
      'Identify single-point failure modes explicitly before claiming a redundancy or deployment mechanism improves reliability.'),
    dv(11, ['stress', 'structural load', 'pressure', 'aerodynamic load'],
      'Check structural margin at the worst-case load case across the full flight envelope, not just nominal cruise/operating point.')
  ],

  Thermal: [
    dv(17, ['temperature', 'thermal', 'heat', 'hot', 'junction temperature'],
      'State the actual junction/case temperature rise (ΔT) against ambient, not a qualitative "too hot".'),
    dv(7, ['size', 'heatsink size', 'volume', 'envelope', 'compact'],
      'State heatsink volume/footprint numerically; thermal resistance and size trade off in a way that needs real numbers.'),
    dv(31, ['noise', 'fan noise', 'acoustic'],
      'Check fan acoustic spec (dBA) at the airflow operating point required, not just "needs more airflow".'),
    dv(21, ['power', 'fan power', 'pump power'],
      'Recompute total system power draw including the cooling solution itself, not just the component being cooled.'),
    dv(36, ['complexity', 'vapor chamber', 'heat pipe', 'liquid cooling'],
      'Weigh added complexity (leak risk, assembly steps) of advanced cooling against the simpler passive option\'s actual shortfall.'),
    dv(11, ['thermal stress', 'cte mismatch', 'warpage'],
      'Check CTE mismatch-induced stress at solder joints/interfaces if materials with different expansion coefficients are combined.')
  ],

  Control: [
    dv(9, ['response', 'fast response', 'settling time', 'tracking', 'speed'],
      'State settling time/rise time numerically against the actual requirement, not "faster" in the abstract.'),
    dv(13, ['stability', 'oscillation', 'margin', 'overshoot'],
      'Check gain margin and phase margin explicitly (not just "looks stable" in a step response plot).'),
    dv(31, ['noise', 'noise amplification', 'sensor noise'],
      'Check derivative-term noise amplification specifically; this is the most common source of "fast but noisy" control behavior.'),
    dv(10, ['actuator effort', 'saturation', 'actuator', 'control effort'],
      'Check actuator output against its physical saturation limit under the proposed gains, including recovery behavior after saturation.'),
    dv(36, ['complexity', 'controller complexity', 'gain scheduling'],
      'Count added control states/modes explicitly; each one needs its own stability and transition-behavior validation.')
  ],

  Materials: [
    dv(14, ['strength', 'yield', 'ultimate', 'toughness'],
      'State yield and ultimate strength as numbers from a material datasheet, not a qualitative "strong/weak" comparison.'),
    dv(27, ['fatigue', 'fatigue life', 'crack', 'durability'],
      'Run a fatigue/S-N check separately from static strength — a material can have ample yield margin and still fail in fatigue.'),
    dv(1, ['weight', 'mass', 'density', 'heavy', 'light'],
      'State material density and resulting part mass numerically.'),
    // NOTE: cost intentionally not mapped to a TRIZ-39 parameter — see the
    // identical note in the Structural domain section above. Classic TRIZ
    // has no dedicated cost parameter; do not mislabel it as weight.
    dv(31, ['corrosion', 'environmental degradation', 'oxidation'],
      'Check corrosion resistance against the actual service environment (humidity, salt, chemical exposure), not a generic rating.'),
    dv(32, ['manufacturability', 'weldability', 'machinability'],
      'Verify the joining/forming method assumed is actually compatible with the chosen material grade.')
  ],

  Power: [
    dv(27, ['reliability', 'uptime', 'fault', 'ride-through'],
      'Define the specific fault scenario and required ride-through time/voltage sag depth, not a generic "more reliable".'),
    dv(22, ['loss', 'efficiency', 'losses'],
      'Break losses into conduction, switching, and magnetic components rather than reporting one aggregate efficiency figure.'),
    dv(7, ['size', 'footprint', 'cabinet size', 'compact'],
      'State actual enclosure/cabinet volume; size and protection/filtering complexity trade off with real numbers.'),
    dv(17, ['thermal', 'thermal stress', 'heat'],
      'Check component SOA (safe operating area) against thermal stress at the worst-case fault/transient condition.'),
    dv(36, ['protection complexity', 'coordination', 'relay complexity'],
      'Count protection zones/relay coordination steps explicitly; each added zone needs its own selectivity/timing validation.'),
    dv(11, ['fault current', 'inrush', 'transient', 'surge'],
      'Quantify peak fault/inrush current against breaker/component withstand rating, not a qualitative "high current" claim.')
  ],

  Physics: [
    dv(9, ['speed', 'velocity', 'fast'],
      'State velocity numerically with units and reference frame.'),
    dv(1, ['mass', 'weight', 'heavy', 'light'],
      'State mass numerically; weight depends on local g and should not be conflated with mass.'),
    dv(10, ['force', 'tension', 'applied force'],
      'State force magnitude and direction explicitly as a vector, not just a scalar description.'),
    dv(13, ['stability', 'equilibrium', 'tipping', 'balance'],
      'Check the actual stability criterion (e.g. center of mass vs base of support) rather than an intuitive judgment.')
  ]
};

/**
 * Resolve free text against a domain's vocabulary list, returning every
 * parameter that has at least one matched term, with the matched terms
 * kept for evidence/transparency.
 *
 * @param {string} lowerText - already-lowercased input text
 * @param {string} domain - domain key in DOMAIN_VOCABULARY
 * @returns {Array<{param:number, matchedTerms:string[], industrialNote:string}>}
 */
export function matchVocabulary(lowerText, domain) {
  const list = DOMAIN_VOCABULARY[domain] || [];
  const hits = [];
  for (const entry of list) {
    const matched = entry.terms.filter((term) => lowerText.includes(term.toLowerCase()));
    if (matched.length > 0) {
      hits.push({ param: entry.param, matchedTerms: matched, industrialNote: entry.industrialNote });
    }
  }
  return hits;
}

export function getDomainVocabulary(domain) {
  return DOMAIN_VOCABULARY[domain] || [];
}

export function getAllDomains() {
  return Object.keys(DOMAIN_VOCABULARY);
}
