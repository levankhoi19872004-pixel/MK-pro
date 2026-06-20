'use strict';

let availableReturnOrders = [];
let selectedReturnOrders = [];
const checkedAvailableReturnIds = new Set();
const checkedSelectedReturnIds = new Set();
let unmergedReturnRequestSeq = 0;
let masterReturnSubmitInFlight = false;

const MASTER_RETURN_INACTIVE_STATES=new Set(['cancelled','canceled','void','voided','deleted','removed','duplicate_cancelled','cleared']);
const MASTER_RETURN_RECEIVED_STATES=new Set(['posted','received','confirmed','completed','accounting_confirmed','posted_to_ar']);

function masterReturnStateValues(order={}){
  return [order.status,order.warehouseStatus,order.warehouseReceiveStatus,order.accountingStatus]
    .map(value=>String(value||'').trim().toLowerCase())
    .filter(Boolean);
}

function isInactiveMasterReturnOrder(order={}){
  return Boolean(order.deletedAt) || masterReturnStateValues(order).some(value=>MASTER_RETURN_INACTIVE_STATES.has(value));
}

function isReceivedMasterReturnOrder(order={}){
  return Boolean(order.stockPosted) || masterReturnStateValues(order).some(value=>MASTER_RETURN_RECEIVED_STATES.has(value));
}

function canReceiveMasterReturnOrder(order={}){
  return !isInactiveMasterReturnOrder(order) && !isReceivedMasterReturnOrder(order);
}

function masterReturnOrderIdentity(row={}){
  return String(row._id||row.id||row.code||'').trim();
}

function masterReturnDeliveryCode(row={}){
  return String(row.deliveryStaffCode||row.deliveryCode||row.nvghCode||'').trim();
}

function masterReturnDeliveryName(row={}){
  return String(row.deliveryStaffName||row.deliveryName||row.nvghName||'').trim();
}

function masterReturnStaffDisplay(row={}){
  const code=masterReturnDeliveryCode(row);
  const name=masterReturnDeliveryName(row);
  return [code,name].filter(Boolean).join(' - ')||'Chưa xác định';
}

function masterReturnNormalizeCode(value=''){
  return String(value||'').trim().toLocaleLowerCase('vi-VN');
}

function masterReturnNormalizeSearch(value=''){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim()
    .toLowerCase();
}

function masterReturnAmount(row={}){
  return Number(row.debtReduction??row.totalAmount??row.amount??0)||0;
}

function masterReturnQuantity(row={}){
  return Number(row.totalQuantity||0)||0;
}

function masterReturnDateValue(row={}){
  return String(row.returnDate||row.deliveryDate||row.date||row.documentDate||row.displayDate||'').slice(0,10);
}

function dedupeMasterReturnRows(rows=[]){
  const map=new Map();
  (Array.isArray(rows)?rows:[]).forEach(row=>{
    const key=masterReturnOrderIdentity(row);
    if(key&&!map.has(key))map.set(key,row);
  });
  return [...map.values()];
}

function selectedMasterReturnIdSet(){
  return new Set(selectedReturnOrders.map(masterReturnOrderIdentity).filter(Boolean));
}

function matchesCurrentReturnFilters(row={}){
  const q=masterReturnNormalizeSearch(document.getElementById('unmergedReturnOrderSearchInput')?.value||'');
  const code=masterReturnNormalizeCode(masterReturnDeliveryStaff?.value||'');
  const dateFrom=String(unmergedReturnDateFrom?.value||'');
  const dateTo=String(unmergedReturnDateTo?.value||'');
  const rowCode=masterReturnNormalizeCode(masterReturnDeliveryCode(row));
  const rowDate=masterReturnDateValue(row);
  if(code&&rowCode!==code)return false;
  if(dateFrom&&rowDate&&rowDate<dateFrom)return false;
  if(dateTo&&rowDate&&rowDate>dateTo)return false;
  if(q){
    const haystack=[row.code,row.id,row.customerCode,row.customerName,row.salesOrderCode,row.orderCode]
      .map(masterReturnNormalizeSearch)
      .join(' ');
    if(!haystack.includes(q))return false;
  }
  return true;
}

function visibleAvailableReturnOrders(){
  const selectedIds=selectedMasterReturnIdSet();
  return availableReturnOrders
    .filter(row=>!selectedIds.has(masterReturnOrderIdentity(row)))
    .filter(matchesCurrentReturnFilters);
}

function setMasterReturnStaffLock(){
  if(masterReturnDeliveryStaff)masterReturnDeliveryStaff.readOnly=selectedReturnOrders.length>0;
}

function syncMasterReturnHeaderFromSelection(){
  const first=selectedReturnOrders[0];
  if(!first){setMasterReturnStaffLock();return;}
  const code=masterReturnDeliveryCode(first);
  const name=masterReturnDeliveryName(first);
  if(masterReturnDeliveryStaff&&code)masterReturnDeliveryStaff.value=code;
  if(masterReturnDeliveryStaffName)masterReturnDeliveryStaffName.value=name;
  setMasterReturnStaffLock();
}

