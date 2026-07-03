import fs from 'node:fs/promises';
import path from 'node:path';

const ARTIFACT_ROOT = path.resolve('logs/artifacts');

export async function saveArtifact(name, content) {
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const safeName = String(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filePath = path.join(ARTIFACT_ROOT, `${Date.now()}_${safeName}`);
  await fs.writeFile(filePath, content, 'utf8');
  return { path: filePath, name: safeName };
}

export async function readArtifact(filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ARTIFACT_ROOT)) {
    throw new Error('Artifact path is outside the artifact store.');
  }
  return fs.readFile(resolved, 'utf8');
}

