'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const {
  POLICY_VERSION,
  MANIFEST_GENERATOR_VERSION,
  MANIFEST_REQUIRED_FIELDS,
  MANIFEST_CONTENT_FIELDS,
  manifestContract
} = require('./lib/release-artifact-policy');

const ROOT = path.resolve(__dirname, '..');

function argument(name, argv = process.argv.slice(2)) {
  const equalsPrefix = `--${name}=`;
  const equalsMatch = argv.find((item) => item.startsWith(equalsPrefix));
  if (equalsMatch) return equalsMatch.slice(equalsPrefix.length);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] || '') : '';
}

function generationDate(env = process.env) {
  const epoch = env.SOURCE_DATE_EPOCH;
  if (epoch && Number.isFinite(Number(epoch))) return new Date(Number(epoch) * 1000);
  return new Date();
}

function gitCommit(root = ROOT, env = process.env) {
  if (env.GIT_COMMIT) return String(env.GIT_COMMIT).trim();
  try {
    return childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch (_) {
    return 'unavailable';
  }
}

function buildManifest(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const env = options.env || process.env;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const contract = manifestContract(root);
  const generatedAt = options.generatedAt || generationDate(env).toISOString();
  const releasePhase = options.releasePhase || env.RELEASE_PHASE || '';
  if (!releasePhase) throw new Error('Release phase is required. Use --phase <phase> or RELEASE_PHASE.');
  const releaseVersion = String(options.releaseVersion || env.RELEASE_VERSION || pkg.version || '0.0.0');
  const releaseId = options.releaseId
    || env.RELEASE_ID
    || `${releasePhase}-${releaseVersion}-${generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14)}`;

  return {
    application: 'MK-Pro',
    releasePhase,
    releaseVersion,
    version: releaseVersion,
    releaseId,
    sourceSha256: contract.sourceSha256,
    sourceFileCount: contract.sourceFileCount,
    bundleSha256: contract.bundleSha256,
    bundleFileCount: contract.bundleFileCount,
    configurationVersion: contract.configurationVersion,
    generatedAt,
    generatorVersion: MANIFEST_GENERATOR_VERSION,
    policyVersion: POLICY_VERSION,
    packageLockSha256: contract.packageLockSha256,
    sourceHashScope: contract.sourceHashScope,
    environment: options.environment || env.RELEASE_ENVIRONMENT || 'production',
    gitCommit: gitCommit(root, env),
    nodeVersion: process.version,
    databaseMigration: []
  };
}

function validateManifestShape(manifest) {
  const errors = [];
  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      errors.push(`${field}: required manifest field missing`);
    }
  }
  if (manifest.generatedAt && Number.isNaN(Date.parse(manifest.generatedAt))) {
    errors.push('generatedAt: invalid ISO timestamp');
  }
  return errors;
}

function checkManifest(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const manifestPath = path.resolve(options.manifestPath || path.join(root, 'RELEASE_MANIFEST.json'));
  if (!fs.existsSync(manifestPath)) return { ok: false, manifestPath, mismatches: ['RELEASE_MANIFEST_MISSING'] };
  const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const shapeErrors = validateManifestShape(current);
  if (shapeErrors.length) return { ok: false, current, manifestPath, mismatches: shapeErrors };
  const expected = buildManifest({
    root,
    releasePhase: current.releasePhase,
    releaseVersion: current.releaseVersion,
    releaseId: current.releaseId,
    generatedAt: current.generatedAt,
    environment: current.environment,
    env: options.env
  });
  const mismatches = MANIFEST_CONTENT_FIELDS.filter(
    (field) => JSON.stringify(current[field]) !== JSON.stringify(expected[field])
  );
  return { ok: mismatches.length === 0, current, expected, manifestPath, mismatches };
}

function writeManifest(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const manifestPath = path.resolve(options.manifestPath || path.join(root, 'RELEASE_MANIFEST.json'));
  const manifest = buildManifest({ ...options, root });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

function parseCliOptions(argv = process.argv.slice(2)) {
  const root = path.resolve(argument('root', argv) || ROOT);
  const manifestArg = argument('manifest', argv);
  return {
    root,
    manifestPath: manifestArg ? path.resolve(manifestArg) : path.join(root, 'RELEASE_MANIFEST.json'),
    releasePhase: argument('phase', argv) || process.env.RELEASE_PHASE,
    releaseVersion: argument('version', argv) || process.env.RELEASE_VERSION,
    releaseId: argument('release-id', argv),
    environment: argument('environment', argv)
  };
}

function main() {
  const isCheck = process.argv.includes('--check');
  const options = parseCliOptions();
  if (isCheck) {
    const result = checkManifest(options);
    if (!result.ok) {
      console.error(`RELEASE_MANIFEST_STALE: ${result.mismatches.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`RELEASE_MANIFEST_OK ${result.current.releaseId} policy=${result.current.policyVersion}`);
    return;
  }

  const { manifest } = writeManifest(options);
  console.log(`RELEASE_MANIFEST_WRITTEN ${manifest.releaseId}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`RELEASE_MANIFEST_ERROR ${error.message}`); process.exit(1); }
}

module.exports = {
  ROOT,
  buildManifest,
  checkManifest,
  writeManifest,
  validateManifestShape,
  parseCliOptions,
  argument,
  generationDate,
  gitCommit
};
