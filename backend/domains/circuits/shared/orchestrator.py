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
) -> Dict[str, Any]:
    """
    Two-Call AI Pipeline — batch mode.

    Call 1: Combined sub-domain selection + input generation (one AI call).
    Real Execution: Run solver pipelines with pre-built inputs (no AI calls).
    Call 2: Generate final structured answer from all results (one AI call).
    """
    ai_call_count = 0

    # ── Call 1: Combined selection + input generation ──────────────────────
    call1_result = generate_selection_and_inputs(question, call_llm)
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

    if not selections:
        return {
            "success": False, "stage": "no_selection",
            "error": "No sub-domains selected.",
            "_ai_call_count": ai_call_count,
            "_thinking": call1_result.get("thinking", []),
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

    merged["_thinking"] = call1_result.get("thinking", [])
    merged["_selections"] = selections
    merged["_ai_call_count"] = ai_call_count
    return merged


# ── Streaming orchestrator ──────────────────────────────────────────────────

def solve_circuits_question_stream(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    max_repair_attempts: int = 3,
    context: str = "",
) -> Iterator[Dict[str, Any]]:
    """
    Two-Call AI Pipeline — streaming mode.

    Call 1: Combined sub-domain selection + input generation (one AI call).
      Yields: call1_start, call1_done (with selections + thinking).
    Real Execution: Run solver pipelines with pre-built inputs (no AI calls).
      Yields: per-sub-domain input_generation/execution/proof_of_work events.
      Repair retries yield repair_needed events (exception path, shown honestly).
    Call 2: Final structured answer (one AI call).
      Yields: answer_start, answer_done (with full text).
    Final: final_result with merged data + _ai_call_count.
    """
    ai_call_count = 0

    # ── Call 1: Combined selection + input generation ──────────────────────
    yield {"stage": "call1", "status": "start",
           "detail": "Combined sub-domain selection + input generation (1 AI call)"}

    call1_result = generate_selection_and_inputs(question, call_llm)
    ai_call_count += 1

    if call1_result.get("error"):
        yield {"stage": "call1", "status": "failed", "error": call1_result["error"]}
        yield {"stage": "final_result", "result": {
            "success": False, "stage": "call1",
            "error": call1_result["error"],
            "_ai_call_count": ai_call_count,
            "_thinking": call1_result.get("thinking", []),
        }}
        return

    if call1_result.get("out_of_scope"):
        yield {"stage": "call1", "status": "out_of_scope"}
        yield {"stage": "final_result", "result": {
            "success": False, "stage": "out_of_scope",
            "error": "Question is not an engineering/circuits question.",
            "_ai_call_count": ai_call_count,
            "_thinking": call1_result.get("thinking", []),
        }}
        return

    selections = call1_result["selections"]
    inputs = call1_result.get("inputs", {})
    thinking = call1_result.get("thinking", [])
    runner_up = call1_result.get("runner_up")

    if not selections:
        yield {"stage": "call1", "status": "no_selection"}
        yield {"stage": "final_result", "result": {
            "success": False, "stage": "no_selection",
            "error": "No sub-domains selected.",
            "_ai_call_count": ai_call_count,
            "_thinking": thinking,
        }}
        return

    yield {
        "stage": "call1", "status": "done",
        "selections": selections,
        "runner_up": runner_up,  # second-choice domain — makes near-miss routing visible in logs
        "thinking": thinking,
        "detail": f"Selected {len(selections)} sub-domain(s) with inputs in 1 AI call",
    }

    # ── Real Execution: Run pipelines with pre-built inputs ────────────────
    all_results: List[Dict[str, Any]] = []
    for i, sel in enumerate(selections):
        sd = sel.get("sub_domain")
        tool = sel.get("tool", "")
        prebuilt = inputs.get(sd)

        yield {
            "stage": "classification",
            "status": "done",
            "sub_domain": sd,
            "tool": tool,
            "reason": sel.get("reason", ""),
            "runner_up": runner_up,  # second-choice domain from Call 1 (tie-break audit trail)
            "thinking": thinking,
            "selection_index": i,
            "total_selections": len(selections),
            "run_parallel": sel.get("run_parallel", True),
        }

        raw_result = None
        try:
            for event in _run_sub_domain_stream(sel, question, call_llm, task_id,
                                                max_repair_attempts, prebuilt):
                if event.get("stage") == "final_result":
                    raw_result = event["result"]
                else:
                    event.setdefault("sub_domain", sd)
                    event.setdefault("selection_index", i)
                    yield event
        except Exception as exc:
            yield {"stage": "execution", "status": "failed",
                   "sub_domain": sd, "selection_index": i,
                   "error": str(exc)}
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

    # ── Call 2: Final structured answer ────────────────────────────────────
    successful_results = [r for r in all_results if r.get("success", True) and r.get("status") != "failed"]
    if successful_results:
        yield {"stage": "answer_generation", "status": "start",
               "detail": "Generating final structured answer (1 AI call)"}
        try:
            answer_text = generate_final_answer(question, successful_results, call_llm, context)
            ai_call_count += 1
            yield {"stage": "answer_done", "full_text": answer_text}
            final["_structured_answer"] = answer_text
        except Exception as exc:
            ai_call_count += 1
            yield {"stage": "answer_generation", "status": "failed", "error": str(exc)}
            final["_structured_answer"] = f"(Answer generation failed: {exc})"

    final["_thinking"] = thinking
    final["_selections"] = selections
    final["_ai_call_count"] = ai_call_count
    yield {"stage": "final_result", "result": final}
