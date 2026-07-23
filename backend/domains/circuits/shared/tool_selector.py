"""
Tool Selector
===============
AI-driven classification of which sub-domain(s) and tool(s) should handle a
user question. Phase 3 supports multiple sub-domain selections per question
with parallel or sequential execution semantics.

PATCH (CS-01/DL-01 fix):
  1. `SubDomainCapability.matches` now matches keywords on word boundaries
     (with optional trailing "s" for plurals) instead of raw substring
     search. The old `kw in question_lower` check let short tokens like
     "ac"/"dc" match inside unrelated words (e.g. "ac" inside "practice"),
     silently inflating analog_sim's score on non-circuit questions.
  2. digital_logic's keyword list gained Karnaugh-map / SOP / POS
     synonyms ("karnaugh", "karnaugh map", "sum of products",
     "sum-of-products", "product of sums", "minterm", "maxterm",
     "de morgan") so boolean simplification questions route reliably
     even when they don't use the literal string "k-map".
  3. `_keyword_fallback_select` no longer defaults to analog_sim/ngspice
     when nothing matches. An empty keyword signal now means "ambiguous",
     not "assume it's a circuit" — callers must not silently run the
     legacy analog SPICE pipeline on that basis.
  4. New `score_question()` — a pure, deterministic per-sub-domain keyword
     score used by call1_combined.py as a cross-check/audit signal against
     the LLM's own (primary) classification. It is never the sole
     classifier; see the routing guard in call1_combined.py.
"""
import json
import re
from typing import List, Dict, Any, Callable, Optional


class ToolSelection:
    """One selected sub-domain + specific tool."""
    def __init__(self, sub_domain: str, tool: str, reason: str = "", run_parallel: bool = True):
        self.sub_domain = sub_domain
        self.tool = tool
        self.reason = reason
        self.run_parallel = run_parallel

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sub_domain": self.sub_domain,
            "tool": self.tool,
            "reason": self.reason,
            "run_parallel": self.run_parallel,
        }


class SelectionResult:
    def __init__(self, selections: List[ToolSelection], thinking: List[str] = None):
        self.selections = selections
        self.thinking = thinking or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "selections": [s.to_dict() for s in self.selections],
            "thinking": self.thinking,
        }


# ── Sub-domain capability registry ──────────────────────────────────────────

class SubDomainCapability:
    """Describes a sub-domain's capabilities for the selector."""
    def __init__(
        self,
        sub_domain: str,
        tools: List[str],
        description: str,
        keywords: List[str],
        can_run_parallel: bool = True,
    ):
        self.sub_domain = sub_domain
        self.tools = tools
        self.description = description
        self.keywords = [k.lower() for k in keywords]
        self.can_run_parallel = can_run_parallel
        # Word-boundary patterns (optional trailing "s" for plurals) — see
        # module docstring point 1. Pre-compiled once per capability.
        self._patterns = [re.compile(r"\b" + re.escape(k) + r"s?\b") for k in self.keywords]

    def matches(self, question_lower: str) -> int:
        return sum(1 for pat in self._patterns if pat.search(question_lower))


_CAPABILITIES: Dict[str, SubDomainCapability] = {}


def register_capability(cap: SubDomainCapability) -> None:
    _CAPABILITIES[cap.sub_domain] = cap


def list_capabilities() -> List[Dict[str, Any]]:
    return [
        {
            "sub_domain": c.sub_domain,
            "tools": c.tools,
            "description": c.description,
            "keywords": c.keywords,
            "can_run_parallel": c.can_run_parallel,
        }
        for c in _CAPABILITIES.values()
    ]


# Register built-in sub-domains
register_capability(SubDomainCapability(
    sub_domain="analog_sim",
    tools=["ngspice", "xyce", "gnucap"],
    description="Analog circuit simulation: SPICE netlist generation, DC/AC/transient analysis, schematic rendering.",
    keywords=["resistor", "capacitor", "inductor", "diode", "transistor", "op-amp", "opamp",
              "voltage", "current", "circuit", "netlist", "spice", "ngspice", "filter",
              "divider", "converter", "amplifier", "impedance", "ohm", "farad", "henry",
              "dc", "ac", "transient", "frequency", "bode", "gain", "bandwidth",
              "oscillator", "wien bridge", "clipper", "doubler", "rectifier", "zener",
              "common-emitter", "bias", "operating point", "sinusoidal", "pulse"],
))

