/**
 * solverExecutor.js
 * 
 * Handles solver execution and plot generation for Phase 2 of the Windsurf flow.
 * This module is called after the user clicks "Confirm & Run Simulation".
 * 
 * Responsibilities:
 * - Run the appropriate domain solver
 * - Generate SVG plots from solver results
 * - Generate schematic SVG from scene_graph
 * - Return structured results with plots and metrics
 */

import { runSolverWithBackend } from './solvers';
import { getPlots } from './plotEngine';

/**
 * Execute solver and generate plots for a given domain and model
 * 
 * @param {string} domain - The engineering domain (e.g., 'Circuits')
 * @param {string} systemType - The specific system type (e.g., 'Buck Converter')
 * @param {object} modelData - The complete model state with all parameters
 * @param {object} sceneGraph - The scene_graph from the AI explanation phase
 * @returns {Promise<object>} - Structured result with solver output, plots, and schematic
 */
export async function executeSolverAndGeneratePlots(domain, systemType, modelData, sceneGraph) {
  try {
    console.log(`[solverExecutor] Executing solver for ${domain} - ${systemType}`);
    
    // Step 1: Run the solver using backend-aware routing
    const onProgress = (stage, percent, elapsed) => {
      console.log(`[solverExecutor] Progress: ${stage} - ${percent}%`);
    };
    
    const solverResult = await runSolverWithBackend(domain, modelData, onProgress);
    
    if (!solverResult) {
      throw new Error(`Solver execution failed for ${domain} - ${systemType}`);
    }
    
    // DEBUG: Log the actual solver output structure
    console.log('=== SOLVER OUTPUT DEBUG ===');
    console.log('Domain:', domain);
    console.log('System Type:', systemType);
    console.log('Raw solver output type:', typeof solverResult);
    console.log('Is it an object?', solverResult && typeof solverResult === 'object');
    console.log('Keys in solver output:', Object.keys(solverResult || {}));
    console.log('Full output:', JSON.stringify(solverResult, null, 2));
    
    // Log all values to understand structure
    if (solverResult && typeof solverResult === 'object') {
      for (const [key, value] of Object.entries(solverResult)) {
        if (Array.isArray(value)) {
          console.log(`${key}: Array with ${value.length} elements, first 3 = [${value.slice(0, 3).map(v => typeof v === 'number' ? v.toFixed(3) : v).join(', ')}]`);
        } else if (typeof value === 'object' && value !== null) {
          console.log(`${key}: Object with keys = [${Object.keys(value).join(', ')}]`);
        } else {
          console.log(`${key}: ${typeof value} = ${value}`);
        }
      }
    }
    console.log('===========================');
    
    console.log('[solverExecutor] Solver execution complete, generating plots...');
    
    // Step 2: Generate plot configurations from solver results
    const plotConfigs = getPlots(solverResult, domain, modelData);
    console.log(`[solverExecutor] Generated ${plotConfigs.length} plot configurations`);
    
    // Step 3: Generate schematic SVG from scene_graph
    const schematicSVG = renderSchematicSVG(domain, systemType, modelData, sceneGraph);
    
    // Step 4: Return structured result
    return {
      success: true,
      solverResult,
      plotConfigs,
      schematicSVG,
      solverMetrics: solverResult.metrics || [],
      plainSummary: solverResult.plain_summary || 'Solver execution complete.'
    };
    
  } catch (error) {
    console.error('[solverExecutor] Error during solver execution:', error);
    return {
      success: false,
      error: error.message,
      solverResult: null,
      plotConfigs: [],
      schematicSVG: null,
      solverMetrics: [],
      plainSummary: `Solver execution failed: ${error.message}`
    };
  }
}

/**
 * Render schematic SVG from scene_graph data
 * This is a placeholder - actual implementation would use the scene_graph
 * to generate domain-specific SVG schematics
 * 
 * @param {string} domain - The engineering domain
 * @param {string} systemType - The specific system type
 * @param {object} modelData - The model parameters
 * @param {object} sceneGraph - The scene_graph from AI explanation
 * @returns {string} - SVG string or null if not available
 */
