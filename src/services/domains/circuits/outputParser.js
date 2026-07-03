/**
 * Circuits Domain Output Parser
 * Parses ngspice output files into structured metrics
 */

/**
 * Parse ngspice .raw output file
 * @param {string} rawData - Raw ngspice output
 * @returns {Object} - Structured metrics and data
 */
export function parseNgspiceOutput(rawData) {
  const lines = rawData.split('\n');
  const result = {
    metrics: [],
    time_series: null,
    frequency_response: null,
    plain_summary: ''
  };
  
  let currentSection = null;
  let timeData = [];
  let voltageData = [];
  let freqData = [];
  let magnitudeData = [];
  let phaseData = [];
  
  for (const line of lines) {
    // Detect sections
    if (line.includes('Transient Analysis')) {
      currentSection = 'transient';
    } else if (line.includes('AC Analysis')) {
      currentSection = 'ac';
    } else if (line.includes('Operating Point')) {
      currentSection = 'op';
    }
    
    // Parse data lines
    const values = line.trim().split(/\s+/).filter(v => v !== '');
    if (values.length >= 2 && !isNaN(parseFloat(values[0]))) {
      if (currentSection === 'transient') {
        timeData.push(parseFloat(values[0]));
        voltageData.push(parseFloat(values[1]));
      } else if (currentSection === 'ac') {
        freqData.push(parseFloat(values[0]));
        magnitudeData.push(parseFloat(values[1]));
        if (values.length >= 3) {
          phaseData.push(parseFloat(values[2]));
        }
      }
    }
  }
  
  // Build time series
  if (timeData.length > 0) {
    result.time_series = {
      t: timeData,
      v_out: voltageData
    };
    
    // Calculate metrics from time series
    const maxVoltage = Math.max(...voltageData);
    const minVoltage = Math.min(...voltageData);
    const avgVoltage = voltageData.reduce((a, b) => a + b, 0) / voltageData.length;
    
    result.metrics.push(
      { name: 'Max Voltage', value: maxVoltage, unit: 'V' },
      { name: 'Min Voltage', value: minVoltage, unit: 'V' },
      { name: 'Avg Voltage', value: avgVoltage, unit: 'V' }
    );
  }
  
  // Build frequency response
  if (freqData.length > 0) {
    result.frequency_response = {
      freq: freqData,
      magnitude: magnitudeData,
      phase: phaseData.length > 0 ? phaseData : null
    };
    
    // Calculate cutoff frequency (3dB point)
    const maxMag = Math.max(...magnitudeData);
    const cutoff3dB = maxMag / Math.sqrt(2);
    let cutoffFreq = null;
    for (let i = 0; i < freqData.length; i++) {
      if (magnitudeData[i] <= cutoff3dB) {
        cutoffFreq = freqData[i];
        break;
      }
    }
    
    result.metrics.push(
      { name: 'Cutoff Frequency', value: cutoffFreq || freqData[freqData.length - 1], unit: 'Hz' },
      { name: 'Max Gain', value: maxMag, unit: 'dB' }
    );
  }
  
  // Generate summary
  if (result.time_series) {
    result.plain_summary = `Transient analysis complete. Max voltage: ${maxVoltage.toFixed(3)}V`;
  } else if (result.frequency_response) {
    result.plain_summary = `AC analysis complete. Cutoff frequency: ${cutoffFreq?.toFixed(0) || 'N/A'} Hz`;
  } else {
    result.plain_summary = 'Circuit simulation complete';
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
      frequency_response: null,
      plain_summary: 'No result available',
      error: 'Empty result from solver'
    };
  }
  
  return {
    metrics: solverResult.metrics || [],
    time_series: solverResult.time_series || null,
    frequency_response: solverResult.frequency_response || null,
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
  
  // First metric is primary
  metrics.primary = parsedResult.metrics[0];
  
  // Rest are secondary
  metrics.secondary = parsedResult.metrics.slice(1);
  
  // Create labels
  parsedResult.metrics.forEach(m => {
    metrics.labels[m.name] = `${m.value} ${m.unit}`;
  });
  
  return metrics;
}
