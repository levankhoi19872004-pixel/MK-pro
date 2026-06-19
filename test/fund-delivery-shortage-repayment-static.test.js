'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('UI phân loại thiếu và nộp bù được liên kết từ hai tab tiền mặt/chuyển khoản', () => {
  const html = read('public/index.html');
  const js = read('public/js/app/debt/07f-fund-ledger.js');
  assert.match(html, /id="deliveryShortageResolutionModal"/);
  assert.match(html, /id="deliveryShortageRepaymentModal"/);
  assert.match(html, /NVGH đã thu nhưng chưa nộp đủ/);
  assert.match(html, /Chờ đối soát ngân hàng/);
  assert.match(js, /classifyDeliveryCashShortages/);
  assert.match(js, /openDeliveryShortageRepayment/);
  assert.match(js, /DELIVERY_SHORTAGE_REPAYMENT|delivery-shortage-repayments/);
});

test('backend có collection riêng, route riêng và không ghi công nợ NVGH vào arLedgers', () => {
  const models = read('src/models/index.js');
  const routes = read('src/routes/fundRoutes.js');
  const service = read('src/services/fundService.js');
  const collections = read('src/constants/collectionKeys.js');
  assert.match(models, /deliveryCashShortages/);
  assert.match(models, /deliveryShortageRepayments/);
  assert.match(collections, /'deliveryCashShortages'/);
  assert.match(collections, /'deliveryShortageRepayments'/);
  assert.match(routes, /delivery-cash-submissions\/:id\/shortages/);
  assert.match(routes, /delivery-cash-shortages\/:id\/repayments/);
  assert.match(routes, /delivery-shortage-repayments\/:id\/confirm/);
  assert.match(service, /sourceType:\s*'DELIVERY_SHORTAGE_REPAYMENT'/);
  assert.doesNotMatch(service, /arLedgerRepository/);
});

test('index plan có unique guard một khoản thiếu trên mỗi phiếu và loại quỹ', () => {
  const indexService = read('src/services/mongoIndexService.js');
  assert.match(indexService, /uniq_delivery_cash_shortage_source_fund/);
  assert.match(indexService, /sourceSubmissionCode:\s*1,\s*fundType:\s*1/);
});
