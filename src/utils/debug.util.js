'use strict';

function debugEnabled(flag) {
  const value = String(process.env[flag] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function debugLog(flag, label, payload) {
  if (debugEnabled(flag)) {
    console.log(label, payload);
  }
}

module.exports = { debugLog, debugEnabled };
