'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dateUtil = require('../src/utils/date.util');

const root = path.resolve(__dirname, '..');

// Mon-Fri use next calendar day, including Friday -> Saturday.
test('nextDeliveryDateVN adds one day from Monday to Friday', () => {
  assert.equal(dateUtil.nextDeliveryDateVN('2026-06-15'), '2026-06-16'); // Monday
  assert.equal(dateUtil.nextDeliveryDateVN('2026-06-19'), '2026-06-20'); // Friday
});

test('nextDeliveryDateVN adds two days on Saturday and safely maps Sunday to Monday', () => {
  assert.equal(dateUtil.nextDeliveryDateVN('2026-06-20'), '2026-06-22'); // Saturday
  assert.equal(dateUtil.nextDeliveryDateVN('2026-06-21'), '2026-06-22'); // Sunday fallback
});

test('master order modal exposes readonly creation date and editable delivery date', () => {
  const html = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/index.html'));
  assert.match(html, /name="masterOrderDate"[^>]*readonly/);
  assert.match(html, /name="deliveryDate"[^>]*required/);
});

test('master order frontend initializes creation and delivery dates independently', () => {
  const js = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/06-master-delivery.js'));
  assert.match(js, /function masterOrderDefaultDeliveryDate/);
  assert.match(js, /dayOfWeek === 6 \? 2 : 1/);
  assert.match(js, /applyMasterOrderDefaultDates\(\{ forceDelivery: true \}\)/);
});

test('master order service stores immutable masterOrderDate and server-side default delivery date', () => {
  const service = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/masterOrderLegacy.service.js'));
  assert.match(service, /const masterOrderDate = dateUtil\.todayVN\(\)/);
  assert.match(service, /dateUtil\.nextDeliveryDateVN\(masterOrderDate\)/);
  assert.match(service, /masterOrderDate,/);
});
