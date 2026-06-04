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
let deliverySummaryCache=[];
let deliverySalesSummaryCache=new Map();
let deliveryOpenStaffCode='';
let deliveryOpenSalesCode='';
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
    const allSelected=Boolean(selectableCount && selectedCount===selectableCount);
    selectAllDeliveryAccountingButton.textContent=allSelected?'Bỏ chọn tất cả':'Chọn tất cả';
    selectAllDeliveryAccountingButton.classList.toggle('is-clear-mode', allSelected);
  }
  if(clearDeliveryAccountingSelectionButton){
    clearDeliveryAccountingSelectionButton.disabled=!selectedCount;
    clearDeliveryAccountingSelectionButton.hidden=true;
  }
}
function toggleDeliveryAccountingSelection(id, checked){
  const key=String(id||'');
  if(!key)return;
  if(checked) selectedDeliveryAccountingIds.add(key); else selectedDeliveryAccountingIds.delete(key);
  syncDeliveryAccountingSelection();
}
function selectAllDeliveryAccounting(){
  const selectable=deliveryAccountingSelectableRows().map(row=>String(row.id));
  const allSelected=Boolean(selectable.length && selectedDeliveryAccountingIds.size===selectable.length && selectable.every(id=>selectedDeliveryAccountingIds.has(id)));
  selectedDeliveryAccountingIds=allSelected?new Set():new Set(selectable);
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



const v45DeliveryCommon = window.V45Common || {};
const deliveryDebtBase = v45DeliveryCommon.deliveryDebtBase;
const calculateDeliveryDebt = v45DeliveryCommon.calculateDeliveryDebt;
const deliveryReturnAmountFromItems = v45DeliveryCommon.deliveryReturnAmount;

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
  const m = readDeliveryMoneyClient(row);
  return Math.max(0, normalizeDebtAmount(
    deliveryDebtBase(row)
    - deliveryToNumber(m.cashAmount)
    - deliveryToNumber(m.bankAmount)
    - deliveryToNumber(m.rewardAmount)
    - deliveryReturnAmountFromItems(row)
  ));
}
function deliveryRowPaid(row){
  const m = readDeliveryMoneyClient(row);
  return deliveryToNumber(m.cashAmount)+deliveryToNumber(m.bankAmount)+deliveryToNumber(m.rewardAmount)+deliveryReturnAmountFromItems(row);
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
  const inputRows=getReturnInputRows();
  if(inputRows.length){
    return inputRows.map((input,index)=>{
      const qtyReturn=Math.max(0,Number(input.value||0)||0);
      const price=Number(input.dataset.price||0)||0;
      const code=String(input.dataset.returnCode||`SP${index+1}`).trim();
      const soldQty=Number(input.dataset.orderQty||0)||0;
      return {
        lineKey: input.dataset.lineKey || `${code}||${price}`,
        productCode: code,
        productName: String(input.dataset.returnName||'').trim(),
        soldQty,
        quantity: qtyReturn,
        returnQty: qtyReturn,
        qtyReturn,
        returnQuantity: qtyReturn,
        salePrice: price,
        price,
        returnAmount: Math.round(qtyReturn * price),
        amount: Math.round(qtyReturn * price)
      };
    });
  }
  const row=getSelectedDeliveryRow?.();
  const sourceItems=Array.isArray(row?.deliveryReturnItems)
    ? row.deliveryReturnItems
    : (Array.isArray(row?.returnItems) ? row.returnItems : []);
  const mergedItems=mergeReturnDraftItemsWithSoldItems(row||{}, sourceItems);
  return (Array.isArray(mergedItems)?mergedItems:[]).map((item,index)=>{
    const qtyReturn=deliveryReturnLineReturnQty(item);
    const price=deliveryItemPrice(item);
    const code=deliveryItemCode(item)||`SP${index+1}`;
    return {
      lineKey: item.lineKey || deliveryReturnLineKey(item),
      productCode: code,
      productName: deliveryItemName(item),
      soldQty: deliveryReturnLineSoldQty(item),
      quantity: qtyReturn,
      returnQty: qtyReturn,
      qtyReturn,
      returnQuantity: qtyReturn,
      salePrice: price,
      price,
      returnAmount: Math.round(qtyReturn * price),
      amount: Math.round(qtyReturn * price)
    };
  });
}

function calcReturnAmountFromReturnOrder(returnOrder){
  if(!returnOrder)return 0;
  const directTotal=Number(returnOrder.totalReturnAmount ?? returnOrder.returnAmount ?? returnOrder.totalAmount ?? returnOrder.amount ?? 0)||0;
  if(directTotal>0)return Math.round(directTotal);
  const items=Array.isArray(returnOrder.items)?returnOrder.items:[];
  return Math.round(items.reduce((sum,item)=>{
    const qty=Number(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0)||0;
    const price=Number(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0)||0;
    const amount=Number(item.returnAmount ?? item.amount ?? NaN);
    return sum+(Number.isFinite(amount)?amount:Math.round(qty*price));
  },0));
}


function deliveryDisplayOrderCode(row={}){
  // V45: id dạng SO178... là khóa nội bộ. Màn hình chỉ hiển thị mã đơn bán/DMS nếu có.
  return String(
    row.displayOrderCode ||
    row.code ||
    row.orderCode ||
    row.salesOrderCode ||
    row.invoiceCode ||
    row.documentCode ||
    row.id ||
    ''
  ).trim();
}

function deliveryRowOrderKeys(row={}){
  return [
    row.id,row._id,row.code,row.orderCode,row.salesOrderCode,row.salesOrderId,row.orderId,row.refCode,row.refId
  ].filter(Boolean).map(v=>String(v).trim()).filter(Boolean);
}

function returnOrderSalesKeys(ro={}){
  return [
    ro.salesOrderId,ro.salesOrderCode,ro.orderId,ro.orderCode,ro.refId,ro.refCode
  ].filter(Boolean).map(v=>String(v).trim()).filter(Boolean);
}

function isReturnOrderForDeliveryRow(row,ro){
  const rowKeys=deliveryRowOrderKeys(row);
  const roKeys=returnOrderSalesKeys(ro);
  if(!rowKeys.length||!roKeys.length)return false;
  return roKeys.some(key=>rowKeys.includes(key));
}

