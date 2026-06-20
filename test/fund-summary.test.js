'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const service = require('../src/services/fundSummary.service');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');
const fundController = require('../src/controllers/fundController');
const { requireRole } = require('../src/middlewares/auth.middleware');

function ledger(overrides = {}) {
  return {
    id: overrides.id || `FL-${Math.random()}`,
    idempotencyKey: overrides.idempotencyKey || `IDEMP-${Math.random()}`,
    date: '2026-06-20',
    createdAt: '2026-06-20T08:00:00+07:00',
    amount: 100,
    direction: 'in',
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    sourceId: 'SRC-1',
    sourceCode: 'PT-1',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Nguyễn Văn A',
    status: 'posted',
    ...overrides
  };
}

function summarize(entries) {
  return service.summarizeNormalizedTransactions(entries.map(service.normalizeLedgerForSummary));
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    send(body) { this.body = body; return this; }
  };
}

test('1. một người nộp nhiều phiếu trong cùng ngày được cộng tiền và đếm đúng số phiếu', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'D1', sourceId: 'S1', amount: 100 }),
    ledger({ idempotencyKey: 'D2', sourceId: 'S2', amount: 250 })
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].depositedAmount, 350);
  assert.equal(result.rows[0].depositVoucherCount, 2);
});

test('2. một người nhận nhiều phiếu chi được cộng tiền và đếm đúng số phiếu', () => {
  const base = { direction: 'out', sourceType: 'EXPENSE_VOUCHER', receiverCode: 'KT01', receiverName: 'Trần B', receiverRole: 'accountant', deliveryStaffCode: '', deliveryStaffName: '' };
  const result = summarize([
    ledger({ ...base, idempotencyKey: 'E1', sourceId: 'PC1', amount: 90 }),
    ledger({ ...base, idempotencyKey: 'E2', sourceId: 'PC2', amount: 110 })
  ]);
  assert.equal(result.rows[0].expenseAmount, 200);
  assert.equal(result.rows[0].expenseVoucherCount, 2);
});

test('3. một người vừa nộp vừa nhận có chênh lệch thuần chính xác', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'M1', sourceId: 'IN1', amount: 500 }),
    ledger({ idempotencyKey: 'M2', sourceId: 'OUT1', direction: 'out', sourceType: 'EXPENSE_VOUCHER', amount: 120, receiverCode: 'GH01', receiverName: 'Nguyễn Văn A', receiverRole: 'delivery' })
  ]);
  assert.equal(result.rows[0].depositedAmount, 500);
  assert.equal(result.rows[0].expenseAmount, 120);
  assert.equal(result.rows[0].netAmount, 380);
});

test('4. hai người trùng tên nhưng khác mã không bị gộp', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'N1', sourceId: 'S1', deliveryStaffCode: 'GH01', deliveryStaffName: 'Trùng Tên' }),
    ledger({ idempotencyKey: 'N2', sourceId: 'S2', deliveryStaffCode: 'GH02', deliveryStaffName: 'Trùng Tên' })
  ]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.personCode).sort(), ['GH01', 'GH02']);
});

test('5. dữ liệu cũ không có mã dùng vai trò + tên làm khóa fallback', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'L1', sourceId: 'S1', deliveryStaffCode: '', deliveryStaffName: 'Nhân viên cũ' }),
    ledger({ idempotencyKey: 'L2', sourceId: 'S2', deliveryStaffCode: '', deliveryStaffName: 'Nhân viên cũ' })
  ]);
  assert.equal(result.rows.length, 1);
  assert.match(result.rows[0].personKey, /^DELIVERY:NAME:/);
  assert.equal(result.rows[0].depositVoucherCount, 2);
});

test('6. giao dịch không xác định người được đưa vào nhóm Chưa xác định', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'U1', sourceId: 'UNKNOWN1', sourceType: 'MANUAL_FUND', deliveryStaffCode: '', deliveryStaffName: '', staffCode: '', staffName: '', customerCode: '', customerName: '' })
  ]);
  assert.equal(result.rows[0].personName, 'Chưa xác định');
  assert.equal(result.rows[0].personKey, 'UNKNOWN:UNIDENTIFIED');
});

