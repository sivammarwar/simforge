import React, { useState, useEffect, useRef, useCallback } from 'react';
import TopBar from './components/TopBar';
import LeftSidebar from './components/LeftSidebar';
import StatusBar from './components/StatusBar';
import ResizableLayout from './components/ResizableLayout';
import ReasoningPane from './components/ReasoningPane';
import ModelPane from './components/ModelPane';
import ResultsPane from './components/ResultsPane';

import MemoryOverlay from './components/MemoryOverlay';
import SettingsModal from './components/SettingsModal';
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';
import ValidationDashboard from './components/ValidationDashboard';
import LandingPage from './components/landing/LandingPage';

import { getMemoryData, saveMemoryData, logMemoryEvent, formatTimestamp } from './services/memory';
import { detectContradiction } from './services/triz';
import { detectAllLookups } from './services/connectors';
import { runSolverWithBackend } from './services/solvers';
import { chatWithEngineeringBrain } from './services/llmClient';
import {
  applyNaturalLanguageUpdates,
  detectDomainFromPrompt,
  planChatWorkflow,
  generateInputFile,
  classifyMessageIntent,
  generateStructuredEngineeringAnswer,
  generateFollowupAnswer
} from './services/chatOrchestrator';
import { validateSVGOutput } from './services/svgUtils';
import { getPlots } from './services/plotEngine';
import { executeSolverAndGeneratePlots } from './services/solverExecutor';
import { createComparison, getAllComparisons } from './services/realtimeComparison';
import { processTuningIteration } from './services/liveTuningLoop';

// NEW ARCHITECTURE: Modular Domain Pipeline
import { executeFullPipeline, processQuestion, runSimulation, generatePlots, generateSchematic, getSupportedDomains } from './services/domainPipeline';
import { solveCircuitQuestion, looksLikeCircuitsQuestion } from './services/circuitsClient';

// LEGACY IMPORTS - Kept for backward compatibility during migration
// TODO: Remove after full migration to new pipeline
import { OptimizedContextBuilder } from './services/contextServices';
// import { COMPRESSED_BRAIN_PROMPT } from './services/compressedBrainPrompt'; // Not used in new pipeline
// import { parseAndSemantifyQuestion, checkModelQuestionAlignment, checkPhysicalPlausibility } from './services/aiLayers'; // Not used in new pipeline
// import { attachFlowMetadata, buildComparisonSummary, buildTrizDesignOptions } from './services/simforgeFlow'; // Not used in new pipeline
// NOTE: buildComparisonSummary / createIterationSuggestions were previously imported from
// './services/simforgeFlow' but that import was commented out while the calls to those
// functions were NOT removed - this meant runSimulationForSession() threw an uncaught
// ReferenceError any time a TRIZ baseline existed. Local, dependency-free fallbacks are
// defined further down in this file (search BUGFIX: local fallbacks) until a real
// simforgeFlow service is wired back in.

const DOMAIN_ORDER = ['Default', 'Physics', 'Circuits', 'Structural', 'Fluids', 'Semiconductors', 'Aerospace', 'Thermal', 'Control', 'Materials', 'Power'];

// Baseline Default Models
// BUG FIX: Changed hardcoded values to null/empty for user-provided parameters.
// Previously, defaults like '5 V', '2 kg', '500 mm' would override user question parameters.
// Now only structural defaults (SYSTEM_TYPE, SIMULATION type, Solver) are preset.
// Numeric parameters are null and will be populated by AI Layer 1B (Question Parser)
// and applyNaturalLanguageUpdates from the actual user question.
const DEFAULT_MODELS = {
  Circuits: {
    SYSTEM_TYPE: null,
    INPUT: {
      'Supply voltage': null,
      'Input voltage': null,
      'Source impedance': { value: '50 mΩ', tag: 'inferred', explanation: 'Typical layout DCR impedance for a ceramic input trace.' }
    },
    OUTPUT: {
      'Load current': null,
      'Output voltage': null,
      'Target ripple': { value: '50 mV', tag: 'inferred' }
    },
    COMPONENTS: {
      'Resistor (R)': null,
      'R': null,
      'Capacitor (C)': null,
      'C': null,
      'Inductor (L1)': null,
      'Capacitor (C1)': null,
      'ESR (C1)': { value: '20 mΩ', tag: 'inferred', explanation: 'Typical ESR of MLCC ceramic capacitors at 500 kHz.' },
      'Switch freq': null,
      'Duty cycle': null
    },
    SIMULATION: {
      'Type': { value: 'Transient', tag: 'confirmed' },
      'Duration': { value: '500 µs', tag: 'confirmed' },
      'Solver': { value: 'ngspice', tag: 'confirmed' },
      'Output signal': { value: 'V(out) — output voltage ripple', tag: 'confirmed' }
    }
  },
  Physics: {
    SYSTEM_TYPE: null,
    PROBLEM: {
      'Problem type': { value: 'Classical mechanics', tag: 'confirmed' },
      'Level': { value: '11th/12th physics', tag: 'confirmed' }
    },
    MASSES: {
      'Mass m1': null,
      'Mass m2': null
    },
    CONTACT: {
      'Coefficient of friction': null,
      'Contact surface': { value: 'Rough horizontal table', tag: 'inferred' },
      'Incline angle': null
    },
    SPRING: {
      'Spring constant': null,
      'Initial stretch': { value: '0 m', tag: 'inferred' }
    },
    MOTION: {
      'Initial condition': { value: 'Released from rest', tag: 'inferred' },
      'Evaluation time': null,
      'Travel distance': null
    },
    SIMULATION: {
      'Type': { value: 'Physics mechanics solve', tag: 'confirmed' },
      'Solver': { value: 'Analytical mechanics / SHM solver', tag: 'confirmed' },
      'Output': { value: 'Forces, motion, energy, and plots', tag: 'confirmed' }
    }
  },
  Structural: {
    SYSTEM_TYPE: null,
    GEOMETRY: {
      'Length': null,
      'Width': null,
      'Height': null,
      'Shape': { value: 'Solid Rectangular', tag: 'confirmed' },
      'Profile': { value: 'Uniform', tag: 'confirmed' }
    },
    MATERIAL: {
      'Material': { value: 'Structural steel (AISI 1020)', tag: 'inferred', explanation: 'Most common material for general purpose framing.' },
      'Young\'s modulus': { value: '200 GPa', tag: 'from material DB' },
      'Poisson\'s ratio': { value: '0.29', tag: 'from material DB' },
      'Density': { value: '7850 kg/m³', tag: 'from material DB' }
    },
    LOADING: {
      'Load type': { value: 'Point load', tag: 'confirmed' },
      'Magnitude': null,
      'Position': { value: 'Free end', tag: 'confirmed' }
    },
    SIMULATION: {
      'Type': { value: 'Linear static FEA', tag: 'confirmed' },
      'Solver': { value: 'CalculiX', tag: 'confirmed' },
      'Output': { value: 'Von Mises stress, displacement', tag: 'confirmed' }
    }
  },
  Fluids: {
    SYSTEM_TYPE: null,
    GEOMETRY: {
      'Duct shape': { value: 'Circular', tag: 'confirmed' },
      'Diameter': null,
      'Length': null,
      'Inlet Type': { value: 'Sharp-edged', tag: 'inferred', explanation: 'Default pipe entry boundary.' },
      'Wall Texture': { value: 'Smooth', tag: 'confirmed' }
    },
    FLUID: {
      'Fluid': { value: 'Air at 25°C', tag: 'inferred', explanation: 'Assumed ambient dry air standard.' },
      'Density': { value: '1.184 kg/m³', tag: 'from fluid DB' },
      'Dynamic viscosity': { value: '1.849e-5 Pa·s', tag: 'from fluid DB' }
    },
    BOUNDARY_CONDITIONS: {
      'Inlet velocity': null,
      'Outlet condition': { value: 'Zero-gradient pressure', tag: 'confirmed' },
      'Wall condition': { value: 'No-slip', tag: 'confirmed' }
    },
    SIMULATION: {
      'Type': { value: 'Steady-state RANS (k-ε)', tag: 'confirmed' },
      'Solver': { value: 'OpenFOAM simpleFoam', tag: 'confirmed' },
      'Output': { value: 'Velocity field, pressure distribution', tag: 'confirmed' }
    }
  },
  Semiconductors: {
    SYSTEM_TYPE: null,
    GEOMETRY: {
      'Gate Length': null,
      'Width': null,
      'Oxide Thickness': { value: '4.0 nm', tag: 'inferred', explanation: 'Standard gate oxide scaling thickness for 180nm CMOS node.' }
    },
    MATERIAL: {
      'Channel Mobility': { value: '450 cm²/V·s', tag: 'inferred', explanation: 'Typical electron inversion layer mobility in silicon.' },
      'Gate Dielectric': { value: 'Silicon Dioxide (SiO2)', tag: 'confirmed' },
      'Substrate': { value: 'p-type silicon', tag: 'inferred' }
    },
    BIASING: {
      'Gate Voltage': null,
      'Drain Voltage': null,
      'Gate sweep': null,
      'Drain sweep': null
    },
    SIMULATION: {
      'Type': { value: 'I-V Characteristics', tag: 'confirmed' },
      'Solver': { value: 'SPICE Level 1 Model', tag: 'confirmed' }
    }
  },
  Aerospace: {
    SYSTEM_TYPE: null,
    GEOMETRY: {
      'Throat Diameter': null,
      'Expansion ratio': null,
      'Divergent Angle': { value: '15 deg', tag: 'inferred', explanation: 'Standard optimum conical nozzle half-angle for minimal divergence losses.' }
    },
    PROPULSION: {
      'Chamber Pressure': null,
      'Chamber Temperature': { value: '3000 K', tag: 'inferred', explanation: 'Typical gas combustion temperature for kerosene/LOX systems.' },
      'Specific heat ratio': { value: '1.20', tag: 'inferred', explanation: 'Assumed specific heat ratio gamma for typical rocket exhaust products.' },
      'Gas constant': { value: '287 J/kgK', tag: 'inferred', explanation: 'Default gas constant used for first-pass nozzle calculations.' }
    },
    SIMULATION: {
      'Type': { value: '1D Isentropic Expansion', tag: 'confirmed' },
      'Solver': { value: 'Isentropic Area-Mach Iterative', tag: 'confirmed' }
    }
  },
  Thermal: {
    SYSTEM_TYPE: null,
    HEAT_LOAD: {
      'Power dissipation': null
    },
    TEMPERATURES: {
      'Ambient temperature': null,
      'Maximum junction temperature': null
    },
    THERMAL_PATH: {
      'Junction-to-case resistance': { value: '1.0 K/W', tag: 'inferred' },
      'Interface resistance': { value: '0.5 K/W', tag: 'inferred' },
      'Convection coefficient': { value: '10 W/m²K', tag: 'inferred' },
      'Convection mode': { value: 'Natural convection', tag: 'inferred' }
    },
    SIMULATION: {
      'Type': { value: 'Steady thermal resistance network', tag: 'confirmed' },
      'Solver': { value: 'Analytical thermal budget', tag: 'confirmed' },
      'Output': { value: 'Required heatsink resistance and area', tag: 'confirmed' }
    }
  },
  Control: {
    SYSTEM_TYPE: 'PID Control Design',
    PLANT: {
      'Transfer function': { value: '10/(s*(s+2))', tag: 'stated' }
    },
    REQUIREMENTS: {
      'Settling time': { value: '1 s', tag: 'stated' },
      'Maximum overshoot': { value: '15 %', tag: 'stated' }
    },
    CONTROLLER: {
      'Controller type': { value: 'PID', tag: 'confirmed' },
      'Kp': { value: '0', tag: 'calculated' },
      'Ki': { value: '0', tag: 'calculated' },
      'Kd': { value: '0', tag: 'calculated' }
    },
    SIMULATION: {
      'Type': { value: 'Closed-loop step estimate', tag: 'confirmed' },
      'Solver': { value: 'Pole-placement PID synthesis', tag: 'confirmed' },
      'Output': { value: 'PID gains and response metrics', tag: 'confirmed' }
    }
  },
  Materials: {
    SYSTEM_TYPE: 'Steel Fatigue Check',
    MATERIAL: {
      'Material': { value: 'Steel', tag: 'stated' },
      'Yield strength': { value: '350 MPa', tag: 'inferred' },
      'Ultimate strength': { value: '550 MPa', tag: 'inferred' },
      'Endurance strength': { value: '275 MPa', tag: 'inferred' }
    },
    LOADING: {
      'Maximum stress': { value: '220 MPa', tag: 'stated' },
      'Minimum stress': { value: '20 MPa', tag: 'stated' },
      'Cycles': { value: '1e6', tag: 'stated' }
    },
    SIMULATION: {
      'Type': { value: 'Goodman fatigue screening', tag: 'confirmed' },
      'Solver': { value: 'Analytical material safety check', tag: 'confirmed' },
      'Output': { value: 'Mean stress, alternating stress, utilization, safety factor', tag: 'confirmed' }
    }
  },
  Power: {
    SYSTEM_TYPE: 'Transformer Efficiency',
    INPUT: {
      'Primary voltage': { value: '240 V', tag: 'stated' },
      'Secondary voltage': { value: '120 V', tag: 'stated' },
      'Secondary current': { value: '10 A', tag: 'stated' }
    },
    PERFORMANCE: {
      'Efficiency': { value: '95 %', tag: 'inferred' }
    },
    SIMULATION: {
      'Type': { value: 'Steady power balance', tag: 'confirmed' },
      'Solver': { value: 'Analytical transformer model', tag: 'confirmed' },
      'Output': { value: 'Input power, output power, losses, current ratio', tag: 'confirmed' }
    }
  }
};

