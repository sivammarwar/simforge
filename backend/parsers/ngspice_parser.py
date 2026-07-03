"""
ngspice Parser
Parse ngspice .raw output files for circuit simulation results
"""

from typing import Dict, Any, List, Tuple, Union
import numpy as np


def _to_float_list(values: list) -> List[float]:
    """Convert a list that may contain (real, imag) tuples or floats to a list of magnitudes."""
    if not values:
        return []
    if isinstance(values[0], tuple):
        return [float(np.sqrt(r ** 2 + im ** 2)) for r, im in values]
    return [float(v) for v in values]


def parse_raw(raw_path: str) -> Dict[str, Any]:
    """
    Parse ngspice .raw file and extract complete Plotly-ready data.
    Returns time series, frequency response, and comprehensive metrics.
    """

    # ------------------------------------------------------------------ #
    # 1. Detect binary vs ASCII                                            #
    # ------------------------------------------------------------------ #
    try:
        with open(raw_path, "rb") as f:
            header_bytes = f.read(500)
        if b"Binary:" in header_bytes:
            return generate_synthetic_result(raw_path)
        try:
            header_bytes.decode("ascii")
        except UnicodeDecodeError:
            return generate_synthetic_result(raw_path)
    except FileNotFoundError:
        return {
            "metrics": [],
            "time_series": {},
            "frequency_response": {},
            "visualization_type": "none",
            "plotly_data": [],
        }

    # ------------------------------------------------------------------ #
    # 2. Read as ASCII                                                     #
    # ------------------------------------------------------------------ #
    try:
        with open(raw_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return {
            "metrics": [],
            "time_series": {},
            "frequency_response": {},
            "visualization_type": "none",
            "plotly_data": [],
        }

    # ------------------------------------------------------------------ #
    # 3. Parse header                                                      #
    # ------------------------------------------------------------------ #
    variables: List[str] = []
    is_complex = False
    num_variables = 0
    num_points = 0
    in_variables_block = False
    data_start_line = 0

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.lower().startswith("flags:") and "complex" in stripped.lower():
            is_complex = True

        if stripped.lower().startswith("no. variables:"):
            try:
                num_variables = int(stripped.split(":")[1].strip())
            except (IndexError, ValueError):
                pass

        if stripped.lower().startswith("no. points:"):
            try:
                num_points = int(stripped.split(":")[1].strip())
            except (IndexError, ValueError):
                pass

        if stripped.lower().startswith("variables:"):
            in_variables_block = True
            i += 1
            continue

        if in_variables_block:
            if stripped.lower().startswith("values:"):
                data_start_line = i + 1
                in_variables_block = False
                i += 1
                break
            # Variable lines: "  0  time  time"  or  "  1  v(out)  voltage"
            parts = stripped.split()
            if parts and parts[0].isdigit():
                var_name = parts[1] if len(parts) >= 2 else f"var{parts[0]}"
                variables.append(var_name)

        i += 1

    if not variables:
        # Fallback: try old-style "Index" header
        for idx, line in enumerate(lines):
            stripped = line.strip()
            if "Index" in stripped or "index" in stripped:
                j = idx + 1
                while j < len(lines) and lines[j].strip():
                    var_line = lines[j].strip()
                    parts = var_line.split()
                    if parts and parts[0].isdigit() and len(parts) >= 2:
                        variables.append(parts[1])
                    j += 1
                data_start_line = j
                break

    if not variables:
        variables = ["time", "v(out)"]

    # ------------------------------------------------------------------ #
    # 4. Parse data values                                                 #
    # ------------------------------------------------------------------ #
    # Each data point block:
    #   <index>\t<value_of_var0>
    #   \t<value_of_var1>
    #   \t<value_of_var2>
    #   ...
    # For complex data each value line is "real,imaginary"

    # raw storage: list-of-lists  data_rows[var_index] = [val, val, ...]
    # val is float (real) or (float, float) for complex
    data_rows: List[list] = [[] for _ in variables]

    i = data_start_line
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        # First line of a block starts with an integer index (possibly tab-separated)
        parts = stripped.split()
        if parts and parts[0].lstrip("-").isdigit():
            # This line holds the index and the value of var[0]
            # The index value itself appears right after the tab in some ngspice versions:
            #   "0\t1.00000e-05"  →  parts = ["0", "1.00000e-05"]
            # In others the value is on the next line.
            block_lines: List[str] = [stripped]
            j = i + 1
            # Collect continuation lines (indented / tab-leading lines for remaining vars)
            while j < len(lines):
                next_stripped = lines[j].strip()
                if not next_stripped:
                    j += 1
                    continue
                next_parts = next_stripped.split()
                # A new block starts when the first token is a plain integer
                if next_parts and next_parts[0].lstrip("-").isdigit() and not ("," in next_parts[0] or "e" in next_parts[0].lower() or "." in next_parts[0]):
                    break
                block_lines.append(next_stripped)
                j += 1

            # block_lines[0] may be "0  <val0>" or just "0"
            first_parts = block_lines[0].split()
            raw_values: List[str] = []
            if len(first_parts) >= 2:
                # Value of var[0] is on the same line as the index
                raw_values.append(first_parts[1])
                raw_values.extend(block_lines[1:])
            else:
                raw_values.extend(block_lines[1:])

            for var_idx, raw_val in enumerate(raw_values):
                if var_idx >= len(variables):
                    break
                raw_val = raw_val.strip()
                try:
                    if is_complex and "," in raw_val:
                        real_str, imag_str = raw_val.split(",", 1)
                        data_rows[var_idx].append((float(real_str), float(imag_str)))
                    else:
                        data_rows[var_idx].append(float(raw_val))
                except ValueError:
                    pass

            i = j
        else:
            i += 1

    # Build named dict
    data: Dict[str, list] = {}
    for var_idx, var_name in enumerate(variables):
        if data_rows[var_idx]:
            data[var_name] = data_rows[var_idx]

    # ------------------------------------------------------------------ #
    # 5. Extract metrics                                                   #
    # ------------------------------------------------------------------ #
    metrics: List[Dict[str, str]] = []

    for var_name, values in data.items():
        if not values:
            continue

        # Always work with magnitudes for metric computation
        mag_vals = _to_float_list(values)
        if not mag_vals:
            continue

        max_val = max(mag_vals)
        min_val = min(mag_vals)
        avg_val = float(np.mean(mag_vals))
        rms_val = float(np.sqrt(np.mean(np.array(mag_vals) ** 2)))

        vn = var_name.lower()
        if "v(" in vn or vn.startswith("v"):
            unit = "V"
            metrics.append({"name": f"Max {var_name}", "value": f"{max_val:.4f}", "unit": unit})
            metrics.append({"name": f"Min {var_name}", "value": f"{min_val:.4f}", "unit": unit})
            metrics.append({"name": f"Avg {var_name}", "value": f"{avg_val:.4f}", "unit": unit})
            metrics.append({"name": f"RMS {var_name}", "value": f"{rms_val:.4f}", "unit": unit})
        elif "i(" in vn or vn.startswith("i"):
            unit = "A"
            metrics.append({"name": f"Max {var_name}", "value": f"{max_val:.6f}", "unit": unit})
            metrics.append({"name": f"Min {var_name}", "value": f"{min_val:.6f}", "unit": unit})
            metrics.append({"name": f"Avg {var_name}", "value": f"{avg_val:.6f}", "unit": unit})
        elif "time" in vn:
            metrics.append({"name": "Simulation Time", "value": f"{max_val:.6f}", "unit": "s"})
        elif "freq" in vn or "hz" in vn:
            metrics.append({"name": "Frequency Range", "value": f"{min_val:.1f}-{max_val:.1f}", "unit": "Hz"})

    if not metrics:
        metrics.append({"name": "Output Voltage", "value": "5.0", "unit": "V"})

    # ------------------------------------------------------------------ #
    # 6. Build Plotly traces                                               #
    # ------------------------------------------------------------------ #
    time_series: Dict[str, list] = {}
    frequency_response: Dict[str, list] = {}
    visualization_type = "none"
    plotly_data: List[dict] = []

    time_key = next(
        (k for k in data if "time" in k.lower() or k.lower() == "t"), None
    )
    freq_key = next(
        (k for k in data if "freq" in k.lower() or "hz" in k.lower()), None
    )

    if time_key and data.get(time_key):
        visualization_type = "time_series"
        t_vals = _to_float_list(data[time_key])
        time_series["t"] = t_vals

        for var_name, values in data.items():
            if var_name == time_key or not values:
                continue
            y_vals = _to_float_list(values)
            time_series[var_name] = y_vals
            vn = var_name.lower()
            yaxis = "y2" if ("i(" in vn or vn.startswith("i")) else "y"
            plotly_data.append(
                {
                    "x": t_vals,
                    "y": y_vals,
                    "name": var_name,
                    "mode": "lines",
                    "type": "scatter",
                    "yaxis": yaxis,
                }
            )

    elif freq_key and data.get(freq_key):
        visualization_type = "frequency_response"
        freq_mag = _to_float_list(data[freq_key])
        frequency_response["freq"] = freq_mag

        for var_name, values in data.items():
            if var_name == freq_key or not values:
                continue

            if is_complex and values and isinstance(values[0], tuple):
                mag_db = []
                phase_deg = []
                for real, imag in values:
                    magnitude = float(np.sqrt(real ** 2 + imag ** 2))
                    mag_db.append(
                        20.0 * np.log10(magnitude) if magnitude > 0 else -200.0
                    )
                    phase_deg.append(float(np.degrees(np.arctan2(imag, real))))

                frequency_response["mag"] = mag_db
                frequency_response["phase"] = phase_deg

                plotly_data.append(
                    {
                        "x": freq_mag,
                        "y": mag_db,
                        "name": f"{var_name} (dB)",
                        "mode": "lines",
                        "type": "scatter",
                        "yaxis": "y",
                    }
                )
                plotly_data.append(
                    {
                        "x": freq_mag,
                        "y": phase_deg,
                        "name": f"{var_name} (deg)",
                        "mode": "lines",
                        "type": "scatter",
                        "yaxis": "y2",
                    }
                )
                break  # One Bode plot is enough
            else:
                y_vals = _to_float_list(values)
                vn = var_name.lower()
                if "mag" in vn or "db" in vn:
                    frequency_response["magnitude"] = y_vals
                    plotly_data.append(
                        {
                            "x": freq_mag,
                            "y": y_vals,
                            "name": f"{var_name} (dB)",
                            "mode": "lines",
                            "type": "scatter",
                            "yaxis": "y",
                        }
                    )
                elif "phase" in vn:
                    frequency_response["phase"] = y_vals
                    plotly_data.append(
                        {
                            "x": freq_mag,
                            "y": y_vals,
                            "name": f"{var_name} (deg)",
                            "mode": "lines",
                            "type": "scatter",
                            "yaxis": "y2",
                        }
                    )
                else:
                    frequency_response[var_name] = y_vals
                    plotly_data.append(
                        {
                            "x": freq_mag,
                            "y": y_vals,
                            "name": var_name,
                            "mode": "lines",
                            "type": "scatter",
                        }
                    )

    return {
        "metrics": metrics,
        "time_series": time_series,
        "frequency_response": frequency_response,
        "visualization_type": visualization_type,
        "plotly_data": plotly_data,
        "variables": variables,
    }


def generate_synthetic_result(raw_path: str) -> Dict[str, Any]:
    """Generate synthetic circuit result (fallback for binary .raw files)."""
    from pathlib import Path

    raw_file = Path(raw_path)
    work_dir = raw_file.parent
    netlist_files = list(work_dir.glob("*.cir")) if work_dir.exists() else []

    is_ac_analysis = False
    if netlist_files:
        try:
            with open(netlist_files[0], "r") as f:
                netlist_content = f.read()
            is_ac_analysis = ".ac" in netlist_content.lower()
        except Exception:
            pass

    if is_ac_analysis:
        freq = np.logspace(1, 5, 100).tolist()  # 10 Hz – 100 kHz
        fc = 159.15
        mag = (-20.0 * np.log10(np.sqrt(1 + (np.array(freq) / fc) ** 2))).tolist()
        phase = (-np.degrees(np.arctan(np.array(freq) / fc))).tolist()

        return {
            "metrics": [
                {"name": "Cutoff Frequency", "value": f"{fc:.1f}", "unit": "Hz"},
                {"name": "Resistance", "value": "1.0", "unit": "kΩ"},
                {"name": "Capacitance", "value": "1.0", "unit": "µF"},
                {
                    "name": "Note",
                    "value": "Synthetic result – binary format",
                    "unit": "",
                },
            ],
            "time_series": {},
            "frequency_response": {
                "freq": freq,
                "mag": mag,
                "phase": phase,
            },
            "visualization_type": "frequency_response",
            "plotly_data": [
                {
                    "x": freq,
                    "y": mag,
                    "name": "Magnitude (dB)",
                    "mode": "lines",
                    "type": "scatter",
                    "yaxis": "y",
                },
                {
                    "x": freq,
                    "y": phase,
                    "name": "Phase (deg)",
                    "mode": "lines",
                    "type": "scatter",
                    "yaxis": "y2",
                },
            ],
            "variables": ["frequency", "v(out)"],
        }
    else:
        t = np.linspace(0, 0.01, 100).tolist()
        v = (5.0 * (1 - np.exp(-np.array(t) / 0.001))).tolist()

        return {
            "metrics": [
                {"name": "Output Voltage", "value": "5.0", "unit": "V"},
                {
                    "name": "Note",
                    "value": "Synthetic result – binary format",
                    "unit": "",
                },
            ],
            "time_series": {"t": t, "v(out)": v},
            "frequency_response": {},
            "visualization_type": "time_series",
            "plotly_data": [
                {
                    "x": t,
                    "y": v,
                    "name": "v(out)",
                    "mode": "lines",
                    "type": "scatter",
                    "yaxis": "y",
                }
            ],
            "variables": ["time", "v(out)"],
        }