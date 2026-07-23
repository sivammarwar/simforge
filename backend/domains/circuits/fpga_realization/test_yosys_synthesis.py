"""
Verification for Phase A: real Yosys synthesis + the digital_logic ->
fpga_realization orchestration-threading fix. Extended in Phase B: the
chaining test (Part 3) now also checks that real nextpnr placement runs on
the chained input. See test_nextpnr_placement.py for nextpnr's own
dedicated three-way coverage (real success / real failure / graceful
degradation), matching the pattern established here for Yosys.

Detects whether yosys/nextpnr-ice40 are actually on PATH in this
environment up front. If they are, real-subprocess assertions run against
the real tools (no stubbing). If not, the real-tool assertions are skipped
with a clear message, but the graceful-degradation code path (missing tool
-> usable, unverified result, never a crash) is still exercised and
asserted, since that's a real code path this needs to handle correctly
regardless of this environment's tooling.

Run: .venv/bin/python3 backend/domains/circuits/fpga_realization/test_yosys_synthesis.py
"""
import json
import shutil
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")

from backend.domains.circuits.fpga_realization.yosys_runner import run_yosys_synthesis, YosysRunError
from backend.domains.circuits.fpga_realization.pipeline import run_fpga_realization_pipeline
from backend.domains.circuits.shared.orchestrator import solve_circuits_question

failures = []


def check(label, cond):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        failures.append(label)


YOSYS_AVAILABLE = shutil.which("yosys") is not None
NEXTPNR_AVAILABLE = shutil.which("nextpnr-ice40") is not None
print(f"yosys on PATH: {YOSYS_AVAILABLE} ({shutil.which('yosys') or 'not found'})")
print(f"nextpnr-ice40 on PATH: {NEXTPNR_AVAILABLE} ({shutil.which('nextpnr-ice40') or 'not found'})")
print()

OR_GATE_VERILOG = """module logic_module (A, B, Y);
    input A;
    input B;
    output Y;

    or g1 (Y, A, B);
endmodule
"""

print("=" * 70)
print("PART 1 — run_yosys_synthesis() against real tool output")
print("=" * 70)

if YOSYS_AVAILABLE:
    stat = run_yosys_synthesis(OR_GATE_VERILOG, "logic_module", target="generic", task_id="test-yosys-part1")
    print(f"stat: {stat}")
    check("total_cells >= 1 (real tool output, not stubbed)", stat["total_cells"] >= 1)
    check('cell_counts contains "$_OR_"', "$_OR_" in stat["cell_counts"])

    print()
    print("Failure path: invalid Verilog raises YosysRunError with real stderr")
    try:
        run_yosys_synthesis("not valid verilog {{{", "logic_module", task_id="test-yosys-badinput")
        check("invalid Verilog raises YosysRunError", False)
    except YosysRunError as exc:
        check("invalid Verilog raises YosysRunError", True)
        check("error message includes yosys's real stderr", "syntax error" in str(exc).lower() or "error" in str(exc).lower())
else:
    print("SKIPPED (yosys not on PATH) — real-subprocess assertions require the tool.")
    print("Install with `brew install yosys` (macOS) or `apt-get install yosys` (Debian/Ubuntu) to exercise this.")

print()
print("=" * 70)
print("PART 2 — graceful degradation when yosys is unavailable (always exercised)")
print("=" * 70)

import backend.domains.circuits.fpga_realization.yosys_runner as yr
_real_which = shutil.which


def _no_yosys(cmd, *a, **kw):
    if cmd in ("yosys",) or (isinstance(cmd, str) and cmd.endswith("nonexistent-yosys")):
        return None
    return _real_which(cmd, *a, **kw)


yr.shutil.which = _no_yosys
try:
    prebuilt = {
        "system_type": "Degrade test",
        "verilog_source": OR_GATE_VERILOG,
        "top_module": "logic_module",
        "assumptions": [],
        "plain_summary": "LLM-estimated FPGA design (fallback).",
    }
    degraded = run_fpga_realization_pipeline(
        question="irrelevant", call_llm=lambda p: "", task_id="test-degrade", _prebuilt_input=prebuilt,
    )
finally:
    yr.shutil.which = _real_which

check("degraded: status is 'completed', not a crash", degraded["status"] == "completed")
check("degraded: verified is False", degraded["verified"] is False)
check("degraded: synthesis_error is set and mentions yosys",
      bool(degraded["synthesis_error"]) and "yosys" in degraded["synthesis_error"].lower())
check("degraded: plain_summary still present (LLM fallback surfaced)",
      degraded["plain_summary"] == "LLM-estimated FPGA design (fallback).")

print()
print("=" * 70)
print("PART 3 — orchestration fix: digital_logic -> fpga_realization chaining")
print("=" * 70)

