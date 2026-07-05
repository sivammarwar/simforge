// Industrial TRIZ contradiction engine for SimForge.
// Detects engineering trade-offs, explains the evidence, and applies model-safe changes.
//
// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE (v2 — matrix-grounded detection)
// ─────────────────────────────────────────────────────────────────────────────
// v1 of this file matched free text against ~12 hand-written scenario
// objects using tuned keyword-overlap scoring. That is fine for the exact
// dozen scenarios it knew about, but it cannot generalize: a new problem
// either matches one of the ~12 hand-written templates closely enough, or
// it falls through to one single generic fallback template. It also never
// cited a *real* TRIZ principle number/parameter pairing — the "TRIZ
// Principle N" labels were attached by hand per scenario, not derived from
// the actual 39x39 contradiction matrix.
//
// v2 adds a second, primary detection path that is grounded in real TRIZ
// data (see trizKnowledge.js + trizDomainVocabulary.js):
//
//   1. Map the user's words to TRIZ's 39 standard engineering parameters,
//      using a domain-specific vocabulary (trizDomainVocabulary.js).
//   2. Resolve the (improving, worsening) parameter pair against the real
//      39x39 Altshuller contradiction matrix (trizKnowledge.js).
//   3. Return the historically-grounded principle numbers for that pair —
//      never an invented one. If the matrix has no entry for that exact
//      pair, fall back to a small set of generically high-utility
//      principles, and say so explicitly (source: 'fallback').
//
// The original ~12 hand-written scenario objects (CONTRADICTIONS below) are
// KEPT, unchanged, as a secondary enrichment layer: when one of them also
// matches, its concrete `apply()` model patches, industrial checks, and
// worked validation steps are attached to the matrix-grounded result as a
// ready-to-apply implementation of one of the cited principles. They no
// longer compete with the matrix as the source of truth for *which*
// principle is correct — they supply the worked engineering detail once a
// principle has already been grounded.
//
// This is what lets the engine scale across many more problems than the
// ~12 it has bespoke content for: every problem gets a real, matrix-backed
// contradiction + principle citation; only some problems additionally get
// a fully worked apply()/patch implementation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TRIZ_PARAMETERS,
  TRIZ_PRINCIPLES,
  getRankedPrinciples,
  matrixHasCoverage,
  resolveParameter,
  resolvePrinciple
} from './trizKnowledge.js';

import { matchVocabulary, getDomainVocabulary } from './trizDomainVocabulary.js';

const cloneModel = (model) => JSON.parse(JSON.stringify(model || {}));

const setField = (model, section, field, value, explanation) => {
  if (!model[section] || typeof model[section] !== 'object') {
    model[section] = {};
  }
  model[section][field] = {
    value,
    tag: 'TRIZ edit',
    explanation
  };
};

const setSystemType = (model, value) => {
  model.SYSTEM_TYPE = value;
};

