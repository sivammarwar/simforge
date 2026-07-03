import { enqueueSimulationJob, getSimulationJob, listSimulationJobs, updateSimulationJob } from '../services/simulationQueue.js';
import { runRegisteredSolver } from '../services/solverRegistry.js';

export function registerSimulationRoutes(app) {
  app.post('/api/jobs/simulations', async (req, res) => {
    const job = enqueueSimulationJob(req.body || {});
    updateSimulationJob(job.id, { status: 'running' });
    try {
      const result = await runRegisteredSolver(req.body.domain, req.body.model);
      const done = updateSimulationJob(job.id, { status: 'completed', result });
      res.json({ success: true, job: done });
    } catch (error) {
      const failed = updateSimulationJob(job.id, { status: 'failed', error: error.message });
      res.status(500).json({ success: false, job: failed });
    }
  });

  app.get('/api/jobs/simulations', (_req, res) => {
    res.json({ success: true, jobs: listSimulationJobs() });
  });

  app.get('/api/jobs/simulations/:id', (req, res) => {
    const job = getSimulationJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
    return res.json({ success: true, job });
  });
}

