import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runPandapowerAdapter(model) {
  return runRegisteredSolver('Power', model);
}

