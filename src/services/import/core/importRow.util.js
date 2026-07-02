'use strict';

const Product = require('../../../models/Product');
const Customer = require('../../../models/Customer');
const inventoryStockService = require('../../inventoryStock.service');
const User = require('../../../models/User');
const { toNumber, makeId, normalizeText, normalizePacking } = require('../../../utils/common.util');
const {
  IMPORT_MODE_CREATE,
  IMPORT_MODE_UPDATE,
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  buildChanges,
  omitUnchanged
} = require('../selectiveUpdate.util');
const promotionService = require('../../promotionService');
const { isBcryptHash, hashPasswordSync } = require('../../../security/passwordPolicy');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  buildSalesStaffSnapshot,
  SALES_STAFF_CODE_FIELDS,
  USER_ACCOUNT_SALES_STAFF_CODE_FIELDS,
  pickUserAccountSalesStaffCode
} = require('../../../domain/staff/staffIdentity');
const USER_UPDATE_LABELS = Object.freeze({
  fullName: 'Họ tên', staffCode: 'Mã nhân viên', role: 'Vai trò', phone: 'Số điện thoại',
  email: 'Email', area: 'Khu vực', route: 'Tuyến', permissions: 'Quyền truy cập',
  isActive: 'Trạng thái', password: 'Mật khẩu'
});
const SALES_STAFF_CODE_ALIASES = [
  'staffCode', 'salesStaffCode', 'salesmanCode', 'employeeCode', 'sellerCode', 'saleCode', 'salesCode',
  'Mã NVBH', 'Ma NVBH', 'Mã NVTT', 'Ma NVTT', 'Mã NV', 'Ma NV', 'Mã Nv', 'Ma Nv',
  'Mã nhân viên', 'Ma nhan vien', 'Mã nhân viên TT', 'Ma nhan vien TT',
  'Mã nhân viên bán hàng', 'Ma nhan vien ban hang', 'Mã NV bán hàng', 'Ma NV ban hang',
  'NV bán hàng', 'NV ban hang', 'Nhân viên bán hàng', 'Nhan vien ban hang',
  'Salesman Code', 'Sales Rep Code', 'Sales Staff Code', 'Seller Code', 'Employee Code',
  'Mã nhân viên', 'Mã NVBH', 'Mã NVTT'
];
const SALES_STAFF_NAME_ALIASES = [
  'staffName', 'salesStaffName', 'salesmanName', 'employeeName', 'sellerName',
  'Tên NVBH', 'Ten NVBH', 'Tên NVTT', 'Ten NVTT', 'Tên NV', 'Ten NV', 'Tên Nv', 'Ten Nv',
  'Tên nhân viên', 'Ten nhan vien', 'Tên nhân viên bán hàng', 'Ten nhan vien ban hang',
  'Nhân viên bán hàng', 'Nhan vien ban hang', 'NVBH', 'NVTT',
  'Salesman', 'Sales Rep', 'Sales Staff', 'Seller Name', 'Employee Name'
];
const USER_IMPORT_ROLES = new Set(['admin', 'manager', 'accountant', 'sales', 'delivery', 'warehouse']);
const USER_ROLE_ALIASES = {
  'quan tri': 'admin', 'quản trị': 'admin', 'admin': 'admin',
  'quan ly': 'manager', 'quản lý': 'manager', 'manager': 'manager',
  'ke toan': 'accountant', 'kế toán': 'accountant', 'accountant': 'accountant',
  'ban hang': 'sales', 'bán hàng': 'sales', 'nvbh': 'sales', 'sales': 'sales',
  'giao hang': 'delivery', 'giao hàng': 'delivery', 'nvgh': 'delivery', 'delivery': 'delivery',
  'kho': 'warehouse', 'thu kho': 'warehouse', 'thủ kho': 'warehouse', 'warehouse': 'warehouse'
};

const {
  cleanText,
  get,
  getDateFromRow,
  getCustomerCodeFromRow,
  getProductCodeFromRow,
  buildCustomerSelectiveUpdate,
  buildProductSelectiveUpdate,
  pickCustomerPayload,
  pickProductPayload
} = require('./importValue.util');

