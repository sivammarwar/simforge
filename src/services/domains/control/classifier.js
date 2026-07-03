/**
 * Control Domain Classifier
 * Detects if a user question is a control systems problem and classifies the system type
 */

const CONTROL_KEYWORDS = {
  'Second-Order System': ['second-order', '2nd order', 'second order', 'natural frequency', 'damping ratio', 'omega', 'zeta'],
  'PID Controller': ['pid', 'proportional integral derivative', 'kp ki kd', 'tuning'],
  'Step Response': ['step response', 'step input', 'unit step', 'rise time', 'peak time', 'overshoot', 'settling time'],
  'Bode Plot': ['bode', 'frequency response', 'magnitude', 'phase', 'gain margin', 'phase margin'],
  'Stability Analysis': ['stability', 'pole', 'zero', 'root locus', 'nyquist', 'margin'],
  'State Space': ['state space', 'state-space', 'matrix', 'eigenvalue', 'controllability', 'observability'],
  'Transfer Function': ['transfer function', 'tf', 's-domain', 'laplace', 'pole-zero']
};

const GENERAL_CONTROL_KEYWORDS = [
  'control', 'controller', 'feedback', 'closed-loop', 'open-loop',
  'system', 'plant', 'actuator', 'sensor', 'reference', 'setpoint',
  'frequency', 'damping', 'overshoot', 'settling', 'rise', 'peak',
  'stability', 'stable', 'unstable', 'margin', 'gain', 'phase',
  'pole', 'zero', 'root', 'locus', 'nyquist', 'bode',
  'pid', 'proportional', 'integral', 'derivative', 'tuning',
  'transfer', 'function', 'laplace', 's-domain', 'time domain',
  'step', 'impulse', 'ramp', 'response', 'input', 'output'
];

/**
 * Classify if the question is a control systems problem
 * @param {string} question - User's question
 * @returns {Object} - { isControl: boolean, systemType: string, confidence: number }
 */
export function classifyControl(question) {
  const lower = question.toLowerCase();
  
  // Check for general control keywords
  const hasControlKeywords = GENERAL_CONTROL_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasControlKeywords) {
    return {
      isControl: false,
      systemType: null,
      confidence: 0
    };
  }
  
  // Classify specific system type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [systemType, keywords] of Object.entries(CONTROL_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = systemType;
    }
  }
  
  // If no specific type matched, default to generic control system
  if (!bestMatch || bestScore < 0.3) {
    return {
      isControl: true,
      systemType: 'Generic Control',
      confidence: 0.5
    };
  }
  
  return {
    isControl: true,
    systemType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for control domain
 * @returns {string} - 'python' (control systems typically use Python/Matlab)
 */
export function getSolverName() {
  return 'python';
}

/**
 * Get supported control system types
 * @returns {string[]} - List of supported system types
 */
export function getSupportedSystemTypes() {
  return Object.keys(CONTROL_KEYWORDS);
}
