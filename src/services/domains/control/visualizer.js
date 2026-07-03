/**
 * Control Domain Visualizer
 * Generates plot configurations for control systems analysis
 */

import { generatePlotFromBackendResult, generateAllPlotsFromBackendResult } from '../../plotFactory';

/**
 * Generate control system step response plot
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Object} - Plotly configuration
 */
function generateStepResponsePlot(parsedResult) {
  if (!parsedResult.time_series || !parsedResult.time_series.t || !parsedResult.time_series.y) {
    return null;
  }
  
  const { t, y } = parsedResult.time_series;
  
  return {
    data: [
      {
        x: t,
        y: y,
        type: 'scatter',
        mode: 'lines',
        name: 'Step Response',
        line: { color: '#3B82F6', width: 2 }
      }
    ],
    layout: {
      title: 'Step Response',
      xaxis: { title: 'Time (s)' },
      yaxis: { title: 'Output' },
      hovermode: 'closest'
    }
  };
}

/**
 * Generate control system Bode plot
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Object} - Plotly configuration
 */
function generateBodePlot(parsedResult) {
  if (!parsedResult.time_series || !parsedResult.time_series.frequency || !parsedResult.time_series.magnitude) {
    return null;
  }
  
  const { frequency, magnitude, phase } = parsedResult.time_series;
  
  const traces = [
    {
      x: frequency,
      y: magnitude,
      type: 'scatter',
      mode: 'lines',
      name: 'Magnitude (dB)',
      yaxis: 'y',
      line: { color: '#3B82F6', width: 2 }
    }
  ];
  
  if (phase) {
    traces.push({
      x: frequency,
      y: phase,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase (deg)',
      yaxis: 'y2',
      line: { color: '#EF4444', width: 2 }
    });
  }
  
  return {
    data: traces,
    layout: {
      title: 'Bode Plot',
      xaxis: { 
        title: 'Frequency (rad/s)',
        type: 'log'
      },
      yaxis: { 
        title: 'Magnitude (dB)',
        side: 'left'
      },
      yaxis2: {
        title: 'Phase (deg)',
        side: 'right',
        overlaying: 'y'
      },
      hovermode: 'closest'
    }
  };
}

/**
 * Generate control system root locus plot
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Object} - Plotly configuration
 */
function generateRootLocusPlot(parsedResult) {
  if (!parsedResult.time_series || !parsedResult.time_series.real || !parsedResult.time_series.imaginary) {
    return null;
  }
  
  const { real, imaginary } = parsedResult.time_series;
  
  return {
    data: [
      {
        x: real,
        y: imaginary,
        type: 'scatter',
        mode: 'markers',
        name: 'Poles',
        marker: { color: '#EF4444', size: 10, symbol: 'x' }
      }
    ],
    layout: {
      title: 'Root Locus',
      xaxis: { title: 'Real Part' },
      yaxis: { title: 'Imaginary Part' },
      hovermode: 'closest'
    }
  };
}

/**
 * Generate control system Nyquist plot
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Object} - Plotly configuration
 */
function generateNyquistPlot(parsedResult) {
  if (!parsedResult.time_series || !parsedResult.time_series.real || !parsedResult.time_series.imaginary) {
    return null;
  }
  
  const { real, imaginary } = parsedResult.time_series;
  
  return {
    data: [
      {
        x: real,
        y: imaginary,
        type: 'scatter',
        mode: 'lines',
        name: 'Nyquist',
        line: { color: '#3B82F6', width: 2 }
      }
    ],
    layout: {
      title: 'Nyquist Plot',
      xaxis: { title: 'Real Part' },
      yaxis: { title: 'Imaginary Part' },
      hovermode: 'closest'
    }
  };
}

/**
 * Generate control system time response plot
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Object} - Plotly configuration
 */
function generateTimeResponsePlot(parsedResult) {
  if (!parsedResult.time_series || !parsedResult.time_series.t) {
    return null;
  }
  
  const { t, setpoint, pv, error } = parsedResult.time_series;
  
  const traces = [];
  
  if (setpoint) {
    traces.push({
      x: t,
      y: setpoint,
      type: 'scatter',
      mode: 'lines',
      name: 'Setpoint',
      line: { color: '#10B981', width: 2, dash: 'dash' }
    });
  }
  
  if (pv) {
    traces.push({
      x: t,
      y: pv,
      type: 'scatter',
      mode: 'lines',
      name: 'Process Variable',
      line: { color: '#3B82F6', width: 2 }
    });
  }
  
  if (error) {
    traces.push({
      x: t,
      y: error,
      type: 'scatter',
      mode: 'lines',
      name: 'Error',
      line: { color: '#EF4444', width: 1 },
      yaxis: 'y2'
    });
  }
  
  return {
    data: traces,
    layout: {
      title: 'Time Response',
      xaxis: { title: 'Time (s)' },
      yaxis: { title: 'Output' },
      yaxis2: {
        title: 'Error',
        side: 'right',
        overlaying: 'y',
        showgrid: false
      },
      hovermode: 'closest'
    }
  };
}