const SESSION_STATE_KEY = 'simforge_session_state';

// How many prior chat turns (user + assistant messages combined) to send to the AI
// as conversation context on every new message. Keep this bounded so prompts don't
// grow unbounded as a session gets long.
const MAX_HISTORY_MESSAGES = 20;

function loadSessionState() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSessionStateSnapshot(snapshot) {
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(snapshot));
}

function createFreshMemoryData() {
  // BUG FIX: createFreshMemoryData now returns an object with currentSessionId: null
  // After handleGoHome, memory.currentSessionId was undefined instead of null,
  // breaking all subsequent session lookups that used strict equality or optional chaining.
  return {
    projects: [{ id: 'proj-session', name: 'History' }],
    currentProjectId: 'proj-session',
    sessions: { 'proj-session': [] },
    currentSessionId: null,
    events: [],
    preferences: {}
  };
}

// ─────────────────────────────────────────────────────────────────────────
// BUGFIX: local fallbacks for functions that were referenced in
// runSimulationForSession() but never actually imported anywhere
// (they used to live in a './services/simforgeFlow' module whose import was
// commented out, while the call sites were left in place). That meant any
// simulation run for a session with a TRIZ baseline attached threw an
// uncaught ReferenceError, and iteration suggestions always threw
// unconditionally. These lightweight local versions keep the app from
// crashing; swap them out for the real service implementations when ready.
// ─────────────────────────────────────────────────────────────────────────
function buildComparisonSummary({ baselineModel, modifiedModel, baselineResults, modifiedResults, principle }) {
  const baseMetrics = baselineResults?.metrics || [];
  const modMetrics = modifiedResults?.metrics || [];

  const metrics = modMetrics.map(m => {
    const baseMetric = baseMetrics.find(bm => bm.name === m.name);
    let change = '';
    if (baseMetric && typeof baseMetric.rawValue === 'number' && typeof m.rawValue === 'number' && baseMetric.rawValue !== 0) {
      const pct = ((m.rawValue - baseMetric.rawValue) / Math.abs(baseMetric.rawValue)) * 100;
      change = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
    return {
      name: m.name,
      original: baseMetric ? baseMetric.value : 'n/a',
      modified: m.value,
      change
    };
  });

  return {
    metrics,
    verdict: principle
      ? `Applied **${principle}** and compared the result against the baseline run captured before the edit.`
      : 'Compared the result against the baseline run captured before the edit.'
  };
}

function createIterationSuggestions({ domain, contradiction, hasResults, mode }) {
  if (contradiction) {
    return [
      `Try a TRIZ-guided change to resolve ${contradiction.property_a || 'one property'} vs ${contradiction.property_b || 'the other'} without giving up the win you just got.`
    ];
  }
  if (!hasResults) {
    return ['Run the simulation to get concrete metrics before iterating further.'];
  }
  return [
    'Ask a follow-up question to tune a specific parameter (e.g. "what if L1 were 10 µH instead?").',
    'Adjust one variable at a time in the Model pane and re-run to isolate its effect.'
  ];
}

export default function App() {
  // Landing page state
  const [showLandingPage, setShowLandingPage] = useState(true);

  // Toggle body class based on landing page state
  useEffect(() => {
    if (showLandingPage) {
      document.body.classList.add('landing-page-active');
      document.body.style.overflow = 'auto';
      document.body.style.height = 'auto';
    } else {
      document.body.classList.remove('landing-page-active');
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    }
  }, [showLandingPage]);

  // Load Project Memory Context
  const [memory, setMemory] = useState(() => getMemoryData());
  const [activeDomain, setActiveDomain] = useState('Circuits');
  const [selectedProvider, setSelectedProvider] = useState('groq');
  
  // Initialize optimized context builder (persist across renders)
  const contextBuilder = useRef(new OptimizedContextBuilder()).current;
  
  // Collapse sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Desktop viewport boundary check state
  const [isTooNarrow, setIsTooNarrow] = useState(() => window.innerWidth < 960);

  useEffect(() => {
    const handleResize = () => {
      setIsTooNarrow(window.innerWidth < 960);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Backend health check
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [backendChecking, setBackendChecking] = useState(true);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('/health');
        setBackendAvailable(response.ok);
        console.log('[Backend] Health check:', response.ok ? 'Available' : 'Unavailable');
      } catch (error) {
        setBackendAvailable(false);
        console.warn('[Backend] Health check failed:', error);
      } finally {
        setBackendChecking(false);
      }
    };

    checkBackend();
    // Check every 30 seconds
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  // Active items
  const currentProject = memory.projects.find(p => p.id === memory.currentProjectId) || memory.projects[0];
  const activeSessionId = memory.currentSessionId;
  const projectSessions = memory.sessions[currentProject.id] || [];
  const activeSession = projectSessions.find(s => s.id === activeSessionId) || null;

  // UI Overlays toggles
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const data = getMemoryData();
    const sessions = data.sessions?.[data.currentProjectId] || [];
    return sessions.length === 0;
  });

  // Chat thread messages
  // Stored in local state per session ID to allow seamless switching
  const loadedSessionState = loadSessionState();
  const [sessionMessages, setSessionMessages] = useState(loadedSessionState.sessionMessages || {});
  const [sessionInputFiles, setSessionInputFiles] = useState(loadedSessionState.sessionInputFiles || {});
  const [sessionParameters, setSessionParameters] = useState(loadedSessionState.sessionParameters || {});
  const [sessionResults, setSessionResults] = useState(loadedSessionState.sessionResults || {});
  const [sessionSystemTypes, setSessionSystemTypes] = useState(loadedSessionState.sessionSystemTypes || {});
  const [resultsStates, setResultsStates] = useState(loadedSessionState.resultsStates || {});
  const [runHistories, setRunHistories] = useState(loadedSessionState.runHistories || {});
  
  // Brain architecture state
  const [sessionSchematics, setSessionSchematics] = useState({});
  const [sessionSVGPlots, setSessionSVGPlots] = useState({});
  const [sessionPlots, setSessionPlots] = useState({});
  const [sessionRollingSummaries, setSessionRollingSummaries] = useState({});
  
  const liveUpdateMessageTimer = useRef(null);

  // Active solver run state
  const [solverStatus, setSolverStatus] = useState({ name: 'ngspice', state: 'idle' });
  const [solverProgress, setSolverProgress] = useState(null);
  const [activeSolverInstance, setActiveSolverInstance] = useState(null);

  // Windsurf Phase 1/2 flow state
  const [sessionHasSolverRun, setSessionHasSolverRun] = useState({});
  const [sessionIsSimulationRunning, setSessionIsSimulationRunning] = useState({});

  // Comparison state for result comparisons
  const [comparisons, setComparisons] = useState([]);
  const [comparisonBaseResults, setComparisonBaseResults] = useState(null);

  // Undo history stack for parameter edits
  const [undoStack, setUndoStack] = useState([]);

  // Live Simulator Playground state
  const [livePlaygroundActive, setLivePlaygroundActive] = useState(true); // default true for high wow factor!

  // TRIZ variables
  const [trizContradiction, setTrizContradiction] = useState(null);
  const [trizWizardActive, setTrizWizardActive] = useState(false);
  const [trizBaselines, setTrizBaselines] = useState({});
  const [activeFlowPlans, setActiveFlowPlans] = useState({});

  // Clarification questions list
  const [clarificationQueue, setClarificationQueue] = useState([]);

  // Helper to fetch session specific data
  const getActiveMessages = () => sessionMessages[activeSessionId] || [];
  const getActiveInputFile = () => sessionInputFiles[activeSessionId] || null;
  const getActiveParameters = () => sessionParameters[activeSessionId] || [];
  const getActiveResults = () => sessionResults[activeSessionId] || null;
  const getActiveResultsState = () => resultsStates[activeSessionId] || 'empty';
  const getActiveHistory = () => runHistories[activeSessionId] || [];
  const getActiveSchematicSVG = () => sessionSchematics[activeSessionId] || null;
  const getActiveSVGPlots = () => sessionSVGPlots[activeSessionId] || [];
  const getActiveHasSolverRun = () => sessionHasSolverRun[activeSessionId] || false;
  const getActiveIsSimulationRunning = () => sessionIsSimulationRunning[activeSessionId] || false;
  
  useEffect(() => {
    saveSessionStateSnapshot({
      sessionMessages,
      sessionInputFiles,
      sessionParameters,
      sessionResults,
      sessionSystemTypes,
      resultsStates,
      runHistories
    });
  }, [sessionMessages, sessionInputFiles, sessionParameters, sessionResults, sessionSystemTypes, resultsStates, runHistories]);

  // Write updates to LocalStorage memory
  const updateMemoryState = (updatedMemory) => {
    setMemory(updatedMemory);
    saveMemoryData(updatedMemory);
  };



  // Initial loading effect - only set domain on first load, not on every session switch
  // BUG FIX: This was causing domain to be reset when switching sessions, which could
  // trigger re-processing of messages. Now we only set domain if it's different from current.
  useEffect(() => {
    if (activeSession && activeSession.domain !== activeDomain) {
      setActiveDomain(activeSession.domain);
    }
  }, [activeSessionId, activeSession?.domain, activeDomain]);

  // Save session messages
  const updateSessionMessages = (sessId, msgs) => {
    setSessionMessages(prev => ({ ...prev, [sessId]: msgs }));
  };

  // BUGFIX (root cause of "my message isn't showing in chat"):
  // appendSessionMessage correctly does a *functional* setState update, so it never loses
  // a message even if several appends fire back-to-back before a re-render happens.
  const appendSessionMessage = (sessId, msg) => {
    setSessionMessages(prev => ({
      ...prev,
      [sessId]: [...(prev[sessId] || []), msg]
    }));
  };

  // BUGFIX: New helper that removes a message (e.g. a "loading..." placeholder) using a
  // functional update. Previously, code did:
  //   const msgs = sessionMessages[sessId] || [];        // <- stale closure value
  //   const filtered = msgs.filter(m => m.id !== loadingMsgId);
  //   updateSessionMessages(sessId, filtered);            // <- overwrites with stale array,
  //                                                           silently deleting the user's
  //                                                           message and the loading message
  //                                                           that were just appended.
  // This version reads from `prev`, which is always the latest state, so nothing is lost.
  const removeSessionMessage = (sessId, msgId) => {
    setSessionMessages(prev => ({
      ...prev,
      [sessId]: (prev[sessId] || []).filter(m => m.id !== msgId)
    }));
  };

  // Build a bounded conversation-history array (role/content pairs) from a session's
  // existing messages, suitable for sending to the AI backend as context. This must be
  // captured BEFORE the new user message is appended to session state, so it represents
  // "everything said before this turn" — exactly what a ChatGPT/Claude-style backend
  // expects as prior context alongside the new user turn.
  const buildConversationHistory = (sessId) => {
    const msgs = sessionMessages[sessId] || [];
    return msgs
      .filter(m => m && m.text && !m.isLoading)
      .slice(-MAX_HISTORY_MESSAGES)
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
  };

  const summarizeModelForChat = (domain, model) => {
    if (!model) return 'model parameters are ready';
    if (domain === 'Physics') {
      const problem = model.PROBLEM?.['Problem type']?.value || model.SYSTEM_TYPE || 'mechanics';
      return `${problem}, m1 ${model.MASSES?.['Mass m1']?.value}, m2 ${model.MASSES?.['Mass m2']?.value}, μ ${model.CONTACT?.['Coefficient of friction']?.value}, k ${model.SPRING?.['Spring constant']?.value || 'not used'}`;
    }
    if (domain === 'Structural') {
      return `Length ${model.GEOMETRY?.Length?.value}, width ${model.GEOMETRY?.Width?.value}, height ${model.GEOMETRY?.Height?.value}, load ${model.LOADING?.Magnitude?.value}`;
    }
    if (domain === 'Circuits') {
      if (model.SYSTEM_TYPE === 'Voltage Divider') {
        return `Vin ${model.INPUT?.['Supply voltage']?.value || model.INPUT?.['Input voltage']?.value}, target ${model.OUTPUT?.['Target voltage']?.value}, R1 ${model.COMPONENTS?.['Top resistor (R1)']?.value}, R2 ${model.COMPONENTS?.['Bottom resistor (R2)']?.value}`;
      }
      return `Vin ${model.INPUT?.['Supply voltage']?.value}, load ${model.OUTPUT?.['Load current']?.value}, L ${model.COMPONENTS?.['Inductor (L1)']?.value}, C ${model.COMPONENTS?.['Capacitor (C1)']?.value}`;
    }
    if (domain === 'Fluids') {
      return `Diameter ${model.GEOMETRY?.Diameter?.value}, inlet velocity ${model.BOUNDARY_CONDITIONS?.['Inlet velocity']?.value}`;
    }
    if (domain === 'Semiconductors') {
      return `Gate length ${model.GEOMETRY?.['Gate Length']?.value}, width ${model.GEOMETRY?.Width?.value}, gate voltage ${model.BIASING?.['Gate Voltage']?.value}`;
    }
    if (domain === 'Aerospace') {
      return `Throat ${model.GEOMETRY?.['Throat Diameter']?.value}, expansion ratio ${model.GEOMETRY?.['Expansion ratio']?.value}, chamber pressure ${model.PROPULSION?.['Chamber Pressure']?.value}`;
    }
    if (domain === 'Thermal') {
      return `Power ${model.HEAT_LOAD?.['Power dissipation']?.value}, ambient ${model.TEMPERATURES?.['Ambient temperature']?.value}, max junction ${model.TEMPERATURES?.['Maximum junction temperature']?.value}`;
    }
    if (domain === 'Control') {
      return `Plant ${model.PLANT?.['Transfer function']?.value}, settling ${model.REQUIREMENTS?.['Settling time']?.value}, overshoot ${model.REQUIREMENTS?.['Maximum overshoot']?.value}`;
    }
    if (domain === 'Materials') {
      return `Material ${model.MATERIAL?.Material?.value}, max stress ${model.LOADING?.['Maximum stress']?.value}, min stress ${model.LOADING?.['Minimum stress']?.value}`;
    }
    if (domain === 'Power') {
      return `Primary ${model.INPUT?.['Primary voltage']?.value}, secondary ${model.INPUT?.['Secondary voltage']?.value}, load ${model.INPUT?.['Secondary current']?.value}`;
    }
    return 'model parameters are ready';
  };

  // Save session input file
  const updateSessionInputFile = (sessId, inputFile) => {
    setSessionInputFiles(prev => ({ ...prev, [sessId]: inputFile }));
  };

  const updateSessionResults = (sessId, res) => {
    setSessionResults(prev => ({ ...prev, [sessId]: res }));
  };

  const updateResultsState = (sessId, st) => {
    setResultsStates(prev => ({ ...prev, [sessId]: st }));
  };

  // SWITCH SESSIONS
  const handleSelectSession = (id) => {
    const updated = { ...memory, currentSessionId: id };
    const targetSession = projectSessions.find(s => s.id === id);
    if (targetSession) {
      setActiveDomain(targetSession.domain);
    }
    updateMemoryState(updated);
  };

  // NEW SESSION
  const handleNewSession = (domainName = activeDomain, initialTitle = null) => {
    const sessId = `sess-${Date.now()}`;
    const timestamp = formatTimestamp(new Date());
    const newSess = {
      id: sessId,
      title: initialTitle || `${domainName} Session — ${timestamp.split(' · ')[1]}`,
      domain: domainName,
      timestamp
    };

    const updatedSessions = {
      ...memory.sessions,
      [currentProject.id]: [newSess, ...(memory.sessions[currentProject.id] || [])]
    };

    const updated = {
      ...memory,
      sessions: updatedSessions,
      currentSessionId: sessId
    };

    updateMemoryState(updated);
    
    // Initialize session states
    updateSessionMessages(sessId, []);
    updateResultsState(sessId, 'empty');
    updateSessionInputFile(sessId, null);

    return sessId;
  };

  // SWITCH DOMAINS
  const handleSwitchDomain = (dName) => {
    setActiveDomain(dName);
    // Find if there is an active session of that domain, else create a new one
    const matchingSession = projectSessions.find(s => s.domain === dName);
    if (matchingSession) {
      handleSelectSession(matchingSession.id);
    } else {
      handleNewSession(dName);
    }
  };

  // SWITCH PROJECTS
  const handleSwitchProject = (id) => {
    const updated = { ...memory, currentProjectId: id };
    const pSessions = memory.sessions[id] || [];
    if (pSessions.length > 0) {
      updated.currentSessionId = pSessions[0].id;
      setActiveDomain(pSessions[0].domain);
    } else {
      // Create new session in new project
      const sessId = `sess-${Date.now()}`;
      const newS = { id: sessId, title: 'Initial circuits simulation', domain: 'Circuits', timestamp: formatTimestamp(new Date()) };
      updated.sessions[id] = [newS];
      updated.currentSessionId = sessId;
      setActiveDomain('Circuits');
    }
    updateMemoryState(updated);
  };

  // NEW PROJECT
  const handleNewProject = () => {
    const name = prompt("Enter project name:");
    if (!name) return;
    const projId = `proj-${Date.now()}`;
    const newProj = { id: projId, name };

    const updatedProjects = [...memory.projects, newProj];
    const updated = {
      ...memory,
      projects: updatedProjects,
      currentProjectId: projId
    };
    updateMemoryState(updated);
    handleSwitchProject(projId);
  };

  // CHAT INPUT SUBMIT OR SUGGESTION CHIPS (LEGACY - Kept for backward compatibility)
  const handleSendMessageLegacy = async (text, options = {}) => {
    const { clarifyOnly = false } = options;
    
    // Step 1: Check if user is answering a clarification question
    if (clarificationQueue.length > 0) {
      handleClarifyAnswer(clarificationQueue[0].id, text);
      return;
    }

    let targetSessionId = activeSessionId;

    // BUGFIX: capture conversation history BEFORE appending the new user message, so it
    // represents "everything said before this turn" for the AI backend.
    const conversationHistory = buildConversationHistory(targetSessionId);
    
    // Step 2: Show user message immediately (zero latency)
    const userMsg = { 
      id: `m-${Date.now()}-user`, 
      sender: 'user', 
      text, 
      timestamp: formatTimestamp(new Date()) 
    };
    
    appendSessionMessage(targetSessionId, userMsg);

    // Step 2b: Show simple loading message (after user message is added)
    const loadingMsgId = `m-${Date.now()}-loading`;
    const loadingMsg = {
      id: loadingMsgId,
      sender: 'ai',
      text: "Generating input file... 📝",
      timestamp: formatTimestamp(new Date()),
      isLoading: true
    };
    appendSessionMessage(targetSessionId, loadingMsg);

    // Step 3: Get current input file state (if exists)
    const currentInputFile = sessionInputFiles[targetSessionId] || null;
    
    // Step 4: Generate input file using new single-call architecture
    let inputFileResult;
    try {
      // NOTE: conversationHistory is now threaded through so the backend/LLM can use
      // prior turns as context (e.g. "make it 3.3V instead" referring to a value
      // mentioned two messages ago). generateInputFile's signature in
      // services/chatOrchestrator.js needs to accept this 4th argument and forward it
      // to whatever LLM call it makes.
      inputFileResult = await generateInputFile(text, currentInputFile, selectedProvider, conversationHistory);
      console.log('Input file generated:', inputFileResult);
    } catch (err) {
      console.error('Input file generation error:', err);
      
      // BUGFIX: use functional removeSessionMessage instead of reading stale state and
      // overwriting the whole array (which used to silently delete the user's message too).
      removeSessionMessage(targetSessionId, loadingMsgId);
      
      const errorMsg = {
        id: `m-${Date.now()}-error`,
        sender: 'ai',
        text: `*(Server error: ${selectedProvider.toUpperCase()} is currently unavailable)*\n\nThe AI provider you selected is experiencing issues. Please switch to a different AI provider from the dropdown in the top bar and retry your request.`,
        timestamp: formatTimestamp(new Date())
      };
      appendSessionMessage(targetSessionId, errorMsg);
      return;
    }

    // Step 5: Remove loading message
    removeSessionMessage(targetSessionId, loadingMsgId);

    // Step 6: Store input file and parameters in state
    let inputFileWithDomain = null;
    if (inputFileResult.input_file) {
      // Embed domain in inputFile object for backend routing
      inputFileWithDomain = {
        ...inputFileResult.input_file,
        domain: inputFileResult.domain,
        solver_name: inputFileResult.solver_name,
        system_type: inputFileResult.system_type
      };
      
      console.log('[App.jsx] Storing inputFile with domain:', inputFileWithDomain.domain);
      
      setSessionInputFiles(prev => ({
        ...prev,
        [targetSessionId]: inputFileWithDomain
      }));
      
      setSessionParameters(prev => ({
        ...prev,
        [targetSessionId]: inputFileResult.parameters
      }));
      
      // Update domain if changed - update both activeDomain and session domain
      if (inputFileResult.domain && inputFileResult.domain !== activeDomain) {
        setActiveDomain(inputFileResult.domain);
        // Also update the session domain to prevent useEffect from reverting it
        const currentSessions = memory.sessions[currentProject.id] || [];
        const updatedSessions = currentSessions.map(s => 
          s.id === targetSessionId ? { ...s, domain: inputFileResult.domain } : s
        );
        updateMemoryState({ 
          ...memory, 
          sessions: { 
            ...memory.sessions, 
            [currentProject.id]: updatedSessions 
          } 
        });
      }
      
      // Update system type
      if (inputFileResult.system_type) {
        setSessionSystemTypes(prev => ({
          ...prev,
          [targetSessionId]: inputFileResult.system_type
        }));
      }
    }

    // Step 7: Show AI response message
    const aiMsg = {
      id: `m-${Date.now()}-ai`,
      sender: 'ai',
      text: inputFileResult.summary || 'Input file generated successfully.',
      timestamp: formatTimestamp(new Date()),
      inputFileResult: inputFileResult
    };
    appendSessionMessage(targetSessionId, aiMsg);

    // Step 8: Check if simulation should run automatically
    const wantsRun = /\b(run|simulate|solve|calculate|compute|analyze|analyse|plot|show|generate|size|design|response|stress|deflection|ripple|gain|temperature|lift|drag|fatigue|safety)\b/.test(text.toLowerCase());
    
    if (wantsRun && inputFileResult.input_file && inputFileResult.missing_required.length === 0) {
      // Auto-run simulation - pass input file with domain directly to avoid async state timing issue
      await runSimulationForSession(targetSessionId, { inputFile: inputFileWithDomain });
    } else if (inputFileResult.missing_required.length > 0) {
      // Show missing required fields warning
      const warningMsg = {
        id: `m-${Date.now()}-warning`,
        sender: 'ai',
        text: `⚠️ **Missing required parameters:** ${inputFileResult.missing_required.join(', ')}\n\nPlease provide these values before running the simulation.`,
        timestamp: formatTimestamp(new Date())
      };
      appendSessionMessage(targetSessionId, warningMsg);
    }
  };

  // NEW ARCHITECTURE: Handle message using modular domain pipeline (DEFAULT)
  const handleSendMessage = async (text, options = {}) => {
    const { useNewPipeline = true, clarifyOnly = false } = options;
    
    // If not using new pipeline, fall back to old handler
    if (!useNewPipeline) {
      return handleSendMessageLegacy(text, options);
    }
    
    // Step 1: Check if user is answering a clarification question
    if (clarificationQueue.length > 0) {
      handleClarifyAnswer(clarificationQueue[0].id, text);
      return;
    }

    let targetSessionId = activeSessionId;

    // BUGFIX / FEATURE: capture conversation history BEFORE appending the new user
    // message. This is the "real chat flow with memory" piece — every prior message in
    // this session (up to MAX_HISTORY_MESSAGES) is sent alongside the new question so
    // the backend/LLM can resolve references like "make it 3.3V instead" or "now check
    // the safety factor for that beam".
    const conversationHistory = buildConversationHistory(targetSessionId);
    
    // Step 2: Show user message immediately
    const userMsg = { 
      id: `m-${Date.now()}-user`, 
      sender: 'user', 
      text, 
      timestamp: formatTimestamp(new Date()) 
    };
    
    appendSessionMessage(targetSessionId, userMsg);

    // ── SMART ROUTING ──────────────────────────────────────────────────
    // Classify intent BEFORE running the heavy solver pipeline. Handles
    // smalltalk ("hi"), personal asides ("how are you"), genuine NEW
    // engineering requests, FOLLOW-UP questions about the model/results
    // that already exist in this session ("what's the cutoff frequency we
    // got?"), and mixed messages (a personal aside + a real question in one
    // send) — so the heavy domain pipeline only ever receives genuine NEW
    // engineering content, and follow-ups get answered directly from
    // existing context instead of being misrouted or rejected.
    //
    // BUGFIX: previously this call had no visibility into the session's
    // existing state (active domain / whether results already existed), so
    // whenever the LLM router call failed, the local fallback heuristic had
    // no way to distinguish "brand new off-topic question" from "follow-up
    // about the thing we just built" — both got the same generic rejection.
    // We now pass that session context through explicitly.
    const existingResultsForSession = sessionResults[targetSessionId] || null;
    const intentResult = await classifyMessageIntent(text, conversationHistory, selectedProvider, {
      activeDomain,
      hasResults: Boolean(existingResultsForSession)
    });

    if (intentResult.intent === 'smalltalk' || intentResult.intent === 'personal') {
      appendSessionMessage(targetSessionId, {
        id: `m-${Date.now()}-ai`,
        sender: 'ai',
        text: intentResult.personalReply || "Happy to chat! What engineering problem can I help with?",
        timestamp: formatTimestamp(new Date()),
        animated: true
      });
      return;
    }

    // FOLLOW-UP: a question about the model/results that ALREADY exist for this
    // session (e.g. "what's the cutoff frequency we got?", "why is R1 that value?").
    // Answer directly from existing solver results / input file / conversation
    // history — do NOT run the full pipeline or generate a new input file.
    if (intentResult.intent === 'followup') {
      const followupLoadingId = `m-${Date.now()}-loading`;
      appendSessionMessage(targetSessionId, {
        id: followupLoadingId,
        sender: 'ai',
        text: 'Checking the current model and results... 🔎',
        timestamp: formatTimestamp(new Date()),
        isLoading: true
      });

      const currentInputFile = sessionInputFiles[targetSessionId] || null;
      let followupText = null;
      try {
        followupText = await generateFollowupAnswer({
          promptText: text,
          solverResult: existingResultsForSession,
          inputFile: currentInputFile,
          domain: activeDomain,
          conversationHistory,
          provider: selectedProvider
        });
      } catch (err) {
        console.error('[Follow-up] generation failed:', err);
      }

      removeSessionMessage(targetSessionId, followupLoadingId);

      // Graceful fallback if the AI call itself failed: answer directly from the
      // stored metrics rather than showing an error or a generic rejection.
      if (!followupText) {
        if (existingResultsForSession?.metrics?.length) {
          const metricsList = existingResultsForSession.metrics
            .map(m => `- ${m.name}: ${m.value}`)
            .join('\n');
          followupText = `Here's what's currently on record for this session:\n\n${metricsList}`;
        } else {
          followupText = `I don't have a stored result for that yet in this session — want me to run the simulation first?`;
        }
      }

      appendSessionMessage(targetSessionId, {
        id: `m-${Date.now()}-ai`,
        sender: 'ai',
        text: followupText,
        timestamp: formatTimestamp(new Date()),
        animated: true
      });
      return;
    }

    // For "mixed" messages, isolate just the engineering part for the pipeline
    // and answer the personal part immediately as a separate short message.
    let engineeringText = text;
    if (intentResult.intent === 'mixed') {
      engineeringText = intentResult.engineeringPart || text;
      appendSessionMessage(targetSessionId, {
        id: `m-${Date.now()}-ai-personal`,
        sender: 'ai',
        text: intentResult.personalReply,
        timestamp: formatTimestamp(new Date())
      });
    }

    // Step 3: Show loading message
    const loadingMsgId = `m-${Date.now()}-loading`;
    const loadingMsg = {
      id: loadingMsgId,
      sender: 'ai',
      text: "Processing with new modular pipeline... 🔧",
      timestamp: formatTimestamp(new Date()),
      isLoading: true
    };
    appendSessionMessage(targetSessionId, loadingMsg);

    try {
      let pipelineResult;

      console.log('[Circuits Detection] Question:', engineeringText);
      console.log('[Circuits Detection] Is circuits?', looksLikeCircuitsQuestion(engineeringText));

      if (looksLikeCircuitsQuestion(engineeringText)) {
        // NEW: single AI call generates netlist -> ngspice simulates ->
        // Lcapy draws schematic. Bypasses classifier.js / netlister.js /
        // circuits schematicGenerator.js / the circuits branches of
        // solvers.js entirely for this domain only.
        // conversationHistory is forwarded so the backend can maintain context across
        // turns (see services/circuitsClient.js — the backend endpoint /api/circuits/solve
        // needs to accept and use the `history` field).
        console.log('[Circuits Pipeline] Calling solveCircuitQuestion');
        const circuitResult = await solveCircuitQuestion(engineeringText, selectedProvider, conversationHistory);
        console.log('[Circuits Pipeline] Got result:', circuitResult);
        console.log('[Circuits Pipeline] frequency_response:', circuitResult.frequency_response);
        console.log('[Circuits Pipeline] schematic_svg:', circuitResult.schematic_svg);
        console.log('[Circuits Pipeline] schematic_error:', circuitResult.schematic_error);
        console.log('[Circuits Pipeline] time_series:', circuitResult.time_series);
        
        // Convert metrics to parameters format expected by rest of app
        const parameters = (circuitResult.metrics || []).map(m => ({
          field: m.name,
          value: m.value,
          unit: '',
          tag: 'default'
        }));
        
        console.log('[Circuits Pipeline] Converted parameters:', parameters);
        
        // Generate plots from the circuit result
        const plotResult = generatePlots({
          success: true,
          parsedResult: circuitResult,
          domain: 'Circuits'
        });
        
        console.log('[Circuits Pipeline] Generated plotResult:', plotResult);
        
        pipelineResult = {
          success: true,
          processingResult: {
            classification: {
              domain: 'Circuits',
              systemType: circuitResult.system_type,
              confidence: 1.0
            },
            inputFile: {
              filename: 'circuit.cir',
              content: circuitResult.netlist,
              metadata: { system_type: circuitResult.system_type, domain: 'Circuits' }
            },
            parameters: parameters,
            extractionInfo: { assumptions: circuitResult.assumptions || [] }
          },
          simulationResult: {
            success: circuitResult.status === 'completed',
            solverResult: circuitResult,
            parsedResult: circuitResult,
            domain: 'Circuits',
            systemType: circuitResult.system_type
          },
          plotResult: plotResult
        };
        console.log('[Circuits Pipeline] Pipeline result constructed:', pipelineResult);
      } else {
        // Step 4: Execute full pipeline using new architecture
        // conversationHistory is forwarded via options.history; see services/domainPipeline.js
        // (processQuestion -> askEngineeringBrain) for where this needs to reach the LLM call.
        pipelineResult = await executeFullPipeline(engineeringText, {
          provider: selectedProvider,
          useAI: true,
          runSolver: /\b(run|simulate|solve|calculate|compute|analyze)\b/.test(engineeringText.toLowerCase()),
          history: conversationHistory
        });
      }
      
      // Step 5: Remove loading message
      // BUGFIX: functional removal instead of stale-state overwrite.
      removeSessionMessage(targetSessionId, loadingMsgId);

      if (!pipelineResult.success) {
        const errorMsg = {
          id: `m-${Date.now()}-error`,
          sender: 'ai',
          text: `Pipeline error: ${pipelineResult.error}\n\nStage: ${pipelineResult.stage || 'unknown'}`,
          timestamp: formatTimestamp(new Date())
        };
        appendSessionMessage(targetSessionId, errorMsg);
        return;
      }

      const { processingResult, simulationResult, plotResult } = pipelineResult;

      // Step 6: Store input file and parameters
      if (processingResult.inputFile) {
        const inputFileWithDomain = {
          ...processingResult.inputFile,
          domain: processingResult.classification.domain,
          solver_name: getDomainConfig(processingResult.classification.domain)?.solver,
          system_type: processingResult.classification.systemType
        };
        
        setSessionInputFiles(prev => ({
          ...prev,
          [targetSessionId]: inputFileWithDomain
        }));
        
        setSessionParameters(prev => ({
          ...prev,
          [targetSessionId]: processingResult.parameters
        }));
        
        // Update domain if changed
        if (processingResult.classification.domain && processingResult.classification.domain !== activeDomain) {
          setActiveDomain(processingResult.classification.domain);
          // Also update the session domain to prevent useEffect from reverting it
          const currentSessions = memory.sessions[currentProject.id] || [];
          const updatedSessions = currentSessions.map(s => 
            s.id === targetSessionId ? { ...s, domain: processingResult.classification.domain } : s
          );
          setMemory(prev => ({
            ...prev,
            sessions: { ...prev.sessions, [currentProject.id]: updatedSessions }
          }));
        }
        
        // Update system type
        if (processingResult.classification.systemType) {
          setSessionSystemTypes(prev => ({
            ...prev,
            [targetSessionId]: processingResult.classification.systemType
          }));
        }
        
        // Generate schematic using new pipeline
        if (processingResult.classification.domain === 'Circuits') {
          // SVG already rendered server-side by Lcapy from the exact
          // simulated netlist — no client-side schematic generation call.
          const schematicSvg = pipelineResult.simulationResult?.solverResult?.schematic_svg;
          console.log('[Circuits Pipeline] Schematic SVG from solverResult:', schematicSvg ? 'present' : 'null');
          if (schematicSvg) {
            setSessionSchematics(prev => ({
              ...prev,
              [targetSessionId]: schematicSvg
            }));
          }
        } else {
          const schematicResult = generateSchematic(
            processingResult.classification.domain,
            processingResult.classification.systemType,
            processingResult.parameters
          );
          
          if (schematicResult.success) {
            setSessionSchematics(prev => ({
              ...prev,
              [targetSessionId]: schematicResult.schematic
            }));
          }
        }
      }

      // Step 7 & 8 combined: ONE structured Description -> Intuition ->
      // Mathematics -> Formula/Laws used answer, using real solver metrics as
      // ground truth when a solve happened in this same pipeline call.
      //
      // BUGFIX: this replaces the old two raw, unformatted messages that used
      // to be posted here ("**Domain:** ... **System Type:** ..." followed by
      // a separate "Simulation complete! Metrics: ..." message). Neither of
      // those ever matched ENGINEERING_ANSWER_FORMAT_INSTRUCTIONS, which is
      // why the required Description/Intuition/Mathematics/Formula-Laws-used
      // format never actually showed up in chat even though the prompt and
      // runSimulationForSession() were already correct — this handler
      // (handleSendMessage, the one actually used for every message since
      // useNewPipeline defaults to true) simply never called
      // generateStructuredEngineeringAnswer at all.
      const solverResultForAnswer = (simulationResult && simulationResult.success)
        ? simulationResult.parsedResult
        : null;

      let structuredAnswer = null;
      try {
        structuredAnswer = await generateStructuredEngineeringAnswer({
          promptText: engineeringText,
          solverResult: solverResultForAnswer,
          inputFile: processingResult.inputFile,
          domain: processingResult.classification.domain,
          conversationHistory,
          provider: selectedProvider
        });
      } catch (err) {
        console.error('[handleSendMessage] Structured answer generation failed:', err);
      }

      const fallbackOpening = getConversationalOpening(
        processingResult.classification.domain,
        processingResult.inputFile,
        engineeringText
      );

      const explanationText = structuredAnswer
        ? structuredAnswer
        : solverResultForAnswer
          ? formatResultAnswer({
              domain: processingResult.classification.domain,
              model: processingResult.inputFile,
              results: solverResultForAnswer,
              summary: getConversationalResultSummary(processingResult.classification.domain, processingResult.inputFile, solverResultForAnswer),
              solverName: getDomainConfig(processingResult.classification.domain)?.solver || 'solver'
            })
          : formatEngineeringAnswer({
              domain: processingResult.classification.domain,
              model: processingResult.inputFile,
              promptText: engineeringText,
              flowPlan: null,
              opening: fallbackOpening
            });

      const aiMsg = {
        id: `m-${Date.now()}-ai`,
        sender: 'ai',
        text: explanationText,
        timestamp: formatTimestamp(new Date()),
        pipelineResult: pipelineResult
      };
      appendSessionMessage(targetSessionId, aiMsg);

      // Store solver state (unchanged logic, just no longer paired with the
      // old raw "Simulation complete!" message — the structured answer above
      // already covers it).
      if (simulationResult && simulationResult.success) {
        setSessionResults(prev => ({
          ...prev,
          [targetSessionId]: simulationResult.parsedResult
        }));
        
        // Mark results as available and simulation as run
        setResultsStates(prev => ({ ...prev, [targetSessionId]: 'results' }));
        setSessionHasSolverRun(prev => ({ ...prev, [targetSessionId]: true }));
      } else if (simulationResult) {
        // Solver was attempted but failed — still mark it "run" so the UI
        // shows "no results" instead of the pre-run empty state forever
        setResultsStates(prev => ({ ...prev, [targetSessionId]: 'empty' }));
        setSessionHasSolverRun(prev => ({ ...prev, [targetSessionId]: true }));
      }

      // Step 9: Handle plots if available
      if (plotResult && plotResult.success) {
        setSessionPlots(prev => ({
          ...prev,
          [targetSessionId]: plotResult.allPlots
        }));
      }

    } catch (error) {
      console.error('[New Pipeline] Error:', error);
      
      // BUGFIX: functional removal instead of stale-state overwrite.
      removeSessionMessage(targetSessionId, loadingMsgId);
      
      const errorMsg = {
        id: `m-${Date.now()}-error`,
        sender: 'ai',
        text: `Pipeline error: ${error.message}`,
        timestamp: formatTimestamp(new Date())
      };
      appendSessionMessage(targetSessionId, errorMsg);
    }
  };

  // Helper to get domain config
  function getDomainConfig(domain) {
    const configs = {
      'Circuits': { solver: 'ngspice' },
      'Structural': { solver: 'CalculiX' },
      'Thermal': { solver: 'Elmer' },
      'Fluids': { solver: 'OpenFOAM' },
      'Aerospace': { solver: 'XFOIL' }
    };
    return configs[domain];
  }

  const handleEditMessage = (msgId, newText) => {
    const activeMsgList = getActiveMessages();
    const msgIndex = activeMsgList.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Remove all messages after this one and re-run with new text
    const nextMsgs = activeMsgList.slice(0, msgIndex);
    updateSessionMessages(activeSessionId, nextMsgs);
    
    // Re-generate input file with new text
    handleSendMessage(newText, { useNewPipeline: true });
  };

  // RETRY MESSAGE IN CHAT THREAD
  const handleRetryMessage = (msgId) => {
    const activeMsgList = getActiveMessages();
    const msgIndex = activeMsgList.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const targetMsg = activeMsgList[msgIndex];
    if (targetMsg.sender === 'user') {
      // Remove all messages after this one and re-run
      const nextMsgs = activeMsgList.slice(0, msgIndex + 1);
      updateSessionMessages(activeSessionId, nextMsgs);
      
      // Use the new pipeline architecture
      handleSendMessage(targetMsg.text, { useNewPipeline: true });
    } else {
      let userMsgIndex = -1;
      for (let j = msgIndex - 1; j >= 0; j--) {
        if (activeMsgList[j].sender === 'user') {
          userMsgIndex = j;
          break;
        }
      }
      if (userMsgIndex !== -1) {
        const userMsg = activeMsgList[userMsgIndex];
        const nextMsgs = activeMsgList.slice(0, userMsgIndex + 1);
        updateSessionMessages(activeSessionId, nextMsgs);
        
        // Use the new pipeline architecture
        handleSendMessage(userMsg.text, { useNewPipeline: true });
      }
    }
  };

  // HANDLE CLARIFY ANSWER CHIPS
  // BUGFIX: this used to smash the ENTIRE message history into one giant string
  // (`getActiveMessages().map(m=>m.text).join(' ')`) as a crude, lossy way of giving the
  // AI "context". Real conversation history is now threaded through handleSendMessage via
  // buildConversationHistory/conversationHistory, so we can just send the chip's answer
  // as a normal new user turn.
  const handleClarifyAnswer = (qId, selectedChip) => {
    setClarificationQueue([]);
    handleSendMessage(selectedChip, { useNewPipeline: true });
  };

  // UPDATE FIELD PARAMETER VALUE (via file_anchor)
  const handleUpdateField = async (section, field, newValue) => {
    const inputFile = getActiveInputFile();
    const parameters = getActiveParameters();
    
    if (!inputFile) {
      console.error('[handleUpdateField] No input file found');
      return;
    }
    
    // Find the parameter with matching section and field
    const param = parameters.find(p => p.section === section && p.field === field);
    if (!param || !param.file_anchor) {
      console.error('[handleUpdateField] Parameter not found or missing file_anchor');
      return;
    }
    
    const oldValue = param.value;
    
    // Perform string replace on input file content using file_anchor
    const lines = inputFile.content.split('\n');
    const targetLine = param.file_anchor.line - 1; // Convert to 0-indexed
    
    if (targetLine < 0 || targetLine >= lines.length) {
      console.error('[handleUpdateField] Invalid line number in file_anchor');
      return;
    }
    
    // Replace the matched substring with new value
    const oldLine = lines[targetLine];
    const newLine = oldLine.replace(param.file_anchor.match, newValue);
    
    if (oldLine === newLine) {
      console.warn('[handleUpdateField] String replacement did not change the line');
      return;
    }
    
    lines[targetLine] = newLine;
    
    // Update input file content
    const updatedInputFile = {
      ...inputFile,
      content: lines.join('\n')
    };
    
    updateSessionInputFile(activeSessionId, updatedInputFile);
    
    // Update parameter value in parameters array
    const updatedParameters = parameters.map(p => {
      if (p.section === section && p.field === field) {
        return { ...p, value: newValue, tag: 'edited', oldValue: oldValue };
      }
      return p;
    });
    
    setSessionParameters(prev => ({
      ...prev,
      [activeSessionId]: updatedParameters
    }));
    
    console.log(`[handleUpdateField] Updated ${section}.${field} from ${oldValue} to ${newValue}`);
    console.log(`[handleUpdateField] New parameters:`, updatedParameters);
  };

  const getSolverName = (domain) => {
    return domain === 'Physics' ? 'Mechanics'
      : domain === 'Circuits' ? 'ngspice'
      : domain === 'Structural' ? 'CalculiX'
      : domain === 'Fluids' ? 'OpenFOAM'
      : domain === 'Semiconductors' ? 'SPICE'
      : domain === 'Thermal' ? 'ThermalBudget'
      : domain === 'Control' ? 'PIDDesigner'
      : domain === 'Materials' ? 'MaterialCheck'
      : domain === 'Power' ? 'PowerBalance'
      : 'Isentropic1D';
  };

  const getConversationalOpening = (domain, model, promptText = '') => {
    const systemType = String(model?.SYSTEM_TYPE || '').toLowerCase();
    if (domain === 'Physics') {
      if (systemType.includes('spring')) {
        return `Nice physics mechanics problem. Since a spring is involved, I’ll treat it as SHM about equilibrium instead of pretending the acceleration stays constant.`;
      }
      if (systemType.includes('inclined')) {
        return `Good inclined-plane mechanics problem. I’ll resolve forces along the slope, include friction, and then compute the motion.`;
      }
      return `Good mechanics problem. I’ll build the free-body equations first, then calculate the motion from the actual force balance.`;
    }
    if (domain === 'Structural' && (systemType.includes('pulley') || systemType.includes('block'))) {
      if (systemType.includes('inclined')) {
        return `Great inclined-plane pulley problem. I can see Block A on the slope and Block B hanging from the pulley, so I’ll resolve the forces along the incline before calculating the motion.`;
      }
      return `Great pulley problem. I can see the setup: one mass on a rough table, another mass hanging over a pulley. Let me solve it carefully and keep the free-body logic tied to the numbers.`;
    }
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Nice, this is a voltage-divider design. Let me choose practical resistor values, then we’ll check the actual output voltage and current draw.`;
    }
    if (domain === 'Circuits') {
      return `Got it, this is a circuits problem. I’ll turn your values into a model, run the electrical calculation, and show the result in plain language.`;
    }
    if (domain === 'Structural') {
      return `Got it, this is a structural mechanics problem. I’ll pull out the geometry, loading, and material assumptions, then check the important response values.`;
    }
    if (domain === 'Aerospace' && (systemType.includes('wing') || /wing|airfoil|lift/i.test(promptText))) {
      return `Good aerospace sizing question. I’ll estimate the finite-wing lift behavior first, then connect that to total lift and induced drag.`;
    }
    if (domain === 'Thermal') {
      return `Good thermal-design problem. I’ll build the heat-flow path and check whether the thermal resistance budget actually works.`;
    }
    if (domain === 'Control') {
      return `Good control problem. I’ll translate the response specs into damping and frequency targets, then tune the controller from there.`;
    }
    if (domain === 'Materials') {
      return `Good materials check. I’ll compare the stress cycle against the material strength limits so the safety factor is easy to interpret.`;
    }
    if (domain === 'Power') {
      return `Good power-systems calculation. I’ll follow the power flow from input to output and account for losses clearly.`;
    }
    return `Got it. I’ll turn your question into the right engineering model and walk through the result clearly.`;
  };

  const formatEngineeringAnswer = ({ domain, model, promptText, flowPlan, opening }) => {
  const guard = flowPlan?.guardrails;
  const contradiction = flowPlan?.contradictions_detected?.[0];
  const formulaLine = getMathematicsLine(domain, model);
  const guardLine = guard?.severity === 'error'
    ? `I found a setup issue that needs correction before a reliable solve: ${guard.recommendations.join(' ')}`
    : guard?.severity === 'warning'
      ? `I can proceed, but I’ll treat these as assumptions: ${guard.recommendations.join(' ')}`
      : 'The model is ready for a first-pass solve with the assumptions shown in the model pane.';
  const intuition = contradiction
    ? `${contradiction.property_a} conflicts with ${contradiction.property_b}. The design task is to improve one side without damaging the other.`
    : getDomainIntuition(domain, model, promptText);

  const safeOpening = opening || getConversationalOpening(domain, model, promptText);
  return `**Description**\n${safeOpening}\n\nI translated your request into a ${domain.toLowerCase()} model and filled the editable model pane with the values and assumptions I can infer.\n\n**Intuition**\n${intuition}\n\n**Mathematics**\n${guardLine} Once you run the simulation, I'll walk through the full numeric calculation here using these values.\n\n**Formula/Laws used**\n${formulaLine}`;
  };

  const normalizeBrainResponse = (message, context) => {
    const text = String(message || '').trim();
    if (/mindmap|Current Routing|Stage\s+\d|SimForge 13-Layer/i.test(text)) {
      return context.fallback;
    }
    if (/\*\*Description\*\*/i.test(text) && /\*\*Mathematics\*\*/i.test(text)) {
      return text;
    }
    return `${formatEngineeringAnswer(context)}\n\n${text}`;
  };

  const formatResultAnswer = ({ domain, model, results, summary, solverName, comparisonText, iterationText }) => {
    const formulaLine = getMathematicsLine(domain, model);
    return `**Description**\nI ran the ${domain.toLowerCase()} model with **${solverName}** and parsed the result back into SimForge.\n\n**Intuition**\n${summary}\n\n**Mathematics**\n${getResultMathematicsLine(results)}\n\n**Formula/Laws used**\n${formulaLine}${comparisonText || `\n\n**Conclusion**\nThe result is now reflected in the plots, metrics, and model history.`}${iterationText || ''}`;
  };

  const getMathematicsLine = (domain, model) => {
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Voltage divider relation: Vout = Vin * R2 / (R1 + R2).`;
    }
    if (domain === 'Circuits') {
      return `Circuit solve uses the generated SPICE-style deck and extracts voltage/current metrics from the operating point or transient result.`;
    }
    if (domain === 'Structural') {
      return `Structural first pass checks stress, deflection, and safety from geometry, material stiffness, and load. For beam-like cases, bending scales roughly with M*c/I.`;
    }
    if (domain === 'Fluids') {
      return `Fluid solve uses boundary velocity, geometry, viscosity, and pressure correction to estimate flow behavior.`;
    }
    if (domain === 'Aerospace') {
      return `Aerospace solve maps geometry and flight condition into lift, drag, Mach, or pressure relations depending on the model.`;
    }
    if (domain === 'Thermal') {
      return `Thermal solve follows heat flow: temperature rise is driven by power times effective thermal resistance.`;
    }
    if (domain === 'Control') {
      return `Control solve forms the closed-loop transfer function and evaluates step-response metrics such as settling time and overshoot.`;
    }
    if (domain === 'Power') {
      return `Power solve balances voltage, current, load, transformer/network parameters, and loss terms.`;
    }
    return `The solver uses the structured model fields as equations, parameters, and boundary conditions.`;
  };

  const getResultMathematicsLine = (results) => {
    const metrics = results?.metrics || [];
    if (!metrics.length) return 'The solver completed, but no scalar metric list was returned for this run.';
    return metrics.slice(0, 5).map(metric => `${metric.name}: ${metric.value}`).join('\n');
  };

  const getDomainIntuition = (domain, model, promptText) => {
    if (domain === 'Structural') return 'Material farther from the neutral axis is usually more valuable for bending stiffness than material near the center.';
    if (domain === 'Circuits') return 'The circuit behavior is controlled by ratios, impedance, and dynamic energy storage, not just individual component values.';
    if (domain === 'Fluids') return 'Flow results are highly sensitive to boundary conditions, geometry, and whether the regime is laminar or turbulent.';
    if (domain === 'Aerospace') return 'Small changes in angle, airfoil shape, or speed can move lift and drag together, so trade-offs matter.';
    if (domain === 'Thermal') return 'Heat wants a low-resistance path to ambient; bottlenecks dominate the final temperature.';
    if (domain === 'Control') return 'Faster response usually competes with overshoot, robustness, or actuator effort.';
    return promptText ? 'I’m keeping the physical assumptions visible so the result stays tied to the actual question.' : 'The intuition comes from the dominant constraint in the model.';
  };

  const getConversationalResultSummary = (domain, model, results) => {
    const systemType = String(model?.SYSTEM_TYPE || '').toLowerCase();
    if (domain === 'Physics') {
      const diagramStatus = results?.visualization_capability?.diagram_status;
      const vizNote = diagramStatus === 'fully_rendered'
        ? 'The schematic/diagram layer has a registered renderer for this problem type.'
        : 'The calculation is complete; the diagram layer will show a transparent fallback if the dedicated template is not ready.';
      return `Here’s the mechanics result:\n\n${results.plain_summary}\n\n${vizNote}`;
    }
    if (domain === 'Structural' && (systemType.includes('pulley') || systemType.includes('block'))) {
      if (systemType.includes('inclined')) {
        return `Here’s what I found for your inclined-plane pulley system:\n\n${results.plain_summary}\n\nThe key check is whether the hanging block’s weight beats the downslope component of Block A plus friction.`;
      }
      return `Here’s what I found for your pulley system:\n\n${results.plain_summary}\n\nThat direction makes sense because the hanging mass has enough weight to overcome friction on the table.`;
    }
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Here’s the divider result:\n\n${results.plain_summary}\n\nOne practical note: this is best for a light signal/reference load. If you need to power something, a regulator is the safer design.`;
    }
    if (domain === 'Control') {
      return `Here’s the controller tuning result:\n\n${results.plain_summary}\n\nThe important idea is that tighter settling time or lower overshoot will move these gains, so we can tune them interactively.`;
    }
    return `Here’s what I found:\n\n${results.plain_summary}`;
  };

  // Rendering decision function for three-tier architecture
  const resolveRendering = (brainOutput, solverResult, domain, model) => {
    const tier = brainOutput?.rendering?.tier;

    // Always use brain-generated SVG. schematicEngine.js hardcoded templates are no longer used.
    const schematicSVG = validateSVGOutput(brainOutput?.svg_output) || null;

    return {
      schematicSVG,
      plotlyPlots: solverResult ? getPlots(solverResult, domain, model) : [],
      svgPlots: brainOutput?.svg_plots || [],
      tier
    };
  };

  // Helper: Get solver name from domain
  const getSolverNameFromDomain = (domain) => {
    const solverMap = {
      'Circuits': 'ngspice',
      'Structural': 'CalculiX',
      'Fluids': 'OpenFOAM',
      'Aerospace': 'XFOIL',
      'Thermal': 'Elmer',
      'Control': 'python-control',
      'Power': 'pandapower',
      'Physics': 'analytical',
      'Materials': 'analytical',
      'Semiconductors': 'ngspice'
    };
    return solverMap[domain] || 'analytical';
  };

  const runSimulationForSession = async (sessId, options = {}) => {
    const inputFile = options.inputFile || sessionInputFiles[sessId];
    if (!inputFile) {
      console.error('[runSimulationForSession] No input file found for session:', sessId);
      return;
    }

    console.log('[runSimulationForSession] inputFile:', inputFile);
    console.log('[runSimulationForSession] inputFile.domain:', inputFile?.domain);
    
    // Use domain from inputFile if available (AI-detected), otherwise activeDomain
    const domain = inputFile?.domain || activeDomain || 'Circuits';
    const systemType = inputFile?.system_type || sessionSystemTypes[sessId] || 'Unknown';
    const solverName = getSolverNameFromDomain(domain);

    setSolverStatus({ name: solverName, state: 'running', detail: `running ${solverName}` });
    setSessionIsSimulationRunning(prev => ({ ...prev, [sessId]: true }));

    // Use backend-aware solver with progress tracking
    const onProgress = (stage, percent, elapsed) => {
      setSolverProgress({ stage, percent, elapsed });
      setSolverStatus(prev => ({ ...prev, detail: `${stage} (${percent.toFixed(0)}%)`, progress: percent }));
    };

    let results;
    try {
      results = await runSolverWithBackend(domain, inputFile, onProgress);
    } catch (err) {
      setSolverStatus({ name: solverName, state: 'error' });
      appendSessionMessage(sessId, {
        id: `m-${Date.now()}-ai`,
        sender: 'ai',
        text: `Solver Error: ${err.message}. Please check your input file and try again.`,
        timestamp: formatTimestamp(new Date())
      });
      return;
    }
    
    const stagedResults = {
      ...results,
      simforge_flow: {
        solver_routing: { solver_name: solverName, domain, system_type: systemType },
        completed_stages: [9, 10],
        stage_11_ready: true
      }
    };
    updateSessionResults(sessId, stagedResults);
    updateResultsState(sessId, 'results');
    setSolverStatus({ name: solverName, state: 'idle' });
    setSessionIsSimulationRunning(prev => ({ ...prev, [sessId]: false }));
    setSessionHasSolverRun(prev => ({ ...prev, [sessId]: true }));

    // Call onComplete callback if provided (for new brain architecture)
    if (options.onComplete && typeof options.onComplete === 'function') {
      options.onComplete(stagedResults);
    }

    logMemoryEvent(
      currentProject.id,
      sessId,
      'solver_run',
      `Ran ${solverName}: solver finished in ${results.metrics?.find(m=>m.name==='Run duration')?.value || '2s'}.`,
      stagedResults.metrics?.reduce((acc, m) => ({ ...acc, [m.name]: m.value }), {})
    );
    updateMemoryState(getMemoryData());

    const newHistoryNode = {
      timestamp: formatTimestamp(new Date()),
      description: `${domain} simulation - ${systemType}`,
      metrics: stagedResults.metrics,
      rawValue: stagedResults
    };
    const currentHist = runHistories[sessId] || [];
    setRunHistories(prev => ({ ...prev, [sessId]: [newHistoryNode, ...currentHist] }));

    // NOTE: the previous "AI Layer 10B: Solver Output Sanity Check" block called
    // checkSolverOutputSanity(), which was never imported or defined anywhere in this
    // file — it silently no-op'd via the try/catch every single run. Removed. We still
    // need `originalQuestion` and `currentInputFile` below for the explanation call.
    let originalQuestion = getActiveMessages().find(m => m.sender === 'user')?.text || 'Engineering analysis';
    const currentInputFile = sessionInputFiles[sessId] || inputFile;

    const baseline = trizBaselines[sessId];
    // BUGFIX: buildComparisonSummary/createIterationSuggestions are now local functions
    // defined at the top of this file (they used to be an unresolved import that threw a
    // ReferenceError here any time `baseline` was set).
    const comparison = baseline
      ? buildComparisonSummary({
          baselineModel: baseline.model,
          modifiedModel: currentInputFile,
          baselineResults: baseline.results,
          modifiedResults: stagedResults,
          principle: baseline.principle
        })
      : null;
    const iterationSuggestions = createIterationSuggestions({
      domain,
      contradiction: trizContradiction,
      hasResults: true,
      mode: 'Engineer'
    });
    const comparisonText = comparison
      ? `\n\n**Conclusion**\n${comparison.metrics.length ? comparison.metrics.map(item => `- ${item.name}: ${item.original} -> ${item.modified}${item.change ? ` (${item.change})` : ''}`).join('\n') : 'This run becomes the comparison anchor because no baseline solver result existed before the design edit.'}\n\n${comparison.verdict}`
      : '';
    const iterationText = `\n\n**Next useful moves**\n${iterationSuggestions.map(item => `- ${item}`).join('\n')}`;

        // STRUCTURED ENGINEERING ANSWER
        // Enforces: Description -> Intuition -> Mathematics -> Formula/Laws used,
        // numbered per sub-question, using the actual solver metrics as ground truth.
        // Falls back to the plain template if the AI call fails for any reason.
        const structuredAnswer = await generateStructuredEngineeringAnswer({
          promptText: originalQuestion,
          solverResult: stagedResults,
          inputFile: currentInputFile,
          domain,
          conversationHistory: buildConversationHistory(sessId),
          provider: selectedProvider
        });

        const explanationText = structuredAnswer
          ? `${structuredAnswer}${comparisonText}${iterationText}`
          : formatResultAnswer({
              domain,
              model: currentInputFile,
              results: stagedResults,
              summary: getConversationalResultSummary(domain, currentInputFile, stagedResults),
              solverName,
              comparisonText,
              iterationText
            });

        // BUGFIX: functional append instead of stale-state overwrite via `messageBase`.
        const aiSummaryMsg = {
          id: `m-${Date.now()}-ai`,
          sender: 'ai',
          text: explanationText,
          timestamp: formatTimestamp(new Date())
        };
        appendSessionMessage(sessId, aiSummaryMsg);
  };

  // BUG FIX: useEffect now lists handleRunSimulation as a dependency so the keyboard
  // shortcut always calls the current version, not a stale closure from mount.
  // WINDSURF PHASE 2: This is called when user clicks "Confirm & Run Simulation"
  const handleRunSimulation = useCallback((fromModelPane = false) => {
    const inputFile = getActiveInputFile();
    if (!inputFile) return;

    // Mark that simulation is running
    setSessionIsSimulationRunning(prev => ({ ...prev, [activeSessionId]: true }));

    const parameters = getActiveParameters();
    
    // Check if there are edited parameters to mention in chat
    const editedParams = parameters.filter(p => p.tag === 'edited' && p.oldValue !== undefined);
    let preRunText = `Running simulation now with ${getSolverName(activeDomain)}...`;
    
    if (fromModelPane && editedParams.length > 0) {
      const paramChanges = editedParams.map(p => 
        `**${p.field}** from **${p.oldValue}** to **${p.value}**`
      ).join(', ');
      preRunText = `Running simulation with updated parameters: ${paramChanges}. Using ${getSolverName(activeDomain)}...`;
    }
    
    const preRunMsg = {
      id: `m-${Date.now()}-ai`,
      sender: 'ai',
      text: preRunText,
      timestamp: formatTimestamp(new Date()),
      animated: true
    };
    // BUGFIX: functional append instead of `updateSessionMessages(id, [...getActiveMessages(), preRunMsg])`,
    // which read a possibly-stale snapshot of messages.
    appendSessionMessage(activeSessionId, preRunMsg);

    runSimulationForSession(activeSessionId, {
      initiatedByChat: !fromModelPane,
      onComplete: (solverResult) => {
        // Mark that solver has completed
        setSessionHasSolverRun(prev => ({ ...prev, [activeSessionId]: true }));
        setSessionIsSimulationRunning(prev => ({ ...prev, [activeSessionId]: false }));
        
        // Store solver results
        setSessionResults(prev => ({
          ...prev,
          [activeSessionId]: solverResult
        }));
        
        // Mark results pane as ready
        setResultsStates(prev => ({
          ...prev,
          [activeSessionId]: 'results'
        }));
        
        // Add completion message if from ModelPane
        if (fromModelPane && editedParams.length > 0) {
          const completionMsg = {
            id: `m-${Date.now()}-ai`,
            sender: 'ai',
            text: `Simulation complete. The Formulated Model, schematic, and results are now using the updated parameter values. ${solverResult?.plain_summary ? `\n\n${solverResult.plain_summary}` : ''}`,
            timestamp: formatTimestamp(new Date()),
            animated: true
          };
          // BUGFIX: functional append instead of `updateSessionMessages(id, [...getActiveMessages(), completionMsg])`.
          appendSessionMessage(activeSessionId, completionMsg);
        }
      }
    });
  }, [activeSessionId, activeDomain, getActiveParameters, runSimulationForSession]);

  // Keyboard Shortcuts Hook
  useEffect(() => {
    const handleGlobalKeys = (e) => {
      // ⌘+Enter or Ctrl+Enter -> Run Simulation
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunSimulation();
      }
      // ⌘+E or Ctrl+E -> Focus Chat Input
      else if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('focus-chat-input'));
      }
      // ⌘+K or Ctrl+K -> Command Palette (DISABLED per user request)
      // else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      //   e.preventDefault();
      //   setPaletteOpen(prev => !prev);
      // }
      // ⌘+/ or Ctrl+/ -> Toggle sidebar collapse
      else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
      // ⌘+. or Ctrl+. -> Cycle active domains
      else if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        const domains = DOMAIN_ORDER;
        const nextIdx = (domains.indexOf(activeDomain) + 1) % domains.length;
        handleSwitchDomain(domains[nextIdx]);
      }
      // ⌘+Z or Ctrl+Z -> Undo parameter edit
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (undoStack.length > 0) {
          e.preventDefault();
          const lastEdit = undoStack[undoStack.length - 1];
          setUndoStack(prev => prev.slice(0, -1));
          
          const inputFile = getActiveInputFile();
          if (inputFile && lastEdit.file_anchor) {
            // Restore using file_anchor
            const lines = inputFile.content.split('\n');
            const targetLine = lastEdit.file_anchor.line - 1;
            if (targetLine >= 0 && targetLine < lines.length) {
              lines[targetLine] = lines[targetLine].replace(lastEdit.newValue, lastEdit.oldValue);
              const restoredInputFile = {
                ...inputFile,
                content: lines.join('\n')
              };
              updateSessionInputFile(activeSessionId, restoredInputFile);
            }
          }
        }
      }
      // Escape -> close everything
      else if (e.key === 'Escape') {
        setMemoryOpen(false);
        setSettingsOpen(false);
        setPaletteOpen(false);
        setTrizWizardActive(false);
        setTrizContradiction(null);
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [activeDomain, activeSessionId, undoStack, handleRunSimulation]);

  // CANCEL SIMULATION RUN
  const handleCancelSimulation = () => {
    if (activeSolverInstance) {
      activeSolverInstance.cancel();
      setActiveSolverInstance(null);
    }
    setSolverStatus({ name: activeDomain === 'Circuits' ? 'ngspice' : 'solver', state: 'idle' });
  };

  // TRIZ WIZARD SOLUTION TRIGGERS (DISABLED - needs refactoring for new architecture)
  // const handleApplyTrizPrinciple = (principle) => {
  //   // TODO: Refactor to work with input_file instead of model
  // };

  // RESTORE SNAPSHOT FROM MEMORY DATABASE
  const handleRestoreModelSnapshot = (snapshotValues) => {
    // TODO: Refactor to work with input_file instead of model
    console.log('[handleRestoreModelSnapshot] Needs refactoring for new architecture');
  };

  // COMPARISON HANDLER - Store base results for comparison
  const handleCreateComparison = (resultsData, modelData) => {
    setComparisonBaseResults({ results: resultsData, model: modelData });
  };

  // ONBOARDING INITIALIZATION
  const handleCompleteOnboarding = (dName, text) => {
    setShowOnboarding(false);
    setActiveDomain(dName);
    handleNewSession(dName, dName === 'Default' ? 'Default Playground' : `${dName} Playground`);
    if (String(text || '').trim()) {
      setTimeout(() => {
        handleSendMessage(text, { useNewPipeline: true });
      }, 200);
    }
  };

  const handleGoHome = () => {
    if (activeSolverInstance) {
      activeSolverInstance.cancel();
      setActiveSolverInstance(null);
    }
    if (liveUpdateMessageTimer.current) {
      clearTimeout(liveUpdateMessageTimer.current);
      liveUpdateMessageTimer.current = null;
    }

    const freshMemory = createFreshMemoryData();
    updateMemoryState(freshMemory);
    sessionStorage.removeItem(SESSION_STATE_KEY);
    setSessionMessages({});
    setSessionInputFiles({});
    setSessionParameters({});
    setSessionResults({});
    setSessionSystemTypes({});
    setResultsStates({});
    setRunHistories({});
    setUndoStack([]);
    setClarificationQueue([]);
    setTrizContradiction(null);
    setTrizWizardActive(false);
    setValidationOpen(false);
    setMemoryOpen(false);
    setSettingsOpen(false);
    setPaletteOpen(false);
    setSolverProgress(null);
    setSolverStatus({ name: 'ngspice', state: 'idle' });
    setActiveDomain('Circuits');
    setShowOnboarding(true);
  };

  const handleClearWorkspace = () => {
    if (!activeSessionId) return;
    if (activeSolverInstance) {
      activeSolverInstance.cancel();
      setActiveSolverInstance(null);
    }
    if (liveUpdateMessageTimer.current) {
      clearTimeout(liveUpdateMessageTimer.current);
      liveUpdateMessageTimer.current = null;
    }

    updateSessionMessages(activeSessionId, []);
    setSessionInputFiles(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setSessionParameters(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setSessionSystemTypes(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setSessionSchematics(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setSessionSVGPlots(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setSessionResults(prev => {
      const next = { ...prev };
      delete next[activeSessionId];
      return next;
    });
    setResultsStates(prev => ({ ...prev, [activeSessionId]: 'empty' }));
    setRunHistories(prev => ({ ...prev, [activeSessionId]: [] }));
    setUndoStack([]);
    setClarificationQueue([]);
    setTrizContradiction(null);
    setTrizWizardActive(false);
    setSolverProgress(null);
    setSolverStatus({ name: activeDomain === 'Circuits' ? 'ngspice' : 'solver', state: 'idle' });
  };

  // Export audit CSV logs
  const handleExportAuditLogs = () => {
    const csvHeader = "Timestamp,Project,Session,Event Type,Summary\n";
    const csvRows = memory.events.map(evt => {
      const projName = memory.projects.find(p=>p.id===evt.projectId)?.name || 'Unknown';
      return `"${evt.timestamp}","${projName}","${evt.sessionId}","${evt.type}","${evt.summary.replace(/"/g, '""')}"`;
    }).join("\n");

    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `simforge_audit_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pre-initialize empty session on initial render
  useEffect(() => {
    if (!activeSession && !showOnboarding) {
      handleNewSession('Circuits');
    }
  }, [activeSessionId, showOnboarding]);

  if (isTooNarrow) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D0F12] text-center p-6 select-none">
        <div className="border border-[#252A32] bg-[#13161A] p-8 rounded-lg max-w-sm" style={{ border: '1px solid var(--border)', borderRadius: '6px' }}>
          <h2 className="text-primary font-semibold text-base" style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Desktop Environment Required</h2>
          <p className="text-secondary text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '12px', lineHeight: '1.5' }}>
            SimForge is a professional engineering IDE designed for high-density, multi-pane desktop simulations. Please resize your window or switch to a desktop browser.
          </p>
        </div>
      </div>
    );
  }

  // Show landing page or main app
  if (showLandingPage) {
    return <LandingPage onNavigateToApp={() => setShowLandingPage(false)} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      
      {/* Onboarding Dialog Overlay */}
      {showOnboarding && (
        <Onboarding onCompleteOnboarding={handleCompleteOnboarding} />
      )}

      {/* Global TopBar Bar */}
      <TopBar
        currentProject={currentProject}
        projects={memory.projects}
        onSwitchProject={handleSwitchProject}
        onNewProject={handleNewProject}
        activeDomain={activeDomain}
        onSwitchDomain={handleSwitchDomain}
        selectedProvider={selectedProvider}
        onSwitchProvider={setSelectedProvider}
        onOpenValidation={() => setValidationOpen(true)}
        onHome={handleGoHome}
      />

      {validationOpen && (
        <ValidationDashboard onClose={() => setValidationOpen(false)} />
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex min-h-0">
        
        {/* LeftSidebar Project Memory Sidebar */}
        <LeftSidebar
          currentProject={currentProject}
          projects={memory.projects}
          onSwitchProject={handleSwitchProject}
          onNewProject={handleNewProject}
          sessions={projectSessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={() => handleNewSession(activeDomain)}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Dynamic Drag-Resizable Workspace Layout Grid */}
        <ResizableLayout
          leftPane={
            <ReasoningPane
              messages={getActiveMessages()}
              onSendMessage={handleSendMessage}
              onClearChat={handleClearWorkspace}
              clarificationQuestions={clarificationQueue}
              onAnswerQuestion={handleClarifyAnswer}
              trizContradiction={trizContradiction}
              onOpenTrizWizard={() => setTrizWizardActive(true)}
              onDismissTriz={() => setTrizContradiction(null)}
              trizWizardActive={trizWizardActive}
              onCloseTrizWizard={() => {
                setTrizWizardActive(false);
                setTrizContradiction(null);
              }}
              activeDomain={activeDomain}
              onEditMessage={handleEditMessage}
              onRetryMessage={handleRetryMessage}
            />
          }
          centerPane={
            <ModelPane
              activeDomain={activeDomain}
              modelData={getActiveInputFile()}
              parameters={getActiveParameters()}
              onUpdateField={handleUpdateField}
              onConfirmAndRun={handleRunSimulation}
              solverProgress={solverProgress}
              onCancelSimulation={handleCancelSimulation}
              versionHistory={getActiveHistory()}
              onRestoreVersion={(node) => handleRestoreModelSnapshot(node.rawValue.metrics.reduce((acc, m)=>({...acc, [m.name]: m.value}), {}))}
              rawSolverInput={getActiveInputFile()?.content || ''}
              livePlaygroundActive={livePlaygroundActive}
              onTogglePlayground={() => setLivePlaygroundActive(!livePlaygroundActive)}
            />
          }
          rightPane={
            <ResultsPane
              activeDomain={activeDomain}
              modelData={getActiveInputFile()}
              resultsState={getActiveResultsState()}
              resultsData={getActiveResults()}
              schematicSVG={getActiveSchematicSVG()}
              svgPlots={getActiveSVGPlots()}
              onSelectSuggestion={(sName) => handleSendMessage(sName, { useNewPipeline: true })}
              runHistory={getActiveHistory()}
              onCompareRun={handleRestoreModelSnapshot}
              livePlaygroundActive={livePlaygroundActive}
              hasSolverRun={getActiveHasSolverRun()}
              isSimulationRunning={getActiveIsSimulationRunning()}
              onCreateComparison={handleCreateComparison}
            />
          }
        />

      </div>

      {/* Global bottom status tracker */}
      <StatusBar
        solverStatus={solverStatus}
        activeDomain={activeDomain}
        memoryCount={memory.events.length}
        onOpenShortcuts={() => {
          setSettingsOpen(true);
        }}
      />

      {/* Modals & Overlays */}
      <MemoryOverlay
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        events={memory.events}
        onLoadModelSnapshot={handleRestoreModelSnapshot}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onExportAuditLogs={handleExportAuditLogs}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={memory.projects}
        sessions={projectSessions}
        onSwitchProject={handleSwitchProject}
        onSelectSession={handleSelectSession}
        onRunSimulation={handleRunSimulation}
        onOpenTrizWizard={() => setTrizWizardActive(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMemory={() => setMemoryOpen(true)}
      />

    </div>
  );
}