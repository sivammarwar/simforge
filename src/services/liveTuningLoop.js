/**
 * Live Parameter Tuning Loop
 * Implements real-time parameter tuning with automatic simulation re-runs
 * and result comparison
 */

import { getTuningSuggestions } from './aiParameterTuner.js';

/**
 * Tuning loop state management
 */
class TuningLoopState {
  constructor() {
    this.active = false;
    this.currentRunId = null;
    this.previousResults = [];
    this.targetMetric = null;
    this.optimizationDirection = 'maximize'; // or 'minimize'
    this.maxIterations = 10;
    this.currentIteration = 0;
    this.convergenceThreshold = 0.01;
    this.lastMetricValue = null;
  }
}

const state = new TuningLoopState();

/**
 * Start a live tuning loop
 */
export function startTuningLoop(targetMetric, direction = 'maximize', maxIterations = 10) {
  state.active = true;
  state.targetMetric = targetMetric;
  state.optimizationDirection = direction;
  state.maxIterations = maxIterations;
  state.currentIteration = 0;
  state.lastMetricValue = null;
  
  return {
    active: true,
    targetMetric,
    direction,
    maxIterations,
    currentIteration: 0
  };
}

/**
 * Stop the tuning loop
 */
export function stopTuningLoop() {
  state.active = false;
  return {
    active: false,
    iterations: state.currentIteration,
    results: state.previousResults
  };
}

/**
 * Check if tuning loop is active
 */
export function isTuningActive() {
  return state.active;
}

/**
 * Get current tuning state
 */
export function getTuningState() {
  return {
    active: state.active,
    targetMetric: state.targetMetric,
    optimizationDirection: state.optimizationDirection,
    currentIteration: state.currentIteration,
    maxIterations: state.maxIterations,
    lastMetricValue: state.lastMetricValue,
    previousResults: state.previousResults
  };
}

/**
 * Extract metric value from simulation results
 */
function extractMetricValue(results, metricName) {
  if (!results || !results.metrics) return null;
  
  const metric = results.metrics.find(m => 
    m.name.toLowerCase().includes(metricName.toLowerCase())
  );
  
  if (!metric) return null;
  
  // Try to parse numeric value
  const value = parseFloat(metric.value);
  return isNaN(value) ? null : value;
}

/**
 * Check for convergence
 */
function checkConvergence(currentValue, previousValue, threshold) {
  if (previousValue === null) return false;
  
  const relativeChange = Math.abs((currentValue - previousValue) / previousValue);
  return relativeChange < threshold;
}

/**
 * Process tuning iteration results
 */
export async function processTuningIteration(results, model, domain, provider = 'groq') {
  if (!state.active) {
    return { shouldContinue: false, reason: 'Tuning loop not active' };
  }
  
  state.currentIteration++;
  
  // Extract target metric value
  const metricValue = extractMetricValue(results, state.targetMetric);
  
  if (metricValue === null) {
    return {
      shouldContinue: false,
      reason: `Could not extract metric value for: ${state.targetMetric}`,
      iteration: state.currentIteration
    };
  }
  
  // Store results
  state.previousResults.push({
    iteration: state.currentIteration,
    metricValue,
    model: JSON.parse(JSON.stringify(model)),
    timestamp: Date.now()
  });
  
  // Check convergence
  const converged = checkConvergence(metricValue, state.lastMetricValue, state.convergenceThreshold);
  state.lastMetricValue = metricValue;
  
  // Check iteration limit
  if (state.currentIteration >= state.maxIterations) {
    return {
      shouldContinue: false,
      reason: 'Maximum iterations reached',
      iteration: state.currentIteration,
      converged,
      finalValue: metricValue,
      results: state.previousResults
    };
  }
  
  // Check convergence
  if (converged) {
    return {
      shouldContinue: false,
      reason: 'Converged',
      iteration: state.currentIteration,
      converged: true,
      finalValue: metricValue,
      results: state.previousResults
    };
  }
  
  // Get AI tuning suggestions for next iteration
  try {
    const suggestions = await getTuningSuggestions(model, domain, state.targetMetric, provider);
    
    return {
      shouldContinue: true,
      iteration: state.currentIteration,
      currentValue: metricValue,
      suggestions,
      results: state.previousResults
    };
  } catch (error) {
    console.error('Error getting tuning suggestions:', error);
    
    return {
      shouldContinue: false,
      reason: 'Failed to get tuning suggestions',
      iteration: state.currentIteration,
      error: error.message
    };
  }
}

/**
 * Compare two simulation results
 */
export function compareResults(results1, results2) {
  const comparison = {
    metrics: [],
    improved: false,
    degradation: false
  };
  
  if (!results1.metrics || !results2.metrics) return comparison;
  
  results1.metrics.forEach(m1 => {
    const m2 = results2.metrics.find(m => m.name === m1.name);
    if (m2) {
      const v1 = parseFloat(m1.value);
      const v2 = parseFloat(m2.value);
      
      if (!isNaN(v1) && !isNaN(v2)) {
        const change = v2 - v1;
        const percentChange = v1 !== 0 ? (change / v1) * 100 : 0;
        
        comparison.metrics.push({
          name: m1.name,
          oldValue: v1,
          newValue: v2,
          change,
          percentChange,
          improved: state.optimizationDirection === 'maximize' ? change > 0 : change < 0
        });
      }
    }
  });
  
  // Determine overall improvement based on target metric
  if (state.targetMetric) {
    const targetMetric1 = extractMetricValue(results1, state.targetMetric);
    const targetMetric2 = extractMetricValue(results2, state.targetMetric);
    
    if (targetMetric1 !== null && targetMetric2 !== null) {
      const change = targetMetric2 - targetMetric1;
      comparison.improved = state.optimizationDirection === 'maximize' ? change > 0 : change < 0;
      comparison.degradation = !comparison.improved && change !== 0;
    }
  }
  
  return comparison;
}

/**
 * Generate tuning report
 */
export function generateTuningReport() {
  if (state.previousResults.length === 0) {
    return {
      success: false,
      message: 'No iteration results available'
    };
  }
  
  const firstResult = state.previousResults[0];
  const lastResult = state.previousResults[state.previousResults.length - 1];
  
  const totalImprovement = lastResult.metricValue - firstResult.metricValue;
  const percentImprovement = firstResult.metricValue !== 0 
    ? (totalImprovement / firstResult.metricValue) * 100 
    : 0;
  
  return {
    success: true,
    targetMetric: state.targetMetric,
    optimizationDirection: state.optimizationDirection,
    iterations: state.currentIteration,
    initialValue: firstResult.metricValue,
    finalValue: lastResult.metricValue,
    totalImprovement,
    percentImprovement,
    converged: checkConvergence(lastResult.metricValue, firstResult.metricValue, state.convergenceThreshold),
    results: state.previousResults
  };
}

/**
 * Reset tuning state
 */
export function resetTuningState() {
  state.active = false;
  state.currentRunId = null;
  state.previousResults = [];
  state.targetMetric = null;
  state.optimizationDirection = 'maximize';
  state.maxIterations = 10;
  state.currentIteration = 0;
  state.lastMetricValue = null;
}
