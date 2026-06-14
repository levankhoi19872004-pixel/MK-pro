'use strict';

// PHASE31 - Return Orders full-width list + readonly detail popup state
let returnOrdersCache = [];
let selectedReturnOrderKey = '';

function returnOrderRowKey(r){
  return String(r?.id || r?._id || r?.code || r?.returnCode || r?.salesOrderCode || r?.orderCode || '').trim();
}
function returnOrderItems(r){
  const sources=[r?.items,r?.returnItems,r?.lines,r?.products,r?.details];
  for(const src of sources){ if(Array.isArray(src)) return src; }
  return [];
}
function returnItemQty(item){
  return Number(item?.returnQty ?? item?.returnedQty ?? item?.qty ?? item?.quantity ?? item?.returnQuantity ?? 0) || 0;
}
function returnItemPrice(item){
  return Number(item?.price ?? item?.unitPrice ?? item?.salePrice ?? item?.sellingPrice ?? item?.returnPrice ?? 0) || 0;
}
function returnItemAmount(item){
  const direct=Number(item?.amount ?? item?.totalAmount ?? item?.lineAmount ?? item?.returnAmount ?? 0);
  if(Number.isFinite(direct) && direct) return direct;
  return returnItemQty(item) * returnItemPrice(item);
}
function returnOrderStatusLabel(status){
  const s=String(status||'posted');
  const map={posted:'Đã ghi',waiting_receive:'Chờ kho nhận',pending_warehouse_receive:'Chờ kho nhận',received:'Kho đã nhận',void:'Đã hủy',cancelled:'Đã hủy',canceled:'Đã hủy'};
  return map[s] || s;
}
function returnOrderStatusBadgeClass(status){
  const s=String(status||'').toLowerCase();
  return ['void','cancelled','canceled','deleted'].includes(s)?'out':'in';
}
function canCancelReturnOrder(order){
  const status=String(order?.status||order?.returnStatus||'').toLowerCase();
  const wh=String(order?.warehouseReceiveStatus||'').toLowerCase();
  const acc=String(order?.accountingStatus||'').toLowerCase();
  if(['cancelled','canceled','void','deleted','received','warehouse_received','completed','posted'].includes(status))return false;
  if(['received','warehouse_received','completed'].includes(wh))return false;
  if(['posted','completed','confirmed'].includes(acc))return false;
  if(order?.postedAt||order?.receivedAt)return false;
  if(order?.masterReturnOrderId||order?.masterReturnOrderCode||String(order?.returnMergeStatus||'').toLowerCase()==='merged')return false;
  return ['waiting_receive','pending_warehouse_receive','pending','draft','has_return'].includes(status);
}
function isReturnOrderDetailModalOpen(){
  return Boolean(returnOrderDetailModal?.classList.contains('show'));
}
function openReturnOrderDetailModal(){
  if(!returnOrderDetailModal)return;
  returnOrderDetailModal.classList.add('show');
  returnOrderDetailModal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  setTimeout(()=>closeReturnOrderDetailModalButton?.focus(),20);
}
function closeReturnOrderDetailPopup(options={}){
  if(!returnOrderDetailModal)return;
  returnOrderDetailModal.classList.remove('show');
  returnOrderDetailModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  if(options.clearSelection!==false){
    selectedReturnOrderKey='';
    returnOrderTable?.querySelectorAll('tr[data-return-key]').forEach(tr=>tr.classList.remove('active'));
  }
}
function renderReturnOrderDetail(order){
  const panel=document.getElementById('returnOrderDetailPanel');
  if(!panel) return;
  if(!order){
    panel.innerHTML='<div class="return-detail-empty"><strong>Chưa chọn phiếu trả hàng</strong><p>Đóng popup và chọn một phiếu trong danh sách.</p></div>';
    if(returnOrderDetailModalTitle)returnOrderDetailModalTitle.textContent='Chi tiết phiếu trả hàng';
    return;
  }
  if(returnOrderDetailModalTitle)returnOrderDetailModalTitle.textContent=`Chi tiết ${order.code||order.id||'phiếu trả hàng'}`;
  const items=returnOrderItems(order);
  const totalQty=items.reduce((sum,it)=>sum+returnItemQty(it),0) || Number(order.totalQuantity||0);
  const totalAmount=items.reduce((sum,it)=>sum+returnItemAmount(it),0) || Number(order.debtReduction ?? order.totalAmount ?? order.amount ?? 0);
  const staff=canonicalDeliveryStaffLabel(order)||canonicalSalesStaffLabel(order);
  const source=String(order.source||order.refType||'returnOrders');
  const status=String(order.status||'posted');
  const rows=items.map((it,idx)=>{
    const code=it.productCode||it.code||it.sku||it.productId||'';
    const name=it.productName||it.name||it.itemName||'';
    const unit=it.unit||it.baseUnit||it.uom||'';
    const qty=returnItemQty(it);
    const price=returnItemPrice(it);
    const amount=returnItemAmount(it);
    return `<tr><td>${idx+1}</td><td><strong>${escapeHtml(code)}</strong></td><td>${escapeHtml(name)}${unit?`<div class="muted tiny-text">ĐVT: ${escapeHtml(unit)}</div>`:''}</td><td class="price">${money(qty)}</td><td class="price">${money(price)}</td><td class="price cash-in">${money(amount)}</td></tr>`;
  }).join('');
  panel.innerHTML=`
    <div class="return-detail-header">
      <div>
        <div class="return-detail-title">Chi tiết đơn trả hàng</div>
        <div class="return-detail-code">${escapeHtml(order.code||order.id||'')}</div>
      </div>
      <div class="return-detail-actions">
        <span class="badge ${returnOrderStatusBadgeClass(status)}">${escapeHtml(returnOrderStatusLabel(status))}</span>
        ${canCancelReturnOrder(order)?`<button type="button" class="secondary small danger" onclick="cancelReturnOrder('${escapeHtml(returnOrderRowKey(order))}')">Huỷ trả hàng</button>`:''}
      </div>
    </div>
    <div class="return-detail-grid">
      <div><span>Ngày trả</span><strong>${escapeHtml(order.deliveryDate||order.returnDate||order.date||order.documentDate||'')}</strong></div>
      <div><span>Đơn bán</span><strong>${escapeHtml(order.salesOrderCode||order.orderCode||order.refCode||'')}</strong></div>
      <div><span>Khách hàng</span><strong>${escapeHtml((order.customerCode||'')+' '+(order.customerName||''))}</strong></div>
      <div><span>NV liên quan</span><strong>${escapeHtml(staff)}</strong></div>
      <div><span>Nguồn</span><strong>${escapeHtml(source)}</strong></div>
      <div><span>Thao tác</span><strong>${canCancelReturnOrder(order)?'Có thể hủy':'Readonly'}</strong></div>
    </div>
    <div class="return-detail-summary">
      <div><span>Tổng SL trả</span><strong>${money(totalQty)}</strong></div>
      <div><span>Tổng giá trị trả</span><strong class="cash-in">${money(totalAmount)}</strong></div>
      <div><span>Giảm công nợ</span><strong class="cash-in">${money(order.debtReduction ?? order.totalAmount ?? totalAmount)}</strong></div>
    </div>
    <div class="return-detail-note"><strong>Ghi chú/lý do:</strong> ${escapeHtml(order.reason||order.returnReason||order.note||'Không có')}</div>
    <div class="return-detail-products-title">Sản phẩm trả về</div>
    <div class="return-detail-products-wrap">
      <table class="return-detail-products-table">
        <thead><tr><th>STT</th><th>Mã SP</th><th>Tên sản phẩm</th><th>SL trả</th><th>Đơn giá</th><th>Giá trị</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Phiếu này chưa có dòng sản phẩm trả.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}
function selectReturnOrderByKey(key, options={}){
  selectedReturnOrderKey=String(key||'');
  const order=returnOrdersCache.find(r=>returnOrderRowKey(r)===selectedReturnOrderKey)||null;
  if(!order)return;
  if(returnOrderTable){
    returnOrderTable.querySelectorAll('tr[data-return-key]').forEach(tr=>tr.classList.toggle('active', tr.dataset.returnKey===selectedReturnOrderKey));
  }
  renderReturnOrderDetail(order);
  if(options.open!==false)openReturnOrderDetailModal();
}

async function cancelReturnOrder(key){
  const order=returnOrdersCache.find(r=>returnOrderRowKey(r)===String(key||''));
  if(!order)return;
  if(!canCancelReturnOrder(order)){alert('Phiếu trả đã nhập kho/ghi sổ/gộp tổng, không thể hủy trực tiếp.');return;}
  const reason=prompt('Lý do huỷ trả hàng?','Khách lấy lại hàng');
  if(reason===null)return;
  try{
    const res=await fetch(`/api/return-orders/${encodeURIComponent(order.id||order.code||key)}/cancel`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reason})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không hủy được phiếu trả hàng');
    alert(json.message||'Đã hủy phiếu trả hàng');
    closeReturnOrderDetailPopup();
    await loadReturnOrders();
  }catch(err){alert(err.message||'Không hủy được phiếu trả hàng')}
}
window.cancelReturnOrder=cancelReturnOrder;

let returnOrderRequestSeq=0;

async function loadReturnOrders(){
  if(!returnOrderTable)return;
  const requestSeq=++returnOrderRequestSeq;
  const q=returnOrderSearchInput?returnOrderSearchInput.value.trim():'';
  const dateFrom=String(returnOrderDateFrom?.value||'').trim();
  const dateTo=String(returnOrderDateTo?.value||'').trim();
  if(dateFrom&&dateTo&&dateFrom>dateTo){
    if(returnOrderCount)returnOrderCount.textContent='Từ ngày không được lớn hơn đến ngày.';
    returnOrderTable.innerHTML='<tr><td colspan="7">Vui lòng kiểm tra lại khoảng ngày.</td></tr>';
    return;
  }

  const params=new URLSearchParams();
  if(q)params.set('q',q);
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  params.set('page','1');
  params.set('limit','50');
  params.set('excludeInactive','1');

  const originalButtonText=applyReturnOrderFiltersButton?.textContent||'Lọc';
  if(applyReturnOrderFiltersButton){
    applyReturnOrderFiltersButton.disabled=true;
    applyReturnOrderFiltersButton.textContent='Đang lọc...';
  }

  try{
    const res=await fetch(`/api/return-orders?${params.toString()}`);
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.message||'Không tải được đơn trả hàng');
    if(requestSeq!==returnOrderRequestSeq)return;

    const rawRows = Array.isArray(json.returnOrders) ? json.returnOrders :
      Array.isArray(json.returns) ? json.returns :
      Array.isArray(json.rows) ? json.rows :
      Array.isArray(json.items) ? json.items :
      Array.isArray(json.data) ? json.data : [];
    const rows = rawRows.filter(row => (typeof isActiveDocument === 'function' ? isActiveDocument(row) : true));
    const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
    const dateLabel=dateFrom&&dateTo
      ? (dateFrom===dateTo ? formatDateVN(dateFrom) : `${formatDateVN(dateFrom)} - ${formatDateVN(dateTo)}`)
      : (dateFrom ? `Từ ${formatDateVN(dateFrom)}` : (dateTo ? `Đến ${formatDateVN(dateTo)}` : 'Tất cả ngày'));
    if(returnOrderCount) returnOrderCount.innerHTML=`${rows.length} phiếu · ${escapeHtml(dateLabel)} · Tổng giảm nợ ${money(totalValue)} · Nhấn một phiếu để mở chi tiết · <strong>Readonly</strong>`;
    returnOrdersCache=rows;
    if(!rows.length){
      selectedReturnOrderKey='';
      returnOrderTable.innerHTML='<tr><td colspan="7">Không có phiếu trả hàng phù hợp bộ lọc.</td></tr>';
      renderReturnOrderDetail(null);
      return;
    }
    if(!rows.some(r=>returnOrderRowKey(r)===selectedReturnOrderKey)){
      selectedReturnOrderKey='';
      if(isReturnOrderDetailModalOpen())closeReturnOrderDetailPopup();
    }
    returnOrderTable.innerHTML=rows.map(r=>{
      const key=returnOrderRowKey(r);
      const status=String(r.status||'posted');
      const totalQty=Number(r.totalQuantity||0) || returnOrderItems(r).reduce((sum,it)=>sum+returnItemQty(it),0);
      const totalAmount=Number(r.debtReduction??r.totalAmount??r.amount??0) || returnOrderItems(r).reduce((sum,it)=>sum+returnItemAmount(it),0);
      const returnDate=r.returnDate||r.date||r.documentDate||r.deliveryDate||'';
      return `<tr data-return-key="${escapeHtml(key)}" class="${key===selectedReturnOrderKey?'active':''}" title="Bấm để mở popup chi tiết sản phẩm trả" tabindex="0">
        <td><strong>${escapeHtml(r.code||r.id||'')}</strong><div class="muted tiny-text">${escapeHtml(r.salesOrderCode||r.orderCode||'')}</div></td>
        <td>${escapeHtml(typeof formatDateVN==='function'?formatDateVN(returnDate):returnDate)}</td>
        <td>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</td>
        <td class="price">${money(totalQty)}</td>
        <td class="price cash-in">${money(totalAmount)}</td>
        <td><span class="badge ${returnOrderStatusBadgeClass(status)}">${escapeHtml(returnOrderStatusLabel(status))}</span></td>
        <td><button type="button" class="secondary small return-order-view-button" data-return-action="view">Xem chi tiết</button></td>
      </tr>`;
    }).join('');
    if(isReturnOrderDetailModalOpen()&&selectedReturnOrderKey)selectReturnOrderByKey(selectedReturnOrderKey,{open:false});
  }catch(err){
    if(requestSeq!==returnOrderRequestSeq)return;
    if(returnOrderCount) returnOrderCount.textContent='Không tải được đơn trả hàng';
    returnOrderTable.innerHTML=`<tr><td colspan="7">${escapeHtml(err.message||'Không tải được đơn trả hàng')}</td></tr>`;
    renderReturnOrderDetail(null);
  }finally{
    if(requestSeq===returnOrderRequestSeq&&applyReturnOrderFiltersButton){
      applyReturnOrderFiltersButton.disabled=false;
      applyReturnOrderFiltersButton.textContent=originalButtonText;
    }
  }
}
window.loadReturnOrders=loadReturnOrders;

if(returnOrderDateFrom&&!returnOrderDateFrom.value)returnOrderDateFrom.value=today();
if(returnOrderDateTo&&!returnOrderDateTo.value)returnOrderDateTo.value=today();
if(returnOrderFilterForm) returnOrderFilterForm.addEventListener('submit',event=>{
  event.preventDefault();
  loadReturnOrders();
});
if(clearReturnOrderFiltersButton) clearReturnOrderFiltersButton.addEventListener('click',()=>{
  if(returnOrderSearchInput)returnOrderSearchInput.value='';
  if(returnOrderDateFrom)returnOrderDateFrom.value='';
  if(returnOrderDateTo)returnOrderDateTo.value='';
  loadReturnOrders();
});
if(returnOrderTable){
  returnOrderTable.addEventListener('click',event=>{
    const tr=event.target.closest('tr[data-return-key]');
    if(tr)selectReturnOrderByKey(tr.dataset.returnKey);
  });
  returnOrderTable.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    const tr=event.target.closest('tr[data-return-key]');
    if(!tr)return;
    event.preventDefault();
    selectReturnOrderByKey(tr.dataset.returnKey);
  });
}
if(closeReturnOrderDetailModalButton)closeReturnOrderDetailModalButton.addEventListener('click',()=>closeReturnOrderDetailPopup());
if(returnOrderDetailModal)returnOrderDetailModal.addEventListener('click',event=>{if(event.target===returnOrderDetailModal)closeReturnOrderDetailPopup();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isReturnOrderDetailModalOpen())closeReturnOrderDetailPopup();});
