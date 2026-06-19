'use strict';

// Backward-compatible facade. All master-order print aggregation is delegated
// to the canonical Print Domain so single and batch printing share one rule set.
const PrintReadService = require('../../domain/print/PrintReadService');

function idsFromBody(body = {}) {
  const input = body.masterOrderIds || body.ids || body.masterOrders || [];
  return (Array.isArray(input) ? input : String(input || '').split(','))
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

async function buildAggregateMasterPrintDocument(body = {}) {
  const ids = idsFromBody(body);
  if (!ids.length) return { error: 'Chưa chọn đơn tổng để in', status: 400 };

  try {
    const document = await PrintReadService.readMasterOrders(ids, { date: body.date });
    return { document };
  } catch (err) {
    return {
      error: err.message || 'Không tạo được dữ liệu in đơn tổng',
      status: err.status || err.statusCode || 500
    };
  }
}

module.exports = {
  buildAggregateMasterPrintDocument
};
