'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'backups', 'uploads']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

function stripShebang(source) {
  return source.startsWith('#!') ? source.replace(/^#!.*(?:\r?\n|$)/, '') : source;
}

walk(ROOT);
let failed = 0;
for (const file of files) {
  try {
    const source = stripShebang(fs.readFileSync(file, 'utf8'));
    if (/^\s*(?:import|export)\b/m.test(source)) {
      // Node's parser auto-detects ESM syntax for --check, even inside a CommonJS package.
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'ESM syntax check failed');
    } else {
      // Mirror Node's CommonJS syntax check without spawning one process per file.
      new vm.Script(Module.wrap(source), { filename: file, displayErrors: true });
    }
  } catch (error) {
    failed += 1;
    console.error(`SYNTAX_FAIL ${path.relative(ROOT, file)}`);
    console.error(error && (error.stack || error.message || error));
  }
}

if (failed) process.exit(1);
console.log(`SYNTAX_OK ${files.length} JavaScript files`);
