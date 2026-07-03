const cache = new Map();

export function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expires_at && Date.now() > item.expires_at) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

export function setCache(key, value, ttlMs = 300_000) {
  cache.set(key, {
    value,
    expires_at: ttlMs ? Date.now() + ttlMs : null
  });
}

export function cacheKeyFromPayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

