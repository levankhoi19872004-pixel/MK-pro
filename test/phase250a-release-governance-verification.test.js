'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const sourceVerifier = require('../scripts/verify-source-artifact-clean.js');
const deploymentVerifier = require('../scripts/verify-deployment-artifact.js');
const { buildManifest } = require('../scripts/generate-release-manifest.js');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const currentManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'RELEASE_MANIFEST.json'), 'utf8'));
const runTestsSource = fs.readFileSync(path.join(ROOT, 'scripts/run-tests.js'), 'utf8');
const cleanupSource = fs.readFileSync(path.join(ROOT, 'scripts/cleanup-retired-files.js'), 'utf8');

test('Track D: source and deployment verifiers disagree on .env.production.example', () => {
  const entries = [
    'package.json',
    'package-lock.json',
    '.env.production.example',
    'src/app.js',
    'public/index.html',
    'test/a.test.js',
    'scripts/audit.js'
  ];
  const sourceViolations = sourceVerifier.findViolations(entries);
  const deploymentViolations = deploymentVerifier.verifyEntryStructure(entries).violations;
  assert.ok(sourceViolations.some((value) => value.includes('.env.production.example')));
  assert.deepEqual(deploymentViolations, []);
});

test('Track D: release manifest is stale against current source tree', () => {
  const generated = buildManifest();
  const keys = ['version', 'sourceSha256', 'sourceFileCount', 'bundleSha256', 'bundleCount', 'packageLockHash', 'configurationVersion'];
  const mismatches = keys.filter((key) => JSON.stringify(currentManifest[key]) !== JSON.stringify(generated[key]));
  assert.ok(mismatches.length > 0, 'at least one manifest field is stale');
  assert.equal(currentManifest.releasedBy, 'chatgpt-phase204');
  assert.equal(currentManifest.releaseId, '2026-07-08-05');
});

test('Track D: quality gate omits manifest and artifact-clean checks', () => {
  const quality = pkg.scripts.quality || '';
  assert.doesNotMatch(quality, /check:release-manifest/);
  assert.doesNotMatch(quality, /test:artifact-clean/);
});

test('Track D: test orchestration mutates source through cleanup-retired-files', () => {
  assert.match(pkg.scripts.pretest || '', /cleanup:retired/);
  assert.match(runTestsSource, /require\('\.\/cleanup-retired-files'\)/);
  assert.match(cleanupSource, /fs\.rmSync\(file, \{ force: true \}\)/);
});
