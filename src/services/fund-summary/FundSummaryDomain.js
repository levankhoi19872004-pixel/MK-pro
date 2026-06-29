'use strict';

const ACTIVE_LEDGER_STATUSES = ['', 'posted', 'confirmed', 'accounting_confirmed', 'matched'];
const BLOCKED_LEDGER_STATUSES = ['draft', 'pending', 'submitted', 'cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed', 'reversed', 'superseded'];

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

function selectCounterparty(candidates = []) {
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
}

function expenseCounterpartyCandidates(entry, sources) {
  const { expenseSource, supplierSource, receiptSource } = sources;
  return [
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
  ];
}

function depositCounterpartyCandidates(entry, sourceType, sources) {
  const { debtSource, receiptSource } = sources;
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
  return [
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
  ];
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
  const sources = {
    expenseSource: entry.expenseSource || entry.expenseVoucher || {},
    debtSource: entry.debtSource || entry.debtCollection || {},
    supplierSource: entry.supplierSource || entry.supplierPayment || {},
    receiptSource: entry.receiptSource || entry.receipt || {}
  };

  if (transactionClass === 'TRANSFER' || sourceType === 'FUND_TRANSFER') {
    return {
      personCode: '',
      personName: 'Chuyển quỹ nội bộ',
      personRole: 'Nội bộ',
      sourceField: 'sourceType:FUND_TRANSFER',
      personKey: 'INTERNAL:TRANSFER'
    };
  }
  if (identityClass === 'EXPENSE') {
    return selectCounterparty(expenseCounterpartyCandidates(entry, sources));
  }
  if (['DELIVERY_CASH_SUBMISSION', 'DELIVERY_SHORTAGE_REPAYMENT'].includes(sourceType)) {
    return selectCounterparty([{
      code: entry.deliveryStaffCode,
      name: entry.deliveryStaffName,
      role: 'delivery',
      fallbackRole: 'NVGH',
      sourceField: 'fundLedger.deliveryStaff*'
    }]);
  }
  return selectCounterparty(depositCounterpartyCandidates(entry, sourceType, sources));
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
  if (status && !ACTIVE_LEDGER_STATUSES.includes(status)) return null;
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

module.exports = {
  text,
  upper,
  lower,
  safeMoney,
  normalizeRole,
  roleKey,
  personKeyOf,
  resolveFundCounterparty,
  classifyTransaction,
  normalizeLedgerForSummary,
  summarizeNormalizedTransactions,
  constants: {
    ACTIVE_LEDGER_STATUSES,
    BLOCKED_LEDGER_STATUSES
  }
};
