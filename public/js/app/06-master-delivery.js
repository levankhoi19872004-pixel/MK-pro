async function loadUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  const params=new URLSearchParams();
  if(unmergedOrderSearch && unmergedOrderSearch.value.trim())params.set('q',unmergedOrderSearch.value.trim());
  if(unmergedSourceFilter && unmergedSourceFilter.value)params.set('source',unmergedSourceFilter.value);
  if(unmergedDateFilter && unmergedDateFilter.value)params.set('date',unmergedDateFilter.value);
  if(unmergedSalesStaffFilter && unmergedSalesStaffFilter.value.trim())params.set('salesStaff',unmergedSalesStaffFilter.value.trim());
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

function renderUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  if(!unmergedOrdersCache.length){
    unmergedOrderList.innerHTML='Không có đơn con chưa gộp.';
    updateSelectedChildOrderSummary();
    return;
  }
  unmergedOrderList.innerHTML=unmergedOrdersCache.map(order=>`
    <label class="child-order-row ${selectedChildOrderIds.has(order.id)?'selected':''}">
      <input type="checkbox" class="child-order-check" data-id="${order.id}" ${selectedChildOrderIds.has(order.id)?'checked':''} />
      <div class="child-order-main">
        <div class="child-order-title"><strong>${order.code||order.id}</strong> ${orderSourceLabel(order.orderSource)} ${mergeStatusLabel(order.mergeStatus)}</div>
        <div class="order-meta">${order.date||''} · ${order.customerCode||''} - ${order.customerName||''}</div>
        <div class="order-meta">${order.customerPhone||''} · ${order.customerAddress||''}</div>
        <div class="order-meta">NV bán hàng: <strong>${order.salesStaffCode||order.staffCode||''} ${order.salesStaffName||order.staffName||''}</strong></div>
      </div>
      <div class="child-order-money">
        <strong>${money(order.totalAmount)}</strong>
        <small>Còn thu: ${money(order.debtAmount)}</small>
      </div>
    </label>`).join('');
  updateSelectedChildOrderSummary();
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

