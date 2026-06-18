'use strict';

const PurchaseOrder = require('../../models/PurchaseOrder');
const GoodsReceipt = require('../../models/GoodsReceipt');
const SupplierPayableLedger = require('../../models/SupplierPayableLedger');
const SupplierPayableAccount = require('../../models/SupplierPayableAccount');
const SupplierPayment = require('../../models/SupplierPayment');
const PurchaseReturn = require('../../models/PurchaseReturn');
const InventoryPostingService = require('../../domain/posting/InventoryPostingService');
const FundPostingService = require('../../domain/posting/FundPostingService');
const CommandPipeline = require('../../application/CommandPipeline');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');

function text(value) {
  return String(value || '').trim();
}

function quantity(value) {
  return Math.max(0, toNumber(value));
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function actorName(actor = {}) {
  return text(actor.username || actor.fullName || actor.name || actor.code || 'system');
}

function code(prefix) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  return `${prefix}${stamp}`;
}

function identityFilter(idOrCode, tenantId) {
  const value = text(idOrCode);
  const or = [{ id: value }, { code: value }];
  if (/^[a-fA-F0-9]{24}$/.test(value)) or.push({ _id: value });
  return scopeTenant({ $or: or }, tenantId);
}

function normalizeItems(items = []) {
  const grouped = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const productCode = text(raw.productCode || raw.code || raw.sku || raw.productId);
    const qty = quantity(raw.quantity ?? raw.qty);
    if (!productCode || qty <= 0) continue;
    const costPrice = money(raw.costPrice ?? raw.purchasePrice ?? raw.importPrice);
    const existing = grouped.get(productCode) || {
      productId: text(raw.productId || productCode),
      productCode,
      productName: text(raw.productName || raw.name),
      unit: text(raw.unit || raw.baseUnit),
      quantity: 0,
      receivedQty: 0,
      costPrice,
      amount: 0
    };
    existing.quantity += qty;
    existing.costPrice = costPrice || existing.costPrice;
    existing.amount = existing.quantity * existing.costPrice;
    grouped.set(productCode, existing);
  }
  return Array.from(grouped.values());
}

function totals(items = []) {
  return {
    totalQuantity: items.reduce((sum, row) => sum + quantity(row.quantity), 0),
    totalAmount: items.reduce((sum, row) => sum + money(row.amount ?? quantity(row.quantity) * money(row.costPrice)), 0)
  };
}

async function ensureSupplierAccount(input = {}, tenantId, session = null) {
  const supplierCode = text(input.supplierCode);
  if (!supplierCode) throw Object.assign(new Error('Thiếu mã nhà cung cấp'), { status: 400 });

  let account = await SupplierPayableAccount.findOne({ tenantId, supplierCode }).session(session);
  if (account) return account;

  const aggregate = SupplierPayableLedger.aggregate([
    { $match: { tenantId, supplierCode, status: 'posted' } },
    {
      $group: {
        _id: null,
        creditTotal: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
        debitTotal: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] } }
      }
    }
  ]);
  if (session) aggregate.session(session);
  const [row] = await aggregate;
  const now = dateUtil.nowIso();
  const creditTotal = money(row?.creditTotal);
  const debitTotal = money(row?.debitTotal);
  try {
    account = await SupplierPayableAccount.findOneAndUpdate({ tenantId, supplierCode }, {
      $setOnInsert: {
        id: makeId('SPA'),
        tenantId,
        supplierId: text(input.supplierId),
        supplierCode,
        supplierName: text(input.supplierName),
        creditTotal,
        debitTotal,
        balanceAmount: creditTotal - debitTotal,
        updatedAt: now
      }
    }, { upsert: true, new: true, session });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    account = await SupplierPayableAccount.findOne({ tenantId, supplierCode }).session(session);
  }
  return account;
}

async function increaseSupplierPayable(input = {}, amount, tenantId, session) {
  const value = money(amount);
  const now = dateUtil.nowIso();
  return SupplierPayableAccount.findOneAndUpdate({ tenantId, supplierCode: text(input.supplierCode) }, {
    $setOnInsert: {
      id: makeId('SPA'),
      tenantId,
      supplierId: text(input.supplierId),
      supplierCode: text(input.supplierCode)
    },
    $set: { supplierName: text(input.supplierName), updatedAt: now },
    $inc: { creditTotal: value, balanceAmount: value }
  }, { upsert: true, new: true, session }).lean();
}

