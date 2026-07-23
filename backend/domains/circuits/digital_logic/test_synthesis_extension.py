"""
Verification for the digital_logic synthesis extension (gate netlist,
Verilog generation, gate-level schematic) — additive on top of the
CS-01/DL-01 routing/DNF fix.

Runs the real run_digital_logic_pipeline() with a prebuilt input (same
mechanism the orchestrator uses when Call 1 already supplied the plan, so
no LLM stub is needed) — no mocking of SymPy, netlist_builder, verilog_gen,
or schematic.py.

Run: .venv/bin/python3 backend/domains/circuits/digital_logic/test_synthesis_extension.py
"""
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")

from backend.domains.circuits.digital_logic.pipeline import run_digital_logic_pipeline

failures = []


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


print("=" * 70)
print("CASE 1 — exact reported K-map prompt (regression: CS-01/DL-01 + new)")
print("=" * 70)

result = run_digital_logic_pipeline(
    question="Simplify Y = A'B + AB' + AB using a K-map. What is the minimal SOP form?",
    call_llm=lambda p: "",
    task_id="test-synthesis-1",
    _prebuilt_input={
        "system_type": "SOP test",
        "boolean_expression": "(~A & B) | (A & ~B) | (A & B)",
        "input_variables": ["A", "B"],
        "output_variable": "Y",
        "assumptions": [],
        "gate_count": 0,
    },
)

# CS-01/DL-01 regression check — this task must not silently break it.
check("CS-01/DL-01 regression: simplified_expression is A | B (or B | A)",
      result["simplified_expression"] in ("A | B", "B | A"))
check("truth_table has 4 rows", len(result["truth_table"]) == 4)

# New synthesis-extension checks.
check("gate_netlist present", result["gate_netlist"] is not None)
check("gate_netlist total_gate_count >= 1", result["gate_netlist"]["total_gate_count"] >= 1)
check("all gate types are known primitives",
      all(g["type"] in {"AND", "OR", "NOT", "XOR"} for g in result["gate_netlist"]["gates"]))
check('"endmodule" in verilog_structural', "endmodule" in (result["verilog_structural"] or ""))
check('"assign" in verilog_behavioral', "assign" in (result["verilog_behavioral"] or ""))
check("schematic_svg starts with <svg", (result["schematic_svg"] or "").startswith("<svg"))
check("gate_count matches gate_netlist total_gate_count",
      result["gate_count"] == result["gate_netlist"]["total_gate_count"])
check("gate_count_by_type keys are the 4 known gate types",
      set(result["gate_count_by_type"].keys()) == {"AND", "OR", "NOT", "XOR"})

print()
print("=" * 70)
print("CASE 2 — degenerate case: 'A | A' simplifies to bare variable A")
print("=" * 70)

result2 = run_digital_logic_pipeline(
    question="irrelevant",
    call_llm=lambda p: "",
    task_id="test-synthesis-2",
    _prebuilt_input={
        "system_type": "Degenerate test",
        "boolean_expression": "A | A",
        "input_variables": ["A"],
        "output_variable": "Y",
        "assumptions": [],
        "gate_count": 0,
    },
)

check("degenerate: status completed (no crash)", result2["status"] == "completed")
check("degenerate: simplified_expression is A", result2["simplified_expression"] == "A")
check("degenerate: gate_netlist total_gate_count == 0",
      result2["gate_netlist"] is not None and result2["gate_netlist"]["total_gate_count"] == 0)
check("degenerate: schematic_svg still renders (<svg)",
      (result2["schematic_svg"] or "").startswith("<svg"))
check("degenerate: verilog_behavioral still valid (has assign)",
      "assign" in (result2["verilog_behavioral"] or ""))
check("degenerate: verilog_structural still valid (has endmodule)",
      "endmodule" in (result2["verilog_structural"] or ""))

print()
print("=" * 70)
print("CASE 3 — XOR question: convert_xor fix + multi-gate decomposition")
print("=" * 70)

result3 = run_digital_logic_pipeline(
    question="irrelevant",
    call_llm=lambda p: "",
    task_id="test-synthesis-3",
    _prebuilt_input={
        "system_type": "XOR test",
        "boolean_expression": "A ^ B",
        "input_variables": ["A", "B"],
        "output_variable": "Y",
        "assumptions": [],
        "gate_count": 0,
    },
)

check("XOR: simplified_expression is NOT the sympify(^->**) bug (no '**' in it)",
      "**" not in (result3["simplified_expression"] or ""))
check("XOR: gate_netlist has multiple gates (decomposed, no literal Xor at DNF top)",
      result3["gate_netlist"]["total_gate_count"] > 1)
check("XOR: gate_count_by_type XOR is 0 (DNF never emits a top-level Xor node)",
      result3["gate_netlist"]["gate_count_by_type"]["XOR"] == 0)
check("XOR: schematic_svg renders", (result3["schematic_svg"] or "").startswith("<svg"))

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
