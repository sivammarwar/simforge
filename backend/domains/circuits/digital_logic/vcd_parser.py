"""
VCD Parser
==========
Parses Value Change Dump (VCD) files produced by Icarus Verilog / Verilator
into a structured waveform representation that the frontend waveform renderer
can consume.

VCD format reference: IEEE 1364-2001 §18.
"""
import re
from typing import Dict, List, Any, Optional


def parse_vcd(vcd_text: str) -> Dict[str, Any]:
    """
    Parse a VCD file's text content into a structured dict.

    Returns:
        {
            "signals": [
                {"name": "clk", "size": 1, "type": "wire",
                 "changes": [{"time": 0, "value": "0"}, {"time": 10, "value": "1"}, ...]},
                ...
            ],
            "end_time": 1000,
            "timescale": "1ns",
        }
    """
    signals: List[Dict[str, Any]] = []
    signal_map: Dict[str, Dict[str, Any]] = {}
    current_time = 0
    end_time = 0
    timescale = "1ns"
    in_signal_section = False

    for line in vcd_text.splitlines():
        line = line.strip()

        # $timescale
        if line.startswith("$timescale"):
            m = re.match(r'\$timescale\s+(\S+)\s+\$end', line)
            if m:
                timescale = m.group(1)
            continue

        # $var type size identifier reference $end
        if line.startswith("$var"):
            m = re.match(r'\$var\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)\s+\$end', line)
            if m:
                var_type, size, ident, ref = m.group(1), int(m.group(2)), m.group(3), m.group(4)
                sig = {
                    "name": ref,
                    "type": var_type,
                    "size": size,
                    "changes": [],
                }
                signal_map[ident] = sig
                signals.append(sig)
            continue

        # $enddefinitions — signals follow
        if line.startswith("$enddefinitions"):
            in_signal_section = True
            continue

        if not in_signal_section:
            continue

        # Time marker: #1234
        if line.startswith("#"):
            try:
                current_time = int(line[1:])
                end_time = max(end_time, current_time)
            except ValueError:
                pass
            continue

        # Value change: 0identifier, 1identifier, b1010 identifier, xidentifier
        if line and not line.startswith("$"):
            parts = line.split()
            if len(parts) == 2:
                # Multi-bit: b<value> <identifier> or x<value> <identifier>
                val_str, ident = parts[0], parts[1]
                value = val_str[1:] if val_str[0] in "bBxXzZ" else val_str
            elif len(parts) == 1:
                # Single-bit: 0ident or 1ident
                raw = parts[0]
                if len(raw) >= 2:
                    value = raw[0]
                    ident = raw[1:]
                else:
                    continue
            else:
                continue

            if ident in signal_map:
                signal_map[ident]["changes"].append({
                    "time": current_time,
                    "value": value,
                })

    return {
        "signals": signals,
        "end_time": end_time,
        "timescale": timescale,
    }


def vcd_to_waveform_data(vcd_text: str) -> Dict[str, Any]:
    """
    Convert VCD text to the waveform data format expected by the frontend.
    Each signal gets a list of {t, v} tuples sorted by time.
    """
    parsed = parse_vcd(vcd_text)
    waveforms = {}
    for sig in parsed["signals"]:
        changes = sig["changes"]
        if not changes:
            waveforms[sig["name"]] = {"type": sig["type"], "size": sig["size"], "data": []}
            continue
        # Build full timeline with previous-value hold
        data = []
        prev_val = changes[0]["value"]
        data.append({"t": 0, "v": prev_val})
        for ch in changes:
            data.append({"t": ch["time"], "v": ch["value"]})
        # Add final point to extend the waveform to end_time
        data.append({"t": parsed["end_time"], "v": data[-1]["v"]})
        waveforms[sig["name"]] = {
            "type": sig["type"],
            "size": sig["size"],
            "data": data,
        }
    return {
        "waveforms": waveforms,
        "end_time": parsed["end_time"],
        "timescale": parsed["timescale"],
    }
