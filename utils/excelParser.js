'use strict';

const path = require('path');
const { fork } = require('child_process');

const MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS || 10000);
const MAX_COLUMNS = Number(process.env.IMPORT_MAX_COLUMNS || 100);
const MAX_SHEETS = Number(process.env.IMPORT_MAX_SHEETS || 5);

const IMPORT_PARSE_TIMEOUT_MS = Number(process.env.IMPORT_PARSE_TIMEOUT_MS || 15000);
const IMPORT_PARSE_MAX_OLD_SPACE_MB = Number(process.env.IMPORT_PARSE_MAX_OLD_SPACE_MB || 128);

const TOO_LARGE_ERROR = 'File Excel quá lớn, vui lòng tách nhỏ file trước khi import';
const PARSE_TIMEOUT_ERROR = 'File Excel xử lý quá lâu, vui lòng kiểm tra hoặc tách nhỏ file trước khi import';

function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'excelParser.worker.js');

    const child = fork(workerPath, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--max-old-space-size=${IMPORT_PARSE_MAX_OLD_SPACE_MB}`]
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(PARSE_TIMEOUT_ERROR));
    }, IMPORT_PARSE_TIMEOUT_MS);

    child.on('message', (message = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (!message.ok) {
        reject(new Error(message.error || 'Không đọc được file Excel'));
        return;
      }

      resolve(Array.isArray(message.rows) ? message.rows : []);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Excel parser stopped unexpectedly: code=${code || ''} signal=${signal || ''}`));
    });

    child.send({ buffer: Buffer.from(buffer).toString('base64') });
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
