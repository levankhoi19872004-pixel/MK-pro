'use strict';

function text(value) { return String(value ?? '').trim(); }
function toNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

function buildDataQualityRows({ sales = {}, inventory = {}, delivery = {}, returns = {} } = {}) {
  const rows = [];
  if (toNumber(sales.summary?.missingArLedgerCount) > 0) {
    rows.push({
      severity: 'critical', domain: 'Bán hàng', date: sales.dateTo || '', code: 'AR-SALE', name: 'AR Ledger',
      issue: 'Đơn xác nhận kế toán thiếu AR-SALE', difference: sales.summary.missingArLedgerCount,
      amount: sales.summary.missingArDebitAmount
    });
  }
  for (const order of sales.sales || []) {
    const quality = order.dataQuality || {};
    if (toNumber(quality.missingValueCount) > 0) {
      rows.push({ severity: 'major', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Dòng hàng thiếu giá trị/snapshot giá', difference: quality.missingValueCount, amount: order.actualAmount });
    }
    if (toNumber(quality.currentCatalogFallbackCount) > 0) {
      rows.push({ severity: 'warning', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Đang fallback giá danh mục hiện tại', difference: quality.currentCatalogFallbackCount, amount: order.actualAmount });
    }
    if (Math.abs(toNumber(quality.orderLineMismatchAmount)) >= 1) {
      rows.push({ severity: 'major', domain: 'Bán hàng', date: order.date, code: order.code, name: order.customerName, issue: 'Tổng đơn lệch tổng dòng', difference: quality.orderLineMismatchAmount, amount: order.actualAmount });
    }
  }
  for (const stock of inventory.stock || []) {
    if (toNumber(stock.endingQty) < 0) {
      rows.push({ severity: 'critical', domain: 'Tồn kho', date: inventory.dateTo || '', code: stock.productCode, name: stock.productName, issue: 'Tồn kho cuối kỳ âm', difference: stock.endingQty, amount: 0 });
    }
    if (Math.abs(toNumber(stock.reconciliationDifference)) > 0.000001) {
      rows.push({ severity: 'major', domain: 'Tồn kho', date: inventory.dateTo || '', code: stock.productCode, name: stock.productName, issue: 'Lệch inventories và stockTransactions', difference: stock.reconciliationDifference, amount: 0 });
    }
  }
  for (const trip of delivery.delivery || []) {
    if (trip.dataQuality?.missingChildren) {
      rows.push({ severity: 'critical', domain: 'Giao hàng', date: trip.deliveryDate, code: trip.code, name: trip.deliveryStaffName, issue: 'Đơn tổng không tìm thấy đơn con', difference: trip.assignedOrderCount, amount: trip.snapshotTotalAmount });
    } else if (toNumber(trip.dataQuality?.snapshotOrderCountDifference) !== 0 || Math.abs(toNumber(trip.dataQuality?.snapshotAmountDifference)) >= 1) {
      rows.push({ severity: 'major', domain: 'Giao hàng', date: trip.deliveryDate, code: trip.code, name: trip.deliveryStaffName, issue: 'Snapshot đơn tổng lệch dữ liệu đơn con', difference: trip.dataQuality.snapshotAmountDifference, amount: trip.totalAmount });
    }
  }
  for (const item of returns.returns || []) {
    if (toNumber(item.amount) > 0 && toNumber(item.arAmount) <= 0) {
      rows.push({ severity: 'major', domain: 'Trả hàng', date: item.date, code: item.code, name: item.customerName, issue: 'Phiếu trả chưa có AR-RETURN đối ứng', difference: 0, amount: item.amount });
    }
  }
  const rank = { critical: 0, major: 1, warning: 2 };
  return rows.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || text(b.date).localeCompare(text(a.date)));
}

function summarizeDataQuality(rows = []) {
  return {
    issueCount: rows.length,
    criticalCount: rows.filter((row) => row.severity === 'critical').length,
    majorCount: rows.filter((row) => row.severity === 'major').length,
    warningCount: rows.filter((row) => row.severity === 'warning').length,
    affectedAmount: rows.reduce((sum, row) => sum + Math.abs(toNumber(row.amount)), 0)
  };
}

module.exports = { buildDataQualityRows, summarizeDataQuality };
