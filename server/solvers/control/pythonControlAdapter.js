import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runPythonControlAdapter(model) {
  return runRegisteredSolver('Control', model);
}

