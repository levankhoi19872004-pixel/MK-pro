var DEBT_ZERO_TOLERANCE = window.DEBT_ZERO_TOLERANCE || 1000;
window.DEBT_ZERO_TOLERANCE = DEBT_ZERO_TOLERANCE;
function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}
function hasOpenDebt(value){ return normalizeDebtAmount(value) > 0; }

function readDeliveryMoneyClient(order){
  order = order || {};
  return {
    cashAmount: Number(order.cashAmount ?? order.cashCollected ?? 0) || 0,
    bankAmount: Number(order.bankAmount ?? order.bankCollected ?? order.transferAmount ?? 0) || 0,
    rewardAmount: Number(order.rewardAmount ?? order.bonusAmount ?? order.displayRewardAmount ?? 0) || 0
  };
}

function mergeStatusLabel(status, row){
  const value = String(status || row?.mergeStatus || 'unmerged').toLowerCase();
  const isMerged = ['merged','mastered','grouped'].includes(value) || Boolean(row?.masterOrderId || row?.masterOrderCode || row?.masterOrderNo);
  if(isMerged) return '<span class="badge source-merged">Đã gộp</span>';
  return '<span class="badge source-unmerged">Chưa gộp</span>';
}
window.mergeStatusLabel = window.mergeStatusLabel || mergeStatusLabel;

function masterStatusLabel(status){
  const value=String(status||'active').toLowerCase();
  if(['cancelled','canceled','void','deleted','removed'].includes(value)) return '<span class="badge source-cancelled">Đã hủy</span>';
  if(['delivered','completed','done'].includes(value)) return '<span class="badge source-merged">Hoàn tất</span>';
  if(['assigned','active','created','pending',''].includes(value)) return '<span class="badge source-merged">Đã gộp</span>';
  return `<span class="badge source-merged">${value}</span>`;
}
window.masterStatusLabel = window.masterStatusLabel || masterStatusLabel;

