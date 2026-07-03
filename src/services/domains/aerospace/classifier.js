/**
 * Aerospace Domain Classifier
 * Detects if a user question is an aerospace problem and classifies the type
 */

const AEROSPACE_KEYWORDS = {
  'Airfoil Analysis': ['airfoil', 'wing', 'aerofoil', 'lift coefficient', 'drag coefficient', 'cl', 'cd'],
  'Nozzle Flow': ['nozzle', 'rocket nozzle', 'convergent divergent', 'thrust', 'expansion'],
  'Propulsion': ['propulsion', 'engine', 'thrust', 'specific impulse', 'isp', 'rocket'],
  'Aerodynamics': ['aerodynamics', 'lift', 'drag', 'moment', 'stall', 'boundary layer'],
  'Orbital Mechanics': ['orbit', 'trajectory', 'delta-v', 'escape velocity', 'kepler']
};

const GENERAL_AEROSPACE_KEYWORDS = [
  'airfoil', 'wing', 'aerospace', 'aerodynamics', 'lift', 'drag',
  'thrust', 'nozzle', 'rocket', 'propulsion', 'mach', 'reynolds',
  'angle of attack', 'aoa', 'cl', 'cd', 'cm', 'stall',
  'boundary layer', 'turbulence', 'compressible', 'supersonic'
];

/**
 * Classify if the question is an aerospace problem
 * @param {string} question - User's question
 * @returns {Object} - { isAerospace: boolean, systemType: string, confidence: number }
 */
export function classifyAerospace(question) {
  const lower = question.toLowerCase();
  
  // Check for general aerospace keywords
  const hasAerospaceKeywords = GENERAL_AEROSPACE_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasAerospaceKeywords) {
    return {
      isAerospace: false,
      systemType: null,
      confidence: 0
    };
  }
  
  // Classify specific system type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [systemType, keywords] of Object.entries(AEROSPACE_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = systemType;
    }
  }
  
  // If no specific type matched, default to generic aerospace
  if (!bestMatch || bestScore < 0.3) {
    return {
      isAerospace: true,
      systemType: 'Generic Aerospace',
      confidence: 0.5
    };
  }
  
  return {
    isAerospace: true,
    systemType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for aerospace domain
 * @returns {string} - 'XFOIL'
 */
export function getSolverName() {
  return 'XFOIL';
}

/**
 * Get supported aerospace system types
 * @returns {string[]} - List of supported system types
 */
export function getSupportedSystemTypes() {
  return Object.keys(AEROSPACE_KEYWORDS);
}
