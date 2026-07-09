'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendPath = path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js');

test('Delivery Today frontend canonicalizes native date input before orders API request', () => {
  const source = fs.readFileSync(frontendPath, 'utf8');
  assert.match(source, /function canonicalDateInput/);
  assert.match(source, /date: canonicalDateInput\(/);
  assert.match(source, /\[DeliveryTodayNew\] loadOrders/);
  assert.doesNotMatch(source, /new Date\(['"]\d{1,2}\/\d{1,2}\/\d{4}['"]\)/);
});

test('Delivery Today frontend source detail displays requested delivery date filter from API', () => {
  const source = fs.readFileSync(frontendPath, 'utf8');
  assert.match(source, /dateFilter\.requestedDate/);
  assert.match(source, /dateFilter\.canonicalField/);
  assert.match(source, /API trả/);
});
