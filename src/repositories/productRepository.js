'use strict';

const Product = require('../models/Product');
const { buildIdentityFilter } = require('../utils/identity.util');
const { getPagination, wantsPagination, buildPageMeta, escapeRegex } = require('../utils/query.util');

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function buildMongoFilter(idOrCode) {
  return buildIdentityFilter(idOrCode, ['code']);
}

function baseFilter(query = {}) {
  const activeOnly = String(query.activeOnly || '') === '1';
  const filter = {};
  if (activeOnly) filter.isActive = { $ne: false };
  return filter;
}

function searchKeyword(query = {}) {
  return String(query.q || query.search || '').trim();
}

function isNumericKeyword(value = '') {
  return /^\d+$/.test(String(value || '').trim());
}

function buildQueryFilter(query = {}) {
  const filter = baseFilter(query);
  const q = searchKeyword(query);
  if (q) {
    const rawRegex = escapeRegex(q);
    const normalizedRegex = escapeRegex(normalizeSearchText(q));

    // Danh sách sản phẩm và autocomplete phải xử lý mã số thật chặt:
    // - Nếu người dùng gõ toàn số, chỉ dò trong các trường định danh sản phẩm.
    // - Không dò tên/nhóm/quy cách/searchText vì rất dễ trả về hàng loạt sản phẩm không liên quan.
    // Ví dụ gõ 62674330 phải ra đúng mã đó, gõ 4551 chỉ ra mã/barcode có chứa 4551.
    if (isNumericKeyword(q)) {
      filter.$or = [
        { code: { $regex: rawRegex, $options: 'i' } },
        { sku: { $regex: rawRegex, $options: 'i' } },
        { productCode: { $regex: rawRegex, $options: 'i' } },
        { barcode: { $regex: rawRegex, $options: 'i' } }
      ];
      return filter;
    }

    filter.$or = [
      { code: { $regex: rawRegex, $options: 'i' } },
      { sku: { $regex: rawRegex, $options: 'i' } },
      { productCode: { $regex: rawRegex, $options: 'i' } },
      { barcode: { $regex: rawRegex, $options: 'i' } },
      { name: { $regex: rawRegex, $options: 'i' } },
      { category: { $regex: rawRegex, $options: 'i' } },
      { brand: { $regex: rawRegex, $options: 'i' } },
      { warehouseCode: { $regex: rawRegex, $options: 'i' } },
      { warehouseName: { $regex: rawRegex, $options: 'i' } },
      { packing: { $regex: rawRegex, $options: 'i' } },
      { unit: { $regex: rawRegex, $options: 'i' } },
      { baseUnit: { $regex: rawRegex, $options: 'i' } },
      { searchText: { $regex: normalizedRegex, $options: 'i' } }
    ];
  }
  return filter;
}

function productSearchRank(product = {}, keyword = '') {
  const qRaw = String(keyword || '').trim();
  const q = normalizeSearchText(qRaw);
  if (!q) return 0;

  const code = normalizeSearchText(product.code || product.sku || product.productCode || '');
  const sku = normalizeSearchText(product.sku || '');
  const productCode = normalizeSearchText(product.productCode || '');
  const barcode = normalizeSearchText(product.barcode || '');
  const name = normalizeSearchText(product.name || '');
  const category = normalizeSearchText(product.category || '');
  const brand = normalizeSearchText(product.brand || '');
  const packing = normalizeSearchText(product.packing || '');
  const warehouseCode = normalizeSearchText(product.warehouseCode || '');
  const warehouseName = normalizeSearchText(product.warehouseName || '');
  const searchText = normalizeSearchText(product.searchText || '');

  const codes = [code, sku, productCode].filter(Boolean);

  // Điểm càng nhỏ càng ưu tiên cao.
  if (codes.some(v => v === q)) return 10;
  if (barcode && barcode === q) return 12;
  if (codes.some(v => v.startsWith(q))) return 20;
  if (barcode && barcode.startsWith(q)) return 25;
  if (codes.some(v => v.includes(q))) return 30;
  if (barcode && barcode.includes(q)) return 35;
  if (name.startsWith(q)) return 40;
  if (name.includes(q)) return 50;
  if (category.includes(q) || brand.includes(q) || warehouseCode.includes(q) || warehouseName.includes(q) || packing.includes(q)) return 60;
  if (searchText.includes(q)) return 70;
  return 0;
}

function sortRankedProducts(rows = [], keyword = '') {
  return (rows || [])
    .map(row => ({ row, rank: productSearchRank(row, keyword) }))
    .filter(item => item.rank > 0)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return String(a.row.code || a.row.name || '').localeCompare(String(b.row.code || b.row.name || ''), 'vi', { numeric: true });
    })
    .map(item => item.row);
}

async function findAll(query = {}) {
  // Phase 3.6 table search clean:
  // Danh sách sản phẩm chạy giống danh sách khách hàng:
  // q -> buildQueryFilter -> Product.find(filter) -> countDocuments(filter) -> trả bảng.
  // Không xếp hạng/lọc lại bằng JS trong repository, không fallback trang đầu.
  const filter = buildQueryFilter(query);
  if (!wantsPagination(query)) return Product.find(filter).sort({ code: 1 }).lean();

  const page = getPagination(query);
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ code: 1 }).skip(page.skip).limit(page.limit).lean(),
    Product.countDocuments(filter)
  ]);
  return { rows, meta: buildPageMeta({ ...page, total }) };
}

async function search(query = {}) {
  const q = searchKeyword(query);
  const limit = Math.min(Number.parseInt(query.limit, 10) || 20, 50);

  if (!q) return [];

  const filter = buildQueryFilter({ ...query, activeOnly: query.activeOnly ?? '1' });
  const candidates = await Product.find(filter)
    .select('code name unit baseUnit conversionRate packing barcode category brand warehouseCode warehouseName salePrice costPrice minStock maxStock isActive searchText')
    .sort({ code: 1 })
    .lean();

  return sortRankedProducts(candidates, q).slice(0, limit);
}

async function findByIdOrCode(idOrCode) {
  return Product.findOne(buildMongoFilter(idOrCode));
}

async function findDuplicateCode(code, exceptId) {
  const filter = { code };
  if (exceptId) filter._id = { $ne: exceptId };
  return Product.findOne(filter).select('_id').lean();
}

async function findDuplicateBarcode(barcode, exceptId) {
  if (!barcode) return null;
  const filter = { barcode };
  if (exceptId) filter._id = { $ne: exceptId };
  return Product.findOne(filter).select('_id').lean();
}

async function create(payload) {
  return Product.create(payload);
}

async function save(document, options = {}) {
  if (document && typeof document.save === 'function') return document.save({ session: options.session });
  return document;
}

module.exports = {
  buildMongoFilter,
  findAll,
  search,
  findByIdOrCode,
  findDuplicateCode,
  findDuplicateBarcode,
  create,
  save,
  normalizeSearchText,
  productSearchRank,
  isNumericKeyword
};
