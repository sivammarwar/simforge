import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, FileCheck2, Target, X } from 'lucide-react';
import {
  appSolverDomains,
  benchmarkPhases,
  benchmarkRubric,
  benchmarks,
  getDomainCoverage,
  successMetrics,
  summarizeBenchmarks
} from '../services/benchmarks';

export default function ValidationDashboard({ onClose }) {
  const [selectedDomain, setSelectedDomain] = useState('All');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(benchmarks[0].id);

  const summary = useMemo(() => summarizeBenchmarks(benchmarks), []);
  const coverage = useMemo(() => getDomainCoverage(benchmarks), []);
  const domains = ['All', ...summary.domains];
  const filteredBenchmarks = selectedDomain === 'All'
    ? benchmarks
    : benchmarks.filter(item => item.domain === selectedDomain);
  const selectedBenchmark = benchmarks.find(item => item.id === selectedBenchmarkId) || benchmarks[0];
  const implementedCoverage = coverage.filter(item => item.implemented).length;
  const coveragePercent = Math.round((implementedCoverage / coverage.length) * 100);
  const totalRubricPoints = benchmarkRubric.reduce((sum, section) => sum + section.points, 0);

  return (
    <div className="validation-shell flex flex-col">
      <div className="validation-header flex items-center justify-between">
        <div>
          <div className="validation-kicker">Testing & validation framework</div>
          <h1>Multi-domain benchmark suite</h1>
        </div>
        <button className="validation-close" onClick={onClose} title="Close validation dashboard">
          <X size={16} />
        </button>
      </div>

      <div className="validation-body flex-1">
        <section className="validation-summary-grid">
          <MetricCard icon={<FileCheck2 size={16} />} label="Benchmarks" value={summary.count} note="12 single-domain plus 1 coupled" />
          <MetricCard icon={<Target size={16} />} label="Benchmark domains" value={summary.singleDomainDomains.length} note={`${summary.integrationCount} multi-domain integration case`} />
          <MetricCard icon={<Clock size={16} />} label="Target run time" value={`${summary.totalMinutes} min`} note={`${summary.averageMinutes.toFixed(1)} min average`} />
          <MetricCard icon={<BarChart3 size={16} />} label="Solver coverage" value={`${coveragePercent}%`} note={`${implementedCoverage}/${coverage.length} benchmark-compatible domains implemented`} />
        </section>

        <section className="validation-section">
          <div className="section-heading flex items-center justify-between">
            <div>
              <h2>Benchmark Inventory</h2>
              <p>Prompts and expected evidence from the attached framework, grouped for fast execution.</p>
            </div>
            <div className="domain-filter flex items-center">
              {domains.map(domain => (
                <button
                  key={domain}
                  className={selectedDomain === domain ? 'active' : ''}
                  onClick={() => setSelectedDomain(domain)}
                >
                  {domain}
                </button>
              ))}
            </div>
          </div>

          <div className="benchmark-layout">
            <div className="benchmark-list">
              {filteredBenchmarks.map(item => (
                <button
                  key={item.id}
                  className={`benchmark-row ${selectedBenchmark.id === item.id ? 'active' : ''}`}
                  onClick={() => setSelectedBenchmarkId(item.id)}
                >
                  <span className="benchmark-id">{item.id}</span>
                  <span className="benchmark-main">
                    <span className="benchmark-title">{item.title}</span>
                    <span className="benchmark-meta">{item.domain} - target {'<='} {item.targetMinutes} min</span>
                  </span>
                </button>
              ))}
            </div>

            <article className="benchmark-detail">
              <div className="detail-topline flex items-center justify-between">
                <span className="benchmark-pill">{selectedBenchmark.domain}</span>
                <span className="benchmark-time"><Clock size={12} /> {'<='} {selectedBenchmark.targetMinutes} min</span>
              </div>
              <h3>{selectedBenchmark.id}. {selectedBenchmark.title}</h3>
              <p className="prompt-text">{selectedBenchmark.prompt}</p>

              <h4>Expected Evidence</h4>
              <div className="evidence-grid">
                {selectedBenchmark.expected.map(item => (
                  <div key={item} className="evidence-item">
                    <CheckCircle2 size={13} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="risk-callout flex">
                <AlertTriangle size={15} />
                <span>{selectedBenchmark.risks[0]}</span>
              </div>
            </article>
          </div>
        </section>

        <div className="validation-two-col">
          <section className="validation-section">
            <div className="section-heading">
              <h2>Scoring Rubric</h2>
              <p>{totalRubricPoints} points per benchmark, with correctness carrying the most weight.</p>
            </div>
            <div className="rubric-list">
              {benchmarkRubric.map(section => (
                <div key={section.name} className="rubric-card">
                  <div className="rubric-card-header flex items-center justify-between">
                    <span>{section.name}</span>
                    <strong>{section.points} pts</strong>
                  </div>
                  {section.checks.map(check => (
                    <div key={check} className="rubric-check">{check}</div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="validation-section">
            <div className="section-heading">
              <h2>Coverage Gaps</h2>
              <p>Coverage is measured against the benchmark prompts, not every solver category currently in the app.</p>
            </div>
            <div className="coverage-list">
              {coverage.map(item => (
                <div key={item.domain} className="coverage-row flex items-center justify-between">
                  <div>
                    <strong>{item.domain}</strong>
                    <span>{item.benchmarkCount} benchmarks - {item.note}</span>
                  </div>
                  <span className={item.implemented ? 'coverage-ok' : 'coverage-gap'}>
                    {item.status}
                  </span>
                </div>
              ))}
              <div className="coverage-note">
                Current app solver tabs: {appSolverDomains.join(', ')}. Fluids and Semiconductors are app capabilities, but they are not represented in this benchmark suite.
              </div>
              <div className="coverage-note">
                The attached success metrics also name Power Systems as a seventh domain, but no power-system benchmark prompt is included. Add at least two before release gating.
              </div>
            </div>
          </section>
        </div>

        <section className="validation-section">
          <div className="section-heading">
            <h2>Execution Plan</h2>
            <p>Use these stages to move from internal math checks to release confidence.</p>
          </div>
          <div className="phase-grid">
            {benchmarkPhases.map(item => (
              <div key={item.phase} className="phase-card">
                <span>{item.phase}</span>
                <h3>{item.name}</h3>
                <strong>{item.owner}</strong>
                <p>{item.goal}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="validation-section">
          <div className="section-heading">
            <h2>Success Metrics</h2>
            <p>Release gates from the attached framework.</p>
          </div>
          <div className="metrics-table">
            {successMetrics.map(item => (
              <div key={item.metric} className="metrics-row">
                <strong>{item.metric}</strong>
                <span>{item.target}</span>
                <em>{item.measurement}</em>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .validation-shell {
          position: fixed;
          inset: 36px 0 24px 0;
          z-index: 900;
          background: var(--bg-base);
          color: var(--text-primary);
        }
        .validation-header {
          min-height: 64px;
          padding: 12px 18px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }
        .validation-kicker {
          color: var(--accent-secondary);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .validation-header h1 {
          font-size: 18px;
          margin-top: 4px;
        }
        .validation-close {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .validation-close:hover {
          color: var(--text-primary);
          background: var(--bg-elevated);
        }
        .validation-body {
          height: 100%;
          overflow-y: auto;
          padding: 16px 18px 32px;
        }
        .validation-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .metric-card {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 12px;
          background: var(--bg-surface);
        }
        .metric-card svg {
          color: var(--accent-primary);
        }
        .metric-label {
          display: block;
          color: var(--text-secondary);
          font-size: 11px;
          margin-top: 8px;
        }
        .metric-value {
          display: block;
          font-size: 22px;
          font-weight: 700;
          margin-top: 2px;
        }
        .metric-note {
          color: var(--text-muted);
          font-size: 11px;
          margin-top: 4px;
        }
        .validation-section {
          margin-top: 14px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-surface);
          padding: 14px;
        }
        .section-heading {
          margin-bottom: 12px;
          gap: 12px;
        }
        .section-heading h2 {
          font-size: 14px;
        }
        .section-heading p {
          color: var(--text-secondary);
          font-size: 12px;
          margin-top: 3px;
        }
        .domain-filter {
          flex-wrap: wrap;
          gap: 4px;
          justify-content: flex-end;
        }
        .domain-filter button {
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 5px 8px;
          color: var(--text-secondary);
          background: var(--bg-base);
        }
        .domain-filter button.active,
        .domain-filter button:hover {
          color: var(--text-primary);
          border-color: var(--accent-primary);
        }
        .benchmark-layout {
          display: grid;
          grid-template-columns: minmax(280px, 0.85fr) minmax(360px, 1.15fr);
          gap: 12px;
          min-height: 390px;
        }
        .benchmark-list {
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: auto;
          background: var(--bg-base);
          max-height: 480px;
        }
        .benchmark-row {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 10px;
          border-bottom: 1px solid rgba(37, 42, 50, 0.72);
          text-align: left;
        }
        .benchmark-row:hover,
        .benchmark-row.active {
          background: var(--bg-elevated);
        }
        .benchmark-row.active {
          box-shadow: inset 2px 0 0 var(--accent-primary);
        }
        .benchmark-id {
          font-family: var(--font-mono);
          color: var(--accent-secondary);
          font-size: 11px;
          min-width: 24px;
        }
        .benchmark-main {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .benchmark-title {
          color: var(--text-primary);
          font-weight: 600;
        }
        .benchmark-meta {
          color: var(--text-muted);
          font-size: 11px;
        }
        .benchmark-detail {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 14px;
          background: var(--bg-base);
        }
        .detail-topline {
          margin-bottom: 10px;
        }
        .benchmark-pill,
        .benchmark-time {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 7px;
          color: var(--text-secondary);
          font-size: 11px;
        }
        .benchmark-detail h3 {
          font-size: 16px;
        }
        .prompt-text {
          margin-top: 10px;
          padding: 10px;
          border-left: 2px solid var(--accent-primary);
          color: var(--text-secondary);
          background: rgba(59, 130, 246, 0.06);
          line-height: 1.45;
        }
        .benchmark-detail h4 {
          margin-top: 14px;
          margin-bottom: 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .evidence-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .evidence-item {
          display: flex;
          gap: 7px;
          align-items: flex-start;
          color: var(--text-secondary);
          font-size: 12px;
          min-width: 0;
        }
        .evidence-item svg {
          color: var(--success);
          flex: 0 0 auto;
          margin-top: 1px;
        }
        .risk-callout {
          gap: 8px;
          margin-top: 14px;
          padding: 10px;
          border: 1px solid rgba(245, 158, 11, 0.28);
          border-radius: 6px;
          color: var(--text-secondary);
          background: rgba(245, 158, 11, 0.08);
          line-height: 1.4;
        }
        .risk-callout svg {
          color: var(--accent-secondary);
          flex: 0 0 auto;
        }
        .validation-two-col {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
          gap: 14px;
        }
        .rubric-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .rubric-card {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 10px;
          background: var(--bg-base);
        }
        .rubric-card-header {
          margin-bottom: 8px;
          color: var(--text-primary);
          font-weight: 700;
        }
        .rubric-card-header strong {
          color: var(--accent-secondary);
          font-size: 12px;
        }
        .rubric-check {
          color: var(--text-secondary);
          font-size: 12px;
          padding: 5px 0;
          border-top: 1px solid rgba(37, 42, 50, 0.65);
        }
        .coverage-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .coverage-row {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 9px;
          background: var(--bg-base);
        }
        .coverage-row div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .coverage-row span {
          color: var(--text-muted);
          font-size: 11px;
        }
        .coverage-ok,
        .coverage-gap {
          border-radius: 4px;
          padding: 4px 7px;
          font-weight: 700;
        }
        .coverage-ok {
          color: var(--success) !important;
          background: rgba(34, 197, 94, 0.1);
        }
        .coverage-gap {
          color: var(--accent-secondary) !important;
          background: rgba(245, 158, 11, 0.1);
        }
        .coverage-note {
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
          padding: 10px;
          border: 1px dashed var(--border);
          border-radius: 6px;
        }
        .phase-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .phase-card {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 10px;
          background: var(--bg-base);
        }
        .phase-card span {
          color: var(--accent-secondary);
          font-size: 11px;
          font-weight: 700;
        }
        .phase-card h3 {
          margin-top: 6px;
          font-size: 13px;
        }
        .phase-card strong {
          display: block;
          margin-top: 7px;
          color: var(--text-muted);
          font-size: 11px;
        }
        .phase-card p {
          margin-top: 7px;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }
        .metrics-table {
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .metrics-row {
          display: grid;
          grid-template-columns: 180px 1fr 260px;
          gap: 12px;
          padding: 10px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-base);
        }
        .metrics-row:last-child {
          border-bottom: 0;
        }
        .metrics-row span,
        .metrics-row em {
          color: var(--text-secondary);
          font-style: normal;
        }
        @media (max-width: 1200px) {
          .validation-summary-grid,
          .phase-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .benchmark-layout,
          .validation-two-col {
            grid-template-columns: 1fr;
          }
          .metrics-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ icon, label, value, note }) {
  return (
    <div className="metric-card">
      {icon}
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      <div className="metric-note">{note}</div>
    </div>
  );
}
