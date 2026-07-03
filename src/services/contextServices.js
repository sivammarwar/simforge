/**
 * contextServices.js
 * 
 * Production-ready context management inspired by Cursor.
 * Drop-in replacement for your current context handling.
 * 
 * Features:
 * - Embedding-based semantic search (light version without heavy deps)
 * - Token budgeting
 * - Progressive summarization
 * - Multi-model routing
 * - Smart context compression
 */

// ─── SIMPLE EMBEDDING (without external dependencies) ─────────────────
// For production, replace with: sentence-transformers, OpenAI embeddings, or local model
class LightweightEmbedding {
  constructor() {
    this.vectorCache = new Map();
  }

  async embed(text) {
    // Cache hit
    const hash = this.hashText(text);
    if (this.vectorCache.has(hash)) {
      return this.vectorCache.get(hash);
    }

    // Simple heuristic embedding (TF-IDF approximation)
    const vector = this.generateVector(text);
    this.vectorCache.set(hash, vector);
    return vector;
  }

  generateVector(text) {
    // Generate 64-dim vector based on text features
    const vector = new Array(64).fill(0);
    
    // Word frequency
    const words = text.toLowerCase().split(/\s+/).slice(0, 50);
    const wordFreq = {};
    words.forEach(w => {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    });

    // Map word frequencies to vector dimensions
    Object.entries(wordFreq).forEach(([word, freq], idx) => {
      if (idx < 32) {
        vector[idx] = Math.min(freq / 10, 1); // Normalize
      }
    });

    // Character distribution (for structural info)
    const charCodes = text.substring(0, 200).split('');
    charCodes.forEach((char, idx) => {
      if (idx < 32) {
        vector[32 + idx] = char.charCodeAt(0) / 255;
      }
    });

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
  }

  hashText(text) {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    return String(hash);
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    // Vectors already normalized
    return dotProduct;
  }
}

// ─── TOKEN BUDGET MANAGER ─────────────────────────────────────────────
export class TokenBudgetManager {
  constructor(maxTokens = 100000, provider = 'claude') {
    // Provider-specific limits
    const providerLimits = {
      'claude': 100000,
      'groq': 8000,  // Groq has much lower payload limits
      'gemini': 100000,
      'cerebras': 100000
    };
    
    this.maxTokens = providerLimits[provider] || maxTokens;
    this.reservedForResponse = Math.min(2000, this.maxTokens * 0.25);
  }

  // More accurate token estimation
  estimateTokens(text) {
    if (!text) return 0;
    
    // Rule: 1 token ≈ 4 characters
    let estimate = Math.ceil(text.length / 4);
    
    // Adjust for structured content
    if (text.includes('{') || text.includes('}')) {
      estimate = Math.ceil(estimate * 1.4); // JSON is more token-dense
    }
    if (text.includes('[') || text.includes(']')) {
      estimate = Math.ceil(estimate * 1.3); // Arrays too
    }
    
    return estimate;
  }

  allocateBudget() {
    const available = this.maxTokens - this.reservedForResponse;
    
    return {
      systemPrompt: 300,                        // Fixed, compressed, cached
      oldConversationSummary: 500,              // Summarized old messages
      recentConversation: Math.floor(available * 0.35),  // Last 4-5 exchanges
      semanticContext: Math.floor(available * 0.40),     // Relevant files/models
      modelState: Math.floor(available * 0.15),          // Current model
      buffer: Math.floor(available * 0.05)               // Safety margin
    };
  }

  checkFit(components) {
    const budget = this.allocateBudget();
    let totalTokens = 0;
    const breakdown = {};

    Object.entries(components).forEach(([key, value]) => {
      const tokens = typeof value === 'string' 
        ? this.estimateTokens(value)
        : this.estimateTokens(JSON.stringify(value));
      
      breakdown[key] = tokens;
      totalTokens += tokens;
    });

    return {
      totalTokens,
      budget,
      breakdown,
      usage: Object.entries(breakdown).reduce((acc, [k, v]) => ({
        ...acc,
        [k]: { tokens: v, percent: ((v / totalTokens) * 100).toFixed(1) }
      }), {}),
      isFeasible: totalTokens <= this.maxTokens,
      compressionNeeded: Math.max(0, totalTokens - this.maxTokens),
      availableForMoreContext: this.maxTokens - totalTokens
    };
  }

