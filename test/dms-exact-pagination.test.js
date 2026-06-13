'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { paginateDmsExactInvoice } = require('../src/domain/print/DmsExactPagination');

function items(count) {
  return Array.from({ length: count }, (_, index) => ({
    lineNo: index + 1,
    productName: index % 3 === 0
      ? 'OMO Bột Giặt Comfort Tinh Dầu Thơm Sang Trọng 700g/18 gói'
      : 'P/S Bảo Vệ 123',
    quantity: 1
  }));
}

function promotions(count) {
  return Array.from({ length: count }, (_, index) => ({
    code: `AD${index + 1}`,
    description: 'Cửa hàng mua sản phẩm thuộc chương trình được chiết khấu theo điều kiện doanh số áp dụng trong tháng.'
  }));
}

test('25-line sample keeps 24 product lines on first page and repeats the plan for two copies', () => {
  const plan = paginateDmsExactInvoice({
    items: items(25),
    promotions: promotions(12),
    offsets: [{ description: 'Chương trình trưng bày', offsetAmount: 1100000 }]
  });

  assert.deepEqual(plan.copies, ['Liên 1', 'Liên 2']);
  assert.equal(plan.pages[0].items.length, 24);
  assert.equal(plan.pages[1].items.length, 1);
  assert.equal(plan.pages[1].showSummary, true);
  assert.ok(plan.pageCount >= 3);
});

test('short order keeps summary on the product page and flows promotion rows to following page', () => {
  const plan = paginateDmsExactInvoice({
    items: items(16),
    promotions: promotions(5),
    offsets: []
  });

  assert.equal(plan.pages[0].items.length, 16);
  assert.equal(plan.pages[0].showSummary, true);
  assert.ok(plan.pages[0].promotions.length >= 1);
  assert.equal(plan.pages.reduce((sum, page) => sum + page.promotions.length, 0), 5);
});

test('24 full product rows place summary on a new page instead of clipping', () => {
  const plan = paginateDmsExactInvoice({ items: items(24) });
  assert.equal(plan.pages[0].items.length, 24);
  assert.equal(plan.pages[0].showSummary, false);
  assert.equal(plan.pages[1].showSummary, true);
});