function updateMasterReturnSelectionSummary(){
  const totalQty=selectedReturnOrders.reduce((sum,row)=>sum+masterReturnQuantity(row),0);
  const totalValue=selectedReturnOrders.reduce((sum,row)=>sum+masterReturnAmount(row),0);
  const selectedCountEl=document.getElementById('selectedMasterReturnCount');
  const selectedQtyEl=document.getElementById('selectedMasterReturnQty');
  const selectedValueEl=document.getElementById('selectedMasterReturnValue');
  if(selectedCountEl)selectedCountEl.textContent=money(selectedReturnOrders.length);
  if(selectedQtyEl)selectedQtyEl.textContent=money(totalQty);
  if(selectedValueEl)selectedValueEl.textContent=money(totalValue);
}

function renderAvailableReturnOrders(){
  if(!unmergedReturnOrderTable)return;
  const rows=visibleAvailableReturnOrders();
  const visibleIds=new Set(rows.map(masterReturnOrderIdentity));
  [...checkedAvailableReturnIds].forEach(id=>{if(!visibleIds.has(id))checkedAvailableReturnIds.delete(id);});
  const totalValue=rows.reduce((sum,row)=>sum+masterReturnAmount(row),0);
  const totalQty=rows.reduce((sum,row)=>sum+masterReturnQuantity(row),0);
  if(masterReturnKpiUnmerged)masterReturnKpiUnmerged.textContent=money(rows.length);
  if(masterReturnKpiUnmergedQty)masterReturnKpiUnmergedQty.textContent=money(totalQty);
  if(masterReturnKpiUnmergedValue)masterReturnKpiUnmergedValue.textContent=money(totalValue);
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent=`${rows.length} phiếu · Tổng SL ${money(totalQty)} · Tổng giá trị ${money(totalValue)}`;
  const selectAllButton=document.getElementById('selectAllUnmergedReturnOrdersButton');
  if(selectAllButton)selectAllButton.textContent=rows.length&&rows.every(row=>checkedAvailableReturnIds.has(masterReturnOrderIdentity(row)))?'Bỏ chọn tất cả':'Chọn tất cả';

  const head=`<div class="master-return-grid-row master-return-grid-head master-return-available-row" aria-hidden="true">
    <span></span><span>Mã trả</span><span>Khách hàng</span><span>NVGH</span><span>Ngày trả</span><span>SL</span><span>Giá trị</span>
  </div>`;
  if(!rows.length){
    unmergedReturnOrderTable.innerHTML=head+'<div class="master-return-empty">Không có phiếu trả hàng chưa gộp phù hợp.</div>';
    return;
  }
  const body=rows.map(row=>{
    const id=masterReturnOrderIdentity(row);
    const checked=checkedAvailableReturnIds.has(id);
    const code=String(row.code||row.id||id);
    const customer=[row.customerCode,row.customerName].filter(Boolean).join(' - ')||'Không rõ khách';
    const staff=masterReturnStaffDisplay(row);
    return `<label class="master-return-grid-row master-return-available-row${checked?' is-checked':''}" title="${escapeHtml(code)} | ${escapeHtml(customer)} | ${escapeHtml(staff)}">
      <input type="checkbox" class="master-return-available-check" data-id="${escapeHtml(id)}" ${checked?'checked':''} />
      <strong class="master-return-cell master-return-cell-code" title="${escapeHtml(code)}">${escapeHtml(code)}</strong>
      <span class="master-return-cell" title="${escapeHtml(customer)}">${escapeHtml(customer)}</span>
      <span class="master-return-cell" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="master-return-cell">${escapeHtml(masterReturnDateValue(row))}</span>
      <span class="master-return-cell master-return-cell-qty">${money(masterReturnQuantity(row))}</span>
      <strong class="master-return-cell master-return-cell-money">${money(masterReturnAmount(row))}</strong>
    </label>`;
  }).join('');
  unmergedReturnOrderTable.innerHTML=head+body;
}

