/**
 * Chat Command Parser — Phase 4 Bidirectional Control
 * ================================================
 * Detects chat-driven commands that operate on the current model/results
 * instead of generating a new pipeline run.
 *
 * Two command types:
 *  - "edit": modifies a parameter value in the Formulated Model, then
 *    optionally re-runs the simulation (e.g. "make R1 2k", "change voltage to 10V")
 *  - "display": shows info without modifying (e.g. "show netlist",
 *    "what are the current parameters", "show results")
 *
 * Returns null when the message is not a command (i.e. it's a new question
 * or general chat), so the caller falls through to the normal pipeline.
 */

/**
 * Parse a chat message to detect edit or display commands.
 * @param {string} text - The user's chat message
 * @param {Array} parameters - Current session parameters array
 * @param {object|null} inputFile - Current session input file
 * @param {object|null} results - Current session solver results
 * @returns {object|null} - { type: 'edit'|'display', ... } or null if not a command
 */
export function parseChatCommand(text, parameters = [], inputFile = null, results = null) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // ── Display commands ──────────────────────────────────────────────
  const displayResult = _parseDisplayCommand(lower, parameters, inputFile, results);
  if (displayResult) return displayResult;

  // ── Edit commands ─────────────────────────────────────────────────
  const editResult = _parseEditCommand(lower, text, parameters);
  if (editResult) return editResult;

  return null;
}

// ── Display command patterns ───────────────────────────────────────────────

function _parseDisplayCommand(lower, parameters, inputFile, results) {
  // Show netlist / input file
  if (/\b(show|display|view|print|see)\b.*\b(netlist|input file|solver input|cir|circuit file)\b/.test(lower)
      || lower === 'show netlist' || lower === 'show input') {
    return {
      type: 'display',
      subtype: 'netlist',
      reply: _formatNetlist(inputFile),
    };
  }

  // Show parameters / model
  if (/\b(show|display|view|list|what are)\b.*\b(parameter|model|component|value|current|setting)s?\b/.test(lower)
      || lower === 'show params' || lower === 'show model' || lower === 'show parameters') {
    return {
      type: 'display',
      subtype: 'parameters',
      reply: _formatParameters(parameters),
    };
  }

  // Show results
  if (/\b(show|display|view|what (are|were)|see)\b.*\b(result|output|metric|voltage|current|simulation)s?\b/.test(lower)
      || lower === 'show results' || lower === 'show output') {
    return {
      type: 'display',
      subtype: 'results',
      reply: _formatResults(results),
    };
  }

  // Show schematic
  if (/\b(show|display|view|see)\b.*\b(schematic|diagram|circuit diagram)\b/.test(lower)) {
    return {
      type: 'display',
      subtype: 'schematic',
      reply: 'The schematic is shown in the Schematic tab on the right panel.',
    };
  }

  return null;
}

function _formatNetlist(inputFile) {
  if (!inputFile || !inputFile.content) {
    return 'No input file has been generated yet. Describe a circuit to begin.';
  }
  const content = inputFile.content;
  const filename = inputFile.filename || 'circuit.cir';
  return `### Input File: \`${filename}\`\n\`\`\`\n${content}\n\`\`\``;
}

function _formatParameters(parameters) {
  if (!parameters || parameters.length === 0) {
    return 'No parameters have been extracted yet. Describe a circuit to begin.';
  }
  const lines = parameters.map(p => {
    const tag = p.tag ? ` [${p.tag}]` : '';
    return `- **${p.field}**: ${p.value}${p.unit ? ' ' + p.unit : ''}${tag}`;
  });
  return `### Current Parameters\n${lines.join('\n')}`;
}

function _formatResults(results) {
  if (!results) {
    return 'No simulation results are available yet. Run a simulation first.';
  }
  const metrics = results.metrics || [];
  if (metrics.length === 0) {
    return results.plain_summary || 'Simulation results are available in the Results tab.';
  }
  const lines = metrics.map(m => `- **${m.name}**: ${m.value}`);
  return `### Simulation Results\n${lines.join('\n')}${results.plain_summary ? '\n\n' + results.plain_summary : ''}`;
}

