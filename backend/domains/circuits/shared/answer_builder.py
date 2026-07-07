"""
Structured Final Answer Builder
================================
Builds the final structured answer (Description / Intuition /
Mathematics / Formula / Conclusion) from the REAL standardized result dict
already produced by the pipeline. Handles analog_sim, symbolic_analysis,
and multi-domain merged results.
"""
from typing import Any, Dict


def _analysis_label(visualization_type: str) -> str:
    return {
        "diagram_only": "operating point (DC bias)",
        "transient_waveform": "transient (time-domain)",
        "frequency_response": "AC sweep (frequency response)",
    }.get(visualization_type, "circuit")


def build_structured_answer(result: Dict[str, Any]) -> str:
    sub_domain = result.get("sub_domain", "")
    status = result.get("status")

    if sub_domain == "multi" and result.get("results_by_domain"):
        return _build_multi_answer(result)

    if sub_domain == "symbolic_analysis":
        return _build_symbolic_answer(result)

    # New Phase 5 sub-domains: digital_logic, numerical_processing, control_systems,
    # rf_em, pcb_realization, fpga_realization, semiconductor_device, physical_design
    if sub_domain in ("digital_logic", "numerical_processing", "control_systems",
                      "rf_em", "pcb_realization", "fpga_realization",
                      "semiconductor_device", "physical_design"):
        is_tier3 = sub_domain in ("fpga_realization", "physical_design", "rf_em", "semiconductor_device")
        return _build_generic_sub_domain_answer(result, is_preview=is_tier3)

    if status == "out_of_scope":
        return (
            "### Description\n"
            f"{result.get('plain_summary', 'This question is outside the Circuits pipeline domain.')}\n\n"
            "### Conclusion\n"
            "Try rephrasing this as a circuit design or analysis question involving "
            "resistors, capacitors, inductors, diodes, BJTs, or basic op-amp-free analog topologies."
        )

    if status == "unsupported":
        return (
            "### Description\n"
            f"{result.get('plain_summary', 'Part of this question cannot be simulated by the current pipeline.')}\n\n"
            "### Conclusion\n"
            "We're actively working on covering more of the electronics domain. "
            f"Unsupported aspects: {'; '.join(result.get('unsupported_aspects') or []) or 'n/a'}."
        )

    if status == "failed":
        return (
            "### Description\n"
            f"A netlist was generated for **{result.get('system_type', 'this circuit')}**, "
            "but the ngspice simulation did not complete successfully.\n\n"
            "### Conclusion\n"
            f"{result.get('plain_summary', 'Simulation failed.')} "
            "Check the Schematic tab for the raw netlist that was attempted."
        )

    system_type = result.get("system_type", "circuit")
    metrics = result.get("metrics") or []
    netlist = result.get("netlist") or ""
    visualization_type = result.get("visualization_type", "diagram_only")
    assumptions = result.get("assumptions") or []
    unsupported = result.get("unsupported_aspects") or []
    analysis_label = _analysis_label(visualization_type)

    metrics_lines = "\n".join(f"- **{m['name']}**: {m['value']}" for m in metrics if isinstance(m, dict) and "name" in m)
    component_count = len([
        line for line in netlist.splitlines()
        if line.strip() and not line.strip().startswith(("*", ".", "W "))
    ])

    description = (
        f"**{system_type}** was modeled as a SPICE netlist with {component_count} "
        f"component line(s) and solved via a real **{analysis_label}** ngspice simulation."
    )

    intuition_by_viz = {
        "diagram_only": (
            "At DC steady state, capacitors act as open circuits and inductors as short "
            "circuits, so the node voltages below reflect the resistive network's actual "
            "current-divider/voltage-divider behavior."
        ),
        "transient_waveform": (
            "The time-domain response shown captures how energy-storage elements "
            "(capacitors/inductors) charge or discharge over time in response to the "
            "applied source."
        ),
        "frequency_response": (
            "The frequency sweep shows how the circuit's gain and phase shift vary with "
            "input frequency."
        ),
    }
    intuition = intuition_by_viz.get(visualization_type, "The circuit was solved numerically by ngspice.")

    mathematics_by_viz = {
        "diagram_only": "Solved via ngspice's DC operating-point analysis (Modified Nodal Analysis, KCL at every node).",
        "transient_waveform": "Solved via ngspice's transient analysis, numerically integrating the circuit's governing differential equations.",
        "frequency_response": "Solved via ngspice's AC small-signal analysis, linearizing the circuit around its operating point.",
    }
    mathematics = mathematics_by_viz.get(visualization_type, "Solved numerically by ngspice.")

    formula = "\n".join(f"    {line}" for line in netlist.splitlines()) if netlist else "    (no netlist generated)"

    conclusion_parts = [f"Simulation completed successfully for **{system_type}**."]
    if assumptions:
        conclusion_parts.append("Assumptions made: " + "; ".join(assumptions) + ".")
    if unsupported:
        conclusion_parts.append("Note: still unsupported: " + "; ".join(unsupported) + ".")
    conclusion = " ".join(conclusion_parts)

    return (
        f"### Description\n{description}\n\n"
        f"### Intuition\n{intuition}\n\n"
        f"### Mathematics\n{mathematics}\n\n"
        f"### Formula (netlist actually simulated)\n```\n{formula.strip()}\n```\n\n"
        f"### Results\n{metrics_lines or 'No metrics computed.'}\n\n"
        f"### Conclusion\n{conclusion}"
    )


