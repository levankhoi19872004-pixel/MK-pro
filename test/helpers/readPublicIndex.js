'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = function readPublicIndex(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/index-page-fragments.json'), 'utf8'));
  const shell = fs.readFileSync(path.join(root, manifest.shell), 'utf8');
  const body = manifest.fragments
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('');
  return shell.replace('{{INDEX_BODY}}', body);
};