async function printSelectedMasterOrders(){
  const checks=[...document.querySelectorAll('.master-order-check:checked')];
  const orders=checks.map(ch=>masterOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
  if(!orders.length){alert('Chưa chọn đơn tổng để in gộp');return}
  const html=orders.map(o=>`<section class="print-page"><h2>Đơn tổng: ${o.code||o.id}</h2><p>Ngày giao: ${o.deliveryDate||o.date||''} · Tuyến: ${o.routeName||''} · Giao hàng: ${o.deliveryStaffCode||''} ${o.deliveryStaffName||''} · NV bán: ${o.salesStaffCode||''} ${o.salesStaffName||''}</p><p>Số đơn con: ${money(o.totalOrders)} · Tổng tiền: ${money(o.totalAmount)} · Còn thu: ${money(o.totalDebt)}</p><table class="print-table"><thead><tr><th>Đơn con</th><th>NV bán</th><th>Khách hàng</th><th>Tổng tiền</th><th>Còn thu</th></tr></thead><tbody>${(o.children||[]).map(c=>`<tr><td>${c.code||''}</td><td>${c.salesStaffCode||c.staffCode||''} ${c.salesStaffName||c.staffName||''}</td><td>${c.customerCode||''} - ${c.customerName||''}</td><td>${money(c.totalAmount)}</td><td>${money(c.debtAmount)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><title>In gộp đơn tổng</title><link rel="stylesheet" href="/print.css"></head><body>${html}<script>window.print()<\/script></body></html>`);w.document.close();
}
window.printSelectedMasterOrders=printSelectedMasterOrders;
async function loadMasterOrders(){
  if(!masterOrderList)return;
  const q=masterOrderSearch?masterOrderSearch.value.trim():'';
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  params.set('dateFrom', masterOrderDateFrom?.value || today());
  params.set('dateTo', masterOrderDateTo?.value || masterOrderDateFrom?.value || today());
  params.set('excludeInactive','1');
  const url=`/api/master-orders${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng');
    masterOrdersCache=(json.masterOrders||[]).filter(isActiveDocument);
    if(masterOrderCount)masterOrderCount.textContent=`${masterOrdersCache.length} đơn tổng`;
    if(!masterOrdersCache.length){masterOrderList.innerHTML='Chưa có đơn tổng nào.';return}
    masterOrderList.innerHTML=masterOrdersCache.map((order,idx)=>`
      <div class="order-card master-order-card">
        <div class="order-card-head">
          <h3><label><input type="checkbox" class="master-order-check" data-idx="${idx}"> ${order.code||order.id}</label></h3>
          <div class="order-actions">${masterStatusLabel(order.status)} ${isActiveDocument(order)?`<button class="small danger" onclick="cancelMasterOrder('${order.id}')">Hủy gộp</button>`:''}</div>
        </div>
        <div class="order-meta">Ngày giao: ${order.deliveryDate||order.date||''} · Tuyến: <strong>${order.routeName||''}</strong> · Giao hàng: ${order.deliveryStaffCode||''} ${order.deliveryStaffName||''} · NV bán: <strong>${order.salesStaffCode||''} ${order.salesStaffName||''}</strong></div>
        <div class="master-kpis">
          <span>${money(order.totalOrders)} đơn con</span>
          <span>Tổng SL: ${money(order.totalQuantity)}</span>
          <span>Tổng tiền: ${money(order.totalAmount)}</span>
          <span>Còn thu: ${money(order.totalDebt)}</span>
        </div>
        ${(order.note)?`<div class="order-meta">Ghi chú: ${order.note}</div>`:''}
        <details class="master-details"><summary>Xem đơn con</summary><ul class="order-items">${(order.children||[]).map(child=>`<li><strong>${child.code}</strong> · Ngày giao: ${child.deliveryDate||order.deliveryDate||order.date||''} · Trạng thái: ${deliveryStatusLabel(child.deliveryStatus||'pending')} · ${orderSourceLabel(child.orderSource)} · NV bán: ${child.salesStaffCode||child.staffCode||''} ${child.salesStaffName||child.staffName||''} · NV giao: ${child.deliveryStaffCode||order.deliveryStaffCode||''} ${child.deliveryStaffName||order.deliveryStaffName||''} · ${child.customerCode||''} ${child.customerName||''} · ${money(child.totalAmount)} · Còn thu ${money(child.debtAmount)}</li>`).join('')}</ul></details>
      </div>`).join('');
  }catch(err){
    if(masterOrderCount)masterOrderCount.textContent='Lỗi tải đơn tổng';
    masterOrderList.innerHTML=err.message;
  }
}

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


function deliveryStatusLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='delivering')return 'Đang giao';
  if(status==='late')return 'Quá giờ';
  if(status==='unpaid')return 'Chưa thu tiền';
  return 'Chờ giao';
}
function deliveryStatusClass(row){
  if(row.isLate)return 'delivery-late';
  if(row.deliveryStatus==='delivered' && Number(row.debt||0)<=0)return 'delivery-done';
  if(Number(row.debt||0)>0)return 'delivery-unpaid';
  if(row.deliveryStatus==='delivering')return 'delivery-running';
  return 'delivery-waiting';
}
function deliveryTimelineHtml(row){
  const steps=[
    ['created','Tạo đơn',true],
    ['stock','Xuất kho',true],
    ['delivering','Đang giao',row.deliveryStatus==='delivering'||row.deliveryStatus==='delivered'],
    ['delivered','Đã giao',row.deliveryStatus==='delivered'],
    ['paid','Thu tiền',Number(row.debt||0)<=0]
  ];
  return `<div class="delivery-timeline">${steps.map(step=>`<span class="${step[2]?'done':''}">${step[1]}</span>`).join('')}</div>`;
}

let deliveryRowsCache=[];
let selectedDeliveryOrderId='';

function getSelectedDeliveryRow(){
  return deliveryRowsCache.find(row=>String(row.id)===String(selectedDeliveryOrderId));
}

function deliveryRowPaid(row){
  return Number(row?.cashCollected||0)+Number(row?.bankCollected||0)+Number(row?.returnAmount||0);
}


function deliveryItemQty(item){
  return Number(item.quantity ?? item.qty ?? item.qtyOrder ?? item.soLuong ?? item.quantityBase ?? 0) || 0;
}
function deliveryItemPrice(item){
  return Number(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0) || 0;
}
function deliveryItemCode(item){
  return String(item.productCode || item.code || item.sku || item.productId || '').trim();
}
function deliveryItemName(item){
  return String(item.productName || item.name || item.itemName || '').trim();
}
function getReturnInputRows(){
  if(!deliveryReturnItems)return [];
  return Array.from(deliveryReturnItems.querySelectorAll('[data-return-code]'));
}
function getDeliveryReturnItemsPayload(){
  return getReturnInputRows().map(input=>{
    const qtyReturn=Number(input.value||0);
    const line=input.closest('.delivery-return-line');
    return {
      productCode: input.dataset.returnCode || '',
      productName: input.dataset.returnName || '',
      quantity: Number(input.dataset.orderQty || 0),
      qtyReturn,
      salePrice: Number(input.dataset.price || 0),
      amount: Math.round(qtyReturn * Number(input.dataset.price || 0))
    };
  }).filter(item=>item.qtyReturn>0);
}
function updateDeliveryReturnTotal(){
  const total=getDeliveryReturnItemsPayload().reduce((sum,item)=>sum+Number(item.amount||0),0);
  if(deliveryEditReturn)deliveryEditReturn.value=Math.round(total);
  if(deliveryReturnTotalText)deliveryReturnTotalText.textContent=money(total);
  recalcDeliveryEditDebt();
  renderDeliveryEditTotal();
}
function renderDeliveryEditTotal(){
  if(!deliveryEditTotalBox)return;
  const before=Number(deliveryEditDebtBefore?.value||0);
  const cash=Number(deliveryEditCash?.value||0);
  const bank=Number(deliveryEditBank?.value||0);
  const returned=Number(deliveryEditReturn?.value||0);
  const reward=Number(deliveryEditReward?.value||0);
  const debt=Math.max(0, Math.round(before-cash-bank-returned));
  deliveryEditTotalBox.innerHTML=`<div><span>Phải thu</span><b>${money(before)}</b></div><div><span>Tiền mặt</span><b>${money(cash)}</b></div><div><span>Chuyển khoản</span><b>${money(bank)}</b></div><div><span>Hàng trả</span><b>${money(returned)}</b></div><div><span>Trả thưởng</span><b>${money(reward)}</b></div><div class="total-debt"><span>Còn nợ</span><b>${money(debt)}</b></div>`;
}
function renderDeliveryReturnItems(row){
  if(!deliveryReturnItems)return;
  const items=Array.isArray(row?.items)?row.items:[];
  const savedReturns=new Map((Array.isArray(row?.returnItems)?row.returnItems:[]).map(item=>[String(item.productCode||item.code||item.productId||''), Number(item.qtyReturn||item.quantity||item.qty||0)]));
  if(!items.length){
    deliveryReturnItems.innerHTML='<div class="empty-state">Đơn này chưa có danh sách sản phẩm nên chưa thể chọn hàng trả.</div>';
    if(deliveryReturnTotalText)deliveryReturnTotalText.textContent='0';
    if(deliveryEditReturn)deliveryEditReturn.value=0;
    return;
  }
  deliveryReturnItems.innerHTML=`<div class="delivery-return-table">${items.map((item,index)=>{
    const code=deliveryItemCode(item) || `SP${index+1}`;
    const name=deliveryItemName(item);
    const qty=deliveryItemQty(item);
    const price=deliveryItemPrice(item);
    const saved=savedReturns.get(code)||0;
    return `<div class="delivery-return-line">
      <div class="delivery-return-product"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(name)}</span><small>SL đơn: ${qty} · Giá: ${money(price)}</small></div>
      <input data-return-code="${escapeHtml(code)}" data-return-name="${escapeHtml(name)}" data-order-qty="${qty}" data-price="${price}" type="number" min="0" max="${qty}" step="1" value="${saved}" placeholder="SL trả" />
    </div>`;
  }).join('')}</div>`;
  getReturnInputRows().forEach(input=>{
    input.addEventListener('input',()=>{
      const max=Number(input.max||0);
      if(Number(input.value||0)>max)input.value=max;
      if(Number(input.value||0)<0)input.value=0;
      updateDeliveryReturnTotal();
    });
  });
  updateDeliveryReturnTotal();
}

