'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildPrintData } = require('./services/printDataBuilder');
const templates = require('./templates/printTemplates');

const css = fs.readFileSync(path.join(__dirname, 'public/dms-exact-sales-invoice.css'), 'utf8');

function assertCss(pattern, label) {
  assert(pattern.test(css), `Missing CSS rule: ${label}`);
}

assertCss(/--dmsx-page-width:\s*612pt/, 'Letter width 612pt');
assertCss(/--dmsx-page-height:\s*792pt/, 'Letter height 792pt');
assertCss(/@page\s*\{\s*size:\s*Letter portrait;\s*margin:\s*0;/, 'Letter page without browser margin');
assertCss(/font-family:\s*var\(--dmsx-font\)/, 'Myriad-compatible exact font stack');
assertCss(/\.dmsx-title\s*\{[\s\S]*font-size:\s*8pt;[\s\S]*font-weight:\s*700;/, 'Invoice-36 title typography');
assertCss(/\.dmsx-header\s*\{[\s\S]*height:\s*139\.1pt;/, 'fixed header height');
assertCss(/\.dmsx-items-head-main\s*\{\s*height:\s*44\.57pt;/, 'main table header height');
assertCss(/\.dmsx-items-head-formula\s*\{\s*height:\s*13\.48pt;/, 'formula header height');
assertCss(/border-bottom:\s*\.72pt dotted #000;/, 'dotted product separators');
assertCss(/height:\s*55\.56pt;/, 'signature block height');

const items = Array.from({ length: 25 }, (_, idx) => ({
  productCode: String(68806804 + idx),
  productName: `Sản phẩm test dòng dài số ${idx + 1} 770g/18 gói`,
  quantity: idx % 3 === 0 ? 18 : idx + 1,
  caseDisplay: idx % 3 === 0 ? '1/0' : `0/${idx + 1}`,
  priceBeforeTaxBeforePromotion: 30000 + idx,
  priceAfterTaxBeforePromotion: 32400 + idx,
  priceAfterTaxAfterPromotion: 30000 + idx,
  vatAmount: 2000 + idx,
  lineAmount: (idx + 1) * 30000
}));

const data = buildPrintData({
  code: 'HU60198921',
  invoiceCode: 'HU90197677',
  customerOrderCode: 'HU60198921',
  orderDateTime: '29.04.2026 16:20:49',
  customerCode: '4500156',
  customerName: 'cô huế',
  customerPhone: '0986179078',
  customerAddress: 'Đường chưa đặt tên Quang Bình Kiến Xương',
  salesStaffCode: '39534',
  salesStaffName: 'Vũ Thuỳ Trang',
  salesStaffPhone: '0966788626',
  distributor: {
    code: '3293',
    name: 'Công Ty TNHH MTV Minh Khai',
    address: 'Cầu Cánh Sẻ,Quang Bình TỈNH THÁI BÌNH',
    phone: '0396198753'
  },
  items,
  promotions: Array.from({ length: 12 }, (_, idx) => ({
    code: `AD7087${4849 + idx}DN11`,
    description: 'Cửa hàng mua sản phẩm thuộc chương trình khuyến mãi được chiết khấu theo điều kiện doanh số áp dụng trong tháng.',
    qualifiedAmount: 486360 + idx * 10000,
    discountPercent: idx % 2 ? 2 : 0,
    discountBeforeTax: 9728 + idx * 100,
    discountAfterTax: 10506 + idx * 108
  })),
  displayRewards: [
    { programCode: 'AB70872139DN11', description: 'CH tham gia trưng bày CHHH sẽ được nhận thưởng tương ứng', displayMonth: 'APR/2026', offsetAmount: 1100000 }
  ],
  payableAmount: 5975656,
  totalPromotionAmount: 974984,
  totalOffsetAmount: 1100000
});

const html = templates.DMS_DELIVERY_INVOICE(data);
assert(html.includes('data-profile="SALES_INVOICE_DMS_EXACT_V1"'), 'exact profile marker missing');
assert(html.includes('dmsx-meta-left'), 'header left column missing');
assert(html.includes('dmsx-meta-middle'), 'header middle column missing');
assert(html.includes('PHIẾU GIAO NHẬN VÀ THANH TOÁN'), 'title missing');
assert(html.includes('CHI TIẾT KHUYẾN MÃI'), 'promotion table missing');
assert(html.includes('CHI TIẾT CẤN TRỪ NỢ'), 'offset table missing');
assert(html.includes('Trang: 1/3'), 'page count for 25 rows + detail pages should be 3');
assert((html.match(/data-copy="Liên 1"/g) || []).length === 3, 'Liên 1 must have 3 pages');
assert((html.match(/data-copy="Liên 2"/g) || []).length === 3, 'Liên 2 must have 3 pages');

fs.mkdirSync(path.join(__dirname, 'test-output'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'test-output', 'dms-invoice-exact-sample.html'), html);
console.log('DMS_EXACT_INVOICE_LAYOUT_TEST_OK');
