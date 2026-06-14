'use strict';

const selectedReturnOrderIdsForMaster = new Set();

function getUnmergedReturnOrdersCache(){
  return Array.isArray(window.__unmergedReturnOrdersCache) ? window.__unmergedReturnOrdersCache : [];
}

function isMasterReturnOrderModalOpen(){
  return !!(masterReturnOrderModal && masterReturnOrderModal.classList.contains('show'));
}
window.isMasterReturnOrderModalOpen=isMasterReturnOrderModalOpen;

function openMasterReturnOrderModal(options={}){
  if(!masterReturnOrderModal)return;
  masterReturnOrderModal.classList.add('show');
  masterReturnOrderModal.setAttribute('aria-hidden','false');
  if(masterReturnDate && !masterReturnDate.value && typeof today==='function')masterReturnDate.value=today();
  if(options.skipLoad!==true)loadUnmergedReturnOrders();
  renderSelectedMasterReturnOrderList();
}
window.openMasterReturnOrderModal=openMasterReturnOrderModal;

function closeMasterReturnOrderModal(){
  if(!masterReturnOrderModal)return;
  masterReturnOrderModal.classList.remove('show');
  masterReturnOrderModal.setAttribute('aria-hidden','true');
}
window.closeMasterReturnOrderModal=closeMasterReturnOrderModal;

function resetSelectedMasterReturnOrders(){
  selectedReturnOrderIdsForMaster.clear();
  renderUnmergedReturnOrders(getUnmergedReturnOrdersCache());
}
window.resetSelectedMasterReturnOrders=resetSelectedMasterReturnOrders;

function resetMasterReturnOrderModal(){
  selectedReturnOrderIdsForMaster.clear();
  if(masterReturnOrderForm){
    const keepDate=(masterReturnOrderForm.elements.returnDate && masterReturnOrderForm.elements.returnDate.value) || (typeof today==='function' ? today() : '');
    masterReturnOrderForm.reset();
    if(masterReturnOrderForm.elements.returnDate)masterReturnOrderForm.elements.returnDate.value=keepDate;
  }
  showMessage(masterReturnOrderMessage,'');
  window.__unmergedReturnOrdersCache=[];
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent='Chưa tải phiếu trả hàng chưa gộp.';
  if(selectedMasterReturnOrderList)selectedMasterReturnOrderList.innerHTML='<div class="empty-cell">Chưa có phiếu trả hàng nào được chọn để gộp.</div>';
  if(unmergedReturnOrderTable)unmergedReturnOrderTable.innerHTML='<div class="empty-state">Đang tải phiếu trả hàng chưa gộp...</div>';
}
window.resetMasterReturnOrderModal=resetMasterReturnOrderModal;

function toggleMasterReturnSelection(id, forceValue){
  const key=String(id||'').trim();
  if(!key)return;
  if(forceValue===false)selectedReturnOrderIdsForMaster.delete(key);
  else if(forceValue===true)selectedReturnOrderIdsForMaster.add(key);
  else if(selectedReturnOrderIdsForMaster.has(key))selectedReturnOrderIdsForMaster.delete(key);
  else selectedReturnOrderIdsForMaster.add(key);
  renderUnmergedReturnOrders(getUnmergedReturnOrdersCache());
}
window.toggleMasterReturnSelection=toggleMasterReturnSelection;

function toggleSelectAllUnmergedReturnOrders(){
  const rows=getUnmergedReturnOrdersCache();
  if(!rows.length)return;
  const keys=rows.map(r=>String(r.id||r.code||'')).filter(Boolean);
  const shouldSelect=keys.some(key=>!selectedReturnOrderIdsForMaster.has(key));
  keys.forEach(key=>{
    if(shouldSelect)selectedReturnOrderIdsForMaster.add(key);
    else selectedReturnOrderIdsForMaster.delete(key);
  });
  renderUnmergedReturnOrders(rows);
}
window.toggleSelectAllUnmergedReturnOrders=toggleSelectAllUnmergedReturnOrders;

