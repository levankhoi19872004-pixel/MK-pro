// 03-render-dashboard-product-stock.js
// Điều phối render, dashboard, sản phẩm, nhóm hàng, tồn kho, XNT.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

  function render(){
    if (!$('app') || $('app').classList.contains('hidden')) return;
    ({
      dashboard: renderDashboard, products: renderProducts, stock: renderStock,
      receive: renderReceive, singleOrder: renderSingleOrder, masterOrders: renderMasterOrders,
      orders: renderOrders, dmsOrders: renderDmsOrders, customers: renderCustomers,
      promotions: renderPromotions, reports: renderReports, salesApp: renderSalesApp,
      deliveryApp: renderDeliveryApp, debts: renderDebts, cashFund: renderCashFund,
      accounts: renderAccounts
    }[currentPage] || renderDashboard)();
    bindImportButtons();
    bindGhostSuggestions();
    bindLinkedLookups();
  }

  function renderDashboard(){
    const day = $('dashboardDate')?.value || today();
    const dayOrders = db.orders.filter(o => sameDay(o.date, day));
    const deliveredToday = db.orders.filter(o => o.delivered || o.deliveryStatus === 'delivered').filter(o => sameDay(o.deliveredAt || o.deliveryDate || o.date, day));
    const pendingDeliveryToday = db.orders.filter(o => !(o.delivered || o.deliveryStatus === 'delivered')).filter(o => sameDay(o.deliveryDate || o.date, day));
    const dayPayments = (db.payments || []).filter(p => sameDay(p.date, day));

    const salesTotal = dayOrders.reduce((a,o)=>a+num(o.total),0);
    const salesPaid = dayOrders.reduce((a,o)=>a+orderPaid(o),0);
    const salesDebt = dayOrders.reduce((a,o)=>a+num(o.debt),0);
    const deliveredAmount = deliveredToday.reduce((a,o)=>a+num(o.total),0);
    const collectedAmount = dayPayments.reduce((a,p)=>a+num(p.cash)+num(p.bank)+num(p.returnAmount),0);
    const stockValue = db.stocks.reduce((a, s) => a + num(s.qty) * num(s.avgCost || s.lastCost || product(s.sku)?.costRef), 0);

    $('dashboard').innerHTML = `<div class="dashboard-head card">
      <div><h3>Tổng quan trong ngày</h3><p class="muted">Theo dõi nhanh doanh số NVBH và giao hàng NVGH trong ngày được chọn.</p></div>
      <label class="dash-date"><span>Ngày xem</span><input id="dashboardDate" type="date" value="${esc(day)}"></label>
    </div>

    <div class="grid overview-grid">
      <div class="stat stat-blue"><small>Đơn bán hôm nay</small><b>${dayOrders.length}</b><span>${money(salesTotal)}</span></div>
      <div class="stat stat-green"><small>Đã thu hôm nay</small><b>${money(salesPaid)}</b><span>Thu theo đơn bán trong ngày</span></div>
      <div class="stat stat-orange"><small>Công nợ phát sinh</small><b>${money(salesDebt)}</b><span>Nợ còn lại của đơn trong ngày</span></div>
      <div class="stat stat-purple"><small>Đơn đã giao</small><b>${deliveredToday.length}</b><span>${money(deliveredAmount)}</span></div>
      <div class="stat stat-red"><small>Đơn chờ giao</small><b>${pendingDeliveryToday.length}</b><span>Cần xử lý trong ngày</span></div>
      <div class="stat"><small>Giá trị tồn</small><b>${money(stockValue)}</b><span>${db.products.length} SKU</span></div>
    </div>

    <div class="dashboard-panels">
      <div class="card dashboard-panel">
        <div class="panel-title"><h3>Doanh số nhân viên bán hàng</h3><span>${esc(day)}</span></div>
        ${salesOverviewTable(dayOrders)}
      </div>
      <div class="card dashboard-panel">
        <div class="panel-title"><h3>Báo cáo giao hàng nhân viên giao hàng</h3><span>${esc(day)}</span></div>
        ${deliveryOverviewTable(day, deliveredToday, pendingDeliveryToday, dayPayments)}
      </div>
    </div>

    <div class="card"><h3>Luồng dữ liệu chuẩn</h3>
      <p class="muted">Tổng quan chỉ đọc dữ liệu phát sinh trong ngày. Đơn bán lấy theo ngày tạo đơn; giao hàng ưu tiên theo thời điểm xác nhận giao, nếu chưa có thì lấy ngày đơn/ngày giao.</p>
    </div>`;
    $('dashboardDate').onchange = renderDashboard;
  }

  function salesOverviewTable(rows){
    const map = {};
    rows.forEach(o => {
      const code = o.staffCode || o.salesStaffCode || 'Chưa gán';
      const name = o.staffName || o.salesStaffName || '';
      map[code] = map[code] || { code, name, orders:0, customers:new Set(), qty:0, total:0, paid:0, debt:0 };
      map[code].orders += 1;
      if (o.customerCode || o.customerName) map[code].customers.add(o.customerCode || o.customerName);
      map[code].qty += (o.items || []).reduce((a,i)=>a+num(i.qty || i.quantity),0);
      map[code].total += num(o.total);
      map[code].paid += orderPaid(o);
      map[code].debt += num(o.debt);
    });
    const rs = Object.values(map).sort((a,b)=>b.total-a.total);
    return `<div class="table-wrap"><table><thead><tr><th>NV bán hàng</th><th>Số đơn</th><th>Khách</th><th>SL</th><th>Doanh số</th><th>Đã thu</th><th>Công nợ</th></tr></thead><tbody>
      ${rs.map(r=>`<tr><td><b>${esc(r.code)}</b><br><span class="muted">${esc(r.name)}</span></td><td class="right">${r.orders}</td><td class="right">${r.customers.size}</td><td class="right">${r.qty}</td><td class="right"><b>${money(r.total)}</b></td><td class="right">${money(r.paid)}</td><td class="right">${money(r.debt)}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có doanh số bán hàng trong ngày</td></tr>'}
    </tbody></table></div>`;
  }

  function deliveryOverviewTable(day, deliveredRows, pendingRows, payments){
    const map = {};
    function ensure(o){
      const code = o.deliveryStaffCode || 'Chưa gán';
      const name = o.deliveryStaffName || '';
      map[code] = map[code] || { code, name, delivered:0, pending:0, total:0, cash:0, bank:0, ret:0, debt:0 };
      return map[code];
    }
    deliveredRows.forEach(o => {
      const r = ensure(o);
      r.delivered += 1;
      r.total += num(o.total);
      r.debt += num(o.debt);
    });
    pendingRows.forEach(o => {
      const r = ensure(o);
      r.pending += 1;
    });
    payments.forEach(p => {
      const o = db.orders.find(x => x.id === p.orderId) || {};
      const r = ensure(o);
      r.cash += num(p.cash);
      r.bank += num(p.bank);
      r.ret += num(p.returnAmount);
    });
    const rs = Object.values(map).sort((a,b)=>(b.delivered+b.pending)-(a.delivered+a.pending) || b.total-a.total);
    return `<div class="table-wrap"><table><thead><tr><th>NV giao hàng</th><th>Đã giao</th><th>Chờ giao</th><th>Giá trị đã giao</th><th>Tiền mặt</th><th>Chuyển khoản</th><th>Hàng trả</th><th>Còn nợ</th></tr></thead><tbody>
      ${rs.map(r=>`<tr><td><b>${esc(r.code)}</b><br><span class="muted">${esc(r.name)}</span></td><td class="right"><b>${r.delivered}</b></td><td class="right">${r.pending ? `<span class="pill orange">${r.pending}</span>` : '0'}</td><td class="right"><b>${money(r.total)}</b></td><td class="right">${money(r.cash)}</td><td class="right">${money(r.bank)}</td><td class="right">${money(r.ret)}</td><td class="right">${money(r.debt)}</td></tr>`).join('') || '<tr><td colspan="8" class="center muted">Chưa có dữ liệu giao hàng trong ngày</td></tr>'}
    </tbody></table></div>`;
  }

  function productFormData(){
    return {
      sku: $('pSku').value.trim(),
      name: $('pName').value.trim(),
      unit: $('pUnit').value.trim() || 'cái',
      pack: num($('pPack').value) || 1,
      saleRef: Math.round(num($('pSale').value)),
      costRef: Math.round(num($('pCost').value)),
      warehouse: $('pWarehouse').value.trim() || 'Kho chính',
      brand: $('pBrand').value.trim(),
      category: $('pCategory').value.trim(),
      groupCode: $('pGroupCode')?.value.trim() || '',
      groupName: $('pGroupName')?.value.trim() || '',
      status: $('pStatus')?.value || 'active',
      note: $('pNote')?.value.trim() || ''
    };
  }
  function fillProductForm(p){
    const map = {
      pSku:p?.sku || '', pName:p?.name || '', pUnit:p?.unit || 'cái', pPack:p?.pack || 1,
      pSale:p?.saleRef || '', pCost:p?.costRef || '', pWarehouse:p?.warehouse || 'Kho chính',
      pBrand:p?.brand || '', pCategory:p?.category || '', pGroupCode:p?.groupCode || '',
      pGroupName:p?.groupName || '', pStatus:p?.status || 'active', pNote:p?.note || ''
    };
    Object.keys(map).forEach(id => { const el = $(id); if (el) el.value = map[id]; });
  }
  function lookupProductFromSku(){
    const sku = $('pSku')?.value.trim();
    if (!sku) return;
    const p = product(sku);
    if (p) {
      fillProductForm(p);
      toast('Đã tải thông tin sản phẩm đã lưu');
    } else {
      const keepSku = sku;
      fillProductForm(null);
      $('pSku').value = keepSku;
      toast('Mã sản phẩm mới, hãy nhập thông tin rồi lưu');
    }
  }
  function renderProducts(){
    $('products').innerHTML = `<div class="card"><h3>Danh mục sản phẩm</h3>
      <p class="muted">Đã bỏ danh sách trực quan và tìm kiếm. Mục này chỉ dùng để khai báo, cập nhật và xuất báo cáo thông tin sản phẩm.</p>

      <div class="card soft-card"><h3>1. Thông tin sản phẩm</h3>
        <p class="muted">Nhập mã sản phẩm rồi nhấn Enter. Nếu mã đã tồn tại, toàn bộ thông tin cũ sẽ tự hiện để chỉnh sửa.</p>
        <div class="form">
          <input id="pSku" placeholder="Mã sản phẩm / SKU">
          <input id="pName" placeholder="Tên sản phẩm">
          <input id="pUnit" placeholder="Đơn vị tính" value="cái">
          <input id="pPack" type="number" placeholder="Quy cách" value="1">
          <input id="pSale" type="number" placeholder="Giá bán tham chiếu">
          <input id="pCost" type="number" placeholder="Giá nhập tham chiếu">
          <input id="pWarehouse" placeholder="Kho quản lý" value="Kho chính">
          <input id="pBrand" placeholder="Nhãn hàng">
          <input id="pCategory" placeholder="Ngành hàng">
          <input id="pGroupCode" placeholder="Mã nhóm sản phẩm">
          <input id="pGroupName" placeholder="Tên nhóm sản phẩm">
          <select id="pStatus"><option value="active">Đang dùng</option><option value="inactive">Ngừng dùng</option></select>
          <input id="pNote" placeholder="Ghi chú">
        </div>
        <div class="toolbar action-row"><button class="btn green" id="saveProductBtn">Lưu sản phẩm</button><button class="btn" id="clearProductFormBtn">Làm mới form</button></div>
      </div>

      <div class="card soft-card"><h3>2. Báo cáo thông tin sản phẩm</h3>
        <p class="muted">Xuất toàn bộ sản phẩm đang có trong phần mềm ra Excel để kiểm tra hoặc lưu trữ.</p>
        <div class="toolbar action-row"><button class="btn green" id="exportProductsExcelBtn">Xuất báo cáo ra Excel</button></div>
      </div>

      <div class="card soft-card"><h3>3. Nhóm sản phẩm</h3>
        <p class="muted">Import nhóm sản phẩm, tải mẫu import, sau đó có thể sửa hoặc xoá từng nhóm.</p>
        <div class="toolbar action-row"><button class="btn green" data-import="productGroups">Import nhóm sản phẩm</button><button class="btn" data-template="productGroups">Tải mẫu import</button></div>
        <div class="table-wrap"><table><thead><tr><th>Mã nhóm</th><th>Tên nhóm</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
          ${db.productGroups.map(g => `<tr><td><b>${esc(g.code || '')}</b></td><td>${esc(g.name || '')}</td><td>${esc(g.note || '')}</td><td><button class="btn small" onclick="App.editProductGroup('${esc(g.code || g.name)}')">Sửa</button><button class="btn small red" onclick="App.deleteProductGroup('${esc(g.code || g.name)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="4" class="center muted">Chưa có nhóm sản phẩm</td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;
    $('pSku').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookupProductFromSku(); } });
    $('pSku').addEventListener('change', lookupProductFromSku);
    $('saveProductBtn').onclick = saveProductFromForm;
    $('clearProductFormBtn').onclick = () => fillProductForm(null);
    $('exportProductsExcelBtn').onclick = exportProductsReport;
  }
  function saveProductFromForm(){
    const data = productFormData();
    if (!data.sku) return toast('Thiếu mã sản phẩm');
    if (!data.name) return toast('Thiếu tên sản phẩm');
    const old = product(data.sku);
    old ? Object.assign(old, data) : db.products.push(data);
    save('Đã lưu sản phẩm');
  }
  function editProduct(sku){
    if (!requireCan('product:edit','Không có quyền sửa sản phẩm')) return;
    const p = product(sku);
    if (!p) return;
    fillProductForm(p);
    setPage('products');
  }
  function exportProductsReport(){
    if (!window.XLSX) return toast('Thiếu thư viện xuất Excel');
    const rows = [[
      'Mã sản phẩm','Tên sản phẩm','Đơn vị tính','Quy cách','Giá bán tham chiếu','Giá nhập tham chiếu','Kho quản lý','Nhãn hàng','Ngành hàng','Mã nhóm','Tên nhóm','Trạng thái','Ghi chú'
    ]];
    db.products.forEach(p => rows.push([p.sku,p.name,p.unit,p.pack,p.saleRef,p.costRef,p.warehouse,p.brand,p.category,p.groupCode || '',p.groupName || '',p.status || 'active',p.note || '']));
    const ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bao_cao_san_pham');
    XLSX.writeFile(wb, `bao_cao_thong_tin_san_pham_${today()}.xlsx`);
  }
  function editProductGroup(key){
    if (!requireCan('product:edit','Không có quyền sửa nhóm sản phẩm')) return;
    const g = db.productGroups.find(x => String(x.code || x.name) === String(key));
    if (!g) return toast('Không tìm thấy nhóm sản phẩm');
    const txt = prompt('Sửa nhóm sản phẩm theo định dạng: mã nhóm|tên nhóm|ghi chú', [g.code || '', g.name || '', g.note || ''].join('|'));
    if (txt === null) return;
    const [code,name,...note] = txt.split('|');
    g.code = String(code || '').trim();
    g.name = String(name || '').trim();
    g.note = note.join('|').trim();
    save('Đã sửa nhóm sản phẩm');
  }
  function deleteProductGroup(key){
    if (!requireCan('product:delete','Không có quyền xoá nhóm sản phẩm')) return;
    const i = db.productGroups.findIndex(x => String(x.code || x.name) === String(key));
    if (i < 0) return toast('Không tìm thấy nhóm sản phẩm');
    if (!confirm('Xoá nhóm sản phẩm này?')) return;
    db.productGroups.splice(i, 1);
    save('Đã xoá nhóm sản phẩm');
  }

  function stockUnitCost(sku){
    const s = db.stocks.find(x => String(x.sku) === String(sku)) || {};
    const p = product(sku) || {};
    return Math.round(num(s.avgCost) || num(s.lastCost) || num(p.costRef) || 0);
  }

  function validStockOrder(o){
    return o && o.status !== 'cancelled' && o.workflowStatus !== 'cancelled' && o.deliveryStatus !== 'cancelled';
  }

  function periodReceiptQtyValue(sku, from, to){
    let qty = 0, value = 0;
    db.receipts
      .filter(r => receiptPosted(r) && inDateRange(r.date, from, to))
      .forEach(r => (r.items || []).forEach(it => {
        if (String(it.sku) !== String(sku)) return;
        qty += num(it.qty);
        value += num(it.qty) * Math.round(num(it.cost));
      }));
    return { qty, value: Math.round(value) };
  }

  function periodOrderQtyValue(sku, from, to){
    const cost = stockUnitCost(sku);
    let qty = 0;
    db.orders
      .filter(validStockOrder)
      .filter(o => inDateRange(o.date, from, to))
      .forEach(o => (o.items || []).forEach(it => {
        if (String(it.sku) !== String(sku)) return;
        qty += num(it.qty);
      }));
    return { qty, value: Math.round(qty * cost) };
  }

  function movementAfterTo(sku, to){
    if (!to) return { inQty:0, outQty:0 };
    let inQty = 0, outQty = 0;
    db.receipts
      .filter(r => receiptPosted(r) && String(r.date || '').slice(0,10) > to)
      .forEach(r => (r.items || []).forEach(it => { if (String(it.sku) === String(sku)) inQty += num(it.qty); }));
    db.orders
      .filter(validStockOrder)
      .filter(o => String(o.date || '').slice(0,10) > to)
      .forEach(o => (o.items || []).forEach(it => { if (String(it.sku) === String(sku)) outQty += num(it.qty); }));
    return { inQty, outQty };
  }

  function buildXntRows(from, to, query=''){
    const keys = new Set([
      ...db.products.map(p => String(p.sku || '').trim()),
      ...db.stocks.map(s => String(s.sku || '').trim()),
      ...db.receipts.flatMap(r => (r.items || []).map(it => String(it.sku || '').trim())),
      ...db.orders.flatMap(o => (o.items || []).map(it => String(it.sku || '').trim()))
    ].filter(Boolean));
    const q = norm(query);
    return [...keys].map(sku => {
      const p = product(sku) || {};
      if (q && !norm(sku).includes(q) && !norm(p.name).includes(q)) return null;
      const cost = stockUnitCost(sku);
      const inMov = periodReceiptQtyValue(sku, from, to);
      const outMov = periodOrderQtyValue(sku, from, to);
      const after = movementAfterTo(sku, to);
      const endQty = stockQty(sku) - after.inQty + after.outQty;
      const beginQty = endQty - inMov.qty + outMov.qty;
      return {
        sku,
        name: p.name || '',
        unit: p.unit || '',
        warehouse: p.warehouse || 'Chưa khai báo',
        cost,
        beginQty, beginValue: Math.round(beginQty * cost),
        inQty: inMov.qty, inValue: inMov.value,
        outQty: outMov.qty, outValue: outMov.value,
        endQty, endValue: Math.round(endQty * cost)
      };
    }).filter(Boolean).filter(r => q || r.beginQty || r.inQty || r.outQty || r.endQty)
      .sort((a,b)=>String(a.warehouse).localeCompare(String(b.warehouse)) || String(a.sku).localeCompare(String(b.sku)));
  }

  function xntTable(rows){
    return `<div class="table-wrap"><table><thead><tr><th>Kho</th><th>Mã SP</th><th>Tên sản phẩm</th><th>ĐVT</th><th class="right">Tồn đầu SL</th><th class="right">Tồn đầu GT</th><th class="right">Nhập SL</th><th class="right">Nhập GT</th><th class="right">Xuất SL</th><th class="right">Xuất GT</th><th class="right">Tồn cuối SL</th><th class="right">Tồn cuối GT</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.warehouse)}</td><td><b>${esc(r.sku)}</b></td><td>${esc(r.name)}</td><td>${esc(r.unit)}</td><td class="right">${money(r.beginQty)}</td><td class="right">${money(r.beginValue)}</td><td class="right">${money(r.inQty)}</td><td class="right">${money(r.inValue)}</td><td class="right">${money(r.outQty)}</td><td class="right">${money(r.outValue)}</td><td class="right"><b>${money(r.endQty)}</b></td><td class="right"><b>${money(r.endValue)}</b></td></tr>`).join('') || '<tr><td colspan="12" class="center muted">Không có dữ liệu xuất nhập tồn theo điều kiện đã chọn</td></tr>'}
      </tbody></table></div>`;
  }

  function viewStockMovement(){
    const q = $('xntProductSearch')?.value || '';
    const from = $('xntFrom')?.value || '';
    const to = $('xntTo')?.value || '';
    if (!q.trim()) return toast('Nhập mã sản phẩm hoặc ký tự trong tên sản phẩm');
    if (!from || !to) return toast('Chọn đủ thời gian đầu kỳ và cuối kỳ');
    const rows = buildXntRows(from, to, q);
    $('xntResult').innerHTML = `<h4>Kết quả XN Tồn từ ${esc(from)} đến ${esc(to)}</h4>${xntTable(rows)}`;
  }

  function exportStockMovementExcel(){
    if (!window.XLSX) return toast('Thiếu thư viện xuất Excel');
    const from = $('xntExportFrom')?.value || '';
    const to = $('xntExportTo')?.value || '';
    if (!from || !to) return toast('Chọn đủ thời gian đầu kỳ và cuối kỳ');
    const data = buildXntRows(from, to);
    const rows = [[`BÁO CÁO XUẤT NHẬP TỒN TỪ ${from} ĐẾN ${to}`], [], ['Kho','Mã sản phẩm','Tên sản phẩm','Đơn vị tính','Giá vốn tham chiếu','Tồn đầu SL','Tồn đầu giá trị','Nhập SL','Nhập giá trị','Xuất SL','Xuất giá trị','Tồn cuối SL','Tồn cuối giá trị']];
    data.forEach(r => rows.push([r.warehouse,r.sku,r.name,r.unit,r.cost,r.beginQty,r.beginValue,r.inQty,r.inValue,r.outQty,r.outValue,r.endQty,r.endValue]));
    const ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Xuat_nhap_ton');
    XLSX.writeFile(wb, `bao_cao_xuat_nhap_ton_${from}_${to}.xlsx`);
  }

  function renderStock(){
    const from = $('xntFrom')?.value || today();
    const to = $('xntTo')?.value || today();
    const expFrom = $('xntExportFrom')?.value || today();
    const expTo = $('xntExportTo')?.value || today();
    const q = $('xntProductSearch')?.value || '';
    $('stock').innerHTML = `<div class="card"><h3>Tồn kho</h3>
      <p class="muted">Đã bỏ hiển thị tồn kho tổng. Khu vực này dùng để kiểm tra xuất nhập tồn theo mã/tên sản phẩm hoặc xuất báo cáo XNT theo kỳ.</p>
      <div class="sub-card">
        <h4>1. Kiểm tra tồn kho</h4>
        <div class="form">
          ${smartInput('xntProductSearch','Nhập mã sản phẩm hoặc ký tự trong tên sản phẩm','xntProductSuggest',suggestionValues('product'))}
          <label>Thời gian đầu kỳ</label><input id="xntFrom" type="date" value="${esc(from)}">
          <label>Thời gian cuối kỳ</label><input id="xntTo" type="date" value="${esc(to)}">
        </div>
        <div class="toolbar action-row"><button class="btn green" id="viewXntBtn">Xem XN Tồn</button></div>
        <div id="xntResult" class="report-result"></div>
      </div>
      <div class="sub-card">
        <h4>2. Xuất nhập tồn theo kỳ</h4>
        <p class="muted">Chọn kỳ rồi xuất toàn bộ thông tin xuất nhập tồn của tất cả sản phẩm ra Excel.</p>
        <div class="form">
          <label>Thời gian đầu kỳ</label><input id="xntExportFrom" type="date" value="${esc(expFrom)}">
          <label>Thời gian cuối kỳ</label><input id="xntExportTo" type="date" value="${esc(expTo)}">
        </div>
        <div class="toolbar action-row"><button class="btn green" id="exportXntExcelBtn">Xuất ra Excel</button></div>
      </div>
    </div>`;
    $('viewXntBtn').onclick = viewStockMovement;
    $('exportXntExcelBtn').onclick = exportStockMovementExcel;
    $('xntProductSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') viewStockMovement(); });
    setTimeout(bindGhostSuggestions, 0);
  }

