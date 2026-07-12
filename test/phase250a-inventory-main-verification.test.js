'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src/services/inventoryStock.service.js'), 'utf8');
const reconciliationSource = fs.readFileSync(path.join(ROOT, 'src/domain/reconciliation/ReconciliationService.js'), 'utf8');
const projectionSource = fs.readFileSync(path.join(ROOT, 'src/services/analytics/ProjectionService.js'), 'utf8');

test('Track B remediation: canonical availability and summary queries use mainInventoryFilter', () => {
  assert.match(source, /InventoryCurrent\.find\(mainInventoryFilter\(\{[\s\S]*\$or:/);
  assert.match(source, /InventoryCurrent\.find\(mainInventoryFilter\(\)\)/);
});

test('Track B remediation: reconciliation and projection no longer fallback missing warehouse to MAIN', () => {
  assert.match(reconciliationSource, /\{ \$match: mainInventoryFilter\(\) \}/);
  assert.match(projectionSource, /\{ \$match: mainInventoryFilter\(tenantMatch\(tenantId\)\) \}/);
  assert.doesNotMatch(projectionSource, /\$ifNull: \['\$warehouseCode', 'MAIN'\]/);
});
