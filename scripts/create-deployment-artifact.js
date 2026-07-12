'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyZip } = require('./verify-deployment-artifact');

const EXCLUDES = [
  '.git', 'node_modules', 'coverage', 'logs', 'tmp', 'temp', '.cache', '.codex',
  '*.log', '*.dump', '*.bak', '*.backup', '.env', '*.zip', '*.7z', '*.rar', '*.tar', '*.tgz'
];

function main() {
  const outIndex = process.argv.indexOf('--out');
  const output = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : 'MK-pro-deployment-artifact.zip');
  const root = path.resolve(__dirname, '..');
  fs.rmSync(output, { force: true });

  const args = ['-q', '-r', output, '.'];
  for (const exclude of EXCLUDES) args.push('-x', exclude, `${exclude}/*`, `*/${exclude}/*`);

  const result = spawnSync('zip', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Artifact creation failed').trim());

  const verification = verifyZip(output);
  if (verification.violations.length) {
    fs.rmSync(output, { force: true });
    throw new Error(`Artifact verification failed:\n${verification.violations.join('\n')}`);
  }
  console.log(`[deployment-artifact] CREATED ${path.basename(output)} ${verification.checkedEntries} entries`);
}

try { main(); } catch (error) { console.error(`[deployment-artifact] ERROR ${error.message}`); process.exit(1); }
