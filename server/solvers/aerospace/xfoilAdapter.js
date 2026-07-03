import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runXfoilAdapter(model) {
  return runRegisteredSolver('Aerospace', model);
}

