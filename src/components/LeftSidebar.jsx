import React from 'react';
import { Clock3, Database, Settings, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export default function LeftSidebar({
  currentProject,
  projects,
  onSwitchProject,
  onNewProject,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenMemory,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse
}) {
  return (
    <aside className={`sidebar flex flex-col ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header flex items-center justify-between">
        {!isCollapsed ? (
          <div className="history-title flex items-center gap-2">
            <Clock3 size={14} className="text-accent" />
            <span>History</span>
          </div>
        ) : (
          <div className="collapsed-icon flex items-center justify-center flex-1">
            <Clock3 size={16} className="text-accent" />
          </div>
        )}

        <button className="collapse-btn" onClick={onToggleCollapse}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Session Title and Create Session CTA */}
      {!isCollapsed && (
        <div className="sessions-header flex items-center justify-between">
          <span>THIS SESSION</span>
          <button className="new-session-btn flex items-center gap-1" onClick={onNewSession}>
            <Plus size={12} /> New
          </button>
        </div>
      )}

      {/* Scrollable Sessions List */}
      <div className="sessions-list flex-1">
        {sessions && sessions.length > 0 ? (
          sessions.map(s => {
            const domainShort = 'CKT';
            
            return (
              <button
                key={s.id}
                className={`session-item flex flex-col ${s.id === activeSessionId ? 'active' : ''}`}
                onClick={() => onSelectSession(s.id)}
                title={s.title}
              >
                {!isCollapsed ? (
                  <>
                    <div className="flex justify-between items-center w-full">
                      <span className="session-time">{s.timestamp}</span>
                      <span className="session-domain-tag">{domainShort}</span>
                    </div>
                    <span className="session-title truncate">{s.title}</span>
                  </>
                ) : (
                  <div className="collapsed-session flex items-center justify-center">
                    <span className="session-bullet" />
                  </div>
                )}
              </button>
            );
          })
        ) : (
          !isCollapsed && <div className="empty-sessions text-muted">No chat history yet.</div>
        )}
      </div>

      {/* Bottom Actions: Memory & Settings */}
      <div className="sidebar-footer flex flex-col">
        <button className="footer-btn flex items-center gap-3" onClick={onOpenMemory}>
          <Database size={15} />
          {!isCollapsed && <span>Session Data</span>}
        </button>
        <button className="footer-btn flex items-center gap-3" onClick={onOpenSettings}>
          <Settings size={15} />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 220px;
          background-color: var(--bg-surface);
          border-right: 1px solid var(--border);
          transition: width 150ms ease-out;
          height: calc(100vh - 36px - 24px);
        }
        .sidebar.collapsed {
          width: 48px;
        }
        .sidebar-header {
          height: 38px;
          border-bottom: 1px solid var(--border);
          padding: 0 8px;
          position: relative;
        }
        .history-title {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          font-size: 13px;
          color: var(--text-primary);
        }
        .project-dropdown-wrapper {
          flex: 1;
          position: relative;
          min-width: 0;
        }
        .project-drop-btn {
          width: 100%;
          text-align: left;
          font-weight: 500;
          font-size: 12px;
          color: var(--text-primary);
          padding: 4px 6px;
          border-radius: 4px;
          background: transparent;
        }
        .project-drop-btn:hover {
          background-color: var(--bg-elevated);
        }
        .sidebar-dropdown-menu {
          position: absolute;
          top: 32px;
          left: 0;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          z-index: 1001;
          min-width: 180px;
          padding: 4px 0;
        }
        .collapse-btn {
          padding: 4px;
          color: var(--text-muted);
          border-radius: 4px;
        }
        .collapse-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-elevated);
        }
        
        .sessions-header {
          padding: 10px 12px 4px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .new-session-btn {
          color: var(--accent-primary);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 3px;
        }
        .new-session-btn:hover {
          background-color: var(--bg-elevated);
        }
        
        .sessions-list {
          overflow-y: auto;
          padding: 4px 0;
        }
        .session-item {
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          border-left: 2px solid transparent;
          transition: background-color 80ms;
        }
        .session-item:hover {
          background-color: rgba(28, 32, 38, 0.5);
        }
        .session-item.active {
          background-color: var(--bg-elevated);
          border-left-color: var(--accent-primary);
        }
        .session-time {
          font-size: 10px;
          color: var(--text-muted);
        }
        .session-domain-tag {
          font-size: 9px;
          color: var(--accent-primary);
          background-color: rgba(59, 130, 246, 0.1);
          padding: 1px 3px;
          border-radius: 2px;
          font-weight: 500;
        }
        .session-title {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
          font-weight: 400;
        }
        .session-item.active .session-title {
          color: var(--text-primary);
          font-weight: 500;
        }
        
        .collapsed-session {
          height: 16px;
        }
        .session-bullet {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--text-muted);
        }
        .session-item.active .session-bullet {
          background-color: var(--accent-primary);
        }
        
        .empty-sessions {
          padding: 12px;
          text-align: center;
          font-size: 11px;
        }
        
        .sidebar-footer {
          border-top: 1px solid var(--border);
          padding: 4px 0;
        }
        .footer-btn {
          width: 100%;
          text-align: left;
          padding: 8px 16px;
          color: var(--text-secondary);
          font-size: 12px;
        }
        .footer-btn:hover {
          background-color: var(--bg-elevated);
          color: var(--text-primary);
        }
        .sidebar.collapsed .footer-btn {
          padding: 8px 0;
          justify-content: center;
        }
      `}</style>
    </aside>
  );
}
