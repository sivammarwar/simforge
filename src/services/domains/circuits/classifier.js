/**
 * Circuits Domain Classifier
 * Detects if a user question is a circuit problem and classifies the circuit type
 */

const CIRCUIT_KEYWORDS = {
  'RC Low-Pass Filter': ['rc filter', 'low pass', 'rc low pass', 'capacitor filter', 'passive filter'],
  'RC High-Pass Filter': ['high pass', 'rc high pass'],
  'Voltage Divider': ['voltage divider', 'resistive divider', 'potential divider'],
  'Buck Converter': ['buck converter', 'step down', 'dc-dc buck', 'switching regulator'],
  'Boost Converter': ['boost converter', 'step up', 'dc-dc boost'],
  'Common Emitter Amplifier': ['common emitter', 'bjt amplifier', 'transistor amplifier'],
  'Op-Amp Circuit': ['op-amp', 'operational amplifier', 'inverting', 'non-inverting'],
  'LC Filter': ['lc filter', 'inductor capacitor', 'bandpass', 'bandstop'],
  'Rectifier': ['rectifier', 'diode bridge', 'ac to dc'],
  'Oscillator': ['oscillator', 'astable', 'multivibrator', '555 timer']
};

const GENERAL_CIRCUIT_KEYWORDS = [
  'resistor', 'capacitor', 'inductor', 'diode', 'transistor', 'op-amp',
  'voltage', 'current', 'ohm', 'farad', 'henry', 'circuit', 'netlist',
  'spice', 'ngspice', 'impedance', 'admittance', 'frequency', 'phase',
  'gain', 'amplifier', 'filter', 'converter', 'bridge', 'node',
  'simpson', 'ode', 'differential', 'numerical', 'wire delay',
  'physical design', 'interconnect', 'propagation delay', 'elmore'
];

/**
 * Classify if the question is a circuit problem
 * @param {string} question - User's question
 * @returns {Object} - { isCircuit: boolean, circuitType: string, confidence: number }
 */
export function classifyCircuit(question) {
  const lower = question.toLowerCase();
  
  // Check for general circuit keywords
  const hasCircuitKeywords = GENERAL_CIRCUIT_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasCircuitKeywords) {
    return {
      isCircuit: false,
      circuitType: null,
      confidence: 0
    };
  }
  
  // Classify specific circuit type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [circuitType, keywords] of Object.entries(CIRCUIT_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = circuitType;
    }
  }
  
  // If no specific type matched, default to generic circuit
  if (!bestMatch || bestScore < 0.3) {
    return {
      isCircuit: true,
      circuitType: 'Generic Circuit',
      confidence: 0.5
    };
  }
  
  return {
    isCircuit: true,
    circuitType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for circuits domain
 * @returns {string} - 'ngspice'
 */
export function getSolverName() {
  return 'ngspice';
}

/**
 * Get supported circuit types
 * @returns {string[]} - List of supported circuit types
 */
export function getSupportedCircuitTypes() {
  return Object.keys(CIRCUIT_KEYWORDS);
}
