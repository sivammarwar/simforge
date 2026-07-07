"""FPGARealizationResult --- strict schema."""
from typing import Literal, Optional
from pydantic import BaseModel


class FPGARealizationResult(BaseModel):
    sub_domain: Literal["fpga_realization"] = "fpga_realization"
    tool_used: Literal["nextpnr"] = "nextpnr"
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
