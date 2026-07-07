"""
ngspice Adapter
===============
Analog sim adapter that plugs into the shared ExecutionManager.
Phase 3 foundation: thin wrapper around the existing run_ngspice.
"""
from pathlib import Path
from typing import Dict, Any, Callable

# Migration-time import from the old location.
from backend.circuits.ngspice_runner import run_ngspice, NgspiceRunError


class NgspiceAdapter:
    tool_name = "ngspice"

    def run(
        self,
        task_id: str,
        system_type: str,
        netlist: str,
        analysis: Dict[str, Any],
        probe_nodes: list,
        runs_dir: Path,
    ) -> Dict[str, Any]:
        return run_ngspice(
            task_id=task_id,
            system_type=system_type,
            unified_netlist=netlist,
            analysis=analysis,
            probe_nodes=probe_nodes,
            runs_dir=runs_dir,
        )
