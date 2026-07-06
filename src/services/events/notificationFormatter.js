'use strict';

const { EVENT_TYPES } = require('./domainEventTypes');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString('vi-VN')}đ` : '0đ';
}

function signedMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0đ';
  return `${n > 0 ? '+' : '-'}${money(Math.abs(n))}`;
}

function actorLabel(event = {}) {
  return text(event.actorName || event.actorCode || 'system');
}

function codeOf(event = {}, ...keys) {
  for (const key of keys) {
    const value = text(event.metadata?.[key] || event[key]);
    if (value) return value;
  }
  return '';
}

function amountDiffMessage(event = {}) {
  const diff = event.diff || {};
  const parts = [];
  if (diff.netAmount !== undefined || diff.totalAmount !== undefined) {
    const value = diff.netAmount ?? diff.totalAmount;
    parts.push(`Doanh số: ${signedMoney(value)}`);
  }
  if (diff.cashAmount !== undefined || diff.cashDeltaAmount !== undefined) parts.push(`TM ${signedMoney(diff.cashAmount ?? diff.cashDeltaAmount)}`);
  if (diff.bankAmount !== undefined || diff.bankDeltaAmount !== undefined) parts.push(`CK ${signedMoney(diff.bankAmount ?? diff.bankDeltaAmount)}`);
  if (diff.rewardAmount !== undefined || diff.rewardDeltaAmount !== undefined) parts.push(`Trả thưởng ${signedMoney(diff.rewardAmount ?? diff.rewardDeltaAmount)}`);
  if (diff.debtAmount !== undefined || diff.debtDeltaAmount !== undefined) parts.push(`Công nợ ${signedMoney(diff.debtAmount ?? diff.debtDeltaAmount)}`);
  if (diff.returnAmount !== undefined || diff.returnAdjustmentAmount !== undefined) parts.push(`Hàng trả ${signedMoney(diff.returnAmount ?? diff.returnAdjustmentAmount)}`);
  return parts.join(', ');
}

function actionUrlFor(event = {}) {
  const orderCode = codeOf(event, 'orderCode', 'salesOrderCode') || event.entityCode;
  const customerCode = codeOf(event, 'customerCode');
  const returnCode = codeOf(event, 'returnOrderCode', 'orderCode') || event.entityCode;
  switch (event.eventType) {
    case EVENT_TYPES.AR_RECEIPT_CONFIRMED:
    case EVENT_TYPES.AR_LEDGER_CREATED_MANUAL:
    case EVENT_TYPES.AR_LEDGER_REVERSED:
      return customerCode ? `/#/debt-new?customerCode=${encodeURIComponent(customerCode)}` : '/#/debt-new';
    case EVENT_TYPES.DELIVERY_CLOSEOUT_ADJUSTED:
    case EVENT_TYPES.DELIVERY_CLOSEOUT_LOCKED:
    case EVENT_TYPES.DELIVERY_ACCOUNTING_CONFIRMED:
      return orderCode ? `/#/delivery-today-new?orderCode=${encodeURIComponent(orderCode)}` : '/#/delivery-today-new';
    case EVENT_TYPES.ORDER_AMOUNT_CHANGED:
    case EVENT_TYPES.ORDER_DELETED:
    case EVENT_TYPES.ORDER_DELIVERY_STAFF_CHANGED:
    case EVENT_TYPES.ORDER_SALES_STAFF_CHANGED:
      return orderCode ? `/#/sales?orderCode=${encodeURIComponent(orderCode)}` : '/#/sales';
    case EVENT_TYPES.RETURN_ORDER_WAREHOUSE_CHECKED:
    case EVENT_TYPES.RETURN_ORDER_STOCK_IMPORTED:
      return returnCode ? `/#/return-orders?orderCode=${encodeURIComponent(returnCode)}` : '/#/return-orders';
    case EVENT_TYPES.IMPORT_COMPLETED_WITH_ERRORS:
    case EVENT_TYPES.IMPORT_FAILED:
      return '/#/import-data';
    case EVENT_TYPES.STOCK_ADJUSTED:
      return '/#/stock';
    case EVENT_TYPES.FUND_LEDGER_CREATED:
      return '/#/funds';
    case EVENT_TYPES.USER_ROLE_CHANGED:
    case EVENT_TYPES.USER_DISABLED:
      return '/#/users';
    default:
      return '';
  }
}

