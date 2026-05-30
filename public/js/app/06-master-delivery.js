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
    if(deliveryTodayList && json.formula){ deliveryTodayList.dataset.formula=json.formula; }
    const kpi=json.kpi||{};
    if(deliveryTotalKpi)deliveryTotalKpi.textContent=kpi.totalOrders||0;
    if(deliveryRunningKpi)deliveryRunningKpi.textContent=kpi.delivering||0;
    if(deliveryDoneKpi)deliveryDoneKpi.textContent=kpi.delivered||0;
    if(deliveryUnpaidKpi)deliveryUnpaidKpi.textContent=kpi.unpaid||0;
    if(deliveryLateKpi)deliveryLateKpi.textContent=kpi.late||0;
    const routes=json.routes||[];
    if(deliveryRouteSummary){
      const formulaNote=`<div class="route-pill formula-pill"><strong>Công thức app</strong><span>${escapeHtml(json.formula||'Ngày giao + nhân viên giao + trạng thái chưa hoàn tất')}</span><small>Không lấy theo ngày tạo đơn</small></div>`;
      deliveryRouteSummary.innerHTML=formulaNote+(routes.length?routes.map(r=>`<div class="route-pill"><strong>${escapeHtml(r.routeName||'Chưa có tuyến')}</strong><span>${r.orderCount} đơn</span><small>NV giao: ${escapeHtml(r.deliveryStaffName||r.deliveryStaffCode||'Chưa gán')}</small></div>`).join(''):'');
    }
    if(!rows.length){
      deliveryTodayList.innerHTML='<div class="empty-state">Không có đơn đi giao theo bộ lọc hiện tại.</div>';
      return;
    }
    deliveryTodayList.innerHTML=rows.map(row=>{
      const cls=deliveryStatusClass(row);
      const paid=Number(row.cashCollected||0)+Number(row.bankCollected||0)+Number(row.returnAmount||0);
      return `<article class="delivery-card ${cls}">
        <div class="delivery-card-top">
          <div>
            <strong>${escapeHtml(row.orderCode||'')}</strong>
            <b>${escapeHtml(row.customerName||'')}</b>
            <small>${escapeHtml(row.customerCode||'')} · ${escapeHtml(row.customerPhone||'')} ${row.customerAddress?'· '+escapeHtml(row.customerAddress):''}</small>
          </div>
          <span class="delivery-badge">${deliveryStatusLabel(row.visualStatus||row.deliveryStatus)}</span>
        </div>
        <div class="delivery-info-grid">
          <span>NV bán <b>${escapeHtml(debtPersonLabel(row.salesmanCode,row.salesmanName))}</b></span>
          <span>NV giao <b>${escapeHtml(debtPersonLabel(row.deliveryStaffCode,row.deliveryStaffName))}</b></span>
          <span>Tuyến <b>${escapeHtml(row.routeName||'Chưa gán')}</b></span>
          <span>Ngày giao <b>${escapeHtml(row.deliveryDate||'')}</b></span>
        </div>
        <div class="delivery-money-grid">
          <span>Tổng tiền <b>${money(row.totalAmount)}</b></span>
          <span>Phải thu <b>${money(row.debtBeforeCollection ?? row.debt)}</b></span>
          <span>Đã xử lý <b class="cash-in">${money(paid)}</b></span>
          <span>Còn nợ <b class="${Number(row.debt||0)>0?'debt-positive':'debt-zero'}">${money(row.debt)}</b></span>
        </div>
        <div class="delivery-collection-row">
          <span>Tiền mặt: <b>${money(row.cashCollected||0)}</b></span>
          <span>Chuyển khoản: <b>${money(row.bankCollected||0)}</b></span>
          <span>Hàng trả về: <b>${money(row.returnAmount||0)}</b></span>
        </div>
        ${deliveryTimelineHtml(row)}
      </article>`;
    }).join('');
  }catch(err){
    deliveryTodayList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
}


