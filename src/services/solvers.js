// SimForge Solver Client — Circuits only
// Phase 0 cleanup: all legacy per-domain analytical solvers (Physics, Structural,
// Fluids, Semiconductors, Aerospace, Thermal, Control, Materials, Power) were
// removed. The Circuits pipeline runs through the backend (/api/circuits/solve
// via circuitsClient.js, or /api/simulate via runSolverWithBackend below).

/**
 * Validates solver result structure
 * @param {object} result - Solver result to validate
 * @param {string} domain - Expected domain
 * @returns {boolean} True if valid, false otherwise
 */
export function validateSolverResult(result, domain) {
  const issues = [];

  // Check required fields
  if (!result.domain) issues.push('Missing domain');
  if (!result.system_type) issues.push('Missing system_type');
  if (!result.solver_name) issues.push('Missing solver_name');
  if (!Array.isArray(result.metrics)) issues.push('Missing or non-array metrics');

  // Check visualization data
  const hasVisualizationData =
    result.time_series?.t?.length > 0 ||
    result.frequency_response?.freq?.length > 0 ||
    result.phase_portrait?.x?.length > 0 ||
    result.contour_field?.x?.length > 0;

  if (!hasVisualizationData) {
    issues.push('No visualization data (time_series, frequency_response, etc.)');
  }

  if (issues.length > 0) {
    console.warn(`[validateSolverResult] ${domain} solver has issues:`, issues);
    return false;
  }

  console.log(`[validateSolverResult] ${domain} solver result is valid`);
  return true;
}

// Helpers to parse numbers with standard unit multipliers
export function parseUnit(valStr) {
  if (typeof valStr === 'object' && valStr !== null && valStr.value !== undefined) {
    valStr = valStr.value;
  }
  if (typeof valStr !== 'string') return parseFloat(valStr) || 0;
  const match = valStr.trim().match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-zA-ZµΩ%³]*)$/);
  if (!match) return parseFloat(valStr) || 0;

  const num = parseFloat(match[1]);
  let unit = match[2];

  if (!unit) return num;

  // Standard base units to strip from the end of the unit string
  const baseUnits = ['Hz', 'Pa', 'm³', 'kg', 'Ω', 'V', 'A', 'H', 'F', 'm', 'N', 'K'];
  for (const base of baseUnits) {
    if (unit.endsWith(base)) {
      unit = unit.slice(0, -base.length);
      break;
    }
  }

  const multipliers = {
    'G': 1e9,
    'M': 1e6,
    'k': 1e3,
    'K': 1e3,
    'm': 1e-3,
    'u': 1e-6,
    'µ': 1e-6,
    'n': 1e-9,
    'p': 1e-12,
    'f': 1e-15
  };

  if (unit === '') return num;

  return multipliers[unit] !== undefined ? num * multipliers[unit] : num;
}

export function formatUnit(num, unit) {
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)} G${unit}`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)} M${unit}`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)} k${unit}`;
  if (Math.abs(num) < 1e-9) return `${(num * 1e12).toFixed(2)} p${unit}`;
  if (Math.abs(num) < 1e-6) return `${(num * 1e9).toFixed(2)} n${unit}`;
  if (Math.abs(num) < 1e-3) return `${(num * 1e6).toFixed(2)} u${unit}`;
  if (Math.abs(num) < 1) return `${(num * 1e3).toFixed(2)} m${unit}`;
  return `${num.toFixed(2)} ${unit}`;
}

/**
 * Backend API Configuration
 */
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

/**
 * Check if backend is available
 */
async function checkBackendHealth() {
  try {
    const response = await fetch('/health');
    return response.ok;
  } catch (error) {
    console.warn('[Backend] Health check failed:', error);
    return false;
  }
}

/**
 * Submit simulation to backend — Circuits only
 */
async function submitToBackend(domain, inputFile, onProgress) {
  try {
    console.log('[Backend] Submitting simulation to backend');

    const effectiveDomain = 'Circuits';

    // For circuits, use the direct rerun endpoint which bypasses Celery
    // and runs ngspice directly on the (possibly edited) netlist.
    if (effectiveDomain === 'Circuits' && inputFile?.content) {
      if (onProgress) onProgress('Submitting to circuits pipeline', 10, 0);
      const rerunResponse = await fetch('/api/circuits/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          netlist: inputFile.content,
          system_type: inputFile.system_type || 'Circuit',
          sub_domain: 'analog_sim',
        })
      });
      if (!rerunResponse.ok) {
        const errorText = await rerunResponse.text();
        throw new Error(`Circuits rerun returned ${rerunResponse.status}: ${errorText}`);
      }
      const rerunData = await rerunResponse.json();
      if (onProgress) onProgress('Simulation complete', 100, 1);
      if (!rerunData.success) {
        throw new Error(rerunData.error || 'Circuits rerun failed');
      }
      return rerunData.result;
    }

    const solverName = 'ngspice';

    const response = await fetch('/api/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain: effectiveDomain,
        system_type: inputFile.system_type || 'Unknown',
        solver_name: solverName,
        input_file: inputFile,
        execution_environment: 'docker'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Backend] Error details:', errorText);
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.task_id;

    console.log('[Backend] Task submitted:', taskId);

    // Poll for result
    return await pollBackendResult(taskId, onProgress);

  } catch (error) {
    console.error('[Backend] Submission failed:', error);
    throw error;
  }
}

/**
 * Poll backend for simulation result
 */
async function pollBackendResult(taskId, onProgress) {
  const maxAttempts = 120; // 2 minutes with 1s intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`/api/task/${taskId}`);

      if (!response.ok) {
        throw new Error(`Backend status check returned ${response.status}`);
      }

      const data = await response.json();

      if (onProgress) {
        onProgress(data.stage || 'Processing', data.progress || 0, attempts);
      }

      if (data.status === 'completed') {
        // Get result
        const resultResponse = await fetch(`/api/task/${taskId}/result`);
        if (!resultResponse.ok) {
          throw new Error(`Backend result fetch returned ${resultResponse.status}`);
        }
        const resultData = await resultResponse.json();
        console.log('[Backend] Simulation complete:', resultData);
        return resultData.result || resultData; // unwrap {result, status, task_id} -> flat solver dict
      } else if (data.status === 'failed') {
        const errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        throw new Error(errorMsg || 'Backend simulation failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

    } catch (error) {
      console.error('[Backend] Poll error:', error);
      throw error;
    }
  }

  throw new Error('Backend simulation timed out');
}

/**
 * Run solver with backend routing
 * Backend is required - no local solver fallback
 */
export async function runSolverWithBackend(domain, model, onProgress) {
  const backendAvailable = await checkBackendHealth();

  if (!USE_BACKEND) {
    throw new Error('Backend routing is required. Please set VITE_USE_BACKEND=true.');
  }

  if (!backendAvailable) {
    throw new Error('Backend is not available. Please ensure the backend server is running.');
  }

  try {
    const result = await submitToBackend(domain, model, onProgress);
    if (validateSolverResult(result, domain)) {
      return result;
    } else {
      throw new Error('Backend result validation failed');
    }
  } catch (error) {
    console.error('[Backend] Backend simulation failed:', error);
    throw error; // Re-throw exact error from backend
  }
}
