'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('mobile sales service must delegate sales order deletion to SalesOrderDeletionService', () => {
  const file = path.join(ROOT, 'src/services/mobile/sales.service.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /SalesOrderDeletionService\.deleteSalesOrder/);
  assert.doesNotMatch(source, /SalesOrder\.deleteOne\(/);
  assert.doesNotMatch(source, /SalesOrder\.findOneAndUpdate\([^)]*status:\s*['"]void['"]/s);
});
