"""
Result Registry
===============
Central registry that maps sub_domain values to their Pydantic result schemas
and display parsers. This is the ONLY place a new sub-domain needs to be
registered after adding its own folder, per the one-folder-per-sub-domain rule.
"""
from typing import Dict, Type, Callable, Any
from pydantic import BaseModel
from ..analog_sim.result_schema import AnalogSimResult
from ..symbolic_analysis.result_schema import SymbolicResult
from ..symbolic_analysis.parser import parse_symbolic_result
from ..digital_logic.result_schema import DigitalLogicResult
from ..digital_logic.parser import parse_digital_logic_result
from ..numerical_processing.result_schema import NumericalProcessingResult
from ..numerical_processing.parser import parse_numerical_result
from ..control_systems.result_schema import ControlSystemsResult
from ..control_systems.parser import parse_control_systems_result
from ..rf_em.result_schema import RFEMResult
from ..rf_em.parser import parse_rf_em_result
from ..pcb_realization.result_schema import PCBRealizationResult
from ..pcb_realization.parser import parse_pcb_realization_result
from ..fpga_realization.result_schema import FPGARealizationResult
from ..fpga_realization.parser import parse_fpga_realization_result
from ..semiconductor_device.result_schema import SemiconductorDeviceResult
from ..semiconductor_device.parser import parse_semiconductor_device_result
from ..physical_design.result_schema import PhysicalDesignResult
from ..physical_design.parser import parse_physical_design_result


class SubDomainRegistration:
    """One entry per sub-domain: schema + a parser/normalizer to display form."""
    def __init__(
        self,
        schema: Type[BaseModel],
        parser: Callable[[Dict[str, Any]], Dict[str, Any]],
    ):
        self.schema = schema
        self.parser = parser


# Default no-op parser; each sub-domain can replace it with its own.
def _default_parser(raw: Dict[str, Any]) -> Dict[str, Any]:
    return raw


_REGISTRY: Dict[str, SubDomainRegistration] = {
    "analog_sim": SubDomainRegistration(
        schema=AnalogSimResult,
        parser=_default_parser,
    ),
    "symbolic_analysis": SubDomainRegistration(
        schema=SymbolicResult,
        parser=parse_symbolic_result,
    ),
    "digital_logic": SubDomainRegistration(schema=DigitalLogicResult, parser=parse_digital_logic_result),
    "numerical_processing": SubDomainRegistration(schema=NumericalProcessingResult, parser=parse_numerical_result),
    "control_systems": SubDomainRegistration(schema=ControlSystemsResult, parser=parse_control_systems_result),
    "rf_em": SubDomainRegistration(schema=RFEMResult, parser=parse_rf_em_result),
    "pcb_realization": SubDomainRegistration(schema=PCBRealizationResult, parser=parse_pcb_realization_result),
    "fpga_realization": SubDomainRegistration(schema=FPGARealizationResult, parser=parse_fpga_realization_result),
    "semiconductor_device": SubDomainRegistration(schema=SemiconductorDeviceResult, parser=parse_semiconductor_device_result),
    "physical_design": SubDomainRegistration(schema=PhysicalDesignResult, parser=parse_physical_design_result),
}


def get_sub_domain_registration(sub_domain: str) -> SubDomainRegistration:
    if sub_domain not in _REGISTRY:
        raise ValueError(f"Unknown sub_domain: {sub_domain}")
    return _REGISTRY[sub_domain]


def get_result_schema(sub_domain: str) -> Type[BaseModel]:
    return get_sub_domain_registration(sub_domain).schema


def parse_result(sub_domain: str, raw: Dict[str, Any]) -> Dict[str, Any]:
    reg = get_sub_domain_registration(sub_domain)
    validated = reg.schema(**raw)
    return reg.parser(validated.model_dump())


def register_sub_domain(
    sub_domain: str,
    schema: Type[BaseModel],
    parser: Callable[[Dict[str, Any]], Dict[str, Any]] = _default_parser,
) -> None:
    """Used by each sub-domain's __init__.py or module to register itself."""
    _REGISTRY[sub_domain] = SubDomainRegistration(schema=schema, parser=parser)


def list_sub_domains() -> list:
    return list(_REGISTRY.keys())
