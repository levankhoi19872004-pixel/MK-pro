'use strict';

const FundLedger = require('../models/FundLedger');
const ExpenseVoucher = require('../models/ExpenseVoucher');
const DebtCollection = require('../models/DebtCollection');
const Receipt = require('../models/Receipt');
const SupplierPayment = require('../models/SupplierPayment');
const fundLedgerRepository = require('../repositories/fundLedgerRepository');
const dateUtil = require('../utils/date.util');
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../utils/excelWriter.util');

const MAX_RANGE_DAYS = 366;
const MAX_PAGE_LIMIT = 200;
const EXPORT_ROW_LIMIT = 50000;
const ACTIVE_LEDGER_STATUSES = ['', 'posted', 'confirmed', 'accounting_confirmed', 'matched'];
const BLOCKED_LEDGER_STATUSES = ['draft', 'pending', 'submitted', 'cancelled', 'canceled', 'void', 'deleted'];
const TRANSACTION_TYPES = new Set(['all', 'deposit', 'expense', 'transfer']);
const ROLE_FILTERS = new Map([
  ['sales', 'NVBH'],
  ['nvbh', 'NVBH'],
  ['delivery', 'NVGH'],
  ['nvgh', 'NVGH'],
  ['accountant', 'Kế toán'],
  ['cashier', 'Thủ quỹ'],
  ['supplier', 'Nhà cung cấp'],
  ['customer', 'Khách hàng'],
  ['other', 'Khác'],
  ['unknown', 'Chưa xác định'],
  ['internal', 'Nội bộ']
]);
const SORT_FIELDS = new Set([
  'personName',
  'depositedAmount',
  'depositVoucherCount',
  'expenseAmount',
  'expenseVoucherCount',
  'netAmount',
  'lastTransactionAt',
  'internalTransferAmount'
]);

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function lower(value) {
  return text(value).toLowerCase();
}

function safeMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const normalized = text(value).replace(/[\s.,]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function strictDateOnly(value, fieldName) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || dateUtil.toDateOnly(raw, '') !== raw) {
    const error = new Error(`${fieldName} không hợp lệ, định dạng yêu cầu YYYY-MM-DD`);
    error.status = 400;
    error.code = 'INVALID_DATE';
    throw error;
  }
  return raw;
}

