/**
 * FPGAView — renders FPGA realization results (Tier 3 Preview).
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function FPGAView(props) {
  const { resultsData } = props;
  const lutCount = resultsData?.lut_count;
  const timingReport = resultsData?.timing_report;

  return (
    <GenericSubDomainView {...props} isPreview title="FPGA Realization (Preview)">
      {lutCount > 0 && (
        <div className="result-section">
          <p>LUT count: <strong>{lutCount}</strong></p>
        </div>
      )}
      {timingReport && (
        <div className="result-section">
          <h4>Timing Report</h4>
          <pre className="timing-report">{timingReport}</pre>
        </div>
      )}
    </GenericSubDomainView>
  );
}
