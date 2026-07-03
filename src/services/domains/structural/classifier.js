/**
 * Structural Domain Classifier
 * Detects if a user question is a structural/mechanical problem and classifies the type
 */

const STRUCTURAL_KEYWORDS = {
  'Cantilever Beam': ['cantilever', 'fixed-free', 'beam fixed at one end', 'overhang'],
  'Simply Supported Beam': ['simply supported', 'pinned-pinned', 'simply supported beam', 'pin support'],
  'Fixed Beam': ['fixed-fixed', 'clamped', 'both ends fixed', 'fixed beam'],
  'Column Buckling': ['column', 'buckling', 'compressive load', 'euler buckling'],
  'Plate Bending': ['plate', 'bending plate', 'flat plate', 'sheet metal'],
  'Shell Analysis': ['shell', 'curved shell', 'pressure vessel', 'cylinder'],
  'Truss Analysis': ['truss', 'bridge truss', 'roof truss', 'pin jointed'],
  'Frame Analysis': ['frame', 'portal frame', 'steel frame', 'moment frame']
};

const GENERAL_STRUCTURAL_KEYWORDS = [
  'beam', 'column', 'truss', 'frame', 'plate', 'shell',
  'stress', 'strain', 'deflection', 'bending', 'torsion',
  'youngs modulus', 'poisson ratio', 'yield strength',
  'finite element', 'fea', 'structural analysis', 'mechanical',
  'load', 'force', 'moment', 'shear', 'axial',
  'cantilever', 'support', 'fixed', 'pinned', 'roller'
];

/**
 * Classify if the question is a structural problem
 * @param {string} question - User's question
 * @returns {Object} - { isStructural: boolean, systemType: string, confidence: number }
 */
export function classifyStructural(question) {
  const lower = question.toLowerCase();
  
  // Check for general structural keywords
  const hasStructuralKeywords = GENERAL_STRUCTURAL_KEYWORDS.some(keyword => 
    lower.includes(keyword)
  );
  
  if (!hasStructuralKeywords) {
    return {
      isStructural: false,
      systemType: null,
      confidence: 0
    };
  }
  
  // Classify specific system type
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [systemType, keywords] of Object.entries(STRUCTURAL_KEYWORDS)) {
    const matchCount = keywords.filter(keyword => lower.includes(keyword)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = systemType;
    }
  }
  
  // If no specific type matched, default to generic structural
  if (!bestMatch || bestScore < 0.3) {
    return {
      isStructural: true,
      systemType: 'Generic Structural',
      confidence: 0.5
    };
  }
  
  return {
    isStructural: true,
    systemType: bestMatch,
    confidence: bestScore
  };
}

/**
 * Get the solver name for structural domain
 * @returns {string} - 'CalculiX'
 */
export function getSolverName() {
  return 'CalculiX';
}

/**
 * Get supported structural system types
 * @returns {string[]} - List of supported system types
 */
export function getSupportedSystemTypes() {
  return Object.keys(STRUCTURAL_KEYWORDS);
}
