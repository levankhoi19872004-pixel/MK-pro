'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const candidates = require('../config/legacy-runtime-candidates');

const SCAN_ROOTS = ['src', 'services', 'public', 'config', 'scripts', 'test'];
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.html', '.md', '.css']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.codex', '.cache', 'logs', 'tmp', 'temp']);

function readUtf8(absolutePath) {
  const fd = fs.openSync(absolutePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const bytesRead = fs.readSync(fd, buffer, offset, size - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return buffer.subarray(0, offset).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function normalize(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function walk(relativeDir) {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRS.has(entry.name)) return [];
    const childRelative = normalize(path.join(relativeDir, entry.name));
    const childAbsolute = path.join(ROOT, childRelative);
    if (entry.isDirectory()) return walk(childRelative);
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [childAbsolute];
  });
}

function classifyReference(relativePath) {
  const file = normalize(relativePath);
  if (file.startsWith('test/')) return 'test';
  if (file === 'config/source-bundles.json') return 'source_bundle';
  if (file.startsWith('config/')) return 'config';
  if (file.startsWith('scripts/')) {
    if (/worker/i.test(path.posix.basename(file))) return 'runtime_script';
    return /audit|benchmark|performance|migrate|migration|plan|reconcile|cleanup|verify/i.test(file) ? 'audit_migration' : 'script';
  }
  if (/\.(md)$/i.test(file) || /REPORT|RUNBOOK|README|MAINTENANCE/i.test(file)) return 'documentation';
  if (file.startsWith('public/')) return 'frontend_runtime';
  if (file.startsWith('src/') || file.startsWith('services/')) return 'runtime';
  return 'unknown';
}

function referenceNeedles(candidate) {
  const clean = normalize(candidate);
  const withoutExtension = clean.replace(/\.js$/, '');
  const base = path.posix.basename(clean);
  const baseWithoutExtension = base.replace(/\.js$/, '');
  return Array.from(new Set([
    clean,
    withoutExtension,
    base,
    baseWithoutExtension
  ])).filter((item) => item.length >= 6);
}

function findReferences(candidate, files) {
  const needles = referenceNeedles(candidate);
  const refs = [];
  for (const absolute of files) {
    const relative = normalize(path.relative(ROOT, absolute));
    if (relative === normalize(candidate)) continue;
    const body = readUtf8(absolute);
    const matched = needles.filter((needle) => body.includes(needle));
    if (!matched.length) continue;
    refs.push({
      file: relative,
      type: classifyReference(relative),
      matched: matched.slice(0, 3)
    });
  }
  return refs;
}

function sourceBundleReferences(candidate) {
  const configFile = path.join(ROOT, 'config/source-bundles.json');
  if (!fs.existsSync(configFile)) return [];
  const clean = normalize(candidate);
  const config = JSON.parse(readUtf8(configFile));
  const refs = [];
  for (const bundle of config.bundles || []) {
    const bundlePaths = [
      bundle.target,
      bundle.canonicalSource,
      ...(Array.isArray(bundle.parts) ? bundle.parts : []),
      ...(Array.isArray(bundle.runtimeFiles) ? bundle.runtimeFiles : [])
    ].filter(Boolean).map(normalize);
    if (bundlePaths.includes(clean)) {
      refs.push({
        file: 'config/source-bundles.json',
        type: 'source_bundle',
        matched: [clean],
        bundleTarget: bundle.target
      });
    }
  }
  return refs;
}

function canonicalReverseImportViolations(candidate, meta, files) {
  const replacements = Array.isArray(meta.canonicalReplacement)
    ? meta.canonicalReplacement
    : [meta.canonicalReplacement].filter(Boolean);
  const candidateNeedles = referenceNeedles(candidate);
  const violations = [];
  for (const replacement of replacements.map(normalize)) {
    const absolute = path.join(ROOT, replacement);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
    const body = readUtf8(absolute);
    const matched = candidateNeedles.filter((needle) => body.includes(needle));
    if (matched.length) {
      violations.push({
        candidate,
        file: replacement,
        reason: 'canonical replacement imports or mentions retired legacy candidate',
        matched
      });
    }
  }
  return violations;
}

function audit() {
  const files = SCAN_ROOTS.flatMap(walk);
  const results = [];
  const violations = [];

  for (const [candidate, meta] of Object.entries(candidates)) {
    const exists = fs.existsSync(path.join(ROOT, candidate));
    const textRefs = findReferences(candidate, files);
    const bundleRefs = sourceBundleReferences(candidate);
    const references = [...textRefs, ...bundleRefs];
    const runtimeReferences = references.filter((ref) => ['runtime', 'frontend_runtime', 'source_bundle', 'runtime_script'].includes(ref.type));
    const disallowed = references.filter((ref) => !(meta.allowedReferenceTypes || []).includes(ref.type));

    if (!exists) {
      violations.push({ candidate, reason: 'candidate file is missing from registry path' });
    }
    if (meta.runtimeAllowed === false && runtimeReferences.length) {
      violations.push({
        candidate,
        reason: 'retired runtime candidate still has runtime/source-bundle references',
        references: runtimeReferences
      });
    }
    if (disallowed.length) {
      violations.push({
        candidate,
        reason: 'candidate has reference types outside registry allowlist',
        references: disallowed
      });
    }
    if (meta.runtimeAllowed === false || /^remove_/.test(String(meta.status || ''))) {
      violations.push(...canonicalReverseImportViolations(candidate, meta, files));
    }

    results.push({
      candidate,
      owner: meta.owner,
      type: meta.type,
      status: meta.status,
      runtimeAllowed: meta.runtimeAllowed,
      canonicalReplacement: meta.canonicalReplacement,
      exists,
      referenceCount: references.length,
      runtimeReferenceCount: runtimeReferences.length,
      references
    });
  }

  return {
    ok: violations.length === 0,
    candidateCount: Object.keys(candidates).length,
    scannedFileCount: files.length,
    results,
    violations
  };
}

function printHuman(result) {
  process.stdout.write(`[legacy-runtime-audit] candidates=${result.candidateCount} scannedFiles=${result.scannedFileCount} violations=${result.violations.length}\n`);
  for (const item of result.results) {
    process.stdout.write(`- ${item.candidate}: status=${item.status} runtimeRefs=${item.runtimeReferenceCount} refs=${item.referenceCount}\n`);
  }
  if (result.violations.length) {
    process.stderr.write('[legacy-runtime-audit] FAILED\n');
    for (const violation of result.violations) {
      process.stderr.write(`- ${violation.candidate}: ${violation.reason}\n`);
    }
  }
}

if (require.main === module) {
  const result = audit();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHuman(result);
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  audit,
  classifyReference,
  referenceNeedles
};
