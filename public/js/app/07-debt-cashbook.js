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
    const overviewRows=(Array.isArray(json.customerSummary)&&json.customerSummary.length)
      ?json.customerSummary
      :buildCustomerDebtOverview(ledger).filter(d=>Number(d.debt||0)>0);
    if(debtCardList)debtCardList.innerHTML=overviewRows.length?overviewRows.map(d=>{
      const debt=Number(d.debt||0);
      const statusClass=debtFinanceClass(d);
      const statusText=debtStatusLabel(d.status);
      const overdue=Number(d.overdueDays||0);
      return `<article class="erp-debt-card debt-card-slim ${statusClass}">
        <div class="debt-slim-top">
          <div class="debt-slim-name"><small>${escapeHtml(d.customerCode||'')}</small><b>${escapeHtml(d.customerName||'')}</b></div>
          <span class="debt-status-pill">${statusText}</span>
        </div>
        <div class="debt-slim-money"><span>Còn nợ</span><strong class="${debt>0?'debt-positive':'debt-zero'}">${money(debt)}</strong></div>
        <div class="debt-slim-meta">
          <span>${overdue>0?'Quá hạn':'Tuổi nợ'}: <b>${overdue>0?overdue:Number(d.agingDays||0)} ngày</b></span>
          <span>Số đơn: <b>${Number(d.orderCount||0)}</b></span>
        </div>
        <div class="debt-slim-staff">
          <span>NVBH: <b>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</b></span>
          <span>NVGH: <b>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</b></span>
        </div>
        <button type="button" class="debt-detail-btn" onclick="setDebtPanel('debtMovementPanel')">Chi tiết biến động</button>
      </article>`;
    }).join(''):'<div class="empty-state">Không còn khách đang nợ. Muốn xem khách đã tất toán, chọn bộ lọc trạng thái Đã tất toán.</div>';
    renderDebtManagementReports(ledger, json);
    renderCollectionCustomerSelect();
  }catch(err){if(debtCount)debtCount.textContent='Lỗi tải công nợ';if(debtTable)debtTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;if(debtCardList)debtCardList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}



