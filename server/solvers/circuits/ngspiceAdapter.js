import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runNgspiceAdapter(model) {
  return runRegisteredSolver('Circuits', model);
}

