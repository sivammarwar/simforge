/**
 * Structural Domain Schematic Generator
 * Generates structural schematics as SVG for various structural systems
 */

/**
 * Generate structural schematic SVG
 * @param {string} systemType - Type of structural system (Cantilever Beam, Simply Supported Beam, etc.)
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
export function generateStructuralSchematic(systemType, params) {
  const generators = {
    'Cantilever Beam': generateCantileverBeamSchematic,
    'Simply Supported Beam': generateSimplySupportedBeamSchematic,
    'Fixed Beam': generateFixedBeamSchematic,
    'Truss': generateTrussSchematic,
    'Frame': generateFrameSchematic,
    'Generic Structural': generateGenericSchematic
  };
  
  const generator = generators[systemType] || generators['Generic Structural'];
  return generator(params);
}

/**
 * Generate Cantilever Beam schematic
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateCantileverBeamSchematic(params) {
  const width = 400;
  const height = 200;
  const length = params['Length'] || params['length'] || '100mm';
  const load = params['Load magnitude'] || params['load_magnitude'] || '100N';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Cantilever Beam</text>
      
      <!-- Fixed support (left) -->
      <line x1="50" y1="70" x2="50" y2="130" stroke="#ef4444" stroke-width="4"/>
      <rect x="40" y="65" width="20" height="70" fill="#ef4444" opacity="0.3"/>
      
      <!-- Beam -->
      <rect x="50" y="90" width="250" height="20" fill="#64748b" rx="2"/>
      <text x="150" y="85" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">L: ${length}</text>
      
      <!-- Load (at free end) -->
      <line x1="300" y1="40" x2="300" y2="90" stroke="#f59e0b" stroke-width="3" marker-end="url(#arrowhead)"/>
      <text x="310" y="50" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">F: ${load}</text>
      
      <!-- Deflection indication -->
      <path d="M300 110 Q320 130 340 110" fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5,5"/>
      <text x="310" y="145" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">δ</text>
    </svg>
  `;
}

/**
 * Generate Simply Supported Beam schematic
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateSimplySupportedBeamSchematic(params) {
  const width = 400;
  const height = 200;
  const length = params['Length'] || params['length'] || '100mm';
  const load = params['Load magnitude'] || params['load_magnitude'] || '100N';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Simply Supported Beam</text>
      
      <!-- Left pin support -->
      <polygon points="50,120 35,140 65,140" fill="#3b82f6"/>
      <circle cx="50" cy="115" r="5" fill="#3b82f6"/>
      
      <!-- Right roller support -->
      <polygon points="300,120 285,140 315,140" fill="#3b82f6"/>
      <circle cx="300" cy="115" r="5" fill="#3b82f6"/>
      <circle cx="300" cy="110" r="3" fill="#3b82f6"/>
      
      <!-- Beam -->
      <rect x="50" y="90" width="250" height="20" fill="#64748b" rx="2"/>
      <text x="150" y="85" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">L: ${length}</text>
      
      <!-- Load (center) -->
      <line x1="175" y1="40" x2="175" y2="90" stroke="#f59e0b" stroke-width="3" marker-end="url(#arrowhead)"/>
      <text x="185" y="50" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">F: ${load}</text>
      
      <!-- Reaction forces -->
      <text x="40" y="155" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">R1</text>
      <text x="290" y="155" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">R2</text>
    </svg>
  `;
}

/**
 * Generate Fixed Beam schematic
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateFixedBeamSchematic(params) {
  const width = 400;
  const height = 200;
  const length = params['Length'] || params['length'] || '100mm';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Fixed Beam</text>
      
      <!-- Left fixed support -->
      <line x1="50" y1="70" x2="50" y2="130" stroke="#ef4444" stroke-width="4"/>
      <rect x="40" y="65" width="20" height="70" fill="#ef4444" opacity="0.3"/>
      
      <!-- Right fixed support -->
      <line x1="300" y1="70" x2="300" y2="130" stroke="#ef4444" stroke-width="4"/>
      <rect x="290" y="65" width="20" height="70" fill="#ef4444" opacity="0.3"/>
      
      <!-- Beam -->
      <rect x="50" y="90" width="250" height="20" fill="#64748b" rx="2"/>
      <text x="150" y="85" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">L: ${length}</text>
      
      <!-- Moment indicators -->
      <path d="M45 75 Q35 85 45 95" fill="none" stroke="#ef4444" stroke-width="2"/>
      <path d="M305 75 Q315 85 305 95" fill="none" stroke="#ef4444" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate Truss schematic
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateTrussSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Truss Structure</text>
      
      <!-- Truss members -->
      <line x1="50" y1="150" x2="350" y2="150" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="50" y1="150" x2="100" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="100" y1="80" x2="200" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="200" y1="80" x2="300" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="300" y1="80" x2="350" y2="150" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="100" y1="80" x2="150" y2="150" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="150" y1="150" x2="200" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="200" y1="80" x2="250" y2="150" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="250" y1="150" x2="300" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Joints -->
      <circle cx="50" cy="150" r="5" fill="#3b82f6"/>
      <circle cx="100" cy="80" r="5" fill="#3b82f6"/>
      <circle cx="150" cy="150" r="5" fill="#3b82f6"/>
      <circle cx="200" cy="80" r="5" fill="#3b82f6"/>
      <circle cx="250" cy="150" r="5" fill="#3b82f6"/>
      <circle cx="300" cy="80" r="5" fill="#3b82f6"/>
      <circle cx="350" cy="150" r="5" fill="#3b82f6"/>
      
      <!-- Supports -->
      <polygon points="50,150 35,170 65,170" fill="#3b82f6"/>
      <polygon points="350,150 335,170 365,170" fill="#3b82f6"/>
    </svg>
  `;
}

/**
 * Generate Frame schematic
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateFrameSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Frame Structure</text>
      
      <!-- Frame members -->
      <rect x="50" y="50" width="10" height="120" fill="#64748b"/>
      <rect x="50" y="160" width="300" height="10" fill="#64748b"/>
      <rect x="340" y="50" width="10" height="120" fill="#64748b"/>
      <rect x="50" y="50" width="300" height="10" fill="#64748b"/>
      
      <!-- Fixed supports -->
      <line x1="45" y1="50" x2="65" y2="50" stroke="#ef4444" stroke-width="3"/>
      <line x1="45" y1="170" x2="65" y2="170" stroke="#ef4444" stroke-width="3"/>
      <line x1="335" y1="50" x2="355" y2="50" stroke="#ef4444" stroke-width="3"/>
      <line x1="335" y1="170" x2="355" y2="170" stroke="#ef4444" stroke-width="3"/>
    </svg>
  `;
}

/**
 * Generate generic structural schematic (fallback)
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
function generateGenericSchematic(params) {
  const width = 400;
  const height = 200;
  const systemType = params.system_type || 'Structural System';
  
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
