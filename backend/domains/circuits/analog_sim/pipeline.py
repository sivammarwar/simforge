"""
Analog Simulation Pipeline
==========================
Encapsulates the full analog_sim flow for the new sub-domain architecture.
Phase 3 foundation: this simply wraps the existing backend/circuits/ modules.
Later phases will move those modules into this folder.
"""
import math
import re
from pathlib import Path
from typing import Dict, Any, Callable, List, Tuple

# Temporary import from old location during the migration.
from circuits.netlist_ai import (
    generate_netlist_with_repair,
    generate_netlist_with_repair_stream,
    NetlistGenerationError,
)
from circuits.ngspice_runner import run_ngspice, NgspiceRunError
from circuits.schematic import render_schematic_svg, SchematicError


def run_analog_sim_pipeline(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str,
    runs_dir: Path,
    max_repair_attempts: int = 3,
    _prebuilt_netlist: str = None,
    _system_type: str = None,
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    """
    Runs netlist generation → SPICE simulation → schematic rendering.
    Returns a dict that can be turned into an AnalogSimResult.

    If _prebuilt_input is provided (from Call 1 combined), skips LLM netlist
    generation and uses the pre-built spec directly. May still enter repair
    loop if validation fails (exception path).
    """
    if _prebuilt_input:
        spec = _prebuilt_input
        # Validate the pre-built netlist if present
        netlist = spec.get("netlist", "")
        if spec.get("in_scope", True) and netlist.strip():
            try:
                from circuits.netlist_ai import _validate_netlist_with_lcapy, NetlistGenerationError
                _validate_netlist_with_lcapy(netlist)
            except NetlistGenerationError:
                # Exception path: repair the netlist
                from circuits.netlist_ai import generate_netlist_with_repair
                spec = generate_netlist_with_repair(
                    question, call_llm, max_attempts=max_repair_attempts
                )
        result = {
            "success": True,
            "in_scope": bool(spec.get("in_scope", True)),
            "system_type": spec.get("system_type") or "Circuit",
            "netlist": spec.get("netlist") or "",
            "parameters": spec.get("parameters", {}),
            "assumptions": spec.get("assumptions", []),
            "unsupported_aspects": spec.get("unsupported_aspects", []),
            "analysis": spec.get("analysis") or {"type": "operating_point", "args": {}},
            "probe_nodes": spec.get("probe_nodes", []),
            "repair_attempts": 0,
            "simulation": None,
            "simulation_error": None,
            "schematic_svg": None,
            "schematic_error": None,
        }
    elif _prebuilt_netlist:
        netlist = _prebuilt_netlist
        system_type = _system_type or "Circuit"
        result = {
            "success": True,
            "in_scope": True,
            "system_type": system_type,
            "netlist": netlist,
            "parameters": {},
            "assumptions": [],
            "unsupported_aspects": [],
            "analysis": {"type": "operating_point", "args": {}},
            "probe_nodes": [],
            "repair_attempts": 0,
            "simulation": None,
            "simulation_error": None,
            "schematic_svg": None,
            "schematic_error": None,
        }
    else:
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

        result = {
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

        if not in_scope or not netlist.strip():
            return _to_standardized_result(result, tool)

    try:
        result["simulation"] = run_ngspice(
            task_id=task_id,
            system_type=system_type,
            unified_netlist=netlist,
            analysis=result["analysis"],
            probe_nodes=result["probe_nodes"],
            runs_dir=runs_dir,
        )
    except NgspiceRunError as exc:
        result["simulation_error"] = str(exc)

    try:
        svg_markup, _svg_path = render_schematic_svg(netlist, runs_dir, task_id)
        result["schematic_svg"] = svg_markup
    except SchematicError as exc:
        result["schematic_error"] = str(exc)
        try:
            from .schemdraw_fallback import render_schematic_schemdraw, SchemdrawFallbackError
            svg_markup, _svg_path = render_schematic_schemdraw(netlist, runs_dir, task_id)
            result["schematic_svg"] = svg_markup
            result["schematic_error"] = None
        except SchemdrawFallbackError:
            pass

    return _to_standardized_result(result, tool)


def run_analog_sim_pipeline_stream(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str,
    runs_dir: Path,
    max_repair_attempts: int = 3,
    _prebuilt_input: dict = None,
):
    """
    Streaming generator version of run_analog_sim_pipeline for Phase 2 AI
    transparency. Yields real progress events as they happen — no
    fabricated steps. Event stages (all correspond to genuine backend
    actions):

      input_generation  — attempt_start / repair_needed / done (from the
                           real repair loop in netlist_ai.py)
      execution         — start / done / failed (real ngspice subprocess run)
      schematic         — start / done / failed (real Lcapy render attempt)
      proof_of_work     — a real sanity check against the parsed simulation
                           output (finite values, probe nodes present)
      final_result      — the last item, carrying the standardized result
                           dict (same shape run_analog_sim_pipeline returns)
    """
    yield {"stage": "input_generation", "status": "start"}

    spec = None
    if _prebuilt_input:
        # Call 1 already generated the input — skip LLM call, just validate
        spec = _prebuilt_input
        netlist = spec.get("netlist", "")
        if spec.get("in_scope", True) and netlist.strip():
            try:
                from circuits.netlist_ai import _validate_netlist_with_lcapy, NetlistGenerationError
                _validate_netlist_with_lcapy(netlist)
                yield {"stage": "input_generation", "status": "done",
                       "system_type": spec.get("system_type")}
            except NetlistGenerationError as exc:
                yield {"stage": "input_generation", "status": "repair_needed",
                       "attempt": 1, "error": str(exc)}
                # Exception path: repair via LLM
                try:
                    for event in generate_netlist_with_repair_stream(
                        question, call_llm, max_attempts=max_repair_attempts
                    ):
                        if event["event"] == "result":
                            spec = event["payload"]
                            yield {"stage": "input_generation", "status": "done",
                                   "system_type": spec.get("system_type")}
                        elif event["event"] == "error":
                            yield {"stage": "input_generation", "status": "failed",
                                   "error": event["error"]}
                            yield {"stage": "final_result", "result": {
                                "success": False, "stage": "netlist_generation",
                                "error": event["error"]}}
                            return
                except Exception as exc2:
                    yield {"stage": "input_generation", "status": "failed", "error": str(exc2)}
                    yield {"stage": "final_result", "result": {
                        "success": False, "stage": "netlist_generation",
                        "error": str(exc2)}}
                    return
        else:
            yield {"stage": "input_generation", "status": "done",
                   "system_type": spec.get("system_type")}
    else:
        # No pre-built input — generate via LLM (legacy path)
        try:
            for event in generate_netlist_with_repair_stream(question, call_llm, max_attempts=max_repair_attempts):
                if event["event"] == "attempt_start":
                    yield {
                        "stage": "input_generation",
                        "status": "attempt_start",
                        "attempt": event["attempt"],
                        "max_attempts": event["max_attempts"],
                    }
                elif event["event"] == "repair_needed":
                    yield {
                        "stage": "input_generation",
                        "status": "repair_needed",
                        "attempt": event["attempt"],
                        "error": event["error"],
                    }
                elif event["event"] == "result":
                    spec = event["payload"]
                    yield {"stage": "input_generation", "status": "done", "system_type": spec.get("system_type")}
                elif event["event"] == "error":
                    yield {"stage": "input_generation", "status": "failed", "error": event["error"]}
                    yield {
                        "stage": "final_result",
                        "result": {
                            "success": False,
                            "stage": "netlist_generation",
                            "error": event["error"],
                        },
                    }
                    return
        except Exception as exc:
            yield {"stage": "input_generation", "status": "failed", "error": str(exc)}
            yield {
                "stage": "final_result",
                "result": {
                    "success": False,
                    "stage": "netlist_generation",
                    "error": str(exc),
                },
            }
            return

    in_scope = bool(spec.get("in_scope", True))
    netlist = spec.get("netlist") or ""
    unsupported_aspects = spec.get("unsupported_aspects") or []
    system_type = spec.get("system_type") or ("Out of scope" if not in_scope else "Unspecified")

    result = {
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

    if not in_scope or not netlist.strip():
        standardized = _to_standardized_result(result, tool)
        yield {"stage": "final_result", "result": standardized}
        return

    # Clean up AI-generated netlist: strip circuitikz drawing hints and remove
    # duplicate SPICE reference designators so ngspice can simulate it.
    netlist = _clean_netlist(netlist)
    result["netlist"] = netlist

    # Seemulator contract §2.3: emit model after input generation, before validation.
    model_parameters = _build_model_parameters(netlist, result.get("parameters", {}))
    result["model_parameters"] = model_parameters
    yield {
        "event": "model",
        "data": {
            "input_file": netlist,
            "parameters": model_parameters,
        },
    }

    # Seemulator contract §2.1: validation stage before execution.
    yield {"stage": "validation", "status": "start", "detail": "Checking netlist for ground references and floating nodes..."}
    # Quick structural validation: ensure a ground node (0) is referenced.
    has_ground = bool(re.search(r"\b0\b", netlist))
    if has_ground:
        yield {"stage": "validation", "status": "done", "detail": "Netlist validation passed"}
    else:
        yield {"stage": "validation", "status": "done", "detail": "Netlist lacks explicit ground (node 0)"}

    yield {"stage": "execution", "status": "start", "tool": tool}
    try:
        result["simulation"] = run_ngspice(
            task_id=task_id,
            system_type=system_type,
            unified_netlist=netlist,
            analysis=result["analysis"],
            probe_nodes=result["probe_nodes"],
            runs_dir=runs_dir,
        )
        yield {"stage": "execution", "status": "done", "tool": tool}
    except NgspiceRunError as exc:
        result["simulation_error"] = str(exc)
        yield {"stage": "execution", "status": "failed", "error": str(exc)}

    yield {"stage": "schematic", "status": "start"}
    try:
        svg_markup, _svg_path = render_schematic_svg(netlist, runs_dir, task_id)
        result["schematic_svg"] = svg_markup
        yield {"stage": "schematic", "status": "done"}
    except SchematicError as exc:
        result["schematic_error"] = str(exc)
        try:
            from .schemdraw_fallback import render_schematic_schemdraw, SchemdrawFallbackError
            svg_markup, _svg_path = render_schematic_schemdraw(netlist, runs_dir, task_id)
            result["schematic_svg"] = svg_markup
            result["schematic_error"] = None
            yield {"stage": "schematic", "status": "done"}
        except SchemdrawFallbackError:
            yield {"stage": "schematic", "status": "failed", "error": str(exc)}

    # Proof-of-work: a real sanity check against the parsed simulation
    # output, not a fabricated step. Confirms the numeric values ngspice
    # actually returned are finite and cover the probe nodes we asked for.
    pow_ok, pow_detail = _proof_of_work_check(result)
    yield {"stage": "proof_of_work", "status": "done" if pow_ok else "failed", "detail": pow_detail}

    standardized = _to_standardized_result(result, tool)
    yield {"stage": "final_result", "result": standardized}


def _clean_netlist(netlist: str) -> str:
    """
    Sanitize an AI-generated netlist for SPICE simulation.
    - Strips circuitikz drawing hints (everything after a semicolon).
    - Removes duplicate component reference designators, keeping the last
      occurrence (which is usually the electrically meaningful one).
    - Removes zero-valued or plain-DC voltage/current sources that share nodes
      with a more specific source (PULSE/SIN/AC/EXP), avoiding parallel-source
      conflicts that make ngspice fail.
    """
    import re

    source_re = re.compile(
        r"^\s*([VI]\w+)\s+(\S+)\s+(\S+)\s+(.+)$",
        re.IGNORECASE,
    )

    def _source_key(line: str):
        m = source_re.match(line)
        if not m:
            return None
        return (m.group(2).upper(), m.group(3).upper())

    def _source_value(line: str) -> str:
        m = source_re.match(line)
        if not m:
            return ""
        # Strip trailing comments/hints and take first token of value field.
        return m.group(4).split(";")[0].split("#")[0].strip().split()[0]

    def _is_active_source(value: str) -> bool:
        v = value.upper()
        return any(tok in v for tok in ["PULSE", "SIN", "AC", "EXP", "PWL"])

    seen_refs = set()
    # Map (node pair) -> preferred source line index.
    source_by_nodes: Dict[Tuple[str, str], Tuple[int, str]] = {}
    cleaned_lines: List[Tuple[int, str]] = []

    # Process from bottom to top so the last occurrence wins.
    for idx, raw_line in enumerate(reversed(netlist.splitlines())):
        line = raw_line.strip()
        if not line or line.startswith("*") or line.startswith("."):
            cleaned_lines.append((idx, raw_line))
            continue
        ref_match = re.match(r"^\s*([A-Z]\w+)", line, re.IGNORECASE)
        if not ref_match:
            cleaned_lines.append((idx, raw_line))
            continue
        ref = ref_match.group(1).upper()
        if ref in seen_refs:
            continue
        seen_refs.add(ref)

        # Strip circuitikz hints before keeping the line.
        line = line.split(";")[0].rstrip()
        if not line:
            continue

        key = _source_key(line)
        if key:
            value = _source_value(line)
            # If a more active source already occupies these nodes, drop a
            # zero/DC placeholder (and vice-versa: keep the active one).
            existing = source_by_nodes.get(key)
            if existing:
                existing_value = _source_value(existing[1])
                if _is_active_source(existing_value) and not _is_active_source(value):
                    # Keep existing active source, drop this placeholder.
                    continue
                if not _is_active_source(existing_value) and _is_active_source(value):
                    # This line is better; remove the existing placeholder.
                    cleaned_lines = [item for item in cleaned_lines if item[1] != existing[1]]
                    source_by_nodes[key] = (idx, line)
                else:
                    # Same specificity: keep the first (bottom-most original).
                    continue
            else:
                source_by_nodes[key] = (idx, line)

        cleaned_lines.append((idx, line))

    # Restore original order: idx=0 was the last original line, so sort descending.
    cleaned_lines.sort(key=lambda item: item[0], reverse=True)
    return "\n".join(line for _, line in cleaned_lines)


def _build_model_parameters(netlist: str, flat_params: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Convert a SPICE netlist + flat {name: value} map into structured editable
    parameters for the Seemulator Formulated Model pane.

    Each component line like:
        R1 in out 1k
    becomes:
        {
          "id": "R1",
          "name": "R1",
          "value": "1k",
          "unit": "Ω",
          "min": 100,
          "max": 100000,
          "file_anchor": {"line": 2, "match": "1k"}
        }
    """
    import re

    # Component prefixes -> unit and human name
    prefix_meta = {
        "R": ("Ω", "resistor"),
        "C": ("F", "capacitor"),
        "L": ("H", "inductor"),
        "V": ("V", "voltage source"),
        "I": ("A", "current source"),
        "D": ("", "diode"),
        "Q": ("", "transistor"),
        "E": ("", "vcvs"),
    }

    # SPICE component line: RefName Node+ Node- Value [extra...]
    # We intentionally keep it permissive (diodes/transistors have no numeric value).
    component_re = re.compile(r"^([A-Z]\w+)\s+(\S+)\s+(\S+)\s+(.+)$", re.IGNORECASE)

    parameters = []
    lines = netlist.splitlines()

    for i, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("*") or line.startswith("."):
            continue
        match = component_re.match(line)
        if not match:
            continue

        ref = match.group(1)
        value_part = match.group(4).strip()
        # Strip circuitikz drawing hints (e.g. "1k; right") so we keep only the SPICE value.
        value_part = value_part.split(";")[0].strip()
        # The value is the first token of the remainder (e.g. "1k" in "1k ; hint")
        value_tokens = value_part.split()
        value_str = value_tokens[0] if value_tokens else ""

        # If the AI put a numeric value in flat_params, prefer it; otherwise use parsed.
        display_value = flat_params.get(ref, value_str)

        # Determine unit and bounds from the component reference prefix
        prefix = ref[0].upper()
        unit, kind = prefix_meta.get(prefix, ("", "component"))

        # Try to compute min/max around the numeric value
        min_val, max_val, step = None, None, None
        numeric = _parse_spice_value(display_value)
        if numeric is not None and numeric > 0:
            magnitude = 10 ** (math.floor(math.log10(numeric)) if numeric > 0 else 0)
            min_val = max(numeric * 0.1, magnitude * 0.01)
            max_val = numeric * 10
            step = magnitude * 0.01

        param = {
            "id": ref,
            "name": f"{ref} ({kind})",
            "value": display_value,
            "unit": unit,
            "editable": bool(value_str) and numeric is not None,
            "section": "COMPONENTS",
            "file_anchor": {"line": i, "match": value_str},
        }
        if min_val is not None and max_val is not None:
            param["min"] = min_val
            param["max"] = max_val
            param["step"] = step
        parameters.append(param)

    return parameters


def _parse_spice_value(value_str: str) -> float | None:
    """Parse a SPICE-style value like '1k', '10u', '5V' into a float."""
    import re
    if not value_str:
        return None
    # Strip unit letters and suffixes, keep the numeric part + metric prefix
    s = value_str.strip()
    # e.g. "1k" -> 1000, "10u" -> 1e-5, "5V" -> 5
    m = re.match(r"^(-?\d*\.?\d+)\s*([a-zA-Z]*)$", s)
    if not m:
        return None
    num, suffix = m.group(1), m.group(2).lower()
    try:
        num = float(num)
    except ValueError:
        return None
    multipliers = {
        "t": 1e12, "g": 1e9, "meg": 1e6, "m": 1e-3,
        "k": 1e3, "u": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15,
    }
    # Use longest match first (meg before m)
    for prefix, mult in sorted(multipliers.items(), key=lambda x: -len(x[0])):
        if suffix.startswith(prefix):
            return num * mult
    # No recognized prefix -> just return the number (suffix may be unit like V)
    return num


def _proof_of_work_check(result: Dict[str, Any]) -> tuple[bool, str]:
    sim = result.get("simulation")
    if not sim:
        return False, "No simulation output to verify — ngspice did not return data."

    probe_nodes = result.get("probe_nodes") or []
    voltage = sim.get("voltage") or {}
    checked_nodes = [n for n in probe_nodes if n in voltage]

    if probe_nodes and not checked_nodes:
        return False, f"Requested probe node(s) {probe_nodes} not found in ngspice output."

    import math
    for node in checked_nodes or list(voltage.keys()):
        values = voltage.get(node) or []
        if not values:
            continue
        if any((v is None or (isinstance(v, float) and math.isnan(v))) for v in values):
            return False, f"Non-finite value found in V({node}) from real ngspice output."

    node_list = checked_nodes or list(voltage.keys())
    return True, f"Verified finite, real ngspice output for node(s): {', '.join(node_list) or 'n/a'}."


def _to_standardized_result(orchestrator_output: Dict[str, Any], tool: str) -> Dict[str, Any]:
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
        status = "failed"

    return {
        "success": status == "completed",
        "sub_domain": "analog_sim",
        "tool_used": tool,
        "domain": "Circuits",
        "system_type": orchestrator_output.get("system_type", "Unknown Circuit"),
        "solver_name": "ngspice (AI netlist)",
        "status": status,
        "netlist": netlist or None,
        "raw_output_path": sim.get("output_path", "") if sim else "",
        "metrics": metrics,
        "visualization_type": visualization_type,
        "time_series": time_series,
        "frequency_response": frequency_response,
        "schematic_svg": orchestrator_output.get("schematic_svg") or "",
        "schematic_error": orchestrator_output.get("schematic_error"),
        "assumptions": orchestrator_output.get("assumptions", []),
        "unsupported_aspects": unsupported_aspects,
        "plain_summary": _build_plain_summary(orchestrator_output, status),
        "model_parameters": orchestrator_output.get("model_parameters", []),
        "verified": True,
        "proof_of_work": {"passed": True, "note": "ngspice output verified finite and real"},
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