function getUserUpdateInput(row = {}) {
  return {
    fullName: getProvidedField(row, ['fullName', 'name', 'Họ tên', 'Ho ten', 'Tên nhân viên', 'Ten nhan vien', 'Tên NV', 'Ten NV']),
    staffCode: getProvidedField(row, ['staffCode', 'code', 'Mã nhân viên', 'Ma nhan vien', 'Mã NV', 'Ma NV', 'StaffCode']),
    role: getProvidedField(row, ['role', 'Vai trò', 'Vai tro', 'Quyền', 'Quyen', 'Role']),
    password: getProvidedField(row, ['password', 'Mật khẩu', 'Mat khau', 'Password']),
    phone: getProvidedField(row, ['phone', 'mobile', 'SĐT', 'SDT', 'Điện thoại', 'Dien thoai']),
    email: getProvidedField(row, ['email', 'Email']),
    area: getProvidedField(row, ['area', 'Khu vực', 'Khu vuc']),
    route: getProvidedField(row, ['route', 'Tuyến', 'Tuyen']),
    permissions: getProvidedField(row, ['permissions', 'permission', 'Quyền truy cập', 'Quyen truy cap']),
    isActive: getProvidedField(row, ['isActive', 'status', 'Trạng thái', 'Trang thai'])
  };
}

function buildUserSelectiveUpdate(row = {}, current = {}, { hashPassword = false } = {}) {
  const input = getUserUpdateInput(row);
  const patch = {};
  if (input.fullName.hasValue) {
    patch.fullName = cleanText(input.fullName.value);
    patch.name = patch.fullName;
  }
  if (input.staffCode.hasValue) {
    patch.staffCode = cleanText(input.staffCode.value);
    patch.code = patch.staffCode;
  }
  if (input.role.hasValue) {
    const role = normalizeImportRole(input.role.value);
    if (role) {
      patch.role = role;
      patch.isSalesman = role === 'sales';
      patch.isDelivery = role === 'delivery';
    }
  }
  if (input.phone.hasValue) patch.phone = cleanText(input.phone.value);
  if (input.email.hasValue) patch.email = cleanText(input.email.value);
  if (input.area.hasValue) patch.area = cleanText(input.area.value);
  if (input.route.hasValue) patch.route = cleanText(input.route.value);
  if (input.permissions.hasValue) patch.permissions = cleanText(input.permissions.value);
  if (input.isActive.hasValue) patch.isActive = parseImportBoolean(input.isActive.value, current.isActive !== false);
  if (input.password.hasValue && hashPassword) {
    const password = cleanText(input.password.value);
    patch.password = isBcryptHash(password) ? password : hashPasswordSync(password);
  }

  const update = omitUnchanged(current, patch);
  const changes = buildChanges(current, update, USER_UPDATE_LABELS, new Set(['password']));
  if (input.password.hasValue && !hashPassword) {
    changes.push({ field: 'password', label: 'Mật khẩu', oldValue: 'Đã thiết lập', newValue: 'Sẽ cập nhật' });
  }
  return { patch: update, changes, input };
}

function rowBase(row = {}) {
  const rowNo = row.__rowNo || row.rowNo || row.dong || row['Dòng'] || row['Dong'] || '';
  const sourceFile = cleanText(row.sourceFile || row.__sourceFile || row.fileName || row.originalFileName || '');
  return {
    rowNo,
    sourceRowNo: rowNo,
    sourceFile,
    fileName: sourceFile,
    raw: row
  };
}

function normalizeExcelHeaderKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function getRowValueByAliases(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return '';
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && cleanText(row[alias])) return row[alias];
  }
  const aliasSet = new Set(aliases.map(normalizeExcelHeaderKey).filter(Boolean));
  for (const key of Object.keys(row)) {
    if (aliasSet.has(normalizeExcelHeaderKey(key)) && cleanText(row[key])) return row[key];
  }
  return '';
}

function getSalesStaffCodeFromRow(row = {}) {
  return cleanText(getRowValueByAliases(row, SALES_STAFF_CODE_ALIASES));
}

function getSalesStaffNameFromRow(row = {}) {
  return cleanText(getRowValueByAliases(row, SALES_STAFF_NAME_ALIASES));
}

function addUserStaffAlias(map, value, user) {
  const key = cleanText(value);
  if (key && user && !map.has(key)) map.set(key, user);
}

