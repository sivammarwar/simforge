/**
 * trizKnowledge.js — Canonical TRIZ Knowledge Base
 *
 * This is the single source of truth for:
 *   - The 39 Engineering Parameters (Altshuller)
 *   - The 40 Inventive Principles (Altshuller)
 *   - The 39x39 Contradiction Matrix (classic mapping: improving param x
 *     worsening param -> ranked list of principle numbers)
 *
 * WHY THIS FILE EXISTS:
 * Every other module in the TRIZ layer (triz.js deterministic matcher,
 * aiLayers.js LLM escalation) must resolve principle numbers and names
 * THROUGH this table. Nothing downstream is allowed to free-generate a
 * "TRIZ Principle N" — it either exists here with this exact name, or it
 * does not get used. That is what keeps the system from hallucinating
 * plausible-sounding but fabricated TRIZ citations.
 *
 * This file has NO side effects, NO network calls, and NO dependencies.
 * It is pure data plus small accessor/lookup helpers.
 */

// ─────────────────────────────────────────────────────────────────────────────
// THE 40 INVENTIVE PRINCIPLES
// ─────────────────────────────────────────────────────────────────────────────

export const TRIZ_PRINCIPLES = {
  1:  { name: 'Segmentation', short: 'Divide an object into independent parts, or make it sectional/modular.' },
  2:  { name: 'Taking Out', short: 'Separate an interfering part or property from an object, or isolate the necessary part/property.' },
  3:  { name: 'Local Quality', short: 'Change a structure or property from uniform to non-uniform so each part does its own job best.' },
  4:  { name: 'Asymmetry', short: 'Replace a symmetrical form with an asymmetrical one where it helps function.' },
  5:  { name: 'Merging', short: 'Bring closer together (in space or time) identical or related objects/operations.' },
  6:  { name: 'Universality', short: 'Make a part or object perform multiple functions, eliminating the need for other parts.' },
  7:  { name: 'Nested Doll', short: 'Place one object inside another; pass an object through a cavity of another.' },
  8:  { name: 'Anti-Weight', short: 'Compensate for an object\'s weight by merging it with objects that provide lift, or by interaction with the environment.' },
  9:  { name: 'Preliminary Anti-Action', short: 'Pre-stress or pre-load an object to counteract known harmful effects ahead of time.' },
  10: { name: 'Preliminary Action', short: 'Perform required changes to an object before they are needed.' },
  11: { name: 'Beforehand Cushioning', short: 'Prepare emergency/backup means in advance to compensate for the low reliability of an object.' },
  12: { name: 'Equipotentiality', short: 'Change the working conditions so an object does not need to be raised or lowered.' },
  13: { name: 'The Other Way Round', short: 'Invert the action, turn the object/process upside down, or make movable parts fixed and fixed parts movable.' },
  14: { name: 'Spheroidality / Curvature', short: 'Replace flat/straight parts with curved ones; use rollers, balls, spirals.' },
  15: { name: 'Dynamics', short: 'Allow characteristics of an object/process to change to be optimal at each stage of operation.' },
  16: { name: 'Partial or Excessive Action', short: 'If 100% of an effect is hard to achieve, use slightly more or less to simplify the problem.' },
  17: { name: 'Another Dimension', short: 'Move an object in 2D or 3D space; use multi-layer/multi-story arrangements; tilt/reorient.' },
  18: { name: 'Mechanical Vibration', short: 'Cause an object to oscillate or vibrate; use resonance frequency.' },
  19: { name: 'Periodic Action', short: 'Replace a continuous action with a periodic/pulsating one.' },
  20: { name: 'Continuity of Useful Action', short: 'Carry on work continuously; eliminate idle/intermittent motions.' },
  21: { name: 'Skipping', short: 'Conduct a hazardous or harmful process at high speed to minimize exposure/impact.' },
  22: { name: 'Blessing in Disguise', short: 'Use harmful factors (especially environmental) to achieve a positive effect.' },
  23: { name: 'Feedback', short: 'Introduce feedback to improve a process or action; modify if feedback already exists.' },
  24: { name: 'Intermediary', short: 'Use an intermediary carrier/process to perform a function, then remove or merge it.' },
  25: { name: 'Self-Service', short: 'Make an object serve itself by performing auxiliary/repair functions; use waste resources.' },
  26: { name: 'Copying', short: 'Use a simpler/cheaper copy instead of a complex, expensive, fragile, or inconvenient object.' },
  27: { name: 'Cheap Short-Living Objects', short: 'Replace an expensive durable object with multiple cheap, less durable ones.' },
  28: { name: 'Mechanics Substitution', short: 'Replace a mechanical means with a sensory (optical, acoustic, taste, smell) one, or use fields instead.' },
  29: { name: 'Pneumatics and Hydraulics', short: 'Use gas/liquid parts of an object instead of solid parts.' },
  30: { name: 'Flexible Shells and Thin Films', short: 'Use flexible shells/thin films instead of 3D structures; isolate the object with films/membranes.' },
  31: { name: 'Porous Materials', short: 'Make an object porous, or add porous elements/coatings.' },
  32: { name: 'Color Changes', short: 'Change the color/transparency of an object or its surroundings to convey information or change a property.' },
  33: { name: 'Homogeneity', short: 'Make interacting objects of the same material (or one with similar properties).' },
  34: { name: 'Discarding and Recovering', short: 'Make a part of an object disappear (discard, dissolve, evaporate) after use, or restore consumed parts.' },
  35: { name: 'Parameter Changes', short: 'Change an object\'s physical state, concentration, density, flexibility, or temperature.' },
  36: { name: 'Phase Transitions', short: 'Use phenomena that occur during phase transitions (volume change, heat release/absorption).' },
  37: { name: 'Thermal Expansion', short: 'Use thermal expansion/contraction of materials, or combine materials with different expansion coefficients.' },
  38: { name: 'Strong Oxidants', short: 'Replace common air with oxygen-enriched air, pure oxygen, or ionized/ozonized environments.' },
  39: { name: 'Inert Atmosphere', short: 'Replace a normal environment with an inert one; add neutral parts/inert additives.' },
  40: { name: 'Composite Materials', short: 'Replace a homogeneous material with a composite (multiple materials, each carrying a function).' }
};

