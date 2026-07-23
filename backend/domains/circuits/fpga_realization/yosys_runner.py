"""
Yosys Runner (subprocess synthesis)
======================================
Runs real Yosys synthesis against a Verilog module and parses its `stat`
report into structured cell-count data.

Phase A: generic `synth` (technology-independent cell counts, e.g.
$_AND_/$_OR_/$_NOT_/$_XOR_) — enough to get real synthesis statistics
without committing to a specific FPGA family yet. Phase B adds
target="ice40" (synth_ice40, real LUT4-mapped counts) once nextpnr needs a
concrete target.

EXECUTION STRATEGY (confirmed by reading the actual codebase, not just
README.md): the README's "Solver VM Bridge" section documents SSH-based
remote execution (paramiko/scp, SIMFORGE_REMOTE_* env vars) for tools not
on the local machine — but no such implementation exists anywhere in this
codebase (no paramiko/scp usage, no SIMFORGE_REMOTE_* env var reads, `ccx`
isn't invoked anywhere). It appears to document a different, likely
pre-"Circuits-only" part of the system. Rather than inventing new SSH
infrastructure to extend a bridge that doesn't exist, this follows the
pattern that IS real: ngspice_runner.py's local-only `shutil.which()`
check. SIMFORGE_YOSYS_PATH is still honored as a local override (matching
the README's env var naming convention), so this slots into a real VM
bridge later if one gets built, without behavior changing for anyone not
using it today.
"""
import os
import re
import shutil
from pathlib import Path
from typing import Dict, Any

from ..shared.execution_manager import run_tool, ExecutionError


class YosysRunError(Exception):
    pass


def _resolve_yosys_binary() -> str:
    """Local-PATH-first resolution: SIMFORGE_YOSYS_PATH override (if it
    points at a real executable), else whatever `yosys` resolves to on PATH."""
    override = os.getenv("SIMFORGE_YOSYS_PATH")
    if override and shutil.which(override):
        return override
    if shutil.which("yosys"):
        return "yosys"
    raise YosysRunError(
        "yosys binary not found on PATH (and SIMFORGE_YOSYS_PATH is not set "
        "to a valid binary). Install yosys (e.g. `brew install yosys` / "
        "`apt-get install yosys`) or set SIMFORGE_YOSYS_PATH."
    )


_STAT_BLOCK_RE = re.compile(r"=== (\S+) ===\n(.*?)(?=\n===|\Z)", re.DOTALL)
_TOTAL_CELLS_RE = re.compile(r"(\d+)\s+cells\b")
# Cell-type name: EITHER yosys's generic internal cells ($_OR_, $_AND_, ...,
# from the "generic" target) OR bare technology-primitive names (SB_LUT4,
# SB_IO, ..., from the "ice40" target) — verified against real output from
# both `synth` and `synth_ice40` before writing this; the two targets use
# different naming conventions entirely, and the ice40 form has no leading
# "$" to distinguish it from other stat lines.
_CELL_TYPE_RE = re.compile(r"^\s*(\d+)\s+(\S+)\s*$", re.MULTILINE)


def _parse_yosys_stat(stdout: str) -> Dict[str, Any]:
    """
    Parse yosys's `stat` report into {module_name, total_cells, cell_counts}.

    Verified against real yosys 0.67 output before writing this (not
    assumed): `synth`'s own internal HIERARCHY pass prints an earlier stat
    block too, so this uses the LAST '=== <module> ===' block — the final,
    authoritative one from our own trailing `stat` command.
    """
    blocks = list(_STAT_BLOCK_RE.finditer(stdout))
    if not blocks:
        raise YosysRunError(f"Could not find yosys 'stat' output in log.\nFull output:\n{stdout[-2000:]}")
    module_name, block_text = blocks[-1].group(1), blocks[-1].group(2)

    total_match = _TOTAL_CELLS_RE.search(block_text)
    total_cells = int(total_match.group(1)) if total_match else 0

    cell_counts: Dict[str, int] = {}
    if total_match:
        # Cell-type breakdown lines only ever appear AFTER the "N cells"
        # summary line. Scoping to text after it is what makes the broadened
        # \S+ token match safe — earlier lines in the same block ("N wires",
        # "N public wires", "N ports", ...) share the identical "<count>
        # <word>" shape and would otherwise false-match as bogus cell types.
        after_cells = block_text[total_match.end():]
        for m in _CELL_TYPE_RE.finditer(after_cells):
            cell_counts[m.group(2)] = int(m.group(1))

    return {"module_name": module_name, "total_cells": total_cells, "cell_counts": cell_counts}


def run_yosys_synthesis(
    verilog_source: str,
    top_module: str,
    target: str = "generic",
    runs_dir: Path = None,
    task_id: str = "yosys-run",
    timeout_seconds: int = 60,
) -> Dict[str, Any]:
    """
    Run real Yosys synthesis against `verilog_source`, targeting `top_module`.

    Raises YosysRunError on missing binary or synthesis failure (tool's
    stderr included), so the caller (fpga_realization/pipeline.py) can
    decide how to degrade — mirrors NgspiceRunError's role in
    backend/circuits/ngspice_runner.py.
    """
    if not verilog_source or not verilog_source.strip():
        raise YosysRunError("No Verilog source provided to synthesize.")
    if not top_module or not top_module.strip():
        raise YosysRunError("No top_module name provided.")

    yosys_bin = _resolve_yosys_binary()

    base_dir = runs_dir or (Path(__file__).parent.parent / "simforge_runs")
    work_dir = base_dir / task_id
    work_dir.mkdir(parents=True, exist_ok=True)

    verilog_path = work_dir / "design.v"
    verilog_path.write_text(verilog_source)

    json_netlist_path = None
    if target == "generic":
        synth_cmd = f"synth -top {top_module}"
    elif target == "ice40":
        # -json here is what nextpnr's place & route step (Phase B) consumes
        # — technology-mapped to real iCE40 primitives (SB_LUT4 etc.), not
        # the generic $_AND_/$_OR_/... cells the "generic" target produces.
        json_netlist_path = work_dir / "netlist.json"
        synth_cmd = f"synth_ice40 -top {top_module} -json {json_netlist_path.name}"
    else:
        raise YosysRunError(f"Unsupported synthesis target: {target!r}")

    script = f"read_verilog {verilog_path.name}; {synth_cmd}; stat"
    cmd = [yosys_bin, "-p", script]

    try:
        outcome = run_tool(cmd, cwd=work_dir, timeout_seconds=timeout_seconds)
    except ExecutionError as exc:
        raise YosysRunError(str(exc))

    log_path = work_dir / "yosys.log"
    log_path.write_text((outcome["stdout"] or "") + "\n" + (outcome["stderr"] or ""))

    if outcome["returncode"] != 0:
        raise YosysRunError(
            f"yosys exited {outcome['returncode']}.\n"
            f"stderr:\n{outcome['stderr'][-1500:]}\nstdout:\n{outcome['stdout'][-1500:]}"
        )

    stat = _parse_yosys_stat(outcome["stdout"])
    stat["run_duration_s"] = round(outcome["elapsed_s"], 3)
    stat["log_path"] = str(log_path)
    stat["verilog_path"] = str(verilog_path)
    if json_netlist_path is not None:
        if not json_netlist_path.exists():
            raise YosysRunError(
                f"yosys exited 0 but didn't produce the expected JSON netlist.\n"
                f"Full output:\n{outcome['stdout'][-1500:]}"
            )
        stat["json_netlist_path"] = str(json_netlist_path)
    return stat
