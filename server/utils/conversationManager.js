export default class ConversationManager {
  constructor(maxTokens = 2048, summarizeThreshold = 1500) {
    this.history = [];
    this.maxTokens = maxTokens;
    this.summarizeThreshold = summarizeThreshold;
  }

  addMessage(role, content) {
    this.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      tokens: this.estimateTokens(content)
    });
    this.truncateIfNeeded();
  }

  estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
  }

  getTotalTokens() {
    return this.history.reduce((sum, item) => sum + item.tokens, 0);
  }

  truncateIfNeeded() {
    if (this.getTotalTokens() <= this.summarizeThreshold) return;
    this.history = this.history.length > 6
      ? [this.history[0], ...this.history.slice(-5)]
      : this.history.slice(-6);
  }

  getHistory() {
    return this.history.map(({ role, content }) => ({ role, content }));
  }
}
