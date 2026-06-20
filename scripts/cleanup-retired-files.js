'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const retiredFiles = [
  path.join(root, 'src/routes/mobileRoutes.js'),
  path.join(root, 'public/mobile/js/delivery-mobile-view.source/part-01.jsfrag'),
  path.join(root, 'public/mobile/js/delivery-mobile-view.source/part-02.jsfrag')
];

for (const file of retiredFiles) {
  if (!fs.existsSync(file)) continue;
  fs.rmSync(file, { force: true });
  process.stdout.write(`[cleanup-retired] removed ${path.relative(root, file)}\n`);
}
