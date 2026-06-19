'use strict';

const path = require('path');
const { fork } = require('child_process');

const MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS || 10000);
const MAX_COLUMNS = Number(process.env.IMPORT_MAX_COLUMNS || 100);
const MAX_SHEETS = Number(process.env.IMPORT_MAX_SHEETS || 5);

const IMPORT_PARSE_TIMEOUT_MS = Number(process.env.IMPORT_PARSE_TIMEOUT_MS || 15000);
const IMPORT_PARSE_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_PARSE_MAX_OLD_SPACE_MB || 128);
const IMPORT_PARSE_EXIT_GRACE_MS = Math.max(100, Number(process.env.IMPORT_PARSE_EXIT_GRACE_MS || 1000));
const IMPORT_PARSE_STDERR_LIMIT = Math.max(1024, Number(process.env.IMPORT_PARSE_STDERR_LIMIT || 8192));

const TOO_LARGE_ERROR = 'File Excel quá lớn, vui lòng tách nhỏ file trước khi import';
const PARSE_TIMEOUT_ERROR = 'File Excel xử lý quá lâu, vui lòng kiểm tra hoặc tách nhỏ file trước khi import';

function appendLimited(current, chunk, maxLength) {
  const next = `${current || ''}${String(chunk || '')}`;
  return next.length <= maxLength ? next : next.slice(next.length - maxLength);
}

function stopChild(child) {
  if (!child) return;
  if (child.connected) child.disconnect();
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, IMPORT_PARSE_EXIT_GRACE_MS);
    killTimer.unref?.();
  }
}

function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'excelParser.worker.js');

    const child = fork(workerPath, [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      execArgv: [`--max-old-space-size=${IMPORT_PARSE_MAX_OLD_SPACE_MB}`]
    });

    let settled = false;
    let stderrTail = '';

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrTail = appendLimited(stderrTail, chunk, IMPORT_PARSE_STDERR_LIMIT);
      });
    }

    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopChild(child);
      handler(value);
    };

    const timer = setTimeout(() => {
      settle(reject, new Error(PARSE_TIMEOUT_ERROR));
    }, IMPORT_PARSE_TIMEOUT_MS);

    child.on('message', (message = {}) => {
      if (!message.ok) {
        const detail = message.error || stderrTail || 'Không đọc được file Excel';
        settle(reject, new Error(detail));
        return;
      }

      settle(resolve, Array.isArray(message.rows) ? message.rows : []);
    });

    child.on('error', (err) => {
      settle(reject, err);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      const suffix = stderrTail ? ` - ${stderrTail.trim()}` : '';
      settle(reject, new Error(
        `Excel parser stopped unexpectedly: code=${code ?? ''} signal=${signal || ''}${suffix}`
      ));
    });

    child.send({ buffer: Buffer.from(buffer).toString('base64') }, (err) => {
      if (err) settle(reject, err);
    });
  });
}

module.exports = {
  parseExcelBuffer,
  MAX_ROWS,
  MAX_COLUMNS,
  MAX_SHEETS,
  TOO_LARGE_ERROR,
  PARSE_TIMEOUT_ERROR
};
