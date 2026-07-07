/**
 * RFEMView — renders RF/EM analysis results (Tier 3 Preview).
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function RFEMView(props) {
  const { resultsData } = props;
  const sParams = resultsData?.s_parameters;
  const smithData = resultsData?.smith_chart_data;

  return (
    <GenericSubDomainView {...props} isPreview title="RF/EM Analysis (Preview)">
      {sParams && (
        <div className="result-section">
          <h4>S-Parameters</h4>
          <table className="metrics-table">
            <tbody>
              {Object.entries(sParams).map(([k, v]) => (
                <tr key={k}>
                  <td className="metric-name">{k}</td>
                  <td className="metric-value">{typeof v === 'number' ? v.toFixed(4) : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {smithData && (
        <div className="result-section">
          <h4>Smith Chart Data</h4>
          <p>Smith chart visualization available in future update.</p>
        </div>
      )}
    </GenericSubDomainView>
  );
}
