'use strict';
const fs = require('node:fs');
const path = require('node:path');
module.exports = function readPublicCss(root) {
  const dir = path.join(root, 'public/css');
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');
};
