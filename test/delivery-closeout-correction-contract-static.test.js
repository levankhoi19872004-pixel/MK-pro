'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('Phase92 correction service stays ledger-safe and writes returnOrders only through repository boundary', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  const legacyFacade = read('src/services/accounting/DeliveryCloseoutCorrectionService.js');
  assert.match(legacyFacade, /deliveryCloseoutCorrection\.service/);

  const forbidden = [
    'ReturnArPostingService',
    'ReturnOrderService',
    'InventoryPostingService',
    'postReturnIn',
    'postSalesOrderAR',
    'postReceiptAR',
    "category: 'AR-RETURN'",
    "category: 'AR-SALE-REVERSAL'",
    'orderRepository.upsert',
    'patchByIdentity',
    'salesOrders.remainingDebt'
  ];
  for (const token of forbidden) assert.equal(service.includes(token), false, `Forbidden token in correction service: ${token}`);

  assert.match(service, /DeliveryCloseoutCorrection/);
  assert.match(service, /DeliveryCloseoutVersion/);
  assert.match(service, /ArDebtAdjustmentPostingService\.postAdjustment/);
  assert.match(service, /returnOrderRepository\.upsert/);
  assert.doesNotMatch(service, /ReturnOrder\.update(?:One|Many)|ReturnOrder\.findOneAndUpdate|ReturnOrder\.bulkWrite/);
  assert.match(service, /debtAdjustmentAmount/);
  assert.match(service, /newDebtAmount - previousDebt/);
});

test('Phase92 route exposes correction and version endpoints under /api/new delivery today', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  assert.match(route, /delivery-today\/closeouts\/:id\/corrections/);
  assert.match(route, /delivery-today\/closeouts\/:id\/versions/);
  assert.match(route, /DeliveryAdjustmentCommitService\.commitOneAdjustment|deliveryCloseoutCorrectionService\.createCorrection/);
});

test('Phase92 AR-DEBT-ADJUSTMENT contract uses correction source and canonical debit credit', () => {
  const posting = read('src/services/accounting/ArDebtAdjustmentPostingService.js');
  assert.match(posting, /category:\s*'AR-DEBT-ADJUSTMENT'/);
  assert.match(posting, /ledgerType:\s*'AR-DEBT-ADJUSTMENT'/);
  assert.match(posting, /entryType:\s*'normal'/);
  assert.match(posting, /sourceType/);
  assert.match(posting, /DELIVERY_CLOSEOUT_CORRECTION/);
  assert.match(posting, /correctionId/);
  assert.match(posting, /originalCloseoutId/);
  assert.match(posting, /newCloseoutId/);
});

