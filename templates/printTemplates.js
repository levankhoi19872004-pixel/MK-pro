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

function renderItemsTable(data) {
  const rows = data.items.length
    ? data.items.map(item => `
      <tr>
        <td class="center">${item.stt}</td>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td class="center">${escapeHtml(item.unit)}</td>
        <td class="right">${money(data, item.qty)}</td>
        <td class="right">${money(data, item.price)}</td>
        <td class="right">${money(data, item.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="center">Chưa có dòng hàng</td></tr>';

  return `
    <table class="print-table">
      <thead>
        <tr>
          <th style="width:35px">STT</th>
          <th style="width:90px">Mã hàng</th>
          <th>Tên hàng</th>
          <th style="width:55px">ĐVT</th>
          <th style="width:65px">SL</th>
          <th style="width:90px">Đơn giá</th>
          <th style="width:105px">Thành tiền</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSignature(labels = ['Người lập phiếu', 'Khách hàng', 'Thủ kho / Giao hàng']) {
  return `
    <div class="signature-row">
      ${labels.map(label => `<div><b>${escapeHtml(label)}</b><span>Ký, ghi rõ họ tên</span></div>`).join('')}
    </div>`;
}

function baseLayout(title, data, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - ${escapeHtml(data.document.code)}</title>
  <link rel="stylesheet" href="/print.css" />
</head>
<body>
  <div class="print-page">
    <div class="print-header">
      <div>
        <h2>${escapeHtml(data.company.name)}</h2>
        <p>${escapeHtml(data.company.address)}</p>
        <p>${data.company.phone ? `ĐT: ${escapeHtml(data.company.phone)}` : ''}${data.company.taxCode ? ` - MST: ${escapeHtml(data.company.taxCode)}` : ''}</p>
      </div>
      <div class="print-code"><b>Mã phiếu</b><span>${escapeHtml(data.document.code)}</span></div>
    </div>
    <h1 class="print-title">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <div class="print-footer">In lúc: ${escapeHtml(data.meta.printedAt)}</div>
  </div>
  <script>window.onload = function(){ window.focus(); window.print(); };</script>
</body>
</html>`;
}

function orderSingleTemplate(data) {
  const body = `
    <div class="info-grid">
      <div><b>Ngày:</b> ${escapeHtml(data.document.date)}</div>
      <div><b>NV bán hàng:</b> ${escapeHtml(data.staff.name)}</div>
      <div><b>Mã KH:</b> ${escapeHtml(data.customer.code)}</div>
      <div><b>Khách hàng:</b> ${escapeHtml(data.customer.name)}</div>
      <div class="full"><b>Địa chỉ:</b> ${escapeHtml(data.customer.address)}</div>
      <div><b>SĐT:</b> ${escapeHtml(data.customer.phone)}</div>
      <div><b>Tuyến:</b> ${escapeHtml(data.delivery.route)}</div>
    </div>
    ${renderItemsTable(data)}
    <div class="total-box">
      <div><span>Tổng số lượng:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Tổng tiền hàng:</span><b>${money(data, data.totals.totalAmount)}</b></div>
      <div><span>Chiết khấu:</span><b>${money(data, data.totals.discount)}</b></div>
      <div><span>Đã thu:</span><b>${money(data, data.totals.paid)}</b></div>
      <div><span>Còn nợ:</span><b>${money(data, data.totals.debt)}</b></div>
    </div>
    <p class="note"><b>Ghi chú:</b> ${escapeHtml(data.document.note)}</p>
    ${renderSignature()}`;
  return baseLayout('PHIẾU BÁN HÀNG', data, body);
}

function orderTotalTemplate(data) {
  const body = `
    <div class="info-grid">
      <div><b>Ngày:</b> ${escapeHtml(data.document.date)}</div>
      <div><b>Nhân viên:</b> ${escapeHtml(data.staff.name)}</div>
      <div><b>Giao hàng:</b> ${escapeHtml(data.delivery.name)}</div>
      <div><b>Tuyến:</b> ${escapeHtml(data.delivery.route)}</div>
    </div>
    ${renderItemsTable(data)}
    <div class="total-box">
      <div><span>Tổng số lượng:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Tổng giá trị:</span><b>${money(data, data.totals.totalAmount)}</b></div>
    </div>
    ${renderSignature(['Người lập phiếu', 'Người giao hàng', 'Thủ kho'])}`;
  return baseLayout('PHIẾU GỘP ĐƠN TỔNG', data, body);
}

function importOrderTemplate(data) {
  const body = `
    <div class="info-grid">
      <div><b>Ngày nhập:</b> ${escapeHtml(data.document.date)}</div>
      <div><b>Nhà cung cấp:</b> ${escapeHtml(data.customer.name)}</div>
      <div class="full"><b>Ghi chú:</b> ${escapeHtml(data.document.note)}</div>
    </div>
    ${renderItemsTable(data)}
    <div class="total-box">
      <div><span>Tổng số lượng nhập:</span><b>${money(data, data.totals.totalQty)}</b></div>
      <div><span>Tổng giá trị:</span><b>${money(data, data.totals.totalAmount)}</b></div>
    </div>
    ${renderSignature(['Người lập phiếu', 'Người giao hàng', 'Thủ kho'])}`;
  return baseLayout('PHIẾU NHẬP KHO', data, body);
}

function paymentReceiptTemplate(data) {
  const body = `
    <div class="info-grid">
      <div><b>Ngày thu:</b> ${escapeHtml(data.document.date)}</div>
      <div><b>Người thu:</b> ${escapeHtml(data.staff.name)}</div>
      <div><b>Mã KH:</b> ${escapeHtml(data.customer.code)}</div>
      <div><b>Khách hàng:</b> ${escapeHtml(data.customer.name)}</div>
      <div class="full"><b>Địa chỉ:</b> ${escapeHtml(data.customer.address)}</div>
    </div>
    <div class="receipt-money"><span>Số tiền thu:</span><b>${money(data, data.totals.paid || data.totals.totalAmount)} đ</b></div>
    <p class="note"><b>Nội dung:</b> ${escapeHtml(data.document.note || 'Thu tiền bán hàng')}</p>
    ${renderSignature(['Người lập phiếu', 'Người nộp tiền', 'Thủ quỹ'])}`;
  return baseLayout('PHIẾU THU TIỀN', data, body);
}

module.exports = {
  ORDER_SINGLE: orderSingleTemplate,
  ORDER_TOTAL: orderTotalTemplate,
  IMPORT_ORDER: importOrderTemplate,
  PAYMENT_RECEIPT: paymentReceiptTemplate
};
