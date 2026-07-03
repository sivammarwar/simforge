/**
 * Structural Domain Visualizer
 * Generates Plotly configurations for structural visualizations
 */

import { generateStructuralSchematic } from './schematicGenerator';

/**
 * Generate Plotly configuration for contour plot (stress distribution)
 * @param {Object} contourData - Contour field data { x: [], y: [], values: [], type: '' }
 * @returns {Object} - Plotly configuration
 */
export function generateContourPlot(contourData) {
  if (!contourData || !contourData.values || contourData.values.length === 0) {
    return null;
  }
  
  return {
    data: [
      {
        type: 'heatmap',
        z: contourData.values,
        x: contourData.x || [],
        y: contourData.y || [],
        colorscale: 'Viridis',
        colorbar: {
          title: contourData.type === 'stress' ? 'Stress (MPa)' : 'Value'
        }
      }
    ],
    layout: {
      title: `${contourData.type || 'Stress'} Distribution`,
      xaxis: { title: 'X Position (m)' },
      yaxis: { title: 'Y Position (m)' },
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
 * Generate Plotly configuration for 3D surface plot
 * @param {Object} contourData - Contour field data
 * @returns {Object} - Plotly configuration
 */
export function generateSurfacePlot(contourData) {
  if (!contourData || !contourData.values) {
    return null;
  }
  
  // Reshape data for surface plot (simplified)
  const n = Math.ceil(Math.sqrt(contourData.values.length));
  const z = [];
  for (let i = 0; i < n; i++) {
    z.push(contourData.values.slice(i * n, (i + 1) * n));
  }
  
  return {
    data: [
      {
        type: 'surface',
        z: z,
        colorscale: 'Viridis',
        showscale: true
      }
    ],
    layout: {
      title: '3D Stress Distribution',
      scene: {
        xaxis: { title: 'X' },
        yaxis: { title: 'Y' },
        zaxis: { title: 'Stress (MPa)' }
      },
      margin: { t: 40, r: 20, b: 40, l: 40 },
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
 * @param {string} visualizationType - Type from backend (contour_field, etc.)
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(visualizationType, solverResult) {
  switch (visualizationType) {
    case 'contour_field':
      return generateContourPlot(solverResult.contour_field);
    
    case 'surface':
      return generateSurfacePlot(solverResult.contour_field);
    
    default:
      // Fallback to contour if available
      if (solverResult.contour_field) {
        return generateContourPlot(solverResult.contour_field);
      }
      return null;
  }
}

/**
 * Generate structural schematic SVG (delegates to schematicGenerator)
 * @param {string} systemType - Type of structural system
 * @param {Object} params - Structural parameters
 * @returns {string} - SVG string
 */
export function generateBeamDiagram(systemType, params) {
  return generateStructuralSchematic(systemType, params);
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
  if (solverResult.contour_field && solverResult.visualization_type !== 'contour_field') {
    const contourConfig = generateContourPlot(solverResult.contour_field);
    if (contourConfig) {
      configs.push({ type: 'contour_field', config: contourConfig });
    }
  }
  
  if (solverResult.contour_field && solverResult.visualization_type !== 'surface') {
    const surfaceConfig = generateSurfacePlot(solverResult.contour_field);
    if (surfaceConfig) {
      configs.push({ type: 'surface', config: surfaceConfig });
    }
  }
  
  return configs;
}