def _build_symbolic_answer(result: Dict[str, Any]) -> str:
    st = result.get("system_type", "Symbolic Circuit")
    metrics = result.get("metrics") or []
    tf = result.get("transfer_function")
    exprs = result.get("symbolic_expressions") or []
    assumptions = result.get("assumptions") or []

    ml = "\n".join(f"- **{m['name']}**: {m['value']}" for m in metrics if isinstance(m, dict) and "name" in m)
    el = "\n".join(f"- **{e.get('label', 'expr')}**: `{e.get('expr', '')}`" for e in exprs if e.get("expr"))

    fp = []
    if tf:
        fp.append(f"H(s) = {tf}")
    if el:
        fp.append(el)
    formula = "\n".join(fp) if fp else "(no symbolic expressions derived)"

    c = f"Symbolic analysis completed for **{st}**."
    if assumptions:
        c += f" Assumptions: {'; '.join(assumptions)}."

    return (
        f"### Description\n**{st}** was analyzed symbolically using SymPy.\n\n"
        f"### Intuition\nSymbolic analysis produces exact mathematical relationships without numerical approximation.\n\n"
        f"### Mathematics\nSolved via SymPy's symbolic algebra engine from Kirchhoff's laws.\n\n"
        f"### Formula\n```\n{formula}\n```\n\n"
        f"### Results\n{ml or 'No metrics computed.'}\n\n"
        f"### Conclusion\n{c}"
    )


def _build_generic_sub_domain_answer(result: Dict[str, Any], is_preview: bool = False) -> str:
    st = result.get("system_type", result.get("sub_domain", "Circuit"))
    metrics = result.get("metrics") or []
    assumptions = result.get("assumptions") or []
    ml = "\n".join(f"- **{m['name']}**: {m['value']}" for m in metrics if isinstance(m, dict) and "name" in m)
    c = f"Analysis completed for **{st}**."
    if assumptions:
        c += f" Assumptions: {'; '.join(assumptions)}."
    preview_note = "\n\n> **Preview — limited validation.** This sub-domain is in early access; results may be incomplete." if is_preview else ""
    return (
        f"### Description\n**{st}** was analyzed using {result.get('solver_name', 'the analysis engine')}.{preview_note}\n\n"
        f"### Intuition\n{result.get('plain_summary', 'Analysis completed.')}\n\n"
        f"### Mathematics\nResults computed via {result.get('solver_name', 'the pipeline')}.\n\n"
        f"### Results\n{ml or 'No metrics computed.'}\n\n"
        f"### Conclusion\n{c}"
    )


def _build_multi_answer(result: Dict[str, Any]) -> str:
    rbd = result.get("results_by_domain") or {}
    st = result.get("system_type", "Multi-domain")
    metrics = result.get("metrics") or []
    status = result.get("status", "completed")
    dn = list(rbd.keys())

    ml = "\n".join(f"- **{m['name']}**: {m['value']}" for m in metrics if isinstance(m, dict) and "name" in m)

    d = f"**{st}** analyzed using {len(dn)} sub-domain(s): {', '.join(dn)}. Status: **{status}**."
    i = "Multiple analysis approaches combined for comprehensive circuit understanding."
    m = "Each sub-domain pipeline executed independently; results merged into unified output."
    c = f"Multi-tool orchestration completed for **{st}**."

    return (
        f"### Description\n{d}\n\n"
        f"### Intuition\n{i}\n\n"
        f"### Mathematics\n{m}\n\n"
        f"### Results\n{ml or 'No metrics computed.'}\n\n"
        f"### Conclusion\n{c}"
    )
