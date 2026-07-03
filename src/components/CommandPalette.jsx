import React, { useState, useEffect, useRef } from 'react';
import { Search, Command, ArrowRight, Play, Sparkles, Folder, Settings, Database } from 'lucide-react';

export default function CommandPalette({
  isOpen,
  onClose,
  projects,
  sessions,
  onSwitchProject,
  onSelectSession,
  onRunSimulation,
  onOpenTrizWizard,
  onOpenSettings,
  onOpenMemory
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Command list mappings
  const staticCommands = [
    { id: 'cmd-run', title: 'Run Simulation Solver', category: 'Actions', icon: <Play size={14} className="text-success" />, action: onRunSimulation },
    { id: 'cmd-triz', title: 'Open TRIZ Contradiction Flow', category: 'Actions', icon: <Sparkles size={14} className="text-amber" />, action: onOpenTrizWizard },
    { id: 'cmd-memory', title: 'Browse Project Memory Panel', category: 'Navigation', icon: <Database size={14} className="text-accent" />, action: onOpenMemory },
    { id: 'cmd-settings', title: 'Open IDE Settings Console', category: 'Navigation', icon: <Settings size={14} />, action: onOpenSettings }
  ];

  const getFilteredItems = () => {
    const q = query.toLowerCase().trim();
    
    const matchedCommands = staticCommands.filter(c => c.title.toLowerCase().includes(q));
    
    const matchedProjects = projects
      .filter(p => p.name.toLowerCase().includes(q))
      .map(p => ({
        id: `proj-${p.id}`,
        title: `Switch Project: ${p.name}`,
        category: 'Projects',
        icon: <Folder size={14} className="text-accent" />,
        action: () => onSwitchProject(p.id)
      }));

    const matchedSessions = sessions
      .filter(s => s.title.toLowerCase().includes(q))
      .map(s => ({
        id: `sess-${s.id}`,
        title: `Open Session: ${s.title}`,
        category: 'Sessions',
        icon: <Command size={14} className="text-muted" />,
        action: () => onSelectSession(s.id)
      }));

    return [...matchedCommands, ...matchedProjects, ...matchedSessions];
  };

  const filteredItems = getFilteredItems();

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(0);
    setQuery('');
    
    // Focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems]);

  if (!isOpen) return null;

  return (
    <div className="palette-wrapper">
      <div className="palette-scrim" onClick={onClose} />
      
      <div className="palette-modal flex flex-col">
        {/* Input search */}
        <div className="palette-search-row flex items-center gap-2">
          <Search size={16} className="text-secondary" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input flex-1"
            placeholder="Type a command or search sessions..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="palette-hint-esc">ESC</kbd>
        </div>

        {/* Results items */}
        <div className="palette-results flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="empty-results text-muted">No commands or sessions matched.</div>
          ) : (
            // Group by category
            Object.entries(
              filteredItems.reduce((acc, item) => {
                if (!acc[item.category]) acc[item.category] = [];
                acc[item.category].push(item);
                return acc;
              }, {})
            ).map(([category, items]) => (
              <div key={category} className="category-group">
                <div className="category-header">{category}</div>
                
                {items.map(item => {
                  // Find global index in flat list
                  const globalIdx = filteredItems.findIndex(f => f.id === item.id);
                  const isSelected = globalIdx === selectedIndex;
                  
                  return (
                    <button
                      key={item.id}
                      className={`result-item flex items-center justify-between ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        item.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span className="truncate">{item.title}</span>
                      </div>
                      {isSelected && (
                        <span className="run-now flex items-center gap-1 text-[10px] text-accent">
                          Select <ArrowRight size={10} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .palette-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 250;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 100px;
        }
        .palette-scrim {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(9, 11, 14, 0.7);
        }
        .palette-modal {
          position: relative;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 6px;
          width: 500px;
          max-height: 320px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8);
          overflow: hidden;
          z-index: 251;
        }
        .palette-search-row {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          background-color: var(--bg-surface);
        }
        .palette-input {
          background: transparent;
          border: none;
          padding: 0;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
        }
        .palette-hint-esc {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 8px;
          font-family: var(--font-mono);
          color: var(--text-muted);
        }
        
        .palette-results {
          padding: 6px 0;
        }
        .empty-results {
          padding: 16px;
          text-align: center;
          font-size: 12px;
        }
        
        .category-group {
          margin-bottom: 8px;
        }
        .category-header {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 4px 14px 2px;
          text-transform: uppercase;
        }
        
        .result-item {
          width: 100%;
          text-align: left;
          padding: 6px 14px;
          font-size: 12px;
          color: var(--text-secondary);
          display: flex;
        }
        .result-item.selected {
          background-color: var(--bg-surface);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