function renderSelectedMasterReturnOrderList(){
  if(!selectedMasterReturnOrderList)return;
  const rows=getUnmergedReturnOrdersCache().filter(r=>selectedReturnOrderIdsForMaster.has(String(r.id||r.code||'')));
  if(!rows.length){
    selectedMasterReturnOrderList.innerHTML='<div class="empty-cell">Chưa có phiếu trả hàng nào được chọn để gộp.</div>';
    return;
  }
  const totalQty=rows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const head=`<div class="master-return-selected-head"><span>${rows.length} phiếu</span><span>Tổng SL ${money(totalQty)}</span><span>Tổng giá trị ${money(totalValue)}</span></div>`;
  const body=rows.map(r=>{
    const id=String(r.id||r.code||'');
    const customer=[r.customerCode,r.customerName].filter(Boolean).join(' - ') || 'Không rõ khách';
    return `<article class="master-return-selected-item">
      <div class="master-return-selected-main">
        <strong title="${escapeHtml(r.code||r.id||'')}">${escapeHtml(r.code||r.id||'')}</strong>
        <span title="${escapeHtml(customer)}">${escapeHtml(customer)}</span>
        <small>${escapeHtml(r.deliveryDate||r.returnDate||r.date||r.documentDate||'')}</small>
      </div>
      <div class="master-return-selected-side">
        <b>${money(r.debtReduction??r.totalAmount)}</b>
        <button type="button" class="secondary small" onclick="toggleMasterReturnSelection('${escapeHtml(id)}', false)">Bỏ</button>
      </div>
    </article>`;
  }).join('');
  selectedMasterReturnOrderList.innerHTML=head+body;
}

function renderUnmergedReturnOrders(rows = []){
  if(!unmergedReturnOrderTable)return;
  window.__unmergedReturnOrdersCache=Array.isArray(rows)?rows:[];
  const selectAllUnmergedReturnOrdersButton=document.getElementById('selectAllUnmergedReturnOrdersButton');
  const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const totalQty=rows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  const selectedRows=rows.filter(r=>selectedReturnOrderIdsForMaster.has(String(r.id||r.code||'')));
  const selectedQty=selectedRows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  const selectedValue=selectedRows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const selectedCountEl=document.getElementById('selectedMasterReturnCount');
  const selectedQtyEl=document.getElementById('selectedMasterReturnQty');
  const selectedValueEl=document.getElementById('selectedMasterReturnValue');
  if(selectedCountEl)selectedCountEl.textContent=money(selectedReturnOrderIdsForMaster.size);
  if(selectedQtyEl)selectedQtyEl.textContent=money(selectedQty);
  if(selectedValueEl)selectedValueEl.textContent=money(selectedValue);
  if(masterReturnKpiUnmerged)masterReturnKpiUnmerged.textContent=money(rows.length);
  if(masterReturnKpiUnmergedQty)masterReturnKpiUnmergedQty.textContent=money(totalQty);
  if(masterReturnKpiUnmergedValue)masterReturnKpiUnmergedValue.textContent=money(totalValue);
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent=`${rows.length} phiếu chưa gộp · Tổng SL ${money(totalQty)} · Tổng giá trị ${money(totalValue)} · Đã chọn ${selectedReturnOrderIdsForMaster.size}`;
  if(selectAllUnmergedReturnOrdersButton)selectAllUnmergedReturnOrdersButton.textContent=rows.length && rows.every(r=>selectedReturnOrderIdsForMaster.has(String(r.id||r.code||''))) ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
  const head=`<div class="return-list-head"><span></span><span>Mã trả hàng</span><span>Khách hàng</span><span>NV giao</span><span>Ngày trả</span><span>SL</span><span>Giá trị</span></div>`;
  if(!rows.length){
    unmergedReturnOrderTable.innerHTML=head+'<div class="empty-state">Không có phiếu trả hàng chưa gộp.</div>';
    renderSelectedMasterReturnOrderList();
    return;
  }
  unmergedReturnOrderTable.innerHTML=head+rows.map(r=>{
    const id=String(r.id||r.code||'');
    const checked=selectedReturnOrderIdsForMaster.has(id)?'checked':'';
    const staff=canonicalDeliveryStaffLabel(r);
    const customer=[r.customerCode,r.customerName].filter(Boolean).join(' - ');
    const selected=checked?' selected':'';
    return `<label class="return-one-line-row${selected}">
      <input type="checkbox" class="master-return-check" data-id="${escapeHtml(id)}" ${checked}>
      <strong class="return-row-code" title="${escapeHtml(r.code||r.id||'')}">${escapeHtml(r.code||r.id||'')}</strong>
      <span class="return-row-customer" title="${escapeHtml(customer||'Không rõ khách')}">${escapeHtml(customer||'Không rõ khách')}</span>
      <span class="return-row-staff" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="return-row-date">${escapeHtml(r.deliveryDate||r.returnDate||r.date||r.documentDate||'')}</span>
      <span class="return-row-qty">${money(r.totalQuantity)}</span>
      <strong class="return-row-money">${money(r.debtReduction??r.totalAmount)}</strong>
    </label>`;
  }).join('');
  renderSelectedMasterReturnOrderList();
}