async function deliveryReadJsonResponse(res, fallbackMessage){
  const contentType = String(res && res.headers && res.headers.get ? res.headers.get('content-type') || '' : '');
  const text = await res.text();
  if(contentType.includes('application/json')){
    try{return JSON.parse(text || '{}');}
    catch(err){throw new Error(`API trả JSON lỗi định dạng: ${err.message}`);}
  }
  const preview = String(text || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
  throw new Error(`${fallbackMessage || 'API không trả JSON'} (HTTP ${res.status}). Có thể server Render chưa deploy đúng backend/route API. ${preview ? 'Nội dung trả về: '+preview : ''}`);
}

async function loadUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  const params=new URLSearchParams();
  if(unmergedOrderSearch && unmergedOrderSearch.value.trim())params.set('q',unmergedOrderSearch.value.trim());
  if(unmergedSourceFilter && unmergedSourceFilter.value)params.set('source',unmergedSourceFilter.value);
  const fromDate = unmergedDateFrom?.value || unmergedDateFilter?.value || today();
  const toDate = unmergedDateTo?.value || fromDate || today();
  params.set('dateFrom', fromDate);
  params.set('dateTo', toDate);
  if(unmergedSalesStaffFilter && unmergedSalesStaffFilter.value.trim())params.set('salesStaff',unmergedSalesStaffFilter.value.trim());
  params.set('page','1');
  params.set('limit','2000');
  const url=`/api/master-orders/unmerged-child-orders${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn con chưa gộp');
    unmergedOrdersCache=json.orders||[];
    if(unmergedOrderCount)unmergedOrderCount.textContent=`${unmergedOrdersCache.length} đơn con chưa gộp`;
    selectedChildOrderIds=new Set([...selectedChildOrderIds].filter(id=>unmergedOrdersCache.some(o=>o.id===id)));
    renderUnmergedChildOrders();
  }catch(err){
    if(unmergedOrderCount)unmergedOrderCount.textContent='Lỗi tải đơn con';
    unmergedOrderList.innerHTML=err.message;
  }
}

function updateSelectAllUnmergedOrdersButton(){
  if(!selectAllUnmergedOrdersButton)return;
  const ids=(unmergedOrdersCache||[]).map(order=>order.id).filter(Boolean);
  const allSelected=ids.length>0 && ids.every(id=>selectedChildOrderIds.has(id));
  selectAllUnmergedOrdersButton.textContent=allSelected?'Bỏ chọn tất cả':'Chọn tất cả';
  selectAllUnmergedOrdersButton.disabled=!ids.length;
}

function toggleSelectAllUnmergedOrders(){
  const ids=(unmergedOrdersCache||[]).map(order=>order.id).filter(Boolean);
  if(!ids.length)return;
  const allSelected=ids.every(id=>selectedChildOrderIds.has(id));
  ids.forEach(id=>{
    if(allSelected)selectedChildOrderIds.delete(id);
    else selectedChildOrderIds.add(id);
  });
  renderUnmergedChildOrders();
}
window.toggleSelectAllUnmergedOrders=toggleSelectAllUnmergedOrders;

function renderUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  if(!unmergedOrdersCache.length){
    unmergedOrderList.innerHTML='<div class="empty-state">Không có đơn con chưa gộp.</div>';
    updateSelectedChildOrderSummary();
    updateSelectAllUnmergedOrdersButton();
    return;
  }
  unmergedOrderList.innerHTML=unmergedOrdersCache.map(order=>{
    const staff=[order.salesStaffCode||order.staffCode||'', order.salesStaffName||order.staffName||''].filter(Boolean).join(' ');
    const customer=[order.customerCode||'', order.customerName||''].filter(Boolean).join(' - ');
    return `<label class="child-order-row master-child-one-line ${selectedChildOrderIds.has(order.id)?'selected':''}">
      <input type="checkbox" class="child-order-check" data-id="${escapeHtml(order.id||'')}" ${selectedChildOrderIds.has(order.id)?'checked':''} />
      <strong class="master-child-code" title="Mã đơn">${escapeHtml(order.code||order.id||'')}</strong>
      <span class="master-child-customer" title="Khách hàng">${escapeHtml(customer||'Không rõ khách')}</span>
      <span class="master-child-date" title="Ngày">${escapeHtml(order.date||'')}</span>
      <span class="master-child-staff" title="NVBH">${escapeHtml(staff||'')}</span>
      <strong class="master-child-money" title="Giá trị">${money(order.totalAmount)}</strong>
      <span class="master-child-source" title="Nguồn">${orderSourceLabel(order.orderSource,order)}</span>
    </label>`;
  }).join('');
  updateSelectedChildOrderSummary();
  updateSelectAllUnmergedOrdersButton();
}

function updateSelectedChildOrderSummary(){
  const selected=unmergedOrdersCache.filter(order=>selectedChildOrderIds.has(order.id));
  const totalAmount=selected.reduce((sum,order)=>sum+Number(order.totalAmount||0),0);
  const totalDebt=selected.reduce((sum,order)=>sum+Number(order.debtAmount||0),0);
  if(selectedChildOrderCount)selectedChildOrderCount.textContent=selected.length;
  if(selectedChildOrderAmount)selectedChildOrderAmount.textContent=money(totalAmount);
  if(selectedChildOrderDebt)selectedChildOrderDebt.textContent=money(totalDebt);
}

async function submitMasterOrder(event){
  event.preventDefault();
  if(!masterOrderForm)return;
  const selectedIds=[...selectedChildOrderIds];
  if(!selectedIds.length){showMessage(masterOrderMessage,'Chưa chọn đơn con để gộp',true);return}
  const payload=Object.fromEntries(new FormData(masterOrderForm).entries());
  payload.deliveryDate = payload.deliveryDate || payload.date || today();
  payload.date = payload.deliveryDate;
  payload.childOrderIds=selectedIds;
  try{
    showMessage(masterOrderMessage,'Đang tạo đơn tổng...');
    const res=await fetch('/api/master-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tạo được đơn tổng');
    selectedChildOrderIds.clear();
    masterOrderForm.reset();
    if(masterOrderForm.elements.deliveryDate)masterOrderForm.elements.deliveryDate.value=today();
    showMessage(masterOrderMessage,json.message||'Đã tạo đơn tổng');
    await loadMasterOrderModule();
    await loadSalesOrders();
  }catch(err){showMessage(masterOrderMessage,err.message,true)}
}

function selectedMasterOrders(){
  const checks=[...document.querySelectorAll('.master-order-check:checked')];
  return checks.map(ch=>masterOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
}
function toggleSelectAllMasterOrders(){
  const checks=[...document.querySelectorAll('.master-order-check')];
  if(!checks.length)return;
  const shouldCheck=checks.some(ch=>!ch.checked);
  checks.forEach(ch=>{ch.checked=shouldCheck;});
  if(selectAllMasterOrdersButton)selectAllMasterOrdersButton.textContent=shouldCheck?'Bỏ chọn tất cả':'Chọn tất cả';
}
async function printSelectedMasterOrders(){
  const orders=selectedMasterOrders();
  if(!orders.length){alert('Chưa chọn đơn tổng để in');return}

  // Nút In đơn tổng trên danh sách đơn tổng phải in 1 phiếu tổng hợp chung
  // cho toàn bộ các đơn tổng đã tick. Backend sẽ lấy tất cả đơn con của các
  // đơn tổng được chọn, gộp sản phẩm trùng theo mã hàng + tên + ĐVT + giá,
  // rồi trả HTML in chung. Không in từng đơn tổng rời rạc nữa.
  const ids=orders.map(o=>String(o.id||o.code||o._id||'').trim()).filter(Boolean);
  if(!ids.length){alert('Không xác định được mã đơn tổng để in');return}

  try{
    const res=await fetch('/api/master-orders/print-aggregate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({masterOrderIds:ids})
    });
    const html=await res.text();
    if(!res.ok)throw new Error(html||'Không in được đơn tổng gộp');
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup rồi thử lại.');
    w.document.write(html);
    w.document.close();
  }catch(err){
    alert(err.message||'Không in được đơn tổng gộp');
  }
}
function exportSelectedMasterOrders(){
  const orders=selectedMasterOrders();
  if(!orders.length){alert('Chưa chọn đơn tổng để xuất Excel');return}
  exportErpRows('don-tong.csv', ['Mã chứng từ','Khách hàng/NV','Ngày','Giá trị','Trạng thái'], orders.map(o=>[o.code||o.id||'', `${o.deliveryStaffCode||''} ${o.deliveryStaffName||''}`.trim(), o.deliveryDate||o.date||'', Number(o.totalAmount||0), String(o.status||'active')||'active']));
}
window.printSelectedMasterOrders=printSelectedMasterOrders;
window.toggleSelectAllMasterOrders=toggleSelectAllMasterOrders;
window.exportSelectedMasterOrders=exportSelectedMasterOrders;
async function loadMasterOrders(){
  if(!masterOrderList)return;
  const q=masterOrderSearch?masterOrderSearch.value.trim():'';
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  params.set('dateFrom', masterOrderDateFrom?.value || today());
  params.set('dateTo', masterOrderDateTo?.value || masterOrderDateFrom?.value || today());
  params.set('page','1');
  params.set('limit','50');
  params.set('excludeInactive','1');
  const url=`/api/master-orders${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng');
    masterOrdersCache=(json.masterOrders||[]).filter(isActiveDocument);
    if(masterOrderCount)masterOrderCount.textContent=`${masterOrdersCache.length} đơn tổng`;
    if(!masterOrdersCache.length){masterOrderList.innerHTML='Chưa có đơn tổng nào.';return}
    if(selectAllMasterOrdersButton)selectAllMasterOrdersButton.textContent='Chọn tất cả';
    masterOrderList.innerHTML=masterOrdersCache.map((order,idx)=>`
      <article class="erp-doc-row master-order-one-line">
        <label class="erp-doc-check"><input type="checkbox" class="master-order-check" data-idx="${idx}"></label>
        <strong class="erp-doc-code" title="Mã chứng từ">${escapeHtml(order.code||order.id||'')}</strong>
        <span class="erp-doc-party" title="Khách hàng/NV">${escapeHtml([order.deliveryStaffCode,order.deliveryStaffName].filter(Boolean).join(' ') || order.routeName || '')}</span>
        <span class="erp-doc-date" title="Ngày">${escapeHtml(order.deliveryDate||order.date||'')}</span>
        <strong class="erp-doc-value" title="Giá trị">${money(order.totalAmount)}</strong>
        <span class="erp-doc-note" title="Ghi chú">${escapeHtml(order.note || order.deliveryNote || '')}</span>
        <span class="erp-doc-status" title="Trạng thái">${masterStatusLabel(order.status)}</span>
        <div class="erp-doc-actions">
          <button class="small" onclick="editMasterOrder(${idx})">Sửa</button>
          ${isActiveDocument(order)?`<button class="small danger" onclick="cancelMasterOrder('${escapeHtml(order.id||order.code||'')}')">Hủy</button>`:''}
        </div>
        <details class="erp-doc-details"><summary>Xem đơn con (${money(order.totalOrders || (order.children||[]).length)})</summary><ul class="order-items">${(order.children||[]).map(child=>`<li><strong>${escapeHtml(child.code||'')}</strong> · ${escapeHtml(child.customerCode||'')} ${escapeHtml(child.customerName||'')} · ${money(child.totalAmount)} · Còn thu ${money(child.debtAmount)}</li>`).join('')}</ul></details>
      </article>`).join('');
  }catch(err){
    if(masterOrderCount)masterOrderCount.textContent='Lỗi tải đơn tổng';
    masterOrderList.innerHTML=err.message;
  }
}


