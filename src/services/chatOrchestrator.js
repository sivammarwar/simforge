// import { createWorkflowIntent, intentToActions } from './workflowController.js'; // File not found - disabled during migration

import { classifyDomain } from './aiOrchestrator.js';

// ─── SMART CONVERSATIONAL ROUTER ──────────────────────────────────────────
// Runs before the heavy solver pipeline. Decides: smalltalk, a personal aside,
// a real NEW engineering question, a follow-up question about the CURRENT
// session's model/results, or a mix of these in one message.

const FAST_SMALLTALK_PATTERN = /^(hi+|hii+|hello+|hey+|yo+|sup|what'?s up|wassup|namaste|hola|gm|good morning|good evening|good afternoon|thanks|thank you|ty|cool|ok|okay|nice|great|awesome|bye|goodbye|see ya)[!.?\s]*$/i;

export function fastSmalltalkReply(promptText) {
  const text = String(promptText || '').trim();
  if (!text || !FAST_SMALLTALK_PATTERN.test(text)) return null;
  if (/thanks|thank you|ty|cool|ok|okay|nice|great|awesome/i.test(text)) {
    return `You got it. Toss me the next engineering problem whenever you're ready.`;
  }
  if (/bye|goodbye|see ya/i.test(text)) {
    return `Catch you later. Come back whenever you've got something to simulate.`;
  }
  return `Hey! I'm Seemulator's reasoning engine — give me an engineering system, a question, or even a rough idea and I'll model it, solve it, and walk you through the math.`;
}

// Local, no-network heuristic for spotting "follow-up about what we already have"
// messages — short questions that reference the current model/results rather than
// describing a brand-new system to formulate. Used both to steer the LLM router
// (via the prompt) and as the offline fallback when the router call fails.
const FOLLOWUP_HINT_PATTERN = /\b(that|this|it|we (got|found|calculated|computed)|the (result|value|answer|number|output|metric|filter|circuit|model|cutoff|ripple|current|voltage|resistance|frequency|response)s?|what (was|is|did)|earlier|previous|last (run|result|value)|again|instead|now (check|make|change|try))\b/i;

function looksLikeFollowup(promptText) {
  const text = String(promptText || '').trim();
  if (!text) return false;
  // Short, question-shaped, and references something already established.
  return FOLLOWUP_HINT_PATTERN.test(text);
}

const INTENT_CLASSIFIER_PROMPT = `You are the intent router for an engineering simulation assistant called Seemulator.
Classify the LATEST user message given the recent conversation and the current session state. Respond with ONLY this JSON, nothing else:

{
  "intent": "smalltalk" | "personal" | "engineering" | "followup" | "mixed",
  "personal_reply": "<if intent is personal or mixed: a short, warm, human, NON-technical reply to the personal part. null otherwise>",
  "engineering_part": "<if intent is mixed: the isolated engineering question text, extracted verbatim from the message, to hand to the solver. If intent is engineering: repeat the original message unchanged. null otherwise>"
}

Rules:
- "smalltalk": greetings, thanks, filler — no real question.
- "personal": a question about the assistant itself, general knowledge trivia, or casual chat, with NO engineering content and NO reference to the current session's model/results (e.g. "how are you", "who made you", "who is the president of india").
- "engineering": a genuine NEW technical/engineering/simulation request that describes (or changes) a system to formulate and possibly solve. This includes circuits in the broadest sense — analog (SPICE/netlists, filters, amplifiers), digital logic (boolean algebra, K-maps, truth tables, logic gates, flip-flops, HDL/Verilog), control systems (transfer functions, PID, Bode/root-locus, state-space, stability margins), and numerical processing (FFT, convolution, optimization, numerical integration) — as well as structures, fluids, thermal, materials, aerospace, power systems, and physics/mechanics.
- "followup": a short question that refers back to the model, parameters, or results ALREADY established in this session (e.g. "what's the cutoff frequency we got?", "what was R1 again?", "why is the ripple that high?", "explain that last result"). These do NOT require generating a new input file or re-running the solver — they should be answered directly from the existing results/conversation.
- "mixed": the message contains BOTH a personal aside AND an engineering/followup question in one message.
- If there IS an active session with existing results and the message is ambiguous but references "that", "it", "we got", "the result", etc., prefer "followup" over "personal" or "engineering".
- Never put any engineering content inside "personal_reply".
- Only return the JSON object.`;

export async function classifyMessageIntent(promptText, conversationHistory = [], provider = 'groq', context = {}) {
  const { activeDomain = null, hasResults = false } = context || {};

  const quick = fastSmalltalkReply(promptText);
  if (quick) {
    return { intent: 'smalltalk', personalReply: quick, engineeringPart: null };
  }

  const { callAI } = await import('./llmClient.js');
  const historyBlock = conversationHistory
    .slice(-6)
    .map(item => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  const sessionStateBlock = `Active domain: ${activeDomain || 'none'}\nExisting solver results in this session: ${hasResults ? 'yes' : 'no'}`;

  const fullPrompt = `${INTENT_CLASSIFIER_PROMPT}\n\nSESSION STATE:\n${sessionStateBlock}\n\nRECENT CONVERSATION:\n${historyBlock || '(none)'}\n\nLATEST USER MESSAGE:\n${promptText}`;

  try {
    // NOTE: passing the real content as the 2nd arg (prompt), since callAI's
    // `message` field is sourced from there — see the callAI bug note below.
    const response = await callAI(provider, fullPrompt, { domain: 'General' });
    if (response.error) throw new Error(response.error);
    const text = response.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in intent classification response');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      intent: parsed.intent || 'engineering',
      personalReply: parsed.personal_reply || null,
      engineeringPart: parsed.engineering_part || promptText
    };
  } catch (error) {
    console.warn('[classifyMessageIntent] LLM router failed, using local heuristic fallback:', error.message);

    // BUGFIX: previously this unconditionally returned intent: 'engineering' whenever the
    // LLM router call failed for ANY reason (rate limit, network hiccup, malformed JSON),
    // OR fell all the way through to a generic 'personal' rejection. That rejection message
    // was firing for EVERY message once the router started failing — including legitimate
    // follow-up questions like "what's the cutoff_frequency that we got?" — because the
    // local classifyDomain() keyword matcher has no memory of the current session and found
    // no domain keywords in a short pronoun-heavy follow-up question.
    //
    // Now there are three layers to the offline fallback, in order:
    //   1. classifyDomain() keyword match -> definitely a NEW engineering request.
    //   2. Active session with existing results/domain + the message looks like a
    //      reference to "that"/"it"/"the result"/etc. -> treat as a 'followup' so it gets
    //      answered directly from existing context instead of being rejected or forced
    //      through a brand-new input-file generation pipeline.
    //   3. Otherwise, only THEN fall back to the generic "not an engineering question" reply.
    const localGuess = classifyDomain(promptText);
    if (localGuess.domain && localGuess.domain !== 'Unknown' && localGuess.confidence > 0) {
      return { intent: 'engineering', personalReply: null, engineeringPart: promptText };
    }

    const hasActiveContext = Boolean(activeDomain) && activeDomain !== 'Default' && (hasResults || conversationHistory.length > 0);
    if (hasActiveContext && looksLikeFollowup(promptText)) {
      return { intent: 'followup', personalReply: null, engineeringPart: promptText };
    }

    // Still give ambiguous-but-in-session-context messages the benefit of the doubt
    // rather than rejecting outright, as long as there's something to answer from.
    if (hasActiveContext && hasResults) {
      return { intent: 'followup', personalReply: null, engineeringPart: promptText };
    }

    return {
      intent: 'personal',
      personalReply: `I couldn't reach the reasoning backend for a moment, but that doesn't look like an engineering/simulation question — I'm built specifically for engineering analysis (circuits, structures, fluids, thermal, etc.), so I can't answer general knowledge questions like that. Give me an engineering problem and I'll dig in.`,
      engineeringPart: null
    };
  }
}

// ─── STRICT ENGINEERING ANSWER FORMAT ─────────────────────────────────────
// Enforces: Description -> Intuition -> Mathematics -> Formula/Laws used,
// numbered per sub-question when the user asks multiple things at once.
//
// UPDATED: added explicit "go beyond restating scalar metrics" instructions.
// Previously a model could technically satisfy this format while still being
// extremely thin (just echoing metric name: value pairs), which is what
// produced the shallow "I ran the circuits model with ngspice..." style
// answers users were seeing. The new rules force symbolic derivation,
// qualitative behavior explanation, and explicit single-vs-combined-stage
// comparisons for cascaded/multi-part systems.
export const ENGINEERING_ANSWER_FORMAT_INSTRUCTIONS = `Format your ENTIRE answer using this exact structure.

If the user's message contains multiple distinct sub-questions, repeat the block below once per sub-question, numbered "Question 1", "Question 2", etc., each with its own restated question. If there is only one question, output exactly one unnumbered block (skip the "Question N" heading, go straight to the section headers).

For each question:

**Description**
Restate, in plain language, what is actually being asked and which values/system are involved. Name the specific topology/system (e.g. "two-stage cascaded RC low-pass filter"), not just the generic domain.

**Intuition**
The physical/engineering intuition — why the result behaves this way, in plain language, before the math. Explain the qualitative behavior across the operating range (e.g. how gain and phase change with frequency, how stress redistributes with load, how temperature evolves over time), not just a one-line restatement of the final number.

**Mathematics**
Every calculation step, in order: symbolic form first, then substituted numeric values, ending in the final numeric result with correct units. Do not skip steps. Derive the governing equation(s) yourself — do not just quote the solver's output metrics as if they were the derivation.

**Formula/Laws used**
Name each law/formula/equation used (e.g. "Ohm's Law: V = IR", "Newton's Second Law: F = ma"), one per line, with the actual symbolic formula included (not just the name).

Rules:
- Give REAL numeric answers computed from the actual values in the question. Never say "it depends" if the values are given.
- If a value is missing, state the assumption you're using and continue.
- Go beyond restating the solver's scalar metrics: derive the governing formula symbolically, substitute the actual numbers step by step, and explain the qualitative behavior. State what idealizations were made (e.g. ideal components, no loading effects) and what real-world deviation to expect as a result.
- For multi-stage, cascaded, or compound systems, explicitly compare the single-element/single-stage behavior to the combined/overall behavior (e.g. dB/decade roll-off per stage vs overall, total phase shift, combined safety factor) rather than only reporting final numbers.
- Confident, precise, industrial tone — this is a professional engineering tool, matching the depth of a textbook worked example, not a lab report summary.`;

// ─── FOLLOW-UP ANSWER FORMAT ───────────────────────────────────────────────
// Used for "followup" intent messages: short questions about the model/results
// that ALREADY exist for this session. No new input file, no re-run — just a
// direct, conversational answer grounded in what's already been computed.

const FOLLOWUP_ANSWER_INSTRUCTIONS = `The user is asking a follow-up question about a model or result that ALREADY exists in this session (see SOLVER RESULT / INPUT FILE / RECENT CONVERSATION below). Do NOT propose a new system, new input file, or new simulation. Answer directly and conversationally using the existing numbers.

Rules:
- Pull the exact value(s) the user is asking about from the solver result or input file below. Never guess or recompute a different number than what was already produced, unless the user is explicitly asking you to recalculate something.
- Keep it concise — a short paragraph or a few bullet points is enough for a simple lookup question ("what's X?"). Only go into a fuller derivation (mathematics, laws used) if the user is asking "why" or "how" something works.
- If the user asks something not covered by the existing results or input file, say so plainly and offer to compute it.
- Confident, precise, conversational tone — like a colleague quickly answering a question, not re-issuing a report.`;

export async function generateFollowupAnswer({
  promptText,
  solverResult,
  inputFile,
  domain,
  conversationHistory = [],
  provider = 'groq'
}) {
  const { callAI } = await import('./llmClient.js');

  const historyBlock = conversationHistory
    .slice(-10)
    .map(item => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  const solverBlock = solverResult
    ? `SOLVER RESULT (ground truth — use these exact numbers):\n${JSON.stringify(solverResult.metrics || [], null, 2)}\n\nSolver summary: ${solverResult.plain_summary || 'n/a'}`
    : 'No solver result is stored for this session yet.';

  const fullPrompt = `You are Seemulator's engineering assistant for the ${domain || 'current'} domain, answering a follow-up question inside an ongoing session.

${FOLLOWUP_ANSWER_INSTRUCTIONS}

RECENT CONVERSATION:
${historyBlock || '(none)'}

USER'S FOLLOW-UP QUESTION (this turn):
${promptText}

${solverBlock}
${inputFile?.content ? `\nCURRENT INPUT FILE:\n${inputFile.content}` : ''}`;

  try {
    const response = await callAI(provider, fullPrompt, { domain: domain || 'General' });
    if (response.error) throw new Error(response.error);
    return response.content || null;
  } catch (error) {
    console.error('[generateFollowupAnswer] AI generation failed:', error);
    return null; // caller falls back to a template answer
  }
}

// UPDATED: generateStructuredEngineeringAnswer now
//   1) builds a much richer solverBlock — including netlist/system_type/
//      assumptions/frequency-or-time-series samples, not just the flat
//      metrics array — so the model actually has enough material to write a
//      textbook-depth derivation instead of restating scalar metrics.
//   2) RETHROWS on failure instead of swallowing the error and returning
//      null. Silently returning null is what let the thin hardcoded
//      fallback template (formatResultAnswer in App.jsx) fire on every
//      single turn without anyone noticing why. The caller (App.jsx) is
//      responsible for retrying and/or falling back now, but it will at
//      least SEE the real error in that process.
export async function generateStructuredEngineeringAnswer({
  promptText,
  solverResult,
  inputFile,
  domain,
  conversationHistory = [],
  provider = 'groq'
}) {
  const { callAI } = await import('./llmClient.js');

  const historyBlock = conversationHistory
    .slice(-6)
    .map(item => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  let solverBlock = 'No solver was run for this turn — answer from first-principles engineering reasoning and show your own full derivation.';
  if (solverResult) {
    const metricsJSON = JSON.stringify(solverResult.metrics || [], null, 2);

    // Sample a few points from any time/frequency series instead of dumping
    // potentially hundreds of points into the prompt — enough for the model
    // to describe the shape of the response (roll-off, settling, etc.)
    // without blowing up prompt size or hitting token limits.
    const sampleSeries = (series, label) => {
      if (!Array.isArray(series) || series.length === 0) return '';
      const first = series.slice(0, 3);
      const last = series.slice(-3);
      const mid = series[Math.floor(series.length / 2)];
      return `\n\n${label} (sampled — ${series.length} total points): first=${JSON.stringify(first)}, mid=${JSON.stringify(mid)}, last=${JSON.stringify(last)}`;
    };

    const freqSample = sampleSeries(solverResult.frequency_response, 'Frequency response sample');
    const timeSample = sampleSeries(solverResult.time_series, 'Time-domain sample');

    solverBlock = `SOLVER RESULT (ground truth — use these exact numbers, do not recompute differently):
${metricsJSON}

Solver summary: ${solverResult.plain_summary || 'n/a'}
System type: ${solverResult.system_type || 'n/a'}
Assumptions made during formulation: ${(solverResult.assumptions || []).join('; ') || 'none stated'}${freqSample}${timeSample}`;
  }

  const fullPrompt = `You are Seemulator's engineering explanation engine for the ${domain} domain.

${ENGINEERING_ANSWER_FORMAT_INSTRUCTIONS}

RECENT CONVERSATION:
${historyBlock || '(none)'}

USER QUESTION (this turn):
${promptText}

${solverBlock}
${inputFile?.content ? `\nNETLIST / INPUT FILE USED:\n${inputFile.content}` : ''}`;

  const response = await callAI(provider, fullPrompt, { domain });
  if (response.error) throw new Error(response.error);
  return response.content || null;
}

// Convenience wrapper: retries generateStructuredEngineeringAnswer once (with
// a short backoff) before giving up, since the most common failure mode
// (rate limiting on the 2nd/3rd AI call of the same turn) is transient.
// Exported so App.jsx can import it directly instead of re-implementing
// retry logic at every call site.
export async function generateStructuredEngineeringAnswerWithRetry(args, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await generateStructuredEngineeringAnswer(args);
      if (result) return result;
    } catch (err) {
      lastError = err;
      console.error(`[generateStructuredEngineeringAnswerWithRetry] attempt ${attempt + 1}/${retries + 1} failed:`, err.message || err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }
  if (lastError) {
    console.error('[generateStructuredEngineeringAnswerWithRetry] all attempts failed, returning null so caller can use its own fallback template:', lastError.message || lastError);
  }
  return null;
}

// ─── NEW ARCHITECTURE: Single-Call Input File Generation ─────────────────

const SINGLE_CALL_PROMPT = `You are an engineering simulation compiler. Your job is to convert a user's natural-language engineering request directly into a complete, ready-to-run solver input file, AND extract a structured parameter view of that same file for UI display and tuning. You do NOT produce intermediate patches, field/value pairs detached from the file, or a separately-maintained "model object." The parameter list you output is a direct, lossless reflection of the input file — never a parallel data structure that can drift out of sync with it.

STEP 1 — The domain is always Circuits and the solver is always ngspice (.cir netlist).

STEP 2 — Extract every parameter the user gave you (values, units, topology, boundary conditions, materials, sources). Convert units to what the solver expects (e.g. 1µF → 1e-6F in SPICE). For frequency response/AC analysis requests, generate AC sweep parameters (start frequency, stop frequency, number of points) with sensible defaults (e.g., 10 Hz to 100 kHz, 100 points) instead of asking for a single "Input Frequency".

STEP 3 — Fill any parameter the user did NOT specify with a sensible, clearly-labeled circuit default (e.g. ground reference 0V, 1kΩ resistors, 1µF capacitors). Never invent a value silently.

STEP 4 — Generate the complete, syntactically valid input file content for the identified solver. It must be directly executable with no further editing. For ngspice circuits:
- ALWAYS include ALL components: voltage source, resistors, capacitors, etc.
- Use correct syntax: V1 1 0 DC 0 AC 1 (both DC and AC values for AC analysis)
- For AC frequency response: use .ac dec <points> <start_freq> <stop_freq>
- For transient analysis: use .tran <step> <stop_time>
- Output format: use .control section with run and write commands to generate .raw output file
- Example valid RC filter netlist:
  * RC Low-Pass Filter
  V1 1 0 DC 0 AC 1
  R1 1 2 1k
  C1 2 0 1e-6
  .ac dec 100 10 100000
  .control
    set filetype=ascii
    run
    write rc_filter.raw
    quit
  .endc
  .end

STEP 5 — Build the "parameters" array by parsing your own generated file back out into a UI-friendly, editable list. Every entry must include a "file_anchor" telling the UI exactly what to replace in the file content if the user edits that value (e.g. the line number, or the exact token/line to find-and-replace). This is the ONLY source of truth for the "Formulated Model" panel — there is no separate model object anywhere else in the system.

CRITICAL: Extract EVERY component instance, not just unique types. For a 2-stage RC filter with R1, R2, C1, C2, you must extract ALL FOUR components separately. Do NOT collapse R1 and R2 into a single "R" parameter — each component instance gets its own parameter entry with its own file_anchor.

EXAMPLE for 2-stage RC filter netlist:
  V1 1 0 DC 5 AC 1
  R1 1 2 318
  C1 2 0 1e-6
  R2 2 3 318
  C2 3 0 1e-6
  .ac dec 100 10 100000

Expected parameters array:
  [
    {"section": "COMPONENTS", "field": "V1", "value": "5 V", "unit": "V", "file_anchor": {"line": 1, "match": "DC 5"}},
    {"section": "COMPONENTS", "field": "R1", "value": "318 Ohm", "unit": "Ohm", "file_anchor": {"line": 2, "match": "318"}},
    {"section": "COMPONENTS", "field": "C1", "value": "1e-6 F", "unit": "F", "file_anchor": {"line": 3, "match": "1e-6"}},
    {"section": "COMPONENTS", "field": "R2", "value": "318 Ohm", "unit": "Ohm", "file_anchor": {"line": 4, "match": "318"}},
    {"section": "COMPONENTS", "field": "C2", "value": "1e-6 F", "unit": "F", "file_anchor": {"line": 5, "match": "1e-6"}}
  ]

OUTPUT FORMAT — respond with ONLY this JSON, nothing else, no markdown fences, no commentary:

{
  "domain": "Circuits",
  "solver_name": "ngspice",
  "system_type": "<specific subtype, e.g. RC_low_pass_filter>",
  "input_file": {
    "filename": "<appropriate filename with correct extension>",
    "content": "<the full, complete, raw input file text, real newlines, ready to write to disk verbatim>"
  },
  "parameters": [
    {
      "section": "<COMPONENTS | INPUT | OUTPUT | GEOMETRY | MATERIAL | etc.>",
      "field": "<human-readable name, e.g. Resistor (R)>",
      "value": "<current value with unit, or 'not set'>",
      "tag": "stated | confirmed | inferred | from_datasheet | unset",
      "editable": true | false,
      "unit": "<unit if numeric, else null>",
      "file_anchor": {
        "line": <line number in input_file.content, 1-indexed>,
        "match": "<exact substring on that line to find-and-replace on edit>"
      }
    }
  ],
  "missing_required": ["<field names that are unset and block a valid simulation, empty array if none>"],
  "assumed_defaults": [
    {"field": "<name>", "value": "<value>", "reason": "<why this default was chosen>"}
  ],
  "summary": "<one-sentence plain-language description of what will be simulated>"
}

RULES:
- This output is generated ONCE per chat message, on the first and only AI call for that turn. Do not assume a second AI call will fix or refine it later — get it right in this single pass.
- The "parameters" array is a derived view, not a separate model. If it conflicts with input_file.content, that is a bug — they must always agree.
- Do not output legacy patch objects, section/field mapping tables, or anything resembling the old brainTools.js patch format. That layer is deprecated and must not appear in your output.
- "missing_required" replaces console-warning validation — the UI will block "Run Simulation" and highlight these fields instead of silently defaulting them.
- When the user edits a parameter value directly in the UI panel, that edit is applied via file_anchor as a deterministic frontend string replace on input_file.content — NO AI call is made for this. You are not asked to perform this step; your job is only to make file_anchor precise enough that the frontend can do it unambiguously.
- When the user instead asks via CHAT to change a parameter (e.g. "make the resistor 2k instead"), that chat message triggers this SAME prompt again as a new "first AI call" for that turn — except this time the CURRENT input_file.content (including any manual UI edits made since) is included in your input context as the starting state, not the original blank request. Regenerate the full file and full parameter list together so they stay in sync. Never patch only the chat-mentioned field while leaving the rest of the file stale.
- If the request is too ambiguous for any valid input file (e.g. no topology, no reasonable default exists), set "input_file" to null, "parameters" to an empty array, and explain what's missing in "summary".
- Never include explanations, reasoning, or markdown outside the JSON object.`;

export async function generateInputFile(promptText, currentInputFile = null, provider = 'groq') {
  // Use llmClient for AI calls (aiLayers.js was removed in Phase 0 cleanup)
  const { callAI } = await import('./llmClient.js');
  
  // Build context for the AI call
  let context = SINGLE_CALL_PROMPT;
  
  // If we have an existing input file, include it as the starting state
  if (currentInputFile) {
    context += `\n\nCURRENT INPUT FILE STATE (this is the starting point - regenerate fully based on user's request):\n`;
    context += `Filename: ${currentInputFile.filename}\n`;
    context += `Content:\n${currentInputFile.content}\n`;
  }
  
  context += `\n\nUSER REQUEST:\n${promptText}`;
  
  console.log('[generateInputFile] Sending to LLM:', context);
  
  try {
    // BUGFIX: this used to call `callAI(provider, '', context)` — an EMPTY prompt with the
    // real prompt text stuffed into the `context` param instead. callAI's `message` field is
    // sourced from the 2nd argument, so the backend was receiving an empty message on every
    // single input-file generation call. The real prompt text now goes in the 2nd argument.
    const responseObj = await callAI(provider, context, {});

    // callAI returns { error, provider } on failure instead of throwing/rejecting —
    // check for that BEFORE assuming responseObj.content is real model output,
    // so the real failure reason (e.g. rate limit) is surfaced instead of a
    // generic "invalid JSON" message.
    if (responseObj.error) {
      throw new Error(responseObj.error);
    }

    const responseText = responseObj.content || '';
    console.log('[generateInputFile] AI Response:', responseText);
    
    // Try to parse the entire response as JSON first
    let result = null;
    let parseError = null;
    
    // Attempt 1: Parse entire response as JSON
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      parseError = e;
    }
    
    // Attempt 2: Extract JSON from markdown code blocks
    if (!result) {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[1]);
        } catch (e) {
          parseError = e;
        }
      }
    }
    
    // Attempt 3: Extract JSON using regex (find first complete JSON object)
    if (!result) {
      let cleanText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e) {
          parseError = e;
        }
      }
    }
    
    // Attempt 4: Try to fix common JSON syntax errors
    if (!result) {
      let cleanText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          // Fix common issues: trailing commas, unquoted keys
          let fixedJson = jsonMatch[0]
            .replace(/,\s*}/g, '}')  // Remove trailing commas before }
            .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');  // Quote unquoted keys
          result = JSON.parse(fixedJson);
        } catch (e) {
          parseError = e;
        }
      }
    }
    
    if (!result) {
      throw new Error(`AI response did not contain valid JSON. Parse error: ${parseError?.message || 'Unknown'}. Response: ${responseText.substring(0, 200)}...`);
    }
    
    // Validate required fields
    if (!result.domain || !result.solver_name || !result.input_file) {
      throw new Error('AI response missing required fields');
    }
    
    return result;
    
  } catch (error) {
    console.error('[generateInputFile] Error:', error);
    return {
      domain: null,
      solver_name: null,
      system_type: 'Unknown',
      input_file: null,
      parameters: [],
      missing_required: [],
      assumed_defaults: [],
      summary: `Error generating input file: ${error.message}`
    };
  }
}

