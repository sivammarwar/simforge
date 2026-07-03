const projects = new Map();

export function registerProjectRoutes(app) {
  app.get('/api/projects', (_req, res) => {
    res.json({ success: true, projects: [...projects.values()] });
  });

  app.post('/api/projects', (req, res) => {
    const id = `project_${Date.now()}`;
    const project = {
      id,
      name: req.body?.name || 'Untitled Project',
      created_at: new Date().toISOString()
    };
    projects.set(id, project);
    res.json({ success: true, project });
  });
}