test('Phase93 Debt New keeps AR-DEBT categories only and groups correction ledgers back to the sales order', () => {
  const debtNew = read('src/services/v2/debtNew.service.js');
  assert.match(debtNew, /AR-DEBT-OPEN/);
  assert.match(debtNew, /AR-DEBT-PAYMENT/);
  assert.match(debtNew, /AR-DEBT-ADJUSTMENT/);
  assert.match(debtNew, /AR-DEBT-VOID/);
  assert.match(debtNew, /sourceType === 'DELIVERY_CLOSEOUT_CORRECTION'/);
  assert.match(debtNew, /salesOrderId \|\| row\.orderId/);
  assert.equal(/AR-SALE['"]\s*,\s*['"]AR-SALE-REVERSAL/.test(debtNew), true);
});

test('Phase92 scripts exist for index, audit, consistency audit and repair planning', () => {
  [
    'scripts/create-delivery-closeout-correction-indexes.js',
    'scripts/audit-delivery-closeout-corrections.js',
    'scripts/audit-new-delivery-debt-consistency.js',
    'scripts/plan-new-delivery-debt-repair.js'
  ].forEach((rel) => assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} missing`));
});


test('Phase106 payment correction treats corrected amount as final value and allows fixing negative current cash', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  assert.match(service, /correctionSemantics:\s*'corrected_final_amount'/);
  assert.match(service, /return\s+correctedAmount\s*-\s*currentAmount/);
  assert.match(service, /const oldAmount = firstExplicitMoneyValue\(line, \['oldAmount', 'currentAmount'[\s\S]*'previousAmount'\], 0\)/);
  assert.match(service, /const newAmount = firstExplicitMoneyValue\(line, \['newAmount', 'correctedAmount'[\s\S]*'finalAmount'/);
  assert.doesNotMatch(service, /if \(line\.adjustmentAmount !== undefined\) return money\(line\.adjustmentAmount\)/);
});

test('Phase106 correction service rejects negative corrected payment but not negative current payment', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  assert.match(service, /if \(money\(line\.newAmount\) < 0\)/);
  assert.doesNotMatch(service, /money\(line\.newAmount\) < 0 \|\| money\(line\.oldAmount\) < 0/);
  assert.match(service, /validateCorrectionInput/);
  assert.match(service, /Tiền mặt sau điều chỉnh/);
  assert.match(service, /Chuyển khoản sau điều chỉnh/);
  assert.match(service, /Trả thưởng sau điều chỉnh/);
});

test('Phase106 read-only audit script exists for negative delivery cash', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/audit-delivery-payment-negative-cash.js')), true);
});


test('Phase108 correction service preserves explicit zero corrected payment amounts', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  assert.match(service, /function hasOwnValue\(obj = \{\}, key = ''\)/);
  assert.match(service, /function firstExplicitMoneyValue\(source = \{\}, keys = \[\], fallbackValue = 0\)/);
  assert.match(service, /obj\[key\] !== undefined/);
  assert.match(service, /obj\[key\] !== null/);
  assert.match(service, /String\(obj\[key\]\)\.trim\(\) !== ''/);
  assert.match(service, /const newAmount = firstExplicitMoneyValue\(line, \['newAmount', 'correctedAmount', 'correctedCashAmount', 'correctedBankAmount', 'correctedRewardAmount', 'finalAmount', 'amount'\], oldAmount\)/);
  assert.match(service, /const adjustmentAmount = newAmount - oldAmount/);
  assert.doesNotMatch(service, /correctedCashAmount\s*\|\|\s*currentCashAmount/);
  assert.doesNotMatch(service, /newAmount\s*\|\|\s*oldAmount/);
  assert.doesNotMatch(service, /line\.newAmount\s*\|\|\s*line\.oldAmount/);
});


test('Phase109 correction versions store final payment state and do not replay deltas as current cash', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  const list = read('src/services/v2/deliveryTodayNew.service.js');
  assert.match(service, /correctionSemantics:[\s\S]*'final_state_value'/);
  assert.match(service, /function previousPaymentState\(snapshot = \{\}, order = \{\}\)/);
  assert.match(service, /finalPaymentStateFromInput\(input, rawCashLines, currentState\)/);
  assert.match(service, /cashAmount: nextPaymentState\.cashAmount/);
  assert.match(service, /bankAmount: nextPaymentState\.bankAmount/);
  assert.match(service, /rewardAmount: nextPaymentState\.rewardAmount/);
  assert.match(service, /cashDeltaAmount = money\(nextPaymentState\.cashAmount - previousCash\)/);
  assert.match(service, /bankDeltaAmount = money\(nextPaymentState\.bankAmount - previousBank\)/);
  assert.match(service, /rewardDeltaAmount = money\(nextPaymentState\.rewardAmount - previousReward\)/);
  assert.doesNotMatch(service, /previousCash \+ cashAdjustmentAmount/);
  assert.doesNotMatch(service, /baseCashAmount \+ latestVersion\.totalCollectedDelta/);
  assert.doesNotMatch(list, /baseBreakdown\.cashAmount \+ money\(latestVersion\.cashAdjustmentAmount\)/);
  assert.match(list, /latestVersion\.cashAmount \?\? latestVersion\.newCashAmount/);
});

test('Phase109 correction versions expose final-state payment fields in models', () => {
  const versionModel = read('src/models/DeliveryCloseoutVersion.js');
  const correctionModel = read('src/models/DeliveryCloseoutCorrection.js');
  for (const token of ['cashAmount', 'bankAmount', 'rewardAmount', 'cashDeltaAmount', 'bankDeltaAmount', 'rewardDeltaAmount', 'totalCollectedDelta']) {
    assert.match(versionModel, new RegExp(`${token}: Number`));
    assert.match(correctionModel, new RegExp(`${token}: Number`));
  }
});

test('Phase110 delivery closeout and AR-DEBT posting must include reward/TH in debt formula and diagnostics', () => {
  const finance = read('src/constants/finance.constants.js');
  const closeout = read('src/services/accounting/DeliveryCloseoutService.js');
  const arOpen = read('src/services/accounting/ArDebtOpenPostingService.js');
  const accounting = read('src/services/accounting/AccountingCloseoutService.js');
  assert.match(finance, /REWARD_AMOUNT_FIELDS/);
  assert.match(finance, /rewardAmount/);
  assert.match(finance, /offsetAmount/);
  assert.match(finance, /debtOffsetAmount/);
  assert.match(finance, /receivableAmount - cashAmount - bankAmount - rewardAmount - returnAmount/);
  assert.match(closeout, /rewardAmount:\s*money\(offsetSummary\.offsetAmount\)/);
  assert.match(arOpen, /rewardAmount:\s*money\(closeout\.offsetAmount \?\? closeout\.rewardAmount\)/);
  assert.match(accounting, /rewardAmount:\s*DeliveryCloseoutService\._internal\.money\(closeout\.offsetAmount \?\? closeout\.rewardAmount\)/);
  assert.doesNotMatch(arOpen, /receivableAmount\s*-\s*cashAmount\s*-\s*bankAmount\s*-\s*returnAmount/);
  assert.doesNotMatch(closeout, /receivableAmount\s*-\s*cashAmount\s*-\s*bankAmount\s*-\s*returnAmount/);
});

