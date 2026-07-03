import GroqService from './groqService.js';

export function createProvider(provider = 'groq') {
  switch (provider.toLowerCase()) {
    case 'groq':
      return new GroqService(process.env.GROQ_API_KEY);
    case 'claude':
      throw new Error('Claude integration coming soon. Please use Groq.');
    case 'gpt':
      throw new Error('GPT integration coming soon. Please use Groq.');
    case 'gemini':
      throw new Error('Gemini integration coming soon. Please use Groq.');
    default:
      return new GroqService(process.env.GROQ_API_KEY);
  }
}

export function getAvailableProviders() {
  return {
    active: [
      {
        name: 'Groq',
        key: 'groq',
        status: 'ACTIVE',
        cost: 'FREE',
        speed: 'FAST',
        recommended: true
      }
    ],
    coming_soon: [
      { name: 'Claude', key: 'claude', status: 'COMING_SOON', cost: 'Paid', speed: 'Fast', eta: 'Q2 2026' },
      { name: 'GPT', key: 'gpt', status: 'COMING_SOON', cost: 'Paid', speed: 'Fast', eta: 'Q2 2026' },
      { name: 'Gemini', key: 'gemini', status: 'COMING_SOON', cost: 'Paid', speed: 'Fast', eta: 'Q3 2026' }
    ]
  };
}