// ─── LEGACY FUNCTIONS (deprecated, kept for compatibility during migration) ──

export function planChatWorkflow(promptText, domain, hasModel = false) {
  const text = promptText.toLowerCase();
  const intent = analyzeEngineeringIntent(promptText, domain);
  const workflowIntent = createWorkflowIntent(promptText, domain, hasModel);
  const casualResponse = getCasualResponse(promptText);
  if (casualResponse) {
    return {
      domain,
      hasModel,
      actions: {
        formulate: false,
        updateModel: false,
        runSolver: false,
        explainOnly: true
      },
      statusText: '',
      intent,
      workflowIntent,
      casualResponse
    };
  }

  const wantsRun = /\b(run|simulate|solve|calculate|compute|analyze|analyse|plot|show|generate|size|design|response|stress|deflection|ripple|gain|temperature|lift|drag|fatigue|safety)\b/.test(text);
  const wantsUpdate = /\b(change|set|update|modify|try|use|increase|decrease|reduce|raise|lower|make|switch)\b/.test(text);
  const asksOnly = /\b(explain|why|what does|how does|define)\b/.test(text) && !wantsRun && !wantsUpdate;

  return {
    domain,
    hasModel,
    actions: workflowIntent.domain !== 'Default' ? intentToActions(workflowIntent) : {
      formulate: !hasModel || wantsRun || wantsUpdate,
      updateModel: hasModel && wantsUpdate,
      runSolver: wantsRun || (hasModel && wantsUpdate),
      explainOnly: asksOnly
    },
    intent,
    workflowIntent,
    statusText: wantsRun
      ? 'Let me set up the model and run the calculation.'
      : wantsUpdate
        ? 'Got it. I’ll apply that change and recalculate.'
        : 'Let me turn that into an engineering model.'
  };
}

