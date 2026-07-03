import { getSolverCapabilities, runExternalSimulation } from './externalSolvers.js';

export const SOLVER_REGISTRY = {
  Circuits: {
    primary: 'ngspice',
    fallback: 'analytical_circuits',
    adapters: ['ngspice', 'LTspice']
  },
  Structural: {
    primary: 'CalculiX ccx',
    fallback: 'analytical_structural',
    adapters: ['CalculiX ccx']
  },
  Aerospace: {
    primary: 'XFOIL',
    fallback: 'lifting_line_or_isentropic',
    adapters: ['XFOIL', 'OpenFOAM simpleFoam']
  },
  Fluids: {
    primary: 'OpenFOAM simpleFoam',
    fallback: 'analytical_fluids',
    adapters: ['OpenFOAM simpleFoam']
  },
  Thermal: {
    primary: 'ElmerSolver',
    fallback: 'thermal_budget',
    adapters: ['ElmerSolver']
  },
  Control: {
    primary: 'python-control',
    fallback: 'analytical_control',
    adapters: ['python-control']
  },
  Power: {
    primary: 'pandapower',
    fallback: 'power_balance',
    adapters: ['pandapower']
  },
  Physics: {
    primary: 'SciPy mechanics',
    fallback: 'analytical_mechanics',
    adapters: ['SciPy mechanics']
  }
};

export function getSolverPlan(domain) {
  return SOLVER_REGISTRY[domain] || {
    primary: 'analytical',
    fallback: 'llm_reasoning',
    adapters: []
  };
}

export async function getResolvedSolverRegistry() {
  const capabilities = await getSolverCapabilities();
  return Object.fromEntries(
    Object.entries(SOLVER_REGISTRY).map(([domain, plan]) => {
      const tools = capabilities.filter(item => item.domain === domain);
      return [
        domain,
        {
          ...plan,
          tools,
          primary_available: tools.some(tool => tool.tool === plan.primary && tool.available),
          available_tools: tools.filter(tool => tool.available).map(tool => tool.tool)
        }
      ];
    })
  );
}

export async function runRegisteredSolver(domain, model) {
  return runExternalSimulation(domain, model);
}
