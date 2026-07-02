'use strict';

const dateUtil = require('../utils/date.util');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const inventoryStockService = require('./inventoryStock.service');
const { verifyPassword } = require('../security/passwordPolicy');
const { readRefreshToken } = require('../security/refreshTokenCookie');
const User = require('../models/User');
const { MongoStore } = require('./mongoSyncService');
const arDebtRuntimeView = require('./accounting/arDebtRuntimeView.service');
const { escapeRegex } = require('../utils/query.util');


function inventoryRowOpenSaleQty(row = {}) {
  return inventoryStockService.quantityOf(row);
}

function canonicalProductCode(product = {}) {
  return String(product.code || product.productCode || product.sku || '').trim();
}

async function getInventoryQtyForProduct(product = {}) {
  const stock = await inventoryStockService.getAvailableStock(canonicalProductCode(product) || String(product.id || product._id || '').trim());
  return Number(stock.availableQty || 0);
}

function createMobileService(ctx) {
  const {
    ROLE_LABELS,
    VALID_ROLES,
    ACCESS_TOKEN_EXPIRES_IN,
    normalizeText,
    toNumber,
    staffMongoToClient,
    customerMongoToClient,
    productMongoToClient,
    stripMongoFields,
    buildJwtPayload,
    encodeMobileToken,
    encodeMobileRefreshToken,
    decodeMobileRefreshToken,
    getPrimaryDataSnapshot,
    persistPrimaryDataSnapshot,
    saveOperationalData,
    refreshOrderDocumentCacheFromMongo,
    writeMobileLog,
    writeMobileLogDirect,
    findCustomer,
    findProduct,
    getProductAvailableQty,
    formatCaseLooseQty,
    buildProductLineMeta,
    reduceStock,
    makeId,
    buildSalesCode,
    buildCashCode,
    updateSalesOrderWithRepost,
    buildMobileProduct
  } = ctx;

  function fail(statusCode, message) {
    return { statusCode, body: { ok: false, success: false, message } };
  }

  // MOBILE_LEGACY_SALES_OWNERSHIP_NO_GENERIC_STAFF_START
  function getMobileSalesStaffCode(mobileUser = {}) {
    return String(
      mobileUser.salesStaffCode ||
      mobileUser.staffCode ||
      mobileUser.code ||
      ''
    ).trim();
  }

  function getMobileSalesStaffName(mobileUser = {}) {
    return String(
      mobileUser.salesStaffName ||
      mobileUser.fullName ||
      mobileUser.name ||
      ''
    ).trim();
  }

  function isOwnedByMobileSalesUser(order = {}, mobileUser = {}) {
    const userSalesCode = normalizeText(getMobileSalesStaffCode(mobileUser));
    if (!userSalesCode) return false;

    return normalizeText(order.salesStaffCode || order.salesmanCode) === userSalesCode;
  }
  // MOBILE_LEGACY_SALES_OWNERSHIP_NO_GENERIC_STAFF_END

  async function login({ body = {} }) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    if (!username || !password) return fail(400, 'Thiếu tài khoản hoặc mật khẩu');

    const staffDoc = await User.findOne({
      isActive: { $ne: false },
      $or: [
        { username },
        { code: username },
        { staffCode: username },
        { phone: username }
      ]
    }).lean();
    const passwordValid = await verifyPassword(password, staffDoc && staffDoc.password);
    const user = staffDoc && passwordValid ? buildJwtPayload(staffDoc) : null;
    if (!user) return fail(401, 'Sai tài khoản hoặc mật khẩu');
    if (['sales', 'delivery'].includes(user.role) && !user.staffCode) {
      return fail(400, 'Tài khoản chưa được gán mã nhân viên nghiệp vụ');
    }

    await writeMobileLogDirect(user, 'mobile_login', { note: 'Đăng nhập mobile app bằng users' });
    return { body: { ok: true, success: true, source: 'mobile-users-route', token: encodeMobileToken(user), refreshToken: encodeMobileRefreshToken(user), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user } };
  }

  async function refresh({ req = {}, body = {} }) {
    req.body = body;
    const refreshToken = readRefreshToken(req);
    const payload = decodeMobileRefreshToken(refreshToken);
    if (!payload) return fail(401, 'Refresh token không hợp lệ hoặc đã hết hạn');
    const or = [];
    if (/^[a-f\d]{24}$/i.test(String(payload.id || ''))) or.push({ _id: payload.id });
    if (payload.id) or.push({ id: payload.id });
    if (payload.username) or.push({ username: payload.username });
    if (payload.staffCode) or.push({ staffCode: payload.staffCode });
    if (payload.code) or.push({ code: payload.code });
    const currentUser = or.length ? await User.findOne({ isActive: { $ne: false }, $or: or }).lean() : null;
    if (!currentUser) return fail(401, 'Tài khoản không còn hoạt động');
    const safeUser = buildJwtPayload(currentUser);
    return { body: { ok: true, success: true, source: 'mobile-route', token: encodeMobileToken(safeUser), refreshToken: encodeMobileRefreshToken(safeUser), expiresIn: ACCESS_TOKEN_EXPIRES_IN, user: safeUser } };
  }

  async function me({ mobileUser }) {
    return { body: { ok: true, user: mobileUser, roles: ROLE_LABELS } };
  }

  async function roles() {
    const roles = await MongoStore.roles.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
    return { body: { ok: true, source: 'mobile-users-route', roles: roles.map(stripMongoFields), roleLabels: ROLE_LABELS } };
  }

  async function customers({ query = {} }) {
    const q = normalizeText(query.q);
    const wantsAll = String(query.all || '').toLowerCase() === '1' || String(query.all || '').toLowerCase() === 'true';
    const requestedLimit = Math.min(Math.max(toNumber(query.limit || (wantsAll ? 10000 : (q ? 200 : 5000))), 1), 10000);
    const filter = { isActive: { $ne: false } };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } },
        { area: { $regex: q, $options: 'i' } },
        { route: { $regex: q, $options: 'i' } }
      ];
    }
    const rows = await Customer.find(filter).sort({ code: 1 }).limit(requestedLimit).lean();
    const clientCustomers = rows.map(customerMongoToClient);
    const customerCodes = Array.from(new Set(clientCustomers.map((customer) => String(customer.customerCode || customer.code || '').trim()).filter(Boolean)));
    const debtMap = await arDebtRuntimeView.getCustomerDebtMap(customerCodes, { status: 'all' });
    const debtForCustomer = (customer = {}) => {
      const code = String(customer.customerCode || customer.code || '').trim();
      return debtMap.get(code) || arDebtRuntimeView._internal.emptyCustomerDebt(code);
    };
    let items = clientCustomers.map((customer) => ({
      id: customer.id,
      code: customer.code,
      customerCode: customer.customerCode || customer.code,
      name: customer.name,
      customerName: customer.customerName || customer.name,
      phone: customer.phone,
      address: customer.address,
      area: customer.area,
      route: customer.route || '',
      legacyStaffCode: customer.legacyStaffCode || customer.staffCode || '',
      legacyStaffName: customer.legacyStaffName || customer.staffName || '',
      // Chỉ giữ để UI cũ hiển thị, không dùng match/tạo đơn mới.
      staffCode: customer.legacyStaffCode || customer.staffCode || '',
      staffName: customer.legacyStaffName || customer.staffName || '',
      debtAmount: debtForCustomer(customer).currentDebtAmount,
      currentDebt: debtForCustomer(customer).currentDebtAmount,
      currentDebtAmount: debtForCustomer(customer).currentDebtAmount,
      debtSource: debtForCustomer(customer).debtSource,
      monthRevenue: customer.monthRevenue || customer.monthSales || 0,
      isActive: customer.isActive !== false
    }));
    if (q) {
      items = items.filter((item) => [item.code, item.customerCode, item.name, item.customerName, item.phone, item.address, item.area, item.route].some((value) => normalizeText(value).includes(q))).slice(0, 80);
    }
    return { body: { ok: true, source: 'mobile-users-route', items, total: items.length, cachedCatalog: !q || wantsAll } };
  }

  async function products({ query = {} }) {
    const rawQ = String(query.q || query.search || '').trim();
    const q = normalizeText(rawQ);
    // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_START: lọc catalog/gợi ý sản phẩm theo Nhóm hàng của danh mục sản phẩm.
    const groupKeyword = normalizeText(query.group || query.groupName || query.category || query.categoryName || query.productGroup || query.productGroupName);
    const requestedLimit = Math.min(Math.max(toNumber(query.limit || 20), 1), 50);
    const candidateLimit = Math.min(Math.max(requestedLimit * 5, requestedLimit), 250);
    const filter = { isActive: { $ne: false } };
    if (rawQ.length < 2) {
      return { body: { ok: true, source: 'mobile-users-route-min-keyword-guard', items: [], total: 0, cachedCatalog: false, message: 'Nhập ít nhất 2 ký tự để tìm sản phẩm' } };
    }
    const rawRegex = { $regex: escapeRegex(rawQ), $options: 'i' };
    filter.$or = [
      { code: rawRegex },
      { sku: rawRegex },
      { productCode: rawRegex },
      { name: rawRegex },
      { productName: rawRegex },
      { barcode: rawRegex },
      { category: rawRegex },
      { categoryName: rawRegex },
      { groupName: rawRegex },
      { productGroup: rawRegex },
      { productGroupName: rawRegex },
      { searchText: { $regex: escapeRegex(q), $options: 'i' } }
    ];
    // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_END

    // App bán hàng chỉ nhận sản phẩm còn tồn mở bán; không trả toàn bộ catalog khi ô tìm kiếm rỗng.
    const rows = await Product.find(filter).sort({ code: 1 }).limit(candidateLimit).lean();
    const data = await getPrimaryDataSnapshot();
    let items = await Promise.all(rows.map(productMongoToClient).map(async (product) => {
      const availableQty = await getInventoryQtyForProduct(product);
      return {
        id: product.id,
        code: product.code,
        sku: product.sku || product.code,
        productCode: product.productCode || product.code,
        name: product.name,
        unit: product.unit,
        baseUnit: product.baseUnit || '',
        conversionRate: toNumber(product.conversionRate || 1),
        packing: product.packing || '',
        units: product.units || [],
        barcode: product.barcode,
        // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_FIELDS_START: trả đủ alias Nhóm hàng cho app mobile.
        category: product.category || product.groupName || product.productGroup || product.group || '',
        categoryName: product.categoryName || product.category || product.groupName || product.productGroupName || '',
        group: product.group || product.category || '',
        groupName: product.groupName || product.category || product.productGroupName || product.productGroup || '',
        productGroup: product.productGroup || product.category || product.group || '',
        productGroupName: product.productGroupName || product.categoryName || product.category || product.groupName || '',
        brand: product.brand || '',
        // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_FIELDS_END
        price: toNumber(product.salePrice || product.price || 0),
        salePrice: toNumber(product.salePrice || product.price || 0),
        availableQty,
        stockQuantity: availableQty,
        availableStock: availableQty,
        stockDisplay: formatCaseLooseQty(availableQty, product.conversionRate || 1),
        isOutOfStock: toNumber(availableQty) <= 0
      };
    }));

    // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_APPLY_START: Nhóm hàng là bộ lọc hẹp, còn q là tìm trong nhóm đã chọn.
    if (groupKeyword) {
      items = items.filter((item) => [
        item.groupName,
        item.group,
        item.productGroup,
        item.productGroupName,
        item.category,
        item.categoryName
      ].some((value) => normalizeText(value) === groupKeyword || normalizeText(value).includes(groupKeyword)));
    }

    if (q) {
      items = items.filter((item) => [
        item.code,
        item.sku,
        item.productCode,
        item.name,
        item.barcode,
        item.category,
        item.categoryName,
        item.groupName,
        item.productGroupName
      ].some((value) => normalizeText(value).includes(q)));
    }
    // MOBILE_PRODUCT_GROUP_FILTER_BACKEND_APPLY_END

    const onlyInStock = String(query.inStockOnly ?? '1') !== '0';
    if (onlyInStock) items = items.filter((item) => Number(item.availableQty || 0) > 0);
    items = items.slice(0, requestedLimit);

    return { body: { ok: true, source: 'mobile-users-route', items, total: items.length, cachedCatalog: false } };
  }

  async function stock({ query = {} }) {
    const data = await getPrimaryDataSnapshot();
    const q = normalizeText(query.q);
    const filter = { isActive: { $ne: false } };
    if (q) {
      filter.$or = [
        { code: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
        { productCode: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { barcode: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ];
    }
    const rows = await Product.find(filter).sort({ code: 1 }).limit(200).lean();
    const items = rows.map(productMongoToClient).map((product) => buildMobileProduct(data, product)).filter((item) => toNumber(item.availableQty) > 0).slice(0, 100);
    return { body: { ok: true, source: 'mobile-users-route', items } };
  }

  async function createSalesOrder({ body = {}, mobileUser }) {
    const data = await getPrimaryDataSnapshot();
    const customerPayload = body.customer || {};
    const customer = findCustomer(data, customerPayload.id || customerPayload.code || body.customerId || body.customerCode);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const paidAmount = toNumber(body.paidAmount);
    const date = dateUtil.todayVN();

    if (!customer) return fail(400, 'Không tìm thấy khách hàng');
    if (!rawItems.length) return fail(400, 'Đơn mobile chưa có sản phẩm');

    const items = [];
    for (const rawItem of rawItems) {
      const product = findProduct(data, rawItem.productCode || rawItem.code || rawItem.productId);
      if (!product) return fail(400, `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}`);
      const quantity = toNumber(rawItem.quantity || rawItem.qty);
      const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
      if (quantity <= 0) return fail(400, `Số lượng phải lớn hơn 0: ${product.code}`);
      const availableQty = await getInventoryQtyForProduct(product);
      if (availableQty < quantity) return fail(400, `Không đủ tồn mở bán: ${product.code}. Tồn ${formatCaseLooseQty(availableQty, product.conversionRate || 1)}, cần ${formatCaseLooseQty(quantity, product.conversionRate || 1)}`);
      items.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        ...buildProductLineMeta(product),
        quantity,
        catalogSalePrice: salePrice,
        catalogSalePriceAtOrder: salePrice,
        finalPrice: salePrice,
        salePrice,
        price: salePrice,
        preTaxPriceAtOrder: Math.round(salePrice / 1.08),
        vatAmountAtOrder: Math.round((salePrice - (salePrice / 1.08)) * quantity),
        lineAmountAtOrder: quantity * salePrice,
        amount: quantity * salePrice,
        appliedPromotionRows: []
      });
    }

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    if (paidAmount > totalAmount) return fail(400, 'Tiền thu không được lớn hơn tổng đơn');

    const salesOrder = {
      id: makeId('SO'),
      code: buildSalesCode(data),
      date,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      salesStaffCode: getMobileSalesStaffCode(mobileUser),
      salesStaffName: getMobileSalesStaffName(mobileUser),
      salesmanCode: getMobileSalesStaffCode(mobileUser),
      salesmanName: getMobileSalesStaffName(mobileUser),
      // Không dùng generic staff để match app bán hàng.
      staffCode: '',
      staffName: '',
      source: 'mobile_sales_app',
      orderSource: 'NVBH',
      orderSourceName: 'Từ NVBH',
      vatInvoiceRequired: true,
      vatInvoiceDecisionSource: 'default',
      vatInvoiceNote: '',
      vatInvoiceUpdatedAt: '',
      vatInvoiceUpdatedBy: '',
      isChildOrder: true,
      masterOrderId: '',
      mergeStatus: 'unmerged',
      note: String(body.note || 'Tạo từ mobile app').trim(),
      items,
      totalQuantity,
      totalAmount,
      paidAmount,
      debtAmount: 0,
      currentDebtAmount: 0,
      debtSource: 'PENDING_ACCOUNTING_NOT_AR_DEBT',
      status: 'pending',
      lifecycleStatus: 'pending',
      orderDate: date,
      deliveryStatus: 'pending',
      accountingStatus: 'pending',
      stockPosted: true,
      stockPostedAt: new Date().toISOString(),
      stockPostedBy: mobileUser.code || mobileUser.name || 'mobile_sales',
      createdAt: new Date().toISOString()
    };

    data.salesOrders.push(salesOrder);
    items.forEach((item) => reduceStock(data, item));
    // Mobile sales orders post/hold stock immediately to prevent oversell.
    data.payments.push({
      id: makeId('PM'),
      date,
      type: 'sale_debt',
      refType: 'salesOrder',
      refId: salesOrder.id,
      refCode: salesOrder.code,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      debit: totalAmount,
      credit: paidAmount,
      note: `Phát sinh từ đơn mobile ${salesOrder.code}`,
      createdAt: new Date().toISOString()
    });
    if (paidAmount > 0) {
      data.cashbooks.push({
        id: makeId('CB'),
        code: buildCashCode(data, 'in'),
        date,
        type: 'in',
        source: 'mobile_sales_payment',
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        staffName: mobileUser.name || '',
        amount: paidAmount,
        note: `Thu tiền từ đơn mobile ${salesOrder.code}`,
        createdAt: new Date().toISOString()
      });
    }

    writeMobileLog(data, mobileUser, 'mobile_create_sales_order', { refType: 'salesOrder', refId: salesOrder.id, refCode: salesOrder.code, note: `Tạo đơn ${salesOrder.code} từ mobile` });
    await saveOperationalData(data);
    return { statusCode: 201, body: { ok: true, source: 'mobile-users-route', message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder } };
  }

  async function getSalesOrder({ params = {}, mobileUser }) {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const order = data.salesOrders.find((item) => item.id === params.id || item.code === params.id);
    if (!order) return fail(404, 'Không tìm thấy đơn bán');
    const mine = isOwnedByMobileSalesUser(order, mobileUser);
    if (!mine) return fail(403, 'Bạn chỉ được xem đơn của mình');
    return { body: { ok: true, order: { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' } } };
  }

  async function updateSalesOrder({ params = {}, body = {}, mobileUser }) {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const order = data.salesOrders.find((item) => item.id === params.id || item.code === params.id);
    if (!order) return fail(404, 'Không tìm thấy đơn bán');
    const mine = isOwnedByMobileSalesUser(order, mobileUser);
    if (!mine) return fail(403, 'Bạn chỉ được sửa đơn của mình');
    if (order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged') return fail(403, 'Đơn đã gộp đơn tổng, app bán hàng không được sửa. Vui lòng báo kế toán/admin sửa trong lịch sử bán hàng.');

    const customerPayload = body.customer || {};
    const patchBody = {
      ...body,
      customerId: customerPayload.id || customerPayload.code || body.customerId || body.customerCode || order.customerId,
      customerCode: customerPayload.code || body.customerCode || order.customerCode,
      salesStaffCode: getMobileSalesStaffCode(mobileUser),
      salesStaffName: getMobileSalesStaffName(mobileUser),
      salesmanCode: getMobileSalesStaffCode(mobileUser),
      salesmanName: getMobileSalesStaffName(mobileUser),
      vatInvoiceRequired: order.vatInvoiceRequired !== false,
      vatInvoiceDecisionSource: order.vatInvoiceDecisionSource || 'default',
      vatInvoiceNote: String(order.vatInvoiceNote || ''),
      vatInvoiceUpdatedAt: String(order.vatInvoiceUpdatedAt || ''),
      vatInvoiceUpdatedBy: String(order.vatInvoiceUpdatedBy || '')
    };
    const salesOrder = updateSalesOrderWithRepost(data, order, patchBody);
    writeMobileLog(data, mobileUser, 'mobile_edit_sales_order', { refType: 'salesOrder', refId: salesOrder.id, refCode: salesOrder.code, note: `Sửa đơn ${salesOrder.code} từ mobile khi chưa gộp đơn tổng` });
    await saveOperationalData(data);
    return { body: { ok: true, source: 'mobile-users-route', message: `Đã sửa đơn ${salesOrder.code}`, salesOrder } };
  }

  async function listSalesOrders({ query = {}, mobileUser }) {
    await refreshOrderDocumentCacheFromMongo();
    const data = await getPrimaryDataSnapshot();
    const today = dateUtil.todayVN();
    const onlyMine = String(query.mine || '1') !== '0';
    const rows = data.salesOrders
      .filter((order) => order.date === today)
      .filter((order) => !onlyMine || isOwnedByMobileSalesUser(order, mobileUser))
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50);
    const customerCodes = Array.from(new Set(rows.map((order) => String(order.customerCode || '').trim()).filter(Boolean)));
    const debtMap = await arDebtRuntimeView.getCustomerDebtMap(customerCodes, { status: 'all' });
    const items = rows.map((order) => {
      const runtimeDebt = debtMap.get(String(order.customerCode || '').trim()) || arDebtRuntimeView._internal.emptyCustomerDebt(order.customerCode || '');
      return {
        id: order.id,
        code: order.code,
        date: order.date,
        customerName: order.customerName,
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtAmount: runtimeDebt.currentDebtAmount,
        currentDebtAmount: runtimeDebt.currentDebtAmount,
        debtSource: runtimeDebt.debtSource,
        status: order.status,
        deliveryStatus: order.deliveryStatus || 'pending',
        masterOrderId: order.masterOrderId || '',
        masterOrderCode: order.masterOrderCode || '',
        mergeStatus: order.mergeStatus || 'unmerged',
        canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged',
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        items: order.items || [],
        note: order.note || '',
        createdAt: order.createdAt
      };
    });
    return { body: { ok: true, source: 'mobile-users-route', items } };
  }

  return { login, refresh, me, roles, customers, products, stock, createSalesOrder, getSalesOrder, updateSalesOrder, listSalesOrders };
}

module.exports = { createMobileService };
