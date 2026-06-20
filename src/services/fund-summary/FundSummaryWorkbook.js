'use strict';

const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../../utils/excelWriter.util');
const { text } = require('./FundSummaryDomain');

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


function buildFundSummaryWorkbook(summaryRows, detailRows, filters) {
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
  buildFundSummaryWorkbook,
  formatDateVN,
  transactionTypeLabel,
  fundLabel
};
