/**
 * Structural Domain Output Parser
 * Parses CalculiX output files into structured metrics
 */

/**
 * Parse CalculiX .frd output file
 * @param {string} rawData - Raw CalculiX output
 * @returns {Object} - Structured metrics and data
 */
export function parseCalculiXOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    contour_field: null,
    plain_summary: ''
  };
  
  let nodeData = [];
  let stressData = [];
  let displacementData = [];
  
  for (const line of lines) {
    // Parse node and stress data
    const values = line.trim().split(/\s+/).filter(v => v !== '');
    if (values.length >= 4 && !isNaN(parseFloat(values[0]))) {
      const nodeId = parseInt(values[0]);
      const x = parseFloat(values[1]);
      const y = parseFloat(values[2]);
      const z = parseFloat(values[3]);
      
      nodeData.push({ nodeId, x, y, z });
      
      // If stress data is present (typically after displacement)
      if (values.length >= 7) {
        const stress = parseFloat(values[6]);
        stressData.push({ nodeId, x, y, z, stress });
      }
    }
  }
  
  // Calculate metrics from stress data
  if (stressData.length > 0) {
    const stresses = stressData.map(d => d.stress);
    const maxStress = Math.max(...stresses);
    const minStress = Math.min(...stresses);
    const avgStress = stresses.reduce((a, b) => a + b, 0) / stresses.length;
    
    result.metrics.push(
      { name: 'Max Von Mises Stress', value: maxStress, unit: 'MPa' },
      { name: 'Min Stress', value: minStress, unit: 'MPa' },
      { name: 'Avg Stress', value: avgStress, unit: 'MPa' }
    );
    
    // Build contour field for visualization
    result.contour_field = {
      x: stressData.map(d => d.x),
      y: stressData.map(d => d.y),
      values: stressData.map(d => d.stress),
      type: 'stress'
    };
    
    result.plain_summary = `FEA analysis complete. Max Von Mises stress: ${maxStress.toFixed(1)} MPa`;
  }
  
  return result;
}

/**
 * Parse backend solver result (standardized format)
 * @param {Object} solverResult - Result from backend
 * @returns {Object} - Parsed and validated result
 */
export function parseBackendResult(solverResult) {
  // Backend already returns standardized format, just validate
  if (!solverResult) {
    return {
      metrics: [],
      contour_field: null,
      plain_summary: 'No result available',
      error: 'Empty result from solver'
    };
  }
  
  return {
    metrics: solverResult.metrics || [],
    contour_field: solverResult.contour_field || null,
    time_series: solverResult.time_series || null,
    plain_summary: solverResult.plain_summary || 'Simulation complete',
    visualization_type: solverResult.visualization_type || 'contour_field',
    raw_files: solverResult.raw_files || {}
  };
}

/**
 * Extract key metrics for UI display
 * @param {Object} parsedResult - Parsed result
 * @returns {Object} - Key metrics for dashboard
 */
export function extractKeyMetrics(parsedResult) {
  const metrics = {
    primary: null,
    secondary: [],
    labels: {}
  };
  
  if (!parsedResult.metrics || parsedResult.metrics.length === 0) {
    return metrics;
  }
  
  // First metric is primary (usually max stress)
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