const containsAny = (text, words) => words.filter((word) => {
  const normalized = String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${normalized}\\b`, 'i').test(text) || text.includes(String(word).toLowerCase());
});

const DOMAIN_ALIASES = {
  Electronics: 'Circuits',
  Circuit: 'Circuits',
  SPICE: 'Circuits',
  ngspice: 'Circuits'
};

const tradeoffWords = [
  'but', 'however', 'without', 'while', 'tradeoff', 'trade-off', 'vs', 'versus',
  'too large', 'too heavy', 'too hot', 'expensive', 'leakage', 'loss', 'drop',
  'reduce', 'increase', 'lower', 'raise', 'optimize', 'improve', 'minimize',
  'maximize', 'lighter', 'cheaper', 'smaller', 'faster', 'stronger'
];

const systemTradeoffPatterns = [
  /increase\s+(.{3,48}?)\s+without\s+(increasing|raising|adding)\s+(.{3,48})/i,
  /reduce\s+(.{3,48}?)\s+without\s+(reducing|lowering|hurting|sacrificing)\s+(.{3,48})/i,
  /make\s+(.{3,48}?)\s+(smaller|lighter|faster|stronger|cheaper)\s+without\s+(.{3,58})/i,
  /(.{3,48}?)\s+vs\.?\s+(.{3,48})/i
];

const cleanConstraintText = (value) => String(value || '')
  .trim()
  .replace(/^(increasing|raising|adding|reducing|lowering|hurting|sacrificing|losing|degrading)\s+/i, '')
  .trim();

const inferContradictionFromText = (text) => {
  const lower = String(text || '').toLowerCase();
  const pattern = systemTradeoffPatterns.find((rx) => rx.test(lower));
  if (!pattern) return null;
  const match = lower.match(pattern);
  if (!match) return null;

  if (pattern === systemTradeoffPatterns[0]) {
    return {
      improving: match[1].trim(),
      worsening: cleanConstraintText(match[3]),
      evidence: `Parsed goal "${match[1].trim()}" against penalty "${cleanConstraintText(match[3])}".`
    };
  }
  if (pattern === systemTradeoffPatterns[1]) {
    return {
      improving: `lower ${match[1].trim()}`,
      worsening: cleanConstraintText(match[3]),
      evidence: `Parsed reduction goal "${match[1].trim()}" against protected behavior "${cleanConstraintText(match[3])}".`
    };
  }
  if (pattern === systemTradeoffPatterns[2]) {
    return {
      improving: `${match[1].trim()} ${match[2].trim()}`,
      worsening: cleanConstraintText(match[3]),
      evidence: `Parsed design change "${match[1].trim()} ${match[2].trim()}" against constraint "${cleanConstraintText(match[3])}".`
    };
  }
  return {
    improving: match[1].trim(),
    worsening: match[2].trim(),
    evidence: `Parsed explicit "${match[1].trim()} vs ${match[2].trim()}" trade-off.`
  };
};

const makePrinciple = ({
  num,
  name,
  headline,
  rationale,
  effects,
  risks,
  validation,
  priorityFit = ['both'],
  apply
}) => ({
  num,
  name,
  headline,
  rationale,
  effects,
  risks,
  validation,
  priorityFit,
  applyChanges: (model) => {
    const updated = cloneModel(model);
    const tag = apply(updated);
    return { updated, tag };
  }
});

const CONTRADICTIONS = {
  Circuits: [
    {
      id: 'buck-ripple-volume-efficiency',
      label: 'Converter ripple vs filter volume / loss',
      improving: 'Output stability and ripple voltage',
      worsening: 'Filter volume, switching loss, and component stress',
      improvingKeywords: ['ripple', 'noise', 'stable', 'stability', 'clean', 'output'],
      worseningKeywords: ['size', 'large', 'big', 'small', 'compact', 'loss', 'efficiency', 'heat', 'temperature'],
      contextKeywords: ['buck', 'converter', 'inductor', 'capacitor', 'esr', 'switching', 'frequency'],
      statement: 'You want lower output ripple, but the direct fixes can increase inductor/capacitor volume, switching loss, or component stress.',
      industrialChecks: [
        'Check inductor saturation current and RMS temperature rise after any inductance or frequency change.',
        'Check capacitor RMS ripple current, DC-bias derating, ESR heating, and voltage rating.',
        'Verify loop compensation because changing L, C, ESR, or switching frequency moves the power-stage poles and zeros.'
      ],
      principles: [
        makePrinciple({
          num: 19,
          name: 'Periodic Action',
          headline: 'Increase switching frequency only after checking loss budget',
          rationale: 'A higher switching frequency reduces required L and C for the same ripple target, but it also raises switching loss and may require faster layout and compensation.',
          effects: ['Smaller magnetic and capacitor values', 'Potentially faster transient response', 'Higher MOSFET switching loss and EMI risk'],
          risks: ['Thermal margin can shrink quickly', 'Controller may need compensation changes'],
          validation: ['Run ripple calculation', 'Estimate MOSFET switching loss', 'Review Bode/phase margin'],
          priorityFit: ['improving', 'both'],
          apply: (model) => {
            setField(model, 'COMPONENTS', 'Switch freq', '1.0 MHz', 'TRIZ Principle 19: higher periodic action reduces energy per cycle and filter size.');
            setField(model, 'COMPONENTS', 'Inductor (L1)', '10 µH', 'Reduced because higher switching frequency permits lower inductance for similar ripple.');
            setField(model, 'COMPONENTS', 'Capacitor (C1)', '47 µF', 'Reduced capacitance after frequency increase; verify DC-bias derating.');
            setField(model, 'COMPONENTS', 'ESR (C1)', '12 mΩ', 'Use lower ESR capacitor to keep ESR ripple controlled.');
            return 'COMPONENTS';
          }
        }),
        makePrinciple({
          num: 1,
          name: 'Segmentation',
          headline: 'Split the converter into interleaved phases',
          rationale: 'Two interleaved phases divide current stress and partially cancel input/output ripple, reducing required filter size without relying only on larger components.',
          effects: ['Lower RMS current per inductor', 'Ripple cancellation at the combined output', 'Better thermal spreading'],
          risks: ['Higher controller and layout complexity', 'Current sharing must be verified'],
          validation: ['Check phase current balance', 'Run ripple with phase offset', 'Verify BOM and layout area'],
          priorityFit: ['both'],
          apply: (model) => {
            setSystemType(model, 'Dual-Phase Interleaved Buck Converter');
            setField(model, 'COMPONENTS', 'Inductor (L1)', '10 µH x2', 'TRIZ Principle 1: segmented energy paths reduce per-phase ripple stress.');
            setField(model, 'COMPONENTS', 'Capacitor (C1)', '68 µF', 'Output capacitance can often be reduced due to interleaved ripple cancellation.');
            setField(model, 'SIMULATION', 'Output signal', 'V(out), inductor phase currents', 'Validate output ripple and current sharing together.');
            return 'COMPONENTS';
          }
        }),
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Change capacitor technology before increasing capacitance',
          rationale: 'Lower ESR/ESL capacitor technology can reduce ripple and heating while avoiding a bulky capacitance increase.',
          effects: ['Lower ESR ripple component', 'Lower capacitor heating', 'Small layout footprint if placed close to switch node/output'],
          risks: ['MLCC DC-bias derating can remove apparent capacitance', 'Parallel capacitors can create anti-resonance'],
          validation: ['Use effective capacitance at bias', 'Check impedance vs frequency', 'Run transient ripple'],
          priorityFit: ['worsening', 'both'],
          apply: (model) => {
            setField(model, 'COMPONENTS', 'Capacitor (C1)', '2 x 47 µF low-ESR MLCC/polymer', 'TRIZ Principle 35: change component parameter/technology instead of only increasing size.');
            setField(model, 'COMPONENTS', 'ESR (C1)', '6 mΩ', 'Lower effective ESR reduces ripple and heat.');
            return 'COMPONENTS';
          }
        })
      ]
    },
    {
      id: 'divider-accuracy-load-current',
      label: 'Voltage divider accuracy vs current draw / load sensitivity',
      improving: 'Output voltage accuracy under load',
      worsening: 'Divider current, power loss, and load regulation',
      improvingKeywords: ['accurate', '5v', 'output', 'regulation', 'load', 'stable'],
      worseningKeywords: ['current draw', 'power', 'waste', 'battery', 'heat', 'low current', 'efficient'],
      contextKeywords: ['voltage divider', 'divider', 'resistor', 'r1', 'r2', 'reference'],
      statement: 'You want a precise divider output, but making the divider stiff enough for load accuracy increases current draw and wasted power.',
      industrialChecks: [
        'A divider should normally feed only a high-impedance ADC/reference input, not a real power rail.',
        'Keep load current at least 10x to 100x smaller than divider current if accuracy matters.',
        'Check resistor tolerance, temperature coefficient, and power dissipation.'
      ],
      principles: [
        makePrinciple({
          num: 24,
          name: 'Intermediary',
          headline: 'Buffer the divider with an op-amp or regulator stage',
          rationale: 'A high-impedance buffer isolates the divider from the load, preserving voltage accuracy without forcing high divider current.',
          effects: ['Accurate output for light-to-moderate loads', 'Lower divider current possible', 'Better load isolation'],
          risks: ['Requires op-amp input/output range check', 'Adds active part and quiescent current'],
          validation: ['Check load current', 'Check op-amp rail-to-rail range', 'Run DC operating point with load'],
          priorityFit: ['improving', 'both'],
          apply: (model) => {
            setSystemType(model, 'Buffered Voltage Divider');
            setField(model, 'OUTPUT', 'Load model', 'High-impedance buffer input', 'TRIZ Principle 24: intermediary stage decouples divider from load.');
            setField(model, 'SIMULATION', 'Output', 'V(out), divider current, buffer input loading', 'Validate divider result with loading explicitly included.');
            return 'OUTPUT';
          }
        }),
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Raise resistor values for lower power if the load is high impedance',
          rationale: 'If the output feeds only a measurement input, higher resistor values cut current while keeping the same divider ratio.',
          effects: ['Lower current draw', 'Lower resistor power', 'Same nominal output ratio'],
          risks: ['More sensitive to leakage/noise', 'ADC sample-and-hold may need a local capacitor'],
          validation: ['Check input leakage error', 'Check ADC acquisition time', 'Add output capacitor if needed'],
          priorityFit: ['worsening', 'both'],
          apply: (model) => {
            setField(model, 'COMPONENTS', 'Top resistor (R1)', '15 kΩ', 'TRIZ Principle 35: preserve ratio while changing magnitude to reduce current.');
            setField(model, 'COMPONENTS', 'Bottom resistor (R2)', '10 kΩ', 'Same divider ratio with 10x lower current.');
            setField(model, 'OUTPUT', 'Load model', '>= 1 MΩ measurement input', 'High impedance load required for divider accuracy with larger resistors.');
            return 'COMPONENTS';
          }
        })
      ]
    },
    {
      id: 'rc-filter-cutoff-loading',
      label: 'RC cutoff accuracy vs load interaction',
      improving: 'Cutoff frequency and attenuation accuracy',
      worsening: 'Load sensitivity and source/output impedance',
      improvingKeywords: ['cutoff', 'frequency', 'attenuation', 'bode', 'response', 'accurate'],
      worseningKeywords: ['load', '1k', 'impedance', 'drive', 'unity', 'buffer'],
      contextKeywords: ['rc', 'low-pass', 'filter', 'resistor', 'capacitor'],
      statement: 'You want a target RC cutoff, but the load resistance becomes part of the transfer function and shifts gain/cutoff.',
      industrialChecks: [
        'Include load resistance in the transfer function; do not assume unity gain.',
        'Keep filter resistance much smaller than load resistance or add a buffer.',
        'Check source impedance because it adds to the filter resistance.'
      ],
      principles: [
        makePrinciple({
          num: 24,
          name: 'Intermediary',
          headline: 'Add a buffer between RC filter and load',
          rationale: 'A voltage follower makes the RC pole mostly independent of the external load, improving cutoff accuracy.',
          effects: ['Predictable cutoff', 'Higher load drive capability', 'Cleaner Bode interpretation'],
          risks: ['Requires stable op-amp for capacitive load', 'Adds supply rails and bandwidth limits'],
          validation: ['Run loaded/unloaded Bode comparison', 'Check op-amp GBW', 'Check phase margin'],
          priorityFit: ['improving', 'both'],
          apply: (model) => {
            setSystemType(model, 'Buffered RC Low-Pass Filter');
            setField(model, 'OUTPUT', 'Load model', 'Buffered 1 kΩ load', 'TRIZ Principle 24: intermediary buffer isolates the pole from the load.');
            setField(model, 'SIMULATION', 'Type', 'AC sweep / Bode', 'Validate loaded frequency response.');
            return 'OUTPUT';
          }
        })
      ]
    }
  ],
  Structural: [
    {
      id: 'beam-stiffness-weight',
      label: 'Beam stiffness/strength vs mass',
      improving: 'Structural stiffness, strength, and deflection margin',
      worsening: 'Mass, material cost, and manufacturability',
      improvingKeywords: ['stiff', 'stiffness', 'strength', 'strong', 'deflection', 'bend', 'stress', 'safety'],
      worseningKeywords: ['weight', 'mass', 'heavy', 'light', 'cost', 'material', 'thick'],
      contextKeywords: ['beam', 'cantilever', 'bracket', 'fea', 'aluminum', 'steel', 'load'],
      statement: 'You want higher stiffness or lower stress, but simply adding material makes the part heavier and may be harder to manufacture.',
      industrialChecks: [
        'Compare stress against yield/ultimate strength with an explicit safety factor.',
        'Check deflection/serviceability separately from strength.',
        'Validate local buckling, stress concentrations, and manufacturability after topology changes.'
      ],
      principles: [
        makePrinciple({
          num: 1,
          name: 'Segmentation',
          headline: 'Move material away from the neutral axis with a hollow or I-section profile',
          rationale: 'Bending stiffness depends strongly on second moment of area, so relocating material to the outer fibers improves stiffness per unit mass.',
          effects: ['Higher stiffness-to-weight ratio', 'Lower mass than a solid rectangle', 'Better bending efficiency'],
          risks: ['Local buckling and connection details must be checked', 'May complicate machining or welding'],
          validation: ['Run section-property comparison', 'Check von Mises stress', 'Check local buckling/slenderness'],
          priorityFit: ['both'],
          apply: (model) => {
            setField(model, 'GEOMETRY', 'Shape', 'Hollow rectangular tube', 'TRIZ Principle 1: segmented/redistributed material improves bending efficiency.');
            setField(model, 'GEOMETRY', 'Wall thickness', '2 mm', 'New section needs wall thickness for structural validation.');
            return 'GEOMETRY';
          }
        }),
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Switch to aluminum 6061-T6 and increase section height if stiffness allows',
          rationale: 'Aluminum reduces density substantially; increasing section height can recover stiffness more efficiently than using solid steel.',
          effects: ['Lower mass', 'Good corrosion resistance', 'Potentially similar stiffness with geometry compensation'],
          risks: ['Lower modulus and yield strength than steel', 'Connection fatigue and bearing stress can govern'],
          validation: ['Check stress and deflection', 'Calculate safety factor', 'Check joint/load introduction'],
          priorityFit: ['worsening', 'both'],
          apply: (model) => {
            setField(model, 'MATERIAL', 'Material', 'Aluminum 6061-T6', 'TRIZ Principle 35: change material parameter to reduce density.');
            setField(model, 'MATERIAL', "Young's modulus", '69 GPa', 'Material database value for aluminum 6061-T6.');
            setField(model, 'MATERIAL', "Poisson's ratio", '0.33', 'Material database value for aluminum 6061-T6.');
            setField(model, 'MATERIAL', 'Density', '2700 kg/m³', 'Material database value for aluminum 6061-T6.');
            setField(model, 'GEOMETRY', 'Height', '16 mm', 'Height increased to recover bending stiffness; verify stress/deflection.');
            return 'MATERIAL';
          }
        }),
        makePrinciple({
          num: 4,
          name: 'Asymmetry',
          headline: 'Taper the beam/bracket so material follows the bending moment diagram',
          rationale: 'Cantilever bending moment is highest at the fixed support and lowest at the free tip, so a tapered profile can reduce mass without sacrificing root strength.',
          effects: ['Lower tip mass', 'Material placed where bending demand is highest', 'Potentially lower peak deflection per mass'],
          risks: ['Root fillets and transitions need stress concentration checks', 'Manufacturing constraints matter'],
          validation: ['Run FEA with taper', 'Check root stress concentration', 'Compare mass and tip deflection'],
          priorityFit: ['both'],
          apply: (model) => {
            setField(model, 'GEOMETRY', 'Profile', 'Tapered height: root 16 mm to tip 6 mm', 'TRIZ Principle 4: asymmetric shape follows bending demand.');
            return 'GEOMETRY';
          }
        })
      ]
    }
  ],
  Fluids: [
    {
      id: 'flow-pressure-drop',
      label: 'Flow rate vs pressure drop / energy loss',
      improving: 'Flow rate and throughput',
      worsening: 'Pressure drop, pumping power, and noise',
      improvingKeywords: ['flow', 'velocity', 'throughput', 'more air', 'increase flow', 'faster'],
      worseningKeywords: ['pressure drop', 'loss', 'drag', 'friction', 'pump', 'noise', 'energy'],
      contextKeywords: ['duct', 'pipe', 'cfd', 'inlet', 'outlet', 'wall', 'turbulent'],
      statement: 'You want higher flow rate, but friction and separation increase pressure drop, pumping power, and acoustic risk.',
      industrialChecks: [
        'Compute Reynolds number and choose laminar/turbulent assumptions explicitly.',
        'Separate major wall-friction losses from minor losses at bends, entries, contractions, and expansions.',
        'Check whether the fan/pump operating point still intersects the system curve.'
      ],
      principles: [
        makePrinciple({
          num: 14,
          name: 'Spheroidality',
          headline: 'Replace sharp entrances with a bell-mouth or generous radius',
          rationale: 'Rounded inlets reduce separation and minor-loss coefficient, improving flow for the same pressure budget.',
          effects: ['Lower inlet loss', 'More uniform velocity profile', 'Less acoustic noise'],
          risks: ['Packaging length/radius may increase', 'Manufacturing tolerance matters'],
          validation: ['Compare pressure drop with minor-loss coefficient', 'Run CFD streamline check', 'Check package envelope'],
          priorityFit: ['both', 'improving'],
          apply: (model) => {
            setField(model, 'GEOMETRY', 'Inlet Type', 'Bell-mouth radius 10 mm', 'TRIZ Principle 14: curvature reduces separation loss.');
            return 'GEOMETRY';
          }
        }),
        makePrinciple({
          num: 17,
          name: 'Another Dimension',
          headline: 'Increase hydraulic diameter or use parallel flow paths',
          rationale: 'Pressure drop scales strongly with velocity. A larger or parallel path lowers velocity for the same flow rate.',
          effects: ['Lower pressure drop', 'Lower fan/pump power', 'Reduced noise'],
          risks: ['Larger envelope', 'Flow distribution must be balanced'],
          validation: ['Recompute system curve', 'Check flow split', 'Run pressure-drop solver'],
          priorityFit: ['worsening', 'both'],
          apply: (model) => {
            setField(model, 'GEOMETRY', 'Diameter', '70 mm', 'TRIZ Principle 17: increased hydraulic dimension reduces velocity and pressure drop.');
            return 'GEOMETRY';
          }
        })
      ]
    }
  ],
  Semiconductors: [
    {
      id: 'mosfet-drive-leakage-scaling',
      label: 'MOSFET drive current vs leakage/scaling',
      improving: 'Drain current, transconductance, and switching speed',
      worsening: 'Gate leakage, short-channel effects, and power density',
      improvingKeywords: ['current', 'drive', 'gm', 'speed', 'faster', 'transconductance', 'on current'],
      worseningKeywords: ['leakage', 'tunneling', 'thin', 'oxide', 'heat', 'power', 'scaling'],
      contextKeywords: ['mosfet', 'gate', 'drain', 'source', 'channel', 'semiconductor', 'tcad'],
      statement: 'You want stronger transistor drive and faster switching, but aggressive oxide/channel scaling increases leakage and electrostatic control problems.',
      industrialChecks: [
        'Check equivalent oxide thickness separately from physical oxide thickness.',
        'Check threshold voltage roll-off, DIBL, subthreshold slope, and gate leakage.',
        'Thermal/power density can dominate even if DC current looks attractive.'
      ],
      principles: [
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Use a high-k dielectric to keep EOT low while increasing physical thickness',
          rationale: 'High-k materials increase gate capacitance without requiring a physically ultra-thin oxide, reducing tunneling leakage.',
          effects: ['Lower gate leakage', 'Maintained electrostatic control', 'Better scaling path'],
          risks: ['Mobility degradation/interface traps', 'Process complexity'],
          validation: ['Check EOT', 'Estimate leakage', 'Run Id-Vg/Id-Vd sweep'],
          priorityFit: ['both'],
          apply: (model) => {
            setField(model, 'MATERIAL', 'Gate Dielectric', 'Hafnium Dioxide (HfO2)', 'TRIZ Principle 35: material parameter change improves leakage/scaling trade-off.');
            setField(model, 'GEOMETRY', 'Oxide Thickness', '10.0 nm physical, EOT approx. 1.5 nm', 'Thicker physical dielectric with low equivalent oxide thickness.');
            return 'MATERIAL';
          }
        }),
        makePrinciple({
          num: 1,
          name: 'Segmentation',
          headline: 'Move from planar MOSFET to FinFET/multi-gate geometry',
          rationale: 'A multi-gate structure wraps electrostatic control around the channel, improving short-channel behavior without relying only on thinner oxide.',
          effects: ['Better gate control', 'Lower leakage for same drive', 'Improved scalability'],
          risks: ['Geometry/process complexity', 'Parasitics and variability must be modeled'],
          validation: ['Run transfer/output curves', 'Check DIBL/subthreshold slope', 'Compare capacitance'],
          priorityFit: ['improving', 'both'],
          apply: (model) => {
            setSystemType(model, 'FinFET Transistor (Multi-Gate)');
            setField(model, 'GEOMETRY', 'Width', 'Fin height 40 nm x 3 fins', 'TRIZ Principle 1: segmented fins increase effective channel width and control.');
            setField(model, 'SIMULATION', 'Type', 'FinFET I-V Characteristics', 'Simulation target updated for multi-gate topology.');
            return 'GEOMETRY';
          }
        })
      ]
    }
  ],
  Aerospace: [
    {
      id: 'nozzle-isp-weight-envelope',
      label: 'Nozzle performance vs mass/envelope',
      improving: 'Vacuum thrust and specific impulse',
      worsening: 'Nozzle mass, length, and launch/packaging envelope',
      improvingKeywords: ['thrust', 'isp', 'performance', 'vacuum', 'expansion', 'mach'],
      worseningKeywords: ['weight', 'mass', 'size', 'length', 'payload', 'compact', 'heavy'],
      contextKeywords: ['nozzle', 'rocket', 'throat', 'expansion ratio', 'aerospace', 'propulsion'],
      statement: 'You want higher vacuum performance from a larger expansion ratio, but the longer nozzle increases mass, packaging envelope, and structural loads.',
      industrialChecks: [
        'Check sea-level over-expansion and flow separation if the nozzle operates in atmosphere.',
        'Check thermal protection and wall stress after changing length/area ratio.',
        'Compare thrust coefficient across the mission altitude profile, not only one point.'
      ],
      principles: [
        makePrinciple({
          num: 15,
          name: 'Dynamism',
          headline: 'Use a deployable nozzle extension for vacuum operation',
          rationale: 'A compact nozzle can survive launch/ascent packaging while a deployed extension improves vacuum expansion later.',
          effects: ['Higher vacuum Isp', 'Lower launch envelope', 'Mission-phase optimized geometry'],
          risks: ['Deployment reliability', 'Thermal/mechanical joint design'],
          validation: ['Run sea-level and vacuum nozzle cases', 'Check deployment loads', 'Check thermal margin'],
          priorityFit: ['both'],
          apply: (model) => {
            setSystemType(model, 'De Laval Nozzle with Deployable Extension');
            setField(model, 'GEOMETRY', 'Expansion ratio', '24 deployed / 8 stowed', 'TRIZ Principle 15: dynamic geometry adapts to mission phase.');
            setField(model, 'SIMULATION', 'Output', 'Mach, pressure, thrust at stowed and deployed expansion ratio', 'Validate both operating states.');
            return 'GEOMETRY';
          }
        }),
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Evaluate altitude-compensating aerospike topology',
          rationale: 'An aerospike changes the expansion mechanism so ambient pressure provides part of the outer boundary, improving off-design performance.',
          effects: ['Altitude compensation', 'Broad operating envelope', 'Potentially shorter effective nozzle'],
          risks: ['Cooling and manufacturing complexity', 'Base drag/truncation losses'],
          validation: ['Compare thrust coefficient vs altitude', 'Check cooling load', 'Estimate mass/manufacturing impact'],
          priorityFit: ['improving'],
          apply: (model) => {
            setSystemType(model, 'Toroidal Aerospike Nozzle Concept');
            setField(model, 'GEOMETRY', 'Expansion ratio', 'Altitude compensating', 'TRIZ Principle 35: topology/parameter change alters expansion behavior.');
            setField(model, 'SIMULATION', 'Type', 'Altitude-compensating nozzle trade study', 'Run off-design performance comparison.');
            return 'GEOMETRY';
          }
        })
      ]
    }
  ],
  Thermal: [
    {
      id: 'thermal-cooling-size-noise',
      label: 'Heat removal vs size / noise / power',
      improving: 'Lower component temperature and thermal resistance',
      worsening: 'Heatsink size, fan noise, pressure drop, and power draw',
      improvingKeywords: ['temperature', 'thermal', 'heat', 'cooling', 'hot', 'junction', 'resistance'],
      worseningKeywords: ['size', 'weight', 'noise', 'fan', 'power', 'compact', 'pressure drop'],
      contextKeywords: ['heatsink', 'pcb', 'via', 'thermal', 'convection', 'junction', 'ambient'],
      statement: 'You want lower temperature, but direct cooling fixes can increase size, airflow power, noise, or manufacturing complexity.',
      industrialChecks: [
        'Separate conduction, interface, spreading, and convection resistance before changing geometry.',
        'Check worst-case ambient, component derating, TIM bondline thickness, and fan failure mode.',
        'Validate steady-state and transient thermal mass if duty cycle matters.'
      ],
      principles: [
        makePrinciple({
          num: 3,
          name: 'Local Quality',
          headline: 'Put copper, vias, fins, or airflow only where heat flux is highest',
          rationale: 'Cooling resources are most effective at the dominant thermal bottleneck, so local improvement can beat uniform oversizing.',
          effects: ['Lower peak temperature', 'Better material efficiency', 'Less unnecessary mass'],
          risks: ['Hotspots can move if the boundary condition changes', 'Manufacturing density limits may apply'],
          validation: ['Map thermal resistance chain', 'Run hotspot temperature check', 'Check via/fabrication limits'],
          priorityFit: ['both', 'worsening'],
          apply: (model) => {
            setField(model, 'THERMAL_STRATEGY', 'Primary TRIZ move', 'Local cooling at dominant heat path', 'TRIZ Principle 3: improve only the high-heat-flux region.');
            setField(model, 'THERMAL_STRATEGY', 'Validation target', 'Junction temperature, spreading resistance, hotspot margin', 'Verify the localized cooling improvement quantitatively.');
            return 'THERMAL_STRATEGY';
          }
        }),
        makePrinciple({
          num: 35,
          name: 'Parameter Change',
          headline: 'Change interface or fin parameters before increasing envelope',
          rationale: 'TIM conductivity, fin pitch, surface finish, emissivity, and airflow can improve thermal resistance without simply making the heatsink larger.',
          effects: ['Lower thermal resistance', 'Potentially same package envelope', 'Better use of existing airflow'],
          risks: ['Too-tight fins can choke flow', 'TIM performance is assembly-sensitive'],
          validation: ['Check Biot/fin efficiency', 'Check pressure drop', 'Check TIM bondline sensitivity'],
          priorityFit: ['improving', 'both'],
          apply: (model) => {
            setField(model, 'THERMAL_STRATEGY', 'Parameter change', 'Optimize TIM, fin pitch, emissivity, and airflow before enlarging heatsink', 'TRIZ Principle 35: change operating/material parameters.');
            return 'THERMAL_STRATEGY';
          }
        })
      ]
    }
  ],
  Materials: [
    {
      id: 'material-strength-weight-cost',
      label: 'Strength/fatigue life vs weight/cost/manufacturability',
      improving: 'Yield strength, fatigue life, stiffness, or damage tolerance',
      worsening: 'Mass, cost, corrosion risk, and manufacturability',
      improvingKeywords: ['strength', 'fatigue', 'life', 'stiffness', 'toughness', 'yield', 'crack'],
      worseningKeywords: ['weight', 'mass', 'cost', 'manufacturing', 'corrosion', 'weld', 'machine'],
      contextKeywords: ['material', 'alloy', 'steel', 'aluminum', 'composite', 'bracket', 'fatigue'],
      statement: 'You want better material performance, but stronger or more exotic choices may add cost, process risk, corrosion concerns, or manufacturing constraints.',
      industrialChecks: [
        'Check yield, ultimate, fatigue, fracture toughness, corrosion, and temperature limits separately.',
        'Validate joining method because weld/fastener zones often govern real designs.',
        'Compare lifecycle cost, availability, and inspection burden.'
      ],
      principles: [
        makePrinciple({
          num: 40,
          name: 'Composite Materials',
          headline: 'Use a hybrid/composite or local reinforcement instead of one bulk material',
          rationale: 'Different regions can carry different functions: stiffness, wear, corrosion, or fatigue resistance.',
          effects: ['Higher performance-to-weight ratio', 'Local reinforcement where needed', 'Reduced bulk material cost'],
          risks: ['Joining, inspection, and anisotropy must be managed', 'Galvanic corrosion can appear'],
          validation: ['Check load path', 'Check joining details', 'Run fatigue and environmental screening'],
          priorityFit: ['both'],
          apply: (model) => {
            setField(model, 'MATERIAL_STRATEGY', 'Material architecture', 'Hybrid material or local reinforcement', 'TRIZ Principle 40: combine materials by function.');
            return 'MATERIAL_STRATEGY';
          }
        })
      ]
    }
  ],
  Control: [
    {
      id: 'control-response-stability-noise',
      label: 'Fast response vs stability/noise/actuator effort',
      improving: 'Tracking speed and disturbance rejection',
      worsening: 'Overshoot, noise amplification, actuator saturation, and stability margin',
      improvingKeywords: ['response', 'fast', 'settling', 'tracking', 'disturbance', 'pid'],
      worseningKeywords: ['overshoot', 'noise', 'saturation', 'stability', 'oscillation', 'actuator'],
      contextKeywords: ['control', 'pid', 'motor', 'plant', 'loop', 'gain', 'furnace'],
      statement: 'You want faster control response, but aggressive gains can reduce stability margin, amplify noise, or saturate the actuator.',
      industrialChecks: [
        'Check phase/gain margin, actuator limits, sampling rate, and sensor noise.',
        'Validate step response, disturbance response, and saturation recovery separately.',
        'Do not tune derivative action without filtering and noise checks.'
      ],
      principles: [
        makePrinciple({
          num: 23,
          name: 'Feedback',
          headline: 'Add feedforward plus bounded feedback instead of only raising gain',
          rationale: 'Feedforward handles predictable demand while feedback corrects residual error, reducing the need for unstable high gain.',
          effects: ['Faster response', 'Lower overshoot risk', 'Less actuator effort for known disturbances'],
          risks: ['Needs plant estimate', 'Model mismatch must be bounded'],
          validation: ['Check margins', 'Run saturation test', 'Run disturbance rejection test'],
          priorityFit: ['both', 'improving'],
          apply: (model) => {
            setField(model, 'CONTROL_STRATEGY', 'Architecture', 'Feedforward plus PID feedback with anti-windup', 'TRIZ Principle 23: use feedback intelligently with a predictive path.');
            return 'CONTROL_STRATEGY';
          }
        })
      ]
    }
  ],
  Power: [
    {
      id: 'power-reliability-cost-efficiency',
      label: 'Power reliability/efficiency vs cost/size/protection complexity',
      improving: 'Efficiency, uptime, voltage regulation, and fault ride-through',
      worsening: 'Cost, size, protection complexity, and thermal stress',
      improvingKeywords: ['efficiency', 'reliability', 'uptime', 'fault', 'voltage regulation', 'ride through'],
      worseningKeywords: ['cost', 'size', 'complexity', 'thermal', 'loss', 'protection'],
      contextKeywords: ['power', 'grid', 'inverter', 'converter', 'bus', 'fault', 'battery'],
      statement: 'You want robust and efficient power delivery, but added protection, redundancy, or filtering increases cost, size, and coordination complexity.',
      industrialChecks: [
        'Check normal, startup, transient, and fault operating modes separately.',
        'Coordinate protection thresholds with thermal and component SOA limits.',
        'Validate derating, redundancy, and single-point failure behavior.'
      ],
      principles: [
        makePrinciple({
          num: 11,
          name: 'Beforehand Cushioning',
          headline: 'Add pre-charge, soft-start, or coordinated fault limiting',
          rationale: 'Handling dangerous transient energy before it reaches components improves reliability without oversizing every part.',
          effects: ['Lower inrush/fault stress', 'Better component SOA margin', 'More predictable startup'],
          risks: ['Protection timing must coordinate', 'Extra control states need validation'],
          validation: ['Run startup transient', 'Check SOA', 'Run fault clearing scenario'],
          priorityFit: ['both'],
          apply: (model) => {
            setField(model, 'POWER_STRATEGY', 'Protection move', 'Pre-charge / soft-start / coordinated fault limiting', 'TRIZ Principle 11: cushion harmful transient energy before it damages the system.');
            return 'POWER_STRATEGY';
          }
        })
      ]
    }
  ]
};

const GENERIC_CONTRADICTION = {
  id: 'generic-engineering-tradeoff',
  label: 'General engineering performance trade-off',
  improving: 'Target performance parameter',
  worsening: 'Constraint, cost, size, mass, risk, or secondary failure mode',
  improvingKeywords: ['improve', 'increase', 'reduce', 'lower', 'optimize', 'maximize', 'minimize', 'performance', 'accuracy', 'speed', 'strength'],
  worseningKeywords: ['without', 'but', 'cost', 'weight', 'mass', 'size', 'loss', 'heat', 'risk', 'noise', 'complexity'],
  contextKeywords: ['design', 'system', 'model', 'simulation', 'component', 'material', 'solver'],
  statement: 'You have an engineering contradiction: improving the target behavior creates a penalty in another requirement or failure mode.',
  industrialChecks: [
    'Convert the trade-off into measurable parameters with units and acceptance limits.',
    'Separate physical contradiction, technical contradiction, and missing requirement before applying a solution.',
    'Validate every proposed move against safety, reliability, manufacturability, and cost constraints.'
  ],
  principles: [
    makePrinciple({
      num: 3,
      name: 'Local Quality',
      headline: 'Improve only the limiting region instead of changing the whole system',
      rationale: 'Industrial designs usually have a small number of dominant bottlenecks. Localizing the fix can improve performance while limiting secondary penalties.',
      effects: ['Targeted performance gain', 'Lower system-level penalty', 'Clear validation scope'],
      risks: ['The assumed bottleneck may be wrong', 'Local gradients/stress concentrations can appear'],
      validation: ['Identify dominant bottleneck', 'Run before/after sensitivity', 'Check new local failure modes'],
      priorityFit: ['both'],
      apply: (model) => {
        setField(model, 'TRIZ_STRATEGY', 'Primary move', 'Localize the improvement at the measured bottleneck', 'TRIZ Principle 3: local quality.');
        setField(model, 'TRIZ_STRATEGY', 'Validation plan', 'Baseline, sensitivity sweep, and new failure-mode check', 'Industrial acceptance gate for TRIZ change.');
        return 'TRIZ_STRATEGY';
      }
    }),
    makePrinciple({
      num: 35,
      name: 'Parameter Change',
      headline: 'Change the governing parameter or material/operating state',
      rationale: 'A parameter shift can move the design to a better operating regime instead of brute-forcing the original geometry or component choice.',
      effects: ['Can improve the trade-off without major topology change', 'Often quick to test in simulation'],
      risks: ['May move the problem into another constraint', 'Requires range and derating checks'],
      validation: ['Sweep the governing parameter', 'Check derating and limits', 'Compare objective function before/after'],
      priorityFit: ['improving', 'both'],
      apply: (model) => {
        setField(model, 'TRIZ_STRATEGY', 'Parameter sweep', 'Identify and sweep the governing parameter over safe limits', 'TRIZ Principle 35: parameter change.');
        return 'TRIZ_STRATEGY';
      }
    }),
    makePrinciple({
      num: 24,
      name: 'Intermediary',
      headline: 'Insert an isolating or buffering stage between conflicting functions',
      rationale: 'When one subsystem disturbs another, an intermediary can decouple the functions and remove the direct contradiction.',
      effects: ['Lower cross-coupling', 'Cleaner requirements split', 'More robust architecture'],
      risks: ['Adds component count and interfaces', 'Intermediary must be validated as its own failure mode'],
      validation: ['Model coupling before/after', 'Check interface limits', 'Run failure-mode review'],
      priorityFit: ['worsening', 'both'],
      apply: (model) => {
        setField(model, 'TRIZ_STRATEGY', 'Architecture move', 'Add an intermediary/buffer to decouple conflicting functions', 'TRIZ Principle 24: intermediary.');
        return 'TRIZ_STRATEGY';
      }
    })
  ]
};

export function detectContradiction(text, domain) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return null;

  const normalizedDomain = DOMAIN_ALIASES[domain] || domain;
  const inferred = inferContradictionFromText(lower);
  const preferred = CONTRADICTIONS[normalizedDomain] || [];
  const all = Object.entries(CONTRADICTIONS)
    .filter(([key]) => key !== normalizedDomain)
    .flatMap(([, items]) => items);
  const candidates = [...preferred, ...all, GENERIC_CONTRADICTION];
  const hasExplicitTradeoff = containsAny(lower, tradeoffWords).length > 0;

  const scored = candidates.map((item) => {
    const improvingMatches = containsAny(lower, item.improvingKeywords || []);
    const worseningMatches = containsAny(lower, item.worseningKeywords || []);
    const contextMatches = containsAny(lower, item.contextKeywords || []);
    const sameDomainBonus = preferred.includes(item) ? 0.1 : 0;
    const inferredBonus = inferred ? 0.12 : 0;
    const tradeoffBonus = hasExplicitTradeoff ? 0.14 : 0;
    const genericPenalty = item.id === GENERIC_CONTRADICTION.id ? -0.08 : 0;
    const isGeneric = item.id === GENERIC_CONTRADICTION.id;
    const crossDomainNoContextPenalty = !isGeneric && !preferred.includes(item) && contextMatches.length === 0 ? -0.36 : 0;
    const specificNoContextPenalty = !isGeneric && contextMatches.length === 0 && (improvingMatches.length + worseningMatches.length) < 3 ? -0.18 : 0;

    const score =
      improvingMatches.length * 0.18 +
      worseningMatches.length * 0.2 +
      contextMatches.length * 0.12 +
      sameDomainBonus +
      inferredBonus +
      tradeoffBonus +
      genericPenalty +
      crossDomainNoContextPenalty +
      specificNoContextPenalty;

    const hasBothSides = improvingMatches.length > 0 && worseningMatches.length > 0;
    const hasContext = contextMatches.length > 0;
    const confidence = Math.min(0.96, 0.28 + score + (hasBothSides ? 0.18 : 0) + (hasContext ? 0.08 : 0));
    const inferredStatement = inferred && item.id === GENERIC_CONTRADICTION.id
      ? `You want ${inferred.improving}, but that conflicts with ${inferred.worsening}.`
      : item.statement;

    return {
      ...item,
      improving: item.id === GENERIC_CONTRADICTION.id && inferred ? inferred.improving : item.improving,
      worsening: item.id === GENERIC_CONTRADICTION.id && inferred ? inferred.worsening : item.worsening,
      statement: inferredStatement,
      matchedTerms: [...new Set([...improvingMatches, ...worseningMatches, ...contextMatches])],
      confidence,
      severity: confidence >= 0.82 ? 'High' : confidence >= 0.66 ? 'Medium' : 'Low',
      detectionEvidence: [
        improvingMatches.length ? `Improving side: ${improvingMatches.join(', ')}` : null,
        worseningMatches.length ? `Worsening side: ${worseningMatches.join(', ')}` : null,
        contextMatches.length ? `Context: ${contextMatches.join(', ')}` : null,
        inferred?.evidence || null,
        hasExplicitTradeoff ? 'Trade-off language detected' : null
      ].filter(Boolean)
    };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best) return null;

  const minimum = hasExplicitTradeoff || inferred ? 0.54 : 0.64;
  if (best.confidence < minimum || (best.matchedTerms.length < 2 && !inferred)) return null;

  return best;
}

export function getContradictionLibrary() {
  return CONTRADICTIONS;
}

export function rankTrizPrinciples(principles = [], priority = 'both') {
  return [...principles]
    .map((principle, index) => {
      const fit = principle.priorityFit || ['both'];
      const priorityScore = fit.includes(priority) ? 3 : fit.includes('both') ? 2 : 1;
      const validationScore = Math.min(3, principle.validation?.length || 0);
      const riskScore = Math.min(2, principle.risks?.length || 0);
      return {
        ...principle,
        fitScore: priorityScore + validationScore * 0.35 + riskScore * 0.2,
        originalIndex: index
      };
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.originalIndex - b.originalIndex);
}

/**
 * Returns the TRIZ knowledge base for AI layer consumption.
 * This is what the LLM escalation path uses to ground its selections.
 */
export function getTrizKnowledgeBase() {
  return {
    parameters: TRIZ_PARAMETERS,
    principles: TRIZ_PRINCIPLES
  };
}

/**
 * Matrix-grounded contradiction detection (v2 primary path).
 * Maps user text to TRIZ parameters via domain vocabulary, then
 * looks up the pair in the real 39x39 matrix.
 */
function detectContradictionMatrixGrounded(text, domain) {
  const lower = String(text || '').toLowerCase();
  const normalizedDomain = DOMAIN_ALIASES[domain] || domain;
  
  // Step 1: Match vocabulary to get parameter candidates
  const vocabHits = matchVocabulary(lower, normalizedDomain);
  
  if (vocabHits.length < 2) {
    return null; // Need at least two different parameters to form a contradiction
  }
  
  // Step 2: Extract unique parameter numbers
  const uniqueParams = [...new Set(vocabHits.map(h => h.param))];
  
  if (uniqueParams.length < 2) {
    return null;
  }
  
  // Step 3: Try all ordered pairs (improving, worsening)
  // Use sentence context to determine direction
  const improvingParams = [];
  const worseningParams = [];
  
  // Simple heuristic: words before "without/but/however" are improving
  // words after are worsening
  const splitPatterns = [
    /without\s+(increasing|raising|adding|reducing|lowering|hurting|sacrificing)/i,
    /but\s+(too|increasing|raising|adding|reducing|lowering|hurting|sacrificing)/i,
    /however\s+(too|increasing|raising|adding|reducing|lowering|hurting|sacrificing)/i,
    /vs\.?\s+/i,
    /versus\s+/i
  ];
  
  let splitIndex = -1;
  for (const pattern of splitPatterns) {
    const match = lower.match(pattern);
    if (match) {
      splitIndex = lower.indexOf(match[0]);
      break;
    }
  }
  
  // If we found a split, assign parameters based on position
  if (splitIndex >= 0) {
    const beforeSplit = lower.substring(0, splitIndex);
    const afterSplit = lower.substring(splitIndex);
    
    vocabHits.forEach(hit => {
      const matchedInBefore = hit.matchedTerms.some(t => beforeSplit.includes(t.toLowerCase()));
      const matchedInAfter = hit.matchedTerms.some(t => afterSplit.includes(t.toLowerCase()));
      
      if (matchedInBefore && !matchedInAfter) {
        improvingParams.push(hit.param);
      } else if (matchedInAfter && !matchedInBefore) {
        worseningParams.push(hit.param);
      }
    });
  }
  
  // Fallback: if no clear split, try all pairs
  if (improvingParams.length === 0 || worseningParams.length === 0) {
    for (let i = 0; i < uniqueParams.length; i++) {
      for (let j = 0; j < uniqueParams.length; j++) {
        if (i !== j) {
          improvingParams.push(uniqueParams[i]);
          worseningParams.push(uniqueParams[j]);
        }
      }
    }
  }
  
  // Step 4: Look up each pair in the matrix
  for (let i = 0; i < improvingParams.length; i++) {
    const improving = improvingParams[i];
    const worsening = worseningParams[i];
    
    if (improving === worsening) continue;
    
    const matrixResult = getRankedPrinciples(improving, worsening);
    
    // Build evidence from vocabulary hits
    const improvingHits = vocabHits.filter(h => h.param === improving);
    const worseningHits = vocabHits.filter(h => h.param === worsening);
    
    const matchedTerms = [
      ...improvingHits.flatMap(h => h.matchedTerms),
      ...worseningHits.flatMap(h => h.matchedTerms)
    ];
    
    const industrialNotes = [
      ...improvingHits.map(h => h.industrialNote),
      ...worseningHits.map(h => h.industrialNote)
    ];
    
    const confidence = matrixResult.source === 'matrix' ? 0.75 : 0.55;
    
    return {
      kind: 'matrix_ground',
      analysis_method: 'matrix_ground',
      improvingParam: matrixResult.improving,
      worseningParam: matrixResult.worsening,
      principles: matrixResult.principles,
      principleSource: matrixResult.source,
      confidence,
      severity: confidence >= 0.82 ? 'High' : confidence >= 0.66 ? 'Medium' : 'Low',
      statement: `You want to improve ${matrixResult.improving.name}, but that conflicts with ${matrixResult.worsening.name}.`,
      industrialChecks: industrialNotes,
      detectionEvidence: [
        `Matrix-grounded detection: improving parameter ${improving} (${matrixResult.improving.name}) vs worsening parameter ${worsening} (${matrixResult.worsening.name})`,
        `Matched terms: ${matchedTerms.join(', ')}`,
        `Source: ${matrixResult.source === 'matrix' ? '39x39 Altshuller matrix' : 'Fallback principles'}`
      ]
    };
  }
  
  return null;
}

/**
 * Enhanced detectContradiction that tries matrix-grounded path first,
 * then falls back to the original v1 keyword matcher.
 */
export function detectContradictionEnhanced(text, domain) {
  // Try matrix-grounded first
  const matrixResult = detectContradictionMatrixGrounded(text, domain);
  if (matrixResult && matrixResult.confidence >= 0.55) {
    // Check if we have a matching enrichment scenario to attach
    const normalizedDomain = DOMAIN_ALIASES[domain] || domain;
    const scenarios = CONTRADICTIONS[normalizedDomain] || [];
    
    for (const scenario of scenarios) {
      const lower = String(text || '').toLowerCase();
      const improvingMatches = containsAny(lower, scenario.improvingKeywords || []);
      const worseningMatches = containsAny(lower, scenario.worseningKeywords || []);
      const contextMatches = containsAny(lower, scenario.contextKeywords || []);
      
      if (improvingMatches.length > 0 && worseningMatches.length > 0) {
        // Attach the scenario's apply() function if principle numbers match
        const scenarioPrincipleNums = scenario.principles?.map(p => p.num) || [];
        const matrixPrincipleNums = matrixResult.principles?.map(p => p.num) || [];
        
        const hasOverlap = scenarioPrincipleNums.some(n => matrixPrincipleNums.includes(n));
        
        if (hasOverlap) {
          return {
            ...matrixResult,
            enrichmentScenario: scenario.id,
            applyChanges: scenario.principles.find(p => matrixPrincipleNums.includes(p.num))?.applyChanges
          };
        }
      }
    }
    
    return matrixResult;
  }
  
  // Fall back to v1 keyword matcher
  return detectContradiction(text, domain);
}
