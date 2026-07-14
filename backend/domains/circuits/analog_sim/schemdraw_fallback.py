"""Topology-Aware Schemdraw Renderer."""
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

class SchemdrawFallbackError(Exception): pass

def _split_hint(line):
    if ";" in line:
        h, _, t = line.partition(";")
        return h.rstrip(), t.strip()
    return line.rstrip(), ""

def _parse(netlist):
    comps = []
    for raw in netlist.replace("\\n","\n").splitlines():
        line = raw.strip()
        if not line or line[0] in "*.;": continue
        elec, _ = _split_hint(line)
        tok = elec.strip().split()
        if not tok: continue
        name, pfx = tok[0], tok[0][0].upper()
        if pfx == "W" and len(tok) >= 3:
            comps.append({"name":name,"type":"W","nodes":[tok[1],tok[2]],"value":""})
            continue
        if len(tok) < 3: continue
        val = " ".join(tok[3:]) if len(tok)>3 else ""
        if val.startswith("."): val = ""
        comps.append({"name":name,"type":pfx,"nodes":[tok[1],tok[2]],"value":val})
    return comps

def _norm_gnd(nodes):
    return ["0" if n in _GROUND else n for n in nodes]

def _find_ground(comps):
    for c in comps:
        for n in c["nodes"]:
            if n in _GROUND: return "0"
    return "0"

def _source_tops(comps, gnd):
    return {c["nodes"][0] for c in comps if c["type"] in ("V","I") and c["nodes"][0] not in _GROUND and c["nodes"][0]!=gnd}

def _classify(comps, gnd, tops):
    for c in comps:
        c["nodes"] = _norm_gnd(c["nodes"])
        n1, n2 = c["nodes"]
        if c["type"] in ("V","I"): c["role"] = "source"
        elif c["type"] == "W": c["role"] = "wire"
        elif n1==gnd or n2==gnd: c["role"] = "shunt"
        else: c["role"] = "series"
    return comps

def _fmt_label(name, value):
    if not value or value.startswith("."): return name
    v = value.strip()
    v = re.sub(r'\bSINE\b.*','SINE',v,flags=re.I)
    v = re.sub(r'\bPULSE\b.*','PULSE',v,flags=re.I)
    v = re.sub(r'\bAC\b.*','AC',v,flags=re.I)
    return f"{name}={v[:20]}" if len(v)>20 else f"{name}={v}"

def _add_elm(d, ctype, label, direction="right"):
    ct = ctype.upper()
    m = {"R":elm.Resistor,"C":elm.Capacitor,"L":elm.Inductor,"D":elm.Diode,
         "V":elm.SourceV,"I":elm.SourceI,"E":elm.Opamp}
    if ct == "Q":
        el = elm.BjtNpn()
    elif ct in m:
        el = m[ct]()
    else:
        el = elm.Resistor()
    if direction == "up": el = el.up()
    elif direction == "down": el = el.down()
    elif direction == "left": el = el.left()
    else: el = el.right()
    if label: el = el.label(label)
    return d.add(el)


def _add_bjt(d, label, direction="down"):
    """BJT is a 3-terminal element — needs special placement."""
    el = elm.BjtNpn()
    if direction == "down":
        el = el.down()
    elif direction == "right":
        el = el.right()
    if label:
        el = el.label(label)
    return d.add(el)


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
            n1, n2 = c["nodes"]
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
        n1, n2 = c["nodes"]
        if n1 == node:
            result.append(c)
        elif n2 == node:
            c["nodes"] = [n2, n1]
            result.append(c)
    return result


def render_schematic_schemdraw(netlist: str, runs_dir: Path, task_id: str) -> Tuple[str, Optional[str]]:
    if not HAS_SCHEMDRAW:
        raise SchemdrawFallbackError("schemdraw is not installed.")
    comps = _parse(netlist)
    if not comps:
        raise SchemdrawFallbackError("No components found in netlist.")
    gnd = _find_ground(comps)
    tops = _source_tops(comps, gnd)
    comps = _classify(comps, gnd, tops)
    sources = [c for c in comps if c["role"] == "source"]
    series_chain = _find_series_chain(comps, tops, gnd)
    try:
        import matplotlib
        matplotlib.use("Agg")
        schemdraw.use("svg")
        d = schemdraw.Drawing()
        d.config(unit=2.5, lw=1.5, fontsize=11)
        ground_el = d.add(elm.Ground())
        # Place sources vertically (up from ground)
        source_anchors = []
        for src in sources:
            n1, n2 = src["nodes"]
            if n2 == gnd or n2 in _GROUND:
                src["nodes"] = [n2, n1]
                n1, n2 = n2, n1
            lb = _fmt_label(src["name"], src["value"])
            el = _add_elm(d, src["type"], lb, "up")
            source_anchors.append((src, el))
        # Place series chain horizontally (right)
        prev_anchor = None
        for src, el in source_anchors:
            prev_anchor = el
        node_anchors = {}
        for src, el in source_anchors:
            top_node = src["nodes"][1] if src["nodes"][0] == gnd else src["nodes"][0]
            node_anchors[top_node] = el.end
        for c in series_chain:
            n1, n2 = c["nodes"]
            lb = _fmt_label(c["name"], c["value"])
            if c["type"] == "Q":
                # BJT: 3-terminal (collector, base, emitter)
                # Place as a vertical element from collector (top) to emitter (bottom)
                el = _add_bjt(d, lb, "down")
                # BJT doesn't have .end — use .out or .emitter
                try:
                    node_anchors[n2] = el.emitter if hasattr(el, 'emitter') else el.out
                except Exception:
                    pass
                prev_anchor = el
            elif n1 in node_anchors:
                el = _add_elm(d, c["type"], lb, "right")
                node_anchors[n2] = el.end
                prev_anchor = el
            else:
                el = _add_elm(d, c["type"], lb, "right")
                node_anchors[n2] = el.end
                prev_anchor = el
        # Place shunt components (down to ground) at each node
        placed_shunts = set()
        for c in comps:
            if c["role"] != "shunt":
                continue
            if id(c) in placed_shunts:
                continue
            n1, n2 = c["nodes"]
            shunt_node = n1 if n2 == gnd else n2
            if shunt_node in node_anchors:
                anchor = node_anchors[shunt_node]
                lb = _fmt_label(c["name"], c["value"])
                d.add(elm.Dot().at(anchor))
                el = _add_elm(d, c["type"], lb, "down")
                d.add(elm.Ground().at(el.end))
                placed_shunts.add(id(c))
        for c in comps:
            if c["role"] == "shunt" and id(c) not in placed_shunts:
                lb = _fmt_label(c["name"], c["value"])
                el = _add_elm(d, c["type"], lb, "down")
                d.add(elm.Ground().at(el.end))
        # Close the loop: down, left, up to ground
        if prev_anchor:
            d.add(elm.Line().down())
            d.add(elm.Line().left())
            d.add(elm.Line().up())
        wd = runs_dir / task_id
        wd.mkdir(parents=True, exist_ok=True)
        sp = wd / "schemdraw_schematic.svg"
        d.save(str(sp))
        return sp.read_text(), str(sp)
    except Exception as exc:
        raise SchemdrawFallbackError(f"schemdraw rendering failed: {exc}")
