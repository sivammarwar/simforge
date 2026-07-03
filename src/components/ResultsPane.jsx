import React from 'react';
import CircuitsResultsPane from './results/CircuitsResultsPane';
import LegacyResultsPane from './results/LegacyResultsPane';

// Add one line per domain as you migrate it off LegacyResultsPane.
// e.g. import StructuralResultsPane from './results/StructuralResultsPane';
const DOMAIN_PANES = {
  Circuits: CircuitsResultsPane,
  // Structural: StructuralResultsPane,
};

export default function ResultsPane(props) {
  console.log('[ResultsPane Dispatcher] activeDomain:', props.activeDomain, 'DOMAIN_PANES keys:', Object.keys(DOMAIN_PANES));
  const Pane = DOMAIN_PANES[props.activeDomain] || LegacyResultsPane;
  console.log('[ResultsPane Dispatcher] Selected Pane:', Pane === CircuitsResultsPane ? 'CircuitsResultsPane' : 'LegacyResultsPane');
  return <Pane {...props} />;
}
