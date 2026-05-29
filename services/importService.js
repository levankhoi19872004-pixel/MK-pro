function makeId(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '').replace(/\./g, '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned || 0);
  return Number.isFinite(number) ? number : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function get(row, names) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const wanted = normalizeText(name);
    const key = keys.find((k) => normalizeText(k) === wanted);
    if (key) return row[key];
  }
  return '';
}

function text(row, names) {
  return String(get(row, names) || '').trim();
}

function number(row, names) {
  return toNumber(get(row, names));
}

function rowBase(row) {
  return { rowNo: row.__rowNo || '' };
}

function findProduct(data, value) {
  const v = normalizeText(value);
  return (data.products || []).find((p) => normalizeText(p.id) === v || normalizeText(p.code) === v || normalizeText(p.name) === v || normalizeText(p.barcode) === v);
}

function findCustomer(data, value) {
  const v = normalizeText(value);
  return (data.customers || []).find((c) => normalizeText(c.id) === v || normalizeText(c.code) === v || normalizeText(c.name) === v || normalizeText(c.phone) === v);
}

function findStockRow(data, product) {
  return (data.stock || []).find((row) => normalizeText(row.productId) === normalizeText(product.id) || normalizeText(row.productCode) === normalizeText(product.code));
}

function upsertStock(data, item, mode = 'add') {
  if (!Array.isArray(data.stock)) data.stock = [];
  let stockRow = data.stock.find((row) => normalizeText(row.productId) === normalizeText(item.productId) || normalizeText(row.productCode) === normalizeText(item.productCode));
  if (!stockRow) {
    stockRow = { productId: item.productId, productCode: item.productCode, productName: item.productName, unit: item.unit, quantity: 0, updatedAt: new Date().toISOString() };
    data.stock.push(stockRow);
  }
  stockRow.productId = item.productId;
  stockRow.productCode = item.productCode;
  stockRow.productName = item.productName;
  stockRow.unit = item.unit;
  stockRow.quantity = mode === 'set' ? toNumber(item.quantity) : toNumber(stockRow.quantity) + toNumber(item.quantity);
  stockRow.updatedAt = new Date().toISOString();
  return stockRow;
}

function reduceStock(data, item) {
  const stockRow = findStockRow(data, item);
  if (!stockRow) return null;
  stockRow.quantity = toNumber(stockRow.quantity) - toNumber(item.quantity);
  stockRow.updatedAt = new Date().toISOString();
  return stockRow;
}

function buildImportCode(data) {
  return `PN${((data.importOrders || []).length + 1).toString().padStart(5, '0')}`;
}

function buildSalesCode(data) {
  return `BH${((data.salesOrders || []).length + 1).toString().padStart(5, '0')}`;
}

function buildCashCode(data, type) {
  const prefix = type === 'out' ? 'PC' : 'PT';
  return `${prefix}${((data.cashbook || []).length + 1).toString().padStart(5, '0')}`;
}

