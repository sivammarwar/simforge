/**
 * Control Domain Schematic Generator
 * Generates control system block diagrams as SVG
 */

/**
 * Generate control system schematic SVG (block diagram)
 * @param {string} systemType - Type of control system
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
export function generateControlSchematic(systemType, params) {
  const generators = {
    'Second-Order System': generateSecondOrderBlockDiagram,
    'PID Controller': generatePIDBlockDiagram,
    'Step Response': generateSecondOrderBlockDiagram,
    'Bode Plot': generateSecondOrderBlockDiagram,
    'Stability Analysis': generateSecondOrderBlockDiagram,
    'State Space': generateStateSpaceBlockDiagram,
    'Transfer Function': generateSecondOrderBlockDiagram,
    'Generic Control': generateGenericControlBlockDiagram
  };
  
  const generator = generators[systemType];
  if (!generator) {
    return generateGenericControlBlockDiagram(params);
  }
  
  return generator(params);
}

/**
 * Generate second-order system block diagram
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
function generateSecondOrderBlockDiagram(params) {
  const { natural_frequency = 5, damping_ratio = 0.5 } = params;
  
  return `
<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="700" height="250" fill="#1e1e2e"/>
  
  <!-- Title -->
  <text x="350" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#cdd6f4">
    Second-Order System Block Diagram
  </text>
  
  <!-- Parameters display -->
  <text x="350" y="55" text-anchor="middle" font-size="12" fill="#a6adc8">
    ωn = ${natural_frequency} rad/s, ζ = ${damping_ratio}
  </text>
  
  <!-- Input -->
  <rect x="50" y="100" width="70" height="50" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="85" y="130" text-anchor="middle" font-size="12" fill="#cdd6f4">Input</text>
  
  <!-- Transfer function block -->
  <rect x="180" y="100" width="180" height="50" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="270" y="125" text-anchor="middle" font-size="11" fill="#cdd6f4">
    ωn²
  </text>
  <text x="270" y="140" text-anchor="middle" font-size="11" fill="#cdd6f4">
    s² + 2ζωn·s + ωn²
  </text>
  
  <!-- Output -->
  <rect x="450" y="100" width="70" height="50" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="485" y="130" text-anchor="middle" font-size="12" fill="#cdd6f4">Output</text>
  
  <!-- Arrows -->
  <path d="M 120 125 L 180 125" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 360 125 L 450 125" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#89b4fa"/>
    </marker>
  </defs>
  
  <!-- Performance metrics legend -->
  <text x="50" y="200" font-size="11" fill="#a6adc8">Performance Metrics:</text>
  <text x="50" y="220" font-size="10" fill="#a6adc8">• Rise time, Peak time, Overshoot, Settling time</text>
</svg>
`;
}

/**
 * Generate PID controller block diagram
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
function generatePIDBlockDiagram(params) {
  const { kp = 1, ki = 0, kd = 0 } = params;
  
  return `
<svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="700" height="280" fill="#1e1e2e"/>
  
  <!-- Title -->
  <text x="350" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#cdd6f4">
    PID Controller Block Diagram
  </text>
  
  <!-- Parameters display -->
  <text x="350" y="55" text-anchor="middle" font-size="12" fill="#a6adc8">
    Kp = ${kp}, Ki = ${ki}, Kd = ${kd}
  </text>
  
  <!-- Reference -->
  <rect x="30" y="110" width="60" height="40" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="60" y="135" text-anchor="middle" font-size="11" fill="#cdd6f4">Ref</text>
  
  <!-- Summing junction -->
  <circle cx="130" cy="130" r="18" fill="#313244" stroke="#89b4fa" stroke-width="2"/>
  <text x="130" y="135" text-anchor="middle" font-size="18" fill="#89b4fa">+</text>
  <text x="130" y="110" text-anchor="middle" font-size="18" fill="#f38ba8">-</text>
  
  <!-- P block -->
  <rect x="180" y="110" width="50" height="40" fill="#313244" stroke="#f9e2af" stroke-width="2" rx="6"/>
  <text x="205" y="135" text-anchor="middle" font-size="12" fill="#f9e2af">P</text>
  
  <!-- I block -->
  <rect x="250" y="110" width="50" height="40" fill="#313244" stroke="#a6e3a1" stroke-width="2" rx="6"/>
  <text x="275" y="135" text-anchor="middle" font-size="12" fill="#a6e3a1">I</text>
  
  <!-- D block -->
  <rect x="320" y="110" width="50" height="40" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="345" y="135" text-anchor="middle" font-size="12" fill="#89b4fa">D</text>
  
  <!-- Summing junction for PID -->
  <circle cx="410" cy="130" r="18" fill="#313244" stroke="#89b4fa" stroke-width="2"/>
  <text x="410" y="135" text-anchor="middle" font-size="18" fill="#89b4fa">+</text>
  
  <!-- Plant -->
  <rect x="460" y="110" width="80" height="40" fill="#313244" stroke="#cba6f7" stroke-width="2" rx="6"/>
  <text x="500" y="135" text-anchor="middle" font-size="11" fill="#cba6f7">Plant</text>
  
  <!-- Output -->
  <rect x="580" y="110" width="60" height="40" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="610" y="135" text-anchor="middle" font-size="11" fill="#cdd6f4">Output</text>
  
  <!-- Feedback path -->
  <path d="M 610 150 L 610 200 L 130 200 L 130 148" fill="none" stroke="#89b4fa" stroke-width="2"/>
  
  <!-- Forward path arrows -->
  <path d="M 90 130 L 112 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 148 130 L 180 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 230 130 L 250 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 300 130 L 320 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 370 130 L 392 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 428 130 L 460 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 540 130 L 580 130" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#89b4fa"/>
    </marker>
  </defs>
  
  <!-- Legend -->
  <text x="30" y="250" font-size="11" fill="#a6adc8">PID Components:</text>
  <text x="150" y="250" font-size="10" fill="#f9e2af">P (Proportional)</text>
  <text x="270" y="250" font-size="10" fill="#a6e3a1">I (Integral)</text>
  <text x="330" y="250" font-size="10" fill="#89b4fa">D (Derivative)</text>
</svg>
`;
}

/**
 * Generate state space block diagram
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
function generateStateSpaceBlockDiagram(params) {
  return `
<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="700" height="250" fill="#1e1e2e"/>
  
  <!-- Title -->
  <text x="350" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#cdd6f4">
    State Space Block Diagram
  </text>
  
  <!-- Input -->
  <rect x="30" y="100" width="60" height="50" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="60" y="130" text-anchor="middle" font-size="11" fill="#cdd6f4">u(t)</text>
  
  <!-- State matrix block -->
  <rect x="150" y="100" width="100" height="50" fill="#313244" stroke="#cba6f7" stroke-width="2" rx="6"/>
  <text x="200" y="125" text-anchor="middle" font-size="12" fill="#cba6f7">State</text>
  <text x="200" y="140" text-anchor="middle" font-size="11" fill="#cba6f7">ẋ = Ax + Bu</text>
  
  <!-- Output matrix block -->
  <rect x="320" y="100" width="100" height="50" fill="#313244" stroke="#a6e3a1" stroke-width="2" rx="6"/>
  <text x="370" y="125" text-anchor="middle" font-size="12" fill="#a6e3a1">Output</text>
  <text x="370" y="140" text-anchor="middle" font-size="11" fill="#a6e3a1">y = Cx + Du</text>
  
  <!-- Output -->
  <rect x="490" y="100" width="60" height="50" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="520" y="130" text-anchor="middle" font-size="11" fill="#cdd6f4">y(t)</text>
  
  <!-- Arrows -->
  <path d="M 90 125 L 150 125" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 250 125 L 320 125" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 420 125 L 490 125" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#89b4fa"/>
    </marker>
  </defs>
  
  <!-- State feedback -->
  <text x="200" y="200" text-anchor="middle" font-size="11" fill="#a6adc8">
    State variables: x₁, x₂, ..., xₙ
  </text>
</svg>
`;
}

/**
 * Generate generic control block diagram
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
function generateGenericControlBlockDiagram(params) {
  return `
<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="600" height="200" fill="#1e1e2e"/>
  
  <!-- Title -->
  <text x="300" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#cdd6f4">
    Control System Block Diagram
  </text>
  
  <!-- Reference -->
  <rect x="30" y="80" width="60" height="40" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="60" y="105" text-anchor="middle" font-size="11" fill="#cdd6f4">Ref</text>
  
  <!-- Summing junction -->
  <circle cx="140" cy="100" r="18" fill="#313244" stroke="#89b4fa" stroke-width="2"/>
  <text x="140" y="105" text-anchor="middle" font-size="18" fill="#89b4fa">+</text>
  <text x="140" y="80" text-anchor="middle" font-size="18" fill="#f38ba8">-</text>
  
  <!-- Controller -->
  <rect x="190" y="80" width="80" height="40" fill="#313244" stroke="#f9e2af" stroke-width="2" rx="6"/>
  <text x="230" y="105" text-anchor="middle" font-size="11" fill="#f9e2af">Controller</text>
  
  <!-- Plant -->
  <rect x="310" y="80" width="80" height="40" fill="#313244" stroke="#cba6f7" stroke-width="2" rx="6"/>
  <text x="350" y="105" text-anchor="middle" font-size="11" fill="#cba6f7">Plant</text>
  
  <!-- Output -->
  <rect x="430" y="80" width="60" height="40" fill="#313244" stroke="#89b4fa" stroke-width="2" rx="6"/>
  <text x="460" y="105" text-anchor="middle" font-size="11" fill="#cdd6f4">Output</text>
  
  <!-- Feedback path -->
  <path d="M 460 120 L 460 160 L 140 160 L 140 118" fill="none" stroke="#89b4fa" stroke-width="2"/>
  
  <!-- Forward path arrows -->
  <path d="M 90 100 L 122 100" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 158 100 L 190 100" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 270 100 L 310 100" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 390 100 L 430 100" fill="none" stroke="#89b4fa" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#89b4fa"/>
    </marker>
  </defs>
</svg>
`;
}
