"""
Gate-level schematic renderer for digital_logic.

Owns its own SVG rendering — same pattern as analog_sim's
schemdraw_fallback.py owning a real schematic renderer instead of relying
on the generic 3-box fallback in shared/schematic_renderer.py (which only
ever draws Inputs -> Logic Network -> Output as three abstract stage boxes,
not the actual gate structure).

Layout: topological-depth columns. Primary inputs at depth 0 (leftmost);
a gate's depth = 1 + max depth of its input nets; primary outputs get a
final rightmost column. One box per GATE (not per abstract stage), with
orthogonal wires connecting nets between columns. Reuses the dark-theme
color/box conventions from shared/schematic_renderer.py (COLORS["digital_logic"],
same background/box-fill palette) for visual consistency with the rest of
the app.
"""
from html import escape
from typing import Any, Dict, List, Tuple

_COLOR = "#34d399"  # matches COLORS["digital_logic"] in shared/schematic_renderer.py
_BG = "#0d0f12"
_BOX_FILL = "#111827"
_TEXT = "#d1d5db"

_BOX_W = 130
_BOX_H = 46
_COL_GAP = 170
_ROW_GAP = 66
_MARGIN_X = 60
_MARGIN_TOP = 70


class GateSchematicError(Exception):
    pass


def _short(value: Any, limit: int = 16) -> str:
    value = str(value)
    return value if len(value) <= limit else value[:limit - 1] + "…"


def _pin_box(x: float, y: float, label: str) -> str:
    return (
        f'<rect x="{x}" y="{y}" width="{_BOX_W}" height="{_BOX_H}" rx="8" '
        f'fill="{_BOX_FILL}" stroke="{_COLOR}" stroke-width="2" stroke-dasharray="4,3"/>'
        f'<text x="{x + _BOX_W / 2}" y="{y + _BOX_H / 2 + 5}" text-anchor="middle" '
        f'fill="{_COLOR}" font-size="14" font-weight="700">{escape(_short(label))}</text>'
    )


def _gate_box(x: float, y: float, gate: Dict[str, Any]) -> str:
    label = f'{gate["type"]} ({gate["id"]})'
    return (
        f'<rect x="{x}" y="{y}" width="{_BOX_W}" height="{_BOX_H}" rx="8" '
        f'fill="{_BOX_FILL}" stroke="{_COLOR}" stroke-width="2"/>'
        f'<text x="{x + _BOX_W / 2}" y="{y + _BOX_H / 2 + 5}" text-anchor="middle" '
        f'fill="{_TEXT}" font-size="13" font-weight="600">{escape(label)}</text>'
    )


def _elbow_wire(src: Tuple[float, float], dst: Tuple[float, float]) -> str:
    x1, y1 = src
    x2, y2 = dst
    if abs(y1 - y2) < 1:
        path = f"M{x1} {y1} L{x2} {y2}"
    else:
        mid_x = (x1 + x2) / 2
        path = f"M{x1} {y1} L{mid_x} {y1} L{mid_x} {y2} L{x2} {y2}"
    return f'<path d="{path}" stroke="{_COLOR}" stroke-width="2" fill="none" marker-end="url(#garrow)"/>'


def _wrap_svg(body: str, width: float, height: float, title: str) -> str:
    title_svg = (
        f'<text x="{width / 2}" y="30" text-anchor="middle" fill="#f3f4f6" '
        f'font-size="16" font-weight="700">{escape(title)}</text>'
    ) if title else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="Gate-level schematic">'
        f'<defs><marker id="garrow" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{_COLOR}"/></marker></defs>'
        f'<rect width="{width}" height="{height}" rx="16" fill="{_BG}"/>'
        f'{title_svg}{body}</svg>'
    )


def _compute_depths(gate_netlist: Dict[str, Any]) -> Dict[str, int]:
    """net name -> topological depth. Primary inputs are depth 0; a gate's
    depth is 1 + max depth of its input nets. netlist_builder always lists
    gates in dependency order (a gate's inputs are defined before it), so a
    single left-to-right pass over `gates` suffices."""
    depth: Dict[str, int] = {inp: 0 for inp in gate_netlist["primary_inputs"]}
    for gate in gate_netlist["gates"]:
        d = 1 + max((depth.get(inp, 0) for inp in gate["inputs"]), default=0)
        depth[gate["output"]] = d
    return depth


