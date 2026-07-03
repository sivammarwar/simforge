/**
 * Aerospace Domain Schematic Generator
 * Generates aerospace schematics as SVG for various aerospace systems
 */

/**
 * Generate aerospace schematic SVG
 * @param {string} systemType - Type of aerospace system (Airfoil, Wing, etc.)
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
export function generateAerospaceSchematic(systemType, params) {
  const generators = {
    'Airfoil': generateAirfoilSchematic,
    'Wing': generateWingSchematic,
    'Drag Polar': generateDragPolarSchematic,
    'Lift Curve': generateLiftCurveSchematic,
    'Propeller': generatePropellerSchematic,
    'Generic Aerospace': generateGenericSchematic
  };
  
  const generator = generators[systemType] || generators['Generic Aerospace'];
  return generator(params);
}

/**
 * Generate Airfoil schematic
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generateAirfoilSchematic(params) {
  const width = 400;
  const height = 200;
  const chord = params['Chord'] || params['chord'] || '1m';
  const aoa = params['Angle of attack'] || params['angle_of_attack'] || '5°';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Airfoil</text>
      
      <!-- Airfoil shape (NACA 0012-like) -->
      <path d="M50 100 Q100 60 150 60 Q200 60 250 60 Q300 60 350 100 Q300 140 250 140 Q200 140 150 140 Q100 140 50 100" 
            fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Chord line -->
      <line x1="50" y1="100" x2="350" y2="100" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5,5"/>
      <text x="180" y="115" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Chord: ${chord}</text>
      
      <!-- Angle of attack indicator -->
      <line x1="50" y1="100" x2="50" y2="60" stroke="#f59e0b" stroke-width="2"/>
      <line x1="50" y1="100" x2="80" y2="100" stroke="#f59e0b" stroke-width="2"/>
      <path d="M50 85 Q60 80 70 85" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <text x="55" y="75" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">α: ${aoa}</text>
      
      <!-- Flow direction -->
      <line x1="20" y1="100" x2="40" y2="100" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="5" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">V∞</text>
      
      <!-- Leading/trailing edge labels -->
      <text x="35" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">LE</text>
      <text x="355" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">TE</text>
    </svg>
  `;
}

/**
 * Generate Wing schematic
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generateWingSchematic(params) {
  const width = 400;
  const height = 200;
  const span = params['Wingspan'] || params['wingspan'] || '10m';
  const chord = params['Chord'] || params['chord'] || '1m';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Wing</text>
      
      <!-- Wing planform (tapered) -->
      <path d="M100 100 L200 60 L300 60 L350 100 L300 140 L200 140 L100 100" 
            fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Root chord -->
      <line x1="100" y1="100" x2="100" y2="140" stroke="#3b82f6" stroke-width="2"/>
      <text x="85" y="125" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Cr</text>
      
      <!-- Tip chord -->
      <line x1="300" y1="60" x2="300" y2="140" stroke="#3b82f6" stroke-width="2"/>
      <text x="305" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Ct</text>
      
      <!-- Wingspan -->
      <line x1="100" y1="170" x2="300" y2="170" stroke="#f59e0b" stroke-width="2"/>
      <line x1="100" y1="165" x2="100" y2="175" stroke="#f59e0b" stroke-width="2"/>
      <line x1="300" y1="165" x2="300" y2="175" stroke="#f59e0b" stroke-width="2"/>
      <text x="180" y="185" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">Span: ${span}</text>
      
      <!-- Fuselage -->
      <rect x="50" y="85" width="80" height="30" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      <text x="70" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Fuselage</text>
    </svg>
  `;
}

/**
 * Generate Drag Polar schematic
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generateDragPolarSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Drag Polar (Cd vs Cl)</text>
      
      <!-- Axes -->
      <line x1="60" y1="160" x2="360" y2="160" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="60" y1="160" x2="60" y2="40" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Axis labels -->
      <text x="350" y="175" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Cl</text>
      <text x="30" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Cd</text>
      
      <!-- Drag polar curve -->
      <path d="M60 150 Q100 140 150 120 Q200 90 250 80 Q300 75 350 70" 
            fill="none" stroke="#3b82f6" stroke-width="2"/>
      
      <!-- Minimum drag point -->
      <circle cx="150" cy="120" r="5" fill="#ef4444"/>
      <text x="155" y="115" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Cd,min</text>
      
      <!-- Stall point -->
      <circle cx="300" cy="75" r="5" fill="#f59e0b"/>
      <text x="305" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">Stall</text>
      
      <!-- Equation -->
      <text x="80" y="185" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">Cd = Cd,0 + KCl²</text>
    </svg>
  `;
}

/**
 * Generate Lift Curve schematic
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generateLiftCurveSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Lift Curve (Cl vs α)</text>
      
      <!-- Axes -->
      <line x1="200" y1="160" x2="360" y2="160" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="200" y1="160" x2="200" y2="40" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Axis labels -->
      <text x="350" y="175" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">α (deg)</text>
      <text x="170" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Cl</text>
      
      <!-- Lift curve -->
      <line x1="200" y1="100" x2="320" y2="50" stroke="#3b82f6" stroke-width="2"/>
      
      <!-- Zero lift angle -->
      <circle cx="200" cy="100" r="5" fill="#ef4444"/>
      <text x="170" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">α₀</text>
      
      <!-- Stall angle -->
      <circle cx="320" cy="50" r="5" fill="#f59e0b"/>
      <text x="325" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">α,STALL</text>
      
      <!-- Slope -->
      <text x="230" y="80" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">2π/rad</text>
    </svg>
  `;
}

/**
 * Generate Propeller schematic
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generatePropellerSchematic(params) {
  const width = 400;
  const height = 200;
  const diameter = params['Diameter'] || params['diameter'] || '2m';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Propeller</text>
      
      <!-- Hub -->
      <circle cx="200" cy="100" r="15" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Blade 1 -->
      <ellipse cx="200" cy="60" rx="10" ry="40" fill="#64748b" stroke="#E8EAF0" stroke-width="2" transform="rotate(-30 200 100)"/>
      
      <!-- Blade 2 -->
      <ellipse cx="200" cy="140" rx="10" ry="40" fill="#64748b" stroke="#E8EAF0" stroke-width="2" transform="rotate(30 200 100)"/>
      
      <!-- Blade 3 -->
      <ellipse cx="160" cy="100" rx="10" ry="40" fill="#64748b" stroke="#E8EAF0" stroke-width="2" transform="rotate(90 200 100)"/>
      
      <!-- Diameter indication -->
      <line x1="100" y1="100" x2="300" y2="100" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,5"/>
      <line x1="100" y1="95" x2="100" y2="105" stroke="#f59e0b" stroke-width="2"/>
      <line x1="300" y1="95" x2="300" y2="105" stroke="#f59e0b" stroke-width="2"/>
      <text x="180" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">D: ${diameter}</text>
      
      <!-- Rotation arrow -->
      <path d="M230 70 Q260 60 270 90" fill="none" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="275" y="75" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">ω</text>
      
      <!-- Thrust arrow -->
      <line x1="200" y1="100" x2="200" y2="40" stroke="#ef4444" stroke-width="3" marker-end="url(#arrowhead)"/>
      <text x="205" y="35" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Thrust</text>
    </svg>
  `;
}

/**
 * Generate generic aerospace schematic (fallback)
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
function generateGenericSchematic(params) {
  const width = 400;
  const height = 200;
  const systemType = params.system_type || 'Aerospace System';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      <text x="${width/2}" y="${height/2}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="#E8EAF0">
        ${systemType}
      </text>
      <text x="${width/2}" y="${height/2 + 25}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" fill="#64748b">
        Schematic generation
      </text>
    </svg>
  `;
}
