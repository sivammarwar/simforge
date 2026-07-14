"""
Terminal test harness — runs 6 representative questions per sub-domain
through the real orchestrator (solve_circuits_question) using the real
Groq LLM provider, and reports pass/fail + schematic/plot presence.

Usage:
    venv/bin/python test_all_subdomains.py [sub_domain_filter]

Run from the backend/ directory so relative imports resolve.
"""
import os
import sys
import time
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.WARNING, format="%(name)s: %(message)s")

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from domains.circuits.shared.orchestrator import solve_circuits_question
from circuits.netlist_ai import default_call_llm

PROVIDER = "cerebras"


def call_llm(prompt: str) -> str:
    return default_call_llm(prompt, provider=PROVIDER)


# 6 representative questions per sub-domain, chosen to exercise different
# tools/branches within that sub-domain.
QUESTIONS = {
    "analog_sim": [
        "A 12V source splits down to about 5V using two resistors in a voltage divider.",
        "Design an RC low-pass filter with a 1kHz cutoff frequency from a 5V sine source.",
        "Simulate a series RLC circuit with R=100 ohm, L=10mH, C=1uF driven by a 5V DC source, plot the transient response.",
        "Design a common-emitter BJT amplifier bias circuit with Vcc=12V, target collector current of 1mA.",
        "Design a buck converter with 12V input and 5V output, switching frequency 500kHz, L=22uH, C=47uF.",
        "Simulate a half-wave rectifier circuit with a 10V AC source and a diode feeding a 1k ohm load, plot the AC frequency response.",
    ],
    "symbolic_analysis": [
        "Derive the symbolic transfer function of an RC low-pass filter with resistor R and capacitor C.",
        "Find the Thevenin equivalent resistance seen by R3 in a circuit with R1, R2, R3 all in series with a source.",
        "Derive the symbolic expression for the natural frequency and damping ratio of a series RLC circuit.",
        "What is the closed-form expression for the gain of a non-inverting op-amp with feedback resistor Rf and input resistor Rin?",
        "Derive the characteristic equation of a second-order RLC circuit symbolically in terms of R, L, and C.",
        "Find the symbolic node voltage at the junction of a voltage divider with R1 and R2 driven by Vin.",
    ],
    "digital_logic": [
        "Generate the truth table for a 2-input XOR gate.",
        "Simplify the boolean expression (A AND B) OR (A AND NOT B) and give the truth table.",
        "Design a 2-to-1 multiplexer using boolean logic and show its truth table.",
        "Design a full adder circuit and generate its truth table for sum and carry outputs.",
        "Create the truth table for a JK flip-flop's next state given J, K, and current state Q.",
        "Design a 3-input NAND-based logic circuit implementing the majority function and show its truth table.",
    ],
    "numerical_processing": [
        "Compute the FFT of a 50Hz sine wave sampled at 1kHz for 1 second and show the frequency spectrum.",
        "Compute the convolution of two discrete signals x=[1,2,3] and h=[1,1,1].",
        "Numerically integrate the function sin(x) from 0 to pi using Simpson's rule.",
        "Find the minimum of the function f(x) = x^2 - 4x + 6 using numerical optimization.",
        "Design a simple FIR low-pass filter with cutoff 100Hz for a 1kHz sample rate and show its frequency response.",
        "Solve the linear system of equations 2x + y = 5, x - y = 1 using numerical matrix methods.",
    ],
    "control_systems": [
        "Given a transfer function G(s) = 1/(s^2 + 2s + 1), plot its step response.",
        "Analyze the stability of a system with transfer function G(s) = 10/(s^3 + 6s^2 + 11s + 6) using its poles.",
        "Plot the Bode diagram for a transfer function G(s) = 100/((s+1)(s+10)).",
        "Design a PID controller for a first-order plant G(s) = 1/(s+2) and evaluate closed-loop step response.",
        "Determine the gain margin and phase margin for G(s) = 5/(s(s+1)(s+5)).",
        "Convert a transfer function G(s) = (s+2)/(s^2+3s+2) to state-space representation.",
    ],
    "rf_em": [
        "Calculate the S11 and S21 parameters for a matched 50-ohm transmission line at 2.4GHz.",
        "Design a quarter-wave microstrip patch antenna for 2.4GHz on FR4 substrate.",
        "Estimate the VSWR for a transmission line with a load impedance of 75 ohms and characteristic impedance of 50 ohms.",
        "Explain the radiation pattern characteristics of a half-wave dipole antenna.",
        "Calculate the characteristic impedance of a microstrip line given width, height, and substrate permittivity.",
        "Estimate signal integrity degradation for a high-speed digital trace at 1GHz over FR4.",
    ],
    "pcb_realization": [
        "Estimate the trace width needed for a 2A current on a 1oz copper PCB layer.",
        "What via size and drill diameter should I use for a 4-layer FR4 PCB carrying 500mA?",
        "Design considerations for a PCB stackup for a 6-layer high-speed digital board.",
        "Estimate the DRC clearance rules for a 2-layer PCB with 0.2mm trace/space at 5V.",
        "What impedance should a differential pair trace have for USB 2.0 signaling on FR4?",
        "Recommend copper thickness and layer count for a PCB carrying both power and RF signals.",
    ],
    "fpga_realization": [
        "Estimate LUT utilization for implementing a 8-bit adder on a small FPGA.",
        "What's the expected timing closure margin for a 100MHz design on a mid-range FPGA?",
        "Estimate resource usage for implementing a 16-bit counter on an FPGA.",
        "Explain the place-and-route considerations for a UART module on an FPGA.",
        "Estimate the bitstream size for a small FPGA design with 500 LUTs.",
        "What clock domain crossing considerations apply to a dual-clock FIFO on an FPGA?",
    ],
    "semiconductor_device": [
        "Estimate the threshold voltage of an NMOS transistor given oxide thickness and doping concentration.",
        "Explain the I-V characteristics of a PN junction diode under forward and reverse bias.",
        "Estimate the drain current of a MOSFET in saturation given Vgs, Vth, and W/L ratio.",
        "Explain carrier mobility's effect on propagation delay in a CMOS inverter.",
        "Estimate the propagation delay of a CMOS NAND gate given load capacitance and drive strength.",
        "Explain the effect of channel length scaling on threshold voltage in a MOSFET.",
    ],
    "physical_design": [
        "Estimate the parasitic coupling capacitance between two adjacent metal traces in a CMOS layout.",
        "Explain floorplanning considerations for placing a NAND gate array on a chip.",
        "Estimate RC parasitic extraction values for a long metal interconnect wire.",
        "What DRC/LVS checks are critical for a standard-cell CMOS layout?",
        "Estimate propagation delay tphl and tplh for a CMOS NAND gate given layout parasitics.",
        "Explain timing analysis considerations when placing cells in a physical design flow.",
    ],
}


