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
  generateStructuredEngineeringAnswerWithRetry,
  generateFollowupAnswer
} from './services/chatOrchestrator';
import { validateSVGOutput } from './services/svgUtils';
import { getPlots } from './services/plotEngine';
import { executeSolverAndGeneratePlots } from './services/solverExecutor';
import { createComparison, getAllComparisons } from './services/realtimeComparison';
import { processTuningIteration } from './services/liveTuningLoop';

// NEW ARCHITECTURE: Modular Domain Pipeline
import { executeFullPipeline, processQuestion, runSimulation, generatePlots, generateSchematic, getSupportedDomains } from './services/domainPipeline';
import { solveCircuitQuestion, solveCircuitQuestionStream, looksLikeCircuitsQuestion } from './services/circuitsClient';
import { parseChatCommand } from './services/chatCommandParser';

// LEGACY IMPORTS - Kept for backward compatibility during migration
import { OptimizedContextBuilder } from './services/contextServices';
// NOTE: buildComparisonSummary / createIterationSuggestions were previously imported from
// './services/simforgeFlow' but that import was commented out while the calls to those
// functions were NOT removed - this meant runSimulationForSession() threw an uncaught
// ReferenceError any time a TRIZ baseline existed. Local, dependency-free fallbacks are
// defined further down in this file (search BUGFIX: local fallbacks) until a real
// simforgeFlow service is wired back in.

const DOMAIN_ORDER = ['Circuits'];

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

