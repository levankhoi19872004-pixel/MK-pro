'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  collectArtifactFiles,
  validateArtifactEntries
} = require('./lib/release-artifact-policy');
const { createZipFromFiles } = require('./lib/zip-artifact');
const { checkManifest } = require('./generate-release-manifest');
const { verifyArtifact } = require('./verify-source-artifact-clean');
const { verifyZip } = require('./verify-deployment-artifact');

function isInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function createArtifact(options = {}) {
  const root = path.resolve(options.root || path.resolve(__dirname, '..'));
  const output = path.resolve(options.output || path.join(path.dirname(root), 'MK-pro-deployment-artifact.zip'));
  if (isInside(root, output)) {
    throw new Error(`Artifact output must be outside source root: ${output}`);
  }

  fs.rmSync(output, { force: true });
  try {
    const manifestCheck = checkManifest({ root });
    if (!manifestCheck.ok) {
      throw new Error(`RELEASE_MANIFEST_STALE: ${manifestCheck.mismatches.join(', ')}`);
    }

    const files = collectArtifactFiles(root);
    const policy = validateArtifactEntries(files, { root, requireStructure: true });
    if (!policy.ok) throw new Error(`SOURCE_ARTIFACT_POLICY_FAILED:\n${policy.violations.join('\n')}`);

    const created = await createZipFromFiles({
      root,
      files,
      output,
      date: manifestCheck.current.generatedAt,
      compressionLevel: options.compressionLevel
    });

    const sourceVerification = await verifyArtifact({ zip: output, directory: '' });
    if (!sourceVerification.ok) {
      throw new Error(`SOURCE_ARTIFACT_VERIFICATION_FAILED:\n${sourceVerification.violations.join('\n')}`);
    }

    const deploymentVerification = await verifyZip(output);
    if (!deploymentVerification.ok) {
      throw new Error(`DEPLOYMENT_ARTIFACT_VERIFICATION_FAILED:\n${deploymentVerification.violations.join('\n')}`);
    }

    return {
      artifact: output,
      checkedEntries: deploymentVerification.checkedEntries,
      policyVersion: deploymentVerification.policyVersion,
      manifest: deploymentVerification.manifest,
      zipIntegrity: deploymentVerification.zipIntegrity,
      byteLength: created.byteLength,
      sourceVerification,
      deploymentVerification
    };
  } catch (error) {
    fs.rmSync(output, { force: true });
    throw error;
  }
}

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const rootIndex = process.argv.indexOf('--root');
  const root = path.resolve(rootIndex >= 0 ? process.argv[rootIndex + 1] : path.resolve(__dirname, '..'));
  const output = path.resolve(outIndex >= 0
    ? process.argv[outIndex + 1]
    : path.join(path.dirname(root), 'MK-pro-deployment-artifact.zip'));
  const verification = await createArtifact({ root, output });
  console.log(
    `[deployment-artifact] CREATED ${path.basename(output)} ${verification.checkedEntries} entries `
    + `policy=${verification.policyVersion} manifest=${verification.manifest.releaseId} integrity=crc32`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[deployment-artifact] ERROR ${error.message}`);
    process.exit(1);
  });
}

module.exports = { createArtifact, isInside };
