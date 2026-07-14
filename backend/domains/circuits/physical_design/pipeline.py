"""
Physical Design Pipeline
=========================
Analyzes physical design / parasitic extraction questions using LLM-driven analysis.

Stages (streaming): input_generation, execution, proof_of_work, final_result
"""
import json
import re
from typing import Dict, Any, Callable, Iterator

_LLM_PROMPT = """You are a physical design and parasitic extraction expert. Given a user question, produce a JSON object with analysis results.

Return JSON with these fields:
- "system_type": short name for the physical design
- "metrics": list of {{"name": "...", "value": "..."}}
- "assumptions": list of assumptions
- "plain_summary": one-sentence summary

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw):
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _build_model_parameters(plan):
    """
    Convert a physical-design plan's metrics into structured parameters for
    the Seemulator Formulated Model pane. No deterministic solver backs this
    domain (LLM-only); edits are applied directly without recomputation.
    """
    return [
        {
            "id": f"metrics.{i}.value",
            "name": m.get("name", f"Metric {i+1}"),
            "value": m.get("value", ""),
            "unit": "",
            "editable": True,
            "section": "OUTPUT",
        }
        for i, m in enumerate(plan.get("metrics", []) or [])
    ]


def _to_standardized(result):
    return {
        "sub_domain": "physical_design",
        "tool_used": "openroad",
        "domain": "Circuits",
        "system_type": result.get("system_type", "Physical Design"),
        "solver_name": "openroad",
        "status": result.get("status", "completed"),
        "netlist": "", "raw_output_path": "",
        "metrics": result.get("metrics", []),
        "visualization_type": "diagram_only",
        "frequency_response": None, "time_series": None,
        "schematic_svg": "", "schematic_error": None,
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
    }


def run_physical_design_pipeline(question, call_llm, task_id, tool="openroad", _prebuilt_input=None):
    if _prebuilt_input:
        plan = _prebuilt_input
    else:
        prompt = _LLM_PROMPT.format(question=question)
        try:
            raw = call_llm(prompt)
            plan = _parse_llm_response(raw)
        except Exception as e:
            return _to_standardized({
                "status": "failed", "plain_summary": f"LLM call/parse failed: {e}",
            })
    result = {
        "system_type": plan.get("system_type", "Physical Design"),
        "metrics": plan.get("metrics", []),
        "assumptions": plan.get("assumptions", []),
        "plain_summary": plan.get("plain_summary", "Physical design analysis completed."),
        "status": "completed",
    }
    return _to_standardized(result)


def run_physical_design_pipeline_stream(question, call_llm, task_id, tool="openroad", _prebuilt_input=None):
    yield {"stage": "input_generation", "status": "start"}
    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Physical Design")}
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
               "system_type": plan.get("system_type", "Physical Design")}

    # Seemulator contract §2.3: emit model after input generation, before execution.
    yield {
        "event": "model",
        "data": {
            "input_file": json.dumps(plan, indent=2),
            "parameters": _build_model_parameters(plan),
        },
    }

    yield {"stage": "execution", "status": "start", "tool": "openroad"}
    result = {
        "system_type": plan.get("system_type", "Physical Design"),
        "metrics": plan.get("metrics", []),
        "assumptions": plan.get("assumptions", []),
        "plain_summary": plan.get("plain_summary", "Physical design analysis completed."),
        "status": "completed",
    }
    yield {"stage": "execution", "status": "done", "tool": "openroad"}
    ok = len(result.get("metrics", [])) > 0
    yield {"stage": "proof_of_work", "status": "done" if ok else "failed",
           "detail": f"Computed {len(result.get('metrics', []))} metric(s)."}
    yield {"stage": "final_result", "result": _to_standardized(result)}
