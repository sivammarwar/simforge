/**
 * Control Domain Output Parser
 * Parses Python script output into structured metrics
 */

/**
 * Parse Python script output (JSON format)
 * @param {string} rawData - Raw Python output
 * @returns {Object} - Structured metrics and data
 */
export function parseControlOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    time_series: null,
    plain_summary: ''
  };
  
  // Parse JSON output from Python script
  for (const line of lines) {
    try {
      const jsonMatch = line.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.metrics) {
          result.metrics = parsed.metrics;
        }
        
        if (parsed.time_series) {
          result.time_series = parsed.time_series;
        }
        
        if (parsed.plain_summary) {
          result.plain_summary = parsed.plain_summary;
        }
        
        break;
      }
    } catch (e) {
      // Skip invalid JSON lines
      continue;
    }
  }
  
  // If no JSON found, try to parse raw data
  if (!result.metrics || result.metrics.length === 0) {
    result.plain_summary = 'Control simulation complete (raw output)';
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
  
  // First metric is primary (usually rise time or settling time)
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