function findReturnOrderForDeliveryRow(row,returnOrders=[]){
  const exact=(returnOrders||[]).filter(ro=>isReturnOrderForDeliveryRow(row,ro));
  if(!exact.length)return null;
  return exact.slice().sort((a,b)=>{
    const amountDiff=calcReturnAmountFromReturnOrder(b)-calcReturnAmountFromReturnOrder(a);
    if(amountDiff!==0)return amountDiff;
    const ai=Array.isArray(a.items)?a.items.length:0;
    const bi=Array.isArray(b.items)?b.items.length:0;
    if(ai!==bi)return bi-ai;
    return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''));
  })[0];
}

function applyReturnOrderToDeliveryRow(row,returnOrder){
  if(!row)return row;
  if(!returnOrder){
    row.returnOrder=null;
    row.returnOrderId='';
    row.returnOrderCode='';
    row.returnOrderItems=[];
    row.deliveryReturnItems=[];
    row.returnItems=[];
    row.returnAmount=0;
    row.totalReturnAmount=0;
    row.returnDraftLoaded=true;
    return row;
  }
  const amount=calcReturnAmountFromReturnOrder(returnOrder);
  row.returnOrder=returnOrder;
  row.returnOrderId=returnOrder.id||returnOrder._id||returnOrder.code||'';
  row.returnOrderCode=returnOrder.code||returnOrder.id||'';
  row.returnOrderItems=mergeReturnDraftItemsWithSoldItems(row,Array.isArray(returnOrder.items)?returnOrder.items:[]);
  row.deliveryReturnItems=row.returnOrderItems;
  row.returnItems=row.returnOrderItems;
  row.returnAmount=amount;
  row.totalReturnAmount=amount;
  row.returnMergeStatus=returnOrder.returnMergeStatus||row.returnMergeStatus||'';
  row.masterReturnOrderId=returnOrder.masterReturnOrderId||row.masterReturnOrderId||'';
  row.masterReturnOrderCode=returnOrder.masterReturnOrderCode||row.masterReturnOrderCode||'';
  row.returnDraftLoaded=true;
  return row;
}

function mergeReturnOrdersIntoDeliveryRows(rows=[],returnOrders=[]){
  return (rows||[]).map(row=>applyReturnOrderToDeliveryRow(row,findReturnOrderForDeliveryRow(row,returnOrders)));
}

async function fetchReturnOrdersForDeliveryFilter(){
  // V45 speed fix: không còn tải returnOrders riêng ở màn Đơn đi giao hôm nay.
  // Backend đã merge returnOrders theo danh sách đơn đang hiển thị.
  return [];
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
  const matched=Number(state.debt||0)===0&&Number(state.over||0)===0;
  deliveryEditTotalBox.innerHTML=`<div class="delivery-total-chip total-receivable"><span>Phải thu</span><b>${money(state.before)}</b></div><div class="delivery-total-chip"><span>Tiền mặt</span><b>${money(state.cash)}</b></div><div class="delivery-total-chip"><span>Chuyển khoản</span><b>${money(state.bank)}</b></div><div class="delivery-total-chip"><span>Hàng trả</span><b>${money(state.returned)}</b></div><div class="delivery-total-chip"><span>Trả thưởng</span><b>${money(state.reward)}</b></div><div class="delivery-total-chip"><span>Đã nhập</span><b>${money(state.paid)}</b></div><div class="delivery-summary-status"><div class="summary-inline-item total-debt"><span>Còn nợ</span><b>${money(state.debt)}</b></div><div class="summary-inline-item total-overpay"><span>Trả vượt</span><b>${money(state.over)}</b></div><div class="summary-inline-item total-match ${matched?'is-matched':'is-unmatched'}"><span>Đối soát</span><b>${matched?'Đã khớp':'Chưa khớp'}</b></div></div>`;
}
function deliveryReturnLineKey(item = {}){
  const code=deliveryItemCode(item);
  const unit=String(item?.unit||item?.baseUnit||'').trim();
  const price=deliveryItemPrice(item);
  return `${code}|${unit}|${price}`;
}
function deliverySoldItemsForReturn(row = {}){
  const sources=[row?.soldItems,row?.orderItems,row?.salesOrderItems,row?.originalItems,row?.items];
  for(const source of sources){
    if(Array.isArray(source)&&source.length)return source;
  }
  return [];
}
function mergeReturnDraftItemsWithSoldItems(row = {}, draftItems = []){
  // Danh sách chính LUÔN là sản phẩm gốc của đơn giao. returnOrders chỉ dùng để điền SL trả.
  // Nhờ vậy sản phẩm chưa trả (SL trả = 0) vẫn hiện để người dùng có thể sửa/bổ sung.
  const soldItems=deliverySoldItemsForReturn(row);
  const cleanDraft=Array.isArray(draftItems)?draftItems:[];
  if(!soldItems.length)return cleanDraft;

  const byKey=new Map();
  const byCode=new Map();
  cleanDraft.forEach(item=>{
    const key=String(item.lineKey||deliveryReturnLineKey(item)).trim();
    const code=deliveryItemCode(item);
    if(key)byKey.set(key,item);
    if(code&&!byCode.has(code))byCode.set(code,item);
  });

  return soldItems.map((sold,index)=>{
    const key=String(sold.lineKey||deliveryReturnLineKey(sold)).trim();
    const code=deliveryItemCode(sold);
    const saved=byKey.get(key)||byCode.get(code)||{};
    // Tên/SL giao/Giá bán phải lấy từ order.items gốc; returnOrders chỉ cấp returnQty.
    const price=deliveryItemPrice(sold)||deliveryItemPrice(saved);
    const soldQty=deliveryReturnLineSoldQty(sold)||deliveryItemQty(sold)||deliveryReturnLineSoldQty(saved);
    const returnQty=deliveryReturnLineReturnQty(saved);
    return {
      ...sold,
      ...saved,
      productCode: deliveryItemCode(saved)||deliveryItemCode(sold)||`SP${index+1}`,
      productName: deliveryItemName(saved)||deliveryItemName(sold),
      unit: saved.unit||sold.unit||sold.baseUnit||'',
      soldQty,
      quantitySold: soldQty,
      price,
      salePrice: price,
      unitPrice: price,
      returnQty,
      qtyReturn: returnQty,
      returnQuantity: returnQty,
      returnedQty: returnQty,
      returnAmount: Math.round(returnQty*price),
      amount: Math.round(returnQty*price),
      lineKey: key||String(saved.lineKey||'')
    };
  });
}
function deliveryReturnDraftItems(row){
  let items=null;
  if(Array.isArray(row?.returnOrderItems))items=row.returnOrderItems;
  else if(Array.isArray(row?.returnDraftItems))items=row.returnDraftItems;
  else if(Array.isArray(row?.returnOrder?.items))items=row.returnOrder.items;
  else if(Array.isArray(row?.returnDraft?.items))items=row.returnDraft.items;
  if(Array.isArray(items))return mergeReturnDraftItemsWithSoldItems(row, items);
  return null;
}

