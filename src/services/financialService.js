'use strict';

const receiptRepository = require('../repositories/receiptRepository');
const cashbookRepository = require('../repositories/cashbookRepository');
const bankbookRepository = require('../repositories/bankbookRepository');
const paymentRepository = require('../repositories/paymentRepository');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const customerRepository = require('../repositories/customerRepository');
const orderRepository = require('../repositories/orderRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const postingEngine = require('../engines/posting.engine');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

// Chặn chứng từ nhập sai định dạng tiền gây lệch sổ công nợ.
// Có thể nâng ngưỡng này sau, nhưng một chứng từ thu công nợ thông thường không nên vượt 1 tỷ.
const MAX_SAFE_RECEIPT_AMOUNT = 1000000000;

function assertSafeMoneyAmount(amount, label = 'Số tiền') {
  const value = toNumber(amount);
  if (value > MAX_SAFE_RECEIPT_AMOUNT) {
    return { error: `${label} quá lớn, vui lòng kiểm tra lại định dạng nhập tiền`, status: 400 };
  }
  return null;
}

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function ledgerOrderKeysFrom(value = {}) {
  return [
    value.orderId,
    value.orderCode,
    value.salesOrderId,
    value.salesOrderCode,
    value.refId,
    value.refCode,
    value.id,
    value.code
  ].map((item) => String(item || '').trim()).filter(Boolean);
}

function ledgerEntryMatchesOrder(entry = {}, keys = []) {
  if (!keys.length) return false;
  const entryKeys = ledgerOrderKeysFrom(entry);
  return entryKeys.some((key) => keys.includes(key));
}

async function syncOrderDebtCacheFromAR(orderOrKey, options = {}) {
  const seed = typeof orderOrKey === 'object' && orderOrKey !== null ? orderOrKey : { id: orderOrKey, code: orderOrKey };
  const keys = ledgerOrderKeysFrom(seed);
  if (!keys.length) return null;
  const order = await orderRepository.findByIdOrCode(keys[0]);
  const allKeys = [...new Set([...keys, ...ledgerOrderKeysFrom(order || {})])];
  if (!order || !allKeys.length) return null;

  const journals = await paymentRepository.findAll({}, options);
  const balance = journals
    .filter(isActive)
    .filter((entry) => ledgerEntryMatchesOrder(entry, allKeys))
    .reduce((sum, entry) => sum + toNumber(entry.debit) - toNumber(entry.credit), 0);
  const nextDebt = Math.max(0, normalizeDebtAmount(balance));
  const updated = {
    ...order,
    debtAmount: nextDebt,
    debt: nextDebt,
    arBalance: nextDebt,
    arStatus: hasOpenDebt(nextDebt) ? 'ar_posted' : 'paid',
    lifecycleStatus: hasOpenDebt(nextDebt) ? (order.lifecycleStatus || 'ar_posted') : 'paid',
    paidAt: !hasOpenDebt(nextDebt) ? (order.paidAt || nowIso()) : (order.paidAt || ''),
    updatedAt: nowIso()
  };
  await orderRepository.upsert(updated, options);
  return updated;
}

async function syncAllocatedOrderDebtCaches(allocations = [], options = {}) {
  const keys = parseAllocations(allocations)
    .flatMap((row) => [row.orderId, row.orderCode])
    .map((key) => String(key || '').trim())
    .filter(Boolean);
  const unique = [...new Set(keys)];
  const results = [];
  for (const key of unique) {
    const updated = await syncOrderDebtCacheFromAR(key, options);
    if (updated) results.push(updated);
  }
  return results;
}

function buildRunningCode(prefix, rows = []) {
  const max = rows.reduce((result, row) => {
    const match = String(row.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

async function buildCashCode(type = 'in') {
  const rows = await cashbookRepository.findAll();
  return buildRunningCode(type === 'out' ? 'CT' : 'PT', rows);
}

async function buildBankCode() {
  const rows = await bankbookRepository.findAll();
  return buildRunningCode('NH', rows);
}


function parseAllocations(value) {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch (_) { rows = []; }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      orderId: String(row.orderId || row.salesOrderId || row.id || '').trim(),
      orderCode: String(row.orderCode || row.salesOrderCode || row.code || '').trim(),
      amount: toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount)
    }))
    .filter((row) => (row.orderId || row.orderCode) && row.amount > 0);
}

function splitAllocationsByAmount(allocations = [], amount = 0) {
  let remain = toNumber(amount);
  const result = [];
  for (const row of parseAllocations(allocations)) {
    if (remain <= 0) break;
    const applied = Math.min(toNumber(row.amount), remain);
    if (applied > 0) result.push({ ...row, amount: applied });
    remain -= applied;
  }
  return result;
}

function allocationPrimary(allocations = []) {
  const first = parseAllocations(allocations)[0] || {};
  return {
    orderId: first.orderId || '',
    orderCode: first.orderCode || '',
    salesOrderId: first.orderId || '',
    salesOrderCode: first.orderCode || ''
  };
}

async function applyReceiptToOrderDebts(receipt = {}, options = {}) {
  const rows = parseAllocations(receipt.allocations);
  const allocations = rows.length ? rows : parseAllocations([{
    orderId: receipt.orderId || receipt.salesOrderId || receipt.refId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    amount: receipt.amount
  }]);

  // V45 chuẩn AR Ledger: không trừ công nợ bằng cách sửa trực tiếp order.debtAmount.
  // order.debtAmount/arBalance chỉ là cache hiển thị, luôn được tính lại từ journals sau khi đã post AR.
  return syncAllocatedOrderDebtCaches(allocations, options);
}

async function reverseReceiptFromOrderDebts(receipt = {}, options = {}) {
  const rows = parseAllocations(receipt.allocations);
  const allocations = rows.length ? rows : parseAllocations([{
    orderId: receipt.orderId || receipt.salesOrderId || receipt.refId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    amount: receipt.amount
  }]);

  // Hủy phiếu thu cũng không cộng/trừ trực tiếp vào order.
  // Bút toán đảo đã vào journals, cache được rebuild lại từ AR Ledger.
  return syncAllocatedOrderDebtCaches(allocations, options);
}

async function buildReceiptCode() {
  const rows = await receiptRepository.findAll();
  return buildRunningCode('TH', rows);
}

function cashSummary(rows = []) {
  const active = rows.filter(isActive);
  const cashIn = active.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const cashOut = active.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { cashIn, cashOut, balance: cashIn - cashOut };
}

function bankSummary(rows = []) {
  const active = rows.filter(isActive);
  const bankIn = active.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const bankOut = active.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { bankIn, bankOut, balance: bankIn - bankOut };
}

function matchMoneyQuery(row, q) {
  return [row.code, row.source, row.refCode, row.customerCode, row.customerName, row.staffName, row.note]
    .some((value) => normalizeText(value).includes(q));
}

async function listCashbook(query = {}) {
  const q = normalizeText(query.q);
  let cashbooks = await cashbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  let bankbooks = await bankbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  if (q) {
    cashbooks = cashbooks.filter((row) => matchMoneyQuery(row, q));
    bankbooks = bankbooks.filter((row) => matchMoneyQuery(row, q));
  }
  return { cashbook: cashbooks, cashbooks, bankbooks, summary: cashSummary(cashbooks), bankSummary: bankSummary(bankbooks) };
}

async function createCashbook(body = {}) {
  const amount = toNumber(body.amount);
  if (amount <= 0) return { error: 'Số tiền phải lớn hơn 0', status: 400 };
  const type = String(body.type || 'in').toLowerCase() === 'out' ? 'out' : 'in';
  const entry = {
    id: String(body.id || makeId('CB')).trim(),
    code: String(body.code || await buildCashCode(type)).trim(),
    date: String(body.date || today()).slice(0, 10),
    type,
    source: String(body.source || 'manual_cashbook').trim(),
    refType: String(body.refType || 'manual_cashbook').trim(),
    refId: String(body.refId || '').trim(),
    refCode: String(body.refCode || '').trim(),
    customerId: String(body.customerId || '').trim(),
    customerCode: String(body.customerCode || '').trim(),
    customerName: String(body.customerName || '').trim(),
    staffName: String(body.staffName || '').trim(),
    method: 'cash',
    amount,
    note: String(body.note || '').trim(),
    status: body.status || 'posted',
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await cashbookRepository.upsert(entry, { session });
  });
  return { entry };
}