register_capability(SubDomainCapability(
    sub_domain="symbolic_analysis",
    tools=["sympy"],
    description="Symbolic (closed-form) circuit analysis: transfer functions, symbolic node voltages, Laplace domain.",
    keywords=["transfer function", "symbolic", "laplace", "s-domain", "s domain",
              "closed-form", "analytical", "impedance expression", "h(s)", "g(s)",
              "characteristic equation", "pole", "zero", "root locus"],
))

register_capability(SubDomainCapability(
    "digital_logic", ["yosys", "icarus", "verilator"],
    "Digital logic: truth tables, boolean algebra, HDL synthesis.",
    ["truth table", "boolean", "logic gate", "nand", "nor", "xor", "k-map", "karnaugh",
     "karnaugh map", "sum of products", "sum-of-products", "product of sums",
     "minterm", "maxterm", "de morgan", "flip flop", "flip-flop", "mux", "decoder",
     "adder", "counter", "binary", "vcd", "waveform", "jk", "dff", "register", "clock",
     "sequential", "verilog", "vhdl"],
))
register_capability(SubDomainCapability("numerical_processing", ["scipy", "numpy"], "Numerical: FFT, convolution, optimization.", ["fft", "convolution", "numerical integration", "optimization", "fir", "iir"]))
register_capability(SubDomainCapability("control_systems", ["python_control", "slycot"], "Control: Bode, step response, PID, state-space.", ["pid", "bode", "step response", "stability", "gain margin", "phase margin", "feedback", "closed loop", "state space", "compensator"]))
register_capability(SubDomainCapability("rf_em", ["openems", "gnuradio"], "RF/EM: S-parameters, antennas, transmission lines.", ["s-parameter", "smith chart", "transmission line", "antenna", "microwave", "rf", "vswr", "microstrip", "waveguide", "signal integrity", "patch antenna", "radiation pattern", "substrate", "permittivity"]))
register_capability(SubDomainCapability("pcb_realization", ["kicad"], "PCB: layout, DRC, trace impedance, stackup.", ["pcb", "layout", "trace", "via", "drc", "fr4", "stackup", "gerber", "copper"]))
register_capability(SubDomainCapability("fpga_realization", ["nextpnr"], "FPGA: place & route, bitstream readiness.", ["fpga", "verilog", "vhdl", "hdl", "lut", "synthesis", "timing", "place and route", "bitstream"]))
register_capability(SubDomainCapability("semiconductor_device", ["devsim"], "Semiconductor: MOSFET, BJT, PN junction, TCAD.", ["mosfet", "bjt", "diode physics", "pn junction", "threshold voltage", "doping", "drain current", "carrier", "mobility", "cmos", "nmos", "pmos", "tcad", "i-v", "propagation delay", "load capacitance", "channel length", "gate width"]))
register_capability(SubDomainCapability("physical_design", ["openroad", "magic"], "Physical design: parasitics, extraction, layout.", ["parasitic", "rc extraction", "coupling capacitance", "floorplan", "placement", "drc", "lvs", "gdsii", "timing analysis", "nand gate", "cmos layout", "propagation delay", "tphl", "tplh", "delay"]))


# ── LLM prompt for multi-tool selection ─────────────────────────────────────

_SELECTION_PROMPT = """You are a circuit analysis expert. Given a user question, select which sub-domain(s) and tool(s) should handle it.

Available sub-domains:
{capabilities}

Return a JSON array of selections. Each selection must have:
- "sub_domain": one of the available sub_domain names
- "tool": one of the tools listed for that sub_domain
- "reason": a short explanation
- "run_parallel": true if this can run at the same time as other selections, false if it depends on another's output

If only one sub-domain is needed, return a single-element array.
If the question has numeric component values and needs simulation, select analog_sim with ngspice.
If the question asks for symbolic/analytical expressions without numeric values, select symbolic_analysis.

Return ONLY the JSON array, no other text."""


