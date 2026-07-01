'use strict';

// DebtCollections pending confirmation UI - kế toán xác nhận mới post AR/fund ledgers.
function debtCollectionStatusName(status){
  const value=String(status||'submitted');
  if(value==='accounting_confirmed')return 'Đã xác nhận';
  if(value==='rejected')return 'Đã từ chối';
  if(value==='cancelled')return 'Đã hủy';
  return 'Chờ xác nhận';
}
function debtCollectionMethodName(method){
  const value=String(method||'cash');
  if(value==='bank_transfer'||value==='bank'||value==='transfer')return 'Chuyển khoản';
  if(value==='other')return 'Khác';
  return 'Tiền mặt';
}
function debtCollectionRowMatches(row={}, q=''){
  const key=String(q||'').trim().toLowerCase();
  if(!key)return true;
  return [row.code,row.customerCode,row.customerName,row.collectorCode,row.collectorName,row.note]
    .some(v=>String(v||'').toLowerCase().includes(key));
}
function renderDebtCollections(rows=[], summary={}){
  const visible=rows.filter(row=>debtCollectionRowMatches(row, debtCollectionSearchInput?debtCollectionSearchInput.value:''));
  if(debtCollectionTotalKpi)debtCollectionTotalKpi.textContent=money(summary.totalAmount ?? visible.reduce((s,row)=>s+Number(row.amount||0),0));
  if(debtCollectionSubmittedKpi)debtCollectionSubmittedKpi.textContent=money(summary.submittedCount ?? visible.filter(row=>row.status==='submitted').length);
  if(debtCollectionConfirmedKpi)debtCollectionConfirmedKpi.textContent=money(summary.confirmedCount ?? visible.filter(row=>row.status==='accounting_confirmed').length);
  if(debtCollectionRejectedKpi)debtCollectionRejectedKpi.textContent=money(summary.rejectedCount ?? visible.filter(row=>row.status==='rejected').length);
  if(debtCollectionCount)debtCollectionCount.textContent=`${visible.length} phiếu thu nợ · Tổng ${money(visible.reduce((s,row)=>s+Number(row.amount||0),0))}`;
  if(!debtCollectionTable)return;
  if(!visible.length){
    debtCollectionTable.innerHTML='<tr><td colspan="8" class="empty-cell">Không có phiếu thu nợ phù hợp.</td></tr>';
    return;
  }
  debtCollectionTable.innerHTML=visible.map(row=>{
    const id=escapeHtml(row.id||row.code||'');
    const allocations=Array.isArray(row.allocations)?row.allocations:[];
    const allocationText=allocations.map(a=>`${escapeHtml(a.salesOrderCode||a.orderCode||'')} ${money(a.allocatedAmount||a.amount||0)}`).join('<br>') || '-';
    const canConfirm=String(row.status||'')==='submitted';
    return `<tr>
      <td><b>${escapeHtml(row.code||row.id||'')}</b><br><small>${escapeHtml(row.submittedAt||'')}</small></td>
      <td>${escapeHtml(row.customerCode||'')}<br><b>${escapeHtml(row.customerName||'')}</b></td>
      <td>${escapeHtml(row.collectorType==='delivery'?'App giao hàng':'App bán hàng')}<br><b>${escapeHtml(row.collectorCode||'')} ${escapeHtml(row.collectorName||'')}</b></td>
      <td class="price"><b>${money(row.amount||0)}</b></td>
      <td>${escapeHtml(debtCollectionMethodName(row.paymentMethod))}</td>
      <td>${escapeHtml(debtCollectionStatusName(row.status))}</td>
      <td>${allocationText}</td>
      <td>${canConfirm?`<span class="debt-collection-row-actions"><button type="button" class="small success" data-debt-collection-action="confirm" data-debt-collection-id="${id}" data-debt-collection-amount="${Number(row.amount||0)}">Xác nhận</button><button type="button" class="small danger" data-debt-collection-action="reject" data-debt-collection-id="${id}">Từ chối</button></span>`:'-'}</td>
    </tr>`;
  }).join('');
}
let debtCollectionsLoadPromise=null;
const debtCollectionActionLocks=new Set();
function setDebtCollectionToolbarLoading(isLoading){
  [applyDebtCollectionFiltersButton,clearDebtCollectionFiltersButton,reloadDebtCollectionsButton].forEach(button=>{
    if(!button)return;
    button.disabled=isLoading;
    if(isLoading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
}
function setDebtCollectionRowLoading(id, isLoading){
  document.querySelectorAll('.debt-collection-row-actions button').forEach(button=>{
    if(String(button.dataset.debtCollectionId||'')!==String(id||''))return;
    button.disabled=isLoading;
    if(isLoading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
}
async function loadDebtCollections(){
  if(!debtCollectionTable)return;
  if(debtCollectionsLoadPromise)return debtCollectionsLoadPromise;
  setDebtCollectionToolbarLoading(true);
  debtCollectionsLoadPromise=(async()=>{
    const params=new URLSearchParams();
    const status=debtCollectionStatusFilter?debtCollectionStatusFilter.value:'submitted';
    if(status&&status!=='all')params.set('status',status);
    if(debtCollectionCollectorTypeFilter&&debtCollectionCollectorTypeFilter.value)params.set('collectorType',debtCollectionCollectorTypeFilter.value);
    if(debtCollectionDateFrom&&debtCollectionDateFrom.value)params.set('fromDate',debtCollectionDateFrom.value);
    if(debtCollectionDateTo&&debtCollectionDateTo.value)params.set('toDate',debtCollectionDateTo.value);
    params.set('limit','300');
    try{
      if(debtCollectionCount)debtCollectionCount.textContent='Đang tải phiếu thu nợ...';
      const res=await fetch(`/api/debt-collections?${params.toString()}`);
      const json=await res.json();
      if(!json.ok)throw new Error(json.message||'Không tải được phiếu thu nợ');
      window.__debtCollectionsCache=Array.isArray(json.items)?json.items:[];
      renderDebtCollections(window.__debtCollectionsCache,json.summary||{});
    }catch(err){
      if(debtCollectionCount)debtCollectionCount.textContent='Lỗi tải phiếu thu nợ';
      if(debtCollectionTable)debtCollectionTable.innerHTML=`<tr><td colspan="8" class="danger-text">${escapeHtml(err.message||'Không tải được phiếu thu nợ')}</td></tr>`;
    }finally{
      setDebtCollectionToolbarLoading(false);
      debtCollectionsLoadPromise=null;
    }
  })();
  return debtCollectionsLoadPromise;
}
async function resetDebtCollectionFilters(){
  if(debtCollectionStatusFilter)debtCollectionStatusFilter.value='submitted';
  if(debtCollectionCollectorTypeFilter)debtCollectionCollectorTypeFilter.value='';
  if(debtCollectionSearchInput)debtCollectionSearchInput.value='';
  if(debtCollectionDateFrom)debtCollectionDateFrom.value=today();
  if(debtCollectionDateTo)debtCollectionDateTo.value=today();
  await loadDebtCollections();
}
async function confirmDebtCollectionFromWeb(id, amount, triggerButton){
  if(!id)return;
  const raw=prompt('Số tiền kế toán thực nhận', String(Math.round(Number(amount||0))));
  if(raw===null)return;
  const actualReceivedAmount=parseDebtMoneyInput(raw);
  if(actualReceivedAmount<=0){alert('Số tiền thực nhận phải lớn hơn 0');return;}
  const accountingNote=prompt('Ghi chú kế toán', 'Đã nhận đủ tiền')||'';
  if(debtCollectionActionLocks.has(id))return;
  debtCollectionActionLocks.add(id);
  setDebtCollectionRowLoading(id,true);
  try{
    const res=await fetch(`/api/debt-collections/${encodeURIComponent(id)}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actualReceivedAmount,accountingNote})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không xác nhận được phiếu thu nợ');
    showMessage(debtCollectionMessage,json.message||'Đã xác nhận phiếu thu nợ');
    await loadDebtCollections();
    if(typeof loadDebtNew==='function')await loadDebtNew({silent:true});
    else if(typeof loadDebts==='function')await loadDebts();
    if(typeof loadFundLedger==='function')await loadFundLedger();
  }catch(err){showMessage(debtCollectionMessage,err.message||'Không xác nhận được phiếu thu nợ',true)}
  finally{debtCollectionActionLocks.delete(id);setDebtCollectionRowLoading(id,false);if(triggerButton)triggerButton.removeAttribute('aria-busy')}
}
async function rejectDebtCollectionFromWeb(id, triggerButton){
  if(!id)return;
  const reason=prompt('Lý do từ chối phiếu thu nợ','Nhân viên chưa nộp tiền');
  if(!reason)return;
  if(debtCollectionActionLocks.has(id))return;
  debtCollectionActionLocks.add(id);
  setDebtCollectionRowLoading(id,true);
  try{
    const res=await fetch(`/api/debt-collections/${encodeURIComponent(id)}/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không từ chối được phiếu thu nợ');
    showMessage(debtCollectionMessage,json.message||'Đã từ chối phiếu thu nợ');
    await loadDebtCollections();
    if(typeof loadDebtNew==='function')await loadDebtNew({silent:true});
    else if(typeof loadDebts==='function')await loadDebts();
  }catch(err){showMessage(debtCollectionMessage,err.message||'Không từ chối được phiếu thu nợ',true)}
  finally{debtCollectionActionLocks.delete(id);setDebtCollectionRowLoading(id,false);if(triggerButton)triggerButton.removeAttribute('aria-busy')}
}
window.loadDebtCollections=loadDebtCollections;
window.confirmDebtCollectionFromWeb=confirmDebtCollectionFromWeb;
window.rejectDebtCollectionFromWeb=rejectDebtCollectionFromWeb;
if(debtCollectionTable&&!debtCollectionTable.dataset.securityDelegationBound){
  debtCollectionTable.dataset.securityDelegationBound='1';
  debtCollectionTable.addEventListener('click',event=>{
    const button=event.target.closest('[data-debt-collection-action]');
    if(!button||!debtCollectionTable.contains(button))return;
    const id=button.dataset.debtCollectionId;
    if(button.dataset.debtCollectionAction==='confirm')confirmDebtCollectionFromWeb(id,Number(button.dataset.debtCollectionAmount||0),button);
    if(button.dataset.debtCollectionAction==='reject')rejectDebtCollectionFromWeb(id,button);
  });
}
if(applyDebtCollectionFiltersButton)applyDebtCollectionFiltersButton.addEventListener('click',loadDebtCollections);
if(clearDebtCollectionFiltersButton)clearDebtCollectionFiltersButton.addEventListener('click',resetDebtCollectionFilters);
if(reloadDebtCollectionsButton)reloadDebtCollectionsButton.addEventListener('click',loadDebtCollections);
if(debtCollectionSearchInput)debtCollectionSearchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadDebtCollections();}});
if(debtCollectionDateFrom&&!debtCollectionDateFrom.value)debtCollectionDateFrom.value=today();
if(debtCollectionDateTo&&!debtCollectionDateTo.value)debtCollectionDateTo.value=today();

