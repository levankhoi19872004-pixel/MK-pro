// 01-core-state-utils.js
// Khởi tạo App, state dùng chung, chuẩn hoá dữ liệu, hàm gợi ý nền tảng.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

window.__KHO_MINH_KHAI_PRO_V5__ = true;
window.App = (() => {
  let db = emptyDb();
  let currentPage = 'dashboard';
  let receivePendingRows = [];
  let receiveDraftItems = [];
  let editingReceiptId = '';
  let receiveDraftMeta = { id:'', date:'', note:'' };
  let singleOrderDraftItems = [];
  let editingSingleOrderId = '';

  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const nowIso = () => new Date().toISOString();
  const money = n => (Number(n) || 0).toLocaleString('vi-VN');
  function num(v){
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/[₫đĐ\s]/g,'');
    if (!s) return 0;
    const hasComma = s.includes(','), hasDot = s.includes('.');
    if (hasComma && hasDot) {
      const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
      s = c > d ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
    } else if (hasComma) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g,'') : s.replace(',','.');
    } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g,'');
    }
    const n = Number(s.replace(/[^0-9.\-]/g,''));
    return isFinite(n) ? n : 0;
  }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').trim();
  const sameDay = (d, day) => String(d || '').slice(0, 10) === day;
  const inDateRange = (d, from, to) => { const x = String(d || '').slice(0,10); return (!from || x >= from) && (!to || x <= to); };
  const searchMatch = (obj, q) => !q || norm(Object.values(obj || {}).map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(' ')).includes(q);
  const uniq = arr => [...new Set((arr || []).map(x => String(x || '').trim()).filter(Boolean))].slice(0, 300);
  function normalizeSuggestEntries(values){
    const out = [];
    const seen = new Set();
    (values || []).forEach(v => {
      if (v && typeof v === 'object') {
        const value = String(v.value ?? '').trim();
        const label = String(v.label ?? value).trim();
        const meta = String(v.meta ?? '').trim();
        const search = String(v.search ?? [value,label,meta].filter(Boolean).join(' ')).trim();
        if (!value) return;
        const key = value + '|' + label + '|' + meta;
        if (!seen.has(key)) { seen.add(key); out.push({ value, label, meta, search }); }
      } else {
        const value = String(v || '').trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        out.push({ value, label:value, meta:'', search:value });
      }
    });
    return out.slice(0, 300);
  }
  function orderCustomerSuggestions(){
    return normalizeSuggestEntries((db.customers || []).map(c => ({
      value: c.code,
      label: [c.code, c.name].filter(Boolean).join(' · '),
      meta: [c.address, c.phone ? `SĐT: ${c.phone}` : ''].filter(Boolean).join('  |  '),
      search: [c.code,c.name,c.address,c.phone].filter(Boolean).join(' ')
    })));
  }
  function orderStaffSuggestions(){
    const staff = [...(db.staff || []), ...(db.users || [])];
    return normalizeSuggestEntries(staff.map(st => {
      const code = st.code || st.staffCode || st.username || '';
      const name = st.name || st.fullName || st.displayName || '';
      const phone = st.phone || st.tel || st.mobile || '';
      return {
        value: code,
        label: [code, name].filter(Boolean).join(' · '),
        meta: phone ? `SĐT: ${phone}` : (st.role ? `Vai trò: ${roleLabel(st.role)}` : ''),
        search: [code,name,st.username,phone,roleLabel(st.role)].filter(Boolean).join(' ')
      };
    }));
  }
  function orderProductSuggestions(){
    return normalizeSuggestEntries((db.products || []).map(p => ({
      value: p.sku,
      label: [p.sku, p.name].filter(Boolean).join(' · '),
      meta: [`Tồn kho: ${stockQty(p.sku)} ${p.unit || 'lẻ'}`, p.warehouse ? `Kho: ${p.warehouse}` : ''].filter(Boolean).join('  |  '),
      search: [p.sku,p.name,p.brand,p.category,p.warehouse,stockQty(p.sku)].filter(Boolean).join(' ')
    })));
  }
  function suggestionValues(type){
    const orders = Array.isArray(db.orders) ? db.orders : [];
    const customers = Array.isArray(db.customers) ? db.customers : [];
    const products = Array.isArray(db.products) ? db.products : [];
    const staffList = [...(Array.isArray(db.staff) ? db.staff : []), ...(Array.isArray(db.users) ? db.users : [])];
    const deliveryList = [...(Array.isArray(db.deliveryStaff) ? db.deliveryStaff : []), ...(Array.isArray(db.users) ? db.users.filter(u => String(u.role || '').toLowerCase().includes('delivery')) : [])];

    const customerEntries = (valueField='code') => normalizeSuggestEntries(customers.map(c => ({
      value: valueField === 'name' ? (c.name || '') : valueField === 'phone' ? (c.phone || '') : valueField === 'address' ? (c.address || '') : (c.code || ''),
      label: [c.code, c.name].filter(Boolean).join(' · '),
      meta: [c.address, c.phone ? `SĐT: ${c.phone}` : ''].filter(Boolean).join('  |  '),
      search: [c.code,c.name,c.address,c.phone].filter(Boolean).join(' ')
    })));

    const productEntries = (valueField='sku') => normalizeSuggestEntries(products.map(p => ({
      value: valueField === 'name' ? (p.name || '') : valueField === 'warehouse' ? (p.warehouse || '') : valueField === 'brandCategory' ? (p.brand || p.category || '') : (p.sku || ''),
      label: [p.sku, p.name].filter(Boolean).join(' · '),
      meta: [`Tồn kho: ${stockQty(p.sku)} ${p.unit || 'lẻ'}`, p.warehouse ? `Kho: ${p.warehouse}` : '', p.brand || p.category || ''].filter(Boolean).join('  |  '),
      search: [p.sku,p.name,p.brand,p.category,p.warehouse,stockQty(p.sku)].filter(Boolean).join(' ')
    })));

    const staffEntries = (source='all', valueField='code') => {
      const base = source === 'delivery' ? deliveryList : source === 'sales' ? staffList.filter(st => !String(st.role || '').toLowerCase().includes('delivery')) : [...staffList, ...deliveryList];
      return normalizeSuggestEntries(base.map(st => {
        const code = st.code || st.staffCode || st.username || '';
        const name = st.name || st.fullName || st.displayName || '';
        const phone = st.phone || st.tel || st.mobile || '';
        return {
          value: valueField === 'name' ? name : valueField === 'role' ? roleLabel(st.role) : code,
          label: [code, name].filter(Boolean).join(' · '),
          meta: phone ? `SĐT: ${phone}` : (st.role ? `Vai trò: ${roleLabel(st.role)}` : ''),
          search: [code,name,phone,st.username,roleLabel(st.role)].filter(Boolean).join(' ')
        };
      }));
    };

    const simpleOrderEntries = (values) => normalizeSuggestEntries(uniq(values).map(v => ({ value:v, label:v })));

    if (type === 'customerCode') return customerEntries('code');
    if (type === 'customerName') return customerEntries('name');
    if (type === 'customerPhone') return customerEntries('phone');
    if (type === 'customerAddress') return customerEntries('address');
    if (type === 'customer') return customerEntries('code');

    if (type === 'salesStaff') return staffEntries('sales', 'code');
    if (type === 'deliveryStaff') return staffEntries('delivery', 'code');
    if (type === 'allStaff') return staffEntries('all', 'code');

    if (type === 'productSku') return productEntries('sku');
    if (type === 'productName') return productEntries('name');
    if (type === 'productWarehouse') return productEntries('warehouse');
    if (type === 'productBrand') return simpleOrderEntries(products.map(p => p.brand));
    if (type === 'productCategory') return simpleOrderEntries(products.map(p => p.category));
    if (type === 'productBrandCategory') return productEntries('brandCategory');
    if (type === 'product') return productEntries('sku');

    if (type === 'orderSearch') return normalizeSuggestEntries([
      ...customerEntries('code'), ...staffEntries('all','code'), ...productEntries('sku'),
      ...orders.flatMap(o => [o.id, o.source, o.note, o.workflowStatus]).filter(Boolean).map(v => ({ value:v, label:v }))
    ]);

    return [];
  }
  const dataList = (id, values) => `<script type="application/json" id="${id}" class="ghost-source">${JSON.stringify(normalizeSuggestEntries(values)).replace(/</g,'\\u003c')}</script>`;
  const ghostInput = (id, placeholder, listId='', values=[], extra='') => {
    const oldVal = esc($(id)?.value || '');
    return `<span class="ghost-wrap"><span class="ghost-hint" data-ghost-for="${id}"></span><input id="${id}" ${extra} data-ghost-list="${listId}" autocomplete="off" placeholder="${placeholder}" value="${oldVal}"></span>${listId ? dataList(listId, values) : ''}`;
  };
  const searchBox = (id, placeholder='Tìm kiếm tất cả cột', listId='', values=[], extra='') => ghostInput(id, placeholder, listId, values, extra);
  const smartInput = (id, placeholder, listId, values, extra='') => ghostInput(id, placeholder, listId, values, extra);
  const dateRangeBox = (prefix) => `<label>Từ ngày</label><input id="${prefix}From" type="date" value="${esc($(prefix+'From')?.value || '')}"><label>Đến ngày</label><input id="${prefix}To" type="date" value="${esc($(prefix+'To')?.value || '')}">`;
  const filterField = (label, inner) => `<label class="filter-field"><span>${label}</span>${inner}</label>`;
  const filterGrid = (items) => `<div class="filter-grid">${items.join('')}</div>`;
  const renderTimers = {};
  function debounceRender(key, fn, ms=250){
    clearTimeout(renderTimers[key]);
    renderTimers[key] = setTimeout(fn, ms);
  }
  const toast = msg => {
    const t = $('toast');
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2600);
  };

  function emptyDb(){
    return {
      products: [], stocks: [], receipts: [], orders: [], customers: [],
      staff: [], deliveryStaff: [], users: [], masterOrders: [], debts: [], debtLedger: [], auditLogs: [],
      payments: [], returns: [], cashFund: [], promotions: [], productGroups: [],
      dmsOrders: [], dmsStocks: [], dmsAllocations: [], stockShortages: []
    };
  }

  function normalizeDb(src){
    const base = emptyDb();
    src = src && typeof src === 'object' ? src : {};
    Object.keys(base).forEach(k => base[k] = Array.isArray(src[k]) ? src[k] : []);
    base.stockShortages = base.stockShortages.map(x => ({
      id: x.id || ('THIEU_' + Date.now()),
      date: x.date || today(),
      source: x.source || '',
      orderId: String(x.orderId || '').trim(),
      sku: String(x.sku || '').trim(),
      name: x.name || product(x.sku)?.name || '',
      requestedQty: num(x.requestedQty),
      importedQty: num(x.importedQty),
      shortageQty: num(x.shortageQty),
      availableAtImport: num(x.availableAtImport),
      customerCode: x.customerCode || '',
      customerName: x.customerName || '',
      staffCode: x.staffCode || '',
      staffName: x.staffName || '',
      note: x.note || 'Tự loại phần thiếu tồn khi import đơn hàng'
    })).filter(x => x.orderId && x.sku && x.shortageQty > 0);
    base.productGroups = base.productGroups.map(g => ({
      code: String(g.code || g.groupCode || '').trim(),
      name: String(g.name || g.groupName || '').trim(),
      note: g.note || ''
    })).filter(g => g.code || g.name);
    base.products = base.products.map(p => ({
      sku: String(p.sku || '').trim(),
      name: p.name || '',
      brand: p.brand || '',
      category: p.category || '',
      unit: p.unit || p.uom || 'cái',
      pack: num(p.pack) || 1,
      costRef: Math.round(num(p.costRef || p.cost)),
      saleRef: Math.round(num(p.saleRef || p.sale || p.price)),
      warehouse: p.warehouse || 'Kho chính',
      status: p.status || 'active',
      note: p.note || ''
    })).filter(p => p.sku);
    base.stocks = base.stocks.map(s => ({
      sku: String(s.sku || '').trim(),
      qty: num(s.qty),
      avgCost: Math.round(num(s.avgCost)),
      lastCost: Math.round(num(s.lastCost)),
      updatedAt: s.updatedAt || ''
    })).filter(s => s.sku);
    base.receipts = base.receipts.map(r => ({
      ...r,
      id: String(r.id || r.receiptId || ('PN' + Date.now())).trim(),
      date: r.date || today(),
      supplier: r.supplier || 'Unilever',
      note: r.note || '',
      posted: r.posted === undefined ? true : r.posted === true,
      postedAt: r.postedAt || '',
      items: Array.isArray(r.items) ? r.items.map(it => ({
        sku: String(it.sku || '').trim(),
        name: it.name || product(it.sku)?.name || '',
        pack: num(it.pack) || product(it.sku)?.pack || 1,
        qty: num(it.qty),
        cost: Math.round(num(it.cost))
      })).filter(it => it.sku && it.qty > 0) : [],
      total: Math.round(num(r.total || receiptTotal(r)))
    })).filter(r => r.id);
    base.orders = base.orders.map(recalcOrder);
    return base;
  }

  const productKey = v => String(v || '').trim();
  const product = sku => {
    const key = productKey(sku);
    if (!key) return null;
    const q = norm(key);
    return db.products.find(p => productKey(p.sku) === key)
      || db.products.find(p => norm(p.sku) === q)
      || db.products.find(p => norm(p.productCode || p.code) === q)
      || null;
  };
  function findProductSmart(value){
    const raw = productKey(value);
    if (!raw) return null;
    const q = norm(raw);
    const products = Array.isArray(db.products) ? db.products : [];
    return products.find(p => norm(p.sku) === q || norm(p.productCode || p.code) === q || norm(p.name) === q)
      || products.find(p => norm(p.sku).startsWith(q) || norm(p.name).startsWith(q))
      || products.find(p => norm([p.sku,p.productCode,p.code,p.name,p.brand,p.category,p.warehouse].filter(Boolean).join(' ')).includes(q))
      || null;
  }
  const customerByCode = code => db.customers.find(c => String(c.code || '').trim() === String(code || '').trim());
  const customerByName = name => db.customers.find(c => norm(c.name) === norm(name)) || db.customers.find(c => norm(c.name).includes(norm(name)) && norm(name));
  const productByName = name => {
    const q = norm(name);
    if (!q) return null;
    return db.products.find(p => norm(p.name) === q)
      || db.products.find(p => norm(p.name).startsWith(q))
      || db.products.find(p => norm(p.name).includes(q))
      || null;
  };
  const customerAddress = (code, fallback='') => customerByCode(code)?.address || fallback || '';
  const staffByCode = code => (db.staff || []).find(x => String(x.code || x.staffCode || '').trim() === String(code || '').trim()) || (db.users || []).find(x => String(x.code || x.username || '').trim() === String(code || '').trim());
  const staffDisplayName = st => st ? (st.name || st.fullName || st.displayName || st.username || '') : '';
  function fillCustomerByCode(inputId, nameId){
    const c = customerByCode($(inputId)?.value);
    if (c && $(nameId)) $(nameId).value = c.name || '';
  }
  function fillStaffByCode(inputId, nameId){
    const st = staffByCode($(inputId)?.value);
    if (st && $(nameId)) $(nameId).value = staffDisplayName(st);
  }
  function fillOrderProductBySku(){
    const p = product($('oSku')?.value?.trim());
    if (!p) return;
    if ($('oProductName')) $('oProductName').value = p.name || '';
    if ($('oPack')) $('oPack').value = num(p.pack) || 1;
    if ($('oSale')) $('oSale').value = num(p.saleRef || p.sale || p.price || 0);
  }
  const receiptPosted = r => r && r.posted === true;
  function receiptTotal(r){ return (r.items || []).reduce((a,x)=>a + num(x.qty) * num(x.cost), 0); }
  function receiptQty(r){ return (r.items || []).reduce((a,x)=>a + num(x.qty), 0); }
  function stock(sku){
    sku = String(sku || '').trim();
    let s = db.stocks.find(x => String(x.sku) === sku);
    if (!s) {
      s = { sku, qty: 0, avgCost: 0, lastCost: 0, updatedAt: '' };
      db.stocks.push(s);
    }
    return s;
  }
  const stockQty = sku => num(db.stocks.find(s => String(s.sku) === String(sku))?.qty);
  const qtyView = (q, pack) => {
    pack = num(pack) || 1;
    return `${Math.floor(num(q) / pack)}/${num(q) % pack}`;
  };
  const orderCash = o => num(o.cashPaid);
  const orderBank = o => num(o.bankPaid);
  const orderReturn = o => num(o.returnAmount);
  const orderPaid = o => orderCash(o) + orderBank(o) + orderReturn(o);
  function orderWorkflowStatus(o){
    if (o.deliveryStatus === 'delivered') return num(o.debt) > 0 ? 'Đã giao - còn nợ' : 'Đã giao - hoàn tất';
    if (orderPaid(o) > 0 && num(o.debt) > 0) return 'Đã thu một phần - chờ giao';
    if (orderPaid(o) > 0 && num(o.debt) <= 0) return 'Đã thu đủ - chờ giao';
    return 'Chờ giao';
  }
  function recalcOrder(o){
    o = o || {};
    const items = Array.isArray(o.items) ? o.items : [];
    const goods = items.reduce((a, it) => a + num(it.qty) * num(it.sale), 0);
    const discount = items.reduce((a, it) => a + num(it.qty) * num(it.sale) * num(it.discount) / 100, 0);
    const displayReward = items.reduce((a, it) => a + num(it.displayReward), 0);
    const total = Math.max(0, Math.round(goods - discount));
    const paid = num(o.cashPaid) + num(o.bankPaid) + num(o.returnAmount);
    return {
      ...o, goods, discount, displayReward, total,
      debt: Math.max(0, total - paid),
      paymentStatus: total - paid <= 0 ? 'Đã thanh toán' : (paid > 0 ? 'Thanh toán một phần' : 'Còn nợ'),
      overPaid: Math.max(0, paid - total),
      workflowStatus: orderWorkflowStatus({ ...o, debt: Math.max(0, total - paid) })
    };
  }
  function rebuildDebts(){
    db.debts = db.orders.filter(o => num(o.debt) > 0).map(o => ({
      id:'DEBT_' + o.id, orderId:o.id, date:o.date || today(), customerCode:o.customerCode || '',
      customerName:o.customerName || '', staffCode:o.staffCode || '', staffName:o.staffName || '',
      deliveryStaffCode:o.deliveryStaffCode || '', deliveryStaffName:o.deliveryStaffName || '',
      total:num(o.total), paid:orderPaid(o), debt:num(o.debt), status:o.paymentStatus || 'Còn nợ'
    }));
  }
  function dmsStockQty(sku){
    sku = String(sku || '').trim();
    return db.dmsStocks.filter(x => String(x.sku) === sku).reduce((a,x)=>a+num(x.qty),0);
  }
  function openSellableQty(sku){
    // Logic mở bán DMS chuẩn:
    // - Nếu tồn DMS >= tồn thực tế: không mở bán, cần báo kế toán chấm ra DMS.
    // - Nếu tồn DMS < tồn thực tế: chỉ mở bán đúng phần chênh lệch thực tế - DMS.
    // - Khi app bán hàng chấm đơn, tồn thực tế bị trừ nên phần mở bán tự giảm theo.
    const real = stockQty(sku);
    const dms = dmsStockQty(sku);
    return Math.max(0, real - dms);
  }
  function dmsCompareRows(){
    const keys = new Set([...db.stocks.map(s=>String(s.sku)), ...db.dmsStocks.map(s=>String(s.sku))].filter(Boolean));
    return [...keys].map(sku => {
      const p = product(sku);
      const real = stockQty(sku);
      const dms = dmsStockQty(sku);
      const diff = dms - real;
      return { sku, name:p?.name || db.dmsStocks.find(x=>String(x.sku)===sku)?.name || '', warehouse:p?.warehouse || 'Chưa khai báo', real, dms, diff, open:Math.max(0, real-dms) };
    }).sort((a,b)=>String(a.warehouse).localeCompare(String(b.warehouse)) || String(a.sku).localeCompare(String(b.sku)));
  }

  async function save(message = 'Đã đồng bộ dữ liệu'){
    db = normalizeDb(db);
    rebuildDebts();
    await API.saveData(db);
    toast(message);
    render();
  }

  function showApp(){
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('userInfo').textContent = `${API.user?.name || API.user?.username || ''} · ${roleLabel(API.user?.role) || API.user?.role || ''}`;
    applyRolePermissions();
  }
  function showLogin(){
    $('loginScreen').classList.remove('hidden');
    $('app').classList.add('hidden');
  }
  async function load(){
    db = normalizeDb(await API.getData());
    render();
  }
  function setPage(p){
    if (!canOpenPage(p)) { toast('Vai trò hiện tại không có quyền mở mục này'); return; }
    currentPage = p;
    document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
    $(p)?.classList.remove('hidden');
    document.querySelectorAll('.sidebar button[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    $('pageTitle').textContent = document.querySelector(`[data-page="${p}"]`)?.textContent || 'Kho';
    render();
  }
  const importToolbar = type => `<div class="toolbar">
    <button class="btn green" data-import="${type}">Import nhanh Excel</button>
    <button class="btn" data-template="${type}">Tải mẫu import</button>
  </div>`;
  const dateFilter = key => `<div class="toolbar"><label>Ngày</label><input id="${key}Date" type="date" value="${esc($(key+'Date')?.value || today())}"></div>`;


  // ================= CONFIG-DRIVEN UI/FILTER ENGINE =================
  // Từ v22: cấu hình bộ lọc được khai báo tập trung tại đây.
  // Muốn thêm/sửa trường tìm kiếm của một mục: chỉ sửa FIELD_FILTER_CONFIG, hạn chế đụng vào HTML render.
