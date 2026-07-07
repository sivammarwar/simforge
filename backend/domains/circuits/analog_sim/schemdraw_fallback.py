"""Schemdraw fallback renderer for topologies where Lcapy fails."""
import logging
import re
from pathlib import Path
from typing import Tuple, Optional, List, Dict

logger = logging.getLogger(__name__)

try:
    import schemdraw
    import schemdraw.elements as elm
    HAS_SCHEMDRAW = True
except ImportError:
    HAS_SCHEMDRAW = False


class SchemdrawFallbackError(Exception):
    pass


def _parse_netlist_components(netlist: str) -> list:
    components = []
    for line in netlist.splitlines():
        line = line.strip()
        if not line or line.startswith("*") or line.startswith("."):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        name = parts[0]
        tl = name[0].upper()
        tm = {"R": "R", "C": "C", "L": "L", "D": "D", "Q": "BJT", "V": "V", "I": "I", "M": "MOSFET", "E": "VCVS"}
        ct = tm.get(tl, tl)
        val = parts[-1] if not parts[-1].isdigit() or len(parts) > 3 else ""
        nodes = parts[1:-1] if val else parts[1:]
        components.append({"name": name, "type": ct, "value": val, "nodes": nodes})
    return components


def render_schematic_schemdraw(netlist: str, runs_dir: Path, task_id: str) -> Tuple[str, Optional[str]]:
    if not HAS_SCHEMDRAW:
        raise SchemdrawFallbackError("schemdraw is not installed.")
    comps = _parse_netlist_components(netlist)
    if not comps:
        raise SchemdrawFallbackError("No components found in netlist.")
    try:
        import matplotlib
        matplotlib.use("Agg")
        schemdraw.use("svg")
        d = schemdraw.Drawing()
        d.config(unit=2.5, lw=1.5)
        g = d.add(elm.Ground())
        for c in comps:
            et = c["type"].upper()
            lb = f"{c['name']}={c['value']}" if c.get("value") else c["name"]
            if et in ("R", "RESISTOR"):
                d.add(elm.Resistor().right().label(lb))
            elif et in ("C", "CAPACITOR"):
                d.add(elm.Capacitor().right().label(lb))
            elif et in ("L", "INDUCTOR"):
                d.add(elm.Inductor().right().label(lb))
            elif et in ("D", "DIODE"):
                d.add(elm.Diode().right().label(lb))
            elif et in ("Q", "BJT", "NPN", "PNP"):
                bjt = elm.NPN if "PNP" not in et else elm.PNP
                d.add(bjt().right().label(lb))
            elif et in ("V", "VOLTAGE", "VSOURCE"):
                d.add(elm.SourceV().up().label(lb))
            elif et in ("I", "CURRENT", "ISOURCE"):
                d.add(elm.SourceI().up().label(lb))
            elif et in ("E", "VCVS"):
                d.add(elm.Opamp().right().label(lb))
        d.add(elm.Line().down())
        d.add(elm.Line().left(tox=g.start))
        d.add(elm.Line().up(toy=g.start))
        wd = runs_dir / task_id
        wd.mkdir(parents=True, exist_ok=True)
        sp = wd / "schemdraw_schematic.svg"
        d.save(str(sp))
        return sp.read_text(), str(sp)
    except Exception as exc:
        raise SchemdrawFallbackError(f"schemdraw rendering failed: {exc}")
