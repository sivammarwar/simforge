"""PhysicalDesignResult --- strict schema."""
from typing import Literal, Optional
from pydantic import BaseModel


class PhysicalDesignResult(BaseModel):
    sub_domain: Literal["physical_design"] = "physical_design"
    tool_used: Literal["openroad", "magic"] = "openroad"
    domain: str = "Circuits"
    system_type: str = "Physical Design"
    solver_name: str = "openroad"
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
    parasitic_rc: Optional[dict] = None
    area_report: Optional[str] = None
