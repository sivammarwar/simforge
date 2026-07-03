/**
 * Fluids Domain Schematic Generator
 * Generates fluid schematics as SVG for various fluid systems
 */

/**
 * Generate fluid schematic SVG
 * @param {string} systemType - Type of fluid system (Pipe Flow, Airfoil, etc.)
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
export function generateFluidSchematic(systemType, params) {
  const generators = {
    'Pipe Flow': generatePipeFlowSchematic,
    'Channel Flow': generateChannelFlowSchematic,
    'Boundary Layer': generateBoundaryLayerSchematic,
    'Turbulent Flow': generateTurbulentFlowSchematic,
    'Venturi Meter': generateVenturiSchematic,
    'Generic Fluids': generateGenericSchematic
  };
  
  const generator = generators[systemType] || generators['Generic Fluids'];
  return generator(params);
}

/**
 * Generate Pipe Flow schematic
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generatePipeFlowSchematic(params) {
  const width = 400;
  const height = 200;
  const diameter = params['Diameter'] || params['diameter'] || '50mm';
  const velocity = params['Velocity inlet'] || params['velocity_inlet'] || '1m/s';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Pipe Flow</text>
      
      <!-- Pipe walls -->
      <line x1="50" y1="70" x2="350" y2="70" stroke="#E8EAF0" stroke-width="3"/>
      <line x1="50" y1="130" x2="350" y2="130" stroke="#E8EAF0" stroke-width="3"/>
      
      <!-- Fluid region -->
      <rect x="50" y="70" width="300" height="60" fill="#3b82f6" opacity="0.2"/>
      
      <!-- Flow arrows -->
      <line x1="80" y1="100" x2="320" y2="100" stroke="#3b82f6" stroke-width="3" marker-end="url(#arrowhead)"/>
      <path d="M120 85 Q140 100 120 115" fill="none" stroke="#3b82f6" stroke-width="1"/>
      <path d="M200 85 Q220 100 200 115" fill="none" stroke="#3b82f6" stroke-width="1"/>
      <path d="M280 85 Q300 100 280 115" fill="none" stroke="#3b82f6" stroke-width="1"/>
      
      <!-- Parameters -->
      <text x="150" y="60" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">D: ${diameter}</text>
      <text x="150" y="150" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">V: ${velocity}</text>
      
      <!-- Pressure labels -->
      <text x="60" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">P1</text>
      <text x="320" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">P2</text>
    </svg>
  `;
}

/**
 * Generate Channel Flow schematic
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generateChannelFlowSchematic(params) {
  const width = 400;
  const height = 200;
  const widthChannel = params['Width'] || params['width'] || '100mm';
  const depth = params['Depth'] || params['depth'] || '50mm';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Channel Flow</text>
      
      <!-- Channel walls -->
      <line x1="50" y1="60" x2="350" y2="60" stroke="#E8EAF0" stroke-width="3"/>
      <line x1="50" y1="140" x2="350" y2="140" stroke="#E8EAF0" stroke-width="3"/>
      <line x1="50" y1="60" x2="50" y2="140" stroke="#E8EAF0" stroke-width="3"/>
      <line x1="350" y1="60" x2="350" y2="140" stroke="#E8EAF0" stroke-width="3"/>
      
      <!-- Fluid region -->
      <rect x="50" y="60" width="300" height="80" fill="#3b82f6" opacity="0.2"/>
      
      <!-- Flow arrows -->
      <line x1="80" y1="100" x2="320" y2="100" stroke="#3b82f6" stroke-width="3" marker-end="url(#arrowhead)"/>
      
      <!-- Parameters -->
      <text x="150" y="50" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">W: ${widthChannel}</text>
      <text x="150" y="160" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">D: ${depth}</text>
      
      <!-- Free surface indicator -->
      <line x1="50" y1="60" x2="350" y2="60" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5,5"/>
      <text x="320" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Free Surface</text>
    </svg>
  `;
}

/**
 * Generate Boundary Layer schematic
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generateBoundaryLayerSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Boundary Layer</text>
      
      <!-- Flat plate -->
      <rect x="50" y="130" width="300" height="10" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Free stream velocity -->
      <line x1="50" y1="40" x2="320" y2="40" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="330" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">U∞</text>
      
      <!-- Boundary layer profile -->
      <path d="M50 130 Q100 120 150 100 Q200 80 250 70 Q300 65 350 65" fill="none" stroke="#3b82f6" stroke-width="2"/>
      
      <!-- Boundary layer thickness -->
      <line x1="200" y1="65" x2="200" y2="130" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,5"/>
      <text x="205" y="100" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">δ</text>
      
      <!-- Viscous sublayer -->
      <rect x="50" y="120" width="300" height="10" fill="#ef4444" opacity="0.2"/>
      <text x="55" y="128" font-family="JetBrains Mono, monospace" font-size="9" fill="#ef4444">Viscous sublayer</text>
    </svg>
  `;
}

/**
 * Generate Turbulent Flow schematic
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generateTurbulentFlowSchematic(params) {
  const width = 400;
  const height = 200;
  const reynolds = params['Reynolds number'] || params['reynolds'] || '4000';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Turbulent Flow</text>
      
      <!-- Pipe walls -->
      <line x1="50" y1="70" x2="350" y2="70" stroke="#E8EAF0" stroke-width="3"/>
      <line x1="50" y1="130" x2="350" y2="130" stroke="#E8EAF0" stroke-width="3"/>
      
      <!-- Turbulent eddies -->
      <circle cx="100" cy="90" r="8" fill="#3b82f6" opacity="0.5"/>
      <circle cx="120" cy="110" r="6" fill="#3b82f6" opacity="0.5"/>
      <circle cx="150" cy="85" r="10" fill="#3b82f6" opacity="0.5"/>
      <circle cx="180" cy="115" r="7" fill="#3b82f6" opacity="0.5"/>
      <circle cx="210" cy="95" r="9" fill="#3b82f6" opacity="0.5"/>
      <circle cx="240" cy="105" r="8" fill="#3b82f6" opacity="0.5"/>
      <circle cx="270" cy="88" r="7" fill="#3b82f6" opacity="0.5"/>
      <circle cx="300" cy="112" r="9" fill="#3b82f6" opacity="0.5"/>
      
      <!-- Flow direction -->
      <line x1="80" y1="100" x2="320" y2="100" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      
      <!-- Reynolds number -->
      <text x="150" y="160" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Re: ${reynolds}</text>
      <text x="150" y="175" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Re > 4000 (Turbulent)</text>
    </svg>
  `;
}

/**
 * Generate Venturi Meter schematic
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generateVenturiSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Venturi Meter</text>
      
      <!-- Venturi tube -->
      <path d="M50 70 L120 70 L150 90 L250 90 L280 70 L350 70" fill="none" stroke="#E8EAF0" stroke-width="3"/>
      <path d="M50 130 L120 130 L150 110 L250 110 L280 130 L350 130" fill="none" stroke="#E8EAF0" stroke-width="3"/>
      
      <!-- Fluid region -->
      <path d="M50 70 L120 70 L150 90 L250 90 L280 70 L350 70 L350 130 L280 130 L250 110 L150 110 L120 130 L50 130 Z" fill="#3b82f6" opacity="0.2"/>
      
      <!-- Flow arrows -->
      <line x1="80" y1="100" x2="320" y2="100" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      
      <!-- Pressure taps -->
      <line x1="100" y1="70" x2="100" y2="50" stroke="#ef4444" stroke-width="2"/>
      <text x="90" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">P1</text>
      
      <line x1="200" y1="90" x2="200" y2="50" stroke="#3b82f6" stroke-width="2"/>
      <text x="190" y="45" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">P2</text>
      
      <!-- Throat label -->
      <text x="185" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Throat</text>
      
      <!-- Bernoulli equation -->
      <text x="120" y="170" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">P1 + ½ρV1² = P2 + ½ρV2²</text>
    </svg>
  `;
}

/**
 * Generate generic fluid schematic (fallback)
 * @param {Object} params - Fluid parameters
 * @returns {string} - SVG string
 */
function generateGenericSchematic(params) {
  const width = 400;
  const height = 200;
  const systemType = params.system_type || 'Fluid System';
  
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
