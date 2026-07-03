export function parseCalculixDat(dat = '') {
  return {
    hasDisplacement: /\bdisplacements\b/i.test(dat),
    hasStress: /\bstresses\b|\bsxx\b|\bvon mises\b/i.test(dat),
    rawTail: String(dat).slice(-4000)
  };
}