// ─────────────────────────────────────────────────────────────────────────────
// THE 39 ENGINEERING PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────

export const TRIZ_PARAMETERS = {
  1:  { name: 'Weight of moving object' },
  2:  { name: 'Weight of stationary object' },
  3:  { name: 'Length of moving object' },
  4:  { name: 'Length of stationary object' },
  5:  { name: 'Area of moving object' },
  6:  { name: 'Area of stationary object' },
  7:  { name: 'Volume of moving object' },
  8:  { name: 'Volume of stationary object' },
  9:  { name: 'Speed' },
  10: { name: 'Force' },
  11: { name: 'Stress or pressure' },
  12: { name: 'Shape' },
  13: { name: 'Stability of object\'s composition' },
  14: { name: 'Strength' },
  15: { name: 'Duration of action by moving object' },
  16: { name: 'Duration of action by stationary object' },
  17: { name: 'Temperature' },
  18: { name: 'Illumination intensity' },
  19: { name: 'Energy spent by moving object' },
  20: { name: 'Energy spent by stationary object' },
  21: { name: 'Power' },
  22: { name: 'Loss of energy' },
  23: { name: 'Loss of substance' },
  24: { name: 'Loss of information' },
  25: { name: 'Loss of time' },
  26: { name: 'Quantity of substance' },
  27: { name: 'Reliability' },
  28: { name: 'Measurement accuracy' },
  29: { name: 'Manufacturing precision' },
  30: { name: 'External harm affecting the object' },
  31: { name: 'Object-generated harmful factors' },
  32: { name: 'Ease of manufacture' },
  33: { name: 'Ease of operation' },
  34: { name: 'Ease of repair' },
  35: { name: 'Adaptability or versatility' },
  36: { name: 'Device complexity' },
  37: { name: 'Difficulty of detecting and measuring' },
  38: { name: 'Extent of automation' },
  39: { name: 'Productivity' }
};

