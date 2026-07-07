"""Shared utilities for LLM response parsing across sub-domain pipelines."""
import ast
import json
import re
from typing import Dict, Any


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
