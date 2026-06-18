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
  canonicalMasterChildReferencePatch
} = require('../../utils/masterOrderAssignment.util');

const buildMasterOrderCode = lazyFunction('./masterOrderQuery.impl', 'buildMasterOrderCode');
const resolveStaff = lazyFunction('./masterOrderQuery.impl', 'resolveStaff');
const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const toClient = lazyFunction('./masterOrderQuery.impl', 'toClient');

function buildUnclaimedChildOrderFilter(child = {}) {
  const identity = [
    child.id ? { id: child.id } : null,
    child.code ? { code: child.code } : null,
    child.documentCode ? { documentCode: child.documentCode } : null,
    child.orderCode ? { orderCode: child.orderCode } : null,
    child.salesOrderCode ? { salesOrderCode: child.salesOrderCode } : null
  ].filter(Boolean);
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
      { mergeStatus: { $ne: 'merged' } },
      { status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] } }
    ]
  };
}

async function createMasterOrder(body = {}) {
  const startedAt = Date.now();
  const childIds = [...new Set((Array.isArray(body.childOrderIds) ? body.childOrderIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!childIds.length) return { error: 'Chưa chọn đơn con để gộp', status: 400 };

  // Tăng tốc gộp đơn: chỉ query đúng các đơn được tick, không load toàn bộ orders.
  const children = (await orderRepository.findManyByIdentity(childIds))
    .filter((order) => !isInactiveStatus(order));
  const foundKeys = new Set(children.flatMap((order) => [order.id, order.code, order.documentCode, order.orderCode, order.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
  const missingIds = childIds.filter((id) => !foundKeys.has(id));
  if (missingIds.length || children.length !== childIds.length) {
    return { error: `Một số đơn con không tồn tại hoặc đã bị hủy/xóa: ${missingIds.join(', ')}`, status: 400 };
  }
  if (children.some((order) => order.masterOrderId || order.masterOrderCode || (order.mergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có đơn con đã được gộp trước đó', status: 400 };
  }

  const deliveryStaff = await resolveStaff(body, 'delivery');
  const masterOrderDate = dateUtil.todayVN();
  const deliveryDate = dateUtil.toDateOnly(body.deliveryDate || body.date || dateUtil.nextDeliveryDateVN(masterOrderDate));
  const masterOrder = {
    ...body,
    id: String(body.id || makeId('MO')).trim(),
    // Không quét toàn bộ master_orders để sinh mã vì thao tác này rất chậm khi dữ liệu lớn.
    code: String(body.code || makeId('DT')).trim(),
    date: dateUtil.toDateOnly(body.date || deliveryDate),
    masterOrderDate,
    deliveryDate,
    routeName: String(body.routeName || '').trim(),
    note: String(body.note || body.deliveryNote || '').trim(),
    deliveryNote: String(body.deliveryNote || body.note || '').trim(),
    deliveryStaffId: deliveryStaff?.id || body.deliveryStaffId || '',
    deliveryStaffCode: deliveryStaff?.code || body.deliveryStaffCode || '',
    deliveryStaffName: deliveryStaff?.name || body.deliveryStaffName || '',
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_MASTER_ONLY_NVGH_START =====
    // Đơn tổng chỉ là nguồn gán NVGH. Không nhận/ghi đè NVBH của đơn con.
    ...canonicalMasterChildReferencePatch(children),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_MASTER_ONLY_NVGH_END =====
    status: body.status || 'assigned',
    ...orderService.summarizeOrders(children),
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };

  const childOrderKeys = [...new Set(children.flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)))];
  const childCodes = [...new Set(children.map((child) => String(child.code || child.orderCode || child.salesOrderCode || '').trim()).filter(Boolean))];
  const now = dateUtil.nowIso();

  await withMongoTransaction(async (session) => {
    await masterOrderRepository.upsert(masterOrder, { session });

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

    const claimResult = await MongoStore.salesOrders.bulkWrite(children.map((child) => ({
      updateOne: {
        filter: buildUnclaimedChildOrderFilter(child),
        update: { $set: { ...setPatch, deliveryStatus: child.deliveryStatus || 'pending' } }
      }
    })), { ordered: true, session });

    const claimedCount = Number(
      claimResult.matchedCount ??
      claimResult.nMatched ??
      claimResult.result?.nMatched ??
      claimResult.modifiedCount ??
      0
    );
    if (claimedCount !== children.length) {
      const error = new Error('Một hoặc nhiều đơn đã được gộp bởi thao tác khác');
      error.code = 'CHILD_ORDER_ALREADY_CLAIMED';
      error.status = 409;
      throw error;
    }

    // Sync returnOrders bằng một lệnh bulk, không gọi từng đơn trong vòng lặp.
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

  const updatedChildren = await orderService.getMasterChildren(masterOrder);
  debugLog('DEBUG_ORDER_FLOW', '[CREATE_MASTER_ORDER_DONE]', { ms: Date.now() - startedAt, code: masterOrder.code, childCount: children.length });
  return { masterOrder: toClient(masterOrder, updatedChildren) };
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
  const currentChildIds = new Set((currentChildren || []).flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)));

  let children = currentChildren;
  const hasRequestedChildren = Array.isArray(body.childOrderIds);
  if (hasRequestedChildren) {
    const requestedChildIds = [...new Set((body.childOrderIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    if (!requestedChildIds.length) return { error: 'Đơn tổng phải có ít nhất 1 đơn con', status: 400 };
    const requestedChildren = (await orderRepository.findManyByIdentity(requestedChildIds)).filter((order) => !isInactiveStatus(order));
    const foundKeys = new Set(requestedChildren.flatMap((order) => [order.id, order.code, order.documentCode, order.orderCode, order.salesOrderCode]
      .map((value) => String(value || '').trim())
      .filter(Boolean)));
    const missingIds = requestedChildIds.filter((key) => !foundKeys.has(key));
    if (missingIds.length || requestedChildren.length !== requestedChildIds.length) {
      return { error: `Một số đơn con không tồn tại hoặc đã bị hủy/xóa: ${missingIds.join(', ')}`, status: 400 };
    }
    const conflict = requestedChildren.find((child) => {
      const masterId = String(child.masterOrderId || '').trim();
      const masterCode = String(child.masterOrderCode || '').trim();
      const isCurrent = masterId === String(current.id || '').trim() || masterId === String(current.code || '').trim()
        || masterCode === String(current.id || '').trim() || masterCode === String(current.code || '').trim();
      return (masterId || masterCode || String(child.mergeStatus || '').toLowerCase() === 'merged') && !isCurrent;
    });
    if (conflict) return { error: `Đơn con ${conflict.code || conflict.id} đã thuộc đơn tổng khác`, status: 400 };
    children = requestedChildren;
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

  const childOrderKeys = [...new Set((children || []).flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)))];
  const childCodes = [...new Set((children || []).map((child) => String(child.code || child.orderCode || child.salesOrderCode || '').trim()).filter(Boolean))];
  const nextChildKeys = new Set(childOrderKeys);
  const removedChildren = hasRequestedChildren ? (currentChildren || []).filter((child) => {
    const keys = [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode].map((value) => String(value || '').trim()).filter(Boolean);
    return keys.length && !keys.some((key) => nextChildKeys.has(key));
  }) : [];
  const removedChildKeys = [...new Set(removedChildren.flatMap((child) => [child.id, child.code, child.documentCode, child.orderCode, child.salesOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean)))];
  const removedChildCodes = [...new Set(removedChildren.map((child) => String(child.code || child.orderCode || child.salesOrderCode || '').trim()).filter(Boolean))];
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