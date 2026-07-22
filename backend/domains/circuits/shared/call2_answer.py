"""
Call 2 — Final Structured Answer Generation
============================================
The second and final AI call in the Two-Call AI Pipeline.

Takes the original question, conversation context, and ALL sub-domain results
from this turn, and produces ONE coherent, structured answer:

    Description → Intuition → Mathematics → Formula/Law(s) Used → Conclusion

Every number and claim must come from the actual results — never invented.
If multiple sub-domains contributed, this single call weaves them together.
"""
import json
from typing import Dict, Any, Callable, Iterator, List


_ANSWER_PROMPT = """You are an expert electronics engineering educator. You are given a user's question
and the results from real engineering analysis tools (SPICE simulators, SymPy, NumPy, etc.).

Your task: Write ONE coherent, structured answer that addresses the user's question using
ONLY the data from the real results below. Do NOT invent any numbers, formulas, or claims
that are not present in the results. If the results contain unsupported aspects or limitations,
mention them honestly.

Structure your answer EXACTLY as follows, using these section headers:

## Description
A clear 2-4 sentence description of what the question is about and what was analyzed.

## Intuition
A plain-language explanation of the key insight or approach — why the circuit/system
behaves the way it does, without heavy math.

## Mathematics
The key equations, derivations, or numerical results from the analysis. Show the actual
computed values (voltages, currents, transfer functions, truth tables, etc.) that the
tools produced. Use LaTeX-style notation where helpful.

## Formula/Law(s) Used
List the specific laws, theorems, or formulas that were applied (e.g. Ohm's Law, KCL,
KVL, voltage divider rule, superposition theorem, De Morgan's law, etc.).

## Conclusion
A concise 1-2 sentence conclusion that directly answers the user's question.

---

User question: {question}

Conversation context (may be empty): {context}

Results from real engineering analysis tools:
{results_json}

Remember:
- Use ONLY the data above. Every number must come from the real results.
- If multiple sub-domains contributed results, weave them into one coherent answer.
- If any aspect was marked as unsupported, mention it honestly.
- Keep the answer focused and clear — this is for an engineering student.
"""


def _build_answer_prompt(question: str, results: List[Dict[str, Any]], context: str = "") -> str:
    # Serialize results, keeping only the meaningful fields
    serializable = []
    for r in results:
        entry = {
            "sub_domain": r.get("sub_domain", "unknown"),
            "system_type": r.get("system_type", ""),
            "status": r.get("status", ""),
            "metrics": r.get("metrics", []),
            "assumptions": r.get("assumptions", []),
            "unsupported_aspects": r.get("unsupported_aspects", []),
            "plain_summary": r.get("plain_summary", ""),
        }
        # Include domain-specific fields
        for key in ("transfer_function", "symbolic_expressions", "simplified_expression",
                     "boolean_expression", "truth_table", "input_variables", "output_variable",
                     "gate_count", "computed_values", "analysis_type",
                     "numerator", "denominator", "poles", "zeros", "stability",
                     "bode_data", "step_response", "s_parameters",
                     "frequency_response", "time_series", "netlist",
                     "schematic_svg"):
            if key in r and r[key]:
                entry[key] = r[key]
        serializable.append(entry)

    results_json = json.dumps(serializable, indent=2, default=str)

    return _ANSWER_PROMPT.format(
        question=question,
        context=context or "(none)",
        results_json=results_json,
    )


def _unwrap_json_answer(answer: str) -> str:
    # Some LLMs wrap the answer in a JSON object like {"answer": "..."} or
    # {"Description": "...", "Intuition": "...", ...}. Strip the wrapper and
    # extract the markdown text inside.
    if answer.startswith("{") and answer.endswith("}"):
        try:
            parsed = json.loads(answer)
            if isinstance(parsed, dict):
                if "answer" in parsed:
                    return parsed["answer"].strip()
                # Reconstruct from section fields if present
                sections = ["Description", "Intuition", "Mathematics",
                            "Formula/Law(s) Used", "Conclusion"]
                parts = []
                for sec in sections:
                    if sec in parsed:
                        parts.append(f"## {sec}\n{parsed[sec]}")
                if parts:
                    return "\n\n".join(parts)
        except (json.JSONDecodeError, TypeError):
            pass
    return answer


def generate_final_answer(
    question: str,
    results: List[Dict[str, Any]],
    call_llm: Callable[[str], str],
    context: str = "",
) -> str:
    """
    Call 2: The second and final AI call. Takes all sub-domain results
    and produces one structured answer.

    Args:
        question: The original user question.
        results: List of standardized result dicts from all sub-domain pipelines.
        call_llm: The LLM call function.
        context: Optional conversation context string.

    Returns:
        The structured answer text (markdown).
    """
    prompt = _build_answer_prompt(question, results, context)
    answer = call_llm(prompt).strip()
    return _unwrap_json_answer(answer)


def generate_final_answer_stream(
    question: str,
    results: List[Dict[str, Any]],
    call_llm_stream: Callable[[str], Iterator[str]],
    context: str = "",
) -> Iterator[str]:
    """
    Streaming variant of `generate_final_answer`. Yields text chunks live as
    the model produces them so the UI can render genuine incremental typing
    instead of waiting for the whole answer and then dumping it at once.

    If the model wraps its answer in a JSON envelope (rare, since the prompt
    asks for plain markdown), the first chunk starting with "{" triggers a
    fallback: buffer the full response, unwrap it, then yield it as one
    chunk — matching the non-streaming behavior for that edge case.
    """
    prompt = _build_answer_prompt(question, results, context)
    chunk_iter = call_llm_stream(prompt)

    buffered = ""
    is_json_wrapped = None
    for delta in chunk_iter:
        if not delta:
            continue
        if is_json_wrapped is None:
            stripped = (buffered + delta).lstrip()
            if not stripped:
                buffered += delta
                continue
            is_json_wrapped = stripped.startswith("{")
        if is_json_wrapped:
            buffered += delta
            continue
        buffered += delta
        yield delta

    if is_json_wrapped:
        yield _unwrap_json_answer(buffered.strip())
