'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const POLICY_VERSION = 'phase255a-r1-release-policy-v1';
const MANIFEST_GENERATOR_VERSION = 'phase255a-r1-manifest-generator-v1';

const REQUIRED_ROOT_FILES = Object.freeze([
  'package.json',
  'package-lock.json',
  'RELEASE_MANIFEST.json'
]);

const REQUIRED_ROOT_DIRS = Object.freeze([
  'src',
  'public',
  'scripts',
  'test'
]);

const ALLOWED_ENV_TEMPLATES = new Set([
  '.env.example',
  '.env.production.example'
]);

const FORBIDDEN_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'logs',
  'tmp',
  'temp',
  '.cache',
  '.codex',
  'artifacts',
  'backups'
]);

const ALLOWED_GENERATED_PATH_PREFIXES = Object.freeze([
  'docs/reports/archive/generated-reports'
]);

const RETIRED_PATHS = Object.freeze([
  'src/routes/mobileRoutes.js',
  'public/mobile/js/delivery-mobile-view.source/part-01.jsfrag',
  'public/mobile/js/delivery-mobile-view.source/part-02.jsfrag'
]);

const SOURCE_HASH_ROOTS = Object.freeze([
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.env.production.example',
  'src',
  'services',
  'scripts',
  'test',
  'public',
  'templates',
  'config',
  'utils',
  'docs/openapi.json'
]);

const MANIFEST_REQUIRED_FIELDS = Object.freeze([
  'application',
  'releasePhase',
  'releaseVersion',
  'releaseId',
  'sourceSha256',
  'sourceFileCount',
  'bundleSha256',
  'bundleFileCount',
  'configurationVersion',
  'generatedAt',
  'generatorVersion',
  'policyVersion',
  'packageLockSha256',
  'sourceHashScope'
]);

const MANIFEST_CONTENT_FIELDS = Object.freeze([
  'releaseVersion',
  'sourceSha256',
  'sourceFileCount',
  'bundleSha256',
  'bundleFileCount',
  'configurationVersion',
  'generatorVersion',
  'policyVersion',
  'packageLockSha256',
  'sourceHashScope'
]);

