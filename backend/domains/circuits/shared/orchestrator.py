"""
Top-Level Circuits Orchestrator — Two-Call AI Pipeline
=======================================================
Exactly 2 AI calls per user turn (excluding intent classification and repair retries):

  Call 1: Combined sub-domain selection + solver-ready input generation (one AI call).
  Real Execution: Deterministic solver runs (ngspice, SymPy, NumPy, etc.) — no AI.
    Repair loop is an exception path (re-prompt on validation failure).
  Call 2: Final structured answer from all results (one AI call).

Both batch (solve_circuits_question) and streaming (solve_circuits_question_stream)
versions are supported.
"""
from pathlib import Path
from typing import Dict, Any, Callable, List, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from .call1_combined import generate_selection_and_inputs, repair_input
from .call2_answer import generate_final_answer
from .result_registry import parse_result
from .result_merger import merge_results

RUNS_DIR = Path(__file__).parent.parent / "simforge_runs"

# Sub-domains whose results are verified by a real deterministic solver.
_VERIFIED_SUB_DOMAINS = {
    "analog_sim", "symbolic_analysis", "digital_logic",
    "numerical_processing", "control_systems",
}


def _is_verified_sub_domain(sub_domain: str) -> bool:
    return sub_domain in _VERIFIED_SUB_DOMAINS


# ── Sub-domain pipeline dispatch ────────────────────────────────────────────

def _run_sub_domain_batch(
    sel_dict: Dict[str, Any],
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int,
    prebuilt_input: dict = None,
) -> Dict[str, Any]:
    """Run a single sub-domain pipeline (batch mode), never raising."""
    try:
        return _dispatch_sub_domain_batch(sel_dict, question, call_llm, task_id, max_repair_attempts, prebuilt_input)
    except Exception as exc:
        return {
            "success": False, "stage": "execution",
            "error": f"Pipeline {sel_dict.get('sub_domain')} crashed: {exc}",
        }


def _dispatch_sub_domain_batch(
    sel_dict: Dict[str, Any],
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int,
    prebuilt_input: dict = None,
) -> Dict[str, Any]:
    """Route to a single sub-domain pipeline (batch mode)."""
    sd, tool = sel_dict.get("sub_domain"), sel_dict.get("tool", "")
    if sd == "analog_sim":
        from ..analog_sim.pipeline import run_analog_sim_pipeline
        return run_analog_sim_pipeline(
            question=question, call_llm=call_llm, task_id=task_id,
            tool=tool, runs_dir=RUNS_DIR, max_repair_attempts=max_repair_attempts,
            _prebuilt_input=prebuilt_input,
        )
    elif sd == "symbolic_analysis":
        from ..symbolic_analysis.pipeline import run_symbolic_pipeline
        return run_symbolic_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                     _prebuilt_input=prebuilt_input)
    elif sd == "digital_logic":
        from ..digital_logic.pipeline import run_digital_logic_pipeline
        return run_digital_logic_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                          _prebuilt_input=prebuilt_input)
    elif sd == "numerical_processing":
        from ..numerical_processing.pipeline import run_numerical_pipeline
        return run_numerical_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                      _prebuilt_input=prebuilt_input)
    elif sd == "control_systems":
        from ..control_systems.pipeline import run_control_systems_pipeline
        return run_control_systems_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                            _prebuilt_input=prebuilt_input)
    elif sd == "rf_em":
        from ..rf_em.pipeline import run_rf_em_pipeline
        return run_rf_em_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                  _prebuilt_input=prebuilt_input)
    elif sd == "pcb_realization":
        from ..pcb_realization.pipeline import run_pcb_realization_pipeline
        return run_pcb_realization_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                            _prebuilt_input=prebuilt_input)
    elif sd == "fpga_realization":
        from ..fpga_realization.pipeline import run_fpga_realization_pipeline
        return run_fpga_realization_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                             _prebuilt_input=prebuilt_input)
    elif sd == "semiconductor_device":
        from ..semiconductor_device.pipeline import run_semiconductor_device_pipeline
        return run_semiconductor_device_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                 _prebuilt_input=prebuilt_input)
    elif sd == "physical_design":
        from ..physical_design.pipeline import run_physical_design_pipeline
        return run_physical_design_pipeline(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                            _prebuilt_input=prebuilt_input)
    else:
        return {
            "success": False, "stage": "tool_selection",
            "error": f"Sub-domain {sd} not yet implemented.",
        }