function buildCustomerDebtOverview(rows){
  const map=new Map();
  rows.forEach(d=>{
    const key=d.customerId||d.customerCode||d.customerName||d.orderCode||Math.random();
    const item=map.get(key)||{
      customerId:d.customerId||'', customerCode:d.customerCode||'', customerName:d.customerName||'Chưa rõ khách',
      salesmanCode:'', salesmanName:'', deliveryStaffCode:'', deliveryStaffName:'',
      debit:0, credit:0, debt:0, orderCount:0, overdueDays:0, agingDays:0, status:'paid'
    };
    item.debit+=Number(d.debit||0);
    item.credit+=Number(d.credit||0);
    item.debt+=Number(d.debt||0);
    item.orderCount+=1;
    item.overdueDays=Math.max(Number(item.overdueDays||0),Number(d.overdueDays||0));
    item.agingDays=Math.max(Number(item.agingDays||0),Number(d.agingDays||0));
    if(!item.salesmanCode&&!item.salesmanName){item.salesmanCode=d.salesmanCode||'';item.salesmanName=d.salesmanName||'';}
    if(!item.deliveryStaffCode&&!item.deliveryStaffName){item.deliveryStaffCode=d.deliveryStaffCode||'';item.deliveryStaffName=d.deliveryStaffName||'';}
    map.set(key,item);
  });
  return [...map.values()].map(d=>({...d,status:Number(d.debt||0)<=0?'paid':(Number(d.overdueDays||0)>0?'overdue':'open')})).sort((a,b)=>Number(b.debt||0)-Number(a.debt||0));
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
  // Báo cáo Theo NVBH/NVGH phải lấy số đã tổng hợp từ backend Mongo.
  // Frontend chỉ fallback tự gom khi API cũ chưa trả bySalesman/byDelivery.
  const salesmanRows=Array.isArray(json.bySalesman)?json.bySalesman:groupDebtByPerson(rows,'salesmanCode','salesmanName');
  const deliveryRows=Array.isArray(json.byDelivery)?json.byDelivery:groupDebtByPerson(rows,'deliveryStaffCode','deliveryStaffName');
  if(debtSalesmanReportTable){
    debtSalesmanReportTable.innerHTML=salesmanRows.length?salesmanRows.map(r=>{
      const customers=(r.customers&&typeof r.customers.size==='number')?r.customers.size:Number(r.customers||0);
      return `<tr><td><strong>${escapeHtml(r.label||debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${customers}</td><td class="price">${Number(r.orders||0)}</td><td class="price">${money(r.debit)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price ${Number(r.debt||0)>0?'debt-positive':'debt-zero'}">${money(r.debt)}</td></tr>`;
    }).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVBH.</td></tr>';
  }
  if(debtDeliveryReportTable){
    debtDeliveryReportTable.innerHTML=deliveryRows.length?deliveryRows.map(r=>{
      const customers=(r.customers&&typeof r.customers.size==='number')?r.customers.size:Number(r.customers||0);
      const debt=Number(r.debt||0);
      return `<tr><td><strong>${escapeHtml(r.label||debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${customers}</td><td class="price">${Number(r.orders||0)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price debt-positive">${money(Math.max(debt,0))}</td><td class="price ${debt>0?'debt-positive':'debt-zero'}">${money(debt)}</td></tr>`;
    }).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVGH.</td></tr>';
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
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  params.set('dateFrom', returnOrderDateFrom?.value || today());
  params.set('dateTo', returnOrderDateTo?.value || returnOrderDateFrom?.value || today());
  params.set('excludeInactive','1');
  const url=`/api/return-orders?${params.toString()}`;
  try{
    const res=await fetch(url);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn trả hàng');
    const rows=(json.returnOrders||json.returns||[]).filter(isActiveDocument);
    const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
    if(returnOrderCount) returnOrderCount.innerHTML=`${rows.length} phiếu · Tổng giảm nợ ${money(totalValue)} · Nguồn dữ liệu một mối: <strong>/api/return-orders</strong>`;
    if(!rows.length){returnOrderTable.innerHTML='<tr><td colspan="10">Chưa có đơn trả hàng.</td></tr>';return}
    returnOrderTable.innerHTML=rows.map(r=>{
      const staff=debtPersonLabel(r.staffCode||r.deliveryStaffCode||r.salesmanCode,r.staffName||r.deliveryStaffName||r.salesmanName);
      const source=String(r.source||r.refType||'returnOrders');
      const status=String(r.status||'posted');
      const statusText=status==='posted'?'Đã ghi':(status==='void'?'Đã hủy':status);
      const badgeClass=status==='void'?'out':'in';
      return `<tr>
        <td><strong>${escapeHtml(r.code||r.id||'')}</strong></td>
        <td>${escapeHtml(r.date||r.documentDate||'')}</td>
        <td>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</td>
        <td>${escapeHtml(r.salesOrderCode||r.orderCode||'')}</td>
        <td>${escapeHtml(staff)}</td>
        <td class="price">${money(r.totalQuantity)}</td>
        <td class="price cash-in">${money(r.debtReduction??r.totalAmount)}</td>
        <td>${escapeHtml(source)}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(statusText)}</span></td>
        <td>${escapeHtml(r.note||'')}</td>
      </tr>`;
    }).join('');
  }catch(err){
    if(returnOrderCount) returnOrderCount.textContent='Không tải được đơn trả hàng';
    returnOrderTable.innerHTML=`<tr><td colspan="10">${escapeHtml(err.message||'Không tải được đơn trả hàng')}</td></tr>`;
  }
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



const selectedReturnOrderIdsForMaster = new Set();

function renderUnmergedReturnOrders(rows = []){
  if(!unmergedReturnOrderTable)return;
  const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const totalQty=rows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  if(masterReturnKpiUnmerged)masterReturnKpiUnmerged.textContent=money(rows.length);
  if(masterReturnKpiUnmergedQty)masterReturnKpiUnmergedQty.textContent=money(totalQty);
  if(masterReturnKpiUnmergedValue)masterReturnKpiUnmergedValue.textContent=money(totalValue);
  if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent=`${rows.length} phiếu chưa gộp · Tổng SL ${money(totalQty)} · Tổng giá trị ${money(totalValue)} · Đã chọn ${selectedReturnOrderIdsForMaster.size}`;
  if(!rows.length){unmergedReturnOrderTable.innerHTML='<tr><td colspan="7">Chưa có phiếu trả hàng chưa gộp.</td></tr>';return}
  unmergedReturnOrderTable.innerHTML=rows.map(r=>{
    const id=String(r.id||r.code||'');
    const checked=selectedReturnOrderIdsForMaster.has(id)?'checked':'';
    const staff=debtPersonLabel(r.deliveryStaffCode||r.staffCode,r.deliveryStaffName||r.staffName);
    return `<tr>
      <td><input type="checkbox" class="master-return-check" data-id="${escapeHtml(id)}" ${checked}></td>
      <td><strong>${escapeHtml(r.code||r.id||'')}</strong></td>
      <td>${escapeHtml(r.date||r.documentDate||'')}</td>
      <td>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</td>
      <td>${escapeHtml(staff)}</td>
      <td class="price">${money(r.totalQuantity)}</td>
      <td class="price cash-in">${money(r.debtReduction??r.totalAmount)}</td>
    </tr>`;
  }).join('');
}

async function loadUnmergedReturnOrders(){
  if(!unmergedReturnOrderTable)return;
  const params=new URLSearchParams();
  const q=masterReturnOrderSearchInput?masterReturnOrderSearchInput.value.trim():'';
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
    unmergedReturnOrderTable.innerHTML=`<tr><td colspan="7">${escapeHtml(err.message||'Không tải được phiếu trả hàng chưa gộp')}</td></tr>`;
  }
}

function renderMasterReturnOrders(rows = []){
  if(!masterReturnOrderTable)return;
  const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
  const totalQty=rows.reduce((sum,r)=>sum+Number(r.totalQuantity||0),0);
  if(masterReturnKpiMasterCount)masterReturnKpiMasterCount.textContent=money(rows.length);
  if(masterReturnKpiMasterValue)masterReturnKpiMasterValue.textContent=money(totalValue);
  if(masterReturnOrderCount)masterReturnOrderCount.innerHTML=`${rows.length} đơn tổng · Tổng SL ${money(totalQty)} · Tổng giá trị ${money(totalValue)}`;
  if(!rows.length){masterReturnOrderTable.innerHTML='<tr><td colspan="7">Chưa có đơn tổng trả hàng.</td></tr>';return}
  masterReturnOrderTable.innerHTML=rows.map(r=>{
    const status=String(r.status||'pending_warehouse_receive');
    const statusText=status==='pending_warehouse_receive'?'Chờ kho nhận':(status==='received'?'Kho đã nhận':(status==='cancelled'?'Đã hủy':status));
    const badgeClass=status==='cancelled'?'out':(status==='received'?'in':'warn');
    const staff=debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName);
    const id=escapeHtml(r.id||r.code||'');
    return `<tr>
      <td><strong>${escapeHtml(r.code||r.id||'')}</strong><br><small>${escapeHtml(r.returnDate||r.date||'')}</small></td>
      <td>${escapeHtml(staff)}</td>
      <td class="price">${money(r.returnCount || (Array.isArray(r.children)?r.children.length:0))}</td>
      <td class="price">${money(r.totalQuantity)}</td>
      <td class="price cash-in">${money(r.debtReduction??r.totalAmount)}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(statusText)}</span></td>
      <td class="master-return-actions">
        <button class="secondary small" type="button" onclick="viewMasterReturnOrder('${id}')">Xem</button>
        <button class="secondary small" type="button" onclick="printMasterReturnOrder('${id}')">In</button>
        ${status==='received'?'':`<button class="secondary small" type="button" onclick="receiveMasterReturnOrder('${id}')">Nhập kho</button>`}
        <button class="secondary small danger" type="button" onclick="cancelMasterReturnOrder('${id}')">Hủy</button>
      </td>
    </tr>`;
  }).join('');
}

