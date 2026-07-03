/**
 * Aerospace Domain Output Parser
 * Parses XFOIL output files into structured metrics
 */

/**
 * Parse XFOIL polar data
 * @param {string} rawData - Raw XFOIL output
 * @returns {Object} - Structured metrics and data
 */
export function parseXFOILOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    time_series: null,
    plain_summary: ''
  };
  
  const aoaData = [];
  const clData = [];
  const cdData = [];
  const cmData = [];
  
  // Parse XFOIL polar data (typically tab-separated)
  for (const line of lines) {
    if (line.trim().startsWith('#') || line.trim().startsWith('!')) continue;
    
    const values = line.trim().split(/\s+/).filter(v => v !== '');
    if (values.length >= 3 && !isNaN(parseFloat(values[0]))) {
      const aoa = parseFloat(values[0]);
      const cl = parseFloat(values[1]);
      const cd = values.length >= 2 ? parseFloat(values[2]) : 0;
      const cm = values.length >= 3 ? parseFloat(values[3]) : 0;
      
      aoaData.push(aoa);
      clData.push(cl);
      cdData.push(cd);
      cmData.push(cm);
    }
  }
  
  if (aoaData.length > 0) {
    // Calculate metrics
    const maxCl = Math.max(...clData);
    const minCl = Math.min(...clData);
    const maxCd = Math.max(...cdData);
    const stallAngle = aoaData[clData.indexOf(maxCl)];
    
    result.metrics.push(
      { name: 'Max Lift Coefficient', value: maxCl, unit: '-' },
      { name: 'Min Lift Coefficient', value: minCl, unit: '-' },
      { name: 'Max Drag Coefficient', value: maxCd, unit: '-' },
      { name: 'Stall Angle', value: stallAngle, unit: 'deg' }
    );
    
    // Build time series for plotting
    result.time_series = {
      aoa: aoaData,
      cl: clData,
      cd: cdData,
      cm: cmData.length > 0 ? cmData : null
    };
    
    result.plain_summary = `Airfoil analysis complete. Max CL: ${maxCl.toFixed(3)}, Stall at ${stallAngle.toFixed(1)}°`;
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
      time_series: null,
      plain_summary: 'No result available',
      error: 'Empty result from solver'
    };
  }
  
  return {
    metrics: solverResult.metrics || [],
    time_series: solverResult.time_series || null,
    contour_field: solverResult.contour_field || null,
    plain_summary: solverResult.plain_summary || 'Simulation complete',
    visualization_type: solverResult.visualization_type || 'time_series',
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
  
  // First metric is primary (usually max CL)
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