function renderSelectedMasterReturnOrderList(){
  if(!selectedMasterReturnOrderList)return;
  const selectedIds=new Set(selectedReturnOrders.map(masterReturnOrderIdentity));
  [...checkedSelectedReturnIds].forEach(id=>{if(!selectedIds.has(id))checkedSelectedReturnIds.delete(id);});
  const head=`<div class="master-return-grid-row master-return-grid-head master-return-selected-row" aria-hidden="true">
    <span></span><span>Mã trả</span><span>Khách hàng</span><span>NVGH</span><span>SL</span><span>Giá trị</span>
  </div>`;
  if(!selectedReturnOrders.length){
    selectedMasterReturnOrderList.innerHTML=head+'<div class="master-return-empty">Chưa có phiếu trả hàng nào được đưa vào danh sách gộp.</div>';
    updateMasterReturnSelectionSummary();
    setMasterReturnStaffLock();
    return;
  }
  const body=selectedReturnOrders.map(row=>{
    const id=masterReturnOrderIdentity(row);
    const checked=checkedSelectedReturnIds.has(id);
    const code=String(row.code||row.id||id);
    const customer=[row.customerCode,row.customerName].filter(Boolean).join(' - ')||'Không rõ khách';
    const staff=masterReturnStaffDisplay(row);
    return `<label class="master-return-grid-row master-return-selected-row${checked?' is-checked':''}" title="${escapeHtml(code)} | ${escapeHtml(customer)} | ${escapeHtml(staff)}">
      <input type="checkbox" class="master-return-selected-check" data-id="${escapeHtml(id)}" ${checked?'checked':''} />
      <strong class="master-return-cell master-return-cell-code" title="${escapeHtml(code)}">${escapeHtml(code)}</strong>
      <span class="master-return-cell" title="${escapeHtml(customer)}">${escapeHtml(customer)}</span>
      <span class="master-return-cell" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="master-return-cell master-return-cell-qty">${money(masterReturnQuantity(row))}</span>
      <strong class="master-return-cell master-return-cell-money">${money(masterReturnAmount(row))}</strong>
    </label>`;
  }).join('');
  selectedMasterReturnOrderList.innerHTML=head+body;
  updateMasterReturnSelectionSummary();
  setMasterReturnStaffLock();
}

function renderMasterReturnPopupLists(){
  renderAvailableReturnOrders();
  renderSelectedMasterReturnOrderList();
}

function isMasterReturnOrderModalOpen(){
  return !!(masterReturnOrderModal&&masterReturnOrderModal.classList.contains('show'));
}
window.isMasterReturnOrderModalOpen=isMasterReturnOrderModalOpen;

function setUnmergedReturnOrdersLoading(isLoading){
  const layer=document.querySelector('#masterReturnOrderModal .master-return-layer-unmerged');
  if(layer)layer.classList.toggle('is-loading',Boolean(isLoading));
  [reloadUnmergedReturnOrdersButton,document.getElementById('selectAllUnmergedReturnOrdersButton'),moveToGroupedReturnOrdersButton]
    .filter(Boolean)
    .forEach(button=>{button.disabled=Boolean(isLoading);});
  if(reloadUnmergedReturnOrdersButton)reloadUnmergedReturnOrdersButton.textContent=isLoading?'Đang tải...':'Tải lại';
}

function openMasterReturnOrderModal(options={}){
  if(!masterReturnOrderModal)return;
  masterReturnOrderModal.classList.add('show');
  masterReturnOrderModal.setAttribute('aria-hidden','false');
  if(masterReturnDate&&!masterReturnDate.value&&typeof today==='function')masterReturnDate.value=today();
  renderMasterReturnPopupLists();
  if(options.skipLoad!==true)loadUnmergedReturnOrders();
}
window.openMasterReturnOrderModal=openMasterReturnOrderModal;

function closeMasterReturnOrderModal(){
  if(!masterReturnOrderModal)return;
  masterReturnOrderModal.classList.remove('show');
  masterReturnOrderModal.setAttribute('aria-hidden','true');
}
window.closeMasterReturnOrderModal=closeMasterReturnOrderModal;

function resetMasterReturnOrderModal(){
  unmergedReturnRequestSeq+=1;
  availableReturnOrders=[];
  selectedReturnOrders=[];
  checkedAvailableReturnIds.clear();
  checkedSelectedReturnIds.clear();
  if(masterReturnOrderForm){
    masterReturnOrderForm.reset();
    if(masterReturnOrderForm.elements.returnDate)masterReturnOrderForm.elements.returnDate.value=typeof today==='function'?today():'';
  }
  if(masterReturnDeliveryStaffName)masterReturnDeliveryStaffName.value='';
  if(unmergedReturnDateFrom)unmergedReturnDateFrom.value='';
  if(unmergedReturnDateTo)unmergedReturnDateTo.value='';
  showMessage(masterReturnOrderMessage,'');
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent='Chưa tải phiếu trả hàng chưa gộp.';
  renderMasterReturnPopupLists();
}
window.resetMasterReturnOrderModal=resetMasterReturnOrderModal;

function toggleAvailableReturnSelection(id,checked){
  const key=String(id||'').trim();
  if(!key)return;
  if(checked)checkedAvailableReturnIds.add(key);
  else checkedAvailableReturnIds.delete(key);
  renderAvailableReturnOrders();
}

function toggleSelectedReturnSelection(id,checked){
  const key=String(id||'').trim();
  if(!key)return;
  if(checked)checkedSelectedReturnIds.add(key);
  else checkedSelectedReturnIds.delete(key);
  renderSelectedMasterReturnOrderList();
}

