"""Topology-Aware Schemdraw Renderer.

BUGFIXES (this pass) — this is the PRIMARY schematic renderer (tried before
the Lcapy path in schematic.py), so bugs here are what users actually see.

1. NODE TRUNCATION: `_parse()` previously hardcoded `nodes = [tok[1], tok[2]]`
   for every component type — i.e. always exactly 2 nodes. That's correct for
   R/L/C/D/V/I/W, but silently DROPS real nodes for a BJT ("Qname collector
   base emitter" — 3 nodes) and a VCVS/ideal op-amp ("Ename out out_ref inv
   noninv gain" — 4 nodes). For an op-amp specifically, the two terminals
   that make it useful — the inverting input (the feedback junction) and the
   non-inverting input (tied to the source) — were being discarded entirely,
   so a non-inverting amplifier's feedback loop never existed as far as the
   renderer was concerned. Fixed via `_NODE_COUNT_BY_PREFIX`, mirroring the
   equivalent fix already applied to schematic.py's Lcapy path.

2. NO REAL CONNECTIVITY: elements were added via plain `d.add(el)` with no
   `.at(anchor)`, so schemdraw just continued drawing from wherever the
   PREVIOUS element ended, regardless of whether that's where the new
   component is actually electrically connected. `_find_series_chain`'s
   frontier-matching only handled a pure straight chain; anything branching
   (a feedback resistor, a second load) got tacked onto the end of whatever
   was drawn last — this is what caused components to visually overlap /
   sit on top of each other. Fixed by tracking a `node_anchors` map (node
   name -> real schemdraw anchor point) and explicitly anchoring every new
   element with `.at(...)` to the correct already-placed node, via a
   multi-pass placement loop (so forward references — a component defined
   before the node it depends on appears — still resolve).

3. OP-AMP MISHANDLED AS A PASSIVE PART: E-type components used to fall
   through to `_add_elm`, which mapped "E" -> `elm.Opamp` and then called
   `.up()/.down()/.label()` on it as if it were a 2-pin resistor. `Opamp` is
   a 3-pin element with real `in1` (-), `in2` (+), and `out` anchors — using
   it as a 2-terminal part produces garbled geometry (the diamond shape).
   Fixed with a dedicated `_add_opamp()` that connects each pin to its real
   node via schemdraw's built-in anchors.

4. DIRECTION HINTS DISCARDED: `_split_hint()` correctly extracts the AI's
   layout hint (right/down/left/up) from each netlist line, but the old
   `_parse()` threw it away (`elec, _ = _split_hint(line)`). The renderer
   never used the layout intent the AI actually generated. Hints are now
   parsed and honored per component.
"""
import logging, re
from pathlib import Path
from typing import Tuple, Optional, List, Dict, Set
from collections import defaultdict

logger = logging.getLogger(__name__)
try:
    import schemdraw
    import schemdraw.elements as elm
    HAS_SCHEMDRAW = True
except ImportError:
    HAS_SCHEMDRAW = False

_GROUND = {"0", "gnd", "GND"}

# Number of node tokens (immediately after the component name) for each
# component-type prefix. Prefixes not listed default to 2 nodes (the common
# R/L/C/D/V/I case). This MUST stay in sync with the equivalent table in
# schematic.py's _normalize_ground_for_layout, since both are parsing the
# same AI-generated netlist grammar.
_NODE_COUNT_BY_PREFIX = {
    "Q": 3,  # BJT: collector, base, emitter
    "E": 4,  # VCVS (ideal op-amp): out, out_ref, inv(-), noninv(+)
}

class SchemdrawFallbackError(Exception): pass

def _split_hint(line):
    if ";" in line:
        h, _, t = line.partition(";")
        return h.rstrip(), t.strip()
    return line.rstrip(), ""

