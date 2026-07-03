/**
 * Fluids Domain Output Parser
 * Parses OpenFOAM output files into structured metrics
 */

/**
 * Parse OpenFOAM output data
 * @param {string} rawData - Raw OpenFOAM output
 * @returns {Object} - Structured metrics and data
 */
export function parseOpenFOAMOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    contour_field: null,
    plain_summary: ''
  };
  
  let nodeData = [];
  let velocityData = [];
  let pressureData = [];
  
  for (const line of lines) {
    // Parse node and field data
    const values = line.trim().split(/\s+/).filter(v => v !== '');
    if (values.length >= 4 && !isNaN(parseFloat(values[0]))) {
      const nodeId = parseInt(values[0]);
      const x = parseFloat(values[1]);
      const y = parseFloat(values[2]);
      const z = parseFloat(values[3]);
      
      nodeData.push({ nodeId, x, y, z });
      
      // If velocity data is present
      if (values.length >= 7) {
        const vx = parseFloat(values[4]);
        const vy = parseFloat(values[5]);
        const vz = parseFloat(values[6]);
        const velocity = Math.sqrt(vx*vx + vy*vy + vz*vz);
        velocityData.push({ nodeId, x, y, z, velocity, vx, vy, vz });
      }
      
      // If pressure data is present
      if (values.length >= 8) {
        const pressure = parseFloat(values[7]);
        pressureData.push({ nodeId, x, y, z, pressure });
      }
    }
  }
  
  // Calculate metrics from velocity data
  if (velocityData.length > 0) {
    const velocities = velocityData.map(d => d.velocity);
    const maxVelocity = Math.max(...velocities);
    const minVelocity = Math.min(...velocities);
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    
    result.metrics.push(
      { name: 'Max Velocity', value: maxVelocity, unit: 'm/s' },
      { name: 'Min Velocity', value: minVelocity, unit: 'm/s' },
      { name: 'Avg Velocity', value: avgVelocity, unit: 'm/s' }
    );
    
    // Build contour field for visualization
    result.contour_field = {
      x: velocityData.map(d => d.x),
      y: velocityData.map(d => d.y),
      values: velocityData.map(d => d.velocity),
      type: 'velocity'
    };
  }
  
  // Calculate metrics from pressure data
  if (pressureData.length > 0) {
    const pressures = pressureData.map(d => d.pressure);
    const maxPressure = Math.max(...pressures);
    const minPressure = Math.min(...pressures);
    const pressureDrop = maxPressure - minPressure;
    
    result.metrics.push(
      { name: 'Max Pressure', value: maxPressure, unit: 'Pa' },
      { name: 'Min Pressure', value: minPressure, unit: 'Pa' },
      { name: 'Pressure Drop', value: pressureDrop, unit: 'Pa' }
    );
  }
  
  if (velocityData.length > 0) {
    result.plain_summary = `CFD analysis complete. Max velocity: ${result.metrics[0].value.toFixed(2)} m/s`;
  } else if (pressureData.length > 0) {
    result.plain_summary = `CFD analysis complete. Pressure drop: ${pressureDrop.toFixed(0)} Pa`;
  } else {
    result.plain_summary = 'CFD analysis complete';
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
  
  // First metric is primary (usually max velocity)
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
