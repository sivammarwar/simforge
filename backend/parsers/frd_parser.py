"""
CalculiX FRD Parser
Parse CalculiX .frd output files for FEA results
"""

from typing import Dict, Any, List, Optional
import re
import numpy as np


def parse_frd(frd_path: str) -> Dict[str, Any]:
    """
    Parse CalculiX .frd file and extract complete Plotly-ready data.
    Returns nodes, displacements, stresses, and comprehensive metrics for visualization.
    """

    try:
        with open(frd_path, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        return {
            "metrics": [],
            "contour_field": {},
            "plotly_data": [],
            "nodes": [],
            "displacements": [],
            "stresses": [],
            "strains": [],
            "reaction_forces": [],
        }

    nodes: List[dict] = []
    displacements: List[dict] = []
    stresses: List[dict] = []
    von_mises: List[float] = []
    strains: List[dict] = []
    reaction_forces: List[dict] = []

    # ------------------------------------------------------------------ #
    # FRD record types                                                     #
    #   1C  – node block header                                            #
    #   2C  – element block header                                         #
    #   -1  – data record (node id + values)                               #
    #   -2  – element connectivity                                         #
    #   -3  – end-of-block marker                                          #
    #   -4  – dataset / result header                                      #
    #   -5  – component name header                                        #
    # ------------------------------------------------------------------ #

    # Regex that captures all numbers including negative scientific notation
    # e.g. "19-5.56890E-01 3.12000E+02" → handles run-together negatives
    _NUM_RE = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")

    current_dataset: Optional[str] = None  # 'DISP', 'STRESS', 'STRAIN', 'RFORCE'
    in_node_block = False

    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.strip()

        # ---- block / section markers ---------------------------------- #
        if line.startswith("1C") or line.startswith(" 1C"):
            # Node coordinate block header
            in_node_block = True
            current_dataset = None
            i += 1
            continue

        if line.startswith("2C") or line.startswith(" 2C"):
            # Element connectivity block – we don't parse elements
            in_node_block = False
            current_dataset = None
            i += 1
            continue

        # -3 marks end of a data block
        if line.startswith("-3"):
            in_node_block = False
            current_dataset = None
            i += 1
            continue

        # -4 is a result/dataset header line
        if line.startswith("-4"):
            in_node_block = False
            upper = line.upper()
            if "DISP" in upper:
                current_dataset = "DISP"
            elif "STRESS" in upper or "S" in upper.split():
                current_dataset = "STRESS"
            elif "STRAIN" in upper or "E" in upper.split():
                current_dataset = "STRAIN"
            elif "RFORCE" in upper or "RF" in upper:
                current_dataset = "RFORCE"
            else:
                current_dataset = None
            i += 1
            continue

        # -5 is a component name descriptor – skip
        if line.startswith("-5"):
            i += 1
            continue

        # ---- data records --------------------------------------------- #
        if line.startswith("-1"):
            # Extract all numbers from the line robustly
            numbers = _NUM_RE.findall(line)
            # numbers[0] is always the node/element id
            if len(numbers) < 2:
                i += 1
                continue

            try:
                entity_id = int(float(numbers[0]))
            except ValueError:
                i += 1
                continue

            float_vals = []
            for n in numbers[1:]:
                try:
                    float_vals.append(float(n))
                except ValueError:
                    pass

            if in_node_block and len(float_vals) >= 3:
                # Node coordinate record
                nodes.append(
                    {
                        "id": entity_id,
                        "x": float_vals[0],
                        "y": float_vals[1],
                        "z": float_vals[2],
                    }
                )

            elif current_dataset == "DISP" and len(float_vals) >= 3:
                dx, dy, dz = float_vals[0], float_vals[1], float_vals[2]
                disp_mag = float(np.sqrt(dx ** 2 + dy ** 2 + dz ** 2))
                displacements.append(
                    {
                        "id": entity_id,
                        "dx": dx,
                        "dy": dy,
                        "dz": dz,
                        "magnitude": disp_mag,
                    }
                )

            elif current_dataset == "STRESS" and len(float_vals) >= 6:
                s11, s22, s33 = float_vals[0], float_vals[1], float_vals[2]
                s12, s23, s13 = float_vals[3], float_vals[4], float_vals[5]
                vm = float(
                    np.sqrt(
                        0.5
                        * (
                            (s11 - s22) ** 2
                            + (s22 - s33) ** 2
                            + (s33 - s11) ** 2
                            + 6.0 * (s12 ** 2 + s23 ** 2 + s13 ** 2)
                        )
                    )
                )
                stresses.append(
                    {
                        "id": entity_id,
                        "s11": s11,
                        "s22": s22,
                        "s33": s33,
                        "s12": s12,
                        "s23": s23,
                        "s13": s13,
                        "vm": vm,
                        "p1": s11,
                        "p2": s22,
                        "p3": s33,
                    }
                )
                von_mises.append(vm)

            elif current_dataset == "STRAIN" and len(float_vals) >= 6:
                e11, e22, e33 = float_vals[0], float_vals[1], float_vals[2]
                e12, e23, e13 = float_vals[3], float_vals[4], float_vals[5]
                vm_strain = float(
                    np.sqrt(
                        0.5
                        * (
                            (e11 - e22) ** 2
                            + (e22 - e33) ** 2
                            + (e33 - e11) ** 2
                            + 6.0 * (e12 ** 2 + e23 ** 2 + e13 ** 2)
                        )
                    )
                )
                strains.append(
                    {
                        "id": entity_id,
                        "e11": e11,
                        "e22": e22,
                        "e33": e33,
                        "e12": e12,
                        "e23": e23,
                        "e13": e13,
                        "vm": vm_strain,
                    }
                )

            elif current_dataset == "RFORCE" and len(float_vals) >= 3:
                fx, fy, fz = float_vals[0], float_vals[1], float_vals[2]
                rf_mag = float(np.sqrt(fx ** 2 + fy ** 2 + fz ** 2))
                reaction_forces.append(
                    {"id": entity_id, "fx": fx, "fy": fy, "fz": fz, "magnitude": rf_mag}
                )

        i += 1

    # ------------------------------------------------------------------ #
    # Metrics                                                              #
    # ------------------------------------------------------------------ #
    metrics: List[dict] = []

    if von_mises:
        max_vm = max(von_mises)
        min_vm = min(von_mises)
        avg_vm = float(np.mean(von_mises))
        std_vm = float(np.std(von_mises))
        metrics.append({"name": "Max Von Mises Stress", "value": f"{max_vm / 1e6:.2f}", "unit": "MPa"})
        metrics.append({"name": "Min Von Mises Stress", "value": f"{min_vm / 1e6:.2f}", "unit": "MPa"})
        metrics.append({"name": "Avg Von Mises Stress", "value": f"{avg_vm / 1e6:.2f}", "unit": "MPa"})
        metrics.append({"name": "Stress Std Dev", "value": f"{std_vm / 1e6:.2f}", "unit": "MPa"})

    if displacements:
        disp_mags = [d["magnitude"] for d in displacements]
        max_disp_mm = max(disp_mags) * 1000.0
        avg_disp_mm = float(np.mean(disp_mags)) * 1000.0
        metrics.append({"name": "Max Displacement", "value": f"{max_disp_mm:.4f}", "unit": "mm"})
        metrics.append({"name": "Avg Displacement", "value": f"{avg_disp_mm:.4f}", "unit": "mm"})

    if strains:
        strain_vms = [s["vm"] for s in strains]
        metrics.append({"name": "Max Von Mises Strain", "value": f"{max(strain_vms):.6f}", "unit": ""})
        metrics.append({"name": "Avg Von Mises Strain", "value": f"{float(np.mean(strain_vms)):.6f}", "unit": ""})

    if reaction_forces:
        rf_mags = [rf["magnitude"] for rf in reaction_forces]
        metrics.append({"name": "Max Reaction Force", "value": f"{max(rf_mags):.2f}", "unit": "N"})
        metrics.append({"name": "Total Reaction Force", "value": f"{sum(rf_mags):.2f}", "unit": "N"})

    metrics.append({"name": "Nodes", "value": str(len(nodes)), "unit": ""})
    metrics.append({"name": "Elements", "value": str(len(stresses)), "unit": ""})

    # ------------------------------------------------------------------ #
    # Contour field & Plotly traces                                        #
    # ------------------------------------------------------------------ #
    contour_field: dict = {}
    plotly_data: List[dict] = []

    if nodes:
        x = [n["x"] for n in nodes]
        y = [n["y"] for n in nodes]
        z = [n["z"] for n in nodes]

        # Map element-level von Mises to nodes (nearest index, zero-padded)
        if von_mises:
            n_nodes = len(nodes)
            n_vm = len(von_mises)
            if n_vm >= n_nodes:
                stress_at_nodes = von_mises[:n_nodes]
            else:
                stress_at_nodes = von_mises + [0.0] * (n_nodes - n_vm)

            contour_field = {
                "x": x,
                "y": y,
                "z": z,
                "stress": stress_at_nodes,
                "stress_mpa": [s / 1e6 for s in stress_at_nodes],
            }

            plotly_data.append(
                {
                    "type": "scatter3d",
                    "mode": "markers",
                    "x": x,
                    "y": y,
                    "z": z,
                    "marker": {
                        "size": 5,
                        "color": [s / 1e6 for s in stress_at_nodes],
                        "colorscale": "Viridis",
                        "colorbar": {"title": "Von Mises (MPa)"},
                    },
                    "name": "Von Mises Stress",
                }
            )
        else:
            contour_field = {"x": x, "y": y, "z": z}

        if displacements:
            disp_mag_list = [d["magnitude"] for d in displacements]
            contour_field["displacement"] = disp_mag_list
            contour_field["displacement_mm"] = [d * 1000.0 for d in disp_mag_list]

            # Deformed shape – only as many nodes as we have displacements
            n = min(len(nodes), len(displacements))
            plotly_data.append(
                {
                    "type": "scatter3d",
                    "mode": "markers",
                    "x": [nodes[k]["x"] + displacements[k]["dx"] for k in range(n)],
                    "y": [nodes[k]["y"] + displacements[k]["dy"] for k in range(n)],
                    "z": [nodes[k]["z"] + displacements[k]["dz"] for k in range(n)],
                    "marker": {"size": 3, "color": "red"},
                    "name": "Deformed Shape",
                }
            )

    if stresses:
        contour_field["s11"] = [s["s11"] for s in stresses]
        contour_field["s22"] = [s["s22"] for s in stresses]
        contour_field["s33"] = [s["s33"] for s in stresses]

    return {
        "metrics": metrics,
        "contour_field": contour_field,
        "plotly_data": plotly_data,
        "nodes": nodes,
        "displacements": displacements,
        "stresses": stresses,
        "strains": strains,
        "reaction_forces": reaction_forces,
    }