function toggleSelectAllUnmergedReturnOrders(){
  const rows=visibleAvailableReturnOrders();
  if(!rows.length)return;
  const allChecked=rows.every(row=>checkedAvailableReturnIds.has(masterReturnOrderIdentity(row)));
  rows.forEach(row=>{
    const id=masterReturnOrderIdentity(row);
    if(allChecked)checkedAvailableReturnIds.delete(id);
    else checkedAvailableReturnIds.add(id);
  });
  renderAvailableReturnOrders();
}
window.toggleSelectAllUnmergedReturnOrders=toggleSelectAllUnmergedReturnOrders;

function moveSelectedReturnOrdersToGrouped(){
  const candidates=visibleAvailableReturnOrders().filter(row=>checkedAvailableReturnIds.has(masterReturnOrderIdentity(row)));
  if(!candidates.length){showMessage(masterReturnOrderMessage,'Chưa chọn phiếu trả hàng ở danh sách bên trái',true);return;}
  const candidateCodes=candidates.map(masterReturnDeliveryCode);
  if(candidateCodes.some(code=>!code)){
    showMessage(masterReturnOrderMessage,'Có phiếu chưa xác định mã NVGH, không thể đưa vào gộp',true);
    return;
  }
  const requiredCode=masterReturnDeliveryCode(selectedReturnOrders[0]||{})||String(masterReturnDeliveryStaff?.value||'').trim()||candidateCodes[0];
  const incompatible=candidates.filter(row=>masterReturnNormalizeCode(masterReturnDeliveryCode(row))!==masterReturnNormalizeCode(requiredCode));
  if(incompatible.length){
    const codes=[...new Set(incompatible.map(masterReturnDeliveryCode).filter(Boolean))];
    showMessage(masterReturnOrderMessage,`Một đơn tổng trả chỉ được chứa cùng NVGH ${requiredCode}. Phiếu không phù hợp: ${codes.join(', ')}`,true);
    return;
  }
  selectedReturnOrders=dedupeMasterReturnRows([...selectedReturnOrders,...candidates]);
  candidates.forEach(row=>checkedAvailableReturnIds.delete(masterReturnOrderIdentity(row)));
  syncMasterReturnHeaderFromSelection();
  showMessage(masterReturnOrderMessage,`Đã đưa ${candidates.length} phiếu sang danh sách gộp`);
  renderMasterReturnPopupLists();
}
window.moveSelectedReturnOrdersToGrouped=moveSelectedReturnOrdersToGrouped;

function removeSelectedReturnOrdersFromGrouped(){
  const ids=new Set([...checkedSelectedReturnIds]);
  if(!ids.size){showMessage(masterReturnOrderMessage,'Chưa chọn phiếu ở danh sách bên phải để bỏ',true);return;}
  const removed=selectedReturnOrders.filter(row=>ids.has(masterReturnOrderIdentity(row)));
  selectedReturnOrders=selectedReturnOrders.filter(row=>!ids.has(masterReturnOrderIdentity(row)));
  availableReturnOrders=dedupeMasterReturnRows([...availableReturnOrders,...removed]);
  checkedSelectedReturnIds.clear();
  if(selectedReturnOrders.length)syncMasterReturnHeaderFromSelection();
  else setMasterReturnStaffLock();
  showMessage(masterReturnOrderMessage,`Đã bỏ ${removed.length} phiếu khỏi danh sách gộp`);
  renderMasterReturnPopupLists();
}
window.removeSelectedReturnOrdersFromGrouped=removeSelectedReturnOrdersFromGrouped;

function buildUnmergedReturnOrderParams(){
  const params=new URLSearchParams();
  const q=document.getElementById('unmergedReturnOrderSearchInput')?.value.trim()||'';
  const deliveryStaffCode=String(masterReturnDeliveryStaff?.value||'').trim();
  const dateFrom=String(unmergedReturnDateFrom?.value||'');
  const dateTo=String(unmergedReturnDateTo?.value||'');
  if(q)params.set('q',q);
  if(deliveryStaffCode)params.set('deliveryStaffCode',deliveryStaffCode);
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  params.set('limit','500');
  return params;
}

