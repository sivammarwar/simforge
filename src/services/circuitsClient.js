/**
 * Circuits Domain Client (NEW ARCHITECTURE)
 * ============================================
 * Replaces, for the Circuits domain ONLY:
 *   - domains/circuits/classifier.js   (keyword-matching circuit type detection)
 *   - domains/circuits/netlister.js    (per-circuit-type hardcoded SPICE generation)
 *   - domains/circuits/schematicGenerator.js (per-circuit-type hardcoded SVG)
 *   - the circuits-specific branches in solvers.js (solveVoltageDivider,
 *     solveRCFilter, solveCircuits — the hand-derived analytic formulas)
 *
 * All other domains (Structural, Thermal, Fluids, Aerospace, Control,
 * Materials, Power, Physics, Semiconductors) are UNCHANGED and continue to
 * use domainPipeline.js / solvers.js exactly as before. This file only
 * plugs into the Circuits branch of App.jsx's handleSendMessage.
 *
 * One backend call does classification + parameter extraction + netlist
 * generation + simulation + schematic, so the frontend just needs to POST
 * the question and render the standardized result it gets back.
 */

/**
 * Solve a circuits question end-to-end via the new AI-netlist pipeline.
 * @param {string} question - Natural language circuit question
 * @param {string} provider - AI provider ('groq', 'openai', etc.)
 * @returns {Promise<Object>} - Standardized solver result (see backend
 *   orchestrator.py:to_standardized_result), shaped like every other
 *   domain's solver output so ResultsPane / plotFactory need no special-casing:
 *   {
 *     domain: 'Circuits',
 *     system_type, solver_name, status,
 *     metrics: [{name, value}],
 *     time_series: {t, V_<node>...} | null,
 *     frequency_response: {freq, mag, phase} | null,
 *     visualization_type,
 *     netlist,            // the unified netlist, for display/debugging
 *     schematic_svg,      // ready-to-render SVG markup string
 *     schematic_error,    // present if schematic rendering failed
 *     assumptions,
 *     plain_summary
 *   }
 */
export async function solveCircuitQuestion(question, provider = 'groq') {
  const response = await fetch('/api/circuits/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, provider })
  });

  const data = await response.json().catch(() => null);

  console.log('[Circuits Client] Backend response:', data);
  console.log('[Circuits Client] Backend result details:', data?.result);

  if (!response.ok || !data || !data.success) {
    // BUGFIX: FastAPI wraps HTTPException's `detail` payload inside a
    // {"detail": {...}} envelope — it does NOT put custom fields like
    // "error"/"stage" at the top level. Our own route now returns a flat
    // body on purpose (see api_routes.py), but built-in FastAPI request
    // validation errors (e.g. malformed JSON body) still use the native
    // {"detail": ...} shape. Check both so real errors are never silently
    // swallowed into a generic "Backend returned <status>" message again.
    const detail = data?.detail;
    const errorMsg =
      data?.error ||
      (typeof detail === 'string' ? detail : detail?.error) ||
      `Backend returned ${response.status}`;
    const stage =
      data?.stage ||
      (typeof detail === 'object' ? detail?.stage : null) ||
      'unknown';

    console.error('[Circuits Client] Solve failed:', { stage, errorMsg, rawResponse: data });
    throw new Error(`Circuit solve failed at stage '${stage}': ${errorMsg}`);
  }

  return data.result;
}

/**
 * Detect (cheaply, client-side, no AI call) whether a question is plausibly
 * about circuits, purely so App.jsx can route to this pipeline instead of
 * the other domains' pipeline. This is intentionally coarse — it only
 * needs to be good enough to pick the right backend route. The backend's
 * AI call does the real, authoritative classification and never trusts
 * this client-side guess for anything beyond routing.
 * @param {string} question
 * @returns {boolean}
 */
export function looksLikeCircuitsQuestion(question) {
  const lower = question.toLowerCase();
  return /\b(resistor|capacitor|inductor|diode|transistor|op-?amp|voltage|current|circuit|netlist|spice|ngspice|filter|divider|converter|amplifier|impedance|ohm|farad|henry)\b/.test(
    lower
  );
}
