/**
 * NumericalView — renders numerical processing results (FFT, convolution, etc.)
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function NumericalView(props) {
  const { resultsData } = props;
  const computedValues = resultsData?.computed_values || [];
  const analysisType = resultsData?.analysis_type;

  return (
    <GenericSubDomainView {...props} title="Numerical Analysis">
      {analysisType && (
        <div className="result-section">
          <h4>Analysis Type</h4>
          <p><code>{analysisType}</code></p>
        </div>
      )}
      {computedValues.length > 0 && (
        <div className="result-section">
          <h4>Computed Values</h4>
          <table className="metrics-table">
            <tbody>
              {computedValues.map((v, i) => (
                <tr key={i}>
                  <td className="metric-name">{v.label}</td>
                  <td className="metric-value">{v.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GenericSubDomainView>
  );
}
