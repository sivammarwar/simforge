/**
 * AnalogSimView
 * =============
 * Thin wrapper registering the existing CircuitsResultsPane as the
 * analog_sim sub-domain's view component, per the one-folder-per-sub-domain
 * frontend rule. The underlying rendering logic (schematic SVG scaling,
 * Plotly frequency/time-series charts) is NOT duplicated here — it stays in
 * components/results/CircuitsResultsPane.jsx since it already works and is
 * non-trivial (Lcapy/pdf2svg label-scaling fix, zoom/pan, export). This file
 * is only the registration/dispatch boundary so future sub-domains can be
 * added without touching this one.
 */
import CircuitsResultsPane from '../../../components/results/CircuitsResultsPane';

export default function AnalogSimView(props) {
  return <CircuitsResultsPane {...props} />;
}
