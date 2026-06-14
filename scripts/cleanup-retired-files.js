'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const retiredFiles = [
  path.join(root, 'src/routes/mobileRoutes.js')
];

for (const file of retiredFiles) {
  if (!fs.existsSync(file)) continue;
  fs.rmSync(file, { force: true });
  process.stdout.write(`[cleanup-retired] removed ${path.relative(root, file)}\n`);
}