def render_gate_schematic(gate_netlist: Dict[str, Any]) -> str:
    """
    Returns an SVG string for a gate-level netlist (as produced by
    netlist_builder.build_gate_netlist). Raises GateSchematicError on
    malformed input rather than silently producing a broken diagram —
    callers (pipeline.py) wrap this call in try/except.
    """
    primary_inputs = gate_netlist.get("primary_inputs") or []
    primary_outputs = gate_netlist.get("primary_outputs") or []
    gates = gate_netlist.get("gates") or []

    if not primary_inputs or not primary_outputs:
        raise GateSchematicError("gate_netlist missing primary_inputs/primary_outputs.")

    # Degenerate case: expression collapsed to a bare input/constant, zero
    # gates. Render a single direct wire from input to output.
    if not gates:
        in_label, out_label = str(primary_inputs[0]), str(primary_outputs[0])
        width, height = 520, 200
        x1, x2 = _MARGIN_X, width - _MARGIN_X - _BOX_W
        y = height / 2 - _BOX_H / 2
        body = (
            _pin_box(x1, y, in_label)
            + _pin_box(x2, y, out_label)
            + _elbow_wire((x1 + _BOX_W, y + _BOX_H / 2), (x2, y + _BOX_H / 2))
        )
        return _wrap_svg(body, width, height, "Direct wire (no logic needed)")

    depth = _compute_depths(gate_netlist)
    max_gate_depth = max(depth[g["output"]] for g in gates)
    output_col = max_gate_depth + 1
    n_cols = output_col + 1

    columns: Dict[int, List[Dict[str, Any]]] = {
        0: [{"kind": "input", "net": inp} for inp in primary_inputs],
        output_col: [{"kind": "output", "net": out} for out in primary_outputs],
    }
    for gate in gates:
        columns.setdefault(depth[gate["output"]], []).append(
            {"kind": "gate", "net": gate["output"], "gate": gate}
        )

    max_rows = max(len(v) for v in columns.values())
    width = _MARGIN_X * 2 + n_cols * _COL_GAP
    height = _MARGIN_TOP + max_rows * _ROW_GAP + 40

    net_out_anchor: Dict[str, Tuple[float, float]] = {}   # net -> source (right-edge) point, inputs + gates only
    net_in_anchor: Dict[str, Tuple[float, float]] = {}    # gate's own net -> sink (left-edge) point
    output_pin_anchor: Dict[str, Tuple[float, float]] = {}  # output net -> pin box's own sink point
    boxes: List[str] = []

    for col_idx in range(n_cols):
        nodes = columns.get(col_idx, [])
        col_x = _MARGIN_X + col_idx * _COL_GAP
        col_h = len(nodes) * _ROW_GAP
        start_y = _MARGIN_TOP + (max_rows * _ROW_GAP - col_h) / 2
        for row_idx, node in enumerate(nodes):
            y = start_y + row_idx * _ROW_GAP
            if node["kind"] == "input":
                boxes.append(_pin_box(col_x, y, node["net"]))
                net_out_anchor[node["net"]] = (col_x + _BOX_W, y + _BOX_H / 2)
            elif node["kind"] == "gate":
                boxes.append(_gate_box(col_x, y, node["gate"]))
                net_out_anchor[node["net"]] = (col_x + _BOX_W, y + _BOX_H / 2)
                net_in_anchor[node["net"]] = (col_x, y + _BOX_H / 2)
            else:  # output pin — deliberately NOT written into net_out_anchor,
                   # so it never collides with the gate that produces the
                   # same-named net (netlist_builder renames the final
                   # gate's output to the output_variable name).
                boxes.append(_pin_box(col_x, y, node["net"]))
                output_pin_anchor[node["net"]] = (col_x, y + _BOX_H / 2)

    wires: List[str] = []
    for gate in gates:
        dst = net_in_anchor[gate["output"]]
        for inp in gate["inputs"]:
            src = net_out_anchor.get(inp)
            if src is not None:
                wires.append(_elbow_wire(src, dst))

    for out in primary_outputs:
        src = net_out_anchor.get(out)
        dst = output_pin_anchor.get(out)
        if src is not None and dst is not None:
            wires.append(_elbow_wire(src, dst))

    body = "".join(boxes) + "".join(wires)
    title = f"Gate-Level Schematic ({len(gates)} gate{'s' if len(gates) != 1 else ''})"
    return _wrap_svg(body, width, height, title)
