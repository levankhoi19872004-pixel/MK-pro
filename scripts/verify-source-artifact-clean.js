'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeEntry(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function walkDirectory(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    const relative = normalizeEntry(path.relative(root, absolute));
    return entry.isDirectory() ? [relative, ...walkDirectory(root, absolute)] : [relative];
  });
}

function listZipEntries(zipPath) {
  const result = spawnSync('tar', ['-tf', zipPath], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Cannot read zip ${zipPath}`).trim());
  }
  return result.stdout.split(/\r?\n/).map(normalizeEntry).filter(Boolean);
}

function basename(entry) {
  const clean = normalizeEntry(entry);
  return clean.slice(clean.lastIndexOf('/') + 1);
}

function hasSegment(entry, segment) {
  return normalizeEntry(entry).split('/').includes(segment);
}

function findViolations(entries = []) {
  const violations = [];
  for (const entry of entries.map(normalizeEntry).filter(Boolean)) {
    const base = basename(entry);
    const lower = entry.toLowerCase();
    const lowerBase = base.toLowerCase();

    if (entry.startsWith('../') || entry.includes('/../') || path.isAbsolute(entry)) violations.push(`${entry}: zip-slip/path traversal`);
    if (hasSegment(entry, 'node_modules')) violations.push(`${entry}: node_modules is not allowed in source artifact`);
    if (hasSegment(entry, '.git')) violations.push(`${entry}: .git is not allowed in source artifact`);
    if (hasSegment(entry, '.codex') || hasSegment(entry, '.cache')) violations.push(`${entry}: local tool cache is not allowed`);
    if (hasSegment(entry, 'logs') || hasSegment(entry, 'tmp') || hasSegment(entry, 'temp')) violations.push(`${entry}: runtime/temp directory is not allowed`);
    if (/^\.env($|\.)/i.test(base) && lowerBase !== '.env.example') violations.push(`${entry}: environment secret file is not allowed`);
    if (/\.(log|dump|bak|backup)$/i.test(base)) violations.push(`${entry}: log/dump/backup file is not allowed`);
    if (/\.(zip|7z|rar|tar|tgz|gz)$/i.test(base)) violations.push(`${entry}: nested archive is not allowed`);
    if (/(\bid_rsa\b|private[-_]?key|\.(pem|p12|pfx)$|secret\.(txt|json|ya?ml|env))/i.test(base) && !/fixture|example|test/i.test(entry)) {
      violations.push(`${entry}: possible secret material is not allowed`);
    }
    if (/^(mk\d+|phase\d+|phase\d+_|.*_work)$/i.test(base) && entry.includes('/')) {
      violations.push(`${entry}: nested phase/work directory is not allowed`);
    }
  }
  return violations;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { zip: '', directory: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--zip') args.zip = argv[++index] || '';
    else if (value === '--directory') args.directory = argv[++index] || '';
    else if (!args.zip && !args.directory) args.zip = value;
  }
  return args;
}

function verifyArtifact(args = parseArgs()) {
  const target = args.zip || args.directory;
  if (!target) throw new Error('Usage: node scripts/verify-source-artifact-clean.js --zip <file.zip> OR --directory <path>');
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) throw new Error(`Artifact not found: ${absolute}`);

  const entries = args.directory ? walkDirectory(absolute) : listZipEntries(absolute);
  const violations = findViolations(entries);
  return { ok: violations.length === 0, target: absolute, checkedEntries: entries.length, violations };
}

if (require.main === module) {
  try {
    const result = verifyArtifact();
    if (!result.ok) {
      console.error('[artifact-clean] FAILED');
      result.violations.forEach((item) => console.error(`- ${item}`));
      process.exit(1);
    }
    console.log(`[artifact-clean] OK ${result.checkedEntries} entries ${path.relative(process.cwd(), result.target) || result.target}`);
  } catch (error) {
    console.error(`[artifact-clean] ERROR ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  normalizeEntry,
  findViolations,
  verifyArtifact,
  listZipEntries,
  walkDirectory
};
