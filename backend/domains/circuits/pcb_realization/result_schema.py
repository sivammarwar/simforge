"""PCBRealizationResult --- strict schema."""
from typing import Literal, Optional
from pydantic import BaseModel


class PCBRealizationResult(BaseModel):
    sub_domain: Literal["pcb_realization"] = "pcb_realization"
    tool_used: Literal["kicad"] = "kicad"
    domain: str = "Circuits"
    system_type: str = "PCB Design"
    solver_name: str = "kicad"
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
    layer_count: int = 0
    trace_impedance: Optional[float] = None
