'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildPrintData } = require('./services/printDataBuilder');
const templates = require('./templates/printTemplates');

const css = fs.readFileSync(path.join(__dirname, 'public/print.css'), 'utf8');

function assertCss(pattern, label) {
  assert(pattern.test(css), `Missing CSS rule: ${label}`);
}

assertCss(/body\.dms-print-body\s*\{[\s\S]*font-family:\s*Arial, Helvetica, sans-serif;[\s\S]*font-size:\s*12px;[\s\S]*color:\s*#000;/, 'DMS body Arial 12px black');
assertCss(/body\.dms-print-body \.dms-title-line\s*\{[\s\S]*font-size:\s*16px;[\s\S]*font-weight:\s*700;/, 'title 16px bold');
assertCss(/body\.dms-print-body \.dms-header-lines\s*\{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*1\.45;/, 'header 12px line-height 1.45');
assertCss(/body\.dms-print-body \.dms-invoice-table th\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*700;/, 'invoice table header 12px bold');
assertCss(/body\.dms-print-body \.dms-invoice-table td\s*\{[\s\S]*font-size:\s*12px;/, 'invoice table body 12px');
assertCss(/body\.dms-print-body \.dms-product-name\s*\{[\s\S]*line-height:\s*1\.25;/, 'product line-height 1.25');
assertCss(/body\.dms-print-body \.dms-detail-table\s*\{[\s\S]*font-size:\s*11px;[\s\S]*line-height:\s*1\.2;/, 'promotion table 11px');
assertCss(/body\.dms-print-body \.dms-payable-row \.dms-summary-label-cell,[\s\S]*body\.dms-print-body \.dms-payable-row \.dms-summary-value-cell\s*\{[\s\S]*font-size:\s*18px;/, 'payable amount 18px');
assertCss(/@page\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*12mm 10mm;/, 'A4 margin 12mm 10mm');

assertCss(/body\.dms-print-body \.dms-title-header\s*\{[\s\S]*grid-template-columns:\s*42% 38% 20%;/, 'DMS header columns 42/38/20');
assertCss(/body\.dms-print-body \.dms-invoice-table th:nth-child\(2\),[\s\S]*body\.dms-print-body \.dms-invoice-table td:nth-child\(2\)\s*\{[\s\S]*width:\s*22mm;[\s\S]*white-space:\s*nowrap;/, 'DMS product code 22mm no-wrap');
assertCss(/body\.dms-print-body \.dms-invoice-table td\s*\{[\s\S]*border-bottom:\s*0\.5px dotted #777;/, 'DMS dotted product separators');
assertCss(/body\.dms-print-body \.dms-signature div\s*\{[\s\S]*min-height:\s*78px;[\s\S]*padding-top:\s*8px;/, 'DMS signature height and padding');
assertCss(/border:\s*0\.5px solid #000;/, '0.5px table border');

const items = Array.from({ length: 25 }, (_, idx) => ({
  productCode: String(68806804 + idx),
  productName: `Sản phẩm test dòng dài số ${idx + 1} 770g\/18 gói`,
  quantity: idx % 3 === 0 ? 18 : idx + 1,
  cartonText: idx % 3 === 0 ? '1/0' : `0/${idx + 1}`,
  priceBeforeTaxBeforePromotion: 30000 + idx,
  priceAfterTaxBeforePromotion: 32400 + idx,
  priceAfterTaxAfterPromotion: 30000 + idx,
  vatAmount: 2000 + idx,
  lineAmount: (idx + 1) * 30000
}));

const data = buildPrintData({
  code: 'HU90197677',
  invoiceCode: 'HU90197677',
  customerOrderCode: 'HU60198921',
  date: '2026-04-29T16:20:49.000Z',
  customerCode: '4500156',
  customerName: 'cô huế',
  customerPhone: '0986179078',
  customerAddress: 'Đường chưa đặt tên Quang Bình Kiến Xương',
  staffCode: '39534',
  staffName: 'Vũ Thuỳ Trang',
  staffPhone: '0966788626',
  distributor: {
    code: '3293',
    name: 'Công Ty TNHH MTV Minh Khai',
    address: 'Cầu Cánh Sẻ,Quang Bình TỈNH THÁI BÌNH',
    phone: '0396198753'
  },
  items,
  promotions: [
    { code: 'AD70874849DN11', description: 'Cửa hàng mua 10 ống kem đánh răng được chiết khấu 2%.', qualifiedAmount: 486360, discountPercent: 2, discountBeforeTax: 9728, discountAfterTax: 10506 },
    { code: 'AD70875442DN11', description: 'Cửa hàng mua 500.000 VND Nước rửa chén SUNLIGHT/SURF được ck 3%', qualifiedAmount: 737400, discountPercent: 3, discountBeforeTax: 22122, discountAfterTax: 23892 },
    { code: 'AD70875444DN11', description: 'Cửa hàng mua 300,000vnđ SUNLIGHT Nước lau sàn được chiết khấu 2%', qualifiedAmount: 687209, discountPercent: 2, discountBeforeTax: 13744, discountAfterTax: 14844 },
    { code: 'AD70873981DN11', description: 'M bk ck NRC Surf20%, chai 400g, 750g...', qualifiedAmount: 1424609, discountBeforeTax: 103824, discountAfterTax: 112130 },
    { code: 'AD70874610DN11', description: 'CH mua KNORR CSM Nấm 380g tặng Nấm 136g ck11%', qualifiedAmount: 170140, discountPercent: 17, discountBeforeTax: 28924, discountAfterTax: 31238 }
  ],
  displayRewards: [
    { programCode: 'AB70872139DN11', description: 'CH tham gia trưng bày CHHH sẽ được nhận thưởng tương ứng', displayMonth: 'APR/2026', offsetAmount: 1100000 }
  ],
  payableAmount: 5975656,
  totalPromotionAmount: 974984,
  totalOffsetAmount: 1100000
});

const html = templates.DMS_DELIVERY_INVOICE(data);
assert(html.includes('dms-invoice-header-left'), 'header left column missing');
assert(html.includes('dms-invoice-header-right'), 'header right column missing');
assert(html.includes('PHIẾU GIAO NHẬN VÀ THANH TOÁN'), 'title missing');
assert(html.includes('CHI TIẾT KHUYẾN MÃI'), 'promotion table missing');
assert(html.includes('CHI TIẾT CẤN TRỪ NỢ'), 'offset table missing');
assert(html.includes('Trang: 1/ 3'), 'page count for 25 rows + detail page should be 3');

fs.mkdirSync(path.join(__dirname, 'test-output'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'test-output', 'dms-invoice-typography-sample.html'), html);
console.log('DMS_INVOICE_TYPOGRAPHY_LAYOUT_TEST_OK');
