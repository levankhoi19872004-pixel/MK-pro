'use strict';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function searchFields(row = {}) {
  const orderCode = normalize(row.orderCode || row.code || row.id);
  const customerCode = normalize(row.customerCode);
  const customerName = normalize(row.customerName);
  const phone = String(row.customerPhone || row.phone || '').replace(/\D/g, '');
  const address = normalize(row.customerAddress || row.address || row.deliveryAddress);
  const sales = normalize(row.salesStaffCode || row.salesmanCode || row.nvbhCode);
  const delivery = normalize(row.deliveryStaffCode || row.deliveryCode || row.nvghCode);
  const tokens = [...new Set([orderCode, customerCode, customerName, phone, address, sales, delivery]
    .join(' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 32))];
  return {
    suggestOrderCodeNorm: orderCode,
    suggestCustomerCodeNorm: customerCode,
    suggestCustomerNameNorm: customerName,
    suggestCustomerPhoneNorm: phone,
    suggestCustomerAddressNorm: address,
    suggestSalesStaffCodeNorm: sales,
    suggestDeliveryStaffCodeNorm: delivery,
    suggestSearchTokens: tokens,
    suggestSearchVersion: 1
  };
}

function row(index, overrides = {}) {
  const day = index % 4 === 0 ? '2026-08-06' : `2026-08-${String((index % 20) + 1).padStart(2, '0')}`;
  const base = {
    _id: `order-${String(index).padStart(5, '0')}`,
    id: `SO-${String(index).padStart(5, '0')}`,
    code: `SO-${String(index).padStart(5, '0')}`,
    orderCode: `SO-${String(index).padStart(5, '0')}`,
    deliveryDateKey: day,
    deliveryDate: day,
    customerCode: `C${String(index % 1700).padStart(5, '0')}`,
    customerName: `Cửa hàng số ${index % 1700}`,
    customerPhone: `09${String(10000000 + (index % 89999999)).slice(-8)}`,
    customerAddress: `${(index % 300) + 1} Đường Kinh Doanh`,
    salesStaffCode: `S${String((index % 8) + 1).padStart(2, '0')}`,
    salesStaffName: `Nhân viên bán hàng ${(index % 8) + 1}`,
    deliveryStaffCode: `D${String((index % 5) + 1).padStart(2, '0')}`,
    deliveryStaffName: `Nhân viên giao hàng ${(index % 5) + 1}`,
    createdAt: `2026-08-06T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    deleted: false,
    isDeleted: false,
    status: index % 13 === 0 ? 'legacy_delivered' : 'delivered'
  };
  const merged = { ...base, ...overrides };
  return { ...merged, ...searchFields(merged) };
}

function buildPerfA3bFixture(size = 10000) {
  const orders = Array.from({ length: size }, (_, index) => row(index));
  const special = [
    row(0, { orderCode: 'SO-EXACT-001', code: 'SO-EXACT-001', customerCode: 'KH-EXACT', customerName: 'Cửa hàng Nguyễn Ánh', customerPhone: '0912345678', customerAddress: '12 Đường Lê Lợi', salesStaffCode: 'S01', deliveryStaffCode: 'D01', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    row(1, { orderCode: 'SO-PREFIX-001', code: 'SO-PREFIX-001', customerCode: 'KH-EXACT-02', customerName: 'Nguyễn Anh Mart', customerPhone: '0912340000', customerAddress: '18 Lê Lợi', salesStaffCode: 'S01', deliveryStaffCode: 'D01', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    row(2, { orderCode: 'SO-DUP-001', code: 'SO-DUP-001', customerCode: 'KH-DUP', customerName: 'Cửa hàng Trùng', customerPhone: '0988000001', customerAddress: '1 Phố Trùng', salesStaffCode: 'S01', deliveryStaffCode: 'D01', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    row(3, { orderCode: 'SO-DUP-002', code: 'SO-DUP-002', customerCode: 'KH-DUP', customerName: 'Cửa hàng Trùng', customerPhone: '0988000001', customerAddress: '1 Phố Trùng', salesStaffCode: 'S01', deliveryStaffCode: 'D01', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    row(4, { orderCode: 'SO-OUTSIDE', code: 'SO-OUTSIDE', customerCode: 'KH-OUTSIDE', customerName: 'Cửa hàng Nguyễn Ánh ngoài phạm vi', customerPhone: '0912349999', customerAddress: '99 Đường Lê Lợi', salesStaffCode: 'S99', deliveryStaffCode: 'D99', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    row(5, { orderCode: 'SO-LEGACY', code: 'SO-LEGACY', customerCode: 'KH-LEGACY', customerName: 'Đại lý Legacy', customerPhone: '0909123456', customerAddress: '5 Đường Cũ', salesStaffCode: '', deliveryStaffCode: '', salesmanCode: 'S01', nvghCode: 'D01', deliveryDateKey: '2026-08-06', deliveryDate: '2026-08-06' }),
    { ...row(6, { orderCode: 'SO-LEGACY-DATE', code: 'SO-LEGACY-DATE', customerCode: 'KH-LEGACY-DATE', customerName: 'Đại lý ngày cũ', customerPhone: '0909000006', customerAddress: '6 Đường Cũ', salesStaffCode: '', deliveryStaffCode: '', salesmanCode: 'S01', nvghCode: 'D01', deliveryDateKey: '', deliveryDate: '06/08/2026' }), suggestSearchVersion: 0 }
  ];
  special.forEach((item, index) => { orders[index] = item; });
  return {
    seed: 'PERF-A3B-FIXTURE-V1',
    orders,
    targetScope: { deliveryDate: '2026-08-06', salesStaffCode: 'S01', deliveryStaffCode: 'D01' },
    cases: {
      exactCustomerCode: 'KH-EXACT',
      prefixCustomerCode: 'KH-EX',
      accentedName: 'Nguyễn Ánh',
      unaccentedName: 'nguyen anh',
      phone: '091234',
      address: 'le loi',
      salesStaffCode: 'S01',
      deliveryStaffCode: 'D01',
      oneCharacter: 'n',
      commonKeyword: 'cua hang',
      outsideScopeCustomer: 'KH-OUTSIDE',
      duplicateCustomer: 'KH-DUP',
      legacyAliasCustomer: 'KH-LEGACY',
      legacyDateCustomer: 'KH-LEGACY-DATE'
    }
  };
}

module.exports = { buildPerfA3bFixture, normalize, searchFields };
