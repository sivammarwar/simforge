export function requireApiKey(req, res, next) {
  const configured = process.env.SIMFORGE_API_KEY;
  if (!configured) return next();
  const provided = req.headers['x-api-key'] || req.query.api_key;
  if (provided === configured) return next();
  return res.status(401).json({
    success: false,
    error: 'Missing or invalid API key.'
  });
}

