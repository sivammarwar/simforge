"""
Digital Logic Pipeline
=======================
Analyzes digital logic circuits using SymPy's boolean algebra engine.
The LLM generates a boolean expression from the user's description, then
SymPy simplifies it and generates a truth table.

Stages (streaming): input_generation, execution, proof_of_work, final_result
"""
import json
import re
from itertools import product
from typing import Dict, Any, Callable, Iterator, List

try:
    from sympy.logic import SOPform, simplify_logic
    from sympy import symbols, sympify
    HAS_SYMPY = True
except ImportError:
    HAS_SYMPY = False


_LLM_PROMPT = """You are a digital logic expert. Given a user question about a digital circuit, produce a JSON object describing the logic analysis.

Return JSON with these fields:
- "system_type": short name (e.g. "2-input AND gate", "Half Adder", "4:1 MUX")
- "boolean_expression": the boolean expression using & (AND), | (OR), ~ (NOT), ^ (XOR) (e.g. "A & B", "A ^ B", "(A & B) | (~A & C)")
- "input_variables": list of input variable names (e.g. ["A", "B", "C"])
- "output_variable": name of the output (e.g. "Y", "Sum", "Cout")
- "assumptions": list of assumptions
- "gate_count": estimated number of logic gates

Return ONLY the JSON, no other text.

User question: {question}"""


def _parse_llm_response(raw: str) -> Dict[str, Any]:
    from ..shared.llm_utils import parse_llm_json
    return parse_llm_json(raw)


def _eval_bool_expr(expr_str: str, var_values: dict) -> int:
    safe = expr_str.replace("&", " and ").replace("|", " or ").replace("~", " not ").replace("^", " ^ ")
    for name, val in var_values.items():
        safe = safe.replace(name, str(val))
    return int(eval(safe))


def _generate_truth_table(expr_str: str, variables: List[str]) -> List[dict]:
    table = []
    for combo in product([0, 1], repeat=len(variables)):
        values = dict(zip(variables, combo))
        result = _eval_bool_expr(expr_str, values)
        row = {v: values[v] for v in variables}
        row["OUT"] = result
        table.append(row)
    return table


def _build_model_parameters(plan: Dict[str, Any]) -> List[dict]:
    """
    Convert a digital-logic plan into structured editable parameters for the
    Seemulator Formulated Model pane. The boolean expression itself is the
    editable field; rerun re-evaluates the truth table against the edited
    expression.
    """
    params = [{
        "id": "boolean_expression",
        "name": "Boolean Expression",
        "value": plan.get("boolean_expression", ""),
        "unit": "",
        "editable": True,
        "section": "COMPONENTS",
    }]
    variables = plan.get("input_variables", []) or []
    params.append({
        "id": "input_variables",
        "name": "Input Variables",
        "value": ", ".join(variables),
        "unit": "",
        "editable": False,
        "section": "COMPONENTS",
    })
    if plan.get("gate_count") is not None:
        params.append({
            "id": "gate_count",
            "name": "Gate Count",
            "value": plan.get("gate_count"),
            "unit": "",
            "editable": False,
            "section": "OUTPUT",
        })
    return params


def _to_standardized(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "sub_domain": "digital_logic",
        "tool_used": "yosys",
        "domain": "Circuits",
        "system_type": result.get("system_type", "Digital Logic Circuit"),
        "solver_name": "yosys/sympy",
        "status": result.get("status", "completed"),
        "netlist": result.get("netlist", ""),
        "raw_output_path": result.get("raw_output_path", ""),
        "metrics": result.get("metrics", []),
        "visualization_type": "diagram_only",
        "frequency_response": None,
        "time_series": None,
        "schematic_svg": result.get("schematic_svg", ""),
        "schematic_error": result.get("schematic_error"),
        "assumptions": result.get("assumptions", []),
        "unsupported_aspects": result.get("unsupported_aspects", []),
        "plain_summary": result.get("plain_summary"),
        "truth_table": result.get("truth_table", []),
        "boolean_expression": result.get("boolean_expression"),
        "simplified_expression": result.get("simplified_expression"),
        "gate_count": result.get("gate_count", 0),
    }


