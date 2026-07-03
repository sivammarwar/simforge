import React from 'react';

export default function StatusBar({
  solverStatus, // e.g. { name: 'ngspice', state: 'idle' | 'running', detail: 'transient 500us', progress: 0-100 }
  activeDomain,
  memoryCount,
  onOpenShortcuts
}) {
  const isRunning = solverStatus?.state === 'running';
  const isError = solverStatus?.state === 'error';
  const progress = solverStatus?.progress || 0;
  
  let statusColor = 'var(--text-muted)';
  if (isRunning) statusColor = 'var(--accent-primary)';
  else if (isError) statusColor = 'var(--error)';
  else if (solverStatus?.state === 'idle') statusColor = 'var(--success)';

  const getStatusText = () => {
    if (isRunning) {
      return `● ${solverStatus.name} running — ${solverStatus.detail || 'processing...'}`;
    }
    if (isError) {
      return `● ${solverStatus.name} error`;
    }
    return `● ${solverStatus.name || 'solver'} idle`;
  };

  return (
    <footer className="statusbar flex items-center justify-between">
      {/* Left: Backend progress bar */}
      {isRunning && (
        <div className="flex items-center gap-2">
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="progress-text">{progress}%</span>
        </div>
      )}

      {/* Center: Domain tag */}
      <div className="status-center">
        <span>Active Domain: {activeDomain}</span>
      </div>

      {/* Right: Memory context + Keyboard hints */}
      <div className="flex items-center gap-4">
        <span className="memory-badge">
          {memoryCount} items in context
        </span>
        <button className="shortcut-hints" onClick={onOpenShortcuts}>
          ⌘Enter to run
        </button>
      </div>

      <style>{`
        .statusbar {
          height: 24px;
          background-color: var(--bg-base);
          border-top: 1px solid var(--border);
          padding: 0 12px;
          font-family: var(--font-ui);
          font-size: 11px;
          color: var(--text-muted);
          user-select: none;
          z-index: 100;
        }
        .status-indicator {
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          font-weight: 400;
        }
        .memory-badge {
          color: var(--text-secondary);
        }
        .shortcut-hints {
          font-size: 11px;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
        }
        .shortcut-hints:hover {
          color: var(--text-secondary);
        }
        .progress-container {
          width: 100px;
          height: 4px;
          background-color: var(--bg-tertiary);
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background-color: var(--accent-primary);
          transition: width 0.3s ease;
        }
        .progress-text {
          font-size: 10px;
          color: var(--accent-primary);
          min-width: 30px;
        }
      `}</style>
    </footer>
  );
}