async function loadUnmergedReturnOrders(){
  if(!unmergedReturnOrderTable)return;
  const requestSeq=++unmergedReturnRequestSeq;
  setUnmergedReturnOrdersLoading(true);
  unmergedReturnOrderTable.innerHTML='<div class="master-return-loading">Đang tải phiếu trả hàng chưa gộp...</div>';
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent='Đang tải phiếu trả hàng chưa gộp...';
  try{
    const params=buildUnmergedReturnOrderParams();
    const res=await (window.fetchWithTimeout||fetch)(`/api/master-return-orders/unmerged-return-orders?${params.toString()}`,{},15000);
    const json=await res.json();
    if(!res.ok||json.ok===false)throw new Error(json.message||'Không tải được phiếu trả hàng chưa gộp');
    if(requestSeq!==unmergedReturnRequestSeq)return;
    availableReturnOrders=dedupeMasterReturnRows(json.returnOrders||[]);
    renderMasterReturnPopupLists();
  }catch(err){
    if(requestSeq!==unmergedReturnRequestSeq)return;
    if(masterReturnKpiUnmerged)masterReturnKpiUnmerged.textContent='0';
    if(masterReturnKpiUnmergedQty)masterReturnKpiUnmergedQty.textContent='0';
    if(masterReturnKpiUnmergedValue)masterReturnKpiUnmergedValue.textContent='0';
    if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent='Không tải được phiếu trả hàng chưa gộp';
    unmergedReturnOrderTable.innerHTML=`<div class="master-return-error">${escapeHtml(err.message||'Không tải được phiếu trả hàng chưa gộp')}</div>`;
  }finally{
    if(requestSeq===unmergedReturnRequestSeq)setUnmergedReturnOrdersLoading(false);
  }
}
window.loadUnmergedReturnOrders=loadUnmergedReturnOrders;

function renderMasterReturnOrders(rows = []){
  if(!masterReturnOrderTable)return;
  const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const totalQty=rows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  if(masterReturnKpiMasterCount)masterReturnKpiMasterCount.textContent=money(rows.length);
  if(masterReturnKpiMasterValue)masterReturnKpiMasterValue.textContent=money(totalValue);
  if(masterReturnOrderCount)masterReturnOrderCount.innerHTML=`${rows.length} đơn tổng · Tổng SL ${money(totalQty)} · Tổng giá trị ${money(totalValue)}`;
  const head=`<div class="master-return-list-head"><span></span><span>Mã đơn tổng trả</span><span>NV giao</span><span>Ngày trả</span><span>Giá trị</span><span>Huỷ đơn</span></div>`;
  if(!rows.length){
    masterReturnOrderTable.innerHTML=head+'<div class="empty-state">Chưa có đơn tổng trả hàng.</div>';
    return;
  }
  window.__masterReturnOrdersCache=rows;
  if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.textContent='Chọn tất cả';
  masterReturnOrderTable.innerHTML=head+rows.map((r,idx)=>{
    const inactive=isInactiveMasterReturnOrder(r);
    const locked=isReceivedMasterReturnOrder(r);
    const staff=debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName);
    const id=escapeHtml(r.id||r.code||'');
    const checkboxDisabled=inactive?'disabled':'';
    const checkboxTitle=inactive?'Đơn đã hủy/xóa, không thể chọn':(locked?'Đơn đã nhập kho; chỉ nên chọn để in':'Chọn đơn tổng trả');
    const cancelCell=inactive
      ? `<span class="erp-doc-action-state">Đã hủy</span>`
      : locked
        ? `<span class="erp-doc-action-state">Đã khóa</span>`
        : `<button class="secondary small danger" type="button" onclick="cancelMasterReturnOrder('${id}')">Hủy</button>`;
    return `<article class="erp-doc-row master-return-one-line${inactive?' is-inactive':''}">
      <label class="erp-doc-check" title="${escapeHtml(checkboxTitle)}"><input type="checkbox" class="master-return-order-check" data-idx="${idx}" ${checkboxDisabled}></label>
      <strong class="erp-doc-code" title="${escapeHtml(r.code||r.id||'')}">${escapeHtml(r.code||r.id||'')}</strong>
      <span class="erp-doc-party" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="erp-doc-date" title="Ngày trả">${escapeHtml(r.returnDate||r.date||'')}</span>
      <strong class="erp-doc-value" title="Giá trị">${money(r.debtReduction??r.totalAmount)}</strong>
      <div class="erp-doc-actions">${cancelCell}</div>
    </article>`;
  }).join('');
}

