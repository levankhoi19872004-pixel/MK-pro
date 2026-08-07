'use strict';

const TARGET_DATE = '2026-08-06';
const TARGET_DELIVERY = 'D02';
const TARGET_SALES = 'S03';

function pad(value, length = 5) {
  return String(value).padStart(length, '0');
}

function buildPerfA3aFixture(size = 10000) {
  const orders = [];
  const masterOrders = [];
  const versions = [];
  const allocations = [];
  const returns = [];
  const dateKeys = ['2026-08-06', '2026-08-05', '2026-08-04', '2026-07-31', '2026-07-15'];

  for (let index = 0; index < size; index += 1) {
    const code = `SO-${pad(index)}`;
    const dateKey = dateKeys[index % dateKeys.length];
    const deliveryCode = `D0${Math.floor(index / 5) % 5}`;
    const salesCode = `S0${Math.floor(index / 3) % 7}`;
    const customerCode = `C-${pad(index % 700, 4)}`;
    const legacyMode = Math.floor(index / 5) % 10;
    const createdAt = `2026-08-${String(6 - (index % 5)).padStart(2, '0')}T${String(23 - (index % 20)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`;
    const base = {
      _id: `mongo-${pad(index)}`,
      id: code,
      code,
      orderCode: code,
      salesOrderCode: code,
      customerCode,
      customerName: `Khách ${index % 700}`,
      salesStaffCode: salesCode,
      salesStaffName: `NVBH ${salesCode}`,
      deliveryStaffCode: deliveryCode,
      deliveryStaffName: `NVGH ${deliveryCode}`,
      deliveryDateKey: dateKey,
      deliveryDate: dateKey,
      createdAt,
      updatedAt: createdAt,
      totalAmount: index % 29 === 0 ? 0 : 100000 + index,
      status: index % 19 === 0 ? 'legacy_delivered' : 'delivered',
      deleted: false,
      isDeleted: false,
      deleteMode: '',
      items: [{ productCode: `P-${index % 20}`, qty: 1, salePrice: 100000 + index }]
    };

    if (legacyMode === 1) {
      delete base.deliveryDateKey;
      base.deliveryDate = `${dateKey}T08:30:00.000Z`;
    } else if (legacyMode === 2) {
      delete base.deliveryDateKey;
      const [y, m, d] = dateKey.split('-');
      base.deliveryDate = `${d}/${m}/${y}`;
    } else if (legacyMode === 3) {
      delete base.deliveryDateKey;
      base.deliveryDate = new Date(`${dateKey}T00:00:00.000Z`);
    } else if (legacyMode === 4) {
      delete base.salesStaffCode;
      base.salesmanCode = salesCode;
      base.nvbhCode = salesCode;
    } else if (legacyMode === 5) {
      delete base.deliveryStaffCode;
      base.deliveryCode = deliveryCode;
      base.nvghCode = deliveryCode;
    } else if (legacyMode === 6) {
      delete base.deliveryStaffCode;
      delete base.deliveryStaffName;
      const masterCode = `MO-${pad(index)}`;
      base.masterOrderCode = masterCode;
      masterOrders.push({
        _id: `master-${pad(index)}`,
        id: masterCode,
        code: masterCode,
        masterOrderCode: masterCode,
        childOrderCodes: [code],
        deliveryStaffCode: deliveryCode,
        deliveryStaffName: `NVGH ${deliveryCode}`,
        status: 'assigned',
        deliveryDateKey: dateKey,
        deliveryDate: dateKey,
        updatedAt: createdAt,
        createdAt,
        deleted: false,
        isDeleted: false
      });
    } else if (legacyMode === 7) {
      // Version mismatch: latest closeout is 3 but allocation only exists for 2.
      base.accountingConfirmed = true;
    } else if (legacyMode === 8) {
      // Duplicate identity alias remains deterministic and must dedupe to one order.
      base.sourceCode = code;
      base.documentCode = code;
    } else if (legacyMode === 9) {
      // Null/NaN inputs exercise canonical money guards.
      base.cashAmount = null;
      base.bankAmount = 'NaN';
    }

    orders.push(base);

    const historyCount = 1 + (index % 6);
    for (let version = 1; version <= historyCount; version += 1) {
      versions.push({
        _id: `ver-${index}-${version}`,
        id: `VER-${index}-${version}`,
        salesOrderId: code,
        salesOrderCode: code,
        orderId: code,
        orderCode: code,
        closeoutVersion: version,
        sourceVersion: version,
        version,
        status: 'active',
        active: true,
        originalAmount: base.totalAmount,
        cashAmount: version === historyCount ? (index % 29 === 0 ? 0 : 1000 * version) : 100 * version,
        bankAmount: 0,
        rewardAmount: 0,
        offsetAmount: 0,
        returnedAmount: index % 13 === 0 ? 2500 : 0,
        finalDebtAmount: Math.max(0, Number(base.totalAmount || 0) - (1000 * version)),
        createdAt: `2026-08-06T00:${String(version).padStart(2, '0')}:00.000Z`,
        updatedAt: `2026-08-06T00:${String(version).padStart(2, '0')}:00.000Z`
      });
      allocations.push({
        _id: `alloc-${index}-${version}`,
        id: `ALLOC-${index}-${version}`,
        allocationCode: `ALLOC-${index}-${version}`,
        orderId: code,
        orderCode: code,
        sourceId: code,
        sourceCode: code,
        sourceVersion: (legacyMode === 7 && version === historyCount) ? Math.max(1, version - 1) : version,
        version: (legacyMode === 7 && version === historyCount) ? Math.max(1, version - 1) : version,
        status: 'posted',
        active: true,
        receivableAmount: base.totalAmount,
        cashAmount: version === historyCount ? (index % 29 === 0 ? 0 : 1000 * version) : 100 * version,
        bankAmount: 0,
        rewardAmount: 0,
        offsetAmount: 0,
        returnAmount: index % 13 === 0 ? 2500 : 0,
        debtAmount: Math.max(0, Number(base.totalAmount || 0) - (1000 * version)),
        postedAt: `2026-08-06T00:${String(version).padStart(2, '0')}:30.000Z`,
        createdAt: `2026-08-06T00:${String(version).padStart(2, '0')}:00.000Z`,
        updatedAt: `2026-08-06T00:${String(version).padStart(2, '0')}:00.000Z`
      });
    }

    if (index % 13 === 0) {
      returns.push({
        _id: `ret-${index}`,
        id: `RET-${index}`,
        orderId: code,
        orderCode: code,
        salesOrderId: code,
        salesOrderCode: code,
        returnState: 'received',
        status: 'received',
        totalReturnAmount: index % 26 === 0 ? 0 : 2500,
        createdAt,
        updatedAt: createdAt,
        deleted: false,
        isDeleted: false
      });
    }
  }

  return {
    seed: 'PERF-A3A-FIXTURE-V1',
    size,
    target: { date: TARGET_DATE, deliveryStaffCode: TARGET_DELIVERY, salesStaffCode: TARGET_SALES },
    orders,
    masterOrders,
    versions,
    allocations,
    returns
  };
}

module.exports = { buildPerfA3aFixture, TARGET_DATE, TARGET_DELIVERY, TARGET_SALES };
