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
    gate_netlist: Optional[dict] = None
    verilog_behavioral: Optional[str] = None
    verilog_structural: Optional[str] = None
    gate_count_by_type: Optional[dict] = None
    # The exact module name declared inside verilog_behavioral/verilog_structural
    # (e.g. "module <module_name> (...)"). First-class field so consumers
    # (fpga_realization's orchestration threading) can read it directly
    # instead of re-deriving it from system_type with a duplicated
    # sanitization rule that could silently drift out of sync.
    module_name: Optional[str] = None
