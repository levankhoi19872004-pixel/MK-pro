'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('delivery cash in transit report service exists and uses AR + fund ledgers', () => {
  const file = 'src/domain/settlement/DeliveryCashInTransitReportService.js';
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} must exist`);

  const source = read(file);

  assert.match(source, /ArLedger\.aggregate/);
  assert.match(source, /FundLedger\.aggregate/);
  assert.match(source, /ar_receipt/);
  assert.match(source, /DELIVERY_CASH_SUBMISSION/);
  assert.match(source, /collectedCash/);
  assert.match(source, /submittedCash/);
  assert.match(source, /difference/);
  assert.match(source, /pending/);
  assert.match(source, /settled/);
  assert.match(source, /mismatch/);
});

test('DeliverySettlementService delegates cashInTransitReport to ledger-driven report service', () => {
  const source = read('src/domain/settlement/DeliverySettlementService.js');

  assert.match(source, /DeliveryCashInTransitReportService/);
  assert.match(source, /listDeliveryCashInTransit/);
  assert.doesNotMatch(
    source,
    /async function cashInTransitReport[\s\S]*buildDeliverySubmissionDraft/
  );
});

test('fund routes expose delivery cash in transit endpoint', () => {
  const routes = read('src/routes/fundRoutes.js');
  const controller = read('src/controllers/fundController.js');

  assert.match(routes, /delivery-cash-in-transit/);
  assert.match(routes, /deliveryCashInTransit/);
  assert.match(routes, /requireRole\(\['admin', 'accountant', 'manager'\]\)/);

  assert.match(controller, /DeliverySettlementService/);
  assert.match(controller, /cashInTransitReport/);
});

test('posting engine persists delivery receipt source and cash method metadata', () => {
  const source = read('src/engines/posting.engine.js');

  assert.match(source, /doc\.source/);
  assert.match(source, /method/);
  assert.match(source, /paymentMethod/);
  assert.match(source, /deliveryDate/);
  assert.match(source, /receipt\.refType \|\| 'RECEIPT'/);
  assert.match(source, /receipt\.source \|\| 'posting_engine'/);
});
