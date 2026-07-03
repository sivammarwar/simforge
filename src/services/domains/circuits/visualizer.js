/**
 * Circuits Domain Visualizer
 * Generates Plotly configurations for circuit visualizations
 */

import { generateCircuitSchematic as generateCircuitSchematicSVG } from './schematicGenerator';

/**
 * Generate Plotly configuration for time-domain plot
 * @param {Object} timeSeries - Time series data { t: [], v_out: [] }
 * @returns {Object} - Plotly configuration
 */
export function generateTimeSeriesPlot(timeSeries) {
  if (!timeSeries || !timeSeries.t || !timeSeries.v_out) {
    return null;
  }
  
  return {
    data: [
      {
        x: timeSeries.t,
        y: timeSeries.v_out,
        type: 'scatter',
        mode: 'lines',
        name: 'Output Voltage',
        line: { color: '#3b82f6', width: 2 }
      }
    ],
    layout: {
      title: 'Transient Response',
      xaxis: { title: 'Time (s)' },
      yaxis: { title: 'Voltage (V)' },
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
 * Generate Plotly configuration for Bode plot (frequency response)
 * @param {Object} freqResponse - Frequency response data { freq: [], magnitude: [] or mag: [], phase: [] }
 * @returns {Object} - Plotly configuration
 */
export function generateBodePlot(freqResponse) {
  if (!freqResponse || !freqResponse.freq) {
    return null;
  }
  
  // Support both 'magnitude' and 'mag' field names for compatibility
  const magnitude = freqResponse.magnitude || freqResponse.mag;
  if (!magnitude) {
    return null;
  }
  
  const traces = [
    {
      x: freqResponse.freq,
      y: magnitude,
      type: 'scatter',
      mode: 'lines',
      name: 'Magnitude',
      line: { color: '#3b82f6', width: 2 },
      yaxis: 'y'
    }
  ];
  
  // Add phase if available
  if (freqResponse.phase && freqResponse.phase.length > 0) {
    traces.push({
      x: freqResponse.freq,
      y: freqResponse.phase,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase',
      line: { color: '#ef4444', width: 2 },
      yaxis: 'y2'
    });
  }
  
  return {
    data: traces,
    layout: {
      title: 'Frequency Response (Bode Plot)',
      xaxis: { 
        title: 'Frequency (Hz)',
        type: 'log'
      },
      yaxis: { 
        title: 'Magnitude (dB)',
        side: 'left'
      },
      yaxis2: {
        title: 'Phase (degrees)',
        side: 'right',
        overlaying: 'y'
      },
      margin: { t: 40, r: 60, b: 50, l: 60 },
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
 * @param {string} visualizationType - Type from backend (time_series, frequency_response, etc.)
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(visualizationType, solverResult) {
  switch (visualizationType) {
    case 'time_series':
      return generateTimeSeriesPlot(solverResult.time_series);
    
    case 'frequency_response':
      return generateBodePlot(solverResult.frequency_response);
    
    case 'contour_field':
      return generateContourPlot(solverResult.contour_field);
    
    default:
      // Fallback to time series if available
      if (solverResult.time_series) {
        return generateTimeSeriesPlot(solverResult.time_series);
      }
      return null;
  }
}

/**
 * Generate contour plot for thermal/structural results (placeholder for circuits)
 * @param {Object} contourData - Contour field data
 * @returns {Object} - Plotly configuration
 */
function generateContourPlot(contourData) {
  if (!contourData) return null;
  
  return {
    data: [
      {
        type: 'heatmap',
        z: contourData.values || [],
        x: contourData.x || [],
        y: contourData.y || [],
        colorscale: 'Viridis'
      }
    ],
    layout: {
      title: 'Contour Plot',
      xaxis: { title: 'X' },
      yaxis: { title: 'Y' },
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
 * Generate circuit schematic SVG (delegates to schematicGenerator)
 * @param {string} circuitType - Type of circuit
 * @param {Object} params - Circuit parameters
 * @returns {string} - SVG string
 */
export function generateCircuitSchematicViz(circuitType, params) {
  return generateCircuitSchematicSVG(circuitType, params);
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
    const timeConfig = generateTimeSeriesPlot(solverResult.time_series);
    if (timeConfig) {
      configs.push({ type: 'time_series', config: timeConfig });
    }
  }
  
  if (solverResult.frequency_response && solverResult.visualization_type !== 'frequency_response') {
    const freqConfig = generateBodePlot(solverResult.frequency_response);
    if (freqConfig) {
      configs.push({ type: 'frequency_response', config: freqConfig });
    }
  }
  
  return configs;
}
