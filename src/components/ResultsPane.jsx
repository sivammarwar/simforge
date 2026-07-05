import React from 'react';
import CircuitsResultsPane from './results/CircuitsResultsPane';

// Circuits is the only domain in SimForge.
export default function ResultsPane(props) {
  return <CircuitsResultsPane {...props} />;
}
