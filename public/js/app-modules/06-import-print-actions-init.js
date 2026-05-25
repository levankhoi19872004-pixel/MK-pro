// 06-import-print-actions-init.js
// Import Excel, xử lý đơn/phiếu, in ấn, action sửa/xoá, init và return API public.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

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
