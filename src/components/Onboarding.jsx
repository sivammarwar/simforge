import React, { useState } from 'react';
import { Cpu, Activity, MoveRight, Layers, Zap, Rocket, Flame, SlidersHorizontal, FlaskConical, BatteryCharging, Atom } from 'lucide-react';

export default function Onboarding({
  onCompleteOnboarding
}) {
  const [step, setStep] = useState(1);
  const [selectedDomain, setSelectedDomain] = useState('Circuits');
  const [promptText, setPromptText] = useState('');

  const domains = [
    {
      id: 'Physics',
      title: 'Physics Mechanics',
      desc: 'Solve 11th/12th mechanics problems: pulleys, blocks, inclines, springs, SHM, motion, forces, energy, and FBDs.',
      icon: <Atom size={24} className="text-accent" />,
      defaultPrompt: 'A 2 kg block on a rough horizontal table has μ=0.3 and is connected over a frictionless pulley to a 3 kg hanging block attached to a spring with k=100 N/m. It is released from rest when the spring is unstretched. Find maximum extension, maximum velocity, period, and energy.'
    },
    {
      id: 'Circuits',
      title: 'Circuits & Electronics',
      desc: 'Simulate switching power supplies, buck/boost converters, filter attenuation, and time/frequency transient waveforms.',
      icon: <Cpu size={24} className="text-accent" />,
      defaultPrompt: 'I have a 5V buck converter with a 22µH inductor feeding a 2A load — what does the output ripple look like?'
    },
    {
      id: 'Structural',
      title: 'Structural & Mechanical FEA',
      desc: 'Calculate static mechanical beam deflections, boundary load distributions, material safety factors, and von Mises stress contours.',
      icon: <Layers size={24} className="text-accent" />,
      defaultPrompt: 'I have a steel cantilever beam 500mm long, 30mm wide, 10mm tall, clamped at one end with a 500N point load at the tip — what\'s the maximum stress?'
    },
    {
      id: 'Fluids',
      title: 'Fluid Dynamics CFD',
      desc: 'Model steady-state RANS boundary velocity shears, internal pipe duct geometries, pressure drops, and streamline particles.',
      icon: <Activity size={24} className="text-accent" />,
      defaultPrompt: 'I have air flowing at 2 m/s through a 50mm diameter, 500mm long straight duct — what does the velocity profile look like?'
    },
    {
      id: 'Semiconductors',
      title: 'Semiconductor TCAD',
      desc: 'Model MOSFET transistor physics, drift-diffusion currents, gate oxide thickness scaling, and depletion inversion channel widths.',
      icon: <Zap size={24} className="text-accent" />,
      defaultPrompt: 'Model an N-channel MOSFET transistor with 180nm gate length and 2.0µm width at 1.8V gate bias — sweep drain voltage.'
    },
    {
      id: 'Aerospace',
      title: 'Aerospace & Aerodynamics',
      desc: 'Solve wings, airfoils, induced drag, converging-diverging nozzles, Mach numbers, pressure profiles, and thrust loads.',
      icon: <Rocket size={24} className="text-accent" />,
      defaultPrompt: 'Design a rectangular wing for a small UAV with 2m wingspan and 0.3m chord flying at 25 m/s at sea level using a NACA 4412 airfoil at 6 degrees angle of attack.'
    },
    {
      id: 'Thermal',
      title: 'Thermal & Heat Transfer',
      desc: 'Size heat sinks, thermal resistance paths, temperature margins, convection requirements, and first-pass PCB thermal paths.',
      icon: <Flame size={24} className="text-accent" />,
      defaultPrompt: 'Size a heat sink for a 25W IC with maximum junction temperature 75C and ambient temperature 25C. Assume Rjc=1 K/W and interface resistance 0.5 K/W.'
    },
    {
      id: 'Control',
      title: 'Control Systems',
      desc: 'Tune PID controllers, estimate closed-loop response, settling time, overshoot, damping ratio, and stability margins.',
      icon: <SlidersHorizontal size={24} className="text-accent" />,
      defaultPrompt: 'Tune a PID controller for G(s)=10/(s*(s+2)) with settling time below 1s and overshoot below 15%.'
    },
    {
      id: 'Materials',
      title: 'Materials Engineering',
      desc: 'Check fatigue, compare candidate materials, compute safety factors, and screen yield/ultimate/material trade-offs.',
      icon: <FlaskConical size={24} className="text-accent" />,
      defaultPrompt: 'A steel part cycles between 20 MPa and 220 MPa for 1e6 cycles. Ultimate strength is 550 MPa and endurance strength is 275 MPa. Check fatigue safety.'
    },
    {
      id: 'Power',
      title: 'Power & Energy Systems',
      desc: 'Calculate transformer power balance, load current, losses, efficiency, energy use, and practical electrical sizing.',
      icon: <BatteryCharging size={24} className="text-accent" />,
      defaultPrompt: 'Calculate efficiency and losses of a transformer with primary voltage 240V, secondary voltage 120V, secondary current 10A, and efficiency 95%.'
    }
  ];

  // BUG FIX: Previously, domain cards called launchPlayground(d.id) directly,
  // completely bypassing setSelectedDomain and the Step 2 prompt screen.
  // handleNext was defined but never reachable. Step 2 was dead code.
  // Fix: card click now selects the domain and advances to Step 2,
  // letting the user review/edit the default prompt before launching.
  const handleSelectDomain = (domainId) => {
    const domainInfo = domains.find(d => d.id === domainId);
    if (!domainInfo) return;
    setSelectedDomain(domainId);
    setPromptText(domainInfo.defaultPrompt);
    setStep(2);
  };

  const handleStart = () => {
    onCompleteOnboarding(selectedDomain, promptText.trim());
  };

  const handlePlayground = () => {
    onCompleteOnboarding('Default', '');
  };

  const activeDomainInfo = domains.find(d => d.id === selectedDomain);

  return (
    <div className="onboard-container">
      
      {/* STEP 1: DOMAIN SELECTION */}
      {step === 1 && (
        <div className="onboard-screen">
          <div className="onboard-heading">
            <h2 className="onboard-title">What do you want to simulate?</h2>
            <p className="onboard-subtitle text-secondary">Choose your engineering domain plugin to initialize SimForge.</p>
          </div>

          <button className="playground-launch-btn" onClick={() => onCompleteOnboarding('Default', '')}>
            <span>Let's go to Playground</span>
            <MoveRight size={18} />
          </button>
          
          <div className="domain-grid">
            {domains.map(d => (
              <button
                key={d.id}
                className={`domain-card ${selectedDomain === d.id ? 'selected' : ''}`}
                onClick={() => handleSelectDomain(d.id)}
              >
                <div className="icon-circle">{d.icon}</div>
                <h3 className="domain-title text-primary font-semibold">{d.title}</h3>
                <p className="domain-desc text-secondary text-[11px] mt-1">{d.desc}</p>
                <span className="domain-launch-label">
                  Launch {d.id} <MoveRight size={12} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: FIRST PROMPT */}
      {step === 2 && (
        <div className="onboard-screen onboard-prompt-screen">
          <div className="onboard-heading">
            <h2 className="onboard-title">Describe your physical system</h2>
            <p className="onboard-subtitle text-secondary">
              Modify the baseline engineering description to create your first simulation.
            </p>
          </div>

          <div className="prompt-editor-container">
            <span className="selected-domain-badge">
              Active Domain: {selectedDomain}
            </span>
            <textarea
              className="onboard-textarea"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Describe your physical design parameters..."
            />
          </div>

          <div className="onboard-actions">
            <button className="onboard-secondary-btn" onClick={() => {
              setStep(1);
              setPromptText('');
            }}>
              Back
            </button>
            <button
              className="onboard-cta-btn flex items-center gap-1"
              onClick={handleStart}
              disabled={!promptText.trim()}
            >
              Start Simulating <MoveRight size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .onboard-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--bg-base);
          z-index: 500;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          min-height: 100vh;
          padding: clamp(12px, 2.4vw, 28px);
          overflow-y: auto;
        }
        .onboard-screen {
          width: min(1440px, 100%);
          min-height: calc(100vh - clamp(24px, 4.8vw, 56px));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: clamp(12px, 1.8vw, 20px);
          background:
            radial-gradient(circle at 50% 18%, rgba(59, 130, 246, 0.10), transparent 34%),
            linear-gradient(180deg, rgba(19, 22, 26, 0.86), rgba(13, 15, 18, 0.96));
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: clamp(16px, 2.4vw, 28px);
          box-shadow: 0 18px 80px rgba(0, 0, 0, 0.55);
        }
        .onboard-heading {
          flex: 0 0 auto;
        }
        .playground-launch-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-width: min(420px, 100%);
          padding: 15px 26px;
          border-radius: 8px;
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          color: white;
          font-size: clamp(15px, 1.25vw, 18px);
          font-weight: 750;
          box-shadow: 0 16px 34px rgba(37, 99, 235, 0.28);
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .playground-launch-btn:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
          box-shadow: 0 20px 42px rgba(37, 99, 235, 0.34);
        }
        .onboard-prompt-screen {
          max-width: 980px;
          min-height: min(640px, calc(100vh - clamp(48px, 8vw, 112px)));
        }
        .onboard-title {
          font-size: clamp(21px, 2.2vw, 32px);
          color: var(--text-primary);
          font-weight: 700;
          text-align: center;
          line-height: 1.1;
        }
        .onboard-subtitle {
          font-size: clamp(12px, 1.05vw, 14px);
          margin-top: 6px;
          text-align: center;
          max-width: 680px;
        }
        
        .domain-grid {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: clamp(10px, 1.15vw, 14px);
          align-content: start;
        }
        .domain-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background-color: var(--bg-elevated);
          border: 1px solid var(--border);
          padding: clamp(12px, 1.2vw, 16px);
          border-radius: 8px;
          text-align: left;
          min-height: 0;
          height: clamp(178px, 22vh, 230px);
          overflow: hidden;
          width: 100%;
          transition: border-color 160ms ease, transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }
        .domain-card:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.26);
        }
        .domain-card.selected {
          border-color: var(--accent-primary);
          background-color: rgba(59, 130, 246, 0.08);
          box-shadow: inset 0 0 0 1px var(--accent-primary);
        }
        .icon-circle {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: var(--bg-surface);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2px;
          border: 1px solid var(--border);
        }
        .domain-title {
          font-size: clamp(13px, 1.05vw, 16px);
          line-height: 1.18;
        }
        .domain-desc {
          flex: 1 1 auto;
          font-size: clamp(10px, 0.88vw, 12px);
          line-height: 1.34;
          color: var(--text-secondary);
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-width: thin;
          min-height: 0;
        }
        .domain-desc::-webkit-scrollbar {
          width: 4px;
        }
        .domain-desc::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 999px;
        }
        .domain-launch-label {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: auto;
          color: var(--accent-primary);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
        }
        
        .onboard-cta-btn {
          background-color: var(--accent-primary);
          color: white;
          font-weight: 600;
          padding: 10px 18px;
          border-radius: 6px;
          font-size: 14px;
          min-width: 132px;
          justify-content: center;
          transition: background-color 160ms ease, opacity 160ms ease;
        }
        .onboard-cta-btn:hover:not(:disabled) { background-color: #2563eb; }
        .onboard-cta-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .onboard-secondary-btn {
          color: var(--text-secondary);
          padding: 12px 18px;
          font-size: 14px;
        }
        .onboard-secondary-btn:hover {
          color: var(--text-primary);
        }
        
        .prompt-editor-container {
          border: 1px solid var(--border);
          background-color: var(--bg-elevated);
          padding: 18px;
          border-radius: 8px;
          width: min(860px, 100%);
          min-height: 320px;
          display: flex;
          flex-direction: column;
        }
        .selected-domain-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--accent-primary);
          background-color: rgba(59, 130, 246, 0.1);
          padding: 5px 9px;
          border-radius: 4px;
          width: max-content;
        }
        .onboard-textarea {
          width: 100%;
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-primary);
          padding: 12px 0 0;
          font-size: 15px;
          line-height: 1.6;
          resize: none;
          outline: none;
        }
        .onboard-actions {
          width: min(860px, 100%);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        @media (max-width: 1180px) {
          .domain-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .domain-card {
            height: 190px;
          }
        }
        @media (max-height: 760px) and (min-width: 781px) {
          .onboard-container {
            padding: 10px;
          }
          .onboard-screen {
            gap: 10px;
            padding: 14px;
          }
          .domain-card {
            height: 158px;
            padding: 10px;
          }
          .playground-launch-btn {
            padding: 11px 18px;
          }
          .icon-circle {
            width: 30px;
            height: 30px;
          }
          .domain-title {
            font-size: 12px;
          }
          .domain-desc {
            font-size: 10px;
            line-height: 1.25;
          }
        }
        @media (max-width: 780px) {
          .onboard-container {
            padding: 16px;
          }
          .onboard-screen {
            min-height: calc(100vh - 32px);
            justify-content: flex-start;
          }
          .domain-grid {
            grid-template-columns: 1fr;
          }
          .domain-card {
            min-height: auto;
          }
          .onboard-actions {
            flex-direction: column-reverse;
          }
        }
      `}</style>
    </div>
  );
}
