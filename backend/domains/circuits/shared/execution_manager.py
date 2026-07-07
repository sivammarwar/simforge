"""Execution Manager — shared subprocess-isolation layer for all tool adapters."""
import subprocess, shutil, time
from pathlib import Path
from typing import List, Dict, Any, Optional

class ExecutionError(Exception): pass

class ToolExecution:
    def __init__(self, cmd: List[str], cwd: Path, timeout_seconds: int = 120, env: Optional[Dict[str, str]] = None):
        self.cmd = cmd; self.cwd = cwd; self.timeout_seconds = timeout_seconds; self.env = env
        self.result: Optional[subprocess.CompletedProcess] = None
        self.elapsed_s: float = 0.0
    def check_binary(self) -> None:
        if not shutil.which(self.cmd[0]):
            raise ExecutionError(f"{self.cmd[0]} binary not found on PATH.")
    def run(self) -> subprocess.CompletedProcess:
        self.check_binary()
        start = time.time()
        try:
            self.result = subprocess.run(self.cmd, cwd=self.cwd, capture_output=True, text=True, timeout=self.timeout_seconds, env=self.env)
        except subprocess.TimeoutExpired:
            raise ExecutionError(f"Tool timed out after {self.timeout_seconds}s: {self.cmd[0]}")
        self.elapsed_s = time.time() - start
        return self.result
    def stdout(self) -> str: return self.result.stdout if self.result else ""
    def stderr(self) -> str: return self.result.stderr if self.result else ""
    def returncode(self) -> int: return self.result.returncode if self.result else -1

def run_tool(cmd: List[str], cwd: Path, timeout_seconds: int = 120, env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    ex = ToolExecution(cmd, cwd, timeout_seconds, env)
    ex.run()
    return {
        "cmd": cmd, "cwd": str(cwd), "returncode": ex.returncode(),
        "stdout": ex.stdout(), "stderr": ex.stderr(), "elapsed_s": ex.elapsed_s,
    }