function getUserStaffName(user = {}) {
  return cleanText(pickSalesStaffName(user));
}

function getUserStaffCode(user = {}) {
  // NVBH nghiệp vụ ưu tiên mã chuyên biệt; với màn Tài khoản hiện tại,
  // mã nhân viên hợp lệ có thể đang lưu ở users.code/users.staffCode.
  // Không dùng username/id/_id để match nhân viên.
  return cleanText(pickSalesStaffCode(user) || pickUserAccountSalesStaffCode(user));
}

function staffCodeLookupClauses(codes = [], fields = USER_ACCOUNT_SALES_STAFF_CODE_FIELDS) {
  const textValues = Array.from(new Set((codes || []).map(cleanText).filter(Boolean)));
  const numericValues = Array.from(new Set(textValues.filter((value) => /^\d+$/.test(value)).map(Number)));
  const regexValues = textValues.map((value) => new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
  const clauses = [];
  for (const field of fields || []) {
    if (textValues.length) clauses.push({ [field]: { $in: textValues } });
    if (numericValues.length) clauses.push({ [field]: { $in: numericValues } });
    for (const rx of regexValues) clauses.push({ [field]: rx });
  }
  return clauses;
}

function isSalesStaffUser(user = {}) {
  const role = cleanText(user.role).toLowerCase();
  return ['sales', 'admin', 'nvbh'].includes(role);
}

async function preloadSalesStaffUsersByCode(rows = []) {
  const codes = Array.from(new Set((rows || []).map((row) => pickSalesStaffCode(row) || getSalesStaffCodeFromRow(row)).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const users = await User.find({
    isActive: { $ne: false },
    $or: staffCodeLookupClauses(codes)
  })
    .select('code staffCode employeeCode salesStaffCode salesStaffName salesmanCode salesmanName maNhanVien fullName name role isActive')
    .lean()
    .catch(() => []);

  const map = new Map();
  for (const user of users || []) {
    USER_ACCOUNT_SALES_STAFF_CODE_FIELDS.map((field) => user[field]).forEach((value) => addUserStaffAlias(map, value, user));
  }
  return map;
}

function resolveSalesStaffForImportRow(row = {}, salesStaffUserMap = new Map()) {
  // Quy tắc chuẩn: mã NVBH lấy từ salesStaffCode/salesmanCode/employeeCode/maNhanVien.
  // Tên NVBH không lấy từ Excel/raw; chỉ tra từ users Mongo theo mã canonical.
  const excelStaffCode = cleanText(pickSalesStaffCode(row) || getSalesStaffCodeFromRow(row));
  const user = excelStaffCode ? salesStaffUserMap.get(excelStaffCode) : null;
  const snapshot = user ? buildSalesStaffSnapshot(user) : buildSalesStaffSnapshot(row);
  const userStaffCode = user ? getUserStaffCode(user) : '';

  return {
    // Mã lưu theo Excel để giữ lineage DMS; tên bắt buộc lấy từ users.
    staffCode: excelStaffCode,
    salesStaffCode: snapshot.salesStaffCode || userStaffCode || excelStaffCode,
    staffName: '',
    salesStaffName: user ? snapshot.salesStaffName : '',
    salesmanCode: snapshot.salesmanCode || userStaffCode || excelStaffCode,
    salesmanName: user ? snapshot.salesmanName : '',
    user,
    found: !!user,
    validRole: !!user && isSalesStaffUser(user),
    hasUserStaffCode: !!userStaffCode
  };
}

async function getStockMapByProductCode(rows = []) {
  const codes = Array.from(new Set(rows.map(getProductCodeFromRow).map(cleanText).filter(Boolean)));
  if (!codes.length) return new Map();
  const stockByCode = await inventoryStockService.getAvailableStocks(codes);
  const map = new Map();
  for (const code of codes) {
    map.set(code, toNumber(stockByCode[inventoryStockService.normalizeProductCode(code)]));
  }
  return map;
}

function getOrderDocumentCode(row = {}) {
  // DMS/Unilever: mã chứng từ chuẩn phải lấy từ cột "Số hóa đơn" trước tiên.
  // File DMS có thêm cột "Số hóa đơn trong 1 ngày" giá trị 0/1; nếu mapping nhầm
  // cột này vào documentCode thì các dòng sẽ bị gom sai và có thể làm mất đơn Hải Miên.
  const rawInvoiceCode = cleanText(
    row['Số Đơn'] ||
    row['So Don'] ||
    row['Số đơn'] ||
    row['So don'] ||
    row['Số hóa đơn'] ||
    row['So hoa don'] ||
    row['Số hoá đơn'] ||
    row['Số hoá đơn '] ||
    row['So hoa don '] ||
    row.invoiceCode ||
    row.orderCode ||
    row['Mã đơn'] ||
    row['Ma don'] ||
    row['Mã phiếu'] ||
    row['Ma phieu']
  );
  if (rawInvoiceCode) return rawInvoiceCode;

  const mappedDocumentCode = cleanText(row.documentCode);
  // Không nhận 0/1/2... làm mã đơn, vì đó thường là cột "Số hóa đơn trong 1 ngày".
  if (mappedDocumentCode && !/^\d{1,3}$/.test(mappedDocumentCode)) return mappedDocumentCode;

  // Chỉ dùng row.code khi chắc chắn đó là mã đơn, không phải mã sản phẩm dạng số.
  const genericCode = cleanText(row.code);
  if (genericCode && !/^\d{5,}$/.test(genericCode)) return genericCode;

  return 'AUTO';
}

function makeImportOrderGroupKey(row = {}) {
  return [
    getOrderDocumentCode(row),
    getDateFromRow(row),
    cleanText(row.supplier || row.supplierName || row['Nhà cung cấp'] || row['Nha cung cap']) || 'Import Excel'
  ].join('|');
}

function makeSalesOrderGroupKey(row = {}) {
  const documentCode = getOrderDocumentCode(row);
  // Nếu file thiếu Số hóa đơn thì không gom cứng theo khách/ngày,
  // vì 2 đơn cùng khách đứng sát nhau sẽ bị hiểu là 1 đơn.
  const safeDocumentCode = documentCode && documentCode !== 'AUTO'
    ? documentCode
    : `AUTO_ROW_${row.__rowNo || row.rowNo || makeId('ROW')}`;
  return [
    cleanText(row.__sourceFile || row.sourceFile || row.fileName || ''),
    safeDocumentCode,
    getDateFromRow(row),
    getCustomerCodeFromRow(row)
  ].join('|');
}

function cloneRawRowForImport(row = {}) {
  const cloned = { ...(row.raw || row) };
  delete cloned.raw;
  delete cloned.errors;
  delete cloned.valid;
  return cloned;
}

function flattenCommitRows(rows = []) {
  const result = [];
  for (const row of rows || []) {
    const source = Array.isArray(row.__importRows) ? row.__importRows : (Array.isArray(row.rows) ? row.rows : null);
    if (source) {
      for (const child of source) result.push(cloneRawRowForImport(child));
    } else {
      result.push(cloneRawRowForImport(row));
    }
  }
  return result;
}

function flattenAdjustedCommitRows(rows = []) {
  const result = [];
  for (const row of rows || []) {
    const source = Array.isArray(row.__adjustedRows)
      ? row.__adjustedRows
      : (Array.isArray(row.__importRows) ? row.__importRows : (Array.isArray(row.rows) ? row.rows : null));
    if (source) {
      for (const child of source) {
        const raw = cloneRawRowForImport(child);
        if (raw.__skipImportLine) continue;
        // Giữ kết quả validate: mã NVBH lấy từ Excel, tên NVBH đã resolve từ users.
        raw.staffCode = '';
        raw.salesStaffCode = row.salesStaffCode || row.salesmanCode || raw.salesStaffCode || '';
        raw.staffName = '';
        raw.salesStaffName = row.salesStaffName || row.salesmanName || '';
        result.push(raw);
      }
    } else {
      const raw = cloneRawRowForImport(row);
      raw.staffCode = '';
      raw.salesStaffCode = row.salesStaffCode || row.salesmanCode || raw.salesStaffCode || '';
      raw.staffName = '';
      raw.salesStaffName = row.salesStaffName || row.salesmanName || '';
      if (!raw.__skipImportLine) result.push(raw);
    }
  }
  return result;
}

function applyAdjustedQuantityToRow(row = {}, allowedSaleQuantity = 0, allowedPromoQuantity = 0, salePrice = 0) {
  const adjusted = { ...(row.raw || row) };
  const saleQty = Math.max(0, toNumber(allowedSaleQuantity));
  const promoQty = Math.max(0, toNumber(allowedPromoQuantity));
  adjusted.quantity = saleQty;
  adjusted.qty = saleQty;
  adjusted.stockQuantity = saleQty + promoQty;
  adjusted.deliveredQuantity = saleQty + promoQty;
  adjusted.soldQuantity = saleQty;
  adjusted.cartons = 0;
  adjusted.units = saleQty;
  adjusted.promoCartons = 0;
  adjusted.promoUnits = promoQty;
  adjusted.promoQuantity = promoQty;
  adjusted.actualAmount = saleQty * salePrice;
  adjusted.amount = saleQty * salePrice;
  adjusted.lineAmount = saleQty * salePrice;
  adjusted.__allowedSaleQuantity = saleQty;
  adjusted.__allowedPromoQuantity = promoQty;
  adjusted.__autoCutByStock = true;
  if ((saleQty + promoQty) <= 0) adjusted.__skipImportLine = true;
  return adjusted;
}

function normalizeShortageRows(shortages = []) {
  if (!Array.isArray(shortages)) return [];
  const seen = new Set();
  const rows = [];

  for (const item of shortages) {
    if (!item || typeof item !== 'object') continue;
    const documentCode = cleanText(item.documentCode || item.orderCode || item.code || item.refCode || '');
    const productCode = cleanText(item.productCode || item.code || item.productId || '');
    const missingQuantity = toNumber(item.missingQuantity ?? item.shortageQuantity ?? item.missingQty);
    const cutAmount = toNumber(item.cutAmount ?? item.shortageAmount ?? item.amount);
    const orderedQuantity = toNumber(item.orderedQuantity ?? item.orderQuantity ?? item.quantity);
    const availableQuantity = toNumber(item.availableQuantity ?? item.stockQuantity ?? item.availableStock);
    const allowedQuantity = toNumber(item.allowedQuantity ?? item.importedQuantity ?? item.adjustedQuantity);

    // Không đưa dòng rỗng/ảo vào báo cáo thiếu hàng.
    if (!documentCode && !productCode && missingQuantity <= 0 && cutAmount <= 0) continue;

    const key = [
      documentCode,
      productCode,
      orderedQuantity,
      availableQuantity,
      allowedQuantity,
      missingQuantity,
      cutAmount
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      ...item,
      documentCode: documentCode || item.documentCode || item.orderCode || item.refCode || '',
      productCode: productCode || item.productCode || item.productId || '',
      missingQuantity,
      cutAmount
    });
  }

  return rows;
}

function summarizeOrderShortages(shortages = []) {
  const safeShortages = normalizeShortageRows(shortages);
  const totalMissingQty = safeShortages.reduce((sum, item) => sum + toNumber(item.missingQuantity), 0);
  const totalCutAmount = safeShortages.reduce((sum, item) => sum + toNumber(item.cutAmount), 0);
  return { totalMissingQty, totalCutAmount };
}


async function preloadPromotionCustomersByCode(rows = []) {
  const codes = Array.from(new Set(rows.map((row) => cleanText(row.customerCode || row['Mã khách hàng'] || row['Ma khach hang'] || get(row, ['mã khách hàng', 'ma khach hang', 'customerCode']))).filter(Boolean)));
  if (!codes.length) return new Map();
  const customers = await Customer.find({ $or: [{ code: { $in: codes } }, { customerCode: { $in: codes } }, { id: { $in: codes } }] }).lean();
  return new Map(customers.map((c) => [cleanText(c.code || c.customerCode || c.id), c]));
}

const PROMOTION_PRODUCT_CODE_FIELDS = [
  'code',
  'productCode',
  'sku',
  'barcode',
  'dmsCode',
  'sapCode',
  'unileverCode',
  'itemCode',
  'itemNo',
  'materialCode',
  'materialNumber'
];

function normalizePromotionProductCode(value) {
  let text = cleanText(value);
  if (!text) return '';
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  // Excel sometimes serializes long numeric product codes as scientific notation.
  // Convert only plain integer scientific notation; keep text values such as 00012345 intact.
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= 0) {
      text = String(numeric);
    }
  }
  return text;
}

