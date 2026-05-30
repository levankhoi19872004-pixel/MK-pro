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
      renderDebtManagementReports([], json);
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
    renderDebtManagementReports(ledger, json);
    renderCollectionCustomerSelect();
  }catch(err){if(debtCount)debtCount.textContent='Lỗi tải công nợ';if(debtTable)debtTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;if(debtCardList)debtCardList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}


function groupDebtByPerson(rows, codeKey, nameKey){
  const map=new Map();
  rows.forEach(d=>{
    const code=d[codeKey]||'';
    const name=d[nameKey]||'';
    const key=(code||name||'Chưa gán');
    const item=map.get(key)||{code,name,customers:new Set(),orders:0,debit:0,credit:0,debt:0};
    item.orders+=1;
    if(d.customerCode||d.customerName)item.customers.add((d.customerCode||'')+'|'+(d.customerName||''));
    item.debit+=Number(d.debit||0);
    item.credit+=Number(d.credit||0);
    item.debt+=Number(d.debt||0);
    map.set(key,item);
  });
  return [...map.values()].sort((a,b)=>b.debt-a.debt);
}

function renderDebtManagementReports(rows, json={}){
  const salesmanRows=groupDebtByPerson(rows,'salesmanCode','salesmanName');
  const deliveryRows=groupDebtByPerson(rows,'deliveryStaffCode','deliveryStaffName');
  if(debtSalesmanReportTable){
    debtSalesmanReportTable.innerHTML=salesmanRows.length?salesmanRows.map(r=>`<tr><td><strong>${escapeHtml(debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${r.customers.size}</td><td class="price">${r.orders}</td><td class="price">${money(r.debit)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price ${r.debt>0?'debt-positive':'debt-zero'}">${money(r.debt)}</td></tr>`).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVBH.</td></tr>';
  }
  if(debtDeliveryReportTable){
    debtDeliveryReportTable.innerHTML=deliveryRows.length?deliveryRows.map(r=>`<tr><td><strong>${escapeHtml(debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${r.customers.size}</td><td class="price">${r.orders}</td><td class="price cash-in">${money(r.credit)}</td><td class="price debt-positive">${money(Math.max(r.debt,0))}</td><td class="price ${r.debt>0?'debt-positive':'debt-zero'}">${money(r.debt)}</td></tr>`).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVGH.</td></tr>';
  }
  renderDebtWarnings(rows, json.arDiagnostics||[]);
}

function renderDebtWarnings(rows, diagnostics=[]){
  if(!receiptTimeline)return;
  const overdueWarnings=rows.filter(d=>Number(d.debt||0)>0&&Number(d.overdueDays||0)>0).slice(0,20).map(d=>({
    code:d.orderCode, date:d.dueDate||d.documentDate, customerCode:d.customerCode, customerName:d.customerName, amount:d.debt,
    message:`Đơn quá hạn ${Number(d.overdueDays||0)} ngày, còn nợ ${money(d.debt)}`
  }));
  const negativeWarnings=rows.filter(d=>Number(d.debt||0)<0).slice(0,20).map(d=>({
    code:d.orderCode, date:d.documentDate, customerCode:d.customerCode, customerName:d.customerName, amount:d.debt,
    message:'Công nợ âm, cần kiểm tra thu thừa/ghi giảm sai'
  }));
  const warnings=[...diagnostics,...negativeWarnings,...overdueWarnings];
  receiptTimeline.innerHTML=warnings.length?warnings.map(d=>`<article class="timeline-item finance-red is-warning">
    <div class="timeline-dot"></div><div class="timeline-body"><div class="timeline-head"><strong>${escapeHtml(d.code||'')}</strong><span>${escapeHtml(d.date||'')}</span></div>
    <div class="timeline-meta">${escapeHtml((d.customerCode||'')+' '+(d.customerName||''))}</div>
    <div class="timeline-money"><span>${escapeHtml(d.message||'Cần kiểm tra công nợ')}</span><strong>${money(d.amount||0)}</strong></div>
    <div class="timeline-actions"><span class="badge void-badge">Cần kiểm tra</span></div></div>
  </article>`).join(''):'<div class="empty-state success-text">Chưa phát hiện cảnh báo công nợ.</div>';
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
    await loadDebts();await loadArLedger();await loadCashbook();await loadReturnOrders();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}


function setDebtPanel(panelId){
  if(!panelId)return;
  debtInnerTabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.debtPanel===panelId));
  debtPanels.forEach(panel=>panel.classList.toggle('active',panel.dataset.debtPanelId===panelId));
  if(['debtOverviewPanel','debtSalesmanPanel','debtDeliveryPanel','debtWarningPanel'].includes(panelId))loadDebts();
  if(panelId==='debtMovementPanel'||panelId==='debtArLedgerPanel')loadArLedger();
  if(panelId==='debtCashPanel'||panelId==='debtBankPanel')loadCashbook();
  if(panelId==='debtReturnPanel')loadReturnOrders();
}