def _run_sub_domain_stream(
    sel_dict: Dict[str, Any],
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int,
    prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    """Run a single sub-domain pipeline (streaming mode). Yields events."""
    sd, tool = sel_dict.get("sub_domain"), sel_dict.get("tool", "")
    if sd == "analog_sim":
        from ..analog_sim.pipeline import run_analog_sim_pipeline_stream
        yield from run_analog_sim_pipeline_stream(
            question=question, call_llm=call_llm, task_id=task_id,
            tool=tool, runs_dir=RUNS_DIR, max_repair_attempts=max_repair_attempts,
            _prebuilt_input=prebuilt_input,
        )
    elif sd == "symbolic_analysis":
        from ..symbolic_analysis.pipeline import run_symbolic_pipeline_stream
        yield from run_symbolic_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                _prebuilt_input=prebuilt_input)
    elif sd == "digital_logic":
        from ..digital_logic.pipeline import run_digital_logic_pipeline_stream
        yield from run_digital_logic_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                     _prebuilt_input=prebuilt_input)
    elif sd == "numerical_processing":
        from ..numerical_processing.pipeline import run_numerical_pipeline_stream
        yield from run_numerical_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                 _prebuilt_input=prebuilt_input)
    elif sd == "control_systems":
        from ..control_systems.pipeline import run_control_systems_pipeline_stream
        yield from run_control_systems_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                       _prebuilt_input=prebuilt_input)
    elif sd == "rf_em":
        from ..rf_em.pipeline import run_rf_em_pipeline_stream
        yield from run_rf_em_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                             _prebuilt_input=prebuilt_input)
    elif sd == "pcb_realization":
        from ..pcb_realization.pipeline import run_pcb_realization_pipeline_stream
        yield from run_pcb_realization_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                       _prebuilt_input=prebuilt_input)
    elif sd == "fpga_realization":
        from ..fpga_realization.pipeline import run_fpga_realization_pipeline_stream
        yield from run_fpga_realization_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                        _prebuilt_input=prebuilt_input)
    elif sd == "semiconductor_device":
        from ..semiconductor_device.pipeline import run_semiconductor_device_pipeline_stream
        yield from run_semiconductor_device_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                            _prebuilt_input=prebuilt_input)
    elif sd == "physical_design":
        from ..physical_design.pipeline import run_physical_design_pipeline_stream
        yield from run_physical_design_pipeline_stream(question=question, call_llm=call_llm, task_id=task_id, tool=tool,
                                                       _prebuilt_input=prebuilt_input)
    else:
        yield {"stage": "final_result", "result": {
            "success": False, "stage": "tool_selection",
            "error": f"Sub-domain {sd} not yet implemented.",
        }}


# ── Batch orchestrator ──────────────────────────────────────────────────────

