/**
 * Real-time Comparison Service
 * Handles real-time result comparison and visualization updates
 * Integrates with live tuning loop for parameter optimization
 */

import { compareResults } from './liveTuningLoop.js';

/**
 * Comparison state management
 */
class ComparisonState {
  constructor() {
    this.comparisons = [];
    this.activeComparisonId = null;
    this.maxComparisons = 5;
  }
}

const state = new ComparisonState();

/**
 * Create a new comparison
 */
export function createComparison(baseResults, comparisonResults, modelChanges) {
  const comparisonId = `comp_${Date.now()}`;
  
  const comparison = {
    id: comparisonId,
    timestamp: Date.now(),
    baseResults: JSON.parse(JSON.stringify(baseResults)),
    comparisonResults: JSON.parse(JSON.stringify(comparisonResults)),
    modelChanges: modelChanges || [],
    analysis: compareResults(baseResults, comparisonResults)
  };
  
  // Add to comparisons list
  state.comparisons.unshift(comparison);
  
  // Limit to max comparisons
  if (state.comparisons.length > state.maxComparisons) {
    state.comparisons = state.comparisons.slice(0, state.maxComparisons);
  }
  
  state.activeComparisonId = comparisonId;
  
  return comparison;
}

/**
 * Get active comparison
 */
export function getActiveComparison() {
  if (!state.activeComparisonId) return null;
  return state.comparisons.find(c => c.id === state.activeComparisonId) || null;
}

/**
 * Get all comparisons
 */
export function getAllComparisons() {
  return state.comparisons;
}

/**
 * Set active comparison
 */
export function setActiveComparison(comparisonId) {
  const comparison = state.comparisons.find(c => c.id === comparisonId);
  if (comparison) {
    state.activeComparisonId = comparisonId;
    return comparison;
  }
  return null;
}

/**
 * Clear all comparisons
 */
export function clearComparisons() {
  state.comparisons = [];
  state.activeComparisonId = null;
}

/**
 * Generate comparison summary
 */
export function generateComparisonSummary(comparison) {
  if (!comparison) return null;
  
  const { analysis, modelChanges, baseResults, comparisonResults } = comparison;
  
  const improvedMetrics = analysis.metrics.filter(m => m.improved);
  const degradedMetrics = analysis.metrics.filter(m => !m.improved && m.change !== 0);
  
  return {
    overallImproved: analysis.improved,
    overallDegraded: analysis.degradation,
    improvedCount: improvedMetrics.length,
    degradedCount: degradedMetrics.length,
    totalMetrics: analysis.metrics.length,
    modelChanges: modelChanges.length,
    timestamp: comparison.timestamp,
    improvedMetrics: improvedMetrics.map(m => ({
      name: m.name,
      oldValue: m.oldValue,
      newValue: m.newValue,
      percentChange: m.percentChange
    })),
    degradedMetrics: degradedMetrics.map(m => ({
      name: m.name,
      oldValue: m.oldValue,
      newValue: m.newValue,
      percentChange: m.percentChange
    }))
  };
}

/**
 * Generate comparison plot data for visualization
 */
export function generateComparisonPlotData(comparison) {
  if (!comparison || !comparison.analysis.metrics) return null;
  
  const metrics = comparison.analysis.metrics;
  
  return {
    type: 'bar',
    x: metrics.map(m => m.name),
    y: metrics.map(m => m.percentChange),
    marker: {
      color: metrics.map(m => m.improved ? '#22C55E' : '#EF4444')
    },
    text: metrics.map(m => `${m.percentChange.toFixed(1)}%`),
    textposition: 'outside',
    name: 'Percent Change'
  };
}

/**
 * Generate time series comparison data
 */
export function generateTimeSeriesComparison(baseResults, comparisonResults) {
  const timeSeriesData = [];
  
  // Check for time_series data
  if (baseResults.time_series && comparisonResults.time_series) {
    const baseT = baseResults.time_series.t || [];
    const compT = comparisonResults.time_series.t || [];
    
    // Get all available signal names
    const signalNames = new Set();
    Object.keys(baseResults.time_series).forEach(key => {
      if (key !== 't' && Array.isArray(baseResults.time_series[key])) {
        signalNames.add(key);
      }
    });
    Object.keys(comparisonResults.time_series).forEach(key => {
      if (key !== 't' && Array.isArray(comparisonResults.time_series[key])) {
        signalNames.add(key);
      }
    });
    
    signalNames.forEach(signalName => {
      const baseSignal = baseResults.time_series[signalName] || [];
      const compSignal = comparisonResults.time_series[signalName] || [];
      
      timeSeriesData.push({
        name: signalName,
        base: {
          x: baseT,
          y: baseSignal,
          mode: 'lines',
          name: `${signalName} (Base)`,
          line: { color: '#3B82F6', width: 2, dash: 'solid' }
        },
        comparison: {
          x: compT,
          y: compSignal,
          mode: 'lines',
          name: `${signalName} (Updated)`,
          line: { color: '#F59E0B', width: 2, dash: 'dash' }
        }
      });
    });
  }
  
  return timeSeriesData;
}

/**
 * Export comparison data as JSON
 */
export function exportComparisonData(comparison) {
  if (!comparison) return null;
  
  return {
    id: comparison.id,
    timestamp: comparison.timestamp,
    summary: generateComparisonSummary(comparison),
    modelChanges: comparison.modelChanges,
    baseResults: comparison.baseResults,
    comparisonResults: comparison.comparisonResults,
    analysis: comparison.analysis
  };
}

/**
 * Import comparison data from JSON
 */
export function importComparisonData(data) {
  if (!data || !data.id) return null;
  
  const comparison = {
    id: data.id,
    timestamp: data.timestamp,
    baseResults: data.baseResults,
    comparisonResults: data.comparisonResults,
    modelChanges: data.modelChanges || [],
    analysis: data.analysis || { metrics: [], improved: false, degradation: false }
  };
  
  // Add to comparisons list
  state.comparisons.unshift(comparison);
  
  // Limit to max comparisons
  if (state.comparisons.length > state.maxComparisons) {
    state.comparisons = state.comparisons.slice(0, state.maxComparisons);
  }
  
  state.activeComparisonId = comparison.id;
  
  return comparison;
}

/**
 * Get comparison statistics
 */
export function getComparisonStatistics() {
  return {
    totalComparisons: state.comparisons.length,
    activeComparisonId: state.activeComparisonId,
    maxComparisons: state.maxComparisons
  };
}
