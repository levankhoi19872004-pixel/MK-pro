'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const orderService = require('../orderService');
const returnOrderService = require('../returnOrderService');
const MongoStore = require('../../models');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { debugLog } = require('../../utils/debug.util');
const {
  buildDetachedSalesOrderMongoUpdate,
  hasDeliveryOperationalData,
  canonicalMasterChildReferencePatch,
  normalizeChildOrderRefs
} = require('../../utils/masterOrderAssignment.util');

const buildMasterOrderCode = lazyFunction('./masterOrderQuery.impl', 'buildMasterOrderCode');
const resolveStaff = lazyFunction('./masterOrderQuery.impl', 'resolveStaff');
const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const toClient = lazyFunction('./masterOrderQuery.impl', 'toClient');

const INACTIVE_CHILD_ORDER_STATUSES = ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'];
const CHILD_ORDER_REF_FIELDS = [
  'id',
  'code',
  'documentCode',
  'invoiceCode',
  'orderCode',
  'salesOrderId',
  'salesOrderCode',
  'sourceOrderId',
  'sourceOrderCode',
  'deliveryOrderId',
  'deliveryOrderCode',
  '__mongoId'
];

function normalizeChildOrderRefsInput(values = []) {
  const refs = [];
  const input = Array.isArray(values) ? values : [values];
  for (const value of input) {
    if (value && typeof value === 'object') {
      CHILD_ORDER_REF_FIELDS.forEach((field) => {
        const ref = String(value[field] || '').trim();
        if (ref) refs.push(ref);
      });
      continue;
    }
    const ref = String(value || '').trim();
    if (ref) refs.push(ref);
  }
  return [...new Set(refs)];
}

function childOrderIdentityKeys(order = {}) {
  return [...new Set(CHILD_ORDER_REF_FIELDS
    .map((field) => String(order[field] || '').trim())
    .filter(Boolean))];
}

function childOrderDisplayCode(order = {}, fallback = '') {
  return String(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.id || fallback || '').trim();
}

function inactiveReason(order = {}) {
  const status = String(order.status || '').trim().toLowerCase();
  const lifecycleStatus = String(order.lifecycleStatus || '').trim().toLowerCase();
  if (INACTIVE_CHILD_ORDER_STATUSES.includes(status)) return `trạng thái ${status}`;
  if (INACTIVE_CHILD_ORDER_STATUSES.includes(lifecycleStatus)) return `vòng đời ${lifecycleStatus}`;
  if (order.deleted === true || order.isDeleted === true || order.deletedAt) return 'đã xóa';
  if (order.cancelledAt) return 'đã hủy';
  return '';
}

function childOrderMasterConflict(order = {}, currentMaster = null) {
  const masterId = String(order.masterOrderId || '').trim();
  const masterCode = String(order.masterOrderCode || '').trim();
  const mergeStatus = String(order.mergeStatus || '').trim().toLowerCase();
  if (!(masterId || masterCode || ['merged', 'mastered', 'grouped'].includes(mergeStatus))) return '';
  if (currentMaster) {
    const currentKeys = new Set([currentMaster.id, currentMaster.code]
      .map((value) => String(value || '').trim())
      .filter(Boolean));
    if ((masterId && currentKeys.has(masterId)) || (masterCode && currentKeys.has(masterCode))) return '';
  }
  return masterCode || masterId || 'đơn tổng khác';
}

function invalidChildOrderMessage(invalid = []) {
  return invalid.map((item) => `${item.ref}${item.code && item.code !== item.ref ? ` (${item.code})` : ''}: ${item.reason}`).join('; ');
}

function salesStaffGroupKey(order = {}) {
  const code = String(order.salesStaffCode || order.salesmanCode || order.nvbhCode || order.maNVBH || '').trim();
  const name = String(order.salesStaffName || order.salesmanName || order.nvbhName || order.maNVBHName || '').trim();
  return code || name || 'NO_SALES_STAFF';
}

function groupChildrenBySalesStaff(children = [], groupBySalesStaff = false) {
  if (!groupBySalesStaff) return [{ key: 'ALL', children }];
  const groups = new Map();
  for (const child of children) {
    const key = salesStaffGroupKey(child);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(child);
  }
  return Array.from(groups, ([key, rows]) => ({ key, children: rows }));
}

