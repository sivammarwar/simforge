/**
 * Thermal Domain Schematic Generator
 * Generates thermal schematics as SVG for various thermal systems
 */

/**
 * Generate thermal schematic SVG
 * @param {string} systemType - Type of thermal system (Heat Sink, Heat Conduction, etc.)
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
export function generateThermalSchematic(systemType, params) {
  const generators = {
    'Heat Sink': generateHeatSinkSchematic,
    'Heat Conduction': generateHeatConductionSchematic,
    'Convection': generateConvectionSchematic,
    'Radiation': generateRadiationSchematic,
    'Heat Exchanger': generateHeatExchangerSchematic,
    'Generic Thermal': generateGenericSchematic
  };
  
  const generator = generators[systemType] || generators['Generic Thermal'];
  return generator(params);
}

/**
 * Generate Heat Sink schematic
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateHeatSinkSchematic(params) {
  const width = 400;
  const height = 200;
  const power = params['Power dissipation'] || params['power_dissipation'] || '10W';
  const baseWidth = params['Base width'] || params['base_width'] || '50mm';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Heat Sink</text>
      
      <!-- Base plate -->
      <rect x="100" y="140" width="200" height="15" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      <text x="180" y="170" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Base: ${baseWidth}</text>
      
      <!-- Fins -->
      <rect x="120" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="140" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="160" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="180" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="200" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="220" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="240" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      <rect x="260" y="60" width="10" height="80" fill="#64748b" stroke="#E8EAF0" stroke-width="1"/>
      
      <!-- Heat source -->
      <rect x="150" y="155" width="100" height="20" fill="#ef4444" opacity="0.5"/>
      <text x="175" y="170" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">P: ${power}</text>
      
      <!-- Heat flow arrows -->
      <line x1="200" y1="155" x2="200" y2="140" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M200 140 L130 100" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,5"/>
      <path d="M200 140 L270 100" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,5"/>
      
      <!-- Temperature labels -->
      <text x="80" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Th</text>
      <text x="300" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Tc</text>
    </svg>
  `;
}

/**
 * Generate Heat Conduction schematic
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateHeatConductionSchematic(params) {
  const width = 400;
  const height = 200;
  const k = params['Thermal conductivity'] || params['thermal_conductivity'] || '200';
  const thickness = params['Thickness'] || params['thickness'] || '10mm';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Heat Conduction</text>
      
      <!-- Material block -->
      <rect x="100" y="70" width="200" height="60" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      <text x="180" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">k: ${k} W/(m·K)</text>
      <text x="180" y="120" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">t: ${thickness}</text>
      
      <!-- Hot side -->
      <rect x="80" y="70" width="20" height="60" fill="#ef4444" opacity="0.5"/>
      <text x="65" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Th</text>
      
      <!-- Cold side -->
      <rect x="300" y="70" width="20" height="60" fill="#3b82f6" opacity="0.5"/>
      <text x="325" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Tc</text>
      
      <!-- Heat flow -->
      <line x1="100" y1="100" x2="300" y2="100" stroke="#f59e0b" stroke-width="3" marker-end="url(#arrowhead)"/>
      <text x="190" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#f59e0b">Q</text>
    </svg>
  `;
}

/**
 * Generate Convection schematic
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateConvectionSchematic(params) {
  const width = 400;
  const height = 200;
  const h = params['Heat transfer coefficient'] || params['heat_transfer_coefficient'] || '100';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Convection</text>
      
      <!-- Surface -->
      <rect x="100" y="80" width="200" height="15" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Fluid region -->
      <rect x="100" y="95" width="200" height="60" fill="#3b82f6" opacity="0.2"/>
      <text x="180" y="130" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Fluid</text>
      
      <!-- Heat transfer coefficient -->
      <text x="180" y="75" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">h: ${h} W/(m²·K)</text>
      
      <!-- Convection arrows -->
      <path d="M120 95 Q130 120 120 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M150 95 Q160 120 150 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M180 95 Q190 120 180 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M210 95 Q220 120 210 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M240 95 Q250 120 240 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      <path d="M270 95 Q280 120 270 145" fill="none" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)"/>
      
      <!-- Temperature labels -->
      <text x="80" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Ts</text>
      <text x="310" y="130" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">T∞</text>
    </svg>
  `;
}

/**
 * Generate Radiation schematic
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateRadiationSchematic(params) {
  const width = 400;
  const height = 200;
  const emissivity = params['Emissivity'] || params['emissivity'] || '0.9';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Thermal Radiation</text>
      
      <!-- Hot surface -->
      <rect x="150" y="60" width="100" height="80" fill="#ef4444" opacity="0.5" stroke="#E8EAF0" stroke-width="2"/>
      <text x="175" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">ε: ${emissivity}</text>
      <text x="175" y="120" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Ts</text>
      
      <!-- Radiation waves -->
      <path d="M260 70 Q290 80 320 70" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <path d="M260 90 Q290 100 320 90" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <path d="M260 110 Q290 120 320 110" fill="none" stroke="#f59e0b" stroke-width="2"/>
      <path d="M260 130 Q290 140 320 130" fill="none" stroke="#f59e0b" stroke-width="2"/>
      
      <!-- Stefan-Boltzmann -->
      <text x="150" y="170" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">Q = εσA(Ts⁴ - T∞⁴)</text>
    </svg>
  `;
}

/**
 * Generate Heat Exchanger schematic
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateHeatExchangerSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Heat Exchanger</text>
      
      <!-- Hot fluid inlet -->
      <rect x="50" y="60" width="80" height="20" fill="#ef4444" opacity="0.5"/>
      <text x="70" y="75" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Hot In</text>
      
      <!-- Heat exchanger core -->
      <rect x="130" y="50" width="140" height="100" fill="#64748b" stroke="#E8EAF0" stroke-width="2"/>
      <text x="180" y="105" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">Core</text>
      
      <!-- Hot fluid outlet -->
      <rect x="270" y="60" width="80" height="20" fill="#ef4444" opacity="0.3"/>
      <text x="280" y="75" font-family="JetBrains Mono, monospace" font-size="10" fill="#ef4444">Hot Out</text>
      
      <!-- Cold fluid inlet -->
      <rect x="50" y="120" width="80" height="20" fill="#3b82f6" opacity="0.5"/>
      <text x="70" y="135" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Cold In</text>
      
      <!-- Cold fluid outlet -->
      <rect x="270" y="120" width="80" height="20" fill="#3b82f6" opacity="0.3"/>
      <text x="280" y="135" font-family="JetBrains Mono, monospace" font-size="10" fill="#3b82f6">Cold Out</text>
      
      <!-- Flow arrows -->
      <line x1="130" y1="70" x2="270" y2="70" stroke="#ef4444" stroke-width="2" marker-end="url(#arrowhead)"/>
      <line x1="270" y1="130" x2="130" y2="130" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
    </svg>
  `;
}

/**
 * Generate generic thermal schematic (fallback)
 * @param {Object} params - Thermal parameters
 * @returns {string} - SVG string
 */
function generateGenericSchematic(params) {
  const width = 400;
  const height = 200;
  const systemType = params.system_type || 'Thermal System';
  
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