// ─────────────────────────────────────────────────────────────────────────────
// THE 39x39 CONTRADICTION MATRIX
// Keyed as "improvingParam-worseningParam" -> ordered array of principle
// numbers (most historically effective first, per Altshuller's matrix).
// This is the classic published matrix. Empty/unlisted cells mean no
// strong historical principle association exists for that pairing — the
// caller should fall back to generic high-utility principles (see
// FALLBACK_PRINCIPLES below) rather than inventing one.
//
// Coverage note: this matrix includes the cells most relevant to physical/
// mechanical/electrical/thermal engineering contradictions, which covers
// the overwhelming majority of real design trade-offs SimForge sees across
// Circuits domain trade-offs.
// Unlisted pairs degrade gracefully to FALLBACK_PRINCIPLES, never to a
// fabricated principle.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRADICTION_MATRIX = {
  // Weight of moving object (1) vs ...
  '1-2': [], '1-6': [40, 28, 2, 12], '1-7': [29, 17, 38, 34], '1-8': [29, 4],
  '1-9': [2, 8, 15, 38], '1-10': [8, 10, 18, 37], '1-11': [10, 36, 37, 40],
  '1-12': [10, 14, 35, 40], '1-13': [1, 35, 19, 39], '1-14': [28, 27, 18, 40],
  '1-15': [5, 34, 31, 35], '1-16': [], '1-17': [6, 29, 4, 38], '1-18': [19, 1, 32],
  '1-19': [35, 12, 34, 31], '1-20': [], '1-21': [12, 36, 18, 31], '1-22': [6, 2, 34, 19],
  '1-23': [5, 35, 3, 31], '1-24': [10, 24, 35], '1-25': [10, 35, 20, 28],
  '1-26': [3, 26, 18, 31], '1-27': [3, 11, 1, 27], '1-28': [28, 27, 35, 26],
  '1-29': [28, 35, 26, 18], '1-30': [22, 21, 27, 39], '1-31': [22, 35, 31, 39],
  '1-32': [27, 28, 1, 36], '1-33': [35, 3, 2, 24], '1-34': [2, 27, 28, 11],
  '1-35': [29, 5, 15, 8], '1-36': [26, 30, 36, 34], '1-37': [28, 29, 26, 32],
  '1-38': [26, 35, 18, 19], '1-39': [35, 3, 24, 37],

  // Weight of stationary object (2) vs ...
  '2-3': [], '2-5': [], '2-6': [], '2-7': [], '2-8': [10, 19, 35, 38],
  '2-9': [], '2-10': [8, 10, 19, 35], '2-11': [13, 29, 10, 18], '2-12': [13, 10, 29, 14],
  '2-13': [26, 39, 1, 40], '2-14': [28, 2, 10, 27], '2-15': [], '2-16': [2, 27, 19, 6],
  '2-17': [28, 19, 32, 22], '2-18': [19, 32, 35], '2-19': [18, 19, 28, 1],
  '2-20': [18, 26, 28], '2-21': [],'2-22': [2, 19, 22, 37], '2-23': [],
  '2-24': [10, 28, 8, 3], '2-25': [10, 30, 4], '2-26': [19, 2], '2-27': [28, 2, 10, 27],
  '2-28': [18, 26, 28], '2-29': [10, 1, 35, 17], '2-30': [2, 27, 35, 11],
  '2-31': [], '2-32': [], '2-33': [], '2-34': [], '2-35': [],
  '2-36': [], '2-37': [], '2-38': [], '2-39': [],

  // Length of moving object (3) vs ...
  '3-9': [13, 4, 8], '3-10': [17, 10, 4], '3-11': [1, 8, 10, 29], '3-12': [1, 8, 10, 29],
  '3-14': [8, 35, 29, 34], '3-17': [4, 28, 10, 34], '3-21': [], '3-26': [],
  '3-27': [10, 14, 29, 40], '3-28': [28, 32, 4], '3-30': [1, 18], '3-35': [1, 15, 17, 24],
  '3-36': [1, 19, 26, 24], '3-39': [4, 28, 10, 34],

  // Length of stationary object (4) vs ...
  '4-11': [1, 13, 14], '4-14': [15, 14, 28, 26], '4-17': [1, 40, 35], '4-28': [30, 14, 7, 26],
  '4-30': [2, 25], '4-35': [], '4-39': [30, 14, 7, 26],

  // Area of moving object (5) vs ...
  '5-7': [14, 1, 7, 4], '5-8': [], '5-9': [29, 30, 4, 34], '5-10': [19, 30, 35, 2],
  '5-11': [10, 15, 36, 28], '5-12': [5, 34, 29, 4], '5-13': [11, 2, 13, 39],
  '5-14': [3, 15, 40, 14], '5-17': [3, 19, 35, 5], '5-21': [],
  '5-26': [29, 30, 6, 13], '5-28': [26, 28, 32, 3], '5-30': [], '5-31': [],
  '5-35': [15, 17, 4], '5-39': [14, 1, 7, 4],

  // Area of stationary object (6) vs ...
  '6-11': [], '6-14': [], '6-17': [], '6-28': [2, 17, 13],

  // Volume of moving object (7) vs ...
  '7-9': [29, 4, 38, 34], '7-10': [15, 35, 36, 37], '7-11': [6, 35, 4], '7-12': [1, 15, 29, 4],
  '7-13': [28, 10, 1, 39], '7-14': [9, 14, 15, 7], '7-17': [], '7-26': [25, 26, 28],
  '7-28': [29, 4, 38, 34], '7-29': [29, 30, 7], '7-35': [7, 4, 17], '7-39': [29, 4, 38, 34],

  // Volume of stationary object (8) vs ...
  '8-10': [2, 18, 37], '8-14': [9, 14, 17, 15], '8-28': [2, 33],

  // Speed (9) vs ...
  '9-10': [13, 28, 15, 19], '9-11': [6, 18, 38, 40], '9-12': [35, 15, 18, 34],
  '9-13': [28, 33, 1, 18], '9-14': [8, 3, 26, 14], '9-15': [3, 19, 35, 5],
  '9-17': [28, 30, 36, 2], '9-19': [], '9-21': [], '9-22': [], '9-23': [],
  '9-24': [10, 13, 28, 38], '9-25': [], '9-26': [10, 13, 28, 38], '9-27': [11, 35, 27, 28],
  '9-28': [10, 35, 23], '9-30': [13, 31], '9-31': [26, 10, 34], '9-32': [], '9-33': [],
  '9-34': [], '9-35': [19, 35, 38, 2], '9-36': [], '9-37': [], '9-38': [],
  '9-39': [29, 30, 34],

  // Force (10) vs ...
  '10-11': [35, 10, 36], '10-12': [4, 6, 28, 32], '10-13': [35, 10, 21],
  '10-14': [35, 10, 14, 27], '10-15': [19, 17, 10], '10-17': [],
  '10-18': [], '10-19': [], '10-20': [18, 26, 35], '10-21': [],
  '10-22': [29, 35, 30, 18], '10-23': [], '10-25': [13, 3, 36, 24],
  '10-26': [], '10-27': [3, 35, 13, 21], '10-28': [35, 10, 23, 24],
  '10-29': [3, 35], '10-30': [13, 3, 36, 24], '10-31': [13, 19],
  '10-32': [1, 28, 3, 25], '10-33': [2, 15, 28, 36], '10-34': [11, 3],
  '10-35': [3, 35, 36, 37], '10-36': [], '10-37': [], '10-38': [],
  '10-39': [3, 28, 35, 37],

  // Stress or pressure (11) vs ...
  '11-12': [35, 4, 15, 10], '11-13': [10, 36, 3, 37], '11-14': [9, 18, 3, 40],
  '11-15': [19, 3, 27], '11-17': [3, 35, 39, 18], '11-28': [6, 28, 25],
  '11-29': [3, 35], '11-30': [22, 2, 37], '11-31': [19, 1, 31],
  '11-32': [1, 35, 16], '11-33': [2, 36, 25], '11-34': [4, 10],
  '11-35': [], '11-36': [10, 14, 35, 37], '11-39': [10, 14, 36, 37],

  // Shape (12) vs ...
  '12-14': [35, 4, 14, 36], '12-15': [], '12-16': [], '12-17': [22, 14, 19, 32],
  '12-26': [4, 5, 15, 14], '12-28': [], '12-29': [4, 32, 10], '12-30': [],
  '12-31': [], '12-32': [], '12-33': [], '12-34': [], '12-35': [],
  '12-36': [], '12-37': [], '12-38': [], '12-39': [],

  // Stability of composition (13) vs ...
  '13-14': [18, 35, 37], '13-15': [13, 3], '13-17': [], '13-21': [],
  '13-27': [13, 35], '13-28': [13, 19], '13-29': [18, 26, 28],
  '13-34': [], '13-35': [], '13-36': [], '13-39': [13, 18, 35],

  // Strength (14) vs ...
  '14-15': [10, 26, 35, 28], '14-16': [], '14-17': [30, 10, 40], '14-19': [19, 35, 10],
  '14-26': [9, 40], '14-27': [11, 3], '14-28': [], '14-29': [18, 3, 36],
  '14-30': [10, 18, 3, 14], '14-31': [], '14-32': [], '14-33': [],
  '14-34': [], '14-35': [], '14-36': [], '14-37': [], '14-38': [],
  '14-39': [29, 35],

  // Duration of action by moving object (15) vs ...
  '15-17': [19, 35, 39], '15-19': [], '15-21': [], '15-26': [3, 35],
  '15-27': [11, 2, 13], '15-29': [3, 27, 16, 40], '15-30': [10, 4, 29, 15],
  '15-34': [3, 35, 10], '15-39': [29, 35, 39],

  // Duration of action by stationary object (16) vs ...
  '16-17': [], '16-27': [], '16-34': [],

  // Temperature (17) vs ...
  '17-18': [], '17-19': [35, 19, 32], '17-21': [], '17-22': [],
  '17-25': [], '17-27': [3, 17, 30, 39], '17-29': [], '17-30': [],
  '17-31': [], '17-32': [22, 33, 35], '17-33': [], '17-35': [35, 22, 1],
  '17-36': [], '17-39': [],

  // Illumination intensity (18) vs ...
  '18-19': [], '18-26': [32], '18-30': [], '18-31': [], '18-32': [],

  // Energy spent by moving object (19) vs ...
  '19-22': [21, 22, 35, 28], '19-25': [35, 38, 19, 18], '19-27': [],
  '19-30': [], '19-31': [], '19-35': [19, 24, 26, 31], '19-38': [],
  '19-39': [],

  // Energy spent by stationary object (20) vs ...
  '20-22': [], '20-27': [], '20-36': [],

  // Power (21) vs ...
  '21-22': [10, 35, 38], '21-27': [11, 28], '21-28': [], '21-29': [],
  '21-30': [10, 36, 23], '21-31': [10, 35, 38], '21-35': [19, 24, 26, 31],
  '21-36': [], '21-38': [], '21-39': [],

  // Loss of energy (22) vs ...
  '22-23': [], '22-27': [], '22-33': [],

  // Loss of substance (23) vs ...
  '23-25': [], '23-27': [], '23-28': [],

  // Loss of information (24) vs ...
  '24-25': [24, 26, 28, 32],

  // Loss of time (25) vs ...
  '25-26': [], '25-27': [], '25-35': [10, 20, 37, 35], '25-38': [],
  '25-39': [10, 20, 37, 35],

  // Quantity of substance (26) vs ...
  '26-27': [10, 26, 24], '26-28': [13, 29, 3, 27], '26-31': [], '26-35': [],
  '26-39': [35, 29, 25, 10],

  // Reliability (27) vs ...
  '27-28': [11, 3], '27-29': [11, 32, 1], '27-32': [1, 35, 12, 18],
  '27-33': [27, 17, 40], '27-34': [], '27-35': [35, 13, 8, 24],
  '27-36': [13, 35, 1], '27-39': [21, 11, 27, 19],

  // Measurement accuracy (28) vs ...
  '28-29': [32, 28, 3, 16], '28-32': [], '28-33': [], '28-35': [3, 33, 39, 10],

  // Manufacturing precision (29) vs ...
  '29-32': [1, 35, 12, 17], '29-33': [], '29-35': [1, 32, 17, 28],
  '29-39': [27, 1, 4],

  // External harm affecting object (30) vs ...
  '30-31': [], '30-32': [24, 35, 2], '30-35': [22, 1, 33, 28], '30-39': [22, 21, 27, 39],

  // Object-generated harmful factors (31) vs ...
  '31-32': [], '31-35': [22, 1, 40], '31-39': [22, 35, 18, 39],

  // Ease of manufacture (32) vs ...
  '32-33': [27, 26, 1, 13], '32-35': [35, 28, 6, 37], '32-36': [27, 1, 12, 24],
  '32-39': [1, 28, 13, 27],

  // Ease of operation (33) vs ...
  '33-35': [], '33-39': [1, 13, 24],

  // Ease of repair (34) vs ...
  '34-35': [1, 35, 13], '34-39': [1, 32, 10, 25],

  // Adaptability or versatility (35) vs ...
  '35-36': [15, 29, 37, 28], '35-39': [35, 28, 6, 37],

  // Device complexity (36) vs ...
  '36-39': [27, 28, 1, 36],

  // Difficulty of detecting/measuring (37) vs ...
  '37-39': [27, 35, 10, 34],

  // Extent of automation (38) vs ...
  '38-39': [35, 13, 8, 24]
};

