/**
 * Benchmarks - Placeholder for validation dashboard
 * This file provides placeholder benchmark data for the ValidationDashboard component
 * TODO: Implement actual benchmark definitions
 */

export const appSolverDomains = [
  'Circuits',
  'Structural',
  'Thermal',
  'Fluids',
  'Aerospace'
];

export const benchmarkPhases = [
  'Input Generation',
  'Solver Execution',
  'Output Parsing',
  'Visualization'
];

export const benchmarkRubric = [
  { section: 'Input Generation', points: 25 },
  { section: 'Solver Execution', points: 25 },
  { section: 'Output Parsing', points: 25 },
  { section: 'Visualization', points: 25 }
];

export const benchmarks = [
  {
    id: 'circuits-rc-lowpass',
    domain: 'Circuits',
    name: 'RC Low-Pass Filter',
    description: 'Design an RC low-pass filter with R=1k, C=1uF',
    status: 'implemented',
    implemented: true
  },
  {
    id: 'structural-cantilever',
    domain: 'Structural',
    name: 'Cantilever Beam',
    description: 'Analyze a cantilever beam with point load',
    status: 'implemented',
    implemented: true
  },
  {
    id: 'thermal-heatsink',
    domain: 'Thermal',
    name: 'Heat Sink',
    description: 'Analyze heat sink thermal performance',
    status: 'implemented',
    implemented: true
  },
  {
    id: 'fluids-pipe',
    domain: 'Fluids',
    name: 'Pipe Flow',
    description: 'Analyze fluid flow in a pipe',
    status: 'implemented',
    implemented: true
  },
  {
    id: 'aerospace-airfoil',
    domain: 'Aerospace',
    name: 'Airfoil',
    description: 'Analyze airfoil lift and drag',
    status: 'implemented',
    implemented: true
  }
];

export function getDomainCoverage(benchmarksData = benchmarks) {
  const domains = [...new Set(benchmarksData.map(b => b.domain))];
  return domains.map(domain => {
    const domainBenchmarks = benchmarksData.filter(b => b.domain === domain);
    const implemented = domainBenchmarks.some(b => b.implemented);
    return {
      domain,
      benchmarkCount: domainBenchmarks.length,
      implemented,
      status: implemented ? 'Implemented' : 'Not Implemented',
      note: implemented ? 'Domain active' : 'Domain pending'
    };
  });
}

export const successMetrics = {
  totalBenchmarks: benchmarks.length,
  implementedBenchmarks: benchmarks.filter(b => b.implemented).length,
  coveragePercent: Math.round((benchmarks.filter(b => b.implemented).length / benchmarks.length) * 100)
};

export function summarizeBenchmarks(benchmarksData = benchmarks) {
  const domains = [...new Set(benchmarksData.map(b => b.domain))];
  return {
    count: benchmarksData.length,
    domains,
    singleDomainDomains: domains,
    integrationCount: 1,
    totalMinutes: benchmarksData.length * 5,
    averageMinutes: 5
  };
}