async function loadUnmergedReturnOrders(){
  if(!unmergedReturnOrderTable)return;
  const params=new URLSearchParams();
  const unmergedSearchInput=document.getElementById('unmergedReturnOrderSearchInput');
  const q=unmergedSearchInput?unmergedSearchInput.value.trim():'';
  // Lưu ý nghiệp vụ: ngày trong form là NGÀY TẠO ĐƠN TỔNG/KHO NHẬN,
  // không phải ngày lọc phiếu trả chưa gộp. Nếu dùng ngày này để lọc,
  // phiếu trả phát sinh từ đơn giao ngày 29/05 sẽ bị ẩn khi kho tạo tổng trả ngày 30/05.
  // Vì vậy danh sách chờ gộp chỉ lọc theo NVGH + ô tìm kiếm; ngày tạo tổng trả chỉ gửi khi bấm Tạo.
  const delivery=masterReturnDeliveryStaff?.value.trim() || '';
  if(q)params.set('q',q);
  if(delivery)params.set('delivery',delivery);
  try{
    const res=await fetch(`/api/master-return-orders/unmerged-return-orders?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được phiếu trả hàng chưa gộp');
    renderUnmergedReturnOrders(json.returnOrders||[]);
  }catch(err){
    if(masterReturnKpiUnmerged)masterReturnKpiUnmerged.textContent='0';
    if(masterReturnKpiUnmergedQty)masterReturnKpiUnmergedQty.textContent='0';
    if(masterReturnKpiUnmergedValue)masterReturnKpiUnmergedValue.textContent='0';
    if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent='Không tải được phiếu trả hàng chưa gộp';
    unmergedReturnOrderTable.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message||'Không tải được phiếu trả hàng chưa gộp')}</div>`;
  }
}

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
    const warehouseStatus=String(r.warehouseStatus||r.warehouseReceiveStatus||r.status||'pending').toLowerCase();
    const accountingStatus=String(r.accountingStatus||'pending').toLowerCase();
    const locked=['posted','received','confirmed','completed'].includes(warehouseStatus) || accountingStatus==='confirmed' || r.stockPosted;
    const staff=debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName);
    const id=escapeHtml(r.id||r.code||'');
    const cancelCell=locked
      ? `<span class="erp-doc-action-state">Đã khóa</span>`
      : `<button class="secondary small danger" type="button" onclick="cancelMasterReturnOrder('${id}')">Hủy</button>`;
    return `<article class="erp-doc-row master-return-one-line">
      <label class="erp-doc-check"><input type="checkbox" class="master-return-order-check" data-idx="${idx}"></label>
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
  if(!masterReturnOrderForm)return;
  const returnOrderIds=[...selectedReturnOrderIdsForMaster];
  if(!returnOrderIds.length){showMessage(masterReturnOrderMessage,'Chưa chọn phiếu trả hàng để gộp',true);return}
  const payload=Object.fromEntries(new FormData(masterReturnOrderForm).entries());
  payload.returnOrderIds=returnOrderIds;
  try{
    const res=await fetch('/api/master-return-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tạo được đơn tổng trả hàng');
    selectedReturnOrderIdsForMaster.clear();
    if(masterReturnOrderForm){
      const keepDate=(masterReturnOrderForm.elements.returnDate && masterReturnOrderForm.elements.returnDate.value) || (typeof today==='function' ? today() : '');
      masterReturnOrderForm.reset();
      if(masterReturnOrderForm.elements.returnDate)masterReturnOrderForm.elements.returnDate.value=keepDate;
    }
    closeMasterReturnOrderModal();
    showMessage(masterReturnOrderMessage,json.message||'Đã tạo đơn tổng trả hàng');
    renderSelectedMasterReturnOrderList();
    await loadUnmergedReturnOrders();
    await loadMasterReturnOrders();
    if(typeof loadReturnOrders==='function')await loadReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message,true)}
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
  const checks=[...document.querySelectorAll('.master-return-order-check:checked')];
  return checks.map(ch=>window.__masterReturnOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
}
function toggleSelectAllMasterReturnOrders(){
  const checks=[...document.querySelectorAll('.master-return-order-check')];
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
  const orders=selectedMasterReturnOrders();
  if(!orders.length){alert('Chưa chọn đơn tổng trả để nhập kho');return}
  if(!confirm(`Xác nhận nhập kho ${orders.length} đơn tổng trả đã chọn?\n\nSau khi xác nhận, hệ thống sẽ cộng tồn kho hàng trả và chặn nhập kho lặp.`))return;
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
if(printSelectedMasterReturnOrdersButton)printSelectedMasterReturnOrdersButton.addEventListener('click',printSelectedMasterReturnOrders);
if(receiveSelectedMasterReturnOrdersButton)receiveSelectedMasterReturnOrdersButton.addEventListener('click',()=>receiveSelectedMasterReturnOrders().catch(err=>showMessage(masterReturnOrderMessage,err.message,true)));




// PHASE35_EVENT_OWNERSHIP_START: this module is the single owner of master-return UI events.
window.cancelMasterReturnOrder=cancelMasterReturnOrder;
window.viewMasterReturnOrder=viewMasterReturnOrder;
window.receiveMasterReturnOrder=receiveMasterReturnOrder;
window.printMasterReturnOrder=printMasterReturnOrder;

if(reloadUnmergedReturnOrdersButton)reloadUnmergedReturnOrdersButton.addEventListener('click',loadUnmergedReturnOrders);
if(masterReturnOrderForm)masterReturnOrderForm.addEventListener('submit',submitMasterReturnOrder);
if(clearMasterReturnSelectionButton)clearMasterReturnSelectionButton.addEventListener('click',()=>resetSelectedMasterReturnOrders());
if(unmergedReturnOrderTable)unmergedReturnOrderTable.addEventListener('change',event=>{
  const check=event.target.closest('.master-return-check');
  if(!check)return;
  toggleMasterReturnSelection(check.dataset.id,check.checked);
});
const masterReturnSelectAllButton=document.getElementById('selectAllUnmergedReturnOrdersButton');
if(masterReturnSelectAllButton)masterReturnSelectAllButton.addEventListener('click',toggleSelectAllUnmergedReturnOrders);
const masterReturnReloadInlineButton=document.getElementById('reloadUnmergedReturnOrdersInlineButton');
if(masterReturnReloadInlineButton)masterReturnReloadInlineButton.addEventListener('click',loadUnmergedReturnOrders);
const masterReturnSearchInput=document.getElementById('unmergedReturnOrderSearchInput');
if(masterReturnSearchInput)masterReturnSearchInput.addEventListener('input',debounce(loadUnmergedReturnOrders,250));
if(masterReturnDeliveryStaff)masterReturnDeliveryStaff.addEventListener('input',debounce(loadUnmergedReturnOrders,250));
if(reloadMasterReturnOrdersButton)reloadMasterReturnOrdersButton.addEventListener('click',loadMasterReturnOrders);
if(masterReturnOrderDateFrom)masterReturnOrderDateFrom.addEventListener('change',loadMasterReturnOrders);
if(masterReturnOrderDateTo)masterReturnOrderDateTo.addEventListener('change',loadMasterReturnOrders);
if(openMasterReturnOrderModalButton)openMasterReturnOrderModalButton.addEventListener('click',()=>{resetMasterReturnOrderModal();openMasterReturnOrderModal();});
if(closeMasterReturnOrderModalButton)closeMasterReturnOrderModalButton.addEventListener('click',closeMasterReturnOrderModal);
if(masterReturnOrderModal)masterReturnOrderModal.addEventListener('click',event=>{if(event.target===masterReturnOrderModal)closeMasterReturnOrderModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isMasterReturnOrderModalOpen())closeMasterReturnOrderModal();});
// PHASE35_EVENT_OWNERSHIP_END
