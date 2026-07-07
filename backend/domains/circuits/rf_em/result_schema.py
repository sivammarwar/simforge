"""RFEMResult --- strict schema for RF/EM analysis."""
from typing import Literal, Optional
from pydantic import BaseModel


class RFEMResult(BaseModel):
    sub_domain: Literal["rf_em"] = "rf_em"
    tool_used: Literal["openems", "gnuradio"] = "openems"
    domain: str = "Circuits"
    system_type: str = "RF/EM Circuit"
    solver_name: str = "openems"
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
    s_parameters: Optional[dict] = None
    smith_chart_data: Optional[dict] = None
