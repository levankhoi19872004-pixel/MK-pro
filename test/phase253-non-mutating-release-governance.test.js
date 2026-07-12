'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  POLICY_VERSION,
  RETIRED_PATHS,
  snapshotTree,
  validateArtifactEntries
} = require('../scripts/lib/release-artifact-policy');
const { createZipFromFiles } = require('../scripts/lib/zip-artifact');
const { verifyArtifact } = require('../scripts/verify-source-artifact-clean');
const { verifyZip } = require('../scripts/verify-deployment-artifact');
const { buildManifest, checkManifest } = require('../scripts/generate-release-manifest');

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-phase253-'));
  for (const dir of ['src', 'public', 'scripts', 'test', 'config']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.2.3' }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3 }));
  fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), '{}\n');
  fs.writeFileSync(path.join(root, '.env.example'), 'PORT=3000\n');
  fs.writeFileSync(path.join(root, '.env.production.example'), 'NODE_ENV=production\n');
  fs.writeFileSync(path.join(root, 'server.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'src/index.js'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(root, 'public/index.html'), '<!doctype html>\n');
  fs.writeFileSync(path.join(root, 'scripts/audit.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'test/a.test.js'), "'use strict';\n");
  fs.writeFileSync(path.join(root, 'config/source-bundles.json'), JSON.stringify({ version: 1, bundles: [] }));
  return root;
}

function writeFixtureManifest(root, releaseId = 'Phase253-fixture') {
  const manifest = buildManifest({
    root,
    releasePhase: 'Phase253',
    releaseId,
    generatedAt: '2026-07-12T00:00:00.000Z'
  });
  fs.writeFileSync(path.join(root, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function zipRoot(root) {
  const zipPath = path.join(os.tmpdir(), `mkpro-phase253-${process.pid}-${Date.now()}-${Math.random()}.zip`);
  const files = snapshotTree(root).files;
  await createZipFromFiles({ root, files, output: zipPath, date: '2026-07-12T00:00:00.000Z' });
  return zipPath;
}

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

test('.env.production.example is accepted consistently by source and deployment verifiers', async () => {
  const root = makeRoot();
  writeFixtureManifest(root);
  const zipPath = await zipRoot(root);
  try {
    const sourceDirectory = await verifyArtifact({ directory: root, zip: '' });
    const sourceZip = await verifyArtifact({ directory: '', zip: zipPath });
    const deployment = await verifyZip(zipPath);
    assert.equal(sourceDirectory.ok, true, sourceDirectory.violations.join('\n'));
    assert.equal(sourceZip.ok, true, sourceZip.violations.join('\n'));
    assert.equal(deployment.ok, true, deployment.violations.join('\n'));
    assert.equal(sourceDirectory.policyVersion, POLICY_VERSION);
    assert.equal(deployment.policyVersion, POLICY_VERSION);
    assert.equal(deployment.manifest.ok, true);
  } finally {
    remove(root);
    remove(zipPath);
  }
});

test('real environment secret fails consistently in every artifact verifier', async () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, '.env.production'), 'MONGODB_URI=secret\n');
  writeFixtureManifest(root);
  const zipPath = await zipRoot(root);
  try {
    const sourceDirectory = await verifyArtifact({ directory: root, zip: '' });
    const sourceZip = await verifyArtifact({ directory: '', zip: zipPath });
    const deployment = await verifyZip(zipPath);
    for (const result of [sourceDirectory, sourceZip, deployment]) {
      assert.equal(result.ok, false);
      assert.match(result.violations.join('\n'), /environment secret file is not allowed/);
    }
  } finally {
    remove(root);
    remove(zipPath);
  }
});

test('stale manifest fails and regenerated manifest passes', () => {
  const root = makeRoot();
  try {
    writeFixtureManifest(root);
    assert.equal(checkManifest({ root }).ok, true);

    fs.appendFileSync(path.join(root, 'src/index.js'), '// stale\n');
    const stale = checkManifest({ root });
    assert.equal(stale.ok, false);
    assert.ok(stale.mismatches.includes('sourceSha256'));

    writeFixtureManifest(root, 'Phase253-fixture-2');
    assert.equal(checkManifest({ root }).ok, true);
  } finally {
    remove(root);
  }
});

test('retired file fails quality policy and remains untouched', async () => {
  const root = makeRoot();
  const retired = RETIRED_PATHS[0];
  const target = path.join(root, retired);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "module.exports = 'retired';\n");
  try {
    const before = fs.readFileSync(target, 'utf8');
    const result = await verifyArtifact({ directory: root, zip: '' });
    assert.equal(result.ok, false);
    assert.match(result.violations.join('\n'), /retired file must be removed/);
    assert.equal(fs.existsSync(target), true);
    assert.equal(fs.readFileSync(target, 'utf8'), before);
  } finally {
    remove(root);
  }
});

test('artifact verification and manifest check preserve source checksum', async () => {
  const root = makeRoot();
  try {
    writeFixtureManifest(root, 'Phase253-checksum');
    const before = snapshotTree(root);
    assert.equal((await verifyArtifact({ directory: root, zip: '' })).ok, true);
    assert.equal(checkManifest({ root }).ok, true);
    const after = snapshotTree(root);
    assert.deepEqual(after, before);
  } finally {
    remove(root);
  }
});

test('backup and unregistered generated files fail shared policy', () => {
  const baseEntries = [
    'package.json', 'package-lock.json', 'RELEASE_MANIFEST.json',
    'src/index.js', 'public/index.html', 'scripts/audit.js', 'test/a.test.js'
  ];
  const backup = validateArtifactEntries([...baseEntries, 'src/order.js.bak']);
  const generated = validateArtifactEntries([...baseEntries, 'src/order.generated.js']);
  assert.equal(backup.ok, false);
  assert.match(backup.violations.join('\n'), /backup\/runtime residue/);
  assert.equal(generated.ok, false);
  assert.match(generated.violations.join('\n'), /unregistered generated\/compiled artifact/);
});

test('npm test orchestration is non-mutating and cleanup is manual-only', () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runner = fs.readFileSync(path.join(root, 'scripts/run-tests.js'), 'utf8');
  const cleanup = fs.readFileSync(path.join(root, 'scripts/cleanup-retired-files.js'), 'utf8');
  assert.equal(Object.hasOwn(pkg.scripts, 'pretest'), false);
  assert.doesNotMatch(runner, /cleanup-retired-files/);
  assert.match(cleanup, /--apply/);
  assert.equal(pkg.scripts['cleanup:retired'], 'node scripts/cleanup-retired-files.js --apply');
});
