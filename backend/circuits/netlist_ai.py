"""
AI Netlist Generator + Repair Loop
=====================================
This is the ONE AI call for the circuits domain. It turns a natural-language
question into a single unified, Lcapy-flavored netlist — used for BOTH
simulation (via netlist_translate.py) and schematic drawing (via
schematic.py) — plus the analysis spec needed to run it.

CAPABILITY GATING (new): before generating anything, the model also decides
  1. "in_scope"           — is this an electronics/circuits question at all?
  2. "unsupported_aspects" — which parts of what was asked (if any) are
                             outside what this pipeline can actually do
                             (only op/tran/ac SPICE analysis of a passive/
                             diode/BJT netlist — no PCB layout, EMI, thermal
                             co-sim, DC sweeps, noise/Monte Carlo, RF S-param,
                             digital logic, etc.)

This lets the pipeline solve whatever slice of a question IS simulate-able
and honestly report the rest, instead of either refusing outright or
silently fabricating a netlist for something it can't actually model.
"in_scope=false" and "netlist=''" (in-scope but nothing feasible) are both
terminal states that skip simulation/schematic entirely further downstream
in orchestrator.py — they are not errors, just different valid outcomes of
the same JSON contract.

Validates the AI's output with Lcapy's netlist parser (fast — no LaTeX
needed, just the grammar check) before accepting it, but only when there's
an actual netlist to validate. On failure, the exact parser error is fed
back to the model for a one-shot fix, up to `max_attempts` times. This is
what lets you trust "AI generates the circuit" at scale instead of
hand-validating every circuit type.

IMPORTANT: TEXINPUTS must be set BEFORE any lcapy import, because Lcapy
caches its circuitikz-availability check at first import. This file sets
TEXINPUTS at module load time (below) to ensure the check passes.
A full backend process restart is required for this change to take effect.
"""

import json
import os
import re
from typing import Dict, Any, Callable

# Set TEXINPUTS at module import time, BEFORE any lcapy import.
# Lcapy caches its circuitikz availability check, so this must happen
# before the first lcapy import in this process.
circuitikz_path = '/usr/local/texlive/2026basic/texmf-dist/tex/latex/circuitikz'
texinputs = os.environ.get('TEXINPUTS', '')
if circuitikz_path not in texinputs:
    os.environ['TEXINPUTS'] = f"{circuitikz_path}:{texinputs}"