function clearDeliveryEditPanel(){
  selectedDeliveryOrderId='';
  if(deliveryEditForm)deliveryEditForm.reset();
  if(deliveryEditOrderId)deliveryEditOrderId.value='';
  if(deliveryEditStatus)deliveryEditStatus.textContent='Chưa chọn đơn';
  if(deliverySelectedSummary)deliverySelectedSummary.textContent='Chưa chọn đơn giao hàng.';
  if(deliveryReturnItems)deliveryReturnItems.innerHTML='<div class="empty-state">Chọn đơn để hiển thị sản phẩm.</div>';
  if(deliveryReturnTotalText)deliveryReturnTotalText.textContent='0';
  if(deliveryEditTotalBox)deliveryEditTotalBox.textContent='Chọn đơn để xem tổng kết.';
  if(deliveryEditMessage)deliveryEditMessage.textContent='';
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
}
window.clearDeliveryEditPanel=clearDeliveryEditPanel;

function fillDeliveryEditPanel(row){
  if(!row)return clearDeliveryEditPanel();
  selectedDeliveryOrderId=String(row.id||'');
  if(deliveryEditOrderId)deliveryEditOrderId.value=row.id||'';
  if(deliveryEditOrderCode)deliveryEditOrderCode.value=row.orderCode||'';
  if(deliveryEditCustomerName)deliveryEditCustomerName.value=row.customerName||'';
  if(deliveryEditDate)deliveryEditDate.value=row.deliveryDate||'';
  if(deliveryEditDeliveryStatus)deliveryEditDeliveryStatus.value=row.deliveryStatus||row.visualStatus||'waiting';
  if(deliveryEditStaffCode)deliveryEditStaffCode.value=row.deliveryStaffCode||'';
  if(deliveryEditStaffName)deliveryEditStaffName.value=row.deliveryStaffName||'';
  if(deliveryEditRouteName)deliveryEditRouteName.value=row.routeName||'';
  if(deliveryEditDebtBefore)deliveryEditDebtBefore.value=Math.round(Number(row.debtBeforeCollection ?? row.totalAmount ?? 0));
  if(deliveryEditCash)deliveryEditCash.value=Math.round(Number(row.cashCollected||0));
  if(deliveryEditBank)deliveryEditBank.value=Math.round(Number(row.bankCollected||0));
  if(deliveryEditReturn)deliveryEditReturn.value=Math.round(Number(row.returnAmount||0));
  if(deliveryEditReward)deliveryEditReward.value=Math.round(Number(row.rewardAmount||0));
  if(deliveryEditDebt)deliveryEditDebt.value=Math.round(Number(row.debt||0));
  if(deliveryEditNote)deliveryEditNote.value=row.deliveryNote||'';
  if(deliveryEditStatus)deliveryEditStatus.textContent=deliveryStatusLabel(row.visualStatus||row.deliveryStatus);
  if(deliverySelectedSummary){
    deliverySelectedSummary.innerHTML=`<strong>${escapeHtml(row.orderCode||'')} · ${escapeHtml(row.customerName||'')}</strong><span>${escapeHtml(row.customerCode||'')} · ${escapeHtml(row.customerPhone||'')} ${row.customerAddress?'· '+escapeHtml(row.customerAddress):''}</span><span><b>Phải thu: ${money(row.debtBeforeCollection ?? row.debt)}</b> · <b class="${Number(row.debt||0)>0?'debt-positive':'debt-zero'}">Còn nợ: ${money(row.debt)}</b></span>`;
  }
  renderDeliveryReturnItems(row);
  renderDeliveryEditTotal();
  if(deliveryEditMessage)deliveryEditMessage.textContent='';
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
  const card=document.querySelector(`.delivery-card[data-id="${CSS.escape(String(row.id||''))}"]`);
  if(card)card.classList.add('selected');
}

