export function offlineOperationToOrder(operation = {}, helpers = {}) {
  const payload = operation.payload || {};
  const customer = payload.customer || {};
  const customerName = helpers.customerName?.(customer) || payload.customerName || '';
  const customerCode = helpers.customerCode?.(customer) || payload.customerCode || '';
  const totalAmount = (Array.isArray(payload.items) ? payload.items : []).reduce(
    (sum, item) => sum + Number(item.amount || Number(item.quantity || item.qty || 0) * Number(item.salePrice || item.unitPrice || item.price || 0)),
    0
  );
  const paidAmount = Number(payload.paidAmount ?? 0);
  const currentDebtAmount = Number.isFinite(Number(payload.currentDebtAmount)) ? Number(payload.currentDebtAmount) : null;
  return {
    id: operation.operationId,
    code: `OFFLINE-${String(operation.operationId || '').slice(-8).toUpperCase()}`,
    date: String(operation.clientCreatedAt || '').slice(0, 10),
    customerName,
    customerCode,
    totalAmount,
    paidAmount,
    debtAmount: currentDebtAmount,
    currentDebtAmount,
    debtSource: currentDebtAmount === null ? 'UNAVAILABLE_PENDING_SYNC' : 'AR_DEBT_READ_MODEL_V2',
    debtDisplayText: currentDebtAmount === null ? 'Chưa có dữ liệu công nợ' : '',
    status: operation.status || 'pending',
    deliveryStatus: 'pending_sync',
    pendingSync: true,
    syncError: operation.lastError || '',
    canEdit: false,
    editLockReason: ['conflict', 'needs_attention'].includes(operation.status) ? 'Cần kiểm tra thao tác đồng bộ tồn đọng' : 'Đang chờ đồng bộ lên máy chủ'
  };
}