function dateOrdinal(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function vietnamUtcRange(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00+07:00`);
  const endDate = dateUtil.addDaysToDateOnly(toDate, 1);
  const end = new Date(`${endDate}T00:00:00+07:00`);
  return { start, end };
}

function normalizeRole(value, fallback = 'Khác') {
  const raw = lower(value).replace(/[ _-]+/g, '');
  if (!raw) return fallback;
  if (['sales', 'sale', 'nvbh', 'salesman', 'nhanvienbanhang'].includes(raw)) return 'NVBH';
  if (['delivery', 'shipper', 'nvgh', 'giaohang', 'nhanviengiaohang'].includes(raw)) return 'NVGH';
  if (['accountant', 'ketoan'].includes(raw)) return 'Kế toán';
  if (['cashier', 'thuquy'].includes(raw)) return 'Thủ quỹ';
  if (['supplier', 'nhacungcap'].includes(raw)) return 'Nhà cung cấp';
  if (['customer', 'khachhang'].includes(raw)) return 'Khách hàng';
  if (['internal', 'transfer', 'noibo'].includes(raw)) return 'Nội bộ';
  if (['unknown', 'unidentified', 'chuaxacdinh'].includes(raw)) return 'Chưa xác định';
  return fallback;
}

function roleKey(role) {
  const normalized = normalizeRole(role, text(role) || 'Khác');
  const map = {
    NVBH: 'SALES',
    NVGH: 'DELIVERY',
    'Kế toán': 'ACCOUNTANT',
    'Thủ quỹ': 'CASHIER',
    'Nhà cung cấp': 'SUPPLIER',
    'Khách hàng': 'CUSTOMER',
    'Nội bộ': 'INTERNAL',
    'Chưa xác định': 'UNKNOWN',
    Khác: 'OTHER'
  };
  return map[normalized] || 'OTHER';
}

function personKeyOf(person = {}) {
  const code = upper(person.personCode);
  const name = lower(person.personName).replace(/\s+/g, ' ');
  const key = roleKey(person.personRole);
  if (code) return `${key}:CODE:${code}`;
  if (name && name !== 'chưa xác định') return `${key}:NAME:${name}`;
  return 'UNKNOWN:UNIDENTIFIED';
}

/**
 * Chuẩn hóa đối tượng thực nộp/nhận tiền. createdBy chỉ là người thao tác,
 * không được dùng làm đối tượng nghiệp vụ khi không có trường đối tượng riêng.
 */
function resolveFundCounterparty(entry = {}) {
  const sourceType = upper(entry.sourceType || entry.refType || entry.referenceType);
  const transactionClass = upper(entry.transactionClass || classifyTransaction(entry));
  const reversal = entry.isReversal === true || safeMoney(entry.amount) < 0 || /REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN/.test(sourceType);
  const originalDirection = lower(entry.direction);
  const identityClass = reversal && ['in', 'out'].includes(originalDirection)
    ? (originalDirection === 'in' ? 'DEPOSIT' : 'EXPENSE')
    : transactionClass;
  const expenseSource = entry.expenseSource || entry.expenseVoucher || {};
  const debtSource = entry.debtSource || entry.debtCollection || {};
  const supplierSource = entry.supplierSource || entry.supplierPayment || {};
  const receiptSource = entry.receiptSource || entry.receipt || {};

  if (transactionClass === 'TRANSFER' || sourceType === 'FUND_TRANSFER') {
    return {
      personCode: '',
      personName: 'Chuyển quỹ nội bộ',
      personRole: 'Nội bộ',
      sourceField: 'sourceType:FUND_TRANSFER',
      personKey: 'INTERNAL:TRANSFER'
    };
  }

  const pick = (candidates = []) => {
    for (const candidate of candidates) {
      const code = text(candidate.code);
      const name = text(candidate.name);
      if (!code && !name) continue;
      const person = {
        personCode: code,
        personName: name || code,
        personRole: normalizeRole(candidate.role, candidate.fallbackRole || 'Khác'),
        sourceField: candidate.sourceField
      };
      return { ...person, personKey: personKeyOf(person) };
    }
    const unknown = {
      personCode: '',
      personName: 'Chưa xác định',
      personRole: 'Chưa xác định',
      sourceField: 'unresolved'
    };
    return { ...unknown, personKey: personKeyOf(unknown) };
  };

  if (identityClass === 'EXPENSE') {
    return pick([
      {
        code: entry.receiverCode || expenseSource.receiverCode,
        name: entry.receiverName || expenseSource.receiverName,
        role: entry.receiverRole || expenseSource.receiverRole,
        fallbackRole: 'Khác',
        sourceField: entry.receiverName || entry.receiverCode ? 'fundLedger.receiver*' : 'expenseVoucher.receiver*'
      },
      {
        code: entry.supplierCode || supplierSource.supplierCode,
        name: entry.supplierName || supplierSource.supplierName,
        role: 'supplier',
        fallbackRole: 'Nhà cung cấp',
        sourceField: entry.supplierName || entry.supplierCode ? 'fundLedger.supplier*' : 'supplierPayment.supplier*'
      },
      {
        code: entry.counterpartyCode || entry.payeeCode,
        name: entry.counterpartyName || entry.payeeName,
        role: entry.counterpartyRole || entry.payeeRole,
        fallbackRole: 'Khác',
        sourceField: 'fundLedger.counterparty/payee'
      },
      {
        code: entry.customerCode || receiptSource.customerCode,
        name: entry.customerName || receiptSource.customerName,
        role: 'customer',
        fallbackRole: 'Khách hàng',
        sourceField: 'fundLedger/customerSource.customer*'
      },
      {
        code: entry.staffCode,
        name: entry.staffName,
        role: entry.staffRole,
        fallbackRole: 'Khác',
        sourceField: 'fundLedger.staff*'
      }
    ]);
  }

  if (['DELIVERY_CASH_SUBMISSION', 'DELIVERY_SHORTAGE_REPAYMENT'].includes(sourceType)) {
    return pick([{
      code: entry.deliveryStaffCode,
      name: entry.deliveryStaffName,
      role: 'delivery',
      fallbackRole: 'NVGH',
      sourceField: 'fundLedger.deliveryStaff*'
    }]);
  }

  const collectorType = entry.collectorType || debtSource.collectorType;
  const receiptCustomerCandidate = ['AR_RECEIPT', 'RECEIPT'].includes(sourceType)
    ? [{
        code: entry.customerCode || receiptSource.customerCode,
        name: entry.customerName || receiptSource.customerName,
        role: 'customer',
        fallbackRole: 'Khách hàng',
        sourceField: entry.customerCode || entry.customerName ? 'fundLedger.customer*' : 'receipt.customer*'
      }]
    : [];
  return pick([
    {
      code: entry.collectorCode || debtSource.collectorCode,
      name: entry.collectorName || debtSource.collectorName,
      role: collectorType,
      fallbackRole: normalizeRole(collectorType, 'Khác'),
      sourceField: entry.collectorCode || entry.collectorName ? 'fundLedger.collector*' : 'debtCollection.collector*'
    },
    {
      code: entry.payerCode || entry.depositorCode || entry.counterpartyCode,
      name: entry.payerName || entry.depositorName || entry.counterpartyName,
      role: entry.payerRole || entry.depositorRole || entry.counterpartyRole,
      fallbackRole: 'Khác',
      sourceField: 'fundLedger.payer/depositor/counterparty'
    },
    ...receiptCustomerCandidate,
    {
      code: entry.salesStaffCode,
      name: entry.salesStaffName,
      role: 'sales',
      fallbackRole: 'NVBH',
      sourceField: 'fundLedger.salesStaff*'
    },
    {
      code: entry.staffCode,
      name: entry.staffName,
      role: entry.staffRole || collectorType,
      fallbackRole: 'Khác',
      sourceField: 'fundLedger.staff*'
    },
    {
      code: entry.customerCode || receiptSource.customerCode || debtSource.customerCode,
      name: entry.customerName || receiptSource.customerName || debtSource.customerName,
      role: 'customer',
      fallbackRole: 'Khách hàng',
      sourceField: 'fundLedger/source.customer*'
    }
  ]);
}

function classifyTransaction(entry = {}) {
  const sourceType = upper(entry.sourceType || entry.refType || entry.referenceType);
  if (sourceType === 'FUND_TRANSFER' || upper(entry.transactionType) === 'TRANSFER') return 'TRANSFER';
  const rawAmount = safeMoney(entry.amount);
  const reversal = entry.isReversal === true || /REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN/.test(sourceType);
  let direction = lower(entry.direction);
  if (rawAmount < 0 || reversal) direction = direction === 'out' ? 'in' : 'out';
  if (direction === 'in') return 'DEPOSIT';
  if (direction === 'out') return 'EXPENSE';
  return 'OTHER';
}

function normalizeLedgerForSummary(entry = {}) {
  const status = lower(entry.status);
  if (BLOCKED_LEDGER_STATUSES.includes(status) || entry.isDeleted === true || entry.deletedAt) return null;
  const sourceType = upper(entry.sourceType || entry.refType || entry.referenceType || 'UNKNOWN');
  const isReversal = entry.isReversal === true || safeMoney(entry.amount) < 0 || /REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN/.test(sourceType);
  // Dữ liệu cũ đôi khi dùng status=reversed cho chính dòng đảo. Chỉ giữ lại khi
  // dòng đó có dấu hiệu đảo rõ ràng; bản ghi gốc bị đánh dấu reversed vẫn bị loại.
  if (status === 'reversed' && !isReversal) return null;
  if (status && status !== 'reversed' && !ACTIVE_LEDGER_STATUSES.includes(status)) return null;
  const amount = Math.abs(safeMoney(entry.amount ?? entry.debit ?? entry.credit));
  if (!amount) return null;
  const transactionClass = classifyTransaction(entry);
  if (transactionClass === 'OTHER') return null;
  const person = resolveFundCounterparty({ ...entry, transactionClass });
  const sourceIdentity = text(
    entry.reversalOf || entry.originalSourceId || entry.sourceId || entry.sourceCode ||
    entry.referenceId || entry.referenceCode || entry.refId || entry.refCode || entry.id || entry.code
  );
  const voucherKey = `${sourceType}:${sourceIdentity || text(entry.idempotencyKey || entry.id || entry.code)}`;
  const signedAmount = transactionClass === 'DEPOSIT' ? amount : transactionClass === 'EXPENSE' ? -amount : amount;
  return {
    ...person,
    transactionClass,
    amount,
    signedAmount,
    voucherKey,
    dedupeKey: text(entry.idempotencyKey)
      ? `IDEMP:${text(entry.idempotencyKey)}`
      : `LEGACY:${sourceType}:${sourceIdentity}:${text(entry.fundType)}:${text(entry.direction)}:${text(entry.account)}:${amount}`,
    code: text(entry.sourceCode || entry.referenceCode || entry.refCode || entry.code),
    sourceType,
    transactionAt: text(entry.createdAt || entry.date),
    date: text(entry.date),
    fundType: lower(entry.fundType) === 'bank' ? 'bank' : 'cash',
    account: text(entry.account),
    note: text(entry.note),
    createdBy: text(entry.createdBy),
    status: text(entry.status || 'posted')
  };
}

function summarizeNormalizedTransactions(transactions = []) {
  const vouchers = new Map();
  const transfers = new Map();
  const seenLedgerRows = new Set();
  for (const transaction of transactions.filter(Boolean)) {
    const dedupeKey = text(transaction.dedupeKey);
    if (dedupeKey && seenLedgerRows.has(dedupeKey)) continue;
    if (dedupeKey) seenLedgerRows.add(dedupeKey);
    if (transaction.transactionClass === 'TRANSFER') {
      const current = transfers.get(transaction.voucherKey) || { ...transaction, amount: 0 };
      current.amount = Math.max(current.amount, Math.abs(transaction.amount));
      current.transactionAt = current.transactionAt > transaction.transactionAt ? current.transactionAt : transaction.transactionAt;
      transfers.set(transaction.voucherKey, current);
      continue;
    }
    const key = `${transaction.personKey}|${transaction.voucherKey}`;
    const current = vouchers.get(key) || { ...transaction, signedAmount: 0 };
    current.signedAmount += Number(transaction.signedAmount || 0);
    current.transactionAt = current.transactionAt > transaction.transactionAt ? current.transactionAt : transaction.transactionAt;
    vouchers.set(key, current);
  }

  const people = new Map();
  for (const voucher of vouchers.values()) {
    if (!voucher.signedAmount) continue;
    const row = people.get(voucher.personKey) || {
      personKey: voucher.personKey,
      personCode: voucher.personCode,
      personName: voucher.personName,
      personRole: voucher.personRole,
      depositedAmount: 0,
      depositVoucherCount: 0,
      expenseAmount: 0,
      expenseVoucherCount: 0,
      netAmount: 0,
      lastTransactionAt: ''
    };
    if (voucher.signedAmount > 0) {
      row.depositedAmount += voucher.signedAmount;
      row.depositVoucherCount += 1;
    } else {
      row.expenseAmount += Math.abs(voucher.signedAmount);
      row.expenseVoucherCount += 1;
    }
    row.netAmount = row.depositedAmount - row.expenseAmount;
    row.lastTransactionAt = row.lastTransactionAt > voucher.transactionAt ? row.lastTransactionAt : voucher.transactionAt;
    people.set(voucher.personKey, row);
  }
  const rows = [...people.values()];
  return {
    rows,
    totals: {
      totalDeposited: rows.reduce((sum, row) => sum + row.depositedAmount, 0),
      totalExpense: rows.reduce((sum, row) => sum + row.expenseAmount, 0),
      netAmount: rows.reduce((sum, row) => sum + row.netAmount, 0),
      totalPeople: rows.length,
      depositVoucherCount: rows.reduce((sum, row) => sum + row.depositVoucherCount, 0),
      expenseVoucherCount: rows.reduce((sum, row) => sum + row.expenseVoucherCount, 0),
      internalTransferAmount: [...transfers.values()].reduce((sum, row) => sum + row.amount, 0),
      internalTransferCount: transfers.size
    }
  };
}

function normalizeFilters(query = {}, options = {}) {
  const today = dateUtil.todayVN();
  const fromDate = strictDateOnly(query.fromDate || query.dateFrom || today, 'Từ ngày');
  const toDate = strictDateOnly(query.toDate || query.dateTo || fromDate, 'Đến ngày');
  if (toDate < fromDate) {
    const error = new Error('Đến ngày phải lớn hơn hoặc bằng Từ ngày');
    error.status = 400;
    error.code = 'INVALID_DATE_RANGE';
    throw error;
  }
  if (dateOrdinal(toDate) - dateOrdinal(fromDate) > MAX_RANGE_DAYS) {
    const error = new Error(`Khoảng ngày không được vượt quá ${MAX_RANGE_DAYS} ngày`);
    error.status = 400;
    error.code = 'DATE_RANGE_TOO_LARGE';
    throw error;
  }

  const transactionType = lower(query.transactionType || 'all');
  if (!TRANSACTION_TYPES.has(transactionType)) {
    const error = new Error('Loại giao dịch không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_TRANSACTION_TYPE';
    throw error;
  }

  let personRole = text(query.personRole);
  if (personRole) {
    const mapped = ROLE_FILTERS.get(lower(personRole));
    if (!mapped) {
      const error = new Error('Vai trò không hợp lệ');
      error.status = 400;
      error.code = 'INVALID_PERSON_ROLE';
      throw error;
    }
    personRole = mapped;
  }

  const sortBy = text(query.sortBy || 'netAmount');
  if (!SORT_FIELDS.has(sortBy)) {
    const error = new Error('Trường sắp xếp không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_SORT_FIELD';
    throw error;
  }
  const sortOrder = lower(query.sortOrder || 'desc');
  if (!['asc', 'desc'].includes(sortOrder)) {
    const error = new Error('Chiều sắp xếp không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_SORT_ORDER';
    throw error;
  }

  const rawPage = query.page === undefined || query.page === '' ? 1 : Number(query.page);
  if (!Number.isInteger(rawPage) || rawPage < 1) {
    const error = new Error('page phải là số nguyên lớn hơn hoặc bằng 1');
    error.status = 400;
    error.code = 'INVALID_PAGE';
    throw error;
  }
  const rawLimit = query.limit === undefined || query.limit === '' ? 50 : Number(query.limit);
  if (!Number.isInteger(rawLimit)) {
    const error = new Error('limit phải là số nguyên');
    error.status = 400;
    error.code = 'INVALID_LIMIT';
    throw error;
  }
  const page = rawPage;
  const requestedLimit = rawLimit;
  if (requestedLimit < 1 || requestedLimit > (options.exportMode ? EXPORT_ROW_LIMIT : MAX_PAGE_LIMIT)) {
    const error = new Error(`limit phải từ 1 đến ${options.exportMode ? EXPORT_ROW_LIMIT : MAX_PAGE_LIMIT}`);
    error.status = 400;
    error.code = 'INVALID_LIMIT';
    throw error;
  }

  const fundCode = lower(query.fundCode || query.fundType || '');
  if (fundCode && !['cash', 'bank'].includes(fundCode) && !/^[a-z0-9_.:-]{1,40}$/i.test(fundCode)) {
    const error = new Error('Mã quỹ không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_FUND_CODE';
    throw error;
  }

  const personCode = text(query.personCode);
  const q = text(query.q || query.search || query.person);
  if (personCode.length > 80 || q.length > 120) {
    const error = new Error('Điều kiện tìm người quá dài');
    error.status = 400;
    error.code = 'INVALID_PERSON_FILTER';
    throw error;
  }

  return {
    fromDate,
    toDate,
    personCode,
    personRole,
    q,
    transactionType,
    fundCode,
    page,
    limit: requestedLimit,
    sortBy,
    sortOrder,
    tenantId: text(options.tenantId || query.tenantId),
    multiTenant: String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi'
  };
}

function mongoString(expression) {
  return {
    $trim: {
      input: {
        $convert: { input: expression, to: 'string', onError: '', onNull: '' }
      }
    }
  };
}

function mongoHasText(expression) {
  return { $gt: [{ $strLenCP: mongoString(expression) }, 0] };
}

function mongoFirstText(expressions = []) {
  return {
    $let: {
      vars: { candidates: expressions.map(mongoString) },
      in: {
        $ifNull: [
          {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$$candidates',
                  as: 'candidate',
                  cond: { $gt: [{ $strLenCP: '$$candidate' }, 0] }
                }
              },
              0
            ]
          },
          ''
        ]
      }
    }
  };
}

function lookupBySource(from, alias, sourceTypes = [], enforceTenant = false) {
  return {
    $lookup: {
      from,
      let: { sid: '$sourceId', scode: '$sourceCode', stype: '$_sourceTypeUpper', tenantId: '$tenantId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                sourceTypes.length ? { $in: ['$$stype', sourceTypes] } : { $literal: true },
                enforceTenant
                  ? { $and: [mongoHasText('$$tenantId'), { $eq: [mongoString('$tenantId'), mongoString('$$tenantId')] }] }
                  : { $literal: true },
                {
                  $or: [
                    { $and: [mongoHasText('$$sid'), { $eq: [mongoString('$id'), mongoString('$$sid')] }] },
                    { $and: [mongoHasText('$$scode'), { $eq: [mongoString('$code'), mongoString('$$scode')] }] }
                  ]
                }
              ]
            }
          }
        },
        { $limit: 1 }
      ],
      as: alias
    }
  };
}

function mongoRoleExpression(rawRoleExpression, fallbackRole = 'Khác') {
  const normalized = {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $toLower: mongoString(rawRoleExpression) },
          find: '_',
          replacement: ''
        }
      },
      find: '-',
      replacement: ''
    }
  };
  return {
    $switch: {
      branches: [
        { case: { $in: [normalized, ['sales', 'sale', 'nvbh', 'salesman', 'nhanvienbanhang']] }, then: 'NVBH' },
        { case: { $in: [normalized, ['delivery', 'shipper', 'nvgh', 'giaohang', 'nhanviengiaohang']] }, then: 'NVGH' },
        { case: { $in: [normalized, ['accountant', 'ketoan']] }, then: 'Kế toán' },
        { case: { $in: [normalized, ['cashier', 'thuquy']] }, then: 'Thủ quỹ' },
        { case: { $in: [normalized, ['supplier', 'nhacungcap']] }, then: 'Nhà cung cấp' },
        { case: { $in: [normalized, ['customer', 'khachhang']] }, then: 'Khách hàng' },
        { case: { $in: [normalized, ['internal', 'transfer', 'noibo']] }, then: 'Nội bộ' },
        { case: { $in: [normalized, ['unknown', 'unidentified', 'chuaxacdinh']] }, then: 'Chưa xác định' }
      ],
      default: fallbackRole
    }
  };
}

function mongoRoleKey(roleExpression) {
  return {
    $switch: {
      branches: [
        { case: { $eq: [roleExpression, 'NVBH'] }, then: 'SALES' },
        { case: { $eq: [roleExpression, 'NVGH'] }, then: 'DELIVERY' },
        { case: { $eq: [roleExpression, 'Kế toán'] }, then: 'ACCOUNTANT' },
        { case: { $eq: [roleExpression, 'Thủ quỹ'] }, then: 'CASHIER' },
        { case: { $eq: [roleExpression, 'Nhà cung cấp'] }, then: 'SUPPLIER' },
        { case: { $eq: [roleExpression, 'Khách hàng'] }, then: 'CUSTOMER' },
        { case: { $eq: [roleExpression, 'Nội bộ'] }, then: 'INTERNAL' },
        { case: { $eq: [roleExpression, 'Chưa xác định'] }, then: 'UNKNOWN' }
      ],
      default: 'OTHER'
    }
  };
}

function sourceIdentityExpression() {
  return mongoFirstText([
    '$reversalOf', '$originalSourceId', '$sourceId', '$sourceCode',
    '$referenceId', '$referenceCode', '$refId', '$refCode', '$id', '$code', '$idempotencyKey'
  ]);
}

function normalizedSignedAmountExpression() {
  const raw = { $ifNull: ['$amount', { $ifNull: ['$debit', '$credit'] }] };
  const asString = mongoString(raw);
  const stripped = {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $replaceAll: { input: asString, find: ' ', replacement: '' } },
          find: '.',
          replacement: ''
        }
      },
      find: ',',
      replacement: ''
    }
  };
  return {
    $round: [
      {
        $cond: [
          { $isNumber: raw },
          { $convert: { input: raw, to: 'double', onError: 0, onNull: 0 } },
          { $convert: { input: stripped, to: 'double', onError: 0, onNull: 0 } }
        ]
      },
      0
    ]
  };
}

function normalizedAmountExpression() {
  return { $abs: normalizedSignedAmountExpression() };
}

function effectiveDirectionExpression() {
  const sourceType = { $toUpper: mongoString('$sourceType') };
  const rawDirection = { $toLower: mongoString('$direction') };
  const rawNumber = normalizedSignedAmountExpression();
  const isReversal = {
    $or: [
      { $eq: ['$isReversal', true] },
      { $lt: [rawNumber, 0] },
      { $regexMatch: { input: sourceType, regex: 'REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN' } }
    ]
  };
  return {
    $cond: [
      isReversal,
      { $cond: [{ $eq: [rawDirection, 'out'] }, 'in', 'out'] },
      rawDirection
    ]
  };
}

function transactionClassExpression() {
  return {
    $switch: {
      branches: [
        { case: { $eq: ['$_sourceTypeUpper', 'FUND_TRANSFER'] }, then: 'TRANSFER' },
        { case: { $eq: ['$_effectiveDirection', 'in'] }, then: 'DEPOSIT' },
        { case: { $eq: ['$_effectiveDirection', 'out'] }, then: 'EXPENSE' }
      ],
      default: 'OTHER'
    }
  };
}

function buildIdentityStages() {
  const expenseReceiverCode = mongoFirstText(['$receiverCode', '$payeeCode', '$_expenseSource.receiverCode']);
  const expenseReceiverName = mongoFirstText(['$receiverName', '$payeeName', '$_expenseSource.receiverName']);
  const supplierCode = mongoFirstText(['$supplierCode', '$_supplierSource.supplierCode']);
  const supplierName = mongoFirstText(['$supplierName', '$_supplierSource.supplierName']);
  const collectorCode = mongoFirstText(['$collectorCode', '$_debtSource.collectorCode']);
  const collectorName = mongoFirstText(['$collectorName', '$_debtSource.collectorName']);
  const collectorType = mongoFirstText(['$collectorType', '$_debtSource.collectorType']);
  const customerCode = mongoFirstText(['$customerCode', '$_receiptSource.customerCode', '$_debtSource.customerCode']);
  const customerName = mongoFirstText(['$customerName', '$_receiptSource.customerName', '$_debtSource.customerName']);
  const genericCounterpartyCode = mongoFirstText(['$counterpartyCode', '$payerCode', '$depositorCode']);
  const genericCounterpartyName = mongoFirstText(['$counterpartyName', '$payerName', '$depositorName']);
  const genericCounterpartyRole = mongoFirstText(['$counterpartyRole', '$payerRole', '$depositorRole']);
  const staffCode = mongoFirstText(['$staffCode']);
  const staffName = mongoFirstText(['$staffName']);
  const deliveryCode = mongoFirstText(['$deliveryStaffCode']);
  const deliveryName = mongoFirstText(['$deliveryStaffName']);
  const salesCode = mongoFirstText(['$salesStaffCode']);
  const salesName = mongoFirstText(['$salesStaffName']);

  return [
    {
      $addFields: {
        _expenseSource: { $ifNull: [{ $arrayElemAt: ['$expenseSource', 0] }, {}] },
        _debtSource: { $ifNull: [{ $arrayElemAt: ['$debtSource', 0] }, {}] },
        _supplierSource: { $ifNull: [{ $arrayElemAt: ['$supplierSource', 0] }, {}] },
        _receiptSource: { $ifNull: [{ $arrayElemAt: ['$receiptSource', 0] }, {}] }
      }
    },
    {
      $addFields: {
        _expenseReceiverCode: expenseReceiverCode,
        _expenseReceiverName: expenseReceiverName,
        _expenseReceiverRole: mongoFirstText(['$receiverRole', '$_expenseSource.receiverRole']),
        _supplierCode: supplierCode,
        _supplierName: supplierName,
        _collectorCode: collectorCode,
        _collectorName: collectorName,
        _collectorType: collectorType,
        _customerCode: customerCode,
        _customerName: customerName,
        _genericCounterpartyCode: genericCounterpartyCode,
        _genericCounterpartyName: genericCounterpartyName,
        _genericCounterpartyRole: genericCounterpartyRole,
        _staffCode: staffCode,
        _staffName: staffName,
        _deliveryCode: deliveryCode,
        _deliveryName: deliveryName,
        _salesCode: salesCode,
        _salesName: salesName
      }
    },
    {
      $addFields: {
        _identityKind: {
          $switch: {
            branches: [
              { case: { $eq: ['$_transactionClass', 'TRANSFER'] }, then: 'internal' },
              {
                case: {
                  $and: [
                    { $or: [{ $eq: ['$_sourceTypeUpper', 'EXPENSE_VOUCHER'] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                    { $or: [mongoHasText('$_expenseReceiverCode'), mongoHasText('$_expenseReceiverName')] }
                  ]
                },
                then: 'receiver'
              },
              {
                case: {
                  $and: [
                    { $or: [{ $in: ['$_sourceTypeUpper', ['SUPPLIERPAYMENT', 'SUPPLIER_PAYMENT']] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                    { $or: [mongoHasText('$_supplierCode'), mongoHasText('$_supplierName')] }
                  ]
                },
                then: 'supplier'
              },
              {
                case: {
                  $and: [
                    { $in: ['$_sourceTypeUpper', ['DELIVERY_CASH_SUBMISSION', 'DELIVERY_SHORTAGE_REPAYMENT']] },
                    { $or: [mongoHasText('$_deliveryCode'), mongoHasText('$_deliveryName')] }
                  ]
                },
                then: 'delivery'
              },
              { case: { $or: [mongoHasText('$_collectorCode'), mongoHasText('$_collectorName')] }, then: 'collector' },
              { case: { $or: [mongoHasText('$_genericCounterpartyCode'), mongoHasText('$_genericCounterpartyName')] }, then: 'counterparty' },
              {
                case: {
                  $and: [
                    { $in: ['$_sourceTypeUpper', ['AR_RECEIPT', 'RECEIPT']] },
                    { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }
                  ]
                },
                then: 'customer'
              },
              { case: { $or: [mongoHasText('$_salesCode'), mongoHasText('$_salesName')] }, then: 'sales' },
              {
                case: {
                  $and: [
                    { $or: [{ $eq: ['$_sourceTypeUpper', 'EXPENSE_VOUCHER'] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                    { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }
                  ]
                },
                then: 'customer'
              },
              { case: { $or: [mongoHasText('$_staffCode'), mongoHasText('$_staffName')] }, then: 'staff' },
              { case: { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }, then: 'customer' }
            ],
            default: 'unknown'
          }
        }
      }
    },
    {
      $addFields: {
        personCode: {
          $switch: {
            branches: [
              { case: { $eq: ['$_identityKind', 'receiver'] }, then: '$_expenseReceiverCode' },
              { case: { $eq: ['$_identityKind', 'supplier'] }, then: '$_supplierCode' },
              { case: { $eq: ['$_identityKind', 'delivery'] }, then: '$_deliveryCode' },
              { case: { $eq: ['$_identityKind', 'collector'] }, then: '$_collectorCode' },
              { case: { $eq: ['$_identityKind', 'counterparty'] }, then: '$_genericCounterpartyCode' },
              { case: { $eq: ['$_identityKind', 'sales'] }, then: '$_salesCode' },
              { case: { $eq: ['$_identityKind', 'staff'] }, then: '$_staffCode' },
              { case: { $eq: ['$_identityKind', 'customer'] }, then: '$_customerCode' }
            ],
            default: ''
          }
        },
        personName: {
          $switch: {
            branches: [
              { case: { $eq: ['$_identityKind', 'internal'] }, then: 'Chuyển quỹ nội bộ' },
              { case: { $eq: ['$_identityKind', 'receiver'] }, then: mongoFirstText(['$_expenseReceiverName', '$_expenseReceiverCode']) },
              { case: { $eq: ['$_identityKind', 'supplier'] }, then: mongoFirstText(['$_supplierName', '$_supplierCode']) },
              { case: { $eq: ['$_identityKind', 'delivery'] }, then: mongoFirstText(['$_deliveryName', '$_deliveryCode']) },
              { case: { $eq: ['$_identityKind', 'collector'] }, then: mongoFirstText(['$_collectorName', '$_collectorCode']) },
              { case: { $eq: ['$_identityKind', 'counterparty'] }, then: mongoFirstText(['$_genericCounterpartyName', '$_genericCounterpartyCode']) },
              { case: { $eq: ['$_identityKind', 'sales'] }, then: mongoFirstText(['$_salesName', '$_salesCode']) },
              { case: { $eq: ['$_identityKind', 'staff'] }, then: mongoFirstText(['$_staffName', '$_staffCode']) },
              { case: { $eq: ['$_identityKind', 'customer'] }, then: mongoFirstText(['$_customerName', '$_customerCode']) }
            ],
            default: 'Chưa xác định'
          }
        },
        personRole: {
          $switch: {
            branches: [
              { case: { $eq: ['$_identityKind', 'internal'] }, then: 'Nội bộ' },
              { case: { $eq: ['$_identityKind', 'receiver'] }, then: mongoRoleExpression('$_expenseReceiverRole', 'Khác') },
              { case: { $eq: ['$_identityKind', 'supplier'] }, then: 'Nhà cung cấp' },
              { case: { $eq: ['$_identityKind', 'delivery'] }, then: 'NVGH' },
              { case: { $eq: ['$_identityKind', 'collector'] }, then: mongoRoleExpression('$_collectorType', 'Khác') },
              { case: { $eq: ['$_identityKind', 'counterparty'] }, then: mongoRoleExpression('$_genericCounterpartyRole', 'Khác') },
              { case: { $eq: ['$_identityKind', 'sales'] }, then: 'NVBH' },
              { case: { $eq: ['$_identityKind', 'staff'] }, then: mongoRoleExpression('$staffRole', 'Khác') },
              { case: { $eq: ['$_identityKind', 'customer'] }, then: 'Khách hàng' }
            ],
            default: 'Chưa xác định'
          }
        },
        sourceField: {
          $switch: {
            branches: [
              { case: { $eq: ['$_identityKind', 'internal'] }, then: 'sourceType:FUND_TRANSFER' },
              { case: { $eq: ['$_identityKind', 'receiver'] }, then: 'receiver*' },
              { case: { $eq: ['$_identityKind', 'supplier'] }, then: 'supplier*' },
              { case: { $eq: ['$_identityKind', 'delivery'] }, then: 'deliveryStaff*' },
              { case: { $eq: ['$_identityKind', 'collector'] }, then: 'collector*' },
              { case: { $eq: ['$_identityKind', 'counterparty'] }, then: 'counterparty/payer/depositor' },
              { case: { $eq: ['$_identityKind', 'sales'] }, then: 'salesStaff*' },
              { case: { $eq: ['$_identityKind', 'staff'] }, then: 'staff*' },
              { case: { $eq: ['$_identityKind', 'customer'] }, then: 'customer*' }
            ],
            default: 'unresolved'
          }
        }
      }
    },
    {
      $addFields: {
        _personRoleKey: mongoRoleKey('$personRole'),
        personKey: {
          $cond: [
            { $eq: ['$_identityKind', 'internal'] },
            'INTERNAL:TRANSFER',
            {
              $cond: [
                mongoHasText('$personCode'),
                { $concat: [mongoRoleKey('$personRole'), ':CODE:', { $toUpper: mongoString('$personCode') }] },
                {
                  $cond: [
                    { $and: [mongoHasText('$personName'), { $ne: ['$personName', 'Chưa xác định'] }] },
                    { $concat: [mongoRoleKey('$personRole'), ':NAME:', { $toLower: mongoString('$personName') }] },
                    'UNKNOWN:UNIDENTIFIED'
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  ];
}

function buildEarlyMatch(filters) {
  const { start, end } = vietnamUtcRange(filters.fromDate, filters.toDate);
  const match = {
    $and: [
      {
        $or: [
          { status: { $exists: false } },
          { status: null },
          { status: { $in: [...ACTIVE_LEDGER_STATUSES, 'reversed'] } }
        ]
      },
      { isDeleted: { $ne: true } },
      { deletedAt: { $in: [null, ''] } },
      {
        $or: [
          { date: { $gte: filters.fromDate, $lte: filters.toDate } },
          {
            $and: [
              { $or: [{ date: { $exists: false } }, { date: '' }, { date: null }] },
              { createdAt: { $gte: start.toISOString(), $lt: end.toISOString() } }
            ]
          }
        ]
      }
    ]
  };
  if (filters.multiTenant && filters.tenantId) match.$and.push({ tenantId: filters.tenantId });
  if (filters.fundCode === 'cash' || filters.fundCode === 'bank') match.$and.push({ fundType: filters.fundCode });
  else if (filters.fundCode) match.$and.push({ account: upper(filters.fundCode) });
  return match;
}

function buildNormalizedVoucherPipeline(filters, options = {}) {
  const pipeline = [
    { $match: buildEarlyMatch(filters) },
    {
      $addFields: {
        _sourceTypeUpper: { $toUpper: mongoFirstText(['$sourceType', '$refType', '$referenceType', 'UNKNOWN']) },
        _normalizedAmount: normalizedAmountExpression(),
        _effectiveDirection: effectiveDirectionExpression(),
        _sourceIdentity: sourceIdentityExpression(),
        _statusLower: { $toLower: mongoString('$status') },
        _isReversal: {
          $or: [
            { $eq: ['$isReversal', true] },
            { $lt: [normalizedSignedAmountExpression(), 0] },
            { $regexMatch: { input: { $toUpper: mongoFirstText(['$sourceType', '$refType', '$referenceType']) }, regex: 'REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN' } }
          ]
        },
        _effectiveDate: {
          $cond: [
            { $regexMatch: { input: mongoString('$date'), regex: /^\d{4}-\d{2}-\d{2}$/ } },
            mongoString('$date'),
            {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $convert: { input: '$createdAt', to: 'date', onError: new Date(`${filters.fromDate}T00:00:00+07:00`), onNull: new Date(`${filters.fromDate}T00:00:00+07:00`) } },
                timezone: dateUtil.VIETNAM_TIME_ZONE
              }
            }
          ]
        }
      }
    },
    {
      $match: {
        $expr: {
          $or: [
            { $ne: ['$_statusLower', 'reversed'] },
            { $eq: ['$_isReversal', true] }
          ]
        }
      }
    },
    { $addFields: { _transactionClass: transactionClassExpression() } },
    { $match: { _normalizedAmount: { $gt: 0 }, _transactionClass: { $ne: 'OTHER' } } },
    lookupBySource(ExpenseVoucher.collection.name, 'expenseSource', ['EXPENSE_VOUCHER'], filters.multiTenant),
    lookupBySource(DebtCollection.collection.name, 'debtSource', ['DEBTCOLLECTION', 'DEBT_COLLECTION'], filters.multiTenant),
    lookupBySource(SupplierPayment.collection.name, 'supplierSource', ['SUPPLIERPAYMENT', 'SUPPLIER_PAYMENT'], filters.multiTenant),
    lookupBySource(Receipt.collection.name, 'receiptSource', ['AR_RECEIPT', 'RECEIPT'], filters.multiTenant),
    ...buildIdentityStages()
  ];

  const identityMatch = {};
  if (filters.personCode) identityMatch.$expr = { $eq: [{ $toUpper: mongoString('$personCode') }, upper(filters.personCode)] };
  if (filters.personRole) identityMatch.personRole = filters.personRole;
  if (filters.q) {
    const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    identityMatch.$or = [
      { personCode: { $regex: escaped, $options: 'i' } },
      { personName: { $regex: escaped, $options: 'i' } }
    ];
  }
  if (Object.keys(identityMatch).length) pipeline.push({ $match: identityMatch });

  pipeline.push(
    {
      $addFields: {
        _ledgerDedupeKey: {
          $cond: [
            mongoHasText('$idempotencyKey'),
            { $concat: ['IDEMP:', mongoString('$idempotencyKey')] },
            {
              $concat: [
                'LEGACY:', '$_sourceTypeUpper', ':', mongoString('$_sourceIdentity'), ':',
                mongoString('$fundType'), ':', mongoString('$_effectiveDirection'), ':', mongoString('$account'), ':',
                { $toString: '$_normalizedAmount' }
              ]
            }
          ]
        },
        _voucherKey: { $concat: ['$_sourceTypeUpper', ':', mongoString('$_sourceIdentity')] },
        _signedAmount: {
          $switch: {
            branches: [
              { case: { $eq: ['$_transactionClass', 'DEPOSIT'] }, then: '$_normalizedAmount' },
              { case: { $eq: ['$_transactionClass', 'EXPENSE'] }, then: { $multiply: ['$_normalizedAmount', -1] } }
            ],
            default: 0
          }
        },
        _transactionAt: mongoFirstText(['$createdAt', { $concat: ['$_effectiveDate', 'T00:00:00+07:00'] }]),
        _voucherCode: mongoFirstText(['$sourceCode', '$referenceCode', '$refCode', '$code'])
      }
    },
    {
      $group: {
        _id: '$_ledgerDedupeKey',
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        sourceField: { $first: '$sourceField' },
        voucherKey: { $first: '$_voucherKey' },
        transactionClass: { $first: '$_transactionClass' },
        signedAmount: { $first: '$_signedAmount' },
        normalizedAmount: { $first: '$_normalizedAmount' },
        transactionAt: { $max: '$_transactionAt' },
        transactionDate: { $max: '$_effectiveDate' },
        voucherCode: { $first: '$_voucherCode' },
        sourceType: { $first: '$_sourceTypeUpper' },
        fundType: { $first: '$fundType' },
        account: { $first: '$account' },
        note: { $first: '$note' },
        createdBy: { $first: '$createdBy' },
        status: { $first: '$status' }
      }
    },
    {
      $group: {
        _id: { personKey: '$personKey', voucherKey: '$voucherKey' },
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        sourceField: { $first: '$sourceField' },
        voucherKey: { $first: '$voucherKey' },
        sourceType: { $first: '$sourceType' },
        voucherCode: { $first: '$voucherCode' },
        signedAmount: { $sum: '$signedAmount' },
        transferAmount: { $max: { $cond: [{ $eq: ['$transactionClass', 'TRANSFER'] }, '$normalizedAmount', 0] } },
        hasTransfer: { $max: { $cond: [{ $eq: ['$transactionClass', 'TRANSFER'] }, 1, 0] } },
        transactionAt: { $max: '$transactionAt' },
        transactionDate: { $max: '$transactionDate' },
        fundTypes: { $addToSet: '$fundType' },
        accounts: { $addToSet: '$account' },
        notes: { $addToSet: '$note' },
        creators: { $addToSet: '$createdBy' },
        statuses: { $addToSet: '$status' },
        underlyingLedgerCount: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        personKey: 1,
        personCode: 1,
        personName: 1,
        personRole: 1,
        sourceField: 1,
        voucherKey: 1,
        sourceType: 1,
        voucherCode: 1,
        transactionAt: 1,
        transactionDate: 1,
        fundTypes: 1,
        accounts: 1,
        notes: 1,
        creators: 1,
        statuses: 1,
        underlyingLedgerCount: 1,
        transactionClass: { $cond: [{ $eq: ['$hasTransfer', 1] }, 'TRANSFER', { $cond: [{ $gt: ['$signedAmount', 0] }, 'DEPOSIT', 'EXPENSE'] }] },
        depositedAmount: { $cond: [{ $and: [{ $eq: ['$hasTransfer', 0] }, { $gt: ['$signedAmount', 0] }] }, '$signedAmount', 0] },
        expenseAmount: { $cond: [{ $and: [{ $eq: ['$hasTransfer', 0] }, { $lt: ['$signedAmount', 0] }] }, { $abs: '$signedAmount' }, 0] },
        netAmount: { $cond: [{ $eq: ['$hasTransfer', 1] }, 0, '$signedAmount'] },
        internalTransferAmount: { $cond: [{ $eq: ['$hasTransfer', 1] }, '$transferAmount', 0] }
      }
    },
    { $match: { $or: [{ transactionClass: 'TRANSFER' }, { netAmount: { $ne: 0 } }] } }
  );

  if (filters.transactionType !== 'all') {
    const map = { deposit: 'DEPOSIT', expense: 'EXPENSE', transfer: 'TRANSFER' };
    pipeline.push({ $match: { transactionClass: map[filters.transactionType] } });
  }
  if (options.personKey) pipeline.push({ $match: { personKey: text(options.personKey) } });
  return pipeline;
}

function personGroupStages(filters) {
  const match = filters.transactionType === 'transfer'
    ? { transactionClass: 'TRANSFER' }
    : { transactionClass: { $ne: 'TRANSFER' } };
  return [
    { $match: match },
    {
      $group: {
        _id: '$personKey',
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        depositedAmount: { $sum: '$depositedAmount' },
        depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
        expenseAmount: { $sum: '$expenseAmount' },
        expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } },
        internalTransferAmount: { $sum: '$internalTransferAmount' },
        internalTransferCount: { $sum: { $cond: [{ $gt: ['$internalTransferAmount', 0] }, 1, 0] } },
        lastTransactionAt: { $max: '$transactionAt' }
      }
    },
    {
      $project: {
        _id: 0,
        personKey: 1,
        personCode: 1,
        personName: 1,
        personRole: 1,
        depositedAmount: 1,
        depositVoucherCount: 1,
        expenseAmount: 1,
        expenseVoucherCount: 1,
        internalTransferAmount: 1,
        internalTransferCount: 1,
        netAmount: { $subtract: ['$depositedAmount', '$expenseAmount'] },
        lastTransactionAt: 1
      }
    }
  ];
}

function summarySort(filters) {
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  return { [filters.sortBy]: direction, personName: 1, personCode: 1 };
}

async function getFundSummary(query = {}, context = {}) {
  const filters = normalizeFilters(query, context);
  const skip = (filters.page - 1) * filters.limit;
  const base = buildNormalizedVoucherPipeline(filters);
  const groupStages = personGroupStages(filters);
  const result = await fundLedgerRepository.aggregate([
    ...base,
    {
      $facet: {
        rows: [...groupStages, { $sort: summarySort(filters) }, { $skip: skip }, { $limit: filters.limit }],
        peopleCount: [...groupStages, { $count: 'totalRows' }],
        totals: [
          { $match: { transactionClass: { $ne: 'TRANSFER' } } },
          {
            $group: {
              _id: null,
              totalDeposited: { $sum: '$depositedAmount' },
              totalExpense: { $sum: '$expenseAmount' },
              depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
              expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } }
            }
          }
        ],
        transfers: [
          { $match: { transactionClass: 'TRANSFER' } },
          { $group: { _id: null, internalTransferAmount: { $sum: '$internalTransferAmount' }, internalTransferCount: { $sum: 1 } } }
        ]
      }
    }
  ]);

  const facet = result[0] || {};
  const totalRows = Number(facet.peopleCount?.[0]?.totalRows || 0);
  const totalsRow = facet.totals?.[0] || {};
  const transferRow = facet.transfers?.[0] || {};
  const totalDeposited = Number(totalsRow.totalDeposited || 0);
  const totalExpense = Number(totalsRow.totalExpense || 0);
  const rows = (facet.rows || []).map((row) => ({
    ...row,
    depositedAmount: Number(row.depositedAmount || 0),
    depositVoucherCount: Number(row.depositVoucherCount || 0),
    expenseAmount: Number(row.expenseAmount || 0),
    expenseVoucherCount: Number(row.expenseVoucherCount || 0),
    internalTransferAmount: Number(row.internalTransferAmount || 0),
    internalTransferCount: Number(row.internalTransferCount || 0),
    netAmount: Number(row.netAmount || 0)
  }));

  return {
    success: true,
    filters: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      personCode: filters.personCode,
      personRole: filters.personRole,
      q: filters.q,
      transactionType: filters.transactionType,
      fundCode: filters.fundCode,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    },
    totals: {
      totalDeposited,
      totalExpense,
      netAmount: totalDeposited - totalExpense,
      totalPeople: filters.transactionType === 'transfer' ? 0 : totalRows,
      depositVoucherCount: Number(totalsRow.depositVoucherCount || 0),
      expenseVoucherCount: Number(totalsRow.expenseVoucherCount || 0),
      internalTransferAmount: Number(transferRow.internalTransferAmount || 0),
      internalTransferCount: Number(transferRow.internalTransferCount || 0)
    },
    rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalRows,
      totalPages: Math.ceil(totalRows / filters.limit)
    }
  };
}

async function getFundSummaryTransactions(personKey, query = {}, context = {}) {
  const filters = normalizeFilters(query, context);
  const key = text(personKey);
  if (!key || key.length > 250 || /[\0\r\n]/.test(key)) {
    const error = new Error('personKey không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_PERSON_KEY';
    throw error;
  }
  const skip = (filters.page - 1) * filters.limit;
  const result = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters, { personKey: key }),
    {
      $facet: {
        rows: [
          { $sort: { transactionAt: -1, voucherCode: -1 } },
          { $skip: skip },
          { $limit: filters.limit }
        ],
        count: [{ $count: 'totalRows' }],
        totals: [{
          $group: {
            _id: null,
            depositedAmount: { $sum: '$depositedAmount' },
            expenseAmount: { $sum: '$expenseAmount' },
            internalTransferAmount: { $sum: '$internalTransferAmount' },
            depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
            expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } }
          }
        }]
      }
    }
  ]);
  const facet = result[0] || {};
  const totalRows = Number(facet.count?.[0]?.totalRows || 0);
  const totals = facet.totals?.[0] || {};
  return {
    success: true,
    personKey: key,
    filters: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      personCode: filters.personCode,
      personRole: filters.personRole,
      q: filters.q,
      transactionType: filters.transactionType,
      fundCode: filters.fundCode,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    },
    totals: {
      depositedAmount: Number(totals.depositedAmount || 0),
      expenseAmount: Number(totals.expenseAmount || 0),
      netAmount: Number(totals.depositedAmount || 0) - Number(totals.expenseAmount || 0),
      internalTransferAmount: Number(totals.internalTransferAmount || 0),
      depositVoucherCount: Number(totals.depositVoucherCount || 0),
      expenseVoucherCount: Number(totals.expenseVoucherCount || 0)
    },
    transactions: facet.rows || [],
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalRows,
      totalPages: Math.ceil(totalRows / filters.limit)
    }
  };
}

function formatDateVN(value) {
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return text(value);
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function transactionTypeLabel(value) {
  return value === 'DEPOSIT' ? 'Nộp tiền' : value === 'EXPENSE' ? 'Chi tiền' : value === 'TRANSFER' ? 'Chuyển quỹ nội bộ' : 'Khác';
}

function fundLabel(fundTypes = [], accounts = []) {
  const funds = (Array.isArray(fundTypes) ? fundTypes : []).map((item) => item === 'bank' ? 'Ngân hàng' : 'Tiền mặt');
  const accountList = (Array.isArray(accounts) ? accounts : []).filter(Boolean);
  return [...new Set([...funds, ...accountList])].join(' / ');
}

async function exportFundSummary(query = {}, context = {}) {
  const filters = normalizeFilters({ ...query, page: 1, limit: EXPORT_ROW_LIMIT }, { ...context, exportMode: true });
  const summaryRows = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters),
    ...personGroupStages(filters),
    { $sort: summarySort(filters) },
    { $limit: EXPORT_ROW_LIMIT }
  ]);
  const detailRows = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters),
    { $sort: { transactionAt: -1, voucherCode: -1 } },
    { $limit: EXPORT_ROW_LIMIT }
  ]);

  const totalDeposited = summaryRows.reduce((sum, row) => sum + Number(row.depositedAmount || 0), 0);
  const totalExpense = summaryRows.reduce((sum, row) => sum + Number(row.expenseAmount || 0), 0);
  const totalDepositCount = summaryRows.reduce((sum, row) => sum + Number(row.depositVoucherCount || 0), 0);
  const totalExpenseCount = summaryRows.reduce((sum, row) => sum + Number(row.expenseVoucherCount || 0), 0);

  const workbook = createWorkbook();
  appendAoaSheet(workbook, 'Tong_hop', [
    ['STT', 'Mã người', 'Tên người', 'Vai trò', 'Tổng tiền đã nộp', 'Số phiếu nộp', 'Tổng tiền đã nhận', 'Số phiếu chi', 'Chênh lệch', 'Chuyển quỹ nội bộ'],
    ...summaryRows.map((row, index) => [
      index + 1,
      text(row.personCode),
      text(row.personName),
      text(row.personRole),
      Number(row.depositedAmount || 0),
      Number(row.depositVoucherCount || 0),
      Number(row.expenseAmount || 0),
      Number(row.expenseVoucherCount || 0),
      Number(row.netAmount || 0),
      Number(row.internalTransferAmount || 0)
    ]),
    ['TỔNG CỘNG', '', '', '', totalDeposited, totalDepositCount, totalExpense, totalExpenseCount, totalDeposited - totalExpense, summaryRows.reduce((sum, row) => sum + Number(row.internalTransferAmount || 0), 0)]
  ], { widths: [8, 18, 32, 18, 20, 14, 20, 14, 20, 22], autoFilter: true });

  appendAoaSheet(workbook, 'Chi_tiet', [
    ['STT', 'Ngày giờ', 'Mã chứng từ', 'Loại giao dịch', 'Mã người', 'Tên người', 'Vai trò', 'Quỹ', 'Nội dung', 'Số tiền nộp', 'Số tiền chi', 'Chuyển quỹ nội bộ', 'Người tạo', 'Trạng thái'],
    ...detailRows.map((row, index) => [
      index + 1,
      formatDateVN(row.transactionAt || row.transactionDate),
      text(row.voucherCode),
      transactionTypeLabel(row.transactionClass),
      text(row.personCode),
      text(row.personName),
      text(row.personRole),
      fundLabel(row.fundTypes, row.accounts),
      (row.notes || []).filter(Boolean).join(' | '),
      Number(row.depositedAmount || 0),
      Number(row.expenseAmount || 0),
      Number(row.internalTransferAmount || 0),
      (row.creators || []).filter(Boolean).join(' | '),
      (row.statuses || []).filter(Boolean).join(' | ')
    ]),
    [
      'TỔNG CỘNG', '', '', '', '', '', '', '', '',
      detailRows.reduce((sum, row) => sum + Number(row.depositedAmount || 0), 0),
      detailRows.reduce((sum, row) => sum + Number(row.expenseAmount || 0), 0),
      detailRows.reduce((sum, row) => sum + Number(row.internalTransferAmount || 0), 0),
      '', ''
    ]
  ], { widths: [8, 20, 22, 22, 18, 32, 18, 22, 46, 18, 18, 22, 22, 18], autoFilter: true });

  const from = filters.fromDate.split('-').reverse().join('-');
  const to = filters.toDate.split('-').reverse().join('-');
  return {
    buffer: writeWorkbook(workbook),
    fileName: `So_quy_tong_hop_${from}_den_${to}.xlsx`,
    rowCount: detailRows.length,
    summaryRowCount: summaryRows.length
  };
}

module.exports = {
  getFundSummary,
  getFundSummaryTransactions,
  exportFundSummary,
  resolveFundCounterparty,
  classifyTransaction,
  normalizeLedgerForSummary,
  summarizeNormalizedTransactions,
  normalizeFilters,
  buildNormalizedVoucherPipeline,
  personKeyOf,
  normalizeRole,
  constants: {
    MAX_RANGE_DAYS,
    MAX_PAGE_LIMIT,
    EXPORT_ROW_LIMIT,
    BLOCKED_LEDGER_STATUSES
  }
};
