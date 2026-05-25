function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function toNumber(value, defaultValue = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function createProduct(input = {}) {
  const code = normalizeCode(input.code || input.productCode);

  if (!code) {
    throw new Error('Mã sản phẩm không được để trống');
  }

  const name = normalizeText(input.name || input.productName);

  if (!name) {
    throw new Error('Tên sản phẩm không được để trống');
  }

  return {
    id: input.id || code,
    code,
    name,
    unit: normalizeText(input.unit || 'Thùng'),
    barcode: normalizeText(input.barcode),

    category: normalizeText(input.category),
    brand: normalizeText(input.brand || 'Unilever'),

    warehouseCode: normalizeCode(input.warehouseCode || 'KHO_CHINH'),
    warehouseName: normalizeText(input.warehouseName || 'Kho chính'),

    salePrice: toNumber(input.salePrice),
    purchasePrice: toNumber(input.purchasePrice),

    openingStock: toNumber(input.openingStock),
    minStock: toNumber(input.minStock),

    isActive: input.isActive !== false,

    note: normalizeText(input.note),

    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  createProduct,
  normalizeCode,
  normalizeText,
  toNumber
};
