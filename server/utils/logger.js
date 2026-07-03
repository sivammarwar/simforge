import fs from 'node:fs';
import path from 'node:path';

const logDir = path.resolve('logs');
const logFile = path.join(logDir, 'app.log');

export function log(level, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };

  console.log(`[${entry.timestamp}] [${level}] ${message}`, metadata);

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  } catch {
    // Logging must never break user requests.
  }
}

export const logger = {
  info: (message, metadata) => log('INFO', message, metadata),
  warn: (message, metadata) => log('WARN', message, metadata),
  error: (message, metadata) => log('ERROR', message, metadata)
};
