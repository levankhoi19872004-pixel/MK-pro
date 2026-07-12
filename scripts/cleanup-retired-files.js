'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RETIRED_PATHS } = require('./lib/release-artifact-policy');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const existing = RETIRED_PATHS.filter((file) => fs.existsSync(path.join(root, file)));

if (!apply) {
  process.stdout.write('[cleanup-retired] MANUAL_COMMAND_ONLY\n');
  if (existing.length) existing.forEach((file) => process.stdout.write(`[cleanup-retired] would remove ${file}\n`));
  process.stdout.write('[cleanup-retired] Re-run with --apply after reviewing the list.\n');
  process.exit(existing.length ? 1 : 0);
}

for (const relative of existing) {
  const file = path.join(root, relative);
  fs.rmSync(file, { force: true });
  process.stdout.write(`[cleanup-retired] removed ${relative}\n`);
}
