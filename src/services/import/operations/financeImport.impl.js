'use strict';

const dateUtil = require('../../../utils/date.util');
const Cashbook = require('../../../models/Cashbook');
const ArLedger = require('../../../models/ArLedger');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const financialService = require('../../financialService');
const IMPORT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 1000);
const { addImportLog } = require('../core/importLogging.util');

const {
  cleanText,
  dateOnly,
  findCustomerByAny,
  getCustomerCodeFromRow,
  number
} = require('../core/importValue.util');
const {
  buildRunningCodes,
  insertManyInBatches,
  preloadCustomersByCode
} = require('../core/importPersistence.util');

async function importOpeningDebt(rows = []) {
  let skipped = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const docs = [];

  for (const row of rows) {
    const customerCode = getCustomerCodeFromRow(row);
    const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
    const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? row['Công nợ'] ?? row['Cong no'] ?? number(row, ['amount', 'số tiền', 'so tien', 'công nợ', 'cong no', 'nợ đầu']));
    if (!customer || amount < 0) {
      skipped += 1;
      errors.push({ customerCode, message: !customer ? 'Không tìm thấy khách hàng' : 'Công nợ đầu không được âm' });
      continue;
    }
    const now = dateUtil.nowIso();
    docs.push({
      id: makeId('PM'),
      date: dateOnly(row.date || dateUtil.todayVN()),
      type: 'opening_debt',
      refType: 'opening',
      refId: '',
      refCode: 'OPENING',
      customerId: String(customer.id || customer._id || customer.code),
      customerCode: customer.code,
      customerName: customer.name,
      debit: amount,
      credit: 0,
      amount,
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Công nợ đầu kỳ import Excel',
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
  }

  const result = await insertManyInBatches(ArLedger, docs);
  skipped += result.errors.length;
  errors.push(...result.errors.map((e) => ({ customerCode: '', message: e.message })));
  const imported = Math.max(0, docs.length - result.errors.length);
  await addImportLog('openingDebt', { imported, skipped, errors: errors.slice(0, 30), mode: 'insertMany', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors };
}

function normalizeImportPaymentMethod(row = {}) {
  const raw = normalizeText(
    row.method ||
    row.paymentMethod ||
    row['Phương thức'] ||
    row['Phuong thuc'] ||
    row['Hình thức'] ||
    row['Hinh thuc'] ||
    'cash'
  );
  return raw.includes('chuyen') || raw.includes('transfer') || raw.includes('bank')
    ? 'transfer'
    : 'cash';
}

async function importDebtCollections(rows = [], options = {}) {
  let skipped = 0;
  let imported = 0;
  const errors = [];
  const customerMap = await preloadCustomersByCode(rows);
  const importSessionId = cleanText(options.importSessionId || options.sessionId || 'manual');

  for (const [rowIndex, row] of rows.entries()) {
    const customerCode = getCustomerCodeFromRow(row);
    try {
      const customer = customerMap.get(cleanText(customerCode)) || await findCustomerByAny(customerCode);
      const amount = toNumber(
        row.amount ??
        row['Số tiền'] ??
        row['So tien'] ??
        row['Tiền thu'] ??
        row['Tien thu'] ??
        number(row, ['amount', 'số tiền', 'so tien', 'tiền thu', 'tien thu'])
      );
      if (!customer) {
        const error = new Error('Không tìm thấy khách hàng');
        error.code = 'CUSTOMER_NOT_FOUND';
        throw error;
      }
      if (amount <= 0) {
        const error = new Error('Số tiền thu phải lớn hơn 0');
        error.code = 'INVALID_RECEIPT_AMOUNT';
        throw error;
      }

      const sourceRow = Number(row.__sourceRow || row.__rowNumber || rowIndex + 2);
      const explicitCode = cleanText(row.code || row.receiptCode || row['Mã phiếu'] || row['Ma phieu']);
      const importIdempotencyKey = [
        'EXCEL_DEBT',
        importSessionId,
        sourceRow,
        cleanText(customer.code || customerCode),
        amount
      ].join('|');

      const result = await financialService.createReceipt({
        code: explicitCode,
        date: dateOnly(row.date || dateUtil.todayVN()),
        customerId: String(customer.id || customer._id || customer.code),
        customerCode: customer.code,
        customerName: customer.name,
        method: normalizeImportPaymentMethod(row),
        amount,
        staffName: cleanText(row.staffName || row['Người thu'] || row['Nguoi thu'] || row['Nhân viên']),
        note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import thu công nợ Excel',
        source: 'excel_debt_collection_import',
        refType: 'debt_collection_import',
        importIdempotencyKey
      });

      if (result?.error) {
        const error = new Error(result.error);
        error.status = result.status;
        error.code = result.code || 'DEBT_COLLECTION_IMPORT_FAILED';
        throw error;
      }
      if (result?.duplicate) skipped += 1;
      else imported += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        row: Number(row.__sourceRow || row.__rowNumber || rowIndex + 2),
        customerCode,
        code: error?.code || 'DEBT_COLLECTION_IMPORT_FAILED',
        message: error?.message || String(error)
      });
    }
  }

  await addImportLog('debtCollections', {
    imported,
    skipped,
    errors: errors.slice(0, 100),
    mode: 'atomicReceiptArFundPerRow',
    importSessionId
  });
  return { imported, skipped, errors };
}

