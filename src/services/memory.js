// Session-only memory service for Seemulator.
// Data survives refresh in the same browser session, but is cleared when the tab/session ends.

const STORAGE_KEY = 'simforge_memory_data';

const DEFAULT_PROJECTS = [
  { id: 'proj-session', name: 'History' }
];

const INITIAL_SESSIONS = {
  'proj-session': []
};

// Memory events are stored per project to inject context in subsequent runs
const DEFAULT_MEMORY_EVENTS = [];

export function getMemoryData() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse Seemulator memory", e);
    }
  }

  // Set default initial data
  const data = {
    projects: DEFAULT_PROJECTS,
    currentProjectId: 'proj-session',
    sessions: INITIAL_SESSIONS,
    currentSessionId: null,
    events: DEFAULT_MEMORY_EVENTS,
    preferences: {}
  };
  saveMemoryData(data);
  return data;
}

export function saveMemoryData(data) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function logMemoryEvent(projectId, sessionId, type, summary, details = {}) {
  const data = getMemoryData();
  const newEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    projectId,
    sessionId,
    type,
    timestamp: formatTimestamp(new Date()),
    summary,
    details
  };
  
  data.events.unshift(newEvent);
  
  // If it's a preference, update domain preference
  if (type === 'user_preference_observed') {
    const domain = details.domain || 'Circuits';
    if (!data.preferences[domain]) data.preferences[domain] = {};
    data.preferences[domain][details.field] = details.value;
  }
  
  saveMemoryData(data);
  return newEvent;
}

export function formatTimestamp(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[date.getMonth()];
  const d = date.getDate();
  const hrs = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${m} ${d} · ${hrs}:${mins}`;
}
