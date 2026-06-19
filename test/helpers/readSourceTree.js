'use strict';

const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

module.exports = function readSourceTree(root, relativePaths) {
  const files = [];
  for (const relativePath of relativePaths) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) files.push(...walk(absolute));
    else files.push(absolute);
  }
  return files
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => `\n/* SOURCE: ${path.relative(root, file)} */\n${fs.readFileSync(file, 'utf8')}`)
    .join('\n');
};
