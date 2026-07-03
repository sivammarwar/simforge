/**
 * Circuits Domain Schematic Generator
 * Generates circuit schematics as SVG for various circuit types
 */

/**
 * Generate circuit schematic SVG
 * @param {string} circuitType - Type of circuit (RC Low-Pass Filter, Voltage Divider, etc.)
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
export function generateCircuitSchematic(circuitType, params) {
  const generators = {
    'RC Low-Pass Filter': generateRCLowPassSchematic,
    'RC High-Pass Filter': generateRCHighPassSchematic,
    'Voltage Divider': generateVoltageDividerSchematic,
    'LC Tank Circuit': generateLCTankSchematic,
    'RLC Circuit': generateRLCSchematic,
    'Common Emitter Amplifier': generateCommonEmitterSchematic,
    'Generic Circuit': generateGenericSchematic
  };
  
  const generator = generators[circuitType] || generators['Generic Circuit'];
  return generator(params);
}

/**
 * Generate RC Low-Pass Filter schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateRCLowPassSchematic(params) {
  const width = 400;
  const height = 200;
  const r = params['Resistor (R1)'] || params['R'] || '1k';
  const c = params['Capacitor (C1)'] || params['C'] || '1u';
  const vin = params['Supply voltage'] || params['Input voltage'] || '12V';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <!-- Title -->
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">RC Low-Pass Filter</text>
      
      <!-- Input line -->
      <line x1="20" y1="80" x2="80" y2="80" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="20" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vin: ${vin}</text>
      
      <!-- Resistor -->
      <rect x="80" y="70" width="60" height="20" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <path d="M80 80 L85 75 L95 85 L105 75 L115 85 L125 75 L135 85 L140 80" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="95" y="65" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">R: ${r}</text>
      
      <!-- Connection to capacitor -->
      <line x1="140" y1="80" x2="200" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Capacitor -->
      <line x1="200" y1="60" x2="200" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="210" y1="60" x2="210" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <text x="195" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">C: ${c}</text>
      
      <!-- Output line -->
      <line x1="210" y1="80" x2="380" y2="80" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="320" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vout</text>
      
      <!-- Ground -->
      <line x1="200" y1="100" x2="200" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="190" y1="130" x2="210" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="195" y1="135" x2="205" y2="135" stroke="#E8EAF0" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate RC High-Pass Filter schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateRCHighPassSchematic(params) {
  const width = 400;
  const height = 200;
  const r = params['Resistor (R1)'] || params['R'] || '1k';
  const c = params['Capacitor (C1)'] || params['C'] || '1u';
  const vin = params['Supply voltage'] || params['Input voltage'] || '12V';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">RC High-Pass Filter</text>
      
      <!-- Input line -->
      <line x1="20" y1="80" x2="100" y2="80" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="20" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vin: ${vin}</text>
      
      <!-- Capacitor -->
      <line x1="100" y1="60" x2="100" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="110" y1="60" x2="110" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <text x="95" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">C: ${c}</text>
      
      <!-- Connection to resistor -->
      <line x1="110" y1="80" x2="170" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Resistor -->
      <rect x="170" y="70" width="60" height="20" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <path d="M170 80 L175 75 L185 85 L195 75 L205 85 L215 75 L225 85 L230 80" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="185" y="65" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">R: ${r}</text>
      
      <!-- Output line -->
      <line x1="230" y1="80" x2="380" y2="80" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="320" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vout</text>
      
      <!-- Ground -->
      <line x1="230" y1="80" x2="230" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="220" y1="130" x2="240" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="225" y1="135" x2="235" y2="135" stroke="#E8EAF0" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate Voltage Divider schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateVoltageDividerSchematic(params) {
  const width = 400;
  const height = 200;
  const r1 = params['Top resistor (R1)'] || params['R1'] || '1k';
  const r2 = params['Bottom resistor (R2)'] || params['R2'] || '1k';
  const vin = params['Supply voltage'] || params['Input voltage'] || '12V';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6"/>
        </marker>
      </defs>
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Voltage Divider</text>
      
      <!-- Input line -->
      <line x1="20" y1="50" x2="80" y2="50" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="20" y="40" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vin: ${vin}</text>
      
      <!-- R1 -->
      <rect x="80" y="40" width="60" height="20" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <path d="M80 50 L85 45 L95 55 L105 45 L115 55 L125 45 L135 55 L140 50" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="95" y="35" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">R1: ${r1}</text>
      
      <!-- Connection -->
      <line x1="140" y1="50" x2="200" y2="50" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Output tap -->
      <line x1="200" y1="50" x2="200" y2="80" stroke="#3b82f6" stroke-width="2"/>
      <line x1="200" y1="80" x2="380" y2="80" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowhead)"/>
      <text x="320" y="70" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Vout</text>
      
      <!-- Connection to R2 -->
      <line x1="200" y1="50" x2="260" y2="50" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- R2 -->
      <rect x="260" y="40" width="60" height="20" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <path d="M260 50 L265 45 L275 55 L285 45 L295 55 L305 45 L315 55 L320 50" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="275" y="35" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">R2: ${r2}</text>
      
      <!-- Ground -->
      <line x1="320" y1="50" x2="320" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="310" y1="130" x2="330" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="315" y1="135" x2="325" y2="135" stroke="#E8EAF0" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate LC Tank Circuit schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateLCTankSchematic(params) {
  const width = 400;
  const height = 200;
  const l = params['Inductor (L1)'] || params['L'] || '1mH';
  const c = params['Capacitor (C1)'] || params['C'] || '1uF';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">LC Tank Circuit</text>
      
      <!-- Inductor (coil) -->
      <path d="M100 80 Q110 60 120 80 Q130 100 140 80 Q150 60 160 80 Q170 100 180 80" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="130" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">L: ${l}</text>
      
      <!-- Connection -->
      <line x1="180" y1="80" x2="220" y2="80" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Capacitor -->
      <line x1="220" y1="60" x2="220" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="230" y1="60" x2="230" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <text x="215" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">C: ${c}</text>
      
      <!-- Ground -->
      <line x1="225" y1="100" x2="225" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="215" y1="130" x2="235" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="220" y1="135" x2="230" y2="135" stroke="#E8EAF0" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate RLC Circuit schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateRLCSchematic(params) {
  const width = 400;
  const height = 200;
  const r = params['Resistor (R)'] || '1k';
  const l = params['Inductor (L)'] || '1mH';
  const c = params['Capacitor (C)'] || '1uF';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">RLC Circuit</text>
      
      <!-- Resistor -->
      <rect x="80" y="70" width="60" height="20" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <path d="M80 80 L85 75 L95 85 L105 75 L115 85 L125 75 L135 85 L140 80" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="95" y="65" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">R: ${r}</text>
      
      <!-- Inductor -->
      <path d="M160 80 Q170 60 180 80 Q190 100 200 80 Q210 60 220 80" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <text x="185" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">L: ${l}</text>
      
      <!-- Capacitor -->
      <line x1="240" y1="60" x2="240" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="250" y1="60" x2="250" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      <text x="235" y="55" font-family="JetBrains Mono, monospace" font-size="10" fill="#E8EAF0">C: ${c}</text>
      
      <!-- Ground -->
      <line x1="245" y1="100" x2="245" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="235" y1="130" x2="255" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="240" y1="135" x2="250" y2="135" stroke="#E8EAF0" stroke-width="2"/>
    </svg>
  `;
}

/**
 * Generate Common Emitter Amplifier schematic
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateCommonEmitterSchematic(params) {
  const width = 400;
  const height = 200;
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      
      <text x="20" y="25" font-family="JetBrains Mono, monospace" font-size="12" fill="#E8EAF0">Common Emitter Amplifier</text>
      
      <!-- Transistor symbol (NPN) -->
      <circle cx="200" cy="100" r="30" fill="none" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="185" y1="85" x2="215" y2="115" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="185" y1="115" x2="215" y2="85" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="200" y1="70" x2="200" y2="85" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="200" y1="115" x2="200" y2="130" stroke="#E8EAF0" stroke-width="2"/>
      <line x1="170" y1="100" x2="185" y2="100" stroke="#E8EAF0" stroke-width="2"/>
      
      <!-- Labels -->
      <text x="170" y="90" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Base</text>
      <text x="205" y="65" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Collector</text>
      <text x="205" y="145" font-family="JetBrains Mono, monospace" font-size="10" fill="#8C929E">Emitter</text>
      
      <text x="150" y="180" font-family="JetBrains Mono, monospace" font-size="10" fill="#64748b">(Detailed schematic to be implemented)</text>
    </svg>
  `;
}

/**
 * Generate generic circuit schematic (fallback)
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
function generateGenericSchematic(params) {
  const width = 400;
  const height = 200;
  const circuitType = params.system_type || 'Circuit';
  
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#0D0F12"/>
      <text x="${width/2}" y="${height/2}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="#E8EAF0">
        ${circuitType}
      </text>
      <text x="${width/2}" y="${height/2 + 25}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" fill="#64748b">
        Schematic generation
      </text>
    </svg>
  `;
}
