/**
 * PhysicalDesignView — renders physical design / parasitic results (Tier 3 Preview).
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function PhysicalDesignView(props) {
  const { resultsData } = props;
  const parasiticRc = resultsData?.parasitic_rc;
  const areaReport = resultsData?.area_report;

  return (
    <GenericSubDomainView {...props} isPreview title="Physical Design (Preview)">
      {parasiticRc && (
        <div className="result-section">
          <h4>Parasitic RC</h4>
          <table className="metrics-table">
            <tbody>
              {Object.entries(parasiticRc).map(([k, v]) => (
                <tr key={k}>
                  <td className="metric-name">{k}</td>
                  <td className="metric-value">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {areaReport && (
        <div className="result-section">
          <h4>Area Report</h4>
          <pre className="area-report">{areaReport}</pre>
        </div>
      )}
    </GenericSubDomainView>
  );
}
