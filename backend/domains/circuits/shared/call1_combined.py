"""
Call 1 — Combined Sub-Domain Selection + Input Generation
=========================================================
ONE AI call that does both:
  1. Decides which sub-domain(s) the question needs.
  2. Generates the solver-ready input for each selected sub-domain.

For solver-backed sub-domains (analog_sim, symbolic_analysis, digital_logic,
numerical_processing, control_systems), this produces the input that the real
solver will consume (netlist, boolean expression, SymPy plan, etc.).

For LLM-only sub-domains (rf_em, pcb_realization, fpga_realization,
semiconductor_device, physical_design), this same call produces the final
computed result directly — no separate execution step exists for those.

The repair loop (re-prompting on validation failure) is an exception path
and does NOT count toward the normal 2-call baseline.
"""
import json
import re
from typing import Dict, Any, Callable, List, Tuple

from .llm_utils import parse_llm_json
from .tool_selector import list_capabilities


# Sub-domains backed by real solvers — Call 1 generates input, real execution happens after
_SOLVER_BACKED = {"analog_sim", "symbolic_analysis", "digital_logic",
                  "numerical_processing", "control_systems"}

# LLM-only sub-domains — Call 1 produces the final result directly
_LLM_ONLY = {"rf_em", "pcb_realization", "fpga_realization",
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

## fpga_realization (LLM-only)
Same format as rf_em.

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

Respond with ONLY a JSON object (no markdown fences, no commentary) with this structure:
{{
  "selections": [
    {{"sub_domain": "<name>", "tool": "<tool>", "reason": "<why>", "run_parallel": true}}
  ],
  "inputs": {{
    "<sub_domain_name>": {{<...input fields for that sub-domain...>}}
  }}
}}

If the question is not an engineering/circuits question at all, return:
{{"selections": [], "inputs": {{}}, "out_of_scope": true}}

User question: {question}"""


def generate_selection_and_inputs(
    question: str,
    call_llm: Callable[[str], str],
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
    # capabilities is embedded in the prompt template above, but we also pass
    # it separately in case the template needs it — currently it's inline.

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

    thinking.append(f"Call 1 selected {len(selections)} sub-domain(s): "
                    + ", ".join(s.get("sub_domain", "?") for s in selections))

    for sel in selections:
        sd = sel.get("sub_domain", "?")
        tool = sel.get("tool", "?")
        reason = sel.get("reason", "")
        thinking.append(f"  {sd}/{tool}: {reason}")

    return {
        "selections": selections,
        "inputs": inputs,
        "out_of_scope": out_of_scope,
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