function format(event = {}) {
  const eventType = text(event.eventType).toUpperCase();
  const actor = actorLabel(event);
  const orderCode = codeOf(event, 'orderCode', 'salesOrderCode') || event.entityCode;
  const customerName = codeOf(event, 'customerName') || codeOf(event, 'customerCode');
  const amount = Number(event.metadata?.amount || event.diff?.amount || 0);
  const diffText = amountDiffMessage(event);
  let title = 'Thông báo hệ thống';
  let message = `${actor} đã thực hiện thao tác ${eventType}`;

  switch (eventType) {
    case EVENT_TYPES.ORDER_AMOUNT_CHANGED:
      title = 'Đơn hàng thay đổi số tiền';
      message = `Đơn ${orderCode || event.entityCode} đã thay đổi số liệu${diffText ? `: ${diffText}` : ''}`;
      break;
    case EVENT_TYPES.ORDER_DELETED:
      title = 'Đơn hàng đã bị xóa';
      message = `Đơn ${orderCode || event.entityCode} đã bị xóa bởi ${actor}`;
      break;
    case EVENT_TYPES.ORDER_DELIVERY_STAFF_CHANGED:
      title = 'Đơn hàng đổi NVGH';
      message = `Đơn ${orderCode || event.entityCode} đã đổi NVGH bởi ${actor}`;
      break;
    case EVENT_TYPES.ORDER_SALES_STAFF_CHANGED:
      title = 'Đơn hàng đổi NVBH';
      message = `Đơn ${orderCode || event.entityCode} đã đổi NVBH bởi ${actor}`;
      break;
    case EVENT_TYPES.DELIVERY_CLOSEOUT_ADJUSTED:
      title = 'Đã điều chỉnh đơn giao';
      message = `Đơn ${orderCode || event.entityCode} có điều chỉnh thu tiền${diffText ? `: ${diffText}` : ''}`;
      break;
    case EVENT_TYPES.DELIVERY_CLOSEOUT_LOCKED:
      title = 'Đã chốt sổ giao hàng';
      message = `${actor} đã chốt sổ giao hàng ${codeOf(event, 'deliveryDate') || ''}`.trim();
      break;
    case EVENT_TYPES.DELIVERY_ACCOUNTING_CONFIRMED:
      title = 'Đã xác nhận kế toán giao hàng';
      message = `Kế toán đã xác nhận giao hàng ${orderCode || event.entityCode}`;
      break;
    case EVENT_TYPES.AR_RECEIPT_CONFIRMED:
      title = 'Đã xác nhận công nợ';
      message = `Đã xác nhận thu công nợ ${customerName ? `KH ${customerName}: ` : ''}${money(amount)}`;
      break;
    case EVENT_TYPES.AR_LEDGER_CREATED_MANUAL:
      title = 'Đã tạo công nợ thủ công';
      message = `Đã tạo công nợ ${customerName ? `cho KH ${customerName}: ` : ''}${money(amount)}`;
      break;
    case EVENT_TYPES.AR_LEDGER_REVERSED:
      title = 'Đã đảo/hủy bút toán công nợ';
      message = `Bút toán công nợ ${event.entityCode || codeOf(event, 'ledgerCode')} đã bị đảo/hủy`;
      break;
    case EVENT_TYPES.RETURN_ORDER_WAREHOUSE_CHECKED:
      title = 'Thủ kho đã xác nhận hàng trả';
      message = `Hàng trả ${event.entityCode || codeOf(event, 'returnOrderCode')} đã được xác nhận khớp`;
      break;
    case EVENT_TYPES.RETURN_ORDER_STOCK_IMPORTED:
      title = 'Đơn trả đã nhập kho';
      message = `Đơn trả ${event.entityCode || codeOf(event, 'returnOrderCode')} đã nhập kho`;
      break;
    case EVENT_TYPES.STOCK_ADJUSTED:
      title = 'Tồn kho đã điều chỉnh';
      message = `Tồn kho ${codeOf(event, 'productCode') || event.entityCode} đã được điều chỉnh${diffText ? `: ${diffText}` : ''}`;
      break;
    case EVENT_TYPES.FUND_LEDGER_CREATED:
      title = 'Đã ghi nhận quỹ tiền';
      message = `Đã ghi nhận giao dịch quỹ ${amount ? money(amount) : ''}`.trim();
      break;
    case EVENT_TYPES.IMPORT_COMPLETED_WITH_ERRORS:
      title = 'Import hoàn thành có dòng lỗi';
      message = `Import ${codeOf(event, 'importType') || event.entityCode} hoàn thành: ${Number(event.metadata?.importedRows || 0)} dòng hợp lệ, ${Number(event.metadata?.errorRows || event.metadata?.skippedRows || 0)} dòng lỗi/bỏ qua`;
      break;
    case EVENT_TYPES.IMPORT_FAILED:
      title = 'Import thất bại';
      message = `Import ${codeOf(event, 'importType') || event.entityCode} thất bại${event.metadata?.reason ? `: ${event.metadata.reason}` : ''}`;
      break;
    case EVENT_TYPES.USER_ROLE_CHANGED:
      title = 'Đã đổi quyền tài khoản';
      message = `Tài khoản ${codeOf(event, 'userName') || event.entityCode} đã đổi quyền từ ${event.before?.role || ''} sang ${event.after?.role || ''}`;
      break;
    case EVENT_TYPES.USER_DISABLED:
      title = 'Đã khóa tài khoản';
      message = `Tài khoản ${codeOf(event, 'userName') || event.entityCode} đã bị vô hiệu hóa`;
      break;
    default:
      break;
  }

  return {
    title,
    message,
    actionUrl: actionUrlFor(event),
    actionLabel: 'Xem chứng từ'
  };
}

module.exports = {
  format,
  _private: { money, signedMoney, amountDiffMessage, actionUrlFor }
};