function previewProducts(rows, data) {
  const existing = new Set((data.products || []).map((p) => normalizeText(p.code)));
  return rows.map((row) => {
    const item = {
      ...rowBase(row),
      code: text(row, ['code', 'mã', 'mã sản phẩm', 'ma san pham', 'productCode']),
      name: text(row, ['name', 'tên', 'tên sản phẩm', 'ten san pham', 'productName']),
      unit: text(row, ['unit', 'đvt', 'đơn vị', 'đơn vị tính', 'đơn vị bán', 'don vi ban']) || 'Cái',
      baseUnit: text(row, ['baseUnit', 'base unit', 'đơn vị gốc', 'don vi goc', 'đơn vị nhỏ nhất', 'don vi nho nhat']),
      conversionRate: number(row, ['conversionRate', 'conversion rate', 'quy đổi', 'quy doi', 'tỷ lệ', 'ty le', 'ratio']) || 1,
      packing: text(row, ['packing', 'quy cách', 'quy cach', 'quy cách đóng gói', 'quy cach dong goi']),
      barcode: text(row, ['barcode', 'mã vạch', 'ma vach']),
      category: text(row, ['category', 'nhóm', 'nhóm hàng', 'nganh hang']),
      costPrice: number(row, ['costPrice', 'giá nhập', 'gia nhap']),
      salePrice: number(row, ['salePrice', 'giá bán', 'gia ban']),
      minStock: number(row, ['minStock', 'tồn tối thiểu', 'ton toi thieu']),
      maxStock: number(row, ['maxStock', 'tồn tối đa', 'ton toi da']),
      isActive: true,
      errors: []
    };
    if (!item.code) item.errors.push('Thiếu mã sản phẩm');
    if (!item.name) item.errors.push('Thiếu tên sản phẩm');
    if (item.code && existing.has(normalizeText(item.code))) item.errors.push('Mã sản phẩm đã tồn tại');
    if (item.conversionRate < 1) item.errors.push('Quy đổi phải lớn hơn hoặc bằng 1');
    if (!item.packing && item.baseUnit && item.conversionRate > 1) item.packing = `1 ${item.unit} = ${item.conversionRate} ${item.baseUnit}`;
    if (item.costPrice < 0 || item.salePrice < 0) item.errors.push('Giá không được âm');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewCustomers(rows, data) {
  const existing = new Set((data.customers || []).map((c) => normalizeText(c.code)));
  return rows.map((row) => {
    const item = {
      ...rowBase(row),
      code: text(row, ['code', 'mã', 'mã khách hàng', 'ma khach hang', 'customerCode']),
      name: text(row, ['name', 'tên', 'tên khách hàng', 'ten khach hang', 'customerName']),
      phone: text(row, ['phone', 'sđt', 'sdt', 'số điện thoại']),
      address: text(row, ['address', 'địa chỉ', 'dia chi']),
      area: text(row, ['area', 'khu vực', 'khu vuc']),
      staffName: text(row, ['staffName', 'nhân viên', 'nv phụ trách', 'nhan vien']),
      isActive: true,
      errors: []
    };
    if (!item.code) item.errors.push('Thiếu mã khách hàng');
    if (!item.name) item.errors.push('Thiếu tên khách hàng');
    if (item.code && existing.has(normalizeText(item.code))) item.errors.push('Mã khách hàng đã tồn tại');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewOpeningStock(rows, data) {
  return rows.map((row) => {
    const productCode = text(row, ['productCode', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'code']);
    const product = findProduct(data, productCode);
    const quantity = number(row, ['quantity', 'qty', 'số lượng', 'so luong', 'số lượng tồn đầu', 'so luong ton dau', 'tồn kho ban đầu', 'ton kho ban dau', 'tồn đầu', 'ton dau', 'tồn', 'ton']);
    const item = { ...rowBase(row), productCode, productName: product ? product.name : '', quantity, errors: [] };
    if (!productCode) item.errors.push('Thiếu mã sản phẩm');
    if (!product) item.errors.push('Không tìm thấy sản phẩm');
    if (quantity < 0) item.errors.push('Tồn đầu không được âm');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewImportOrders(rows, data) {
  return rows.map((row) => {
    const productCode = text(row, ['productCode', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'code']);
    const product = findProduct(data, productCode);
    const quantity = number(row, ['quantity', 'số lượng', 'so luong', 'sl']);
    const costPrice = number(row, ['costPrice', 'giá nhập', 'gia nhap', 'đơn giá', 'don gia']);
    const item = {
      ...rowBase(row),
      documentCode: text(row, ['documentCode', 'mã phiếu', 'ma phieu', 'số phiếu']) || 'AUTO',
      date: text(row, ['date', 'ngày', 'ngay']) || today(),
      supplier: text(row, ['supplier', 'nhà cung cấp', 'nha cung cap']) || 'Import Excel',
      note: text(row, ['note', 'ghi chú', 'ghi chu']),
      productCode,
      productName: product ? product.name : '',
      quantity,
      costPrice,
      errors: []
    };
    if (!productCode) item.errors.push('Thiếu mã sản phẩm');
    if (!product) item.errors.push('Không tìm thấy sản phẩm');
    if (quantity <= 0) item.errors.push('Số lượng nhập phải lớn hơn 0');
    if (costPrice < 0) item.errors.push('Giá nhập không được âm');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewSalesOrders(rows, data) {
  return rows.map((row) => {
    const customerCode = text(row, ['customerCode', 'mã khách hàng', 'ma khach hang', 'mã khách']);
    const productCode = text(row, ['productCode', 'mã sản phẩm', 'ma san pham', 'mã hàng', 'code']);
    const customer = findCustomer(data, customerCode);
    const product = findProduct(data, productCode);
    const quantity = number(row, ['quantity', 'số lượng', 'so luong', 'sl']);
    const salePrice = number(row, ['salePrice', 'giá bán', 'gia ban', 'đơn giá', 'don gia']);
    const paidAmount = number(row, ['paidAmount', 'đã thu', 'da thu', 'tiền đã thu']);
    const stockRow = product ? findStockRow(data, product) : null;
    const stockQty = stockRow ? toNumber(stockRow.quantity) : 0;
    const item = {
      ...rowBase(row),
      documentCode: text(row, ['documentCode', 'mã đơn', 'ma don', 'số đơn']) || 'AUTO',
      date: text(row, ['date', 'ngày', 'ngay']) || today(),
      customerCode,
      customerName: customer ? customer.name : '',
      productCode,
      productName: product ? product.name : '',
      quantity,
      salePrice,
      paidAmount,
      note: text(row, ['note', 'ghi chú', 'ghi chu']),
      errors: []
    };
    if (!customerCode) item.errors.push('Thiếu mã khách hàng');
    if (!customer) item.errors.push('Không tìm thấy khách hàng');
    if (!productCode) item.errors.push('Thiếu mã sản phẩm');
    if (!product) item.errors.push('Không tìm thấy sản phẩm');
    if (quantity <= 0) item.errors.push('Số lượng bán phải lớn hơn 0');
    if (salePrice < 0) item.errors.push('Giá bán không được âm');
    if (product && stockQty < quantity) item.errors.push(`Không đủ tồn kho: còn ${stockQty}`);
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewOpeningDebt(rows, data) {
  return rows.map((row) => {
    const customerCode = text(row, ['customerCode', 'mã khách hàng', 'ma khach hang', 'mã khách']);
    const customer = findCustomer(data, customerCode);
    const amount = number(row, ['amount', 'số tiền', 'so tien', 'công nợ', 'cong no', 'nợ đầu']);
    const item = { ...rowBase(row), date: text(row, ['date', 'ngày', 'ngay']) || today(), customerCode, customerName: customer ? customer.name : '', amount, note: text(row, ['note', 'ghi chú', 'ghi chu']), errors: [] };
    if (!customerCode) item.errors.push('Thiếu mã khách hàng');
    if (!customer) item.errors.push('Không tìm thấy khách hàng');
    if (amount < 0) item.errors.push('Công nợ đầu không được âm');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewDebtCollections(rows, data) {
  return rows.map((row) => {
    const customerCode = text(row, ['customerCode', 'mã khách hàng', 'ma khach hang', 'mã khách']);
    const customer = findCustomer(data, customerCode);
    const amount = number(row, ['amount', 'số tiền', 'so tien', 'tiền thu', 'tien thu']);
    const item = { ...rowBase(row), date: text(row, ['date', 'ngày', 'ngay']) || today(), customerCode, customerName: customer ? customer.name : '', amount, staffName: text(row, ['staffName', 'người thu', 'nguoi thu', 'nhân viên']), note: text(row, ['note', 'ghi chú', 'ghi chu']), errors: [] };
    if (!customerCode) item.errors.push('Thiếu mã khách hàng');
    if (!customer) item.errors.push('Không tìm thấy khách hàng');
    if (amount <= 0) item.errors.push('Số tiền thu phải lớn hơn 0');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewCashbook(rows) {
  return rows.map((row) => {
    const typeRaw = normalizeText(text(row, ['type', 'loại', 'loai', 'thu chi']));
    const type = typeRaw.includes('chi') || typeRaw === 'out' ? 'out' : 'in';
    const amount = number(row, ['amount', 'số tiền', 'so tien']);
    const item = { ...rowBase(row), date: text(row, ['date', 'ngày', 'ngay']) || today(), type, source: text(row, ['source', 'nguồn', 'nguon', 'nhóm tiền']), staffName: text(row, ['staffName', 'người nộp/nhận', 'nguoi nop', 'nhân viên']), amount, note: text(row, ['note', 'ghi chú', 'ghi chu']), errors: [] };
    if (amount <= 0) item.errors.push('Số tiền phải lớn hơn 0');
    return { ...item, valid: item.errors.length === 0 };
  });
}

function previewImport(type, rows, data) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let result = [];
  if (type === 'products') result = previewProducts(safeRows, data);
  else if (type === 'customers') result = previewCustomers(safeRows, data);
  else if (type === 'openingStock') result = previewOpeningStock(safeRows, data);
  else if (type === 'importOrders') result = previewImportOrders(safeRows, data);
  else if (type === 'salesOrders') result = previewSalesOrders(safeRows, data);
  else if (type === 'openingDebt') result = previewOpeningDebt(safeRows, data);
  else if (type === 'debtCollections') result = previewDebtCollections(safeRows, data);
  else if (type === 'cashbook') result = previewCashbook(safeRows, data);
  else throw new Error('Loại import không hợp lệ');
  return { type, rows: result, total: result.length, valid: result.filter((r) => r.valid).length, invalid: result.filter((r) => !r.valid).length };
}

function addImportLog(data, type, summary) {
  if (!Array.isArray(data.importLogs)) data.importLogs = [];
  data.importLogs.unshift({ id: makeId('IL'), type, ...summary, createdAt: new Date().toISOString() });
}

function commitProducts(rows, data) {
  rows.forEach((r) => {
    const unit = r.unit || 'Cái';
    const baseUnit = r.baseUnit || '';
    const conversionRate = Math.max(1, toNumber(r.conversionRate || 1));
    const packing = r.packing || (baseUnit && conversionRate > 1 ? `1 ${unit} = ${conversionRate} ${baseUnit}` : '');
    const units = [];
    if (baseUnit) units.push({ name: baseUnit, ratio: 1, isBase: true, isDefaultSale: false });
    units.push({ name: unit, ratio: conversionRate, isBase: false, isDefaultSale: true });
    data.products.push({ id: makeId('P'), code: r.code, name: r.name, unit, baseUnit, conversionRate, packing, units, barcode: r.barcode || '', category: r.category || '', costPrice: toNumber(r.costPrice), salePrice: toNumber(r.salePrice), minStock: toNumber(r.minStock), maxStock: toNumber(r.maxStock), isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  return rows.length;
}

function commitCustomers(rows, data) {
  rows.forEach((r) => data.customers.push({ id: makeId('C'), code: r.code, name: r.name, phone: r.phone || '', address: r.address || '', area: r.area || '', staffName: r.staffName || '', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  return rows.length;
}

function commitOpeningStock(rows, data) {
  rows.forEach((r) => {
    const product = findProduct(data, r.productCode);
    upsertStock(data, { productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity: r.quantity }, 'set');
  });
  return rows.length;
}

function groupRows(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = `${r.documentCode || 'AUTO'}|${r.date || today()}|${r.customerCode || r.supplier || ''}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return Array.from(map.values());
}

function commitImportOrders(rows, data) {
  let count = 0;
  groupRows(rows).forEach((group) => {
    const first = group[0];
    const items = group.map((r) => {
      const product = findProduct(data, r.productCode);
      const quantity = toNumber(r.quantity);
      const costPrice = toNumber(r.costPrice);
      return { productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, costPrice, amount: quantity * costPrice };
    });
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const order = { id: makeId('IM'), code: buildImportCode(data), date: first.date || today(), supplier: first.supplier || 'Import Excel', note: first.note || 'Import Excel', items, totalQuantity, totalAmount, createdAt: new Date().toISOString() };
    data.importOrders.push(order);
    items.forEach((item) => upsertStock(data, item, 'add'));
    count += 1;
  });
  return count;
}

function commitSalesOrders(rows, data) {
  let count = 0;
  groupRows(rows).forEach((group) => {
    const first = group[0];
    const customer = findCustomer(data, first.customerCode);
    const items = group.map((r) => {
      const product = findProduct(data, r.productCode);
      const quantity = toNumber(r.quantity);
      const salePrice = toNumber(r.salePrice);
      return { productId: product.id, productCode: product.code, productName: product.name, unit: product.unit, quantity, salePrice, amount: quantity * salePrice };
    });
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const paidAmount = Math.min(toNumber(first.paidAmount), totalAmount);
    const debtAmount = totalAmount - paidAmount;
    const order = {
      id: makeId('SO'),
      code: buildSalesCode(data),
      date: first.date || today(),
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      note: first.note || 'Import Excel DMS',
      orderSource: 'DMS',
      orderSourceName: 'Từ DMS',
      isChildOrder: true,
      masterOrderId: '',
      mergeStatus: 'unmerged',
      items,
      totalQuantity,
      totalAmount,
      paidAmount,
      debtAmount,
      status: 'posted',
      createdAt: new Date().toISOString()
    };
    data.salesOrders.push(order);
    items.forEach((item) => reduceStock(data, item));
    data.payments.push({ id: makeId('PM'), date: order.date, type: 'sale_debt', refType: 'salesOrder', refId: order.id, refCode: order.code, customerId: customer.id, customerCode: customer.code, customerName: customer.name, debit: totalAmount, credit: paidAmount, note: `Import Excel từ đơn bán ${order.code}`, createdAt: new Date().toISOString() });
    if (paidAmount > 0) data.cashbook.push({ id: makeId('CB'), code: buildCashCode(data, 'in'), date: order.date, type: 'in', source: 'sales_payment_import', refType: 'salesOrder', refId: order.id, refCode: order.code, customerId: customer.id, customerCode: customer.code, customerName: customer.name, staffName: '', amount: paidAmount, note: `Thu tiền import từ đơn bán ${order.code}`, createdAt: new Date().toISOString() });
    count += 1;
  });
  return count;
}

function commitOpeningDebt(rows, data) {
  rows.forEach((r) => {
    const customer = findCustomer(data, r.customerCode);
    data.payments.push({ id: makeId('PM'), date: r.date || today(), type: 'opening_debt', refType: 'opening', refId: '', refCode: 'OPENING', customerId: customer.id, customerCode: customer.code, customerName: customer.name, debit: toNumber(r.amount), credit: 0, note: r.note || 'Công nợ đầu kỳ import Excel', createdAt: new Date().toISOString() });
  });
  return rows.length;
}

function commitDebtCollections(rows, data) {
  rows.forEach((r) => {
    const customer = findCustomer(data, r.customerCode);
    const amount = toNumber(r.amount);
    const refCode = `TCN${((data.payments || []).length + 1).toString().padStart(5, '0')}`;
    data.payments.push({ id: makeId('PM'), date: r.date || today(), type: 'debt_collection', refType: 'collection', refId: '', refCode, customerId: customer.id, customerCode: customer.code, customerName: customer.name, debit: 0, credit: amount, note: r.note || 'Import thu công nợ Excel', createdAt: new Date().toISOString() });
    data.cashbook.push({ id: makeId('CB'), code: buildCashCode(data, 'in'), date: r.date || today(), type: 'in', source: 'debt_collection_import', refType: 'collection', refId: '', refCode, customerId: customer.id, customerCode: customer.code, customerName: customer.name, staffName: r.staffName || '', amount, note: r.note || 'Import thu công nợ Excel', createdAt: new Date().toISOString() });
  });
  return rows.length;
}

function commitCashbook(rows, data) {
  rows.forEach((r) => data.cashbook.push({ id: makeId('CB'), code: buildCashCode(data, r.type), date: r.date || today(), type: r.type === 'out' ? 'out' : 'in', source: r.source || 'import_excel', refType: 'manual_import', refId: '', refCode: '', customerId: '', customerCode: '', customerName: '', staffName: r.staffName || '', amount: toNumber(r.amount), note: r.note || 'Import quỹ tiền Excel', createdAt: new Date().toISOString() }));
  return rows.length;
}

function commitImport(type, selectedRows, data) {
  const rows = (Array.isArray(selectedRows) ? selectedRows : []).filter((r) => r && r.valid !== false && (!r.errors || r.errors.length === 0));
  if (!rows.length) return { ok: false, imported: 0, message: 'Không có dòng hợp lệ để import' };
  let imported = 0;
  if (type === 'products') imported = commitProducts(rows, data);
  else if (type === 'customers') imported = commitCustomers(rows, data);
  else if (type === 'openingStock') imported = commitOpeningStock(rows, data);
  else if (type === 'importOrders') imported = commitImportOrders(rows, data);
  else if (type === 'salesOrders') imported = commitSalesOrders(rows, data);
  else if (type === 'openingDebt') imported = commitOpeningDebt(rows, data);
  else if (type === 'debtCollections') imported = commitDebtCollections(rows, data);
  else if (type === 'cashbook') imported = commitCashbook(rows, data);
  else throw new Error('Loại import không hợp lệ');
  addImportLog(data, type, { imported, totalRows: selectedRows.length });
  return { ok: true, imported, message: `Đã import thành công ${imported} dòng/chứng từ` };
}

module.exports = { previewImport, commitImport };