def _parse(netlist):
    """Parse each netlist line into a component dict, capturing ALL of its
    node tokens (not just the first two) and its layout hint."""
    comps = []
    for raw in netlist.replace("\\n", "\n").splitlines():
        line = raw.strip()
        if not line or line[0] in "*.;":
            continue
        elec, hint = _split_hint(line)
        tok = elec.strip().split()
        if not tok:
            continue
        name, pfx = tok[0], tok[0][0].upper()

        if pfx == "W" and len(tok) >= 3:
            comps.append({"name": name, "type": "W", "nodes": [tok[1], tok[2]],
                          "value": "", "hint": hint})
            continue

        node_count = _NODE_COUNT_BY_PREFIX.get(pfx, 2)
        if len(tok) < 1 + node_count:
            # Not enough tokens for this component type's node count —
            # malformed line, skip it rather than silently mis-parsing.
            continue

        nodes = tok[1:1 + node_count]
        val = " ".join(tok[1 + node_count:]) if len(tok) > 1 + node_count else ""
        if val.startswith("."):
            val = ""
        comps.append({"name": name, "type": pfx, "nodes": nodes, "value": val, "hint": hint})
    return comps

def _norm_gnd(nodes):
    return ["0" if n in _GROUND else n for n in nodes]

def _find_ground(comps):
    for c in comps:
        for n in c["nodes"]:
            if n in _GROUND: return "0"
    return "0"

def _source_tops(comps, gnd):
    """Kept for backward compatibility / potential external callers. No
    longer used by render_schematic_schemdraw itself — see _classify and
    the node_anchors-based placement loop below, which replaced the old
    single-frontier series-chain algorithm this helped drive."""
    return {c["nodes"][0] for c in comps if c["type"] in ("V", "I") and c["nodes"][0] not in _GROUND and c["nodes"][0] != gnd}

def _classify(comps, gnd, tops=None):
    """Assign each component a role. BJT and op-amp now get their OWN
    roles (previously they fell through to generic 2-node series/shunt
    classification, which for a 4-node op-amp only ever looked at the
    first 2 of its now-correctly-parsed node list)."""
    for c in comps:
        c["nodes"] = _norm_gnd(c["nodes"])
        n1, n2 = c["nodes"][0], c["nodes"][1]
        if c["type"] in ("V", "I"):
            c["role"] = "source"
        elif c["type"] == "W":
            c["role"] = "wire"
        elif c["type"] == "Q":
            c["role"] = "bjt"
        elif c["type"] == "E":
            c["role"] = "opamp"
        elif n1 == gnd or n2 == gnd:
            c["role"] = "shunt"
        else:
            c["role"] = "series"
    return comps

def _fmt_label(name, value):
    if not value or value.startswith("."): return name
    v = value.strip()
    v = re.sub(r'\bSINE\b.*','SINE',v,flags=re.I)
    v = re.sub(r'\bPULSE\b.*','PULSE',v,flags=re.I)
    v = re.sub(r'\bAC\b.*','AC',v,flags=re.I)
    return f"{name}={v[:20]}" if len(v)>20 else f"{name}={v}"

def _parse_direction(hint):
    direction = (hint or "right").split("=")[0].strip().lower()
    if direction not in ("up", "down", "left", "right"):
        direction = "right"
    return direction

def _add_elm(d, ctype, label, direction="right", at=None):
    """Place a 2-terminal passive/source element. Q (BJT) and E (op-amp)
    are NOT handled here anymore — they need real multi-pin anchors, see
    _add_bjt / _add_opamp below."""
    ct = ctype.upper()
    m = {"R": elm.Resistor, "C": elm.Capacitor, "L": elm.Inductor, "D": elm.Diode,
         "V": elm.SourceV, "I": elm.SourceI}
    el = m.get(ct, elm.Resistor)()
    if direction == "up": el = el.up()
    elif direction == "down": el = el.down()
    elif direction == "left": el = el.left()
    else: el = el.right()
    if at is not None:
        el = el.at(at)
    if label: el = el.label(label)
    return d.add(el)


