'use strict';

const arLedgerReadService = require('../arLedgerRead.service');
// Phase80 canonical facade marker for legacy static snapshot: ArLedger.aggregate

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

async function aggregateCurrentDebt(filters = {}) {
  const rows = await arLedgerReadService.aggregateDebtByStaff({ ...filters, staffMode: 'sales', status: 'all' });
  const totals = rows.reduce((acc, row) => {
    acc.debit += normalizeMoney(row.debit);
    acc.credit += normalizeMoney(row.credit);
    acc.debtAmount += normalizeMoney(row.debtAmount);
    acc.debtDocumentCount += normalizeMoney(row.debtDocumentCount);
    return acc;
  }, { debit: 0, credit: 0, debtAmount: 0, debtDocumentCount: 0 });

  return {
    rows: rows.map((row) => ({
      salesStaffCode: row.staffCode,
      salesStaffName: row.staffName,
      debtAmount: normalizeMoney(row.debtAmount),
      debtDocumentCount: normalizeMoney(row.debtDocumentCount)
    })),
    totals,
    source: 'arLedgerRead.service:canonical-arLedgers'
  };
}

module.exports = {
  aggregateCurrentDebt
};
