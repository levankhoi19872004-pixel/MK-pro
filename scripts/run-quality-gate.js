'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { snapshotTree } = require('./lib/release-artifact-policy');

const ROOT = path.resolve(__dirname, '..');

function resolveNpmInvocation(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const existsSync = options.existsSync || fs.existsSync;
  const npmExecPath = String(env.npm_execpath || '').trim();
  if (npmExecPath && existsSync(npmExecPath)) {
    return { command: process.execPath, prefixArgs: [npmExecPath], source: 'npm_execpath' };
  }
  return {
    command: platform === 'win32' ? 'npm.cmd' : 'npm',
    prefixArgs: [],
    source: platform === 'win32' ? 'PATH:npm.cmd' : 'PATH:npm'
  };
}

function run(command, args, label, options = {}) {
  const env = options.env || process.env;
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: options.stdio || 'inherit',
    env: { ...env, NODE_ENV: env.NODE_ENV || 'test' },
    shell: false,
    encoding: options.encoding
  });
  if (result.error) throw new Error(`${label} spawn failed: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by signal ${result.signal}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  return result;
}

function runNpmScript(script, options = {}) {
  const invocation = resolveNpmInvocation(options);
  return run(
    invocation.command,
    [...invocation.prefixArgs, 'run', script],
    options.label || `npm run ${script}`,
    options
  );
}

function runQualityGate(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const before = snapshotTree(root);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-quality-'));
  const artifact = path.join(tempDir, 'mkpro-quality-artifact.zip');
  let failure = null;

  try {
    run(process.execPath, ['scripts/check-js-syntax.js'], 'node --check', { cwd: root });
    runNpmScript('test:release-governance', { cwd: root, label: 'targeted tests' });
    run(process.execPath, ['scripts/verify-source-artifact-clean.js', '--directory', '.'], 'artifact-clean', { cwd: root });
    run(process.execPath, ['scripts/generate-release-manifest.js', '--check'], 'release-manifest check', { cwd: root });
    run(process.execPath, ['scripts/create-deployment-artifact.js', '--root', root, '--out', artifact], 'deployment artifact build', { cwd: root });
    run(process.execPath, ['scripts/verify-deployment-artifact.js', '--zip', artifact], 'deployment artifact verification', { cwd: root });
  } catch (error) {
    failure = error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const after = snapshotTree(root);
  if (before.sha256 !== after.sha256 || before.fileCount !== after.fileCount) {
    throw new Error(
      `NON_MUTATING_CHECK_FAILED before=${before.sha256}/${before.fileCount} after=${after.sha256}/${after.fileCount}`
    );
  }
  console.log(`[quality] NON_MUTATING_CHECK_OK sha256=${after.sha256} files=${after.fileCount}`);
  if (failure) throw failure;
  console.log('[quality] RELEASE_GOVERNANCE_OK');
  return { before, after };
}

if (require.main === module) {
  try { runQualityGate(); } catch (error) { console.error(`[quality] FAILED ${error.message}`); process.exit(1); }
}

module.exports = { ROOT, runQualityGate, resolveNpmInvocation, runNpmScript, run };
