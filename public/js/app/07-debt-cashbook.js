async function loadDebts(){
  const params=new URLSearchParams();
  const q=debtSearchInput?debtSearchInput.value.trim():'';
  const salesman=debtSalesmanFilter?debtSalesmanFilter.value.trim():'';
  const delivery=debtDeliveryFilter?debtDeliveryFilter.value.trim():'';
  const status=debtStatusFilter?debtStatusFilter.value:'';
  const dateFrom=debtDateFrom?debtDateFrom.value:'';
  const dateTo=debtDateTo?debtDateTo.value:'';
  if(q)params.set('q',q);
  if(salesman)params.set('salesman',salesman);
  if(delivery)params.set('delivery',delivery);
  if(status)params.set('status',status);
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  const url=params.toString()?`/api/debts?${params.toString()}`:'/api/debts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được công nợ');
    debtsCache=json.customerSummary||[];
    const ledger=json.debts||[];
    const summary=json.summary||{};
    const totalDebt=Number(summary.totalDebt ?? ledger.reduce((sum,d)=>sum+Number(d.debt||0),0));
    if(debtTotalKpi)debtTotalKpi.textContent=money(totalDebt);
    if(debtCount)debtCount.textContent=`${summary.orderCount??ledger.length} đơn · ${summary.customerCount??debtsCache.length} khách · Quá hạn ${summary.overdueCount??0} · Tổng nợ ${money(totalDebt)}`;
    if(!ledger.length){
      if(debtTable)debtTable.innerHTML='<tr><td colspan="9">Chưa có công nợ.</td></tr>';
      if(debtCardList)debtCardList.innerHTML='<div class="empty-state">Chưa có công nợ.</div>';
      renderCollectionCustomerSelect();return
    }
    if(debtTable)debtTable.innerHTML=ledger.map(d=>`<tr>
      <td><strong>${escapeHtml(d.orderCode||'')}</strong></td><td>${escapeHtml(d.documentDate||'')}</td>
      <td>${escapeHtml((d.customerCode||'')+' '+(d.customerName||''))}</td>
      <td>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</td>
      <td>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</td>
      <td>${escapeHtml(d.dueDate||'')}${Number(d.overdueDays||0)>0?` <span class="badge out">+${d.overdueDays} ngày</span>`:''}</td>
      <td class="price">${money(d.debit)}</td><td class="price cash-in">${money(d.credit)}</td>
      <td class="price ${Number(d.debt||0)>0?'debt-positive':'debt-zero'}">${money(d.debt)}</td></tr>`).join('');
    if(debtCardList)debtCardList.innerHTML=ledger.map(d=>{
      const debt=Number(d.debt||0);
      const statusClass=debtFinanceClass(d);
      const statusText=debtStatusLabel(d.status);
      const overdue=Number(d.overdueDays||0);
      const timeline=`SO ${escapeHtml(d.orderCode||'')} → Thu ${money(d.receiptAmount||0)} → Trả ${money(d.returnAmount||0)} → Còn ${money(d.debt||0)}`;
      return `<article class="erp-debt-card ${statusClass}">
        <div class="erp-debt-main">
          <div><strong>${escapeHtml((d.customerCode||'')+' · '+(d.orderCode||''))}</strong><b>${escapeHtml(d.customerName||'')}</b><small>${escapeHtml(d.phone||'')} ${d.address?'· '+escapeHtml(d.address):''}</small></div>
          <span class="debt-status-pill">${statusText}</span>
        </div>
        <div class="debt-staff-line"><span>NV bán: <b>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</b></span><span>NV giao: <b>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</b></span></div>
        <div class="debt-date-line"><span>Ngày bán: <b>${escapeHtml(d.documentDate||'')}</b></span><span>Hạn TT: <b>${escapeHtml(d.dueDate||'')}</b></span><span>${overdue>0?'Quá hạn':'Tuổi nợ'}: <b>${overdue>0?overdue:Number(d.agingDays||0)} ngày</b></span></div>
        <div class="erp-debt-money"><span>Phải thu <b>${money(d.debit)}</b></span><span>Đã thu/giảm <b class="cash-in">${money(d.credit)}</b></span><span>Còn nợ <b class="${debt>0?'debt-positive':'debt-zero'}">${money(debt)}</b></span></div>
        <div class="debt-mini-timeline">${timeline}</div>
      </article>`;
    }).join('');
    renderCollectionCustomerSelect();
  }catch(err){if(debtCount)debtCount.textContent='Lỗi tải công nợ';if(debtTable)debtTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;if(debtCardList)debtCardList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}

