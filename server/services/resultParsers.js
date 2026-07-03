export function parseNgspiceOperatingPoint(log = '') {
  const vout = matchNumber(log, /v\(out\)\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  const current = matchNumber(log, /i\(v1\)\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i)
    ?? matchNumber(log, /v1#branch\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  return { vout, current };
}

export function parseNgspiceMeasurements(log = '') {
  return {
    vout_avg: matchNumber(log, /vout_avg\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i),
    vout_max: matchNumber(log, /vout_max\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i),
    vout_min: matchNumber(log, /vout_min\s*=\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i)
  };
}

export function parseXfoilPolar(text = '') {
  return text
    .split('\n')
    .map(line => line.trim().split(/\s+/).map(Number))
    .filter(row => row.length >= 5 && row.every(Number.isFinite))
    .map(([alpha, cl, cd, cdp, cm]) => ({ alpha, cl, cd, cdp, cm }));
}

export function parseJsonLine(stdout = '') {
  const line = stdout.trim().split('\n').find(item => item.trim().startsWith('{'));
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function matchNumber(text, regex) {
  const match = String(text).match(regex);
  return match ? Number.parseFloat(match[1]) : null;
}
