from html import escape
from typing import Any, Dict, List, Tuple


COLORS = {
    "analog_sim": "#60a5fa", "symbolic_analysis": "#a78bfa",
    "digital_logic": "#34d399", "numerical_processing": "#f59e0b",
    "control_systems": "#38bdf8", "rf_em": "#f472b6",
    "pcb_realization": "#fb7185", "fpga_realization": "#22d3ee",
    "semiconductor_device": "#c084fc", "physical_design": "#a3e635",
}


def _short(value: Any, limit: int = 38) -> str:
    value = str(value if value is not None else "")
    return value if len(value) <= limit else value[:limit - 1] + "…"


def _metrics(result: Dict[str, Any], limit: int = 3) -> List[str]:
    return [f"{_short(m.get('name'), 20)}: {_short(m.get('value'), 22)}"
            for m in (result.get("metrics") or [])[:limit]]


def _nodes(sub_domain: str, result: Dict[str, Any], plan: Dict[str, Any]) -> List[Tuple[str, List[str]]]:
    system = result.get("system_type") or plan.get("system_type") or "Configured model"
    if sub_domain == "digital_logic":
        variables = ", ".join(map(str, plan.get("input_variables") or ["A", "B"]))
        expression = result.get("simplified_expression") or result.get("boolean_expression") or plan.get("boolean_expression") or "Logic"
        return [("Inputs", [variables]), ("Logic Network", [expression]), ("Output", [plan.get("output_variable") or "OUT", f"Truth rows: {len(result.get('truth_table') or [])}"])]
    if sub_domain == "control_systems":
        return [("Reference", ["r(t)"]), ("Controller / Plant", [result.get("transfer_function") or system]), ("Response", [result.get("stability") or "Analyzed", *_metrics(result, 1)])]
    if sub_domain == "symbolic_analysis":
        values = plan.get("numeric_values") or plan.get("symbols") or {}
        symbols = ", ".join(f"{k}={v}" for k, v in list(values.items())[:4]) or "symbolic parameters"
        return [("Circuit Model", [system, symbols]), ("Symbolic Solver", [result.get("transfer_function") or "H(s)"]), ("Derived Response", _metrics(result) or ["Closed-form result"])]
    labels = {
        "numerical_processing": ("Input Data", "Numerical Operation", "Computed Output"),
        "rf_em": ("RF Source", "EM Structure / Network", "S-Parameter Response"),
        "pcb_realization": ("Design Rules", "PCB Stack / Routing", "Manufacturing Output"),
        "fpga_realization": ("RTL Inputs", "Synthesis / Place & Route", "FPGA Resources"),
        "semiconductor_device": ("Device Bias", "Semiconductor Device", "Electrical Response"),
        "physical_design": ("Netlist / Constraints", "Physical Layout", "Timing / Parasitics"),
        "analog_sim": ("Source", "Circuit Network", "Measured Output"),
    }
    left, middle, right = labels.get(sub_domain, ("Inputs", "Analysis", "Results"))
    details = [f"{k}: {v}" for k, v in plan.items()
               if k not in {"system_type", "metrics", "assumptions", "plain_summary", "python_code"}
               and not isinstance(v, (dict, list))][:2]
    return [(left, details or [system]), (middle, [system, result.get("solver_name") or "Solver"]), (right, _metrics(result) or [result.get("plain_summary") or "Analysis complete"])]


def _box(x: int, title: str, lines: List[str], color: str) -> str:
    body = [f'<rect x="{x}" y="105" width="250" height="130" rx="12" fill="#111827" stroke="{color}" stroke-width="2"/>',
            f'<text x="{x + 16}" y="135" fill="{color}" font-size="15" font-weight="700">{escape(_short(title, 28))}</text>']
    for index, line in enumerate(lines[:4]):
        body.append(f'<text x="{x + 16}" y="163" fill="#d1d5db" font-size="12">{escape(_short(line))}</text>')
        if index:
            body[-1] = body[-1].replace('y="163"', f'y="{163 + index * 20}"')
    return "".join(body)


def render_domain_schematic(sub_domain: str, result: Dict[str, Any], plan: Dict[str, Any] = None) -> str:
    plan = plan if isinstance(plan, dict) else {}
    color = COLORS.get(sub_domain, "#60a5fa")
    nodes = _nodes(sub_domain, result, plan)
    boxes = "".join(_box(x, title, lines, color) for x, (title, lines) in zip((50, 365, 680), nodes))
    arrows = ''.join(f'<path d="M{x1} 170 L{x2} 170" stroke="{color}" stroke-width="2" marker-end="url(#arrow)"/>' for x1, x2 in ((300, 355), (615, 670)))
    title = escape(_short(result.get("system_type") or plan.get("system_type") or sub_domain.replace("_", " ").title(), 70))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 340" role="img" aria-label="{title} schematic"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{color}"/></marker></defs><rect width="980" height="340" rx="16" fill="#0d0f12"/><text x="490" y="55" text-anchor="middle" fill="#f3f4f6" font-size="20" font-weight="700">{title}</text>{boxes}{arrows}</svg>'


def ensure_schematic(sub_domain: str, result: Dict[str, Any], plan: Dict[str, Any] = None) -> Dict[str, Any]:
    if result.get("success", True) and result.get("status") not in {"failed", "out_of_scope"} and not result.get("schematic_svg"):
        result["schematic_svg"] = render_domain_schematic(sub_domain, result, plan)
        result["schematic_error"] = None
    return result
