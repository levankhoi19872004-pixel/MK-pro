'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'config', 'retired-files.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findReferences(target, files) {
  const base = path.basename(target);
  const targetPattern = new RegExp(escapeRegExp(target).replace(/\\\\\//g, '[\\\\/]'));
  const basePattern = new RegExp(`['\"]([^'\"]*${escapeRegExp(base)})['\"]`);
  return files
    .filter((file) => rel(file) !== target)
    .filter((file) => /\.(js|html|json|md|css)$/.test(file))
    .filter((file) => {
      const content = fs.readFileSync(file, 'utf8');
      return targetPattern.test(content) || basePattern.test(content);
    })
    .map(rel);
}

function main() {
  const config = readJson(CONFIG);
  const retired = Array.isArray(config.retired) ? config.retired : [];
  const allFiles = walk(ROOT);
  const failures = [];
  const report = [];

  for (const item of retired) {
    const target = typeof item === 'string' ? item : item.path;
    if (!target) continue;
    const absolute = path.join(ROOT, target);
    const exists = fs.existsSync(absolute);
    const refs = exists ? findReferences(target, allFiles) : [];
    report.push({ target, exists, refs });
    if (exists && refs.length) {
      failures.push(`${target}: retired file still referenced by ${refs.slice(0, 5).join(', ')}`);
    }
  }

  const nestedPhaseDirs = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^(mk\d+|phase\d+|phase\d+_|.*_work)$/.test(name));
  if (nestedPhaseDirs.length) failures.push(`Nested phase/work folders must not be shipped: ${nestedPhaseDirs.join(', ')}`);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: failures.length === 0, failures, report, nestedPhaseDirs }, null, 2));
  } else if (failures.length) {
    console.error('[dead-code-audit] FAILED');
    failures.forEach((failure) => console.error(`- ${failure}`));
  } else {
    console.log('[dead-code-audit] OK');
  }
  if (failures.length) process.exit(1);
}

main();