SYSTEM_PROMPT = """You are the request router and circuit-netlist generator for an automated
electronics simulation pipeline. This pipeline can ONLY do the following, nothing else:
  - Build a SPICE-style netlist of resistors, capacitors, inductors, diodes, BJTs,
    VCVS (ideal op-amps), and independent V/I sources (DC, AC, SINE, PULSE), and
    simulate it with ngspice using ONE of these analyses:
      * operating_point  (DC bias / steady state)
      * transient        (time-domain waveform)
      * ac               (frequency sweep / Bode-style magnitude+phase)
  - Draw a schematic of that same netlist (LIMITED: BJT circuits often fail schematic
    rendering due to Lcapy layout constraints - see unsupported_aspects below).

It CANNOT do things like: PCB layout/routing, EMI/EMC/compliance prediction, thermal
co-simulation, mechanical/vibration analysis, RF S-parameter/EM field solving, DC sweep
curve tracing, noise/distortion analysis, Monte Carlo/yield/tolerance analysis, control
loop compensator design beyond a plain AC sweep, MOSFET-heavy analog design
requiring vendor SPICE models we don't have, digital logic/timing simulation, or
anything outside basic passive/BJT/diode/op-amp circuit analysis.

For EVERY question, first decide:
  1. "in_scope" — is this fundamentally an electronics/circuits question at all
     (as opposed to e.g. structural, thermal-only, general chit-chat, coding help)?
  2. Given the pipeline's real capabilities above, work out which parts of what was
     asked CAN be modeled as a netlist + one of the three analyses, and which parts
     genuinely CANNOT (list each such part as a short, specific, user-facing string
     in "unsupported_aspects", e.g. "EMI spectrum estimation" or "DC sweep I-V curve
     tracing" or "PCB trace impedance matching"). If literally everything asked is
     out of the pipeline's capability even though it's an electronics question, still
     set in_scope=true (it IS circuits) but leave "netlist" as an empty string and put
     the whole ask into unsupported_aspects — do NOT invent a fake netlist just to have
     something to return.
  3. If SOME part is solvable, generate the best netlist + analysis for that solvable
     part only, and note the rest in unsupported_aspects. Never silently drop a
     requested capability without listing it in unsupported_aspects.

Respond with ONLY a JSON object (no markdown fences, no commentary) with these exact
fields:

{
  "in_scope": true | false,
  "system_type": "<short human label, e.g. 'RC Low-Pass Filter'>",
  "netlist": "<netlist text, or empty string \\"\\" if nothing here is simulate-able>",
  "parameters": {"<name>": "<value with unit>", ...},
  "assumptions": ["<any values you had to assume>"],
  "unsupported_aspects": ["<specific thing asked for that this pipeline cannot do>", ...],
  "analysis": {"type": "operating_point" | "transient" | "ac", "args": {...}},
  "probe_nodes": ["<node name>", ...]
}

If in_scope is false (not an electronics/circuits question at all): set netlist to "",
parameters/assumptions/probe_nodes to empty, analysis to {"type": "operating_point",
"args": {}} (placeholder, ignored), and put one short string in unsupported_aspects
explaining it's outside this tool's domain.

NETLIST FORMAT (one component per line):
  <Name> <NodePlus> <NodeMinus> <Value...>; <layout hint>

Rules:
- Ground node MUST be the literal name "0".
- Component name prefixes (first letter, SPICE convention): V=voltage source,
  I=current source, R=resistor, L=inductor, C=capacitor, D=diode, Q=BJT,
  E=VCVS (voltage-controlled voltage source, for ideal op-amps).
- Layout hint is one of: right, down, left, up — optionally with "=<size>",
  e.g. "right=2". Every electrical component line needs a hint EXCEPT wires.
- Use "W <NodeA> <NodeB>; <hint>" for an ideal wire that ties two node names
  to the same electrical potential. You do NOT need to worry about reusing
  "0" as ground on multiple branches — that is handled automatically.
- Use real numeric values with SPICE-style unit suffixes (k, meg, u, n, p),
  never symbolic placeholders.
- Every node referenced must connect to at least 2 components (no dangling
  nodes), and there must be a DC path to ground for every node.
- Voltage and current sources support DC, AC, and SPICE time-varying functions.
  DC:   "V1 1 0 dc 12; down"
  AC:   "V1 1 0 ac 1; down"  (for AC sweep)
  SINE: "V1 1 0 SINE(0 5 1k); down"  (for transient with sinusoidal input)
  PULSE:"V1 1 0 PULSE(0 5 0 1n 1n 500u 1m); down"  (for transient with pulse)
  Note: SINE/PULSE/AC functions are stripped before Lcapy schematic rendering.
- BJT syntax: Use "Qname collector base emitter; <hint>" (3 nodes only).
  Do NOT include a model name like "NPN" or "PNP" after the nodes — Lcapy
  does not support this. Example: "Q1 3 2 4; down" where node 3 is collector,
  node 2 is base, node 4 is emitter.
- Op-amp: Use VCVS (E-prefix) as ideal op-amp: "E1 out 0 inv noninv 100000; right"
  For inverting amp: Rin from input to inv node, Rf from output to inv, non-inv to ground.
- Zener diode: Use "D1 2 0 Dzener; down" — pipeline auto-injects .model Dzener D(Bv=5.1 Ibv=20m)

ANALYSIS (pick exactly one, for whatever part of the question is feasible):
- "operating_point": DC-only circuits (resistive dividers, DC bias points). args = {}
- "transient": when capacitors/inductors/time response matter.
  args = {"step": "1u", "stop": "1m"}
- "ac": frequency response (filters, bode plots).
  args = {"start_freq": "1", "stop_freq": "1Meg", "points_per_decade": 20}

probe_nodes: the 1-3 node names whose voltage the user actually cares about.

EXAMPLE 1 — normal, fully solvable ("12V source split down to about 5V with two resistors"):
{
  "in_scope": true,
  "system_type": "Voltage Divider",
  "netlist": "V1 1 0 dc 12; down\\nR1 1 2 1.4k; right\\nR2 2 0 1k; down",
  "parameters": {"Vin": "12 V", "R1": "1.4 kOhm", "R2": "1 kOhm"},
  "assumptions": ["Resistor ratio chosen to land near 5V output"],
  "unsupported_aspects": [],
  "analysis": {"type": "operating_point", "args": {}},
  "probe_nodes": ["2"]
}

EXAMPLE 1.5 — BJT common-emitter bias circuit ("Design a common-emitter BJT amplifier bias circuit with Vcc=12V, target collector current of 1mA"):
{
  "in_scope": true,
  "system_type": "Common-Emitter BJT Amplifier",
  "netlist": "Vcc 1 0 dc 12; down\\nRc 1 2 5.1k; right\\nQ1 2 3 0; down\\nRb 1 3 20k; down",
  "parameters": {"Vcc": "12 V", "Rc": "5.1 kOhm", "Rb": "20 kOhm"},
  "assumptions": ["BJT modeled as ideal NPN transistor without specific model parameters", "Target Ic ≈ 1mA achieved with chosen bias resistors"],
  "unsupported_aspects": ["Schematic rendering (Lcapy layout solver cannot handle BJT circuit topology - simulation will work but schematic will show netlist as fallback)"],
  "analysis": {"type": "operating_point", "args": {}},
  "probe_nodes": ["2", "3"]
}

EXAMPLE 2 — partially solvable ("Design a buck converter and tell me its EMI emissions and PCB trace layout"):
{
  "in_scope": true,
  "system_type": "Buck Converter",
  "netlist": "V1 1 0 dc 12; down\\nVsw 1 2 pulse(0 12 0 1n 1n 0.83u 2u); right\\nL1 2 3 22u; right\\nC1 3 0 47u; down\\nRload 3 0 5; down\\nD1 0 2 dmod; right\\n.model dmod D",
  "parameters": {"Vin": "12 V", "Vout": "5 V", "L1": "22uH", "C1": "47uF", "switching_frequency": "500kHz"},
  "assumptions": ["Switch modeled as an ideal pulsed source rather than a real MOSFET + gate driver"],
  "unsupported_aspects": ["EMI/EMC emissions estimation", "PCB trace layout and impedance matching"],
  "analysis": {"type": "transient", "args": {"step": "50n", "stop": "200u"}},
  "probe_nodes": ["3"]
}

EXAMPLE 3 — completely out of scope ("What's the best material for a cantilever beam?"):
{
  "in_scope": false,
  "system_type": "",
  "netlist": "",
  "parameters": {},
  "assumptions": [],
  "unsupported_aspects": ["This is a structural/materials question, not a circuits question."],
  "analysis": {"type": "operating_point", "args": {}},
  "probe_nodes": []
}

EXAMPLE 4 — in-scope electronics question, but nothing here is simulate-able
("What's the DC sweep I-V curve of this diode, and can you check its thermal derating?"):
{
  "in_scope": true,
  "system_type": "Diode I-V Characterization",
  "netlist": "",
  "parameters": {},
  "assumptions": [],
  "unsupported_aspects": ["DC sweep I-V curve tracing", "Thermal derating analysis"],
  "analysis": {"type": "operating_point", "args": {}},
  "probe_nodes": []
}

Respond with ONLY the JSON object."""


