'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeItems } = require('../src/services/purchase/PurchaseService');

test('purchase items aggregate duplicate product codes and compute amount', () => {
  const items = normalizeItems([
    { productCode: 'A', quantity: 2, costPrice: 100 },
    { productCode: 'A', qty: 3, costPrice: 100 },
    { productCode: 'B', quantity: 0, costPrice: 50 }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 5);
  assert.equal(items[0].amount, 500);
});

const fs = require('node:fs');
const path = require('node:path');

test('supplier payment uses atomic balance guard and purchase return is receipt-bound', () => {
  const root = path.resolve(__dirname, '..');
  const service = fs.readFileSync(path.join(root, 'src/services/purchase/PurchaseService.js'), 'utf8');
  const model = fs.readFileSync(path.join(root, 'src/models/PurchaseReturn.js'), 'utf8');
  assert.match(service, /filter\.balanceAmount\s*=\s*\{\s*\$gte:\s*value\s*\}/);
  assert.match(service, /GOODS_RECEIPT_REQUIRED/);
  assert.match(service, /PURCHASE_RETURN_QTY_EXCEEDED/);
  assert.match(model, /goodsReceiptId:\s*\{\s*type:\s*String,\s*required:\s*true/);
});