async function listBankbook() {
  const bankbooks = await bankbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return { bankbooks, summary: bankSummary(bankbooks) };
}

async function listReceipts(query = {}) {
  const q = normalizeText(query.q);
  let receipts = await receiptRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  if (q) {
    receipts = receipts.filter((r) => [r.code, r.customerCode, r.customerName, r.staffName, r.refCode, r.note]
      .some((value) => normalizeText(value).includes(q)));
  }
  return receipts;
}

async function resolveCustomer(body = {}) {
  const identity = String(body.customerId || body.customerCode || body.customerName || '').trim();
  let customer = null;
  if (identity) customer = await customerRepository.findByIdOrCode(identity);
  if (customer) return customer;

  // Mobile giao hàng có thể thu tiền từ đơn đã chốt/snapshot cũ.
  // Không được làm rơi phiếu thu chỉ vì danh mục khách hàng hiện tại không tìm thấy mã khách.
  // Khi có đủ thông tin khách trên đơn, cho phép dùng snapshot khách hàng của đơn để ghi receipt/cashbook/bankbook.
  const allowSnapshot = body.allowCustomerSnapshot === true || String(body.source || '').startsWith('mobile_');
  const code = String(body.customerCode || body.customerId || '').trim();
  const name = String(body.customerName || '').trim();
  if (allowSnapshot && (code || name)) {
    return {
      id: String(body.customerId || code || name).trim(),
      code,
      name: name || code
    };
  }

  return null;
}

