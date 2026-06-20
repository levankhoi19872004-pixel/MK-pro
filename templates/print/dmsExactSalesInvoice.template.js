'use strict';

const { paginateDmsExactInvoice } = require('../../src/domain/print/DmsExactPagination');
const { getCompanyProfile } = require('../../src/config/company-profile.config');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function text(value, fallback = '') {
  return escapeHtml(value || fallback);
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return Math.round(number(value)).toLocaleString('vi-VN');
}

function optionalMoney(value) {
  return value === '' || value === null || value === undefined ? '' : money(value);
}

function percent(value) {
  return number(value).toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function payloadOf(data = {}) {
  return data.erpInvoiceV46 || {};
}

function headerOf(data = {}) {
  const payload = payloadOf(data);
  const header = payload.header || {};
  return {
    invoiceCode: header.invoiceCode || data.document?.invoiceCode || data.document?.code || '',
    orderCode: header.orderCode || data.document?.customerOrderCode || data.document?.code || '',
    orderDateTime: header.orderDateTime || data.document?.dateTime || data.document?.date || '',
    invoiceType: header.invoiceType || data.document?.type || 'Từ NVTT',
    paymentTerm: header.paymentTerm || data.document?.terms || 'đáo hạn trong 7 ngày',
    truckNo: header.truckNo || data.document?.vehicleNo || '',
    taxCode: header.taxCode || data.customer?.taxCode || ''
  };
}

function distributorOf(data = {}) {
  const row = payloadOf(data).distributor || {};
  const companyProfile = getCompanyProfile();
  return {
    code: row.code || data.company?.code || companyProfile.code,
    name: row.name || data.company?.name || companyProfile.name,
    address: row.address || data.company?.address || companyProfile.address,
    phone: row.phone || data.company?.phone || companyProfile.phone
  };
}

function customerOf(data = {}) {
  const row = payloadOf(data).customer || {};
  return {
    code: row.customerCode || data.customer?.code || '',
    name: row.customerName || data.customer?.name || '',
    phone: row.phone || data.customer?.phone || '',
    address: row.deliveryAddress || data.customer?.address || '',
    taxCode: row.taxCode || data.customer?.taxCode || ''
  };
}

function salesStaffOf(data = {}) {
  const row = payloadOf(data).salesStaff || {};
  return {
    code: row.staffCode || data.staff?.code || '',
    name: row.staffName || data.staff?.name || '',
    phone: row.phone || data.staff?.phone || ''
  };
}

function summaryOf(data = {}) {
  const row = payloadOf(data).summary || {};
  return {
    totalQty: number(row.totalQty ?? data.totals?.totalQty),
    goodsAmountAfterPromotion: number(row.goodsAmountAfterPromotion ?? data.totals?.totalAmount),
    grossAmountBeforePromotion: number(row.grossAmountBeforePromotion ?? data.totals?.goodsAmount),
    totalPromotionAmount: number(row.totalPromotionAmount ?? row.promotionAmount ?? data.totals?.promotionValue),
    totalOffsetAmount: number(row.totalOffsetAmount ?? row.displayRewardOffset ?? data.totals?.displayRewardTotal),
    nppDiscountAmount: number(row.nppDiscountAmount ?? data.totals?.nppDiscountAmount),
    payableAmount: number(row.payableAmount ?? data.totals?.payable ?? data.totals?.totalAmount),
    promotionRate: number(row.promotionRate ?? data.totals?.promotionRate),
    amountInWords: row.amountInWords || data.totals?.totalAmountText || ''
  };
}

function itemsOf(data = {}) {
  const rows = payloadOf(data).items;
  return Array.isArray(rows) ? rows : [];
}

function promotionsOf(data = {}) {
  const rows = payloadOf(data).promotions;
  return Array.isArray(rows) ? rows : [];
}

function rewardsOf(data = {}) {
  const rows = payloadOf(data).offsets;
  return Array.isArray(rows) ? rows : [];
}

function previewActions() {
  return `
  <div class="print-preview-actions dmsx-preview-actions">
    <button type="button" data-print-action="close">Bỏ qua</button>
    <button type="button" data-print-action="print">In đơn</button>
    <button type="button" data-print-action="excel">Xuất Excel</button>
  </div>
  <script src="/js/print-preview-actions.js?v=phase09-csp-v1"></script>`;
}

function renderHeader(data, copyLabel, pageNo, pageCount) {
  const header = headerOf(data);
  const distributor = distributorOf(data);
  const customer = customerOf(data);
  const staff = salesStaffOf(data);
  const staffText = [staff.code, staff.name, staff.phone].filter(Boolean).map(text).join(' - ');
  const customerText = [customer.code, customer.name, customer.phone].filter(Boolean).map(text).join(' - ');
  const distributorText = [distributor.code, distributor.name].filter(Boolean).map(text).join(' - ');

  return `
    <header class="dmsx-header">
      <div class="dmsx-title-row">
        <div></div>
        <div class="dmsx-title">PHIẾU GIAO NHẬN VÀ THANH TOÁN</div>
        <div class="dmsx-truck">Số xe tải: ${text(header.truckNo)}</div>
      </div>
      <div class="dmsx-meta-grid">
        <div class="dmsx-meta-left">
          <div>Số hóa đơn: ${text(header.invoiceCode)}</div>
          <div>Số đơn hàng: ${text(header.orderCode)}</div>
          <div>NVBH: ${staffText}</div>
          <div>Khách hàng - Điện thoại: ${customerText}</div>
          <div>Địa chỉ giao hàng: ${text(customer.address)}</div>
          <div>Điều khoản thanh toán: ${text(header.paymentTerm)}</div>
          <div>MST: ${text(header.taxCode || customer.taxCode)}</div>
        </div>
        <div class="dmsx-meta-middle">
          <div>Loại hóa đơn: ${text(header.invoiceType)}</div>
          <div>Thời gian đặt hàng: ${text(header.orderDateTime)}</div>
          <div>Nhà phân phối: ${distributorText}</div>
          <div>Địa chỉ: ${text(distributor.address)}</div>
          <div>Điện thoại: ${text(distributor.phone)}</div>
        </div>
        <div class="dmsx-meta-right">
          <b>(${text(copyLabel)})</b>
          <b>Trang: ${pageNo}/${pageCount}</b>
        </div>
      </div>
    </header>`;
}

function renderItemTable(items, summary, showTotal) {
  const rows = items.length ? items.map((item) => `
    <tr class="dmsx-item-row">
      <td class="dmsx-center">${text(item.lineNo)}</td>
      <td class="dmsx-code">${text(item.productCode)}</td>
      <td class="dmsx-product">${text(item.productName)}</td>
      <td class="dmsx-right excel-only-column">${optionalMoney(item.catalogPackingQty)}</td>
      <td class="dmsx-center">${text(item.quantityCsSu)}</td>
      <td class="dmsx-right">${money(item.quantity)}</td>
      <td class="dmsx-right">${money(item.priceBeforeTaxBeforePromotion)}</td>
      <td class="dmsx-right excel-only-column">${optionalMoney(item.currentCatalogSalePrice)}</td>
      <td class="dmsx-right">${money(item.priceAfterTaxBeforePromotion)}</td>
      <td class="dmsx-right">${money(item.priceAfterTaxAfterPromotion)}</td>
      <td class="dmsx-right">${money(item.vatAmount)}</td>
      <td class="dmsx-right">${money(item.lineAmount)}</td>
    </tr>`).join('') : '';

  return `
    <table class="dmsx-items-table">
      <colgroup>
        <col style="width:21.60pt"/><col style="width:44.28pt"/><col style="width:213.84pt"/>
        <col style="width:37.44pt"/><col style="width:25.20pt"/><col style="width:40.32pt"/>
        <col style="width:54.72pt"/><col style="width:40.32pt"/><col style="width:40.32pt"/>
        <col style="width:54.72pt"/>
      </colgroup>
      <thead>
        <tr class="dmsx-items-head-main">
          <th>STT</th>
          <th>Mã hàng</th>
          <th>Tên sản phẩm</th>
          <th class="excel-only-column">Quy cách</th>
          <th>Số lượng<br/>(CS/SU)</th>
          <th>Số<br/>lượng<br/>(lẻ)</th>
          <th>Đơn Giá<br/>(Trước<br/>Thuế/KM)</th>
          <th class="excel-only-column">Giá bán</th>
          <th>Đơn Giá (Sau<br/>Thuế, Trước<br/>KM)</th>
          <th>Đơn giá<br/>(Sau Thuế/<br/>KM&amp;CK)</th>
          <th>Thuế<br/>GTGT</th>
          <th>Thành tiền<br/>(Sau Thuế/<br/>KM&amp;CK)</th>
        </tr>
        <tr class="dmsx-items-head-formula">
          <th></th><th></th><th>A</th><th class="excel-only-column">QC</th><th>1</th><th>2</th><th>3</th><th class="excel-only-column">GB</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${showTotal ? `
        <tr class="dmsx-total-row">
          <td></td><td></td><td class="dmsx-center"><b>Tổng cộng (A)</b></td><td class="excel-only-column"></td><td></td>
          <td class="dmsx-right"><b>${money(summary.totalQty)}</b></td>
          <td></td><td class="excel-only-column"></td><td></td><td></td><td></td>
          <td class="dmsx-right"><b>${money(summary.goodsAmountAfterPromotion)}</b></td>
        </tr>` : ''}
      </tbody>
    </table>`;
}

function renderSummary(summary) {
  return `
    <section class="dmsx-summary-block">
      <div class="dmsx-summary-left">
        <b>Số tiền viết bằng chữ :</b>
        <span>${text(summary.amountInWords)}</span>
      </div>
      <div class="dmsx-summary-right">
        <div class="dmsx-payable"><span>Số tiền phải thanh toán (A7-D-E-H)</span><b>${money(summary.payableAmount)}</b></div>
        <div><span>Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</span><span>${money(summary.grossAmountBeforePromotion)}</span></div>
        <div><span>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</span><span>${money(summary.totalPromotionAmount)}</span></div>
        <div><span>Cấn trừ tiền (D+E+H):</span><span>${money(summary.totalOffsetAmount)}</span></div>
        <div><span>Tổng tiền CK của NPP (F)=(G-C)* 0,00% :</span><span>${money(summary.nppDiscountAmount)}</span></div>
        <div><span>Tỉ lệ KM &amp; CK của đơn hàng [(B+C+F)/G]*100%:</span><span>${percent(summary.promotionRate)}%</span></div>
      </div>
    </section>
    <section class="dmsx-signatures">
      <div><b>Người lập biểu</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Người bán hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Nhân viên giao hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Người nhận hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
    </section>`;
}

function renderPromotionTable(rows, showTitle, showTotal, summary) {
  if (!rows.length) return '';
  return `
    <section class="dmsx-detail-section dmsx-promotion-section">
      ${showTitle ? '<div class="dmsx-section-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>' : ''}
      <table class="dmsx-detail-table dmsx-promotion-table">
        <colgroup>
          <col style="width:83.14pt"/><col style="width:267.80pt"/><col style="width:58.69pt"/>
          <col style="width:45.25pt"/><col style="width:61.74pt"/><col style="width:58.69pt"/>
        </colgroup>
        <thead><tr>
          <th>Mã CTKM Tiền</th><th>Khuyến mãi bằng tiền</th><th>Giá trị hàng<br/>hóa mua</th>
          <th>% chiết<br/>khấu</th><th>Tiền CK trước<br/>thuế</th><th>Tiền CK sau<br/>thuế</th>
        </tr></thead>
        <tbody>
          ${rows.map((row) => `
          <tr>
            <td>${text(row.code || row.promotionCode)}</td>
            <td>${text(row.description || row.name)}</td>
            <td class="dmsx-right">${money(row.qualifiedAmount || row.basisAmount)}</td>
            <td class="dmsx-right">${number(row.discountPercent || row.percent) ? percent(row.discountPercent || row.percent) : ''}</td>
            <td class="dmsx-right">${money(row.discountBeforeTax || row.beforeTax)}</td>
            <td class="dmsx-right">${money(row.discountAfterTax || row.afterTax)}</td>
          </tr>`).join('')}
          ${showTotal ? `<tr class="dmsx-detail-total"><td colspan="5" class="dmsx-right"><b>Tổng giá trị khuyến mãi tiền (C)</b></td><td class="dmsx-right"><b>${money(summary.totalPromotionAmount)}</b></td></tr>` : ''}
        </tbody>
      </table>
    </section>`;
}

function renderRewardTable(rows, showTitle, showTotal, summary) {
  if (!rows.length) return '';
  return `
    <section class="dmsx-detail-section dmsx-reward-section">
      ${showTitle ? '<div class="dmsx-section-title">CHI TIẾT CẤN TRỪ NỢ:(D+E)</div>' : ''}
      <table class="dmsx-detail-table dmsx-reward-table">
        <colgroup>
          <col style="width:83pt"/><col style="width:256pt"/><col style="width:54pt"/>
          <col style="width:63pt"/><col style="width:48pt"/><col style="width:69pt"/>
        </colgroup>
        <thead><tr>
          <th>Mã CT Trưng bày</th><th>Nội dung Chương trình trưng bày</th><th>Tháng trưng<br/>bày</th>
          <th>Chi trả trưng bày<br/>(hàng hóa)</th><th>Số lượng<br/>(Thùng/lẻ)</th><th>Chi trả trưng bày<br/>(cấn trừ nợ)</th>
        </tr></thead>
        <tbody>
          ${rows.map((row) => `
          <tr>
            <td>${text(row.programCode || row.code)}</td>
            <td>${text(row.description || row.name)}</td>
            <td class="dmsx-center">${text(row.displayMonth || row.month)}</td>
            <td class="dmsx-right">${number(row.goodsAmount) ? money(row.goodsAmount) : ''}</td>
            <td class="dmsx-center">${text(row.quantityText)}</td>
            <td class="dmsx-right">${money(row.offsetAmount)}</td>
          </tr>`).join('')}
          ${showTotal ? `<tr class="dmsx-detail-total"><td colspan="5" class="dmsx-right"><b>Tổng giá trị nhận được từ CT trưng bày (D)</b></td><td class="dmsx-right"><b>${money(summary.totalOffsetAmount)}</b></td></tr>` : ''}
        </tbody>
      </table>
    </section>`;
}

function renderPage(data, page, copyLabel, plan) {
  const summary = summaryOf(data);
  return `
    <section class="dmsx-page" data-profile="SALES_INVOICE_DMS_EXACT_V1" data-copy="${text(copyLabel)}" data-page="${page.pageNo}">
      ${renderHeader(data, copyLabel, page.pageNo, plan.pageCount)}
      <main class="dmsx-page-content">
        ${page.showItemsTable ? renderItemTable(page.items, summary, page.showItemTotal) : ''}
        ${page.showSummary ? renderSummary(summary) : ''}
        ${renderPromotionTable(page.promotions || [], !page.promotionContinuation, page.showPromotionTotal, summary)}
        ${renderRewardTable(page.rewards || [], !page.rewardContinuation, page.showRewardTotal, summary)}
      </main>
    </section>`;
}

function dmsExactSalesInvoiceTemplate(data = {}) {
  const payload = payloadOf(data);
  const normalizedPayload = {
    ...payload,
    items: itemsOf(data),
    promotions: promotionsOf(data),
    offsets: rewardsOf(data)
  };
  const plan = paginateDmsExactInvoice(normalizedPayload);
  const pages = plan.copies.map((copyLabel) => plan.pages.map((page) => renderPage(data, page, copyLabel, plan)).join('')).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phiếu giao nhận và thanh toán - ${text(data.document?.code)}</title>
  <link rel="stylesheet" href="/dms-exact-sales-invoice.css?v=dms-exact-v1" />
</head>
<body class="dms-exact-body">
  ${previewActions()}
  ${pages}
</body>
</html>`;
}

module.exports = dmsExactSalesInvoiceTemplate;
