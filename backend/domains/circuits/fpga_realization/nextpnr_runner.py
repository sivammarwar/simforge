"""
nextpnr Runner (subprocess place & route)
============================================
Runs real nextpnr-ice40 placement + routing against a Yosys-produced
iCE40-mapped JSON netlist (from run_yosys_synthesis(..., target="ice40")),
parsing:

  - lut_count: real ICESTORM_LC (logic cell) utilization from --report's
    JSON utilization block — genuinely different from Phase A's
    total_cells (that was pre-technology-mapping generic cell counts;
    ICESTORM_LC is real placed-and-routed fabric usage, e.g. it also
    counts nextpnr's own inserted GND/VCC tie cells).
  - placement: cell instance name -> {"x": int, "y": int}, parsed from the
    NEXTPNR_BEL attribute nextpnr writes into the --write JSON netlist —
    verified against real nextpnr 0.10 output before writing this (not
    assumed): BEL strings look like "X1/Y25/lc0".
  - timing_report: nextpnr's own critical-path/Fmax summary text,
    verbatim — deliberately not a structured timing model (v1 scope).

Combinational-only designs (this pipeline's gate netlists have no
registers yet) report "No Fmax available; no interior timing paths found"
— real nextpnr behavior for a design with no clocked paths, not a bug;
handled as a normal, successful outcome rather than an error.

EXECUTION STRATEGY: same as yosys_runner.py — local PATH first
(SIMFORGE_NEXTPNR_PATH override, else shutil.which), no SSH/VM bridge (see
yosys_runner.py's module docstring for why: no such bridge exists in this
codebase to extend).
"""
import os
import re
import json
import shutil
from pathlib import Path
from typing import Dict, Any

from ..shared.execution_manager import run_tool, ExecutionError


class NextpnrRunError(Exception):
    pass


_ARCH_FLAGS = {
    "lp384", "lp1k", "lp4k", "lp8k", "hx1k", "hx4k", "hx8k",
    "up3k", "up5k", "u1k", "u2k", "u4k",
}


def _resolve_nextpnr_binary() -> str:
    override = os.getenv("SIMFORGE_NEXTPNR_PATH")
    if override and shutil.which(override):
        return override
    if shutil.which("nextpnr-ice40"):
        return "nextpnr-ice40"
    raise NextpnrRunError(
        "nextpnr-ice40 binary not found on PATH (and SIMFORGE_NEXTPNR_PATH is not "
        "set to a valid binary). Install nextpnr-ice40 (e.g. `brew install "
        "nextpnr-ice40` / `apt-get install nextpnr-ice40`) or set SIMFORGE_NEXTPNR_PATH."
    )


_BEL_RE = re.compile(r"X(\d+)/Y(\d+)/")


def _parse_placement(placed_json_path: Path) -> Dict[str, Dict[str, int]]:
    """
    nextpnr's --write output always names the (single) top module "top"
    internally, regardless of the module's real name in the source
    Verilog — verified against real 0.10 output before writing this.
    """
    data = json.loads(placed_json_path.read_text())
    modules = data.get("modules", {})
    mod = modules.get("top") or next(iter(modules.values()), {})
    placement: Dict[str, Dict[str, int]] = {}
    for cell_name, cell in (mod.get("cells") or {}).items():
        bel = (cell.get("attributes") or {}).get("NEXTPNR_BEL")
        if not bel:
            continue
        m = _BEL_RE.match(bel)
        if m:
            placement[cell_name] = {"x": int(m.group(1)), "y": int(m.group(2))}
    return placement


def _extract_timing_report(combined_log: str) -> str:
    """Slice nextpnr's own post-route summary out of its log, verbatim —
    no structured re-parsing, per the v1 scope for this field."""
    for anchor in ("Info: Critical path report", "Info: No Fmax", "Info: Routing complete."):
        idx = combined_log.rfind(anchor)
        if idx != -1:
            return combined_log[idx:].strip()
    return combined_log[-2000:].strip()


