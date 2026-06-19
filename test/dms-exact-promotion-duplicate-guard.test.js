'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDeliveryInvoicePayload
} = require('../services/printDataBuilder');

test('structured promotion rows must not be duplicated by legacy inline aggregate fields', () => {
  const payload = buildDeliveryInvoicePayload({
    invoiceCode: 'SO-TEST',
    orderCode: 'SO-TEST',
    customerCode: '4501218',
    customerName: 'Quân Luyến',
    salesStaffCode: '35095',
    salesStaffName: 'Nguyễn Đình Thành',
    items: [{
      productCode: '65442452',
      productName: 'COMFORT Đậm Đặc 1 Lần Xả Hương Ban Mai',
      quantity: 12,
      catalogSalePriceAtOrder: 17525,
      finalPrice: 14195,
      lineAmountAtOrder: 170343,

      // Structured rows are the authoritative promotion detail.
      appliedPromotionRows: [
        {
          promotionCode: 'AD45232124DN11',
          description: 'Bảng Giá Tháng 6',
          discountPercent: 17,
          discountBeforeTax: 33103,
          discountAfterTax: 35751
        },
        {
          promotionCode: 'AD12345678DN11',
          description: 'Lấy bất kỳ CK 2%',
          discountPercent: 2,
          discountBeforeTax: 3894,
          discountAfterTax: 4206
        }
      ],

      // Legacy aggregate fields must not generate a third 19% row.
      promotionCode: 'AD45232124DN11',
      promotionDescription: 'Bảng Giá Tháng 6',
      discountPercent: 19,
      discountBeforeTax: 36997,
      discountAfterTax: 39957
    }]
  });

  assert.equal(payload.promotions.length, 2);
  assert.deepEqual(
    payload.promotions.map((row) => [row.promotionCode, row.discountPercent, row.discountAfterTax]),
    [
      ['AD45232124DN11', 17, 35751],
      ['AD12345678DN11', 2, 4206]
    ]
  );
});

test('legacy inline promotion fields remain supported when structured rows are absent', () => {
  const payload = buildDeliveryInvoicePayload({
    invoiceCode: 'SO-LEGACY',
    orderCode: 'SO-LEGACY',
    customerCode: 'C1',
    customerName: 'Khách cũ',
    salesStaffCode: 'S1',
    salesStaffName: 'NVBH',
    items: [{
      productCode: 'P1',
      productName: 'Sản phẩm cũ',
      quantity: 1,
      catalogSalePriceAtOrder: 108000,
      finalPrice: 86400,
      lineAmountAtOrder: 86400,
      promotionCode: 'LEGACY-20',
      promotionDescription: 'Chiết khấu legacy',
      discountPercent: 20,
      discountBeforeTax: 20000,
      discountAfterTax: 21600
    }]
  });

  assert.equal(payload.promotions.length, 1);
  assert.equal(payload.promotions[0].promotionCode, 'LEGACY-20');
  assert.equal(payload.promotions[0].discountPercent, 20);
});