function selectDeliveryOrder(id){
  const row=deliveryRowsCache.find(item=>String(item.id)===String(id));
  if(row)fillDeliveryEditPanel(row);
}
window.selectDeliveryOrder=selectDeliveryOrder;

function recalcDeliveryEditDebt(){
  const before=Number(deliveryEditDebtBefore?.value||0);
  const cash=Number(deliveryEditCash?.value||0);
  const bank=Number(deliveryEditBank?.value||0);
  const returned=Number(deliveryEditReturn?.value||0);
  if(deliveryEditDebt)deliveryEditDebt.value=Math.max(0, Math.round(before-cash-bank-returned));
}
window.recalcDeliveryEditDebt=recalcDeliveryEditDebt;

async function submitDeliveryEdit(event){
  event.preventDefault();
  if(!deliveryEditOrderId?.value){showMessage(deliveryEditMessage,'Chưa chọn đơn để sửa',true);return;}
  const formData=new FormData(deliveryEditForm);
  const payload=Object.fromEntries(formData.entries());
  payload.returnItems=getDeliveryReturnItemsPayload();
  ['debtBeforeCollection','cashCollected','bankCollected','returnAmount','debtAmount','rewardAmount'].forEach(key=>{
    if(payload[key]!==undefined)payload[key]=Number(payload[key]||0);
  });
  try{
    showMessage(deliveryEditMessage,'Đang lưu chỉnh sửa...');
    const res=await fetch(`/api/master-orders/delivery-today/${encodeURIComponent(payload.orderId)}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không lưu được chỉnh sửa');
    showMessage(deliveryEditMessage,json.message||'Đã lưu chỉnh sửa');
    await loadDeliveryToday();
    if(payload.orderId)selectDeliveryOrder(payload.orderId);
  }catch(err){showMessage(deliveryEditMessage,err.message,true);}
}
window.submitDeliveryEdit=submitDeliveryEdit;

[deliveryEditCash,deliveryEditBank,deliveryEditReward].forEach(input=>{
  if(input)input.addEventListener('input',()=>{recalcDeliveryEditDebt();renderDeliveryEditTotal();});
});
async function loadDeliveryToday(){
  if(!deliveryTodayList)return;
  const params=new URLSearchParams();
  const date=deliveryDateFilter?.value||today();
  const q=deliverySearchInput?.value.trim()||'';
  const salesman=deliverySalesmanFilter?.value.trim()||'';
  const delivery=deliveryStaffFilter?.value.trim()||'';
  const route=deliveryRouteFilter?.value.trim()||'';
  const status=deliveryStatusFilter?.value||'';
  if(date)params.set('date',date);
  if(q)params.set('q',q);
  if(salesman)params.set('salesman',salesman);
  if(delivery)params.set('delivery',delivery);
  if(route)params.set('route',route);
  if(status)params.set('status',status);
  try{
    const res=await fetch(`/api/master-orders/delivery-today?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn đi giao');
    const rows=json.orders||[];
    deliveryRowsCache=rows;
    if(deliveryTodayList && json.formula){ deliveryTodayList.dataset.formula=json.formula; }
    const kpi=json.kpi||{};
    if(deliveryTotalKpi)deliveryTotalKpi.textContent=kpi.totalOrders||0;
    if(deliveryRunningKpi)deliveryRunningKpi.textContent=kpi.delivering||0;
    if(deliveryDoneKpi)deliveryDoneKpi.textContent=kpi.delivered||0;
    if(deliveryUnpaidKpi)deliveryUnpaidKpi.textContent=kpi.unpaid||0;
    if(deliveryLateKpi)deliveryLateKpi.textContent=kpi.late||0;
    const routes=json.routes||[];
    if(deliveryRouteSummary){
      deliveryRouteSummary.innerHTML=routes.length?routes.map(r=>`<div class="route-pill"><strong>${escapeHtml(r.routeName||'Chưa có tuyến')}</strong><span>${r.orderCount} đơn</span><small>NV giao: ${escapeHtml(r.deliveryStaffName||r.deliveryStaffCode||'Chưa gán')}</small></div>`).join(''):'';
    }
    if(!rows.length){
      deliveryTodayList.innerHTML='<div class="empty-state">Không có đơn đi giao theo bộ lọc hiện tại.</div>';
      clearDeliveryEditPanel();
      return;
    }
    deliveryTodayList.innerHTML=rows.map(row=>{
      const cls=deliveryStatusClass(row);
      const cash=Number(row.cashCollected||0);
      const bank=Number(row.bankCollected||0);
      const reward=Number(row.rewardAmount||0);
      const returned=Number(row.returnAmount||0);
      return `<article class="delivery-card delivery-compact-card delivery-customer-card ${cls} ${String(row.id)===String(selectedDeliveryOrderId)?'selected':''}" data-id="${escapeHtml(row.id||'')}" onclick="selectDeliveryOrder(this.dataset.id)">
        <div class="delivery-customer-head">
          <b>${escapeHtml(row.customerName||'Chưa có tên khách')}</b>
          <small>${escapeHtml(row.customerAddress||'Chưa có địa chỉ')}</small>
        </div>
        <div class="delivery-customer-money">
          <span>Phải thu <b>${money(row.debtBeforeCollection ?? row.debt)}</b></span>
          <span>Tiền mặt <b class="cash-in">${money(cash)}</b></span>
          <span>Chuyển khoản <b class="cash-in">${money(bank)}</b></span>
          <span>Trả thưởng <b>${money(reward)}</b></span>
          <span>Tổng hàng trả <b>${money(returned)}</b></span>
          <span>Công nợ <b class="${Number(row.debt||0)>0?'debt-positive':'debt-zero'}">${money(row.debt)}</b></span>
        </div>
      </article>`;
    }).join('');
    if(selectedDeliveryOrderId && !getSelectedDeliveryRow()) clearDeliveryEditPanel();
  }catch(err){
    deliveryTodayList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
}


