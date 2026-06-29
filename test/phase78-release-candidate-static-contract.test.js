'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

const ROOT = path.resolve(__dirname, '..');
const arPosting = readSource(path.join(ROOT, 'src/engines/posting.engine.js'));
const arPostingFacade = readSource(path.join(ROOT, 'src/domain/posting/ArPostingService.js'));
const fundPosting = readSource(path.join(ROOT, 'src/domain/posting/FundPostingService.js'));
const fundService = [
  'src/services/fundService.source/part-01.jsfrag',
  'src/services/fundService.source/part-02.jsfrag',
  'src/services/fundService.source/part-03.jsfrag'
].map((file) => readSource(path.join(ROOT, file))).join('\n');
const inventoryPosting = readSource(path.join(ROOT, 'src/domain/posting/InventoryPostingService.js'));
const inventoryService = [
  'src/services/inventoryService.source/part-01.jsfrag',
  'src/services/inventoryService.source/part-02.jsfrag',
  'src/services/inventoryService.source/part-03.jsfrag'
].map((file) => readSource(path.join(ROOT, file))).join('\n');
const debtCollectionService = readSource(path.join(ROOT, 'src/services/DebtCollectionService.js'));
const fundSummary = readSource(path.join(ROOT, 'src/services/fundSummary.service.js'));
const inventoryStock = readSource(path.join(ROOT, 'src/services/inventoryStock.service.js'));

function sourceFilesUnder(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
  };
  visit(dir);
  return out;
}

test('Phase78 static gate: posting facades expose explicit cross-ledger entry points', () => {
  assert.match(arPostingFacade, /postSale/);
  assert.match(arPostingFacade, /postReceipt/);
  assert.match(arPostingFacade, /postReturn/);
  assert.match(fundPosting, /postCashIn/);
  assert.match(fundPosting, /postCashOut/);
  assert.match(inventoryPosting, /postSaleOut/);
  assert.match(inventoryPosting, /postReturnIn/);
  assert.match(inventoryPosting, /reverseMovement/);
});

test('Phase78 static gate: AR posting carries source identity and idempotency on critical ledgers', () => {
  assert.match(arPosting, /function baseJournal/);
  assert.match(arPosting, /sourceType:[\s\S]*sourceId:[\s\S]*sourceCode:/);
  assert.match(arPosting, /idempotencyKey:\s*cleanText/);
  assert.match(arPosting, /idempotencyKey:\s*`AR-SALE:\$\{orderKey\}`/);
  assert.match(arPosting, /idempotencyKey:\s*`AR-RETURN:\$\{returnKey\}`|buildIdempotencyKey\(returnOrder/);
  assert.match(arPosting, /idempotencyKey:\s*receipt\.idempotencyKey/);
});

test('Phase78 static gate: fund and inventory posting require source identity and duplicate guards', () => {
  assert.match(fundService, /function buildFundLedgerIdempotencyKey/);
  assert.match(fundService, /sourceType[\s\S]*sourceId[\s\S]*sourceCode/);
  assert.match(fundService, /findByIdempotencyKey/);
  assert.match(fundService, /DUPLICATE_FUND_LEDGER/);

  assert.match(inventoryService, /function buildStockMovementIdempotencyKey/);
  assert.match(inventoryService, /sourceType[\s\S]*sourceId[\s\S]*productCode[\s\S]*warehouseCode/);
  assert.match(inventoryService, /findStockTransactionByIdempotencyKey/);
  assert.match(inventoryService, /DUPLICATE_STOCK_MOVEMENT/);
});

test('Phase78 static gate: critical posting paths do not silently skip missing ledger services', () => {
  assert.doesNotMatch(debtCollectionService, /typeof\s+ArPostingService\.postReceipt\s*!==\s*['"]function['"][\s\S]{0,120}return\s*;/);
  assert.doesNotMatch(debtCollectionService, /typeof\s+FundPostingService\.postCashIn\s*!==\s*['"]function['"][\s\S]{0,120}return\s*;/);
  assert.doesNotMatch(debtCollectionService, /catch\s*\([^)]*\)\s*\{\s*\}/);
  assert.match(debtCollectionService, /ArPostingService\.postReceipt/);
  assert.match(debtCollectionService, /FundPostingService\.postCashIn/);
});

test('Phase78 static gate: runtime SSoT read paths do not rely on snapshot/cashbook/bankbook sources', () => {
  assert.doesNotMatch(inventoryStock, /inventorySnapshots|InventorySnapshot/);
  assert.doesNotMatch(fundSummary, /cashbooks|bankbooks|cashBook|bankBook|snapshot/i);
});

test('Phase78 static gate: src runtime ledger code does not hard-delete ledgers', () => {
  const criticalFiles = [
    ...sourceFilesUnder('src/domain/posting'),
    ...sourceFilesUnder('src/services/accounting'),
    ...sourceFilesUnder('src/services/fund-summary')
  ];
  for (const file of criticalFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:ArLedger|FundLedger|StockTransaction)\.deleteMany\s*\(/, `${path.relative(ROOT, file)} must not hard-delete ledgers`);
    assert.doesNotMatch(source, /\b(?:ArLedger|FundLedger|StockTransaction)\.deleteOne\s*\(/, `${path.relative(ROOT, file)} must not hard-delete ledgers`);
  }
});