// Debt collection
function getCollectionCustomerMatches(){
  const q=collectionCustomerSearch?collectionCustomerSearch.value.trim():'';
  return debtsCache
    .filter(d=>d.debt>0)
    .filter(d=>matchSearch(q,[d.customerCode,d.customerName]));
}
function selectCollectionCustomer(d){
  if(!d)return;
  collectionCustomerSelect.value=d.customerId||'';
  collectionCustomerSelect.dataset.debt=String(d.debt||0);
  if(collectionCustomerSearch){
    collectionCustomerSearch.value=debtCustomerSuggestionLabel(d);
    collectionCustomerSearch.dataset.selectedId=d.customerId||'';
    collectionCustomerSearch.dataset.targetHidden='collectionCustomerSelect';
  }
  updateSelectedCustomerDebt();
  hideSuggestions(collectionCustomerSuggestions);
}
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSearch)return;
  const has=debtsCache.some(d=>d.debt>0);
  collectionCustomerSearch.disabled=!has;
  collectionCustomerSearch.placeholder=has?'Gõ mã/tên khách đang nợ...':'Không có khách đang nợ';
  if(!has){collectionCustomerSelect.value='';selectedCustomerDebt.textContent='0';}
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  selectedCustomerDebt.textContent=collectionCustomerSelect.value?money(collectionCustomerSelect.dataset.debt||0):'0';
}
async function submitDebtCollection(event){
  event.preventDefault();
  if(!collectionCustomerSelect.value){showMessage(collectionMessage,'Bạn chưa chọn khách hàng cần xử lý công nợ.',true);return}
  const payload=Object.fromEntries(new FormData(debtCollectionForm).entries());
  payload.cashAmount=Number(payload.cashAmount||0);
  payload.transferAmount=Number(payload.transferAmount||0);
  payload.returnAmount=Number(payload.returnAmount||0);
  payload.amount=payload.cashAmount+payload.transferAmount+payload.returnAmount;
  if(payload.amount<=0){showMessage(collectionMessage,'Bạn cần nhập ít nhất một giá trị: tiền mặt, chuyển khoản hoặc hàng trả về.',true);return}
  try{
    const res=await fetch('/api/debt-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xử lý được công nợ');
    debtCollectionForm.reset();debtCollectionForm.elements.date.value=today();collectionCustomerSelect.value='';if(collectionCustomerSearch)collectionCustomerSearch.value='';updateSelectedCustomerDebt();showMessage(collectionMessage,json.message||'Đã ghi chứng từ công nợ');
    await loadDebts();await loadReceipts();await loadCashbook();await loadReturnOrders();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}


function setDebtPanel(panelId){
  if(!panelId)return;
  debtInnerTabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.debtPanel===panelId));
  debtPanels.forEach(panel=>panel.classList.toggle('active',panel.dataset.debtPanelId===panelId));
  if(panelId==='debtOverviewPanel')loadDebts();
  if(panelId==='debtHistoryPanel')loadReceipts();
  if(panelId==='debtCashPanel'||panelId==='debtBankPanel')loadCashbook();
  if(panelId==='debtReturnPanel')loadReturnOrders();
}

function receiptMethodLabel(method){
  if(method==='transfer')return 'Chuyển khoản';
  if(method==='return')return 'Trả hàng';
  return 'Tiền mặt';
}

