/**
 * ControlSystemsView — renders control system analysis results.
 * Shows transfer function, stability, gain/phase margins, step response info.
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function ControlSystemsView(props) {
  const { resultsData } = props;
  const tf = resultsData?.transfer_function;
  const stability = resultsData?.stability;
  const gainMargin = resultsData?.gain_margin;
  const phaseMargin = resultsData?.phase_margin;
  const stepInfo = resultsData?.step_info;

  return (
    <GenericSubDomainView {...props} title="Control System Analysis">
      {tf && (
        <div className="result-section">
          <h4>Transfer Function</h4>
          <div className="latex-block"><code>G(s) = {tf}</code></div>
        </div>
      )}
      {stability && (
        <div className="result-section">
          <h4>Stability</h4>
          <p className={`stability-${stability}`}>
            <strong>System is {stability}</strong>
          </p>
        </div>
      )}
      {(gainMargin !== null && gainMargin !== undefined) && (
        <div className="result-section">
          <h4>Margins</h4>
          <p>Gain Margin: <strong>{gainMargin?.toFixed(2)} dB</strong></p>
          {(phaseMargin !== null && phaseMargin !== undefined) && (
            <p>Phase Margin: <strong>{phaseMargin?.toFixed(2)}°</strong></p>
          )}
        </div>
      )}
      {stepInfo && (
        <div className="result-section">
          <h4>Step Response Info</h4>
          <table className="metrics-table">
            <tbody>
              {Object.entries(stepInfo).map(([k, v]) => (
                <tr key={k}>
                  <td className="metric-name">{k}</td>
                  <td className="metric-value">{typeof v === 'number' ? v.toFixed(4) : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GenericSubDomainView>
  );
}
