export function parseElmerLog(log = '') {
  return {
    converged: /converged|steady state/i.test(log),
    rawTail: String(log).slice(-4000)
  };
}

