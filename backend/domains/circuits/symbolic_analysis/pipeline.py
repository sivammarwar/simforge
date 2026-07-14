"""
Symbolic Analysis Pipeline
============================
Uses SymPy to derive closed-form expressions from circuit questions.
The LLM generates a SymPy-compatible description of the circuit, which
is then evaluated to produce transfer functions, node voltages, and
other symbolic expressions.

Stages (streaming):
  input_generation  — LLM generates a SymPy analysis plan
  execution         — SymPy evaluates the expressions
  proof_of_work     — sanity check on the symbolic output
  final_result      — standardized SymbolicResult dict
"""
import json
import re
import time
import math
from pathlib import Path
from typing import Dict, Any, Callable, Iterator, List, Tuple

try:
    import sympy as sp
    HAS_SYMPY = True
except ImportError:
    HAS_SYMPY = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


_LLM_PROMPT = """You are a circuit analysis expert. Given a circuit question, produce a JSON object describing the symbolic analysis to perform.

Return JSON with these fields:
- "system_type": short name for the circuit (e.g. "RC Low-Pass Filter")
- "transfer_function": the transfer function H(s) as a SymPy-parseable string (e.g. "1/(R*C*s + 1)")
- "expressions": list of {{"label": "node voltage Vout", "expr": "Vs * R2/(R1+R2)"}}
- "assumptions": list of assumptions made
- "symbols": dict mapping symbol names to descriptions (e.g. {{"R": "resistance in ohms", "C": "capacitance in farads"}})

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw: str) -> Dict[str, Any]:
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _to_standardized(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub_domain": "symbolic_analysis",
        "tool_used": "sympy",
        "domain": "Circuits",
        "system_type": result.get("system_type", "Symbolic Circuit"),
        "solver_name": "sympy (symbolic)",
        "status": result.get("status", "completed"),
        "netlist": result.get("netlist", ""),
        "raw_output_path": result.get("raw_output_path", ""),
        "metrics": result.get("metrics", []),
        "visualization_type": result.get("visualization_type", "diagram_only"),
        "frequency_response": result.get("frequency_response"),
        "time_series": result.get("time_series"),
        "schematic_svg": result.get("schematic_svg", ""),
        "schematic_error": result.get("schematic_error"),
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
        "transfer_function": result.get("transfer_function"),
        "symbolic_expressions": result.get("symbolic_expressions", []),
    }


def _build_symbol_map(expr: sp.Expr, numeric_values: Dict[str, float]) -> Dict[sp.Symbol, float]:
    """Build a substitution map from numeric_values dict to SymPy symbols."""
    subs = {}
    for sym in expr.free_symbols:
        name = str(sym)
        if name in numeric_values:
            subs[sym] = numeric_values[name]
    return subs


def _generate_bode_data(tf_expr: sp.Expr, numeric_values: Dict[str, float],
                         n_points: int = 200) -> Dict[str, list]:
    """
    Generate Bode plot data (frequency, magnitude in dB, phase in degrees)
    from a SymPy transfer function expression.
    """
    if not HAS_NUMPY:
        return None

    s = sp.Symbol("s")
    jw = sp.I * sp.Symbol("omega")

    h_jw = tf_expr.subs(s, jw)

    free_syms = [sym for sym in h_jw.free_symbols if sym != sp.Symbol("omega")]
    remaining = [str(sym) for sym in free_syms if str(sym) not in numeric_values]
    if remaining:
        return None

    subs = {sp.Symbol(name): val for name, val in numeric_values.items()
            if sp.Symbol(name) in h_jw.free_symbols}
    h_jw_num = h_jw.subs(subs)
    h_jw_num = sp.simplify(h_jw_num)

    try:
        num, den = sp.fraction(sp.simplify(tf_expr.subs(subs)))
        poles = sp.solve(den, s)
        pole_mags = [abs(complex(sp.N(p))) for p in poles]
        if pole_mags:
            max_pole = max(pole_mags)
            min_pole = min(pole_mags) if min(pole_mags) > 0 else max_pole * 0.01
            f_min = min_pole / (2 * math.pi) * 0.01
            f_max = max_pole / (2 * math.pi) * 100
        else:
            f_min, f_max = 0.1, 1e6
    except Exception:
        f_min, f_max = 0.1, 1e6

    freqs = np.logspace(math.log10(f_min), math.log10(f_max), n_points)

    try:
        h_func = sp.lambdify(sp.Symbol("omega"), h_jw_num, "numpy")
        h_vals = h_func(freqs)
        h_vals = np.asarray(h_vals, dtype=complex)
    except Exception:
        h_vals = np.array([complex(h_jw_num.subs(sp.Symbol("omega"), float(f))) for f in freqs], dtype=complex)

    mag_db = 20 * np.log10(np.abs(h_vals) + 1e-30)
    phase_deg = np.degrees(np.unwrap(np.angle(h_vals)))

    return {
        "freq": freqs.tolist(),
        "mag": mag_db.tolist(),
        "phase": phase_deg.tolist(),
    }


def _generate_step_response(tf_expr: sp.Expr, numeric_values: Dict[str, float],
                             n_points: int = 300) -> Dict[str, list]:
    """
    Generate step response data by computing the inverse Laplace of H(s)/s.
    Only works when all symbols have numeric values.
    """
    if not HAS_NUMPY:
        return None

    s = sp.Symbol("s")
    t_sym = sp.Symbol("t")

    subs = {sp.Symbol(name): val for name, val in numeric_values.items()
            if sp.Symbol(name) in tf_expr.free_symbols}
    tf_num = tf_expr.subs(subs)
    tf_num = sp.simplify(tf_num)

    remaining = [sym for sym in tf_num.free_symbols if sym != s]
    if remaining:
        return None

    try:
        step_s = tf_num / s
        step_t = sp.inverse_laplace_transform(step_s, s, t_sym)
        step_t = sp.simplify(step_t)

        num, den = sp.fraction(tf_num)
        poles = sp.solve(den, s)
        pole_mags = [abs(complex(sp.N(p))) for p in poles]
        if pole_mags:
            dominant = min(pole_mags)
            t_max = 10.0 / dominant if dominant > 0 else 10.0
        else:
            t_max = 10.0

        t_arr = np.linspace(0, t_max, n_points)
        step_func = sp.lambdify(t_sym, step_t, "numpy")
        y_arr = step_func(t_arr)
        y_arr = np.real(np.asarray(y_arr, dtype=complex))

        return {
            "t": t_arr.tolist(),
            "y": y_arr.tolist(),
        }
    except Exception:
        return None


def _build_model_parameters(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert a symbolic analysis plan into structured editable parameters for
    the Seemulator Formulated Model pane. Numeric values are editable
    (drive re-substitution into the transfer function / expressions on
    rerun); transfer function and expressions are shown read-only.
    """
    params: List[Dict[str, Any]] = []
    numeric_values = plan.get("numeric_values", {}) or {}
    symbols = plan.get("symbols", {}) or {}
    for name, value in numeric_values.items():
        params.append({
            "id": f"numeric_values.{name}",
            "name": name,
            "value": value,
            "unit": "",
            "editable": True,
            "section": "COMPONENTS",
            "description": symbols.get(name, ""),
        })
    if plan.get("transfer_function"):
        params.append({
            "id": "transfer_function",
            "name": "Transfer Function H(s)",
            "value": plan["transfer_function"],
            "unit": "",
            "editable": False,
            "section": "OUTPUT",
        })
    for i, item in enumerate(plan.get("expressions", []) or []):
        params.append({
            "id": f"expressions.{i}",
            "name": item.get("label", f"Expression {i+1}"),
            "value": item.get("expr", ""),
            "unit": "",
            "editable": False,
            "section": "OUTPUT",
        })
    return params


