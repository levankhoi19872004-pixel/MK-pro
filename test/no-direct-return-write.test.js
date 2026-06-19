'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src/engines', 'src/services', 'src/controllers', 'src/routes']
  .map((dir) => path.join(ROOT, dir))
  .filter(fs.existsSync);

const ALLOWED_FILES = new Set([
  path.normalize('src/domain/lifecycle/ReturnLifecycleService.js'),
  path.normalize('src/services/returnOrderLegacy.service.js'),
  path.normalize('src/services/masterReturnOrderService.js')
]);

const FORBIDDEN_PATTERNS = [
  { name: 'ReturnOrder.findOneAndUpdate', regex: /\bReturnOrder\.findOneAndUpdate\s*\(/g },
  { name: 'ReturnOrder.create', regex: /\bReturnOrder\.create\s*\(/g },
  { name: 'ReturnOrder.insertMany', regex: /\bReturnOrder\.insertMany\s*\(/g },
  { name: 'new ReturnOrder', regex: /\bnew\s+ReturnOrder\s*\(/g }
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      return walk(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

test('returnOrders are not written directly outside return lifecycle/service boundaries', () => {
  const violations = [];

  for (const filePath of SCAN_DIRS.flatMap(walk)) {
    const relPath = path.normalize(path.relative(ROOT, filePath));
    if (ALLOWED_FILES.has(relPath)) continue;

    const source = require('./helpers/sourceBundle.util').readSource(filePath);
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(source)) !== null) {
        violations.push(`${relPath}:${lineNumberAt(source, match.index)} ${pattern.name}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Direct returnOrders writes found outside boundary:\n${violations.join('\n')}`);
});

test('DeliveryEngine.saveReturn uses ReturnLifecycleService instead of direct ReturnOrder upsert', () => {
  const source = require('./helpers/sourceBundle.util').readSource('src/engines/delivery.legacy.engine.js');
  const saveReturnIndex = source.indexOf('async saveReturn(');
  assert.notEqual(saveReturnIndex, -1, 'DeliveryEngine.saveReturn() must exist');
  const nextMethodIndex = source.indexOf('\n  async ', saveReturnIndex + 'async saveReturn('.length);
  const saveReturnBlock = source.slice(saveReturnIndex, nextMethodIndex === -1 ? source.length : nextMethodIndex);

  assert.match(source, /function getReturnLifecycleService\(\)/);
  assert.match(saveReturnBlock, /getReturnLifecycleService\(\)\.createPendingReturn\(patch\)/);
  assert.doesNotMatch(saveReturnBlock, /ReturnOrder\.findOneAndUpdate\s*\(/);
  assert.doesNotMatch(saveReturnBlock, /this\.ReturnOrder\.findOneAndUpdate\s*\(/);
});
