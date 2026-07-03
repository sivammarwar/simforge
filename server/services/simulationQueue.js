const jobs = new Map();

export function enqueueSimulationJob(payload) {
  const id = `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const job = {
    id,
    status: 'queued',
    payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: null,
    error: null
  };
  jobs.set(id, job);
  return job;
}

export function updateSimulationJob(id, patch) {
  const existing = jobs.get(id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

export function getSimulationJob(id) {
  return jobs.get(id) || null;
}

export function listSimulationJobs() {
  return [...jobs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

