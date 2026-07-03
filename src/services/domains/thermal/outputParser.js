/**
 * Thermal Domain Output Parser
 * Parses Elmer output files into structured metrics
 */

/**
 * Parse Elmer output data
 * @param {string} rawData - Raw Elmer output
 * @returns {Object} - Structured metrics and data
 */
export function parseElmerOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    contour_field: null,
    plain_summary: ''
  };
  
  let nodeData = [];
  let temperatureData = [];
  let heatFluxData = [];
  
  for (const line of lines) {
    // Parse node and temperature data
    const values = line.trim().split(/\s+/).filter(v => v !== '');
    if (values.length >= 4 && !isNaN(parseFloat(values[0]))) {
      const nodeId = parseInt(values[0]);
      const x = parseFloat(values[1]);
      const y = parseFloat(values[2]);
      const z = parseFloat(values[3]);
      
      nodeData.push({ nodeId, x, y, z });
      
      // If temperature data is present
      if (values.length >= 5) {
        const temperature = parseFloat(values[4]);
        temperatureData.push({ nodeId, x, y, z, temperature });
      }
      
      // If heat flux data is present
      if (values.length >= 7) {
        const heatFlux = parseFloat(values[6]);
        heatFluxData.push({ nodeId, x, y, z, heatFlux });
      }
    }
  }
  
  // Calculate metrics from temperature data
  if (temperatureData.length > 0) {
    const temperatures = temperatureData.map(d => d.temperature);
    const maxTemp = Math.max(...temperatures);
    const minTemp = Math.min(...temperatures);
    const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
    const tempRange = maxTemp - minTemp;
    
    result.metrics.push(
      { name: 'Max Temperature', value: maxTemp, unit: 'K' },
      { name: 'Min Temperature', value: minTemp, unit: 'K' },
      { name: 'Avg Temperature', value: avgTemp, unit: 'K' },
      { name: 'Temperature Range', value: tempRange, unit: 'K' }
    );
    
    // Build contour field for visualization
    result.contour_field = {
      x: temperatureData.map(d => d.x),
      y: temperatureData.map(d => d.y),
      values: temperatureData.map(d => d.temperature),
      type: 'temperature'
    };
    
    result.plain_summary = `Thermal analysis complete. Max temperature: ${maxTemp.toFixed(1)} K, Min: ${minTemp.toFixed(1)} K`;
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
  
  // First metric is primary (usually max temperature)
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