function deliveryReturnLineSoldQty(item){
  return Number(item?.soldQty ?? item?.quantitySold ?? item?.orderQty ?? item?.totalQty ?? item?.qtySold ?? deliveryItemQty(item) ?? 0)||0;
}

function deliveryReturnLineReturnQty(item){
  return Number(item?.returnQty ?? item?.qtyReturn ?? item?.returnQuantity ?? item?.returnedQty ?? 0)||0;
}

function renderDeliveryReturnItems(row){
  if(!deliveryReturnItems)return;
  const draftItems=deliveryReturnDraftItems(row);
  const baseSoldItems=deliverySoldItemsForReturn(row);
  // Web copy đúng mẫu app giao hàng: danh sách chính là order.items, SL trả lấy từ returnOrders.
  // Không cho chỉnh sửa trên phần mềm: input chỉ để hiển thị giống app, luôn disabled/readonly.
  const items=baseSoldItems.length
    ? mergeReturnDraftItemsWithSoldItems(row, Array.isArray(draftItems)?draftItems:[])
    : (Array.isArray(draftItems)?draftItems:[]);
  const savedReturnItems=Array.isArray(draftItems)
    ? draftItems
    : (Array.isArray(row?.deliveryReturnItems)?row.deliveryReturnItems:(Array.isArray(row?.returnItems)?row.returnItems:[]));
  const savedReturns=new Map(savedReturnItems.map(item=>[String(item.productCode||item.code||item.productId||'').trim(), deliveryReturnLineReturnQty(item)]));
  if(!items.length){
    const hint= row?.returnDraftLoaded===false
      ? 'Đang tải danh sách hàng trả từ returnOrders...'
      : 'Đơn này chưa có danh sách sản phẩm.';
    deliveryReturnItems.innerHTML=`<div class="empty-line">${escapeHtml(hint)}</div>`;
    if(deliveryReturnTotalText)deliveryReturnTotalText.textContent='0';
    if(deliveryEditReturn)deliveryEditReturn.value=0;
    return;
  }
  const returnLocked=Boolean(row?.returnLocked || row?.masterReturnOrderId || row?.masterReturnOrderCode || row?.returnOrder?.masterReturnOrderId || row?.returnOrder?.masterReturnOrderCode || String(row?.returnMergeStatus||row?.returnOrder?.returnMergeStatus||'').toLowerCase()==='merged');
  const returnLockMessage=row?.returnLockMessage || (returnLocked ? 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.' : '');
  const currentReturn=deliveryReturnAmountFromItems(row);
  deliveryReturnItems.innerHTML=`
    <section class="delivery-block return-panel mobile-return-panel web-return-copy-panel web-return-copy-panel-flat">
      ${returnLocked ? `<p class="return-help warn-text">${escapeHtml(returnLockMessage)}</p>` : ''}
      <div class="mobile-return-scroll delivery-products-scroll">
        ${items.length ? items.map((item,index)=>{
          const code=deliveryItemCode(item) || `SP${index+1}`;
          const name=deliveryItemName(item);
          const qty=deliveryReturnLineSoldQty(item);
          const price=deliveryItemPrice(item);
          const returned=savedReturns.get(String(code).trim())||deliveryReturnLineReturnQty(item)||0;
          return `
          <div class="mobile-return-line delivery-product-line">
            <div class="return-product">
              <strong>${escapeHtml(code)}</strong>
              <span>${escapeHtml(name)}</span>
              <small>SL giao: ${money(qty)} · Giá bán: ${money(price)}</small>
            </div>
            <label>
              <span>SL trả</span>
              <input class="return-qty-input" data-return-code="${escapeHtml(code)}" data-return-name="${escapeHtml(name)}" data-line-key="${escapeHtml(item.lineKey||deliveryReturnLineKey(item))}" data-order-qty="${qty}" data-price="${price}" data-return-qty="${returned}" type="number" min="0" max="${qty}" step="1" value="${returned}" inputmode="numeric" ${returnLocked ? 'disabled readonly data-locked="1"' : ''} />
            </label>
          </div>`;
        }).join('') : '<div class="empty-line">Đơn này chưa có danh sách sản phẩm.</div>'}
      </div>
    </section>`;
  deliveryReturnItems.querySelectorAll('[data-return-code]').forEach(input=>{
    input.addEventListener('input',()=>{
      const max=Number(input.max||0);
      let value=Number(input.value||0);
      if(!Number.isFinite(value)||value<0)value=0;
      if(max>0&&value>max)value=max;
      input.value=Math.round(value);
      updateDeliveryReturnTotal();
    });
  });
  updateDeliveryReturnTotal();
}

async function loadReturnDraftForDeliveryRow(row){
  if(!row)return null;
  const salesOrderId=String(row.salesOrderId||row.orderId||row.id||row._id||'').trim();
  const salesOrderCode=String(row.salesOrderCode||row.orderCode||row.code||'').trim();
  const key=salesOrderId||salesOrderCode;
  if(!key)throw new Error('Không xác định được salesOrderId/salesOrderCode của đơn giao');
  const params=new URLSearchParams();
  if(salesOrderId)params.set('salesOrderId',salesOrderId);
  if(salesOrderCode)params.set('salesOrderCode',salesOrderCode);
  const res=await fetch(`/api/return-orders/by-sales-order/${encodeURIComponent(key)}?${params.toString()}`);
  const json=await res.json();
  if(!json.ok)throw new Error(json.message||'Không tải được returnOrders của đơn đang chọn');
  const exact=json.returnOrder||null;
  if(!exact){
    applyReturnOrderToDeliveryRow(row,null);
    return null;
  }
  applyReturnOrderToDeliveryRow(row,exact);
  return exact;
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
  if(typeof deliveryAdminUnlockButton!=='undefined'&&deliveryAdminUnlockButton)deliveryAdminUnlockButton.hidden=true;
  if(typeof deliveryReAccountingButton!=='undefined'&&deliveryReAccountingButton)deliveryReAccountingButton.hidden=true;
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
}
window.clearDeliveryEditPanel=clearDeliveryEditPanel;

function setDeliveryEditLocked(locked){
  const row=getSelectedDeliveryRow?.();
  const needReAccounting=Boolean(row?.needReAccounting||row?.adminAdjustmentOpen||String(row?.accountingStatus||'').toLowerCase()==='needs_repost');
  const lockedNow=Boolean(locked)&&!needReAccounting;
  [deliveryEditCash,deliveryEditBank,deliveryEditReward,deliveryEditNote].forEach(el=>{if(el)el.disabled=lockedNow;});
  if(deliveryEditSaveButton){
    deliveryEditSaveButton.disabled=lockedNow;
    deliveryEditSaveButton.textContent=lockedNow?'Đã khóa bởi kế toán':'Lưu chỉnh sửa';
  }
  if(typeof deliveryAdminUnlockButton!=='undefined'&&deliveryAdminUnlockButton){
    deliveryAdminUnlockButton.hidden=!Boolean(row&&(row.accountingConfirmed||row.editLocked)&&!needReAccounting);
  }
  if(typeof deliveryReAccountingButton!=='undefined'&&deliveryReAccountingButton){
    deliveryReAccountingButton.hidden=!Boolean(row&&needReAccounting);
  }
  const returnInputs=document.querySelectorAll('#deliveryReturnItems input');
  returnInputs.forEach(input=>{input.disabled=lockedNow||Boolean(input.dataset.locked==='1');});
}
window.setDeliveryEditLocked=setDeliveryEditLocked;

function fillDeliveryEditPanel(row){
  if(!row)return clearDeliveryEditPanel();
  selectedDeliveryOrderId=String(row.id||'');
  if(deliveryEditOrderId)deliveryEditOrderId.value=row.id||'';
  if(deliveryEditOrderCode)deliveryEditOrderCode.value=deliveryDisplayOrderCode(row);
  if(deliveryEditCustomerName)deliveryEditCustomerName.value=row.customerName||'';
  if(deliveryEditDate)deliveryEditDate.value=row.deliveryDate||'';
  if(deliveryEditDeliveryStatus)deliveryEditDeliveryStatus.value=row.deliveryStatus||row.visualStatus||'waiting';
  if(deliveryEditStaffCode)deliveryEditStaffCode.value=row.deliveryStaffCode||'';
  if(deliveryEditStaffName)deliveryEditStaffName.value=row.deliveryStaffName||'';
  if(deliveryEditRouteName)deliveryEditRouteName.value=row.routeName||'';
  if(deliveryEditDebtBefore)deliveryEditDebtBefore.value=Math.round(deliveryDebtBase(row));
  if(deliveryEditCash)deliveryEditCash.value=Math.round(readDeliveryMoneyClient(row).cashAmount);
  if(deliveryEditBank)deliveryEditBank.value=Math.round(readDeliveryMoneyClient(row).bankAmount);
  if(deliveryEditReturn)deliveryEditReturn.value=Math.round(deliveryReturnAmountFromItems(row));
  if(deliveryEditReward)deliveryEditReward.value=Math.round(readDeliveryMoneyClient(row).rewardAmount);
  if(deliveryEditDebt)deliveryEditDebt.value=calculateDeliveryDebt(row);
  if(deliveryEditNote)deliveryEditNote.value=row.deliveryNote||'';
  if(deliveryEditStatus)deliveryEditStatus.textContent=deliveryStatusLabel(row.visualStatus||row.deliveryStatus);
  if(deliverySelectedSummary){
    const calcDebt=calculateDeliveryDebt(row);
    const debtLabel='Còn nợ tạm tính';
    deliverySelectedSummary.innerHTML=`
      <div class="delivery-selected-title">
        <strong>${escapeHtml(deliveryDisplayOrderCode(row))}</strong>
        <span class="delivery-selected-status ${calcDebt>0?'debt-positive':'debt-zero'}">${debtLabel}: ${money(calcDebt)}</span>
      </div>
      <div class="delivery-selected-customer"><b>${escapeHtml(row.customerCode||'')}</b> · ${escapeHtml(row.customerName||'')}${row.customerPhone?' · '+escapeHtml(row.customerPhone):''}</div>
      ${row.customerAddress?`<div class="delivery-selected-address">${escapeHtml(row.customerAddress)}</div>`:''}
      <div class="delivery-selected-meta">
        <span>Phải thu: <b>${money(deliveryDebtBase(row))}</b></span>
        <span>NVBH: <b>${escapeHtml(row.salesmanCode||row.salesStaffCode||'')}</b></span>
        <span>NVGH: <b>${escapeHtml(row.deliveryStaffCode||'')}</b></span>
      </div>`;
  }
  renderDeliveryReturnItems(row);
  renderDeliveryEditTotal();
  setDeliveryEditLocked(row.editLocked||row.accountingConfirmed);
  if(deliveryEditMessage){
    const needReAccounting=Boolean(row.needReAccounting||row.adminAdjustmentOpen||String(row.accountingStatus||'').toLowerCase()==='needs_repost');
    deliveryEditMessage.textContent=needReAccounting?'Đang điều chỉnh bởi admin. Sau khi lưu phải bấm Xác nhận lại kế toán để reverse/post lại AR Ledger.':((row.editLocked||row.accountingConfirmed)?'Kế toán đã xác nhận, đơn này đã khóa chỉnh sửa và đã đưa vào công nợ.':'');
  }
  document.querySelectorAll('.delivery-card.selected').forEach(el=>el.classList.remove('selected'));
  const card=document.querySelector(`.delivery-card[data-id="${CSS.escape(String(row.id||''))}"]`);
  if(card)card.classList.add('selected');
}

async function selectDeliveryOrder(id){
  const row=deliveryRowsCache.find(item=>String(item.id)===String(id));
  if(!row)return;
  row.returnDraftLoaded=false;
  fillDeliveryEditPanel(row);
  try{
    await loadReturnDraftForDeliveryRow(row);
    deliveryRowsCache=deliveryRowsCache.map(item=>String(item.id)===String(row.id)?row:item);
    updateDeliveryKpiFromSummary(buildDeliveryKpiFromRows(deliveryRowsCache));
    renderDeliveryTodaySummary();
    if(String(selectedDeliveryOrderId)===String(row.id))fillDeliveryEditPanel(row);
  }catch(err){
    row.returnDraftLoaded=true;
    if(deliveryReturnItems)deliveryReturnItems.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
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

function selectedDeliverySalesOrderKey(row = {}){
  return String(row.salesOrderId||row.orderId||row.id||row._id||row.salesOrderCode||row.orderCode||row.code||'').trim();
}
function selectedDeliveryReturnDate(row = {}){
  // V45: hàng trả phải đi theo đúng ngày giao đang lọc trên màn Đơn đi giao hôm nay.
  // Không để API tự lấy ngày hiện tại, vì sẽ làm phiếu trả bị lệch ngày khi xem/lọc.
  return String(
    deliveryDateFilter?.value ||
    row.deliveryDate ||
    row.date ||
    row.documentDate ||
    row.orderDate ||
    today() ||
    ''
  ).trim();
}
async function saveDeliveryReturnItemsTwoWay(row){
  if(!row)return null;
  const items=getDeliveryReturnItemsPayload().map(item=>({
    lineKey:item.lineKey,
    productCode:item.productCode,
    productName:item.productName,
    soldQty:item.soldQty,
    quantitySold:item.soldQty,
    price:item.price,
    salePrice:item.price,
    unitPrice:item.price,
    returnQty:item.returnQty,
    qtyReturn:item.returnQty,
    returnQuantity:item.returnQty,
    quantity:item.returnQty,
    amount:item.amount,
    returnAmount:item.amount
  }));
  const key=selectedDeliverySalesOrderKey(row);
  if(!key)throw new Error('Không xác định được đơn giao để lưu hàng trả');
  const returnDate=selectedDeliveryReturnDate(row);
  const body={
    salesOrderId:row.salesOrderId||row.orderId||row.id||'',
    salesOrderCode:row.salesOrderCode||row.orderCode||row.code||'',
    date:returnDate,
    deliveryDate:returnDate,
    documentDate:returnDate,
    deliveryStaffId:row.deliveryStaffId||'',
    deliveryStaffCode:row.deliveryStaffCode||'',
    deliveryStaffName:row.deliveryStaffName||'',
    salesStaffId:row.salesStaffId||row.staffId||'',
    salesStaffCode:row.salesStaffCode||row.staffCode||'',
    salesStaffName:row.salesStaffName||row.staffName||'',
    items,
    source:'web',
    updatedFrom:'web'
  };
  const res=await fetch(`/api/return-orders/by-sales-order/${encodeURIComponent(key)}/items`,{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const json=await res.json();
  if(!json.ok)throw new Error(json.message||'Không lưu được số lượng hàng trả');
  applyReturnOrderToDeliveryRow(row,json.returnOrder);
  return json.returnOrder;
}

async function submitDeliveryEdit(event){
  event.preventDefault();
  if(!deliveryEditOrderId?.value){showMessage(deliveryEditMessage,'Chưa chọn đơn để sửa',true);return;}
  const formData=new FormData(deliveryEditForm);
  const payload=Object.fromEntries(formData.entries());
  const selectedRow=deliveryRowsCache.find(item=>String(item.id)===String(payload.orderId));
  const needReAccounting=Boolean(selectedRow?.needReAccounting||selectedRow?.adminAdjustmentOpen||String(selectedRow?.accountingStatus||'').toLowerCase()==='needs_repost');
  if((selectedRow?.editLocked||selectedRow?.accountingConfirmed)&&!needReAccounting){
    showMessage(deliveryEditMessage,'Kế toán đã xác nhận, admin cần bấm Mở khóa điều chỉnh trước khi sửa',true);
    return;
  }
  // Đồng bộ 2 chiều: phần mềm và app cùng sửa vào nguồn duy nhất returnOrders.
  const returnItemsPayload=getDeliveryReturnItemsPayload();
  payload.returnAmount=returnItemsPayload.reduce((sum,item)=>sum+Number(item.amount||0),0);
  delete payload.returnItems;
  ['debtBeforeCollection','cashAmount','bankAmount','returnAmount','debtAmount','rewardAmount'].forEach(key=>{
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
    showMessage(deliveryEditMessage,'Đang lưu hàng trả vào returnOrders...');
    await saveDeliveryReturnItemsTwoWay(selectedRow);
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

function deliverySummaryParams(){
  const params=new URLSearchParams();
  const date=deliveryDateFilter?.value||today();
  const q=deliverySearchInput?.value.trim()||'';
  const delivery=deliveryStaffFilter?.value.trim()||'';
  const salesman=deliverySalesmanFilter?.value.trim()||'';
  const route=deliveryRouteFilter?.value?.trim?.()||'';
  const status=deliveryStatusFilter?.value||'';
  if(date)params.set('date',date);
  if(q)params.set('q',q);
  if(delivery)params.set('delivery',delivery);
  if(salesman){
    params.set('salesman',salesman);
    params.set('salesStaff',salesman);
    params.set('salesStaffCode',salesman);
  }
  if(route)params.set('route',route);
  if(status)params.set('status',status);
  params.set('limit','5000');
  return params;
}
function deliveryMetricValues(row){
  const pt=Number(row.totalReceivable ?? row.totalAmount ?? 0);
  const moneyFields=readDeliveryMoneyClient(row);
  const tm=moneyFields.cashAmount;
  const ck=moneyFields.bankAmount;
  const tt=moneyFields.rewardAmount;
  const th=deliveryReturnAmountFromItems(row);
  const cn=isDeliveryArLedgerSynced(row)
    ? deliveryArLedgerDebt(row)
    : Math.max(0, normalizeDebtAmount(pt-tm-ck-tt-th));
  return { pt, tm, ck, tt, th, cn };
}
function deliveryMetricBadge(label,value,cls,title){
  return `<span class="delivery-mini-metric metric-${cls}" title="${escapeHtml(title||label)}: ${money(value)}"><em>${label}</em><b>${escapeHtml(cls==='cn'?deliveryDebtCompactLabel(value):deliveryCompactMoney(value))}</b></span>`;
}
function deliveryAmountMetricBadges(row){
  const m=deliveryMetricValues(row);
  return `${deliveryMetricBadge('PT',m.pt,'pt','Tổng phải thu')}${deliveryMetricBadge('TM',m.tm,'tm','Tiền mặt')}${deliveryMetricBadge('CK',m.ck,'ck','Chuyển khoản')}${deliveryMetricBadge('TT',m.tt,'tt','Trả thưởng')}${deliveryMetricBadge('TH',m.th,'th','Trả hàng từ returnOrders')}${deliveryMetricBadge('CN',m.cn,'cn','Công nợ')}`;
}
function deliveryMetricBadges(row){
  return `<span class="delivery-order-count">${Number(row.orderCount||0)}Đ</span><span class="delivery-mini-metrics">${deliveryAmountMetricBadges(row)}</span>`;
}
function deliveryAmountMetricLine(row){
  const { pt, tm, ck, tt, th, cn } = deliveryMetricValues(row);
  return `PT ${deliveryCompactMoney(pt)} | TM ${deliveryCompactMoney(tm)} | CK ${deliveryCompactMoney(ck)} | TT ${deliveryCompactMoney(tt)} | TH ${deliveryCompactMoney(th)} | CN ${deliveryDebtCompactLabel(cn)}`;
}
function deliveryMetricLine(row){
  return `${Number(row.orderCount||0)}Đ | ${deliveryAmountMetricLine(row)}`;
}
function deliveryStaffSafeKey(row){return String(row.deliveryStaffCode||row.deliveryStaffName||'NO_DELIVERY').trim()||'NO_DELIVERY';}
function deliverySalesSafeKey(row){return String(row.salesStaffCode||row.salesStaffName||'NO_SALES').trim()||'NO_SALES';}
function updateDeliveryKpiFromSummary(kpi={}){
  if(deliveryTotalKpi)deliveryTotalKpi.textContent=money(kpi.totalReceivable||kpi.totalAmount||0);
  if(deliveryRunningKpi)deliveryRunningKpi.textContent=money(kpi.cashAmount||0);
  if(deliveryDoneKpi)deliveryDoneKpi.textContent=money(kpi.bankAmount||0);
  if(deliveryUnpaidKpi)deliveryUnpaidKpi.textContent=money(kpi.bonusAmount||kpi.rewardAmount||0);
  if(deliveryLateKpi)deliveryLateKpi.textContent=money(kpi.returnAmount||0);
  if(typeof deliveryDebtKpi!=='undefined' && deliveryDebtKpi)deliveryDebtKpi.textContent=money(kpi.debtAmount||kpi.remainingAmount||0);
}
function buildDeliveryKpiFromRows(rows=[]){
  return (rows||[]).reduce((sum,row)=>{
    const m=deliveryMetricValues(row);
    sum.totalReceivable+=m.pt;
    sum.cashAmount+=m.tm;
    sum.bankAmount+=m.ck;
    sum.bonusAmount+=m.tt;
    sum.returnAmount+=m.th;
    sum.debtAmount+=m.cn;
    return sum;
  },{totalReceivable:0,cashAmount:0,bankAmount:0,bonusAmount:0,returnAmount:0,debtAmount:0});
}
function selectedDeliveryStaffQuery(){
  return String(deliveryStaffFilter?.value||'').trim();
}
function renderDeliveryTodaySummary(){
  if(!deliveryTodayList)return;
  const staffQuery=selectedDeliveryStaffQuery();
  if(!staffQuery){
    deliveryTodayList.innerHTML='<div class="empty-state compact-empty"><b>Vui lòng chọn nhân viên giao hàng</b><br><small>Danh sách khách hàng chỉ hiển thị sau khi chọn NVGH để tránh rối và tránh tải toàn bộ đơn.</small></div>';
    return;
  }
  const rows=deliveryRowsCache||[];
  if(!rows.length){
    deliveryTodayList.innerHTML='<div class="empty-state">Không có khách hàng/đơn giao nào của nhân viên giao hàng đã chọn.</div>';
    return;
  }
  deliveryTodayList.innerHTML=`<div class="delivery-customer-list-head">
    <span>Khách hàng / đơn giao</span>
    <span>Thông tin thu tiền</span>
  </div>${renderCompactDeliveryOrders(rows)}`;
}
function renderDeliverySalesSummaryRows(deliveryCode, rows){
  if(!rows||!rows.length)return '<div class="empty-state compact-empty">Đang tải / chưa có chi tiết NVBH.</div>';
  return rows.map(row=>{
    const salesCode=deliverySalesSafeKey(row);
    const open=String(deliveryOpenStaffCode)===String(deliveryCode)&&String(deliveryOpenSalesCode)===String(salesCode);
    return `<div class="delivery-sales-block ${open?'open':''}">
      <button type="button" class="delivery-accordion-row delivery-sales-summary-row" onclick="toggleDeliverySalesOrders('${escapeHtml(deliveryCode)}','${escapeHtml(salesCode)}')">
        <span class="delivery-caret">${open?'▼':'▶'}</span>
        <b>${escapeHtml(row.salesStaffName||row.salesStaffCode||'Chưa có NVBH')}</b>
        <span class="delivery-summary-metrics">${deliveryMetricBadges(row)}</span>
      </button>
      <div class="delivery-sales-orders-box" data-delivery="${escapeHtml(deliveryCode)}" data-sales="${escapeHtml(salesCode)}" ${open?'':'hidden'}>
        ${open?renderCompactDeliveryOrders(deliveryRowsCache):''}
      </div>
    </div>`;
  }).join('');
}
function renderCompactDeliveryOrders(rows=[]){
  if(!rows.length)return '<div class="empty-state compact-empty">Chưa có đơn thuộc nhóm này.</div>';
  return rows.map(row=>{
    const receivable=Number(row.totalReceivable ?? row.totalAmount ?? 0);
    const moneyFields=readDeliveryMoneyClient(row);
    const cash=moneyFields.cashAmount;
    const bank=moneyFields.bankAmount;
    const reward=moneyFields.rewardAmount;
    const returned=deliveryReturnAmountFromItems(row);
    const debt=isDeliveryArLedgerSynced(row)
      ? deliveryArLedgerDebt(row)
      : Math.max(0,normalizeDebtAmount(receivable-cash-bank-reward-returned));
    const locked=Boolean(row.accountingConfirmed||row.editLocked);
    const rowId=String(row.id||'');
    const checked=selectedDeliveryAccountingIds.has(rowId);
    return `<article class="delivery-card delivery-compact-card delivery-customer-card delivery-list-row delivery-selectable-row ${String(row.id)===String(selectedDeliveryOrderId)?'selected':''} ${checked?'accounting-selected':''} ${locked?'accounting-locked':''}" data-id="${escapeHtml(row.id||'')}" onclick="selectDeliveryOrder(this.dataset.id)">
      <label class="delivery-accounting-select" title="Chọn đơn này để đẩy sang công nợ" onclick="event.stopPropagation()">
        <input class="delivery-accounting-checkbox" type="checkbox" value="${escapeHtml(rowId)}" ${checked?'checked':''} ${locked?'disabled':''} onchange="toggleDeliveryAccountingSelection(this.value,this.checked)" />
      </label>
      <div class="delivery-customer-main one-line">
        <b>${escapeHtml(deliveryDisplayOrderCode(row))}</b>
        <span>${escapeHtml(row.customerName||'Chưa có khách')}</span>
        <small>${escapeHtml(row.salesmanName||row.salesmanCode||'')}</small>
      </div>
      <div class="delivery-customer-money one-line-money">
        <span class="money-pt" title="Tổng phải thu: ${money(receivable)}"><em>PT</em><b>${deliveryCompactMoney(receivable)}</b></span>
        <span class="money-tm" title="Tiền mặt: ${money(cash)}"><em>TM</em><b>${deliveryCompactMoney(cash)}</b></span>
        <span class="money-ck" title="Chuyển khoản: ${money(bank)}"><em>CK</em><b>${deliveryCompactMoney(bank)}</b></span>
        <span class="money-tt" title="Trả thưởng: ${money(reward)}"><em>TT</em><b>${deliveryCompactMoney(reward)}</b></span>
        <span class="money-th" title="Trả hàng từ returnOrders: ${money(returned)}"><em>TH</em><b>${deliveryCompactMoney(returned)}</b></span>
        <span class="money-cn" title="Công nợ: ${money(debt)}"><em>CN</em><b class="${deliveryDebtClass(debt)}">${deliveryDebtCompactLabel(debt)}</b></span>
      </div>
    </article>`;
  }).join('');
}
async function toggleDeliveryStaffSummary(deliveryCode){
  deliveryOpenSalesCode='';
  deliveryRowsCache=[];
  clearDeliveryEditPanel();
  if(String(deliveryOpenStaffCode)===String(deliveryCode)){
    deliveryOpenStaffCode='';
    renderDeliveryTodaySummary();
    return;
  }
  deliveryOpenStaffCode=deliveryCode;
  renderDeliveryTodaySummary();
  if(!deliverySalesSummaryCache.has(deliveryCode)){
    const params=deliverySummaryParams();
    const clientStartedAt=performance.now();
    const res=await fetch(`/api/master-orders/delivery-today-summary/${encodeURIComponent(deliveryCode)}?${params.toString()}`);
    const json=await res.json();
    const clientMs=Math.round(performance.now()-clientStartedAt);
    console.log('[DELIVERY_TODAY_SUMMARY_PERF]', { deliveryCode, clientMs, serverMs: json.serverMs||json.ms||res.headers.get('X-Response-Time-Ms'), perf: json.perf });
    if(!json.ok)throw new Error(json.message||'Không tải được chi tiết NVBH');
    deliverySalesSummaryCache.set(deliveryCode,json.summary||[]);
  }
  renderDeliveryTodaySummary();
}
window.toggleDeliveryStaffSummary=toggleDeliveryStaffSummary;
async function toggleDeliverySalesOrders(deliveryCode,salesCode){
  if(String(deliveryOpenStaffCode)===String(deliveryCode)&&String(deliveryOpenSalesCode)===String(salesCode)){
    deliveryOpenSalesCode='';
    deliveryRowsCache=[];
    clearDeliveryEditPanel();
    renderDeliveryTodaySummary();
    return;
  }
  deliveryOpenStaffCode=deliveryCode;
  deliveryOpenSalesCode=salesCode;
  const params=deliverySummaryParams();
  params.set('deliveryStaffCode',deliveryCode);
  params.set('delivery',deliveryCode);
  params.set('salesStaffCode',salesCode);
  params.set('salesman',salesCode);
  const clientStartedAt=performance.now();
  const res=await fetch(`/api/master-orders/delivery-today-orders?${params.toString()}`);
  const json=await res.json();
  const clientMs=Math.round(performance.now()-clientStartedAt);
  console.log('[DELIVERY_TODAY_ORDERS_PERF]', { deliveryCode, salesCode, clientMs, serverMs: json.serverMs||json.ms||res.headers.get('X-Response-Time-Ms'), perf: json.perf, returned: (json.orders||[]).length });
  if(!json.ok)throw new Error(json.message||'Không tải được danh sách đơn');
  deliveryRowsCache=json.orders||[];
  renderDeliveryTodaySummary();
  syncDeliveryAccountingSelection();
}
window.toggleDeliverySalesOrders=toggleDeliverySalesOrders;

async function loadDeliveryToday(){
  if(!deliveryTodayList)return;
  const params=deliverySummaryParams();
  const staffQuery=selectedDeliveryStaffQuery();
  deliveryRowsCache=[];
  deliverySummaryCache=[];
  deliverySalesSummaryCache=new Map();
  deliveryOpenStaffCode='';
  deliveryOpenSalesCode='';
  selectedDeliveryAccountingIds.clear();
  clearDeliveryEditPanel();

  if(!staffQuery){
    updateDeliveryKpiFromSummary({});
    if(deliveryAccountingStatus){
      deliveryAccountingStatus.textContent='Chọn nhân viên giao hàng để hiển thị danh sách khách hàng/đơn giao.';
      deliveryAccountingStatus.classList.remove('confirmed');
    }
    if(confirmDeliveryAccountingButton){
      confirmDeliveryAccountingButton.disabled=true;
      confirmDeliveryAccountingButton.textContent='Đẩy đơn đã chọn sang công nợ';
    }
    if(deliveryRouteSummary){
      deliveryRouteSummary.innerHTML='<div class="route-pill compact-help"><strong>Danh sách khách hàng</strong><span>Chỉ hiện sau khi chọn NVGH</span><small>Không còn nhóm accordion theo nhân viên.</small></div>';
    }
    renderDeliveryTodaySummary();
    syncDeliveryAccountingSelection();
    return;
  }

  try{
    deliveryTodayList.innerHTML='<div class="empty-state">Đang tải danh sách khách hàng của nhân viên giao hàng...</div>';
    params.set('delivery',staffQuery);
    params.set('deliveryStaffCode',staffQuery);
    const clientStartedAt=performance.now();
    const res=await fetch(`/api/master-orders/delivery-today-orders?${params.toString()}`);
    const json=await res.json();
    const clientMs=Math.round(performance.now()-clientStartedAt);
    const serverMs=Number(json.serverMs||json.ms||res.headers.get('X-Response-Time-Ms')||0);
    console.log('[DELIVERY_TODAY_LIST_PERF]', { clientMs, serverMs, perf: json.perf, returned: (json.orders||[]).length });
    if(!json.ok)throw new Error(json.message||'Không tải được danh sách đơn đi giao');
    deliveryRowsCache=json.orders||[];
    // V45 speed fix: /api/master-orders/delivery-today-orders đã trả sẵn returnItems/returnAmount.
    // Không gọi thêm /api/return-orders?limit=5000 vì gây chậm 6-8 giây và trùng dữ liệu.
    updateDeliveryKpiFromSummary(buildDeliveryKpiFromRows(deliveryRowsCache));
    if(deliveryAccountingStatus){
      deliveryAccountingStatus.textContent=`Đang hiển thị ${deliveryRowsCache.length} đơn/khách hàng của NVGH đã chọn. API ${serverMs}ms · Trình duyệt ${clientMs}ms. Có thể tick đơn rồi đẩy sang công nợ.`;
      deliveryAccountingStatus.classList.remove('confirmed');
    }
    if(confirmDeliveryAccountingButton){
      confirmDeliveryAccountingButton.disabled=!deliveryRowsCache.length;
      confirmDeliveryAccountingButton.textContent='Đẩy đơn đã chọn sang công nợ';
    }
    if(deliveryRouteSummary){
      deliveryRouteSummary.innerHTML='<div class="route-pill compact-help"><strong>Dạng list khách hàng</strong><span>Mỗi dòng là 1 đơn/khách</span><small>Dễ nhìn hơn nhóm NVGH → NVBH.</small></div>';
    }
    renderDeliveryTodaySummary();
    syncDeliveryAccountingSelection();
  }catch(err){
    updateDeliveryKpiFromSummary({});
    deliveryTodayList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
    syncDeliveryAccountingSelection();
  }
}

async function adminUnlockSelectedDeliveryOrder(){
  const row=getSelectedDeliveryRow?.();
  if(!row){alert('Chưa chọn đơn để mở khóa.');return;}
  const reason=prompt(`Nhập lý do mở khóa điều chỉnh đơn ${deliveryDisplayOrderCode(row)}:`, 'Điều chỉnh tiền thu / trả thưởng / hàng trả');
  if(!reason||!reason.trim())return;
  try{
    if(deliveryAdminUnlockButton)deliveryAdminUnlockButton.disabled=true;
    const res=await fetch(`/api/master-orders/delivery-today/${encodeURIComponent(row.id)}/admin-unlock`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reason:reason.trim()})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không mở khóa được đơn');
    showMessage(deliveryEditMessage,json.message||'Đã mở khóa điều chỉnh');
    await loadDeliveryToday();
    selectDeliveryOrder(row.id);
  }catch(err){showMessage(deliveryEditMessage,err.message,true);}
  finally{if(deliveryAdminUnlockButton)deliveryAdminUnlockButton.disabled=false;}
}
window.adminUnlockSelectedDeliveryOrder=adminUnlockSelectedDeliveryOrder;

async function reAccountingSelectedDeliveryOrder(){
  const row=getSelectedDeliveryRow?.();
  if(!row){alert('Chưa chọn đơn để xác nhận lại kế toán.');return;}
  const ok=confirm(`Xác nhận lại kế toán đơn ${deliveryDisplayOrderCode(row)}?\n\nHệ thống sẽ đảo bút toán AR cũ và ghi lại AR mới theo số liệu vừa sửa.`);
  if(!ok)return;
  selectedDeliveryAccountingIds=new Set([String(row.id)]);
  await confirmDeliveryAccounting();
}
window.reAccountingSelectedDeliveryOrder=reAccountingSelectedDeliveryOrder;
if(typeof deliveryAdminUnlockButton!=='undefined'&&deliveryAdminUnlockButton)deliveryAdminUnlockButton.addEventListener('click',adminUnlockSelectedDeliveryOrder);
if(typeof deliveryReAccountingButton!=='undefined'&&deliveryReAccountingButton)deliveryReAccountingButton.addEventListener('click',reAccountingSelectedDeliveryOrder);

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


async function createDeliveryCashSubmissionFromToday(){
  const date=deliveryDateFilter?.value||today();
  const deliveryStaffCode=selectedDeliveryStaffQuery();
  if(!deliveryStaffCode){alert('Cần chọn nhân viên giao hàng trước khi tạo phiếu nộp quỹ.');return;}
  const ok=confirm(`Tạo phiếu nộp quỹ giao hàng?\n\nNgày giao: ${date}\nNVGH: ${deliveryStaffCode}\n\nHệ thống sẽ lấy số tiền phải nộp từ báo cáo Đơn đi giao hôm nay và tạo phiếu NQGH.`);
  if(!ok)return;
  try{
    if(createDeliveryCashSubmissionButton)createDeliveryCashSubmissionButton.disabled=true;
    const res=await fetch('/api/funds/delivery-cash-submissions',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({deliveryDate:date,deliveryStaffCode})
    });
    const json=await deliveryReadJsonResponse(res,'Không tạo được phiếu nộp quỹ');
    if(!json.ok)throw new Error(json.message||'Không tạo được phiếu nộp quỹ');
    alert(json.message||`Đã tạo phiếu nộp quỹ ${json.submission?.code||''}`);
    if(typeof loadDeliveryCashSubmissions==='function')await loadDeliveryCashSubmissions();
    if(typeof loadFundLedger==='function')await loadFundLedger();
  }catch(err){alert(err.message||'Không tạo được phiếu nộp quỹ');}
  finally{if(createDeliveryCashSubmissionButton)createDeliveryCashSubmissionButton.disabled=false;}
}
window.createDeliveryCashSubmissionFromToday=createDeliveryCashSubmissionFromToday;
if(typeof createDeliveryCashSubmissionButton!=='undefined'&&createDeliveryCashSubmissionButton)createDeliveryCashSubmissionButton.addEventListener('click',createDeliveryCashSubmissionFromToday);