async function createReceipt(body = {}) {
  const amount = toNumber(body.amount);
  if (amount <= 0) return { error: 'Số tiền thu phải lớn hơn 0', status: 400 };
  const unsafeAmount = assertSafeMoneyAmount(amount, 'Số tiền thu');
  if (unsafeAmount) return unsafeAmount;
  const customer = await resolveCustomer(body);
  if (!customer) return { error: 'Không tìm thấy khách hàng', status: 404 };
  const method = ['transfer', 'bank'].includes(String(body.method || '').toLowerCase()) ? 'transfer' : 'cash';
  const allocations = splitAllocationsByAmount(body.allocations, amount);
  const primaryAllocation = allocationPrimary(allocations);
  const now = nowIso();
  const receipt = {
    ...body,
    id: String(body.id || makeId('RC')).trim(),
    code: String(body.code || await buildReceiptCode()).trim(),
    date: String(body.date || today()).slice(0, 10),
    customerId: customer.id || body.customerId || customer.code || '',
    customerCode: customer.code || body.customerCode || '',
    customerName: customer.name || body.customerName || '',
    method,
    amount,
    staffName: String(body.staffName || '').trim(),
    note: String(body.note || '').trim(),
    refType: body.refType || 'receipt',
    refId: body.refId || body.orderId || body.salesOrderId || primaryAllocation.orderId || '',
    refCode: body.refCode || body.orderCode || body.salesOrderCode || primaryAllocation.orderCode || '',
    orderId: body.orderId || body.salesOrderId || body.refId || primaryAllocation.orderId || '',
    orderCode: body.orderCode || body.salesOrderCode || body.refCode || primaryAllocation.orderCode || '',
    salesOrderId: body.salesOrderId || body.orderId || body.refId || primaryAllocation.orderId || '',
    salesOrderCode: body.salesOrderCode || body.orderCode || body.refCode || primaryAllocation.orderCode || '',
    allocations,
    status: body.status === 'void' || body.status === 'cancelled' ? 'void' : 'posted',
    voidReason: body.voidReason || '',
    voidedAt: body.voidedAt || '',
    createdAt: body.createdAt || now,
    updatedAt: now
  };
  const payment = {
    id: makeId('PM'),
    date: receipt.date,
    type: 'ar_receipt',
    account: 'AR',
    refType: 'RECEIPT',
    refId: receipt.id,
    refCode: receipt.code,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    debit: 0,
    credit: receipt.amount,
    amount: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    status: 'posted',
    source: receipt.source || 'financial_service',
    createdAt: now,
    updatedAt: now
  };
  const moneyEntry = {
    id: makeId(method === 'transfer' ? 'BB' : 'CB'),
    code: method === 'transfer' ? await buildBankCode() : await buildCashCode('in'),
    date: receipt.date,
    type: 'in',
    source: 'receipt',
    refType: 'receipt',
    refId: receipt.id,
    refCode: receipt.code,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    staffName: receipt.staffName,
    method,
    amount: receipt.amount,
    amount: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    status: 'posted',
    source: receipt.source || 'financial_service',
    createdAt: now,
    updatedAt: now
  };
  await withMongoTransaction(async (session) => {
    await receiptRepository.upsert(receipt, { session });
    await postingEngine.postReceiptAR(receipt, { session });
    await applyReceiptToOrderDebts(receipt, { session });
    if (method === 'transfer') await bankbookRepository.upsert(moneyEntry, { session });
    else await cashbookRepository.upsert(moneyEntry, { session });
  });

  return { receipt };
}

