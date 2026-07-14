"""
Control Systems Pipeline
=========================
Analyzes control systems using python-control: transfer functions, Bode plots,
step response, stability margins. Falls back to sympy for symbolic TF analysis
when python-control is not available.

Stages (streaming): input_generation, execution, proof_of_work, final_result
"""
import json
import re
from typing import Dict, Any, Callable, Iterator

try:
    import control as ct
    HAS_CONTROL = True
except ImportError:
    HAS_CONTROL = False

try:
    import sympy as sp
    HAS_SYMPY = True
except ImportError:
    HAS_SYMPY = False


_LLM_PROMPT = """You are a control systems expert. Given a user question, produce a JSON object describing the control system analysis.

Return JSON with these fields:
- "system_type": short name (e.g. "Second-order PID Controller", "First-order Plant")
- "numerator": list of coefficients for the numerator of G(s) (e.g. [1] for unity, [10, 1] for 10s+1)
- "denominator": list of coefficients for the denominator (e.g. [1, 2, 5] for s^2+2s+5)
- "analysis": list of analysis types to perform: "bode", "step", "stability", "pole_zero"
- "assumptions": list of assumptions

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw: str) -> Dict[str, Any]:
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _to_standardized(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub_domain": "control_systems",
        "tool_used": "python_control",
        "domain": "Circuits",
        "system_type": result.get("system_type", "Control System"),
        "solver_name": "python-control",
        "status": result.get("status", "completed"),
        "netlist": "", "raw_output_path": "",
        "metrics": result.get("metrics", []),
        "visualization_type": "diagram_only",
        "frequency_response": result.get("frequency_response"),
        "time_series": result.get("time_series"),
        "schematic_svg": "", "schematic_error": None,
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
        "transfer_function": result.get("transfer_function"),
        "stability": result.get("stability"),
        "gain_margin": result.get("gain_margin"),
        "phase_margin": result.get("phase_margin"),
        "step_info": result.get("step_info"),
    }


def _build_model_parameters(plan: Dict[str, Any]) -> list:
    """
    Convert a control-systems plan (numerator/denominator coefficients) into
    structured editable parameters for the Seemulator Formulated Model pane.
    """
    params = []
    for i, c in enumerate(plan.get("numerator", []) or []):
        params.append({
            "id": f"numerator.{i}",
            "name": f"Numerator coeff. s^{len(plan.get('numerator', [])) - 1 - i}",
            "value": c,
            "unit": "",
            "editable": True,
            "section": "COMPONENTS",
        })
    for i, c in enumerate(plan.get("denominator", []) or []):
        params.append({
            "id": f"denominator.{i}",
            "name": f"Denominator coeff. s^{len(plan.get('denominator', [])) - 1 - i}",
            "value": c,
            "unit": "",
            "editable": True,
            "section": "COMPONENTS",
        })
    return params


def _analyze_with_control(num, den, analyses):
    result = {"metrics": [], "status": "completed"}
    sys_tf = ct.TransferFunction(num, den)
    result["transfer_function"] = str(sys_tf)

    if "stability" in analyses or "pole_zero" in analyses:
        poles = sys_tf.poles()
        zeros = sys_tf.zeros()
        stable = all(p.real < 0 for p in poles)
        result["stability"] = "stable" if stable else "unstable"
        result["metrics"].append({"name": "Poles", "value": str([f"{p:.4f}" for p in poles])})
        result["metrics"].append({"name": "Zeros", "value": str([f"{z:.4f}" for z in zeros])})

    if "bode" in analyses:
        try:
            mag, phase, omega = ct.bode(sys_tf, plot=False)
            result["gain_margin"], result["phase_margin"], _ = ct.margin(sys_tf)
            result["metrics"].append({"name": "Gain Margin", "value": f"{result['gain_margin']:.2f} dB"})
            result["metrics"].append({"name": "Phase Margin", "value": f"{result['phase_margin']:.2f} deg"})
        except Exception:
            pass

    if "step" in analyses:
        try:
            t, y = ct.step_response(sys_tf)
            info = ct.step_info(sys_tf)
            result["step_info"] = {k: round(v, 4) for k, v in info.items()}
            for k, v in info.items():
                result["metrics"].append({"name": k, "value": f"{v:.4f}"})
        except Exception:
            pass

    return result


def _analyze_with_sympy(num, den, analyses):
    s = sp.Symbol("s")
    num_expr = sum(c * s**i for i, c in enumerate(reversed(num)))
    den_expr = sum(c * s**i for i, c in enumerate(reversed(den)))
    tf = num_expr / den_expr
    tf_simplified = sp.simplify(tf)

    result = {
        "transfer_function": str(tf_simplified),
        "metrics": [{"name": "Transfer Function G(s)", "value": str(tf_simplified)}],
        "status": "completed",
    }

    poles = sp.solve(den_expr, s)
    zeros = sp.solve(num_expr, s)
    stable = all(sp.re(p) < 0 for p in poles if sp.re(p).is_real)
    result["stability"] = "stable" if stable else "check poles"
    result["metrics"].append({"name": "Poles", "value": str(poles)})
    if zeros:
        result["metrics"].append({"name": "Zeros", "value": str(zeros)})

    return result


def run_control_systems_pipeline(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "python_control",
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    if not HAS_CONTROL and not HAS_SYMPY:
        return _to_standardized({"status": "failed", "plain_summary": "Neither python-control nor SymPy installed."})

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

    num = plan.get("numerator", [1])
    den = plan.get("denominator", [1, 1])
    analyses = plan.get("analysis", ["stability"])

    if HAS_CONTROL:
        result = _analyze_with_control(num, den, analyses)
    else:
        result = _analyze_with_sympy(num, den, analyses)

    result["system_type"] = plan.get("system_type", "Control System")
    result["assumptions"] = plan.get("assumptions", [])
    result["plain_summary"] = f"Control system analysis completed for {result['system_type']}."
    return _to_standardized(result)


def run_control_systems_pipeline_stream(
    question: str, call_llm: Callable[[str], str], task_id: str, tool: str = "python_control",
    _prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    if not HAS_CONTROL and not HAS_SYMPY:
        yield {"stage": "final_result", "result": _to_standardized({
            "status": "failed", "plain_summary": "Neither python-control nor SymPy installed."})}
        return

    yield {"stage": "input_generation", "status": "start"}
    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Control System")}
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
               "system_type": plan.get("system_type", "Control System")}

    # Seemulator contract §2.3: emit model after input generation, before execution.
    yield {
        "event": "model",
        "data": {
            "input_file": json.dumps(plan, indent=2),
            "parameters": _build_model_parameters(plan),
        },
    }

    yield {"stage": "execution", "status": "start", "tool": "python_control"}

    num = plan.get("numerator", [1])
    den = plan.get("denominator", [1, 1])
    analyses = plan.get("analysis", ["stability"])

    if HAS_CONTROL:
        result = _analyze_with_control(num, den, analyses)
    else:
        result = _analyze_with_sympy(num, den, analyses)

    result["system_type"] = plan.get("system_type", "Control System")
    result["assumptions"] = plan.get("assumptions", [])

    yield {"stage": "execution", "status": "done", "tool": "python_control"}

    ok = bool(result.get("transfer_function"))
    yield {"stage": "proof_of_work", "status": "done" if ok else "failed",
           "detail": f"Stability: {result.get('stability', 'unknown')}"}

    result["plain_summary"] = f"Control system analysis completed for {result['system_type']}."
    yield {"stage": "final_result", "result": _to_standardized(result)}
