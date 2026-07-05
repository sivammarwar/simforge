"""
Circuits Domain Orchestrator
==============================
The single entry point the rest of your backend calls for a circuits
question. Wires together (in order):

  1. AI netlist generation + Lcapy-validated repair loop  (netlist_ai.py)
     — now also does in-scope / feasibility classification, see netlist_ai.py
  2. ngspice simulation via the deterministic SPICE translation
     + wrdata ASCII parsing                                (ngspice_runner.py)
  3. Lcapy schematic rendering from the SAME netlist         (schematic.py)

This intentionally replaces the old flow of:
   classifier.js -> netlister.js (per-type hardcoded) -> schematicGenerator.js
   (per-type hardcoded) -> solvers.js (per-type analytic reimplementation)

with one AI generation + two deterministic derivations, so it scales to any
circuit topology instead of one hand-written function per circuit type.

RESULT STATUSES (new): every result now carries a `status` of one of:
  - "completed"    — simulated successfully, full result available
  - "failed"       — netlist was generated but ngspice/schematic errored
  - "unsupported"  — in-scope circuits question, but nothing about it (or
                      part of it) is something this pipeline can simulate
  - "out_of_scope" — not a circuits/electronics question at all

"unsupported" and "out_of_scope" are NOT treated as hard failures at the API
layer (`solve_circuit_question` still returns success=True) — they're valid,
informative answers. Only a genuine netlist-generation breakdown (malformed
AI output that never resolves even after repair attempts) is a hard failure.
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
    print(f"[FLOW TRACE] 4/9 orchestrator.py — solve_circuit_question() called for task_id={task_id}")
    """
    Returns a dict shaped for direct use by the frontend:
      {
        success, in_scope, system_type, netlist, parameters, assumptions,
        unsupported_aspects, analysis, probe_nodes,
        simulation: {...} | None,
        simulation_error: str | None,
        schematic_svg: str | None,
        schematic_error: str | None,
        stage: str  (only present on hard failure)
      }

    Netlist-GENERATION failing outright (malformed AI JSON that never
    resolves after repair attempts) is the only hard failure — nothing to
    simulate or draw and no informative unsupported_aspects to show either.

    "in_scope=false" or "netlist=''" are valid terminal outcomes, not
    errors — they short-circuit before simulation/schematic since there's
    nothing generated to run or draw. Simulation and schematic failures
    (when there IS a netlist) are reported independently — a schematic can
    still render even if e.g. ngspice isn't reachable, and vice versa, so
    the frontend can show partial results instead of nothing.
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

    in_scope = bool(spec.get("in_scope", True))
    netlist = spec.get("netlist") or ""
    unsupported_aspects = spec.get("unsupported_aspects") or []
    system_type = spec.get("system_type") or ("Out of scope" if not in_scope else "Unspecified")

    result: Dict[str, Any] = {
        "success": True,
        "in_scope": in_scope,
        "system_type": system_type,
        "netlist": netlist,
        "parameters": spec.get("parameters", {}),
        "assumptions": spec.get("assumptions", []),
        "unsupported_aspects": unsupported_aspects,
        "analysis": spec.get("analysis") or {"type": "operating_point", "args": {}},
        "probe_nodes": spec.get("probe_nodes", []),
        "repair_attempts": spec.get("_repair_attempts", 1),
        "simulation": None,
        "simulation_error": None,
        "schematic_svg": None,
        "schematic_error": None,
    }

    # Terminal states: nothing was generated to simulate or draw, so skip
    # both stages entirely rather than attempting them against an empty
    # or nonexistent netlist.
    if not in_scope or not netlist.strip():
        return result

    try:
        result["simulation"] = run_ngspice(
            task_id=task_id,
            system_type=system_type,
            unified_netlist=netlist,
            analysis=result["analysis"],
            probe_nodes=result["probe_nodes"],
            runs_dir=RUNS_DIR,
        )
        print(f"[DEBUG] run_ngspice returned: {result['simulation'] is not None}, keys={list(result['simulation'].keys()) if result['simulation'] else 'N/A'}")
    except NgspiceRunError as exc:
        result["simulation_error"] = str(exc)
        print(f"[DEBUG] run_ngspice raised NgspiceRunError: {exc}")

    try:
        svg_markup, _svg_path = render_schematic_svg(
            netlist, RUNS_DIR, task_id
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

    Adds two new pass-through fields the frontend now reads:
      - unsupported_aspects: string[] — always present (possibly empty)
      - status: "completed" | "failed" | "unsupported" | "out_of_scope"
    """
    in_scope = bool(orchestrator_output.get("in_scope", True))
    netlist = orchestrator_output.get("netlist") or ""
    unsupported_aspects = orchestrator_output.get("unsupported_aspects") or []
    sim = orchestrator_output.get("simulation")
    analysis_type = (orchestrator_output.get("analysis") or {}).get("type", "operating_point")

    metrics = []
    for name, value in (orchestrator_output.get("parameters") or {}).items():
        metrics.append({"name": name, "value": value})

    time_series = None
    frequency_response = None
    visualization_type = "diagram_only"

    if not in_scope:
        status = "out_of_scope"
        visualization_type = "none"

    elif not netlist.strip():
        status = "unsupported"
        visualization_type = "none"

    elif sim:
        status = "completed"
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
    else:
        # In-scope, netlist existed, but simulation errored out.
        status = "failed"

    print(f"[DEBUG] to_standardized_result: status={status}, sim={sim is not None}, sim_error={orchestrator_output.get('simulation_error')}, analysis_type={analysis_type}")
    if sim and analysis_type == "ac":
        print(f"[DEBUG] AC sim keys: {list(sim.keys())}, magnitude_db={sim.get('magnitude_db')}, phase_deg={sim.get('phase_deg')}")

    if status == "completed":
        # Deferred import: api_routes.py imports this module at load time,
        # so importing AnalogSimResult at module scope here would deadlock
        # on the circular import.
        from .api_routes import AnalogSimResult

        return AnalogSimResult(
            sub_domain="analog_sim",
            tool_used="ngspice",
            netlist=netlist,
            raw_output_path=sim.get("output_path", "") if sim else "",
            metrics=metrics,
            frequency_response=frequency_response,
            time_series=time_series,
            schematic_svg=orchestrator_output.get("schematic_svg") or "",
        )

    return {
        "domain": "Circuits",
        "system_type": orchestrator_output.get("system_type", "Unknown Circuit"),
        "solver_name": "ngspice (AI netlist)",
        "status": status,
        "metrics": metrics,
        "time_series": time_series,
        "frequency_response": frequency_response,
        "visualization_type": visualization_type,
        "netlist": netlist or None,
        "schematic_svg": orchestrator_output.get("schematic_svg"),
        "schematic_error": orchestrator_output.get("schematic_error"),
        "assumptions": orchestrator_output.get("assumptions", []),
        "unsupported_aspects": unsupported_aspects,
        "plain_summary": _build_plain_summary(orchestrator_output, status),
    }


def _build_plain_summary(orchestrator_output: Dict[str, Any], status: str) -> str:
    system_type = orchestrator_output.get("system_type") or "circuit"
    unsupported = orchestrator_output.get("unsupported_aspects") or []

    if status == "out_of_scope":
        reason = unsupported[0] if unsupported else "This doesn't look like a circuits/electronics question."
        return (
            f"This isn't something the Circuits/ngspice tool can help with. {reason} "
            f"We're still working on covering this — try rephrasing it as a circuit "
            f"design or analysis question."
        )

    if status == "unsupported":
        parts = "; ".join(unsupported) if unsupported else "the specific analysis requested"
        return (
            f"This is a circuits question, but {parts} isn't something this pipeline can "
            f"simulate yet. We're still working on this."
        )

    sim = orchestrator_output.get("simulation")
    if status == "failed" or not sim:
        err = orchestrator_output.get("simulation_error", "unknown error")
        base = f"Netlist generated for {system_type}, but simulation failed: {err}"
    else:
        analysis_type = (orchestrator_output.get("analysis") or {}).get("type")
        if analysis_type == "operating_point":
            parts = [
                f"V({node}) = {values[0]:.3f} V"
                for node, values in (sim.get("voltage") or {}).items()
                if values
            ]
            base = f"{system_type} solved. " + ", ".join(parts)
        elif analysis_type == "transient":
            base = f"{system_type} transient simulation complete over {len(sim.get('scale', []))} time points."
        elif analysis_type == "ac":
            base = f"{system_type} AC sweep complete over {len(sim.get('scale', []))} frequency points."
        else:
            base = f"{system_type} simulation complete."

    if unsupported:
        base += f" Note: we're still working on: {'; '.join(unsupported)}."

    return base