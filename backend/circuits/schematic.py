"""
Schematic Generator (Lcapy)
=============================
Draws the SAME unified netlist used for simulation, so the schematic can
never drift out of sync with the simulated circuit.

One real Lcapy quirk handled here: Lcapy's auto-layout fails with
"the horizontal schematic graph has a loop" if literal ground node "0" is
used on more than one branch (e.g. two separate "...0" endings), because it
creates an ambiguous rectangle in the layout solver. The fix is a purely
mechanical rename: every ground reference after the first becomes a
distinct node "0_2", "0_3", ... which is then tied back to "0" with an
explicit wire ("W 0 0_2; right"). This is NOT circuit-topology-specific —
it's a generic graph transform that runs on every netlist, so it scales to
any topology without hardcoding per-circuit-type fixes.

IMPORTANT: TEXINPUTS must be set BEFORE any lcapy import, because Lcapy
caches its circuitikz-availability check at first import. This file sets
TEXINPUTS at module load time (below) to ensure the check passes.
A full backend process restart is required for this change to take effect.
"""

import os
import re
import uuid
import subprocess
from pathlib import Path
from typing import Tuple

# Set TEXINPUTS at module import time, BEFORE any lcapy import.
# Lcapy caches its circuitikz availability check, so this must happen
# before the first lcapy import in this process.
circuitikz_path = '/usr/local/texlive/2026basic/texmf-dist/tex/latex/circuitikz'
texinputs = os.environ.get('TEXINPUTS', '')
if circuitikz_path not in texinputs:
    os.environ['TEXINPUTS'] = f"{circuitikz_path}:{texinputs}"

# Startup sanity check: verify all schematic rendering dependencies are available
print("[Schematic Startup] Checking schematic rendering dependencies...")
missing_deps = []

# Check pdflatex
try:
    result = subprocess.run(['which', 'pdflatex'], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print(f"[Schematic Startup] pdflatex found at: {result.stdout.strip()}")
    else:
        missing_deps.append("pdflatex")
        print(f"[Schematic Startup WARNING] pdflatex not found in PATH")
except Exception as exc:
    missing_deps.append("pdflatex")
    print(f"[Schematic Startup WARNING] pdflatex check failed: {exc}")

# Check circuitikz.sty via kpsewhich
try:
    result = subprocess.run(['kpsewhich', 'circuitikz.sty'], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print(f"[Schematic Startup] circuitikz.sty found at: {result.stdout.strip()}")
    else:
        missing_deps.append("circuitikz.sty (LaTeX package)")
        print(f"[Schematic Startup WARNING] kpsewhich circuitikz.sty failed: {result.stderr}")
except Exception as exc:
    missing_deps.append("circuitikz.sty (LaTeX package)")
    print(f"[Schematic Startup WARNING] kpsewhich check failed: {exc}")

# Check pdf2svg
try:
    result = subprocess.run(['which', 'pdf2svg'], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print(f"[Schematic Startup] pdf2svg found at: {result.stdout.strip()}")
    else:
        missing_deps.append("pdf2svg")
        print(f"[Schematic Startup WARNING] pdf2svg not found in PATH")
except Exception as exc:
    missing_deps.append("pdf2svg")
    print(f"[Schematic Startup WARNING] pdf2svg check failed: {exc}")

if missing_deps:
    print(f"[Schematic Startup ERROR] Missing schematic rendering dependencies: {', '.join(missing_deps)}")
    print(f"[Schematic Startup ERROR] Schematic rendering will fail. Install missing dependencies and restart the backend.")
else:
    print("[Schematic Startup] All schematic rendering dependencies verified successfully.")

from .netlist_translate import parse_netlist_lines, _split_hint, _tokenize  # reuse, no duplication
from .netlist_ai import _strip_spice_functions_for_lcapy

_GROUND_NAMES = {"0", "gnd", "GND"}


class SchematicError(Exception):
    pass


def _normalize_ground_for_layout(netlist_text: str) -> str:
    """Rewrite repeated literal-ground references into distinct node names
    tied together with wires, so Lcapy's layout solver doesn't see a loop."""
    lines = parse_netlist_lines(netlist_text)
    seen_ground = False
    ground_alias_count = 0
    out_lines = []
    wire_lines = []

    for line in lines:
        electrical, hint = _split_hint(line)
        tokens = _tokenize(electrical)
        if not tokens:
            continue
        prefix = tokens[0][0].upper()

        # Leave existing wire lines untouched — they already express
        # explicit connectivity and won't be re-aliased.
        if prefix == "W":
            out_lines.append(line)
            continue

        new_tokens = list(tokens)
        for idx in (1, 2):
            if idx < len(new_tokens) and new_tokens[idx] in _GROUND_NAMES:
                if not seen_ground:
                    new_tokens[idx] = "0"
                    seen_ground = True
                else:
                    ground_alias_count += 1
                    alias = f"0_{ground_alias_count + 1}"
                    new_tokens[idx] = alias
                    wire_lines.append(f"W 0 {alias}; right")

        rebuilt = " ".join(new_tokens)
        out_lines.append(f"{rebuilt}; {hint}" if hint else rebuilt)

    return "\n".join(out_lines + wire_lines)


def render_schematic_svg(unified_netlist: str, runs_dir: Path, task_id: str) -> Tuple[str, str]:
    """
    Renders the unified netlist to SVG using Lcapy.

    Returns (svg_markup, svg_file_path). Raises SchematicError with the
    underlying Lcapy message on failure (safe to surface to the AI repair
    loop or to logs — Lcapy errors don't leak filesystem internals beyond
    the working directory we already control).
    """
    print(f"[FLOW TRACE] 8/9 schematic.py — render_schematic_svg() called for task_id={task_id}")
    print(f"[Schematic] Input netlist: {unified_netlist}")
    
    try:
        from lcapy import Circuit
    except ImportError as exc:
        raise SchematicError(f"lcapy is not installed: {exc}")

    layout_netlist = _strip_spice_functions_for_lcapy(unified_netlist)
    layout_netlist = _normalize_ground_for_layout(layout_netlist)
    print(f"[Schematic] Layout netlist: {layout_netlist}")

    try:
        cct = Circuit(layout_netlist)
        print(f"[Schematic] Circuit created successfully")
    except Exception as exc:
        print(f"[Schematic] Circuit creation failed: {exc}")
        raise SchematicError(f"lcapy could not parse netlist for drawing: {exc}")

    work_dir = runs_dir / task_id
    work_dir.mkdir(parents=True, exist_ok=True)
    svg_path = work_dir / f"schematic_{uuid.uuid4().hex[:8]}.svg"

    try:
        print(f"[Schematic] Attempting to draw schematic to {svg_path}")
        # Try without circuitikz-dependent style first
        try:
            cct.draw(
                str(svg_path),
                label_ids=True,
                label_values=True,
                draw_nodes="connections",
            )
        except Exception as exc:
            print(f"[Schematic] Draw without style failed: {exc}, trying with style='american'")
            cct.draw(
                str(svg_path),
                label_ids=True,
                label_values=True,
                draw_nodes="connections",
                style="american",
            )
        print(f"[Schematic] Draw completed successfully")
    except Exception as exc:
        print(f"[Schematic] Draw failed: {exc}")
        raise SchematicError(f"lcapy failed to render schematic: {exc}")

    if not svg_path.exists():
        raise SchematicError("lcapy reported success but no SVG file was produced.")

    svg_markup = svg_path.read_text()
    return svg_markup, str(svg_path)