  // Prioritize context within budget
  fitContent(items, budgetTokens) {
    const sorted = items.sort((a, b) => b.priority - a.priority);
    const result = [];
    let used = 0;

    for (const item of sorted) {
      const tokens = this.estimateTokens(item.content);
      if (used + tokens <= budgetTokens) {
        result.push(item);
        used += tokens;
      } else {
        // Try to partially include high-priority item
        if (result.length === 0 && item.priority > 0.8) {
          const truncated = item.content.substring(0, item.content.length * (budgetTokens / tokens));
          result.push({ ...item, content: truncated, truncated: true });
          break;
        }
      }
    }

    return { items: result, tokensUsed: used };
  }
}

// ─── SMART CONTEXT SELECTOR ───────────────────────────────────────────
export class SmartContextSelector {
  constructor() {
    this.embedding = new LightweightEmbedding();
    this.messageCache = [];
    this.modelStateHistory = [];
    this.MAX_CACHED_ITEMS = 200;
  }

  async selectRelevantContext(userQuery, maxTokens = 45000) {
    // 1. Embed user query
    const queryEmbedding = await this.embedding.embed(userQuery);

    // 2. Score messages by relevance
    const scoredMessages = this.messageCache.map(msg => ({
      ...msg,
      similarity: this.embedding.cosineSimilarity(queryEmbedding, msg.embedding)
    }));

    // 3. Score model states by relevance
    const scoredModels = this.modelStateHistory.map(state => ({
      ...state,
      similarity: this.embedding.cosineSimilarity(queryEmbedding, state.embedding)
    }));

    // 4. Select top matches
    const topMessages = scoredMessages
      .sort((a, b) => b.similarity - a.similarity)
      .filter(msg => msg.similarity > 0.3)
      .slice(0, 15);

    const topModels = scoredModels
      .sort((a, b) => b.similarity - a.similarity)
      .filter(state => state.similarity > 0.4)
      .slice(0, 5);

    // 5. Construct context respecting budget
    return this.constructContext(
      topMessages,
      topModels,
      userQuery,
      maxTokens
    );
  }

  async addMessage(message) {
    const embedding = await this.embedding.embed(message.text);
    
    this.messageCache.push({
      id: message.id,
      text: message.text,
      embedding,
      timestamp: message.timestamp,
      sender: message.sender,
      tokens: new TokenBudgetManager().estimateTokens(message.text),
      importance: this.rateImportance(message.text)
    });

    // Keep cache bounded
    if (this.messageCache.length > this.MAX_CACHED_ITEMS) {
      this.pruneCache();
    }
  }

  async addModelState(model, domain) {
    const summary = this.summarizeModel(model, domain);
    const embedding = await this.embedding.embed(summary);

    this.modelStateHistory.push({
      id: `model-${Date.now()}`,
      model,
      summary,
      embedding,
      domain,
      timestamp: Date.now(),
      tokens: new TokenBudgetManager().estimateTokens(JSON.stringify(model)),
      importance: 0.7
    });

    if (this.modelStateHistory.length > 50) {
      this.pruneCache('models');
    }
  }

  summarizeModel(model, domain) {
    if (!model) return '';

    const params = [];
    Object.entries(model || {}).forEach(([section, fields]) => {
      if (typeof fields === 'object' && fields !== null && section !== 'META') {
        Object.entries(fields).forEach(([name, field]) => {
          if (field?.tag === 'stated' || field?.tag === 'confirmed') {
            const val = field?.value || field;
            params.push(`${name}=${val}`);
          }
        });
      }
    });

    return `[${domain}] ${model.SYSTEM_TYPE || 'Model'}: ${params.slice(0, 8).join(', ')}`;
  }

  constructContext(messages, models, query, tokenBudget) {
    const tokenMgr = new TokenBudgetManager();
    const budget = tokenMgr.allocateBudget();
    
    let context = '';
    let tokensUsed = 0;
    const sources = [];

    // Priority 1: Recent context (preserve conversation flow)
    const recentTokenBudget = budget.recentConversation;
    for (const msg of messages.slice(0, 8)) {
      const tokens = msg.tokens;
      if (tokensUsed + tokens > recentTokenBudget) break;
      
      context += `\n[${msg.timestamp}] ${msg.sender}: ${msg.text}`;
      tokensUsed += tokens;
      sources.push({ type: 'message', id: msg.id, similarity: msg.similarity });
    }

    // Priority 2: Relevant model states
    const modelTokenBudget = budget.modelState;
    let modelTokensUsed = 0;
    for (const model of models) {
      const tokens = Math.min(model.tokens / 3, modelTokenBudget / models.length);
      if (modelTokensUsed + tokens > modelTokenBudget) break;
      
      context += `\n[Model] ${model.summary}`;
      modelTokensUsed += tokens;
      tokensUsed += tokens;
      sources.push({ type: 'model', id: model.id, similarity: model.similarity });
    }

    return {
      context,
      tokensUsed,
      tokensRemaining: tokenBudget - tokensUsed,
      sourceCount: sources.length,
      sources
    };
  }

