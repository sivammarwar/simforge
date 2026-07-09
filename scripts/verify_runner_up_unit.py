"""Unit verification of the DL-10 routing fix, isolated from the broken
analog_sim import at HEAD (see report). Verifies:
  1. CALL 1 prompt contains the tie-break rule + runner_up schema
  2. generate_selection_and_inputs captures + normalizes runner_up
  3. orchestrator emits runner_up at both stream points (static check)
"""
import json, sys, re
sys.path.insert(0, "."); sys.path.insert(0, "backend")
from backend.domains.circuits.shared import call1_combined as c1

# 1 — prompt contains the rule and schema
p = c1._COMBINED_PROMPT
assert "TIE-BREAK RULE" in p and "runner_up" in p and "digital_logic" in p
assert "timing-closure" in p, "DL-10 example missing from tie-break rule"

# 2 — runner_up captured and normalized
resp = json.dumps({
  "selections": [{"sub_domain": "digital_logic", "tool": "sympy",
                  "reason": "artifact is a truth table", "run_parallel": True}],
  "inputs": {"digital_logic": {"boolean_expression": "A & B",
             "input_variables": ["A","B"], "output_variable": "Y"}},
  "runner_up": {"sub_domain": "numerical_processing",
                "reason": "arithmetic involved but artifact is digital"}})
out = c1.generate_selection_and_inputs("q", lambda _: resp)
assert out["runner_up"]["sub_domain"] == "numerical_processing"
assert any("runner-up" in t for t in out["thinking"])

# null-normalization
resp2 = resp.replace('"numerical_processing"', 'null')
out2 = c1.generate_selection_and_inputs("q", lambda _: resp2)
assert out2["runner_up"] is None, "null runner_up not normalized"

# 3 — both orchestrator emit points carry runner_up (static, since full
#     import chain is blocked by the pre-existing analog_sim break at HEAD)
src = open("backend/domains/circuits/shared/orchestrator.py").read()
assert src.count('"runner_up": runner_up') == 2, "expected exactly 2 emit points"
call1_block = src[src.index('"stage": "call1", "status": "done"'):][:300]
class_block = src[src.index('"stage": "classification"'):][:400]
assert "runner_up" in call1_block and "runner_up" in class_block

print("prompt rule            ✅")
print("runner_up capture      ✅ (+ null normalization)")
print("orchestrator emits x2  ✅ (call1/done + classification)")
print("ALL UNIT ASSERTIONS PASSED")
