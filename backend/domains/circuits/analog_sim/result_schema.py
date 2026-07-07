"""
AnalogSimResult
================
Strict result schema for a completed analog simulation run.
Relocated from api_routes.py so the schema lives next to its sub-domain code.
"""
from typing import Literal, Optional
from pydantic import BaseModel


class AnalogSimResult(BaseModel):
    sub_domain: Literal["analog_sim"]
    tool_used: Literal["ngspice", "xyce", "gnucap"]
    domain: str = "Circuits"
    system_type: str = "Unknown Circuit"
    solver_name: str = "ngspice (AI netlist)"
    status: str = "completed"
    netlist: str
    raw_output_path: str
    metrics: list
    visualization_type: str = "diagram_only"
    # dict-of-arrays (e.g. {"t": [...], "Vc": [...]}), not a list of records
    frequency_response: Optional[dict] = None
    time_series: Optional[dict] = None
    schematic_svg: str = ""
    schematic_error: Optional[str] = None
    assumptions: list = []
    unsupported_aspects: list = []
    plain_summary: Optional[str] = None
