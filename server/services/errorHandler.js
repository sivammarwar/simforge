export function handleGroqError(error) {
  const status = error?.status || error?.response?.status || 500;
  const message = error?.message || 'Unknown Groq API error';

  const mapped = {
    400: {
      error: 'Invalid request sent to the LLM service.',
      suggestion: 'Try a shorter prompt with clear units and constraints.',
      error_code: 'BAD_REQUEST',
      retry_after_seconds: 5
    },
    401: {
      error: 'The Groq API key is invalid or missing.',
      suggestion: 'Check GROQ_API_KEY in your .env file.',
      error_code: 'AUTH_ERROR',
      retry_after_seconds: null
    },
    429: {
      error: 'Groq rate limit reached.',
      suggestion: 'Wait about 60 seconds, then retry.',
      error_code: 'RATE_LIMIT',
      retry_after_seconds: 60
    },
    500: {
      error: 'Groq service is temporarily unavailable.',
      suggestion: 'Try again in a moment.',
      error_code: 'API_ERROR',
      retry_after_seconds: 10
    }
  };

  return {
    status,
    ...(mapped[status] || mapped[500]),
    original_error: message
  };
}

export function getFallbackResponse(domain = 'engineering') {
  return `The live Groq brain is unavailable right now, so SimForge used its local ${domain} formulation fallback. Check the formulated model, run the deterministic solver, and retry the AI explanation once the backend is reachable.`;
}
