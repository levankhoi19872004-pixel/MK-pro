'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  snapshotTree,
  validateArtifactEntries
} = require('../scripts/lib/release-artifact-policy');
const {
  createZipFromFiles,
  listZipEntries
} = require('../scripts/lib/zip-artifact');
const {
  buildManifest,
  checkManifest,
  writeManifest
} = require('../scripts/generate-release-manifest');
const { createArtifact } = require('../scripts/create-deployment-artifact');
const { verifyArtifact } = require('../scripts/verify-source-artifact-clean');
const { verifyZip } = require('../scripts/verify-deployment-artifact');
const {
  resolveNpmInvocation,
  run
} = require('../scripts/run-quality-gate');

const FIXED_DATE = '2026-07-12T09:30:00.000Z';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-phase255a-r1-'));
  for (const dir of ['src', 'public', 'scripts', 'test', 'config']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), '{}\n');
  fs.writeFileSync(path.join(root, '.env.example'), 'PORT=3000\n');
  fs.writeFileSync(path.join(root, '.env.production.example'), 'NODE_ENV=production\n');
  fs.writeFileSync(path.join(root, 'server.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'src/index.js'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(root, 'public/index.html'), '<!doctype html>\n');
  fs.writeFileSync(path.join(root, 'scripts/audit.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'test/a.test.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'config/source-bundles.json'), `${JSON.stringify({ version: 1, bundles: [] }, null, 2)}\n`);
  return root;
}

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function finalizeManifest(root, releaseId = 'Phase255A-R1-fixture') {
  return writeManifest({
    root,
    releasePhase: 'Phase255A-R1',
    releaseVersion: '1.0.0',
    releaseId,
    generatedAt: FIXED_DATE
  }).manifest;
}

function outsideZip(root, name) {
  return path.join(path.dirname(root), `${path.basename(root)}-${name}.zip`);
}

test('manifest generated for a stable workspace passes', () => {
  const root = makeRoot();
  try {
    finalizeManifest(root);
    const result = checkManifest({ root });
    assert.equal(result.ok, true, result.mismatches.join(', '));
  } finally {
    remove(root);
  }
});

test('modifying a source file after manifest generation fails source hash validation', () => {
  const root = makeRoot();
  try {
    finalizeManifest(root);
    fs.appendFileSync(path.join(root, 'src/index.js'), '// stale\n');
    const result = checkManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.mismatches.includes('sourceSha256'));
  } finally {
    remove(root);
  }
});

test('adding a source file after manifest generation fails count and hash validation', () => {
  const root = makeRoot();
  try {
    finalizeManifest(root);
    fs.writeFileSync(path.join(root, 'src/new-module.js'), 'module.exports = 1;\n');
    const result = checkManifest({ root });
    assert.equal(result.ok, false);
    assert.ok(result.mismatches.includes('sourceFileCount'));
    assert.ok(result.mismatches.includes('sourceSha256'));
  } finally {
    remove(root);
  }
});

test('canonical artifact passes extracted manifest verification', async () => {
  const root = makeRoot();
  const zipPath = outsideZip(root, 'valid');
  try {
    finalizeManifest(root);
    const created = await createArtifact({ root, output: zipPath });
    assert.equal(created.manifest.ok, true);
    const verified = await verifyZip(zipPath);
    assert.equal(verified.ok, true, verified.violations.join('\n'));
    assert.equal(verified.manifest.ok, true);
    assert.equal(verified.zipIntegrity, true);
  } finally {
    remove(root);
    remove(zipPath);
  }
});

test('deployment verifier rejects a ZIP whose extracted manifest is stale', async () => {
  const root = makeRoot();
  const zipPath = outsideZip(root, 'stale');
  try {
    finalizeManifest(root);
    fs.appendFileSync(path.join(root, 'src/index.js'), '// changed after manifest\n');
    await createZipFromFiles({
      root,
      files: snapshotTree(root).files,
      output: zipPath,
      date: FIXED_DATE
    });
    const verified = await verifyZip(zipPath);
    assert.equal(verified.ok, false);
    assert.match(verified.violations.join('\n'), /DEPLOYMENT_ARTIFACT_MANIFEST_STALE/);
    assert.ok(verified.manifest.mismatches.includes('sourceSha256'));
  } finally {
    remove(root);
    remove(zipPath);
  }
});