async function reduceSupplierPayable(input = {}, amount, tenantId, session, options = {}) {
  const value = money(amount);
  await ensureSupplierAccount(input, tenantId, session);
  const filter = { tenantId, supplierCode: text(input.supplierCode) };
  if (options.preventNegative !== false) filter.balanceAmount = { $gte: value };
  const account = await SupplierPayableAccount.findOneAndUpdate(filter, {
    $set: { supplierName: text(input.supplierName), updatedAt: dateUtil.nowIso() },
    $inc: { debitTotal: value, balanceAmount: -value }
  }, { new: true, session }).lean();
  if (!account) {
    const current = await SupplierPayableAccount.findOne({ tenantId, supplierCode: text(input.supplierCode) }).session(session).lean();
    throw Object.assign(new Error(`Số tiền vượt công nợ còn lại ${money(current?.balanceAmount)}`), {
      status: 409,
      code: 'SUPPLIER_PAYABLE_EXCEEDED'
    });
  }
  return account;
}

function assertPurchaseOrderInput(input = {}) {
  const supplierCode = text(input.supplierCode || input.supplierId);
  const supplierName = text(input.supplierName);
  const items = normalizeItems(input.items);
  if (!supplierCode) throw Object.assign(new Error('Thiếu mã nhà cung cấp'), { status: 400 });
  if (!supplierName) throw Object.assign(new Error('Thiếu tên nhà cung cấp'), { status: 400 });
  if (!items.length) throw Object.assign(new Error('Đơn mua chưa có dòng hàng hợp lệ'), { status: 400 });
  return { supplierCode, supplierName, items };
}

async function createPurchaseOrder(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const validated = assertPurchaseOrderInput(input);
  const now = dateUtil.nowIso();
  const summary = totals(validated.items);
  return CommandPipeline.execute({
    name: 'PurchaseOrder.Create',
    aggregateType: 'PurchaseOrder',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const document = {
        id: text(input.id || makeId('PO')),
        code: text(input.code || code('PO')),
        tenantId,
        supplierId: text(input.supplierId),
        supplierCode: validated.supplierCode,
        supplierName: validated.supplierName,
        orderDate: dateUtil.toDateOnly(input.orderDate || input.date, dateUtil.todayVN()),
        expectedDate: dateUtil.toDateOnly(input.expectedDate),
        warehouseCode: text(input.warehouseCode || 'MAIN'),
        status: 'draft',
        items: validated.items,
        ...summary,
        note: text(input.note),
        approvedAt: '',
        approvedBy: '',
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now,
        updatedBy: actorName(actor)
      };
      const created = await PurchaseOrder.create([document], { session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'PurchaseOrder',
      aggregateId: result.id,
      eventType: 'purchase.order.created',
      payload: { id: result.id, code: result.code, supplierCode: result.supplierCode, totalAmount: result.totalAmount }
    }]
  });
}

async function approvePurchaseOrder(idOrCode, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'PurchaseOrder.Approve',
    aggregateType: 'PurchaseOrder',
    tenantId,
    actor,
    input: { ...input, idOrCode },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const now = dateUtil.nowIso();
      const order = await PurchaseOrder.findOneAndUpdate({
        ...identityFilter(idOrCode, tenantId),
        status: 'draft'
      }, {
        $set: {
          status: 'approved',
          approvedAt: now,
          approvedBy: actorName(actor),
          updatedAt: now,
          updatedBy: actorName(actor)
        }
      }, { new: true, session }).lean();
      if (!order) throw Object.assign(new Error('Không tìm thấy đơn mua nháp để duyệt'), { status: 404 });
      return order;
    },
    events: (result) => [{
      aggregateType: 'PurchaseOrder',
      aggregateId: result.id,
      eventType: 'purchase.order.approved',
      payload: { id: result.id, code: result.code }
    }]
  });
}

