import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runElmerAdapter(model) {
  return runRegisteredSolver('Thermal', model);
}

