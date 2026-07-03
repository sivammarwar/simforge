const events = [];

export function recordTelemetry(event, properties = {}) {
  const item = {
    event,
    properties,
    timestamp: new Date().toISOString()
  };
  events.push(item);
  if (events.length > 1000) events.shift();
  return item;
}

export function getTelemetrySnapshot() {
  return {
    total_events: events.length,
    recent: events.slice(-100)
  };
}