def run_nextpnr_placement(
    yosys_json_netlist_path: str,
    package: str = "hx8k-ct256",
    runs_dir: Path = None,
    task_id: str = "nextpnr-run",
    timeout_seconds: int = 120,
) -> Dict[str, Any]:
    """
    Run real nextpnr-ice40 place & route against a Yosys-produced iCE40
    JSON netlist.

    NOTE on signature: takes the netlist as a file PATH (what
    run_yosys_synthesis(..., target="ice40") actually produces), not an
    in-memory dict — nextpnr's CLI reads a JSON *file* via --json, so a
    path avoids a redundant serialize/write round-trip when chaining
    directly off run_yosys_synthesis's own output.

    Raises NextpnrRunError on missing binary, malformed netlist, or PnR
    failure — mirrors YosysRunError's role, so the caller
    (fpga_realization/pipeline.py) can degrade gracefully without losing
    the Phase A synthesis data (cell_counts/total_cells) it already has.
    """
    netlist_path = Path(yosys_json_netlist_path)
    if not netlist_path.exists():
        raise NextpnrRunError(f"Yosys JSON netlist not found: {netlist_path}")

    arch, _, pkg = package.partition("-")
    if arch not in _ARCH_FLAGS:
        raise NextpnrRunError(
            f"Unknown iCE40 architecture {arch!r} in package {package!r} "
            f"(expected one of: {', '.join(sorted(_ARCH_FLAGS))})."
        )
    if not pkg:
        raise NextpnrRunError(f"No package specified in {package!r} (expected e.g. 'hx8k-ct256').")

    nextpnr_bin = _resolve_nextpnr_binary()

    base_dir = runs_dir or (Path(__file__).parent.parent / "simforge_runs")
    work_dir = base_dir / task_id
    work_dir.mkdir(parents=True, exist_ok=True)

    placed_json_path = work_dir / "placed.json"
    report_path = work_dir / "nextpnr_report.json"

    cmd = [
        nextpnr_bin,
        "--json", str(netlist_path),
        f"--{arch}", "--package", pkg,
        "--pcf-allow-unconstrained",
        "--write", str(placed_json_path),
        "--report", str(report_path),
    ]

    try:
        outcome = run_tool(cmd, cwd=work_dir, timeout_seconds=timeout_seconds)
    except ExecutionError as exc:
        raise NextpnrRunError(str(exc))

    combined_log = (outcome["stdout"] or "") + "\n" + (outcome["stderr"] or "")
    log_path = work_dir / "nextpnr.log"
    log_path.write_text(combined_log)

    if outcome["returncode"] != 0:
        raise NextpnrRunError(
            f"nextpnr-ice40 exited {outcome['returncode']}.\n"
            f"stderr:\n{outcome['stderr'][-1500:]}\nstdout:\n{outcome['stdout'][-1500:]}"
        )

    if not placed_json_path.exists() or not report_path.exists():
        raise NextpnrRunError(
            f"nextpnr-ice40 exited 0 but didn't produce expected output files.\n"
            f"Full log:\n{combined_log[-1500:]}"
        )

    try:
        placement = _parse_placement(placed_json_path)
    except Exception as exc:
        raise NextpnrRunError(f"Failed to parse nextpnr placement output: {exc}")

    try:
        report = json.loads(report_path.read_text())
    except Exception as exc:
        raise NextpnrRunError(f"Failed to parse nextpnr report JSON: {exc}")

    utilization = report.get("utilization") or {}
    lut_count = int((utilization.get("ICESTORM_LC") or {}).get("used", 0))

    return {
        "lut_count": lut_count,
        "placement": placement,
        "timing_report": _extract_timing_report(combined_log),
        "utilization": utilization,
        "fmax": report.get("fmax") or {},
        "log_path": str(log_path),
        "placed_json_path": str(placed_json_path),
        "report_path": str(report_path),
    }