test('7. chứng từ đã hủy/nháp/deleted không được tính', () => {
  const entries = [
    ledger({ idempotencyKey: 'OK', sourceId: 'OK', status: 'posted' }),
    ledger({ idempotencyKey: 'C1', sourceId: 'C1', status: 'cancelled' }),
    ledger({ idempotencyKey: 'DRAFT', sourceId: 'DRAFT', status: 'draft' }),
    ledger({ idempotencyKey: 'DEL', sourceId: 'DEL', isDeleted: true })
  ];
  const result = summarize(entries);
  assert.equal(result.totals.totalDeposited, 100);
  assert.equal(result.totals.depositVoucherCount, 1);
});

test('8. dòng đảo bút toán triệt tiêu dòng gốc thay vì tạo giao dịch mới', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'ORIGINAL', sourceId: 'REV-SRC', amount: 300, direction: 'in' }),
    ledger({ idempotencyKey: 'REVERSAL', sourceId: 'REV-SRC', amount: 300, direction: 'in', isReversal: true })
  ]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.totals.totalDeposited, 0);
  assert.equal(result.totals.totalExpense, 0);
});

test('9. chuyển quỹ hai dòng không tăng tiền nộp/chi và chỉ đếm một giao dịch nội bộ', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'T-OUT', sourceType: 'FUND_TRANSFER', sourceId: 'T1', direction: 'out', fundType: 'cash', amount: 1000, deliveryStaffCode: '', deliveryStaffName: '' }),
    ledger({ idempotencyKey: 'T-IN', sourceType: 'FUND_TRANSFER', sourceId: 'T1', direction: 'in', fundType: 'bank', amount: 1000, deliveryStaffCode: '', deliveryStaffName: '' })
  ]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.totals.totalDeposited, 0);
  assert.equal(result.totals.totalExpense, 0);
  assert.equal(result.totals.internalTransferAmount, 1000);
  assert.equal(result.totals.internalTransferCount, 1);
});

test('10. cùng referenceId: dòng trùng idempotency bị loại nhưng các dòng nghiệp vụ khác nhau vẫn được cộng trong một phiếu', () => {
  const common = { sourceId: 'REF1', sourceCode: 'PT-REF1', deliveryStaffCode: 'GH01', deliveryStaffName: 'A' };
  const first = ledger({ ...common, idempotencyKey: 'REF-A', amount: 100 });
  const duplicate = { ...first, id: 'DUPLICATE-DOC' };
  const secondPart = ledger({ ...common, idempotencyKey: 'REF-B', amount: 50, account: 'CASH-SECONDARY' });
  const result = summarize([first, duplicate, secondPart]);
  assert.equal(result.rows[0].depositedAmount, 150);
  assert.equal(result.rows[0].depositVoucherCount, 1);
});

test('11. lọc đúng một ngày dùng biên giờ Asia/Ho_Chi_Minh', () => {
  const filters = service.normalizeFilters({ fromDate: '2026-06-20', toDate: '2026-06-20' });
  const pipeline = service.buildNormalizedVoucherPipeline(filters);
  const source = JSON.stringify(pipeline[0]);
  assert.match(source, /2026-06-20/);
  assert.match(source, /2026-06-19T17:00:00\.000Z/);
  assert.match(source, /2026-06-20T17:00:00\.000Z/);
});

test('12. giao dịch sát 00:00:00 và 23:59:59 nằm trong khoảng [start, nextDay)', () => {
  const filters = service.normalizeFilters({ fromDate: '2026-06-20', toDate: '2026-06-20' });
  const pipelineText = JSON.stringify(service.buildNormalizedVoucherPipeline(filters));
  assert.match(pipelineText, /\$gte/);
  assert.match(pipelineText, /\$lt/);
  assert.doesNotMatch(pipelineText, /23:59:59/);
});

test('13. tổng KPI bằng tổng các dòng tổng hợp', () => {
  const result = summarize([
    ledger({ idempotencyKey: 'K1', sourceId: 'K1', amount: 100 }),
    ledger({ idempotencyKey: 'K2', sourceId: 'K2', amount: 200, deliveryStaffCode: 'GH02', deliveryStaffName: 'B' }),
    ledger({ idempotencyKey: 'K3', sourceId: 'K3', amount: 40, direction: 'out', sourceType: 'EXPENSE_VOUCHER', receiverCode: 'GH02', receiverName: 'B', receiverRole: 'delivery' })
  ]);
  assert.equal(result.totals.totalDeposited, result.rows.reduce((sum, row) => sum + row.depositedAmount, 0));
  assert.equal(result.totals.totalExpense, result.rows.reduce((sum, row) => sum + row.expenseAmount, 0));
  assert.equal(result.totals.netAmount, result.rows.reduce((sum, row) => sum + row.netAmount, 0));
});