async function loadMasterReturnOrders(){
  if(!masterReturnOrderTable)return;
  const params=new URLSearchParams();
  params.set('dateFrom', masterReturnOrderDateFrom?.value || today());
  params.set('dateTo', masterReturnOrderDateTo?.value || masterReturnOrderDateFrom?.value || today());
  params.set('page','1');
  params.set('limit','50');
  params.set('excludeInactive','1');
  try{
    const res=await fetch(`/api/master-return-orders?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng trả hàng');
    renderMasterReturnOrders(json.masterReturnOrders||[]);
  }catch(err){
    if(masterReturnKpiMasterCount)masterReturnKpiMasterCount.textContent='0';
    if(masterReturnKpiMasterValue)masterReturnKpiMasterValue.textContent='0';
    if(masterReturnOrderCount)masterReturnOrderCount.textContent='Không tải được đơn tổng trả hàng';
    masterReturnOrderTable.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message||'Không tải được đơn tổng trả hàng')}</div>`;
  }
}

async function submitMasterReturnOrder(event){
  event.preventDefault();
  if(!masterReturnOrderForm||masterReturnSubmitInFlight)return;
  selectedReturnOrders=dedupeMasterReturnRows(selectedReturnOrders);
  if(!selectedReturnOrders.length){showMessage(masterReturnOrderMessage,'Chưa có phiếu trả hàng trong danh sách gộp',true);return;}
  const selectedCodes=[...new Set(selectedReturnOrders.map(masterReturnDeliveryCode).map(masterReturnNormalizeCode).filter(Boolean))];
  if(selectedCodes.length!==1){showMessage(masterReturnOrderMessage,'Danh sách gộp phải thuộc đúng một mã NVGH',true);return;}
  const deliveryStaffCode=String(masterReturnDeliveryStaff?.value||'').trim();
  if(!deliveryStaffCode){showMessage(masterReturnOrderMessage,'Chưa chọn mã NVGH',true);return;}
  if(masterReturnNormalizeCode(deliveryStaffCode)!==selectedCodes[0]){
    showMessage(masterReturnOrderMessage,'Mã NVGH trên form không khớp các phiếu đã chọn',true);
    return;
  }
  const returnDate=String(masterReturnDate?.value||'').trim();
  if(!returnDate){showMessage(masterReturnOrderMessage,'Chưa chọn ngày tạo đơn tổng trả',true);return;}

  const payload=Object.fromEntries(new FormData(masterReturnOrderForm).entries());
  payload.returnOrderIds=selectedReturnOrders.map(masterReturnOrderIdentity);
  payload.deliveryStaffCode=deliveryStaffCode;
  payload.deliveryStaffName=String(masterReturnDeliveryStaffName?.value||'').trim();
  masterReturnSubmitInFlight=true;
  const oldText=submitMasterReturnOrderButton?.textContent||'Tạo đơn tổng trả';
  if(submitMasterReturnOrderButton){submitMasterReturnOrderButton.disabled=true;submitMasterReturnOrderButton.textContent='Đang tạo...';}
  try{
    const res=await (window.fetchWithTimeout||fetch)('/api/master-return-orders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    },20000);
    const json=await res.json();
    if(!res.ok||json.ok===false){
      const error=new Error(json.message||'Không tạo được đơn tổng trả hàng');
      error.status=res.status;
      error.code=json.code||'';
      throw error;
    }
    const successMessage=json.message||`Đã tạo đơn tổng trả hàng ${json.masterReturnOrder?.code||''}`;
    selectedReturnOrders=[];
    checkedAvailableReturnIds.clear();
    checkedSelectedReturnIds.clear();
    renderMasterReturnPopupLists();
    alert(successMessage);
    closeMasterReturnOrderModal();
    await Promise.all([
      loadUnmergedReturnOrders(),
      loadMasterReturnOrders(),
      typeof loadReturnOrders==='function'?loadReturnOrders():Promise.resolve()
    ]);
  }catch(err){
    showMessage(masterReturnOrderMessage,err.message||'Không tạo được đơn tổng trả hàng',true);
    if(Number(err.status)===409)await loadUnmergedReturnOrders();
  }finally{
    masterReturnSubmitInFlight=false;
    if(submitMasterReturnOrderButton){submitMasterReturnOrderButton.disabled=false;submitMasterReturnOrderButton.textContent=oldText;}
  }
}

async function editMasterReturnOrder(idx){
  const order=window.__masterReturnOrdersCache?.[Number(idx)];
  if(!order)return;
  const deliveryStaffCode=prompt('NV giao hàng', order.deliveryStaffCode||'');
  if(deliveryStaffCode===null)return;
  const note=prompt('Ghi chú', order.note||'');
  if(note===null)return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(order.id||order.code)}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({deliveryStaffCode,note})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không sửa được đơn tổng trả');
    showMessage(masterReturnOrderMessage,json.message||'Đã sửa đơn tổng trả');
    await loadMasterReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message||'Không sửa được đơn tổng trả',true)}
}
window.editMasterReturnOrder=editMasterReturnOrder;

async function viewMasterReturnOrder(id){
  if(!id)return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được chi tiết đơn tổng trả');
    const r=json.masterReturnOrder||{};
    const children=Array.isArray(r.children)?r.children:[];
    const lines=[
      `Mã tổng trả: ${r.code||r.id||''}`,
      `Ngày: ${r.returnDate||r.date||''}`,
      `NVGH: ${debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName)}`,
      `Số phiếu: ${children.length || r.returnCount || 0}`,
      `Tổng SL: ${money(r.totalQuantity)}`,
      `Tổng tiền: ${money(r.debtReduction??r.totalAmount)}`
    ];
    alert(lines.join('\n'));
  }catch(err){alert(err.message||'Không tải được chi tiết đơn tổng trả')}
}