# Call 1's response selects BOTH sub-domains for one turn. Crucially, its
# own "guess" for fpga_realization's input is a deliberately WRONG
# placeholder — this is what proves the orchestration fix works: if the
# fix weren't in place, fpga_realization would synthesize THIS bogus
# placeholder instead of digital_logic's real verilog_structural.
PLACEHOLDER_VERILOG = "module WRONG_PLACEHOLDER_MODULE (X); input X; endmodule\n"

CALL1_JSON = json.dumps({
    "selections": [
        {
            "sub_domain": "digital_logic",
            "tool": "sympy",
            "reason": "boolean simplification needed",
            "run_parallel": True,
        },
        {
            "sub_domain": "fpga_realization",
            "tool": "yosys",
            "reason": "user also wants FPGA synthesis of the simplified logic",
            "run_parallel": False,
        },
    ],
    "inputs": {
        "digital_logic": {
            "system_type": "Kmap SOP chain test",
            "boolean_expression": "(~A & B) | (A & ~B) | (A & B)",
            "input_variables": ["A", "B"],
            "output_variable": "Y",
            "assumptions": [],
            "gate_count": 0,
        },
        # Deliberately wrong — proves the real digital_logic result gets
        # threaded in instead of this Call-1 guess being used.
        "fpga_realization": {
            "system_type": "WRONG GUESS — should never be used",
            "verilog_source": PLACEHOLDER_VERILOG,
            "top_module": "WRONG_PLACEHOLDER_MODULE",
            "assumptions": [],
        },
    },
    "runner_up": None,
})

call_count = {"n": 0}


def stub_llm(prompt: str) -> str:
    call_count["n"] += 1
    if call_count["n"] == 1:
        return CALL1_JSON
    # Any later call (Call 2 final answer) — plain text is fine.
    return ("## Description\nStub answer.\n## Intuition\n-\n## Mathematics\n-\n"
            "## Formula/Law Used\n-\n## Conclusion\nStub.")


result = solve_circuits_question(
    question="Simplify Y = A'B + AB' + AB using a K-map, then show its FPGA synthesis.",
    call_llm=stub_llm,
    task_id="test-chain-1",
)

fpga_result = (result.get("results_by_domain") or {}).get("fpga_realization")
dl_result = (result.get("results_by_domain") or {}).get("digital_logic")

check("both sub-domain results present in results_by_domain",
      fpga_result is not None and dl_result is not None)
check("digital_logic regression: simplified_expression is A | B (or B | A)",
      dl_result and dl_result.get("simplified_expression") in ("A | B", "B | A"))
check("digital_logic produced real verilog_structural",
      bool(dl_result and dl_result.get("verilog_structural")))

if fpga_result:
    check("fpga_realization did NOT receive Call 1's placeholder verilog_source",
          fpga_result.get("verilog_source") != PLACEHOLDER_VERILOG)
    check("fpga_realization's verilog_source matches digital_logic's REAL verilog_structural",
          dl_result is not None and fpga_result.get("verilog_source") == dl_result.get("verilog_structural"))
    check("fpga_realization's top_module is NOT the wrong placeholder module name",
          fpga_result.get("top_module") != "WRONG_PLACEHOLDER_MODULE")
    # Phase B.0 regression: top_module must be digital_logic's own module_name
    # field, read directly — not a separately re-derived string that merely
    # happens to match today. Byte-identical, not just "looks similar."
    check("fpga_realization's top_module is byte-identical to digital_logic's own module_name field",
          dl_result is not None and dl_result.get("module_name") is not None
          and fpga_result.get("top_module") == dl_result.get("module_name"))
    if YOSYS_AVAILABLE:
        check("fpga_realization: verified True (real yosys ran on the chained input)",
              fpga_result.get("verified") is True)
        check("fpga_realization: total_cells >= 1 (real iCE40-mapped synthesis of the OR gate)",
              (fpga_result.get("total_cells") or 0) >= 1)
        check("fpga_realization: cell_counts uses real iCE40 primitives (SB_LUT4), not generic $_OR_",
              "SB_LUT4" in (fpga_result.get("cell_counts") or {}))
    else:
        print("  (yosys unavailable — skipping verified/total_cells assertions for this case)")

    if YOSYS_AVAILABLE and NEXTPNR_AVAILABLE:
        check("fpga_realization: Phase B placement also completed for the chained input",
              bool(fpga_result.get("placement")))
        check("fpga_realization: lut_count >= 1 (real placed-and-routed LUT usage)",
              (fpga_result.get("lut_count") or 0) >= 1)
        check("fpga_realization: schematic_svg is the real placement-grid render, not the generic fallback",
              (fpga_result.get("schematic_svg") or "").startswith("<svg")
              and "Placement" in (fpga_result.get("schematic_svg") or ""))
    elif YOSYS_AVAILABLE:
        print("  (nextpnr-ice40 unavailable — skipping placement/lut_count assertions for this case)")
else:
    check("fpga_realization result present", False)

print()
print(f"Full fpga_realization result: {json.dumps(fpga_result, indent=2, default=str)[:800]}")

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