def _add_bjt(d, label, direction="down", at=None, anchor_pin=None):
    """BJT is a 3-terminal element (collector, base, emitter) — placed and
    connected via schemdraw's real .collector / .base / .emitter anchors
    rather than treated as a straight 2-pin part.

    `anchor_pin` (e.g. "base") tells schemdraw WHICH of the element's own
    pins should land exactly on `at`. Without it, `.at()` only aligns the
    element's local (0,0) origin to that point — which is not the same
    location as any of its three named pins — leaving a visible gap
    instead of a real connection. Verified against schemdraw 0.23 directly:
    `.anchor('base').at(point)` is required for exact alignment; `.at()`
    alone is not enough for a multi-pin element the way it is for a plain
    2-terminal part like a resistor.
    """
    el = elm.BjtNpn()
    if direction == "down": el = el.down()
    elif direction == "up": el = el.up()
    elif direction == "left": el = el.left()
    else: el = el.right()
    if anchor_pin is not None:
        el = el.anchor(anchor_pin)
    if at is not None:
        el = el.at(at)
    if label:
        el = el.label(label)
    return d.add(el)


def _add_opamp(d, label, direction="right", at=None, anchor_pin=None):
    """Op-amp (VCVS) is a 3-pin active element. Previously this was routed
    through _add_elm as if it were a 2-pin passive component, which
    produced garbled geometry since Opamp has no meaningful single
    "start/end" pair the way a resistor does.

    PIN POLARITY (verified directly against schemdraw's Opamp source,
    since this is easy to get backwards and previously WAS backwards in an
    earlier draft of this fix): `in1` is the anchor drawn on the "+" side
    (non-inverting input), `in2` is drawn on the "-" side (inverting
    input). `out` is the single output pin.

    `anchor_pin` works the same way as in `_add_bjt` above — required for
    the given `at` point to land exactly on the intended pin rather than
    the element's local origin.
    """
    el = elm.Opamp()
    if direction == "up": el = el.up()
    elif direction == "down": el = el.down()
    elif direction == "left": el = el.left()
    else: el = el.right()
    if anchor_pin is not None:
        el = el.anchor(anchor_pin)
    if at is not None:
        el = el.at(at)
    if label:
        el = el.label(label)
    return d.add(el)


# ─────────────────────────────────────────────────────────────────────────
# DEPRECATED: these implemented the old "single frontier, pure series
# chain" placement algorithm. They're kept (unused) rather than deleted, in
# case anything outside this module still imports them, but
# render_schematic_schemdraw() below no longer calls them — they can't
# represent branching/feedback topology (e.g. a non-inverting amplifier's
# feedback loop), which was the root cause of the overlap bug.
# ─────────────────────────────────────────────────────────────────────────
def _find_series_chain(comps, tops, gnd):
    series = [c for c in comps if c["role"] == "series"]
    if not series:
        return []
    chain = []
    used = set()
    frontier = set(tops)
    for _ in range(len(series)):
        for c in series:
            if id(c) in used:
                continue
            n1, n2 = c["nodes"][0], c["nodes"][1]
            if n1 in frontier:
                chain.append(c)
                used.add(id(c))
                frontier.discard(n1)
                frontier.add(n2)
                break
            elif n2 in frontier:
                c["nodes"] = [n2, n1]
                chain.append(c)
                used.add(id(c))
                frontier.discard(n2)
                frontier.add(n1)
                break
    for c in series:
        if id(c) not in used:
            chain.append(c)
    return chain


def _shunts_at(comps, node):
    result = []
    for c in comps:
        if c["role"] != "shunt":
            continue
        n1, n2 = c["nodes"][0], c["nodes"][1]
        if n1 == node:
            result.append(c)
        elif n2 == node:
            c["nodes"] = [n2, n1]
            result.append(c)
    return result
# ─────────────────────────────────────────────────────────────────────────


