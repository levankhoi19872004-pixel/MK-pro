function ensureShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.cashLedger) data.cashLedger = [];
  if (!data.products) data.products = [];
  if (!data.meta) data.meta = {};
  return data;
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanCode(value) {
  return cleanText(value).toUpperCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('vi-VN');
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString('vi-VN');
}

const PRINT_TEMPLATES = [
  {
    code: 'WAREHOUSE_RECEIPT_A4',
    name: 'Phiếu nhập kho A4',
    documentType: 'WAREHOUSE_RECEIPT',
    route: '/api/print/warehouse-receipts/:id'
  },
  {
    code: 'SALES_ORDER_A4',
    name: 'Đơn bán hàng / Phiếu xuất kho A4',
    documentType: 'SALES_ORDER',
    route: '/api/print/sales-orders/:id'
  },
  {
    code: 'SALES_INVOICE_A4',
    name: 'Phiếu giao nhận và thanh toán A4',
    documentType: 'SALES_INVOICE',
    route: '/api/print/sales-invoices/:id'
  },
  {
    code: 'CASH_VOUCHER_A5',
    name: 'Phiếu thu / Phiếu chi A5',
    documentType: 'CASH',
    route: '/api/print/cash/:id'
  }
];

function getCompany(data) {
  const company = data.company || data.meta.company || {};
  return {
    name: company.name || 'KHO MINH KHAI PRO',
    address: company.address || 'Địa chỉ: ................................................',
    phone: company.phone || 'Điện thoại: .............................................',
    taxCode: company.taxCode || ''
  };
}

