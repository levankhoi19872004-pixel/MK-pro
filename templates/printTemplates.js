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
    lineNo: item.stt,
    productCode: item.code,
    productName: item.name,
    quantityCsSu: item.caseDisplay,
    quantity: item.qty,
    priceBeforeTaxBeforePromotion: item.listPriceBeforeVat || item.priceBeforeVat || item.price,
    priceAfterTaxBeforePromotion: item.listPriceAfterVat || item.priceAfterVatBeforeDiscount,
    priceAfterTaxAfterPromotion: item.priceAfterVatAfterDiscount || item.priceAfterDiscount,
    vatAmount: item.tax,
    lineAmount: item.amount,
    isPromotionGift: item.isPromo,
    promotionRows: item.promotionRows || []
  }));
}

function getDmsPromotions(data) {
  const payload = getDmsPayload(data);
  if (Array.isArray(payload.promotions) && payload.promotions.length) return payload.promotions;
  return (data.promotions || []).map((promo) => ({
    productCode: promo.productCode || '',
    productName: promo.productName || '',
    lineType: promo.lineType || '',
    quantity: promo.quantity || promo.qty,
    promotionCode: promo.promotionCode || promo.code,
    code: promo.promotionCode || promo.code,
    description: promo.description || promo.name,
    qualifiedAmount: promo.qualifiedAmount || promo.basisAmount,
    discountPercent: promo.discountPercent || promo.percent,
    discountBeforeTax: promo.discountBeforeTax || promo.beforeTax,
    discountAfterTax: promo.discountAfterTax || promo.afterTax
  }));
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
    <div class="dms-section-title">CHI TIẾT KHUYẾN MÃI THEO DÒNG SẢN PHẨM: (B+C)</div>
    <table class="dms-detail-table dms-promotion-table">
      <thead>
        <tr>
          <th style="width:28mm">Mã CTKM</th>
          <th>Diễn giải khuyến mãi theo từng dòng sản phẩm bán / khuyến mại</th>
          <th style="width:25mm">Giá trị hàng hóa mua</th>
          <th style="width:18mm">% chiết khấu</th>
          <th style="width:24mm">Tiền CK trước thuế</th>
          <th style="width:24mm">Tiền CK sau thuế</th>
        </tr>
      </thead>
    </table>`;
}

function renderInvoiceItemsTable(data) {
  const rows = data.items.length
    ? data.items.map((item) => `
      <tr>
        <td class="center">${item.stt}</td>
        <td class="mono">${text(item.code)}</td>
        <td class="product-name">${text(item.name)}${item.sourceOrderCode ? `<div class="muted">Đơn: ${text(item.sourceOrderCode)}</div>` : ''}</td>
        <td class="center">${text(item.caseDisplay)}</td>
        <td class="right">${money(data, item.qty)}</td>
        <td class="right">${money(data, item.price)}</td>
        <td class="right">${money(data, item.priceAfterDiscount || item.price)}</td>
        <td class="right">${money(data, item.tax)}</td>
        <td class="right strong">${money(data, item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="center">Chưa có dòng hàng</td></tr>';

  return `
    <table class="invoice-table">
      <thead>
        <tr>
          <th style="width:7mm">STT</th>
          <th style="width:18mm">Mã hàng</th>
          <th>Tên sản phẩm</th>
          <th style="width:18mm">Số lượng<br/>(CS/SU)</th>
          <th style="width:14mm">Số lượng<br/>(lẻ)</th>
          <th style="width:20mm">Đơn giá<br/>(Trước thuế/KM)</th>
          <th style="width:20mm">Đơn giá<br/>(Sau thuế/KM)</th>
          <th style="width:16mm">Thuế<br/>GTGT</th>
          <th style="width:22mm">Thành tiền<br/>(Sau thuế/KM&CK)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="invoice-total-row">
          <td colspan="4" class="center strong">Tổng cộng (A)</td>
          <td class="right strong">${money(data, data.totals.totalQty)}</td>
          <td></td>
          <td></td>
          <td class="right strong">${money(data, data.totals.tax)}</td>
          <td class="right strong">${money(data, data.totals.totalAmount)}</td>
        </tr>
      </tbody>
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

function renderPromotionTable(data) {
  if (!data.promotions.length) return '';

  const rows = data.promotions.map((promo) => `
    <tr>
      <td class="center">${promo.stt}</td>
      <td class="mono">${text(promo.code)}</td>
      <td>${text(promo.name)}</td>
      <td class="right">${money(data, promo.basisAmount)}</td>
      <td class="right">${promo.percent ? `${money(data, promo.percent)}%` : ''}</td>
      <td class="right">${money(data, promo.beforeTax)}</td>
      <td class="right strong">${money(data, promo.afterTax)}</td>
    </tr>`).join('');

  return `
    <div class="section-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>
    <table class="promotion-table">
      <thead>
        <tr>
          <th style="width:8mm">STT</th>
          <th style="width:28mm">Mã CTKM</th>
          <th>Khuyến mãi bằng tiền / hàng</th>
          <th style="width:24mm">Giá trị hàng hóa mua</th>
          <th style="width:18mm">% chiết khấu</th>
          <th style="width:24mm">Tiền CK trước thuế</th>
          <th style="width:24mm">Tiền CK sau thuế</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
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

function renderDocumentHeader(title, data) {
  const invoiceCode = data.document.invoiceCode || data.document.code;
  const orderCode = data.document.customerOrderCode || data.document.code;
  const invoiceType = data.document.type || 'Từ NVTT';
  const copyLabel = data.meta.copyLabel || '';
  const pageLabel = data.document.page || '';
  const distributorName = data.company.name || '3293 - Công Ty TNHH MTV Minh Khai';

  return `
    <div class="invoice-header-lines">
      <div class="h-row title-row">
        <div class="h-cell"></div>
        <div class="h-cell invoice-title-line">${text(title)}</div>
        <div class="h-cell right-info"><b>Số xe tải:</b> ${text(data.document.vehicleNo)}</div>
      </div>

      <div class="h-row">
        <div class="h-cell"><b>Số hóa đơn:</b> ${text(invoiceCode)}</div>
        <div class="h-cell center-info"><b>Loại hóa đơn:</b> ${text(invoiceType)}</div>
        <div class="h-cell copy-page-cell"><b>${text(copyLabel)}</b><b>Trang: ${text(pageLabel)}</b></div>
      </div>

      <div class="h-row">
        <div class="h-cell"><b>Số đơn hàng:</b> ${text(orderCode)}</div>
        <div class="h-cell"><b>Thời gian đặt hàng:</b> ${text(data.document.dateTime)}</div>
        <div class="h-cell"></div>
      </div>

      <div class="h-row">
        <div class="h-cell"><b>NVBH:</b> ${text(data.staff.code)} - ${text(data.staff.name)}</div>
        <div class="h-cell"><b>Nhà phân phối:</b> ${text(distributorName)}</div>
        <div class="h-cell"></div>
      </div>

      <div class="h-row">
        <div class="h-cell"><b>Khách hàng - Điện thoại:</b> ${text(data.customer.code)} - ${text(data.customer.name)} - ${text(data.customer.phone)}</div>
        <div class="h-cell"><b>Địa chỉ:</b> ${text(data.company.address)}</div>
        <div class="h-cell"></div>
      </div>

      <div class="h-row">
        <div class="h-cell"><b>Địa chỉ giao hàng:</b> ${text(data.customer.address)}</div>
        <div class="h-cell"><b>Điện thoại:</b> ${text(data.company.phone)}</div>
        <div class="h-cell"></div>
      </div>

      <div class="h-row single-left-row">
        <div class="h-cell"><b>Điều khoản thanh toán:</b> ${text(data.document.terms)}</div>
        <div class="h-cell"></div>
        <div class="h-cell"></div>
      </div>

      <div class="h-row single-left-row">
        <div class="h-cell"><b>MST:</b> ${text(data.customer.taxCode)}</div>
        <div class="h-cell"></div>
        <div class="h-cell"></div>
      </div>
    </div>`;
}

function orderSingleTemplate(data) {
  const body = `
    ${renderDocumentHeader('PHIẾU GIAO NHẬN VÀ THANH TOÁN', data)}
    ${renderInvoiceItemsTable(data)}

    <div class="invoice-summary-grid">
      <div class="amount-in-words">
        <b>Số tiền viết bằng chữ:</b> ${text(data.totals.totalAmountText)}
      </div>

      <div class="calculation-box">
        <div><span>Số tiền phải thanh toán (A7-D-E-H)</span><b>${money(data, data.totals.payable || data.totals.totalAmount)}</b></div>
        <div><span>Tổng tiền sau thuế chưa trừ KM (G)=(2)*(4)</span><b>${money(data, data.totals.goodsAmount || data.totals.totalAmount)}</b></div>
        <div><span>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C)</span><b>${money(data, data.totals.promotionValue)}</b></div>
        <div><span>Cấn trừ tiền (D+E+H)</span><b>${money(data, data.totals.discount)}</b></div>
        <div><span>Tổng tiền CK của NPP (F)=...</span><b>${money(data, data.totals.discount)}</b></div>
        <div><span>Tỉ lệ KM & CK của đơn hàng</span><b>${data.totals.totalAmount ? ((data.totals.discount / data.totals.totalAmount) * 100).toFixed(2) : '0.00'}%</b></div>
      </div>
    </div>

    <div class="invoice-signature">
      <div><b>Người lập biểu</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Người bán hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Nhân viên giao hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      <div><b>Người nhận hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
    </div>

    ${renderPromotionTable(data)}
  `;

  return baseLayout('PHIẾU GIAO NHẬN VÀ THANH TOÁN', data, body, { compact: true });
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
          <td class="right strong">${dmsMoney(data, summary.totalVatAmount ?? data.totals?.tax)}</td>
          <td class="right strong">${dmsMoney(data, summary.goodsAmountAfterPromotion)}</td>
        </tr>` : ''}
      </tbody>
    </table>`;
}

function renderDmsPromotionTable(data) {
  const promotions = getDmsPromotions(data);
  const summary = getDmsSummary(data);
  const rows = promotions.length
    ? promotions.map((promo) => {
      const productInfo = [promo.lineType, promo.productCode, promo.productName]
        .filter(Boolean)
        .join(' - ');
      return `
      <tr>
        <td class="mono">${text(promo.promotionCode || promo.code)}</td>
        <td>
          ${productInfo ? `<div class="dms-promo-product">${text(productInfo)}</div>` : ''}
          <div>${text(promo.description)}</div>
        </td>
        <td class="right">${dmsMoney(data, promo.qualifiedAmount)}</td>
        <td class="right">${formatPercent(promo.discountPercent)}</td>
        <td class="right">${dmsMoney(data, promo.discountBeforeTax)}</td>
        <td class="right strong">${dmsMoney(data, promo.discountAfterTax)}</td>
      </tr>`;
    }).join('')
    : '<tr class="dms-empty-row"><td colspan="6">&nbsp;</td></tr>';
  return `
    <div class="dms-section-title">CHI TIẾT KHUYẾN MÃI THEO DÒNG SẢN PHẨM: (B+C)</div>
    <table class="dms-detail-table dms-promotion-table">
      <thead>
        <tr>
          <th style="width:28mm">Mã CTKM</th>
          <th>Diễn giải khuyến mãi theo từng dòng sản phẩm bán / khuyến mại</th>
          <th style="width:25mm">Giá trị hàng hóa mua</th>
          <th style="width:18mm">% chiết khấu</th>
          <th style="width:24mm">Tiền CK trước thuế</th>
          <th style="width:24mm">Tiền CK sau thuế</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="dms-total-row"><td colspan="5" class="right strong">Tổng giá trị khuyến mãi tiền (C)</td><td class="right strong">${dmsMoney(data, summary.totalPromotionAmount ?? summary.promotionAmount ?? data.totals?.promotionValue)}</td></tr>
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
    <div class="dms-header-lines">
      <div class="dms-title-header">
        <div></div>
        <div class="dms-title-line">PHIẾU GIAO NHẬN VÀ THANH TOÁN</div>
        <div class="dms-truck-cell"><b>Số xe tải:</b> ${text(header.truckNo)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><b>Số hóa đơn:</b> ${text(header.invoiceCode)}</div>
        <div class="dms-line-right dms-line-right-split">
          <span><b>Loại hóa đơn:</b> ${text(header.invoiceType)}</span>
          <span class="dms-copy-page-cell"><b>${text(normalizedCopy)}</b><b>Trang: ${pageText}</b></span>
        </div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><b>Số đơn hàng:</b> ${text(header.orderCode)}</div>
        <div class="dms-line-right"><b>Thời gian đặt hàng:</b> ${text(header.orderDateTime)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><b>NVBH:</b> ${staffText}</div>
        <div class="dms-line-right"><b>Nhà phân phối:</b> ${distributorText}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><b>Khách hàng - Điện thoại:</b> ${customerText}</div>
        <div class="dms-line-right"><b>Địa chỉ:</b> ${text(distributor.address)}</div>
      </div>

      <div class="dms-header-line">
        <div class="dms-line-left"><b>Địa chỉ giao hàng:</b> ${text(customer.deliveryAddress)}</div>
        <div class="dms-line-right"><b>Điện thoại:</b> ${text(distributor.phone)}</div>
      </div>

      <div class="dms-header-line dms-single-line">
        <div class="dms-line-left"><b>Điều khoản thanh toán:</b> ${text(header.paymentTerm)}</div>
      </div>

      <div class="dms-header-line dms-single-line">
        <div class="dms-line-left"><b>MST:</b> ${text(header.taxCode || customer.taxCode)}</div>
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
      <div class="dms-summary-grid">
        <div class="dms-amount-words"><b>Số tiền viết bằng chữ :</b> ${text(summary.amountInWords || data.totals.totalAmountText)}</div>
        <div class="dms-calculation-box">
          <table class="dms-summary-table">
            <tbody>
              <tr class="dms-payable-row"><td>Số tiền phải thanh toán (A7-D-E-H)</td><td>${dmsMoney(data, summary.payableAmount ?? data.totals?.payable ?? data.totals?.totalAmount)}</td></tr>
              <tr><td>Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</td><td>${dmsMoney(data, summary.grossAmountBeforePromotion ?? data.totals?.goodsAmount)}</td></tr>
              <tr><td>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</td><td>${dmsMoney(data, summary.totalPromotionAmount ?? data.totals?.promotionValue)}</td></tr>
              <tr><td>Cấn trừ tiền (D+E+H):</td><td>${dmsMoney(data, summary.totalOffsetAmount ?? data.totals?.displayRewardTotal)}</td></tr>
              <tr><td>Tổng tiền CK của NPP (F)=(G-C)* 0,00% :</td><td>${dmsMoney(data, summary.nppDiscountAmount)}</td></tr>
              <tr><td>Tỉ lệ KM & CK của đơn hàng [(B+C+F)/G]*100%:</td><td>${formatPercent(summary.promotionRate ?? data.totals?.promotionRate)}%</td></tr>
            </tbody>
          </table>
        </div>
      </div>
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
  ORDER_SINGLE: orderSingleTemplate,
  DMS_DELIVERY_INVOICE: dmsDeliveryInvoiceTemplate,
  ORDER_TOTAL: orderTotalTemplate,
  IMPORT_ORDER: importOrderTemplate,
  PAYMENT_RECEIPT: paymentReceiptTemplate
};