def solve_circuits_question(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int = 3,
    context: str = "",
    history: List[Dict[str, Any]] = None,
    active_input_file: str = None,
    parameters: List[Dict[str, Any]] = None,
    rerun: bool = False,
    sub_domain: str = None,
    input_file: str = None,
) -> Dict[str, Any]:
    """
    Two-Call AI Pipeline — batch mode.

    Call 1: Combined sub-domain selection + input generation (one AI call).
    Real Execution: Run solver pipelines with pre-built inputs (no AI calls).
    Call 2: Generate final structured answer from all results (one AI call).
    """
    ai_call_count = 0
    history = history or []
    parameters = parameters or []

    # ── Call 1: Combined selection + input generation ──────────────────────
    if rerun:
        if not sub_domain:
            return {
                "success": False, "stage": "rerun",
                "error": "Rerun requested but sub_domain not provided.",
            }
        selections = [{
            "sub_domain": sub_domain,
            "tool": "ngspice" if sub_domain == "analog_sim" else "",
            "reason": "User-initiated re-run",
            "run_parallel": True,
        }]
        updated_input = _apply_parameters_to_input(input_file or active_input_file, parameters, sub_domain)
        inputs = {sub_domain: {"netlist": updated_input, "parameters": {p.get("id"): p.get("value") for p in parameters if p.get("id")}}}
        thinking = [f"Rerun mode: sub-domain={sub_domain}, parameters applied to input file."]
    else:
        context_parts = []
        if context and context.strip():
            context_parts.append(context.strip())
        if active_input_file:
            context_parts.append(f"Current active input file:\n{active_input_file}")
        if parameters:
            param_lines = "\n".join(f"- {p.get('id')}: {p.get('value')} {p.get('unit', '')}" for p in parameters)
            context_parts.append(f"Current editable parameters:\n{param_lines}")
        if history:
            hist_lines = []
            for m in history[-10:]:
                role = m.get("role") or m.get("sender") or "user"
                text = m.get("text") or ""
                hist_lines.append(f"{role}: {text}")
            context_parts.append("Recent conversation:\n" + "\n".join(hist_lines))
        call1_context = "\n\n".join(context_parts)

        call1_result = generate_selection_and_inputs(question, call_llm, context=call1_context)
        ai_call_count += 1

        if call1_result.get("error"):
            return {
                "success": False, "stage": "call1",
                "error": call1_result["error"],
                "_ai_call_count": ai_call_count,
                "_thinking": call1_result.get("thinking", []),
            }

        if call1_result.get("out_of_scope"):
            return {
                "success": False, "stage": "out_of_scope",
                "error": "Question is not an engineering/circuits question.",
                "_ai_call_count": ai_call_count,
                "_thinking": call1_result.get("thinking", []),
            }

        selections = call1_result["selections"]
        inputs = call1_result.get("inputs", {})
        thinking = call1_result.get("thinking", [])

        if not selections:
            return {
                "success": False, "stage": "no_selection",
                "error": "No sub-domains selected.",
                "_ai_call_count": ai_call_count,
                "_thinking": thinking,
            }

    # ── Real Execution: Run pipelines with pre-built inputs ────────────────
    parallel_sels = [s for s in selections if s.get("run_parallel", True)]
    sequential_sels = [s for s in selections if not s.get("run_parallel", True)]

    raw_results: List[Dict[str, Any]] = []

    if len(parallel_sels) > 1:
        with ThreadPoolExecutor(max_workers=len(parallel_sels)) as pool:
            futures = {
                pool.submit(
                    _run_sub_domain_batch, sel, question, call_llm, task_id,
                    max_repair_attempts, inputs.get(sel.get("sub_domain"))
                ): sel
                for sel in parallel_sels
            }
            for future in as_completed(futures):
                sel = futures[future]
                raw = future.result()
                if raw.get("success", True):
                    try:
                        parsed = parse_result(sel["sub_domain"], raw)
                    except Exception:
                        parsed = raw
                    raw_results.append(parsed)
                else:
                    raw_results.append(raw)
    else:
        for sel in parallel_sels:
            sd = sel.get("sub_domain")
            raw = _run_sub_domain_batch(sel, question, call_llm, task_id,
                                        max_repair_attempts, inputs.get(sd))
            if raw.get("success", True):
                try:
                    parsed = parse_result(sd, raw)
                except Exception:
                    parsed = raw
                parsed.setdefault("verified", _is_verified_sub_domain(sel.get("sub_domain")))
                raw_results.append(parsed)
            else:
                raw_results.append(raw)

    for sel in sequential_sels:
        sd = sel.get("sub_domain")
        raw = _run_sub_domain_batch(sel, question, call_llm, task_id,
                                    max_repair_attempts, inputs.get(sd))
        if raw.get("success", True):
            try:
                parsed = parse_result(sd, raw)
            except Exception:
                parsed = raw
            parsed.setdefault("verified", _is_verified_sub_domain(sd))
            raw_results.append(parsed)
        else:
            raw_results.append(raw)

    # ── Merge results ──────────────────────────────────────────────────────
    if len(raw_results) > 1:
        merged = merge_results(raw_results)
    else:
        merged = raw_results[0] if raw_results else {
            "success": False, "stage": "unknown", "error": "No pipeline produced a result."
        }

    # ── Call 2: Final structured answer ────────────────────────────────────
    successful_results = [r for r in raw_results if r.get("success", True) and r.get("status") != "failed"]
    if successful_results:
        try:
            answer_text = generate_final_answer(question, successful_results, call_llm, context)
            ai_call_count += 1
            merged["_structured_answer"] = answer_text
        except Exception as exc:
            merged["_structured_answer"] = f"(Answer generation failed: {exc})"
            ai_call_count += 1

    if "verified" not in merged:
        verified_values = {r.get("verified") for r in raw_results if "verified" in r}
        merged["verified"] = (verified_values == {True}) if verified_values else False
    merged["_thinking"] = thinking
    merged["_selections"] = selections
    merged["_ai_call_count"] = ai_call_count
    return merged


