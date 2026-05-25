// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Sửa các file trong public/js/app-modules rồi chạy: npm run build:app


// ===== 01-core-state-utils.js =====
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


// ===== 02-permission-suggest-filter.js =====
  const FIELD_FILTER_CONFIG = window.KHO_SEARCH_FIELD_CONFIG || {};
  const SEARCH_BEHAVIOR = window.KHO_SEARCH_BEHAVIOR || { debounceMs: 220, minChars: 1, maxSuggestions: 8 };


  function relatedTargetBySuggest(suggest){
    return (window.KHO_RELATED_PAGE_BY_SUGGEST || {})[suggest] || '';
  }
  function pageLabel(page){
    return (window.KHO_RELATED_PAGE_LABELS || {})[page] || page;
  }
  function relatedExtraAttrs(f){
    const target = f.targetPage || relatedTargetBySuggest(f.suggest);
    if (!target) return '';
    return `data-related-page="${esc(target)}" data-related-label="${esc(pageLabel(target))}" data-related-suggest="${esc(f.suggest || '')}"`;
  }
  function configSuggestValues(key){
    const map = {
      productSku: () => suggestionValues('productSku'), productName: () => suggestionValues('productName'), productWarehouse: () => suggestionValues('productWarehouse'),
      productBrandCategory: () => suggestionValues('productBrandCategory'), product: () => suggestionValues('product'),
      customer: () => suggestionValues('customer'), customerCode: () => suggestionValues('customerCode'), customerName: () => suggestionValues('customerName'), customerPhone: () => suggestionValues('customerPhone'), customerAddress: () => suggestionValues('customerAddress'),
      salesStaff: () => suggestionValues('salesStaff'), deliveryStaff: () => suggestionValues('deliveryStaff'), allStaff: () => suggestionValues('allStaff'),
      receiptId: () => (db.receipts || []).map(r=>r.id), supplier: () => (db.receipts || []).map(r=>r.supplier), orderIds: () => (db.orders || []).map(o=>o.id), allOrderIds: () => (db.orders || []).map(o=>o.id).concat((db.masterOrders || []).map(m=>m.id)),
      promoCodeName: () => (db.promotions || []).map(p=>({ value:p.code || p.name, label:[p.code,p.name].filter(Boolean).join(' · '), meta:p.type || '', search:[p.code,p.name,p.type].filter(Boolean).join(' ') })),
      promoType: () => (db.promotions || []).map(p=>p.type),
      fundType: () => (db.cashFund || []).map(x=>x.type), fundNote: () => (db.cashFund || []).map(x=>x.note), fundUser: () => (db.cashFund || []).map(x=>x.user),
      accountUser: () => suggestionValues('allStaff'), accountName: () => suggestionValues('allStaff'), accountCode: () => suggestionValues('allStaff'), accountRole: () => (db.users || []).map(u=>roleLabel(u.role))
    };
    return normalizeSuggestEntries(map[key] ? map[key]() : []);
  }

  function renderFilterControl(f){
    if (f.type === 'dateRange') return dateRangeBox(f.prefix);
    if (f.type === 'date') return `<input id="${f.id}" type="date" value="${esc($(f.id)?.value || '')}">`;
    const values = f.values || configSuggestValues(f.suggest);
    return searchBox(f.id, f.placeholder || f.label, `${f.id}Suggest`, values, relatedExtraAttrs(f));
  }
  function renderConfiguredFilters(section){
    return filterGrid((FIELD_FILTER_CONFIG[section] || []).map(f => filterField(f.label, renderFilterControl(f))));
  }
  function bindConfiguredFilterEvents(section, renderFn, delay=SEARCH_BEHAVIOR.debounceMs || 220){
    (FIELD_FILTER_CONFIG[section] || []).forEach(f => {
      if (f.type === 'dateRange') {
        [f.id, f.to].forEach(id => { const el = $(id); if (el) el.onchange = renderFn; });
        return;
      }
      const el = $(f.id); if (!el) return;
      const ev = f.type === 'date' ? 'onchange' : 'oninput';
      el[ev] = () => { clearTimeout(window[`__${section}FilterTimer`]); window[`__${section}FilterTimer`] = setTimeout(renderFn, delay); };
    });
  }
  function getFilter(id){ return norm($(id)?.value || ''); }
  function getFilterRaw(id, fallback=''){ return $(id)?.value || fallback; }
  // ==================================================================



  function checkedValues(cls){
    return [...document.querySelectorAll('.' + cls + ':checked')].map(x => x.value);
  }
  function setAllChecks(cls, checked){
    document.querySelectorAll('.' + cls).forEach(x => x.checked = checked);
  }
  const ROLE_DEFINITIONS = {
    admin: { label:'Quản trị', pages:null, permissions:['*'] },
    manager: { label:'Quản lý', pages:null, permissions:['data:view','data:save','order:*','master:*','customer:*','product:*','stock:*','receive:*','promotion:*','debt:*','fund:*','report:view','import:*','print:*'] },
    sales: { label:'Bán hàng', pages:['dashboard','salesApp','orders','customers','stock','reports'], permissions:['data:view','data:save','order:view','order:create','customer:view','stock:view','report:view','salesApp:use'] },
    delivery: { label:'Giao hàng', pages:['dashboard','deliveryApp','masterOrders','debts','reports'], permissions:['data:view','data:save','master:view','deliveryApp:use','delivery:complete','debt:view','debt:collect','report:view'] },
    accountant: { label:'Kế toán', pages:['dashboard','orders','dmsOrders','customers','debts','cashFund','reports','receive','stock','products','promotions'], permissions:['data:view','data:save','order:*','customer:*','debt:*','fund:*','receive:*','stock:*','product:view','promotion:view','report:view','import:*','print:*'] },
    cashier: { label:'Thủ quỹ', pages:['dashboard','cashFund','debts','reports'], permissions:['data:view','data:save','fund:*','debt:view','debt:collect','report:view'] }
  };
  function isAdmin(user = API.user){
    const r = norm(user?.role || user?.username || '');
    return r === 'admin' || r.includes('quan tri') || r.includes('quản trị');
  }
  function roleLabel(role){
    return (ROLE_DEFINITIONS[String(role || '').toLowerCase()]?.label) || role || '';
  }
  function currentRole(){
    return String(API.user?.role || '').trim().toLowerCase();
  }
  function roleDef(role = currentRole()){
    return ROLE_DEFINITIONS[String(role || '').toLowerCase()] || ROLE_DEFINITIONS.sales;
  }
  function allowedPagesByRole(role){
    if (isAdmin({ role })) return null;
    return roleDef(role).pages;
  }
  function permissionList(){
    if (isAdmin()) return ['*'];
    if (Array.isArray(API.user?.permissions) && API.user.permissions.length) return API.user.permissions;
    return roleDef().permissions || [];
  }
  function permissionMatch(owned, need){
    return owned === '*' || owned === need || (String(owned).endsWith(':*') && String(need).startsWith(String(owned).slice(0,-1)));
  }
  function can(permission){
    if (isAdmin()) return true;
    return permissionList().some(p => permissionMatch(p, permission));
  }
  function requireCan(permission, message){
    if (can(permission)) return true;
    toast(message || ('Không có quyền: ' + permission));
    return false;
  }
  function canOpenPage(page){
    const allowed = allowedPagesByRole(currentRole());
    return !allowed || allowed.includes(page);
  }
  function applyRolePermissions(){
    const allowed = allowedPagesByRole(currentRole());
    document.querySelectorAll('.sidebar button[data-page]').forEach(b => {
      b.classList.toggle('hidden', !!allowed && !allowed.includes(b.dataset.page));
    });
  }
  function canAdminOverride(action){
    if (isAdmin()) return true;
    toast(action || 'Chỉ admin có quyền thao tác phần đã khóa');
    return false;
  }
  function snapshot(x){ try { return JSON.stringify(x); } catch(e){ return String(x); } }
  function bulkToolbar(cls, editFn, deleteFn, extra=''){
    return `<div class="toolbar bulk-toolbar compact-actions">
      <label class="check-all"><input type="checkbox" onchange="App.setAllChecks('${cls}', this.checked)"> Tất cả</label>
      ${deleteFn ? `<button class="btn btn-icon red" title="Xoá mục chọn" onclick="App.${deleteFn}()">🗑️</button>` : ''}
      ${extra}
    </div>`;
  }
  function audit(action, detail, before='', after=''){
    db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    db.auditLogs.push({ id:'AUD'+Date.now(), date:nowIso(), user:API.user?.username || API.user?.name || '', role:API.user?.role || '', action, detail, before, after });
  }



  function openRelatedFromFilter(inputId){
    const input = $(inputId);
    if (!input) return;
    const target = input.dataset.relatedPage || '';
    const value = input.value || '';
    if (!target) return;
    if (!canOpenPage(target)) { toast('Vai trò hiện tại không có quyền mở mục ' + pageLabel(target)); return; }
    const q = norm(value);
    setPage(target);
    setTimeout(() => {
      if (target === 'customers') {
        const c = db.customers.find(x => norm(x.code) === q || norm(x.name) === q || norm(x.phone) === q || norm(x.address).includes(q)) || {};
        if ($('customerSearchCode') && (c.code || input.dataset.relatedSuggest === 'customerCode')) $('customerSearchCode').value = c.code || value;
        if ($('customerSearchName') && (c.name || input.dataset.relatedSuggest === 'customerName' || input.dataset.relatedSuggest === 'customer')) $('customerSearchName').value = c.name || (input.dataset.relatedSuggest === 'customerName' ? value : '');
        if ($('customerSearchPhone') && (c.phone || input.dataset.relatedSuggest === 'customerPhone')) $('customerSearchPhone').value = c.phone || (input.dataset.relatedSuggest === 'customerPhone' ? value : '');
        if ($('customerSearchAddress') && (c.address || input.dataset.relatedSuggest === 'customerAddress')) $('customerSearchAddress').value = c.address || (input.dataset.relatedSuggest === 'customerAddress' ? value : '');
        renderCustomers();
      } else if (target === 'products') {
        const p = db.products.find(x => norm(x.sku) === q || norm(x.name) === q || norm(x.warehouse) === q || norm(x.brand) === q || norm(x.category) === q) || {};
        if ($('productSearchSku') && (p.sku || /sku/i.test(input.id) || input.dataset.relatedSuggest === 'productSku')) $('productSearchSku').value = p.sku || value;
        if ($('productSearchName') && (p.name || input.dataset.relatedSuggest === 'productName' || input.dataset.relatedSuggest === 'product')) $('productSearchName').value = p.name || (input.dataset.relatedSuggest === 'productName' ? value : '');
        if ($('productSearchWarehouse') && (p.warehouse || input.dataset.relatedSuggest === 'productWarehouse')) $('productSearchWarehouse').value = p.warehouse || (input.dataset.relatedSuggest === 'productWarehouse' ? value : '');
        if ($('productSearchBrand') && (p.brand || p.category || input.dataset.relatedSuggest === 'productBrandCategory')) $('productSearchBrand').value = p.brand || p.category || (input.dataset.relatedSuggest === 'productBrandCategory' ? value : '');
        renderProducts();
      } else if (target === 'accounts') {
        const u = db.users.find(x => norm(x.username) === q || norm(x.name) === q || norm(x.code) === q || norm(roleLabel(x.role)) === q) ||
          [...db.staff, ...db.deliveryStaff].find(x => norm(x.code) === q || norm(x.name) === q || norm([x.code,x.name,x.phone].filter(Boolean).join(' - ')) === q) || {};
        if ($('accountSearchUser') && u.username) $('accountSearchUser').value = u.username;
        if ($('accountSearchName') && (u.name || /name|staff|delivery/i.test(input.id))) $('accountSearchName').value = u.name || value;
        if ($('accountSearchCode') && (u.code || /code|staff|delivery/i.test(input.id))) $('accountSearchCode').value = u.code || value;
        if ($('accountSearchRole') && u.role) $('accountSearchRole').value = roleLabel(u.role);
        renderAccounts();
      } else if (target === 'receive') {
        if ($('receiveSearchId') && input.dataset.relatedSuggest === 'receiptId') $('receiveSearchId').value = value;
        if ($('receiveSearchSupplier') && input.dataset.relatedSuggest === 'supplier') $('receiveSearchSupplier').value = value;
        if ($('receiveSearchSku') && input.dataset.relatedSuggest === 'product') $('receiveSearchSku').value = value;
        renderReceive();
      } else if (target === 'orders') {
        if ($('ordersCustomerSearch')) $('ordersCustomerSearch').value = value;
        if ($('ordersStaffSearch') && /staff|delivery|sales|account/i.test(input.id)) $('ordersStaffSearch').value = value;
        renderOrders();
      } else if (target === 'promotions') {
        if ($('promoSearchCode') && input.dataset.relatedSuggest === 'promoCodeName') $('promoSearchCode').value = value;
        if ($('promoSearchSku') && input.dataset.relatedSuggest === 'product') $('promoSearchSku').value = value;
        if ($('promoSearchType') && input.dataset.relatedSuggest === 'promoType') $('promoSearchType').value = value;
        renderPromotions();
      } else if (target === 'cashFund') {
        if ($('fundSearchType') && input.dataset.relatedSuggest === 'fundType') $('fundSearchType').value = value;
        if ($('fundSearchNote') && input.dataset.relatedSuggest === 'fundNote') $('fundSearchNote').value = value;
        if ($('fundSearchUser') && input.dataset.relatedSuggest === 'fundUser') $('fundSearchUser').value = value;
        renderCashFund();
      }
      toast('Đã mở mục ' + pageLabel(target) + (value ? ' theo: ' + value : ''));
    }, 0);
  }

  function bindGhostSuggestions(){
    document.querySelectorAll('.ghost-menu').forEach(x => x.remove());
    let activeMenu = null;
    const closeMenus = (except=null) => {
      document.querySelectorAll('.ghost-menu').forEach(m => { if (m !== except) m.classList.add('hidden'); });
    };
    document.addEventListener('click', e => {
      if (!e.target.closest('.ghost-wrap')) closeMenus();
    }, { once:true });

    const SEARCH_BEHAVIOR = {
      debounceMs: 220,
      minChars: 1,
      maxSuggestions: 8
    };

    document.querySelectorAll('input[data-ghost-list]').forEach(input => {
      const listId = input.dataset.ghostList;
      const src = listId ? document.getElementById(listId) : null;
      let values = [];
      if (src) {
        try { values = JSON.parse(src.textContent || '[]'); } catch(e) { values = []; }
      }
      values = normalizeSuggestEntries(values);

      const hint = document.querySelector(`[data-ghost-for="${input.id}"]`);
      const wrap = input.closest('.ghost-wrap');
      const menu = document.createElement('div');
      menu.className = 'ghost-menu hidden';
      if (wrap) wrap.appendChild(menu);

      const oldInput = input.oninput;
      const oldFocus = input.onfocus;
      let timer = null;
      let lastPickedValue = '';

      const qValue = () => norm(input.value || '');
      const canOpenRelated = () => !!(input.dataset.relatedPage && String(input.value || '').trim());

      const pick = value => {
        input.value = value;
        lastPickedValue = value;
        input.dataset.selectedValue = value;
        if (hint) hint.textContent = '';
        menu.classList.add('hidden');
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
        input.focus();
      };

      const matchedValues = () => {
        const q = qValue();
        if (!q || q.length < SEARCH_BEHAVIOR.minChars) return [];
        const starts = values.filter(v => norm(v.search || v.label || v.value).startsWith(q) || norm(v.value).startsWith(q));
        const contains = values.filter(v => !starts.includes(v) && norm(v.search || v.label || v.value).includes(q));
        return starts.concat(contains).slice(0, SEARCH_BEHAVIOR.maxSuggestions);
      };

      const renderMenuNow = () => {
        if (!wrap || document.activeElement !== input) return;
        const q = qValue();
        if (!q || q.length < SEARCH_BEHAVIOR.minChars) {
          menu.innerHTML = `<div class="ghost-empty">Nhập ít nhất ${SEARCH_BEHAVIOR.minChars} ký tự để hiện gợi ý</div>`;
          closeMenus(menu);
          menu.classList.remove('hidden');
          activeMenu = menu;
          return;
        }

        const items = matchedValues();
        const target = input.dataset.relatedPage || '';
        const relatedBtn = canOpenRelated()
          ? `<button type="button" class="ghost-related" data-related="1">↗ Mở trong ${esc(input.dataset.relatedLabel || pageLabel(target))}</button>`
          : '';

        if (!items.length) {
          menu.innerHTML = `<div class="ghost-empty">Không có gợi ý phù hợp</div>${relatedBtn}`;
        } else {
          menu.innerHTML = items.map(v => `<button type="button" class="ghost-option" data-value="${esc(v.value)}"><span class="ghost-main">${esc(v.label || v.value)}</span>${v.meta ? `<span class="ghost-sub">${esc(v.meta)}</span>` : ''}</button>`).join('') + relatedBtn;
        }

        menu.querySelectorAll('button').forEach(btn => btn.onmousedown = e => {
          e.preventDefault();
          if (btn.dataset.related) { openRelatedFromFilter(input.id); return; }
          pick(btn.dataset.value || btn.textContent || '');
        });
        closeMenus(menu);
        menu.classList.remove('hidden');
        activeMenu = menu;
      };

      const renderMenu = () => {
        clearTimeout(timer);
        timer = setTimeout(renderMenuNow, SEARCH_BEHAVIOR.debounceMs);
      };

      const updateHint = () => {
        if (!hint) return;
        const q = qValue();
        if (!q || q.length < SEARCH_BEHAVIOR.minChars) { hint.textContent = ''; hint.dataset.value = ''; return; }
        const found = values.find(v => norm(v.value).startsWith(q) || norm(v.label).startsWith(q)) || values.find(v => norm(v.search || v.label || v.value).includes(q));
        hint.textContent = found ? String(found.label || found.value) : '';
        hint.dataset.value = found ? String(found.value || '') : '';
      };

      const update = () => {
        input.dataset.selectedValue = input.value === lastPickedValue ? lastPickedValue : '';
        updateHint();
        renderMenu();
      };

      input.oninput = e => { update(); if (typeof oldInput === 'function') oldInput.call(input, e); };
      input.onfocus = e => { closeMenus(); update(); if (typeof oldFocus === 'function') oldFocus.call(input, e); };
      input.onblur = () => setTimeout(() => { if (activeMenu === menu) activeMenu = null; menu.classList.add('hidden'); }, 180);
      input.onkeydown = e => {
        const buttons = [...menu.querySelectorAll('button:not([data-related])')].filter(b => !menu.classList.contains('hidden'));
        if (e.key === 'ArrowDown' && buttons[0]) { e.preventDefault(); buttons[0].focus(); return; }
        if ((e.key === 'Tab' || e.key === 'ArrowRight') && hint && hint.textContent) {
          pick(hint.dataset.value || hint.textContent);
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const exact = values.find(v => norm(v.value) === qValue() || norm(v.label) === qValue());
          const first = exact?.value || buttons[0]?.dataset?.value || '';
          if (first && input.value !== first) {
            pick(first);
            return;
          }
          if (canOpenRelated()) openRelatedFromFilter(input.id);
          else input.dispatchEvent(new Event('change', { bubbles:true }));
        }
        if (e.key === 'Escape') { menu.classList.add('hidden'); if (hint) hint.textContent = ''; }
      };
      menu.onkeydown = e => {
        const buttons = [...menu.querySelectorAll('button')];
        const idx = buttons.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (buttons[idx+1] || buttons[0])?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (buttons[idx-1] || buttons[buttons.length-1])?.focus(); }
        if (e.key === 'Enter') {
          e.preventDefault();
          if (document.activeElement?.dataset?.related) openRelatedFromFilter(input.id);
          else pick(document.activeElement?.dataset?.value || document.activeElement?.textContent || '');
        }
        if (e.key === 'Escape') { menu.classList.add('hidden'); input.focus(); }
      };
    });
  }

  function bindLinkedLookups(){
    const linkCustomer = (codeId, nameId) => {
      const codeEl = $(codeId), nameEl = $(nameId);
      if (!codeEl || !nameEl) return;
      const fillByCode = () => {
        const c = customerByCode(codeEl.value.trim());
        if (c) { nameEl.value = c.name || ''; codeEl.value = c.code || codeEl.value; }
      };
      const fillByName = () => {
        const c = customerByName(nameEl.value.trim());
        if (c) { codeEl.value = c.code || ''; nameEl.value = c.name || nameEl.value; }
      };
      codeEl.addEventListener('input', fillByCode); codeEl.addEventListener('change', fillByCode);
      nameEl.addEventListener('input', fillByName); nameEl.addEventListener('change', fillByName);
      fillByCode(); fillByName();
    };
    const linkProduct = (skuId, nameId) => {
      const skuEl = $(skuId), nameEl = $(nameId);
      if (!skuEl || !nameEl) return;
      const fillBySku = () => {
        const p = product(skuEl.value.trim()) || findProductSmart(skuEl.value.trim());
        if (p) { nameEl.value = p.name || p.productName || ''; skuEl.value = p.sku || p.productCode || p.code || skuEl.value; }
      };
      const fillByName = () => {
        const p = productByName(nameEl.value.trim()) || findProductSmart(nameEl.value.trim());
        if (p) { skuEl.value = p.sku || p.productCode || p.code || ''; nameEl.value = p.name || p.productName || nameEl.value; }
      };
      skuEl.addEventListener('input', fillBySku); skuEl.addEventListener('change', fillBySku);
      nameEl.addEventListener('input', fillByName); nameEl.addEventListener('change', fillByName);
      fillBySku(); fillByName();
    };
    linkCustomer('cCode','cName');
    linkCustomer('oCustomerCode','oCustomerName');
    linkCustomer('salesCustomerCode','salesCustomerName');
    linkProduct('pSku','pName');
    linkProduct('oSku','oProductName');
    linkProduct('rSku','rName');
  }

  function bindImportButtons(){
    document.querySelectorAll('[data-import]').forEach(b => b.onclick = () => { if (requireCan('import:create','Không có quyền import Excel')) openImport(b.dataset.import); });
    document.querySelectorAll('[data-template]').forEach(b => b.onclick = () => Importer.downloadTemplate(b.dataset.template));
  }


