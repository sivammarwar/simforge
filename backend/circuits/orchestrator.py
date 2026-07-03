"""
Circuits Domain Orchestrator
==============================
The single entry point the rest of your backend calls for a circuits
question. Wires together (in order):

  1. AI netlist generation + Lcapy-validated repair loop  (netlist_ai.py)
  2. ngspice simulation via the deterministic SPICE translation
     + wrdata ASCII parsing                                (ngspice_runner.py)
  3. Lcapy schematic rendering from the SAME netlist         (schematic.py)

This intentionally replaces the old flow of:
   classifier.js -> netlister.js (per-type hardcoded) -> schematicGenerator.js
   (per-type hardcoded) -> solvers.js (per-type analytic reimplementation)

with one AI generation + two deterministic derivations, so it scales to any
circuit topology instead of one hand-written function per circuit type.
"""

from pathlib import Path
from typing import Dict, Any, Callable

from .netlist_ai import generate_netlist_with_repair, NetlistGenerationError
from .ngspice_runner import run_ngspice, NgspiceRunError
from .schematic import render_schematic_svg, SchematicError

RUNS_DIR = Path(__file__).parent.parent / "simforge_runs"


def solve_circuit_question(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int = 3,
) -> Dict[str, Any]:
    """
    Returns a dict shaped for direct use by the frontend:
      {
        success, system_type, netlist, parameters, assumptions,
        analysis, probe_nodes,
        simulation: {...} | None,
        simulation_error: str | None,
        schematic_svg: str | None,
        schematic_error: str | None,
        stage: str  (only present on hard failure)
      }

    Netlist generation failing is a hard failure (nothing to simulate or
    draw). Simulation and schematic failures are reported independently —
    a schematic can still render even if e.g. ngspice isn't reachable, and
    vice versa, so the frontend can show partial results instead of nothing.
    """
    try:
        spec = generate_netlist_with_repair(
            question, call_llm, max_attempts=max_repair_attempts
        )
    except NetlistGenerationError as exc:
        return {
            "success": False,
            "stage": "netlist_generation",
            "error": str(exc),
        }

    result: Dict[str, Any] = {
        "success": True,
        "system_type": spec["system_type"],
        "netlist": spec["netlist"],
        "parameters": spec.get("parameters", {}),
        "assumptions": spec.get("assumptions", []),
        "analysis": spec["analysis"],
        "probe_nodes": spec["probe_nodes"],
        "repair_attempts": spec.get("_repair_attempts", 1),
        "simulation": None,
        "simulation_error": None,
        "schematic_svg": None,
        "schematic_error": None,
    }

    try:
        result["simulation"] = run_ngspice(
            task_id=task_id,
            system_type=spec["system_type"],
            unified_netlist=spec["netlist"],
            analysis=spec["analysis"],
            probe_nodes=spec["probe_nodes"],
            runs_dir=RUNS_DIR,
        )
    except NgspiceRunError as exc:
        result["simulation_error"] = str(exc)

    try:
        svg_markup, _svg_path = render_schematic_svg(
            spec["netlist"], RUNS_DIR, task_id
        )
        result["schematic_svg"] = svg_markup
    except SchematicError as exc:
        result["schematic_error"] = str(exc)

    return result


def to_standardized_result(orchestrator_output: Dict[str, Any]) -> Dict[str, Any]:
    """
    Adapts the orchestrator's output into the STANDARDIZED SOLVER RESULT
    STRUCTURE your frontend's plotFactory / getPlots already expect
    (see solvers.js header comment), so downstream rendering code doesn't
    need domain-specific branches for the new circuits path.
    """
    sim = orchestrator_output.get("simulation")
    analysis_type = (orchestrator_output.get("analysis") or {}).get("type", "operating_point")

    metrics = []
    for name, value in (orchestrator_output.get("parameters") or {}).items():
        metrics.append({"name": name, "value": value})

    time_series = None
    frequency_response = None
    visualization_type = "diagram_only"

    if sim:
        metrics.append({"name": "Run duration", "value": f"{sim.get('run_duration_s', 0):.3f} s"})

        if analysis_type == "operating_point":
            for node, values in (sim.get("voltage") or {}).items():
                if values:
                    metrics.append({"name": f"V({node})", "value": f"{values[0]:.4f} V"})
            visualization_type = "diagram_only"

        elif analysis_type == "transient":
            voltage_series = sim.get("voltage") or {}
            probe_nodes = list(voltage_series.keys())
            if probe_nodes:
                time_series = {"t": sim["scale"]}
                for node in probe_nodes:
                    time_series[f"V_{node}"] = voltage_series[node]
                visualization_type = "transient_waveform"

        elif analysis_type == "ac":
            mag_series = sim.get("magnitude_db") or {}
            phase_series = sim.get("phase_deg") or {}
            if mag_series:
                first_node = next(iter(mag_series))
                frequency_response = {
                    "freq": sim["scale"],
                    "mag": mag_series[first_node],
                    "phase": phase_series.get(first_node, []),
                }
                visualization_type = "frequency_response"

    return {
        "domain": "Circuits",
        "system_type": orchestrator_output.get("system_type", "Unknown Circuit"),
        "solver_name": "ngspice (AI netlist)",
        "status": "completed" if sim else "failed",
        "metrics": metrics,
        "time_series": time_series,
        "frequency_response": frequency_response,
        "visualization_type": visualization_type,
        "netlist": orchestrator_output.get("netlist"),
        "schematic_svg": orchestrator_output.get("schematic_svg"),
        "schematic_error": orchestrator_output.get("schematic_error"),
        "assumptions": orchestrator_output.get("assumptions", []),
        "plain_summary": _build_plain_summary(orchestrator_output),
    }


def _build_plain_summary(orchestrator_output: Dict[str, Any]) -> str:
    sim = orchestrator_output.get("simulation")
    system_type = orchestrator_output.get("system_type", "circuit")
    if not sim:
        err = orchestrator_output.get("simulation_error", "unknown error")
        return f"Netlist generated for {system_type}, but simulation failed: {err}"

    analysis_type = (orchestrator_output.get("analysis") or {}).get("type")
    if analysis_type == "operating_point":
        parts = [
            f"V({node}) = {values[0]:.3f} V"
            for node, values in (sim.get("voltage") or {}).items()
            if values
        ]
        return f"{system_type} solved. " + ", ".join(parts)
    if analysis_type == "transient":
        return f"{system_type} transient simulation complete over {len(sim.get('scale', []))} time points."
    if analysis_type == "ac":
        return f"{system_type} AC sweep complete over {len(sim.get('scale', []))} frequency points."
    return f"{system_type} simulation complete."
