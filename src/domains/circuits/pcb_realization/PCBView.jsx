/**
 * PCBView — renders PCB realization results.
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function PCBView(props) {
  const { resultsData } = props;
  const layerCount = resultsData?.layer_count;
  const traceImpedance = resultsData?.trace_impedance;

  return (
    <GenericSubDomainView {...props} title="PCB Realization">
      {layerCount > 0 && (
        <div className="result-section">
          <p>Layer count: <strong>{layerCount}</strong></p>
        </div>
      )}
      {traceImpedance !== null && traceImpedance !== undefined && (
        <div className="result-section">
          <p>Trace impedance: <strong>{traceImpedance?.toFixed(2)} Ω</strong></p>
        </div>
      )}
    </GenericSubDomainView>
  );
}
