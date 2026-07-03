import { readArtifact } from '../services/artifactStore.js';

export function registerArtifactRoutes(app) {
  app.get('/api/artifacts', (_req, res) => {
    res.json({ success: true, message: 'Artifact listing will be backed by persistent object storage in production.' });
  });

  app.get('/api/artifacts/read', async (req, res) => {
    try {
      const content = await readArtifact(String(req.query.path || ''));
      res.type('text/plain').send(content);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  });
}

