'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'RELEASE_MANIFEST.json');
const INCLUDE_ROOTS = [
  'server.js',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.env.production.example',
  'src',
  'services',
  'scripts',
  'public',
  'templates',
  'config',
  'utils',
  'docs/openapi.json'
];
const EXCLUDED_NAMES = new Set(['node_modules', '.git', 'artifacts', 'backups', 'coverage']);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function walk(relativePath, files = []) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return files;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    files.push(relativePath.replace(/\\/g, '/'));
    return files;
  }
  for (const name of fs.readdirSync(absolute).sort()) {
    if (EXCLUDED_NAMES.has(name)) continue;
    walk(path.join(relativePath, name), files);
  }
  return files;
}

function treeHash(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files.slice().sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(ROOT, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function gitCommit() {
  if (process.env.GIT_COMMIT) return String(process.env.GIT_COMMIT).trim();
  try {
    return childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_) {
    return 'unavailable';
  }
}

function argument(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function buildManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const sourceFiles = INCLUDE_ROOTS.flatMap((entry) => walk(entry)).filter((item, index, all) => all.indexOf(item) === index).sort();
  const bundleConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/source-bundles.json'), 'utf8'));
  const bundleFiles = bundleConfig.bundles.flatMap((bundle) => {
    const candidates = Array.isArray(bundle.runtimeFiles) && bundle.runtimeFiles.length ? bundle.runtimeFiles : [bundle.target];
    return candidates.filter((file) => fs.existsSync(path.join(ROOT, file)));
  }).filter((item, index, all) => all.indexOf(item) === index).sort();
  const now = new Date();
  const defaultReleaseId = `${now.toISOString().slice(0, 10)}-01`;
  return {
    application: 'MK-Pro',
    version: pkg.version,
    releaseId: argument('release-id') || process.env.RELEASE_ID || defaultReleaseId,
    gitCommit: gitCommit(),
    sourceSha256: treeHash(sourceFiles),
    sourceFileCount: sourceFiles.length,
    bundleSha256: treeHash(bundleFiles),
    bundleCount: bundleFiles.length,
    buildTime: now.toISOString(),
    environment: argument('environment') || process.env.RELEASE_ENVIRONMENT || 'production',
    nodeVersion: process.version,
    packageLockHash: sha256(fs.readFileSync(path.join(ROOT, 'package-lock.json'))),
    databaseMigration: [],
    configurationVersion: sha256(fs.readFileSync(path.join(ROOT, '.env.example'))),
    releasedBy: argument('released-by') || process.env.RELEASED_BY || 'unassigned',
    previousVersion: argument('previous-version') || process.env.PREVIOUS_RELEASE_ID || 'phase10',
    sourceHashScope: INCLUDE_ROOTS
  };
}

function main() {
  const manifest = buildManifest();
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(MANIFEST_PATH)) {
      console.error('RELEASE_MANIFEST_MISSING');
      process.exitCode = 1;
      return;
    }
    const current = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const keys = ['version', 'sourceSha256', 'sourceFileCount', 'bundleSha256', 'bundleCount', 'packageLockHash', 'configurationVersion'];
    const mismatches = keys.filter((key) => JSON.stringify(current[key]) !== JSON.stringify(manifest[key]));
    if (mismatches.length) {
      console.error(`RELEASE_MANIFEST_STALE: ${mismatches.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`RELEASE_MANIFEST_OK ${current.releaseId}`);
    return;
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`RELEASE_MANIFEST_WRITTEN ${manifest.releaseId}`);
}

if (require.main === module) main();
module.exports = { buildManifest, treeHash, walk };
