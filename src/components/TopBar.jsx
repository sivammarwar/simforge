import React, { useState } from 'react';
import { Bell, ChevronDown, ClipboardCheck } from 'lucide-react';

export default function TopBar({
  currentProject,
  projects,
  onSwitchProject,
  onNewProject,
  activeDomain,
  onSwitchDomain,
  selectedProvider,
  onSwitchProvider,
  onOpenValidation,
  onHome
}) {
  const [projOpen, setProjOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  
  const providers = [
    { name: 'Groq', detail: 'llama-3.1-70b', key: 'groq' },
    { name: 'Gemini', detail: 'gemini-3.5-flash', key: 'gemini' },
    { name: 'Cerebras', detail: 'gpt-oss-120b', key: 'cerebras' }
  ];
  const comingSoonProviders = [
    { name: 'Claude', detail: 'Coming soon' }
  ];

  return (
    <header className="topbar flex items-center justify-between">
      {/* Left side: Wordmark + Project switcher */}
      <div className="flex items-center gap-3">
        <button className="logo-text logo-home-btn" onClick={onHome} title="Go home and start a new domain session">
          SimForge
        </button>
        <span className="breadcrumb-divider">/</span>
        <div className="project-switcher-container">
          <button 
            className="project-breadcrumb flex items-center gap-1"
            onClick={() => setProjOpen(!projOpen)}
          >
            {currentProject.name}
            <ChevronDown size={12} className="text-secondary" />
          </button>
          
          {projOpen && (
            <>
              <div className="dropdown-overlay" onClick={() => setProjOpen(false)} />
              <div className="dropdown-menu">
                <div className="dropdown-header">SWITCH PROJECT</div>
                {projects.map(p => (
                  <button
                    key={p.id}
                    className={`dropdown-item ${p.id === currentProject.id ? 'active' : ''}`}
                    onClick={() => {
                      onSwitchProject(p.id);
                      setProjOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
                <div className="dropdown-divider" />
                <button
                  className="dropdown-item text-accent"
                  onClick={() => {
                    onNewProject();
                    setProjOpen(false);
                  }}
                >
                  + New Project
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Empty */}
      <div className="flex-1" />

      {/* Right side: Domain indicator, LLM Selector, Notifications, Avatar */}
      <div className="flex items-center gap-4">
        {/* Domain indicator badge */}
        <button className="validation-top-btn flex items-center gap-1" onClick={onOpenValidation}>
          <ClipboardCheck size={13} />
          Validation
        </button>

        <div className="domain-switcher-container">
          <button
            className="domain-badge flex items-center gap-1"
            onClick={() => setDomainOpen(!domainOpen)}
          >
            {activeDomain}
            <ChevronDown size={10} className="text-muted" />
          </button>
          
          {domainOpen && (
            <>
              <div className="dropdown-overlay" onClick={() => setDomainOpen(false)} />
              <div className="dropdown-menu dropdown-right">
                <div className="dropdown-header">SIMULATION DOMAIN</div>
                {['Default', 'Physics', 'Circuits', 'Structural', 'Fluids', 'Semiconductors', 'Aerospace', 'Thermal', 'Control', 'Materials', 'Power'].map(d => (
                  <button
                    key={d}
                    className={`dropdown-item ${d === activeDomain ? 'active' : ''}`}
                    onClick={() => {
                      onSwitchDomain(d);
                      setDomainOpen(false);
                      }}
                    >
                      {d} {d === 'Default' ? '(Auto Detect)' : d === 'Physics' ? '(Mechanics)' : d === 'Circuits' ? '(ngspice)' : d === 'Structural' ? '(CalculiX FEA)' : d === 'Fluids' ? '(OpenFOAM CFD)' : d === 'Semiconductors' ? '(SPICE TCAD)' : d === 'Aerospace' ? '(Aero 1D)' : d === 'Thermal' ? '(Thermal Budget)' : d === 'Control' ? '(PID)' : d === 'Materials' ? '(Fatigue)' : '(Power Balance)'}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* LLM Selector */}
        <div className="llm-switcher-container">
          <button 
            className="llm-selector flex items-center gap-1"
            onClick={() => setLlmOpen(!llmOpen)}
          >
            {providers.find(p => p.key === selectedProvider)?.name || selectedProvider} <ChevronDown size={12} className="text-secondary" />
          </button>
          
          {llmOpen && (
            <>
              <div className="dropdown-overlay" onClick={() => setLlmOpen(false)} />
              <div className="dropdown-menu dropdown-right">
                <div className="dropdown-header">AI PROVIDER</div>
                {providers.map(provider => (
                  <button
                    key={provider.key}
                    className={`dropdown-item ${selectedProvider === provider.key ? 'active' : ''}`}
                    onClick={() => {
                      onSwitchProvider(provider.key);
                      setLlmOpen(false);
                    }}
                  >
                    {provider.name} ({provider.detail})
                  </button>
                ))}
                <div className="dropdown-divider" />
                {comingSoonProviders.map(model => (
                  <button
                    key={model.name}
                    className="dropdown-item disabled-provider"
                    disabled
                    title={`${model.name} integration ${model.detail.toLowerCase()}`}
                  >
                    {model.name} ({model.detail})
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Notification Bell */}
        <button className="icon-btn relative-container">
          <Bell size={15} />
          <span className="notification-dot" />
        </button>

        {/* User avatar */}
        <div className="avatar-circle">
          <span>S</span>
        </div>
      </div>

      <style>{`
        .topbar {
          height: 36px;
          background-color: var(--bg-base);
          border-bottom: 1px solid var(--border);
          padding: 0 12px;
          user-select: none;
          z-index: 100;
          position: relative;
        }
        .logo-text {
          font-weight: 500;
          font-size: 13px;
          color: var(--text-primary);
          letter-spacing: 0.02em;
        }
        .logo-home-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .logo-home-btn:hover {
          color: var(--accent-primary);
        }
        .breadcrumb-divider {
          color: var(--text-muted);
          font-size: 13px;
        }
        .project-switcher-container, .llm-switcher-container, .domain-switcher-container {
          position: relative;
        }
        .project-breadcrumb {
          font-weight: 500;
          color: var(--text-secondary);
          font-size: 13px;
          background: none;
          border: none;
        }
        .project-breadcrumb:hover {
          color: var(--text-primary);
        }
        .domain-badge {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          color: var(--text-primary);
          font-weight: 500;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .validation-top-btn {
          height: 24px;
          padding: 0 8px;
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--text-secondary);
          background: var(--bg-surface);
          font-weight: 600;
        }
        .validation-top-btn:hover {
          color: var(--text-primary);
          border-color: var(--accent-primary);
        }
        .domain-badge:hover {
          border-color: var(--accent-primary);
        }
        .llm-selector {
          color: var(--text-secondary);
          font-size: 12px;
        }
        .llm-selector:hover {
          color: var(--text-primary);
        }
        .disabled-provider {
          opacity: 0.48;
          cursor: not-allowed;
        }
        .icon-btn {
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-btn:hover {
          color: var(--text-primary);
        }
        .relative-container {
          position: relative;
        }
        .notification-dot {
          position: absolute;
          top: 0px;
          right: 0px;
          width: 6px;
          height: 6px;
          background-color: var(--accent-secondary);
          border-radius: 50%;
        }
        .avatar-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: var(--accent-primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid var(--border);
        }
        
        /* Dropdowns */
        .dropdown-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
        }
        .dropdown-menu {
          position: absolute;
          top: 28px;
          left: 0;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          z-index: 1001;
          min-width: 160px;
          padding: 4px 0;
        }
        .dropdown-right {
          left: auto;
          right: 0;
        }
        .dropdown-header {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 6px 12px 2px;
          text-transform: uppercase;
        }
        .dropdown-item {
          width: 100%;
          text-align: left;
          padding: 6px 12px;
          font-size: 12px;
          color: var(--text-secondary);
          display: block;
        }
        .dropdown-item:hover {
          background-color: var(--bg-surface);
          color: var(--text-primary);
        }
        .dropdown-item.active {
          color: var(--accent-primary);
          font-weight: 500;
        }
        .dropdown-divider {
          height: 1px;
          background-color: var(--border);
          margin: 4px 0;
        }
      `}</style>
    </header>
  );
}
