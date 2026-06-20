'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'RELEASE_MANIFEST.json');

const FALLBACK = Object.freeze({
  application: 'MK-Pro',
  version: 'unknown',
  releaseId: 'unmanifested',
  gitCommit: 'unavailable',
  sourceSha256: 'unavailable',
  bundleSha256: 'unavailable',
  buildTime: '',
  environment: process.env.NODE_ENV || 'development',
  nodeVersion: process.version,
  packageLockHash: 'unavailable',
  configurationVersion: 'unavailable',
  releasedBy: 'unassigned',
  previousVersion: ''
});

let cached = null;

function normalizeManifest(value = {}) {
  return Object.freeze({
    ...FALLBACK,
    ...value,
    environment: process.env.NODE_ENV || value.environment || FALLBACK.environment,
    nodeVersion: value.nodeVersion || process.version
  });
}

function readReleaseManifest(options = {}) {
  if (cached && options.refresh !== true) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(options.path || MANIFEST_PATH, 'utf8'));
    cached = normalizeManifest(parsed);
  } catch (_) {
    cached = normalizeManifest();
  }
  return cached;
}

function publicReleaseSummary(options = {}) {
  const manifest = readReleaseManifest(options);
  return {
    application: manifest.application,
    version: manifest.version,
    releaseId: manifest.releaseId,
    buildTime: manifest.buildTime,
    environment: manifest.environment
  };
}

function internalReleaseSummary(options = {}) {
  const manifest = readReleaseManifest(options);
  return {
    ...manifest,
    manifestPresent: manifest.releaseId !== FALLBACK.releaseId
  };
}

function resetReleaseManifestCache() {
  cached = null;
}

module.exports = {
  MANIFEST_PATH,
  readReleaseManifest,
  publicReleaseSummary,
  internalReleaseSummary,
  resetReleaseManifestCache
};