def _apply_parameters_to_input(input_file: str, parameters: List[Dict[str, Any]], sub_domain: str) -> str:
    """
    Apply edited parameter values back into the active input file for rerun.
    For analog_sim this rewrites the netlist; for other sub-domains the frontend
    is expected to have already applied the changes to the input_file text.
    """
    if sub_domain != "analog_sim" or not input_file or not parameters:
        return input_file or ""

    import re
    lines = input_file.splitlines()
    for p in parameters:
        pid = p.get("id")
        new_value = p.get("value")
        anchor = p.get("file_anchor") or {}
        if not pid or new_value is None:
            continue

        # If file_anchor gives a line number, edit that line directly.
        line_idx = anchor.get("line")
        if line_idx and 1 <= line_idx <= len(lines):
            old_line = lines[line_idx - 1]
            match = re.match(r"^([A-Z]\w+\s+\S+\s+\S+\s+)(\S+)(.*)$", old_line, re.IGNORECASE)
            if match:
                lines[line_idx - 1] = match.group(1) + str(new_value) + match.group(3)
                continue

        # Fallback: scan for a line starting with the component id.
        for i, line in enumerate(lines):
            if re.match(rf"^\s*{re.escape(pid)}\b", line, re.IGNORECASE):
                match = re.match(r"^\s*([A-Z]\w+\s+\S+\s+\S+\s+)(\S+)(.*)$", line, re.IGNORECASE)
                if match:
                    lines[i] = match.group(1) + str(new_value) + match.group(3)
                break
    return "\n".join(lines)


def _normalize_subdomain_event(event: Dict[str, Any]) -> Dict[str, Any] | None:
    """
    Convert old-format sub-domain pipeline events (which use `stage` + `status`)
    into the Seemulator contract `stage` event shape `{key, label}`.
    Returns None for events that should be dropped (e.g. answer_chunk internals).
    """
    stage = event.get("stage")
    status = event.get("status")
    if not stage:
        return None

    # Map old stage names to contract keys.
    key_map = {
        "input_generation": "input_generation",
        "validation": "validation",
        "execution": "execution",
        "schematic": "parsing",
        "proof_of_work": "proof_of_work",
    }
    key = key_map.get(stage)
    if not key:
        return None

    label = event.get("detail") or event.get("label") or stage
    tool = event.get("tool", "")
    if key == "input_generation":
        if status == "start":
            label = f"Generating {tool} input..."
        elif status == "done":
            label = f"Input ready ({event.get('system_type', tool)})"
        elif status == "repair_needed":
            label = f"Repairing input (attempt {event.get('attempt', 1)})..."
        elif status == "failed":
            label = f"Input generation failed: {event.get('error', '')}"
    elif key == "validation":
        label = event.get("detail") or "Validating input..."
    elif key == "execution":
        if status == "start":
            label = f"Running {tool}..."
        elif status == "done":
            label = f"{tool} execution complete"
        elif status == "failed":
            label = f"Execution failed: {event.get('error', '')}"
    elif key == "parsing":
        label = "Parsing results and rendering schematic..."
    elif key == "proof_of_work":
        if status == "done":
            label = f"Verified: {event.get('detail', '')}"
        else:
            label = f"Check failed: {event.get('detail', '')}"

    return {"event": "stage", "data": {"key": key, "label": label}}


# ── Streaming orchestrator ──────────────────────────────────────────────────

