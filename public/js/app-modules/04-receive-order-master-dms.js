// 04-receive-order-master-dms.js
// Nhập kho, phiếu nhập, xuất đơn lẻ, đơn hàng, đơn tổng, DMS.
// File này là một phần của bundle public/js/app.js. Sau khi sửa, chạy: npm run build:app

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