async function voidReceipt(id, body = {}, query = {}) {
  const receipt = await receiptRepository.findByIdOrCode(id);
  if (!receipt) return { error: 'Không tìm thấy phiếu thu', status: 404 };
  if (String(receipt.status || '').toLowerCase() === 'void') {
    return { error: 'Phiếu thu đã hủy trước đó, không được hủy lặp', status: 409 };
  }

  const now = nowIso();
  const voided = {
    ...receipt,
    status: 'void',
    voidReason: String(query.reason || body.reason || body.voidReason || 'Hủy phiếu thu').trim(),
    voidedAt: now,
    updatedAt: now
  };

  // Chuẩn ERP/DMS:
  // - Không xóa/sửa mất dấu bút toán AR gốc trong journals.
  // - Khi hủy phiếu thu phải sinh thêm bút toán đảo: Nợ 131 / Có 111-112.
  // - Sổ tiền/cashbook/bankbook của phiếu thu gốc được đánh dấu void để báo cáo quỹ không tính dòng thu đã hủy.
  const sameReceiptRef = (entry = {}) => {
    const refType = String(entry.refType || '').toLowerCase();
    return refType === 'receipt' && (String(entry.refId || '') === String(receipt.id || '') || String(entry.refCode || '') === String(receipt.code || ''));
  };

  const [cashbooks, bankbooks] = await Promise.all([
    cashbookRepository.findAll(),
    bankbookRepository.findAll()
  ]);

  await withMongoTransaction(async (session) => {
    await receiptRepository.upsert(voided, { session });

    // Sinh bút toán đảo công nợ idempotent: hủy lại hoặc rebuild không tạo trùng.
    await postingEngine.reverseReceiptAR(voided, { session });
    await reverseReceiptFromOrderDebts(receipt, { session });

    await Promise.all([
      ...cashbooks.filter(sameReceiptRef).map((entry) => cashbookRepository.upsert({ ...entry, status: 'void', voidReason: voided.voidReason, voidedAt: now, updatedAt: now }, { session })),
      ...bankbooks.filter(sameReceiptRef).map((entry) => bankbookRepository.upsert({ ...entry, status: 'void', voidReason: voided.voidReason, voidedAt: now, updatedAt: now }, { session }))
    ]);
  });
  return { receipt: voided };
}

async function buildManualReturnCode() {
  const rows = await returnOrderRepository.findAll();
  return buildRunningCode('THH', rows);
}

