export const DIAGRAM_REGISTRY = {
  voltage_divider: {
    name: 'Voltage Divider Circuit',
    status: 'ready',
    renderer: 'svg:circuit_voltage_divider',
    solver: 'Analytical DC operating point'
  },
  buck_converter: {
    name: 'Buck Converter Circuit',
    status: 'ready',
    renderer: 'svg:circuit_buck',
    solver: 'ngspice-compatible analytical transient'
  },
  beam_static: {
    name: 'Cantilever Beam + Field Map',
    status: 'ready',
    renderer: 'canvas:structural_field_map',
    solver: 'CalculiX-compatible analytical beam estimate'
  },
  pulley_block: {
    name: 'Pulley & Blocks with FBD',
    status: 'ready',
    renderer: 'svg:physics_pulley_fbd',
    solver: 'Analytical Newtonian mechanics'
  },
  inclined_pulley: {
    name: 'Inclined Plane Pulley + FBD',
    status: 'ready',
    renderer: 'svg:physics_incline_pulley_fbd',
    solver: 'Analytical Newtonian mechanics'
  },
  spring_pulley_shm: {
    name: 'Spring-Pulley SHM',
    status: 'ready',
    renderer: 'svg:physics_spring_pulley',
    solver: 'Analytical SHM solver'
  },
  ladder_slip: {
    name: 'Ladder Slip Free-Body Diagram',
    status: 'ready',
    renderer: 'svg:physics_ladder_slip_fbd',
    solver: 'Analytical static equilibrium'
  },
  spring_shm: {
    name: 'Spring-Mass SHM',
    status: 'ready',
    renderer: 'svg:physics_spring_mass',
    solver: 'Analytical SHM solver'
  },
  wave_motion: {
    name: 'Wave Motion',
    status: 'in_development',
    renderer: 'plot:wave_profile',
    solver: 'Analytical wave equation'
  },
  circular_motion: {
    name: 'Circular Motion',
    status: 'not_started',
    renderer: null,
    solver: 'Analytical centripetal dynamics'
  },
  collision_momentum: {
    name: 'Collision & Momentum',
    status: 'not_started',
    renderer: null,
    solver: 'Momentum/energy conservation'
  },
  rotational_dynamics: {
    name: 'Rotational Dynamics',
    status: 'not_started',
    renderer: null,
    solver: 'Rigid-body rotational dynamics'
  }
};

const STATUS_COPY = {
  ready: {
    diagram_status: 'fully_rendered',
    title: 'Diagram ready',
    message: 'A verified visualization template is available for this problem type.',
    eta: null
  },
  in_development: {
    diagram_status: 'in_development',
    title: 'Diagram in development',
    message: 'The physics calculation is complete. A richer visualization template is being built, so the UI may show equations/plots first.',
    eta: 'Expected soon'
  },
  not_started: {
    diagram_status: 'coming_soon',
    title: 'Diagram coming soon',
    message: 'This problem type can be solved analytically, but a dedicated diagram template is not ready yet.',
    eta: 'Not scheduled'
  }
};

export function getDiagramCapability(problemType) {
  const entry = DIAGRAM_REGISTRY[problemType] || {
    name: problemType ? String(problemType).replace(/_/g, ' ') : 'Unknown diagram',
    status: 'not_started',
    renderer: null,
    solver: 'Analytical solver'
  };
  const copy = STATUS_COPY[entry.status] || STATUS_COPY.not_started;

  return {
    problem_type: problemType || 'unknown',
    name: entry.name,
    status: entry.status,
    renderer: entry.renderer,
    solver: entry.solver,
    diagram_status: copy.diagram_status,
    diagram_message: {
      category: 'physics_visualization',
      status_code: entry.status.toUpperCase(),
      title: entry.name,
      message: copy.message,
      eta: copy.eta,
      fallback: entry.status === 'ready'
        ? 'Interactive diagram available.'
        : 'Results and equations remain available while the diagram template is completed.'
    }
  };
}

export function attachVisualizationCapability(result, problemType, extra = {}) {
  const capability = getDiagramCapability(problemType);
  return {
    ...result,
    domain: extra.domain || result.domain,
    problem_type: problemType,
    solver_used: result.solver_used || capability.solver,
    visualization_capability: capability,
    visualizations: {
      diagram_status: capability.diagram_status,
      diagram_message: capability.diagram_message,
      renderer: capability.renderer,
      ...(result.visualizations || {})
    }
  };
}