function receiptMethodLabel(method){
  if(method==='transfer')return 'Chuyển khoản';
  if(method==='return')return 'Trả hàng';
  return 'Tiền mặt';
}


async function voidReceiptPrompt(){
  const code=prompt('Nhập mã phiếu thu cần hủy/Void:','');
  if(!code)return;
  await voidReceipt(code.trim());
}

async function voidReceipt(id){
  const reason=prompt('Lý do hủy phiếu thu?','Hủy phiếu thu');
  if(reason===null)return;
  try{
    const res=await fetch(`/api/receipts/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`,{method:'DELETE'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không hủy được phiếu thu');
    await loadArLedger();await loadDebts();await loadCashbook();
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


function renderDebtMovement(rows){
  if(!debtMovementTable)return;
  if(!rows.length){debtMovementTable.innerHTML='<tr><td colspan="7">Chưa có biến động công nợ.</td></tr>';return}
  debtMovementTable.innerHTML=rows.slice(0,200).map(r=>{
    const impact=Number(r.balanceEffect||0);
    const increase=Number(r.debit||0)>0?Number(r.debit||0):0;
    const decrease=Number(r.credit||0)>0?Number(r.credit||0):0;
    return `<tr class="${String(r.type||'').toLowerCase().includes('void')?'is-void':''}"><td>${escapeHtml(r.date||'')}</td><td><strong>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</strong><br><small>${escapeHtml(r.orderCode||r.refCode||'')}</small></td><td><span class="badge ${arLedgerBadgeClass(r)}">${escapeHtml(arLedgerTypeLabel(r.type))}</span></td><td class="price debt-positive">${money(increase)}</td><td class="price cash-in">${money(decrease)}</td><td class="price ${impact>0?'debt-positive':'cash-in'}">${impact>0?'+':''}${money(impact)}</td><td>${escapeHtml(r.note||'')}</td></tr>`;
  }).join('');
}

function arLedgerTypeLabel(type){
  const value=String(type||'').toLowerCase();
  if(value.includes('void'))return 'Void / đảo phiếu thu';
  if(value.includes('receipt')||value==='debt')return 'Thu công nợ';
  if(value.includes('return'))return 'Trả hàng';
  if(value.includes('sale'))return 'Ghi nhận phải thu';
  return type||'AR';
}
function arLedgerBadgeClass(row){
  const type=String(row.type||'').toLowerCase();
  if(type.includes('void'))return 'void-badge';
  if(Number(row.debit||0)>0)return 'out';
  return 'in';
}
async function loadArLedger(){
  if(!receiptHistoryTable)return;
  const params=new URLSearchParams();
  const q=receiptSearchInput?receiptSearchInput.value.trim():'';
  if(q)params.set('q',q);
  if(debtDateFrom&&debtDateFrom.value)params.set('dateFrom',debtDateFrom.value);
  if(debtDateTo&&debtDateTo.value)params.set('dateTo',debtDateTo.value);
  const url=params.toString()?`/api/debts?${params.toString()}`:'/api/debts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được AR Ledger');
    const rows=json.arLedger||[];
    const diagnostics=json.arDiagnostics||[];
    const summary=json.summary||{};
    if(arLedgerSummary)arLedgerSummary.textContent=`${summary.arLedgerCount??rows.length} bút toán AR · Cảnh báo ${summary.arWarningCount??diagnostics.length} · Nợ ${money(summary.totalDebit||0)} · Có ${money(summary.totalCredit||0)} · Còn ${money(summary.totalDebt||0)}`;
    renderDebtWarnings(json.debts||[], diagnostics);
    renderDebtMovement(rows);
    if(!rows.length){receiptHistoryTable.innerHTML='<tr><td colspan="9">Chưa có bút toán AR Ledger.</td></tr>';return}
    receiptHistoryTable.innerHTML=rows.map(r=>{
      const impact=Number(r.balanceEffect||0);
      return `<tr class="${String(r.type||'').toLowerCase().includes('void')?'is-void':''}"><td>${escapeHtml(r.date||'')}</td><td><span class="badge ${arLedgerBadgeClass(r)}">${escapeHtml(arLedgerTypeLabel(r.type))}</span></td><td><strong>${escapeHtml(r.refCode||r.code||'')}</strong><br><small>${escapeHtml(r.refType||r.source||'')}</small></td><td>${escapeHtml(r.orderCode||'')}<br><small>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</small></td><td class="price debt-positive">${money(r.debit)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price ${impact>0?'debt-positive':'cash-in'}">${impact>0?'+':''}${money(impact)}</td><td>${escapeHtml(r.status||'posted')}</td><td>${escapeHtml(r.note||'')}</td></tr>`;
    }).join('');
  }catch(err){if(receiptHistoryTable)receiptHistoryTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;if(receiptTimeline)receiptTimeline.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;if(arLedgerSummary)arLedgerSummary.textContent='Lỗi tải AR Ledger'}
}

async function loadReceipts(){
  return loadArLedger();
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