function baseHtml({ title, body, paper = 'a4' }) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, sans-serif; }
    .page { width: ${paper === 'a5' ? '148mm' : '210mm'}; min-height: ${paper === 'a5' ? '210mm' : '297mm'}; margin: 16px auto; padding: 14mm; background: #fff; box-shadow: 0 12px 32px rgba(15,23,42,.16); }
    .company { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 10px; }
    .company-name { font-weight: 800; font-size: 15px; text-transform: uppercase; }
    .company-info { margin-top: 4px; font-size: 12px; line-height: 1.45; color: #374151; }
    .doc-no { text-align: right; font-size: 12px; line-height: 1.5; }
    h1 { text-align: center; font-size: 22px; margin: 18px 0 4px; text-transform: uppercase; letter-spacing: .02em; }
    .sub-title { text-align: center; font-size: 12px; margin-bottom: 16px; color: #4b5563; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; font-size: 13px; margin: 12px 0 14px; }
    .info-line { border-bottom: 1px dotted #9ca3af; min-height: 22px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 7px 6px; vertical-align: top; }
    th { text-align: center; background: #f3f4f6; font-weight: 700; }
    .right { text-align: right; }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .total-row td { font-weight: 800; background: #f9fafb; }
    .note { margin-top: 12px; font-size: 12px; line-height: 1.5; }
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 28px; text-align: center; font-size: 12px; }
    .sign-title { font-weight: 700; }
    .sign-note { color: #6b7280; font-style: italic; margin-top: 3px; }
    .sign-space { height: 58px; }
    .print-actions { position: sticky; top: 0; max-width: ${paper === 'a5' ? '148mm' : '210mm'}; margin: 0 auto; padding: 10px 0; text-align: right; }
    .print-btn { border: 0; border-radius: 10px; background: #2563eb; color: #fff; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      .print-actions { display: none; }
      @page { size: ${paper.toUpperCase()}; margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button class="print-btn" onclick="window.print()">In chứng từ</button></div>
  <div class="page">${body}</div>
</body>
</html>`;
}

function companyHeader(company, documentNo, status, dateLabel, dateValue) {
  return `<div class="company">
    <div>
      <div class="company-name">${escapeHtml(company.name)}</div>
      <div class="company-info">${escapeHtml(company.address)}<br>${escapeHtml(company.phone)}${company.taxCode ? '<br>MST: ' + escapeHtml(company.taxCode) : ''}</div>
    </div>
    <div class="doc-no">
      <b>Số:</b> ${escapeHtml(documentNo || '')}<br>
      <b>Trạng thái:</b> ${escapeHtml(status || '')}<br>
      <b>${escapeHtml(dateLabel)}:</b> ${formatDate(dateValue)}
    </div>
  </div>`;
}

function itemRows(items = [], includeDiscount = false) {
  return items.map((item, index) => `<tr>
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(item.productCode)}</td>
    <td>${escapeHtml(item.productName)}</td>
    <td class="center">${escapeHtml(item.unit)}</td>
    <td>${escapeHtml(item.warehouseName || item.warehouseCode)}</td>
    <td class="right">${formatNumber(item.quantity)}</td>
    <td class="right">${formatMoney(item.price)}</td>
    ${includeDiscount ? `<td class="right">${formatMoney(item.discountAmount)}</td>` : ''}
    <td class="right">${formatMoney(item.amount - toNumber(item.discountAmount))}</td>
  </tr>`).join('');
}

function renderWarehouseReceipt(data, receipt) {
  const company = getCompany(data);
  const rows = itemRows(receipt.items || [], false);
  const body = `${companyHeader(company, receipt.documentNo, receipt.status, 'Ngày nhập', receipt.receiptDate)}
    <h1>Phiếu nhập kho</h1>
    <div class="sub-title">Mẫu in chuẩn V43 - dữ liệu lấy từ chứng từ đã lưu</div>
    <div class="info-grid">
      <div>Nhà cung cấp: <span class="bold">${escapeHtml(receipt.supplierName)}</span></div>
      <div>Mã NCC: <span class="bold">${escapeHtml(receipt.supplierCode)}</span></div>
      <div>Kho nhập: <span class="bold">${escapeHtml(receipt.warehouseName || receipt.warehouseCode)}</span></div>
      <div>Người nhận: <span class="bold">${escapeHtml(receipt.receiverName || receipt.receiverCode)}</span></div>
    </div>
    <table>
      <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Kho</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="center">Chưa có dòng hàng</td></tr>'}</tbody>
      <tfoot><tr class="total-row"><td colspan="5" class="right">Tổng cộng</td><td class="right">${formatNumber(receipt.totalQuantity)}</td><td></td><td class="right">${formatMoney(receipt.totalAmount)}</td></tr></tfoot>
    </table>
    <div class="note"><b>Ghi chú:</b> ${escapeHtml(receipt.note)}</div>
    ${signatureBlock(['Người lập phiếu', 'Người giao hàng', 'Thủ kho', 'Kế toán'])}`;
  return baseHtml({ title: `Phiếu nhập ${receipt.documentNo}`, body, paper: 'a4' });
}

function renderSalesOrder(data, order) {
  const company = getCompany(data);
  const rows = itemRows(order.items || [], true);
  const body = `${companyHeader(company, order.documentNo, order.status, 'Ngày bán', order.orderDate)}
    <h1>Đơn bán hàng / Phiếu xuất kho</h1>
    <div class="sub-title">Mẫu in chuẩn V43 - bán hàng xuất kho theo chứng từ</div>
    <div class="info-grid">
      <div>Khách hàng: <span class="bold">${escapeHtml(order.customerName)}</span></div>
      <div>Mã KH: <span class="bold">${escapeHtml(order.customerCode)}</span></div>
      <div>Địa chỉ: <span class="bold">${escapeHtml(order.customerAddress)}</span></div>
      <div>SĐT: <span class="bold">${escapeHtml(order.customerPhone)}</span></div>
      <div>Nhân viên: <span class="bold">${escapeHtml(order.staffName || order.staffCode)}</span></div>
      <div>Kho xuất: <span class="bold">${escapeHtml(order.warehouseName || order.warehouseCode)}</span></div>
    </div>
    <table>
      <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Kho</th><th>SL</th><th>Đơn giá</th><th>CK</th><th>Thành tiền</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="center">Chưa có dòng hàng</td></tr>'}</tbody>
      <tfoot>
        <tr class="total-row"><td colspan="5" class="right">Tổng cộng</td><td class="right">${formatNumber(order.totalQuantity)}</td><td></td><td class="right">${formatMoney(order.discountAmount)}</td><td class="right">${formatMoney(order.totalAmount)}</td></tr>
        <tr><td colspan="8" class="right bold">Đã thu</td><td class="right">${formatMoney(order.paidAmount)}</td></tr>
        <tr><td colspan="8" class="right bold">Còn nợ</td><td class="right">${formatMoney(order.debtAmount)}</td></tr>
      </tfoot>
    </table>
    <div class="note"><b>Ghi chú:</b> ${escapeHtml(order.note)}</div>
    ${signatureBlock(['Người lập', 'Khách hàng', 'Thủ kho', 'Kế toán'])}`;
  return baseHtml({ title: `Đơn bán ${order.documentNo}`, body, paper: 'a4' });
}


function pickValue(source, keys, fallback = '') {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return fallback;
}

function normalizeSalesInvoice(doc) {
  const customer = doc.customer || {};
  const salesman = doc.salesman || doc.staff || {};
  const distributor = doc.distributor || doc.company || {};
  const totals = doc.totals || {};
  const rawItems = doc.items || doc.lines || [];
  const rawPromotions = doc.promotionDetails || doc.promotions || doc.promotionLines || [];

  const items = rawItems.map(item => {
    const qtyUnit = toNumber(pickValue(item, ['qtyUnit', 'quantity', 'qty', 'unitQty'], 0));
    const qtyCase = pickValue(item, ['qtyCase', 'caseQty', 'csSu', 'cs'], '');
    const priceBeforeTax = toNumber(pickValue(item, ['priceBeforeTax', 'priceExVat', 'price'], 0));
    const priceAfterTax = toNumber(pickValue(item, ['priceAfterTax', 'priceIncVat', 'price'], priceBeforeTax));
    const priceFinal = toNumber(pickValue(item, ['priceFinal', 'finalPrice', 'priceAfterDiscount', 'price'], priceAfterTax));
    const amount = toNumber(pickValue(item, ['amount', 'lineAmount', 'totalAmount'], qtyUnit * priceFinal));

    return {
      productCode: pickValue(item, ['productCode', 'code', 'sku'], ''),
      productName: pickValue(item, ['productName', 'name', 'itemName'], ''),
      qtyCase,
      qtyUnit,
      priceBeforeTax,
      priceAfterTax,
      priceFinal,
      vat: toNumber(pickValue(item, ['vat', 'vatAmount', 'taxAmount'], 0)),
      amount
    };
  });

  const totalQty = toNumber(pickValue(totals, ['totalQty', 'totalQuantity'], pickValue(doc, ['totalQty', 'totalQuantity'], items.reduce((sum, item) => sum + item.qtyUnit, 0))));
  const finalAmount = toNumber(pickValue(totals, ['finalAmount', 'totalAmount', 'payableAmount'], pickValue(doc, ['finalAmount', 'totalAmount', 'debtAmount'], items.reduce((sum, item) => sum + item.amount, 0))));

  return {
    invoiceNo: pickValue(doc, ['invoiceNo', 'documentNo', 'code', 'id'], ''),
    orderNo: pickValue(doc, ['orderNo', 'sourceOrderNo', 'salesOrderNo'], ''),
    orderTime: pickValue(doc, ['orderTime', 'orderDate', 'createdAt', 'date'], ''),
    copyName: pickValue(doc, ['copyName', 'copy'], 'Liên 1'),
    paymentTerm: pickValue(doc, ['paymentTerm'], 'đáo hạn trong 7 ngày'),
    invoiceType: pickValue(doc, ['invoiceType'], 'Từ NVTT'),
    truckNo: pickValue(doc, ['truckNo', 'truckCode'], ''),
    taxCode: pickValue(doc, ['taxCode', 'mst'], ''),

    distributorCode: pickValue(distributor, ['code', 'distributorCode'], pickValue(doc, ['distributorCode'], '3293')),
    distributorName: pickValue(distributor, ['name', 'distributorName'], pickValue(doc, ['distributorName'], 'Công Ty TNHH MTV Minh Khai')),
    distributorAddress: pickValue(distributor, ['address', 'distributorAddress'], pickValue(doc, ['distributorAddress'], 'Cầu Cánh Sẻ, Quang Bình, Tỉnh Thái Bình')),
    distributorPhone: pickValue(distributor, ['phone', 'distributorPhone'], pickValue(doc, ['distributorPhone'], '0396198753')),

    salesmanCode: pickValue(salesman, ['code', 'staffCode', 'salesmanCode'], pickValue(doc, ['salesmanCode', 'staffCode'], '')),
    salesmanName: pickValue(salesman, ['name', 'staffName', 'salesmanName'], pickValue(doc, ['salesmanName', 'staffName'], '')),
    salesmanPhone: pickValue(salesman, ['phone', 'staffPhone', 'salesmanPhone'], pickValue(doc, ['salesmanPhone', 'staffPhone'], '')),

    customerCode: pickValue(customer, ['code', 'customerCode'], pickValue(doc, ['customerCode'], '')),
    customerName: pickValue(customer, ['name', 'customerName'], pickValue(doc, ['customerName'], '')),
    customerPhone: pickValue(customer, ['phone', 'customerPhone'], pickValue(doc, ['customerPhone'], '')),
    customerAddress: pickValue(customer, ['address', 'customerAddress'], pickValue(doc, ['customerAddress'], '')),

    items,
    totalQty,
    finalAmount,
    amountInWords: pickValue(doc, ['amountInWords'], ''),
    totalBeforeDiscount: toNumber(pickValue(totals, ['totalBeforeDiscount', 'grossAmount'], pickValue(doc, ['totalBeforeDiscount', 'grossAmount'], finalAmount))),
    promotionValue: toNumber(pickValue(totals, ['promotionValue', 'promotionAmount'], pickValue(doc, ['promotionValue', 'promotionAmount'], 0))),
    offsetAmount: toNumber(pickValue(totals, ['offsetAmount'], pickValue(doc, ['offsetAmount'], 0))),
    distributorDiscount: toNumber(pickValue(totals, ['distributorDiscount', 'discountAmount'], pickValue(doc, ['distributorDiscount', 'discountAmount'], 0))),
    discountRate: pickValue(totals, ['discountRate'], pickValue(doc, ['discountRate'], '')),
    promotionDetails: rawPromotions.map(promo => ({
      programCode: pickValue(promo, ['programCode', 'code'], ''),
      description: pickValue(promo, ['description', 'name', 'content'], ''),
      purchaseValue: toNumber(pickValue(promo, ['purchaseValue', 'buyAmount', 'baseAmount'], 0)),
      discountPercent: pickValue(promo, ['discountPercent', 'percent'], ''),
      discountBeforeTax: toNumber(pickValue(promo, ['discountBeforeTax', 'amountBeforeTax'], 0)),
      discountAmount: toNumber(pickValue(promo, ['discountAmount', 'amountAfterTax', 'amount'], 0))
    }))
  };
}

function renderSalesInvoice(data, doc) {
  const invoice = normalizeSalesInvoice(doc);

  const itemRowsHtml = invoice.items.map((item, index) => `<tr>
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(item.productCode)}</td>
    <td>${escapeHtml(item.productName)}</td>
    <td class="center">${escapeHtml(item.qtyCase)}</td>
    <td class="right">${formatNumber(item.qtyUnit)}</td>
    <td class="right">${formatMoney(item.priceBeforeTax)}</td>
    <td class="right">${formatMoney(item.priceAfterTax)}</td>
    <td class="right">${formatMoney(item.priceFinal)}</td>
    <td class="right">${formatMoney(item.vat)}</td>
    <td class="right bold">${formatMoney(item.amount)}</td>
  </tr>`).join('');

  const promoRowsHtml = invoice.promotionDetails.map(promo => `<tr>
    <td>${escapeHtml(promo.programCode)}</td>
    <td>${escapeHtml(promo.description)}</td>
    <td class="right">${formatMoney(promo.purchaseValue)}</td>
    <td class="center">${escapeHtml(promo.discountPercent)}</td>
    <td class="right">${formatMoney(promo.discountBeforeTax)}</td>
    <td class="right">${formatMoney(promo.discountAmount)}</td>
  </tr>`).join('');

  const body = `<div class="company">
      <div>
        <div class="company-name">${escapeHtml(invoice.distributorCode)} - ${escapeHtml(invoice.distributorName)}</div>
        <div class="company-info">Địa chỉ: ${escapeHtml(invoice.distributorAddress)}<br>Điện thoại: ${escapeHtml(invoice.distributorPhone)}</div>
      </div>
      <div class="doc-no">
        <b>${escapeHtml(invoice.copyName)}</b><br>
        <b>Số hóa đơn:</b> ${escapeHtml(invoice.invoiceNo)}<br>
        <b>Số đơn hàng:</b> ${escapeHtml(invoice.orderNo)}<br>
        <b>Thời gian đặt hàng:</b> ${formatDateTime(invoice.orderTime)}
      </div>
    </div>

    <h1>Phiếu giao nhận và thanh toán</h1>
    <div class="sub-title">Mẫu in hóa đơn bán hàng theo mẫu Unilever / NPP</div>

    <div class="info-grid">
      <div class="info-line">NVBH: <span class="bold">${escapeHtml(invoice.salesmanCode)} - ${escapeHtml(invoice.salesmanName)} - ${escapeHtml(invoice.salesmanPhone)}</span></div>
      <div class="info-line">Loại hóa đơn: <span class="bold">${escapeHtml(invoice.invoiceType)}</span></div>
      <div class="info-line">Khách hàng - Điện thoại: <span class="bold">${escapeHtml(invoice.customerCode)} - ${escapeHtml(invoice.customerName)} - ${escapeHtml(invoice.customerPhone)}</span></div>
      <div class="info-line">Điều khoản thanh toán: <span class="bold">${escapeHtml(invoice.paymentTerm)}</span></div>
      <div class="info-line">Địa chỉ giao hàng: <span class="bold">${escapeHtml(invoice.customerAddress)}</span></div>
      <div class="info-line">Số xe tải: <span class="bold">${escapeHtml(invoice.truckNo)}</span></div>
      <div class="info-line">MST: <span class="bold">${escapeHtml(invoice.taxCode)}</span></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>STT</th>
          <th>Mã hàng</th>
          <th>Tên sản phẩm</th>
          <th>SL<br>(CS/SU)</th>
          <th>SL<br>(lẻ)</th>
          <th>Đơn giá<br>trước thuế/KM</th>
          <th>Đơn giá<br>sau thuế, trước KM</th>
          <th>Đơn giá<br>sau thuế/KM&amp;CK</th>
          <th>Thuế<br>GTGT</th>
          <th>Thành tiền<br>sau thuế/KM&amp;CK</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml || '<tr><td colspan="10" class="center">Chưa có dòng hàng</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4" class="right">Tổng cộng (A)</td>
          <td class="right">${formatNumber(invoice.totalQty)}</td>
          <td colspan="4"></td>
          <td class="right">${formatMoney(invoice.finalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="info-grid" style="margin-top:14px; align-items:start;">
      <div><b>Số tiền viết bằng chữ:</b><br>${escapeHtml(invoice.amountInWords)}</div>
      <div>
        <div><b>Số tiền phải thanh toán:</b> <span class="bold">${formatMoney(invoice.finalAmount)}</span></div>
        <div>Tổng tiền sau thuế chưa trừ KM: ${formatMoney(invoice.totalBeforeDiscount)}</div>
        <div>Tổng trị giá khuyến mãi bằng hàng và tiền: ${formatMoney(invoice.promotionValue)}</div>
        <div>Cấn trừ tiền: ${formatMoney(invoice.offsetAmount)}</div>
        <div>Tổng tiền CK của NPP: ${formatMoney(invoice.distributorDiscount)}</div>
        <div>Tỉ lệ KM &amp; CK: ${escapeHtml(invoice.discountRate)}</div>
      </div>
    </div>

    ${signatureBlock(['Người lập biểu', 'Người bán hàng', 'Nhân viên giao hàng', 'Người nhận hàng'])}

    <h2 style="font-size:14px; margin:24px 0 6px; text-transform:uppercase;">Chi tiết khuyến mãi: (B+C)</h2>
    <table>
      <thead>
        <tr>
          <th>Mã CTKM Tiền</th>
          <th>Khuyến mãi bằng tiền</th>
          <th>Giá trị hàng hóa mua</th>
          <th>% chiết khấu</th>
          <th>Tiền CK trước thuế</th>
          <th>Tiền CK sau thuế</th>
        </tr>
      </thead>
      <tbody>
        ${promoRowsHtml || '<tr><td colspan="6" class="center">Không có chi tiết khuyến mãi</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total-row"><td colspan="5" class="right">Tổng giá trị khuyến mãi tiền (C)</td><td class="right">${formatMoney(invoice.promotionValue)}</td></tr>
      </tfoot>
    </table>`;

  return baseHtml({ title: `Phiếu giao nhận ${invoice.invoiceNo}`, body, paper: 'a4' });
}

function renderCashVoucher(data, cash) {
  const company = getCompany(data);
  const title = cash.type === 'OUT' ? 'Phiếu chi' : 'Phiếu thu';
  const body = `${companyHeader(company, cash.id, 'ĐÃ GHI SỔ', 'Ngày lập', cash.createdAt)}
    <h1>${escapeHtml(title)}</h1>
    <div class="sub-title">Mẫu in chuẩn V43 - quỹ tiền mặt</div>
    <div class="info-grid">
      <div>Nội dung: <span class="bold">${escapeHtml(cash.content)}</span></div>
      <div>Số tiền: <span class="bold">${formatMoney(cash.amount)} đ</span></div>
      <div>Loại tham chiếu: <span class="bold">${escapeHtml(cash.refType)}</span></div>
      <div>Mã tham chiếu: <span class="bold">${escapeHtml(cash.refCode)}</span></div>
      <div>Thời gian ghi nhận: <span class="bold">${formatDateTime(cash.createdAt)}</span></div>
      <div>Loại phiếu: <span class="bold">${escapeHtml(cash.type)}</span></div>
    </div>
    <table>
      <thead><tr><th>Nội dung</th><th>Số tiền</th></tr></thead>
      <tbody><tr><td>${escapeHtml(cash.content)}</td><td class="right bold">${formatMoney(cash.amount)} đ</td></tr></tbody>
    </table>
    ${signatureBlock(['Người lập phiếu', 'Người nộp/nhận', 'Thủ quỹ', 'Kế toán'])}`;
  return baseHtml({ title: `${title} ${cash.id}`, body, paper: 'a5' });
}

function signatureBlock(labels) {
  return `<div class="signatures">${labels.map(label => `<div><div class="sign-title">${escapeHtml(label)}</div><div class="sign-note">(Ký, ghi rõ họ tên)</div><div class="sign-space"></div></div>`).join('')}</div>`;
}

function findDocument(data, type, idOrNo) {
  ensureShape(data);
  const key = cleanCode(idOrNo);
  return data.documents.find(doc => doc.type === type && (cleanCode(doc.id) === key || cleanCode(doc.documentNo) === key)) || null;
}

function findCash(data, id) {
  ensureShape(data);
  const key = cleanText(id);
  return data.cashLedger.find(tx => cleanText(tx.id) === key || cleanText(tx.refCode) === key) || null;
}

function listPrintTemplates() {
  return PRINT_TEMPLATES;
}

module.exports = {
  listPrintTemplates,
  renderWarehouseReceipt,
  renderSalesOrder,
  renderSalesInvoice,
  renderCashVoucher,
  findDocument,
  findCash
};
