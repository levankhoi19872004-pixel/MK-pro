'use strict';

// Dependency-free startup tracer. Keep this module safe to require before Express,
// Mongoose, the logger, or application configuration are loaded.
const PROCESS_STARTED_AT_MS = Date.now();
const MAX_EVENTS = 48;

const state = {
  stage: 'module_loaded',
  lastEventAt: new Date(PROCESS_STARTED_AT_MS).toISOString(),
  httpListening: false,
  applicationReady: false,
  events: []
};

function enabled() {
  return String(process.env.BOOT_TRACE_ENABLED || 'true').trim().toLowerCase() !== 'false';
}

function safeText(value, maxLength = 180) {
  const text = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function safeDetails(details = {}) {
  const allowed = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (value == null) continue;
    if (['mongoUri', 'uri', 'token', 'cookie', 'authorization', 'password', 'secret'].some((needle) => key.toLowerCase().includes(needle))) continue;
    if (typeof value === 'number' || typeof value === 'boolean') allowed[key] = value;
    else allowed[key] = safeText(value);
  }
  return allowed;
}

function write(event) {
  if (!enabled()) return;
  try {
    process.stderr.write(`[BOOT_TRACE] ${JSON.stringify(event)}\n`);
  } catch (_) {
    // Startup diagnostics must never break startup.
  }
}

function emit(stage, details = {}) {
  const now = Date.now();
  const normalizedStage = safeText(stage || 'unknown', 96) || 'unknown';
  const event = {
    stage: normalizedStage,
    at: new Date(now).toISOString(),
    elapsedMs: Math.max(0, now - PROCESS_STARTED_AT_MS),
    pid: process.pid,
    ...safeDetails(details)
  };

  state.stage = normalizedStage;
  state.lastEventAt = event.at;
  if (normalizedStage === 'http_listening') state.httpListening = true;
  if (normalizedStage === 'application_ready') state.applicationReady = true;
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  write(event);
  return event;
}

function publicSnapshot() {
  const now = Date.now();
  return {
    stage: state.stage,
    elapsedMs: Math.max(0, now - PROCESS_STARTED_AT_MS),
    lastEventAt: state.lastEventAt,
    httpListening: state.httpListening,
    applicationReady: state.applicationReady
  };
}

function snapshot() {
  return {
    ...publicSnapshot(),
    events: state.events.map((event) => ({ ...event }))
  };
}

function parseWatchdogMs(value, fallback = 15000) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120000, Math.max(3000, parsed));
}

function installPrelistenWatchdog(options = {}) {
  const timeoutMs = parseWatchdogMs(options.timeoutMs || process.env.BOOT_PRELISTEN_WATCHDOG_MS, 15000);
  const timer = setTimeout(() => {
    if (state.httpListening) return;
    emit('prelisten_watchdog_timeout', {
      timeoutMs,
      stalledAtStage: state.stage
    });
  }, timeoutMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}

module.exports = {
  emit,
  publicSnapshot,
  snapshot,
  installPrelistenWatchdog
};
