'use strict';

const mongoose = require('mongoose');

const AdminCorrectionRequest = require('../../models/AdminCorrectionRequest');
const InventoryAdjustment = require('../../models/InventoryAdjustment');
const ArAdjustment = require('../../models/ArAdjustment');
const FundAdjustment = require('../../models/FundAdjustment');
const AuditLog = require('../../models/AuditLog');
const inventoryService = require('../inventoryService');
const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const MasterOrder = require('../../models/MasterOrder');
const MasterReturnOrder = require('../../models/MasterReturnOrder');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const Staff = require('../../models/Staff');
const User = require('../../models/User');
const ImportSessionRow = require('../../models/ImportSessionRow');
const ArLedger = require('../../models/ArLedger');
const FundLedger = require('../../models/FundLedger');
const StockTransaction = require('../../models/StockTransaction');

const auditService = require('../auditService');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { tenantIdOf } = require('../../utils/tenant.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const {
  buildObjectDiff,
  applyPatch,
  pickPatchFromDiff,
  stableClone
} = require('../../utils/adminCorrectionDiff.util');
const {
  classifyCorrection,
  entityLooksLocked,
  canActorApprove
} = require('../../policies/adminCorrectionPolicy');

const ENTITY_MODELS = {
  sales_order: SalesOrder,
  salesOrder: SalesOrder,
  order: SalesOrder,
  return_order: ReturnOrder,
  returnOrder: ReturnOrder,
  master_order: MasterOrder,
  masterOrder: MasterOrder,
  master_return_order: MasterReturnOrder,
  masterReturnOrder: MasterReturnOrder,
  customer: Customer,
  product: Product,
  staff: Staff,
  user: User,
  import_session_row: ImportSessionRow,
  import_row: ImportSessionRow
};

const DISPLAY_NAMES = {
  sales_order: 'Đơn bán',
  return_order: 'Đơn trả hàng',
  master_order: 'Đơn tổng',
  master_return_order: 'Đơn tổng trả hàng',
  customer: 'Khách hàng',
  product: 'Sản phẩm',
  staff: 'Nhân viên',
  user: 'Tài khoản',
  import_session_row: 'Dòng import'
};

function text(value) {
  return String(value || '').trim();
}

function nowIso() {
  return dateUtil.nowIso ? dateUtil.nowIso() : new Date().toISOString();
}

function cleanObject(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!key || key.startsWith('$') || key.includes('..')) continue;
    out[key] = value;
  }
  return out;
}

function actorSnapshot(actor = {}) {
  return {
    id: text(actor.id || actor._id || actor.userId),
    username: text(actor.username || actor.userName),
    name: text(actor.fullName || actor.name || actor.displayName || actor.username),
    role: text(actor.role || actor.roleCode),
    staffCode: text(actor.staffCode || actor.code)
  };
}

function entityCodeOf(doc = {}) {
  return text(doc.code || doc.orderCode || doc.salesOrderCode || doc.documentCode || doc.invoiceCode || doc.customerCode || doc.productCode || doc.username || doc.id || doc._id);
}

function normalizeEntityType(entityType) {
  const raw = text(entityType);
  if (ENTITY_MODELS[raw]) return raw;
  const lower = raw.toLowerCase();
  const found = Object.keys(ENTITY_MODELS).find((key) => key.toLowerCase() === lower);
  return found || lower;
}

function modelFor(entityType) {
  return ENTITY_MODELS[normalizeEntityType(entityType)] || null;
}

function buildIdentityQuery(idOrCode) {
  const ref = text(idOrCode);
  if (!ref) return null;
  const ors = [
    { id: ref },
    { code: ref },
    { orderCode: ref },
    { salesOrderCode: ref },
    { documentCode: ref },
    { invoiceCode: ref },
    { customerCode: ref },
    { productCode: ref },
    { username: ref },
    { sessionId: ref },
    { correctionCode: ref },
    { adjustmentCode: ref }
  ];
  if (mongoose.Types.ObjectId.isValid(ref)) ors.unshift({ _id: new mongoose.Types.ObjectId(ref) });
  return { $or: ors };
}

async function resolveEntity(entityType, idOrCode, options = {}) {
  const Model = modelFor(entityType);
  if (!Model) return null;
  const query = buildIdentityQuery(idOrCode);
  if (!query) return null;
  const finder = Model.findOne(query);
  if (options.session) finder.session(options.session);
  return finder.lean();
}

async function writeAudit(action, payload = {}, options = {}) {
  return auditService.record({
    action,
    refType: payload.refType || payload.entityType || payload.correction?.entityType || 'admin_correction',
    refId: payload.refId || payload.entityId || payload.correction?.entityId || payload.correction?.id || '',
    refCode: payload.refCode || payload.entityCode || payload.correction?.entityCode || payload.correction?.correctionCode || '',
    before: payload.before || null,
    after: payload.after || payload.summary || null,
    note: payload.note || payload.reason || '',
    actor: payload.actor || {},
    tenantId: payload.tenantId
  }, options);
}

