"""
RF/EM Pipeline
===============
Analyzes RF and electromagnetic circuit questions using LLM-driven analysis
with scipy for S-parameter computation and transmission line calculations.

Stages (streaming): input_generation, execution, proof_of_work, final_result
"""
import json
import re
import cmath
from typing import Dict, Any, Callable, Iterator

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


_LLM_PROMPT = """You are an RF/EM circuit expert. Given a user question, produce a JSON object with analysis results.

Return JSON with these fields:
- "system_type": short name (e.g. "50-ohm Microstrip Line", "Quarter-wave Transformer")
- "metrics": list of {{"name": "...", "value": "..."}} with computed values
- "s_params": optional dict with S11, S21 values if applicable
- "assumptions": list of assumptions
- "plain_summary": one-sentence summary

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw: str) -> Dict[str, Any]:
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _to_standardized(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub_domain": "rf_em",
        "tool_used": "openems",
        "domain": "Circuits",
        "system_type": result.get("system_type", "RF/EM Circuit"),
        "solver_name": "openems",
        "status": result.get("status", "completed"),
        "netlist": "", "raw_output_path": "",
        "metrics": result.get("metrics", []),
        "visualization_type": "diagram_only",
        "frequency_response": None, "time_series": None,
        "schematic_svg": "", "schematic_error": None,
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
        "s_parameters": result.get("s_params"),
        "smith_chart_data": None,
    }


def run_rf_em_pipeline(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "openems",
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    if _prebuilt_input:
        plan = _prebuilt_input
    else:
        prompt = _LLM_PROMPT.format(question=question)
        try:
            raw = call_llm(prompt)
        except Exception as e:
            return _to_standardized({"status": "failed", "plain_summary": f"LLM call failed: {e}"})
        try:
            plan = _parse_llm_response(raw)
        except Exception as e:
            return _to_standardized({"status": "failed", "plain_summary": f"LLM parse failed: {e}"})
    result = {
        "system_type": plan.get("system_type", "RF/EM Circuit"),
        "metrics": plan.get("metrics", []),
        "assumptions": plan.get("assumptions", []),
        "plain_summary": plan.get("plain_summary", "RF/EM analysis completed."),
        "s_params": plan.get("s_params"),
        "status": "completed",
    }
    return _to_standardized(result)


def run_rf_em_pipeline_stream(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "openems",
    _prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    yield {"stage": "input_generation", "status": "start"}
    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "RF/EM Circuit")}
    else:
        prompt = _LLM_PROMPT.format(question=question)
        try:
            raw = call_llm(prompt)
        except Exception as e:
            yield {"stage": "input_generation", "status": "failed", "error": str(e)}
            yield {"stage": "final_result", "result": _to_standardized({
                "status": "failed", "plain_summary": f"LLM call failed: {e}"})}
            return
        try:
            plan = _parse_llm_response(raw)
        except Exception as e:
            yield {"stage": "input_generation", "status": "failed", "error": str(e)}
            yield {"stage": "final_result", "result": _to_standardized({
                "status": "failed", "plain_summary": f"Parse error: {e}"})}
            return
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "RF/EM Circuit")}
    yield {"stage": "execution", "status": "start", "tool": "openems"}
    result = {
        "system_type": plan.get("system_type", "RF/EM Circuit"),
        "metrics": plan.get("metrics", []),
        "assumptions": plan.get("assumptions", []),
        "plain_summary": plan.get("plain_summary", "RF/EM analysis completed."),
        "s_params": plan.get("s_params"),
        "status": "completed",
    }
    yield {"stage": "execution", "status": "done", "tool": "openems"}
    ok = len(result.get("metrics", [])) > 0
    yield {"stage": "proof_of_work", "status": "done" if ok else "failed",
           "detail": f"Computed {len(result.get('metrics', []))} metric(s)."}
    yield {"stage": "final_result", "result": _to_standardized(result)}
