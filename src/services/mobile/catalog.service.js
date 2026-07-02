'use strict';

const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const InternalSaleAllocation = require('../../models/InternalSaleAllocation');
const inventoryStockService = require('../inventoryStock.service');
const internalSaleAllocationService = require('../internalSaleAllocation.service');
const customerMonthlySalesService = require('../customerMonthlySales.service');
const DebtReadService = require('../DebtReadService');
const { parseMobilePagination, buildPagination } = require('./mobilePagination.util');
const { toNumber, stripMongoFields, formatCaseLooseQty } = require('../../utils/common.util');
const { normalizeText } = require('../../utils/search.util');
const { escapeRegex } = require('../../utils/query.util');
const { customerOwnershipFilterForSalesUser, combineFilters } = require('../../domain/staff/customerOwnership');

const MOBILE_CATALOG_METADATA_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.MOBILE_CATALOG_METADATA_CACHE_TTL_MS || process.env.MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS || 15000)
);
const MOBILE_CATALOG_METADATA_CACHE_MAX_ENTRIES = Math.max(
  10,
  Number(process.env.MOBILE_CATALOG_METADATA_CACHE_MAX_ENTRIES || process.env.MOBILE_CATALOG_PRODUCTS_CACHE_MAX_ENTRIES || 200)
);
const mobileCatalogProductMetadataCache = new Map();
const mobileCatalogProductGroupCache = new Map();

function invalidateMobileCatalogProductsCache() {
  mobileCatalogProductMetadataCache.clear();
  mobileCatalogProductGroupCache.clear();
}

function cacheGet(map, key) {
  const row = map.get(key);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) map.delete(key);
    return null;
  }
  return row.value;
}

function pruneCache(map) {
  const now = Date.now();
  for (const [key, row] of map.entries()) {
    if (!row || row.expiresAt <= now) map.delete(key);
  }
  while (map.size >= MOBILE_CATALOG_METADATA_CACHE_MAX_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function cacheSet(map, key, value, ttlMs) {
  if (ttlMs > 0) {
    pruneCache(map);
    map.delete(key);
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  return value;
}

function regexFilter(q, fields = []) {
  const keyword = String(q || '').trim();
  if (!keyword) return { isActive: { $ne: false } };
  return {
    isActive: { $ne: false },
    $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(keyword), $options: 'i' } }))
  };
}

function truthyFlag(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function cleanCode(value = '') {
  return String(value || '').trim();
}

function lower(value = '') {
  return cleanCode(value).toLowerCase();
}

function normalizeProductCode(value = '') {
  return inventoryStockService.normalizeProductCode(value);
}

function productCodeOf(product = {}) {
  return cleanCode(product.code || product.productCode || product.sku || product.id || product._id || '');
}

function inferPackingRateFromText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const match = text.match(/(?:\/|\b)(\d{1,4})\s*(chai|gói|bộ|cây|túi|hộp|dây|cái|bánh|tuýp|lon|thùng|pcs|pc)\b/i);
    if (match) {
      const rate = toNumber(match[1]);
      if (rate > 1) return rate;
    }
  }
  return 1;
}

function packingRateOf(product = {}) {
  const explicit = toNumber(
    product.conversionRate ||
    product.packingQty ||
    product.unitsPerCase ||
    product.packQty ||
    product.qtyPerCase ||
    0
  );
  if (explicit > 1) return explicit;
  return inferPackingRateFromText(
    product.packing,
    product.name,
    product.productName,
    product.unit,
    product.baseUnit
  );
}

