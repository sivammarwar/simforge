"""Shared utilities for LLM response parsing across sub-domain pipelines."""
import ast
import json
import re
from typing import Dict, Any


def _eval_math_exprs(json_str: str) -> str:
    """
    LLMs sometimes return arithmetic expressions instead of computed numbers
    inside JSON arrays/values, e.g. [1, 2*0.5*10, 10*10].  This safely
    evaluates such expressions **outside** of string literals so the result
    is valid JSON.
    """
    # Pattern: a number followed by one or more (operator number) sequences.
    # Operators: * / + - **  We only match outside of double-quoted strings.
    _MATH_RE = re.compile(
        r'(?<!["\w])\s*(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)'
        r'\s*([\*\/+\-]\s*\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)+'
        r'\s*(?!["\w])'
    )

    out = []
    in_string = False
    escaped = False
    i = 0
    while i < len(json_str):
        ch = json_str[i]
        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == '"':
                in_string = False
            i += 1
        else:
            if ch == '"':
                in_string = True
                out.append(ch)
                i += 1
            else:
                # Try to match a math expression starting here
                rest = json_str[i:]
                m = _MATH_RE.match(rest)
                if m:
                    expr = m.group()
                    try:
                        val = eval(expr, {"__builtins__": {}}, {})
                        out.append(repr(val))
                    except Exception:
                        out.append(expr)
                    i += m.end()
                else:
                    out.append(ch)
                    i += 1
    return ''.join(out)


def _escape_control_chars_in_strings(json_str: str) -> str:
    """
    Escape raw control characters (newline, tab, CR) that appear INSIDE
    JSON string literals, without touching structural whitespace between
    tokens (which is valid JSON and must be left alone). LLMs frequently
    return multi-line code/text as a JSON string value with literal
    newlines instead of the `\\n` escape sequence, which json.loads rejects.
    """
    out = []
    in_string = False
    escaped = False
    for ch in json_str:
        if in_string:
            if escaped:
                out.append(ch)
                escaped = False
            elif ch == '\\':
                out.append(ch)
                escaped = True
            elif ch == '"':
                out.append(ch)
                in_string = False
            elif ch == '\n':
                out.append('\\n')
            elif ch == '\r':
                out.append('\\r')
            elif ch == '\t':
                out.append('\\t')
            elif ord(ch) < 0x20:
                out.append(' ')
            else:
                out.append(ch)
        else:
            if ch == '"':
                in_string = True
            out.append(ch)
    return ''.join(out)


def parse_llm_json(raw: str) -> Dict[str, Any]:
    """
    Parse a JSON object from an LLM response string.
    Handles common issues:
    - Extracts JSON from surrounding text (markdown fences, prose)
    - Escapes control characters found inside string literals (e.g. raw
      newlines in embedded code) without corrupting structural whitespace
    - Removes markdown code fences (```json ... ```)
    - Falls back to ast.literal_eval for Python-dict-style (single-quoted)
      responses that aren't valid JSON but are valid Python literals
    """
    text = raw.strip() if isinstance(raw, str) else str(raw).strip()

    # Remove markdown code fences
    text = re.sub(r'```(?:json)?\s*', '', text)
    text = text.replace('```', '')

    # Extract the JSON object
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        json_str = match.group()
    else:
        json_str = text

    sanitized = _escape_control_chars_in_strings(json_str)

    # Remove trailing commas before closing braces/brackets (common LLM mistake)
    sanitized = re.sub(r',\s*([}\]])', r'\1', sanitized)

    # Evaluate arithmetic expressions that the LLM may have left in numeric
    # values (e.g. [1, 2*0.5*10, 10*10] → [1, 10.0, 100])
    sanitized = _eval_math_exprs(sanitized)

    try:
        return json.loads(sanitized)
    except json.JSONDecodeError:
        pass

    # Fallback: the model may have used Python-dict syntax (single quotes,
    # True/False/None) instead of strict JSON. ast.literal_eval handles that.
    try:
        result = ast.literal_eval(json_str)
        if isinstance(result, dict):
            return result
    except (ValueError, SyntaxError):
        pass

    # Re-raise the original JSON error for a clear message upstream.
    return json.loads(sanitized)
