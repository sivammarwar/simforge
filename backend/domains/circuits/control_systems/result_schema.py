"""ControlSystemsResult — strict schema for control system analysis."""
from typing import Literal, Optional, List
from pydantic import BaseModel


class ControlSystemsResult(BaseModel):
    sub_domain: Literal["control_systems"] = "control_systems"
    tool_used: Literal["python_control"] = "python_control"
    domain: str = "Circuits"
    system_type: str = "Control System"
    solver_name: str = "python-control"
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
    transfer_function: Optional[str] = None
    stability: Optional[str] = None
    gain_margin: Optional[float] = None
    phase_margin: Optional[float] = None
    step_info: Optional[dict] = None