async function enrichProductsWithInventory(products = []) {
  const normalizedProducts = (products || []).map(stripMongoFields);
  const codes = normalizedProducts.map(productCodeOf).filter(Boolean);
  const normalizedCodes = codes.map(normalizeProductCode).filter(Boolean);
  const quotaEnforced = internalSaleAllocationService.isQuotaEnabled();
  const [stockMap, allocationRows] = await Promise.all([
    inventoryStockService.getAvailableStocks(codes),
    quotaEnforced
      ? InternalSaleAllocation.find({ productCode: { $in: normalizedCodes }, status: 'active' })
        .select('id code importId importCode snapshotDate snapshotAt productCode openingQty consumedQty releasedQty remainingQty activatedAt updatedAt')
        .lean()
      : Promise.resolve([])
  ]);
  const allocationMap = new Map((allocationRows || []).map((row) => [normalizeProductCode(row.productCode), row]));

  return normalizedProducts.map((product) => {
    const code = productCodeOf(product);
    const stockKey = normalizeProductCode(code);
    const availableQty = toNumber(stockMap[stockKey] ?? stockMap[code] ?? 0);
    const conversionRate = Math.max(1, packingRateOf(product));
    const stockDisplay = formatCaseLooseQty(availableQty, conversionRate);
    const allocation = allocationMap.get(stockKey) || null;
    const recommendedRemainingQty = Math.max(0, toNumber(allocation?.remainingQty));
    const maxOrderQty = quotaEnforced
      ? Math.max(0, Math.min(availableQty, recommendedRemainingQty))
      : Math.max(0, availableQty);

    return {
      ...product,
      id: cleanCode(product.id || product._id || code),
      code,
      productCode: cleanCode(product.productCode || code),
      sku: cleanCode(product.sku || code),
      name: cleanCode(product.name || product.productName || ''),
      productName: cleanCode(product.productName || product.name || ''),
      conversionRate,
      packingQty: conversionRate,
      unitsPerCase: conversionRate,
      availableQty,
      availableStock: availableQty,
      stockQuantity: availableQty,
      stock: availableQty,
      _availableQty: availableQty,
      stockDisplay,
      maxOrderQty,
      internalSaleQuota: {
        enforced: quotaEnforced,
        enabled: quotaEnforced && Boolean(allocation),
        allocationId: cleanCode(allocation?.id || allocation?._id || ''),
        importId: cleanCode(allocation?.importId || ''),
        snapshotDate: cleanCode(allocation?.snapshotDate || ''),
        snapshotAt: cleanCode(allocation?.snapshotAt || ''),
        openingQty: Math.max(0, toNumber(allocation?.openingQty)),
        consumedQty: Math.max(0, toNumber(allocation?.consumedQty)),
        releasedQty: Math.max(0, toNumber(allocation?.releasedQty)),
        remainingQty: recommendedRemainingQty,
        currentlyAllowedQty: maxOrderQty,
        display: formatCaseLooseQty(recommendedRemainingQty, conversionRate)
      },
      inventorySource: 'inventories',
      stockSource: 'inventoryStock.service',
      stockFreshAt: new Date().toISOString()
    };
  });
}


function clampSalesProductLimit(value, fallback = 20, max = 50) {
  const parsed = Number.parseInt(value, 10);
  const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(1, Math.min(requested, max));
}

function mobileProductSearchTooShort(q = '') {
  return String(q || '').trim().length < 2;
}

function productGroupFilter(rawGroup = '') {
  const group = String(rawGroup || '').trim();
  if (!group) return {};
  const exact = new RegExp(`^${escapeRegex(group)}$`, 'i');
  return {
    $or: [
      { category: exact },
      { categoryName: exact },
      { group: exact },
      { groupName: exact },
      { productGroup: exact },
      { productGroupName: exact }
    ]
  };
}

function customerDebtValue(customer = {}, debtMap = new Map()) {
  const keys = [customer.code, customer.customerCode, customer.id, customer._id, customer.customerId]
    .map(lower)
    .filter(Boolean);
  const found = keys.map((key) => debtMap.get(key)).find((value) => value !== undefined);
  return Math.max(0, toNumber(found));
}