export function analyzeEngineeringIntent(promptText, fallbackDomain = 'Circuits') {
  const lower = promptText.toLowerCase();
  const domain = detectDomainFromPrompt(promptText, fallbackDomain);
  const categoryRules = [
    {
      domain: 'Circuits',
      category: 'Voltage divider',
      confidence: 0.97,
      pattern: /\bvoltage\s+divider|divider\b/,
      action: 'Choose standard resistor values, calculate output voltage/current, and run DC operating-point analysis.'
    },
    {
      domain: 'Circuits',
      category: 'Buck converter ripple',
      confidence: 0.9,
      pattern: /\bbuck|converter|ripple|inductor|esr\b/,
      action: 'Formulate converter parameters, run transient/ripple solver, and summarize output ripple.'
    },
    {
      domain: 'Circuits',
      category: 'Filter design',
      confidence: 0.88,
      pattern: /\bfilter|low.pass|high.pass|cutoff|bode\b/,
      action: 'Size passive components, account for loading, and provide frequency response.'
    }
  ];

  const matched = categoryRules.find(rule => rule.domain === domain && rule.pattern.test(lower))
    || categoryRules.find(rule => rule.pattern.test(lower));

  if (matched) return matched;

  return {
    domain,
    category: `${domain} general analysis`,
    confidence: 0.62,
    action: 'Formulate the closest supported model, answer with assumptions, and ask for missing critical inputs if needed.'
  };
}

