"""SemiconductorDeviceResult --- strict schema."""
from typing import Literal, Optional
from pydantic import BaseModel


class SemiconductorDeviceResult(BaseModel):
    sub_domain: Literal["semiconductor_device"] = "semiconductor_device"
    tool_used: Literal["devsim"] = "devsim"
    domain: str = "Circuits"
    system_type: str = "Semiconductor Device"
    solver_name: str = "devsim"
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
    iv_curve: Optional[dict] = None
    device_parameters: Optional[dict] = None
