"""
Call 1 — Combined Sub-Domain Selection + Input Generation
=========================================================
ONE AI call that does both:
  1. Decides which sub-domain(s) the question needs.
  2. Generates the solver-ready input for each selected sub-domain.

For solver-backed sub-domains (analog_sim, symbolic_analysis, digital_logic,
numerical_processing, control_systems, fpga_realization), this produces the
input that the real solver will consume (netlist, boolean expression, SymPy
plan, Verilog source, etc.).

For LLM-only sub-domains (rf_em, pcb_realization, semiconductor_device,
physical_design), this same call produces the final computed result
directly — no separate execution step exists for those.

The repair loop (re-prompting on validation failure) is an exception path
and does NOT count toward the normal 2-call baseline.
"""
import json
import re
from typing import Dict, Any, Callable, List, Tuple

from .llm_utils import parse_llm_json
from .tool_selector import list_capabilities, score_question


# Sub-domains backed by real solvers — Call 1 generates input, real execution happens after
_SOLVER_BACKED = {"analog_sim", "symbolic_analysis", "digital_logic",
                  "numerical_processing", "control_systems", "fpga_realization"}

# LLM-only sub-domains — Call 1 produces the final result directly
_LLM_ONLY = {"rf_em", "pcb_realization",
             "semiconductor_device", "physical_design"}


_COMBINED_PROMPT = """You are the combined sub-domain selector and input generator for an automated
electronics engineering simulation pipeline. In ONE response you must:

1. Decide which sub-domain(s) the question belongs to (one or more).
2. Generate the solver-ready input for EACH selected sub-domain.

Available sub-domains and their input formats:

## analog_sim (SPICE simulation via ngspice)
Real solver: ngspice. You generate a SPICE-style netlist + analysis spec.
Input fields:
  "in_scope": true/false,
  "system_type": "<short label>",
  "netlist": "<one component per line, format: Name N+ N- Value; layout_hint>",
  "parameters": {{"<name>": "<value>"}},
  "assumptions": ["<text>"],
  "unsupported_aspects": ["<things asked but not simulate-able>"],
  "analysis": {{"type": "operating_point"|"transient"|"ac", "args": {{...}}}},
  "probe_nodes": ["<node>"]
Netlist rules:
  - Ground node MUST be "0". Prefixes: V/I/R/L/C/D/Q/E.
  - V/I sources support DC, AC, SINE(), PULSE().
  - BJT: "Qname collector base emitter; hint" (no model name).
  - Op-amp: VCVS "Ename out 0 inv noninv 100000; hint".
  - Zener: "D1 2 0 Dzener; hint" (model auto-injected).
  - Every node needs 2+ connections and a DC path to ground.

## symbolic_analysis (SymPy symbolic algebra)
Real solver: SymPy. You generate a symbolic analysis plan for ANY symbolic
circuit question — transfer functions, Thevenin/Norton equivalents, node
voltages, input/output impedance, characteristic equations, damping ratio,
natural frequency, notch frequency, gain expressions, etc.
Input fields:
  "system_type": "<short label>",
  "transfer_function": "<SymPy-parseable H(s) string, e.g. '1/(R*C*s+1)'. Omit if not applicable.>",
  "expressions": [{{"label": "<name>", "expr": "<SymPy string, e.g. 'R2*(I*R1+Vin)/(R1+R2)' or 'R1+R2+R3' for Thevenin resistance>"}}],
  "numeric_values": {{"<symbol>": <number>}},  e.g. {{"R": 1000, "C": 1e-6}} — provide when the question gives numeric component values
  "assumptions": ["<text>"],
  "symbols": {{"<name>": "<description>"}}

## digital_logic (boolean algebra via SymPy)
Real solver: SymPy boolean engine. You generate a boolean expression + variables.
Input fields:
  "system_type": "<short label>",
  "boolean_expression": "<using & | ~ ^ operators>",
  "input_variables": ["A", "B", ...],
  "output_variable": "Y",
  "assumptions": ["<text>"],
  "gate_count": <int>

## numerical_processing (NumPy/SciPy computation)
Real solver: NumPy/SciPy. You generate self-contained Python code.
Input fields:
  "system_type": "<short label>",
  "analysis_type": "fft"|"convolution"|"integration"|"optimization"|"matrix_solve"|"interpolation",
  "python_code": "<self-contained code defining result_dict with 'metrics' and 'computed_values'>",
  "assumptions": ["<text>"]

## control_systems (python-control / SymPy)
Real solver: python-control or SymPy. You generate TF coefficients.
Input fields:
  "system_type": "<short label>",
  "numerator": [<coeffs>],
  "denominator": [<coeffs>],
  "analysis": ["bode", "step", "stability", "pole_zero"],
  "assumptions": ["<text>"]

## rf_em (LLM-only — no real solver)
No real solver. Call 1 produces the final result directly.
Input fields:
  "system_type": "<short label>",
  "metrics": [{{"name": "...", "value": "..."}}],
  "s_params": {{"S11": "...", "S21": "..."}},
  "assumptions": ["<text>"],
  "plain_summary": "<one-sentence summary>",
  "unsupported_aspects": ["<things not computable>"]

## pcb_realization (LLM-only)
Same format as rf_em (metrics, assumptions, plain_summary).

## fpga_realization (Yosys synthesis)
Real solver: Yosys (real gate-count synthesis, not an estimate). You generate a
complete, synthesizable Verilog module for the design.
Input fields:
  "system_type": "<short label>",
  "verilog_source": "<a complete, synthesizable Verilog-2005 module — behavioral
    or structural, exactly one top-level module>",
  "top_module": "<the exact module name declared in verilog_source>",
  "assumptions": ["<text>"],
  "plain_summary": "<one-sentence summary, used only if synthesis can't run>"

## semiconductor_device (LLM-only)
Same format as rf_em.

## physical_design (LLM-only)
Same format as rf_em.

---

Routing rules:
- If the question has numeric component values and needs simulation → analog_sim.
- If the question asks for symbolic/analytical expressions → symbolic_analysis.
- If the question is about digital/boolean logic → digital_logic.
- If the question needs numerical computation (FFT, convolution, etc.) → numerical_processing.
- If the question is about control systems/transfer functions with coefficients → control_systems.
- If the question is about RF/EM/PCB/FPGA/semiconductor/physical design → respective LLM-only sub-domain.
- A single question may need multiple sub-domains.
- TIE-BREAK RULE: classify by the ARTIFACT the answer needs, NOT topic keywords.
  If the question requires truth tables, boolean expressions, or FSM/state tables →
  route to digital_logic, even if the underlying computation involves arithmetic
  (e.g. timing-closure / f_max / slack calculations are digital_logic, not
  numerical_processing, because the deliverable is a digital-design artifact).
- Always report your second-choice sub-domain in "runner_up" so near-miss routing
  is visible in logs. If no other sub-domain was plausible, use null.

Respond with ONLY a JSON object (no markdown fences, no commentary) with this structure:
{{
  "selections": [
    {{"sub_domain": "<name>", "tool": "<tool>", "reason": "<why>", "run_parallel": true}}
  ],
  "inputs": {{
    "<sub_domain_name>": {{<...input fields for that sub-domain...>}}
  }},
  "runner_up": {{"sub_domain": "<second-choice name or null>", "reason": "<why it lost the tie-break>"}}
}}

If the question is not an engineering/circuits question at all, return:
{{"selections": [], "inputs": {{}}, "out_of_scope": true}}

User question: {question}"""


