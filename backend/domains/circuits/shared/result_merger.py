"""Result Merger --- merges multiple sub-domain results into one unified dict."""
from typing import Dict, Any, List


def merge_results(sub_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not sub_results:
        return {"success": False, "status": "failed", "error": "No results to merge."}
    if len(sub_results) == 1:
        r = sub_results[0]
        r.setdefault("results_by_domain", {r.get("sub_domain", "unknown"): r})
        return r

    all_ok = all(r.get("success", True) for r in sub_results)
    any_ok = any(r.get("success", True) for r in sub_results)
    status = "completed" if all_ok else ("partial" if any_ok else "failed")

    metrics: List[Dict[str, Any]] = []
    for r in sub_results:
        metrics.extend(r.get("metrics") or [])

    svg, svg_err, netlist = "", None, ""
    for r in sub_results:
        if not svg and r.get("schematic_svg"):
            svg = r["schematic_svg"]
        if not svg_err and r.get("schematic_error"):
            svg_err = r["schematic_error"]
        if not netlist and r.get("netlist"):
            netlist = r["netlist"]

    assumptions = list({a for r in sub_results for a in (r.get("assumptions") or [])})
    summaries = [r.get("plain_summary", "") for r in sub_results if r.get("plain_summary")]
    system_types = [r.get("system_type", "") for r in sub_results if r.get("system_type")]
    results_by_domain = {r.get("sub_domain", f"sd_{i}"): r for i, r in enumerate(sub_results)}

    return {
        "success": any_ok,
        "sub_domain": "multi",
        "domain": "Circuits",
        "status": status,
        "system_type": " + ".join(system_types) if system_types else "Multi-domain",
        "solver_name": "multi-tool orchestration",
        "metrics": metrics,
        "netlist": netlist,
        "schematic_svg": svg,
        "schematic_error": svg_err,
        "assumptions": assumptions,
        "unsupported_aspects": list({u for r in sub_results for u in (r.get("unsupported_aspects") or [])}),
        "plain_summary": " | ".join(summaries) if summaries else None,
        "visualization_type": sub_results[0].get("visualization_type", "diagram_only"),
        "frequency_response": next((r.get("frequency_response") for r in sub_results if r.get("frequency_response")), None),
        "time_series": next((r.get("time_series") for r in sub_results if r.get("time_series")), None),
        "raw_output_path": "",
        "results_by_domain": results_by_domain,
    }