async function loadMasterReturnOrders(){
  if(!masterReturnOrderTable)return;
  const params=new URLSearchParams();
  const q=masterReturnOrderSearchInput?masterReturnOrderSearchInput.value.trim():'';
  if(q)params.set('q',q);
  params.set('dateFrom', masterReturnOrderDateFrom?.value || today());
  params.set('dateTo', masterReturnOrderDateTo?.value || masterReturnOrderDateFrom?.value || today());
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
    masterReturnOrderTable.innerHTML=`<tr><td colspan="7">${escapeHtml(err.message||'Không tải được đơn tổng trả hàng')}</td></tr>`;
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
    showMessage(masterReturnOrderMessage,json.message||'Đã tạo đơn tổng trả hàng');
    await loadUnmergedReturnOrders();
    await loadMasterReturnOrders();
    if(typeof loadReturnOrders==='function')await loadReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message,true)}
}

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

async function receiveMasterReturnOrder(id){
  if(!id)return;
  if(!confirm('Xác nhận kho đã kiểm nhận đơn tổng trả hàng này?'))return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'received'})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không cập nhật trạng thái kho');
    showMessage(masterReturnOrderMessage,json.message||'Đã xác nhận kho nhận hàng trả');
    await loadMasterReturnOrders();
    await loadUnmergedReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message,true)}
}

async function printMasterReturnOrder(id){
  if(!id)return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng trả để in');
    const r=json.masterReturnOrder||{};
    const children=Array.isArray(r.children)?r.children:[];
    const rows=children.map((c,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(c.code||'')}</td><td>${escapeHtml(c.customerName||c.customerCode||'')}</td><td>${money(c.totalQuantity)}</td><td>${money(c.debtReduction??c.totalAmount)}</td></tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(r.code||'Đơn tổng trả')}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1{font-size:22px;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}th{background:#f3f4f6}.total{margin-top:14px;font-weight:700}</style></head><body><h1>ĐƠN TỔNG TRẢ HÀNG</h1><p><b>Mã:</b> ${escapeHtml(r.code||r.id||'')} &nbsp; <b>Ngày:</b> ${escapeHtml(r.returnDate||r.date||'')} &nbsp; <b>NVGH:</b> ${escapeHtml(debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName))}</p><table><thead><tr><th>STT</th><th>Mã phiếu</th><th>Khách hàng</th><th>SL</th><th>Giá trị</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Không có chi tiết phiếu.</td></tr>'}</tbody></table><p class="total">Tổng SL: ${money(r.totalQuantity)} · Tổng tiền: ${money(r.debtReduction??r.totalAmount)}</p></body></html>`;
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in');
    w.document.write(html);w.document.close();w.focus();w.print();
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
