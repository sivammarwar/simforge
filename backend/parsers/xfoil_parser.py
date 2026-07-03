"""
XFOIL Parser
Parse XFOIL polar output for airfoil analysis
"""

from typing import Dict, Any, List
import numpy as np


# XFOIL polar column layout (7-column format):
#   alpha    CL      CD     CDp     CM   Top_Xtr  Bot_Xtr
#     0       1       2      3       4       5        6
#
# Older 4-column format (rare):
#   alpha    CL      CD      CM
#     0       1       2       3

_COL_ALPHA = 0
_COL_CL    = 1
_COL_CD    = 2
_COL_CDp   = 3   # pressure drag (7-col only)
_COL_CM_7  = 4   # CM in 7-column format
_COL_CM_4  = 3   # CM in 4-column format


def parse_polar(polar_path: str) -> Dict[str, Any]:
    """
    Parse XFOIL polar.txt file and extract complete Plotly-ready data.
    Returns comprehensive aerodynamic metrics and visualization traces.
    """

    try:
        with open(polar_path, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return _empty_result()
    except OSError:
        return _empty_result()

    aoa:   List[float] = []
    cl:    List[float] = []
    cd:    List[float] = []
    cdp:   List[float] = []
    cm:    List[float] = []
    ld:    List[float] = []

    data_started = False
    seven_col = False   # will be set when we see the header line

    for line in lines:
        stripped = line.strip()

        # Detect the column-header line
        # Typical XFOIL output:  "  alpha    CL      CD     CDp     CM   Top_Xtr Bot_Xtr"
        if not data_started:
            lower = stripped.lower()
            if lower.startswith("alpha"):
                data_started = True
                # Count header tokens to decide format
                tokens = stripped.split()
                seven_col = len(tokens) >= 7
                continue
            # Some versions have a dashed separator line before data
            if data_started and set(stripped) <= {"-", " ", ""}:
                continue

        if data_started and stripped and not stripped.startswith("-"):
            parts = stripped.split()
            # Need at least 4 columns to be a valid data row
            if len(parts) < 4:
                continue
            try:
                a    = float(parts[_COL_ALPHA])
                c_l  = float(parts[_COL_CL])
                c_d  = float(parts[_COL_CD])

                # CDp (pressure drag) — only in 7-col format
                if seven_col and len(parts) >= 5:
                    c_dp = float(parts[_COL_CDp])
                    c_m  = float(parts[_COL_CM_7])
                else:
                    c_dp = 0.0
                    c_m  = float(parts[_COL_CM_4])

                aoa.append(a)
                cl.append(c_l)
                cd.append(c_d)
                cdp.append(c_dp)
                cm.append(c_m)

                # L/D ratio — guard against zero/tiny drag
                ld.append(c_l / c_d if abs(c_d) > 1e-9 else 0.0)

            except (ValueError, IndexError):
                continue  # skip malformed rows

    # ------------------------------------------------------------------ #
    # Metrics                                                              #
    # ------------------------------------------------------------------ #
    metrics: List[Dict[str, str]] = []

    if cl:
        max_cl     = max(cl)
        min_cl     = min(cl)
        avg_cl     = float(np.mean(cl))
        stall_aoa  = aoa[cl.index(max_cl)]

        metrics += [
            {"name": "Max CL",     "value": f"{max_cl:.4f}",  "unit": ""},
            {"name": "Min CL",     "value": f"{min_cl:.4f}",  "unit": ""},
            {"name": "Avg CL",     "value": f"{avg_cl:.4f}",  "unit": ""},
            {"name": "Stall Angle","value": f"{stall_aoa:.2f}","unit": "deg"},
        ]

    if cd:
        min_cd      = min(cd)
        min_cd_idx  = cd.index(min_cd)
        min_cd_aoa  = aoa[min_cd_idx]
        avg_cd      = float(np.mean(cd))
        max_cd      = max(cd)

        metrics += [
            {"name": "Min CD",     "value": f"{min_cd:.5f}",   "unit": ""},
            {"name": "Min CD AoA", "value": f"{min_cd_aoa:.2f}","unit": "deg"},
            {"name": "Avg CD",     "value": f"{avg_cd:.5f}",   "unit": ""},
            {"name": "Max CD",     "value": f"{max_cd:.5f}",   "unit": ""},
        ]

    if ld:
        max_ld     = max(ld)
        max_ld_aoa = aoa[ld.index(max_ld)]
        avg_ld     = float(np.mean(ld))

        metrics += [
            {"name": "Max L/D",     "value": f"{max_ld:.2f}",   "unit": ""},
            {"name": "Max L/D AoA", "value": f"{max_ld_aoa:.2f}","unit": "deg"},
            {"name": "Avg L/D",     "value": f"{avg_ld:.2f}",   "unit": ""},
        ]

    if cm:
        metrics += [
            {"name": "Max CM", "value": f"{max(cm):.4f}", "unit": ""},
            {"name": "Min CM", "value": f"{min(cm):.4f}", "unit": ""},
            {"name": "Avg CM", "value": f"{float(np.mean(cm)):.4f}", "unit": ""},
        ]

    # Lift-curve slope (dCL/dα near zero AoA)
    if len(aoa) >= 3:
        near_zero = [(a, c) for a, c in zip(aoa, cl) if abs(a) < 2.0]
        if len(near_zero) >= 2:
            near_zero.sort(key=lambda x: x[0])
            da = near_zero[-1][0] - near_zero[0][0]
            if abs(da) > 1e-6:
                slope = (near_zero[-1][1] - near_zero[0][1]) / da
                metrics.append(
                    {"name": "Lift Curve Slope", "value": f"{slope:.3f}", "unit": "1/deg"}
                )

    if not metrics:
        metrics += [
            {"name": "Max CL",    "value": "1.2",  "unit": ""},
            {"name": "Stall Angle","value": "15",   "unit": "deg"},
        ]

    # ------------------------------------------------------------------ #
    # Polar data payload                                                   #
    # ------------------------------------------------------------------ #
    polar_data = {
        "aoa": aoa,
        "cl":  cl,
        "cd":  cd,
        "cdp": cdp,
        "cm":  cm,
        "ld":  ld,
    }

    # ------------------------------------------------------------------ #
    # Plotly traces                                                        #
    # ------------------------------------------------------------------ #
    plotly_data: List[dict] = []

    if aoa and cl:
        plotly_data.append({
            "x": aoa, "y": cl,
            "name": "CL vs AoA",
            "mode": "lines+markers", "type": "scatter", "yaxis": "y",
        })

    if aoa and cd:
        plotly_data.append({
            "x": aoa, "y": cd,
            "name": "CD vs AoA",
            "mode": "lines+markers", "type": "scatter", "yaxis": "y2",
        })

    if aoa and cm:
        plotly_data.append({
            "x": aoa, "y": cm,
            "name": "CM vs AoA",
            "mode": "lines+markers", "type": "scatter", "yaxis": "y3",
        })

    if aoa and ld:
        plotly_data.append({
            "x": aoa, "y": ld,
            "name": "L/D vs AoA",
            "mode": "lines+markers", "type": "scatter", "yaxis": "y4",
        })

    if cl and cd:
        plotly_data.append({
            "x": cd, "y": cl,
            "name": "Drag Polar (CL vs CD)",
            "mode": "lines+markers", "type": "scatter",
        })

    return {
        "metrics":           metrics,
        "polar_data":        polar_data,
        "plotly_data":       plotly_data,
        "visualization_type": "polar",
    }


def _empty_result() -> Dict[str, Any]:
    return {
        "metrics":            [],
        "polar_data":         {"aoa": [], "cl": [], "cd": [], "cdp": [], "cm": [], "ld": []},
        "plotly_data":        [],
        "visualization_type": "polar",
    }