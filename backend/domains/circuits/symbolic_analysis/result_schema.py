"""
SymbolicResult
===============
Strict result schema for a completed symbolic (closed-form) circuit analysis.
"""
from typing import Literal, Optional, List
from pydantic import BaseModel


class SymbolicResult(BaseModel):
    sub_domain: Literal["symbolic_analysis"]
    tool_used: Literal["sympy"]
    domain: str = "Circuits"
    system_type: str = "Symbolic Circuit"
    solver_name: str = "sympy (symbolic)"
    status: str = "completed"
    netlist: str = ""
    raw_output_path: str = ""
    metrics: list = []
    visualization_type: str = "diagram_only"
    frequency_response: Optional[dict] = None
    time_series: Optional[dict] = None
    schematic_svg: str = ""
    schematic_error: Optional[str] = None
    assumptions: list = []
    unsupported_aspects: list = []
    plain_summary: Optional[str] = None
    # Symbolic-specific fields
    transfer_function: Optional[str] = None
    symbolic_expressions: List[dict] = []
