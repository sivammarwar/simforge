/**
 * Aerospace Domain Visualizer
 * Generates Plotly configurations for aerospace visualizations
 */

import { generateAerospaceSchematic } from './schematicGenerator';

/**
 * Generate Plotly configuration for lift/drag polar plot
 * @param {Object} timeSeries - Time series data { aoa: [], cl: [], cd: [], cm: [] }
 * @returns {Object} - Plotly configuration
 */
export function generatePolarPlot(timeSeries) {
  if (!timeSeries || !timeSeries.aoa || !timeSeries.cl) {
    return null;
  }
  
  const traces = [
    {
      x: timeSeries.aoa,
      y: timeSeries.cl,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Lift Coefficient (CL)',
      line: { color: '#3b82f6', width: 2 }
    }
  ];
  
  // Add drag coefficient if available
  if (timeSeries.cd && timeSeries.cd.length > 0) {
    traces.push({
      x: timeSeries.aoa,
      y: timeSeries.cd,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Drag Coefficient (CD)',
      line: { color: '#ef4444', width: 2 },
      yaxis: 'y2'
    });
  }
  
  // Add moment coefficient if available
  if (timeSeries.cm && timeSeries.cm.length > 0) {
    traces.push({
      x: timeSeries.aoa,
      y: timeSeries.cm,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Moment Coefficient (CM)',
      line: { color: '#10b981', width: 2 },
      yaxis: 'y3'
    });
  }
  
  return {
    data: traces,
    layout: {
      title: 'Airfoil Polar Plot',
      xaxis: { title: 'Angle of Attack (deg)' },
      yaxis: { 
        title: 'Lift Coefficient (CL)',
        side: 'left'
      },
      yaxis2: {
        title: 'Drag Coefficient (CD)',
        side: 'right',
        overlaying: 'y'
      },
      yaxis3: {
        title: 'Moment Coefficient (CM)',
        side: 'right',
        overlaying: 'y',
        position: 0.85
      },
      margin: { t: 40, r: 80, b: 50, l: 60 },
      responsive: true
    },
    config: {
      responsive: true,
      displayModeBar: true,
      displaylogo: false
    }
  };
}

/**
 * Generate Plotly configuration for lift vs drag (drag polar)
 * @param {Object} timeSeries - Time series data
 * @returns {Object} - Plotly configuration
 */
export function generateLiftDragPolar(timeSeries) {
  if (!timeSeries || !timeSeries.cl || !timeSeries.cd) {
    return null;
  }
  
  return {
    data: [
      {
        x: timeSeries.cd,
        y: timeSeries.cl,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'CL vs CD',
        line: { color: '#8b5cf6', width: 2 },
        text: timeSeries.aoa.map(a => `AoA: ${a}°`),
        hovertemplate: 'CD: %{x:.4f}<br>CL: %{y:.4f}<br>%{text}<extra></extra>'
      }
    ],
    layout: {
      title: 'Lift-Drag Polar',
      xaxis: { title: 'Drag Coefficient (CD)' },
      yaxis: { title: 'Lift Coefficient (CL)' },
      margin: { t: 40, r: 20, b: 50, l: 60 },
      responsive: true
    },
    config: {
      responsive: true,
      displayModeBar: true,
      displaylogo: false
    }
  };
}

/**
 * Generate Plotly configuration based on visualization type from backend
 * @param {string} visualizationType - Type from backend (time_series, etc.)
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(visualizationType, solverResult) {
  switch (visualizationType) {
    case 'time_series':
      return generatePolarPlot(solverResult.time_series);
    
    case 'lift_drag_polar':
      return generateLiftDragPolar(solverResult.time_series);
    
    default:
      // Fallback to polar plot if available
      if (solverResult.time_series) {
        return generatePolarPlot(solverResult.time_series);
      }
      return null;
  }
}

/**
 * Generate airfoil diagram SVG (simplified placeholder)
 * @param {string} systemType - Type of aerospace system
 * @param {Object} params - Aerospace parameters
 * @returns {string} - SVG string
 */
export function generateAirfoilDiagram(systemType, params) {
  return generateAerospaceSchematic(systemType, params);
}

/**
 * Get all plot configurations for a solver result
 * @param {Object} solverResult - Solver result from backend
 * @returns {Array} - Array of plot configurations
 */
export function getAllPlotConfigs(solverResult) {
  const configs = [];
  
  // Primary plot based on visualization_type
  if (solverResult.visualization_type) {
    const primaryConfig = generatePlotConfig(solverResult.visualization_type, solverResult);
    if (primaryConfig) {
      configs.push({ type: 'primary', config: primaryConfig });
    }
  }
  
  // Secondary plots
  if (solverResult.time_series && solverResult.visualization_type !== 'time_series') {
    const polarConfig = generatePolarPlot(solverResult.time_series);
    if (polarConfig) {
      configs.push({ type: 'time_series', config: polarConfig });
    }
  }
  
  if (solverResult.time_series && solverResult.time_series.cl && solverResult.time_series.cd && solverResult.visualization_type !== 'lift_drag_polar') {
    const ldConfig = generateLiftDragPolar(solverResult.time_series);
    if (ldConfig) {
      configs.push({ type: 'lift_drag_polar', config: ldConfig });
    }
  }
  
  return configs;
}
