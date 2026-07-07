"""GnuCap adapter — SPICE simulator alternative to ngspice."""
from pathlib import Path
from typing import Dict, Any
from ...shared.execution_manager import run_tool, ExecutionError


class GnuCapAdapter:
    tool_name = "gnucap"

    def run(
        self,
        task_id: str,
        netlist: str,
        runs_dir: Path,
        timeout_seconds: int = 120,
    ) -> Dict[str, Any]:
        work_dir = runs_dir / task_id
        work_dir.mkdir(parents=True, exist_ok=True)
        deck_path = work_dir / "circuit.cir"
        deck_path.write_text(netlist)

        try:
            result = run_tool(
                cmd=["gnucap", "-b", str(deck_path)],
                cwd=work_dir,
                timeout_seconds=timeout_seconds,
            )
        except ExecutionError as exc:
            return {"success": False, "error": str(exc), "tool": self.tool_name}

        return {
            "success": result["returncode"] == 0,
            "tool": self.tool_name,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "returncode": result["returncode"],
            "elapsed_s": result["elapsed_s"],
        }
