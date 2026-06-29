'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  arEffect,
  fundEffect,
  stockEffect,
  sourceIdentity,
  requireNoDuplicateIdempotency,
  sumBy,
  stockQuantityByProduct
} = require('../src/utils/crossLedgerEffect.util');

function salesOrderFixtureLedgers() {
  const order = {
    salesOrderId: 'SO-P78-001',
    salesOrderCode: 'B0038424',
    customerCode: '4501256',
    amount: 5141521,
    items: [
      { productCode: 'P001', quantity: 10 },
      { productCode: 'P002', quantity: 5 }
    ]
  };
  return {
    order,
    arLedgers: [{
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      sourceType: 'salesOrder',
      sourceId: order.salesOrderId,
      sourceCode: order.salesOrderCode,
      customerCode: order.customerCode,
      debit: order.amount,
      credit: 0,
      direction: 'debit',
      status: 'posted',
      accountingStatus: 'confirmed',
      accountingConfirmed: true,
      idempotencyKey: `AR-SALE:${order.salesOrderId}`
    }],
    stockTransactions: order.items.map((item) => ({
      sourceType: 'salesOrder',
      sourceId: order.salesOrderId,
      sourceCode: order.salesOrderCode,
      productCode: item.productCode,
      warehouseCode: 'MAIN',
      direction: 'OUT',
      quantity: item.quantity,
      signedQuantity: -item.quantity,
      status: 'posted',
      idempotencyKey: `STOCK-OUT:${order.salesOrderId}:${item.productCode}`
    }))
  };
}

test('Phase78: SalesOrder release gate aligns AR-SALE debit with stock out source and idempotency', () => {
  const { order, arLedgers, stockTransactions } = salesOrderFixtureLedgers();
  const stockByProduct = stockQuantityByProduct(stockTransactions);

  assert.equal(arEffect(arLedgers[0]), order.amount);
  assert.equal(sourceIdentity(arLedgers[0]).sourceId, order.salesOrderId);
  assert.equal(sourceIdentity(arLedgers[0]).sourceCode, order.salesOrderCode);
  assert.equal(stockByProduct.get('P001'), -10);
  assert.equal(stockByProduct.get('P002'), -5);
  assert.equal(stockTransactions.every((row) => row.warehouseCode === 'MAIN'), true);
  assert.equal(requireNoDuplicateIdempotency([...arLedgers, ...stockTransactions], 'sales order cross-ledger'), true);
});

test('Phase78: ReturnOrder release gate aligns AR-RETURN credit with stock in and zero-qty skip', () => {
  const returnOrder = {
    returnOrderId: 'RO-P78-001',
    salesOrderId: 'SO-P78-001',
    customerCode: '4501256',
    returnAmount: 276632,
    items: [
      { productCode: 'P001', returnQty: 3 },
      { productCode: 'P002', returnQty: 0 }
    ]
  };
  const arLedgers = [{
    category: 'AR-RETURN',
    ledgerType: 'AR-RETURN',
    sourceType: 'returnOrder',
    sourceId: returnOrder.returnOrderId,
    sourceCode: returnOrder.returnOrderId,
    customerCode: returnOrder.customerCode,
    debit: 0,
    credit: returnOrder.returnAmount,
    direction: 'credit',
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    idempotencyKey: `AR-RETURN:${returnOrder.returnOrderId}`
  }];
  const stockTransactions = returnOrder.items
    .filter((item) => Number(item.returnQty || 0) > 0)
    .map((item) => ({
      sourceType: 'returnOrder',
      sourceId: returnOrder.returnOrderId,
      sourceCode: returnOrder.returnOrderId,
      productCode: item.productCode,
      warehouseCode: 'MAIN',
      direction: 'IN',
      quantity: item.returnQty,
      signedQuantity: item.returnQty,
      status: 'posted',
      idempotencyKey: `STOCK-IN-RETURN:${returnOrder.returnOrderId}:${item.productCode}`
    }));
  const stockByProduct = stockQuantityByProduct(stockTransactions);

  assert.equal(arEffect(arLedgers[0]), -returnOrder.returnAmount);
  assert.equal(sourceIdentity(arLedgers[0]).sourceId, returnOrder.returnOrderId);
  assert.equal(stockByProduct.get('P001'), 3);
  assert.equal(stockByProduct.has('P002'), false, 'returnQty = 0 must not create stock in');
  assert.equal(requireNoDuplicateIdempotency([...arLedgers, ...stockTransactions], 'return order cross-ledger'), true);
});

