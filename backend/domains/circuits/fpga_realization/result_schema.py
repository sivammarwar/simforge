"""FPGARealizationResult --- strict schema."""
from typing import Literal, Optional
from pydantic import BaseModel


class FPGARealizationResult(BaseModel):
    sub_domain: Literal["fpga_realization"] = "fpga_realization"
    # Phase A: yosys only (generic synth). Phase B adds nextpnr placement/timing.
    tool_used: Literal["yosys", "nextpnr"] = "yosys"
    domain: str = "Circuits"
    system_type: str = "FPGA Design"
    solver_name: str = "nextpnr"
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
    lut_count: int = 0
    timing_report: Optional[str] = None
    # Phase A additions — parse_result() validates raw dicts through this
    # schema (pydantic silently drops undeclared fields), so anything the
    # pipeline sets that isn't listed here would vanish before reaching the
    # frontend. verified/proof_of_work mirror AnalogSimResult's shape.
    verilog_source: Optional[str] = None
    top_module: Optional[str] = None
    cell_counts: Optional[dict] = None
    total_cells: Optional[int] = None
    verified: bool = False
    proof_of_work: Optional[dict] = None
    synthesis_error: Optional[str] = None
    # Phase B additions — same silent-drop risk applies to these.
    placement: Optional[dict] = None
    placement_error: Optional[str] = None
