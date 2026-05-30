'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const SalesOrder = require('../src/models/SalesOrder');
const Receipt = require('../src/models/Receipt');
const ReturnOrder = require('../src/models/ReturnOrder');
const Payment = require('../src/models/Payment');
const postingEngine = require('../src/engines/posting.engine');
const { toNumber } = require('../src/utils/common.util');

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}


async function main() {
  await connectDB();
  // Rebuild AR Ledger sạch từ chứng từ gốc.
  // Xóa cả định dạng mới (ar_*) và định dạng cũ từng dùng trong V43/V45
  // như sale_debt, debt_collection để tránh cộng trùng công nợ sau khi rebuild.
  await Payment.deleteMany({
    $or: [
      { account: 'AR' },
      { type: { $regex: '^ar_', $options: 'i' } },
      { type: { $in: [
        'sale_debt',
        'debt_collection',
        'receipt_void',
        'return_debt',
        'return_order',
        'return_ar',
        'ar_return'
      ] } },
      { refType: { $in: ['salesOrder', 'receipt', 'returnOrder', 'RECEIPT', 'RECEIPT_VOID', 'SALES_ORDER', 'RETURN_ORDER'] } }
    ]
  });

  const [orders, receipts, returns] = await Promise.all([
    SalesOrder.find({}).lean(),
    Receipt.find({}).lean(),
    ReturnOrder.find({}).lean()
  ]);

  let saleCount = 0;
  let receiptCount = 0;
  let returnCount = 0;
  let receiptVoidCount = 0;

  for (const order of orders.filter(isActive)) {
    const entry = await postingEngine.postSalesOrderAR(order);
    if (entry) saleCount += 1;
  }

  for (const receipt of receipts) {
    // ERP/DMS: phiếu thu đã hủy vẫn cần 2 bút toán để audit đúng:
    // 1) AR-RECEIPT: Có 131 tại thời điểm thu tiền
    // 2) AR-RECEIPT-VOID: Nợ 131 tại thời điểm hủy
    // Hai dòng triệt tiêu nhau, công nợ trở về đúng số còn phải thu.
    const receiptEntry = await postingEngine.postReceiptAR(receipt);
    if (receiptEntry) receiptCount += 1;
    if (!isActive(receipt)) {
      const voidEntry = await postingEngine.reverseReceiptAR(receipt);
      if (voidEntry) receiptVoidCount += 1;
    }
  }

  for (const row of returns.filter(isActive)) {
    const entry = await postingEngine.postReturnOrderAR(row);
    if (entry) returnCount += 1;
  }

  console.log(JSON.stringify({ ok: true, collection: 'journals', saleCount, receiptCount, receiptVoidCount, returnCount }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