async function voidReceipt(id){
  const reason=prompt('Lý do hủy phiếu thu?','Hủy phiếu thu');
  if(reason===null)return;
  try{
    const res=await fetch(`/api/receipts/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`,{method:'DELETE'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không hủy được phiếu thu');
    await loadReceipts();await loadDebts();await loadCashbook();
  }catch(err){alert(err.message)}
}

async function loadReturnOrders(){
  if(!returnOrderTable)return;
  const q=returnOrderSearchInput?returnOrderSearchInput.value.trim():'';
  const url=q?`/api/return-orders?q=${encodeURIComponent(q)}`:'/api/return-orders';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được trả hàng');
    const rows=json.returnOrders||[];
    if(!rows.length){returnOrderTable.innerHTML='<tr><td colspan="8">Chưa có chứng từ trả hàng.</td></tr>';return}
    returnOrderTable.innerHTML=rows.map(r=>`<tr><td><strong>${r.code||''}</strong></td><td>${r.date||''}</td><td>${r.customerCode||''} ${r.customerName||''}</td><td>${r.salesOrderCode||''}</td><td class="price">${money(r.totalQuantity)}</td><td class="price cash-in">${money(r.totalAmount)}</td><td><span class="badge in">Đã ghi</span></td><td>${r.note||''}</td></tr>`).join('');
  }catch(err){returnOrderTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`}
}

async function loadReceipts(){
  if(!receiptHistoryTable)return;
  const q=receiptSearchInput?receiptSearchInput.value.trim():'';
  const url=q?`/api/receipts?q=${encodeURIComponent(q)}`:'/api/receipts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được phiếu thu');
    const rows=json.receipts||[];
    if(!rows.length){
      if(receiptHistoryTable)receiptHistoryTable.innerHTML='<tr><td colspan="10">Chưa có phiếu thu.</td></tr>';
      if(receiptTimeline)receiptTimeline.innerHTML='<div class="empty-state">Chưa có phiếu thu.</div>';
      return
    }
    if(receiptHistoryTable)receiptHistoryTable.innerHTML=rows.map(r=>`<tr class="${r.status==='void'?'is-void':''}"><td><strong>${r.code||''}</strong></td><td>${r.date||''}</td><td>${receiptMethodLabel(r.method)}</td><td>${r.customerCode||''} ${r.customerName||''}</td><td>${debtPersonLabel(r.salesmanCode,r.salesmanName)}</td><td>${debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName)}</td><td>${r.staffName||''}</td><td class="price cash-in">${money(r.amount)}</td><td><span class="badge ${r.status==='void'?'void-badge':'in'}">${r.status==='void'?'Void':'Đã ghi'}</span></td><td>${r.status==='void'?`<small>${r.voidReason||''}</small>`:`<button class="small danger" type="button" onclick="voidReceipt('${r.id||r.code}')">Hủy</button>`}</td></tr>`).join('');
    if(receiptTimeline)receiptTimeline.innerHTML=rows.map(r=>{
      const isVoid=r.status==='void';
      const method=receiptMethodLabel(r.method);
      const methodClass=r.method==='transfer'?'finance-green':(r.method==='return'?'finance-orange':'finance-green');
      return `<article class="timeline-item ${isVoid?'is-void finance-gray':methodClass}">
        <div class="timeline-dot"></div>
        <div class="timeline-body"><div class="timeline-head"><strong>${escapeHtml(r.code||'')}</strong><span>${escapeHtml(r.date||'')}</span></div>
        <div class="timeline-meta"><b>${escapeHtml(method)}</b> · ${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</div>
        <div class="timeline-money"><span>${escapeHtml(r.staffName||'')}</span><strong>${money(r.amount)}</strong></div>
        <div class="timeline-actions">${isVoid?`<span class="badge void-badge">Void/Cancel</span><small>${escapeHtml(r.voidReason||'')}</small>`:`<span class="badge in">Đã thu</span><button class="small danger" type="button" onclick="voidReceipt('${r.id||r.code}')">Hủy</button>`}</div></div>
      </article>`;
    }).join('');
  }catch(err){if(receiptHistoryTable)receiptHistoryTable.innerHTML=`<tr><td colspan="10">${err.message}</td></tr>`;if(receiptTimeline)receiptTimeline.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}

// Cashbook
async function loadCashbook(){
  const q=cashbookSearchInput?cashbookSearchInput.value.trim():'';const url=q?`/api/cashbook?q=${encodeURIComponent(q)}`:'/api/cashbook';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sổ quỹ');
    const entries=json.cashbook||[];const s=json.summary||{cashIn:0,cashOut:0,balance:0};const bs=json.bankSummary||{bankIn:0,bankOut:0,balance:0};
    if(cashTotalKpi)cashTotalKpi.textContent=money(s.balance);
    if(bankTotalKpi)bankTotalKpi.textContent=money(bs.balance);
    cashSummary.textContent=`Tiền mặt: thu ${money(s.cashIn)} · chi ${money(s.cashOut)} · tồn ${money(s.balance)} | Chuyển khoản: ${money(bs.balance)}`;
    const cashRows=entries.filter(e=>!e.isBank);
    const bankRows=entries.filter(e=>e.isBank);
    if(cashbookTable){cashbookTable.innerHTML=cashRows.length?cashRows.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join(''):'<tr><td colspan="8">Chưa có phát sinh tiền mặt.</td></tr>';}
    if(bankbookTable){bankbookTable.innerHTML=bankRows.length?bankRows.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price cash-in">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join(''):'<tr><td colspan="7">Chưa có phát sinh chuyển khoản.</td></tr>';}
  }catch(err){cashSummary.textContent='Lỗi tải sổ quỹ';cashbookTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`;if(bankbookTable)bankbookTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
}
async function submitCashbook(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(cashbookForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const res=await fetch('/api/cashbook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không ghi được quỹ tiền');
    cashbookForm.reset();cashbookForm.elements.date.value=today();showMessage(cashbookMessage,json.message||'Đã ghi quỹ tiền');
    await loadCashbook();
  }catch(err){showMessage(cashbookMessage,err.message,true)}
 }

