import { getSolverCapabilities } from './externalSolvers.js';
import { getResolvedSolverRegistry } from './solverRegistry.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runCapabilityValidation() {
  const capabilities = await getSolverCapabilities();
  const registry = await getResolvedSolverRegistry();
  const benchmarks = await loadBenchmarks();
  const validation = capabilities.map(tool => ({
    domain: tool.domain,
    tool: tool.tool,
    available: tool.available,
    status: tool.available ? 'ready' : 'missing',
    adapter: tool.adapter,
    command: tool.command || null,
    message: tool.available
      ? `${tool.tool} adapter is ready.`
      : `${tool.tool} is not installed, misconfigured, or not visible to the current runtime.`
  }));

  return {
    success: true,
    passed: validation.filter(item => item.available).length,
    total: validation.length,
    validation,
    registry,
    benchmarks: summarizeBenchmarks(benchmarks),
    timestamp: new Date().toISOString()
  };
}

async function loadBenchmarks() {
  const dir = path.resolve('validation/benchmarks');
  const files = await fs.readdir(dir).catch(() => []);
  const loaded = [];
  for (const file of files.filter(item => item.endsWith('.json'))) {
    const fullPath = path.join(dir, file);
    try {
      const items = JSON.parse(await fs.readFile(fullPath, 'utf8'));
      loaded.push(...items.map(item => ({ ...item, file })));
    } catch (error) {
      loaded.push({ id: file, domain: 'Unknown', error: error.message, file });
    }
  }
  return loaded;
}

function summarizeBenchmarks(items) {
  const byDomain = {};
  items.forEach(item => {
    const domain = item.domain || 'Unknown';
    byDomain[domain] = (byDomain[domain] || 0) + 1;
  });
  return {
    total: items.length,
    by_domain: byDomain,
    ids: items.map(item => item.id)
  };
}
