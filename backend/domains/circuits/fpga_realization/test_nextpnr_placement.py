"""
Verification for Phase B: real nextpnr-ice40 placement + timing.

Same three-way coverage pattern as test_yosys_synthesis.py established for
Yosys: real-tool success (against real tool output, nothing stubbed),
real-tool failure (malformed input -> real tool error), and graceful
degradation when the tool isn't on PATH (monkeypatched shutil.which).

Run: .venv/bin/python3 backend/domains/circuits/fpga_realization/test_nextpnr_placement.py
"""
import shutil
import sys

sys.path.insert(0, ".")
sys.path.insert(0, "backend")

from backend.domains.circuits.fpga_realization.yosys_runner import run_yosys_synthesis, YosysRunError
from backend.domains.circuits.fpga_realization.nextpnr_runner import run_nextpnr_placement, NextpnrRunError
from backend.domains.circuits.fpga_realization.pipeline import run_fpga_realization_pipeline

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
print("PART 1 — run_nextpnr_placement() against real tool output")
print("=" * 70)

if YOSYS_AVAILABLE and NEXTPNR_AVAILABLE:
    stat = run_yosys_synthesis(OR_GATE_VERILOG, "logic_module", target="ice40", task_id="test-nextpnr-part1-synth")
    check("yosys ice40 target produced a json_netlist_path", "json_netlist_path" in stat)
    check('yosys ice40 target maps to real SB_LUT4 primitive (not generic $_OR_)',
          "SB_LUT4" in stat["cell_counts"])

    pnr = run_nextpnr_placement(stat["json_netlist_path"], package="hx8k-ct256", task_id="test-nextpnr-part1-pnr")
    print(f"placement: {pnr['placement']}")
    print(f"lut_count: {pnr['lut_count']}")
    check("lut_count >= 1 (real placed-and-routed tool output, not stubbed)", pnr["lut_count"] >= 1)
    check("placement has at least one entry", len(pnr["placement"]) >= 1)
    check("every placement entry has integer x/y", all(
        isinstance(v.get("x"), int) and isinstance(v.get("y"), int) for v in pnr["placement"].values()
    ))
    check("timing_report is non-empty real nextpnr text", bool(pnr["timing_report"] and len(pnr["timing_report"]) > 10))
    check('timing_report contains a real nextpnr "Info:" line, not synthesized text',
          "Info:" in pnr["timing_report"])

    print()
    print("Failure path: malformed JSON netlist raises NextpnrRunError with real stderr")
    import tempfile
    from pathlib import Path
    bad_dir = Path(tempfile.mkdtemp())
    bad_json = bad_dir / "bad.json"
    bad_json.write_text("{ this is not valid json")
    try:
        run_nextpnr_placement(str(bad_json), task_id="test-nextpnr-badinput")
        check("malformed netlist raises NextpnrRunError", False)
    except NextpnrRunError as exc:
        check("malformed netlist raises NextpnrRunError", True)
        check("error message includes nextpnr's real error text",
              "json" in str(exc).lower() or "error" in str(exc).lower())

    print()
    print("Failure path: valid-JSON-but-no-modules netlist raises NextpnrRunError")
    empty_json = bad_dir / "empty.json"
    empty_json.write_text("{}")
    try:
        run_nextpnr_placement(str(empty_json), task_id="test-nextpnr-emptyinput")
        check("empty netlist raises NextpnrRunError", False)
    except NextpnrRunError:
        check("empty netlist raises NextpnrRunError", True)
elif YOSYS_AVAILABLE:
    print("SKIPPED (nextpnr-ice40 not on PATH; yosys is) — real-subprocess assertions require nextpnr.")
    print("Install with `brew install nextpnr-ice40` (macOS) or `apt-get install nextpnr-ice40` (Debian/Ubuntu).")
else:
    print("SKIPPED (neither yosys nor nextpnr-ice40 on PATH).")

print()
print("=" * 70)
print("PART 2 — graceful degradation when nextpnr is unavailable (always exercised)")
print("=" * 70)
print("(Yosys still runs for real if available — this isolates nextpnr's own failure path,")
print(" confirming Yosys's real synthesis data is NOT lost when only placement fails.)")
print()

import backend.domains.circuits.fpga_realization.nextpnr_runner as npr
_real_which = shutil.which


def _no_nextpnr(cmd, *a, **kw):
    if cmd == "nextpnr-ice40":
        return None
    return _real_which(cmd, *a, **kw)


npr.shutil.which = _no_nextpnr
try:
    prebuilt = {
        "system_type": "nextpnr degrade test",
        "verilog_source": OR_GATE_VERILOG,
        "top_module": "logic_module",
        "assumptions": [],
        "plain_summary": "LLM-estimated FPGA design (fallback).",
    }
    degraded = run_fpga_realization_pipeline(
        question="irrelevant", call_llm=lambda p: "", task_id="test-nextpnr-degrade", _prebuilt_input=prebuilt,
    )
finally:
    npr.shutil.which = _real_which

check("degraded: status is 'completed', not a crash", degraded["status"] == "completed")
check("degraded: placement is None", degraded["placement"] is None)
check("degraded: placement_error is set and mentions nextpnr",
      bool(degraded["placement_error"]) and "nextpnr" in degraded["placement_error"].lower())
check("degraded: lut_count is 0/unset (placement never ran)", (degraded["lut_count"] or 0) == 0)
if YOSYS_AVAILABLE:
    check("degraded: Yosys's real synthesis data is PRESERVED despite nextpnr failing",
          degraded["verified"] is True and (degraded["total_cells"] or 0) >= 1)
    check("degraded: proof_of_work still reflects real Yosys success, not a blanket failure",
          bool(degraded["proof_of_work"]) and degraded["proof_of_work"].get("passed") is True)
else:
    print("  (yosys also unavailable in this environment — verified/total_cells expected False/0 too)")

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