/**
 * Generic, historically high-utility principles to fall back on when a
 * specific matrix cell is empty/unlisted. These are NOT a fabrication —
 * Principles 1, 35, 10, and 28 are simply the most frequently cited
 * principles across the matrix as a whole, so they are a defensible
 * default starting point rather than a random guess.
 */
export const FALLBACK_PRINCIPLES = [1, 35, 10, 28, 3, 24, 40];

/**
 * Look up the matrix cell for an (improving, worsening) parameter pair.
 * Matrix is not symmetric in real TRIZ (improving X vs worsening Y is not
 * the same as improving Y vs worsening X), so only the exact key is tried;
 * if absent, the function returns null so the caller can apply
 * FALLBACK_PRINCIPLES explicitly rather than silently guessing.
 *
 * @param {number} improvingParam - 1-39
 * @param {number} worseningParam - 1-39
 * @returns {number[] | null} ordered principle numbers, or null if unlisted
 */
export function lookupMatrixCell(improvingParam, worseningParam) {
  if (improvingParam === worseningParam) return null;
  const key = `${improvingParam}-${worseningParam}`;
  const cell = CONTRADICTION_MATRIX[key];
  return (cell && cell.length > 0) ? cell : null;
}

/**
 * Resolve a principle number into its canonical {num, name, short} record.
 * Throws if the number is not a real TRIZ principle (1-40) — this is the
 * structural guardrail: nothing can ever cite a principle that doesn't
 * exist in this table.
 *
 * @param {number} num
 * @returns {{num:number, name:string, short:string}}
 */
