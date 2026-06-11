'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const IMPORT_TMP_DIR = process.env.IMPORT_TMP_DIR ||
  path.join(os.tmpdir(), 'mk-pro-import-sessions');

function safeName(value = '') {
  return String(value || 'import.xlsx')
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

async function saveImportFiles(sessionId, files = []) {
  const dir = path.join(IMPORT_TMP_DIR, String(sessionId));
  await fs.mkdir(dir, { recursive: true });

  const storedFiles = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fileName = file.fileName || file.originalname || `import-${index + 1}.xlsx`;
    const finalName = `${index + 1}-${safeName(fileName)}`;
    const filePath = path.join(dir, finalName);
    const buffer = file.buffer || Buffer.alloc(0);

    await fs.writeFile(filePath, buffer);

    storedFiles.push({
      fileName,
      path: filePath,
      size: file.size || buffer.length || 0
    });
  }

  return storedFiles;
}

async function cleanupImportFiles(files = []) {
  const dirs = new Set();

  for (const file of files) {
    if (!file.path) continue;
    dirs.add(path.dirname(file.path));
    await fs.unlink(file.path).catch(() => {});
  }

  for (const dir of dirs) {
    await fs.rmdir(dir).catch(() => {});
  }
}

module.exports = {
  saveImportFiles,
  cleanupImportFiles
};
