'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REQUIRED_FILES = ['package.json', 'package-lock.json'];
const REQUIRED_DIRS = ['src', 'public', 'test', 'scripts'];
const FORBIDDEN_SEGMENTS = new Set(['.git', 'node_modules', 'coverage', 'logs', 'tmp', 'temp', '.cache', '.codex']);

function normalize(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function listZipEntries(zipPath) {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Cannot list ZIP').trim());
  return result.stdout.split(/\r?\n/).map(normalize).filter(Boolean);
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function verifyEntryStructure(entries) {
  const violations = [];
  const normalized = entries.map(normalize).filter(Boolean);
  const exactDuplicates = duplicateValues(normalized);
  for (const item of exactDuplicates) violations.push(`${item.value}: duplicate ZIP entry (${item.count})`);

  const files = normalized.filter((entry) => !entry.endsWith('/'));
  const roots = new Set(normalized.map((entry) => entry.split('/')[0]));

  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) violations.push(`${required}: required root file missing`);
  }
  for (const required of REQUIRED_DIRS) {
    if (!normalized.some((entry) => entry === required || entry.startsWith(`${required}/`))) {
      violations.push(`${required}/: required source directory missing`);
    }
  }

  const sourceLikeRootFiles = files.filter((entry) => !entry.includes('/') && /\.(js|mjs|cjs|css|html|test\.js)$/i.test(entry));
  const nestedSourceFiles = files.filter((entry) => /^(src|public|test|scripts)\//.test(entry));
  if (sourceLikeRootFiles.length > 25 && nestedSourceFiles.length < 20) {
    violations.push(`root flatten detected: ${sourceLikeRootFiles.length} source-like files at ZIP root and only ${nestedSourceFiles.length} under required directories`);
  }

  const rootBasenames = duplicateValues(files.filter((entry) => !entry.includes('/')).map((entry) => path.posix.basename(entry)));
  for (const item of rootBasenames) violations.push(`${item.value}: duplicate basename at ZIP root (${item.count})`);

  for (const entry of normalized) {
    const parts = entry.split('/');
    if (entry.startsWith('../') || entry.includes('/../') || path.posix.isAbsolute(entry)) {
      violations.push(`${entry}: unsafe path traversal`);
    }
    if (parts.some((part) => FORBIDDEN_SEGMENTS.has(part))) violations.push(`${entry}: forbidden artifact segment`);
    const base = parts.at(-1) || '';
    if (/^\.env($|\.)/i.test(base) && !/^\.env\.(example|production\.example)$/i.test(base)) {
      violations.push(`${entry}: environment secret file is not allowed`);
    }
    if (/\.(log|dump|bak|backup)$/i.test(base)) violations.push(`${entry}: runtime log/dump/backup is not allowed`);
    if (/\.(zip|7z|rar|tar|tgz)$/i.test(base)) violations.push(`${entry}: nested archive is not allowed`);
  }

  return { violations, files, roots };
}

function extractionSmokeTest(zipPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-artifact-'));
  try {
    const result = spawnSync('unzip', ['-q', zipPath, '-d', tempDir], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Cannot extract ZIP').trim());
    const missing = [];
    for (const file of REQUIRED_FILES) if (!fs.existsSync(path.join(tempDir, file))) missing.push(file);
    for (const dir of REQUIRED_DIRS) if (!fs.statSync(path.join(tempDir, dir), { throwIfNoEntry: false })?.isDirectory()) missing.push(`${dir}/`);
    if (missing.length) throw new Error(`extraction smoke missing: ${missing.join(', ')}`);
    return { ok: true, tempDir };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function verifyZip(zipPath) {
  const absolute = path.resolve(zipPath);
  if (!fs.existsSync(absolute)) throw new Error(`Artifact not found: ${absolute}`);
  const entries = listZipEntries(absolute);
  const result = verifyEntryStructure(entries);
  if (result.violations.length === 0) extractionSmokeTest(absolute);
  return { artifact: absolute, checkedEntries: entries.length, ...result };
}

function main() {
  const index = process.argv.indexOf('--zip');
  const zipPath = index >= 0 ? process.argv[index + 1] : process.argv[2];
  if (!zipPath) throw new Error('Usage: node scripts/verify-deployment-artifact.js --zip <artifact.zip>');
  const result = verifyZip(zipPath);
  if (result.violations.length) {
    console.error('[deployment-artifact] FAILED');
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exit(1);
  }
  console.log(`[deployment-artifact] OK ${result.checkedEntries} entries ${path.basename(result.artifact)}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`[deployment-artifact] ERROR ${error.message}`); process.exit(1); }
}

module.exports = { normalize, listZipEntries, verifyEntryStructure, verifyZip };
