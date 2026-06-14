'use strict';

const SalesOrder = require('../../models/SalesOrder');
const MasterOrder = require('../../models/MasterOrder');
const ArLedger = require('../../models/ArLedger');

const ACTIVE_STATUS_FILTER = {
  $nin: ['cancelled', 'canceled', 'void', 'deleted']
};

function text(value) {
  return String(value || '').trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function createMobileDeliveryRepository(ctx = {}) {
  async function persistDeliverySnapshotSafely(data = {}) {
    if (!data || typeof ctx.persistPrimaryDataSnapshot !== 'function') return null;
    const snapshot = { ...data };
    delete snapshot.returnOrders;
    return ctx.persistPrimaryDataSnapshot(snapshot);
  }

  async function findAssignedMasterOrders({ deliveryDate, deliveryStaffCode, limit = 200 } = {}) {
    const staffCode = text(deliveryStaffCode);
    const date = text(deliveryDate);
    if (!staffCode || !date) return [];

    return MasterOrder.find({
      status: ACTIVE_STATUS_FILTER,
      deliveryDate: date,
      $or: [
        { deliveryStaffCode: staffCode },
        // Rollout compatibility; canonical migration removes these aliases.
        { deliveryCode: staffCode },
        { nvghCode: staffCode },
        { shipperCode: staffCode }
      ]
    })
      .select('id code deliveryDate deliveryStaffCode deliveryStaffName status routeName childOrderIds orderIds salesOrderIds createdAt updatedAt')
      .sort({ deliveryDate: 1, createdAt: 1 })
      .limit(Math.min(Math.max(Number(limit || 200), 1), 500))
      .lean();
  }

  async function findDeliveryOrders({
    deliveryDate,
    deliveryStaffCode,
    masterOrders = [],
    includeCompleted = false,
    limit = 200
  } = {}) {
    const staffCode = text(deliveryStaffCode);
    const date = text(deliveryDate);
    if (!staffCode || !date) return [];

    const masterIds = unique(masterOrders.flatMap((row) => [row.id, row._id, row.code]));
    const childIds = unique(masterOrders.flatMap((row) => [
      ...(Array.isArray(row.childOrderIds) ? row.childOrderIds : []),
      ...(Array.isArray(row.orderIds) ? row.orderIds : []),
      ...(Array.isArray(row.salesOrderIds) ? row.salesOrderIds : [])
    ]));

    const assignment = [
      {
        deliveryDate: date,
        $or: [
          { deliveryStaffCode: staffCode },
          // Rollout compatibility; canonical migration removes these aliases.
          { deliveryCode: staffCode },
          { nvghCode: staffCode },
          { shipperCode: staffCode }
        ]
      }
    ];

    if (masterIds.length) {
      assignment.push({ masterOrderId: { $in: masterIds } });
      assignment.push({ masterOrderCode: { $in: masterIds } });
    }
    if (childIds.length) {
      assignment.push({ id: { $in: childIds } });
      assignment.push({ code: { $in: childIds } });
      assignment.push({ orderCode: { $in: childIds } });
      assignment.push({ salesOrderCode: { $in: childIds } });
    }

    const filter = {
      status: ACTIVE_STATUS_FILTER,
      lifecycleStatus: ACTIVE_STATUS_FILTER,
      deleted: { $ne: true },
      isDeleted: { $ne: true },
      $or: assignment
    };

    if (!includeCompleted) {
      filter.deliveryStatus = {
        $nin: ['completed', 'delivered', 'done', 'cancelled', 'canceled', 'void']
      };
    }

    return SalesOrder.find(filter)
      .sort({ routeName: 1, createdAt: 1, code: 1 })
      .limit(Math.min(Math.max(Number(limit || 200), 1), 500))
      .lean();
  }

  async function findArLedgersForOrders(orders = []) {
    const ids = unique(orders.flatMap((row) => [row.id, row._id, row.orderId, row.salesOrderId]));
    const codes = unique(orders.flatMap((row) => [row.code, row.orderCode, row.salesOrderCode]));
    const or = [];
    if (ids.length) {
      or.push({ orderId: { $in: ids } });
      or.push({ salesOrderId: { $in: ids } });
      or.push({ refId: { $in: ids } });
    }
    if (codes.length) {
      or.push({ orderCode: { $in: codes } });
      or.push({ salesOrderCode: { $in: codes } });
      or.push({ refCode: { $in: codes } });
    }
    if (!or.length) return [];

    return ArLedger.find({
      status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
      reversed: { $ne: true },
      $or: or
    })
      .select('id code type orderId orderCode salesOrderId salesOrderCode refId refCode debit credit amount status reversed')
      .lean();
  }

  return {
    persistPrimaryDataSnapshot: ctx.persistPrimaryDataSnapshot,
    persistDeliverySnapshotSafely,
    findAssignedMasterOrders,
    findDeliveryOrders,
    findArLedgersForOrders
  };
}

module.exports = {
  createMobileDeliveryRepository,
  _internal: { ACTIVE_STATUS_FILTER, unique }
};