/**
 * Generate plot based on visualization type
 * @param {string} visualizationType - Type of visualization
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(visualizationType, solverResult) {
  const parsedResult = solverResult.parsedResult || solverResult;
  const plotGenerators = {
    'time_series': generateStepResponsePlot,
    'step_response': generateStepResponsePlot,
    'bode': generateBodePlot,
    'root_locus': generateRootLocusPlot,
    'nyquist': generateNyquistPlot,
    'time_response': generateTimeResponsePlot
  };
  
  const generator = plotGenerators[visualizationType] || generateStepResponsePlot;
  return generator(parsedResult);
}

/**
 * Generate plot based on visualization type (alias for plotFactory compatibility)
 * @param {Object} parsedResult - Parsed simulation result
 * @param {string} visualizationType - Type of visualization
 * @returns {Object} - Plotly configuration
 */
export function generateControlPlot(parsedResult, visualizationType = 'time_series') {
  return generatePlotConfig(visualizationType, parsedResult);
}

/**
 * Generate all available plots for control systems
 * @param {Object} solverResult - Full solver result
 * @returns {Array} - Array of plot configurations
 */
export function getAllPlotConfigs(solverResult) {
  const parsedResult = solverResult.parsedResult || solverResult;
  const plots = [];
  
  // Try to generate each plot type
  const plotTypes = ['step_response', 'bode', 'root_locus', 'nyquist', 'time_response'];
  
  for (const type of plotTypes) {
    const plot = generatePlotConfig(type, solverResult);
    if (plot) {
      plots.push({
        type,
        config: plot
      });
    }
  }
  
  return plots;
}

/**
 * Generate all available plots for control systems (alias for plotFactory compatibility)
 * @param {Object} parsedResult - Parsed simulation result
 * @returns {Array} - Array of plot configurations
 */
export function generateAllControlPlots(parsedResult) {
  return getAllPlotConfigs(parsedResult);
}

/**
 * Generate control system block diagram SVG
 * @param {string} systemType - Type of control system
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
export function generateControlBlockDiagram(systemType, params) {
  // Generic block diagram for control systems
  return `
<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="600" height="200" fill="#f8fafc"/>
  
  <!-- Title -->
  <text x="300" y="25" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e293b">
    ${systemType} Block Diagram
  </text>
  
  <!-- Reference -->
  <rect x="50" y="80" width="60" height="40" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" rx="4"/>
  <text x="80" y="105" text-anchor="middle" font-size="12" fill="#1e293b">Ref</text>
  
  <!-- Summing junction -->
  <circle cx="160" cy="100" r="15" fill="white" stroke="#3b82f6" stroke-width="2"/>
  <text x="160" y="105" text-anchor="middle" font-size="16" fill="#3b82f6">+</text>
  <text x="160" y="85" text-anchor="middle" font-size="16" fill="#ef4444">-</text>
  
  <!-- Controller -->
  <rect x="200" y="80" width="80" height="40" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" rx="4"/>
  <text x="240" y="105" text-anchor="middle" font-size="12" fill="#1e293b">Controller</text>
  
  <!-- Plant -->
  <rect x="320" y="80" width="80" height="40" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" rx="4"/>
  <text x="360" y="105" text-anchor="middle" font-size="12" fill="#1e293b">Plant</text>
  
  <!-- Output -->
  <rect x="440" y="80" width="60" height="40" fill="#dbeafe" stroke="#3b82f6" stroke-width="2" rx="4"/>
  <text x="470" y="105" text-anchor="middle" font-size="12" fill="#1e293b">Output</text>
  
  <!-- Feedback path -->
  <path d="M 470 120 L 470 150 L 160 150 L 160 120" fill="none" stroke="#3b82f6" stroke-width="2"/>
  
  <!-- Forward path arrows -->
  <path d="M 110 100 L 145 100" fill="none" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 175 100 L 200 100" fill="none" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 280 100 L 320 100" fill="none" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M 400 100 L 440 100" fill="none" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- Arrow marker -->
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6"/>
    </marker>
  </defs>
</svg>
`;
}

/**
 * Generate control system schematic (block diagram)
 * @param {string} systemType - Type of control system
 * @param {Object} params - Control parameters
 * @returns {string} - SVG string
 */
export function generateControlSchematic(systemType, params) {
  return generateControlBlockDiagram(systemType, params);
}