  rateImportance(text) {
    // Higher score = more important
    let score = 0;
    
    if (text.includes('Error') || text.includes('CRITICAL')) score += 2;
    if (text.includes('solver') || text.includes('run')) score += 1;
    if (text.includes('design') || text.includes('optimize')) score += 1;
    if (text.includes('trade-off')) score += 1.5;
    
    return Math.min(score, 2.0);
  }

  pruneCache(type = 'messages') {
    const now = Date.now();
    const ONE_HOUR = 3600000;

    if (type === 'messages') {
      // Keep: recent OR high-importance
      this.messageCache = this.messageCache.filter(msg => {
        const age = now - new Date(msg.timestamp).getTime();
        return age < ONE_HOUR || msg.importance > 1.0;
      });
    } else if (type === 'models') {
      // Keep recent models only
      this.modelStateHistory = this.modelStateHistory
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);
    }
  }
}

// ─── PROGRESSIVE SUMMARIZER ────────────────────────────────────────────
export class ProgressiveSummarizer {
  buildRollingSummary(messages, recentWindowMins = 30) {
    const now = Date.now();
    const cutoff = now - (recentWindowMins * 60000);

    const recent = messages.filter(m => 
      new Date(m.timestamp).getTime() > cutoff
    );

    const old = messages.filter(m => 
      new Date(m.timestamp).getTime() <= cutoff
    );

    if (old.length === 0) return { recent, summary: null };

    // Extract key points from old messages
    const keyPoints = this.extractKeyPoints(old);
    
    const summary = {
      messageCount: old.length,
      keyPoints,
      timeSpan: `${old[0]?.timestamp} to ${old[old.length - 1]?.timestamp}`,
      text: this.formatSummary(keyPoints, old.length)
    };

    return { recent, summary };
  }

  extractKeyPoints(messages) {
    const points = new Set();

    messages.forEach(msg => {
      const text = msg.text;

      // Parameter assignments (look for **param** = value)
      const paramMatches = text.match(/\*\*([^*]+)\*\*.*?(?:=|:)\s*([^\n,]+)/g);
      if (paramMatches) {
        paramMatches.forEach(match => points.add(match.substring(0, 60)));
      }

      // Solver runs
      if (text.includes('Running simulation') || text.includes('solver')) {
        points.add('Simulation executed');
      }

      // Critical errors
      if (text.includes('Error') || text.includes('CRITICAL')) {
        const errorSnippet = text.match(/Error[^.]*\.?/)?.[0] || 'Error occurred';
        points.add('⚠️ ' + errorSnippet.substring(0, 50));
      }

      // Design decisions
      if (text.includes('TRIZ') || text.includes('principle')) {
        const principle = text.match(/Principle\s*(\d+)[^.]*\.?/)?.[0] || 'Design principle applied';
        points.add(principle);
      }
    });

    return Array.from(points).slice(0, 5);
  }

  formatSummary(keyPoints, messageCount) {
    if (keyPoints.length === 0) {
      return `Previous context: ${messageCount} messages (summary not available)`;
    }

    return `Previous context (${messageCount} messages): ${keyPoints.join(' • ')}`;
  }
}

// ─── INTELLIGENT MODEL ROUTER ──────────────────────────────────────────
export class IntelligentModelRouter {
  selectModel(userQuery, contextSize, tokenBudget, provider) {
    // Only route between Claude models if provider is 'claude'
    // Otherwise, use the selected provider's default model
    if (provider !== 'claude') {
      return {
        model: null, // Use provider's default model
        maxTokens: 20000,
        temperature: 0.3,
        reason: `Using ${provider} provider's default model`,
        complexity: 'unknown',
        contextSize,
        tokenBudget
      };
    }

    const complexity = this.analyzeComplexity(userQuery);

    // Decision matrix for Claude models
    const configs = {
      simple: {
        model: 'claude-3-5-haiku-20241022',
        maxTokens: 4000,
        temperature: 0.3,
        reason: 'Fast model for simple queries'
      },
      medium: {
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 20000,
        temperature: 0.3,
        reason: 'Balanced performance for engineering work'
      },
      complex: {
        model: 'claude-opus-4-6',
        maxTokens: 100000,
        temperature: 0.4,
        reason: 'Complex reasoning with full context'
      }
    };

    let selectedComplexity = complexity;

    // Override based on constraints
    if (contextSize < 5000 && complexity !== 'complex') {
      selectedComplexity = 'simple'; // Small context = fast model
    }
    if (contextSize > 50000) {
      selectedComplexity = 'complex'; // Large context = capable model
    }
    if (tokenBudget < 10000) {
      selectedComplexity = 'simple'; // Low budget = economical
    }

    return {
      ...configs[selectedComplexity],
      complexity,
      contextSize,
      tokenBudget
    };
  }