async function receiveMasterReturnOrder(id, buttonEl){
  if(!id)return;
  if(!confirm('Xác nhận nhập kho toàn bộ hàng trả của đơn tổng này?\n\nSau khi xác nhận, hệ thống sẽ cộng tồn kho theo từng phiếu trả hàng con và chặn nhập kho lặp.'))return;
  const btn=buttonEl || null;
  const oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang nhập...';}
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/receive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receivedBy:'Kho'})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không nhập kho được đơn tổng trả hàng');
    showMessage(masterReturnOrderMessage,json.message||'Đã nhập kho hàng trả');
    await loadMasterReturnOrders();
    await loadUnmergedReturnOrders();
    if(typeof loadStock==='function')await loadStock();
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent=oldText||'Nhập kho';}
    showMessage(masterReturnOrderMessage,err.message||'Không nhập kho được đơn tổng trả hàng',true);
  }
}

async function printMasterReturnOrder(id){
  if(!id)return;
  try{
    const res=await fetch(`/api/print/master-return-orders/${encodeURIComponent(id)}`);
    const html=await res.text();
    if(!res.ok)throw new Error(html||'Không in được đơn tổng trả hàng');
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in');
    w.document.open();w.document.write(html);w.document.close();w.focus();
  }catch(err){alert(err.message||'Không in được đơn tổng trả')}
}

async function cancelMasterReturnOrder(id){
  if(!id)return;
  if(!confirm('Hủy gộp đơn tổng trả hàng này? Các phiếu trả hàng con sẽ quay về trạng thái chưa gộp.'))return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Hủy gộp từ giao diện'})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không hủy được đơn tổng trả hàng');
    showMessage(masterReturnOrderMessage,json.message||'Đã hủy gộp đơn tổng trả hàng');
    await loadUnmergedReturnOrders();
    await loadMasterReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message,true)}
}


function selectedMasterReturnOrders(){
  const checks=[...document.querySelectorAll('.master-return-order-check:checked:not(:disabled)')];
  return checks
    .map(ch=>window.__masterReturnOrdersCache?.[Number(ch.dataset.idx)])
    .filter(order=>order && !isInactiveMasterReturnOrder(order));
}
function toggleSelectAllMasterReturnOrders(){
  const checks=[...document.querySelectorAll('.master-return-order-check:not(:disabled)')];
  if(!checks.length)return;
  const shouldCheck=checks.some(ch=>!ch.checked);
  checks.forEach(ch=>{ch.checked=shouldCheck;});
  if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.textContent=shouldCheck?'Bỏ chọn tất cả':'Chọn tất cả';
}
async function printSelectedMasterReturnOrders(){
  const orders=selectedMasterReturnOrders();
  const ids=orders.map(order=>order.id||order.code).filter(Boolean);
  if(!ids.length){alert('Chưa chọn đơn tổng trả để in');return}
  try{
    const res=await fetch('/api/print/master-return-orders/batch',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({masterReturnOrderIds:ids})
    });
    const html=await res.text();
    if(!res.ok)throw new Error(html||'Không in được các đơn tổng trả đã chọn');
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in');
    w.document.open();w.document.write(html);w.document.close();w.focus();
  }catch(err){alert(err.message||'Không in được các đơn tổng trả đã chọn')}
}
async function receiveSelectedMasterReturnOrders(){
  const selected=selectedMasterReturnOrders();
  if(!selected.length){alert('Chưa chọn đơn tổng trả để nhập kho');return}
  const blocked=selected.filter(order=>!canReceiveMasterReturnOrder(order));
  if(blocked.length){
    alert(`Có ${blocked.length} đơn đã nhập kho hoặc không còn hợp lệ. Hãy bỏ chọn các đơn này trước khi nhập kho.`);
    return;
  }
  const orders=selected.filter(canReceiveMasterReturnOrder);
  if(!confirm(`Xác nhận nhập kho ${orders.length} đơn tổng trả đã chọn?

Sau khi xác nhận, hệ thống sẽ cộng tồn kho hàng trả và chặn nhập kho lặp.`))return;
  for(const r of orders){
    const id=r.id||r.code;
    const result=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/receive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receivedBy:'Kho'})});
    const json=await result.json();
    if(!json.ok)throw new Error(json.message||`Không nhập kho được ${r.code||id}`);
  }
  showMessage(masterReturnOrderMessage,'Đã nhập kho các đơn tổng trả đã chọn');
  await loadMasterReturnOrders();
  await loadUnmergedReturnOrders();
  if(typeof loadStock==='function')await loadStock();
}

// Return-order UI events are owned by 07b-return-orders.js.

window.toggleSelectAllMasterReturnOrders=toggleSelectAllMasterReturnOrders;
window.printSelectedMasterReturnOrders=printSelectedMasterReturnOrders;
window.receiveSelectedMasterReturnOrders=receiveSelectedMasterReturnOrders;
if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.addEventListener('click',toggleSelectAllMasterReturnOrders);
if(printSelectedMasterReturnOrdersButton)printSelectedMasterReturnOrdersButton.addEventListener('click',()=>runMasterReturnToolbarAction(printSelectedMasterReturnOrdersButton,'Đang in...',printSelectedMasterReturnOrders));
if(receiveSelectedMasterReturnOrdersButton)receiveSelectedMasterReturnOrdersButton.addEventListener('click',()=>runMasterReturnToolbarAction(receiveSelectedMasterReturnOrdersButton,'Đang nhập...',receiveSelectedMasterReturnOrders).catch(err=>showMessage(masterReturnOrderMessage,err.message,true)));