function normalizeEntry(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function basename(entry) {
  return path.posix.basename(normalizeEntry(entry));
}

function hasSegment(entry, segment) {
  return normalizeEntry(entry).split('/').includes(segment);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadBundleConfig(root) {
  const configPath = path.join(root, 'config/source-bundles.json');
  if (!fs.existsSync(configPath)) return { version: 0, bundles: [] };
  const config = readJson(configPath);
  return {
    version: config.version || 0,
    bundles: Array.isArray(config.bundles) ? config.bundles : []
  };
}

function generatedBundleFiles(root) {
  const files = new Set();
  for (const bundle of loadBundleConfig(root).bundles) {
    const candidates = [
      bundle.target,
      ...(Array.isArray(bundle.runtimeFiles) ? bundle.runtimeFiles : []),
      bundle.sourceMapTarget
    ];
    for (const candidate of candidates) {
      const normalized = normalizeEntry(candidate);
      if (normalized) files.add(normalized);
    }
  }
  return files;
}

function isPhaseReport(entry) {
  const normalized = normalizeEntry(entry);
  const base = basename(normalized);
  const reportName = /^phase\d+[a-z]?[a-z0-9_\-]*\.md$/i.test(base);
  if (!reportName) return false;
  return !normalized.includes('/') || normalized.startsWith('docs/reports/') || normalized.startsWith('reports/');
}

function isGeneratedLooking(entry) {
  const normalized = normalizeEntry(entry).toLowerCase();
  const base = basename(normalized);
  return hasSegment(normalized, 'generated')
    || /(?:^|[._-])generated(?:[._-]|$)/i.test(base)
    || /(?:^|[._-])compiled(?:[._-]|$)/i.test(base);
}

function validateArtifactEntries(entries, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const requireStructure = options.requireStructure !== false;
  const normalized = entries.map(normalizeEntry).filter(Boolean);
  const files = normalized.filter((entry) => !entry.endsWith('/'));
  const violations = [];
  const bundleOutputs = generatedBundleFiles(root);
  const counts = new Map();

  for (const entry of normalized) counts.set(entry, (counts.get(entry) || 0) + 1);
  for (const [entry, count] of counts.entries()) {
    if (count > 1) violations.push(`${entry}: duplicate artifact entry (${count})`);
  }

  if (requireStructure) {
    for (const required of REQUIRED_ROOT_FILES) {
      if (!files.includes(required)) violations.push(`${required}: required root file missing`);
    }
    for (const required of REQUIRED_ROOT_DIRS) {
      if (!normalized.some((entry) => entry === required || entry.startsWith(`${required}/`))) {
        violations.push(`${required}/: required source directory missing`);
      }
    }
  }

  for (const entry of normalized) {
    const base = basename(entry);
    const lowerBase = base.toLowerCase();
    const parts = entry.split('/');

    if (entry.startsWith('../') || entry.includes('/../') || path.posix.isAbsolute(entry)) {
      violations.push(`${entry}: unsafe path traversal`);
    }
    if (parts.some((part) => FORBIDDEN_SEGMENTS.has(part))) {
      violations.push(`${entry}: forbidden artifact segment`);
    }
    if (/^\.env(?:$|\.)/i.test(base) && !ALLOWED_ENV_TEMPLATES.has(lowerBase)) {
      violations.push(`${entry}: environment secret file is not allowed`);
    }
    if (/\.(?:log|dump|bak|backup|orig|rej|swp|swo)$/i.test(base) || /~$/.test(base)) {
      violations.push(`${entry}: backup/runtime residue is not allowed`);
    }
    if (/\.(?:zip|7z|rar|tar|tgz|gz)$/i.test(base)) {
      violations.push(`${entry}: nested archive is not allowed`);
    }
    if (/(?:^|[-_.])(id_rsa|private[-_]?key|secret)(?:$|[-_.])/i.test(base)
      || /\.(?:pem|p12|pfx|key)$/i.test(base)) {
      if (!/(?:fixture|example|test)/i.test(entry)) {
        violations.push(`${entry}: possible secret material is not allowed`);
      }
    }
    if (RETIRED_PATHS.includes(entry)) {
      violations.push(`${entry}: retired file must be removed before quality/release`);
    }
    const allowedGeneratedPath = ALLOWED_GENERATED_PATH_PREFIXES.some(
      (prefix) => entry === prefix || entry.startsWith(`${prefix}/`)
    );
    if (isGeneratedLooking(entry) && !bundleOutputs.has(entry) && !allowedGeneratedPath) {
      violations.push(`${entry}: unregistered generated/compiled artifact is not allowed`);
    }
    if (/^PHASE\d+/i.test(base) && base.endsWith('.md') && !isPhaseReport(entry)) {
      violations.push(`${entry}: phase report location/name is not allowed by release policy`);
    }
  }

  return {
    ok: violations.length === 0,
    checkedEntries: normalized.length,
    files,
    violations,
    policyVersion: POLICY_VERSION
  };
}

function walkFiles(root, relativePath, files = []) {
  const normalized = normalizeEntry(relativePath);
  const absolute = path.join(root, normalized);
  if (!fs.existsSync(absolute)) return files;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    files.push(normalized);
    return files;
  }
  for (const name of fs.readdirSync(absolute).sort()) {
    if (FORBIDDEN_SEGMENTS.has(name)) continue;
    walkFiles(root, path.posix.join(normalized, name), files);
  }
  return files;
}

function collectSourceHashFiles(root) {
  return [...new Set(SOURCE_HASH_ROOTS.flatMap((entry) => walkFiles(root, entry)))].sort();
}

function collectArtifactFiles(root) {
  return snapshotTree(path.resolve(root)).files.slice().sort();
}

function collectBundleHashFiles(root) {
  return [...generatedBundleFiles(root)]
    .filter((entry) => fs.existsSync(path.join(root, entry)))
    .sort();
}

function treeHash(root, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files.slice().sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function configurationVersion(root) {
  const configFiles = ['.env.example', '.env.production.example']
    .filter((file) => fs.existsSync(path.join(root, file)));
  return treeHash(root, configFiles);
}

function snapshotTree(root, options = {}) {
  const excluded = new Set(options.excluded || []);
  const entries = [];
  function visit(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (FORBIDDEN_SEGMENTS.has(item.name)) continue;
      const absolute = path.join(dir, item.name);
      const relative = normalizeEntry(path.relative(root, absolute));
      if (!relative || excluded.has(relative)) continue;
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile()) entries.push(relative);
    }
  }
  visit(root);
  return {
    fileCount: entries.length,
    sha256: treeHash(root, entries),
    files: entries
  };
}

function manifestContract(root) {
  const sourceFiles = collectSourceHashFiles(root);
  const bundleFiles = collectBundleHashFiles(root);
  return {
    sourceSha256: treeHash(root, sourceFiles),
    sourceFileCount: sourceFiles.length,
    bundleSha256: treeHash(root, bundleFiles),
    bundleFileCount: bundleFiles.length,
    configurationVersion: configurationVersion(root),
    packageLockSha256: sha256(fs.readFileSync(path.join(root, 'package-lock.json'))),
    sourceHashScope: [...SOURCE_HASH_ROOTS],
    sourceFiles,
    bundleFiles
  };
}

module.exports = {
  POLICY_VERSION,
  MANIFEST_GENERATOR_VERSION,
  REQUIRED_ROOT_FILES,
  REQUIRED_ROOT_DIRS,
  ALLOWED_ENV_TEMPLATES,
  FORBIDDEN_SEGMENTS,
  ALLOWED_GENERATED_PATH_PREFIXES,
  RETIRED_PATHS,
  SOURCE_HASH_ROOTS,
  MANIFEST_REQUIRED_FIELDS,
  MANIFEST_CONTENT_FIELDS,
  normalizeEntry,
  basename,
  hasSegment,
  sha256,
  generatedBundleFiles,
  isPhaseReport,
  validateArtifactEntries,
  walkFiles,
  collectSourceHashFiles,
  collectArtifactFiles,
  collectBundleHashFiles,
  treeHash,
  configurationVersion,
  snapshotTree,
  manifestContract
};
