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
  console.log('[FLOW TRACE] 2/9 circuitsClient.js — POST /api/circuits/solve', { question: question.slice(0, 80), provider });
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
 * Convert a Seemulator contract event into the legacy stage-based event shape
 * that App.jsx already consumes. This lets us adopt the new contract on the
 * backend without replacing the entire frontend.
 */
function _normalizeContractEvent(name, payload) {
  switch (name) {
    case 'stage': {
      const key = payload?.key;
      const label = payload?.label || key;
      switch (key) {
        case 'classify':
          return { stage: 'call1', status: 'done', detail: label };
        case 'tool_select':
          return { stage: 'tool_select', status: 'done', tool: label };
        case 'input_generation':
          return { stage: 'input_generation', status: 'done', system_type: label };
        case 'validation':
          return { stage: 'validation', status: 'done', detail: label };
        case 'execution':
          return { stage: 'execution', status: 'done', tool: label };
        case 'parsing':
          return { stage: 'schematic', status: 'done' };
        case 'proof_of_work':
          return { stage: 'proof_of_work', status: 'done', detail: label };
        case 'explanation':
          return { stage: 'answer_generation', status: 'start', detail: label };
        default:
          return { stage: key, status: 'done', label };
      }
    }
    case 'routed':
      return {
        stage: 'classification',
        status: 'done',
        sub_domain: payload?.sub_domain,
        tool: payload?.tools?.[0],
        verified: payload?.verified,
      };
    case 'model':
      // New event: App.jsx must handle this explicitly.
      return { stage: 'model', input_file: payload?.input_file, parameters: payload?.parameters };
    case 'result':
      return { stage: 'final_result', result: payload };
    case 'token':
      return { stage: 'answer_chunk', text: payload?.text };
    case 'done':
      // The contract uses `data: [DONE]` as the done marker.
      return { stage: 'answer_done' };
    case 'error':
      return { stage: 'error', error: payload?.message || 'Unknown error' };
    default:
      return null;
  }
}


/**
 * Stream a circuits question via the Seemulator contract SSE endpoint.
 * Calls onEvent(stageData) for every real backend event as it arrives,
 * and resolves with the final standardized result (same shape as
 * solveCircuitQuestion's return value).
 *
 * @param {string} question
 * @param {string} provider
 * @param {(event: object) => void} onEvent — called for each SSE event
 * @param {object} options — Seemulator contract context fields
 * @returns {Promise<object>} — the final standardized result
 */
export async function solveCircuitQuestionStream(question, provider = 'groq', onEvent = () => {}, options = {}) {
  const {
    history = [],
    activeInputFile = null,
    parameters = [],
    rerun = false,
    subDomain = null,
    inputFile = null,
  } = options;

  console.log('[FLOW TRACE] circuitsClient.js — POST /api/circuits/solve/stream', {
    question: question.slice(0, 80),
    provider,
    rerun,
    subDomain,
    parameterCount: parameters.length,
    historyLength: history.length,
  });

  const response = await fetch('/api/circuits/solve/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      provider,
      history,
      active_input_file: activeInputFile,
      parameters,
      rerun,
      sub_domain: subDomain,
      input_file: inputFile,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`Circuit stream failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;
  let answerText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE blocks are separated by double newlines. Each block may contain
    // multiple lines; we parse `event:` and `data:` per the Seemulator contract.
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const lines = block.split('\n');
      let eventName = 'message';
      let dataStr = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
      }
      if (!dataStr) continue;

      let payload;
      if (dataStr === '[DONE]') {
        payload = '[DONE]';
      } else {
        try {
          payload = JSON.parse(dataStr);
        } catch {
          continue;
        }
      }

      const event = _normalizeContractEvent(eventName, payload);
      if (!event) continue;

      if (event.stage === 'final_result') {
        finalResult = event.result;
      } else if (event.stage === 'answer_chunk') {
        answerText += event.text || '';
      } else if (event.stage === 'answer_done') {
        answerText = event.full_text || answerText;
      }

      onEvent(event);
    }
  }

  if (finalResult && finalResult.success !== false) {
    finalResult._structured_answer = answerText;
  }

  return finalResult;
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
  return /\b(resistor|capacitor|inductor|diode|transistor|op-?amp|voltage|current|circuit|netlist|spice|ngspice|filter|divider|converter|amplifier|impedance|ohm|farad|henry|transfer function|symbolic|laplace|s-domain|pole|zero|root locus|bode|frequency response|rc|rl|rlc|truth table|boolean|logic gate|nand|nor|xor|k-map|flip.?flop|mux|decoder|adder|counter|binary|vcd|waveform|jk|dff|register|clock|sequential|fft|convolution|numerical integration|simpson|ode|ordinary differential|differential equation|optimization|fir|iir|pid|step response|stability|gain margin|phase margin|feedback|closed loop|s-parameter|smith chart|transmission line|antenna|microwave|waveguide|vswr|microstrip|pcb|layout|trace|via|drc|fr4|stackup|gerber|fpga|verilog|vhdl|hdl|lut|synthesis|mosfet|bjt|pn junction|threshold voltage|doping|drain current|parasitic|rc extraction|coupling capacitance|floorplan|lvs|cmos|nmos|pmos|tcad|i-?v|oscillator|wien bridge|colpitts|hartley|crystal|clipper|doubler|rectifier|regulator|zener|common-emitter|bias|sinusoidal|wire delay|physical design|interconnect|propagation delay|elmore|setup time|hold time|clock skew|crosstalk|placement|routing)\b/.test(
    lower
  );
}
