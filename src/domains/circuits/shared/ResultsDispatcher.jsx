/**
 * ResultsDispatcher
 * =================
 * Inspects resultsData.sub_domain (set by the backend's ResultRegistry) and
 * renders the correct sub-domain view component. Register new sub-domains
 * ONLY here — never inside another sub-domain's folder.
 *
 * resultsData is null before the first solver run, so we default to the
 * analog_sim view (the only sub-domain today) so existing empty-state UI
 * inside CircuitsResultsPane keeps working unchanged.
 */
import AnalogSimView from '../analog_sim/AnalogSimView';
import SymbolicView from '../symbolic_analysis/SymbolicView';
import NumericalView from '../numerical_processing/NumericalView';
import ControlSystemsView from '../control_systems/ControlSystemsView';
import DigitalLogicView from '../digital_logic/DigitalLogicView';
import PCBView from '../pcb_realization/PCBView';
import FPGAView from '../fpga_realization/FPGAView';
import PhysicalDesignView from '../physical_design/PhysicalDesignView';
import RFEMView from '../rf_em/RFEMView';
import SemiconductorDeviceView from '../semiconductor_device/SemiconductorDeviceView';

const VIEW_REGISTRY = {
  analog_sim: AnalogSimView,
  symbolic_analysis: SymbolicView,
  numerical_processing: NumericalView,
  control_systems: ControlSystemsView,
  digital_logic: DigitalLogicView,
  pcb_realization: PCBView,
  fpga_realization: FPGAView,
  physical_design: PhysicalDesignView,
  rf_em: RFEMView,
  semiconductor_device: SemiconductorDeviceView,
};

export default function ResultsDispatcher(props) {
  const subDomain = props.resultsData?.sub_domain || 'analog_sim';
  const View = VIEW_REGISTRY[subDomain] || AnalogSimView;
  return <View {...props} />;
}
