import React, { useState } from 'react';
import { Search, X, Calendar, Database, Sparkles, Sliders, CheckCircle } from 'lucide-react';

export default function MemoryOverlay({
  isOpen,
  onClose,
  events,
  onLoadModelSnapshot
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All'); // 'All' | 'model_confirmed' | 'solver_run' | 'triz_triggered' | 'user_preference_observed'

  if (!isOpen) return null;

  const filteredEvents = events.filter(evt => {
    // Filter by type
    if (activeFilter !== 'All' && evt.type !== activeFilter) return false;
    
    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSummary = evt.summary.toLowerCase().includes(q);
      const matchType = evt.type.toLowerCase().includes(q);
      return matchSummary || matchType;
    }
    return true;
  });

  const getEventIcon = (type) => {
    switch (type) {
      case 'model_confirmed':
        return <CheckCircle size={13} className="text-success" />;
      case 'solver_run':
        return <Database size={13} className="text-accent" />;
      case 'triz_triggered':
        return <Sparkles size={13} className="text-amber" />;
      case 'user_preference_observed':
        return <Sliders size={13} style={{ color: '#06B6D4' }} />;
      default:
        return <Calendar size={13} />;
    }
  };

  const getFilterLabel = (type) => {
    switch (type) {
      case 'model_confirmed': return 'Models';
      case 'solver_run': return 'Results';
      case 'triz_triggered': return 'TRIZ';
      case 'user_preference_observed': return 'Preferences';
      default: return type;
    }
  };

  return (
    <div className="memory-panel-wrapper">
      {/* Scrim */}
      <div className="memory-scrim" onClick={onClose} />
      
      {/* Drawer */}
      <div className="memory-drawer flex flex-col">
        {/* Header */}
        <div className="drawer-header flex items-center justify-between">
          <span className="drawer-title flex items-center gap-2">
            <Database size={14} className="text-accent" />
            Project Memory Context
          </span>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="search-box-wrapper flex items-center gap-2">
          <Search size={14} className="text-muted" />
          <input
            type="text"
            className="search-input flex-1"
            placeholder="Search memory events, values, runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="filters-row flex gap-2">
          {['All', 'model_confirmed', 'solver_run', 'triz_triggered', 'user_preference_observed'].map(f => (
            <button
              key={f}
              className={`filter-tag-btn ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f === 'All' ? 'All' : getFilterLabel(f)}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="events-scroll-list flex-1 overflow-y-auto mt-3 pr-1">
          {filteredEvents.length === 0 ? (
            <div className="empty-events text-muted text-center mt-12">
              No matching memory events found.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredEvents.map(evt => (
                <div key={evt.id} className="event-card flex gap-3">
                  <div className="event-icon-circle flex items-center justify-center">
                    {getEventIcon(evt.type)}
                  </div>
                  
                  <div className="event-details flex-1">
                    <div className="flex justify-between items-center w-full">
                      <span className="event-type-name">{getFilterLabel(evt.type)}</span>
                      <span className="event-card-time">{evt.timestamp}</span>
                    </div>
                    <p className="event-summary mt-1 text-primary">{evt.summary}</p>
                    
                    {evt.details && (
                      <div className="event-meta-block mt-2 font-mono">
                        {Object.entries(evt.details).map(([k, v]) => (
                          <span key={k} className="meta-tag">{k}: {v}</span>
                        ))}
                      </div>
                    )}

                    {evt.type === 'model_confirmed' && evt.details && (
                      <button 
                        className="load-snapshot-btn mt-3"
                        onClick={() => {
                          onLoadModelSnapshot(evt.details);
                          onClose();
                        }}
                      >
                        Restore Snapshot
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .memory-panel-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 150;
          display: flex;
          justify-content: flex-end;
        }
        .memory-scrim {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(13, 15, 18, 0.6);
        }
        .memory-drawer {
          position: relative;
          width: 400px;
          height: 100%;
          background-color: var(--bg-elevated);
          border-left: 1px solid var(--border);
          box-shadow: -6px 0 24px rgba(0, 0, 0, 0.7);
          padding: 16px;
        }
        .drawer-header {
          margin-bottom: 12px;
        }
        .drawer-title {
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-primary);
        }
        .search-box-wrapper {
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 6px 10px;
          margin-bottom: 10px;
        }
        .search-input {
          background: transparent;
          border: none;
          padding: 0;
          font-size: 12px;
          color: var(--text-primary);
        }
        
        .filters-row {
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
          margin-bottom: 8px;
          overflow-x: auto;
        }
        .filter-tag-btn {
          border: 1px solid var(--border);
          color: var(--text-secondary);
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 10px;
          white-space: nowrap;
        }
        .filter-tag-btn.active {
          background-color: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
        }
        .filter-tag-btn:hover:not(.active) {
          border-color: var(--text-secondary);
        }
        
        .event-card {
          border: 1px solid var(--border);
          background-color: var(--bg-surface);
          border-radius: 4px;
          padding: 12px;
        }
        .event-icon-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          flex-shrink: 0;
        }
        .event-type-name {
          font-size: 9px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .event-card-time {
          font-size: 10px;
          color: var(--text-muted);
        }
        .event-summary {
          font-size: 12px;
          line-height: 1.4;
        }
        .event-meta-block {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .meta-tag {
          font-size: 10px;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          padding: 2px 6px;
          border-radius: 3px;
          color: var(--text-secondary);
        }
        .load-snapshot-btn {
          background-color: transparent;
          border: 1px solid var(--accent-primary);
          color: var(--accent-primary);
          font-weight: 500;
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .load-snapshot-btn:hover {
          background-color: var(--accent-primary);
          color: white;
        }
      `}</style>
    </div>
  );
}
