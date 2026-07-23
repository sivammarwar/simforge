"""Verification harness for the CS-01/DL-01 fix.

Reproduces the exact bug: a pure Boolean-algebra/K-map question gets
misclassified by Call 1's LLM as `analog_sim` with no real netlist, which
used to produce "Pipeline error: Circuit pipeline returned no result."
with a stubbed LLM (no API keys, no network) — the digital_logic pipeline
that the routing guard redirects to runs its REAL SymPy solver; nothing
about solver output is faked, only the AI calls are canned (same pattern as
scripts/verify_runner_up_routing.py).

Also regression-checks, directly against tool_selector/call1_combined, that:
  - A real analog_sim question (backed by an actual SPICE netlist) is left
    untouched by the routing guard.
  - The keyword fallback no longer defaults to analog_sim/ngspice when
    nothing matches.
"""
import json
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")
from backend.domains.circuits.shared.orchestrator import solve_circuits_question
from backend.domains.circuits.shared.call1_combined import _apply_routing_guard
from backend.domains.circuits.shared import tool_selector

QUESTION = "Simplify Y = A'B + AB' + AB using a K-map. What is the minimal SOP form?"

# Call 1's JSON reproducing the actual bug: analog_sim selected, no real netlist.
BUGGY_CALL1_JSON = json.dumps({
    "selections": [{
        "sub_domain": "analog_sim",
        "tool": "ngspice",
        "reason": "circuit-shaped question (misclassification under test)",
        "run_parallel": True,
    }],
    "inputs": {
        "analog_sim": {
            "in_scope": True,
            "system_type": "Unclear",
            "netlist": "",
            "parameters": {},
            "assumptions": [],
            "unsupported_aspects": [],
            "analysis": {"type": "operating_point", "args": {}},
            "probe_nodes": [],
        }
    },
    "runner_up": {"sub_domain": "digital_logic", "reason": "boolean expression present but LLM misjudged artifact"},
})

# digital_logic's own re-ask (fired because the guard stripped the analog_sim
# input, so _prebuilt_input=None) — a correct boolean plan.
DIGITAL_LOGIC_PLAN_JSON = json.dumps({
    "system_type": "Boolean expression simplification",
    "boolean_expression": "(~A & B) | (A & ~B) | (A & B)",
    "input_variables": ["A", "B"],
    "output_variable": "Y",
    "assumptions": [],
    "gate_count": 3,
})

calls = {"n": 0, "prompts": []}


def stub_llm(prompt: str) -> str:
    calls["n"] += 1
    calls["prompts"].append(prompt)
    if calls["n"] == 1:
        return BUGGY_CALL1_JSON
    if calls["n"] == 2:
        return DIGITAL_LOGIC_PLAN_JSON
    # Call 2 (final answer) — plain structured text is acceptable for the harness.
    return ("## Description\nY simplifies to A + B.\n## Intuition\n-\n"
            "## Mathematics\n-\n## Formula/Law Used\n-\n## Conclusion\nY = A | B.")


print("=" * 70)
print("PART 1 — end-to-end orchestrator run with the exact reported prompt")
print("=" * 70)

result = solve_circuits_question(
    question=QUESTION,
    call_llm=stub_llm,
    task_id="verify-cs01-dl01",
)

failures = []


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


check("pipeline succeeded (success truthy / no top-level error)",
      result.get("success", True) is not False)
check('result["_selections"][0]["sub_domain"] == "digital_logic"',
      bool(result.get("_selections")) and result["_selections"][0].get("sub_domain") == "digital_logic")
check('some "_thinking" line contains "ROUTING GUARD"',
      any("ROUTING GUARD" in line for line in result.get("_thinking", [])))
check('result["simplified_expression"] in ("A | B", "B | A")',
      result.get("simplified_expression") in ("A | B", "B | A"))
check('len(result["truth_table"]) == 4',
      len(result.get("truth_table", [])) == 4)
check("stub_llm called exactly 3 times (Call1, digital_logic re-ask, Call2)",
      calls["n"] == 3)

print()
print(f"ai_call_count reported : {result.get('_ai_call_count')}")
print(f"selections              : {result.get('_selections')}")
print(f"simplified_expression   : {result.get('simplified_expression')}")
print(f"truth_table rows        : {len(result.get('truth_table', []))}")
print("thinking log:")
for line in result.get("_thinking", []):
    marker = "  >>> " if "ROUTING GUARD" in line else "      "
    print(f"{marker}{line}")

print()
print("=" * 70)
print("PART 2 — regression: real analog_sim netlist must NOT be touched")
print("=" * 70)

real_netlist_selections = [{
    "sub_domain": "analog_sim",
    "tool": "ngspice",
    "reason": "numeric voltage divider, needs simulation",
    "run_parallel": True,
}]
real_netlist_inputs = {
    "analog_sim": {
        "in_scope": True,
        "system_type": "Voltage Divider",
        "netlist": "V1 1 0 DC 5\nR1 1 2 1k\nR2 2 0 2k",
        "parameters": {"V1": "5V", "R1": "1k", "R2": "2k"},
        "assumptions": [],
        "unsupported_aspects": [],
        "analysis": {"type": "operating_point", "args": {}},
        "probe_nodes": ["2"],
    }
}
thinking2 = []
corrected_sel, corrected_inputs = _apply_routing_guard(
    "Voltage divider with R1=1k, R2=2k, and a 5V source. What is V(2)?",
    real_netlist_selections, real_netlist_inputs, thinking2,
)
check("real-netlist analog_sim selection left as analog_sim",
      corrected_sel[0]["sub_domain"] == "analog_sim")
check("real-netlist analog_sim input NOT popped",
      "analog_sim" in corrected_inputs)
check('no "ROUTING GUARD" line logged for a real netlist',
      not any("ROUTING GUARD" in line for line in thinking2))

print()
print("=" * 70)
print("PART 3 — regression: keyword fallback no longer defaults to analog_sim")
print("=" * 70)

gibberish_result = tool_selector.select_tools(
    "qzxw plerm vandoo trelk mimsy borogove slithy toves",
    call_llm=None,
)
check("select_tools() with no LLM and no keyword match returns EMPTY selections",
      gibberish_result.selections == [])
check('thinking log explains ambiguity, not "defaulting to analog"',
      any("ambiguous" in line.lower() for line in gibberish_result.thinking)
      and not any("defaulting to analog" in line.lower() for line in gibberish_result.thinking))

# Also confirm score_question() picks up the new K-map synonyms directly.
scores = tool_selector.score_question("Use a Karnaugh map to find the minimal sum of products for Y")
check('score_question() finds digital_logic keywords ("karnaugh", "sum of products")',
      scores.get("digital_logic", 0) >= 2)

print()
print("=" * 70)
if failures:
    print(f"RESULT: FAIL — {len(failures)} assertion(s) failed:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("ALL ASSERTIONS PASSED")
    sys.exit(0)