// PHASE35_EVENT_OWNERSHIP_START: this module is the single owner of master-return UI events.
window.cancelMasterReturnOrder=cancelMasterReturnOrder;
window.viewMasterReturnOrder=viewMasterReturnOrder;
window.receiveMasterReturnOrder=receiveMasterReturnOrder;
window.printMasterReturnOrder=printMasterReturnOrder;

function runMasterReturnToolbarAction(button,loadingText,task){
  if(window.ToolbarActions?.run)return window.ToolbarActions.run(button,task,{loadingText});
  return task();
}

if(reloadUnmergedReturnOrdersButton)reloadUnmergedReturnOrdersButton.addEventListener('click',loadUnmergedReturnOrders);
if(masterReturnOrderForm)masterReturnOrderForm.addEventListener('submit',submitMasterReturnOrder);
if(unmergedReturnOrderTable)unmergedReturnOrderTable.addEventListener('change',event=>{
  const check=event.target.closest('.master-return-available-check');
  if(!check)return;
  toggleAvailableReturnSelection(check.dataset.id,check.checked);
});
if(selectedMasterReturnOrderList)selectedMasterReturnOrderList.addEventListener('change',event=>{
  const check=event.target.closest('.master-return-selected-check');
  if(!check)return;
  toggleSelectedReturnSelection(check.dataset.id,check.checked);
});
const masterReturnSelectAllButton=document.getElementById('selectAllUnmergedReturnOrdersButton');
if(masterReturnSelectAllButton)masterReturnSelectAllButton.addEventListener('click',toggleSelectAllUnmergedReturnOrders);
if(moveToGroupedReturnOrdersButton)moveToGroupedReturnOrdersButton.addEventListener('click',moveSelectedReturnOrdersToGrouped);
if(removeFromGroupedReturnOrdersButton)removeFromGroupedReturnOrdersButton.addEventListener('click',removeSelectedReturnOrdersFromGrouped);
const masterReturnSearchInput=document.getElementById('unmergedReturnOrderSearchInput');
if(masterReturnSearchInput)masterReturnSearchInput.addEventListener('input',debounce(loadUnmergedReturnOrders,300));
if(unmergedReturnDateFrom)unmergedReturnDateFrom.addEventListener('change',loadUnmergedReturnOrders);
if(unmergedReturnDateTo)unmergedReturnDateTo.addEventListener('change',loadUnmergedReturnOrders);
if(masterReturnDeliveryStaff)masterReturnDeliveryStaff.addEventListener('input',debounce(()=>{
  if(!selectedReturnOrders.length){
    if(masterReturnDeliveryStaffName)masterReturnDeliveryStaffName.value='';
    loadUnmergedReturnOrders();
  }
},300));
const applyMasterReturnFiltersButton=document.getElementById('applyMasterReturnFiltersButton');
const clearMasterReturnFiltersButton=document.getElementById('clearMasterReturnFiltersButton');
if(applyMasterReturnFiltersButton)applyMasterReturnFiltersButton.addEventListener('click',()=>runMasterReturnToolbarAction(applyMasterReturnFiltersButton,'Đang tìm...',loadMasterReturnOrders));
if(clearMasterReturnFiltersButton)clearMasterReturnFiltersButton.addEventListener('click',()=>{
  if(masterReturnOrderDateFrom)masterReturnOrderDateFrom.value=today();
  if(masterReturnOrderDateTo)masterReturnOrderDateTo.value=today();
  runMasterReturnToolbarAction(clearMasterReturnFiltersButton,'Đang xóa...',loadMasterReturnOrders);
});
if(reloadMasterReturnOrdersButton)reloadMasterReturnOrdersButton.addEventListener('click',()=>runMasterReturnToolbarAction(reloadMasterReturnOrdersButton,'Đang tải...',loadMasterReturnOrders));
if(openMasterReturnOrderModalButton)openMasterReturnOrderModalButton.addEventListener('click',()=>{resetMasterReturnOrderModal();openMasterReturnOrderModal();});
if(closeMasterReturnOrderModalButton)closeMasterReturnOrderModalButton.addEventListener('click',closeMasterReturnOrderModal);
if(masterReturnOrderModal)masterReturnOrderModal.addEventListener('click',event=>{if(event.target===masterReturnOrderModal)closeMasterReturnOrderModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isMasterReturnOrderModalOpen())closeMasterReturnOrderModal();});
// PHASE35_EVENT_OWNERSHIP_END
