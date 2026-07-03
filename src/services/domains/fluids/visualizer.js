/**
 * Fluids Domain Visualizer
 * Generates Plotly configurations for fluids visualizations
 */

import { generateFluidSchematic } from './schematicGenerator';

/**
 * Generate Plotly configuration for velocity contour plot
 * @param {Object} contourData - Contour field data { x: [], y: [], values: [], type: '' }
 * @returns {Object} - Plotly configuration
 */
export function generateVelocityContourPlot(contourData) {
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
        colorscale: 'Plasma',
        colorbar: {
          title: contourData.type === 'velocity' ? 'Velocity (m/s)' : 'Value'
        }
      }
    ],
    layout: {
      title: `${contourData.type || 'Velocity'} Distribution`,
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
 * Generate Plotly configuration for 3D velocity surface plot
 * @param {Object} contourData - Contour field data
 * @returns {Object} - Plotly configuration
 */
export function generateVelocitySurfacePlot(contourData) {
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
        colorscale: 'Plasma',
        showscale: true,
        colorbar: { title: 'Velocity (m/s)' }
      }
    ],
    layout: {
      title: '3D Velocity Distribution',
      scene: {
        xaxis: { title: 'X (m)' },
        yaxis: { title: 'Y (m)' },
        zaxis: { title: 'Velocity (m/s)' }
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
 * Generate Plotly configuration for velocity vector field (quiver plot)
 * @param {Object} vectorData - Vector field data { x: [], y: [], u: [], v: [] }
 * @returns {Object} - Plotly configuration
 */
export function generateVectorFieldPlot(vectorData) {
  if (!vectorData || !vectorData.x || !vectorData.u) {
    return null;
  }
  
  return {
    data: [
      {
        type: 'scatter',
        mode: 'markers',
        x: vectorData.x,
        y: vectorData.y,
        marker: {
          size: 8,
          color: vectorData.u.map((u, i) => Math.sqrt(u*u + (vectorData.v[i] || 0)**2)),
          colorscale: 'Plasma',
          colorbar: { title: 'Magnitude (m/s)' }
        }
      }
    ],
    layout: {
      title: 'Velocity Vector Field',
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
 * Generate Plotly configuration based on visualization type from backend
 * @param {string} visualizationType - Type from backend (contour_field, etc.)
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(visualizationType, solverResult) {
  switch (visualizationType) {
    case 'contour_field':
      return generateVelocityContourPlot(solverResult.contour_field);
    
    case 'surface':
      return generateVelocitySurfacePlot(solverResult.contour_field);
    
    case 'vector_field':
      return generateVectorFieldPlot(solverResult.contour_field);
    
    default:
      // Fallback to contour if available
      if (solverResult.contour_field) {
        return generateVelocityContourPlot(solverResult.contour_field);
      }
      return null;
  }
}

/**
 * Generate pipe diagram SVG (simplified placeholder)
 * @param {string} systemType - Type of fluids system
 * @param {Object} params - Fluids parameters
 * @returns {string} - SVG string
 */
export function generatePipeDiagram(systemType, params) {
  return generateFluidSchematic(systemType, params);
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
    const contourConfig = generateVelocityContourPlot(solverResult.contour_field);
    if (contourConfig) {
      configs.push({ type: 'contour_field', config: contourConfig });
    }
  }
  
  if (solverResult.contour_field && solverResult.visualization_type !== 'surface') {
    const surfaceConfig = generateVelocitySurfacePlot(solverResult.contour_field);
    if (surfaceConfig) {
      configs.push({ type: 'surface', config: surfaceConfig });
    }
  }
  
  return configs;
}