function childOrderKeySet(children = []) {
  return [...new Set((children || []).flatMap(childOrderIdentityKeys))];
}

function childOrderCodes(children = []) {
  return [...new Set((children || []).map((child) => childOrderDisplayCode(child)).filter(Boolean))];
}

async function resolveRequestedChildOrders(inputRefs = [], options = {}) {
  const refs = normalizeChildOrderRefsInput(inputRefs);
  if (!refs.length) return { refs, children: [], invalid: [] };

  const byRequestedRef = new Map();
  const requestedSet = new Set(refs);
  const rememberMatch = (match) => {
    if (!match) return;
    const order = match.order || match.salesOrder || match;
    const keys = [...new Set([...(match.identityKeys || []), ...childOrderIdentityKeys(order)]
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    for (const key of keys) {
      if (requestedSet.has(key) && !byRequestedRef.has(key)) byRequestedRef.set(key, order);
    }
  };

  // Ưu tiên hàm cũ để giữ tương thích test/stub hiện có; sau đó mới dùng resolver mở rộng
  // cho các ref kiểu Mongo _id/ObjectId hoặc alias lịch sử.
  const directOrders = await orderRepository.findManyByIdentity(refs);
  (directOrders || []).forEach((order) => rememberMatch({ identityKeys: childOrderIdentityKeys(order), order }));

  const unresolvedRefs = refs.filter((ref) => !byRequestedRef.has(ref));
  if (unresolvedRefs.length && typeof orderRepository.findManyByIdentityMatches === 'function') {
    const matches = await orderRepository.findManyByIdentityMatches(unresolvedRefs);
    (matches || []).forEach(rememberMatch);
  }

  const invalid = [];
  const children = [];
  const used = new Set();
  for (const ref of refs) {
    const order = byRequestedRef.get(ref);
    if (!order) {
      invalid.push({ ref, reason: 'không tồn tại' });
      continue;
    }
    const inactive = inactiveReason(order);
    if (inactive) {
      invalid.push({ ref, code: childOrderDisplayCode(order, ref), reason: inactive });
      continue;
    }
    const conflict = childOrderMasterConflict(order, options.currentMaster || null);
    if (conflict) {
      invalid.push({ ref, code: childOrderDisplayCode(order, ref), reason: `đã thuộc đơn tổng ${conflict}` });
      continue;
    }
    const primaryKey = String(order.id || order.code || ref).trim();
    if (used.has(primaryKey)) continue;
    used.add(primaryKey);
    children.push(order);
  }
  return { refs, children, invalid };
}

function buildMasterOrderDocument(body = {}, children = [], deliveryStaff = null, dates = {}) {
  return {
    ...body,
    id: String(body.id || makeId('MO')).trim(),
    // Không quét toàn bộ master_orders để sinh mã vì thao tác này rất chậm khi dữ liệu lớn.
    code: String(body.code || makeId('DT')).trim(),
    date: dateUtil.toDateOnly(body.date || dates.deliveryDate),
    masterOrderDate: dates.masterOrderDate,
    deliveryDate: dates.deliveryDate,
    routeName: String(body.routeName || '').trim(),
    note: String(body.note || body.deliveryNote || '').trim(),
    deliveryNote: String(body.deliveryNote || body.note || '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || '',
    // Đơn tổng chỉ là nguồn gán NVGH. Không nhận/ghi đè NVBH của đơn con.
    ...canonicalMasterChildReferencePatch(children),
    groupBySalesStaff: body.groupBySalesStaff === true,
    status: body.status || 'assigned',
    ...orderService.summarizeOrders(children),
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

function buildUnclaimedChildOrderFilter(child = {}) {
  const identity = CHILD_ORDER_REF_FIELDS
    .map((field) => {
      const value = child[field];
      if (!value) return null;
      if (field === '__mongoId') return { _id: value };
      return { [field]: value };
    })
    .filter(Boolean);
  return {
    $and: [
      { $or: identity },
      {
        $or: [
          { masterOrderId: { $exists: false } },
          { masterOrderId: null },
          { masterOrderId: '' }
        ]
      },
      {
        $or: [
          { masterOrderCode: { $exists: false } },
          { masterOrderCode: null },
          { masterOrderCode: '' }
        ]
      },
      { mergeStatus: { $nin: ['merged', 'mastered', 'grouped'] } },
      { status: { $nin: INACTIVE_CHILD_ORDER_STATUSES } },
      { lifecycleStatus: { $nin: INACTIVE_CHILD_ORDER_STATUSES } },
      { deletedAt: { $in: [null, ''] } },
      { isDeleted: { $ne: true } },
      { deleted: { $ne: true } }
    ]
  };
}

async function createMasterOrder(body = {}) {
  const startedAt = Date.now();
  const childIds = normalizeChildOrderRefsInput(body.childOrderIds || body.childOrders || body.orderIds || body.salesOrderIds || []);
  if (!childIds.length) return { error: 'Chưa chọn đơn con để gộp', status: 400 };

  const resolved = await resolveRequestedChildOrders(childIds);
  debugLog('DEBUG_ORDER_FLOW', '[CREATE_MASTER_ORDER_VALIDATE]', {
    requestedCount: childIds.length,
    normalizedRefs: childIds,
    foundCount: resolved.children.length,
    invalid: resolved.invalid
  });

  if (resolved.invalid.length) {
    return { error: `Một số đơn con không hợp lệ: ${invalidChildOrderMessage(resolved.invalid)}`, status: 400 };
  }
  if (!resolved.children.length) return { error: 'Không tìm thấy đơn con hợp lệ để gộp', status: 400 };

  const deliveryStaff = await resolveStaff(body, 'delivery');
  const masterOrderDate = dateUtil.todayVN();
  const deliveryDate = dateUtil.toDateOnly(body.deliveryDate || body.date || dateUtil.nextDeliveryDateVN(masterOrderDate));
  const dates = { masterOrderDate, deliveryDate };
  const groupBySalesStaff = body.groupBySalesStaff === true || String(body.groupBySalesStaff || '').toLowerCase() === 'true';
  const groups = groupChildrenBySalesStaff(resolved.children, groupBySalesStaff);
  const now = dateUtil.nowIso();
  const masterOrders = groups.map((group) => buildMasterOrderDocument(
    { ...body, id: '', code: '', groupBySalesStaff },
    group.children,
    deliveryStaff,
    dates
  ));

  const allChildren = groups.flatMap((group) => group.children);
  const childOrderKeys = childOrderKeySet(allChildren);
  const childCodes = childOrderCodes(allChildren);

  await withMongoTransaction(async (session) => {
    for (const masterOrder of masterOrders) {
      await masterOrderRepository.upsert(masterOrder, { session });
    }

    const bulkOps = [];
    groups.forEach((group, index) => {
      const masterOrder = masterOrders[index];
      const setPatch = {
        masterOrderId: masterOrder.id,
        masterOrderCode: masterOrder.code,
        mergeStatus: 'merged',
        status: 'assigned',
        lifecycleStatus: 'assigned',
        arStatus: 'pending',
        accountingStatus: 'pending',
        accountingConfirmed: false,
        deliveryDate: masterOrder.deliveryDate,
        deliveryStaffId: masterOrder.deliveryStaffId,
        deliveryStaffCode: masterOrder.deliveryStaffCode,
        deliveryStaffName: masterOrder.deliveryStaffName,
        routeName: masterOrder.routeName,
        deliveryRoute: masterOrder.routeName,
        updatedAt: now
      };
      group.children.forEach((child) => {
        bulkOps.push({
          updateOne: {
            filter: buildUnclaimedChildOrderFilter(child),
            update: { $set: { ...setPatch, deliveryStatus: child.deliveryStatus || 'pending' } }
          }
        });
      });
    });

    const claimResult = await MongoStore.salesOrders.bulkWrite(bulkOps, { ordered: true, session });
    const claimedCount = Number(
      claimResult.matchedCount ??
      claimResult.nMatched ??
      claimResult.result?.nMatched ??
      claimResult.modifiedCount ??
      0
    );
    if (claimedCount !== allChildren.length) {
      const error = new Error('Một hoặc nhiều đơn đã được gộp bởi thao tác khác');
      error.code = 'CHILD_ORDER_ALREADY_CLAIMED';
      error.status = 409;
      throw error;
    }

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const masterOrder = masterOrders[index];
      const groupKeys = childOrderKeySet(group.children);
      const groupCodes = childOrderCodes(group.children);
      if (!groupKeys.length && !groupCodes.length) continue;
      await MongoStore.returnOrders.updateMany(
        {
          $or: [
            { salesOrderId: { $in: groupKeys } },
            { orderId: { $in: groupKeys } },
            { sourceOrderId: { $in: groupKeys } },
            { deliveryOrderId: { $in: groupKeys } },
            { salesOrderCode: { $in: groupCodes } },
            { orderCode: { $in: groupCodes } },
            { sourceOrderCode: { $in: groupCodes } },
            { deliveryOrderCode: { $in: groupCodes } }
          ],
          status: { $nin: ['posted', 'confirmed', 'cancelled', 'canceled', 'void', 'deleted', 'duplicate_cancelled'] }
        },
        {
          $set: {
            masterOrderId: masterOrder.id,
            masterOrderCode: masterOrder.code,
            deliveryStaffId: masterOrder.deliveryStaffId,
            deliveryStaffCode: masterOrder.deliveryStaffCode,
            deliveryStaffName: masterOrder.deliveryStaffName,
            deliveryDate: masterOrder.deliveryDate,
            routeName: masterOrder.routeName,
            updatedAt: now
          }
        },
        { session }
      );
    }
  });

  const masterOrdersWithChildren = masterOrders.map((masterOrder, index) => toClient(masterOrder, groups[index].children));
  debugLog('DEBUG_ORDER_FLOW', '[CREATE_MASTER_ORDER_DONE]', {
    ms: Date.now() - startedAt,
    requestedCount: childIds.length,
    masterCount: masterOrdersWithChildren.length,
    childCount: allChildren.length,
    childRefs: childOrderKeys,
    childCodes,
    groups: groups.map((group, index) => ({ key: group.key, masterCode: masterOrders[index].code, childCount: group.children.length }))
  });
  return { masterOrder: masterOrdersWithChildren[0], masterOrders: masterOrdersWithChildren };
}

async function updateMasterOrder(id, body = {}) {
  const current = await masterOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const currentStatus = String(current.status || current.deliveryStatus || '').toLowerCase();
  if (['cancelled', 'canceled', 'void', 'deleted'].includes(currentStatus)) {
    return { error: 'Đơn tổng đã hủy/xóa, không thể cập nhật', status: 400 };
  }
  if (currentStatus === 'delivered' || currentStatus === 'completed' || current.accountingConfirmed === true || current.accountingStatus === 'confirmed') {
    return { error: 'Đơn tổng đã giao hoặc đã xác nhận kế toán, không thể sửa', status: 400 };
  }

  const deliveryStaff = await resolveStaff(body, 'delivery');
  const masterOrderDate = dateUtil.toDateOnly(current.masterOrderDate || current.createdDate || current.createdAt || dateUtil.todayVN());
  const deliveryDate = dateUtil.toDateOnly(body.deliveryDate || current.deliveryDate || body.date || current.date || dateUtil.nextDeliveryDateVN(masterOrderDate));

  // MASTER_ORDER_EDIT_MODAL_PATCH_START: cập nhật an toàn thông tin + danh sách đơn con, không chạm công nợ/tồn kho/kế toán
  const currentChildren = await orderService.getMasterChildren(current);

  let children = currentChildren;
  const hasRequestedChildren = Array.isArray(body.childOrderIds);
  if (hasRequestedChildren) {
    const requestedChildIds = normalizeChildOrderRefsInput(body.childOrderIds || []);
    if (!requestedChildIds.length) return { error: 'Đơn tổng phải có ít nhất 1 đơn con', status: 400 };
    const resolved = await resolveRequestedChildOrders(requestedChildIds, { currentMaster: current });
    debugLog('DEBUG_ORDER_FLOW', '[UPDATE_MASTER_ORDER_VALIDATE]', {
      master: current.code || current.id,
      requestedCount: requestedChildIds.length,
      normalizedRefs: requestedChildIds,
      foundCount: resolved.children.length,
      invalid: resolved.invalid
    });
    if (resolved.invalid.length) {
      return { error: `Một số đơn con không hợp lệ: ${invalidChildOrderMessage(resolved.invalid)}`, status: 400 };
    }
    children = resolved.children;
  }

  const updated = {
    ...current,
    ...body,
    date: dateUtil.toDateOnly(body.date || current.date || deliveryDate),
    masterOrderDate,
    deliveryDate,
    routeName: String(body.routeName ?? current.routeName ?? '').trim(),
    note: String(body.note ?? body.deliveryNote ?? current.note ?? current.deliveryNote ?? '').trim(),
    deliveryNote: String(body.deliveryNote ?? body.note ?? current.deliveryNote ?? current.note ?? '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || current.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || current.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || current.deliveryStaffName || '',
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_MASTER_UPDATE_ONLY_NVGH_START =====
    // Khi sửa đơn tổng chỉ cập nhật NVGH/ngày giao/route; không ghi đè NVBH.
    salesStaffId: current.salesStaffId || '',
    salesStaffCode: current.salesStaffCode || '',
    salesStaffName: current.salesStaffName || '',
    ...canonicalMasterChildReferencePatch(children),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_MASTER_UPDATE_ONLY_NVGH_END =====
    updatedAt: dateUtil.nowIso()
  };

  const summary = orderService.summarizeOrders(children);
  Object.assign(updated, summary);

  const childOrderKeys = childOrderKeySet(children);
  const childCodes = childOrderCodes(children);
  const nextChildKeys = new Set(childOrderKeys);
  const removedChildren = hasRequestedChildren ? (currentChildren || []).filter((child) => {
    const keys = childOrderIdentityKeys(child);
    return keys.length && !keys.some((key) => nextChildKeys.has(key));
  }) : [];
  const removedChildKeys = childOrderKeySet(removedChildren);
  const removedChildCodes = childOrderCodes(removedChildren);
  const now = dateUtil.nowIso();

  const lockedRemovedChild = removedChildren.find(hasDeliveryOperationalData);
  if (lockedRemovedChild) {
    return {
      error: `Đơn con ${lockedRemovedChild.code || lockedRemovedChild.id} đã phát sinh giao hàng/thu tiền/trả hàng hoặc xác nhận kế toán, không thể bỏ khỏi đơn tổng. Cần hoàn tác nghiệp vụ trước.`,
      status: 409
    };
  }

  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(updated, { session });

    if (children.length) {
      await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
        updateOne: {
          filter: { $or: [
            { id: child.id },
            { code: child.code },
            { documentCode: child.documentCode },
            { orderCode: child.orderCode },
            { salesOrderCode: child.salesOrderCode }
          ].filter((item) => Object.values(item)[0]) },
          update: { $set: {
            masterOrderId: updated.id,
            masterOrderCode: updated.code,
            mergeStatus: 'merged',
            status: child.status || 'assigned',
            deliveryDate: updated.deliveryDate,
            deliveryStaffId: updated.deliveryStaffId,
            deliveryStaffCode: updated.deliveryStaffCode,
            deliveryStaffName: updated.deliveryStaffName,
            routeName: updated.routeName,
            deliveryRoute: updated.routeName,
            updatedAt: now
          } }
        }
      })), { ordered: false, session });
    }

    if (removedChildren.length) {
      await MongoStore.salesOrders.bulkWrite(removedChildren.map((child) => ({
        updateOne: {
          filter: { $or: [
            { id: child.id },
            { code: child.code },
            { documentCode: child.documentCode },
            { orderCode: child.orderCode },
            { salesOrderCode: child.salesOrderCode }
          ].filter((item) => Object.values(item)[0]) },
          update: buildDetachedSalesOrderMongoUpdate(now)
        }
      })), { ordered: false, session });
    }

    if (childOrderKeys.length || childCodes.length) {
      await MongoStore.returnOrders.updateMany(
        {
          $or: [
            { salesOrderId: { $in: childOrderKeys } },
            { orderId: { $in: childOrderKeys } },
            { sourceOrderId: { $in: childOrderKeys } },
            { deliveryOrderId: { $in: childOrderKeys } },
            { salesOrderCode: { $in: childCodes } },
            { orderCode: { $in: childCodes } },
            { sourceOrderCode: { $in: childCodes } },
            { deliveryOrderCode: { $in: childCodes } }
          ],
          status: { $nin: ['posted', 'confirmed', 'cancelled', 'canceled', 'void', 'deleted', 'duplicate_cancelled'] }
        },
        {
          $set: {
            masterOrderId: updated.id,
            masterOrderCode: updated.code,
            deliveryStaffId: updated.deliveryStaffId,
            deliveryStaffCode: updated.deliveryStaffCode,
            deliveryStaffName: updated.deliveryStaffName,
            deliveryDate: updated.deliveryDate,
            routeName: updated.routeName,
            updatedAt: now
          }
        },
        { session }
      );
    }

    if (removedChildKeys.length || removedChildCodes.length) {
      await returnOrderService.detachMasterOrderFromReturnDrafts(removedChildren, {
        session,
        expectedMasterOrderId: current.id,
        expectedMasterOrderCode: current.code
      });
    }
  });
  const updatedChildren = await orderService.getMasterChildren(updated);
  return { masterOrder: toClient(updated, updatedChildren) };
  // MASTER_ORDER_EDIT_MODAL_PATCH_END
}