export function formatIntentSummary(intent) {
  const pct = Math.round((intent.confidence || 0.5) * 100);
  return `This looks like a **${intent.category}** problem in **${intent.domain}**. I’m reasonably confident about that (${pct}%), so I’ll use that workflow.\n\n${intent.action}`;
}

export function getCasualResponse(promptText) {
  const text = promptText.trim().toLowerCase();
  if (!text) return null;

  const greetingOnly = /^(hi+|hii+|hiii+|hello+|hey+|yo+|sup|what'?s up|wassup|namaste|hola|gm|good morning|good evening|good afternoon)[!.?\s]*$/i;
  const thanksOnly = /^(thanks|thank you|ty|cool|ok|okay|nice|great|awesome)[!.?\s]*$/i;

  if (greetingOnly.test(text)) {
    return `Hey hey. What are we building, breaking, simulating, or making suspiciously elegant today? Give me a system, a weird constraint, or even just a messy idea and I’ll turn it into a model.`;
  }

  if (thanksOnly.test(text)) {
    return `You got it. Toss me the next engineering puzzle when you're ready.`;
  }

  return null;
}

export function detectDomainFromPrompt(promptText, currentDomain) {
  const lower = promptText.toLowerCase();
  const patterns = [
    ['Circuits', /\b(buck|dc.?dc|converter|ripple|inductor|capacitor|circuit|netlist|spice|esr|voltage divider|rc filter|op.?amp)\b/i],
  ];

  const match = patterns.find(([, regex]) => regex.test(lower));
  return match ? match[0] : currentDomain;
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeLabel = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const fieldAliases = (section, fieldName) => {
  const normalized = normalizeLabel(fieldName);
  const base = [fieldName, normalized];
  const aliases = {
    'Supply voltage': ['vin', 'input voltage', 'supply', 'supply voltage', 'source voltage'],
    'Target voltage': ['target', 'target voltage', 'output target', 'vout target'],
    'Output voltage': ['output voltage', 'vout'],
    'Load current': ['load current', 'load', 'i load', 'iload'],
    'Top resistor (R1)': ['r1', 'top resistor', 'upper resistor'],
    'Bottom resistor (R2)': ['r2', 'bottom resistor', 'lower resistor'],
    'Inductor (L1)': ['l1', 'inductor', 'inductance'],
    'Capacitor (C1)': ['c1', 'capacitor', 'capacitance'],
    'ESR (C1)': ['esr', 'capacitor esr'],
    'Switch freq': ['switching frequency', 'switch freq', 'frequency', 'fsw'],
    'Duty cycle': ['duty cycle', 'duty', 'd'],
    'Cutoff frequency': ['cutoff frequency', 'cutoff', 'fc', 'corner frequency'],
    'Input frequency': ['input frequency', 'frequency', 'f'],
    'Resistor (R)': ['r', 'resistor', 'resistance'],
    'Capacitor (C)': ['c', 'capacitor', 'capacitance']
  };
  return [...new Set([...base, ...(aliases[fieldName] || []), `${normalizeLabel(section)} ${normalized}`])]
    .filter(alias => alias && alias.length > 0)
    .sort((a, b) => b.length - a.length);
};

const inferExistingUnit = (field) => {
  const value = field && typeof field === 'object' ? field.value : field;
  const match = String(value || '').match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*(.*)$/);
  return match ? match[1].trim() : '';
};

const findFieldValueInPrompt = (promptText, aliases, existingUnit = '') => {
  const text = String(promptText || '');
  for (const alias of aliases) {
    const escaped = escapeRegex(alias);
    const numericPatterns = [
      new RegExp(`\\b(?:set|change|update|tune|make|try|use|increase|decrease|raise|lower)?\\s*${escaped}\\s*(?:to|=|:|is|as)?\\s*([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))\\s*([a-zA-ZµΩ°³²/%·.-]+)?`, 'i'),
      new RegExp(`\\b([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+))\\s*([a-zA-ZµΩ°³²/%·.-]+)?\\s*(?:for|as)?\\s*${escaped}\\b`, 'i')
    ];
    for (const pattern of numericPatterns) {
      const match = text.match(pattern);
      if (match) {
        const unit = match[2]?.trim() || existingUnit;
        return `${match[1]}${unit ? ` ${unit}` : ''}`.replace(' °', ' deg').replace(/[.,;:]+$/, '');
      }
    }

    const textPattern = new RegExp(`\\b(?:set|change|update|use|switch)\\s+${escaped}\\s*(?:to|=|:|as)?\\s+([a-zA-Z][a-zA-Z0-9\\- ]{1,32})`, 'i');
    const textMatch = text.match(textPattern);
    if (textMatch) {
      return textMatch[1].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
};

function applyGenericParameterTuning(updated, promptText) {
  Object.entries(updated).forEach(([section, fields]) => {
    if (!fields || typeof fields !== 'object' || section === 'SYSTEM_TYPE') return;
    Object.entries(fields).forEach(([fieldName, fieldObj]) => {
      const nextValue = findFieldValueInPrompt(
        promptText,
        fieldAliases(section, fieldName),
        inferExistingUnit(fieldObj)
      );
      if (nextValue !== null) {
        updated[section][fieldName] = {
          ...(typeof fieldObj === 'object' ? fieldObj : {}),
          value: nextValue,
          tag: 'edited'
        };
      }
    });
  });
  return updated;
}

export async function applyNaturalLanguageUpdates(model, domain, promptText, DEFAULT_MODELS, provider = 'groq') {
  // First, analyze parameter dependencies for the current model
  const dependencyAnalysis = await analyzeParameterDependencies(model, domain, provider);
  
  // Use AI-based parameter extraction with dependency awareness
  try {
    const updateResult = await extractParameterUpdates(promptText, model, domain, dependencyAnalysis.dependencies, provider);
    
    // Apply the updates with cascading suggestions
    const updatedModel = applyParameterUpdates(
      model, 
      updateResult.updates, 
      updateResult.cascading_updates, 
      'edited'
    );
    
    // Validate parameters against recommended ranges
    const warnings = validateParameters(updatedModel, dependencyAnalysis.recommended_ranges);
    
    if (warnings.length > 0) {
      console.warn('Parameter validation warnings:', warnings);
    }
    
    // If no direct updates were found, fall back to full model extraction
    if (updateResult.updates.length === 0) {
      const extractedModel = await extractModelWithAI(promptText, domain, DEFAULT_MODELS, provider);
      const validation = validateExtractedModel(extractedModel, domain, DEFAULT_MODELS);
      
      if (!validation.valid) {
        console.warn('AI extraction validation errors:', validation.errors);
      }
      
      return extractedModel;
    }
    
    // Return the updated model with cascading suggestions
    return updatedModel;
    
  } catch (error) {
    console.error('AI parameter update failed, falling back to full model extraction:', error);
    
    // Fallback to full model extraction
    try {
      const extractedModel = await extractModelWithAI(promptText, domain, DEFAULT_MODELS, provider);
      const validation = validateExtractedModel(extractedModel, domain, DEFAULT_MODELS);
      
      if (!validation.valid) {
        console.warn('AI extraction validation errors:', validation.errors);
      }
      
      return extractedModel;
    } catch (fallbackError) {
      console.error('Full model extraction also failed, returning null model:', fallbackError);
      
      // Return null model if all AI methods fail - NO REGEX FALLBACK
      const domainSchema = DEFAULT_MODELS[domain] || {};
      const nullModel = {};
      
      Object.keys(domainSchema).forEach(section => {
        if (typeof domainSchema[section] !== 'object' || Array.isArray(domainSchema[section])) return;
        nullModel[section] = {};
        
        Object.keys(domainSchema[section]).forEach(field => {
          const fieldData = domainSchema[section][field];
          nullModel[section][field] = fieldData ? { ...fieldData, value: null } : { value: null, tag: null };
        });
      });
      
      return nullModel;
    }
  }
}