# A "real" analog netlist has at least one SPICE component line: a
# reference designator (R/L/C/V/I/D/Q/E...) followed by two node names and
# a value. An empty string, prose, or a bare comment does not count.
_COMPONENT_LINE_RE = re.compile(r"^\s*[A-Za-z]\w*\s+\S+\s+\S+\s+\S+", re.MULTILINE)


def _looks_like_real_netlist(netlist: str) -> bool:
    if not netlist or not netlist.strip():
        return False
    return bool(_COMPONENT_LINE_RE.search(netlist))


def _apply_routing_guard(
    question: str,
    selections: List[Dict[str, Any]],
    inputs: Dict[str, Any],
    thinking: List[str],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Deterministic cross-check over the LLM's sub-domain selection.

    Narrow by design: only overrides when the LLM chose analog_sim AND
    produced no real circuit netlist AND keyword scoring clearly favors a
    different sub-domain. Every other selection (including all
    LLM-vs-keyword tie-breaks for non-analog domains, and any analog_sim
    selection backed by a real netlist) is left untouched — the LLM's
    artifact-based judgment remains authoritative there. This is the
    guard described in the CS-01/DL-01 fix: it prevents the backend from
    silently executing the legacy analog circuits pipeline when the
    question has no circuit elements at all.
    """
    if not selections:
        return selections, inputs

    scores = score_question(question)
    corrected: List[Dict[str, Any]] = []

    for sel in selections:
        sd = sel.get("sub_domain")
        if sd == "analog_sim":
            netlist = (inputs.get("analog_sim") or {}).get("netlist", "")
            analog_score = scores.get("analog_sim", 0)
            best_other_sd, best_other_score = None, 0
            for other_sd, sc in scores.items():
                if other_sd != "analog_sim" and sc > best_other_score:
                    best_other_sd, best_other_score = other_sd, sc

            if not _looks_like_real_netlist(netlist) and best_other_sd and best_other_score > analog_score:
                thinking.append(
                    "ROUTING GUARD: Call 1 selected analog_sim but produced no real "
                    f"circuit netlist (analog_sim keyword score={analog_score}); "
                    f"deterministic keyword scoring favors '{best_other_sd}' "
                    f"(score={best_other_score}). Overriding route to '{best_other_sd}' "
                    "instead of silently running the analog SPICE pipeline on a "
                    "non-circuit question."
                )
                sel = dict(sel)
                sel["sub_domain"] = best_other_sd
                sel["tool"] = ""
                sel["reason"] = (sel.get("reason", "") + " [overridden by deterministic routing guard: "
                                  f"no real netlist + keyword score {best_other_score} for {best_other_sd} "
                                  f"vs {analog_score} for analog_sim]").strip()
                inputs = dict(inputs)
                inputs.pop("analog_sim", None)

        corrected.append(sel)

    return corrected, inputs


def generate_selection_and_inputs(
    question: str,
    call_llm: Callable[[str], str],
    context: str = "",
) -> Dict[str, Any]:
    """
    Call 1: ONE AI call that selects sub-domain(s) AND generates solver inputs.

    Returns:
        {
            "selections": List[dict],  # [{sub_domain, tool, reason, run_parallel}]
            "inputs": Dict[str, dict], # {sub_domain: input_dict}
            "out_of_scope": bool,
            "thinking": List[str],     # progress notes
        }
    """
    caps_text = "\n".join(
        f"- {c['sub_domain']}: tools={c['tools']}, {c['description']}"
        for c in list_capabilities()
    )
    prompt = _COMBINED_PROMPT.format(question=question, capabilities=caps_text)
    # If context is provided, append it so the AI can modify an existing circuit
    # rather than generating a brand-new netlist on follow-up turns.
    if context and context.strip():
        prompt += f"\n\n---\nCurrent session context (use this to update/modify the existing circuit, not replace it unless asked):\n{context.strip()}\n---\n"

    thinking: List[str] = []
    thinking.append("Call 1: Combined sub-domain selection + input generation (single AI call).")

    try:
        raw = call_llm(prompt)
    except Exception as exc:
        thinking.append(f"Call 1 failed: {exc}")
        return {
            "selections": [],
            "inputs": {},
            "out_of_scope": False,
            "thinking": thinking,
            "error": str(exc),
        }

    try:
        payload = parse_llm_json(raw)
    except Exception as exc:
        thinking.append(f"Call 1 response parse failed: {exc}")
        return {
            "selections": [],
            "inputs": {},
            "out_of_scope": False,
            "thinking": thinking,
            "error": f"Failed to parse Call 1 response: {exc}",
        }

    selections = payload.get("selections", [])
    inputs = payload.get("inputs", {})
    out_of_scope = payload.get("out_of_scope", False)
    runner_up = payload.get("runner_up") or None
    # normalize: {"sub_domain": null} counts as no runner-up
    if isinstance(runner_up, dict) and not runner_up.get("sub_domain"):
        runner_up = None

    thinking.append(f"Call 1 selected {len(selections)} sub-domain(s): "
                    + ", ".join(s.get("sub_domain", "?") for s in selections))
    if runner_up:
        thinking.append(
            f"Call 1 runner-up: {runner_up.get('sub_domain')} "
            f"({runner_up.get('reason', 'no reason given')})"
        )

    # Deterministic routing guard — see module docstring / _apply_routing_guard.
    selections, inputs = _apply_routing_guard(question, selections, inputs, thinking)

    for sel in selections:
        sd = sel.get("sub_domain", "?")
        tool = sel.get("tool", "?")
        reason = sel.get("reason", "")
        thinking.append(f"  {sd}/{tool}: {reason}")

    return {
        "selections": selections,
        "inputs": inputs,
        "out_of_scope": out_of_scope,
        "runner_up": runner_up,
        "thinking": thinking,
    }


def repair_input(
    sub_domain: str,
    question: str,
    error: str,
    previous_input: Dict[str, Any],
    call_llm: Callable[[str], str],
) -> Dict[str, Any]:
    """
    Exception-path repair: re-prompt the AI for a corrected input for ONE
    specific sub-domain whose generated input failed validation.

    This does NOT count toward the normal 2-call baseline — it only fires
    when something is actually invalid.
    """
    repair_prompt = f"""The input you previously generated for the sub-domain "{sub_domain}" failed validation.

Original question: {question}

Previous input (JSON):
{json.dumps(previous_input, indent=2)}

Validation error:
{error}

Please return a CORRECTED JSON object for just this sub-domain's input, with the same
field structure as before but fixing the issue described above. Return ONLY the JSON object."""

    raw = call_llm(repair_prompt)
    return parse_llm_json(raw)