function buildReceiptLines(order, requestedItems = []) {
  const requested = new Map(normalizeItems(requestedItems).map((row) => [row.productCode, row]));
  const useRemaining = requested.size === 0;
  const lines = [];

  for (const ordered of order.items || []) {
    const remaining = Math.max(0, quantity(ordered.quantity) - quantity(ordered.receivedQty));
    const wanted = useRemaining ? remaining : quantity(requested.get(ordered.productCode)?.quantity);
    if (wanted <= 0) continue;
    if (wanted > remaining) {
      throw Object.assign(new Error(`Số lượng nhận ${ordered.productCode} vượt số lượng còn lại ${remaining}`), { status: 409 });
    }
    lines.push({
      productId: text(ordered.productId || ordered.productCode),
      productCode: text(ordered.productCode),
      productName: text(ordered.productName),
      unit: text(ordered.unit),
      quantity: wanted,
      qty: wanted,
      costPrice: money(requested.get(ordered.productCode)?.costPrice || ordered.costPrice),
      amount: wanted * money(requested.get(ordered.productCode)?.costPrice || ordered.costPrice),
      warehouseCode: text(order.warehouseCode || 'MAIN')
    });
  }

  if (!lines.length) throw Object.assign(new Error('Không có số lượng hợp lệ để nhận hàng'), { status: 400 });
  return lines;
}

async function receivePurchaseOrder(idOrCode, input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'PurchaseOrder.Receive',
    aggregateType: 'GoodsReceipt',
    tenantId,
    actor,
    input: { ...input, idOrCode },
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const order = await PurchaseOrder.findOne({
        ...identityFilter(idOrCode, tenantId),
        status: { $in: ['approved', 'partially_received'] }
      }).session(session);
      if (!order) throw Object.assign(new Error('Đơn mua chưa được duyệt hoặc đã nhận đủ'), { status: 409 });

      const lines = buildReceiptLines(order.toObject(), input.items);
      const now = dateUtil.nowIso();
      const summary = totals(lines);
      const receipt = {
        id: text(input.receiptId || makeId('GR')),
        code: text(input.receiptCode || code('GR')),
        tenantId,
        purchaseOrderId: order.id,
        purchaseOrderCode: order.code,
        supplierId: order.supplierId,
        supplierCode: order.supplierCode,
        supplierName: order.supplierName,
        receiptDate: dateUtil.toDateOnly(input.receiptDate || input.date, dateUtil.todayVN()),
        warehouseCode: text(order.warehouseCode || 'MAIN'),
        status: 'posted',
        items: lines,
        ...summary,
        stockPosted: true,
        payablePosted: true,
        note: text(input.note),
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now
      };

      const created = await GoodsReceipt.create([receipt], { session });
      await InventoryPostingService.postPurchaseIn(receipt, { session });

      await SupplierPayableLedger.create([{
        id: makeId('SPL'),
        tenantId,
        idempotencyKey: `goods_receipt:${tenantId}:${receipt.id}`,
        supplierId: receipt.supplierId,
        supplierCode: receipt.supplierCode,
        supplierName: receipt.supplierName,
        date: receipt.receiptDate,
        type: 'PURCHASE',
        direction: 'credit',
        amount: receipt.totalAmount,
        refType: 'GOODS_RECEIPT',
        refId: receipt.id,
        refCode: receipt.code,
        note: `Ghi nhận công nợ nhập hàng ${receipt.code}`,
        status: 'posted',
        createdAt: now,
        createdBy: actorName(actor)
      }], { session });
      await increaseSupplierPayable(receipt, receipt.totalAmount, tenantId, session);

      const lineMap = new Map(lines.map((line) => [line.productCode, line.quantity]));
      let allReceived = true;
      for (const item of order.items) {
        item.receivedQty = quantity(item.receivedQty) + quantity(lineMap.get(item.productCode));
        if (item.receivedQty < quantity(item.quantity)) allReceived = false;
      }
      order.status = allReceived ? 'received' : 'partially_received';
      order.updatedAt = now;
      order.updatedBy = actorName(actor);
      await order.save({ session });

      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'GoodsReceipt',
      aggregateId: result.id,
      eventType: 'purchase.goods.received',
      payload: {
        id: result.id,
        code: result.code,
        purchaseOrderCode: result.purchaseOrderCode,
        supplierCode: result.supplierCode,
        totalAmount: result.totalAmount
      }
    }]
  });
}