function correctionBase(input = {}, actor = {}) {
  const code = text(input.correctionCode) || makeId('CORR');
  return {
    id: text(input.id) || code,
    tenantId: tenantIdOf({ tenantId: input.tenantId || actor.tenantId }),
    correctionCode: code,
    entityType: normalizeEntityType(input.entityType),
    entityId: text(input.entityId || input.id || input.entityCode),
    entityCode: text(input.entityCode),
    correctionType: text(input.correctionType || 'entity_patch'),
    status: text(input.status || 'pending') || 'pending',
    reason: text(input.reason),
    requestedBy: actorSnapshot(actor),
    requestedAt: nowIso(),
    affectedLedgers: [],
    affectedReports: Array.isArray(input.affectedReports) ? input.affectedReports : [],
    idempotencyKey: text(input.idempotencyKey),
    version: 1,
    deleted: false,
    metadata: input.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function ensureReason(reason) {
  if (!text(reason) || text(reason).length < 3) {
    const err = new Error('Cần nhập lý do chỉnh sửa số liệu');
    err.status = 400;
    throw err;
  }
}

function ensurePatch(patch = {}) {
  const clean = cleanObject(patch);
  if (!Object.keys(clean).length) {
    const err = new Error('Không có trường dữ liệu cần chỉnh sửa');
    err.status = 400;
    throw err;
  }
  return clean;
}

async function calculateCustomerDebt(customerCode, options = {}) {
  const code = text(customerCode);
  if (!code) return 0;
  const pipeline = [
    { $match: { customerCode: code, status: { $ne: 'void' } } },
    { $group: { _id: null, debit: { $sum: { $ifNull: ['$debit', 0] } }, credit: { $sum: { $ifNull: ['$credit', 0] } }, amount: { $sum: { $ifNull: ['$amount', 0] } } } }
  ];
  const aggregate = ArLedger.aggregate(pipeline);
  if (options.session) aggregate.session(options.session);
  const [row] = await aggregate;
  if (!row) return 0;
  const debit = toNumber(row.debit);
  const credit = toNumber(row.credit);
  if (debit || credit) return debit - credit;
  return toNumber(row.amount);
}

async function calculateFundBalance({ fundCode = '', fundType = 'cash', account = '' } = {}, options = {}) {
  const match = { status: { $ne: 'void' } };
  if (text(fundCode)) match.fundCode = text(fundCode);
  if (text(fundType)) match.fundType = text(fundType);
  if (text(account)) match.account = text(account);
  const aggregate = FundLedger.aggregate([
    { $match: match },
    { $group: { _id: null, inAmount: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, { $ifNull: ['$amount', 0] }, 0] } }, outAmount: { $sum: { $cond: [{ $eq: ['$direction', 'out'] }, { $ifNull: ['$amount', 0] }, 0] } } } }
  ]);
  if (options.session) aggregate.session(options.session);
  const [row] = await aggregate;
  return toNumber(row?.inAmount) - toNumber(row?.outAmount);
}

async function calculateStockBalance({ productCode = '', warehouseCode = 'MAIN' } = {}, options = {}) {
  const p = text(productCode);
  if (!p) return 0;
  const aggregate = StockTransaction.aggregate([
    { $match: { productCode: p, warehouseCode: text(warehouseCode) || 'MAIN' } },
    { $group: { _id: null, inQty: { $sum: { $ifNull: ['$inQty', 0] } }, outQty: { $sum: { $ifNull: ['$outQty', 0] } }, qty: { $sum: { $ifNull: ['$quantity', 0] } } } }
  ]);
  if (options.session) aggregate.session(options.session);
  const [row] = await aggregate;
  const inOut = toNumber(row?.inQty) - toNumber(row?.outQty);
  return inOut || toNumber(row?.qty);
}

