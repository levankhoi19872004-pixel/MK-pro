'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSalesInvoice } = require('../src/domain/print/builders/SalesInvoiceBuilder');
const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');
const { renderPrintHtml, renderPrintBatchHtml } = require('../services/printService');

test('SALES_INVOICE renders from canonical builder with snapshot values', () => {
  const order = buildSalesInvoice({
    id: 'SO1',
    code: 'SO1',
    orderDate: '2026-06-13',
    customerCode: 'KH1',
    customerName: 'Khách 1',
    salesStaffCode: 'NV1',
    salesStaffName: 'NVBH 1',
    items: [{
      productCode: 'SP1',
      productName: 'Sản phẩm 1',
      quantity: 25,
      conversionRateAtOrder: 12,
      warehouseCodeAtOrder: 'KHO_PC',
      catalogSalePriceAtOrder: 14000,
      finalPrice: 13000,
      vatAmount: 1000
    }]
  });

  const html = renderPrintHtml('SALES_INVOICE', order);
  assert.match(html, /PHIẾU GIAO NHẬN VÀ THANH TOÁN/);
  assert.match(html, /SP1/);
  assert.match(html, /2\/1/);
  assert.match(html, /dms-exact-sales-invoice\.css\?v=dms-exact-v1/);

  const batch = renderPrintBatchHtml('SALES_INVOICE', [order, order], { title: 'Sales batch' });
  assert.match(batch, /<title>Sales batch<\/title>/);
  assert.ok((batch.match(/dmsx-page/g) || []).length >= 4, 'two orders should keep both invoice copies');
});

test('WAREHOUSE_PICKING renders warehouse and line-type separation consistently', () => {
  const master = { id: 'MO1', code: 'MO1', deliveryDate: '2026-06-13', childOrderIds: ['SO1'] };
  const child = {
    id: 'SO1',
    code: 'SO1',
    items: [
      { productCode: 'SP1', productName: 'Hàng bán HC', quantity: 12, conversionRateAtOrder: 12, warehouseCodeAtOrder: 'KHO_HC', catalogSalePriceAtOrder: 10000, finalPrice: 9000, lineType: 'SALE' },
      { productCode: 'SP1', productName: 'Hàng bán PC', quantity: 6, conversionRateAtOrder: 12, warehouseCodeAtOrder: 'KHO_PC', catalogSalePriceAtOrder: 10000, finalPrice: 9000, lineType: 'SALE' },
      { productCode: 'SP2', productName: 'Hàng khuyến mại', quantity: 2, conversionRateAtOrder: 1, warehouseCodeAtOrder: 'KHO_HC', catalogSalePriceAtOrder: 5000, finalPrice: 0, lineType: 'PROMO', isPromo: true }
    ]
  };
  const document = buildMasterPicking([master], [child], {
    childMasterMap: new Map([['SO1', 'MO1']]),
    productMap: new Map()
  });

  const html = renderPrintHtml('WAREHOUSE_PICKING', document);
  assert.match(html, /KHO HC - Hàng bán/);
  assert.match(html, /KHO HC - Xuất khuyến mại/);
  assert.match(html, /KHO PC - Hàng bán/);
  assert.match(html, /Giá tham chiếu/);

  const batch = renderPrintBatchHtml('WAREHOUSE_PICKING', [document, document], { title: 'Batch' });
  assert.match(batch, /<title>Batch<\/title>/);
  assert.equal((batch.match(/warehouse-picking-page/g) || []).length >= 2, true);
});
