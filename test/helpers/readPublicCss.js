'use strict';
const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

module.exports = function readPublicCss(root) {
  const dir = path.join(root, 'public/css');
  return walk(dir)
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
};
