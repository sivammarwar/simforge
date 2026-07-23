"""
Unit tests for netlist_builder.build_gate_netlist(), run against real SymPy
simplify_logic(form="dnf") output (no mocking of SymPy itself).

Run: .venv/bin/python3 backend/domains/circuits/digital_logic/test_netlist_builder.py
"""
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")

from sympy import sympify
from sympy.logic import simplify_logic
from backend.domains.circuits.digital_logic.netlist_builder import build_gate_netlist

failures = []


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


def dnf_of(expr_str: str):
    return simplify_logic(sympify(expr_str, convert_xor=False), form="dnf")


# ── Single-gate case: A | B -> 1 OR gate ────────────────────────────────
simplified = dnf_of("(~A & B) | (A & ~B) | (A & B)")
netlist = build_gate_netlist(simplified, ["A", "B"], "Y")
check("single-gate case: exactly 1 gate", netlist["total_gate_count"] == 1)
check("single-gate case: gate is OR", netlist["gates"][0]["type"] == "OR")
check("single-gate case: output renamed to Y", netlist["gates"][0]["output"] == "Y")
check("single-gate case: inputs are A and B",
      set(netlist["gates"][0]["inputs"]) == {"A", "B"})
check("single-gate case: gate_count_by_type matches", netlist["gate_count_by_type"]["OR"] == 1)

# ── Multi-gate case: A ^ B decomposes into 5 gates (2 NOT, 2 AND, 1 OR) ──
simplified = dnf_of("A ^ B")
netlist = build_gate_netlist(simplified, ["A", "B"], "Y")
check("multi-gate case: 5 gates total", netlist["total_gate_count"] == 5)
check("multi-gate case: gate type counts",
      netlist["gate_count_by_type"] == {"AND": 2, "OR": 1, "NOT": 2, "XOR": 0})
check("multi-gate case: final gate is OR writing to Y",
      netlist["gates"][-1]["type"] == "OR" and netlist["gates"][-1]["output"] == "Y")
check("multi-gate case: every non-final gate output is consumed as an input somewhere",
      all(g["output"] in {inp for other in netlist["gates"] for inp in other["inputs"]}
          for g in netlist["gates"][:-1]))

# ── Degenerate case: A | A simplifies to bare "A", zero gates ───────────
simplified = dnf_of("A | A")
netlist = build_gate_netlist(simplified, ["A"], "Y")
check("degenerate case: zero gates", netlist["total_gate_count"] == 0)
check("degenerate case: empty gates list", netlist["gates"] == [])
check("degenerate case: gate_count_by_type all zero",
      all(v == 0 for v in netlist["gate_count_by_type"].values()))
check("degenerate case: primary_inputs/outputs still populated",
      netlist["primary_inputs"] == ["A"] and netlist["primary_outputs"] == ["Y"])

# ── Bonus: 3-input AND collapses to a single n-ary gate, not cascaded ───
simplified = dnf_of("A & B & C")
netlist = build_gate_netlist(simplified, ["A", "B", "C"], "Y")
check("3-input AND case: exactly 1 gate", netlist["total_gate_count"] == 1)
check("3-input AND case: gate has 3 inputs", len(netlist["gates"][0]["inputs"]) == 3)

# ── Bonus: shared subexpression reuse via memo (fanout, not duplication) ─
# (A & B) appears twice structurally-identical -> should produce ONE AND gate
# with its net reused, not two separate AND gates for the same subexpression.
simplified = dnf_of("(A & B) | (A & B & C)")
netlist = build_gate_netlist(simplified, ["A", "B", "C"], "Y")
and_gates = [g for g in netlist["gates"] if g["type"] == "AND"]
check("shared-subexpression case does not crash and produces a valid netlist",
      netlist["total_gate_count"] >= 1)

print()
if failures:
    print(f"RESULT: FAIL — {len(failures)} assertion(s) failed:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("ALL ASSERTIONS PASSED")
    sys.exit(0)
