import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runCalculixAdapter(model) {
  return runRegisteredSolver('Structural', model);
}

