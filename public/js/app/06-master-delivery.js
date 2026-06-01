var DEBT_ZERO_TOLERANCE = window.DEBT_ZERO_TOLERANCE || 1000;
window.DEBT_ZERO_TOLERANCE = DEBT_ZERO_TOLERANCE;
function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}
function hasOpenDebt(value){ return normalizeDebtAmount(value) > 0; }

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
async function loadUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  const params=new URLSearchParams();
  if(unmergedOrderSearch && unmergedOrderSearch.value.trim())params.set('q',unmergedOrderSearch.value.trim());
  if(unmergedSourceFilter && unmergedSourceFilter.value)params.set('source',unmergedSourceFilter.value);
  params.set('date', unmergedDateFilter?.value || today());
  if(unmergedSalesStaffFilter && unmergedSalesStaffFilter.value.trim())params.set('salesStaff',unmergedSalesStaffFilter.value.trim());
  params.set('page','1');
  params.set('limit','50');
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

  // Đơn tổng phải in PHIẾU NHẶT HÀNG: danh sách sản phẩm đã gộp từ các đơn con.
  // Không tự dựng bảng danh sách đơn con ở frontend nữa, vì bảng đó chỉ dùng để xem/tổng hợp.
  // Luồng in đúng đi qua /api/print/master-orders/:id để backend load đơn con, gộp sản phẩm theo mã hàng/kho, rồi render mẫu ORDER_TOTAL.
  const ids=orders.map(o=>encodeURIComponent(o.id||o.code||o._id||'')).filter(Boolean);
  if(!ids.length){alert('Không xác định được mã đơn tổng để in');return}

  try{
    if(ids.length===1){
      window.open(`/api/print/master-orders/${ids[0]}`,'_blank');
      return;
    }

    const pages=[];
    for(const id of ids){
      const res=await fetch(`/api/print/master-orders/${id}`);
      const html=await res.text();
      if(!res.ok)throw new Error(html||'Không in được đơn tổng');
      const doc=new DOMParser().parseFromString(html,'text/html');
      pages.push(`<section class="print-page">${doc.body.innerHTML}</section>`);
    }
    const w=window.open('','_blank');
    w.document.write(`<!doctype html><html><head><title>In đơn tổng</title><link rel="stylesheet" href="/print.css"></head><body>${pages.join('')}<script>window.print()<\/script></body></html>`);
    w.document.close();
  }catch(err){
    alert(err.message||'Không in được đơn tổng');
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


function deliveryStatusLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='delivering')return 'Đang giao';
  if(status==='late')return 'Quá giờ';
  if(status==='unpaid')return 'Chưa thu tiền';
  return 'Chờ giao';
}
function deliveryStatusClass(row){
  if(row.isLate)return 'delivery-late';
  const debt=calculateDeliveryDebt(row);
  if(row.deliveryStatus==='delivered' && !hasOpenDebt(debt))return 'delivery-done';
  if(hasOpenDebt(debt))return 'delivery-unpaid';
  if(row.deliveryStatus==='delivering')return 'delivery-running';
  return 'delivery-waiting';
}
function deliveryTimelineHtml(row){
  const steps=[
    ['created','Tạo đơn',true],
    ['stock','Xuất kho',true],
    ['delivering','Đang giao',row.deliveryStatus==='delivering'||row.deliveryStatus==='delivered'],
    ['delivered','Đã giao',row.deliveryStatus==='delivered'],
    ['paid','Thu tiền',!hasOpenDebt(calculateDeliveryDebt(row))]
  ];
  return `<div class="delivery-timeline">${steps.map(step=>`<span class="${step[2]?'done':''}">${step[1]}</span>`).join('')}</div>`;
}

let deliveryRowsCache=[];
let selectedDeliveryOrderId='';
let selectedDeliveryAccountingIds=new Set();

function getSelectedDeliveryRow(){
  return deliveryRowsCache.find(row=>String(row.id)===String(selectedDeliveryOrderId));
}