function renderSchematicSVG(domain, systemType, modelData, sceneGraph) {
  // This is a placeholder implementation
  // In a full implementation, this would use the scene_graph to render
  // domain-specific SVG schematics
  
  if (!sceneGraph) {
    console.log('[solverExecutor] No scene_graph provided, skipping schematic generation');
    return null;
  }
  
  console.log(`[solverExecutor] Generating schematic for ${domain} - ${systemType}`);
  
  // Domain-specific schematic rendering logic would go here
  // For now, return null to indicate schematic generation is not yet implemented
  // The existing ResultsPane.jsx has hardcoded SVG renderers that will be used
  
  return null;
}

/**
 * Find array in object (handles nested structures)
 * Used for auto-detecting plottable data
 */
function findArray(obj, key) {
  if (!obj || typeof obj !== 'object') return null;
  
  // Direct key
  if (Array.isArray(obj[key])) return obj[key];
  
  // Case-insensitive search
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lowerKey && Array.isArray(v)) return v;
  }
  
  // Nested search (one level deep)
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (Array.isArray(v[key])) return v[key];
      const nested = findArray(v, key);
      if (nested) return nested;
    }
  }
  
  return null;
}

/**
 * Guess unit from variable name
 */
function guessUnit(varName) {
  const lower = varName.toLowerCase();
  
  if (lower.includes('time')) return 'seconds';
  if (lower.includes('voltage') || lower.includes('vout') || lower.includes('v_')) return 'V';
  if (lower.includes('current') || lower.includes('i_')) return 'A';
  if (lower.includes('frequency') || lower.includes('freq')) return 'Hz';
  if (lower.includes('magnitude') || lower.includes('gain')) return 'dB';
  if (lower.includes('phase')) return 'degrees';
  if (lower.includes('position') || lower.includes('distance')) return 'm';
  if (lower.includes('force')) return 'N';
  if (lower.includes('stress')) return 'MPa';
  if (lower.includes('temperature')) return 'K';
  if (lower.includes('power')) return 'W';
  
  return '(units)';
}

/**
 * Humanize variable name for display
 */
function humanize(varName) {
  return varName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
}

/**
 * Create SVG line plot from two data arrays
 * Generic plot that works for any X vs Y data
 */
