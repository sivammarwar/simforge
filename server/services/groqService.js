import Groq from 'groq-sdk';
import { handleGroqError } from './errorHandler.js';

export default class GroqService {
  constructor(apiKey, options = {}) {
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      throw new Error('Missing GROQ_API_KEY. Add it to .env before starting the API server.');
    }

    this.client = new Groq({ apiKey });
    this.model = options.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    this.maxTokens = Number.parseInt(options.maxTokens || process.env.GROQ_MAX_TOKENS || '2048', 10);
    this.temperature = Number.parseFloat(options.temperature || process.env.GROQ_TEMPERATURE || '0.3');
  }

  async chat(systemPrompt, userMessage, conversationHistory = []) {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...normalizeHistory(conversationHistory),
        { role: 'user', content: userMessage }
      ];

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        top_p: 0.95,
        stream: false
      });

      return {
        success: true,
        message: response.choices?.[0]?.message?.content || '',
        tokens_used: response.usage?.total_tokens || 0,
        model: this.model,
        provider: 'groq',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const mapped = handleGroqError(error);
      return {
        success: false,
        ...mapped
      };
    }
  }

  async validateConnection(systemPrompt) {
    const response = await this.chat(systemPrompt, 'Reply with exactly: SimForge Groq OK', []);
    return response.success;
  }

  getModelInfo() {
    return {
      provider: 'Groq',
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      costTier: 'FREE',
      speedRating: 'FAST',
      capabilities: ['Circuits', 'Structures', 'Thermal', 'Aerodynamics', 'Control', 'Materials', 'Power Systems']
    };
  }
}

function normalizeHistory(history) {
  return history
    .filter(item => item && item.content)
    .slice(-8)
    .map(item => ({
      role: item.role === 'assistant' || item.sender === 'ai' ? 'assistant' : 'user',
      content: String(item.content || item.text || '').slice(0, 5000)
    }));
}