async function supplierOutstanding(supplierCode, tenantId, session = null) {
  const account = await SupplierPayableAccount.findOne({ tenantId, supplierCode: text(supplierCode) }).session(session).lean();
  if (account) return Math.max(0, money(account.balanceAmount));
  const pipeline = [
    { $match: { tenantId, supplierCode: text(supplierCode), status: 'posted' } },
    {
      $group: {
        _id: null,
        credit: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
        debit: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] } }
      }
    }
  ];
  const aggregate = SupplierPayableLedger.aggregate(pipeline);
  if (session) aggregate.session(session);
  const [row] = await aggregate;
  return Math.max(0, money(row?.credit) - money(row?.debit));
}

async function paySupplier(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const amount = money(input.amount);
  if (amount <= 0) throw Object.assign(new Error('Số tiền thanh toán phải lớn hơn 0'), { status: 400 });
  if (!text(input.supplierCode)) throw Object.assign(new Error('Thiếu mã nhà cung cấp'), { status: 400 });

  return CommandPipeline.execute({
    name: 'SupplierPayment.Post',
    aggregateType: 'SupplierPayment',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      await reduceSupplierPayable(input, amount, tenantId, session, { preventNegative: true });
      const now = dateUtil.nowIso();
      const payment = {
        id: text(input.id || makeId('SPAY')),
        code: text(input.code || code('SPAY')),
        tenantId,
        supplierId: text(input.supplierId),
        supplierCode: text(input.supplierCode),
        supplierName: text(input.supplierName),
        paymentDate: dateUtil.toDateOnly(input.paymentDate || input.date, dateUtil.todayVN()),
        paymentMethod: ['bank', 'bank_transfer', 'transfer'].includes(text(input.paymentMethod).toLowerCase()) ? 'bank_transfer' : 'cash',
        amount,
        status: 'posted',
        note: text(input.note),
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now
      };
      const created = await SupplierPayment.create([payment], { session });
      await SupplierPayableLedger.create([{
        id: makeId('SPL'),
        tenantId,
        idempotencyKey: `supplier_payment:${tenantId}:${payment.id}`,
        supplierId: payment.supplierId,
        supplierCode: payment.supplierCode,
        supplierName: payment.supplierName,
        date: payment.paymentDate,
        type: 'PAYMENT',
        direction: 'debit',
        amount,
        refType: 'SUPPLIER_PAYMENT',
        refId: payment.id,
        refCode: payment.code,
        note: `Thanh toán nhà cung cấp ${payment.code}`,
        status: 'posted',
        createdAt: now,
        createdBy: actorName(actor)
      }], { session });
      await FundPostingService.postCashOut({
        amount,
        date: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        sourceType: 'supplierPayment',
        sourceId: payment.id,
        sourceCode: payment.code,
        refType: 'SUPPLIER_PAYMENT',
        refId: payment.id,
        refCode: payment.code,
        supplierCode: payment.supplierCode,
        supplierName: payment.supplierName,
        note: payment.note || `Thanh toán nhà cung cấp ${payment.supplierName}`,
        createdBy: actorName(actor),
        idempotencyKey: `supplier_payment:${tenantId}:${payment.id}:fund`
      }, { session });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'SupplierPayment',
      aggregateId: result.id,
      eventType: 'purchase.supplier.paid',
      payload: { id: result.id, code: result.code, supplierCode: result.supplierCode, amount: result.amount }
    }]
  });
}

