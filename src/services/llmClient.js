export async function chatWithEngineeringBrain({
  message,
  domain,
  provider = 'groq',
  conversationHistory = []
}) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        domain,
        provider,
        conversationHistory: conversationHistory.map(item => ({
          role: item.sender === 'ai' ? 'assistant' : 'user',
          content: item.text
        }))
      })
    });
  } catch {
    return {
      success: false,
      error: 'The live reasoning backend is not reachable right now.',
      suggestion: 'I can still use the local engineering solver for calculations.'
    };
  }

  const data = await response.json().catch(() => ({
    success: false,
    error: 'I could not read the live response, so I will use the local engineering solver instead.'
  }));

  if (!response.ok || !data.success) {
    return {
      success: false,
      error: data.error || 'The AI backend is unavailable.',
      suggestion: data.suggestion,
      fallbackMessage: data.fallback_message,
      errorCode: data.error_code,
      retryAfterSeconds: data.retry_after_seconds
    };
  }

  return data;
}

/**
 * Generic AI call function for orchestrator
 * @param {string} provider - AI provider
 * @param {string} prompt - Prompt text
 * @param {Object} context - Additional context
 * @returns {Object} - AI response
 */
export async function callAI(provider, prompt, context = {}) {
  const { domain = 'General' } = context;
  
  const response = await chatWithEngineeringBrain({
    message: prompt,
    domain,
    provider,
    conversationHistory: []
  });
  
  return response;
}

export async function fetchProviders() {
  const response = await fetch('/api/providers');
  if (!response.ok) throw new Error('Could not load LLM providers.');
  return response.json();
}