test('Phase78: DebtCollection release gate aligns AR-RECEIPT and fund cash-in amount/source/customer', () => {
  const receipt = {
    debtCollectionId: 'DC-P78-001',
    customerCode: '4501256',
    amount: 4864000
  };
  const arLedgers = [{
    category: 'AR-RECEIPT',
    ledgerType: 'AR-RECEIPT',
    sourceType: 'debtCollection',
    sourceId: receipt.debtCollectionId,
    customerCode: receipt.customerCode,
    debit: 0,
    credit: receipt.amount,
    direction: 'credit',
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    idempotencyKey: `AR-RECEIPT:${receipt.debtCollectionId}`
  }];
  const fundLedgers = [{
    category: 'RECEIPT',
    type: 'fund_receipt',
    direction: 'in',
    amount: receipt.amount,
    sourceType: 'debtCollection',
    sourceId: receipt.debtCollectionId,
    customerCode: receipt.customerCode,
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    idempotencyKey: `FUND-RECEIPT:${receipt.debtCollectionId}`
  }];

  assert.equal(arEffect(arLedgers[0]), -receipt.amount);
  assert.equal(fundEffect(fundLedgers[0]), receipt.amount);
  assert.equal(arLedgers[0].sourceId, fundLedgers[0].sourceId);
  assert.equal(arLedgers[0].customerCode, fundLedgers[0].customerCode);
  assert.equal(Math.abs(arEffect(arLedgers[0])), fundEffect(fundLedgers[0]));
  assert.equal(requireNoDuplicateIdempotency([...arLedgers, ...fundLedgers], 'debt collection cross-ledger'), true);
});

test('Phase78: cancel order release gate reverses stock once and nets to zero', () => {
  const stockTransactions = [{
    sourceType: 'salesOrder',
    sourceId: 'SO-P78-001',
    productCode: 'P001',
    direction: 'OUT',
    quantity: 10,
    signedQuantity: -10,
    status: 'posted',
    idempotencyKey: 'STOCK-OUT:SO-P78-001:P001'
  }, {
    sourceType: 'salesOrderCancel',
    sourceId: 'SO-P78-001',
    productCode: 'P001',
    direction: 'IN',
    quantity: 10,
    signedQuantity: 10,
    status: 'posted',
    reversalOf: 'STOCK-OUT:SO-P78-001:P001',
    idempotencyKey: 'STOCK-REVERSAL:SO-P78-001:P001'
  }];

  assert.equal(sumBy(stockTransactions, stockEffect), 0);
  assert.equal(requireNoDuplicateIdempotency(stockTransactions, 'cancel stock reversal'), true);
});

test('Phase78: fund transfer release gate has two balanced idempotent rows', () => {
  const transfer = {
    transferId: 'FT-P78-001',
    sourceFund: 'CASH_MAIN',
    targetFund: 'BANK_VCB',
    amount: 10000000
  };
  const fundLedgers = [{
    category: 'TRANSFER',
    type: 'fund_transfer',
    direction: 'out',
    amount: transfer.amount,
    sourceFund: transfer.sourceFund,
    targetFund: transfer.targetFund,
    transferId: transfer.transferId,
    sourceType: 'FUND_TRANSFER',
    sourceId: transfer.transferId,
    status: 'posted',
    idempotencyKey: `FUND-TRANSFER-OUT:${transfer.transferId}`
  }, {
    category: 'TRANSFER',
    type: 'fund_transfer',
    direction: 'in',
    amount: transfer.amount,
    sourceFund: transfer.sourceFund,
    targetFund: transfer.targetFund,
    transferId: transfer.transferId,
    sourceType: 'FUND_TRANSFER',
    sourceId: transfer.transferId,
    status: 'posted',
    idempotencyKey: `FUND-TRANSFER-IN:${transfer.transferId}`
  }];

  assert.equal(fundLedgers.filter((row) => row.direction === 'out').length, 1);
  assert.equal(fundLedgers.filter((row) => row.direction === 'in').length, 1);
  assert.equal(sumBy(fundLedgers, fundEffect), 0);
  assert.equal(requireNoDuplicateIdempotency(fundLedgers, 'fund transfer'), true);
});