test('canonical builder does not require the system zip binary', async () => {
  const root = makeRoot();
  const zipPath = outsideZip(root, 'no-system-zip');
  const previousPath = process.env.PATH;
  try {
    finalizeManifest(root);
    process.env.PATH = '';
    const created = await createArtifact({ root, output: zipPath });
    assert.equal(created.deploymentVerification.ok, true);
  } finally {
    process.env.PATH = previousPath;
    remove(root);
    remove(zipPath);
  }
});

test('npm resolver uses npm_execpath even when npm is not available on PATH', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-fake-npm-'));
  const fakeNpm = path.join(temp, 'npm-cli.js');
  const marker = path.join(temp, 'marker.txt');
  fs.writeFileSync(fakeNpm, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' '));\n`);
  try {
    const invocation = resolveNpmInvocation({ env: { npm_execpath: fakeNpm, PATH: '' }, platform: 'linux' });
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.prefixArgs, [fakeNpm]);
    assert.equal(invocation.source, 'npm_execpath');
    run(invocation.command, [...invocation.prefixArgs, 'run', 'probe'], 'fake npm', {
      env: { npm_execpath: fakeNpm, PATH: '' },
      cwd: temp,
      stdio: 'pipe'
    });
    assert.equal(fs.readFileSync(marker, 'utf8'), 'run probe');
  } finally {
    remove(temp);
  }
});

test('npm resolver selects npm.cmd on Windows and npm elsewhere', () => {
  const win = resolveNpmInvocation({ env: {}, platform: 'win32', existsSync: () => false });
  const posix = resolveNpmInvocation({ env: {}, platform: 'linux', existsSync: () => false });
  assert.equal(win.command, 'npm.cmd');
  assert.equal(posix.command, 'npm');
});

test('canonical ZIP ordering and bytes are deterministic for a fixed manifest timestamp', async () => {
  const root = makeRoot();
  const zipA = outsideZip(root, 'deterministic-a');
  const zipB = outsideZip(root, 'deterministic-b');
  try {
    finalizeManifest(root, 'Phase255A-R1-deterministic');
    await createArtifact({ root, output: zipA });
    await createArtifact({ root, output: zipB });
    const entriesA = await listZipEntries(zipA);
    const entriesB = await listZipEntries(zipB);
    assert.deepEqual(entriesA, entriesA.slice().sort());
    assert.deepEqual(entriesB, entriesA);
    assert.deepEqual(fs.readFileSync(zipB), fs.readFileSync(zipA));
  } finally {
    remove(root);
    remove(zipA);
    remove(zipB);
  }
});

test('secret, backup, nested archive and unregistered generated files fail shared policy', () => {
  const base = [
    'package.json', 'package-lock.json', 'RELEASE_MANIFEST.json',
    'src/index.js', 'public/index.html', 'scripts/audit.js', 'test/a.test.js'
  ];
  const bad = [
    '.env.production',
    'backup.zip',
    'src/file.bak',
    'node_modules/pkg/index.js',
    '.git/config',
    'src/unregistered.generated.js'
  ];
  const result = validateArtifactEntries([...base, ...bad]);
  assert.equal(result.ok, false);
  const evidence = result.violations.join('\n');
  assert.match(evidence, /environment secret file/);
  assert.match(evidence, /nested archive/);
  assert.match(evidence, /backup\/runtime residue/);
  assert.match(evidence, /forbidden artifact segment/);
  assert.match(evidence, /unregistered generated\/compiled artifact/);
});

test('manifest checks and artifact verification do not mutate the source workspace', async () => {
  const root = makeRoot();
  const zipPath = outsideZip(root, 'non-mutating');
  try {
    finalizeManifest(root);
    const before = snapshotTree(root);
    assert.equal(checkManifest({ root }).ok, true);
    assert.equal((await verifyArtifact({ directory: root, zip: '' })).ok, true);
    await createArtifact({ root, output: zipPath });
    assert.equal((await verifyZip(zipPath)).ok, true);
    const after = snapshotTree(root);
    assert.deepEqual(after, before);
  } finally {
    remove(root);
    remove(zipPath);
  }
});

test('manifest release phase and version are not hard-coded to an older phase', () => {
  const root = makeRoot();
  try {
    const manifest = buildManifest({
      root,
      releasePhase: 'Phase255A-R1',
      releaseVersion: '9.8.7',
      releaseId: 'custom-release',
      generatedAt: FIXED_DATE
    });
    assert.equal(manifest.releasePhase, 'Phase255A-R1');
    assert.equal(manifest.releaseVersion, '9.8.7');
    assert.equal(manifest.releaseId, 'custom-release');
  } finally {
    remove(root);
  }
});