// ===== 03-render-dashboard-product-stock.js =====
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


// ===== 04-receive-order-master-dms.js =====
  function renderReceive(){
    const from = $('receiveFromDate')?.value || today();
    const to = $('receiveToDate')?.value || today();
    const manualId = receiveDraftMeta.id || editingReceiptId || ('PN' + Date.now());
    const manualDate = receiveDraftMeta.date || today();
    const manualNote = receiveDraftMeta.note || '';
    const rows = db.receipts.slice().reverse().filter(r => inDateRange(r.date, from, to));
    const draftTotalQty = receiveDraftItems.reduce((a,x)=>a+num(x.qty),0);
    const draftTotal = receiveDraftItems.reduce((a,x)=>a+num(x.qty)*num(x.cost),0);
    $('receive').innerHTML = `<div class="card"><h3>Nhập kho</h3>
      <p class="muted">Quản lý phiếu nhập theo 3 mục: nhập lẻ, nhập Excel và danh sách đơn nhập. Phiếu đã ghi sổ sẽ bị khóa chỉnh sửa/xóa.</p>

      <div class="sub-card">
        <h4>1. Đơn nhập lẻ</h4>
        <div class="receive-split">
          <div class="receive-left receive-entry-panel">
            <div class="receive-entry-section">
              <div class="receive-section-title">Thông tin phiếu nhập</div>
              <div class="form receive-meta-form">
                <label>Mã phiếu nhập</label><input id="rId" placeholder="VD: PN001" value="${esc(manualId)}">
                <label>Ngày nhập</label><input id="rDate" type="date" value="${esc(manualDate)}">
                <label>Ghi chú</label><input id="rNote" placeholder="Ghi chú phiếu nhập" value="${esc(manualNote)}">
              </div>
            </div>
            <div class="receive-entry-section receive-product-entry">
              <div class="receive-section-title">Thông tin sản phẩm cần nhập</div>
              <div class="form receive-line-form">
                <label>Mã sản phẩm</label>${smartInput('rSku','Gõ mã sản phẩm hoặc ký tự trong tên sản phẩm','receiveSkuSuggest',suggestionValues('productSku'))}
                <label>Tên sản phẩm</label>${smartInput('rName','Gõ tên sản phẩm hoặc mã sản phẩm','receiveNameSuggest',suggestionValues('productName'))}
                <label>Số lượng nhập - thùng</label><input id="rQtyBox" type="number" min="0" placeholder="Thùng">
                <label>Số lượng nhập - lẻ</label><input id="rQtyLoose" type="number" min="0" placeholder="Lẻ">
                <label>Giá nhập</label><input id="rCost" type="number" min="0" placeholder="Giá nhập / đơn vị lẻ">
              </div>
              <p class="muted receive-tip">Gõ mã/tên sản phẩm để hiện gợi ý mờ. Chọn xong có thể bấm Enter hoặc nút xác nhận để đưa sản phẩm sang danh sách bên phải.</p>
              <div class="toolbar action-row">
                <button class="btn green" id="confirmReceiveLineBtn">Xác nhận</button>
                <button class="btn" id="clearReceiveDraftBtn">Làm mới</button>
              </div>
            </div>
          </div>
          <div class="receive-right">
            <h4>Danh sách sản phẩm nhập</h4>
            <div class="table-wrap"><table><thead><tr><th>STT</th><th>Mã SP</th><th>Tên SP</th><th>Thùng</th><th>Lẻ</th><th>Tổng lẻ</th><th>Giá nhập</th><th>Thành tiền</th><th></th></tr></thead><tbody id="receiveDraftBody">
              ${receiveDraftItems.map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.sku)}</td><td>${esc(it.name)}</td><td class="right">${num(it.boxQty)}</td><td class="right">${num(it.looseQty)}</td><td class="right">${num(it.qty)}</td><td class="right">${money(it.cost)}</td><td class="right">${money(num(it.qty)*num(it.cost))}</td><td><button class="btn danger" onclick="App.removeReceiveDraftItem(${i})">Xóa</button></td></tr>`).join('') || '<tr><td colspan="9" class="center muted">Chưa có sản phẩm nào được xác nhận</td></tr>'}
            </tbody></table></div>
            <div class="totals-line"><b>Tổng SL:</b> ${draftTotalQty} &nbsp; <b>Tổng tiền:</b> ${money(draftTotal)}</div>
            <div class="toolbar action-row"><button class="btn green" id="saveReceiveDraftBtn">Lưu phiếu nhập nháp</button></div>
          </div>
        </div>
      </div>

      <div class="sub-card">
        <h4>2. Nhập đơn từ Excel</h4>
        <p class="muted">Tải mẫu import hoặc import đơn nhập từ Excel. Sau import, phiếu vẫn ở trạng thái chưa ghi sổ để kiểm tra trước khi cộng tồn.</p>
        <div class="toolbar action-row">${importToolbar('receive')}</div>
      </div>

      <div class="sub-card">
        <h4>3. Danh sách đơn hàng đơn nhập</h4>
        <div class="form compact-form">
          <label>Từ ngày</label><input id="receiveFromDate" type="date" value="${esc(from)}">
          <label>Đến ngày</label><input id="receiveToDate" type="date" value="${esc(to)}">
        </div>
        <div class="toolbar action-row">
          <button class="btn blue" id="printSelectedReceiptsBtn">In gộp đơn nhập</button>
          <button class="btn" onclick="App.setAllChecks('receipt-check',true)">Chọn tất cả</button>
          <button class="btn" onclick="App.setAllChecks('receipt-check',false)">Bỏ chọn</button>
        </div>
        <div class="table-wrap"><table><thead><tr><th></th><th>Mã phiếu</th><th>Ngày</th><th>Trạng thái</th><th>Số dòng</th><th>Tổng SL</th><th>Tổng tiền</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><input type="checkbox" class="receipt-check" value="${esc(r.id)}"></td><td><b>${esc(r.id)}</b></td><td>${esc(r.date)}</td><td>${receiptPosted(r) ? '<span class="pill green">Đã ghi sổ</span>' : '<span class="pill orange">Chưa ghi sổ</span>'}</td><td class="right">${(r.items||[]).length}</td><td class="right">${receiptQty(r)}</td><td class="right">${money(receiptTotal(r))}</td><td>${esc(r.note||'')}</td><td class="actions"><button class="btn" onclick="App.printReceipt('${esc(r.id)}')">In</button>${receiptPosted(r) ? '' : `<button class="btn" onclick="App.editReceipt('${esc(r.id)}')">Chỉnh sửa</button><button class="btn danger" onclick="App.deleteReceipt('${esc(r.id)}')">Xóa</button><button class="btn green" onclick="App.postReceipt('${esc(r.id)}')">Ghi sổ</button>`}</td></tr>`).join('') || '<tr><td colspan="9" class="center muted">Chưa có đơn nhập trong khoảng ngày đã chọn</td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;
    $('confirmReceiveLineBtn').onclick = addReceiveDraftItem;
    $('saveReceiveDraftBtn').onclick = saveManualReceipt;
    $('clearReceiveDraftBtn').onclick = clearReceiveDraft;
    $('printSelectedReceiptsBtn').onclick = printSelectedReceipts;
    $('receiveFromDate').onchange = renderReceive;
    $('receiveToDate').onchange = renderReceive;
    ['rSku','rName'].forEach(id => $(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fillReceiveProduct(id === 'rName' ? 'name' : 'sku'); addReceiveDraftItem(); } }));
    ['rQtyBox','rQtyLoose','rCost'].forEach(id => $(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addReceiveDraftItem(); } }));
    $('rSku')?.addEventListener('input', () => fillReceiveProduct('sku'));
    $('rSku')?.addEventListener('change', () => fillReceiveProduct('sku'));
    $('rName')?.addEventListener('input', () => fillReceiveProduct('name'));
    $('rName')?.addEventListener('change', () => fillReceiveProduct('name'));
    setTimeout(bindGhostSuggestions, 0);
  }

  function receiptDetailMini(r){
    const items = (r.items || []).slice(0,4).map(it => `${esc(it.sku)} - ${esc(it.name || product(it.sku)?.name || '')}: ${num(it.qty)} x ${money(it.cost)}`).join('<br>');
    const more = (r.items || []).length > 4 ? `<br><span class="muted">+ ${(r.items||[]).length - 4} dòng khác</span>` : '';
    return `<div class="mini-lines">${items || '<span class="muted">Không có sản phẩm</span>'}${more}</div>`;
  }

  function bestReceiveProduct(){
    const skuVal = String($('rSku')?.value || '').trim();
    const nameVal = String($('rName')?.value || '').trim();
    return product(skuVal) || findProductSmart(skuVal) || productByName(nameVal) || findProductSmart(nameVal);
  }

  function productCostRef(p){
    if (!p) return '';
    const candidates = [p.costRef, p.cost, p.importPrice, p.purchasePrice, p.lastCost, p.avgCost];
    for (const c of candidates) {
      if (c !== undefined && c !== null && String(c).trim() !== '' && num(c) > 0) return Math.round(num(c));
    }
    return '';
  }

  function fillReceiveProduct(source='auto'){
    const p = bestReceiveProduct();
    if (!p) {
      if (source === 'sku' && $('rName')) $('rName').value = '';
      if (source === 'name' && $('rSku')) $('rSku').value = '';
      return null;
    }
    if ($('rSku')) $('rSku').value = p.sku || p.productCode || p.code || '';
    if ($('rName')) $('rName').value = p.name || p.productName || '';
    const refCost = productCostRef(p);
    if ($('rCost') && !$('rCost').value && refCost !== '') $('rCost').value = refCost;
    return p;
  }

  function addReceiveDraftItem(){
    const p = fillReceiveProduct();
    const sku = String($('rSku')?.value || '').trim();
    if (!sku) return toast('Thiếu mã sản phẩm');
    if (!p) return toast('Mã/tên sản phẩm chưa có trong danh mục: ' + sku);
    const pack = num(p.pack) || 1;
    const boxQty = num($('rQtyBox')?.value);
    const looseQty = num($('rQtyLoose')?.value);
    const qty = boxQty * pack + looseQty;
    const cost = Math.round(num($('rCost')?.value));
    if (qty <= 0) return toast('Số lượng nhập phải lớn hơn 0');
    if (cost < 0) return toast('Giá nhập không hợp lệ');
    const old = receiveDraftItems.find(x => String(x.sku) === String(sku) && num(x.cost) === cost);
    receiveDraftMeta = { id:String($('rId')?.value || '').trim(), date:$('rDate')?.value || today(), note:$('rNote')?.value || '' };
    if (old) { old.boxQty = num(old.boxQty) + boxQty; old.looseQty = num(old.looseQty) + looseQty; old.qty = num(old.qty) + qty; }
    else receiveDraftItems.push({ sku, name:p.name || '', pack, boxQty, looseQty, qty, cost });
    ['rSku','rName','rQtyBox','rQtyLoose','rCost'].forEach(id => { if ($(id)) $(id).value = ''; });
    renderReceive();
  }

  function removeReceiveDraftItem(index){
    receiveDraftItems.splice(index, 1);
    renderReceive();
  }

  function clearReceiveDraft(){
    editingReceiptId = '';
    receiveDraftMeta = { id:'', date:'', note:'' };
    receiveDraftItems = [];
    renderReceive();
  }

  function saveManualReceipt(){
    if (!requireCan('receive:edit','Không có quyền tạo/sửa phiếu nhập')) return;
    const id = String($('rId')?.value || '').trim() || ('PN' + Date.now());
    const old = db.receipts.find(r => r.id === id);
    if (old && receiptPosted(old)) return toast('Phiếu đã ghi sổ, không được chỉnh sửa');
    if (!receiveDraftItems.length) return toast('Chưa có sản phẩm nhập');
    const receipt = {
      id,
      date: $('rDate')?.value || today(),
      supplier: 'Unilever',
      note: $('rNote')?.value || '',
      posted: false,
      postedAt: '',
      items: receiveDraftItems.map(it => ({ sku:it.sku, name:it.name, pack:it.pack, qty:num(it.qty), cost:Math.round(num(it.cost)), boxQty:num(it.boxQty), looseQty:num(it.looseQty) }))
    };
    receipt.total = receiptTotal(receipt);
    if (old) Object.assign(old, receipt); else db.receipts.push(receipt);
    editingReceiptId = '';
    receiveDraftMeta = { id:'', date:'', note:'' };
    receiveDraftItems = [];
    save('Đã lưu phiếu nhập nháp');
  }

  function manualReceive(){
    addReceiveDraftItem();
  }

  function renderSingleOrder(){
    const orderId = $('oId')?.value || editingSingleOrderId || '';
    const orderDate = $('oDate')?.value || today();
    const customerCode = $('oCustomerCode')?.value || '';
    const customerName = $('oCustomerName')?.value || '';
    const staffCode = $('oStaffCode')?.value || '';
    const staffName = $('oStaffName')?.value || '';
    const note = $('oNote')?.value || '';
    const draftTotal = singleOrderDraftItems.reduce((a,it)=>a+num(it.qty)*num(it.sale),0);
    const totalBox = singleOrderDraftItems.reduce((a,it)=>a+num(it.boxQty),0);
    const totalLoose = singleOrderDraftItems.reduce((a,it)=>a+num(it.looseQty),0);
    $('singleOrder').innerHTML = `<div class="card single-order-card"><h3>Xuất đơn lẻ</h3>
      <p class="muted">Gõ từng ký tự để lọc gợi ý. Gợi ý sản phẩm hiển thị mã - tên - tồn kho; khách hàng hiển thị mã - tên - địa chỉ; nhân viên hiển thị mã - tên - SĐT.</p>
      <div class="sub-card">
        <h4>1. Xuất đơn trực tiếp</h4>
        <div class="single-order-layout">
          <div class="single-order-formcol">
            <div class="so-panel">
              <div class="so-panel-head"><b>Thông tin đơn hàng</b><span>Bắt buộc: cửa hàng, NVBH</span></div>
              <div class="so-grid so-order-info">
                <label class="so-field"><span>Mã đơn hàng</span><input id="oId" placeholder="Tự sinh nếu để trống" value="${esc(orderId)}"></label>
                <label class="so-field"><span>Ngày tạo đơn</span><input id="oDate" type="date" value="${esc(orderDate)}"></label>
                <label class="so-field so-wide"><span>Mã cửa hàng <b>*</b></span>${smartInput('oCustomerCode','Gõ mã/tên/địa chỉ khách hàng','orderCustomerCodeSuggest',orderCustomerSuggestions())}</label>
                <label class="so-field"><span>Tên khách hàng</span><input id="oCustomerName" placeholder="Tự lấy theo mã khách hàng" value="${esc(customerName)}" readonly></label>
                <label class="so-field so-wide"><span>Mã nhân viên bán hàng <b>*</b></span>${smartInput('oStaffCode','Gõ mã/tên/SĐT nhân viên','orderStaffCodeSuggest',orderStaffSuggestions())}</label>
                <label class="so-field"><span>Tên nhân viên bán hàng</span><input id="oStaffName" placeholder="Tự lấy theo mã nhân viên" value="${esc(staffName)}" readonly></label>
                <label class="so-field so-full"><span>Ghi chú</span><textarea id="oNote" rows="2" placeholder="Ghi chú đơn hàng">${esc(note)}</textarea></label>
              </div>
            </div>
            <div class="so-panel">
              <div class="so-panel-head"><b>Khai báo sản phẩm</b><span>Enter để đặt SP</span></div>
              <div class="so-grid so-product-info">
                <label class="so-field so-wide"><span>Mã sản phẩm <b>*</b></span>${smartInput('oSku','Gõ mã/tên sản phẩm','orderProductSkuSuggest',orderProductSuggestions())}</label>
                <label class="so-field"><span>Tên sản phẩm</span><input id="oProductName" placeholder="Tự động theo mã SP" readonly></label>
                <label class="so-field"><span>Quy cách</span><input id="oPack" type="number" min="1" placeholder="Quy cách/thùng"></label>
                <label class="so-field"><span>Giá bán</span><input id="oSale" type="number" min="0" placeholder="Giá bán / đơn vị lẻ"></label>
                <label class="so-field"><span>Số lượng - thùng</span><input id="oQtyBox" type="number" min="0" placeholder="0"></label>
                <label class="so-field"><span>Số lượng - lẻ</span><input id="oQtyLoose" type="number" min="0" placeholder="0"></label>
              </div>
              <div class="so-hint-line">Gợi ý sản phẩm gồm: <b>mã</b> - <b>tên</b> - <b>tồn kho</b>. Gõ “6”, “64”… danh sách tự lọc theo ký tự đang nhập.</div>
              <div class="so-actions"><button class="btn green" id="addSingleOrderItemBtn">Đặt SP (Enter)</button><button class="btn" id="clearSingleOrderBtn">Làm mới đơn</button></div>
            </div>
          </div>
          <div class="single-order-listcol">
            <div class="so-panel so-list-panel">
              <div class="so-panel-head"><b>Danh sách sản phẩm đã đặt</b><span>${singleOrderDraftItems.length} dòng</span></div>
              <div class="table-wrap"><table><thead><tr><th>STT</th><th>Mã SP</th><th>Tên SP</th><th>Quy cách</th><th>Thùng</th><th>Lẻ</th><th>Tổng lẻ</th><th>Giá bán</th><th>Thành tiền</th><th>Thao tác</th></tr></thead><tbody>
                ${singleOrderDraftItems.map((it,i)=>`<tr><td>${i+1}</td><td><b>${esc(it.sku)}</b></td><td>${esc(it.name)}</td><td class="right">${num(it.pack)}</td><td class="right">${num(it.boxQty)}</td><td class="right">${num(it.looseQty)}</td><td class="right">${num(it.qty)}</td><td class="right">${money(it.sale)}</td><td class="right"><b>${money(num(it.qty)*num(it.sale))}</b></td><td><button class="btn small" onclick="App.editSingleOrderItem(${i})">Sửa</button><button class="btn small red" onclick="App.removeSingleOrderItem(${i})">Xóa</button></td></tr>`).join('') || '<tr><td colspan="10" class="center muted">Chưa có sản phẩm nào được đặt</td></tr>'}
              </tbody></table></div>
              <div class="so-summary"><div><span>Tổng số lượng</span><b>Thùng: ${totalBox} | Lẻ: ${totalLoose}</b></div><div><span>Tổng tiền hàng</span><b>${money(draftTotal)}</b></div></div>
              <div class="so-actions so-save-row"><button class="btn red" id="clearListBtn">Xóa tất cả</button><button class="btn blue" id="saveSingleOrderBtn">Ghi đơn</button></div>
            </div>
          </div>
        </div>
      </div>
      <div class="sub-card">
        <h4>2. Import đơn con từ Excel</h4>
        <p class="muted">Đơn import là loại DMS. Nếu số lượng sản phẩm lớn hơn tồn kho, hệ thống tự import theo lượng tồn khả dụng và ghi phần thiếu vào báo cáo hàng thiếu.</p>
        <div class="toolbar action-row">${importToolbar('orders')}</div>
      </div>
      <div class="sub-card">
        <h4>3. Danh sách đơn con</h4>
        <p class="muted">Danh sách đơn con đầy đủ nằm ở menu Đơn hàng. Các đơn tạo/import từ đây sẽ tự nhảy sang danh sách bên đó để in, sửa, xóa hoặc gộp đơn tổng.</p>
        <div class="toolbar action-row"><button class="btn blue" onclick="App.setPage('orders')">Mở danh sách đơn con</button></div>
      </div>
    </div>`;
    setTimeout(() => {
      bindGhostSuggestions();
      $('addSingleOrderItemBtn').onclick = addSingleOrderItem;
      $('saveSingleOrderBtn').onclick = saveSingleOrderDraft;
      $('clearSingleOrderBtn').onclick = clearSingleOrderDraft;
      $('clearListBtn').onclick = () => { singleOrderDraftItems = []; renderSingleOrder(); };
      $('oCustomerCode')?.addEventListener('input', () => fillCustomerByCode('oCustomerCode','oCustomerName'));
      $('oStaffCode')?.addEventListener('input', () => fillStaffByCode('oStaffCode','oStaffName'));
      $('oSku')?.addEventListener('input', fillOrderProductBySku);
      ['oSku','oQtyBox','oQtyLoose','oSale'].forEach(id => $(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSingleOrderItem(); } }));
    }, 0);
  }

  function addSingleOrderItem(){
    const sku = $('oSku')?.value.trim();
    const p = product(sku) || productByName($('oProductName')?.value || '');
    if (!sku && !p) return toast('Chưa nhập mã sản phẩm');
    const finalSku = sku || p.sku;
    const finalProduct = product(finalSku) || p;
    if (!finalProduct) return toast('Mã sản phẩm chưa có trong danh mục');
    const pack = Math.max(1, num($('oPack')?.value) || num(finalProduct.pack) || 1);
    const boxQty = num($('oQtyBox')?.value);
    const looseQty = num($('oQtyLoose')?.value);
    const qty = boxQty * pack + looseQty;
    if (qty <= 0) return toast('Số lượng sản phẩm không hợp lệ');
    const sale = num($('oSale')?.value) || num(finalProduct.saleRef || finalProduct.sale || finalProduct.price || 0);
    const available = stockQty(finalSku);
    if (qty > available) return toast(`Không đủ tồn kho. Còn ${available} lẻ, cần ${qty}`);
    const old = singleOrderDraftItems.find(x => String(x.sku) === String(finalSku));
    const line = { sku:finalSku, name:finalProduct.name || $('oProductName')?.value || '', pack, boxQty, looseQty, qty, sale };
    if (old) Object.assign(old, line); else singleOrderDraftItems.push(line);
    ['oSku','oProductName','oPack','oSale','oQtyBox','oQtyLoose'].forEach(id => { if ($(id)) $(id).value = ''; });
    renderSingleOrder();
  }

  function removeSingleOrderItem(i){
    singleOrderDraftItems.splice(i,1);
    renderSingleOrder();
  }

  function editSingleOrderItem(i){
    const it = singleOrderDraftItems[i];
    if (!it) return;
    singleOrderDraftItems.splice(i,1);
    renderSingleOrder();
    setTimeout(() => {
      if ($('oSku')) $('oSku').value = it.sku;
      if ($('oProductName')) $('oProductName').value = it.name;
      if ($('oPack')) $('oPack').value = it.pack;
      if ($('oSale')) $('oSale').value = it.sale;
      if ($('oQtyBox')) $('oQtyBox').value = it.boxQty;
      if ($('oQtyLoose')) $('oQtyLoose').value = it.looseQty;
    }, 0);
  }

  function clearSingleOrderDraft(){
    if (!confirm('Làm mới đơn đang nhập?')) return;
    singleOrderDraftItems = [];
    editingSingleOrderId = '';
    renderSingleOrder();
  }

  function saveSingleOrderDraft(){
    if (!singleOrderDraftItems.length) return toast('Chưa có sản phẩm trong đơn');
    const customerCode = $('oCustomerCode')?.value.trim();
    if (!customerCode) return toast('Thiếu mã cửa hàng');
    const customer = customerByCode(customerCode);
    const staffCode = $('oStaffCode')?.value.trim();
    const staff = staffByCode(staffCode);
    const orderId = $('oId')?.value.trim() || ('DH' + Date.now());
    const old = db.orders.find(o => o.id === orderId);
    if (old && old.masterId) return toast('Đơn đã gộp đơn tổng, không nên sửa trực tiếp');
    if (old) {
      (old.items || []).forEach(it => {
        const st = stock(it.sku);
        st.qty += num(it.qty);
        st.updatedAt = nowIso();
      });
    }
    for (const it of singleOrderDraftItems) {
      const st = stock(it.sku);
      if (num(st.qty) < num(it.qty)) return toast(`Không đủ tồn kho cho ${it.sku}. Còn ${st.qty} lẻ, cần ${it.qty}`);
    }
    singleOrderDraftItems.forEach(it => {
      const st = stock(it.sku);
      st.qty -= num(it.qty);
      st.updatedAt = nowIso();
    });
    const order = {
      id: orderId,
      date: $('oDate')?.value || today(),
      isoDate: nowIso(),
      source: 'NVBH',
      note: $('oNote')?.value || 'Đơn NVBH',
      customerCode,
      customerName: $('oCustomerName')?.value.trim() || customer?.name || '',
      customerAddress: customerAddress(customerCode),
      customerPhone: customer?.phone || '',
      staffCode,
      staffName: $('oStaffName')?.value.trim() || staffDisplayName(staff),
      deliveryStatus: 'pending',
      workflowStatus: 'Chưa gộp đơn tổng',
      cashPaid: 0,
      bankPaid: 0,
      returnAmount: 0,
      items: singleOrderDraftItems.map(it => ({ sku:it.sku, name:it.name, pack:it.pack, qty:it.qty, boxQty:it.boxQty, looseQty:it.looseQty, sale:it.sale }))
    };
    if (old) Object.assign(old, recalcOrder(order)); else db.orders.push(recalcOrder(order));
    singleOrderDraftItems = [];
    editingSingleOrderId = '';
    save('Đã ghi đơn và chuyển sang danh sách đơn con');
  }

  function promoForSku(sku){
    return db.promotions.find(p => (!p.sku || String(p.sku) === String(sku)) && (!p.from || p.from <= today()) && (!p.to || p.to >= today()));
  }
  function createSingleOrder(){ return saveSingleOrderDraft(); }

  function orderTypeLabel(o){
    return o.source === 'DMS' ? 'DMS' : 'NVBH';
  }
  function orderMergeStatus(o){
    return o.masterId ? 'Đã gộp đơn tổng' : 'Chưa gộp đơn tổng';
  }
  function renderOrders(){
    const from = $('ordersFrom')?.value || today();
    const to = $('ordersTo')?.value || today();
    const staffQ = norm($('ordersStaffSearch')?.value || '');
    const customerQ = norm($('ordersCustomerSearch')?.value || '');
    const staffSuggest = uniq([...suggestionValues('salesStaff'), ...suggestionValues('deliveryStaff')]);
    const customerSuggest = suggestionValues('customer');
    const rows = db.orders.slice().reverse()
      .filter(o => inDateRange(o.date, from, to))
      .filter(o => searchMatch({staffCode:o.staffCode, staffName:o.staffName}, staffQ))
      .filter(o => searchMatch({customerCode:o.customerCode, customerName:o.customerName}, customerQ));
    $('orders').innerHTML = `<div class="card"><h3>Danh sách đơn con</h3>
      <p class="muted">Mặc định hiển thị đơn trong ngày. Đơn import Excel là loại DMS; đơn tạo trực tiếp hoặc từ app bán hàng là loại NVBH.</p>
      <div class="toolbar action-row">
        <button class="btn" onclick="App.setAllChecks('order-check',true)">Chọn tất cả</button>
        <button class="btn blue" id="printSelectedOrdersBtn">In đơn con</button>
        <button class="btn danger" id="deleteSelectedOrdersBtn">Xóa lựa chọn</button>
        <button class="btn" data-template="orders">Mẫu import</button>
        <button class="btn green" data-import="orders">Import đơn con từ Excel</button>
        <button class="btn" id="exportVnptBtn">Xuất file VNPT TT78</button>
      </div>
      <div class="filter-grid">
        ${filterField('Từ ngày', `<input id="ordersFrom" type="date" value="${esc(from)}">`)}
        ${filterField('Đến ngày', `<input id="ordersTo" type="date" value="${esc(to)}">`)}
        ${filterField('Mã NVBH / Tên NVBH', smartInput('ordersStaffSearch','Gõ mã hoặc tên nhân viên','ordersStaffSuggest',staffSuggest))}
        ${filterField('Mã cửa hàng / Tên cửa hàng', smartInput('ordersCustomerSearch','Gõ mã hoặc tên khách hàng','ordersCustomerSuggest',customerSuggest))}
      </div>
      <div class="table-wrap fixed-table"><table><thead><tr><th></th><th>Mã đơn</th><th>Mã NVBH</th><th>Tên NVBH</th><th>Mã cửa hàng</th><th>Tên cửa hàng</th><th>Giá trị đơn hàng</th><th>Loại đơn</th><th>Trạng thái đơn</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(o => `<tr><td><input type="checkbox" class="order-check" value="${esc(o.id)}"></td><td><b>${esc(o.id)}</b><br><span class="muted">${esc(o.date)}</span></td><td>${esc(o.staffCode || '')}</td><td>${esc(o.staffName || '')}</td><td>${esc(o.customerCode || '')}</td><td>${esc(o.customerName || '')}</td><td class="right"><b>${money(o.total)}</b></td><td><span class="pill">${esc(orderTypeLabel(o))}</span></td><td>${o.masterId ? '<span class="pill green">Đã gộp đơn tổng</span>' : '<span class="pill orange">Chưa gộp đơn tổng</span>'}</td><td class="actions"><button class="btn small" onclick="App.printOrder('${esc(o.id)}')">In</button><button class="btn small" onclick="App.editOrder('${esc(o.id)}')">Chỉnh sửa</button><button class="btn small red" onclick="App.deleteOrder('${esc(o.id)}')">Xóa</button></td></tr>`).join('') || '<tr><td colspan="10" class="center muted">Chưa có đơn con theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    $('exportVnptBtn').onclick = exportVnpt;
    $('printSelectedOrdersBtn').onclick = printSelectedOrders;
    $('deleteSelectedOrdersBtn').onclick = bulkDeleteOrders;
    ['ordersFrom','ordersTo'].forEach(id => $(id).onchange = renderOrders);
    ['ordersStaffSearch','ordersCustomerSearch'].forEach(id => $(id)?.addEventListener('input', () => debounceRender('orders', renderOrders, 250)));
    setTimeout(bindGhostSuggestions, 0);
  }

  function masterWarehouseSummary(orders){
    const wh = {};
    orders.forEach(o => (o.items || []).forEach(it => {
      const p = product(it.sku), w = p?.warehouse || 'Kho chính';
      wh[w] = wh[w] || { warehouse:w, lines:0, qty:0, total:0, items:{} };
      wh[w].lines += 1;
      wh[w].qty += num(it.qty);
      wh[w].total += num(it.qty) * num(it.sale);
      wh[w].items[it.sku] = wh[w].items[it.sku] || { sku:it.sku, name:p?.name || it.name, pack:p?.pack || it.pack, qty:0 };
      wh[w].items[it.sku].qty += num(it.qty);
    }));
    return Object.values(wh).sort((a,b)=>String(a.warehouse).localeCompare(String(b.warehouse)));
  }
  function renderWarehouseSummary(orders){
    const rows = masterWarehouseSummary(orders);
    return `<div class="table-wrap fixed-table"><table><thead><tr><th>Kho quản lý</th><th>Số dòng</th><th>Tổng SL lẻ</th><th>Giá trị hàng</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.warehouse)}</b></td><td class="right">${r.lines}</td><td class="right">${r.qty}</td><td class="right">${money(r.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="center muted">Chưa chọn đơn</td></tr>'}
    </tbody></table></div>`;
  }
  function selectedMasterOrders(){
    const ids = [...document.querySelectorAll('.merge-check:checked')].map(x => x.value);
    return db.orders.filter(o => ids.includes(o.id));
  }
  function renderMasterOrders(){
    const from = $('masterFrom')?.value || '';
    const to = $('masterTo')?.value || '';
    const orderQ = norm($('masterSearchOrder')?.value || '');
    const customerQ = norm($('masterSearchCustomer')?.value || '');
    const deliveryQ = norm($('masterSearchDelivery')?.value || '');
    const unmerged = db.orders.filter(o => !o.masterId && inDateRange(o.date, from, to))
      .filter(o => (!orderQ || norm(o.id).includes(orderQ)) && (!customerQ || searchMatch({customerCode:o.customerCode,customerName:o.customerName}, customerQ)) && (!deliveryQ || searchMatch({deliveryStaffCode:o.deliveryStaffCode,deliveryStaffName:o.deliveryStaffName}, deliveryQ)));
    const masters = db.masterOrders.slice().reverse().filter(m => inDateRange(m.exportTime || m.date, from, to))
      .filter(m => (!orderQ || norm(m.id).includes(orderQ)) && (!deliveryQ || searchMatch({deliveryStaffCode:m.deliveryStaffCode,deliveryStaffName:m.deliveryStaffName}, deliveryQ)));
    $('masterOrders').innerHTML = `<div class="card fixed-card"><h3>Đơn tổng chuẩn kho</h3>
      <p class="muted">Mặc định hiển thị trong ngày. Gộp nhiều đơn tổng để in chỉ render phiếu in, không lưu thêm dữ liệu.</p>
      ${renderConfiguredFilters('masterOrders')}
      <div class="toolbar action-row">${bulkToolbar('master-check',null,'bulkDeleteMasters','<input id="masterDeliveryCode" list="deliveryStaffSuggest" placeholder="Mã NV giao hàng"><input id="masterDeliveryName" list="deliveryStaffSuggest" placeholder="Tên NV giao hàng"><input id="masterExportTime" type="datetime-local"><button class="btn green" id="createMasterBtn">Tạo đơn tổng từ đơn đang chọn</button><button class="btn" id="printTempMasterBtn">In tạm đơn tổng đã chọn</button><button class="btn blue" id="printSelectedMastersBtn">In gộp nhiều đơn tổng</button>')}</div>${dataList('deliveryStaffSuggest', suggestionValues('deliveryStaff'))}
      <div class="layout2 fixed-layout"><div><h4>Đơn con chưa gộp</h4><div class="table-wrap fixed-table"><table><thead><tr><th></th><th>Mã đơn</th><th>Nguồn</th><th>Khách</th><th>Tổng</th></tr></thead><tbody>
      ${unmerged.map(o => `<tr><td><input type="checkbox" class="merge-check" value="${esc(o.id)}"></td><td>${esc(o.id)}</td><td>${esc(o.source)}</td><td>${esc(o.customerName)}</td><td class="right">${money(o.total)}</td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Không có đơn theo bộ lọc</td></tr>'}
      </tbody></table></div><h4>Tổng hợp kho của đơn đang chọn</h4><div id="masterWarehousePreview">${renderWarehouseSummary([])}</div></div><div><h4>Danh sách đơn tổng</h4><div class="table-wrap fixed-table"><table><thead><tr><th></th><th>Mã</th><th>Ngày giờ xuất</th><th>NV giao hàng</th><th>Số đơn</th><th>Tổng</th><th>Thao tác</th></tr></thead><tbody>
      ${masters.map(m => `<tr><td><input type="checkbox" class="master-check" value="${esc(m.id)}"></td><td>${esc(m.id)}</td><td>${esc(String(m.exportTime || m.date).slice(0,19).replace('T',' '))}</td><td>${esc(m.deliveryStaffName || m.deliveryStaffCode || '')}</td><td class="right">${(m.childIds||[]).length}</td><td class="right">${money(m.total)}</td><td><button class="btn small" onclick="App.printMaster('${esc(m.id)}')">In</button><button class="btn small" onclick="App.editMaster('${esc(m.id)}')">Sửa</button><button class="btn small red" onclick="App.deleteMaster('${esc(m.id)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có đơn tổng theo bộ lọc</td></tr>'}
      </tbody></table></div></div></div></div>`;
    $('createMasterBtn').onclick = createMaster;
    $('printTempMasterBtn').onclick = () => printMaster(null, true);
    $('printSelectedMastersBtn').onclick = printSelectedMasters;
    bindConfiguredFilterEvents('masterOrders', renderMasterOrders, 250);
    document.querySelectorAll('.merge-check').forEach(x => x.onchange = () => { $('masterWarehousePreview').innerHTML = renderWarehouseSummary(selectedMasterOrders()); });
  }
  function createMaster(){
    const ids = [...document.querySelectorAll('.merge-check:checked')].map(x => x.value);
    if (!ids.length) return toast('Chưa chọn đơn con');
    const orders = db.orders.filter(o => ids.includes(o.id));
    const id = 'DT' + Date.now();
    const total = orders.reduce((a,o)=>a+num(o.total),0);
    const warehouseSummary = masterWarehouseSummary(orders).map(w => ({ warehouse:w.warehouse, lines:w.lines, qty:w.qty, total:w.total }));
    orders.forEach(o => o.masterId = id);
    db.masterOrders.push({ id, date: nowIso(), exportTime: $('masterExportTime')?.value || nowIso(), deliveryStaffCode: $('masterDeliveryCode')?.value.trim() || '', deliveryStaffName: $('masterDeliveryName')?.value.trim() || '', childIds: ids, total, warehouseSummary });
    save('Đã tạo đơn tổng chuẩn kho');
  }

  function renderDmsOrders(){
    const compare = dmsCompareRows();
    $('dmsOrders').innerHTML = `<div class="card"><h3>Đơn từ DMS</h3>
      <p class="muted">Đơn DMS lấy giá bán từ file import. Tồn DMS dùng để tính chênh lệch mở bán trên app bán hàng.</p>
      <div class="toolbar"><button class="btn green" data-import="dmsAuto">Import Excel DMS</button><button class="btn" data-template="dmsAuto">Tải mẫu import DMS</button></div>
      <h4>So sánh tồn DMS / tồn thực tế</h4>
      <div class="table-wrap fixed-table"><table><thead><tr><th>Kho</th><th>SKU</th><th>Tên</th><th>Tồn thực tế</th><th>Tồn DMS</th><th>Chênh DMS-Thực</th><th>Mở bán</th><th>Cảnh báo</th></tr></thead><tbody>
      ${compare.map(r => `<tr><td>${esc(r.warehouse)}</td><td><b>${esc(r.sku)}</b></td><td>${esc(r.name)}</td><td class="right">${r.real}</td><td class="right">${r.dms}</td><td class="right">${r.diff}</td><td class="right"><b>${r.open}</b></td><td>${r.diff>0?'<span class="pill red">Báo kế toán chấm ra</span>':(r.open>0?'<span class="pill green">Được mở bán</span>':'<span class="pill">Khớp/không mở</span>')}</td></tr>`).join('') || '<tr><td colspan="8" class="center muted">Chưa có dữ liệu tồn</td></tr>'}
      </tbody></table></div>
      <h4>Danh sách đơn DMS đã import</h4>
      <div class="table-wrap"><table><thead><tr><th>Mã DMS</th><th>Ngày</th><th>Khách</th><th>Dòng</th><th>Tổng</th></tr></thead><tbody>
      ${db.orders.filter(o=>o.source==='DMS').slice().reverse().map(o=>`<tr><td><b>${esc(o.id)}</b></td><td>${esc(o.date)}</td><td>${esc(o.customerName)}</td><td class="right">${(o.items||[]).length}</td><td class="right">${money(o.total)}</td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Chưa có đơn DMS</td></tr>'}
      </tbody></table></div></div>`;
  }


// ===== 05-customer-promo-report-mobile-debt-cash-account.js =====
  function renderCustomers(){
    const codeQ = norm($('customerSearchCode')?.value || '');
    const nameQ = norm($('customerSearchName')?.value || '');
    const phoneQ = norm($('customerSearchPhone')?.value || '');
    const addressQ = norm($('customerSearchAddress')?.value || '');
    const rows = db.customers.filter(c =>
      (!codeQ || norm(c.code).includes(codeQ)) &&
      (!nameQ || norm(c.name).includes(nameQ)) &&
      (!phoneQ || norm(c.phone).includes(phoneQ)) &&
      (!addressQ || norm(c.address).includes(addressQ))
    );
    $('customers').innerHTML = `<div class="card"><h3>Khách hàng</h3>
      <div class="form">${smartInput('cCode','Mã KH','customerCodeSuggest',suggestionValues('customerCode'))}${smartInput('cName','Tên KH','customerNameSuggest',suggestionValues('customerName'))}<input id="cPhone" placeholder="SĐT"><input id="cAddress" placeholder="Địa chỉ"><input id="cTax" placeholder="MST"><input id="cGroup" placeholder="Nhóm KH"></div>
      ${renderConfiguredFilters('customers')}
      <div class="toolbar action-row">${importToolbar('customers')}<button class="btn green" id="saveCustomerBtn">Lưu khách hàng</button>${bulkToolbar('customer-check',null,'bulkDeleteCustomers')}</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Mã</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th>Nhóm</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(c => `<tr><td><input type="checkbox" class="customer-check" value="${esc(c.code)}"></td><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td>${esc(c.group)}</td><td><button class="btn small" onclick="App.editCustomer('${esc(c.code)}')">Sửa</button><button class="btn small red" onclick="App.deleteCustomer('${esc(c.code)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có khách hàng theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('customers', renderCustomers, 200);
    $('saveCustomerBtn').onclick = () => {
      const c = { code:$('cCode').value.trim(), name:$('cName').value.trim(), phone:$('cPhone').value.trim(), address:$('cAddress').value.trim(), tax:$('cTax').value.trim(), group:$('cGroup').value.trim() };
      if (!c.code || !c.name) return toast('Thiếu mã hoặc tên KH');
      const old = db.customers.find(x => x.code === c.code);
      old ? Object.assign(old,c) : db.customers.push(c);
      save('Đã lưu khách hàng');
    };
  }

  function renderPromotions(){
    const codeQ = norm($('promoSearchCode')?.value || '');
    const skuQ = norm($('promoSearchSku')?.value || '');
    const typeQ = norm($('promoSearchType')?.value || '');
    const dateQ = $('promoSearchDate')?.value || '';
    const rows = db.promotions.map((p,i)=>({...p,__i:i})).filter(p => (!codeQ || searchMatch({code:p.code,name:p.name}, codeQ)) && (!skuQ || searchMatch({sku:p.sku,name:p.name}, skuQ)) && (!typeQ || norm(p.type).includes(typeQ)) && (!dateQ || ((!p.from || p.from <= dateQ) && (!p.to || p.to >= dateQ))));
    $('promotions').innerHTML = `<div class="card"><h3>Khuyến mại</h3>
      <p class="muted">Khuyến mại dùng để tính giá/chiết khấu cho đơn từ NVBH và hiển thị thưởng trưng bày cho giao hàng.</p>
      ${renderConfiguredFilters('promotions')}
      <div class="toolbar action-row">${importToolbar('promotions')}${bulkToolbar('promo-check',null,'bulkDeletePromotions')}</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Mã CTKM</th><th>Tên</th><th>SKU</th><th>Loại</th><th>Giá trị/CK</th><th>Thưởng trưng bày</th><th>Coupon</th><th>Ontop</th><th>Hiệu lực</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><input type="checkbox" class="promo-check" value="${p.__i}"></td><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${esc(p.sku)}</td><td>${esc(p.type)}</td><td class="right">${money(p.value)}</td><td class="right">${money(p.displayReward)}</td><td>${esc(p.coupon)}</td><td>${esc(p.ontop)}</td><td>${esc(p.from)} → ${esc(p.to)}</td><td><button class="btn small" onclick="App.editPromotion(${p.__i})">Sửa</button><button class="btn small red" onclick="App.deletePromotion(${p.__i})">Xoá</button></td></tr>`).join('') || '<tr><td colspan="11" class="center muted">Chưa có khuyến mại theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('promotions', renderPromotions, 250);
  }

  function renderReports(){
    const d = $('reportDate')?.value || today();
    const dayOrders = db.orders.filter(o => sameDay(o.date, d));
    const cash = dayOrders.reduce((a,o)=>a+num(o.cashPaid),0);
    const bank = dayOrders.reduce((a,o)=>a+num(o.bankPaid),0);
    const ret = dayOrders.reduce((a,o)=>a+num(o.returnAmount),0);
    const debt = dayOrders.reduce((a,o)=>a+num(o.debt),0);
    const receipts = db.receipts.filter(r => sameDay(r.date, d));
    $('reports').innerHTML = `<div class="card"><h3>Báo cáo</h3>${dateFilter('report')}
      <div class="grid"><div class="stat"><b>${dayOrders.length}</b><br>Đơn hàng</div><div class="stat"><b>${money(cash)}</b><br>Tiền mặt</div><div class="stat"><b>${money(bank)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(ret)}</b><br>Hàng trả về</div><div class="stat"><b>${money(debt)}</b><br>Công nợ</div><div class="stat"><b>${receipts.length}</b><br>Phiếu nhập</div></div>
      <h4>Báo cáo theo nhân viên bán hàng</h4>${staffReport(dayOrders,'staffCode','staffName')}
      <h4>Báo cáo theo nhân viên giao hàng</h4>${staffReport(dayOrders,'deliveryStaffCode','deliveryStaffName')}
      <h4>Báo cáo hàng thiếu do import đơn hàng</h4>${shortageReport(d)}</div>`;
    $('reportDate').onchange = renderReports;
  }
  function shortageReport(day){
    const rows = (db.stockShortages || []).filter(x => sameDay(x.date, day)).slice().reverse();
    const total = rows.reduce((a,x)=>a+num(x.shortageQty),0);
    return `<p class="muted">Tổng lượng bị loại trong ngày: <b>${total}</b> lẻ. Phần này chưa được import vào đơn, dùng để kế toán/kho theo dõi và xử lý.</p>
      <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Nguồn</th><th>Mã đơn</th><th>SKU</th><th>Tên hàng</th><th>Khách</th><th>Cần</th><th>Đã import</th><th>Thiếu</th><th>Tồn khả dụng lúc import</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(String(x.date||'').slice(0,19).replace('T',' '))}</td><td>${esc(x.source)}</td><td>${esc(x.orderId)}</td><td>${esc(x.sku)}</td><td>${esc(x.name)}</td><td>${esc(x.customerName || x.customerCode)}</td><td class="right">${num(x.requestedQty)}</td><td class="right">${num(x.importedQty)}</td><td class="right"><b>${num(x.shortageQty)}</b></td><td class="right">${num(x.availableAtImport)}</td></tr>`).join('') || '<tr><td colspan="10" class="center muted">Không có hàng thiếu do import trong ngày</td></tr>'}
      </tbody></table></div>`;
  }

  function staffReport(rows, codeKey, nameKey){
    const map = {};
    rows.forEach(o => {
      const k = o[codeKey] || o[nameKey] || 'Chưa gán';
      map[k] = map[k] || { code:k, name:o[nameKey]||'', orders:0, total:0, debt:0, cash:0, bank:0 };
      map[k].orders++; map[k].total += num(o.total); map[k].debt += num(o.debt); map[k].cash += num(o.cashPaid); map[k].bank += num(o.bankPaid);
    });
    const rs = Object.values(map);
    return `<div class="table-wrap"><table><thead><tr><th>Mã/Tên</th><th>Số đơn</th><th>Tổng</th><th>Tiền mặt</th><th>Chuyển khoản</th><th>Công nợ</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(r.code)} ${esc(r.name)}</td><td class="right">${r.orders}</td><td class="right">${money(r.total)}</td><td class="right">${money(r.cash)}</td><td class="right">${money(r.bank)}</td><td class="right">${money(r.debt)}</td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Không có dữ liệu</td></tr>'}</tbody></table></div>`;
  }

  function renderSalesApp(){
    const allowed = db.stocks.map(s => ({ s, p: product(s.sku), open: openSellableQty(s.sku) })).filter(x => x.open > 0 && x.p);
    $('salesApp').innerHTML = `<div class="mobile-shell sales-ui"><div class="mobile-top"><h3>App bán hàng</h3><button class="btn btn-icon red" title="Thoát" onclick="API.logout();location.reload()">⎋</button></div>
      <p class="muted">Ưu tiên gõ nhanh: Tab/→ để lấy gợi ý mờ, Enter để xác nhận ô tìm.</p>
      <div class="form sales-form">${smartInput('salesCustomerCode','Mã KH','salesCustomerCodeSuggest',suggestionValues('customerCode'))}${smartInput('salesCustomerName','Tên KH','salesCustomerNameSuggest',suggestionValues('customerName'))}${smartInput('salesStaffCode','Mã NV bán hàng','salesStaffSuggest',suggestionValues('salesStaff'))}</div>
      ${allowed.map(({s,p,open}) => `<div class="mobile-card sales-product-card"><div class="product-head"><b>${esc(s.sku)}</b><span>${esc(p.warehouse)}</span></div><div class="product-name">${esc(p.name)}</div><div class="product-meta"><span>Tồn: <b>${qtyView(open,p.pack)}</b></span><span>Giá: <b>${money(p.saleRef)}</b></span></div><div class="qty-row"><label>Thùng<input id="saleCase_${esc(s.sku)}" type="number" inputmode="numeric" placeholder="0"></label><label>Lẻ<input id="saleLoose_${esc(s.sku)}" type="number" inputmode="numeric" placeholder="0"></label><button class="btn green send-btn" title="Gửi đơn" onclick="App.salesCreateOrder('${esc(s.sku)}')">Gửi</button></div></div>`).join('') || '<p class="muted">Chưa có hàng mở bán</p>'}
      <h4>Đơn đã chấm chưa gộp đơn tổng</h4>${salesOrderCards()}
      <h4>Công nợ khách hàng</h4>${debtTable(db.orders.filter(o => o.debt > 0 && (!API.user?.code || o.staffCode === API.user.code)))}</div>`;
    if ($('salesStaffCode') && !$('salesStaffCode').value) $('salesStaffCode').value = API.user?.code || '';
  }


  function salesOrderCards(){
    const userCode = API.user?.code || '';
    const rows = db.orders.filter(o => !o.masterId && (o.source === 'NVBH' || o.source === 'APP') && (!userCode || !o.staffCode || o.staffCode === userCode)).slice().reverse().slice(0, 50);
    return rows.map(o => `<div class="mobile-card"><b>${esc(o.id)}</b> · ${esc(o.date)}<br>${esc(o.customerName || o.customerCode)}<br>Tổng: ${money(o.total)} · Còn nợ: <b>${money(o.debt)}</b><br>Trạng thái: ${esc(o.workflowStatus || 'Chờ giao')}</div>`).join('') || '<p class="muted">Chưa có đơn con chưa gộp</p>';
  }

  function deliveryCollectCard(o, label){
    return `<div class="mobile-card"><b>${esc(o.id)}</b> · ${esc(label || o.date)}<br>${esc(o.customerName||o.customerCode)}<br>
      Tổng: ${money(o.total)} · Đã ghi nhận: ${money(orderPaid(o))} · Còn nợ: <b>${money(o.debt)}</b><br>
      Thưởng TB: ${money(o.displayReward)} · Trạng thái: ${esc(o.workflowStatus)}
      <div class="form"><input id="cash_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Tiền mặt thu được"><input id="bank_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Chuyển khoản"><input id="ret_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Hàng trả về"><input id="reward_${esc(o.id)}" type="number" inputmode="numeric" placeholder="Tiền trả thưởng trưng bày"></div>
      <button class="btn green" onclick="App.driverCollect('${esc(o.id)}')">Xác nhận giao / thu</button></div>`;
  }
  function renderDeliveryApp(){
    const userCode = API.user?.code || '';
    const pendingOrders = db.orders.filter(o => !o.delivered && (!userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode));
    const debtOrders = db.orders.filter(o => o.debt > 0 && o.delivered && (!userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode));
    const scopeOrders = db.orders.filter(o => !userCode || !o.deliveryStaffCode || o.deliveryStaffCode === userCode);
    const cash = scopeOrders.reduce((a,o)=>a+num(o.cashPaid),0), bank = scopeOrders.reduce((a,o)=>a+num(o.bankPaid),0), ret = scopeOrders.reduce((a,o)=>a+num(o.returnAmount),0), debt = scopeOrders.reduce((a,o)=>a+num(o.debt),0);
    $('deliveryApp').innerHTML = `<div class="mobile-shell"><h3>App giao hàng</h3><button class="btn red" onclick="API.logout();location.reload()">Thoát</button>
      <div class="scroll-tabs"><button class="btn">Đơn nay giao</button><button class="btn">Đơn nợ</button><button class="btn">Báo cáo</button></div>
      <div class="grid"><div class="stat"><b>${money(cash)}</b><br>Tiền mặt</div><div class="stat"><b>${money(bank)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(ret)}</b><br>Hàng trả về</div><div class="stat"><b>${money(debt)}</b><br>Công nợ</div></div>
      <h4>Đơn nay giao</h4>${pendingOrders.slice(0,50).map(o=>deliveryCollectCard(o, 'Ngày ghi đơn: ' + o.date)).join('') || '<p class="muted">Chưa có đơn giao</p>'}
      <h4>Đơn nợ đã giao</h4>${debtOrders.map(o => deliveryCollectCard(o, 'Ngày ghi đơn: ' + o.date)).join('') || '<p class="muted">Không có đơn nợ đã giao</p>'}</div>`;
  }

  function renderDebts(){
    const from = $('debtFrom')?.value || '';
    const to = $('debtTo')?.value || '';
    const orderQ = norm($('debtSearchOrder')?.value || '');
    const customerQ = norm($('debtSearchCustomer')?.value || '');
    const salesQ = norm($('debtSearchSales')?.value || '');
    const deliveryQ = norm($('debtSearchDelivery')?.value || '');
    const inSearch = x => (!orderQ || norm(x.id || x.orderId || '').includes(orderQ)) && (!customerQ || searchMatch({customerCode:x.customerCode, customerName:x.customerName}, customerQ)) && (!salesQ || searchMatch({staffCode:x.staffCode, staffName:x.staffName}, salesQ)) && (!deliveryQ || searchMatch({deliveryStaffCode:x.deliveryStaffCode, deliveryStaffName:x.deliveryStaffName}, deliveryQ));
    const ledger = (Array.isArray(db.debtLedger) ? db.debtLedger : []).filter(x => inDateRange(x.date, from, to) && inSearch(x));
    const rows = db.orders.filter(o => num(o.debt) > 0 && inDateRange(o.date, from, to) && inSearch({id:o.id,date:o.date,deliveryStaffCode:o.deliveryStaffCode,deliveryStaffName:o.deliveryStaffName,staffCode:o.staffCode,staffName:o.staffName,customerCode:o.customerCode,customerName:o.customerName,total:o.total,paid:orderPaid(o),debt:o.debt,status:o.paymentStatus}));
    const beforeRows = db.orders.filter(o => String(o.date || '').slice(0,10) < from && inSearch(o));
    const openingDebt = beforeRows.reduce((a,o)=>a+num(o.debt),0);
    const inc = ledger.filter(x => x.direction === 'INCREASE').reduce((a,x)=>a+num(x.amount),0) || rows.reduce((a,o)=>a+num(o.total),0);
    const dec = ledger.filter(x => x.direction !== 'INCREASE').reduce((a,x)=>a+num(x.amount),0) || rows.reduce((a,o)=>a+orderPaid(o),0);
    const totalDebt = rows.reduce((a,o)=>a+num(o.debt),0);
    $('debts').innerHTML = `<div class="card"><h3>Công nợ đối soát chi tiết</h3>
      ${renderConfiguredFilters('debts')}
      <div class="grid"><div class="stat"><b>${money(openingDebt)}</b><br>Số dư trước kỳ</div><div class="stat"><b>${money(inc)}</b><br>Phát sinh trong kỳ</div><div class="stat"><b>${money(dec)}</b><br>Đã thu/cấn trừ</div><div class="stat"><b>${money(totalDebt)}</b><br>Còn nợ theo lọc</div><div class="stat"><b>${rows.length}</b><br>Đơn còn nợ</div></div>
      <p class="muted">Mặc định hiển thị ngày hiện tại. Khi cần xem nhiều ngày, chỉnh từ ngày/đến ngày để tránh lag.</p>
      <h4>Đơn còn nợ theo bộ lọc</h4>${debtTable(rows)}
      <h4>Sổ cái theo bộ lọc</h4>${ledgerTable(ledger)}</div>`;
    bindConfiguredFilterEvents('debts', renderDebts, 350);
  }

  function ledgerTable(rows){
    return `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Loại</th><th>Đơn</th><th>Ngày ghi đơn</th><th>NV giao hàng</th><th>NV bán hàng</th><th>Mã KH</th><th>Tên KH</th><th>Chiều</th><th>Số tiền</th><th>Ghi chú</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(String(x.date||'').slice(0,19).replace('T',' '))}</td><td>${esc(x.type)}</td><td>${esc(x.orderId)}</td><td>${esc(x.orderDate || '')}</td><td>${esc(x.deliveryStaffName || x.deliveryStaffCode || '')}</td><td>${esc(x.staffName || x.staffCode || '')}</td><td>${esc(x.customerCode || '')}</td><td>${esc(x.customerName || '')}</td><td>${esc(x.direction)}</td><td class="right">${money(x.amount)}</td><td>${esc(x.note)}</td></tr>`).join('') || '<tr><td colspan="11" class="center muted">Chưa có dòng sổ cái theo bộ lọc</td></tr>'}
    </tbody></table></div>`;
  }
  function debtTable(rows){
    return `${bulkToolbar('debt-check',null,'bulkDeleteDebts')}<div class="table-wrap"><table><thead><tr><th></th><th>Đơn</th><th>Ngày ghi đơn</th><th>Nhân viên giao hàng</th><th>Nhân viên bán hàng</th><th>Mã khách hàng</th><th>Tên khách hàng</th><th>Tổng</th><th>Đã thu/hàng trả</th><th>Còn nợ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    ${rows.map(o => `<tr><td><input type="checkbox" class="debt-check" value="${esc(o.id)}"></td><td>${esc(o.id)}</td><td>${esc(o.date)}</td><td>${esc(o.deliveryStaffName || o.deliveryStaffCode || '')}</td><td>${esc(o.staffName || o.staffCode || '')}</td><td>${esc(o.customerCode || '')}</td><td>${esc(o.customerName || '')}</td><td class="right">${money(o.total)}</td><td class="right">${money(orderPaid(o))}</td><td class="right"><b>${money(o.debt)}</b></td><td>${esc(o.paymentStatus)}</td><td><button class="btn small" onclick="App.editOrder('${esc(o.id)}')">Sửa</button><button class="btn small green" onclick="App.settleDebt('${esc(o.id)}')">Tất toán</button></td></tr>`).join('') || '<tr><td colspan="12" class="center muted">Không có công nợ theo bộ lọc</td></tr>'}
    </tbody></table></div>`;
  }

  function renderCashFund(){
    const d = $('fundDate')?.value || '';
    const typeQ = norm($('fundSearchType')?.value || '');
    const noteQ = norm($('fundSearchNote')?.value || '');
    const userQ = norm($('fundSearchUser')?.value || '');
    const rows = db.cashFund.filter(x => (!d || sameDay(x.date, d)) && (!typeQ || norm(x.type).includes(typeQ)) && (!noteQ || norm(x.note).includes(noteQ)) && (!userQ || norm(x.user).includes(userQ))).slice().reverse();
    const beforeRows = d ? db.cashFund.filter(x => String(x.date || '').slice(0,10) < d) : [];
    const calcBalance = arr => arr.reduce((a,x)=> a + (x.type === 'thu' || x.type === 'chuyen_khoan' ? num(x.amount) : -num(x.amount)), 0);
    const tonDau = calcBalance(beforeRows);
    const thu = rows.filter(x => x.type === 'thu').reduce((a,x)=>a+num(x.amount),0);
    const ck = rows.filter(x => x.type === 'chuyen_khoan').reduce((a,x)=>a+num(x.amount),0);
    const chi = rows.filter(x => x.type === 'chi').reduce((a,x)=>a+num(x.amount),0);
    const nop = rows.filter(x => x.type === 'nop_ngan_hang').reduce((a,x)=>a+num(x.amount),0);
    const tonCuoi = tonDau + thu + ck - chi - nop;
    const auditRows = (db.auditLogs || []).filter(x => (!d || sameDay(x.date, d)) && (!typeQ || norm(x.action).includes(typeQ)) && (!noteQ || searchMatch(x, noteQ)) && (!userQ || norm(x.user).includes(userQ))).slice().reverse().slice(0,80);
    $('cashFund').innerHTML = `<div class="card"><h3>Quỹ tiền</h3>
      ${renderConfiguredFilters('cashFund')}
      <p class="muted">Báo cáo quỹ theo ngày: tồn đầu ngày → thu → chi → nộp công ty/ngân hàng → tồn cuối ngày.</p>
      <div class="grid"><div class="stat"><b>${money(tonDau)}</b><br>Tồn đầu ngày</div><div class="stat"><b>${money(thu)}</b><br>Thu tiền mặt</div><div class="stat"><b>${money(ck)}</b><br>Chuyển khoản</div><div class="stat"><b>${money(chi)}</b><br>Chi trong ngày</div><div class="stat"><b>${money(nop)}</b><br>Nộp công ty/NH</div><div class="stat"><b>${money(tonCuoi)}</b><br>Tồn cuối ngày</div></div>
      <div class="form"><select id="fundType"><option value="thu">Thu</option><option value="chi">Chi</option><option value="nop_ngan_hang">Nộp công ty/NH</option><option value="chuyen_khoan">Chuyển khoản</option></select><input id="fundAmount" type="number" placeholder="Số tiền"><input id="fundNote" placeholder="Nội dung"></div>
      <div class="toolbar action-row"><button class="btn green" id="saveFundBtn">Ghi quỹ</button>${bulkToolbar('fund-check',null,'bulkDeleteFunds')}</div>
      <h4>Sổ quỹ chi tiết</h4><div class="table-wrap"><table><thead><tr><th></th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th>Nội dung</th><th>Thao tác</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td><input type="checkbox" class="fund-check" value="${esc(x.id)}"></td><td>${esc(String(x.date).slice(0,19).replace('T',' '))}</td><td>${esc(x.type)}</td><td class="right">${money(x.amount)}</td><td>${esc(x.note)}</td><td><button class="btn small" onclick="App.editFund('${esc(x.id)}')">Sửa</button><button class="btn small red" onclick="App.deleteFund('${esc(x.id)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Chưa có giao dịch quỹ theo bộ lọc</td></tr>'}
      </tbody></table></div>
      <h4>Audit log trong ngày</h4><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người sửa</th><th>Vai trò</th><th>Hành động</th><th>Chi tiết</th><th>Trước</th><th>Sau</th></tr></thead><tbody>
      ${auditRows.map(a => `<tr><td>${esc(String(a.date).slice(0,19).replace('T',' '))}</td><td>${esc(a.user)}</td><td>${esc(a.role||'')}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td><td class="small-text">${esc(String(a.before||'').slice(0,160))}</td><td class="small-text">${esc(String(a.after||'').slice(0,160))}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Chưa có lịch sử thao tác theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    $('fundDate').onchange = renderCashFund;
    bindConfiguredFilterEvents('cashFund', renderCashFund, 250);
    $('saveFundBtn').onclick = () => {
      if (!requireCan('fund:create','Không có quyền ghi quỹ tiền')) return;
      const amount = num($('fundAmount').value);
      if (amount <= 0) return toast('Nhập số tiền');
      const row = { id:'Q'+Date.now(), date:nowIso(), type:$('fundType').value, amount, note:$('fundNote').value };
      db.cashFund.push(row);
      audit('CREATE_FUND', row.id, '', snapshot(row));
      save('Đã ghi quỹ tiền');
    };
  }

  function renderAccounts(){
    const userQ = norm($('accountSearchUser')?.value || '');
    const nameQ = norm($('accountSearchName')?.value || '');
    const codeQ = norm($('accountSearchCode')?.value || '');
    const roleQ = norm($('accountSearchRole')?.value || '');
    if (!isAdmin()) {
      $('accounts').innerHTML = `<div class="card"><h3>Tài khoản</h3><p class="muted">Chỉ admin được quản lý tài khoản và phân quyền.</p></div>`;
      return;
    }
    const accountRows = db.users.filter(u => (!userQ || norm(u.username).includes(userQ)) && (!nameQ || norm(u.name).includes(nameQ)) && (!codeQ || norm(u.code).includes(codeQ)) && (!roleQ || norm(roleLabel(u.role)).includes(roleQ) || norm(u.role).includes(roleQ)));
    $('accounts').innerHTML = `<div class="card"><h3>Tài khoản</h3>
      <p class="muted">Admin full quyền tuyệt đối. Các vai trò khác được phân quyền theo nhóm quyền chuẩn DMS.</p>
      ${renderConfiguredFilters('accounts')}
      <div class="toolbar action-row">${importToolbar('accounts')}</div>
      <div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Tên</th><th>Mã</th><th>Vai trò</th><th>Nhóm quyền</th><th>Thao tác</th></tr></thead><tbody>
      ${accountRows.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td><td>${esc(u.code)}</td><td><span class="pill">${esc(roleLabel(u.role))}</span></td><td class="small-text">${isAdmin(u) ? 'Full quyền' : esc((ROLE_DEFINITIONS[u.role]?.permissions || []).join(', '))}</td><td><button class="btn small" onclick="App.editUser('${esc(u.username)}')">Chỉnh sửa</button><button class="btn small red" onclick="App.deleteUser('${esc(u.username)}')">Xoá</button></td></tr>`).join('') || '<tr><td colspan="6" class="center muted">Chưa có tài khoản theo bộ lọc</td></tr>'}
      </tbody></table></div></div>`;
    bindConfiguredFilterEvents('accounts', renderAccounts, 250);
  }

  async function editUser(username){
    if (!canAdminOverride('Chỉ admin được chỉnh sửa tài khoản')) return;
    const u = db.users.find(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (!u) return toast('Không tìm thấy tài khoản');
    const name = prompt('Tên nhân viên:', u.name || '');
    if (name === null) return;
    const code = prompt('Mã nhân viên:', u.code || u.username || '');
    if (code === null) return;
    const roleRaw = prompt('Chọn vai trò:\n1 = Bán hàng\n2 = Giao hàng\n3 = Kế toán\n4 = Thủ quỹ\n5 = Quản lý\n6 = Admin full quyền', u.role === 'delivery' ? '2' : u.role === 'accountant' ? '3' : u.role === 'cashier' ? '4' : u.role === 'manager' ? '5' : u.role === 'admin' ? '6' : '1');
    if (roleRaw === null) return;
    const roleMap = { '1':'sales', '2':'delivery', '3':'accountant', '4':'cashier', '5':'manager', '6':'admin', 'ban hang':'sales', 'bán hàng':'sales', 'sales':'sales', 'giao hang':'delivery', 'giao hàng':'delivery', 'delivery':'delivery', 'ke toan':'accountant', 'kế toán':'accountant', 'accountant':'accountant', 'thu quy':'cashier', 'thủ quỹ':'cashier', 'cashier':'cashier', 'quan ly':'manager', 'quản lý':'manager', 'manager':'manager', 'admin':'admin', 'quan tri':'admin', 'quản trị':'admin' };
    const role = roleMap[norm(roleRaw)] || roleMap[String(roleRaw).trim()] || null;
    if (!role) return toast('Vai trò không hợp lệ');
    const before = snapshot(u);
    Object.assign(u, { name:String(name).trim(), code:String(code).trim(), role, permissions: ROLE_DEFINITIONS[role]?.permissions || [] });
    try { await API.upsertUser({ ...u, permissions: ROLE_DEFINITIONS[role]?.permissions || [] }); } catch(e) { console.warn('Không đồng bộ được user đăng nhập', e); }
    audit('UPDATE_USER', username, before, snapshot(u));
    await save('Đã chỉnh sửa tài khoản và phân quyền');
  }

  async function deleteUser(username){
    if (!canAdminOverride('Chỉ admin được xoá tài khoản')) return;
    if (String(username).toLowerCase() === 'admin') return toast('Không xoá tài khoản admin mặc định');
    const i = db.users.findIndex(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (i < 0) return toast('Không tìm thấy tài khoản');
    if (!confirm(`Xoá tài khoản ${username}?`)) return;
    const before = db.users[i];
    db.users.splice(i, 1);
    try { await API.deleteUser(username); } catch(e) { console.warn('Không xoá được user đăng nhập trên API', e); }
    audit('DELETE_USER', username, snapshot(before), '');
    await save('Đã xoá tài khoản');
  }


// ===== 06-import-print-actions-init.js =====
  function openImport(type){
    const handlers = {
      products: rows => { rows.forEach(r => { const old = product(r.sku); const data = { sku:r.sku,name:r.name,brand:r.brand,category:r.category,unit:r.unit,pack:r.pack,costRef:r.costRef,saleRef:r.saleRef,warehouse:r.warehouse,status:'active',note:r.note }; old ? Object.assign(old,data) : db.products.push(data); }); save('Đã import danh mục sản phẩm'); },
      receive: rows => processReceiveRows(rows),
      orders: rows => processOrderRows(rows, 'NVBH'),
      dmsOrders: rows => processOrderRows(rows, 'DMS'),
      dmsAuto: rows => {
        const hasOrderRows = rows.some(r => r.orderId);
        return hasOrderRows ? processOrderRows(rows, 'DMS') : handlers.dmsStocks(rows);
      },
      dmsStocks: rows => {
        const map = {};
        rows.forEach(r => {
          const sku = String(r.sku || '').trim();
          if (!sku) return;
          map[sku] = map[sku] || { sku, name:r.name || product(sku)?.name || sku, pack:r.pack || product(sku)?.pack || 1, qty:0, date:r.date || today() };
          map[sku].qty += num(r.qty);
          map[sku].date = r.date || map[sku].date;
        });
        db.dmsStocks = Object.values(map);
        save('Đã import tồn DMS và tính lại tồn mở bán');
      },
      customers: rows => { rows.forEach(r => { const old = db.customers.find(c => c.code === r.code); old ? Object.assign(old,r) : db.customers.push(r); }); save('Đã import khách hàng'); },
      accounts: async rows => { for (const r of rows) { const old = db.users.find(u => u.username === r.username); old ? Object.assign(old,r) : db.users.push(r); try { await API.upsertUser(r); } catch(e) { console.warn('Không tạo được user đăng nhập', r.username, e); } } await save('Đã import tài khoản'); },
      productGroups: rows => { rows.forEach(r => { const key = String(r.code || r.name || '').trim(); if (!key) return; const old = db.productGroups.find(g => String(g.code || g.name) === key); old ? Object.assign(old,r) : db.productGroups.push(r); }); save('Đã import nhóm sản phẩm'); },
      promotions: rows => { rows.forEach(r => { const old = db.promotions.find(p => p.code === r.code && p.sku === r.sku); old ? Object.assign(old,r) : db.promotions.push(r); }); save('Đã import khuyến mại'); }
    };
    Importer.open(type, handlers[type]);
  }

  function normalizeReceiveRows(rows){
    return (rows || []).map((r, idx) => {
      const p = product(r.sku) || findProductSmart(r.sku) || productByName(r.name) || findProductSmart(r.name);
      const sku = p ? (p.sku || p.productCode || p.code || r.sku) : String(r.sku || '').trim();
      const refCost = p ? productCostRef(p) : '';
      const explicitCost = r.cost !== undefined && r.cost !== null && String(r.cost).trim() !== '';
      return {
        ...r,
        row: r.row || idx + 1,
        sku,
        name: p ? (p.name || p.productName || r.name || sku) : (r.name || sku),
        pack: num(r.pack) || num(p?.pack) || 1,
        qty: num(r.qty),
        cost: explicitCost ? Math.round(num(r.cost)) : (refCost !== '' ? refCost : '')
      };
    }).filter(r => String(r.sku || r.name || '').trim() || num(r.qty) > 0);
  }

  function processReceiveRows(rows){
    const normalized = normalizeReceiveRows(rows);
    const missing = [...new Map(normalized.filter(r => !product(r.sku)).map(r => [r.sku || r.name || r.row, r])).values()];
    if (missing.length) { receivePendingRows = normalized; showMissingProducts(missing); return; }
    applyReceiveRows(normalized);
  }
  function showMissingProducts(rows){
    $('missingProductsBody').innerHTML = rows.map((r,i) => `<tr><td><input data-i="${i}" data-k="sku" value="${esc(r.sku)}" readonly></td><td><input data-i="${i}" data-k="name" value="${esc(r.name || r.sku)}"></td><td><input data-i="${i}" data-k="brand"></td><td><input data-i="${i}" data-k="category"></td><td><input data-i="${i}" data-k="unit" value="cái"></td><td><input data-i="${i}" data-k="pack" type="number" value="${r.pack || 1}"></td><td><input data-i="${i}" data-k="costRef" type="number" value="${r.cost || ''}"></td><td><input data-i="${i}" data-k="saleRef" type="number" value="0"></td><td><input data-i="${i}" data-k="warehouse" value="Kho chính"></td></tr>`).join('');
    $('missingProductsModal').classList.remove('hidden');
    $('missingClose').onclick = () => $('missingProductsModal').classList.add('hidden');
    $('saveMissingProductsBtn').onclick = () => {
      const grouped = {};
      document.querySelectorAll('#missingProductsBody input').forEach(inp => {
        const i = inp.dataset.i;
        grouped[i] = grouped[i] || {};
        grouped[i][inp.dataset.k] = inp.type === 'number' ? num(inp.value) : inp.value;
      });
      Object.values(grouped).forEach(p => db.products.push({ ...p, status:'active', note:'Tạo khi nhập kho' }));
      $('missingProductsModal').classList.add('hidden');
      applyReceiveRows(receivePendingRows);
      receivePendingRows = [];
    };
  }
  function applyReceiveRows(rows){
    const groups = {};
    normalizeReceiveRows(rows).forEach(r => {
      if (!r.sku || num(r.qty) <= 0) return;
      const p = product(r.sku) || {};
      const rid = String(r.receiptId || r.id || ('PN' + Date.now())).trim();
      const g = groups[rid] || (groups[rid] = { id:rid, date:r.date || today(), supplier:r.supplier || 'Unilever', note:r.note || '', posted:false, postedAt:'', items:[] });
      const cost = r.cost === '' ? 0 : Math.round(num(r.cost));
      g.items.push({ sku:r.sku, name:p.name || r.name || r.sku, pack:num(r.pack) || num(p.pack) || 1, qty:num(r.qty), cost });
    });
    Object.values(groups).forEach(g => {
      g.total = receiptTotal(g);
      const old = db.receipts.find(r => r.id === g.id);
      if (old && receiptPosted(old) && !isAdmin()) return toast('Phiếu đã ghi sổ, không được import ghi đè: ' + g.id);
      old ? Object.assign(old, g) : db.receipts.push(g);
    });
    save('Đã tạo phiếu nhập nháp. Kiểm tra rồi bấm Ghi sổ để cộng tồn');
  }

  function editReceipt(id){
    if (!requireCan('receive:edit','Không có quyền sửa phiếu nhập')) return;
    const r = db.receipts.find(x => x.id === id);
    if (!r) return toast('Không tìm thấy phiếu nhập');
    if (receiptPosted(r)) return toast('Phiếu đã ghi sổ, không được chỉnh sửa');
    editingReceiptId = r.id;
    receiveDraftMeta = { id:r.id, date:r.date || today(), note:r.note || '' };
    receiveDraftItems = (r.items || []).map(it => {
      const p = product(it.sku) || {};
      const pack = num(it.pack || p.pack) || 1;
      const qty = num(it.qty);
      return { sku:it.sku, name:it.name || p.name || '', pack, boxQty:Math.floor(qty / pack), looseQty:qty % pack, qty, cost:Math.round(num(it.cost)) };
    });
    renderReceive();
    setTimeout(() => {
      if ($('rId')) $('rId').value = r.id;
      if ($('rDate')) $('rDate').value = r.date || today();
      if ($('rNote')) $('rNote').value = r.note || '';
      $('receive')?.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 0);
    toast('Đã đưa phiếu nhập lên mục Đơn nhập lẻ để chỉnh sửa');
  }

  function deleteReceipt(id){
    if (!requireCan('receive:delete','Không có quyền xoá phiếu nhập')) return;
    const r = db.receipts.find(x => x.id === id);
    if (!r) return toast('Không tìm thấy phiếu nhập');
    if (receiptPosted(r)) return toast('Phiếu đã ghi sổ, không được xóa');
    if (!confirm('Xóa phiếu nhập ' + id + '?')) return;
    db.receipts = db.receipts.filter(x => x.id !== id);
    audit('DELETE_RECEIPT', id);
    save('Đã xóa phiếu nhập chưa ghi sổ');
  }

  function postReceipt(id){
    if (!requireCan('receive:edit','Không có quyền ghi sổ phiếu nhập')) return;
    const r = db.receipts.find(x => x.id === id);
    if (!r) return toast('Không tìm thấy phiếu nhập');
    if (receiptPosted(r)) return toast('Phiếu đã ghi sổ rồi');
    for (const it of (r.items || [])) {
      if (!product(it.sku)) return toast('SKU chưa có trong danh mục: ' + it.sku);
      if (num(it.qty) <= 0) return toast('Số lượng nhập không hợp lệ: ' + it.sku);
    }
    (r.items || []).forEach(it => {
      const s = ensureStockRow(it.sku), oldQty = num(s.qty), qty = num(it.qty), cost = Math.round(num(it.cost));
      s.qty = oldQty + qty;
      s.lastCost = cost;
      s.avgCost = s.qty ? Math.round(((num(s.avgCost) * oldQty) + (cost * qty)) / s.qty) : cost;
      s.updatedAt = nowIso();
    });
    r.posted = true;
    r.postedAt = nowIso();
    r.total = receiptTotal(r);
    save('Đã ghi sổ phiếu nhập và cập nhật tồn kho');
  }

  function printContext(){
    return {
      db, $, esc, num, money, nowIso, product, customerAddress, qtyView, receiptPosted,
      receiptQty, receiptTotal, masterWarehouseSummary, invoiceLines, promoRowsForOrder,
      invoiceDateTime, invoiceSourceLabel, amountToWords
    };
  }
  function renderPrintTemplate(templateKey, payload){
    if (!window.KHO_PRINT_TEMPLATES || typeof window.KHO_PRINT_TEMPLATES.render !== 'function') {
      toast('Chưa tải cấu hình mẫu in');
      return '';
    }
    return window.KHO_PRINT_TEMPLATES.render(templateKey, payload, printContext());
  }

  function printReceipt(id){
    const r = db.receipts.find(x => x.id === id);
    if (!r) return toast('Không tìm thấy phiếu nhập');
    $('printArea').innerHTML = renderPrintTemplate('receipt', { receipt: r });
    window.print();
  }


  function printSelectedReceipts(){
    const ids = checkedValues('receipt-check');
    if (!ids.length) return toast('Chưa chọn đơn nhập để in gộp');
    const receipts = db.receipts.filter(r => ids.includes(r.id));
    if (!receipts.length) return toast('Không tìm thấy đơn nhập đã chọn');
    const lines = [];
    receipts.forEach(r => (r.items || []).forEach(it => lines.push({ receiptId:r.id, date:r.date, note:r.note || '', ...it })));
    $('printArea').innerHTML = renderPrintTemplate('receiptBulk', { receipts, lines });
    window.print();
  }

  function processOrderRows(rows, source){
    const validRows = (rows || []).filter(r => r && r.valid !== false);
    if (!validRows.length) return toast('Không có dòng import hợp lệ');

    for (const r of validRows) {
      if (!product(r.sku)) return toast('Có SKU chưa có danh mục: ' + r.sku);
    }

    const remaining = {};
    db.stocks.forEach(s => { remaining[s.sku] = source === 'DMS' ? stockQty(s.sku) : openSellableQty(s.sku); });
    const importRows = [];
    const shortages = [];

    for (const r of validRows) {
      const sku = String(r.sku || '').trim();
      const requested = num(r.qty);
      const available = Math.max(0, num(remaining[sku]));
      const importedQty = Math.min(requested, available);
      const shortageQty = Math.max(0, requested - importedQty);
      if (importedQty > 0) importRows.push({ ...r, qty: importedQty, originalQty: requested });
      if (shortageQty > 0) {
        shortages.push({
          id: 'THIEU_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
          date: nowIso(), source: source === 'DMS' ? 'DMS' : 'NVBH',
          orderId: String(r.orderId || r.id || '').trim() || '(chưa có mã)',
          sku, name: product(sku)?.name || r.name || sku,
          requestedQty: requested, importedQty, shortageQty,
          availableAtImport: available,
          customerCode: r.customerCode || '', customerName: r.customerName || '',
          staffCode: r.staffCode || '', staffName: r.staffName || '',
          note: 'Tự loại phần thiếu tồn khi import đơn hàng'
        });
      }
      remaining[sku] = Math.max(0, available - importedQty);
    }

    if (!importRows.length) {
      db.stockShortages.push(...shortages);
      return save('Không đủ tồn để import đơn. Toàn bộ lượng thiếu đã được đưa vào báo cáo hàng thiếu');
    }

    const groups = {};
    for (const r of importRows) {
      const p = product(r.sku);
      const id = String(r.orderId || (source === 'DMS' ? 'DMS' : 'DH') + Date.now()).trim();
      if (db.orders.some(o => String(o.id) === id) && !groups[id]) return toast('Mã đơn đã tồn tại, tránh import trùng công nợ: ' + id);
      const g = groups[id] || (groups[id] = {
        id, date:r.date || today(), isoDate:nowIso(), source:source === 'DMS' ? 'DMS' : 'NVBH',
        workflowStatus:'Chờ giao', deliveryStatus:'pending', note:source === 'DMS' ? 'Đơn từ DMS' : 'Đơn NVBH',
        customerCode:r.customerCode, customerName:r.customerName, customerAddress:r.customerAddress || customerAddress(r.customerCode), staffCode:r.staffCode, staffName:r.staffName,
        deliveryStaffCode:r.deliveryStaffCode || '', deliveryStaffName:r.deliveryStaffName || '',
        cashPaid:0, bankPaid:0, returnAmount:0, items:[], _payKeys:new Set()
      });
      const payKey = [num(r.cashPaid), num(r.bankPaid), num(r.returnAmount)].join('|');
      if (payKey !== '0|0|0' && !g._payKeys.has(payKey)) {
        g.cashPaid += num(r.cashPaid); g.bankPaid += num(r.bankPaid); g.returnAmount += num(r.returnAmount); g._payKeys.add(payKey);
      }
      const promo = promoForSku(r.sku);
      const discount = source === 'DMS' ? num(r.discount) : num(promo?.value || r.discount);
      const displayReward = num(promo?.displayReward);
      const sale = source === 'DMS' ? Math.round(num(r.sale || p.saleRef)) : Math.round(num(p.saleRef));
      g.items.push({ sku:r.sku, name:p.name, pack:p.pack, qty:num(r.qty), sale, discount, displayReward });
    }

    Object.values(groups).forEach(g => { delete g._payKeys; db.orders.push(recalcOrder(g)); });
    const used = {};
    importRows.forEach(r => { used[r.sku] = num(used[r.sku]) + num(r.qty); });
    Object.entries(used).forEach(([sku, qty]) => { const s = stock(sku); s.qty -= qty; s.updatedAt = nowIso(); });
    db.stockShortages.push(...shortages);
    const msg = shortages.length
      ? `Đã import phần đủ tồn. Đã tự loại ${shortages.length} dòng/lượng thiếu và đưa vào báo cáo hàng thiếu`
      : 'Đã import đơn, trừ tồn và tạo công nợ chuẩn';
    save(msg);
  }

  function salesCreateOrder(sku){
    if (!requireCan('order:create','Không có quyền tạo đơn bán hàng')) return;
    const p = product(sku), s = stock(sku), qty = num($('saleCase_' + sku)?.value) * (num(p?.pack) || 1) + num($('saleLoose_' + sku)?.value);
    if (!p || qty <= 0) return toast('Nhập số lượng hợp lệ');
    const open = openSellableQty(sku);
    if (qty > open) return toast('Vượt tồn mở bán, app báo hết hàng');
    if (qty > s.qty) return toast('Không đủ tồn thực tế');
    const promo = promoForSku(sku);
    const order = { id:'APP'+Date.now(), date:today(), isoDate:nowIso(), source:'APP', workflowStatus:'Chờ giao', deliveryStatus:'pending', note:'Đơn app bán hàng', customerCode:$('salesCustomerCode').value.trim(), customerName:$('salesCustomerName').value.trim() || customerByCode($('salesCustomerCode').value.trim())?.name || '', customerAddress:customerAddress($('salesCustomerCode').value.trim()), staffCode:$('salesStaffCode').value.trim() || API.user?.code || '', staffName:API.user?.name || '', cashPaid:0, bankPaid:0, returnAmount:0, items:[{sku,name:p.name,pack:p.pack,qty,sale:p.saleRef,discount:num(promo?.value),displayReward:num(promo?.displayReward)}] };
    s.qty -= qty; s.updatedAt = nowIso();
    db.orders.push(recalcOrder(order));
    save('Đã gửi đơn app bán hàng về hệ thống');
  }

  function driverCollect(id){
    const o = db.orders.find(x => x.id === id);
    if (!o) return;
    const cash = num($('cash_' + id)?.value), bank = num($('bank_' + id)?.value), ret = num($('ret_' + id)?.value), reward = num($('reward_' + id)?.value);
    if (cash + bank + ret + reward <= 0) return toast('Chưa nhập tiền thu hoặc hàng trả về');
    const beforeDebt = num(o.debt);
    o.cashPaid = num(o.cashPaid) + cash;
    o.bankPaid = num(o.bankPaid) + bank;
    o.returnAmount = num(o.returnAmount) + ret;
    o.displayRewardPaid = num(o.displayRewardPaid) + reward;
    o.deliveryStatus = 'delivered';
    o.delivered = true;
    o.deliveredAt = nowIso();
    db.payments.push({ id:'PAY'+Date.now(), orderId:id, date:nowIso(), cash, bank, returnAmount:ret, displayRewardPaid:reward, beforeDebt, afterDebt:Math.max(0, beforeDebt-cash-bank-ret), amount:cash+bank+ret, note:'App giao hàng thu tiền/hàng trả/thưởng trưng bày' });
    if (cash > 0) db.cashFund.push({ id:'Q'+Date.now(), date:nowIso(), type:'thu', amount:cash, note:'NV giao hàng nộp tiền mặt đơn ' + id });
    if (bank > 0) db.cashFund.push({ id:'QBK'+Date.now(), date:nowIso(), type:'chuyen_khoan', amount:bank, note:'NV giao hàng báo chuyển khoản đơn ' + id });
    if (reward > 0) db.cashFund.push({ id:'QRW'+Date.now(), date:nowIso(), type:'chi', amount:reward, note:'Chi tiền trả thưởng trưng bày đơn ' + id });
    Object.assign(o, recalcOrder(o));
    o.workflowStatus = o.debt > 0 ? 'Đã giao - còn nợ' : 'Đã giao - hoàn tất';
    save('Đã ghi nhận giao hàng, công nợ và quỹ tiền');
  }


  function bulkEditReceipts(){
    if (!requireCan('receive:edit','Không có quyền sửa phiếu nhập')) return;
    const ids = checkedValues('receipt-check');
    if (!ids.length) return toast('Chưa chọn phiếu nhập');
    const blocked = ids.map(id => db.receipts.find(r=>r.id===id)).filter(receiptPosted);
    if (blocked.length && !isAdmin()) return toast('Phiếu đã ghi sổ không được sửa: ' + blocked.map(x=>x.id).join(', '));
    ids.forEach(editReceipt);
  }
  function bulkDeleteReceipts(){
    if (!requireCan('receive:delete','Không có quyền xoá phiếu nhập')) return;
    const ids = checkedValues('receipt-check');
    if (!ids.length) return toast('Chưa chọn phiếu nhập');
    const blocked = ids.map(id => db.receipts.find(r=>r.id===id)).filter(receiptPosted);
    if (blocked.length && !isAdmin()) return toast('Không xoá phiếu đã ghi sổ: ' + blocked.map(x=>x.id).join(', '));
    if (!confirm('Xoá ' + ids.length + ' phiếu nhập nháp?')) return;
    db.receipts = db.receipts.filter(r => !ids.includes(r.id));
    audit('DELETE_RECEIPTS', ids.join(','));
    save('Đã xoá phiếu nhập nháp đã chọn');
  }
  function bulkEditOrders(){
    if (!requireCan('order:edit','Không có quyền sửa đơn hàng')) return;
    const ids = checkedValues('order-check');
    if (!ids.length) return toast('Chưa chọn đơn hàng');
    if (ids.length > 1 && !confirm('Sửa lần lượt ' + ids.length + ' đơn đã chọn?')) return;
    ids.forEach(id => editOrder(id));
  }
  function editOrder(id){
    if (!requireCan('order:edit','Không có quyền sửa đơn hàng')) return;
    const o = db.orders.find(x => x.id === id);
    if (!o) return;
    if (!isAdmin() && (o.deliveryStatus === 'delivered' || String(o.workflowStatus || '').includes('hoàn tất'))) return toast('Đơn đã giao/hoàn tất chỉ admin được sửa');
    if (o.masterId && !isAdmin()) return toast('Đơn đã gộp đơn tổng, chỉ admin được sửa');
    editingSingleOrderId = o.id;
    singleOrderDraftItems = (o.items || []).map(it => {
      const p = product(it.sku) || {};
      const pack = num(it.pack) || num(p.pack) || 1;
      const qty = num(it.qty);
      return { sku:it.sku, name:it.name || p.name || '', pack, boxQty:Math.floor(qty / pack), looseQty:qty % pack, qty, sale:num(it.sale || p.saleRef || p.sale || p.price) };
    });
    setPage('singleOrder');
    setTimeout(() => {
      if ($('oId')) $('oId').value = o.id;
      if ($('oDate')) $('oDate').value = o.date || today();
      if ($('oCustomerCode')) $('oCustomerCode').value = o.customerCode || '';
      if ($('oCustomerName')) $('oCustomerName').value = o.customerName || '';
      if ($('oStaffCode')) $('oStaffCode').value = o.staffCode || '';
      if ($('oStaffName')) $('oStaffName').value = o.staffName || '';
      if ($('oNote')) $('oNote').value = o.note || '';
    }, 0);
  }
  function bulkDeleteOrders(){
    if (!requireCan('order:delete','Không có quyền xoá đơn hàng')) return;
    const ids = checkedValues('order-check');
    if (!ids.length) return toast('Chưa chọn đơn hàng');
    if (!confirm('Xoá ' + ids.length + ' đơn hàng và trả lại tồn kho?')) return;
    ids.forEach(id => {
      const o = db.orders.find(x=>x.id===id);
      if (!o) return;
      (o.items||[]).forEach(it => { const s=stock(it.sku); s.qty += num(it.qty); s.updatedAt=nowIso(); });
    });
    db.orders = db.orders.filter(o => !ids.includes(o.id));
    db.masterOrders.forEach(m => m.childIds = (m.childIds||[]).filter(id => !ids.includes(id)));
    db.masterOrders = db.masterOrders.filter(m => (m.childIds||[]).length);
    audit('DELETE_ORDERS', ids.join(','));
    save('Đã xoá đơn hàng và hoàn tồn kho');
  }
  function bulkEditMasters(){
    if (!requireCan('master:edit','Không có quyền sửa đơn tổng')) return;
    const ids = checkedValues('master-check');
    if (!ids.length) return toast('Chưa chọn đơn tổng');
    ids.forEach(id => {
      const m = db.masterOrders.find(x=>x.id===id);
      if (!m) return;
      const txt = prompt('Sửa ngày tạo/ghi chú đơn tổng theo định dạng: ngày|ghi chú', [m.date||nowIso(),m.note||''].join('|'));
      if (txt === null) return;
      const [date,...note] = txt.split('|'); m.date = date || m.date; m.note = note.join('|');
    });
    audit('EDIT_MASTER_ORDERS', ids.join(','));
    save('Đã chỉnh sửa đơn tổng');
  }
  function bulkDeleteMasters(){
    if (!requireCan('master:delete','Không có quyền xoá đơn tổng')) return;
    const ids = checkedValues('master-check');
    if (!ids.length) return toast('Chưa chọn đơn tổng');
    if (!confirm('Xoá đơn tổng đã chọn? Đơn con sẽ được mở gộp lại.')) return;
    db.orders.forEach(o => { if (ids.includes(o.masterId)) delete o.masterId; });
    db.masterOrders = db.masterOrders.filter(m => !ids.includes(m.id));
    audit('DELETE_MASTER_ORDERS', ids.join(','));
    save('Đã xoá đơn tổng và mở lại đơn con');
  }
  function bulkEditCustomers(){
    if (!requireCan('customer:edit','Không có quyền sửa khách hàng')) return;
    const ids = checkedValues('customer-check');
    if (!ids.length) return toast('Chưa chọn khách hàng');
    ids.forEach(code => {
      const c = db.customers.find(x=>x.code===code); if (!c) return;
      const txt = prompt('Sửa KH theo định dạng: mã|tên|SĐT|địa chỉ|MST|nhóm', [c.code,c.name,c.phone||'',c.address||'',c.tax||'',c.group||''].join('|'));
      if (txt === null) return;
      const [newCode,name,phone,address,tax,group] = txt.split('|');
      Object.assign(c,{code:newCode||c.code,name:name||'',phone:phone||'',address:address||'',tax:tax||'',group:group||''});
    });
    audit('EDIT_CUSTOMERS', ids.join(','));
    save('Đã chỉnh sửa khách hàng');
  }
  function bulkDeleteCustomers(){
    if (!requireCan('customer:delete','Không có quyền xoá khách hàng')) return;
    const ids = checkedValues('customer-check');
    if (!ids.length) return toast('Chưa chọn khách hàng');
    if (!confirm('Xoá ' + ids.length + ' khách hàng?')) return;
    db.customers = db.customers.filter(c => !ids.includes(c.code));
    audit('DELETE_CUSTOMERS', ids.join(','));
    save('Đã xoá khách hàng đã chọn');
  }
  function bulkEditPromotions(){
    if (!requireCan('promotion:edit','Không có quyền sửa khuyến mại')) return;
    const ids = checkedValues('promo-check').map(Number);
    if (!ids.length) return toast('Chưa chọn khuyến mại');
    ids.forEach(i => {
      const p = db.promotions[i]; if (!p) return;
      const txt = prompt('Sửa CTKM: mã|tên|SKU|loại|giá trị/CK|thưởng TB|coupon|ontop|từ ngày|đến ngày', [p.code,p.name,p.sku,p.type,p.value||0,p.displayReward||0,p.coupon||'',p.ontop||'',p.from||'',p.to||''].join('|'));
      if (txt === null) return;
      const [code,name,sku,type,value,displayReward,coupon,ontop,from,to] = txt.split('|');
      Object.assign(p,{code,name,sku,type,value:num(value),displayReward:num(displayReward),coupon,ontop,from,to});
    });
    audit('EDIT_PROMOTIONS', ids.join(','));
    save('Đã chỉnh sửa khuyến mại');
  }
  function bulkDeletePromotions(){
    if (!requireCan('promotion:delete','Không có quyền xoá khuyến mại')) return;
    const ids = checkedValues('promo-check').map(Number);
    if (!ids.length) return toast('Chưa chọn khuyến mại');
    if (!confirm('Xoá ' + ids.length + ' chương trình khuyến mại?')) return;
    db.promotions = db.promotions.filter((_,i) => !ids.includes(i));
    audit('DELETE_PROMOTIONS', ids.join(','));
    save('Đã xoá khuyến mại đã chọn');
  }
  function bulkEditDebts(){
    if (!requireCan('debt:edit','Không có quyền sửa công nợ')) return;
    const ids = checkedValues('debt-check');
    if (!ids.length) return toast('Chưa chọn công nợ');
    ids.forEach(id => editOrder(id));
  }
  function bulkDeleteDebts(){
    if (!requireCan('debt:delete','Không có quyền xoá công nợ')) return;
    const ids = checkedValues('debt-check');
    if (!ids.length) return toast('Chưa chọn công nợ');
    if (!confirm('Xoá công nợ đã chọn bằng cách tất toán số còn nợ?')) return;
    ids.forEach(id => {
      const o = db.orders.find(x=>x.id===id); if (!o) return;
      o.cashPaid = num(o.cashPaid) + num(o.debt);
      Object.assign(o, recalcOrder(o));
    });
    audit('SETTLE_DEBTS', ids.join(','));
    save('Đã tất toán/xoá công nợ đã chọn khỏi danh sách còn nợ');
  }
  function bulkEditFunds(){
    if (!requireCan('fund:edit','Không có quyền sửa quỹ tiền')) return;
    const ids = checkedValues('fund-check');
    if (!ids.length) return toast('Chưa chọn giao dịch quỹ');
    ids.forEach(id => {
      const f = db.cashFund.find(x=>x.id===id); if (!f) return;
      const txt = prompt('Sửa quỹ theo định dạng: loại|số tiền|nội dung', [f.type,f.amount||0,f.note||''].join('|'));
      if (txt === null) return;
      const [type,amount,...note] = txt.split('|');
      f.type = type || f.type; f.amount = num(amount); f.note = note.join('|');
    });
    audit('EDIT_CASH_FUND', ids.join(','));
    save('Đã chỉnh sửa giao dịch quỹ');
  }
  function bulkDeleteFunds(){
    if (!requireCan('fund:delete','Không có quyền xoá quỹ tiền')) return;
    const ids = checkedValues('fund-check');
    if (!ids.length) return toast('Chưa chọn giao dịch quỹ');
    if (!confirm('Xoá ' + ids.length + ' giao dịch quỹ?')) return;
    db.cashFund = db.cashFund.filter(x => !ids.includes(x.id));
    audit('DELETE_CASH_FUND', ids.join(','));
    save('Đã xoá giao dịch quỹ đã chọn');
  }


  function deleteOrder(id){
    if (!requireCan('order:delete','Không có quyền xoá đơn hàng')) return;
    const o = db.orders.find(x=>x.id===id); if (!o) return;
    if (!isAdmin() && (o.deliveryStatus === 'delivered' || num(o.cashPaid)+num(o.bankPaid)+num(o.returnAmount)>0)) return toast('Đơn đã giao/đã thu chỉ admin được xoá');
    if (!confirm('Xoá đơn ' + id + '?')) return;
    const before = snapshot(o);
    db.orders = db.orders.filter(x=>x.id!==id);
    db.masterOrders.forEach(m => m.childIds = (m.childIds||[]).filter(x => x !== id));
    db.masterOrders = db.masterOrders.filter(m => (m.childIds||[]).length);
    audit('DELETE_ORDER', id, before, '');
    save('Đã xoá đơn hàng');
  }
  function editMaster(id){
    if (!requireCan('master:edit','Không có quyền sửa đơn tổng')) return;
    const m = db.masterOrders.find(x=>x.id===id); if (!m) return;
    const before = snapshot(m);
    const txt = prompt('Sửa đơn tổng: ngày giờ xuất|mã NV giao|tên NV giao|ghi chú', [m.exportTime||m.date||nowIso(),m.deliveryStaffCode||'',m.deliveryStaffName||'',m.note||''].join('|'));
    if (txt === null) return;
    const [exportTime, deliveryStaffCode, deliveryStaffName, ...note] = txt.split('|');
    Object.assign(m,{ exportTime:exportTime||m.exportTime||m.date, deliveryStaffCode:deliveryStaffCode||'', deliveryStaffName:deliveryStaffName||'', note:note.join('|') });
    audit('EDIT_MASTER', id, before, snapshot(m));
    save('Đã sửa đơn tổng');
  }
  function deleteMaster(id){
    if (!requireCan('master:delete','Không có quyền xoá đơn tổng')) return;
    const m = db.masterOrders.find(x=>x.id===id); if (!m) return;
    if (!confirm('Xoá đơn tổng ' + id + '? Đơn con sẽ được mở gộp lại.')) return;
    const before = snapshot(m);
    db.orders.forEach(o => { if (o.masterId === id) delete o.masterId; });
    db.masterOrders = db.masterOrders.filter(x=>x.id!==id);
    audit('DELETE_MASTER', id, before, '');
    save('Đã xoá đơn tổng');
  }
  function editCustomer(code){
    const c = db.customers.find(x=>x.code===code); if (!c) return;
    const before = snapshot(c);
    const txt = prompt('Sửa KH: mã|tên|SĐT|địa chỉ|MST|nhóm', [c.code,c.name,c.phone||'',c.address||'',c.tax||'',c.group||''].join('|'));
    if (txt === null) return;
    const [newCode,name,phone,address,tax,group] = txt.split('|');
    Object.assign(c,{code:newCode||c.code,name:name||'',phone:phone||'',address:address||'',tax:tax||'',group:group||''});
    audit('EDIT_CUSTOMER', code, before, snapshot(c));
    save('Đã sửa khách hàng');
  }
  function deleteCustomer(code){
    const c = db.customers.find(x=>x.code===code); if (!c) return;
    if (!confirm('Xoá khách hàng ' + code + '?')) return;
    audit('DELETE_CUSTOMER', code, snapshot(c), '');
    db.customers = db.customers.filter(x=>x.code!==code);
    save('Đã xoá khách hàng');
  }
  function editPromotion(i){
    const p = db.promotions[i]; if (!p) return;
    const before = snapshot(p);
    const txt = prompt('Sửa CTKM: mã|tên|SKU|loại|giá trị/CK|thưởng TB|coupon|ontop|từ ngày|đến ngày', [p.code,p.name,p.sku,p.type,p.value||0,p.displayReward||0,p.coupon||'',p.ontop||'',p.from||'',p.to||''].join('|'));
    if (txt === null) return;
    const [code,name,sku,type,value,displayReward,coupon,ontop,from,to] = txt.split('|');
    Object.assign(p,{code,name,sku,type,value:num(value),displayReward:num(displayReward),coupon,ontop,from,to});
    audit('EDIT_PROMOTION', String(i), before, snapshot(p));
    save('Đã sửa khuyến mại');
  }
  function deletePromotion(i){
    const p = db.promotions[i]; if (!p) return;
    if (!confirm('Xoá khuyến mại này?')) return;
    audit('DELETE_PROMOTION', String(i), snapshot(p), '');
    db.promotions.splice(i,1);
    save('Đã xoá khuyến mại');
  }
  function settleDebt(id){
    if (!requireCan('debt:collect','Không có quyền thu công nợ')) return;
    const o = db.orders.find(x=>x.id===id); if (!o) return;
    const amount = num(prompt('Nhập số tiền tất toán/thu thêm', String(num(o.debt))));
    if (amount <= 0) return;
    const before = snapshot(o);
    o.cashPaid = num(o.cashPaid) + amount;
    Object.assign(o, recalcOrder(o));
    db.cashFund.push({ id:'Q'+Date.now(), date:nowIso(), type:'thu', amount, note:'Thu công nợ đơn ' + id });
    audit('SETTLE_DEBT', id, before, snapshot(o));
    save('Đã ghi nhận thu công nợ');
  }
  function editFund(id){
    if (!requireCan('fund:edit','Không có quyền sửa quỹ tiền')) return;
    const f = db.cashFund.find(x=>x.id===id); if (!f) return;
    if (!isAdmin() && !sameDay(f.date, today())) return toast('Giao dịch quỹ khác ngày chỉ admin được sửa');
    const before = snapshot(f);
    const txt = prompt('Sửa quỹ: loại|số tiền|nội dung', [f.type,f.amount||0,f.note||''].join('|'));
    if (txt === null) return;
    const [type,amount,...note] = txt.split('|');
    Object.assign(f,{ type:type||f.type, amount:num(amount), note:note.join('|') });
    audit('EDIT_FUND', id, before, snapshot(f));
    save('Đã sửa giao dịch quỹ');
  }
  function deleteFund(id){
    if (!requireCan('fund:delete','Không có quyền xoá quỹ tiền')) return;
    const f = db.cashFund.find(x=>x.id===id); if (!f) return;
    if (!isAdmin()) return toast('Chỉ admin được xoá giao dịch quỹ');
    if (!confirm('Xoá giao dịch quỹ này?')) return;
    audit('DELETE_FUND', id, snapshot(f), '');
    db.cashFund = db.cashFund.filter(x=>x.id!==id);
    save('Đã xoá giao dịch quỹ');
  }


  function amountToWords(n){
    n = Math.round(num(n));
    if (!n) return 'Không Đồng';
    const dv = ['','Một','Hai','Ba','Bốn','Năm','Sáu','Bảy','Tám','Chín'];
    const units = ['',' Nghìn',' Triệu',' Tỷ'];
    function read3(x){
      x = x % 1000;
      const tr = Math.floor(x/100), ch = Math.floor((x%100)/10), dvn = x%10;
      let out = [];
      if (tr) out.push(dv[tr] + ' Trăm');
      if (ch > 1) { out.push(dv[ch] + ' Mươi'); if (dvn === 1) out.push('Mốt'); else if (dvn === 5) out.push('Lăm'); else if (dvn) out.push(dv[dvn]); }
      else if (ch === 1) { out.push('Mười'); if (dvn === 5) out.push('Lăm'); else if (dvn) out.push(dv[dvn]); }
      else if (dvn) { if (tr) out.push('Lẻ'); out.push(dv[dvn]); }
      return out.join(' ');
    }
    let parts=[], i=0;
    while(n>0 && i<units.length){ const chunk = n%1000; if(chunk) parts.unshift(read3(chunk)+units[i]); n=Math.floor(n/1000); i++; }
    return parts.join(' ') + ' Đồng';
  }
  function invoiceDateTime(o){
    const raw = o.isoDate || o.createdAt || o.date || nowIso();
    const d = new Date(raw);
    if (isNaN(d)) return esc(o.date || '');
    return d.toLocaleString('vi-VN', { hour12:false });
  }
  function invoiceSourceLabel(o){
    if (o.source === 'DMS') return 'Từ DMS';
    if (o.source === 'APP') return 'Từ APP bán hàng';
    return 'Từ NVBH';
  }
  function invoiceLines(o){
    return (o.items || []).map((it, idx) => {
      const qty = num(it.qty), sale = num(it.sale), discount = num(it.discount);
      const beforeTax = num(it.beforeTax || it.priceBeforeTax || sale / 1.08);
      const afterTaxBeforeKm = num(it.afterTaxBeforeKm || it.priceAfterTaxBeforeKm || sale);
      const afterTaxKm = num(it.afterTaxKm || it.priceAfterKm || sale * (1 - discount/100));
      const lineVat = num(it.vatAmount || (afterTaxBeforeKm - beforeTax) * qty);
      const amount = Math.round(num(it.amount || qty * afterTaxKm));
      return { idx:idx+1, sku:it.sku, name:it.name || product(it.sku)?.name || '', qty, pack:it.pack || product(it.sku)?.pack || 1, beforeTax, afterTaxBeforeKm, afterTaxKm, lineVat, amount };
    });
  }
  function promoRowsForOrder(o){
    const rows = [];
    (o.items || []).forEach(it => {
      const pr = promoForSku(it.sku);
      if (pr && (num(pr.value) || num(pr.displayReward))) rows.push({
        code: pr.code || '', name: pr.name || 'Khuyến mại/chiết khấu', base: num(it.qty) * num(it.sale), percent: num(pr.value), ckBefore: Math.round(num(it.qty)*num(it.sale)*num(pr.value)/100/1.08), ckAfter: Math.round(num(it.qty)*num(it.sale)*num(pr.value)/100)
      });
    });
    if (Array.isArray(o.promotions)) o.promotions.forEach(x => rows.push(x));
    return rows;
  }
  function printOrder(id){
    const o = db.orders.find(x => x.id === id);
    if (!o) return toast('Không tìm thấy đơn hàng');
    printOrders([o]);
  }
  function printSelectedOrders(){
    const ids = checkedValues('order-check');
    if (!ids.length) return toast('Chưa chọn đơn để in');
    const orders = db.orders.filter(o => ids.includes(o.id));
    printOrders(orders);
  }
  function printOrders(orders){
    $('printArea').innerHTML = (orders || []).map(o => invoiceHtml(o)).join('<div class="page-break"></div>');
    window.print();
  }
  function invoiceHtml(o){
    return renderPrintTemplate('singleOrder', { order: o });
  }


  function printMaster(id, temp=false){
    const selected = [...document.querySelectorAll('.merge-check:checked')].map(x => x.value);
    const orders = id ? db.orders.filter(o => o.masterId === id) : db.orders.filter(o => selected.includes(o.id));
    if (!orders.length) return toast('Chưa có đơn để in');
    const master = id ? db.masterOrders.find(x => x.id === id) : null;
    printMasterOrders(orders, master, id || '(in tạm)');
  }
  function printSelectedMasters(){
    const ids = checkedValues('master-check');
    if (!ids.length) return toast('Chưa chọn đơn tổng để in gộp');
    const orders = db.orders.filter(o => ids.includes(o.masterId));
    if (!orders.length) return toast('Các đơn tổng được chọn chưa có đơn con');
    printMasterOrders(orders, { exportTime: nowIso(), deliveryStaffName: 'In gộp nhiều đơn tổng' }, 'Gộp ' + ids.length + ' đơn tổng');
  }
  function printMasterOrders(orders, master, title){
    $('printArea').innerHTML = renderPrintTemplate('masterOrder', { orders, master, title });
    window.print();
  }


  function exportVnpt(){
    const rows = [['Mã đơn','Ngày','Mã KH','Tên KH','Mã hàng','Tên hàng','Đơn vị tính','Số lượng','Đơn giá','Thành tiền','Ghi chú']];
    db.orders.forEach(o => (o.items || []).forEach(it => {
      const p = product(it.sku) || {};
      rows.push([o.id,o.date,o.customerCode,o.customerName,it.sku,it.name,p.unit || 'cái',it.qty,it.sale,num(it.qty)*num(it.sale),o.note || '']);
    }));
    const ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VNPT_TT78');
    XLSX.writeFile(wb, 'xuat_hoa_don_vnpt_tt78.xlsx');
  }

  async function init(){
    $('loginBtn').onclick = async () => {
      try { await API.login($('loginUser').value, $('loginPass').value); showApp(); await load(); setPage('dashboard'); }
      catch(e) { toast(e.message || 'Không đăng nhập được'); }
    };
    $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('logoutBtn').onclick = () => { API.logout(); showLogin(); };
    document.querySelectorAll('.sidebar button[data-page]').forEach(b => b.onclick = () => setPage(b.dataset.page));
    if (API.token) { showApp(); await load(); setPage('dashboard'); } else showLogin();
  }

  return { init, render, setPage, editProduct, editProductGroup, deleteProductGroup, driverCollect, printMaster, printSelectedMasters, printOrder, printSelectedOrders, salesCreateOrder, editOrder, deleteOrder, editMaster, deleteMaster, editCustomer, deleteCustomer, editPromotion, deletePromotion, settleDebt, editFund, deleteFund, editReceipt, deleteReceipt, postReceipt, printReceipt, printSelectedReceipts, removeReceiveDraftItem, removeSingleOrderItem, editSingleOrderItem, setAllChecks, bulkEditReceipts, bulkDeleteReceipts, bulkEditOrders, bulkDeleteOrders, bulkEditMasters, bulkDeleteMasters, bulkEditCustomers, bulkDeleteCustomers, bulkEditPromotions, bulkDeletePromotions, bulkEditDebts, bulkDeleteDebts, bulkEditFunds, bulkDeleteFunds, editUser, deleteUser };
})();
document.addEventListener('DOMContentLoaded', App.init);
