function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function ensurePostingShape(data) {
  if (!data.postings) data.postings = [];
  return data;
}

function calculateInventory(data, filters = {}) {
  ensurePostingShape(data);

  const productCode = normalizeCode(filters.productCode);
  const warehouseCode = normalizeCode(filters.warehouseCode);

  const stockMap = new Map();

  data.postings
    .filter(posting => posting.isCancelled !== true)
    .filter(posting => !productCode || normalizeCode(posting.productCode) === productCode)
    .filter(posting => !warehouseCode || normalizeCode(posting.warehouseCode) === warehouseCode)
    .forEach(posting => {
      const key = `${normalizeCode(posting.productCode)}__${normalizeCode(posting.warehouseCode)}`;
      const current = stockMap.get(key) || {
        productCode: normalizeCode(posting.productCode),
        productName: posting.productName || '',
        warehouseCode: normalizeCode(posting.warehouseCode),
        warehouseName: posting.warehouseName || '',
        qtyIn: 0,
        qtyOut: 0,
        stock: 0,
        amountIn: 0,
        amountOut: 0
      };

      current.qtyIn += Number(posting.qtyIn || 0);
      current.qtyOut += Number(posting.qtyOut || 0);
      current.stock = current.qtyIn - current.qtyOut;
      current.amountIn += Number(posting.amountIn || 0);
      current.amountOut += Number(posting.amountOut || 0);

      if (posting.productName) current.productName = posting.productName;
      if (posting.warehouseName) current.warehouseName = posting.warehouseName;

      stockMap.set(key, current);
    });

  return Array.from(stockMap.values()).sort((a, b) => {
    if (a.warehouseCode !== b.warehouseCode) return a.warehouseCode.localeCompare(b.warehouseCode);
    return a.productCode.localeCompare(b.productCode);
  });
}

function getStock(data, productCode, warehouseCode) {
  const rows = calculateInventory(data, { productCode, warehouseCode });
  return rows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
}

module.exports = {
  calculateInventory,
  getStock
};