async function buildPurchaseReturn(input = {}, tenantId, session) {
  const receiptRef = text(input.goodsReceiptId || input.goodsReceiptCode || input.receiptId || input.receiptCode);
  if (!receiptRef) {
    throw Object.assign(new Error('Phiếu trả nhà cung cấp phải tham chiếu phiếu nhập hàng'), {
      status: 400,
      code: 'GOODS_RECEIPT_REQUIRED'
    });
  }

  const receipt = await GoodsReceipt.findOne({
    ...identityFilter(receiptRef, tenantId),
    status: 'posted'
  }).session(session).lean();
  if (!receipt) throw Object.assign(new Error('Không tìm thấy phiếu nhập hàng đã ghi sổ'), { status: 404 });

  if (text(input.supplierCode) && text(input.supplierCode) !== text(receipt.supplierCode)) {
    throw Object.assign(new Error('Nhà cung cấp không khớp phiếu nhập hàng'), {
      status: 409,
      code: 'SUPPLIER_RECEIPT_MISMATCH'
    });
  }

  const requested = normalizeItems(input.items);
  if (!requested.length) throw Object.assign(new Error('Phiếu trả chưa có dòng hàng hợp lệ'), { status: 400 });

  const priorReturns = await PurchaseReturn.find({
    tenantId,
    goodsReceiptId: receipt.id,
    status: 'posted'
  }).session(session).lean();
  const returnedByProduct = new Map();
  for (const row of priorReturns.flatMap((document) => document.items || [])) {
    const productCode = text(row.productCode);
    returnedByProduct.set(productCode, quantity(returnedByProduct.get(productCode)) + quantity(row.quantity ?? row.qty));
  }

  const receiptItems = new Map((receipt.items || []).map((row) => [text(row.productCode), row]));
  const items = requested.map((row) => {
    const received = receiptItems.get(row.productCode);
    if (!received) {
      throw Object.assign(new Error(`Sản phẩm ${row.productCode} không thuộc phiếu nhập ${receipt.code}`), {
        status: 409,
        code: 'PRODUCT_NOT_IN_RECEIPT'
      });
    }
    const remaining = Math.max(0, quantity(received.quantity ?? received.qty) - quantity(returnedByProduct.get(row.productCode)));
    if (row.quantity > remaining) {
      throw Object.assign(new Error(`Số lượng trả ${row.productCode} vượt số lượng còn lại ${remaining}`), {
        status: 409,
        code: 'PURCHASE_RETURN_QTY_EXCEEDED'
      });
    }
    const costPrice = money(received.costPrice);
    return {
      productId: text(received.productId || row.productId || row.productCode),
      productCode: row.productCode,
      productName: text(received.productName || row.productName),
      unit: text(received.unit || row.unit),
      quantity: row.quantity,
      qty: row.quantity,
      costPrice,
      amount: row.quantity * costPrice,
      warehouseCode: text(receipt.warehouseCode || input.warehouseCode || 'MAIN')
    };
  });

  return { receipt, items, summary: totals(items) };
}

async function createPurchaseReturn(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  return CommandPipeline.execute({
    name: 'PurchaseReturn.Post',
    aggregateType: 'PurchaseReturn',
    tenantId,
    actor,
    input,
    idempotencyKey: input.idempotencyKey,
    handle: async (_, { session }) => {
      const { receipt, items, summary } = await buildPurchaseReturn(input, tenantId, session);
      const now = dateUtil.nowIso();
      const document = {
        id: text(input.id || makeId('PRET')),
        code: text(input.code || code('PRET')),
        tenantId,
        goodsReceiptId: receipt.id,
        goodsReceiptCode: receipt.code,
        purchaseOrderId: text(receipt.purchaseOrderId),
        purchaseOrderCode: text(receipt.purchaseOrderCode),
        supplierId: text(receipt.supplierId),
        supplierCode: text(receipt.supplierCode),
        supplierName: text(receipt.supplierName),
        returnDate: dateUtil.toDateOnly(input.returnDate || input.date, dateUtil.todayVN()),
        warehouseCode: text(receipt.warehouseCode || 'MAIN'),
        items,
        ...summary,
        status: 'posted',
        note: text(input.note),
        createdAt: now,
        createdBy: actorName(actor),
        updatedAt: now
      };
      const created = await PurchaseReturn.create([document], { session });
      await InventoryPostingService.postPurchaseReturnOut(document, { session });
      await SupplierPayableLedger.create([{
        id: makeId('SPL'),
        tenantId,
        idempotencyKey: `purchase_return:${tenantId}:${document.id}`,
        supplierId: document.supplierId,
        supplierCode: document.supplierCode,
        supplierName: document.supplierName,
        date: document.returnDate,
        type: 'RETURN',
        direction: 'debit',
        amount: document.totalAmount,
        refType: 'PURCHASE_RETURN',
        refId: document.id,
        refCode: document.code,
        note: `Giảm công nợ do trả hàng ${document.code}`,
        status: 'posted',
        createdAt: now,
        createdBy: actorName(actor)
      }], { session });
      await reduceSupplierPayable(document, document.totalAmount, tenantId, session, { preventNegative: false });
      return created[0].toObject();
    },
    events: (result) => [{
      aggregateType: 'PurchaseReturn',
      aggregateId: result.id,
      eventType: 'purchase.goods.returned',
      payload: {
        id: result.id,
        code: result.code,
        goodsReceiptCode: result.goodsReceiptCode,
        supplierCode: result.supplierCode,
        totalAmount: result.totalAmount
      }
    }]
  });
}


