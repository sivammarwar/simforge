/**
 * GenericSubDomainView
 * ====================
 * Shared base view for sub-domains that don't need specialized rendering.
 * Renders: status notice, metrics table, assumptions, plain summary,
 * and a "Preview" badge for Tier 3 sub-domains.
 *
 * Sub-domain views can wrap this and add domain-specific visualizations
 * (waveforms, truth tables, bode plots, etc.) above or below.
 */
import React from 'react';
import { AlertTriangle, Info, Clock } from 'lucide-react';
import './subDomainViews.css';

export default function GenericSubDomainView({
  resultsData,
  isPreview = false,
  children = null,
  title = 'Results',
}) {
  if (!resultsData) {
    return (
      <div className="sub-domain-view empty">
        <p className="empty-hint">Run a simulation to see results.</p>
      </div>
    );
  }

  const status = resultsData.status;
  const metrics = resultsData.metrics || [];
  const assumptions = resultsData.assumptions || [];
  const unsupported = resultsData.unsupported_aspects || [];
  const summary = resultsData.plain_summary;

  const statusNotice = (() => {
    if (status === 'failed') return { icon: AlertTriangle, text: 'Analysis did not complete successfully.', cls: 'error' };
    if (status === 'unsupported') return { icon: AlertTriangle, text: 'Part of this analysis is outside current capabilities.', cls: 'warn' };
    if (status === 'out_of_scope') return { icon: Info, text: 'This question is outside this sub-domain.', cls: 'info' };
    return null;
  })();

  return (
    <div className="sub-domain-view">
      {isPreview && (
        <div className="preview-badge">
          <Clock size={14} />
          <span>Preview — limited validation</span>
        </div>
      )}

      {statusNotice && (
        <div className={`status-notice ${statusNotice.cls}`}>
          <statusNotice.icon size={16} />
          <span>{statusNotice.text}</span>
        </div>
      )}

      {children}

      {summary && (
        <div className="result-section">
          <h4>Summary</h4>
          <p>{summary}</p>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="result-section">
          <h4>Metrics</h4>
          <table className="metrics-table">
            <tbody>
              {metrics.map((m, i) => (
                <tr key={i}>
                  <td className="metric-name">{m.name}</td>
                  <td className="metric-value">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assumptions.length > 0 && (
        <div className="result-section">
          <h4>Assumptions</h4>
          <ul className="assumptions-list">
            {assumptions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="result-section unsupported">
          <h4>Unsupported Aspects</h4>
          <ul className="unsupported-list">
            {unsupported.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