async function cancelMasterOrder(id, body = {}) {
  const masterOrder = await masterOrderRepository.findByIdOrCode(id);
  if (!masterOrder) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const status = String(masterOrder.status || masterOrder.deliveryStatus || '').toLowerCase();
  if (status === 'delivered' || status === 'completed' || masterOrder.accountingConfirmed === true || masterOrder.accountingStatus === 'confirmed') {
    return { error: 'Đơn tổng đã giao hoặc đã xác nhận kế toán, không thể huỷ', status: 400 };
  }
  const children = await orderService.getMasterChildren(masterOrder);
  const cancelled = {
    ...masterOrder,
    status: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  const now = dateUtil.nowIso();
  await withMongoTransaction(async (session) => {
    if (children.length) {
      await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
        updateOne: {
          filter: { $or: [
            { id: child.id },
            { code: child.code },
            { documentCode: child.documentCode },
            { orderCode: child.orderCode },
            { salesOrderCode: child.salesOrderCode }
          ].filter((item) => Object.values(item)[0]) },
          update: buildDetachedSalesOrderMongoUpdate(now)
        }
      })), { ordered: false, session });

      await returnOrderService.detachMasterOrderFromReturnDrafts(children, {
        session,
        expectedMasterOrderId: masterOrder.id,
        expectedMasterOrderCode: masterOrder.code
      });
    }
    await masterOrderRepository.upsert(cancelled, { session });
  });
  return { masterOrder: toClient(cancelled, []) };
}