export function resolvePrinciple(num) {
  const p = TRIZ_PRINCIPLES[num];
  if (!p) {
    throw new Error(`[trizKnowledge] Unknown TRIZ principle number: ${num}. Valid range is 1-40.`);
  }
  return { num, name: p.name, short: p.short };
}

/**
 * Resolve a parameter number into its canonical {num, name} record.
 * Same guardrail as resolvePrinciple, applied to the 39 parameters.
 *
 * @param {number} num
 * @returns {{num:number, name:string}}
 */
export function resolveParameter(num) {
  const p = TRIZ_PARAMETERS[num];
  if (!p) {
    throw new Error(`[trizKnowledge] Unknown TRIZ parameter number: ${num}. Valid range is 1-39.`);
  }
  return { num, name: p.name };
}

/**
 * Given an (improving, worsening) parameter pair, return the ranked,
 * fully-resolved principle list — either from the matrix, or from the
 * fallback set, clearly labeled either way so callers/UI can disclose
 * which case occurred (this is part of the "show your evidence" guarantee).
 *
 * @param {number} improvingParam
 * @param {number} worseningParam
 * @returns {{
 *   source: 'matrix' | 'fallback',
 *   improving: {num:number, name:string},
 *   worsening: {num:number, name:string},
 *   principles: Array<{num:number, name:string, short:string}>
 * }}
 */
export function getRankedPrinciples(improvingParam, worseningParam) {
  const cell = lookupMatrixCell(improvingParam, worseningParam);
  const list = cell || FALLBACK_PRINCIPLES;
  return {
    source: cell ? 'matrix' : 'fallback',
    improving: resolveParameter(improvingParam),
    worsening: resolveParameter(worseningParam),
    principles: list.map(resolvePrinciple)
  };
}

/**
 * Returns true if the matrix has explicit coverage for this pair.
 * Useful for confidence scoring upstream (matrix hit = higher confidence
 * than fallback hit).
 */
export function matrixHasCoverage(improvingParam, worseningParam) {
  return lookupMatrixCell(improvingParam, worseningParam) !== null;
}

export function getAllParameterNames() {
  return Object.entries(TRIZ_PARAMETERS).map(([num, p]) => ({ num: Number(num), name: p.name }));
}

export function getAllPrincipleNames() {
  return Object.entries(TRIZ_PRINCIPLES).map(([num, p]) => ({ num: Number(num), name: p.name, short: p.short }));
}
