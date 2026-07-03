import React, { useState, useEffect } from 'react';
import { X, Key, Shield, HelpCircle, HardDrive, Settings, FileText, Check } from 'lucide-react';
import { configureAIKeys, getAIKeys } from '../services/aiLayers';

export default function SettingsModal({
  isOpen,
  onClose,
  onExportAuditLogs
}) {
  const [activeTab, setActiveTab] = useState('LLM Backends');
  const [privateMode, setPrivateMode] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState([
    { id: 'key-1', name: 'Dev-Key-Primary', created: '2026-06-01', count: 142 },
    { id: 'key-2', name: 'Production-Solver', created: '2026-06-15', count: 875 }
  ]);

  // Load saved API keys on mount (from localStorage or environment variables)
  useEffect(() => {
    const keys = getAIKeys();
    // Try localStorage first
    if (keys.claude) setClaudeApiKey(keys.claude);
    if (keys.groq) setGroqApiKey(keys.groq);
    
    // If not in localStorage, try environment variables (Vite requires VITE_ prefix)
    if (!keys.groq && import.meta.env.VITE_GROQ_API_KEY) {
      setGroqApiKey(import.meta.env.VITE_GROQ_API_KEY);
    }
    if (!keys.claude && import.meta.env.VITE_CLAUDE_API_KEY) {
      setClaudeApiKey(import.meta.env.VITE_CLAUDE_API_KEY);
    }
  }, []);

  // Save API keys when they change
  const handleSaveClaudeKey = () => {
    configureAIKeys({ claude: claudeApiKey, groq: groqApiKey });
  };

  const handleSaveGroqKey = () => {
    configureAIKeys({ claude: claudeApiKey, groq: groqApiKey });
  };

  if (!isOpen) return null;

  const handleCreateApiKey = () => {
    const name = prompt("Enter key name:");
    if (!name) return;
    setApiKeys([
      ...apiKeys,
      {
        id: `key-${Date.now()}`,
        name,
        created: new Date().toISOString().split('T')[0],
        count: 0
      }
    ]);
  };

  const handleRevokeKey = (id) => {
    setApiKeys(apiKeys.filter(k => k.id !== id));
  };

  return (
    <div className="modal-wrapper">
      <div className="modal-scrim" onClick={onClose} />
      
      <div className="settings-modal flex flex-col">
        {/* Header */}
        <div className="modal-header flex items-center justify-between">
          <span className="modal-title flex items-center gap-2">
            <Settings size={14} className="text-secondary" />
            SimForge Settings Console
          </span>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Layout: Sidebar & Content Panel */}
        <div className="modal-body flex-1 flex min-h-0">
          {/* Settings Tabs Sidebar */}
          <div className="settings-sidebar flex flex-col">
            {['LLM Backends', 'Domain Plugins', 'Connectors', 'Privacy & Audit', 'Shortcuts'].map(tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Settings Content */}
          <div className="settings-content flex-1 overflow-y-auto p-4">
            
            {/* TABS 1: LLM BACKENDS */}
            {activeTab === 'LLM Backends' && (
              <div className="flex flex-col gap-4">
                <h3 className="section-title">AI Layers Configuration</h3>
                <p className="text-secondary text-[11px]">Configure API keys for Claude and Groq to enable AI validation layers (question parsing, model alignment, physical plausibility, output sanity, explanation engine).</p>
                
                <div className="divider-line my-2" />
                
                {/* Claude API Key */}
                <div className="form-group flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label>Claude API Key (Anthropic)</label>
                    {claudeApiKey && <Check size={12} className="text-success" />}
                  </div>
                  <input 
                    type="password" 
                    value={claudeApiKey}
                    onChange={(e) => setClaudeApiKey(e.target.value)}
                    placeholder="sk-ant-..." 
                    onBlur={handleSaveClaudeKey}
                  />
                  <span className="field-hint">Used for: Model-Question Alignment, Physical Plausibility, Solver Output Sanity, Explanation Engine</span>
                </div>
                
                {/* Groq API Key */}
                <div className="form-group flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label>Groq API Key</label>
                    {groqApiKey && <Check size={12} className="text-success" />}
                  </div>
                  <input 
                    type="password" 
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                    placeholder="gsk_..." 
                    onBlur={handleSaveGroqKey}
                  />
                  <span className="field-hint">Used for: Question Parser & Semantifier (fast inference)</span>
                </div>

                <div className="divider-line my-2" />

                <h3 className="section-title">LLM Backend Switcher</h3>
                <div className="form-group flex flex-col gap-1">
                  <label>Primary Language Model</label>
                  <select defaultValue="Claude 3.5 Sonnet">
                    <option>Claude 3.5 Sonnet (Default)</option>
                    <option>GPT-4o (OpenAI)</option>
                    <option>Gemini 1.5 Pro (Google)</option>
                    <option>Local Llama 3 (Ollama)</option>
                  </select>
                </div>
                <div className="form-group flex flex-col gap-1">
                  <label>API Endpoint Override</label>
                  <input type="text" placeholder="https://api.anthropic.com/v1" />
                </div>
              </div>
            )}

            {/* TABS 2: DOMAIN PLUGINS */}
            {activeTab === 'Domain Plugins' && (
              <div className="flex flex-col gap-4">
                <h3 className="section-title">Solver Settings</h3>
                <div className="form-group flex flex-col gap-1">
                  <label>Circuit Solver (ngspice) Timeout</label>
                  <input type="number" defaultValue={120} />
                  <span className="field-hint">Maximum CPU seconds allocated per transient run.</span>
                </div>
                <div className="form-group flex flex-col gap-1">
                  <label>FEA Solver (CalculiX) Mesh Tolerance</label>
                  <select defaultValue="Coarse">
                    <option>Fine (Higher computation)</option>
                    <option>Medium</option>
                    <option>Coarse (Optimal speed)</option>
                  </select>
                </div>
                <div className="form-group flex flex-col gap-1">
                  <label>CFD Max Convergence Iterations</label>
                  <input type="number" defaultValue={200} />
                </div>
              </div>
            )}

            {/* TABS 3: CONNECTORS */}
            {activeTab === 'Connectors' && (
              <div className="flex flex-col gap-4">
                <h3 className="section-title">Connected Databases</h3>
                <p className="text-secondary text-[12px]">Automatically query parameters when named parts or alloys are encountered in chat.</p>
                
                <div className="connector-grid mt-2">
                  <div className="connector-card flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-primary">TDK Component Library</h4>
                      <p className="text-muted text-[10px]">Inductors/Capacitors data sheet lookups</p>
                    </div>
                    <span className="connector-badge-active">CONNECTED</span>
                  </div>

                  <div className="connector-card flex items-center justify-between mt-2">
                    <div>
                      <h4 className="font-semibold text-primary">ASM Materials Registry</h4>
                      <p className="text-muted text-[10px]">Metal, alloy elastic Young's modulus constants</p>
                    </div>
                    <span className="connector-badge-active">CONNECTED</span>
                  </div>

                  <div className="connector-card flex items-center justify-between mt-2">
                    <div>
                      <h4 className="font-semibold text-primary">NIST Fluids NIST-10</h4>
                      <p className="text-muted text-[10px]">Temperature density/viscosity database lookup</p>
                    </div>
                    <span className="connector-badge-active">CONNECTED</span>
                  </div>
                </div>
              </div>
            )}

            {/* TABS 4: PRIVACY & AUDIT */}
            {activeTab === 'Privacy & Audit' && (
              <div className="flex flex-col gap-4">
                <h3 className="section-title">Enterprise Data Residency</h3>
                
                <div className="toggle-group flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-primary">External Servers Caching</h4>
                    <p className="text-muted text-[11px]">Send model schemas to OpenAI/Anthropic servers (Disabled by default for enterprise).</p>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={!privateMode} 
                    onChange={() => setPrivateMode(!privateMode)} 
                    style={{ width: '16px', height: '16px' }}
                  />
                </div>

                <div className="divider-line my-2" />

                <div className="audit-section flex flex-col gap-2">
                  <h4 className="font-semibold text-primary">Security Audit Log</h4>
                  <p className="text-secondary text-[11px]">CSV export of all model compilations, netlists, and solver runs.</p>
                  <button className="audit-download-btn flex items-center gap-1 w-max" onClick={onExportAuditLogs}>
                    <FileText size={12} /> Export Audit Log (.csv)
                  </button>
                </div>

                <div className="divider-line my-2" />

                {/* API Developer Key Management */}
                <div className="api-keys-wrapper flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-primary">Developer API Keys</h4>
                    <button className="add-key-btn" onClick={handleCreateApiKey}>+ Create key</button>
                  </div>
                  
                  <div className="keys-table border border-[#252A32] rounded overflow-hidden">
                    <table className="keys-grid-table w-full">
                      <thead>
                        <tr>
                          <th>Key Name</th>
                          <th>Created</th>
                          <th>Runs</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiKeys.map(k => (
                          <tr key={k.id}>
                            <td>{k.name}</td>
                            <td>{k.created}</td>
                            <td>{k.count}</td>
                            <td>
                              <button className="text-error font-semibold" onClick={() => handleRevokeKey(k.id)}>Revoke</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TABS 5: SHORTCUTS */}
            {activeTab === 'Shortcuts' && (
              <div className="flex flex-col gap-4">
                <h3 className="section-title">Keyboard Shortcuts</h3>
                
                <div className="shortcuts-table border border-[#252A32] rounded">
                  <div className="shortcut-row flex justify-between">
                    <span>Run Simulation</span>
                    <kbd>⌘ + Enter</kbd>
                  </div>
                  <div className="shortcut-row flex justify-between">
                    <span>Focus Chat Input</span>
                    <kbd>⌘ + E</kbd>
                  </div>
                  <div className="shortcut-row flex justify-between">
                    <span>Project Memory Search</span>
                    <kbd>Disabled</kbd>
                  </div>
                  <div className="shortcut-row flex justify-between">
                    <span>Cycle Domains</span>
                    <kbd>⌘ + .</kbd>
                  </div>
                  <div className="shortcut-row flex justify-between">
                    <span>Collapse/Expand Sidebar</span>
                    <kbd>⌘ + /</kbd>
                  </div>
                  <div className="shortcut-row flex justify-between">
                    <span>Undo Model Field Edit</span>
                    <kbd>⌘ + Z</kbd>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      <style>{`
        .modal-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-scrim {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(9, 11, 14, 0.7);
        }
        .settings-modal {
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          width: 600px;
          height: 420px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
          overflow: hidden;
          z-index: 201;
        }
        .modal-header {
          height: 38px;
          border-bottom: 1px solid var(--border);
          padding: 0 14px;
          background-color: var(--bg-elevated);
        }
        .modal-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        
        .settings-sidebar {
          width: 140px;
          border-right: 1px solid var(--border);
          background-color: var(--bg-elevated);
          padding: 8px 0;
        }
        .tab-btn {
          width: 100%;
          text-align: left;
          padding: 8px 14px;
          color: var(--text-secondary);
          font-size: 12px;
        }
        .tab-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-surface);
        }
        .tab-btn.active {
          color: var(--accent-primary);
          background-color: var(--bg-surface);
          font-weight: 500;
        }
        
        .section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .form-group label {
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .form-group input, .form-group select {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          height: 28px;
          padding: 0 8px;
          font-size: 12px;
        }
        .field-hint {
          font-size: 10px;
          color: var(--text-muted);
        }
        
        .divider-line {
          border-top: 1px solid var(--border);
        }
        
        .text-success {
          color: var(--success);
        }
        
        .connector-card {
          border: 1px solid var(--border);
          padding: 8px 12px;
          background-color: var(--bg-elevated);
          border-radius: 4px;
        }
        .connector-badge-active {
          font-size: 9px;
          font-weight: 600;
          color: var(--success);
          background-color: rgba(34, 197, 94, 0.1);
          padding: 2px 6px;
          border-radius: 3px;
        }
        
        .audit-download-btn {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
        }
        .audit-download-btn:hover {
          border-color: var(--text-secondary);
        }
        .add-key-btn {
          color: var(--accent-primary);
          font-weight: 500;
        }
        
        .keys-grid-table {
          font-size: 11px;
          border-collapse: collapse;
        }
        .keys-grid-table th {
          background-color: var(--bg-elevated);
          text-align: left;
          padding: 6px;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .keys-grid-table td {
          padding: 6px;
          border-bottom: 1px solid var(--border);
          color: var(--text-secondary);
        }
        
        /* Shortcuts style */
        .shortcuts-table {
          display: flex;
          flex-direction: column;
        }
        .shortcut-row {
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
        }
        .shortcut-row:last-child {
          border-bottom: none;
        }
        kbd {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 2px 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  );
}
