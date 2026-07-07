/**
 * SemiconductorDeviceView — renders semiconductor device physics results (Tier 3 Preview).
 */
import React from 'react';
import GenericSubDomainView from '../shared/GenericSubDomainView';

export default function SemiconductorDeviceView(props) {
  const { resultsData } = props;
  const ivCurve = resultsData?.iv_curve;
  const deviceParams = resultsData?.device_parameters;

  return (
    <GenericSubDomainView {...props} isPreview title="Semiconductor Device Physics (Preview)">
      {deviceParams && (
        <div className="result-section">
          <h4>Device Parameters</h4>
          <table className="metrics-table">
            <tbody>
              {Object.entries(deviceParams).map(([k, v]) => (
                <tr key={k}>
                  <td className="metric-name">{k}</td>
                  <td className="metric-value">{typeof v === 'number' ? v.toFixed(6) : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ivCurve && (
        <div className="result-section">
          <h4>I-V Characteristics</h4>
          <p>I-V curve visualization available in future update.</p>
        </div>
      )}
    </GenericSubDomainView>
  );
}
