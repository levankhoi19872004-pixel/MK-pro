function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(data, value) {
  return data.formatMoney ? data.formatMoney(value) : Number(value || 0).toLocaleString('vi-VN');
}

function text(value, fallback = '') {
  return escapeHtml(value || fallback);
}

function getDmsPayload(data) {
  return data.erpInvoiceV46 || {};
}

function getDmsHeader(data) {
  const payload = getDmsPayload(data);
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

function getDmsDistributor(data) {
  const payload = getDmsPayload(data);
  const distributor = payload.distributor || {};
  return {
    code: distributor.code || data.company?.code || '3293',
    name: distributor.name || data.company?.name || 'Công Ty TNHH MTV Minh Khai',
    phone: distributor.phone || data.company?.phone || '',
    address: distributor.address || data.company?.address || ''
  };
}

function getDmsCustomer(data) {
  const payload = getDmsPayload(data);
  const customer = payload.customer || {};
  return {
    customerCode: customer.customerCode || data.customer?.code || '',
    customerName: customer.customerName || data.customer?.name || '',
    phone: customer.phone || data.customer?.phone || '',
    deliveryAddress: customer.deliveryAddress || data.customer?.address || '',
    taxCode: customer.taxCode || data.customer?.taxCode || ''
  };
}

function getDmsSalesStaff(data) {
  const payload = getDmsPayload(data);
  const staff = payload.salesStaff || {};
  return {
    staffCode: staff.staffCode || data.staff?.code || '',
    staffName: staff.staffName || data.staff?.name || '',
    phone: staff.phone || data.staff?.phone || ''
  };
}

function getDmsItems(data) {
  const payload = getDmsPayload(data);
  if (Array.isArray(payload.items) && payload.items.length) return payload.items;
  return (data.items || []).map((item) => ({
    ...item,
    lineNo: item.lineNo || item.stt,
    productCode: item.productCode || item.code,
    productName: item.productName || item.name,
    quantityCsSu: item.quantityCsSu || item.caseDisplay,
    quantity: item.quantity ?? item.qty,
    priceBeforeTaxBeforePromotion: item.priceBeforeTaxBeforePromotion ?? item.listPriceBeforeVat ?? item.priceBeforeVat ?? item.price,
    priceAfterTaxBeforePromotion: item.priceAfterTaxBeforePromotion ?? item.listPriceAfterVat ?? item.priceAfterVatBeforeDiscount,
    priceAfterTaxAfterPromotion: item.priceAfterTaxAfterPromotion ?? item.priceAfterVatAfterDiscount ?? item.priceAfterDiscount,
    vatAmount: item.vatAmount ?? item.tax,
    lineAmount: item.lineAmount ?? item.amount,
    isPromotionGift: item.isPromotionGift ?? item.isPromo,
    promotionRows: item.promotionRows || [],
    appliedPromotions: item.appliedPromotions || [],
    promotions: item.promotions || [],
    productSnapshot: item.productSnapshot || {},
    product: item.product || {}
  }));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectDmsItemPromotions(item) {
  return [
    ...asArray(item?.promotionRows),
    ...asArray(item?.appliedPromotions),
    ...asArray(item?.promotions),
    ...asArray(item?.productSnapshot?.promotions),
    ...asArray(item?.product?.promotions)
  ];
}

function normalizeDmsPromotionRow(promo, item = {}) {
  const promotionCode = promo?.promotionCode || promo?.code || promo?.programCode || promo?.ctkmCode || '';
  const productCode = item.productCode || item.code || promo?.productCode || '';
  const productName = item.productName || item.name || promo?.productName || '';
  const fallbackQualifiedAmount =
    item.priceBeforeTaxBeforePromotion ??
    item.beforeTaxAmount ??
    item.amountBeforeTax ??
    item.lineAmount ??
    item.amount ??
    0;

  return {
    ...promo,
    promotionCode,
    code: promotionCode,
    description: promo?.description || promo?.promotionDescription || promo?.programDescription || promo?.promotionName || promo?.name || promo?.title || '',
    qualifiedAmount: promo?.qualifiedAmount ?? promo?.basisAmount ?? promo?.baseAmount ?? promo?.purchaseAmountBeforeTax ?? promo?.purchaseAmount ?? promo?.goodsAmountBeforeTax ?? promo?.goodsAmount ?? fallbackQualifiedAmount,
    discountPercent: promo?.discountPercent ?? promo?.percent ?? promo?.rate ?? promo?.discountRate,
    discountBeforeTax: promo?.discountBeforeTax ?? promo?.beforeTax ?? promo?.ckBeforeTax ?? promo?.discountAmountBeforeTax,
    discountAfterTax: promo?.discountAfterTax ?? promo?.afterTax ?? promo?.ckAfterTax ?? promo?.discountAmountAfterTax,
    promotionType: promo?.promotionType || promo?.type || promo?.scope || promo?.level || promo?.discountType,
    productCode,
    productName,
    lineType: item.isPromotionGift ? 'PROMO' : (promo?.lineType || item.lineType || 'SALE')
  };
}

function buildDmsPromotionDedupeKey(promo) {
  return [
    normalizeDmsPromotionCode(promo),
    promo?.productCode || '',
    Number(promo?.discountAfterTax ?? promo?.afterTax ?? promo?.ckAfterTax ?? promo?.discountAmountAfterTax ?? 0) || 0,
    Number(promo?.qualifiedAmount ?? promo?.basisAmount ?? promo?.baseAmount ?? 0) || 0
  ].join('|');
}

function getDmsPromotions(data) {
  const payload = getDmsPayload(data);
  const rows = [];

  for (const promo of asArray(payload.promotions)) {
    rows.push(normalizeDmsPromotionRow(promo));
  }

  for (const promo of asArray(data.promotions)) {
    rows.push(normalizeDmsPromotionRow(promo));
  }

  for (const item of getDmsItems(data)) {
    for (const promo of collectDmsItemPromotions(item)) {
      rows.push(normalizeDmsPromotionRow(promo, item));
    }
  }

  const seen = new Set();
  return rows.filter((promo) => {
    const code = normalizeDmsPromotionCode(promo);
    if (!code) return false;
    const key = buildDmsPromotionDedupeKey(promo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDmsOffsets(data) {
  const payload = getDmsPayload(data);
  if (Array.isArray(payload.offsets) && payload.offsets.length) return payload.offsets;
  return (data.displayRewards || []).map((row) => ({
    programCode: row.code,
    description: row.name,
    displayMonth: row.month,
    goodsAmount: row.goodsAmount,
    quantityText: row.quantityText,
    offsetAmount: row.offsetAmount
  }));
}

function getDmsSummary(data) {
  const payload = getDmsPayload(data);
  const summary = payload.summary || {};
  return {
    ...(data.totals || {}),
    ...summary,
    totalVatAmount: summary.totalVatAmount || data.totals?.tax || 0,
    amountInWords: summary.amountInWords || data.totals?.totalAmountText || ''
  };
}

function getDmsPagination(data) {
  const payload = getDmsPayload(data);
  const pagination = payload.pagination || {};
  const promotions = getDmsPromotions(data);
  const offsets = getDmsOffsets(data);
  const items = getDmsItems(data);
  const pagesPerCopy = pagination.pagesPerCopy || ((offsets.length || promotions.length > 4 || items.length > 18) ? 2 : 1);
  return {
    pagesPerCopy,
    copies: pagination.copies || ['Liên 1', 'Liên 2'],
    showPromotionHeaderOnFirstPage: pagesPerCopy > 1
  };
}

function formatPercent(value) {
  const n = Number(String(value || 0).replace(',', '.')) || 0;
  return n ? n.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}


function normalizeDmsPromotionCode(promo) {
  return String(
    promo?.promotionCode ||
    promo?.programCode ||
    promo?.ctkmCode ||
    promo?.code ||
    ''
  ).trim();
}

function isGroupPromotion(promo) {
  const raw = [
    promo?.promotionType,
    promo?.discountType,
    promo?.level,
    promo?.scope,
    promo?.sourceType,
    promo?.type,
    promo?.promotionLevel,
    promo?.applyScope,
    promo?.mechanismType
  ].filter(Boolean).join(' ').toLowerCase();

  return (
    raw.includes('group') ||
    raw.includes('invoice') ||
    raw.includes('order') ||
    raw.includes('bill') ||
    raw.includes('basket') ||
    raw.includes('cart') ||
    raw.includes('nhom') ||
    raw.includes('nhóm') ||
    raw.includes('hoa_don') ||
    raw.includes('hóa đơn') ||
    raw.includes('hoá đơn') ||
    raw.includes('don_hang') ||
    raw.includes('đơn hàng')
  );
}

function pickDmsPromotionDescription(promo) {
  return String(
    promo?.description ||
    promo?.promotionDescription ||
    promo?.programDescription ||
    promo?.promotionName ||
    promo?.name ||
    promo?.title ||
    ''
  ).trim();
}

function pickDmsPromotionQualifiedAmount(promo) {
  return Number(
    promo?.qualifiedAmount ??
    promo?.basisAmount ??
    promo?.baseAmount ??
    promo?.purchaseAmountBeforeTax ??
    promo?.purchaseAmount ??
    promo?.goodsAmountBeforeTax ??
    promo?.goodsAmount ??
    promo?.amountBeforeTax ??
    0
  ) || 0;
}

function pickDmsPromotionDiscountBeforeTax(promo) {
  return Number(
    promo?.discountBeforeTax ??
    promo?.beforeTax ??
    promo?.ckBeforeTax ??
    promo?.discountAmountBeforeTax ??
    promo?.promotionBeforeTax ??
    0
  ) || 0;
}

function pickDmsPromotionDiscountAfterTax(promo) {
  return Number(
    promo?.discountAfterTax ??
    promo?.afterTax ??
    promo?.ckAfterTax ??
    promo?.discountAmountAfterTax ??
    promo?.promotionAfterTax ??
    0
  ) || 0;
}

function groupDmsPromotionsByCode(promotions) {
  const map = new Map();

  for (const promo of promotions || []) {
    const code = normalizeDmsPromotionCode(promo);
    if (!code) continue;

    if (!map.has(code)) {
      map.set(code, {
        code,
        description: pickDmsPromotionDescription(promo),
        qualifiedAmount: 0,
        discountPercent: '',
        discountBeforeTax: 0,
        discountAfterTax: 0,
        hasGroupDiscount: false,
        _sortIndex: map.size
      });
    }

    const row = map.get(code);
    if (!row.description) row.description = pickDmsPromotionDescription(promo);

    row.qualifiedAmount += pickDmsPromotionQualifiedAmount(promo);
    row.discountBeforeTax += pickDmsPromotionDiscountBeforeTax(promo);
    row.discountAfterTax += pickDmsPromotionDiscountAfterTax(promo);

    if (isGroupPromotion(promo)) {
      row.hasGroupDiscount = true;
      const percent = formatPercent(promo.discountPercent ?? promo.percent ?? promo.rate ?? promo.discountRate);
      if (percent && !row.discountPercent) row.discountPercent = percent;
    }
  }

  return Array.from(map.values()).sort((a, b) => a._sortIndex - b._sortIndex);
}

function normalizeCopyLabel(copyLabel) {
  const raw = String(copyLabel || 'Liên 1').replace(/[()]/g, '').trim();
  return `(${raw})`;
}

function formatDmsPage(pageNo, pageCount) {
  return `${pageNo}/ ${pageCount}`;
}

function dmsMoney(data, value) {
  return money(data, value || 0);
}

function renderDmsPromotionHeaderOnly() {
  return `
    <div class="dms-section-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>
    <table class="dms-detail-table dms-promotion-table">
      <thead>
        <tr>
          <th style="width:28mm">Mã CTKM Tiền</th>
          <th>Khuyến mãi bằng tiền</th>
          <th style="width:25mm">Giá trị hàng hóa mua</th>
          <th style="width:18mm">% chiết khấu</th>
          <th style="width:24mm">Tiền CK trước thuế</th>
          <th style="width:24mm">Tiền CK sau thuế</th>
        </tr>
      </thead>
    </table>`;
}

function renderGenericItemsTable(data) {
  const rows = data.items.length
    ? data.items.map(item => `
      <tr>
        <td class="center">${item.stt}</td>
        <td class="mono">${text(item.code)}</td>
        <td>${text(item.name)}</td>
        <td class="center">${text(item.unit)}</td>
        <td class="center">${text(item.caseDisplay)}</td>
        <td class="right">${money(data, item.qty)}</td>
        <td class="right">${money(data, item.price)}</td>
        <td class="right">${money(data, item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="center">Chưa có dòng hàng</td></tr>';

  return `
    <table class="print-table">
      <thead>
        <tr>
          <th style="width:8mm">STT</th>
          <th style="width:24mm">Mã hàng</th>
          <th>Tên hàng</th>
          <th style="width:16mm">ĐVT</th>
          <th style="width:18mm">Thùng/Lẻ</th>
          <th style="width:18mm">SL lẻ</th>
          <th style="width:24mm">Đơn giá</th>
          <th style="width:28mm">Thành tiền</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}



function renderMasterKpiTable(data) {
  const rows = Array.isArray(data.masterKpis) ? data.masterKpis : [];
  if (!rows.length) return '';
  const bodyRows = rows.map((row) => `
    <tr>
      <td><b>${text(row.code)}</b>${row.note ? `<div class="muted">Ghi chú: ${text(row.note)}</div>` : ''}</td>
      <td class="right strong">${money(data, row.productSaleAmount)}</td>
      <td class="right strong">${money(data, row.promotionAmount)}</td>
      <td class="right strong">${money(data, row.payableAmount)}</td>
    </tr>`).join('');
  const totals = data.masterKpiTotals || {};
  return `
    <div class="section-title">BÁO CÁO KPI ĐƠN TỔNG ĐÃ GỘP</div>
    <table class="print-table master-kpi-table">
      <thead>
        <tr>
          <th>Mã đơn + ghi chú</th>
          <th style="width:32mm">Giá trị đơn tổng</th>
          <th style="width:32mm">Tổng khuyến mại</th>
          <th style="width:36mm">Tổng tiền phải thu</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="invoice-total-row">
          <td class="right strong">Tổng cộng</td>
          <td class="right strong">${money(data, totals.productSaleAmount)}</td>
          <td class="right strong">${money(data, totals.promotionAmount)}</td>
          <td class="right strong">${money(data, totals.payableAmount)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderMasterOrderHeaderBlock(data, title, warehouseLabel = '') {
  const warehouseSuffix = warehouseLabel ? ` - ${warehouseLabel}` : '';
  return `
    <div class="simple-print-header">
      <div>
        <h2>${text(data.company.name)}</h2>
        <p>${text(data.company.address)}</p>
      </div>
      <div class="print-code"><b>${data.document.printMode === 'MASTER_AGGREGATE_SELECTED' ? 'Các đơn tổng' : 'Mã đơn tổng'}</b><span>${text(data.document.code)}</span></div>
    </div>
    <h1 class="print-title">${text(title)}${text(warehouseSuffix)}</h1>
    <div class="info-grid">
      <div><b>${data.document.printMode === 'MASTER_AGGREGATE_SELECTED' ? 'Gồm đơn tổng' : 'Mã đơn tổng'}:</b> ${text(data.document.masterOrderCodes && data.document.masterOrderCodes.length ? data.document.masterOrderCodes.join(', ') : data.document.code)}</div>
      <div><b>Ngày giao:</b> ${text(data.document.date)}</div>
      <div><b>Nhân viên giao hàng:</b> ${text(data.delivery.code)} - ${text(data.delivery.name)}</div>
      <div><b>Tuyến:</b> ${text(data.delivery.route)}</div>
      ${data.document.printMode === 'MASTER_AGGREGATE_SELECTED' ? `<div><b>Số đơn tổng đã chọn:</b> ${money(data, data.document.selectedMasterOrderCount || 0)}</div>` : ''}
      <div><b>Số đơn con:</b> ${money(data, data.totals.orderCount)}</div>
      <div><b>Giá trị đơn tổng:</b> ${money(data, data.totals.totalAmount)} đ</div>
      ${data.document.note ? `<div class="full"><b>Ghi chú:</b> ${text(data.document.note)}</div>` : ''}
    </div>`;
}

function getMasterPrintLineAmount(item) {
  const qty = Number(item.qty || item.quantity || 0) || 0;
  const price = Number(item.price || item.salePrice || 0) || 0;
  return qty * price;
}

function renderMasterWarehouseLineSection(data, title, items = [], options = {}) {
  const isPromo = Boolean(options.isPromo);
  const rows = items.length
    ? items.map((item, index) => {
        const lineAmount = getMasterPrintLineAmount(item);
        return `
        <tr class="${isPromo ? 'promo-line-row' : 'sale-line-row'}">
          <td class="center">${index + 1}</td>
          <td class="mono">${text(item.code)}</td>
          <td>${text(item.name)}${isPromo ? '<div class="muted">Xuất khuyến mại</div>' : ''}</td>
          <td class="center strong">${text(item.caseDisplay)}</td>
          <td class="right strong">${money(data, item.qty)}</td>
          <td class="right">${money(data, item.price)}</td>
          <td class="right strong">${money(data, lineAmount)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" class="center">${isPromo ? 'Không có hàng khuyến mại' : 'Không có hàng bán'}</td></tr>`;

  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + getMasterPrintLineAmount(item), 0);

  return `
    <div class="master-line-section ${isPromo ? 'promo-section' : 'sale-section'}">
      <div class="section-title">${text(title)}</div>
      <table class="print-table master-picking-table">
        <thead>
          <tr>
            <th style="width:8mm">STT</th>
            <th style="width:26mm">Mã sản phẩm</th>
            <th>Tên sản phẩm</th>
            <th style="width:22mm">Thùng/Lẻ</th>
            <th style="width:18mm">SL lẻ</th>
            <th style="width:24mm">Giá bán</th>
            <th style="width:30mm">Tổng giá trị</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="invoice-total-row">
            <td colspan="4" class="right strong">Tổng ${text(title)}</td>
            <td class="right strong">${money(data, totalQty)}</td>
            <td></td>
            <td class="right strong">${money(data, totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function renderMasterWarehouseTables(data) {
  const groups = Array.isArray(data.warehouseGroups) && data.warehouseGroups.length
    ? data.warehouseGroups
    : [{ code: 'KHO_HC', name: 'KHO HC', items: data.items || [], saleItems: data.items || [], promoItems: [], totalQty: data.totals.totalQty, totalAmount: data.totals.totalAmount }];

  return groups.map((group) => {
    const saleItems = Array.isArray(group.saleItems) ? group.saleItems : (group.items || []).filter((item) => !item.isPromo && item.lineType !== 'PROMO');
    const promoItems = Array.isArray(group.promoItems) ? group.promoItems : (group.items || []).filter((item) => item.isPromo || item.lineType === 'PROMO');

    return `
      <div class="master-warehouse-block">
        <div class="section-title master-warehouse-title">${text(group.name || group.code)}</div>
        ${renderMasterWarehouseLineSection(data, `${group.name || group.code} - Hàng bán`, saleItems)}
        ${renderMasterWarehouseLineSection(data, `${group.name || group.code} - Xuất khuyến mại`, promoItems, { isPromo: true })}
      </div>`;
  }).join('');
}

function renderSignature(labels = ['Người lập phiếu', 'Khách hàng', 'Thủ kho / Giao hàng']) {
  return `
    <div class="signature-row">
      ${labels.map(label => `<div><b>${text(label)}</b><span>(Ký, ghi rõ họ tên)</span></div>`).join('')}
    </div>`;
}


function printPreviewActionsScript() {
  return `
  <div class="print-preview-actions">
    <button type="button" onclick="window.close()">Bỏ qua</button>
    <button type="button" onclick="window.print()">In đơn</button>
    <button type="button" onclick="exportCurrentPrintToExcel()">Xuất Excel</button>
  </div>
  <script>
    function exportCurrentPrintToExcel(){
      var pages = Array.prototype.slice.call(document.querySelectorAll('.print-page, .dms-print-page'));
      var html = pages.length ? pages.map(function(page){ return page.outerHTML; }).join('') : document.body.innerHTML;
      var fullHtml = '<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}</style></head><body>' + html + '</body></html>';
      var blob = new Blob(['\ufeff' + fullHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var title = (document.title || 'ban-in').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'ban-in';
      a.download = title + '.xls';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    }
  </script>`;
}

function baseLayout(title, data, bodyHtml, options = {}) {
  const compactClass = options.compact ? ' compact-print' : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${text(title)} - ${text(data.document.code)}</title>
  <link rel="stylesheet" href="/print.css" />
</head>
<body>
  ${printPreviewActionsScript()}
  <div class="print-page${compactClass}">
    ${bodyHtml}
    <div class="print-footer">In lúc: ${text(data.meta.printedAt)}</div>
  </div>
</body>
</html>`;
}

function orderTotalTemplate(data) {
  const isAggregate = data.document.printMode === 'MASTER_AGGREGATE_SELECTED';
  const title = isAggregate ? 'ĐƠN TỔNG GỘP' : 'PHIẾU NHẶT HÀNG ĐƠN TỔNG';

  if (isAggregate) {
    const groups = Array.isArray(data.warehouseGroups) && data.warehouseGroups.length
      ? data.warehouseGroups
      : [{ code: 'KHO_HC', name: 'KHO HC', items: data.items || [], saleItems: data.items || [], promoItems: [] }];
    const pages = groups.map((group) => {
      const pageTotals = {
        qty: (group.items || []).reduce((sum, item) => sum + Number(item.qty || item.quantity || 0), 0),
        amount: (group.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
      };
      return `
        <div class="print-page">
          ${renderMasterOrderHeaderBlock(data, title, group.name || group.code)}
          ${renderMasterKpiTable(data)}
          <div class="master-warehouse-block">
            <div class="section-title master-warehouse-title">${text(group.name || group.code)}</div>
            ${renderMasterWarehouseLineSection(data, `${group.name || group.code} - Hàng bán`, Array.isArray(group.saleItems) ? group.saleItems : [])}
            ${renderMasterWarehouseLineSection(data, `${group.name || group.code} - Xuất khuyến mại`, Array.isArray(group.promoItems) ? group.promoItems : [], { isPromo: true })}
          </div>
          <div class="total-box">
            <div><span>Tổng số lượng liên ${text(group.name || group.code)}:</span><b>${money(data, pageTotals.qty)}</b></div>
            <div><span>Giá trị liên ${text(group.name || group.code)}:</span><b>${money(data, pageTotals.amount)}</b></div>
            <div><span>Số đơn con:</span><b>${money(data, data.totals.orderCount)}</b></div>
          </div>
          ${renderSignature(['Người lập phiếu', 'Người giao hàng', group.name || group.code])}
          <div class="print-footer">In lúc: ${text(data.meta.printedAt)}</div>
        </div>`;
    }).join('');
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${text(title)} - ${text(data.document.code)}</title>
  <link rel="stylesheet" href="/print.css" />
</head>
<body>
  ${printPreviewActionsScript()}
  ${pages}
</body>
</html>`;
  }

  const body = `
    ${renderMasterOrderHeaderBlock(data, title)}
    ${renderMasterKpiTable(data)}
    ${renderMasterWarehouseTables(data)}
    <div class="total-box">
      <div><span>Tổng số lượng:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Giá trị đơn tổng:</span><b>${money(data, data.totals.totalAmount)}</b></div>
      <div><span>Số đơn con:</span><b>${money(data, data.totals.orderCount)}</b></div>
    </div>
    ${renderSignature(['Người lập phiếu', 'Người giao hàng', 'Kho HC', 'Kho PC'])}`;
  return baseLayout(title, data, body);
}

function importOrderTemplate(data) {
  const body = `
    <div class="simple-print-header">
      <div>
        <h2>${text(data.company.name)}</h2>
        <p>${text(data.company.address)}</p>
      </div>
      <div class="print-code"><b>Mã phiếu</b><span>${text(data.document.code)}</span></div>
    </div>
    <h1 class="print-title">PHIẾU NHẬP KHO</h1>
    <div class="info-grid">
      <div><b>Ngày nhập:</b> ${text(data.document.date)}</div>
      <div><b>Nhà cung cấp:</b> ${text(data.customer.name)}</div>
      <div class="full"><b>Ghi chú:</b> ${text(data.document.note)}</div>
    </div>
    ${renderGenericItemsTable(data)}
    <div class="total-box">
      <div><span>Tổng số lượng nhập:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Tổng giá trị:</span><b>${money(data, data.totals.totalAmount)}</b></div>
    </div>
    ${renderSignature(['Người lập phiếu', 'Người giao hàng', 'Thủ kho'])}`;
  return baseLayout('PHIẾU NHẬP KHO', data, body);
}

function paymentReceiptTemplate(data) {
  const body = `
    <div class="simple-print-header">
      <div>
        <h2>${text(data.company.name)}</h2>
        <p>${text(data.company.address)}</p>
      </div>
      <div class="print-code"><b>Mã phiếu</b><span>${text(data.document.code)}</span></div>
    </div>
    <h1 class="print-title">PHIẾU THU TIỀN</h1>
    <div class="info-grid">
      <div><b>Ngày thu:</b> ${text(data.document.date)}</div>
      <div><b>Người thu:</b> ${text(data.staff.name)}</div>
      <div><b>Mã KH:</b> ${text(data.customer.code)}</div>
      <div><b>Khách hàng:</b> ${text(data.customer.name)}</div>
      <div class="full"><b>Địa chỉ:</b> ${text(data.customer.address)}</div>
    </div>
    <div class="receipt-money"><span>Số tiền thu:</span><b>${money(data, data.totals.paid || data.totals.totalAmount)} đ</b></div>
    <p class="note"><b>Nội dung:</b> ${text(data.document.note || 'Thu tiền bán hàng')}</p>
    ${renderSignature(['Người lập phiếu', 'Người nộp tiền', 'Thủ quỹ'])}`;
  return baseLayout('PHIẾU THU TIỀN', data, body);
}

function renderDmsInvoiceItemsTable(data, itemsOverride = null, options = {}) {
  const items = Array.isArray(itemsOverride) ? itemsOverride : getDmsItems(data);
  const summary = getDmsSummary(data);
  const showTotal = options.showTotal !== false;
  const rows = items.length
    ? items.map((item) => `
      <tr>
        <td class="center">${text(item.lineNo)}</td>
        <td class="mono">${text(item.productCode)}</td>
        <td class="dms-product-name">${text(item.productName)}</td>
        <td class="center strong">${text(item.quantityCsSu)}</td>
        <td class="right strong">${money(data, item.quantity)}</td>
        <td class="right">${money(data, item.priceBeforeTaxBeforePromotion)}</td>
        <td class="right">${money(data, item.priceAfterTaxBeforePromotion)}</td>
        <td class="right">${money(data, item.priceAfterTaxAfterPromotion)}</td>
        <td class="right">${money(data, item.vatAmount)}</td>
        <td class="right strong">${money(data, item.lineAmount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="10" class="center">Chưa có dòng hàng</td></tr>';

  return `
    <table class="dms-invoice-table">
      <thead>
        <tr>
          <th style="width:4%">STT</th>
          <th style="width:8%">Mã hàng</th>
          <th style="width:36%">Tên sản phẩm</th>
          <th style="width:7%">Số lượng<br/>(CS/SU)</th>
          <th style="width:5%">Số<br/>lượng<br/>(lẻ)</th>
          <th style="width:8%">Đơn Giá<br/>(Trước Thuế/KM)</th>
          <th style="width:10%">Đơn Giá (Sau<br/>Thuế, Trước KM)</th>
          <th style="width:9%">Đơn giá<br/>(Sau Thuế/<br/>KM&CK)</th>
          <th style="width:7%">Thuế<br/>GTGT</th>
          <th style="width:10%">Thành tiền<br/>(Sau Thuế/<br/>KM&CK)</th>
        </tr>
        <tr class="dms-formula-row">
          <th>A</th><th></th><th></th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${showTotal ? `<tr class="dms-total-row">
          <td colspan="4" class="center strong">Tổng cộng (A)</td>
          <td class="right strong">${dmsMoney(data, summary.totalQty)}</td>
          <td></td><td></td><td></td>
          <td></td>
          <td class="right strong">${dmsMoney(data, summary.goodsAmountAfterPromotion)}</td>
        </tr>` : ''}
      </tbody>
    </table>`;
}

function renderDmsPromotionTable(data) {
  const promotions = groupDmsPromotionsByCode(getDmsPromotions(data));
  const summary = getDmsSummary(data);
  const rows = promotions.length
    ? promotions.map((promo) => `
      <tr>
        <td class="mono">${text(promo.code)}</td>
        <td>${text(promo.description)}</td>
        <td class="right">${dmsMoney(data, promo.qualifiedAmount)}</td>
        <td class="right">${promo.hasGroupDiscount ? text(promo.discountPercent) : ''}</td>
        <td class="right">${dmsMoney(data, promo.discountBeforeTax)}</td>
        <td class="right strong">${dmsMoney(data, promo.discountAfterTax)}</td>
      </tr>`).join('')
    : '<tr class="dms-empty-row"><td colspan="6">&nbsp;</td></tr>';

  const totalPromotionAmount = promotions.length
    ? promotions.reduce((sum, promo) => sum + Number(promo.discountAfterTax || 0), 0)
    : Number(summary.totalPromotionAmount ?? summary.promotionAmount ?? data.totals?.promotionValue ?? 0) || 0;

  return `
    <div class="dms-section-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>
    <table class="dms-detail-table dms-promotion-table">
      <thead>
        <tr>
          <th style="width:28mm">Mã CTKM Tiền</th>
          <th>Khuyến mãi bằng tiền</th>
          <th style="width:25mm">Giá trị hàng hóa mua</th>
          <th style="width:18mm">% chiết khấu</th>
          <th style="width:24mm">Tiền CK trước thuế</th>
          <th style="width:24mm">Tiền CK sau thuế</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="dms-total-row"><td colspan="5" class="right strong">Tổng giá trị khuyến mãi tiền (C)</td><td class="right strong">${dmsMoney(data, totalPromotionAmount)}</td></tr>
      </tbody>
    </table>`;
}

function renderDmsRewardTable(data) {
  const offsets = getDmsOffsets(data);
  const summary = getDmsSummary(data);
  const totalOffset = Number(summary.totalOffsetAmount ?? summary.displayRewardOffset ?? data.totals?.displayRewardTotal ?? 0) || 0;
  if (!offsets.length && !totalOffset) return '';
  const rows = offsets.length
    ? offsets.map((row) => `
      <tr>
        <td class="mono">${text(row.programCode)}</td>
        <td>${text(row.description)}</td>
        <td class="center">${text(row.displayMonth || row.month)}</td>
        <td class="right">${row.goodsAmount ? dmsMoney(data, row.goodsAmount) : ''}</td>
        <td class="center">${text(row.quantityText)}</td>
        <td class="right strong">${dmsMoney(data, row.offsetAmount)}</td>
      </tr>`).join('')
    : '<tr class="dms-empty-row"><td colspan="6">&nbsp;</td></tr>';
  return `
    <div class="dms-section-title">CHI TIẾT CẤN TRỪ NỢ:(D+E)</div>
    <table class="dms-detail-table dms-reward-table">
      <thead>
        <tr>
          <th style="width:28mm">Mã CT Trưng bày</th>
          <th>Nội dung Chương trình trưng bày</th>
          <th style="width:20mm">Tháng trưng bày</th>
          <th style="width:24mm">Chi trả trưng bày (hàng hóa)</th>
          <th style="width:20mm">Số lượng (Thùng/lẻ)</th>
          <th style="width:25mm">Chi trả trưng bày (cấn trừ nợ)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="dms-total-row"><td colspan="5" class="right strong">Tổng giá trị nhận được từ CT trưng bày (D)</td><td class="right strong">${dmsMoney(data, totalOffset)}</td></tr>
      </tbody>
    </table>`;
}

function renderDmsHeader(data, copyLabel, pageNo, pageCount) {
  const header = getDmsHeader(data);
  const distributor = getDmsDistributor(data);
  const customer = getDmsCustomer(data);
  const staff = getDmsSalesStaff(data);
  const normalizedCopy = normalizeCopyLabel(copyLabel);
  const pageText = formatDmsPage(pageNo, pageCount);
  const staffText = `${text(staff.staffCode)}${staff.staffName ? ` - ${text(staff.staffName)}` : ''}${staff.phone ? ` - ${text(staff.phone)}` : ''}`;
  const customerText = `${text(customer.customerCode)}${customer.customerName ? ` - ${text(customer.customerName)}` : ''}${customer.phone ? ` - ${text(customer.phone)}` : ''}`;
  const distributorText = `${text(distributor.code)}${distributor.name ? ` - ${text(distributor.name)}` : ''}`;

  return `
    <div class="dms-header-lines dms-invoice-header-left dms-invoice-header-right">
      <div class="dms-title-header">
        <div></div>
        <div class="dms-title-line">PHIẾU GIAO NHẬN VÀ THANH TOÁN</div>
        <div class="dms-truck-cell"><span>Số xe tải:</span> ${text(header.truckNo)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><span>Số hóa đơn:</span> ${text(header.invoiceCode)}</div>
        <div class="dms-line-right dms-line-right-split">
          <span><span>Loại hóa đơn:</span> ${text(header.invoiceType)}</span>
          <span class="dms-copy-page-cell"><span>${text(normalizedCopy)}</span><span>Trang: ${pageText}</span></span>
        </div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><span>Số đơn hàng:</span> ${text(header.orderCode)}</div>
        <div class="dms-line-right"><span>Thời gian đặt hàng:</span> ${text(header.orderDateTime)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><span>NVBH:</span> ${staffText}</div>
        <div class="dms-line-right"><span>Nhà phân phối:</span> ${distributorText}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><span>Khách hàng - Điện thoại:</span> ${customerText}</div>
        <div class="dms-line-right"><span>Địa chỉ:</span> ${text(distributor.address)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><span>Địa chỉ giao hàng:</span> ${text(customer.deliveryAddress)}</div>
        <div class="dms-line-right"><span>Điện thoại:</span> ${text(distributor.phone)}</div>
      </div>

      <div class="dms-header-line dms-single-line">
        <div class="dms-line-left"><span>Điều khoản thanh toán:</span> ${text(header.paymentTerm)}</div>
      </div>

      <div class="dms-header-line dms-single-line">
        <div class="dms-line-left"><span>MST:</span> ${text(header.taxCode || customer.taxCode)}</div>
      </div>
    </div>`;
}

function chunkDmsItems(items = [], size = 24) {
  const safeSize = Math.max(1, Number(size || 24));
  const chunks = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks.length ? chunks : [[]];
}

function hasDmsDetailRows(data) {
  return getDmsPromotions(data).length > 0 || getDmsOffsets(data).length > 0;
}

function dmsDeliveryInvoiceTemplate(data) {
  const pagination = getDmsPagination(data);
  const summary = getDmsSummary(data);
  const renderSummaryAndSignature = () => `
      <table class="dms-summary-split-table">
        <tbody>
          <tr class="dms-payable-row">
            <td class="dms-summary-left-cell"></td>
            <td class="dms-summary-label-cell">Số tiền phải thanh toán (A7-D-E-H)</td>
            <td class="dms-summary-value-cell">${dmsMoney(data, summary.payableAmount ?? data.totals?.payable ?? data.totals?.totalAmount)}</td>
          </tr>
          <tr>
            <td class="dms-summary-left-cell"></td>
            <td class="dms-summary-label-cell">Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</td>
            <td class="dms-summary-value-cell">${dmsMoney(data, summary.grossAmountBeforePromotion ?? data.totals?.goodsAmount)}</td>
          </tr>
          <tr>
            <td class="dms-summary-left-cell dms-amount-words-cell"><b>Số tiền viết bằng chữ :</b> <span class="dms-amount-words-text">${text(summary.amountInWords || data.totals.totalAmountText)}</span></td>
            <td class="dms-summary-label-cell">Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</td>
            <td class="dms-summary-value-cell">${dmsMoney(data, summary.totalPromotionAmount ?? data.totals?.promotionValue)}</td>
          </tr>
          <tr>
            <td class="dms-summary-left-cell"></td>
            <td class="dms-summary-label-cell">Cấn trừ tiền (D+E+H):</td>
            <td class="dms-summary-value-cell">${dmsMoney(data, summary.totalOffsetAmount ?? data.totals?.displayRewardTotal)}</td>
          </tr>
          <tr>
            <td class="dms-summary-left-cell"></td>
            <td class="dms-summary-label-cell">Tổng tiền CK của NPP (F)=(G-C)* 0,00% :</td>
            <td class="dms-summary-value-cell">${dmsMoney(data, summary.nppDiscountAmount)}</td>
          </tr>
          <tr>
            <td class="dms-summary-left-cell"></td>
            <td class="dms-summary-label-cell">Tỉ lệ KM & CK của đơn hàng [(B+C+F)/G]*100%:</td>
            <td class="dms-summary-value-cell">${formatPercent(summary.promotionRate ?? data.totals?.promotionRate)}%</td>
          </tr>
        </tbody>
      </table>
      <div class="dms-signature">
        <div><b>Người lập biểu</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Người bán hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Nhân viên giao hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Người nhận hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      </div>`;

  const renderCopy = (copyLabel) => {
    const items = getDmsItems(data);
    const itemPageSize = Number(pagination.itemPageSize || 24);
    const itemChunks = chunkDmsItems(items, itemPageSize);
    const detailRowsExist = hasDmsDetailRows(data);
    const detailNeedsOwnPage = detailRowsExist && (items.length > 18 || pagination.detailRows > 4 || pagination.pagesPerCopy > itemChunks.length);
    const pageCount = itemChunks.length + (detailNeedsOwnPage ? 1 : 0);

    const itemPages = itemChunks.map((chunk, index) => {
      const isLastItemPage = index === itemChunks.length - 1;
      return `
        <section class="print-page dms-print-page">
          ${renderDmsHeader(data, copyLabel, index + 1, pageCount)}
          ${renderDmsInvoiceItemsTable(data, chunk, { showTotal: isLastItemPage })}
          ${isLastItemPage ? renderSummaryAndSignature() : ''}
          ${isLastItemPage && !detailNeedsOwnPage ? renderDmsPromotionTable(data) + renderDmsRewardTable(data) : ''}
          ${isLastItemPage && detailNeedsOwnPage ? renderDmsPromotionHeaderOnly() : ''}
        </section>`;
    }).join('');

    const detailPage = detailNeedsOwnPage ? `
      <section class="print-page dms-print-page">
        ${renderDmsHeader(data, copyLabel, itemChunks.length + 1, pageCount)}
        ${renderDmsPromotionTable(data)}
        ${renderDmsRewardTable(data)}
      </section>` : '';

    return itemPages + detailPage;
  };

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phiếu giao nhận DMS - ${text(data.document.code)}</title>
  <link rel="stylesheet" href="/print.css" />
</head>
<body class="dms-print-body">
  ${printPreviewActionsScript()}
  ${pagination.copies.map(renderCopy).join('')}
</body>
</html>`;
}

module.exports = {
  ORDER_SINGLE: dmsDeliveryInvoiceTemplate,
  DMS_DELIVERY_INVOICE: dmsDeliveryInvoiceTemplate,
  ORDER_TOTAL: orderTotalTemplate,
  IMPORT_ORDER: importOrderTemplate,
  PAYMENT_RECEIPT: paymentReceiptTemplate
};