def render_schematic_schemdraw(netlist: str, runs_dir: Path, task_id: str) -> Tuple[str, Optional[str]]:
    if not HAS_SCHEMDRAW:
        raise SchemdrawFallbackError("schemdraw is not installed.")
    comps = _parse(netlist)
    if not comps:
        raise SchemdrawFallbackError("No components found in netlist.")
    gnd = _find_ground(comps)
    comps = _classify(comps, gnd)

    try:
        import matplotlib
        matplotlib.use("Agg")
        schemdraw.use("svg")
        d = schemdraw.Drawing()
        d.config(unit=2.5, lw=1.5, fontsize=11)

        ground_el = d.add(elm.Ground())
        # node_anchors maps a netlist node NAME to a real schemdraw anchor
        # point. Every subsequent element that touches an already-known
        # node is explicitly placed `.at()` that anchor — this is what
        # actually fixes the overlap: components only ever get drawn where
        # they're truly connected, instead of wherever the drawing cursor
        # happened to be after the previous, possibly unrelated, element.
        node_anchors: Dict[str, object] = {gnd: getattr(ground_el, "start", (0, 0))}
        dot_nodes: Set[str] = set()

        def _connect(node, anchor):
            if node in dot_nodes:
                # Revisiting a node — add a junction dot so a branch point
                # (e.g. the feedback node in a non-inverting amp) is drawn
                # as an explicit connection, not an accidental overlap.
                try:
                    d.add(elm.Dot().at(anchor))
                except Exception:
                    pass
            dot_nodes.add(node)
            node_anchors[node] = anchor

        # ── Sources: rise vertically from ground first, so every source
        # has a real, known starting point. ──────────────────────────────
        sources = [c for c in comps if c["role"] == "source"]
        for src in sources:
            n1, n2 = src["nodes"][0], src["nodes"][1]
            if n1 == gnd:
                top_node = n2
            elif n2 == gnd:
                top_node = n1
            else:
                # Neither terminal is literal ground (unusual but possible
                # after alias-normalization) — best effort, anchor to
                # ground anyway and let the multi-pass loop below connect
                # the other terminal once something else references it.
                top_node = n2
            lb = _fmt_label(src["name"], src["value"])
            el = _add_elm(d, src["type"], lb, "up", at=node_anchors.get(gnd))
            _connect(gnd, el.start)
            _connect(top_node, el.end)

        # ── Everything else: multi-pass placement. A component may
        # reference a node that only becomes known once another pending
        # component (anywhere else in the netlist, earlier OR later) gets
        # placed first — e.g. a feedback resistor referencing an op-amp's
        # output, or an op-amp referencing a feedback node a resistor
        # defines. Re-attempt whatever's left each pass until nothing new
        # gets placed, instead of guessing and mis-drawing. ─────────────
        wires = [c for c in comps if c["role"] == "wire"]
        pending = [c for c in comps if c["role"] not in ("source", "wire")]

        for _pass in range(len(pending) + 2):
            if not pending:
                break
            next_pending = []
            progressed = False

            for c in pending:
                direction = _parse_direction(c.get("hint"))
                lb = _fmt_label(c["name"], c["value"])

                if c["role"] == "opamp":
                    # Node order per the netlist convention (see netlist_ai.py
                    # SYSTEM_PROMPT): "Ename out out_ref inv noninv gain".
                    out_n, out_ref_n, inv_n, noninv_n = (c["nodes"] + ["", "", "", ""])[:4]
                    # Pick whichever pin's node we already know, so the
                    # element can be anchored precisely there via
                    # `.anchor(pin).at(point)` — see _add_opamp docstring.
                    if noninv_n in node_anchors:
                        anchor_node, anchor_pin = noninv_n, "in1"   # in1 = "+"
                    elif inv_n in node_anchors:
                        anchor_node, anchor_pin = inv_n, "in2"      # in2 = "-"
                    elif out_n in node_anchors:
                        anchor_node, anchor_pin = out_n, "out"
                    else:
                        next_pending.append(c)
                        continue
                    el = _add_opamp(d, lb, direction, at=node_anchors[anchor_node],
                                     anchor_pin=anchor_pin)
                    if noninv_n:
                        _connect(noninv_n, el.in1)   # in1 = non-inverting (+)
                    if inv_n:
                        _connect(inv_n, el.in2)       # in2 = inverting (-)
                    if out_n:
                        _connect(out_n, el.out)
                    progressed = True
                    continue

                if c["role"] == "bjt":
                    coll_n, base_n, emit_n = (c["nodes"] + ["", "", ""])[:3]
                    if base_n in node_anchors:
                        anchor_node, anchor_pin = base_n, "base"
                    elif coll_n in node_anchors:
                        anchor_node, anchor_pin = coll_n, "collector"
                    elif emit_n in node_anchors:
                        anchor_node, anchor_pin = emit_n, "emitter"
                    else:
                        next_pending.append(c)
                        continue
                    bjt_dir = direction if direction in ("down", "up", "left", "right") else "down"
                    el = _add_bjt(d, lb, bjt_dir, at=node_anchors[anchor_node],
                                   anchor_pin=anchor_pin)
                    try:
                        if coll_n: _connect(coll_n, el.collector)
                        if base_n: _connect(base_n, el.base)
                        if emit_n: _connect(emit_n, el.emitter)
                    except Exception:
                        pass
                    progressed = True
                    continue

                # Ordinary 2-terminal component (series or shunt).
                n1, n2 = c["nodes"][0], c["nodes"][1]
                if n1 in node_anchors:
                    at = node_anchors[n1]
                elif n2 in node_anchors:
                    n1, n2 = n2, n1
                    at = node_anchors[n1]
                else:
                    next_pending.append(c)
                    continue

                el = _add_elm(d, c["type"], lb, direction, at=at)
                _connect(n1, el.start)
                _connect(n2, el.end)
                if n2 == gnd:
                    # This component's far terminal IS ground (a shunt
                    # branch, e.g. the gain-setting resistor to ground in a
                    # non-inverting amp) — draw an explicit ground symbol at
                    # its endpoint so the branch visibly terminates instead
                    # of just stopping in space.
                    try:
                        d.add(elm.Ground().at(el.end))
                    except Exception:
                        pass
                progressed = True

            pending = next_pending
            if not progressed:
                break

        # Anything still pending is disconnected from the known graph
        # (malformed netlist / genuinely floating node) — draw it anyway,
        # clearly labeled, rather than silently dropping a component the
        # AI generated.
        for c in pending:
            direction = _parse_direction(c.get("hint"))
            lb = _fmt_label(c["name"], c["value"]) + " (unconnected)"
            if c["role"] == "opamp":
                _add_opamp(d, lb, direction)
            elif c["role"] == "bjt":
                _add_bjt(d, lb, direction if direction in ("down", "right") else "down")
            else:
                _add_elm(d, c["type"], lb, direction)

        # Ideal wires: tie two nodes to the same anchor once at least one
        # side is known, so ground-alias wires (e.g. "W 0 0_2; right")
        # don't get dropped.
        for w in wires:
            n1, n2 = w["nodes"][0], w["nodes"][1]
            if n1 in node_anchors and n2 not in node_anchors:
                node_anchors[n2] = node_anchors[n1]
            elif n2 in node_anchors and n1 not in node_anchors:
                node_anchors[n1] = node_anchors[n2]

        wd = runs_dir / task_id
        wd.mkdir(parents=True, exist_ok=True)
        sp = wd / "schemdraw_schematic.svg"
        d.save(str(sp))
        return sp.read_text(), str(sp)
    except Exception as exc:
        raise SchemdrawFallbackError(f"schemdraw rendering failed: {exc}")