// ── Edit command patterns ──────────────────────────────────────────────────

// Patterns like "make R1 2k", "change voltage to 10V", "set R1 to 500", "update C1 to 1uF"
const EDIT_PATTERNS = [
  // "make/set/change/update <field> <value>" or "make/set/change/update <field> to <value>"
  /\b(make|set|change|update|modify|adjust)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(=?[\d.]+\s*[a-zA-ZΩμµkM]*)/i,
  // "increase/decrease <field> to <value>"
  /\b(increase|decrease)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(=?[\d.]+\s*[a-zA-ZΩμµkM]*)/i,
  // "replace <field> with <value>"
  /\b(replace)\s+(?:the\s+)?(.+?)\s+(?:with)\s+(=?[\d.]+\s*[a-zA-ZΩμµkM]*)/i,
];

// Value parsing: extract numeric + unit from strings like "2k", "10V", "1.5kΩ", "100uF"
function _parseValue(valueStr) {
  const cleaned = valueStr.trim().replace(/^=/, '');
  const match = cleaned.match(/^([\d.]+)\s*([a-zA-ZΩμµkM]*)$/);
  if (!match) return { numeric: null, unit: '', raw: cleaned };
  let num = parseFloat(match[1]);
  let unit = match[2] || '';

  // Expand engineering notation
  if (unit.toLowerCase().startsWith('k')) { num *= 1000; unit = unit.slice(1); }
  else if (unit.toLowerCase().startsWith('m') && !unit.toLowerCase().startsWith('m')) { num *= 1e6; unit = unit.slice(1); }
  else if (unit.startsWith('μ') || unit.startsWith('µ') || unit.toLowerCase().startsWith('u')) { num *= 1e-6; unit = unit.slice(unit.startsWith('μ') || unit.startsWith('µ') ? 1 : 1); }
  else if (unit.toLowerCase().startsWith('g')) { num *= 1e9; unit = unit.slice(1); }

  return { numeric: num, unit, raw: cleaned };
}

function _matchParameter(fieldName, parameters) {
  if (!parameters || parameters.length === 0) return null;
  const fl = fieldName.toLowerCase().trim();

  // Exact match on field name
  let match = parameters.find(p => p.field && p.field.toLowerCase() === fl);
  if (match) return match;

  // Partial match: field contains the name or vice versa
  match = parameters.find(p => {
    const pf = p.field.toLowerCase();
    return pf.includes(fl) || fl.includes(pf);
  });
  if (match) return match;

  // Try matching by component designator (R1, C1, V1, L1)
  match = parameters.find(p => {
    const pf = p.field.toLowerCase();
    return pf === fl || pf.startsWith(fl + ' ') || pf.startsWith(fl + '(');
  });
  return match || null;
}

function _parseEditCommand(lower, originalText, parameters) {
  for (const pattern of EDIT_PATTERNS) {
    const m = originalText.match(pattern);
    if (!m) continue;

    const action = m[1].toLowerCase();
    let fieldName = m[2].trim();
    let valueStr = m[3].trim();

    // Clean up field name — remove "to" prefix if captured
    fieldName = fieldName.replace(/\s+to\s*$/i, '').trim();

    const param = _matchParameter(fieldName, parameters);
    if (!param) {
      // Not a recognized parameter — might be a new question, not an edit command
      return null;
    }

    const parsed = _parseValue(valueStr);

    return {
      type: 'edit',
      action,
      field: param.field,
      section: param.section,
      fieldKey: `${param.section}.${param.field}`,
      oldValue: param.value,
      newValue: valueStr,
      parsedValue: parsed,
      param,
      shouldRun: !/\b(just|only|don'?t run|without running)\b/.test(lower),
    };
  }

  return null;
}
