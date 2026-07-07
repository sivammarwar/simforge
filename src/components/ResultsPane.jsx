import React from 'react';
import ResultsDispatcher from '../domains/circuits/shared/ResultsDispatcher';

// Circuits is the only domain in SimForge. ResultsDispatcher inspects
// resultsData.sub_domain and routes to the correct sub-domain view
// component (analog_sim today; control_systems/pcb/etc. register
// themselves there in later phases without touching this file).
export default function ResultsPane(props) {
  return <ResultsDispatcher {...props} />;
}
