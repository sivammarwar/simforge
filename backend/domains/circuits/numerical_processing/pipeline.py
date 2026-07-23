"""
Numerical Processing Pipeline
==============================
Performs numerical circuit analysis using SciPy/NumPy: FFT, convolution,
numerical integration, optimization, etc. The LLM generates a Python
analysis plan that is executed in-process.

Stages (streaming): input_generation, execution, proof_of_work, final_result
"""
import json
import re
from typing import Dict, Any, Callable, Iterator, List

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from scipy import signal, integrate, optimize
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


_LLM_PROMPT = """You are a numerical analysis expert for circuits. Given a user question, produce a JSON object describing the numerical analysis to perform.

Return JSON with these fields:
- "system_type": short name (e.g. "FFT Analysis", "Convolution Filter", "Numerical Integration")
- "analysis_type": one of "fft", "convolution", "integration", "ode", "optimization", "matrix_solve", "interpolation"
- "python_code": a Python code snippet that uses numpy/scipy to compute the result. The code must:
  - Import numpy as np inside the code
  - Define a variable called 'result_dict' that is a dict with keys 'metrics' (list of dicts with 'name' and 'value') and 'computed_values' (list of dicts with 'label' and 'value')
  - Not use any external files or network
  - Be self-contained and executable
- "assumptions": list of assumptions

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw: str) -> Dict[str, Any]:
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _to_standardized(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub_domain": "numerical_processing",
        "tool_used": "scipy",
        "domain": "Circuits",
        "system_type": result.get("system_type", "Numerical Circuit Analysis"),
        "solver_name": "scipy/numpy",
        "status": result.get("status", "completed"),
        "netlist": "", "raw_output_path": "",
        "metrics": result.get("metrics", []),
        "visualization_type": "diagram_only",
        "frequency_response": None, "time_series": None,
        "schematic_svg": "", "schematic_error": None,
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
        "analysis_type": result.get("analysis_type"),
        "computed_values": result.get("computed_values", []),
    }


def _build_model_parameters(plan: Dict[str, Any]) -> List[dict]:
    """
    Convert a numerical-processing plan into structured parameters for the
    Seemulator Formulated Model pane. The python_code is the editable field;
    rerun re-executes the edited code.
    """
    return [
        {
            "id": "analysis_type",
            "name": "Analysis Type",
            "value": plan.get("analysis_type", "unknown"),
            "unit": "",
            "editable": False,
            "section": "COMPONENTS",
        },
        {
            "id": "python_code",
            "name": "Python Code",
            "value": plan.get("python_code", ""),
            "unit": "",
            "editable": True,
            "section": "COMPONENTS",
        },
    ]


def _execute_code(code: str) -> Dict[str, Any]:
    import numpy as np
    local_ns = {"np": np, "signal": signal, "integrate": integrate, "optimize": optimize}
    exec(code, local_ns)
    return local_ns.get("result_dict", {})


def run_numerical_pipeline(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "scipy",
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    if not HAS_NUMPY:
        return _to_standardized({"status": "failed", "plain_summary": "NumPy is not installed."})

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
        "system_type": plan.get("system_type", "Numerical Analysis"),
        "analysis_type": plan.get("analysis_type", "unknown"),
        "assumptions": plan.get("assumptions", []),
        "metrics": [], "computed_values": [], "status": "completed",
    }

    code = plan.get("python_code", "")
    if code:
        try:
            computed = _execute_code(code)
            result["metrics"] = computed.get("metrics", [])
            result["computed_values"] = computed.get("computed_values", [])
        except Exception as e:
            result["status"] = "failed"
            result["plain_summary"] = f"Code execution failed: {e}"
            return _to_standardized(result)

    result["plain_summary"] = f"Numerical analysis completed for {result['system_type']}."
    return _to_standardized(result)


def run_numerical_pipeline_stream(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "scipy",
    _prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    if not HAS_NUMPY:
        yield {"stage": "final_result", "result": _to_standardized({
            "status": "failed", "plain_summary": "NumPy is not installed."})}
        return

    yield {"stage": "input_generation", "status": "start"}
    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Numerical Analysis")}
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
               "system_type": plan.get("system_type", "Numerical Analysis")}

    # Seemulator contract §2.3: emit model after input generation, before execution.
    yield {
        "event": "model",
        "data": {
            "input_file": json.dumps(plan, indent=2),
            "parameters": _build_model_parameters(plan),
        },
    }

    yield {"stage": "execution", "status": "start", "tool": "scipy"}

    result = {
        "system_type": plan.get("system_type", "Numerical Analysis"),
        "analysis_type": plan.get("analysis_type", "unknown"),
        "assumptions": plan.get("assumptions", []),
        "metrics": [], "computed_values": [], "status": "completed",
    }

    code = plan.get("python_code", "")
    if code:
        try:
            computed = _execute_code(code)
            result["metrics"] = computed.get("metrics", [])
            result["computed_values"] = computed.get("computed_values", [])
        except Exception as e:
            result["status"] = "failed"
            result["plain_summary"] = f"Code execution failed: {e}"

    yield {"stage": "execution", "status": "done", "tool": "scipy"}

    ok = len(result.get("metrics", [])) > 0 or len(result.get("computed_values", [])) > 0
    yield {"stage": "proof_of_work", "status": "done" if ok else "failed",
           "detail": f"Computed {len(result.get('metrics', []))} metric(s)."}

    if not result.get("plain_summary"):
        result["plain_summary"] = f"Numerical analysis completed for {result['system_type']}."
    yield {"stage": "final_result", "result": _to_standardized(result)}
