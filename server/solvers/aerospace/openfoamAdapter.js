import { runRegisteredSolver } from '../../services/solverRegistry.js';

export async function runOpenFoamAdapter(model) {
  return runRegisteredSolver('Fluids', model);
}

