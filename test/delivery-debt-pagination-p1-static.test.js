'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.join(__dirname, '..');
const read = (file) => sourceBundle.readSource(path.join(ROOT, file));

const routeSource = read('src/routes/mobile/debts.routes.js');
const mobileDebtQuerySource = read('src/services/mobile/mobileDebtQuery.service.js');
const mobileDebtServiceSource = read('src/services/mobile/debts.service.js');
const deliveryViewSource = [
  read('public/mobile/js/delivery-mobile-view.js'),
  read('public/mobile/js/delivery-state.js')
].join('\n');

test('mobile debt API exposes bounded page/limit and nextPage metadata', () => {
  assert.match(routeSource, /query\('page'\)\.optional\(\)\.isInt\(\{ min: 1 \}\)/);
  assert.match(routeSource, /query\('limit'\)\.optional\(\)\.isInt\(\{ min: 1, max: 100 \}\)/);
  assert.match(mobileDebtQuerySource, /parseMobilePagination\(query, \{ defaultLimit: 30, maxLimit: 100 \}\)/);
  assert.match(mobileDebtQuerySource, /pagination\.total\s*=\s*pagination\.totalRows/);
  assert.match(mobileDebtQuerySource, /pagination\.nextPage\s*=\s*pagination\.hasMore \? page \+ 1 : null/);
});

test('delivery debt tab requests first page with limit and can load next page', () => {
  assert.match(deliveryViewSource, /DELIVERY_DEBT_PAGE_LIMIT\s*=\s*100/);
  assert.match(deliveryViewSource, /buildDeliveryDebtUrl\(page\)/);
  assert.match(deliveryViewSource, /params\.set\('page', String\(Math\.max\(1, Number\(page \|\| 1\)/);
  assert.match(deliveryViewSource, /params\.set\('limit', String\(state\.debtLimit \|\| DELIVERY_DEBT_PAGE_LIMIT\)\)/);
  assert.match(deliveryViewSource, /loadDeliveryDebts\(false, \{ append: true \}\)/);
  assert.match(deliveryViewSource, /id="mLoadMoreDebt"/);
});

test('load more appends without duplicating customers', () => {
  assert.match(deliveryViewSource, /function mergeDeliveryDebtRows\(existingRows, newRows\)/);
  assert.match(deliveryViewSource, /var indexByKey = new Map\(\)/);
  assert.match(deliveryViewSource, /indexByKey\.has\(key\)/);
  assert.match(deliveryViewSource, /rows\[indexByKey\.get\(key\)\] = customer/);
  assert.match(deliveryViewSource, /state\.debts = append \? mergeDeliveryDebtRows\(state\.debts, incomingRows\) : incomingRows/);
});

test('search reset clears debt pagination and reloads page one', () => {
  assert.match(deliveryViewSource, /function resetDeliveryDebtPaging\(options\)/);
  assert.match(deliveryViewSource, /state\.debtPage = 0/);
  assert.match(deliveryViewSource, /state\.debtNextPage = 1/);
  assert.match(deliveryViewSource, /state\.debtSearch = search\.value \|\| ''/);
  assert.match(deliveryViewSource, /resetDeliveryDebtPaging\(\{ clearRows: true \}\);\s*loadDeliveryDebts\(true\)/);
});

test('pending collections and NVGH owner scope remain enforced while paginating', () => {
  assert.match(deliveryViewSource, /params\.set\('includePendingCollections', '1'\)/);
  assert.match(deliveryViewSource, /pendingCollectedAmount/);
  assert.match(mobileDebtServiceSource, /if \(role === 'delivery'\)/);
  assert.match(mobileDebtServiceSource, /scopedQuery\.deliveryStaffCode = code/);
  assert.match(mobileDebtServiceSource, /delete scopedQuery\.salesStaffCode/);
  assert.match(mobileDebtServiceSource, /page: query\.page \|\| 1/);
  assert.match(mobileDebtServiceSource, /limit: query\.limit \|\| 30/);
});