function deliveryAccountingSelectableRows(){
  return (deliveryRowsCache||[]).filter(row=>!(row.accountingConfirmed||row.editLocked));
}
function syncDeliveryAccountingSelection(){
  const valid=new Set(deliveryAccountingSelectableRows().map(row=>String(row.id)));
  selectedDeliveryAccountingIds=new Set([...selectedDeliveryAccountingIds].filter(id=>valid.has(String(id))));
  document.querySelectorAll('.delivery-accounting-checkbox').forEach(cb=>{
    cb.checked=selectedDeliveryAccountingIds.has(String(cb.value));
    const card=cb.closest('.delivery-card');
    if(card) card.classList.toggle('accounting-selected', cb.checked);
  });
  const selectedCount=selectedDeliveryAccountingIds.size;
  const selectableCount=valid.size;
  if(confirmDeliveryAccountingButton){
    confirmDeliveryAccountingButton.disabled=!selectedCount;
    confirmDeliveryAccountingButton.textContent=selectedCount?`Đẩy ${selectedCount} đơn sang công nợ`:'Đẩy đơn đã chọn sang công nợ';
  }
  if(selectAllDeliveryAccountingButton){
    selectAllDeliveryAccountingButton.disabled=!selectableCount;
    selectAllDeliveryAccountingButton.textContent=selectableCount && selectedCount===selectableCount?'Đã chọn tất cả':'Chọn tất cả';
  }
  if(clearDeliveryAccountingSelectionButton){
    clearDeliveryAccountingSelectionButton.disabled=!selectedCount;
  }
}
function toggleDeliveryAccountingSelection(id, checked){
  const key=String(id||'');
  if(!key)return;
  if(checked) selectedDeliveryAccountingIds.add(key); else selectedDeliveryAccountingIds.delete(key);
  syncDeliveryAccountingSelection();
}
function selectAllDeliveryAccounting(){
  selectedDeliveryAccountingIds=new Set(deliveryAccountingSelectableRows().map(row=>String(row.id)));
  syncDeliveryAccountingSelection();
}
function clearDeliveryAccountingSelection(){
  selectedDeliveryAccountingIds.clear();
  syncDeliveryAccountingSelection();
}
window.toggleDeliveryAccountingSelection=toggleDeliveryAccountingSelection;
window.selectAllDeliveryAccounting=selectAllDeliveryAccounting;
window.clearDeliveryAccountingSelection=clearDeliveryAccountingSelection;

