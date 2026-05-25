// 02-permission-suggest-filter.js
// Cấu hình tìm kiếm, phân quyền, ghost suggestion, liên kết lookup 2 chiều.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

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

