/**
 * Thermal Domain Classifier
 * Detects if a user question is a thermal problem and classifies the type
 */

const THERMAL_KEYWORDS = {
  'Heat Sink': ['heat sink', 'heatsink', 'thermal dissipation', 'cooling fin'],
  'Heat Conduction': ['heat conduction', 'thermal conduction', 'conduction', 'fourier'],
  'Convection': ['convection', 'forced convection', 'natural convection', 'heat transfer coefficient'],
  'Radiation': ['thermal radiation', 'radiation', 'stefan-boltzmann', 'emissivity'],
  'Heat Exchanger': ['heat exchanger', 'counterflow', 'parallel flow', 'shell and tube'],
  'Thermal Stress': ['thermal stress', 'thermal expansion', 'thermal strain', 'thermo-mechanical']
};

const GENERAL_THERMAL_KEYWORDS = [
  'temperature', 'heat', 'thermal', 'conduction', 'convection', 'radiation',
  'heat transfer', 'cooling', 'heating', 'thermal conductivity', 'specific heat',
  'heat capacity', 'enthalpy', 'entropy', 'thermodynamics', 'heat flux',
  'insulation', 'thermal resistance', 'thermal diffusivity', 'prandtl', 'nusselt'
];

/**
 * Classify if the question is a thermal problem
 * @param {string} question - User's question
 * @returns {Object} - { isThermal: boolean, systemType: string, confidence: number }
 */
export function classifyThermal(question) {
  const lower = question.toLowerCase();
  
  // Check for general thermal keywords
  const hasThermalKeywords = GENERAL_THERMAL_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasThermalKeywords) {
    return {
      isThermal: false,
      systemType: null,
      confidence: 0
    };
  }
  
  // Classify specific system type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [systemType, keywords] of Object.entries(THERMAL_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = systemType;
    }
  }
  
  // If no specific type matched, default to generic thermal
  if (!bestMatch || bestScore < 0.3) {
    return {
      isThermal: true,
      systemType: 'Generic Thermal',
      confidence: 0.5
    };
  }
  
  return {
    isThermal: true,
    systemType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for thermal domain
 * @returns {string} - 'Elmer'
 */
export function getSolverName() {
  return 'Elmer';
}

/**
 * Get supported thermal system types
 * @returns {string[]} - List of supported system types
 */
export function getSupportedSystemTypes() {
  return Object.keys(THERMAL_KEYWORDS);
}