async function editMasterOrder(idx){
  const order=masterOrdersCache?.[Number(idx)];
  if(!order)return;
  const routeName=prompt('Tuyến / khu vực', order.routeName||'');
  if(routeName===null)return;
  const deliveryStaffCode=prompt('Mã NV giao hàng', order.deliveryStaffCode||'');
  if(deliveryStaffCode===null)return;
  const deliveryStaffName=prompt('Tên NV giao hàng', order.deliveryStaffName||'');
  if(deliveryStaffName===null)return;
  const note=prompt('Ghi chú', order.note||'');
  if(note===null)return;
  try{
    const res=await fetch(`/api/master-orders/${encodeURIComponent(order.id||order.code)}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({routeName,deliveryStaffCode,deliveryStaffName,note})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không sửa được đơn tổng');
    showMessage(masterOrderMessage,json.message||'Đã sửa đơn tổng');
    await loadMasterOrders();
  }catch(err){alert(err.message||'Không sửa được đơn tổng')}
}
window.editMasterOrder=editMasterOrder;

async function cancelMasterOrder(id){
  if(!confirm('Hủy gộp đơn tổng này và trả các đơn con về trạng thái chưa gộp?'))return;
  try{
    const res=await fetch(`/api/master-orders/${encodeURIComponent(id)}/cancel`,{method:'POST'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không hủy được đơn tổng');
    showMessage(masterOrderMessage,json.message||'Đã hủy gộp');
    selectedChildOrderIds.clear();
    await loadMasterOrderModule();
    await loadSalesOrders();
  }catch(err){alert(err.message)}
}
window.cancelMasterOrder=cancelMasterOrder;

async function loadMasterOrderModule(){
  await loadUnmergedChildOrders();
  await loadMasterOrders();
}



// ==========================================================================
// V45 CLEAN REBUILD - Đơn đi giao hôm nay
// Mục tiêu: màn phần mềm và app giao hàng dùng cùng 1 nguồn dữ liệu:
// - Danh sách đơn: /api/master-orders/delivery-today-orders
// - SL hàng trả: returnOrders, ghép vào order.items theo productCode
// - Lưu hàng trả web: /api/return-orders/by-sales-order/:key/items
// - Lưu tiền thu web: PATCH /api/master-orders/delivery-today/:id
// ===========================================================================

let deliveryRowsCache = [];
let selectedDeliveryOrderId = '';
let selectedDeliveryAccountingIds = new Set();

function deliveryToNumber(value){
  const n = Number(String(value ?? 0).replace(/,/g,''));
  return Number.isFinite(n) ? n : 0;
}
function deliveryMoney(value){
  return money(Math.round(deliveryToNumber(value)));
}
function deliveryText(value){ return escapeHtml(String(value ?? '')); }
function deliveryCode(row={}){ return row.displayOrderCode || row.salesOrderCode || row.orderCode || row.code || row.id || ''; }
function deliveryDebtBase(row={}){ return deliveryToNumber(row.totalReceivable ?? row.totalAmount ?? row.amount ?? row.debtBeforeCollection ?? 0); }
function deliveryCash(row={}){ return deliveryToNumber(row.cashAmount ?? row.cashCollected ?? 0); }
function deliveryBank(row={}){ return deliveryToNumber(row.bankAmount ?? row.bankCollected ?? row.transferAmount ?? 0); }
function deliveryReward(row={}){ return deliveryToNumber(row.rewardAmount ?? row.bonusAmount ?? row.displayRewardAmount ?? 0); }
function deliveryLineCode(item={}){ return String(item.productCode || item.code || item.productId || item.sku || '').trim(); }
function deliveryLineName(item={}){ return item.productName || item.name || item.product || ''; }
function deliveryLineQty(item={}){ return deliveryToNumber(item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.totalQty ?? item.qtySold ?? item.quantity ?? item.qty ?? 0); }
function deliveryLineReturnQty(item={}){ return deliveryToNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? 0); }
function deliveryLinePrice(item={}){ return deliveryToNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0); }
function deliveryLineKey(item={}){ return `${deliveryLineCode(item)}|${item.unit||item.baseUnit||''}|${deliveryLinePrice(item)}`; }
function deliveryReturnAmount(row={}){
  const items = Array.isArray(row.returnOrderItems) ? row.returnOrderItems : (Array.isArray(row.deliveryReturnItems) ? row.deliveryReturnItems : (Array.isArray(row.items) ? row.items : []));
  const fromItems = items.reduce((sum,item)=>sum + Math.round(deliveryLineReturnQty(item) * deliveryLinePrice(item)), 0);
  if(fromItems > 0) return fromItems;
  return deliveryToNumber(row.returnAmountFromReturnOrders ?? row.returnAmount ?? row.returnedAmount ?? row.totalReturnAmount ?? 0);
}
function deliveryDebt(row={}){
  const debt = deliveryDebtBase(row) - deliveryCash(row) - deliveryBank(row) - deliveryReward(row) - deliveryReturnAmount(row);
  return Math.max(0, normalizeDebtAmount(debt));
}
function deliveryStatusLabel(status){
  const s = String(status || '').toLowerCase();
  if(['delivered','done','completed','paid'].includes(s)) return 'Đã giao';
  if(['delivering','shipping'].includes(s)) return 'Đang giao';
  if(['not_delivered','failed'].includes(s)) return 'Không giao';
  return 'Chờ giao';
}
function getSelectedDeliveryRow(){
  return deliveryRowsCache.find(row => String(row.id) === String(selectedDeliveryOrderId));
}
window.getSelectedDeliveryRow = getSelectedDeliveryRow;

function normalizeDeliveryRow(row={}){
  const items = Array.isArray(row.returnOrderItems) && row.returnOrderItems.length
    ? row.returnOrderItems
    : (Array.isArray(row.deliveryReturnItems) && row.deliveryReturnItems.length ? row.deliveryReturnItems : (Array.isArray(row.items) ? row.items : []));
  return {
    ...row,
    id: row.id || row.salesOrderId || row.orderId || row.code || row.salesOrderCode || '',
    code: deliveryCode(row),
    returnOrderItems: items,
    deliveryReturnItems: items,
    items,
    returnAmount: deliveryReturnAmount({...row, returnOrderItems: items}),
    debtAmount: deliveryDebt({...row, returnOrderItems: items})
  };
}

function deliverySummaryParams(){
  const params = new URLSearchParams();
  const date = deliveryDateFilter?.value || today();
  const delivery = deliveryStaffFilter?.value?.trim?.() || '';
  const sales = deliverySalesmanFilter?.value?.trim?.() || '';
  const status = deliveryStatusFilter?.value || '';
  if(date) params.set('date', date);
  if(delivery){ params.set('delivery', delivery); params.set('deliveryStaffCode', delivery); }
  if(sales){ params.set('salesStaffCode', sales); params.set('salesStaff', sales); params.set('salesman', sales); }
  if(status) params.set('status', status);
  params.set('limit','5000');
  return params;
}

function buildDeliveryKpiFromRows(rows=[]){
  return rows.reduce((acc,row)=>{
    acc.totalReceivable += deliveryDebtBase(row);
    acc.cashAmount += deliveryCash(row);
    acc.bankAmount += deliveryBank(row);
    acc.bonusAmount += deliveryReward(row);
    acc.returnAmount += deliveryReturnAmount(row);
    acc.debtAmount += deliveryDebt(row);
    return acc;
  }, { totalReceivable:0, cashAmount:0, bankAmount:0, bonusAmount:0, returnAmount:0, debtAmount:0 });
}
function updateDeliveryKpis(summary){
  summary = summary || buildDeliveryKpiFromRows(deliveryRowsCache);
  if(deliveryTotalKpi) deliveryTotalKpi.textContent = deliveryMoney(summary.totalReceivable);
  if(deliveryRunningKpi) deliveryRunningKpi.textContent = deliveryMoney(summary.cashAmount);
  if(deliveryDoneKpi) deliveryDoneKpi.textContent = deliveryMoney(summary.bankAmount);
  if(deliveryUnpaidKpi) deliveryUnpaidKpi.textContent = deliveryMoney(summary.bonusAmount);
  if(deliveryLateKpi) deliveryLateKpi.textContent = deliveryMoney(summary.returnAmount);
  if(deliveryDebtKpi) deliveryDebtKpi.textContent = deliveryMoney(summary.debtAmount);
}

function deliveryAccountingSelectableRows(){
  return deliveryRowsCache.filter(row => !(row.accountingConfirmed || row.editLocked || row.accountingLocked));
}
function syncDeliveryAccountingSelection(){
  const valid = new Set(deliveryAccountingSelectableRows().map(row => String(row.id)));
  selectedDeliveryAccountingIds = new Set([...selectedDeliveryAccountingIds].filter(id => valid.has(String(id))));
  document.querySelectorAll('.delivery-accounting-checkbox').forEach(cb=>{
    cb.checked = selectedDeliveryAccountingIds.has(String(cb.value));
    const card = cb.closest('.delivery-card');
    if(card) card.classList.toggle('accounting-selected', cb.checked);
  });
  const selectedCount = selectedDeliveryAccountingIds.size;
  if(confirmDeliveryAccountingButton){
    confirmDeliveryAccountingButton.disabled = !selectedCount;
    confirmDeliveryAccountingButton.textContent = selectedCount ? `Đẩy ${selectedCount} đơn sang công nợ` : 'Đẩy đơn đã chọn sang công nợ';
  }
  if(selectAllDeliveryAccountingButton){
    const selectableCount = valid.size;
    const allSelected = selectableCount && selectedCount === selectableCount;
    selectAllDeliveryAccountingButton.disabled = !selectableCount;
    selectAllDeliveryAccountingButton.textContent = allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  }
}
function toggleDeliveryAccountingSelection(id, checked){
  const key = String(id || '');
  if(!key) return;
  if(checked) selectedDeliveryAccountingIds.add(key); else selectedDeliveryAccountingIds.delete(key);
  syncDeliveryAccountingSelection();
}
function selectAllDeliveryAccounting(){
  const ids = deliveryAccountingSelectableRows().map(row => String(row.id));
  const allSelected = ids.length && ids.every(id => selectedDeliveryAccountingIds.has(id));
  selectedDeliveryAccountingIds = allSelected ? new Set() : new Set(ids);
  syncDeliveryAccountingSelection();
}
function clearDeliveryAccountingSelection(){ selectedDeliveryAccountingIds.clear(); syncDeliveryAccountingSelection(); }
window.toggleDeliveryAccountingSelection = toggleDeliveryAccountingSelection;
window.selectAllDeliveryAccounting = selectAllDeliveryAccounting;
window.clearDeliveryAccountingSelection = clearDeliveryAccountingSelection;

function renderDeliveryTodaySummary(){
  if(!deliveryTodayList) return;
  if(!deliveryRowsCache.length){
    deliveryTodayList.innerHTML = '<div class="empty-state">Không có đơn giao theo bộ lọc.</div>';
    syncDeliveryAccountingSelection();
    return;
  }
  deliveryTodayList.innerHTML = deliveryRowsCache.map(row=>{
    const locked = Boolean(row.accountingConfirmed || row.editLocked || row.accountingLocked);
    const checked = selectedDeliveryAccountingIds.has(String(row.id));
    const selected = String(row.id) === String(selectedDeliveryOrderId);
    const debt = deliveryDebt(row);
    const customerLine = [row.customerCode || row.customerId || '', row.customerName || ''].filter(Boolean).join(' - ');
    const staffLine = [row.salesStaffCode ? `NVBH: ${row.salesStaffCode}` : '', row.deliveryStaffCode ? `NVGH: ${row.deliveryStaffCode}` : ''].filter(Boolean).join(' · ');
    return `<article class="delivery-card delivery-compact-card delivery-customer-card delivery-list-row delivery-kpi-row ${selected?'selected':''} ${locked?'accounting-locked':''} ${debt > 0 ? 'has-debt' : 'no-debt'}" data-id="${deliveryText(row.id)}" onclick="selectDeliveryOrder(this.dataset.id)">
      <label class="delivery-kpi-check" onclick="event.stopPropagation()" title="Chọn đẩy sang công nợ">
        <input class="delivery-accounting-checkbox" type="checkbox" value="${deliveryText(row.id)}" ${checked?'checked':''} ${locked?'disabled':''} onchange="toggleDeliveryAccountingSelection(this.value,this.checked)" />
      </label>
      <div class="delivery-kpi-main">
        <div class="delivery-kpi-title"><strong>${deliveryText(deliveryCode(row))}</strong><span>${deliveryText(customerLine || 'Không rõ khách')}</span></div>
        <div class="delivery-kpi-sub">${deliveryText(staffLine || deliveryStatusLabel(row.status || row.deliveryStatus))}</div>
      </div>
      <div class="delivery-kpi-metrics" aria-label="Chỉ số giao hàng">
        <span class="delivery-mini-metric metric-pt" title="Phải thu"><em>PT</em><b>${deliveryMoney(deliveryDebtBase(row))}</b></span>
        <span class="delivery-mini-metric metric-tm" title="Tiền mặt"><em>TM</em><b>${deliveryMoney(deliveryCash(row))}</b></span>
        <span class="delivery-mini-metric metric-ck" title="Chuyển khoản"><em>CK</em><b>${deliveryMoney(deliveryBank(row))}</b></span>
        <span class="delivery-mini-metric metric-th" title="Trả thưởng"><em>TH</em><b>${deliveryMoney(deliveryReward(row))}</b></span>
        <span class="delivery-mini-metric metric-ht" title="Hàng trả"><em>HT</em><b>${deliveryMoney(deliveryReturnAmount(row))}</b></span>
        <span class="delivery-mini-metric metric-cn ${debt > 0 ? 'debt-open' : 'debt-done'}" title="Còn nợ"><em>CN</em><b>${debt > 0 ? deliveryMoney(debt) : 'Đủ'}</b></span>
      </div>
    </article>`;
  }).join('');
  syncDeliveryAccountingSelection();
}

function resetDeliveryEditPanel(){
  selectedDeliveryOrderId = '';
  if(deliveryEditForm) deliveryEditForm.reset();
  if(deliveryEditOrderId) deliveryEditOrderId.value = '';
  if(deliveryEditStatus) deliveryEditStatus.textContent = 'Chưa chọn đơn';
  if(deliverySelectedSummary) deliverySelectedSummary.textContent = 'Chưa chọn đơn giao hàng.';
  if(deliveryReturnItems) deliveryReturnItems.innerHTML = '<div class="empty-state">Chọn đơn để hiển thị sản phẩm.</div>';
  if(deliveryReturnTotalText) deliveryReturnTotalText.textContent = '0';
  if(deliveryEditTotalBox) deliveryEditTotalBox.textContent = 'Chọn đơn để xem tổng kết.';
  if(deliveryEditMessage) deliveryEditMessage.textContent = '';
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
}
window.resetDeliveryEditPanel = resetDeliveryEditPanel;

function getDeliveryReturnItemsPayload(){
  if(!deliveryReturnItems) return [];
  return Array.from(deliveryReturnItems.querySelectorAll('[data-return-code]')).map(input=>{
    const qty = Math.max(0, deliveryToNumber(input.value));
    const price = deliveryToNumber(input.dataset.price);
    return {
      lineKey: input.dataset.lineKey || '',
      productCode: input.dataset.returnCode || '',
      productName: input.dataset.returnName || '',
      soldQty: deliveryToNumber(input.dataset.orderQty),
      quantitySold: deliveryToNumber(input.dataset.orderQty),
      price,
      salePrice: price,
      unitPrice: price,
      returnQty: qty,
      qtyReturn: qty,
      returnQuantity: qty,
      quantity: qty,
      amount: Math.round(qty * price),
      returnAmount: Math.round(qty * price)
    };
  });
}

function updateDeliveryReturnTotal(){
  const total = getDeliveryReturnItemsPayload().reduce((sum,item)=>sum + deliveryToNumber(item.amount),0);
  if(deliveryEditReturn) deliveryEditReturn.value = Math.round(total);
  if(deliveryReturnTotalText) deliveryReturnTotalText.textContent = deliveryMoney(total);
  renderDeliveryEditTotal();
}
window.updateDeliveryReturnTotal = updateDeliveryReturnTotal;

function getDeliveryEditPaymentState(){
  const before = deliveryToNumber(deliveryEditDebtBefore?.value);
  const cash = deliveryToNumber(deliveryEditCash?.value);
  const bank = deliveryToNumber(deliveryEditBank?.value);
  const reward = deliveryToNumber(deliveryEditReward?.value);
  const returned = deliveryToNumber(deliveryEditReturn?.value);
  const paid = cash + bank + reward + returned;
  const diff = normalizeDebtAmount(paid - before);
  return { before, cash, bank, reward, returned, paid, debt: diff < 0 ? Math.abs(diff) : 0, over: diff > 0 ? diff : 0 };
}
function renderDeliveryEditTotal(){
  if(!deliveryEditTotalBox) return;
  const s = getDeliveryEditPaymentState();
  deliveryEditTotalBox.innerHTML = `<div class="delivery-total-chip total-receivable"><span>Phải thu</span><b>${deliveryMoney(s.before)}</b></div>
    <div class="delivery-total-chip"><span>Tiền mặt</span><b>${deliveryMoney(s.cash)}</b></div>
    <div class="delivery-total-chip"><span>Chuyển khoản</span><b>${deliveryMoney(s.bank)}</b></div>
    <div class="delivery-total-chip"><span>Hàng trả</span><b>${deliveryMoney(s.returned)}</b></div>
    <div class="delivery-total-chip"><span>Trả thưởng</span><b>${deliveryMoney(s.reward)}</b></div>
    <div class="delivery-total-chip"><span>Đã nhập</span><b>${deliveryMoney(s.paid)}</b></div>
    <div class="delivery-total-chip summary-inline-item total-debt"><span>Còn nợ</span><b>${deliveryMoney(s.debt)}</b></div>
    <div class="delivery-total-chip summary-inline-item total-overpay"><span>Trả vượt</span><b>${deliveryMoney(s.over)}</b></div>`;
}

function renderDeliveryReturnItems(row){
  if(!deliveryReturnItems) return;
  const items = Array.isArray(row.returnOrderItems) && row.returnOrderItems.length ? row.returnOrderItems : (Array.isArray(row.items) ? row.items : []);
  if(!items.length){
    deliveryReturnItems.innerHTML = '<div class="empty-state">Đơn này chưa có danh sách sản phẩm.</div>';
    if(deliveryReturnTotalText) deliveryReturnTotalText.textContent = '0';
    if(deliveryEditReturn) deliveryEditReturn.value = 0;
    return;
  }
  const locked = Boolean(row.accountingConfirmed || row.editLocked || row.accountingLocked || row.masterReturnOrderId || row.masterReturnOrderCode);
  deliveryReturnItems.innerHTML = `<div class="delivery-return-list">${items.map((item,index)=>{
    const code = deliveryLineCode(item) || `SP${index+1}`;
    const name = deliveryLineName(item);
    const qty = deliveryLineQty(item);
    const price = deliveryLinePrice(item);
    const returned = deliveryLineReturnQty(item);
    return `<div class="delivery-return-line">
      <div class="delivery-return-info"><strong>${deliveryText(code)}</strong><span>${deliveryText(name)}</span><small>SL giao: ${deliveryMoney(qty)} · Giá bán: ${deliveryMoney(price)}</small></div>
      <label>SL trả
        <input data-return-code="${deliveryText(code)}" data-return-name="${deliveryText(name)}" data-line-key="${deliveryText(deliveryLineKey(item))}" data-order-qty="${qty}" data-price="${price}" type="number" min="0" max="${qty || ''}" step="1" value="${returned}" ${locked?'disabled readonly':''} />
      </label>
    </div>`;
  }).join('')}</div>`;
  deliveryReturnItems.querySelectorAll('[data-return-code]').forEach(input=>input.addEventListener('input', updateDeliveryReturnTotal));
  updateDeliveryReturnTotal();
}

function fillDeliveryEditPanel(row){
  if(!row) return resetDeliveryEditPanel();
  selectedDeliveryOrderId = String(row.id || '');
  if(deliveryEditOrderId) deliveryEditOrderId.value = row.id || '';
  if(deliveryEditOrderCode) deliveryEditOrderCode.value = deliveryCode(row);
  if(deliveryEditCustomerName) deliveryEditCustomerName.value = row.customerName || '';
  if(deliveryEditStaffCode) deliveryEditStaffCode.value = row.deliveryStaffCode || '';
  if(deliveryEditRouteName) deliveryEditRouteName.value = row.routeName || '';
  if(deliveryEditDebtBefore) deliveryEditDebtBefore.value = Math.round(deliveryDebtBase(row));
  if(deliveryEditCash) deliveryEditCash.value = Math.round(deliveryCash(row));
  if(deliveryEditBank) deliveryEditBank.value = Math.round(deliveryBank(row));
  if(deliveryEditReward) deliveryEditReward.value = Math.round(deliveryReward(row));
  if(deliveryEditReturn) deliveryEditReturn.value = Math.round(deliveryReturnAmount(row));
  if(deliveryEditDebt) deliveryEditDebt.value = Math.round(deliveryDebt(row));
  if(deliveryEditStatus) deliveryEditStatus.textContent = deliveryStatusLabel(row.deliveryStatus || row.status);
  if(deliverySelectedSummary){
    deliverySelectedSummary.innerHTML = `<div class="delivery-selected-title"><strong>${deliveryText(deliveryCode(row))}</strong><span class="delivery-selected-status ${deliveryDebt(row)>0?'debt-positive':'debt-zero'}">Còn nợ tạm tính: ${deliveryMoney(deliveryDebt(row))}</span></div>
      <div class="delivery-selected-customer"><b>${deliveryText(row.customerCode || '')}</b> · ${deliveryText(row.customerName || '')}</div>
      <div class="delivery-selected-meta"><span>Phải thu: <b>${deliveryMoney(deliveryDebtBase(row))}</b></span><span>NVBH: <b>${deliveryText(row.salesStaffCode || row.salesmanCode || '')}</b></span><span>NVGH: <b>${deliveryText(row.deliveryStaffCode || '')}</b></span></div>`;
  }
  renderDeliveryReturnItems(row);
  renderDeliveryEditTotal();
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
  const card = document.querySelector(`.delivery-card[data-id="${CSS.escape(String(row.id||''))}"]`);
  if(card) card.classList.add('selected');
}
window.fillDeliveryEditPanel = fillDeliveryEditPanel;

function selectDeliveryOrder(id){
  const row = deliveryRowsCache.find(item => String(item.id) === String(id));
  if(row) fillDeliveryEditPanel(row);
}
window.selectDeliveryOrder = selectDeliveryOrder;

async function loadDeliveryToday(){
  if(deliveryTodayList) deliveryTodayList.innerHTML = '<div class="empty-state">Đang tải đơn đi giao...</div>';
  try{
    const params = deliverySummaryParams();
    const res = await fetch(`/api/master-orders/delivery-today-orders?${params.toString()}`);
    const json = await deliveryReadJsonResponse(res, 'Không tải được đơn đi giao hôm nay');
    if(!json.ok) throw new Error(json.message || 'Không tải được đơn đi giao hôm nay');
    deliveryRowsCache = (json.rows || json.orders || []).map(normalizeDeliveryRow);
    updateDeliveryKpis(buildDeliveryKpiFromRows(deliveryRowsCache));
    if(deliveryAccountingStatus){
      deliveryAccountingStatus.textContent = `Đang hiển thị ${deliveryRowsCache.length} đơn. Nguồn hàng trả: returnOrders; danh sách sản phẩm đồng bộ cùng app giao hàng.`;
    }
    renderDeliveryTodaySummary();
    const selectedStillExists = deliveryRowsCache.some(row => String(row.id) === String(selectedDeliveryOrderId));
    if(selectedStillExists) fillDeliveryEditPanel(getSelectedDeliveryRow()); else resetDeliveryEditPanel();
  }catch(err){
    if(deliveryTodayList) deliveryTodayList.innerHTML = `<div class="empty-state danger-text">${deliveryText(err.message)}</div>`;
  }
}
window.loadDeliveryToday = loadDeliveryToday;

async function saveDeliveryReturnItemsTwoWay(row){
  const key = String(row.salesOrderId || row.id || row.salesOrderCode || row.orderCode || row.code || '').trim();
  if(!key) throw new Error('Không xác định được đơn để lưu hàng trả');
  const date = deliveryDateFilter?.value || row.deliveryDate || today();
  const items = getDeliveryReturnItemsPayload();
  const res = await fetch(`/api/return-orders/by-sales-order/${encodeURIComponent(key)}/items`,{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      salesOrderId: row.salesOrderId || row.id || '',
      salesOrderCode: row.salesOrderCode || row.orderCode || row.code || '',
      date, deliveryDate: date, documentDate: date,
      deliveryStaffCode: row.deliveryStaffCode || '', deliveryStaffName: row.deliveryStaffName || '',
      salesStaffCode: row.salesStaffCode || row.salesmanCode || '', salesStaffName: row.salesStaffName || row.salesmanName || '',
      customerCode: row.customerCode || '', customerName: row.customerName || '',
      source:'web_delivery_today_clean', updatedFrom:'web_delivery_today_clean',
      items
    })
  });
  const json = await deliveryReadJsonResponse(res, 'Không lưu được hàng trả');
  if(!json.ok) throw new Error(json.message || 'Không lưu được hàng trả');
  return json.returnOrder;
}

async function submitDeliveryEdit(event){
  event.preventDefault();
  const row = getSelectedDeliveryRow();
  if(!row){ showMessage(deliveryEditMessage, 'Chưa chọn đơn để lưu', true); return; }
  const state = getDeliveryEditPaymentState();
  if(state.over > 0){ alert(`Khách đang trả vượt: ${deliveryMoney(state.over)}`); renderDeliveryEditTotal(); return; }
  try{
    showMessage(deliveryEditMessage, 'Đang đồng bộ hàng trả vào returnOrders...');
    await saveDeliveryReturnItemsTwoWay(row);
    const payload = {
      orderId: row.id,
      orderCode: deliveryCode(row),
      cashCollected: deliveryToNumber(deliveryEditCash?.value),
      cashAmount: deliveryToNumber(deliveryEditCash?.value),
      bankCollected: deliveryToNumber(deliveryEditBank?.value),
      bankAmount: deliveryToNumber(deliveryEditBank?.value),
      rewardAmount: deliveryToNumber(deliveryEditReward?.value),
      returnAmount: deliveryToNumber(deliveryEditReturn?.value),
      debtBeforeCollection: deliveryToNumber(deliveryEditDebtBefore?.value),
      debtAmount: state.debt,
      deliveryStatus: 'delivered',
      status: 'delivered'
    };
    showMessage(deliveryEditMessage, 'Đang lưu tiền thu...');
    const res = await fetch(`/api/master-orders/delivery-today/${encodeURIComponent(row.id)}`,{
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    const json = await deliveryReadJsonResponse(res, 'Không lưu được chỉnh sửa');
    if(!json.ok) throw new Error(json.message || 'Không lưu được chỉnh sửa');
    showMessage(deliveryEditMessage, 'Đã lưu và đồng bộ với app giao hàng');
    await loadDeliveryToday();
    if(row.id) selectDeliveryOrder(row.id);
  }catch(err){ showMessage(deliveryEditMessage, err.message, true); }
}
window.submitDeliveryEdit = submitDeliveryEdit;

async function confirmDeliveryAccounting(){
  syncDeliveryAccountingSelection();
  const selectedIds = [...selectedDeliveryAccountingIds];
  if(!selectedIds.length){ alert('Chưa chọn đơn nào để đẩy sang công nợ.'); return; }
  if(!confirm(`Đẩy ${selectedIds.length} đơn đã chọn sang công nợ?`)) return;
  try{
    const res = await fetch('/api/master-orders/delivery-today/confirm-accounting',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ date: deliveryDateFilter?.value || today(), orderIds: selectedIds })
    });
    const json = await deliveryReadJsonResponse(res, 'Không xác nhận được kế toán');
    if(!json.ok) throw new Error(json.message || 'Không xác nhận được kế toán');
    selectedDeliveryAccountingIds.clear();
    alert(json.message || 'Đã đẩy đơn sang công nợ');
    await loadDeliveryToday();
  }catch(err){ alert(err.message || 'Không xác nhận được kế toán'); }
}
window.confirmDeliveryAccounting = confirmDeliveryAccounting;

async function adminUnlockSelectedDeliveryOrder(){ alert('Chức năng mở khóa giữ theo backend cũ. Vui lòng mở ở quyền admin nếu cần.'); }
async function reAccountingSelectedDeliveryOrder(){ await confirmDeliveryAccounting(); }
window.adminUnlockSelectedDeliveryOrder = adminUnlockSelectedDeliveryOrder;
window.reAccountingSelectedDeliveryOrder = reAccountingSelectedDeliveryOrder;

async function createDeliveryCashSubmissionFromToday(){
  const deliveryStaffCode = deliveryStaffFilter?.value?.trim?.() || '';
  if(!deliveryStaffCode){ alert('Cần chọn nhân viên giao hàng trước khi tạo phiếu nộp quỹ.'); return; }
  try{
    const res = await fetch('/api/funds/delivery-cash-submissions',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ deliveryDate: deliveryDateFilter?.value || today(), deliveryStaffCode })
    });
    const json = await deliveryReadJsonResponse(res,'Không tạo được phiếu nộp quỹ');
    if(!json.ok) throw new Error(json.message || 'Không tạo được phiếu nộp quỹ');
    alert(json.message || 'Đã tạo phiếu nộp quỹ');
  }catch(err){ alert(err.message || 'Không tạo được phiếu nộp quỹ'); }
}
window.createDeliveryCashSubmissionFromToday = createDeliveryCashSubmissionFromToday;

[deliveryEditCash, deliveryEditBank, deliveryEditReward].forEach(input=>{
  if(input) input.addEventListener('input', renderDeliveryEditTotal);
});
if(deliveryEditForm) deliveryEditForm.addEventListener('submit', submitDeliveryEdit);
if(deliveryEditResetButton) deliveryEditResetButton.addEventListener('click', resetDeliveryEditPanel);
if(reloadDeliveryTodayButton) reloadDeliveryTodayButton.addEventListener('click', loadDeliveryToday);
if(confirmDeliveryAccountingButton) confirmDeliveryAccountingButton.addEventListener('click', confirmDeliveryAccounting);
if(selectAllDeliveryAccountingButton) selectAllDeliveryAccountingButton.addEventListener('click', selectAllDeliveryAccounting);
if(clearDeliveryAccountingSelectionButton) clearDeliveryAccountingSelectionButton.addEventListener('click', clearDeliveryAccountingSelection);
if(createDeliveryCashSubmissionButton) createDeliveryCashSubmissionButton.addEventListener('click', createDeliveryCashSubmissionFromToday);
[deliveryDateFilter, deliveryStaffFilter, deliverySalesmanFilter, deliveryStatusFilter].forEach(input=>{
  if(input) input.addEventListener('change', loadDeliveryToday);
});
[deliveryStaffFilter, deliverySalesmanFilter].forEach(input=>{
  if(input) input.addEventListener('keyup', ()=>{ clearTimeout(input.__deliveryTimer); input.__deliveryTimer = setTimeout(loadDeliveryToday, 350); });
});


window.clearDeliveryEditPanel = window.clearDeliveryEditPanel || function () {};


window.clearDeliveryEditPanel =
  window.clearDeliveryEditPanel || function () {};

window.recalcDeliveryEditDebt =
  window.recalcDeliveryEditDebt || function () {};

window.renderDeliveryEditPanel =
  window.renderDeliveryEditPanel || function () {};

window.selectDeliveryOrder =
  window.selectDeliveryOrder || function () {};
