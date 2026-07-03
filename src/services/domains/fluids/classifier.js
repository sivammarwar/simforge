/**
 * Fluids Domain Classifier
 * Detects if a user question is a fluids problem and classifies the type
 */

const FLUIDS_KEYWORDS = {
  'Pipe Flow': ['pipe flow', 'pipe', 'flow in pipe', 'internal flow', 'pressure drop'],
  'Airfoil Analysis': ['airfoil', 'wing', 'aerofoil', 'lift', 'drag', 'air flow'],
  'Channel Flow': ['channel flow', 'open channel', 'river flow', 'canal'],
  'Turbulent Flow': ['turbulent', 'turbulence', 'reynolds number', 'high reynolds'],
  'Laminar Flow': ['laminar', 'low reynolds', 'smooth flow'],
  'Boundary Layer': ['boundary layer', 'bl', 'wall shear', 'velocity profile']
};

const GENERAL_FLUIDS_KEYWORDS = [
  'fluid', 'flow', 'velocity', 'pressure', 'viscosity', 'density',
  'reynolds', 'mach', 'bernoulli', 'navier-stokes', 'cfd',
  'drag', 'lift', 'turbulence', 'laminar', 'pipe', 'channel',
  'airflow', 'water flow', 'inlet', 'outlet', 'boundary condition'
];

/**
 * Classify if the question is a fluids problem
 * @param {string} question - User's question
 * @returns {Object} - { isFluids: boolean, systemType: string, confidence: number }
 */
export function classifyFluids(question) {
  const lower = question.toLowerCase();
  
  // Check for general fluids keywords
  const hasFluidsKeywords = GENERAL_FLUIDS_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasFluidsKeywords) {
    return {
      isFluids: false,
      systemType: null,
      confidence: 0
    };
  }
  
  // Classify specific system type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [systemType, keywords] of Object.entries(FLUIDS_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = systemType;
    }
  }
  
  // If no specific type matched, default to generic fluids
  if (!bestMatch || bestScore < 0.3) {
    return {
      isFluids: true,
      systemType: 'Generic Fluids',
      confidence: 0.5
    };
  }
  
  return {
    isFluids: true,
    systemType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for fluids domain
 * @returns {string} - 'OpenFOAM'
 */
export function getSolverName() {
  return 'OpenFOAM';
}

/**
 * Get supported fluids system types
 * @returns {string[]} - List of supported system types
 */
export function getSupportedSystemTypes() {
  return Object.keys(FLUIDS_KEYWORDS);
}