// BUGFIX: sessionStorage has a hard quota (~5-10MB depending on browser).
// This snapshot includes sessionResults, which for Circuits carries the full
// standardized solver result per session — schematic SVG markup and
// transient/AC time-series arrays included. Those can individually run to
// hundreds of KB, and previously this call had no error handling at all, so
// once a session's accumulated results crossed the quota, setItem() threw an
// uncaught QuotaExceededError from inside a useEffect and crashed the entire
// React tree (see the error boundary message in the console). A failed
// "persist so a refresh doesn't lose the session" write should never be
// allowed to take down a live, working session.
//
// Fix: try the full write first (cheapest path, keeps everything restorable
// after a refresh in the common case). On QuotaExceededError specifically,
// strip the heavy, regenerate-on-next-run fields (schematic_svg, time_series,
// frequency_response) out of sessionResults and retry once — losing those on
// a refresh just means the schematic/plot re-renders from the next solver
// run instead of from a stale cached snapshot, which is an acceptable
// trade-off for not crashing. If it still can't fit (or storage is otherwise
// unusable, e.g. private browsing with storage disabled), log and continue —
// the in-memory app state is untouched either way.
function saveSessionStateSnapshot(snapshot) {
  try {
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(snapshot));
    return;
  } catch (err) {
    const isQuotaError = err && (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );

    if (!isQuotaError) {
      console.error('[Session Persistence] Failed to save session state:', err);
      return;
    }

    try {
      const trimmedResults = {};
      for (const [sessId, res] of Object.entries(snapshot.sessionResults || {})) {
        if (res && typeof res === 'object') {
          const { schematic_svg, time_series, frequency_response, ...rest } = res;
          trimmedResults[sessId] = rest;
        } else {
          trimmedResults[sessId] = res;
        }
      }
      sessionStorage.setItem(
        SESSION_STATE_KEY,
        JSON.stringify({ ...snapshot, sessionResults: trimmedResults })
      );
      console.warn('[Session Persistence] sessionStorage quota exceeded — saved session without cached schematic/plot data (they will regenerate on the next run).');
    } catch (retryErr) {
      console.error('[Session Persistence] Failed to save session state even after trimming heavy fields. Session will not survive a page refresh, but the current app state is unaffected.', retryErr);
    }
  }
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

  // Update a specific message's content in-place (used for streaming stage updates).
  const updateSessionMessageContent = (sessId, msgId, updater) => {
    setSessionMessages(prev => ({
      ...prev,
      [sessId]: (prev[sessId] || []).map(m =>
        m.id === msgId ? { ...m, ...updater(m) } : m
      )
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
    if (domain === 'Circuits') {
      if (model.SYSTEM_TYPE === 'Voltage Divider') {
        return `Vin ${model.INPUT?.['Supply voltage']?.value || model.INPUT?.['Input voltage']?.value}, target ${model.OUTPUT?.['Target voltage']?.value}, R1 ${model.COMPONENTS?.['Top resistor (R1)']?.value}, R2 ${model.COMPONENTS?.['Bottom resistor (R2)']?.value}`;
      }
      return `Vin ${model.INPUT?.['Supply voltage']?.value}, load ${model.OUTPUT?.['Load current']?.value}, L ${model.COMPONENTS?.['Inductor (L1)']?.value}, C ${model.COMPONENTS?.['Capacitor (C1)']?.value}`;
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

  // SWITCH DOMAINS — Circuits is the only domain
  const handleSwitchDomain = (dName) => {
    if (dName !== 'Circuits') return;
    setActiveDomain('Circuits');
    const matchingSession = projectSessions.find(s => s.domain === 'Circuits');
    if (matchingSession) {
      handleSelectSession(matchingSession.id);
    } else {
      handleNewSession('Circuits');
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

  // PHASE 4: Handle chat-driven edit commands (bidirectional control)
  const _handleChatEditCommand = (cmd, sessId, inputFile, parameters) => {
    const param = cmd.param;
    if (!param || !param.file_anchor) {
      appendSessionMessage(sessId, {
        id: `m-${Date.now()}-ai-cmd`, sender: 'ai',
        text: `I found **${cmd.field}** in the model but can't edit it (no file anchor). Try editing it in the Formulated Model pane.`,
        timestamp: formatTimestamp(new Date()),
      });
      return;
    }

    const lines = (inputFile?.content || '').split('\n');
    const targetLine = param.file_anchor.line - 1;
    if (targetLine < 0 || targetLine >= lines.length) {
      appendSessionMessage(sessId, {
        id: `m-${Date.now()}-ai-cmd`, sender: 'ai',
        text: `Can't locate **${cmd.field}** in the input file for editing.`,
        timestamp: formatTimestamp(new Date()),
      });
      return;
    }

    const oldLine = lines[targetLine];
    const newLine = oldLine.replace(param.file_anchor.match, cmd.newValue);
    if (oldLine === newLine) {
      appendSessionMessage(sessId, {
        id: `m-${Date.now()}-ai-cmd`, sender: 'ai',
        text: `Couldn't apply the edit — the value **${cmd.newValue}** doesn't match what's in the file. The current value might have changed.`,
        timestamp: formatTimestamp(new Date()),
      });
      return;
    }

    lines[targetLine] = newLine;
    const updatedInputFile = { ...inputFile, content: lines.join('\n') };
    updateSessionInputFile(sessId, updatedInputFile);

    const updatedParameters = parameters.map(p => {
      if (p.section === param.section && p.field === param.field) {
        return { ...p, value: cmd.newValue, tag: 'edited', oldValue: p.value,
          file_anchor: { ...p.file_anchor, match: cmd.newValue } };
      }
      return p;
    });
    setSessionParameters(prev => ({ ...prev, [sessId]: updatedParameters }));

    const editMsg = `Updated **${cmd.field}** from **${cmd.oldValue}** to **${cmd.newValue}**.`;
    appendSessionMessage(sessId, {
      id: `m-${Date.now()}-ai-cmd`, sender: 'ai', text: editMsg,
      timestamp: formatTimestamp(new Date()), animated: true
    });

    if (cmd.shouldRun) {
      setTimeout(() => handleRunSimulation(true), 500);
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

    // ── PHASE 4: BIDIRECTIONAL CONTROL ────────────────────────────
    const currentParams = sessionParameters[targetSessionId] || [];
    const currentInputFile = sessionInputFiles[targetSessionId] || null;
    const currentResults = sessionResults[targetSessionId] || null;
    const cmd = parseChatCommand(text, currentParams, currentInputFile, currentResults);
    if (cmd) {
      if (cmd.type === 'display') {
        appendSessionMessage(targetSessionId, {
          id: `m-${Date.now()}-ai-cmd`, sender: 'ai', text: cmd.reply,
          timestamp: formatTimestamp(new Date()), animated: true
        });
        return;
      }
      if (cmd.type === 'edit') {
        _handleChatEditCommand(cmd, targetSessionId, currentInputFile, currentParams);
        return;
      }
    }

    // ── SMART ROUTING ──────────────────────────────────────────────
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
      isLoading: true,
      animated: true
    };
    appendSessionMessage(targetSessionId, loadingMsg);

    try {
      let pipelineResult;

      console.log('[Circuits Detection] Question:', engineeringText);
      console.log('[Circuits Detection] Is circuits?', looksLikeCircuitsQuestion(engineeringText));
      console.log('[FLOW TRACE] 1/9 App.jsx — circuits detection passed, routing to circuitsClient.js');

      if (looksLikeCircuitsQuestion(engineeringText)) {
        // NEW: single AI call generates netlist -> ngspice simulates ->
        // Lcapy draws schematic. Bypasses classifier.js / netlister.js /
        // circuits schematicGenerator.js / the circuits branches of
        // solvers.js entirely for this domain only.
        // conversationHistory is forwarded so the backend can maintain context across
        // turns (see services/circuitsClient.js — the backend endpoint /api/circuits/solve
        // needs to accept and use the `history` field).
        console.log('[Circuits Pipeline] Calling solveCircuitQuestionStream');
        const stageLines = [];
        let modelParameters = null;
        let modelInputFile = null;
        let streamedAnswer = '';
        const circuitResult = await solveCircuitQuestionStream(
          engineeringText, selectedProvider,
          (ev) => {
            const s = ev.stage, st = ev.status;
            const sd = ev.sub_domain || '';

            // New Seemulator contract: model event arrives early with the
            // structured parameters and the active input file.
            if (s === 'model') {
              modelParameters = ev.parameters || [];
              modelInputFile = ev.input_file || null;
              return;
            }

            const icons = { call1:'🧠', classification:'🔍', input_generation:'📝', execution:'⚡', schematic:'📐', proof_of_work:'🔬', answer_generation:'✍️' };
            const ic = icons[s] || '⚙️';
            const sdLbl = {
              analog_sim: 'Analog',
              symbolic_analysis: 'Symbolic',
              digital_logic: 'Digital',
              numerical_processing: 'Numerical',
              control_systems: 'Control',
              rf_em: 'RF/EM',
              pcb_realization: 'PCB',
              fpga_realization: 'FPGA',
              semiconductor_device: 'Semi',
              physical_design: 'Phys Design',
            }[sd] || 'Analysis';
            let line = null;
            if (s === 'call1' && st === 'start') line = '🧠 Call 1: Selecting sub-domains + generating inputs (1 AI call)...';
            else if (s === 'call1' && st === 'done') line = `🧠 Call 1 done: ${ev.detail || 'selections ready'}`;
            else if (s === 'call1' && st === 'failed') line = `🧠 Call 1 failed: ${ev.error}`;
            else if (s === 'call1' && st === 'out_of_scope') line = '🧠 Question is out of scope for circuits analysis.';
            else if (s === 'call1' && st === 'no_selection') line = '🧠 No sub-domains selected for this question.';
            else if (s === 'classification' && st === 'done') {
              const idx = ev.total_selections > 1 ? ` [${ev.selection_index + 1}/${ev.total_selections}]` : '';
              line = `${ic} Classified → ${ev.sub_domain} / ${ev.tool}${idx}`;
            }
            else if (s === 'input_generation' && st === 'start') line = `${ic} ${sdLbl}: generating input...`;
            else if (s === 'input_generation' && st === 'attempt_start') line = `${ic} ${sdLbl}: attempt ${ev.attempt}/${ev.max_attempts}`;
            else if (s === 'input_generation' && st === 'repair_needed') line = `${ic} ${sdLbl}: repairing (attempt ${ev.attempt})...`;
            else if (s === 'input_generation' && st === 'done') line = `${ic} ${sdLbl}: input ready (${ev.system_type || 'ok'})`;
            else if (s === 'input_generation' && st === 'failed') line = `${ic} ${sdLbl}: input failed: ${ev.error}`;
            else if (s === 'execution' && st === 'start') line = `${ic} ${sdLbl}: running ${ev.tool}...`;
            else if (s === 'execution' && st === 'done') line = `${ic} ${sdLbl}: execution complete`;
            else if (s === 'execution' && st === 'failed') line = `${ic} ${sdLbl}: execution failed: ${ev.error}`;
            else if (s === 'schematic' && st === 'start') line = `${ic} ${sdLbl}: rendering schematic...`;
            else if (s === 'schematic' && st === 'done') line = `${ic} ${sdLbl}: schematic rendered`;
            else if (s === 'schematic' && st === 'failed') line = `${ic} ${sdLbl}: schematic failed: ${ev.error}`;
            else if (s === 'proof_of_work' && st === 'done') line = `${ic} ${sdLbl}: verified: ${ev.detail}`;
            else if (s === 'proof_of_work' && st === 'failed') line = `${ic} ${sdLbl}: check failed: ${ev.detail}`;
            else if (s === 'answer_chunk') {
              streamedAnswer += ev.text || '';
              updateSessionMessageContent(targetSessionId, loadingMsgId, () => ({
                text: streamedAnswer,
                isLoading: true,
              }));
              return;
            }
            else if (s === 'answer_generation' && st === 'start') line = '✍️ Call 2: Generating structured answer (1 AI call)...';
            else if (s === 'answer_generation' && st === 'failed') line = `✍️ Answer generation failed: ${ev.error}`;
            else if (s === 'answer_done') return;
            if (line) {
              stageLines.push(line);
              updateSessionMessageContent(targetSessionId, loadingMsgId, (m) => ({
                text: stageLines.join('\n'),
              }));
            }
          },
          {
            history: conversationHistory,
            activeInputFile: typeof currentInputFile === 'string' ? currentInputFile : currentInputFile?.content || null,
            parameters: currentParams || [],
            rerun: false,
            subDomain: null,
            inputFile: null,
          }
        );
        console.log('[Circuits Pipeline] Got result:', circuitResult);
        
        if (!circuitResult) {
          throw new Error('Circuit pipeline returned no result. The backend may have encountered an error.');
        }
        
        // Prefer the structured Seemulator model event if it arrived. It already
        // contains editable parameters with file_anchor, unit, min/max, and the
        // active input file. Fall back to the legacy metrics→parameters conversion
        // only when the backend still emits the old format.
        let parameters = [];
        const netlist = modelInputFile || circuitResult.netlist || '';

        if (modelParameters && modelParameters.length > 0) {
          parameters = modelParameters.map((p, idx) => ({
            id: p.id || p.name || `param_${idx}`,
            name: p.name || p.id || `Parameter ${idx + 1}`,
            field: p.id || p.name || `param_${idx}`,
            value: String(p.value),
            unit: p.unit || '',
            min: p.min,
            max: p.max,
            step: p.step,
            file_anchor: p.file_anchor || null,
            editable: p.editable !== false,
            tag: p.editable !== false ? 'stated' : 'default',
            section: p.section || (p.editable !== false ? 'COMPONENTS' : 'RESULTS'),
          }));
        } else {
          // Legacy conversion: metrics + netlist → editable parameters.
          const netlistLines = netlist.split('\n');
          const componentRegex = /^([A-Z]+\d+)\s+(\d+)\s+(\d+)\s+(.+)$/i;

          for (const m of (circuitResult.metrics || [])) {
            let foundAnchor = null;
            let isComponent = false;

            for (let i = 0; i < netlistLines.length; i++) {
              const line = netlistLines[i].trim();
              if (!line || line.startsWith('*') || line.startsWith('.')) continue;
              const match = line.match(componentRegex);
              if (match) {
                const ref = match[1];
                const valueStr = match[4].trim();
                if (m.name === ref || m.name === ref.replace(/(\d+)$/, ' ($1)')) {
                  foundAnchor = { line: i + 1, match: valueStr.split(/\s+/)[0] };
                  isComponent = true;
                  break;
                }
              }
            }

            parameters.push({
              field: m.name,
              value: String(m.value),
              unit: '',
              tag: isComponent ? 'stated' : 'default',
              editable: isComponent,
              section: isComponent ? 'COMPONENTS' : 'RESULTS',
              ...(foundAnchor ? { file_anchor: foundAnchor } : {})
            });
          }
        }

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
          _structuredAnswer: circuitResult._structured_answer || null,
          processingResult: {
            classification: {
              domain: 'Circuits',
              systemType: circuitResult.system_type,
              confidence: 1.0
            },
            inputFile: {
              filename: 'circuit.cir',
              content: netlist,
              metadata: { system_type: circuitResult.system_type, domain: 'Circuits' }
            },
            parameters: parameters,
            extractionInfo: { assumptions: circuitResult.assumptions || [] }
          },
          simulationResult: {
            success: circuitResult.status === 'completed' || circuitResult.success === true,
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
      // BUGFIX (previous): this replaces the old two raw, unformatted messages
      // that used to be posted here. Neither of those ever matched
      // ENGINEERING_ANSWER_FORMAT_INSTRUCTIONS.
      //
      // BUGFIX (this pass): use generateStructuredEngineeringAnswerWithRetry
      // instead of a single unretried call. Previously a single transient
      // failure (e.g. rate limiting on the 2nd/3rd AI call in the same turn)
      // silently fell through to the thin hardcoded formatResultAnswer()
      // template with no visibility into why. The retry wrapper logs each
      // attempt's error to the console so failures are diagnosable, and
      // gives a second try with backoff before giving up.
      const solverResultForAnswer = (simulationResult && simulationResult.success)
        ? simulationResult.parsedResult
        : null;

      let explanationText;
      if (pipelineResult._structuredAnswer) {
        explanationText = pipelineResult._structuredAnswer;
      } else {
        const structuredAnswer = await generateStructuredEngineeringAnswerWithRetry({
          promptText: engineeringText,
          solverResult: solverResultForAnswer,
          inputFile: processingResult.inputFile,
          domain: processingResult.classification.domain,
          conversationHistory,
          provider: selectedProvider
        });

        const fallbackOpening = getConversationalOpening(
          processingResult.classification.domain,
          processingResult.inputFile,
          engineeringText
        );

        explanationText = structuredAnswer
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
      }

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
          [targetSessionId]: simulationResult.solverResult || simulationResult.parsedResult
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

  // Helper to get domain config — Circuits only
  function getDomainConfig(domain) {
    if (domain === 'Circuits') {
      return { solver: 'ngspice' };
    }
    return null;
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

  // UPDATE FIELD PARAMETER VALUE (via file_anchor) — used for single inline
  // (non-slider) edits confirmed one at a time via the pencil/check icon.
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

  // Run a ModelPane edit for Circuits through the backend Seemulator rerun
  // contract. Skips CALL 1, applies the edited parameters server-side, re-runs
  // ngspice, and streams a fresh Call 2 answer that explains the new numbers.
  const runCircuitsRerun = async (updatedInputFile, updatedParameters, runMsgId) => {
    const stageLines = [];
    let modelParameters = null;
    let modelInputFile = null;
    let streamedAnswer = '';

    const firstUserText = getActiveMessages().find(m => m.sender === 'user')?.text
      || 'Re-run with updated parameters';
    const activeSubDomain = getActiveResults()?.sub_domain || 'analog_sim';

    try {
      const circuitResult = await solveCircuitQuestionStream(
        firstUserText,
        selectedProvider,
        (ev) => {
          if (ev.stage === 'model') {
            modelParameters = ev.parameters || [];
            modelInputFile = ev.input_file || null;
            return;
          }

          const s = ev.stage, st = ev.status;
          const sd = ev.sub_domain || '';
          const icons = { call1:'🧠', classification:'🔍', input_generation:'📝', execution:'⚡', schematic:'📐', proof_of_work:'🔬', answer_generation:'✍️' };
          const ic = icons[s] || '⚙️';
          const sdLbl = {
            analog_sim: 'Analog',
            symbolic_analysis: 'Symbolic',
            digital_logic: 'Digital',
            numerical_processing: 'Numerical',
            control_systems: 'Control',
            rf_em: 'RF/EM',
            pcb_realization: 'PCB',
            fpga_realization: 'FPGA',
            semiconductor_device: 'Semi',
            physical_design: 'Phys Design',
          }[sd] || 'Analysis';
          let line = null;
          if (s === 'classification' && st === 'done') line = `${ic} Classified → ${ev.sub_domain} / ${ev.tool}`;
          else if (s === 'input_generation' && st === 'done') line = `${ic} ${sdLbl}: input ready (${ev.system_type || 'ok'})`;
          else if (s === 'execution' && st === 'done') line = `${ic} ${sdLbl}: execution complete`;
          else if (s === 'schematic' && st === 'done') line = `${ic} ${sdLbl}: schematic rendered`;
          else if (s === 'proof_of_work' && st === 'done') line = `${ic} ${sdLbl}: verified: ${ev.detail}`;
          else if (s === 'answer_generation' && st === 'start') line = '✍️ Re-explaining results with updated parameters...';
          else if (s === 'answer_chunk') {
            streamedAnswer += ev.text || '';
            updateSessionMessageContent(activeSessionId, runMsgId, () => ({
              text: streamedAnswer,
              isLoading: true,
            }));
            return;
          }
          else if (s === 'answer_done') return;
          else if (s === 'error') line = `⚠️ Error: ${ev.error}`;
          if (line) {
            stageLines.push(line);
            updateSessionMessageContent(activeSessionId, runMsgId, () => ({
              text: stageLines.join('\n'),
            }));
          }
        },
        {
          history: buildConversationHistory(activeSessionId),
          activeInputFile: updatedInputFile.content,
          parameters: updatedParameters.map(p => ({
            id: p.id || p.field,
            name: p.name || p.field,
            value: p.value,
            unit: p.unit || '',
            min: p.min,
            max: p.max,
            step: p.step,
            file_anchor: p.file_anchor,
            editable: p.editable !== false,
            section: p.section,
          })),
          rerun: true,
          subDomain: activeSubDomain,
          inputFile: updatedInputFile.content,
        }
      );

      if (!circuitResult) {
        throw new Error('Rerun returned no result from the backend.');
      }

      // Map backend model parameters to the frontend UI shape.
      let parameters = [];
      const netlist = modelInputFile || circuitResult.netlist || updatedInputFile.content || '';
      if (modelParameters && modelParameters.length > 0) {
        parameters = modelParameters.map((p, idx) => ({
          id: p.id || p.name || `param_${idx}`,
          name: p.name || p.id || `Parameter ${idx + 1}`,
          field: p.id || p.name || `param_${idx}`,
          value: String(p.value),
          unit: p.unit || '',
          min: p.min,
          max: p.max,
          step: p.step,
          file_anchor: p.file_anchor || null,
          editable: p.editable !== false,
          tag: p.editable !== false ? 'stated' : 'default',
          section: p.section || (p.editable !== false ? 'COMPONENTS' : 'RESULTS'),
        }));
      } else {
        parameters = updatedParameters;
      }

      updateSessionInputFile(activeSessionId, { ...updatedInputFile, content: netlist });
      setSessionParameters(prev => ({ ...prev, [activeSessionId]: parameters }));
      setSessionResults(prev => ({ ...prev, [activeSessionId]: circuitResult }));
      setResultsStates(prev => ({ ...prev, [activeSessionId]: 'results' }));
      setSessionHasSolverRun(prev => ({ ...prev, [activeSessionId]: true }));

      if (circuitResult.schematic_svg) {
        setSessionSchematics(prev => ({ ...prev, [activeSessionId]: circuitResult.schematic_svg }));
      }

      const plotResult = generatePlots({
        success: true,
        parsedResult: circuitResult,
        domain: 'Circuits'
      });
      if (plotResult && plotResult.success) {
        setSessionPlots(prev => ({ ...prev, [activeSessionId]: plotResult.allPlots }));
      }

      // Replace the loading message with the new structured answer.
      const answerText = circuitResult._structured_answer || '';
      updateSessionMessageContent(activeSessionId, runMsgId, () => ({
        text: answerText,
        isLoading: false,
        animated: false,
      }));
    } catch (error) {
      console.error('[Circuits Rerun] Error:', error);
      updateSessionMessageContent(activeSessionId, runMsgId, () => ({
        text: `Rerun failed: ${error.message}`,
        isLoading: false,
      }));
    } finally {
      setSessionIsSimulationRunning(prev => ({ ...prev, [activeSessionId]: false }));
    }
  };

  // changed slider followed by a synchronous onConfirmAndRun(true) call —
  // that pattern silently dropped all but the last edit in a multi-slider
  // batch (each onUpdateField call read the same stale getActiveInputFile/
  // getActiveParameters snapshot) and simulated the PRE-edit file (because
  // React hadn't committed any setState calls yet when onConfirmAndRun ran
  // in the same synchronous tick).
  const handleApplyChangesAndRun = (changes) => {
    if (!changes || changes.length === 0) return;
    const inputFile = getActiveInputFile();
    const parameters = getActiveParameters();
    if (!inputFile) {
      console.error('[handleApplyChangesAndRun] No input file found');
      return;
    }

    // Apply ALL edits to local copies together — each edit builds on the
    // previous one's already-modified content within this same pass, rather
    // than each being computed against the same stale pre-batch snapshot.
    const lines = inputFile.content.split('\n');
    const updatedParameters = [...parameters];

    changes.forEach(change => {
      const idx = updatedParameters.findIndex(
        p => p.section === change.section && p.field === change.field
      );
      if (idx === -1) return;
      const param = updatedParameters[idx];

      // Sub-domains without a file_anchor (symbolic_analysis, control_systems,
      // digital_logic, numerical_processing) don't use netlist-line
      // substitution — their rerun input is a JSON plan patched server-side
      // by parameter id. Still update the parameter's own value/tag so the
      // edit isn't silently dropped; the backend applies it via `id` on rerun.
      if (!param.file_anchor) {
        updatedParameters[idx] = {
          ...param,
          value: change.value,
          tag: 'edited',
          oldValue: param.value,
        };
        return;
      }

      const targetLine = param.file_anchor.line - 1;
      if (targetLine < 0 || targetLine >= lines.length) return;

      const oldLine = lines[targetLine];
      const newLine = oldLine.replace(param.file_anchor.match, change.value);
      if (oldLine === newLine) return;

      lines[targetLine] = newLine;
      updatedParameters[idx] = {
        ...param,
        value: change.value,
        tag: 'edited',
        oldValue: param.value,
        // Keep file_anchor.match in sync so a SUBSEQUENT edit on this same
        // line (within a future batch) still finds the right substring.
        file_anchor: { ...param.file_anchor, match: change.value }
      };
    });

    const updatedInputFile = { ...inputFile, content: lines.join('\n') };

    // Commit state once.
    updateSessionInputFile(activeSessionId, updatedInputFile);
    setSessionParameters(prev => ({ ...prev, [activeSessionId]: updatedParameters }));

    const paramChanges = changes
      .map(c => `**${c.field}** from **${c.oldValue}** to **${c.value}**`)
      .join(', ');

    const runMsgId = `m-${Date.now()}-ai`;
    appendSessionMessage(activeSessionId, {
      id: runMsgId,
      sender: 'ai',
      text: `Running simulation with updated parameters: ${paramChanges}. Using ${getSolverName(activeDomain)}...`,
      timestamp: formatTimestamp(new Date()),
      animated: true,
      isLoading: true
    });

    setSessionIsSimulationRunning(prev => ({ ...prev, [activeSessionId]: true }));

    // For Circuits, use the backend Seemulator rerun contract so the AI can
    // re-explain the circuit with the new parameter values. For all other
    // domains, fall back to the generic solver path.
    if (inputFile?.domain === 'Circuits' || activeDomain === 'Circuits') {
      runCircuitsRerun(updatedInputFile, updatedParameters, runMsgId);
    } else {
      runSimulationForSession(activeSessionId, { inputFile: updatedInputFile });
    }
  };

  const getSolverName = (domain) => {
    return domain === 'Circuits' ? 'ngspice' : 'solver';
  };

  const getConversationalOpening = (domain, model, promptText = '') => {
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Nice, this is a voltage-divider design. Let me choose practical resistor values, then we’ll check the actual output voltage and current draw.`;
    }
    if (domain === 'Circuits') {
      return `Got it, this is a circuits problem. I’ll turn your values into a model, run the electrical calculation, and show the result in plain language.`;
    }
    return `Got it. I’ll turn your question into a circuit model and walk through the result clearly.`;
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
    if (/mindmap|Current Routing|Stage\s+\d|Seemulator 13-Layer/i.test(text)) {
      return context.fallback;
    }
    if (/\*\*Description\*\*/i.test(text) && /\*\*Mathematics\*\*/i.test(text)) {
      return text;
    }
    return `${formatEngineeringAnswer(context)}\n\n${text}`;
  };

  const formatResultAnswer = ({ domain, model, results, summary, solverName, comparisonText, iterationText }) => {
    const formulaLine = getMathematicsLine(domain, model);
    return `**Description**\nI ran the ${domain.toLowerCase()} model with **${solverName}** and parsed the result back into Seemulator.\n\n**Intuition**\n${summary}\n\n**Mathematics**\n${getResultMathematicsLine(results)}\n\n**Formula/Laws used**\n${formulaLine}${comparisonText || `\n\n**Conclusion**\nThe result is now reflected in the plots, metrics, and model history.`}${iterationText || ''}`;
  };

  const getMathematicsLine = (domain, model) => {
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Voltage divider relation: Vout = Vin * R2 / (R1 + R2).`;
    }
    if (domain === 'Circuits') {
      return `Circuit solve uses the generated SPICE-style deck and extracts voltage/current metrics from the operating point or transient result.`;
    }
    return `The solver uses the structured model fields as equations, parameters, and boundary conditions.`;
  };

  const getResultMathematicsLine = (results) => {
    const metrics = results?.metrics || [];
    if (!metrics.length) return 'The solver completed, but no scalar metric list was returned for this run.';
    return metrics.slice(0, 5).map(metric => `${metric.name}: ${metric.value}`).join('\n');
  };

  const getDomainIntuition = (domain, model, promptText) => {
    if (domain === 'Circuits') return 'The circuit behavior is controlled by ratios, impedance, and dynamic energy storage, not just individual component values.';
    return promptText ? 'I’m keeping the circuit assumptions visible so the result stays tied to the actual question.' : 'The intuition comes from the dominant constraint in the circuit model.';
  };

  const getConversationalResultSummary = (domain, model, results) => {
    if (domain === 'Circuits' && model?.SYSTEM_TYPE === 'Voltage Divider') {
      return `Here’s the divider result:\n\n${results.plain_summary}\n\nOne practical note: this is best for a light signal/reference load. If you need to power something, a regulator is the safer design.`;
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
    return domain === 'Circuits' ? 'ngspice' : 'analytical';
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
      setSessionIsSimulationRunning(prev => ({ ...prev, [sessId]: false }));
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
    // Falls back to the plain template only if BOTH retry attempts fail.
    //
    // BUGFIX: now uses generateStructuredEngineeringAnswerWithRetry instead of a
    // single unretried call, so a transient failure (rate limit on this being the
    // 2nd/3rd AI call of the turn) gets one automatic retry with backoff instead
    // of immediately and silently falling back to the thin template.
    const structuredAnswer = await generateStructuredEngineeringAnswerWithRetry({
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
    setMemoryOpen(false);
    setSettingsOpen(false);
    setPaletteOpen(false);
    setSolverProgress(null);
    setSolverStatus({ name: 'ngspice', state: 'idle' });
    setActiveDomain('Circuits');
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
    link.setAttribute("download", `seemulator_audit_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pre-initialize empty session on initial render
  useEffect(() => {
    if (!activeSession) {
      handleNewSession('Circuits');
    }
  }, [activeSessionId]);

  if (isTooNarrow) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0D0F12] text-center p-6 select-none">
        <div className="border border-[#252A32] bg-[#13161A] p-8 rounded-lg max-w-sm" style={{ border: '1px solid var(--border)', borderRadius: '6px' }}>
          <h2 className="text-primary font-semibold text-base" style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>Desktop Environment Required</h2>
          <p className="text-secondary text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '12px', lineHeight: '1.5' }}>
            Seemulator is a professional engineering IDE designed for high-density, multi-pane desktop simulations. Please resize your window or switch to a desktop browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

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
        onHome={handleGoHome}
      />

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
              onApplyChangesAndRun={handleApplyChangesAndRun}
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