function deliveryToNumber(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function deliveryCompactMoney(value){
  const n=Math.round(deliveryToNumber(value));
  const sign=n<0?'-':'';
  const abs=Math.abs(n);
  if(abs>=1000000){
    const v=abs/1000000;
    const text=(abs%1000000===0?String(Math.round(v)):v.toFixed(1).replace('.',','));
    return `${sign}${text}tr`;
  }
  if(abs>=1000){
    return `${sign}${Math.round(abs/1000)}k`;
  }
  return `${sign}${abs}`;
}
function deliveryDebtBase(row){
  return deliveryToNumber(row?.debtBeforeCollection ?? row?.totalAmount ?? row?.amount ?? row?.debtAmount ?? row?.debt ?? 0);
}
function isDeliveryArLedgerSynced(row){
  return row?.arLedgerSynced === true || String(row?.debtSource || '').toLowerCase() === 'ar_ledger';
}
function deliveryArLedgerDebt(row){
  // AR Ledger có thể âm khi khách dư có; không ép về 0 để các màn thống nhất số liệu công nợ.
  return Math.round(deliveryToNumber(row?.arDebtAmount ?? row?.arBalance ?? row?.debtAmount ?? row?.debt ?? 0));
}
function deliveryDebtClass(value){
  const n=Math.round(deliveryToNumber(value));
  if(n>0)return 'debt-positive';
  if(n<0)return 'cash-in';
  return 'debt-zero';
}
function deliveryDebtCompactLabel(value){
  const n=Math.round(deliveryToNumber(value));
  if(n<0)return `Dư ${deliveryCompactMoney(Math.abs(n))}`;
  return deliveryCompactMoney(n);
}
function calculateDeliveryDraftDebt(row){
  return Math.max(0, normalizeDebtAmount(
    deliveryDebtBase(row)
    - deliveryToNumber(row?.cashCollected ?? row?.cashAmount ?? 0)
    - deliveryToNumber(row?.bankCollected ?? row?.transferAmount ?? row?.bankAmount ?? 0)
    - deliveryToNumber(row?.rewardAmount ?? row?.displayRewardAmount ?? 0)
    - deliveryToNumber(row?.returnAmount ?? row?.returnedAmount ?? 0)
  ));
}
function calculateDeliveryDebt(row){
  // Sau khi đơn đã được đẩy sang công nợ, chỉ hiển thị một nguồn duy nhất: AR Ledger.
  // Không trộn số tạm tính từ form với số công nợ đã ghi sổ, tránh cùng một đơn hiện 2 số khác nhau.
  if(isDeliveryArLedgerSynced(row)) return deliveryArLedgerDebt(row);
  return calculateDeliveryDraftDebt(row);
}
function deliveryRowPaid(row){
  return deliveryToNumber(row?.cashCollected||0)+deliveryToNumber(row?.bankCollected||0)+deliveryToNumber(row?.rewardAmount||0)+deliveryToNumber(row?.returnAmount||0);
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
function getDeliveryEditPaymentState(){
  const before=Math.round(Number(deliveryEditDebtBefore?.value||0));
  const cash=Math.round(Number(deliveryEditCash?.value||0));
  const bank=Math.round(Number(deliveryEditBank?.value||0));
  const returned=Math.round(Number(deliveryEditReturn?.value||0));
  const reward=Math.round(Number(deliveryEditReward?.value||0));
  const paid=cash+bank+returned+reward;
  const tolerance=DEBT_ZERO_TOLERANCE;
  const diff=normalizeDebtAmount(paid-before);
  const over=diff>0?diff:0;
  const debt=diff<0?Math.abs(diff):0;
  return {before,cash,bank,returned,reward,paid,over,debt};
}
function buildDeliveryOverpaymentMessage(state){
  return `Khách đang trả vượt số phải thu\n\nPhải thu: ${money(state.before)}\nĐã nhập: ${money(state.paid)}\n\nVượt: ${money(state.over)}\n\n[Quay lại chỉnh]`;
}
function renderDeliveryEditTotal(){
  if(!deliveryEditTotalBox)return;
  const state=getDeliveryEditPaymentState();
  const selectedRow=getSelectedDeliveryRow?.();
  deliveryEditTotalBox.innerHTML=`<div><span>Phải thu</span><b>${money(state.before)}</b></div><div><span>Tiền mặt</span><b>${money(state.cash)}</b></div><div><span>Chuyển khoản</span><b>${money(state.bank)}</b></div><div><span>Hàng trả</span><b>${money(state.returned)}</b></div><div><span>Trả thưởng</span><b>${money(state.reward)}</b></div><div><span>Đã nhập</span><b>${money(state.paid)}</b></div><div class="total-debt"><span>Còn nợ tạm tính</span><b>${money(state.debt)}</b></div>${state.over>0?`<div class="total-overpay"><span>Trả vượt</span><b>${money(state.over)}</b></div>`:''}`;
}
function renderDeliveryReturnItems(row){
  if(!deliveryReturnItems)return;
  const items=Array.isArray(row?.items)?row.items:[];
  const savedReturnItems=Array.isArray(row?.deliveryReturnItems)?row.deliveryReturnItems:(Array.isArray(row?.returnItems)?row.returnItems:[]);
  const savedReturns=new Map(savedReturnItems.map(item=>[String(item.productCode||item.code||item.productId||''), Number(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0)]));
  if(!items.length){
    deliveryReturnItems.innerHTML='<div class="empty-state">Đơn này chưa có danh sách sản phẩm nên chưa thể chọn hàng trả.</div>';
    if(deliveryReturnTotalText)deliveryReturnTotalText.textContent='0';
    if(deliveryEditReturn)deliveryEditReturn.value=0;
    return;
  }
  const returnLocked=Boolean(row?.returnLocked || row?.masterReturnOrderId || row?.masterReturnOrderCode || String(row?.returnMergeStatus||'').toLowerCase()==='merged');
  const lockMessage=row?.returnLockMessage || (returnLocked ? 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.' : '');
  deliveryReturnItems.innerHTML=`${returnLocked?`<div class="empty-state warning-state">${escapeHtml(lockMessage)}</div>`:''}<div class="delivery-return-table">${items.map((item,index)=>{
    const code=deliveryItemCode(item) || `SP${index+1}`;
    const name=deliveryItemName(item);
    const qty=deliveryItemQty(item);
    const price=deliveryItemPrice(item);
    const saved=savedReturns.get(code)||0;
    return `<div class="delivery-return-line">
      <div class="delivery-return-product"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(name)}</span><small>SL đơn: ${qty} · Giá: ${money(price)}</small></div>
      <input data-return-code="${escapeHtml(code)}" data-return-name="${escapeHtml(name)}" data-order-qty="${qty}" data-price="${price}" type="number" min="0" max="${qty}" step="1" value="${saved}" placeholder="SL trả" ${returnLocked?'disabled readonly':''} />
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
  [deliveryEditCash,deliveryEditBank,deliveryEditReward,deliveryEditNote].forEach(el=>{if(el)el.disabled=false;});
  if(deliveryEditSaveButton)deliveryEditSaveButton.disabled=false;
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
}
window.clearDeliveryEditPanel=clearDeliveryEditPanel;

function setDeliveryEditLocked(locked){
  [deliveryEditCash,deliveryEditBank,deliveryEditReward,deliveryEditNote].forEach(el=>{if(el)el.disabled=Boolean(locked);});
  if(deliveryEditSaveButton){
    deliveryEditSaveButton.disabled=Boolean(locked);
    deliveryEditSaveButton.textContent=locked?'Đã khóa bởi kế toán':'Lưu chỉnh sửa';
  }
  const returnInputs=document.querySelectorAll('#deliveryReturnItems input');
  returnInputs.forEach(input=>{input.disabled=Boolean(locked)||Boolean(input.dataset.locked==='1');});
}
window.setDeliveryEditLocked=setDeliveryEditLocked;

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
  if(deliveryEditDebtBefore)deliveryEditDebtBefore.value=Math.round(deliveryDebtBase(row));
  if(deliveryEditCash)deliveryEditCash.value=Math.round(Number(row.cashCollected||0));
  if(deliveryEditBank)deliveryEditBank.value=Math.round(Number(row.bankCollected||0));
  if(deliveryEditReturn)deliveryEditReturn.value=Math.round(Number(row.returnAmount||0));
  if(deliveryEditReward)deliveryEditReward.value=Math.round(Number(row.rewardAmount||0));
  if(deliveryEditDebt)deliveryEditDebt.value=calculateDeliveryDebt(row);
  if(deliveryEditNote)deliveryEditNote.value=row.deliveryNote||'';
  if(deliveryEditStatus)deliveryEditStatus.textContent=deliveryStatusLabel(row.visualStatus||row.deliveryStatus);
  if(deliverySelectedSummary){
    const calcDebt=calculateDeliveryDebt(row);
    const debtLabel='Còn nợ tạm tính';
    deliverySelectedSummary.innerHTML=`<strong>${escapeHtml(row.orderCode||'')} · ${escapeHtml(row.customerName||'')}</strong><span>${escapeHtml(row.customerCode||'')} · ${escapeHtml(row.customerPhone||'')} ${row.customerAddress?'· '+escapeHtml(row.customerAddress):''}</span><span><b>Phải thu: ${money(deliveryDebtBase(row))}</b> · <b class="${calcDebt>0?'debt-positive':'debt-zero'}">${debtLabel}: ${money(calcDebt)}</b></span>`;
  }
  renderDeliveryReturnItems(row);
  renderDeliveryEditTotal();
  setDeliveryEditLocked(row.editLocked||row.accountingConfirmed);
  if(deliveryEditMessage)deliveryEditMessage.textContent=(row.editLocked||row.accountingConfirmed)?'Kế toán đã xác nhận, đơn này đã khóa chỉnh sửa và đã đưa vào công nợ.':'';
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
  const reward=Number(deliveryEditReward?.value||0);
  const selectedRow=getSelectedDeliveryRow?.();
  if(deliveryEditDebt)deliveryEditDebt.value=isDeliveryArLedgerSynced(selectedRow)
    ? deliveryArLedgerDebt(selectedRow)
    : calculateDeliveryDraftDebt({debtBeforeCollection:before,cashCollected:cash,bankCollected:bank,returnAmount:returned,rewardAmount:reward});
}
window.recalcDeliveryEditDebt=recalcDeliveryEditDebt;

async function submitDeliveryEdit(event){
  event.preventDefault();
  if(!deliveryEditOrderId?.value){showMessage(deliveryEditMessage,'Chưa chọn đơn để sửa',true);return;}
  const formData=new FormData(deliveryEditForm);
  const payload=Object.fromEntries(formData.entries());
  const selectedRow=deliveryRowsCache.find(item=>String(item.id)===String(payload.orderId));
  if(selectedRow?.editLocked||selectedRow?.accountingConfirmed){
    showMessage(deliveryEditMessage,'Kế toán đã xác nhận, đơn giao đã khóa và không được chỉnh sửa',true);
    return;
  }
  if(selectedRow?.returnLocked){
    delete payload.returnItems;
  }else{
    payload.returnItems=getDeliveryReturnItemsPayload();
  }
  ['debtBeforeCollection','cashCollected','bankCollected','returnAmount','debtAmount','rewardAmount'].forEach(key=>{
    if(payload[key]!==undefined)payload[key]=Number(payload[key]||0);
  });
  const paymentState=getDeliveryEditPaymentState();
  if(paymentState.over>0){
    const message=buildDeliveryOverpaymentMessage(paymentState);
    showMessage(deliveryEditMessage, message.replace(/\n/g,' '), true);
    alert(message);
    renderDeliveryEditTotal();
    return;
  }
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
    // Sau khi lưu hàng trả ở màn Đơn đi giao, phải tải lại ngay các màn chứng từ liên quan
    // để người dùng thấy phiếu trả hàng xuất hiện ở Đơn trả hàng / Đơn tổng trả hàng.
    if(typeof loadReturnOrders === 'function') await loadReturnOrders();
    if(typeof loadUnmergedReturnOrders === 'function') await loadUnmergedReturnOrders();
    if(typeof loadMasterReturnOrders === 'function') await loadMasterReturnOrders();
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
  params.set('page','1');
  params.set('limit','50');
  try{
    const res=await fetch(`/api/master-orders/delivery-today?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn đi giao');
    const rows=json.orders||[];
    const accounting=json.accounting||{};
    deliveryRowsCache=rows;
    if(deliveryAccountingStatus){
      deliveryAccountingStatus.textContent=accounting.message||'';
      deliveryAccountingStatus.classList.toggle('confirmed', Boolean(accounting.confirmed));
    }
    if(confirmDeliveryAccountingButton){
      confirmDeliveryAccountingButton.disabled=true;
      confirmDeliveryAccountingButton.textContent=accounting.confirmed?'Kế toán đã xác nhận':'Đẩy đơn đã chọn sang công nợ';
    }
    if(deliveryTodayList && json.formula){ deliveryTodayList.dataset.formula=json.formula; }
    const moneyReport=rows.reduce((acc,row)=>{
      acc.total += deliveryDebtBase(row);
      acc.cash += deliveryToNumber(row.cashCollected||0);
      acc.bank += deliveryToNumber(row.bankCollected||0);
      acc.reward += deliveryToNumber(row.rewardAmount||0);
      acc.returned += deliveryToNumber(row.returnAmount||0);
      acc.debt += calculateDeliveryDebt(row);
      return acc;
    },{total:0,cash:0,bank:0,reward:0,returned:0,debt:0});
    // KPI Công nợ chỉ cộng phần còn nợ dương; khách dư có vẫn hiển thị ở dòng chi tiết nhưng không làm âm KPI phải thu.
    moneyReport.debt=Math.max(0, moneyReport.debt);
    if(deliveryTotalKpi)deliveryTotalKpi.textContent=money(moneyReport.total);
    if(deliveryRunningKpi)deliveryRunningKpi.textContent=money(moneyReport.cash);
    if(deliveryDoneKpi)deliveryDoneKpi.textContent=money(moneyReport.bank);
    if(deliveryUnpaidKpi)deliveryUnpaidKpi.textContent=money(moneyReport.reward);
    if(deliveryLateKpi)deliveryLateKpi.textContent=money(moneyReport.returned);
    if(typeof deliveryDebtKpi!=='undefined' && deliveryDebtKpi)deliveryDebtKpi.textContent=money(moneyReport.debt);
    const routes=json.routes||[];
    if(deliveryRouteSummary){
      deliveryRouteSummary.innerHTML=routes.length?routes.map(r=>`<div class="route-pill"><strong>${escapeHtml(r.routeName||'Chưa có tuyến')}</strong><span>${r.orderCount} đơn</span><small>NV giao: ${escapeHtml(r.deliveryStaffName||r.deliveryStaffCode||'Chưa gán')}</small></div>`).join(''):'';
    }
    if(!rows.length){
      deliveryTodayList.innerHTML='<div class="empty-state">Không có đơn đi giao theo bộ lọc hiện tại.</div>';
      selectedDeliveryAccountingIds.clear();
      syncDeliveryAccountingSelection();
      clearDeliveryEditPanel();
      return;
    }
    deliveryTodayList.innerHTML=rows.map(row=>{
      const cls=deliveryStatusClass(row);
      const cash=Number(row.cashCollected||0);
      const bank=Number(row.bankCollected||0);
      const reward=Number(row.rewardAmount||0);
      const returned=Number(row.returnAmount||0);
      const rowId=String(row.id||'');
      const locked=Boolean(row.accountingConfirmed||row.editLocked);
      const checked=selectedDeliveryAccountingIds.has(rowId);
      return `<article class="delivery-card delivery-compact-card delivery-customer-card delivery-list-row delivery-selectable-row ${cls} ${String(row.id)===String(selectedDeliveryOrderId)?'selected':''} ${checked?'accounting-selected':''} ${locked?'accounting-locked':''}" data-id="${escapeHtml(row.id||'')}" onclick="selectDeliveryOrder(this.dataset.id)">
        <label class="delivery-accounting-select" title="Chọn đơn này để đẩy sang công nợ" onclick="event.stopPropagation()">
          <input class="delivery-accounting-checkbox" type="checkbox" value="${escapeHtml(rowId)}" ${checked?'checked':''} ${locked?'disabled':''} onchange="toggleDeliveryAccountingSelection(this.value,this.checked)" />
        </label>
        <div class="delivery-customer-main">
          <b>${escapeHtml(row.customerName||'Chưa có tên khách')}</b>
          <small>${escapeHtml(row.customerAddress||'Chưa có địa chỉ')}</small>
          ${row.accountingConfirmed?'<small class="delivery-locked-note">Đã xác nhận kế toán · khóa sửa</small>':'<small class="delivery-open-note">Chưa xác nhận kế toán</small>'}
        </div>
        <div class="delivery-customer-money">
          <span class="money-pt" title="Phải thu: ${money(deliveryDebtBase(row))}"><em>PT</em><b>${deliveryCompactMoney(deliveryDebtBase(row))}</b></span>
          <span title="Tiền mặt: ${money(cash)}"><em>TM</em><b class="cash-in">${deliveryCompactMoney(cash)}</b></span>
          <span title="Chuyển khoản: ${money(bank)}"><em>CK</em><b class="cash-in">${deliveryCompactMoney(bank)}</b></span>
          <span title="Trả thưởng: ${money(reward)}"><em>Thưởng</em><b>${deliveryCompactMoney(reward)}</b></span>
          <span title="Hàng trả: ${money(returned)}"><em>Hàng trả</em><b>${deliveryCompactMoney(returned)}</b></span>
          <span class="money-debt" title="Công nợ: ${money(calculateDeliveryDebt(row))} · Nguồn: ${row.debtSource==='ar_ledger'?'AR Ledger':'Tạm tính đơn giao'}"><em>CN</em><b class="${deliveryDebtClass(calculateDeliveryDebt(row))}">${deliveryDebtCompactLabel(calculateDeliveryDebt(row))}</b></span>
        </div>
      </article>`;
    }).join('');
    syncDeliveryAccountingSelection();
    if(selectedDeliveryOrderId && !getSelectedDeliveryRow()) clearDeliveryEditPanel();
  }catch(err){
    deliveryTodayList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
}

async function confirmDeliveryAccounting(){
  const date=deliveryDateFilter?.value||today();
  syncDeliveryAccountingSelection();
  const selectedIds=[...selectedDeliveryAccountingIds];
  const rows=(deliveryRowsCache||[]).filter(row=>selectedIds.includes(String(row.id)));
  if(!rows.length){alert('Chưa chọn đơn nào để đẩy sang công nợ.');return;}
  const total=rows.reduce((sum,row)=>sum+deliveryDebtBase(row),0);
  const debt=rows.reduce((sum,row)=>sum+Math.max(0, calculateDeliveryDebt(row)),0);
  const ok=confirm(`Đẩy các đơn đã chọn sang công nợ?

Ngày giao: ${date}
Số đơn đã chọn: ${rows.length}
Tổng phải thu: ${money(total)}
Công nợ sẽ đưa vào sổ: ${money(debt)}

Sau khi xác nhận, các đơn được chọn sẽ bị khóa sửa và mới được đưa vào báo cáo công nợ.`);
  if(!ok)return;
  try{
    if(confirmDeliveryAccountingButton)confirmDeliveryAccountingButton.disabled=true;
    const res=await fetch('/api/master-orders/delivery-today/confirm-accounting',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({date, orderIds:selectedIds})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không xác nhận được kế toán');
    selectedDeliveryAccountingIds.clear();
    alert(json.message||'Đã đẩy đơn đã chọn sang công nợ');
    await loadDeliveryToday();
    if(typeof loadDebts==='function') await loadDebts();
    if(typeof loadReport==='function') await loadReport();
  }catch(err){
    alert(err.message||'Không xác nhận được kế toán');
    syncDeliveryAccountingSelection();
  }
}
window.confirmDeliveryAccounting=confirmDeliveryAccounting;
if(confirmDeliveryAccountingButton)confirmDeliveryAccountingButton.addEventListener('click',confirmDeliveryAccounting);
if(selectAllDeliveryAccountingButton)selectAllDeliveryAccountingButton.addEventListener('click',selectAllDeliveryAccounting);
if(clearDeliveryAccountingSelectionButton)clearDeliveryAccountingSelectionButton.addEventListener('click',clearDeliveryAccountingSelection);