function createLineplot(xData, yData, xLabel, yLabel, xUnit, yUnit) {
  if (!xData || !yData || xData.length === 0 || yData.length === 0) {
    return '<svg><text>No data to plot</text></svg>';
  }

  // Canvas dimensions
  const width = 600, height = 350;
  const margin = { top: 30, right: 30, bottom: 50, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Find data min/max
  const xMin = Math.min(...xData);
  const xMax = Math.max(...xData);
  const yMin = Math.min(...yData);
  const yMax = Math.max(...yData);

  // Add 10% padding
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xMinPadded = xMin - xRange * 0.1;
  const xMaxPadded = xMax + xRange * 0.1;
  const yMinPadded = yMin - yRange * 0.1;
  const yMaxPadded = yMax + yRange * 0.1;

  // Scale functions (data → pixels)
  const scaleX = (x) => margin.left + ((x - xMinPadded) / (xMaxPadded - xMinPadded)) * plotWidth;
  const scaleY = (y) => margin.top + plotHeight - ((y - yMinPadded) / (yMaxPadded - yMinPadded)) * plotHeight;

  // Generate line path
  const pathData = xData
    .map((x, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(x)} ${scaleY(yData[i])}`)
    .join(' ');

  // Generate data points
  const dataPoints = xData
    .map((x, i) => `<circle cx="${scaleX(x)}" cy="${scaleY(yData[i])}" r="2.5" fill="#3B82F6" stroke="white" stroke-width="0.5"/>`)
    .join('\n');

  // Generate grid
  const gridCount = 6;
  const gridLines = [];
  for (let i = 0; i <= gridCount; i++) {
    const y = margin.top + (i / gridCount) * plotHeight;
    gridLines.push(`<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`);
  }
  for (let i = 0; i <= gridCount; i++) {
    const x = margin.left + (i / gridCount) * plotWidth;
    gridLines.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}" stroke="#e5e7eb" stroke-width="0.5"/>`);
  }

  // Y-axis labels
  const yLabels = [];
  for (let i = 0; i <= gridCount; i++) {
    const val = yMinPadded + (i / gridCount) * (yMaxPadded - yMinPadded);
    const y = margin.top + plotHeight - (i / gridCount) * plotHeight;
    yLabels.push(`<text x="${margin.left - 10}" y="${y + 4}" font-size="11" text-anchor="end" fill="#666">${val.toFixed(3)}</text>`);
  }

  // X-axis labels
  const xLabels = [];
  for (let i = 0; i <= gridCount; i++) {
    const val = xMinPadded + (i / gridCount) * (xMaxPadded - xMinPadded);
    const x = margin.left + (i / gridCount) * plotWidth;
    xLabels.push(`<text x="${x}" y="${height - 15}" font-size="11" text-anchor="middle" fill="#666">${val.toFixed(3)}</text>`);
  }

  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: white; border: 1px solid #ddd; border-radius: 4px;">
    <!-- Grid lines -->
    ${gridLines.join('\n')}
    
    <!-- Axes -->
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" stroke="#000" stroke-width="2"/>
    <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#000" stroke-width="2"/>
    
    <!-- Y-axis label -->
    <text x="15" y="${height / 2}" font-size="13" font-weight="500" fill="#000" text-anchor="middle" transform="rotate(-90 15 ${height / 2})">${yLabel} (${yUnit})</text>
    
    <!-- X-axis label -->
    <text x="${width / 2}" y="${height - 5}" font-size="13" font-weight="500" fill="#000" text-anchor="middle">${xLabel} (${xUnit})</text>
    
    <!-- Y-axis tick labels -->
    ${yLabels.join('\n')}
    
    <!-- X-axis tick labels -->
    ${xLabels.join('\n')}
    
    <!-- Data line -->
    <path d="${pathData}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linejoin="round"/>
    
    <!-- Data points -->
    ${dataPoints}
    
    <!-- Title -->
    <text x="${width / 2}" y="22" text-anchor="middle" font-size="14" font-weight="bold" fill="#000">${yLabel} vs ${xLabel}</text>
  </svg>`;

  return svg;
}

/**
 * Validate solver result structure
 * Ensures the solver result has the expected fields
 * 
 * @param {object} solverResult - The result from the solver
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateSolverResult(solverResult) {
  if (!solverResult || typeof solverResult !== 'object') {
    return false;
  }
  
  // Check for required fields based on the standardized schema
  const hasMetadata = solverResult.metadata !== undefined;
  const hasMetrics = Array.isArray(solverResult.metrics);
  
  return hasMetadata && hasMetrics;
}

/**
 * Extract solver metrics for display
 * 
 * @param {object} solverResult - The result from the solver
 * @returns {Array} - Array of metric objects with name and value
 */
export function extractSolverMetrics(solverResult) {
  if (!solverResult || !Array.isArray(solverResult.metrics)) {
    return [];
  }
  
  return solverResult.metrics.map(m => ({
    name: m.name || 'Unknown',
    value: m.value || '-',
    unit: m.unit || ''
  }));
}

/**
 * Get domain-specific plot types
 * Returns the types of plots available for a given domain
 * 
 * @param {string} domain - The engineering domain
 * @returns {Array} - Array of plot type strings
 */
export function getDomainPlotTypes(domain) {
  const plotTypes = {
    Circuits: ['Time Domain', 'Frequency Domain']
  };
  
  return plotTypes[domain] || [];
}