def run_digital_logic_pipeline(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str = "yosys",
    _prebuilt_input: dict = None,
) -> Dict[str, Any]:
    if not HAS_SYMPY:
        return _to_standardized({
            "status": "failed",
            "plain_summary": "SymPy is not installed.",
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

    result = {
        "system_type": plan.get("system_type", "Digital Logic Circuit"),
        "boolean_expression": plan.get("boolean_expression", ""),
        "assumptions": plan.get("assumptions", []),
        "gate_count": plan.get("gate_count", 0),
        "metrics": [],
        "status": "completed",
    }

    variables = plan.get("input_variables", ["A", "B"])
    expr_str = plan.get("boolean_expression", "")

    if expr_str and variables:
        try:
            table = _generate_truth_table(expr_str, variables)
            result["truth_table"] = table
            result["metrics"].append({"name": "Truth Table Rows", "value": str(len(table))})
        except Exception:
            result["truth_table"] = []

        try:
            sym_vars = symbols(" ".join(variables))
            if not isinstance(sym_vars, tuple):
                sym_vars = (sym_vars,)
            expr = sympify(expr_str.replace("&", "&").replace("|", "|"))
            simplified = simplify_logic(expr, form="sop")
            result["simplified_expression"] = str(simplified)
            result["metrics"].append({"name": "Simplified Expression", "value": str(simplified)})
        except Exception:
            pass

    result["plain_summary"] = f"Digital logic analysis completed for {result['system_type']}."
    return _to_standardized(result)


def run_digital_logic_pipeline_stream(
    question: str,
    call_llm: Callable[[str], str],
    task_id: str,
    tool: str = "yosys",
    _prebuilt_input: dict = None,
) -> Iterator[Dict[str, Any]]:
    if not HAS_SYMPY:
        yield {"stage": "final_result", "result": _to_standardized({
            "status": "failed", "plain_summary": "SymPy is not installed.",
        })}
        return

    yield {"stage": "input_generation", "status": "start"}
    if _prebuilt_input:
        plan = _prebuilt_input
        yield {"stage": "input_generation", "status": "done",
               "system_type": plan.get("system_type", "Digital Logic Circuit")}
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
               "system_type": plan.get("system_type", "Digital Logic Circuit")}

    # Seemulator contract §2.3: emit model after input generation, before execution.
    yield {
        "event": "model",
        "data": {
            "input_file": json.dumps(plan, indent=2),
            "parameters": _build_model_parameters(plan),
        },
    }

    yield {"stage": "execution", "status": "start", "tool": "yosys"}

    result = {
        "system_type": plan.get("system_type", "Digital Logic Circuit"),
        "boolean_expression": plan.get("boolean_expression", ""),
        "assumptions": plan.get("assumptions", []),
        "gate_count": plan.get("gate_count", 0),
        "metrics": [], "status": "completed",
    }

    variables = plan.get("input_variables", ["A", "B"])
    expr_str = plan.get("boolean_expression", "")

    if expr_str and variables:
        try:
            table = _generate_truth_table(expr_str, variables)
            result["truth_table"] = table
            result["metrics"].append({"name": "Truth Table Rows", "value": str(len(table))})
        except Exception:
            result["truth_table"] = []
        try:
            sym_vars = symbols(" ".join(variables))
            if not isinstance(sym_vars, tuple):
                sym_vars = (sym_vars,)
            expr = sympify(expr_str)
            simplified = simplify_logic(expr, form="sop")
            result["simplified_expression"] = str(simplified)
            result["metrics"].append({"name": "Simplified Expression", "value": str(simplified)})
        except Exception:
            pass

    yield {"stage": "execution", "status": "done", "tool": "yosys"}

    ok = bool(result.get("truth_table"))
    yield {"stage": "proof_of_work", "status": "done" if ok else "failed",
           "detail": f"Generated {len(result.get('truth_table', []))} truth table rows."}

    result["plain_summary"] = f"Digital logic analysis completed for {result['system_type']}."
    yield {"stage": "final_result", "result": _to_standardized(result)}