function getPromotionProductCodeFromRow(row = {}) {
  return normalizePromotionProductCode(
    row.productCode ||
    row['Mã sản phẩm'] ||
    row['Ma san pham'] ||
    get(row, ['mã sản phẩm', 'ma san pham', 'productCode'])
  );
}

function addPromotionProductMapAlias(map, value, product) {
  const key = normalizePromotionProductCode(value);
  if (key && product && !map.has(key)) map.set(key, product);
}

function promotionProductLookupClauses(codes = []) {
  const textValues = Array.from(new Set((codes || []).map(normalizePromotionProductCode).filter(Boolean)));
  const numericValues = Array.from(new Set(
    textValues
      .filter((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
      .map(Number)
  ));
  const clauses = [];
  for (const field of PROMOTION_PRODUCT_CODE_FIELDS) {
    if (textValues.length) clauses.push({ [field]: { $in: textValues } });
    if (numericValues.length) clauses.push({ [field]: { $in: numericValues } });
  }
  return clauses;
}

async function preloadPromotionProductsByCode(rows = []) {
  const codes = Array.from(new Set((rows || []).map(getPromotionProductCodeFromRow).filter(Boolean)));
  if (!codes.length) return new Map();
  const products = await Product.find({ $or: promotionProductLookupClauses(codes) }).lean();
  const map = new Map();
  for (const product of products || []) {
    for (const field of PROMOTION_PRODUCT_CODE_FIELDS) {
      addPromotionProductMapAlias(map, product[field], product);
    }
  }
  return map;
}

function pickPromotionProductRulePayload(row = {}) {
  const programCode = cleanText(row.programCode || row.code || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã CTKM'] || row['Ma CTKM'] || row['Mã nhóm/CTKM'] || row['Ma nhom/CTKM'] || row['Mã chương trình KM'] || row['Ma chuong trinh KM']);
  const productCode = getPromotionProductCodeFromRow(row);
  return {
    ...rowBase(row),
    programCode,
    programName: cleanText(row.programName || row.name || row['Nội dung chương trình'] || row['Noi dung chuong trinh'] || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM']),
    productCode,
    productName: cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['Chiết khấu'] ?? row['Chiet khau'] ?? row['CK']),
    productMatched: false,
    missingProduct: false,
    source: 'excel-import'
  };
}

function pickPromotionGroupItemPayload(row = {}) {
  return {
    ...rowBase(row),
    programCode: cleanText(row.programCode || row.groupCode || row.code || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham'] || row['Mã nhóm/CTKM'] || row['Ma nhom/CTKM']),
    productCode: getPromotionProductCodeFromRow(row),
    productName: cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham'])
  };
}

function pickPromotionGroupRulePayload(row = {}) {
  const programCode = cleanText(row.programCode || row.code || row['Mã CTKM'] || row['Ma CTKM'] || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh'] || row.groupCode || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham']);
  const groupCode = cleanText(row.groupCode || row.productGroupCode || row.applyGroupCode || row['Nhóm áp dụng'] || row['Nhom ap dung'] || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham'] || programCode);
  const basis = promotionService.normalizeGroupRuleBasis(row.basis || row.calculationBasis || row['Tính theo'] || row['Tinh theo'] || row['Cách tính'] || row['Cach tinh']);
  return {
    ...rowBase(row),
    programCode,
    programName: cleanText(row.programName || row.name || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM'] || row['Nội dung chương trình'] || row['Noi dung chuong trinh']),
    groupCode,
    basis: basis || promotionService.GROUP_RULE_BASIS.ORDER_VALUE,
    calculationBasis: basis || promotionService.GROUP_RULE_BASIS.ORDER_VALUE,
    minAmount: toNumber(row.minAmount ?? row.threshold ?? row.requiredAmount ?? row.salesAmount ?? row.minQty ?? row.quantityThreshold ?? row['Ngưỡng từ'] ?? row['Nguong tu'] ?? row['Mức doanh số cần lấy'] ?? row['Muc doanh so can lay'] ?? row['Doanh số cần lấy'] ?? row['Doanh so can lay'] ?? row['Số lượng từ'] ?? row['So luong tu'] ?? row['Số lượng tối thiểu'] ?? row['So luong toi thieu']),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['Chiết khấu %'] ?? row['Chiet khau %'] ?? row['Chiết khấu'] ?? row['Chiet khau'] ?? row['CK']),
    source: 'excel-import'
  };
}

function pickPromotionQuantityGroupDiscountPayload(row = {}) {
  const programCode = cleanText(row.programCode || row.code || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã CTKM'] || row['Ma CTKM'] || row['Mã nhóm/CTKM'] || row['Ma nhom/CTKM']).toUpperCase();
  const productCode = getPromotionProductCodeFromRow(row);
  return {
    ...rowBase(row),
    programCode,
    code: programCode,
    programName: cleanText(row.programName || row.name || row['Tên chương trình KM'] || row['Ten chuong trinh KM'] || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM']),
    productGroupCode: cleanText(row.productGroupCode || row.groupCode || row['Mã nhóm SP'] || row['Ma nhom SP'] || row['Mã nhóm sản phẩm'] || row['Ma nhom san pham'] || programCode).toUpperCase(),
    productGroupName: cleanText(row.productGroupName || row.groupName || row['Tên nhóm SP'] || row['Ten nhom SP'] || row['Tên nhóm sản phẩm'] || row['Ten nhom san pham']),
    productCode,
    productName: cleanText(row.productName || row['Tên sản phẩm'] || row['Ten san pham']),
    minQty: toNumber(row.minQty ?? row.requiredQty ?? row.quantityThreshold ?? row['Số lượng tối thiểu'] ?? row['So luong toi thieu'] ?? row['SL tối thiểu'] ?? row['SL toi thieu']),
    qtyUnit: cleanText(row.qtyUnit || row.unit || row['Đơn vị tính'] || row['Don vi tinh'] || 'dây'),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['% chiết khấu'] ?? row['% chiet khau'] ?? row['Chiết khấu'] ?? row['Chiet khau'] ?? row['CK']),
    isActive: normalizeImportActive(row.isActive ?? row.status ?? row['Trạng thái'] ?? row['Trang thai']),
    note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']),
    source: 'excel-import'
  };
}

function pickPromotionCustomerOrderValueDiscountPayload(row = {}) {
  const programCode = cleanText(row.programCode || row.code || row['Mã chương trình KM'] || row['Ma chuong trinh KM'] || row['Mã chương trình'] || row['Ma chuong trinh'] || row['Mã CTKM'] || row['Ma CTKM']).toUpperCase();
  const customerCode = cleanText(row.customerCode || row['Mã khách hàng'] || row['Ma khach hang'] || row['Mã cửa hàng'] || row['Ma cua hang']);
  return {
    ...rowBase(row),
    programCode,
    code: programCode,
    programName: cleanText(row.programName || row.name || row['Tên chương trình KM'] || row['Ten chuong trinh KM'] || row['Nội dung chương trình KM'] || row['Noi dung chuong trinh KM']),
    customerCode,
    customerName: cleanText(row.customerName || row['Tên khách hàng'] || row['Ten khach hang'] || row['Tên cửa hàng'] || row['Ten cua hang']),
    minOrderAmount: toNumber(row.minOrderAmount ?? row.minAmount ?? row.requiredAmount ?? row['Doanh số đơn tối thiểu'] ?? row['Doanh so don toi thieu'] ?? row['Mức doanh số'] ?? row['Muc doanh so']),
    discountPercent: promotionService.normalizeDiscountPercent(row.discountPercent ?? row.discount ?? row['% chiết khấu thêm'] ?? row['% chiet khau them'] ?? row['Chiết khấu thêm'] ?? row['Chiet khau them'] ?? row['CK']),
    baseAmountMode: cleanText(row.baseAmountMode || row['Cách tính nền'] || row['Cach tinh nen'] || 'after_line_promotions'),
    isActive: normalizeImportActive(row.isActive ?? row.status ?? row['Trạng thái'] ?? row['Trang thai']),
    note: cleanText(row.note || row['Ghi chú'] || row['Ghi chu']),
    source: 'excel-import'
  };
}

function dedupePromotionPayloads(payloads = [], makeKey) {
  const map = new Map();
  const duplicated = [];
  for (const item of payloads) {
    const key = makeKey(item);
    if (!key) continue;
    if (map.has(key)) duplicated.push(key);
    map.set(key, item); // lấy dòng cuối cùng nếu Excel bị trùng key
  }
  return { rows: Array.from(map.values()), duplicateCount: duplicated.length };
}

function promotionBulkChunks(ops = [], size = 1000) {
  const chunks = [];
  for (let i = 0; i < ops.length; i += size) chunks.push(ops.slice(i, i + size));
  return chunks;
}

function normalizeImportRole(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  const normalized = normalizeText(raw);
  return USER_ROLE_ALIASES[raw] || USER_ROLE_ALIASES[normalized] || (USER_IMPORT_ROLES.has(raw) ? raw : '');
}

function normalizeImportActive(value) {
  const raw = cleanText(value);
  if (!raw) return true;
  const normalized = normalizeText(raw).toLowerCase();
  if (['0', 'false', 'no', 'n', 'inactive', 'ngung', 'ngung hoat dong', 'khoa', 'lock', 'locked'].includes(normalized)) return false;
  return true;
}

function pickUserImportPayload(row = {}) {
  const username = cleanText(row.username || row['Tên đăng nhập'] || row['Ten dang nhap'] || row['Tài khoản'] || row['Tai khoan'] || row['User'] || row['Username']);
  const staffCode = cleanText(row.staffCode || row.code || row['Mã nhân viên'] || row['Ma nhan vien'] || row['Mã NV'] || row['Ma NV'] || row['Mã Nv'] || row['Ma Nv'] || row['StaffCode']);
  const fullName = cleanText(row.fullName || row.name || row['Họ tên'] || row['Ho ten'] || row['Tên nhân viên'] || row['Ten nhan vien'] || row['Tên NV'] || row['Ten NV']);
  const role = normalizeImportRole(row.role || row['Vai trò'] || row['Vai tro'] || row['Quyền'] || row['Quyen'] || row['Role']);
  const password = cleanText(row.password || row['Mật khẩu'] || row['Mat khau'] || row['Password']);
  return {
    ...rowBase(row),
    username,
    password,
    fullName,
    name: fullName,
    staffCode,
    code: staffCode,
    role,
    phone: cleanText(row.phone || row.mobile || row['SĐT'] || row['SDT'] || row['Điện thoại'] || row['Dien thoai']),
    email: cleanText(row.email || row['Email']),
    area: cleanText(row.area || row['Khu vực'] || row['Khu vuc']),
    route: cleanText(row.route || row['Tuyến'] || row['Tuyen']),
    permissions: cleanText(row.permissions || row.permission || row['Quyền truy cập'] || row['Quyen truy cap']),
    isActive: normalizeImportActive(row.isActive ?? row.status ?? row['Trạng thái'] ?? row['Trang thai'])
  };
}

module.exports = {
  getUserUpdateInput,
  buildUserSelectiveUpdate,
  rowBase,
  normalizeExcelHeaderKey,
  getRowValueByAliases,
  getSalesStaffCodeFromRow,
  getSalesStaffNameFromRow,
  addUserStaffAlias,
  getUserStaffName,
  getUserStaffCode,
  staffCodeLookupClauses,
  isSalesStaffUser,
  preloadSalesStaffUsersByCode,
  resolveSalesStaffForImportRow,
  getStockMapByProductCode,
  getOrderDocumentCode,
  makeImportOrderGroupKey,
  makeSalesOrderGroupKey,
  cloneRawRowForImport,
  flattenCommitRows,
  flattenAdjustedCommitRows,
  applyAdjustedQuantityToRow,
  normalizeShortageRows,
  summarizeOrderShortages,
  preloadPromotionProductsByCode,
  preloadPromotionCustomersByCode,
  pickPromotionProductRulePayload,
  pickPromotionGroupItemPayload,
  pickPromotionGroupRulePayload,
  pickPromotionQuantityGroupDiscountPayload,
  pickPromotionCustomerOrderValueDiscountPayload,
  dedupePromotionPayloads,
  promotionBulkChunks,
  normalizeImportRole,
  normalizeImportActive,
  pickUserImportPayload
};