async function loadProductMetadataPage({ filter, page, limit, skip }) {
  const [rows, totalRows] = await Promise.all([
    Product.find(filter)
      .select('id code productCode sku barcode name productName unit baseUnit conversionRate packing packingQty unitsPerCase brand category categoryName group groupName productGroup productGroupName salePrice price isActive')
      .sort({ code: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter)
  ]);
  return { rows, totalRows, page, limit };
}

function createMobileCatalogService(ctx = {}) {
  async function customers({ query = {}, mobileUser = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const all = truthyFlag(query.all);
    const paginationInput = all
      ? { page: 1, limit: Math.min(Math.max(toNumber(query.limit || 1000), 1), 1000), skip: 0 }
      : parseMobilePagination(query, { defaultLimit: q ? 40 : 40, maxLimit: 100 });
    const { page, limit, skip } = paginationInput;
    const role = String(mobileUser.role || '').trim().toLowerCase();
    const ownershipFilter = role === 'sales' ? customerOwnershipFilterForSalesUser(mobileUser) : {};
    const filter = combineFilters(
      regexFilter(q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route', 'searchText']),
      ownershipFilter
    );

    const [rows, totalRows] = await Promise.all([
      Customer.find(filter)
        .select('id code customerCode name customerName businessName phone address area route salesStaffCode salesStaffName salesmanCode salesmanName assignedSalesStaffCode assignedSalesStaffName nvbhCode nvbhName maNVBH tenNVBH isActive')
        .sort({ code: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter)
    ]);

    const rawCustomers = rows.map(stripMongoFields);
    const salesMonth = customerMonthlySalesService.normalizeMonthKey(query.month);
    const [monthlySales, debtMap] = await Promise.all([
      customerMonthlySalesService.loadMonthlySalesByCustomer(rawCustomers, { month: salesMonth }),
      DebtReadService.loadDebtBalancesForCustomers(rawCustomers)
    ]);
    const customersWithSales = customerMonthlySalesService.attachMonthlySales(rawCustomers, monthlySales, salesMonth);
    const customers = customersWithSales.map((customer) => ({
      ...customer,
      debtAmount: customerDebtValue(customer, debtMap),
      currentDebt: customerDebtValue(customer, debtMap)
    }));
    const pagination = buildPagination({ page, limit, totalRows });

    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-catalog-paged-with-monthly-sales-and-debt',
        salesMonth,
        customers,
        items: customers,
        total: totalRows,
        pagination
      }
    };
  }

  async function productGroups() {
    const cacheKey = 'active-groups';
    let groups = cacheGet(mobileCatalogProductGroupCache, cacheKey);
    const cacheHit = Boolean(groups);
    if (!groups) {
      const rows = await Product.aggregate([
        { $match: { isActive: { $ne: false } } },
        {
          $project: {
            values: [
              '$category',
              '$categoryName',
              '$group',
              '$groupName',
              '$productGroup',
              '$productGroupName'
            ]
          }
        },
        { $unwind: '$values' },
        { $project: { value: { $trim: { input: { $ifNull: ['$values', ''] } } } } },
        { $match: { value: { $ne: '' } } },
        { $group: { _id: { $toLower: '$value' }, name: { $first: '$value' } } },
        { $sort: { name: 1 } },
        { $limit: 500 }
      ]).exec();
      groups = rows.map((row) => cleanCode(row.name)).filter(Boolean);
      cacheSet(mobileCatalogProductGroupCache, cacheKey, groups, MOBILE_CATALOG_METADATA_CACHE_TTL_MS);
    }
    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-product-groups-distinct',
        cacheHit,
        groups,
        items: groups,
        total: groups.length
      }
    };
  }

  async function products({ query = {} } = {}) {
    const q = String(query.q || query.search || '').trim();
    const rawGroup = String(query.group || query.category || query.productGroup || '').trim();
    const normalizedGroup = normalizeText(rawGroup);
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = clampSalesProductLimit(query.limit, 20, 50);
    const skip = (page - 1) * limit;

    // App bán hàng không được trả catalog sản phẩm khi ô tìm kiếm rỗng/quá ngắn.
    // Người dùng phải gõ tối thiểu 2 ký tự, sau đó backend mới tìm và lọc tồn mở bán.
    if (mobileProductSearchTooShort(q)) {
      const pagination = buildPagination({ page: 1, limit, totalRows: 0 });
      return {
        body: {
          ok: true,
          success: true,
          source: 'mobile-catalog-min-keyword-guard',
          inventorySource: 'inventories',
          products: [],
          items: [],
          total: 0,
          pagination,
          message: 'Nhập ít nhất 2 ký tự để tìm sản phẩm'
        }
      };
    }

    const inStockFlag = String(query.inStockOnly ?? query.onlyInStock ?? '1') !== '0';
    const candidateLimit = inStockFlag ? Math.min(Math.max(limit * 5, limit), 250) : limit;
    const filter = combineFilters(
      regexFilter(q, ['code', 'productCode', 'sku', 'name', 'productName', 'barcode', 'brand', 'category', 'groupName', 'productGroup', 'searchText']),
      productGroupFilter(rawGroup)
    );
    const cacheKey = JSON.stringify({ q, group: normalizedGroup, page, candidateLimit });
    let metadata = cacheGet(mobileCatalogProductMetadataCache, cacheKey);
    const metadataCacheHit = Boolean(metadata);
    if (!metadata) {
      metadata = await loadProductMetadataPage({ filter, page, limit: candidateLimit, skip });
      cacheSet(mobileCatalogProductMetadataCache, cacheKey, metadata, MOBILE_CATALOG_METADATA_CACHE_TTL_MS);
    }

    let products = await enrichProductsWithInventory(metadata.rows);
    if (inStockFlag) products = products.filter((product) => toNumber(product.availableQty) > 0);
    products = products.slice(0, limit);
    const pagination = buildPagination({ page, limit, totalRows: products.length });

    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-catalog-metadata-cache-live-stock',
        inventorySource: 'inventories',
        metadataCacheHit,
        metadataCacheTtlMs: MOBILE_CATALOG_METADATA_CACHE_TTL_MS,
        stockCached: false,
        products,
        items: products,
        total: products.length,
        pagination
      }
    };
  }

  async function stock({ query = {} } = {}) {
    const productCode = String(query.productCode || query.code || query.sku || query.q || query.search || '').trim();
    const stock = productCode
      ? await inventoryStockService.getAvailableStock(productCode)
      : {};
    return { body: { ok: true, success: true, source: 'mobile-catalog-route', inventorySource: 'inventories', stock } };
  }

  return { customers, productGroups, products, stock };
}

module.exports = {
  createMobileCatalogService,
  invalidateMobileCatalogProductsCache,
  _internal: {
    productGroupFilter,
    customerDebtValue,
    loadProductMetadataPage
  }
};
