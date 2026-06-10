'use strict';

function debugLog(flag, label, payload) {
  if (process.env[flag] === 'true') {
    console.log(label, payload);
  }
}

module.exports = { debugLog };
