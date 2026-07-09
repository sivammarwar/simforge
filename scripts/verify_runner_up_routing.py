"""Verification harness for the DL-10 routing fix (runner_up logging).

Runs the real streaming orchestrator with a STUBBED LLM (no API keys, no
network). The digital_logic pipeline executes its REAL SymPy solver on the
prebuilt input — nothing about solver output is faked; only the AI calls
are canned, which is standard unit-test practice for routing logic.

Asserts:
  1. `call1/done` event carries the runner_up payload
  2. every `classification` (routed-equivalent) event carries runner_up
  3. exactly one final_result event
  4. ordering: call1 done → classification → final_result
"""
import json
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")
from backend.domains.circuits.shared.orchestrator import solve_circuits_question_stream

CALL1_JSON = json.dumps({
    "selections": [{
        "sub_domain": "digital_logic",
        "tool": "sympy",
        "reason": "artifact needed is a truth table / boolean expression",
        "run_parallel": True,
    }],
    "inputs": {
        "digital_logic": {
            "system_type": "timing-closure style boolean check",
            "boolean_expression": "A & B | ~A & C",
            "input_variables": ["A", "B", "C"],
            "output_variable": "Y",
            "assumptions": [],
            "gate_count": 3,
        }
    },
    "runner_up": {
        "sub_domain": "numerical_processing",
        "reason": "arithmetic involved, but the deliverable artifact is digital",
    },
})

calls = {"n": 0}

def stub_llm(prompt: str) -> str:
    calls["n"] += 1
    if calls["n"] == 1:
        return CALL1_JSON
    # Call 2 (answer) — plain structured text is acceptable for the harness
    return ("## Description\nStub answer.\n## Intuition\n-\n## Mathematics\n-\n"
            "## Formula/Law Used\n-\n## Conclusion\nStub.")

events = list(solve_circuits_question_stream(
    question="A pipeline stage has tclk-q 0.5ns, comb 3.2ns, setup 0.3ns — boolean check Y = A&B | ~A&C",
    call_llm=stub_llm,
    task_id="verify-runner-up",
))

idx_call1_done = idx_classification = idx_final = None
classification_events = []
for i, e in enumerate(events):
    if e.get("stage") == "call1" and e.get("status") == "done":
        idx_call1_done = i
        assert isinstance(e.get("runner_up"), dict), "call1/done missing runner_up"
        assert e["runner_up"]["sub_domain"] == "numerical_processing"
    if e.get("stage") == "classification":
        classification_events.append(i)
        assert isinstance(e.get("runner_up"), dict), "classification missing runner_up"
    if e.get("stage") == "final_result":
        assert idx_final is None, "final_result emitted more than once"
        idx_final = i

idx_classification = classification_events[0] if classification_events else None
assert idx_call1_done is not None, "no call1/done event"
assert idx_classification is not None, "no classification event"
assert idx_final is not None, "no final_result event"
assert idx_call1_done < idx_classification < idx_final, "event ordering violated"

final = events[idx_final]["result"]
print(f"events total          : {len(events)}")
print(f"call1/done at index   : {idx_call1_done} (runner_up = numerical_processing) ✅")
print(f"classification at     : {idx_classification} (runner_up present) ✅")
print(f"final_result at       : {idx_final} (exactly once) ✅")
print(f"ai_call_count         : {final.get('_ai_call_count')}")
print(f"pipeline success      : {final.get('success')}")
print("ALL ASSERTIONS PASSED")