async function listGoodsReceipts(query = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const filter = scopeTenant({}, tenantId);
  if (query.purchaseOrderId) filter.purchaseOrderId = text(query.purchaseOrderId);
  if (query.supplierCode) filter.supplierCode = text(query.supplierCode);
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
  return GoodsReceipt.find(filter).sort({ receiptDate: -1, createdAt: -1 }).limit(limit).lean();
}

async function listPurchaseReturns(query = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const filter = scopeTenant({}, tenantId);
  if (query.goodsReceiptId) filter.goodsReceiptId = text(query.goodsReceiptId);
  if (query.supplierCode) filter.supplierCode = text(query.supplierCode);
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
  return PurchaseReturn.find(filter).sort({ returnDate: -1, createdAt: -1 }).limit(limit).lean();
}

async function listPurchaseOrders(query = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const filter = scopeTenant({}, tenantId);
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  if (query.supplierCode) filter.supplierCode = text(query.supplierCode);
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
  return PurchaseOrder.find(filter).sort({ orderDate: -1, createdAt: -1 }).limit(limit).lean();
}

async function getPurchaseOrder(idOrCode, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  return PurchaseOrder.findOne(identityFilter(idOrCode, tenantId)).lean();
}

async function listSupplierPayables(query = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const filter = scopeTenant({}, tenantId);
  if (query.supplierCode) filter.supplierCode = text(query.supplierCode);
  const accounts = await SupplierPayableAccount.find(filter).sort({ balanceAmount: -1, supplierCode: 1 }).lean();
  if (accounts.length) {
    return accounts.map((row) => ({
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      credit: money(row.creditTotal),
      debit: money(row.debitTotal),
      balanceAmount: money(row.balanceAmount),
      outstandingAmount: Math.max(0, money(row.balanceAmount)),
      supplierCreditAmount: Math.max(0, -money(row.balanceAmount)),
      lastDate: row.updatedAt
    }));
  }

  const match = scopeTenant({ status: 'posted' }, tenantId);
  if (query.supplierCode) match.supplierCode = text(query.supplierCode);
  return SupplierPayableLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$supplierCode',
        supplierName: { $last: '$supplierName' },
        credit: { $sum: { $cond: [{ $eq: ['$direction', 'credit'] }, '$amount', 0] } },
        debit: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, '$amount', 0] } },
        lastDate: { $max: '$date' }
      }
    },
    {
      $project: {
        _id: 0,
        supplierCode: '$_id',
        supplierName: 1,
        credit: 1,
        debit: 1,
        balanceAmount: { $subtract: ['$credit', '$debit'] },
        outstandingAmount: { $max: [0, { $subtract: ['$credit', '$debit'] }] },
        supplierCreditAmount: { $max: [0, { $subtract: ['$debit', '$credit'] }] },
        lastDate: 1
      }
    },
    { $sort: { outstandingAmount: -1, supplierCode: 1 } }
  ]);
}

module.exports = {
  normalizeItems,
  createPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrder,
  paySupplier,
  createPurchaseReturn,
  buildPurchaseReturn,
  listPurchaseOrders,
  listGoodsReceipts,
  listPurchaseReturns,
  getPurchaseOrder,
  listSupplierPayables,
  supplierOutstanding,
  ensureSupplierAccount,
  increaseSupplierPayable,
  reduceSupplierPayable
};