def _evaluate_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Core symbolic evaluation: takes the plan (from LLM or _prebuilt_input),
    evaluates all expressions and transfer function with SymPy, substitutes
    numeric values, generates Bode/step data, and returns the enriched result.
    """
    s = sp.Symbol("s")
    numeric_values = plan.get("numeric_values", {})
    numeric_values = {k: float(v) for k, v in numeric_values.items()
                      if v is not None and v != ""}

    result = {
        "system_type": plan.get("system_type", "Symbolic Circuit"),
        "assumptions": plan.get("assumptions", []),
        "transfer_function": plan.get("transfer_function"),
        "symbolic_expressions": [],
        "metrics": [],
        "status": "completed",
        "frequency_response": None,
        "time_series": None,
        "visualization_type": "diagram_only",
    }

    for expr_item in plan.get("expressions", []):
        label = expr_item.get("label", "")
        expr_str = expr_item.get("expr", "")
        try:
            expr = sp.sympify(expr_str)
            simplified = sp.simplify(expr)
            result["symbolic_expressions"].append({
                "label": label,
                "expr": str(simplified),
                "latex": sp.latex(simplified),
            })
            result["metrics"].append({"name": label, "value": str(simplified)})

            subs = _build_symbol_map(simplified, numeric_values)
            if subs:
                try:
                    numeric_expr = simplified.subs(subs)
                    numeric_val = float(sp.N(numeric_expr))
                    result["metrics"].append({
                        "name": f"{label} (numeric)",
                        "value": f"{numeric_val:.6g}",
                    })
                except Exception:
                    pass
        except Exception as e:
            result["symbolic_expressions"].append({
                "label": label, "expr": expr_str, "error": str(e),
            })

    tf = plan.get("transfer_function")
    tf_expr = None
    if tf:
        try:
            tf_expr = sp.sympify(tf)
            tf_simplified = sp.simplify(tf_expr)
            result["transfer_function"] = str(tf_simplified)
            result["metrics"].append({
                "name": "Transfer Function H(s)",
                "value": str(tf_simplified),
            })

            numerator, denominator = sp.fraction(tf_simplified)
            poles = sp.solve(denominator, s)
            zeros = sp.solve(numerator, s)
            if poles:
                result["metrics"].append({"name": "Poles", "value": str(poles)})
            if zeros:
                result["metrics"].append({"name": "Zeros", "value": str(zeros)})

            subs = _build_symbol_map(tf_simplified, numeric_values)
            if subs:
                try:
                    tf_numeric = tf_simplified.subs(subs)
                    tf_numeric = sp.simplify(tf_numeric)
                    num_n, den_n = sp.fraction(tf_numeric)
                    poles_n = sp.solve(den_n, s)
                    zeros_n = sp.solve(num_n, s)
                    if poles_n:
                        poles_str = [str(sp.N(p, 6)) for p in poles_n]
                        result["metrics"].append({
                            "name": "Poles (numeric)",
                            "value": str(poles_str),
                        })
                    if zeros_n:
                        zeros_str = [str(sp.N(z, 6)) for z in zeros_n]
                        result["metrics"].append({
                            "name": "Zeros (numeric)",
                            "value": str(zeros_str),
                        })
                except Exception:
                    pass
        except Exception:
            pass

    if tf_expr is not None and HAS_NUMPY:
        bode_data = _generate_bode_data(tf_expr, numeric_values)
        if bode_data:
            result["frequency_response"] = bode_data
            result["visualization_type"] = "frequency_response"

    if tf_expr is not None and HAS_NUMPY and numeric_values:
        step_data = _generate_step_response(tf_expr, numeric_values)
        if step_data:
            result["time_series"] = step_data
            if result["visualization_type"] == "diagram_only":
                result["visualization_type"] = "transient_waveform"

    return result


def run_symbolic_pipeline(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str = "sympy",
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    """Batch symbolic analysis pipeline."""
    if not HAS_SYMPY:
        return _to_standardized({
            "status": "failed",
            "plain_summary": "SymPy is not installed. Cannot perform symbolic analysis.",
            "assumptions": [],
            "unsupported_aspects": ["sympy not installed"],
        })

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

    result = _evaluate_plan(plan)
    result["plain_summary"] = f"Symbolic analysis completed for {result['system_type']}."
    return _to_standardized(result)


def run_symbolic_pipeline_stream(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str = "sympy",
    _prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    """Streaming symbolic analysis pipeline."""
    if not HAS_SYMPY:
        yield {"stage": "final_result", "result": _to_standardized({
            "status": "failed",
            "plain_summary": "SymPy is not installed.",
            "unsupported_aspects": ["sympy not installed"],
        })}
        return

    yield {"stage": "input_generation", "status": "start"}

    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Symbolic Circuit")}
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
                "status": "failed",
                "plain_summary": f"Failed to parse LLM response: {e}",
            })}
            return

        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Symbolic Circuit")}

    # Seemulator contract §2.3: emit model after input generation, before execution.
    yield {
        "event": "model",
        "data": {
            "input_file": json.dumps(plan, indent=2),
            "parameters": _build_model_parameters(plan),
        },
    }

    yield {"stage": "execution", "status": "start", "tool": "sympy"}

    result = _evaluate_plan(plan)

    yield {"stage": "execution", "status": "done", "tool": "sympy"}

    pow_ok = len(result["symbolic_expressions"]) > 0 or bool(result.get("transfer_function"))
    yield {"stage": "proof_of_work", "status": "done" if pow_ok else "failed",
           "detail": f"Evaluated {len(result['symbolic_expressions'])} expression(s)."}

    result["plain_summary"] = f"Symbolic analysis completed for {result['system_type']}."
    yield {"stage": "final_result", "result": _to_standardized(result)}
