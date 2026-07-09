'use strict';

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function roundMs(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function createCommandTelemetry(commandName = 'command') {
  const startedAt = nowMs();
  let lastAt = startedAt;
  const stages = [];

  function mark(name, extra = {}) {
    const current = nowMs();
    const stage = String(name || 'stage');
    const row = {
      name: stage,
      stage,
      ms: roundMs(current - lastAt),
      durationMs: roundMs(current - lastAt),
      elapsedMs: roundMs(current - startedAt),
      ...extra
    };
    stages.push(row);
    lastAt = current;
    return row;
  }

  function finish(extra = {}) {
    return {
      command: String(commandName || 'command'),
      totalMs: roundMs(nowMs() - startedAt),
      stages: stages.slice(),
      ...extra
    };
  }

  return { mark, finish, stages };
}

module.exports = {
  createCommandTelemetry
};
