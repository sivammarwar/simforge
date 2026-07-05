/**
 * trizDomainVocabulary.js — Domain language -> TRIZ parameter mapping
 *
 * PROBLEM THIS SOLVES:
 * The original triz.js hand-wrote ~12 fully bespoke contradiction objects
 * (one scenario per domain, mostly). That tops out fast: every new kind of
 * trade-off needs a brand-new hand-authored object with its own keyword
 * lists, statement text, and principle write-ups. It cannot generalize to
 * problem #500 or #1000 unless someone manually writes problem #500.
 *
 * INSTEAD: each domain gets a vocabulary map — a list of (TRIZ parameter
 * number, the words/phrases that signal it in THIS domain's language).
 * Detection becomes: "which two parameters does this sentence touch?" ->
 * look up that exact pair in the real 39x39 matrix (trizKnowledge.js) ->
 * get back historically-grounded, real principle numbers.
 *
 * This scales combinatorially: the Circuits domain's ~10 parameters already
 * covers the vast majority of (improving, worsening) pairs a real circuits
 * engineering question can express, without writing new code per scenario.
 * New scenarios are handled automatically as long as the words used map to
 * a parameter already in the vocabulary — which is far more durable than
 * matching one scenario's exact phrasing.
 *
 * Each parameter mapping carries:
 *   - param: the TRIZ parameter number (1-39) this maps to
 *   - terms: words/phrases in THIS domain that signal that parameter
 *   - industrialNote: a domain-specific reminder of what to check
 *     numerically when this parameter is involved (keeps the
 *     "trustable to engineers" bar — concrete, checkable, not just prose)
 */

const dv = (param, terms, industrialNote) => ({ param, terms, industrialNote });

export const DOMAIN_VOCABULARY = {
  Circuits: [
    dv(11, ['ripple', 'ripple voltage', 'noise', 'stability', 'regulation', 'load regulation'],
      'Quantify ripple as peak-to-peak and as % of nominal output; check against the datasheet/spec limit, not a feeling of "too noisy".'),
    dv(7, ['size', 'volume', 'footprint', 'large', 'bulky', 'compact', 'small'],
      'State the actual board area or component volume (mm³/mm²) before and after — "smaller" is not a verifiable claim without it.'),
    dv(22, ['loss', 'efficiency', 'switching loss', 'conduction loss', 'power loss'],
      'Break total loss into conduction + switching + magnetic/core loss separately; a single aggregate efficiency number hides which term dominates.'),
    dv(17, ['heat', 'temperature', 'thermal', 'hot', 'overheat'],
      'Check junction/case temperature against the component\'s absolute maximum rating with margin, not just "it feels warm".'),
    dv(9, ['speed', 'switching frequency', 'fast', 'slew rate', 'bandwidth'],
      'Confirm the controller/compensation loop is still stable at the new switching frequency before claiming the change is free.'),
    dv(27, ['reliability', 'lifetime', 'stress', 'derating', 'mtbf'],
      'Check component stress (voltage, current, thermal) against datasheet derating guidelines, not just nominal operating point.'),
    dv(14, ['accuracy', 'precision', 'tolerance', 'accurate'],
      'State the accuracy requirement as a numeric tolerance (e.g. ±1%) and verify worst-case component tolerance stack-up meets it.'),
    dv(21, ['current draw', 'power draw', 'quiescent current', 'battery drain'],
      'Quantify current draw at the actual operating point, not just "low power" — battery life depends on the real number.'),
    dv(36, ['complexity', 'parts count', 'bom', 'component count'],
      'Count added components/interfaces explicitly; complexity has a real reliability and cost cost, not just an aesthetic one.'),
    dv(33, ['manufacturability', 'assembly', 'soldering', 'layout'],
      'Check footprint/clearance/thermal-via rules against the actual PCB manufacturing capability, not an idealized layout.')
  ]
};

/**
 * Resolve free text against a domain's vocabulary list, returning every
 * parameter that has at least one matched term, with the matched terms
 * kept for evidence/transparency.
 *
 * @param {string} lowerText - already-lowercased input text
 * @param {string} domain - domain key in DOMAIN_VOCABULARY
 * @returns {Array<{param:number, matchedTerms:string[], industrialNote:string}>}
 */
export function matchVocabulary(lowerText, domain) {
  const list = DOMAIN_VOCABULARY[domain] || [];
  const hits = [];
  for (const entry of list) {
    const matched = entry.terms.filter((term) => lowerText.includes(term.toLowerCase()));
    if (matched.length > 0) {
      hits.push({ param: entry.param, matchedTerms: matched, industrialNote: entry.industrialNote });
    }
  }
  return hits;
}

export function getDomainVocabulary(domain) {
  return DOMAIN_VOCABULARY[domain] || [];
}

export function getAllDomains() {
  return Object.keys(DOMAIN_VOCABULARY);
}
