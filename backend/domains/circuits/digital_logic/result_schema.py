"""DigitalLogicResult — strict schema for digital logic analysis results."""
from typing import Literal, Optional, List
from pydantic import BaseModel


class DigitalLogicResult(BaseModel):
    sub_domain: Literal["digital_logic"] = "digital_logic"
    tool_used: Literal["yosys", "icarus", "verilator"] = "yosys"
    domain: str = "Circuits"
    system_type: str = "Digital Logic Circuit"
    solver_name: str = "yosys/sympy"
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
    truth_table: List[dict] = []
    boolean_expression: Optional[str] = None
    simplified_expression: Optional[str] = None
    gate_count: int = 0
