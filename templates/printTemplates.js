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


function renderMasterWarehouseLineSection(data, title, items = [], options = {}) {
  const isPromo = Boolean(options.isPromo);
  const colspan = 5;
  const rows = items.length
    ? items.map((item, index) => `
        <tr class="${isPromo ? 'promo-line-row' : 'sale-line-row'}">
          <td class="center">${index + 1}</td>
          <td class="mono">${text(item.code)}</td>
          <td>${text(item.name)}${isPromo ? '<div class="muted">Xuất khuyến mại - không tính tiền</div>' : ''}</td>
          <td class="center">${text(item.unit)}</td>
          <td class="center strong">${text(item.caseDisplay)}</td>
          <td class="right strong">${money(data, item.qty)}</td>
          <td class="right">${isPromo ? '0' : money(data, item.price)}</td>
          <td class="right strong">${money(data, item.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="8" class="center">${isPromo ? 'Không có hàng khuyến mại' : 'Không có hàng bán'}</td></tr>`;

  const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return `
    <div class="master-line-section ${isPromo ? 'promo-section' : 'sale-section'}">
      <div class="section-title">${text(title)}</div>
      <table class="print-table master-picking-table">
        <thead>
          <tr>
            <th style="width:8mm">STT</th>
            <th style="width:24mm">Mã hàng</th>
            <th>Tên hàng đã gộp từ đơn con</th>
            <th style="width:16mm">ĐVT</th>
            <th style="width:20mm">Thùng/Lẻ</th>
            <th style="width:18mm">SL lẻ</th>
            <th style="width:24mm">Giá bán SP</th>
            <th style="width:30mm">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="invoice-total-row">
            <td colspan="${colspan}" class="right strong">Tổng ${text(title)}</td>
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
  <div class="print-page${compactClass}">
    ${bodyHtml}
    <div class="print-footer">In lúc: ${text(data.meta.printedAt)}</div>
  </div>
  <script>
    window.onload = function(){
      window.focus();
      if (!window.location.search.includes('preview=1')) window.print();
    };
  </script>
</body>
</html>`;
}

function renderDocumentHeader(title, data) {
  return `
    <div class="document-top">
      <div class="doc-left">
        <div><b>Số hóa đơn:</b> ${text(data.document.invoiceCode || data.document.code)}</div>
        <div><b>Số đơn hàng:</b> ${text(data.document.customerOrderCode || data.document.code)}</div>
        <div><b>NVBH:</b> ${text(data.staff.code)} - ${text(data.staff.name)}</div>
        <div><b>Khách hàng:</b> ${text(data.customer.code)} - ${text(data.customer.name)} - ${text(data.customer.phone)}</div>
        <div><b>Địa chỉ giao hàng:</b> ${text(data.customer.address)}</div>
        <div><b>Điều khoản thanh toán:</b> ${text(data.document.terms)}</div>
        <div><b>MST:</b> ${text(data.customer.taxCode)}</div>
      </div>

      <div class="doc-title">
        <h1>${text(title)}</h1>
        <div><b>Loại hóa đơn:</b> ${text(data.document.type || 'Từ NVTT')}</div>
      </div>

      <div class="doc-right">
        <div><b>Số xe tải:</b> ${text(data.document.vehicleNo)}</div>
        <div><b>${text(data.meta.copyLabel)}</b></div>
        <div><b>Trang:</b> ${text(data.document.page)}</div>
        <br/>
        <div><b>Thời gian đặt hàng:</b> ${text(data.document.dateTime)}</div>
        <div><b>Nhà phân phối:</b> 3293 - Công Ty TNHH MTV Minh Khai</div>
        <div><b>Địa chỉ:</b> ${text(data.company.address)}</div>
        <div><b>Điện thoại:</b> ${text(data.company.phone)}</div>
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
  const body = `
    <div class="simple-print-header">
      <div>
        <h2>${text(data.company.name)}</h2>
        <p>${text(data.company.address)}</p>
      </div>
      <div class="print-code"><b>Mã đơn tổng</b><span>${text(data.document.code)}</span></div>
    </div>
    <h1 class="print-title">PHIẾU NHẶT HÀNG ĐƠN TỔNG</h1>
    <div class="info-grid">
      <div><b>Mã đơn tổng:</b> ${text(data.document.code)}</div>
      <div><b>Ngày giao:</b> ${text(data.document.date)}</div>
      <div><b>Nhân viên giao hàng:</b> ${text(data.delivery.code)} - ${text(data.delivery.name)}</div>
      <div><b>Tuyến:</b> ${text(data.delivery.route)}</div>
      <div><b>Số đơn con:</b> ${money(data, data.totals.orderCount)}</div>
      <div><b>Giá trị đơn tổng:</b> ${money(data, data.totals.totalAmount)} đ</div>
      <div class="full"><b>Nguyên tắc tính:</b> Gộp số lượng từ đơn con, chia theo kho mặc định trên sản phẩm, giá trị = số lượng × giá bán hiện tại trong danh mục sản phẩm.</div>
    </div>
    ${renderMasterWarehouseTables(data)}
    <div class="total-box">
      <div><span>Tổng số lượng:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Giá trị đơn tổng:</span><b>${money(data, data.totals.totalAmount)}</b></div>
      <div><span>Số đơn con:</span><b>${money(data, data.totals.orderCount)}</b></div>
    </div>
    ${renderSignature(['Người lập phiếu', 'Người giao hàng', 'Kho HC', 'Kho PC'])}`;
  return baseLayout('PHIẾU NHẶT HÀNG ĐƠN TỔNG', data, body);
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

function renderDmsInvoiceItemsTable(data) {
  const rows = data.items.length
    ? data.items.map((item) => `
      <tr>
        <td class="center">${item.stt}</td>
        <td class="mono">${text(item.code)}</td>
        <td class="dms-product-name">${text(item.name)}</td>
        <td class="center strong">${text(item.caseDisplay)}</td>
        <td class="right strong">${money(data, item.qty)}</td>
        <td class="right">${money(data, item.listPriceBeforeVat || item.priceBeforeVat || item.price)}</td>
        <td class="right">${money(data, item.listPriceAfterVat || item.priceAfterVatBeforeDiscount)}</td>
        <td class="right">${money(data, item.priceAfterVatAfterDiscount || item.priceAfterDiscount)}</td>
        <td class="right">${money(data, item.tax)}</td>
        <td class="right strong">${money(data, item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="10" class="center">Chưa có dòng hàng</td></tr>';

  return `
    <table class="dms-invoice-table">
      <thead>
        <tr>
          <th style="width:4%">STT</th>
          <th style="width:8%">Mã hàng</th>
          <th style="width:37%">Tên sản phẩm</th>
          <th style="width:7%">Số lượng<br/>(CS/SU)</th>
          <th style="width:5%">Số<br/>lượng<br/>(lẻ)</th>
          <th style="width:7%">Đơn Giá<br/>(Trước Thuế/KM)</th>
          <th style="width:10%">Đơn Giá (Sau<br/>Thuế, Trước KM)</th>
          <th style="width:7%">Đơn giá<br/>(Sau Thuế/<br/>KM&CK)</th>
          <th style="width:7%">Thuế<br/>GTGT</th>
          <th style="width:10%">Thành tiền<br/>(Sau Thuế/<br/>KM&CK)</th>
        </tr>
        <tr class="dms-formula-row">
          <th>A</th><th></th><th></th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="dms-total-row">
          <td colspan="4" class="center strong">Tổng cộng (A)</td>
          <td class="right strong">${money(data, data.totals.totalQty)}</td>
          <td></td><td></td><td></td>
          <td class="right strong">${money(data, data.totals.tax)}</td>
          <td class="right strong">${money(data, data.totals.totalAmount)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderDmsPromotionTable(data) {
  if (!data.promotions.length) return '';
  const rows = data.promotions.map((promo) => `
    <tr>
      <td class="mono">${text(promo.code)}</td>
      <td>${text(promo.name)}</td>
      <td class="right">${money(data, promo.basisAmount)}</td>
      <td class="right">${promo.percent ? `${money(data, promo.percent)}` : ''}</td>
      <td class="right">${money(data, promo.beforeTax)}</td>
      <td class="right strong">${money(data, promo.afterTax)}</td>
    </tr>`).join('');
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
        <tr class="dms-total-row"><td colspan="5" class="right strong">Tổng giá trị khuyến mãi tiền (C)</td><td class="right strong">${money(data, data.totals.promotionValue)}</td></tr>
      </tbody>
    </table>`;
}

function renderDmsRewardTable(data) {
  if (!data.displayRewards.length) return '';
  const rows = data.displayRewards.map((row) => `
    <tr>
      <td class="mono">${text(row.code)}</td>
      <td>${text(row.name)}</td>
      <td class="center">${text(row.month)}</td>
      <td class="right">${money(data, row.goodsAmount)}</td>
      <td class="center">${text(row.quantityText)}</td>
      <td class="right strong">${money(data, row.offsetAmount)}</td>
    </tr>`).join('');
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
        <tr class="dms-total-row"><td colspan="5" class="right strong">Tổng giá trị nhận được từ CT trưng bày (D)</td><td class="right strong">${money(data, data.totals.displayRewardTotal)}</td></tr>
      </tbody>
    </table>`;
}

function renderDmsHeader(data, copyLabel) {
  return `
    <div class="dms-document-top">
      <div class="dms-left">
        <div><b>Số hóa đơn:</b> ${text(data.document.invoiceCode || data.document.code)}</div>
        <div><b>Số đơn hàng:</b> ${text(data.document.customerOrderCode || data.document.code)}</div>
        <div><b>NVBH:</b> ${text(data.staff.code)} - ${text(data.staff.name)}${data.staff.phone ? ` - ${text(data.staff.phone)}` : ''}</div>
        <div><b>Khách hàng - Điện thoại:</b> ${text(data.customer.code)} - ${text(data.customer.name)} - ${text(data.customer.phone)}</div>
        <div><b>Địa chỉ giao hàng:</b> ${text(data.customer.address)}</div>
        <div><b>Điều khoản thanh toán:</b> ${text(data.document.terms)}</div>
        <div><b>MST:</b> ${text(data.customer.taxCode)}</div>
      </div>
      <div class="dms-title-block">
        <h1>PHIẾU GIAO NHẬN VÀ THANH TOÁN</h1>
        <div><b>Loại hóa đơn:</b> ${text(data.document.type || 'Từ NVTT')}</div>
      </div>
      <div class="dms-right">
        <div><b>Số xe tải:</b> ${text(data.document.vehicleNo)}</div>
        <div class="dms-copy"><b>${text(copyLabel)}</b></div>
        <div><b>Trang:</b> 1 / 2</div>
        <br/>
        <div><b>Thời gian đặt hàng:</b> ${text(data.document.dateTime)}</div>
        <div><b>Nhà phân phối:</b> ${text(data.company.code || '3293')} - ${text(data.company.name || 'Công Ty TNHH MTV Minh Khai')}</div>
        <div><b>Địa chỉ:</b> ${text(data.company.address)}</div>
        <div><b>Điện thoại:</b> ${text(data.company.phone)}</div>
      </div>
    </div>`;
}

function dmsDeliveryInvoiceTemplate(data) {
  const renderCopy = (copyLabel) => `
    <section class="print-page dms-print-page compact-print">
      ${renderDmsHeader(data, copyLabel)}
      ${renderDmsInvoiceItemsTable(data)}
      <div class="dms-summary-grid">
        <div class="dms-amount-words"><b>Số tiền viết bằng chữ :</b> ${text(data.totals.totalAmountText)}</div>
        <div class="dms-calculation-box">
          <div><span>Số tiền phải thanh toán (A7-D-E-H)</span><b>${money(data, data.totals.payable || data.totals.totalAmount)}</b></div>
          <div><span>Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</span><b>${money(data, data.totals.goodsAmount || data.totals.totalAmount)}</b></div>
          <div><span>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</span><b>${money(data, data.totals.promotionValue)}</b></div>
          <div><span>Cấn trừ tiền (D+E+H):</span><b>${money(data, data.totals.displayRewardTotal || data.totals.discount)}</b></div>
          <div><span>Tổng tiền CK của NPP (F)=...</span><b>0</b></div>
          <div><span>Tỉ lệ KM & CK của đơn hàng [(B+C+F)/G]*100%:</span><b>${data.totals.goodsAmount ? ((data.totals.promotionValue / data.totals.goodsAmount) * 100).toFixed(2) : '0.00'}%</b></div>
        </div>
      </div>
      <div class="dms-signature">
        <div><b>Người lập biểu</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Người bán hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Nhân viên giao hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
        <div><b>Người nhận hàng</b><span>(Ký, ghi rõ họ tên)</span></div>
      </div>
      ${renderDmsPromotionTable(data)}
      ${renderDmsRewardTable(data)}
    </section>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phiếu giao nhận DMS - ${text(data.document.code)}</title>
  <link rel="stylesheet" href="/print.css" />
</head>
<body class="dms-print-body">
  ${renderCopy('Liên 1')}
  ${renderCopy('Liên 2')}
  <script>
    window.onload = function(){
      window.focus();
      if (!window.location.search.includes('preview=1')) window.print();
    };
  </script>
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