async function deleteMasterOrder(id, body = {}) {
  const current = await masterOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng', status: 404 };
  const children = await orderService.getMasterChildren(current);
  const removed = {
    ...current,
    status: 'void',
    deletedAt: dateUtil.nowIso(),
    deleteReason: String(body.reason || body.deleteReason || '').trim(),
    updatedAt: dateUtil.nowIso()
  };
  const now = dateUtil.nowIso();
  await withMongoTransaction(async (session) => {
    if (children.length) {
      await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
        updateOne: {
          filter: { $or: [
            { id: child.id },
            { code: child.code },
            { documentCode: child.documentCode },
            { orderCode: child.orderCode },
            { salesOrderCode: child.salesOrderCode }
          ].filter((item) => Object.values(item)[0]) },
          update: buildDetachedSalesOrderMongoUpdate(now)
        }
      })), { ordered: false, session });

      await returnOrderService.detachMasterOrderFromReturnDrafts(children, {
        session,
        expectedMasterOrderId: current.id,
        expectedMasterOrderCode: current.code
      });
    }
    await masterOrderRepository.upsert(removed, { session });
  });

  return { masterOrder: toClient(removed, []) };
}

module.exports = {
  buildUnclaimedChildOrderFilter,
  createMasterOrder,
  updateMasterOrder,
  cancelMasterOrder,
  deleteMasterOrder
};