async function createDebtCollection(body = {}) {
  const cashAmount = toNumber(body.cashAmount);
  const transferAmount = toNumber(body.transferAmount);
  const returnAmount = toNumber(body.returnAmount);
  const totalAmount = cashAmount + transferAmount + returnAmount;
  if (totalAmount <= 0) return { error: 'Bạn cần nhập tiền mặt, chuyển khoản hoặc hàng trả về.', status: 400 };
  const unsafeCash = assertSafeMoneyAmount(cashAmount, 'Tiền mặt');
  if (unsafeCash) return unsafeCash;
  const unsafeTransfer = assertSafeMoneyAmount(transferAmount, 'Tiền chuyển khoản');
  if (unsafeTransfer) return unsafeTransfer;
  const unsafeReturn = assertSafeMoneyAmount(returnAmount, 'Giá trị hàng trả');
  if (unsafeReturn) return unsafeReturn;
  const unsafeTotal = assertSafeMoneyAmount(totalAmount, 'Tổng tiền xử lý công nợ');
  if (unsafeTotal) return unsafeTotal;

  const customer = await resolveCustomer(body);
  if (!customer) return { error: 'Không tìm thấy khách hàng', status: 404 };

  const date = String(body.date || today()).slice(0, 10);
  const staffName = String(body.staffName || '').trim();
  const note = String(body.note || '').trim();
  const allAllocations = parseAllocations(body.allocations);
  const allocatedTotal = allAllocations.reduce((total, row) => total + toNumber(row.amount), 0);
  if (allAllocations.length && allocatedTotal + 0.0001 < totalAmount) {
    return { error: 'Tổng tiền phân bổ theo đơn nhỏ hơn tổng tiền cần thu/trả.', status: 400 };
  }
  let allocationCursor = allAllocations.slice();
  const takeAllocations = (amount) => {
    const selected = splitAllocationsByAmount(allocationCursor, amount);
    let remain = toNumber(amount);
    allocationCursor = allocationCursor.map((row) => {
      if (remain <= 0) return row;
      const used = Math.min(toNumber(row.amount), remain);
      remain -= used;
      return { ...row, amount: toNumber(row.amount) - used };
    }).filter((row) => toNumber(row.amount) > 0);
    return selected;
  };
  const docs = { receipts: [], returnOrder: null };

  if (cashAmount > 0) {
    const result = await createReceipt({
      ...body,
      date,
      customerId: customer.id || customer.code || '',
      customerCode: customer.code || '',
      customerName: customer.name || '',
      method: 'cash',
      amount: cashAmount,
      allocations: takeAllocations(cashAmount),
      staffName,
      note: note || 'Thu tiền mặt công nợ',
      refType: 'debt_collection'
    });
    if (result.error) return result;
    docs.receipts.push(result.receipt);
  }

  if (transferAmount > 0) {
    const result = await createReceipt({
      ...body,
      date,
      customerId: customer.id || customer.code || '',
      customerCode: customer.code || '',
      customerName: customer.name || '',
      method: 'transfer',
      amount: transferAmount,
      allocations: takeAllocations(transferAmount),
      staffName,
      note: note || 'Thu chuyển khoản công nợ',
      refType: 'debt_collection'
    });
    if (result.error) return result;
    docs.receipts.push(result.receipt);
  }

  if (returnAmount > 0) {
    const now = nowIso();
    const returnAllocations = takeAllocations(returnAmount);
    const primaryReturnAllocation = allocationPrimary(returnAllocations);
    const returnOrder = {
      id: makeId('RO'),
      code: await buildManualReturnCode(),
      date,
      customerId: customer.id || customer.code || '',
      customerCode: customer.code || '',
      customerName: customer.name || '',
      salesOrderId: primaryReturnAllocation.salesOrderId || String(body.orderId || body.salesOrderId || '').trim(),
      salesOrderCode: primaryReturnAllocation.salesOrderCode || String(body.orderCode || body.salesOrderCode || '').trim(),
      allocations: returnAllocations,
      items: [],
      totalQuantity: 0,
      totalAmount: returnAmount,
      debtReduction: returnAmount,
      staffName,
      note: note || 'Ghi giảm công nợ do hàng trả về',
      status: 'posted',
      source: 'debt_collection_manual_return',
      createdAt: now,
      updatedAt: now
    };
    const payments = (returnAllocations.length ? returnAllocations : [{ orderId: returnOrder.salesOrderId, orderCode: returnOrder.salesOrderCode, amount: returnAmount }])
      .map((allocation, index) => ({
        id: `AR-RETURN-${returnOrder.id}-${allocation.orderId || allocation.orderCode || index + 1}`,
        code: `AR-RETURN-${returnOrder.code}-${index + 1}`,
        date,
        type: 'return_manual',
        account: 'AR',
        refType: 'RETURN_ORDER',
        refId: returnOrder.id,
        refCode: returnOrder.code,
        orderId: allocation.orderId || '',
        orderCode: allocation.orderCode || '',
        customerId: returnOrder.customerId,
        customerCode: returnOrder.customerCode,
        customerName: returnOrder.customerName,
        debit: 0,
        credit: toNumber(allocation.amount),
        amount: toNumber(allocation.amount),
        note: returnOrder.note,
        status: 'posted',
        source: 'debt_collection_manual_return',
        createdAt: now,
        updatedAt: now
      }));
    await withMongoTransaction(async (session) => {
      await returnOrderRepository.upsert(returnOrder, { session });
      await Promise.all(payments.map((payment) => paymentRepository.upsert(payment, { session })));
      await syncAllocatedOrderDebtCaches(returnAllocations.length ? returnAllocations : [{ orderId: returnOrder.salesOrderId, orderCode: returnOrder.salesOrderCode, amount: returnAmount }], { session });
    });
    docs.returnOrder = returnOrder;
  }

  return { ...docs, totalAmount, message: 'Đã ghi chứng từ công nợ' };
}

module.exports = {
  listCashbook,
  createCashbook,
  listBankbook,
  listReceipts,
  createReceipt,
  createDebtCollection,
  syncOrderDebtCacheFromAR,
  syncAllocatedOrderDebtCaches,
  voidReceipt,
  cashSummary,
  bankSummary
};
