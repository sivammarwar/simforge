/**
 * Plot Factory - SINGLE Plot Generation
 * Centralized plot generation for all domains
 * Trusts backend's visualization_type field instead of guessing
 */

// Domain visualizers
import { generatePlotConfig as generateCircuitsPlot, getAllPlotConfigs as getAllCircuitsPlots } from './domains/circuits/visualizer';
import { generatePlotConfig as generateStructuralPlot, getAllPlotConfigs as getAllStructuralPlots } from './domains/structural/visualizer';
import { generatePlotConfig as generateThermalPlot, getAllPlotConfigs as getAllThermalPlots } from './domains/thermal/visualizer';
import { generatePlotConfig as generateFluidsPlot, getAllPlotConfigs as getAllFluidsPlots } from './domains/fluids/visualizer';
import { generatePlotConfig as generateAerospacePlot, getAllPlotConfigs as getAllAerospacePlots } from './domains/aerospace/visualizer';
import { generateControlPlot, generateAllControlPlots } from './domains/control/visualizer';

/**
 * Generate plot configuration based on domain and visualization type
 * @param {string} domain - Domain name
 * @param {string} visualizationType - Visualization type from backend
 * @param {Object} solverResult - Full solver result
 * @returns {Object} - Plotly configuration
 */
export function generatePlotConfig(domain, visualizationType, solverResult) {
  const visualizers = {
    'Circuits': generateCircuitsPlot,
    'Structural': generateStructuralPlot,
    'Thermal': generateThermalPlot,
    'Fluids': generateFluidsPlot,
    'Aerospace': generateAerospacePlot,
    'Control': generateControlPlot
  };
  
  const visualizer = visualizers[domain];
  if (!visualizer) {
    console.warn(`[Plot Factory] Unknown domain: ${domain}`);
    return null;
  }
  
  return visualizer(visualizationType, solverResult);
}

/**
 * Get all available plot configurations for a solver result
 * @param {string} domain - Domain name
 * @param {Object} solverResult - Full solver result
 * @returns {Array} - Array of plot configurations with types
 */
export function getAllPlotConfigs(domain, solverResult) {
  const visualizers = {
    'Circuits': getAllCircuitsPlots,
    'Structural': getAllStructuralPlots,
    'Thermal': getAllThermalPlots,
    'Fluids': getAllFluidsPlots,
    'Aerospace': getAllAerospacePlots,
    'Control': generateAllControlPlots
  };
  
  const visualizer = visualizers[domain];
  if (!visualizer) {
    console.warn(`[Plot Factory] Unknown domain: ${domain}`);
    return [];
  }
  
  return visualizer(solverResult);
}

/**
 * Generate plot configuration from backend result (main entry point)
 * This function TRUSTS the backend's visualization_type field
 * @param {Object} solverResult - Solver result from backend
 * @returns {Object} - Plotly configuration
 */
export function generatePlotFromBackendResult(solverResult) {
  if (!solverResult) {
    console.error('[Plot Factory] Solver result is null');
    return null;
  }
  
  const domain = solverResult.domain || 'Unknown';
  const visualizationType = solverResult.visualization_type || 'time_series';
  
  console.log(`[Plot Factory] Generating plot for domain=${domain}, vizType=${visualizationType}`);
  
  return generatePlotConfig(domain, visualizationType, solverResult);
}

/**
 * Generate multiple plots from backend result
 * @param {Object} solverResult - Solver result from backend
 * @returns {Array} - Array of plot configurations
 */
export function generateAllPlotsFromBackendResult(solverResult) {
  if (!solverResult) {
    console.error('[Plot Factory] Solver result is null');
    return [];
  }
  
  const domain = solverResult.domain || 'Unknown';
  
  return getAllPlotConfigs(domain, solverResult);
}

/**
 * Get plot type from visualization type
 * @param {string} visualizationType - Visualization type string
 * @returns {string} - Plot type for UI
 */
export function getPlotType(visualizationType) {
  const typeMap = {
    'time_series': 'Time Series',
    'frequency_response': 'Bode Plot',
    'contour_field': 'Contour Plot',
    'surface': '3D Surface',
    'vector_field': 'Vector Field',
    'lift_drag_polar': 'Lift-Drag Polar'
  };
  
  return typeMap[visualizationType] || visualizationType;
}

/**
 * Check if plot type is supported
 * @param {string} visualizationType - Visualization type string
 * @returns {boolean} - True if supported
 */
export function isPlotTypeSupported(visualizationType) {
  const supportedTypes = [
    'time_series',
    'frequency_response',
    'contour_field',
    'surface',
    'vector_field',
    'lift_drag_polar'
  ];
  
  return supportedTypes.includes(visualizationType);
}

/**
 * Get default plot configuration for domain (fallback)
 * @param {string} domain - Domain name
 * @returns {Object} - Default plot configuration
 */
export function getDefaultPlotConfig(domain) {
  const defaults = {
    'Circuits': {
      data: [{ type: 'scatter', mode: 'lines', x: [], y: [] }],
      layout: { title: 'No Data Available' },
      config: { responsive: true }
    },
    'Structural': {
      data: [{ type: 'heatmap', z: [[]] }],
      layout: { title: 'No Data Available' },
      config: { responsive: true }
    },
    'Thermal': {
      data: [{ type: 'heatmap', z: [[]] }],
      layout: { title: 'No Data Available' },
      config: { responsive: true }
    },
    'Fluids': {
      data: [{ type: 'heatmap', z: [[]] }],
      layout: { title: 'No Data Available' },
      config: { responsive: true }
    },
    'Aerospace': {
      data: [{ type: 'scatter', mode: 'lines', x: [], y: [] }],
      layout: { title: 'No Data Available' },
      config: { responsive: true }
    }
  };
  
  return defaults[domain] || defaults['Circuits'];
}

/**
 * Merge multiple plot configurations into one layout
 * @param {Array} plotConfigs - Array of plot configurations
 * @returns {Object} - Merged plot configuration
 */
export function mergePlotConfigs(plotConfigs) {
  if (!plotConfigs || plotConfigs.length === 0) {
    return null;
  }
  
  if (plotConfigs.length === 1) {
    return plotConfigs[0];
  }
  
  // Merge data from all configs
  const mergedData = [];
  plotConfigs.forEach(config => {
    if (config.data) {
      mergedData.push(...config.data);
    }
  });
  
  // Use layout from first config
  const mergedLayout = plotConfigs[0].layout || {};
  
  return {
    data: mergedData,
    layout: mergedLayout,
    config: plotConfigs[0].config || { responsive: true }
  };
}

/**
 * Export plot configuration as JSON
 * @param {Object} plotConfig - Plot configuration
 * @returns {string} - JSON string
 */
export function exportPlotConfig(plotConfig) {
  return JSON.stringify(plotConfig, null, 2);
}

/**
 * Import plot configuration from JSON
 * @param {string} jsonString - JSON string
 * @returns {Object} - Plot configuration
 */
export function importPlotConfig(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('[Plot Factory] Failed to import plot config:', error);
    return null;
  }
}