test('14. tổng chứng từ chi tiết của một người bằng dòng tổng hợp', () => {
  const normalized = [
    service.normalizeLedgerForSummary(ledger({ idempotencyKey: 'DT1', sourceId: 'DT1', amount: 300 })),
    service.normalizeLedgerForSummary(ledger({ idempotencyKey: 'DT2', sourceId: 'DT2', amount: 70, direction: 'out', sourceType: 'EXPENSE_VOUCHER', receiverCode: 'GH01', receiverName: 'Nguyễn Văn A', receiverRole: 'delivery' }))
  ];
  const result = service.summarizeNormalizedTransactions(normalized);
  const details = normalized.filter((row) => row.personKey === result.rows[0].personKey);
  assert.equal(details.reduce((sum, row) => sum + (row.signedAmount > 0 ? row.signedAmount : 0), 0), result.rows[0].depositedAmount);
  assert.equal(details.reduce((sum, row) => sum + (row.signedAmount < 0 ? Math.abs(row.signedAmount) : 0), 0), result.rows[0].expenseAmount);
});

test('15. người không có quyền xem quỹ bị trả về 403', () => {
  const middleware = requireRole(['admin', 'accountant', 'manager']);
  const res = responseRecorder();
  let nextCalled = false;
  middleware({ user: { role: 'sales' } }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(nextCalled, false);
});

test('16. query không hợp lệ được controller trả về 400', async () => {
  const req = { query: { fromDate: '20/06/2026', toDate: '2026-06-20' }, tenantId: 'default', user: { role: 'admin' } };
  const res = responseRecorder();
  await fundController.getSummary(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'INVALID_DATE');
});

test('17. truy vấn lớn dùng một aggregation có $match sớm, $group, $facet, skip/limit và không N+1', async () => {
  const original = fundLedgerRepository.aggregate;
  let calls = 0;
  let captured = null;
  fundLedgerRepository.aggregate = async (pipeline) => {
    calls += 1;
    captured = pipeline;
    return [{ rows: [], peopleCount: [], totals: [], transfers: [] }];
  };
  try {
    const result = await service.getFundSummary({ fromDate: '2026-06-20', toDate: '2026-06-20', page: 2, limit: 50 });
    assert.equal(calls, 1);
    assert.equal(Object.keys(captured[0])[0], '$match');
    const text = JSON.stringify(captured);
    assert.match(text, /\$lookup/);
    assert.match(text, /\$group/);
    assert.match(text, /\$facet/);
    assert.match(text, /\$skip/);
    assert.match(text, /\$limit/);
    assert.equal(result.pagination.page, 2);
  } finally {
    fundLedgerRepository.aggregate = original;
  }
});


test('bổ sung: bút toán mới giữ đúng danh tính NVBH chuẩn thay vì rơi về người thao tác', () => {
  const person = service.resolveFundCounterparty(ledger({
    sourceType: 'MANUAL_DEPOSIT',
    deliveryStaffCode: '',
    deliveryStaffName: '',
    salesStaffCode: 'BH01',
    salesStaffName: 'Nguyễn Thị Bán',
    staffCode: 'KT01',
    staffName: 'Kế toán tạo phiếu'
  }));
  assert.equal(person.personCode, 'BH01');
  assert.equal(person.personRole, 'NVBH');
  assert.equal(person.sourceField, 'fundLedger.salesStaff*');
});

test('bổ sung: AR_RECEIPT cũ ưu tiên khách hàng nộp tiền thay vì staffName của người ghi nhận', () => {
  const person = service.resolveFundCounterparty(ledger({
    sourceType: 'AR_RECEIPT',
    deliveryStaffCode: '',
    deliveryStaffName: '',
    customerCode: 'KH01',
    customerName: 'Khách Hàng A',
    staffCode: '',
    staffName: 'Kế toán nhập phiếu'
  }));
  assert.equal(person.personCode, 'KH01');
  assert.equal(person.personName, 'Khách Hàng A');
  assert.equal(person.personRole, 'Khách hàng');
});

test('18. service báo cáo chỉ đọc aggregate, không phát sinh dòng fundLedgers', () => {
  const sourcePath = path.join(__dirname, '..', 'src', 'services', 'fundSummary.service.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /fundLedgerRepository\.aggregate/);
  assert.doesNotMatch(source, /fundLedgerRepository\.(upsert|create|insert|update|delete)/);
  assert.doesNotMatch(source, /FundLedger\.(create|insertMany|findOneAndUpdate|updateOne|deleteOne)/);
});
