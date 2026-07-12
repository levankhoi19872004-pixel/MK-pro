'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  REQUIRED_ROOT_FILES,
  REQUIRED_ROOT_DIRS,
  validateArtifactEntries
} = require('./lib/release-artifact-policy');
const {
  listZipEntries,
  extractZip,
  verifyZipIntegrity
} = require('./lib/zip-artifact');
const { checkManifest } = require('./generate-release-manifest');

function verifyEntryStructure(entries, options = {}) {
  return validateArtifactEntries(entries, {
    root: options.root || path.resolve(__dirname, '..'),
    requireStructure: options.requireStructure !== false
  });
}

function verifyExtractedStructure(root) {
  const missing = [];
  for (const file of REQUIRED_ROOT_FILES) {
    if (!fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) missing.push(file);
  }
  for (const dir of REQUIRED_ROOT_DIRS) {
    if (!fs.statSync(path.join(root, dir), { throwIfNoEntry: false })?.isDirectory()) missing.push(`${dir}/`);
  }
  return missing;
}

async function verifyZip(zipPath, options = {}) {
  const absolute = path.resolve(zipPath);
  if (!fs.existsSync(absolute)) throw new Error(`Artifact not found: ${absolute}`);

  const entries = await listZipEntries(absolute, { checkCRC32: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-artifact-verify-'));
  let result;
  try {
    await extractZip(absolute, tempDir, { checkCRC32: true });
    const policy = verifyEntryStructure(entries, { root: tempDir, requireStructure: true });
    const violations = [...policy.violations];
    const missing = verifyExtractedStructure(tempDir);
    if (missing.length) violations.push(`EXTRACTION_SMOKE_MISSING: ${missing.join(', ')}`);

    let manifest = { ok: false, mismatches: ['RELEASE_MANIFEST_NOT_CHECKED'] };
    if (missing.length === 0 && fs.existsSync(path.join(tempDir, 'RELEASE_MANIFEST.json'))) {
      manifest = checkManifest({ root: tempDir });
      if (!manifest.ok) {
        violations.push(`DEPLOYMENT_ARTIFACT_MANIFEST_STALE: ${manifest.mismatches.join(', ')}`);
      }
    }

    const integrity = await verifyZipIntegrity(absolute);
    result = {
      artifact: absolute,
      ok: violations.length === 0,
      checkedEntries: policy.checkedEntries,
      files: policy.files,
      violations,
      policyVersion: policy.policyVersion,
      manifest: {
        ok: manifest.ok,
        mismatches: manifest.mismatches || [],
        releaseId: manifest.current?.releaseId || ''
      },
      extractionSmoke: { ok: missing.length === 0, missing },
      zipIntegrity: integrity.ok
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return result;
}

async function extractionSmokeTest(zipPath) {
  const result = await verifyZip(zipPath);
  if (!result.extractionSmoke.ok) throw new Error(`extraction smoke missing: ${result.extractionSmoke.missing.join(', ')}`);
  if (!result.manifest.ok) throw new Error(`DEPLOYMENT_ARTIFACT_MANIFEST_STALE: ${result.manifest.mismatches.join(', ')}`);
  return { ok: true, manifest: result.manifest };
}

async function main() {
  const index = process.argv.indexOf('--zip');
  const zipPath = index >= 0 ? process.argv[index + 1] : process.argv[2];
  if (!zipPath) throw new Error('Usage: node scripts/verify-deployment-artifact.js --zip <artifact.zip>');
  const result = await verifyZip(zipPath);
  if (!result.ok) {
    console.error(`[deployment-artifact] FAILED policy=${result.policyVersion}`);
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exit(1);
  }
  console.log(
    `[deployment-artifact] OK ${result.checkedEntries} entries policy=${result.policyVersion} `
    + `manifest=${result.manifest.releaseId} integrity=crc32 ${path.basename(result.artifact)}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[deployment-artifact] ERROR ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  listZipEntries,
  verifyEntryStructure,
  verifyExtractedStructure,
  verifyZip,
  extractionSmokeTest
};