def solve_circuits_question_stream(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int = 3,
    context: str = "",
    history: List[Dict[str, Any]] = None,
    active_input_file: str = None,
    parameters: List[Dict[str, Any]] = None,
    rerun: bool = False,
    sub_domain: str = None,
    input_file: str = None,
) -> Iterator[Dict[str, Any]]:
    """
    Two-Call AI Pipeline — streaming mode, Seemulator event contract.

    Emits (in order):
      stage(classify) → routed → stage(input_generation) → model
      → stage(validation) → stage(execution) → stage(parsing)
      → stage(proof_of_work) → result → stage(explanation) → token* → done
    """
    ai_call_count = 0
    history = history or []
    parameters = parameters or []

    runner_up = None

    # ── stage(classify) ─────────────────────────────────────────────────────
    yield {
        "event": "stage",
        "data": {"key": "classify", "label": "Classifying intent and selecting sub-domain..."},
    }

    selections = []
    inputs = {}
    thinking = []

    if rerun:
        # Rerun mode: skip Call 1, use pinned sub-domain and input file.
        if not sub_domain:
            yield {
                "event": "error",
                "data": {"message": "Rerun requested but sub_domain not provided.", "stage_key": "classify"},
            }
            return
        # Best-effort tool pick for known sub-domains.
        tool = "ngspice" if sub_domain == "analog_sim" else ""
        selections = [{
            "sub_domain": sub_domain,
            "tool": tool,
            "reason": "User-initiated re-run from the Formulated Model pane",
            "run_parallel": True,
        }]
        updated_input = _apply_parameters_to_input(input_file or active_input_file, parameters, sub_domain)
        flat_params = {p.get("id"): p.get("value") for p in parameters if p.get("id")}

        # Infer analysis type from the question text for rerun mode, since
        # the AI-generated netlist is just component lines without SPICE dot
        # commands. The ngspice runner builds the full deck from analysis type.
        rerun_analysis = {"type": "operating_point", "args": {}}
        q_lower = question.lower() if question else ""
        if any(w in q_lower for w in ["transient", "step response", "time domain", "pulse", "switching"]):
            rerun_analysis = {"type": "transient", "args": {"step": "1u", "stop": "5m"}}
        elif any(w in q_lower for w in ["ac ", "frequency", "bode", "gain", "phase", "magnitude response"]):
            rerun_analysis = {"type": "ac", "args": {"variation": "dec", "points": 50, "start_freq": "1", "stop_freq": "100Meg"}}
        elif any(w in q_lower for w in ["dc sweep", "dc transfer", "iv curve"]):
            rerun_analysis = {"type": "dc_sweep", "args": {}}

        # Extract probe nodes from the netlist component lines (node names
        # that appear on passive components, excluding ground "0").
        import re as _re
        rerun_probe_nodes = []
        seen_nodes = set()
        for line in updated_input.splitlines():
            line = line.strip()
            if not line or line.startswith("*") or line.startswith("."):
                continue
            m = _re.match(r"^\s*[A-Z]\w+\s+(\w+)\s+(\w+)", line, _re.IGNORECASE)
            if m:
                for node in (m.group(1), m.group(2)):
                    if node and node != "0" and node not in seen_nodes:
                        seen_nodes.add(node)
                        rerun_probe_nodes.append(node)

        inputs = {sub_domain: {
            "netlist": updated_input,
            "parameters": flat_params,
            "analysis": rerun_analysis,
            "probe_nodes": rerun_probe_nodes,
            "in_scope": True,
            "system_type": "Rerun",
        }}
        thinking.append(f"Rerun mode: sub-domain={sub_domain}, parameters applied to input file.")
    else:
        # Normal mode: Call 1 combined selection + input generation.
        # Build context from history + current input file + parameters so the AI
        # can modify the existing circuit on follow-up turns.
        context_parts = []
        if context and context.strip():
            context_parts.append(context.strip())
        if active_input_file:
            context_parts.append(f"Current active input file:\n{active_input_file}")
        if parameters:
            param_lines = "\n".join(f"- {p.get('id')}: {p.get('value')} {p.get('unit', '')}" for p in parameters)
            context_parts.append(f"Current editable parameters:\n{param_lines}")
        if history:
            # Serialize the last few messages as plain text for the LLM.
            hist_lines = []
            for m in history[-10:]:
                role = m.get("role") or m.get("sender") or "user"
                text = m.get("text") or ""
                hist_lines.append(f"{role}: {text}")
            context_parts.append("Recent conversation:\n" + "\n".join(hist_lines))
        call1_context = "\n\n".join(context_parts)

        call1_result = generate_selection_and_inputs(question, call_llm, context=call1_context)
        ai_call_count += 1
        thinking = call1_result.get("thinking", [])

        if call1_result.get("error"):
            yield {
                "event": "error",
                "data": {"message": call1_result["error"], "stage_key": "classify"},
            }
            return

        if call1_result.get("out_of_scope"):
            yield {
                "event": "error",
                "data": {"message": "Question is not an engineering/circuits question.", "stage_key": "classify"},
            }
            return

        selections = call1_result.get("selections", [])
        inputs = call1_result.get("inputs", {})
        runner_up = call1_result.get("runner_up")

        yield {
            "event": "stage",
            "data": {
                "key": "classify",
                "label": f"Selected {len(selections)} sub-domain(s) with inputs in 1 AI call",
                "runner_up": runner_up,
            },
        }

        if not selections:
            yield {
                "event": "error",
                "data": {"message": "No sub-domains selected.", "stage_key": "classify"},
            }
            return

    # ── routed ──────────────────────────────────────────────────────────────
    # Emit one routed event per selection. For the current single-domain UI, one
    # is enough; multi-domain turns can extend this to routed.sub_domains later.
    for sel in selections:
        sd = sel.get("sub_domain", "unknown")
        tool = sel.get("tool", "")
        verified = _is_verified_sub_domain(sd)
        yield {
            "event": "routed",
            "data": {
                "sub_domain": sd,
                "tools": [tool] if tool else [],
                "will_execute": True,
                "verified": verified,
                "runner_up": runner_up,  # second-choice domain from Call 1 (tie-break audit trail)
            },
        }
        yield {
            "event": "stage",
            "data": {"key": "tool_select", "label": tool or sd or "selecting tool"},
        }

    # ── Real Execution ──────────────────────────────────────────────────────
    all_results: List[Dict[str, Any]] = []
    for i, sel in enumerate(selections):
        sd = sel.get("sub_domain")
        tool = sel.get("tool", "")
        prebuilt = inputs.get(sd)

        raw_result = None
        try:
            for event in _run_sub_domain_stream(sel, question, call_llm, task_id,
                                                max_repair_attempts, prebuilt):
                # New-format model event from the sub-domain pipeline — pass through.
                if event.get("event") == "model":
                    yield event
                    continue
                # Old-format final_result — capture but don't yield.
                if event.get("stage") == "final_result":
                    raw_result = event["result"]
                    continue
                # Normalize everything else to contract stage events.
                normalized = _normalize_subdomain_event(event)
                if normalized:
                    yield normalized
        except Exception as exc:
            yield {
                "event": "error",
                "data": {"message": str(exc), "stage_key": "execution"},
            }
            raw_result = {"success": False, "stage": "execution",
                          "error": f"Pipeline {sd} crashed: {exc}"}

        if raw_result is None:
            raw_result = {"success": False, "stage": "unknown",
                          "error": f"Pipeline {sd} ended without a result."}

        if raw_result.get("success", True):
            try:
                parsed = parse_result(sd, raw_result)
            except Exception:
                parsed = raw_result
            parsed.setdefault("verified", _is_verified_sub_domain(sd))
            all_results.append(parsed)
        else:
            all_results.append(raw_result)

    # ── Merge results ──────────────────────────────────────────────────────
    if len(all_results) > 1:
        final = merge_results(all_results)
    else:
        final = all_results[0] if all_results else {
            "success": False, "stage": "unknown", "error": "No pipeline produced a result."
        }

    # Ensure verified flag is set on the merged result.
    if "verified" not in final:
        verified_values = {r.get("verified") for r in all_results if "verified" in r}
        final["verified"] = (verified_values == {True}) if verified_values else False

    # Seemulator contract §2.1: proof_of_work stage before the final result.
    verified = final.get("verified", False)
    pow_note = final.get("proof_of_work", {}).get("note", "") if isinstance(final.get("proof_of_work"), dict) else ""
    yield {
        "event": "stage",
        "data": {
            "key": "proof_of_work",
            "label": f"Verified by solver: {pow_note}" if verified else "No solver verification available",
        },
    }

    # ── result ─────────────────────────────────────────────────────────────
    final["_thinking"] = thinking
    final["_selections"] = selections
    final["_ai_call_count"] = ai_call_count
    yield {"event": "result", "data": final}

    # ── stage(explanation) + tokens ─────────────────────────────────────────
    yield {
        "event": "stage",
        "data": {"key": "explanation", "label": "Generating structured answer..."},
    }
    successful_results = [r for r in all_results if r.get("success", True) and r.get("status") != "failed"]
    if successful_results:
        try:
            answer_text = generate_final_answer(question, successful_results, call_llm, context)
            ai_call_count += 1
            # Stream the answer as token events.
            chunk_size = 24
            for i in range(0, len(answer_text), chunk_size):
                yield {"event": "token", "data": {"text": answer_text[i:i + chunk_size]}}
        except Exception as exc:
            ai_call_count += 1
            yield {
                "event": "error",
                "data": {"message": f"Answer generation failed: {exc}", "stage_key": "explanation"},
            }

    yield {"event": "done", "data": {}}
