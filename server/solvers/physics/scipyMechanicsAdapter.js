import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runScipyMechanicsAdapter(model) {
  return runRegisteredSolver('Physics', model);
}