  analyzeComplexity(query) {
    let score = 0;
    const lower = query.toLowerCase();

    // Complexity indicators
    const complexKeywords = {
      simple: ['what', 'is', 'how much', 'calculate'],
      medium: ['design', 'compare', 'trade-off', 'improve'],
      complex: ['optimize', 'multi-objective', 'triz', 'architecture', 'contradiction']
    };

    score += complexKeywords.simple.filter(kw => lower.includes(kw)).length * 1;
    score += complexKeywords.medium.filter(kw => lower.includes(kw)).length * 2;
    score += complexKeywords.complex.filter(kw => lower.includes(kw)).length * 3;

    // Multi-domain
    const domains = ['circuit', 'structural', 'thermal', 'fluid', 'semiconductor', 'aerospace'];
    const domainCount = domains.filter(d => lower.includes(d)).length;
    if (domainCount > 1) score += 2;

    // Mathematical operations
    if (/[\+\-\*\/\=\>\<]/.test(query)) score += 1;

    // Length (longer = might be complex)
    if (query.length > 200) score += 1;

    if (score >= 6) return 'complex';
    if (score >= 3) return 'medium';
    return 'simple';
  }
}

// ─── CONTEXT BUILDER (Main orchestrator) ───────────────────────────────
export class OptimizedContextBuilder {
  constructor() {
    this.tokenBudget = new TokenBudgetManager(100000);
    this.contextSelector = new SmartContextSelector();
    this.summarizer = new ProgressiveSummarizer();
    this.modelRouter = new IntelligentModelRouter();
  }

  async buildContext(userQuery, allMessages, currentModel, domain, provider = 'claude') {
    // Update token budget for provider
    this.tokenBudget = new TokenBudgetManager(100000, provider);
    
    // 1. Summarize old messages
    const { recent, summary } = this.summarizer.buildRollingSummary(allMessages, 30);

    // 2. Select relevant context
    const contextLimit = provider === 'groq' ? 1000 : 45000; // Much lower for Groq
    const relevantContext = await this.contextSelector.selectRelevantContext(
      userQuery,
      contextLimit
    );

    // 3. Add current message to cache
    await this.contextSelector.addMessage({
      id: `m-${Date.now()}`,
      text: userQuery,
      timestamp: new Date().toISOString(),
      sender: 'user'
    });

    // 4. Add model to cache
    if (currentModel) {
      await this.contextSelector.addModelState(currentModel, domain);
    }

    // 5. Estimate tokens
    const budgetCheck = this.tokenBudget.checkFit({
      systemPrompt: 'compressed-prompt', // 250 tokens
      summary: summary ? summary.text : '',
      recentMessages: recent.map(m => m.text).join('\n'),
      context: relevantContext.context,
      modelState: currentModel ? JSON.stringify(currentModel) : ''
    });

    // 6. Select model based on complexity (only for Claude provider)
    const modelConfig = this.modelRouter.selectModel(
      userQuery,
      relevantContext.context.length,
      budgetCheck.availableForMoreContext,
      domain // Using domain as proxy for provider - will be overridden in App
    );

    return {
      systemPrompt: 'compressed-prompt',
      oldSummary: summary?.text || null,
      recentMessages: recent,
      relevantContext: relevantContext.context,
      modelState: currentModel,
      budget: budgetCheck,
      modelConfig,
      sources: relevantContext.sources,
      totalTokensEstimate: budgetCheck.totalTokens
    };
  }
}

// ─── EXPORT ALL ───────────────────────────────────────────────────────
export default {
  TokenBudgetManager,
  SmartContextSelector,
  ProgressiveSummarizer,
  IntelligentModelRouter,
  OptimizedContextBuilder
};
