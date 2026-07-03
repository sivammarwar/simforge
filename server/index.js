import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createProvider, getAvailableProviders } from './services/llmFactory.js';
import { getFallbackResponse } from './services/errorHandler.js';
import { tryDeterministicEngineeringAnswer } from './services/engineeringGuardrails.js';
import { getSolverCapabilities } from './services/externalSolvers.js';
import { runRegisteredSolver } from './services/solverRegistry.js';
import { runCapabilityValidation } from './services/validationRunner.js';
import { requireApiKey } from './services/authService.js';
import { recordTelemetry, getTelemetrySnapshot } from './services/telemetry.js';
import { registerSimulationRoutes } from './routes/simulations.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.API_PORT || '8787', 10);
const systemPrompt = fs.readFileSync(path.resolve('server/prompts/system_prompt_groq.md'), 'utf8');
const requestBuckets = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(requireApiKey);
app.use(rateLimit(30, 60_000));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: 'groq',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/providers', (_req, res) => {
  res.json(getAvailableProviders());
});

app.get('/api/telemetry', (_req, res) => {
  res.json({ success: true, telemetry: getTelemetrySnapshot() });
});

app.get('/api/model-info', (_req, res) => {
  try {
    const llm = createProvider('groq');
    res.json(llm.getModelInfo());
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/solver-capabilities', async (_req, res) => {
  try {
    res.json({
      success: true,
      tools: await getSolverCapabilities(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Solver capability check failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/simulate', async (req, res) => {
  const startedAt = Date.now();
  const { domain, model } = req.body || {};

  if (!domain || !model) {
    return res.status(400).json({
      success: false,
      error: 'Simulation request requires domain and model.'
    });
  }

  try {
    const result = await runRegisteredSolver(String(domain), model);
    recordTelemetry('simulation_adapter_completed', {
      domain,
      tool: result.tool,
      status: result.status,
      executed: result.executed
    });
    logger.info('External simulation adapter completed', {
      domain,
      tool: result.tool,
      status: result.status,
      executed: result.executed,
      response_time_ms: Date.now() - startedAt
    });
    res.json({
      ...result,
      response_time_ms: Date.now() - startedAt
    });
  } catch (error) {
    logger.error('External simulation adapter failed', { error: error.message, domain });
    res.status(500).json({
      success: false,
      status: 'failed',
      executed: false,
      error: error.message
    });
  }
});

app.post('/api/validate-solvers', async (_req, res) => {
  try {
    res.json(await runCapabilityValidation());
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

registerSimulationRoutes(app);
registerProjectRoutes(app);
registerArtifactRoutes(app);

app.post('/api/chat', async (req, res) => {
  const startedAt = Date.now();
  const { message, conversationHistory = [], provider = 'groq', domain = 'Engineering' } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message cannot be empty.',
      suggestion: 'Describe the engineering problem with known values and units.'
    });
  }

  try {
    const guarded = tryDeterministicEngineeringAnswer(message, domain);
    if (guarded) {
      logger.info('Deterministic engineering guardrail answered request', { domain, model: guarded.model });
      return res.json({ ...guarded, response_time_ms: Date.now() - startedAt });
    }

    const llm = createProvider(provider);
    const response = await llm.chat(systemPrompt, String(message).trim(), conversationHistory);
    const responseTime = Date.now() - startedAt;

    if (!response.success) {
      logger.warn('Groq request failed', {
        domain,
        error_code: response.error_code,
        status: response.status,
        response_time_ms: responseTime
      });

      return res.status(response.status || 500).json({
        ...response,
        fallback_message: getFallbackResponse(domain)
      });
    }

    logger.info('Chat request completed', {
      provider: response.provider,
      model: response.model,
      domain,
      tokens_used: response.tokens_used,
      response_time_ms: responseTime
    });

    res.json({
      ...response,
      response_time_ms: responseTime
    });
  } catch (error) {
    logger.error('Chat endpoint error', { error: error.message, domain });
    res.status(500).json({
      success: false,
      error: error.message,
      fallback_message: getFallbackResponse(domain)
    });
  }
});

const distPath = path.resolve('dist');
const builtAppPath = path.join(distPath, 'index.html');
if (fs.existsSync(builtAppPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(builtAppPath);
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).send('SimForge API is running. Build the web app with npm run build, or open the Vite dev server on port 5173.');
  });
}

app.listen(port, '127.0.0.1', () => {
  logger.info(`SimForge API server listening on http://127.0.0.1:${port}`);
});

function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/chat')) return next();
    const key = req.ip || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const bucket = requestBuckets.get(key) || [];
    const recent = bucket.filter(timestamp => now - timestamp < windowMs);

    if (recent.length >= maxRequests) {
      logger.warn('Rate limit exceeded', { ip: key, requests_in_window: recent.length });
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Free tier limit: 30 requests/minute.',
        suggestion: 'Wait 60 seconds and try again.',
        retry_after_seconds: 60,
        error_code: 'RATE_LIMIT'
      });
    }

    recent.push(now);
    requestBuckets.set(key, recent);
    next();
  };
}