def check_result(sub_domain: str, result: dict) -> dict:
    """Extract pass/fail + diagnostic info from a solve result."""
    # Match orchestrator.py's own convention: success defaults to True when
    # the sub-domain's result schema doesn't define the field at all.
    ok = bool(result.get("success", True)) and result.get("status") not in ("failed", "out_of_scope")
    status = result.get("status", "?")
    schematic_svg = bool(result.get("schematic_svg"))
    schematic_error = result.get("schematic_error")
    time_series = bool(result.get("time_series"))
    freq_response = bool(result.get("frequency_response"))
    metrics = result.get("metrics") or []
    error = result.get("error")
    selections = result.get("_selections") or []
    routed_domain = selections[0].get("sub_domain") if selections else "?"
    netlist = result.get("netlist") or ""

    return {
        "success": ok,
        "status": status,
        "routed_domain": routed_domain,
        "domain_match": routed_domain == sub_domain,
        "schematic_svg": schematic_svg,
        "schematic_error": schematic_error,
        "time_series": time_series,
        "frequency_response": freq_response,
        "num_metrics": len(metrics),
        "error": error,
        "netlist": netlist if sub_domain == "analog_sim" else None,
    }


def run_all(filter_domain: str = None):
    results_log = []
    domains = [filter_domain] if filter_domain else list(QUESTIONS.keys())

    for sd in domains:
        questions = QUESTIONS.get(sd, [])
        print(f"\n{'='*70}\nSUB-DOMAIN: {sd}  ({len(questions)} questions)\n{'='*70}")
        for i, q in enumerate(questions, 1):
            task_id = f"test-{sd}-{i}"
            t0 = time.time()
            try:
                result = solve_circuits_question(
                    question=q,
                    call_llm=call_llm,
                    task_id=task_id,
                )
                diag = check_result(sd, result)
            except Exception as exc:
                diag = {"success": False, "status": "crashed", "error": str(exc),
                         "routed_domain": "?", "domain_match": False,
                         "schematic_svg": False, "schematic_error": None,
                         "time_series": False, "frequency_response": False,
                         "num_metrics": 0}
            dt = time.time() - t0
            diag["question"] = q
            diag["sub_domain"] = sd
            diag["duration_s"] = round(dt, 1)
            results_log.append(diag)

            flag = "PASS" if diag["success"] and diag["domain_match"] else "FAIL"
            extra = ""
            if sd == "analog_sim":
                extra = f" schematic={'Y' if diag['schematic_svg'] else 'N'}" \
                        f" ts={'Y' if diag['time_series'] else 'N'}" \
                        f" freq={'Y' if diag['frequency_response'] else 'N'}"
            print(f"[{flag}] ({dt:.1f}s) [{i}/{len(questions)}] routed={diag['routed_domain']} "
                  f"status={diag['status']} metrics={diag['num_metrics']}{extra}")
            if sd == "analog_sim" and not diag["schematic_svg"]:
                print(f"       [NO SCHEMATIC] netlist:\n{diag.get('netlist')}")
            if flag == "FAIL":
                print(f"       Q: {q[:80]}")
                print(f"       error: {diag.get('error')}")
                if diag.get("schematic_error"):
                    print(f"       schematic_error: {diag['schematic_error']}")

    # Summary
    print(f"\n{'='*70}\nSUMMARY\n{'='*70}")
    by_domain = {}
    for r in results_log:
        by_domain.setdefault(r["sub_domain"], []).append(r)
    total_pass = 0
    total = 0
    for sd, rows in by_domain.items():
        passed = sum(1 for r in rows if r["success"] and r["domain_match"])
        total_pass += passed
        total += len(rows)
        print(f"  {sd:24s}: {passed}/{len(rows)} passed")
    print(f"\nTOTAL: {total_pass}/{total} passed")

    out_path = Path(__file__).parent / "test_results.json"
    out_path.write_text(json.dumps(results_log, indent=2, default=str))
    print(f"\nFull results written to {out_path}")
    return results_log


if __name__ == "__main__":
    filt = sys.argv[1] if len(sys.argv) > 1 else None
    run_all(filt)