def score_question(question: str) -> Dict[str, int]:
    """
    Deterministic, LLM-free keyword score per sub-domain for a question.

    Pure function — no network, no randomness. Used as a cross-check/audit
    signal against the LLM's own classification (see the routing guard in
    call1_combined.py). This is intentionally NOT used as the sole/primary
    classifier: the LLM is smarter than keyword matching for artifact-based
    tie-breaks (see the TIE-BREAK RULE in the Call 1 prompt), so this score
    is only consulted to catch a specific, well-defined failure mode —
    analog_sim being selected for a question with no real circuit content.
    """
    q = question.lower()
    return {sd: cap.matches(q) for sd, cap in _CAPABILITIES.items()}


def _keyword_fallback_select(question_lower: str) -> List[ToolSelection]:
    """
    Score-based fallback when no LLM is available.

    IMPORTANT (CS-01/DL-01 fix): this used to default to
    ToolSelection("analog_sim", "ngspice", "No keyword match — defaulting
    to analog SPICE pipeline") whenever NO keyword matched anything at
    all. That silently routed arbitrary, possibly non-circuit questions
    into the legacy analog SPICE pipeline. An empty keyword signal now
    means the classification is ambiguous — the caller must not assume a
    circuit exists just because nothing else matched either.
    """
    scored = []
    for sd, cap in _CAPABILITIES.items():
        score = cap.matches(question_lower)
        if score > 0:
            scored.append((score, sd, cap))
    scored.sort(key=lambda x: x[0], reverse=True)

    if not scored:
        return []  # ambiguous — do NOT silently default to analog_sim

    selections = []
    for score, sd, cap in scored:
        if score >= 2 or (not selections):
            tool = cap.tools[0]
            selections.append(ToolSelection(sd, tool,
                f"Keyword match (score={score}) for {sd}",
                run_parallel=cap.can_run_parallel))
    return selections


def select_tools(
    question: str,
    call_llm: Callable[[str], str] = None,
) -> SelectionResult:
    """
    Phase 3 multi-tool selector. If call_llm is provided, uses an LLM call
    to classify the question against registered sub-domain capabilities.
    Falls back to keyword scoring when no LLM is available.
    """
    question_lower = question.lower()
    thinking: List[str] = []

    if call_llm is not None:
        caps_text = "\n".join(
            f"- {c['sub_domain']}: tools={c['tools']}, {c['description']}"
            for c in list_capabilities()
        )
        prompt = _SELECTION_PROMPT.format(capabilities=caps_text)
        full_prompt = f"{prompt}\n\nUser question: {question}"

        try:
            raw = call_llm(full_prompt)
            text = raw.strip() if isinstance(raw, str) else str(raw).strip()
            # Extract JSON array from response
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                items = json.loads(match.group())
                selections = []
                for item in items:
                    sd = item.get("sub_domain", "analog_sim")
                    tool = item.get("tool", "ngspice")
                    reason = item.get("reason", "")
                    rp = item.get("run_parallel", True)
                    selections.append(ToolSelection(sd, tool, reason, run_parallel=rp))
                if selections:
                    thinking.append(f"LLM classified question into {len(selections)} sub-domain(s).")
                    for s in selections:
                        thinking.append(f"Selected {s.sub_domain}/{s.tool}: {s.reason}")
                    return SelectionResult(selections, thinking)
        except Exception as e:
            thinking.append(f"LLM selection failed ({e}), falling back to keyword scoring.")

    # Keyword fallback
    selections = _keyword_fallback_select(question_lower)
    if not selections:
        thinking.append(
            "No keyword match and no LLM available — classification is ambiguous; "
            "NOT defaulting to the analog circuits pipeline."
        )
    else:
        thinking.append("Classified using keyword scoring (no LLM or LLM failed).")
        for s in selections:
            thinking.append(f"Selected {s.sub_domain}/{s.tool}: {s.reason}")
    return SelectionResult(selections, thinking)