async function createCorrectionRequest(input = {}, actor = {}, options = {}) {
  ensureReason(input.reason);
  const base = correctionBase(input, actor);
  const patch = ensurePatch(input.proposedPatch || input.patch || input.after || {});
  let before = input.beforeSnapshot || null;
  let after = input.afterSnapshot || null;

  if (!['inventory', 'stock', 'ar', 'debt', 'fund'].includes(base.entityType)) {
    const entity = await resolveEntity(base.entityType, base.entityId || base.entityCode, options);
    if (!entity && modelFor(base.entityType)) {
      const err = new Error('Không tìm thấy dữ liệu cần chỉnh sửa');
      err.status = 404;
      throw err;
    }
    if (entity) {
      before = stableClone(entity);
      after = applyPatch(before, patch);
      base.entityId = text(base.entityId || entity.id || entity._id);
      base.entityCode = text(base.entityCode || entityCodeOf(entity));
    }
  }

  if (!before) before = stableClone(input.beforeSnapshot || {});
  if (!after) after = applyPatch(before, patch);
  const diff = buildObjectDiff(before, after);
  const policy = classifyCorrection({
    entityType: base.entityType,
    correctionType: base.correctionType,
    diff,
    proposedPatch: patch
  });

  const doc = {
    ...base,
    proposedPatch: patch,
    beforeSnapshot: before,
    afterSnapshot: after,
    diff,
    riskLevel: policy.riskLevel,
    status: input.applyImmediately ? 'approved' : (policy.requiresApproval ? 'pending' : 'approved'),
    metadata: {
      ...base.metadata,
      policy,
      source: text(input.source || 'admin_ui')
    }
  };

  const createOptions = options.session ? { session: options.session } : undefined;
  const [created] = await AdminCorrectionRequest.create([doc], createOptions);
  await writeAudit('ADMIN_CORRECTION_CREATED', {
    correction: created,
    before,
    after: { correctionCode: created.correctionCode, riskLevel: created.riskLevel, status: created.status },
    actor,
    reason: input.reason,
    tenantId: doc.tenantId
  }, options);

  if (input.applyImmediately) {
    return applyCorrectionRequest(created.id, actor, options);
  }

  return created.toObject ? created.toObject() : created;
}

