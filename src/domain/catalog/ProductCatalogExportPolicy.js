'use strict';

function numericOrBlank(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

/**
 * Quy cách Excel là số lượng đóng gói thuần (ví dụ 24), không phải chuỗi mô tả đơn vị.
 */
function packingQty(product = {}) {
  const value = numericOrBlank(
    product.conversionRate
    ?? product.packingQty
    ?? product.unitsPerCase
    ?? product.packSize
  );
  return value !== '' && value > 0 ? value : '';
}

/**
 * Giá bán Excel luôn lấy từ danh mục sản phẩm hiện tại.
 * Không fallback sang giá chứng từ hoặc giá sau khuyến mại.
 */
function salePrice(product = {}) {
  return numericOrBlank(product.salePrice ?? product.price ?? product.sellPrice);
}

function metadata(product = {}) {
  return {
    packingQty: packingQty(product),
    salePrice: salePrice(product)
  };
}

module.exports = {
  numericOrBlank,
  packingQty,
  salePrice,
  metadata
};