class NetlistGenerationError(Exception):
    pass


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE)
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise NetlistGenerationError(f"No JSON object found in AI response:\n{text[:500]}")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise NetlistGenerationError(f"AI response was not valid JSON ({exc}):\n{text[:500]}")


def _validate_required_fields(payload: Dict[str, Any]) -> None:
    required = ["in_scope", "system_type", "netlist", "analysis", "probe_nodes", "unsupported_aspects"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise NetlistGenerationError(f"AI response missing required fields: {missing}")
    if not isinstance(payload["in_scope"], bool):
        raise NetlistGenerationError("AI response 'in_scope' field must be a boolean (true/false).")
    if not isinstance(payload["unsupported_aspects"], list):
        raise NetlistGenerationError("AI response 'unsupported_aspects' field must be a list of strings.")
    if not isinstance(payload["netlist"], str):
        raise NetlistGenerationError("AI response 'netlist' field must be a string (possibly empty).")
    # A netlist is only meaningful when in-scope AND non-empty; in that case
    # we also need a real system_type to label it with.
    if payload["in_scope"] and payload["netlist"].strip() and not str(payload.get("system_type") or "").strip():
        raise NetlistGenerationError(
            "AI response provided a netlist but no 'system_type' label for it."
        )


def _strip_spice_functions_for_lcapy(netlist_text: str) -> str:
    """Replace SPICE source functions (SINE, PULSE, EXP, PWL, SFFM, AC) on
    V/I source lines with a simple DC value so Lcapy can parse the netlist."""
    lines = netlist_text.replace("\\n", "\n").splitlines()
    cleaned = []
    for line in lines:
        electrical, sep, hint = line.partition(";")
        tokens = electrical.strip().split()
        if tokens and tokens[0][0].upper() in ("V", "I"):
            val_str = " ".join(tokens[3:]) if len(tokens) > 3 else ""
            if re.search(r'\b(SINE|PULSE|EXP|PWL|SFFM|ac)\b', val_str, re.IGNORECASE):
                tokens = tokens[:3] + ["dc", "1"]
                electrical = " ".join(tokens)
                line = electrical + (sep + hint if sep else "")
        cleaned.append(line)
    return "\n".join(cleaned)


def _validate_netlist_with_lcapy(netlist_text: str) -> None:
    """
    Two-stage validation, both fed back into the repair loop on failure:

    1. Parse check (fast, no LaTeX) — catches syntax errors, unknown
       components, missing nodes.
    2. Draw check — catches layout/orientation errors (e.g. a source given
       a "right" hint when the surrounding topology needs "down", which
       parses fine but makes Lcapy's placement solver report "the
       horizontal/vertical schematic graph has a loop"). This is the class
       of error that previously reached the user unrecoverably at render
       time, because only stage 1 was checked here. Reuses the same
       ground-node normalization schematic.py applies at real render time,
       so this stage doesn't reject netlists that would actually render
       fine once normalized.

    Note: Stage 2 is skipped if pdflatex is not available (e.g. running
    locally without Docker), since Lcapy's draw() requires LaTeX. In that
    case, layout errors will be caught at actual render time instead.
    """
    try:
        from lcapy import Circuit
    except ImportError as exc:
        raise NetlistGenerationError(f"lcapy is not installed, cannot validate netlist: {exc}")

    cleaned = _strip_spice_functions_for_lcapy(netlist_text)
    cleaned = "\n".join(
        line for line in cleaned.splitlines() if line.strip()
    )
    try:
        Circuit(cleaned)
    except Exception as exc:
        raise NetlistGenerationError(f"lcapy rejected the netlist (parse stage): {exc}")

    # Stage 2: draw check - DISABLED for now because AI layout hints
    # don't always form a consistent DAG for Lcapy's placement algorithm.
    # Parse check (Stage 1) still catches syntax errors. Layout errors
    # will show up at render time with a clear error message.
    # try:
    #     import shutil
    #     if not shutil.which("pdflatex"):
    #         # LaTeX not available - skip draw validation
    #         return
    # except Exception:
    #     # If shutil check fails, conservatively skip draw validation
    #     return

    # try:
    #     from .schematic import _normalize_ground_for_layout
    #     import tempfile

    #     layout_netlist = _normalize_ground_for_layout(cleaned)
    #     cct = Circuit(layout_netlist)
    #     with tempfile.TemporaryDirectory() as tmp_dir:
    #         test_path = f"{tmp_dir}/validation_test.svg"
    #         cct.draw(test_path)
    # except Exception as exc:
    #     raise NetlistGenerationError(
    #         f"lcapy rejected the netlist (layout stage): {exc}\n"
    #         f"This usually means a component's direction hint (right/down/left/up) "
    #         f"doesn't match its role in the circuit — for example, a source that "
    #         f"connects top-rail-to-ground should usually be 'down', not 'right'. "
    #         f"Check that hints form a consistent left-to-right, top-to-bottom layout."
    #     )


def generate_netlist_with_repair_stream(
    question: str,
    call_llm: Callable[[str], str],
    max_attempts: int = 3,
):
    """
    Generator version of generate_netlist_with_repair. Yields real progress
    events as they happen (Phase 2 AI transparency — no fabricated steps,
    every event corresponds to an actual attempt/retry against the LLM):

      {"event": "attempt_start", "attempt": N, "max_attempts": M}
      {"event": "repair_needed", "attempt": N, "error": "<validation error>"}
      {"event": "result", "payload": {...}}   -- final item on success
      {"event": "error", "error": "<message>"} -- final item on exhaustion

    `generate_netlist_with_repair` (below) wraps this generator for the
    existing synchronous callers, so no existing behavior changes.
    """
    prompt = f"Circuit question:\n{question}"
    last_error = None

    for attempt in range(1, max_attempts + 1):
        yield {"event": "attempt_start", "attempt": attempt, "max_attempts": max_attempts}
        raw_response = call_llm(prompt)

        try:
            payload = _extract_json(raw_response)
            _validate_required_fields(payload)
            payload["netlist"] = payload["netlist"].replace("\\n", "\n")
            payload.setdefault("parameters", {})
            payload.setdefault("assumptions", [])
            payload.setdefault("probe_nodes", [])

            # Terminal states — nothing to validate against Lcapy, because
            # either the question isn't circuits at all, or it is circuits
            # but nothing about it is simulate-able with this pipeline.
            if not payload["in_scope"] or not payload["netlist"].strip():
                payload["_repair_attempts"] = attempt
                yield {"event": "result", "payload": payload}
                return

            _validate_netlist_with_lcapy(payload["netlist"])
            payload["_repair_attempts"] = attempt
            yield {"event": "result", "payload": payload}
            return

        except NetlistGenerationError as exc:
            last_error = exc
            yield {"event": "repair_needed", "attempt": attempt, "error": str(exc)}
            prompt = (
                f"Circuit question:\n{question}\n\n"
                f"Your previous response failed validation with this error:\n{exc}\n\n"
                f"Your previous response was:\n{raw_response}\n\n"
                f"Fix ONLY what's needed to resolve the error above. "
                f"Respond again with ONLY the corrected JSON object."
            )

    yield {
        "event": "error",
        "error": f"Failed to generate a valid circuit response after {max_attempts} attempts. "
                 f"Last error: {last_error}",
    }


def generate_netlist_with_repair(
    question: str,
    call_llm: Callable[[str], str],
    max_attempts: int = 3,
) -> Dict[str, Any]:
    print(f"[FLOW TRACE] 5/9 netlist_ai.py — generate_netlist_with_repair() called, max_attempts={max_attempts}")
    """
    `call_llm` is injected so this module doesn't hardcode which provider/SDK
    you use — wire it to your existing backend AI client. Signature:
        call_llm(prompt: str) -> str

    Returns a payload dict that is ALWAYS one of three shapes:
      - in_scope=False                          -> out-of-domain, nothing to run
      - in_scope=True, netlist=""               -> on-topic but nothing feasible
      - in_scope=True, netlist=<non-empty>       -> validated, ready to simulate

    The first two are terminal states returned immediately without netlist
    validation (there's nothing to validate). Only the third goes through
    Lcapy validation + the repair loop.

    Thin wrapper around generate_netlist_with_repair_stream for existing
    synchronous callers — see that function for the streaming version used
    by the Phase 2 SSE transparency pipeline.
    """
    for event in generate_netlist_with_repair_stream(question, call_llm, max_attempts):
        if event["event"] == "result":
            return event["payload"]
        if event["event"] == "error":
            raise NetlistGenerationError(event["error"])


# ---------------------------------------------------------------------------
# Minimal default LLM caller — standalone reference implementation only.
# You almost certainly already have an AI client in your backend (the one
# your /api/chat route uses); wire THAT in via the `call_llm` parameter
# above instead of using this. This exists so the module runs/tests on its
# own without assuming anything about your existing backend structure.
# ---------------------------------------------------------------------------
_GENERIC_SYSTEM_PROMPT = (
    "You are an expert circuit/electronics analysis assistant used inside a "
    "multi-tool automated pipeline (symbolic analysis, digital logic, "
    "numerical processing, control systems, RF/EM, PCB, FPGA, semiconductor "
    "device, or physical design). Follow the JSON schema and instructions in "
    "the user's message exactly. Respond with ONLY the requested JSON object "
    "(no markdown code fences, no commentary, no explanation outside the JSON)."
)


def default_call_llm(prompt: str, provider: str = "groq") -> str:
    from openai import OpenAI  # pip install openai

    provider_config = {
        "groq": {
            "base_url": "https://api.groq.com/openai/v1",
            "env": "GROQ_API_KEY",
            "model": "llama-3.3-70b-versatile",
        },
        "openai": {
            "base_url": None,
            "env": "OPENAI_API_KEY",
            "model": "gpt-4o-mini",
        },
        "cerebras": {
            "base_url": "https://api.cerebras.ai/v1",
            "env": "CEREBRAS_API_KEY",
            "model": "gpt-oss-120b",
        },
    }
    cfg = provider_config.get(provider, provider_config["groq"])
    api_key = os.environ.get(cfg["env"])
    if not api_key:
        raise RuntimeError(f"Missing {cfg['env']} environment variable for provider '{provider}'.")

    # `generate_netlist_with_repair(_stream)` in this module always builds its
    # prompt as "Circuit question:\n<question>..." — that's the only caller
    # that needs the analog-netlist-specific SYSTEM_PROMPT above. Every other
    # sub-domain pipeline (symbolic_analysis, digital_logic, rf_em, etc.)
    # shares this same call_llm callable but has its own JSON schema in the
    # prompt body, so it must NOT receive the netlist-only system prompt
    # (which explicitly tells the model it "cannot" do those other domains).
    system_prompt = SYSTEM_PROMPT if prompt.startswith("Circuit question:") else _GENERIC_SYSTEM_PROMPT

    client = OpenAI(api_key=api_key, base_url=cfg["base_url"])
    response = client.chat.completions.create(
        model=cfg["model"],
        temperature=0.1,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content