async function importCashbook(rows = []) {
  let skipped = 0;
  const errors = [];
  const docs = [];
  const inCount = rows.filter((row) => {
    const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
    return !(typeRaw.includes('chi') || typeRaw === 'out');
  }).length;
  const outCount = rows.length - inCount;
  const inCodes = await buildRunningCodes(Cashbook, 'PT', inCount);
  const outCodes = await buildRunningCodes(Cashbook, 'PC', outCount);
  let inIdx = 0;
  let outIdx = 0;

  for (const row of rows) {
    const typeRaw = normalizeText(row.type || row['Loại'] || row['Loai'] || row['Thu chi'] || 'in');
    const type = typeRaw.includes('chi') || typeRaw === 'out' ? 'out' : 'in';
    const amount = toNumber(row.amount ?? row['Số tiền'] ?? row['So tien'] ?? number(row, ['amount', 'số tiền', 'so tien']));
    if (amount <= 0) {
      skipped += 1;
      errors.push({ message: 'Số tiền phải lớn hơn 0' });
      continue;
    }
    const now = dateUtil.nowIso();
    docs.push({
      id: makeId('CB'),
      code: cleanText(row.code || row['Mã phiếu'] || row['Ma phieu']) || (type === 'out' ? outCodes[outIdx++] : inCodes[inIdx++]),
      date: dateOnly(row.date || row['Ngày'] || row['Ngay'] || dateUtil.todayVN()),
      type,
      source: cleanText(row.source || row['Nguồn'] || row['Nguon'] || row['Nhóm tiền']) || 'import_excel',
      refType: 'manual_import',
      refId: '',
      refCode: '',
      staffName: cleanText(row.staffName || row['Người nộp/nhận'] || row['Nguoi nop'] || row['Nhân viên']),
      amount,
      note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']) || 'Import quỹ tiền Excel',
      status: 'posted',
      createdAt: now,
      updatedAt: now
    });
  }

  const result = await insertManyInBatches(Cashbook, docs);
  skipped += result.errors.length;
  errors.push(...result.errors.map((e) => ({ message: e.message })));
  const imported = Math.max(0, docs.length - result.errors.length);
  await addImportLog('cashbook', { imported, skipped, errors: errors.slice(0, 30), mode: 'insertMany', batchSize: IMPORT_BATCH_SIZE });
  return { imported, skipped, errors };
}

module.exports = {
  importOpeningDebt,
  normalizeImportPaymentMethod,
  importDebtCollections,
  importCashbook
};