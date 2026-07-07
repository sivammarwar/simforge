"""NumericalProcessingResult — strict schema for numerical analysis results."""
from typing import Literal, Optional, List
from pydantic import BaseModel


class NumericalProcessingResult(BaseModel):
    sub_domain: Literal["numerical_processing"] = "numerical_processing"
    tool_used: Literal["scipy", "numpy"] = "scipy"
    domain: str = "Circuits"
    system_type: str = "Numerical Circuit Analysis"
    solver_name: str = "scipy/numpy"
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
    analysis_type: Optional[str] = None
    computed_values: List[dict] = []