async function listCorrections(query = {}) {
  const filter = { deleted: { $ne: true } };
  if (query.status) filter.status = text(query.status);
  if (query.entityType) filter.entityType = normalizeEntityType(query.entityType);
  if (query.riskLevel) filter.riskLevel = text(query.riskLevel).toLowerCase();
  if (query.entityCode) filter.entityCode = text(query.entityCode);
  const limit = Math.min(Math.max(toNumber(query.limit) || 100, 1), 500);
  return AdminCorrectionRequest.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

async function getCorrection(id) {
  const query = buildIdentityQuery(id) || { id: text(id) };
  return AdminCorrectionRequest.findOne({ ...query, deleted: { $ne: true } }).lean();
}

async function updateCorrection(id, patch = {}, options = {}) {
  const update = { ...patch, updatedAt: nowIso() };
  const q = AdminCorrectionRequest.findOneAndUpdate(buildIdentityQuery(id), { $set: update, $inc: { version: 1 } }, { new: true });
  if (options.session) q.session(options.session);
  return q.lean();
}

async function approveCorrection(id, actor = {}, input = {}) {
  return withMongoTransaction(async (session) => {
    const correction = await getCorrection(id);
    if (!correction) {
      const err = new Error('Không tìm thấy phiếu chỉnh sửa');
      err.status = 404;
      throw err;
    }
    if (!['pending', 'draft'].includes(correction.status)) {
      const err = new Error(`Phiếu đang ở trạng thái ${correction.status}, không thể duyệt`);
      err.status = 409;
      throw err;
    }
    if (!canActorApprove(actor, correction)) {
      const err = new Error('Bạn không được duyệt phiếu chỉnh sửa này');
      err.status = 403;
      throw err;
    }
    const approved = await updateCorrection(correction.id || correction.correctionCode, {
      status: 'approved',
      approvedBy: actorSnapshot(actor),
      approvedAt: nowIso(),
      metadata: { ...(correction.metadata || {}), approvalNote: text(input.note) }
    }, { session });
    await writeAudit('ADMIN_CORRECTION_APPROVED', { correction: approved, actor, reason: input.note, tenantId: correction.tenantId }, { session });
    return approved;
  });
}

async function rejectCorrection(id, actor = {}, input = {}) {
  ensureReason(input.reason || input.rejectReason);
  return withMongoTransaction(async (session) => {
    const correction = await getCorrection(id);
    if (!correction) {
      const err = new Error('Không tìm thấy phiếu chỉnh sửa');
      err.status = 404;
      throw err;
    }
    if (!['pending', 'draft', 'approved'].includes(correction.status)) {
      const err = new Error(`Phiếu đang ở trạng thái ${correction.status}, không thể từ chối`);
      err.status = 409;
      throw err;
    }
    const rejected = await updateCorrection(correction.id || correction.correctionCode, {
      status: 'rejected',
      rejectedBy: actorSnapshot(actor),
      rejectedAt: nowIso(),
      rejectReason: text(input.reason || input.rejectReason)
    }, { session });
    await writeAudit('ADMIN_CORRECTION_REJECTED', { correction: rejected, actor, reason: rejected.rejectReason, tenantId: correction.tenantId }, { session });
    return rejected;
  });
}

async function findInventoryAdjustmentByCorrectionCode(correctionCode, options = {}) {
  const query = InventoryAdjustment.findOne({ correctionCode: text(correctionCode) });
  if (options.session) query.session(options.session);
  return query.lean();
}

async function createInventoryAdjustment(correction, actor = {}, options = {}) {
  const patch = correction.proposedPatch || {};
  const warehouseCode = text(patch.warehouseCode || patch.warehouse || correction.entityCode || 'MAIN') || 'MAIN';
  const productCode = text(patch.productCode || patch.sku || correction.entityId || correction.entityCode);
  const adjustQty = toNumber(patch.adjustQty ?? patch.quantity ?? patch.qty);
  if (!productCode || !adjustQty) {
    const err = new Error('Phiếu điều chỉnh tồn kho cần productCode và adjustQty khác 0');
    err.status = 400;
    throw err;
  }

  const existingAdjustment = await findInventoryAdjustmentByCorrectionCode(correction.correctionCode, options);
  if (existingAdjustment) {
    return {
      adjustment: existingAdjustment,
      ledgers: existingAdjustment.stockTransactionId
        ? [{ type: 'stockTransaction', id: existingAdjustment.stockTransactionId, code: existingAdjustment.stockTransactionCode || existingAdjustment.stockTransactionId }]
        : []
    };
  }

  const beforeQty = Number.isFinite(Number(patch.beforeQty))
    ? toNumber(patch.beforeQty)
    : await calculateStockBalance({ productCode, warehouseCode }, options);
  const afterQty = Number.isFinite(Number(patch.afterQty)) ? toNumber(patch.afterQty) : beforeQty + adjustQty;
  const direction = adjustQty >= 0 ? 'IN' : 'OUT';
  const code = makeId('INVADJ');
  const txDate = nowIso().slice(0, 10);

  // P0 inventory invariant:
  // Admin correction không được tự create stockTransactions rồi bỏ qua inventories.
  // postStockMovement() là boundary duy nhất để vừa ghi ledger vừa cập nhật current inventory
  // theo idempotencyKey sourceType/sourceId/product/warehouse/type.
  const stockTransactions = await inventoryService.postStockMovement({
    id: correction.id,
    code: correction.correctionCode,
    date: txDate,
    documentDate: txDate,
    note: correction.reason,
    items: [{
      productCode,
      productId: text(patch.productId || productCode),
      productName: text(patch.productName),
      quantity: Math.abs(adjustQty),
      qty: Math.abs(adjustQty)
    }]
  }, {
    type: direction === 'IN' ? 'ADMIN_ADJUSTMENT_IN' : 'ADMIN_ADJUSTMENT_OUT',
    direction,
    sourceType: 'ADMIN_CORRECTION',
    refType: 'ADMIN_CORRECTION',
    refId: correction.id,
    refCode: correction.correctionCode,
    date: txDate,
    note: correction.reason
  }, { session: options.session });

  const stockTx = (stockTransactions || []).find((row) => !row.skipped) || (stockTransactions || [])[0] || {};
  const createOptions = options.session ? { session: options.session } : undefined;
  const [adjustment] = await InventoryAdjustment.create([{
    id: code,
    tenantId: correction.tenantId,
    adjustmentCode: code,
    correctionId: correction.id,
    correctionCode: correction.correctionCode,
    warehouseCode,
    warehouseName: text(patch.warehouseName),
    productCode,
    productName: text(patch.productName),
    beforeQty,
    adjustQty,
    afterQty,
    reason: correction.reason,
    sourceType: 'admin_correction',
    sourceId: correction.id,
    sourceCode: correction.correctionCode,
    stockTransactionId: stockTx.id || '',
    stockTransactionCode: stockTx.code || stockTx.id || '',
    isRollback: Boolean(correction.isRollback || String(correction.correctionCode || '').endsWith('-RB')),
    rollbackOf: text(correction.rollbackOf || correction.metadata?.rollbackOf),
    createdBy: correction.requestedBy,
    approvedBy: actorSnapshot(actor),
    status: 'applied',
    createdAt: correction.createdAt,
    approvedAt: correction.approvedAt || nowIso(),
    appliedAt: nowIso(),
    metadata: { stockTransactions: stableClone(stockTransactions || []) }
  }], createOptions);
  return { adjustment, ledgers: stockTx.id ? [{ type: 'stockTransaction', id: stockTx.id, code: stockTx.code || stockTx.id }] : [] };
}

async function createArAdjustment(correction, actor = {}, options = {}) {
  const patch = correction.proposedPatch || {};
  const customerCode = text(patch.customerCode || correction.entityCode || correction.entityId);
  const adjustAmount = toNumber(patch.adjustAmount ?? patch.amount);
  if (!customerCode || !adjustAmount) {
    const err = new Error('Phiếu điều chỉnh công nợ cần customerCode và adjustAmount khác 0');
    err.status = 400;
    throw err;
  }
  const beforeDebt = Number.isFinite(Number(patch.beforeDebt)) ? toNumber(patch.beforeDebt) : await calculateCustomerDebt(customerCode, options);
  const afterDebt = Number.isFinite(Number(patch.afterDebt)) ? toNumber(patch.afterDebt) : beforeDebt + adjustAmount;
  const ledgerId = makeId('ARADJ');
  const code = makeId('ARADJREQ');
  const debit = adjustAmount > 0 ? Math.abs(adjustAmount) : 0;
  const credit = adjustAmount < 0 ? Math.abs(adjustAmount) : 0;
  const createOptions = options.session ? { session: options.session } : undefined;
  const [ledger] = await ArLedger.create([{
    id: ledgerId,
    tenantId: correction.tenantId,
    code: ledgerId,
    type: 'AR-ADJUSTMENT',
    date: nowIso().slice(0, 10),
    customerCode,
    customerName: text(patch.customerName),
    refType: 'adminCorrectionRequest',
    refId: correction.id,
    refCode: correction.correctionCode,
    amount: adjustAmount,
    debit,
    credit,
    note: correction.reason,
    status: 'posted',
    source: 'admin_correction',
    sourceType: 'admin_correction',
    sourceId: correction.id,
    sourceCode: correction.correctionCode,
    createdAt: nowIso(),
    updatedAt: nowIso()
  }], createOptions);
  const [adjustment] = await ArAdjustment.create([{
    id: code,
    tenantId: correction.tenantId,
    adjustmentCode: code,
    correctionId: correction.id,
    correctionCode: correction.correctionCode,
    customerCode,
    customerName: text(patch.customerName),
    beforeDebt,
    adjustAmount,
    afterDebt,
    reason: correction.reason,
    sourceType: 'admin_correction',
    sourceId: correction.id,
    sourceCode: correction.correctionCode,
    arLedgerId: ledger.id,
    arLedgerCode: ledger.code,
    adjustmentKind: adjustAmount >= 0 ? 'increase_debt' : 'decrease_debt',
    createdBy: correction.requestedBy,
    approvedBy: actorSnapshot(actor),
    status: 'applied',
    createdAt: correction.createdAt,
    approvedAt: correction.approvedAt || nowIso(),
    appliedAt: nowIso(),
    metadata: { arLedger: ledger.toObject ? ledger.toObject() : ledger }
  }], createOptions);
  return { adjustment, ledgers: [{ type: 'arLedger', id: ledger.id, code: ledger.code }] };
}

async function createFundAdjustment(correction, actor = {}, options = {}) {
  const patch = correction.proposedPatch || {};
  const fundType = text(patch.fundType || correction.entityCode || 'cash') || 'cash';
  const fundCode = text(patch.fundCode || patch.account || fundType);
  const account = text(patch.account || fundCode || fundType).toUpperCase();
  const adjustAmount = toNumber(patch.adjustAmount ?? patch.amount);
  if (!adjustAmount) {
    const err = new Error('Phiếu điều chỉnh quỹ cần adjustAmount khác 0');
    err.status = 400;
    throw err;
  }
  const beforeBalance = Number.isFinite(Number(patch.beforeBalance)) ? toNumber(patch.beforeBalance) : await calculateFundBalance({ fundCode, fundType, account }, options);
  const afterBalance = Number.isFinite(Number(patch.afterBalance)) ? toNumber(patch.afterBalance) : beforeBalance + adjustAmount;
  const ledgerId = makeId('FUNDADJ');
  const code = makeId('FUNDADJREQ');
  const direction = adjustAmount >= 0 ? 'in' : 'out';
  const createOptions = options.session ? { session: options.session } : undefined;
  const [ledger] = await FundLedger.create([{
    id: ledgerId,
    tenantId: correction.tenantId,
    code: ledgerId,
    date: nowIso().slice(0, 10),
    fundType,
    direction,
    account,
    idempotencyKey: text(correction.idempotencyKey) || `admin-correction:fund:${correction.correctionCode}`,
    amount: Math.abs(adjustAmount),
    sourceType: 'admin_correction',
    sourceId: correction.id,
    sourceCode: correction.correctionCode,
    refType: 'adminCorrectionRequest',
    refId: correction.id,
    refCode: correction.correctionCode,
    note: correction.reason,
    status: 'posted',
    createdBy: text(actor.username || actor.name),
    createdAt: nowIso(),
    updatedAt: nowIso()
  }], createOptions);
  const [adjustment] = await FundAdjustment.create([{
    id: code,
    tenantId: correction.tenantId,
    adjustmentCode: code,
    correctionId: correction.id,
    correctionCode: correction.correctionCode,
    fundCode,
    fundType,
    account,
    beforeBalance,
    adjustAmount,
    afterBalance,
    reason: correction.reason,
    sourceType: 'admin_correction',
    sourceId: correction.id,
    sourceCode: correction.correctionCode,
    fundLedgerId: ledger.id,
    fundLedgerCode: ledger.code,
    adjustmentKind: adjustAmount >= 0 ? 'cash_in_adjustment' : 'cash_out_adjustment',
    createdBy: correction.requestedBy,
    approvedBy: actorSnapshot(actor),
    status: 'applied',
    createdAt: correction.createdAt,
    approvedAt: correction.approvedAt || nowIso(),
    appliedAt: nowIso(),
    metadata: { fundLedger: ledger.toObject ? ledger.toObject() : ledger }
  }], createOptions);
  return { adjustment, ledgers: [{ type: 'fundLedger', id: ledger.id, code: ledger.code }] };
}

function correctionLedgerKind(correction = {}) {
  const key = text(correction.correctionType || correction.entityType).toLowerCase();
  if (['inventory_adjustment', 'stock_adjustment', 'inventory', 'stock'].includes(key)) return 'inventory';
  if (['ar_adjustment', 'debt_adjustment', 'ar', 'debt'].includes(key)) return 'ar';
  if (['fund_adjustment', 'cash_adjustment', 'fund'].includes(key)) return 'fund';
  return '';
}

async function applyDirectEntityPatch(correction, actor = {}, options = {}) {
  const Model = modelFor(correction.entityType);
  if (!Model) {
    const err = new Error(`Không hỗ trợ sửa trực tiếp loại dữ liệu ${correction.entityType}`);
    err.status = 400;
    throw err;
  }
  const current = await resolveEntity(correction.entityType, correction.entityId || correction.entityCode, options);
  if (!current) {
    const err = new Error('Không tìm thấy dữ liệu để áp dụng chỉnh sửa');
    err.status = 404;
    throw err;
  }
  const policy = correction.metadata?.policy || classifyCorrection({
    entityType: correction.entityType,
    correctionType: correction.correctionType,
    diff: correction.diff,
    proposedPatch: correction.proposedPatch
  });
  if (policy.requiresLedgerAdjustment || (String(correction.riskLevel).toLowerCase() === 'high' && entityLooksLocked(current))) {
    const err = new Error('Dữ liệu rủi ro cao hoặc đã phát sinh ledger không được update trực tiếp; hãy tạo phiếu điều chỉnh tồn kho/công nợ/quỹ.');
    err.status = 409;
    throw err;
  }
  const patch = cleanObject(correction.proposedPatch || pickPatchFromDiff(correction.diff, 'after'));
  const setPatch = { ...patch, updatedAt: nowIso() };
  const query = buildIdentityQuery(correction.entityId || correction.entityCode);
  const update = Model.findOneAndUpdate(query, { $set: setPatch, $inc: { version: 1 } }, { new: true });
  if (options.session) update.session(options.session);
  const updated = await update.lean();
  await writeAudit('ADMIN_CORRECTION_DIRECT_APPLIED', {
    correction,
    entityType: correction.entityType,
    entityId: correction.entityId,
    entityCode: correction.entityCode,
    before: current,
    after: updated,
    actor,
    reason: correction.reason,
    tenantId: correction.tenantId
  }, options);
  return { entity: updated, ledgers: [] };
}

async function applyCorrectionRequest(id, actor = {}, options = {}) {
  const run = async (session) => {
    const correction = await getCorrection(id);
    if (!correction) {
      const err = new Error('Không tìm thấy phiếu chỉnh sửa');
      err.status = 404;
      throw err;
    }
    if (correction.status === 'applied') return correction;
    if (!['approved', 'pending'].includes(correction.status)) {
      const err = new Error(`Phiếu đang ở trạng thái ${correction.status}, không thể áp dụng`);
      err.status = 409;
      throw err;
    }
    if (correction.status === 'pending' && !canActorApprove(actor, correction)) {
      const err = new Error('Phiếu chưa được duyệt hoặc bạn không có quyền áp dụng');
      err.status = 403;
      throw err;
    }

    const kind = correctionLedgerKind(correction);
    let result;
    if (kind === 'inventory') result = await createInventoryAdjustment(correction, actor, { session });
    else if (kind === 'ar') result = await createArAdjustment(correction, actor, { session });
    else if (kind === 'fund') result = await createFundAdjustment(correction, actor, { session });
    else result = await applyDirectEntityPatch(correction, actor, { session });

    const applied = await updateCorrection(correction.id || correction.correctionCode, {
      status: 'applied',
      approvedBy: correction.approvedBy || actorSnapshot(actor),
      approvedAt: correction.approvedAt || nowIso(),
      appliedBy: actorSnapshot(actor),
      appliedAt: nowIso(),
      affectedLedgers: result.ledgers || [],
      metadata: { ...(correction.metadata || {}), applyResult: stableClone(result.adjustment || result.entity || {}) }
    }, { session });
    await writeAudit('ADMIN_CORRECTION_APPLIED', {
      correction: applied,
      after: { affectedLedgers: result.ledgers || [] },
      actor,
      reason: correction.reason,
      tenantId: correction.tenantId
    }, { session });
    return applied;
  };
  if (options.session) return run(options.session);
  return withMongoTransaction(run);
}

async function createRollbackLedger(correction, actor = {}, options = {}) {
  const kind = correctionLedgerKind(correction);
  const patch = { ...(correction.proposedPatch || {}) };
  if (kind === 'inventory') {
    patch.adjustQty = -toNumber(patch.adjustQty ?? patch.quantity ?? patch.qty);
    patch.beforeQty = undefined;
    const rollbackCorrection = { ...correction, id: makeId('CORRROLL'), correctionCode: `${correction.correctionCode}-RB`, proposedPatch: patch, reason: `Rollback: ${correction.reason}`, idempotencyKey: '', isRollback: true, rollbackOf: correction.correctionCode, metadata: { ...(correction.metadata || {}), rollbackOf: correction.correctionCode } };
    const result = await createInventoryAdjustment(rollbackCorrection, actor, options);
    await InventoryAdjustment.updateMany({ correctionCode: correction.correctionCode }, { $set: { status: 'rolled_back', rolledBackAt: nowIso() } }, options.session ? { session: options.session } : undefined);
    return result;
  }
  if (kind === 'ar') {
    patch.adjustAmount = -toNumber(patch.adjustAmount ?? patch.amount);
    patch.beforeDebt = undefined;
    const rollbackCorrection = { ...correction, id: makeId('CORRROLL'), correctionCode: `${correction.correctionCode}-RB`, proposedPatch: patch, reason: `Rollback: ${correction.reason}`, idempotencyKey: '', isRollback: true, rollbackOf: correction.correctionCode, metadata: { ...(correction.metadata || {}), rollbackOf: correction.correctionCode } };
    const result = await createArAdjustment(rollbackCorrection, actor, options);
    await ArAdjustment.updateMany({ correctionCode: correction.correctionCode }, { $set: { status: 'rolled_back', rolledBackAt: nowIso() } }, options.session ? { session: options.session } : undefined);
    return result;
  }
  if (kind === 'fund') {
    patch.adjustAmount = -toNumber(patch.adjustAmount ?? patch.amount);
    patch.beforeBalance = undefined;
    const rollbackCorrection = { ...correction, id: makeId('CORRROLL'), correctionCode: `${correction.correctionCode}-RB`, proposedPatch: patch, reason: `Rollback: ${correction.reason}`, idempotencyKey: '', isRollback: true, rollbackOf: correction.correctionCode, metadata: { ...(correction.metadata || {}), rollbackOf: correction.correctionCode } };
    const result = await createFundAdjustment(rollbackCorrection, actor, options);
    await FundAdjustment.updateMany({ correctionCode: correction.correctionCode }, { $set: { status: 'rolled_back', rolledBackAt: nowIso() } }, options.session ? { session: options.session } : undefined);
    return result;
  }
  return null;
}

async function rollbackCorrectionRequest(id, actor = {}, input = {}) {
  ensureReason(input.reason || 'rollback');
  return withMongoTransaction(async (session) => {
    const correction = await getCorrection(id);
    if (!correction) {
      const err = new Error('Không tìm thấy phiếu chỉnh sửa');
      err.status = 404;
      throw err;
    }
    if (correction.status !== 'applied') {
      const err = new Error('Chỉ rollback được phiếu đã áp dụng');
      err.status = 409;
      throw err;
    }
    let rollbackRef = null;
    const kind = correctionLedgerKind(correction);
    if (kind) {
      const result = await createRollbackLedger(correction, actor, { session });
      rollbackRef = { kind, ledgers: result?.ledgers || [] };
    } else {
      const Model = modelFor(correction.entityType);
      const revertPatch = pickPatchFromDiff(correction.diff, 'before');
      const query = buildIdentityQuery(correction.entityId || correction.entityCode);
      const update = Model.findOneAndUpdate(query, { $set: { ...revertPatch, updatedAt: nowIso() }, $inc: { version: 1 } }, { new: true });
      update.session(session);
      const reverted = await update.lean();
      rollbackRef = { kind: 'direct_entity_revert', entity: { id: reverted?.id, code: entityCodeOf(reverted) } };
    }
    const rolled = await updateCorrection(correction.id || correction.correctionCode, {
      status: 'rolled_back',
      rolledBackBy: actorSnapshot(actor),
      rolledBackAt: nowIso(),
      rollbackRef,
      metadata: { ...(correction.metadata || {}), rollbackReason: text(input.reason) }
    }, { session });
    await writeAudit('ADMIN_CORRECTION_ROLLED_BACK', {
      correction: rolled,
      after: rollbackRef,
      actor,
      reason: input.reason,
      tenantId: correction.tenantId
    }, { session });
    return rolled;
  });
}

async function getEntityEditContext(entityType, idOrCode) {
  const normalized = normalizeEntityType(entityType);
  const entity = await resolveEntity(normalized, idOrCode);
  if (!entity) {
    const err = new Error('Không tìm thấy dữ liệu cần sửa');
    err.status = 404;
    throw err;
  }
  const locked = entityLooksLocked(entity);
  return {
    entityType: normalized,
    entityLabel: DISPLAY_NAMES[normalized] || normalized,
    entityId: text(entity.id || entity._id),
    entityCode: entityCodeOf(entity),
    locked,
    current: entity,
    rules: {
      canEditDirectMasterData: !locked,
      highRiskRequiresAdjustment: true,
      requiredReason: true,
      rollbackByReversalLedger: true
    }
  };
}

async function validateEntityChange(entityType, idOrCode, proposedPatch = {}) {
  const context = await getEntityEditContext(entityType, idOrCode);
  const patch = ensurePatch(proposedPatch);
  const after = applyPatch(context.current, patch);
  const diff = buildObjectDiff(context.current, after);
  const policy = classifyCorrection({ entityType: context.entityType, diff, proposedPatch: patch });
  const warnings = [];
  if (context.locked && policy.riskLevel === 'high') {
    warnings.push('Dữ liệu đã phát sinh kế toán/tồn kho/công nợ, không được sửa trực tiếp. Hãy tạo phiếu điều chỉnh ledger.');
  }
  if (diff.some((row) => ['salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName'].includes(row.path))) {
    warnings.push('Sửa NVBH/NVGH sẽ ảnh hưởng KPI, đối soát giao hàng và báo cáo nhân viên.');
  }
  if (diff.some((row) => ['date', 'orderDate', 'deliveryDate', 'returnDate'].includes(row.path))) {
    warnings.push('Sửa ngày sẽ ảnh hưởng báo cáo ngày/tháng và lọc chứng từ.');
  }
  return { ...context, proposedPatch: patch, after, diff, policy, warnings };
}

async function requestEntityChange(entityType, idOrCode, input = {}, actor = {}) {
  const validation = await validateEntityChange(entityType, idOrCode, input.proposedPatch || input.patch || {});
  return createCorrectionRequest({
    entityType: validation.entityType,
    entityId: validation.entityId,
    entityCode: validation.entityCode,
    correctionType: input.correctionType || 'entity_patch',
    proposedPatch: input.proposedPatch || input.patch,
    beforeSnapshot: validation.current,
    afterSnapshot: validation.after,
    reason: input.reason,
    metadata: { validationWarnings: validation.warnings }
  }, actor);
}

async function listAuditLogs(query = {}) {
  const filter = {};
  if (query.entityType) filter.refType = normalizeEntityType(query.entityType);
  if (query.entityId) filter.refId = text(query.entityId);
  if (query.entityCode) filter.refCode = text(query.entityCode);
  if (query.action) filter.action = text(query.action);
  const limit = Math.min(Math.max(toNumber(query.limit) || 100, 1), 500);
  return AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

function getCorrectionStandard() {
  return {
    summary: 'Admin được sửa dữ liệu, nhưng mọi chỉnh sửa rủi ro cao phải đi qua phiếu điều chỉnh và ledger bù trừ.',
    riskGroups: [
      { group: 'A', riskLevel: 'low', examples: ['tên khách hàng', 'địa chỉ', 'số điện thoại', 'ghi chú'], method: 'sửa trực tiếp + audit' },
      { group: 'B', riskLevel: 'medium', examples: ['NVBH', 'NVGH', 'ngày bán', 'ngày giao', 'trạng thái'], method: 'correction request + validate + audit' },
      { group: 'C', riskLevel: 'high', examples: ['tồn kho', 'công nợ', 'quỹ', 'số tiền đơn đã xác nhận'], method: 'phiếu điều chỉnh + ledger bù trừ + rollback bằng bút toán đảo' }
    ],
    immutableDirectWriteFields: ['availableQty', 'currentQty', 'debtAmount', 'paidAmount', 'receivableAmount', 'fundBalance', 'items.qty', 'items.salePrice'],
    api: {
      corrections: '/api/admin/corrections',
      entityEditContext: '/api/admin/entities/:entityType/:id/edit-context',
      validateChange: '/api/admin/entities/:entityType/:id/validate-change',
      requestChange: '/api/admin/entities/:entityType/:id/request-change',
      auditLogs: '/api/admin/audit-logs'
    }
  };
}

module.exports = {
  actorSnapshot,
  buildObjectDiff,
  createCorrectionRequest,
  listCorrections,
  getCorrection,
  approveCorrection,
  rejectCorrection,
  applyCorrectionRequest,
  rollbackCorrectionRequest,
  getEntityEditContext,
  validateEntityChange,
  requestEntityChange,
  listAuditLogs,
  getCorrectionStandard,
  calculateCustomerDebt,
  calculateFundBalance,
  calculateStockBalance
};
