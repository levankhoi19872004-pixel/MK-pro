var DEBT_ZERO_TOLERANCE = window.DEBT_ZERO_TOLERANCE || 1000;
window.DEBT_ZERO_TOLERANCE = DEBT_ZERO_TOLERANCE;
function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}
function hasOpenDebt(value){ return normalizeDebtAmount(value) > 0; }
function isOverpaidDebt(value){ return normalizeDebtAmount(value) < 0; }
function parseDebtMoneyInput(value){
  if(typeof value==='number')return Number.isFinite(value)?Math.round(value):0;
  const raw=String(value||'').trim().toLowerCase();
  if(!raw)return 0;
  const multiplier=raw.endsWith('k')?1000:(raw.endsWith('tr')?1000000:1);
  const cleaned=raw.replace(/tr|k/g,'').replace(/[^0-9,.-]/g,'').replace(/[.,](?=\d{3}(\D|$))/g,'').replace(',', '.');
  const n=Number(cleaned);
  return Number.isFinite(n)?Math.max(0,Math.round(n*multiplier)):0;
}
function getDebtCustomerKey(d){return String(d?.customerId||d?.customerCode||d?.customerName||'');}
function getSelectedDebtCustomer(){
  const key=collectionCustomerSelect?String(collectionCustomerSelect.value||''):'';
  return (debtsCache||[]).find(d=>String(d.customerId||d.customerCode||d.customerName||'')===key)||null;
}
function resetDebtFilters(options={}){
  if(debtSearchInput)debtSearchInput.value='';
  if(debtSalesmanFilter)debtSalesmanFilter.value='';
  if(debtDeliveryFilter)debtDeliveryFilter.value='';
  if(debtStatusFilter)debtStatusFilter.value='';
  if(debtDateFrom)debtDateFrom.value='';
  if(debtDateTo)debtDateTo.value='';
  if(options.load!==false && typeof loadDebts==='function')loadDebts();
}
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
  if(status && status!=='all')params.set('status',status);
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  const url=params.toString()?`/api/debts?${params.toString()}`:'/api/debts';
  try{
    const res=await fetch(url);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được công nợ');
    const ledger=json.debts||[];
    const summary=json.summary||{};
    debtsCache=(Array.isArray(json.customerSummary)&&json.customerSummary.length)
      ?json.customerSummary
      :buildCustomerDebtOverview(ledger);
    const totalDebt=Number(summary.totalDebt ?? ledger.reduce((sum,d)=>sum+normalizeDebtAmount(d.debt),0));
    if(debtTotalKpi)debtTotalKpi.textContent=money(totalDebt);
    if(debtCount)debtCount.textContent=`${summary.orderCount??ledger.length} đơn · ${summary.customerCount??debtsCache.length} khách · Quá hạn ${summary.overdueCount??0}`;
    if(debtCustomerCountKpi)debtCustomerCountKpi.textContent=money(summary.customerCount??debtsCache.length);
    if(debtOrderCountKpi)debtOrderCountKpi.textContent=money(summary.orderCount??ledger.length);
    if(debtOverdueCountKpi)debtOverdueCountKpi.textContent=money(summary.overdueCount??0);
    if(debtTable)debtTable.innerHTML=ledger.map(d=>`<tr><td>${escapeHtml(d.orderCode||'')}</td><td>${escapeHtml(d.customerCode||'')} ${escapeHtml(d.customerName||'')}</td><td>${money(d.debt)}</td></tr>`).join('');

    const rows=debtsCache.filter(d=>{
      if(status==='paid')return !hasOpenDebt(d.debt);
      if(status==='overdue')return hasOpenDebt(d.debt) && Number(d.overdueDays||0)>0;
      if(status==='all')return true;
      return hasOpenDebt(d.debt) || isOverpaidDebt(d.debt);
    });
    window.debtVisibleRows=rows;
    if(debtCardList){
      debtCardList.innerHTML=rows.length?rows.map((d,idx)=>{
        const debt=Math.max(0, normalizeDebtAmount(d.debt));
        const overdue=Number(d.overdueDays||0);
        const key=escapeHtml(getDebtCustomerKey(d));
        return `<article class="debt-v2-customer-card" data-debt-index="${idx}" onclick="selectDebtCustomerFromCard(${idx})">
          <div class="debt-v2-card-top"><div><small>${escapeHtml(d.customerCode||'')}</small><b>${escapeHtml(d.customerName||'Chưa rõ khách')}</b></div><strong class="${hasOpenDebt(debt)?'debt-positive':'debt-zero'}">${money(debt)}</strong></div>
          <div class="debt-v2-card-meta"><span>${Number(d.orderCount||0)} đơn</span><span>${overdue>0?'Quá hạn '+overdue+' ngày':'Tuổi nợ '+Number(d.agingDays||0)+' ngày'}</span></div>
          <div class="debt-v2-card-staff"><span>NVBH: ${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</span><span>NVGH: ${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</span></div>
        </article>`;
      }).join(''):'<div class="empty-state">Không có khách phù hợp bộ lọc công nợ.</div>';
    }
    renderDebtManagementReports(ledger, json);
    renderCollectionCustomerSelect();
    const current=getSelectedDebtCustomer();
    if(current)selectCollectionCustomer(current,{silent:true});
  }catch(err){
    if(debtCount)debtCount.textContent='Lỗi tải công nợ';
    if(debtCardList)debtCardList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
}



function renderDebtCustomerOrderRows(customer){
  const orders=(customer && Array.isArray(customer.orders)?customer.orders:[])
    .filter(o=>hasOpenDebt(o.debt))
    .sort((a,b)=>String(a.documentDate||'').localeCompare(String(b.documentDate||'')));
  if(!orders.length)return '<div class="empty-state success-text">Khách này không còn đơn nợ.</div>';
  return `<div class="debt-order-detail-title">Danh sách đơn còn nợ của ${escapeHtml(customer.customerCode||'')} - ${escapeHtml(customer.customerName||'')}</div>
    <table class="mini-debt-order-table"><thead><tr><th>Đơn</th><th>Ngày</th><th>Tổng nợ gốc</th><th>Đã thu/trả</th><th>Còn nợ</th></tr></thead><tbody>
      ${orders.map(o=>`<tr><td><b>${escapeHtml(o.orderCode||o.orderId||'')}</b></td><td>${escapeHtml(o.documentDate||'')}</td><td class="price">${money(o.debit)}</td><td class="price cash-in">${money(o.credit)}</td><td class="price debt-positive">${money(o.debt)}</td></tr>`).join('')}
    </tbody></table>`;
}

function toggleDebtCustomerOrders(index){
  const box=document.getElementById(`debtCustomerOrders-${index}`);
  const row=(window.debtVisibleRows||debtsCache||[])[Number(index)];
  if(!box||!row)return;
  const shouldShow=box.hidden;
  document.querySelectorAll('.debt-customer-orders').forEach(el=>{el.hidden=true;});
  if(shouldShow){
    box.innerHTML=renderDebtCustomerOrderRows(row);
    box.hidden=false;
  }
}

function selectDebtCustomerFromCard(index){
  const row=(window.debtVisibleRows||debtsCache||[])[Number(index)];
  if(!row)return;
  selectCollectionCustomer(row);
  if(collectionCustomerSearch)collectionCustomerSearch.scrollIntoView({behavior:'smooth',block:'center'});
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
    item.debt+=normalizeDebtAmount(d.debt);
    item.orderCount+=1;
    item.overdueDays=Math.max(Number(item.overdueDays||0),Number(d.overdueDays||0));
    item.agingDays=Math.max(Number(item.agingDays||0),Number(d.agingDays||0));
    if(!item.salesmanCode&&!item.salesmanName){item.salesmanCode=d.salesmanCode||'';item.salesmanName=d.salesmanName||'';}
    if(!item.deliveryStaffCode&&!item.deliveryStaffName){item.deliveryStaffCode=d.deliveryStaffCode||'';item.deliveryStaffName=d.deliveryStaffName||'';}
    map.set(key,item);
  });
  return [...map.values()].map(d=>({...d,status:hasOpenDebt(d.debt)?(Number(d.overdueDays||0)>0?'overdue':'open'):'paid'})).sort((a,b)=>normalizeDebtAmount(b.debt)-normalizeDebtAmount(a.debt));
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
    item.debt+=normalizeDebtAmount(d.debt);
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
      return `<tr><td><strong>${escapeHtml(r.label||debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${customers}</td><td class="price">${Number(r.orders||0)}</td><td class="price">${money(r.debit)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price ${hasOpenDebt(r.debt)?'debt-positive':'debt-zero'}">${money(r.debt)}</td></tr>`;
    }).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVBH.</td></tr>';
  }
  if(debtDeliveryReportTable){
    debtDeliveryReportTable.innerHTML=deliveryRows.length?deliveryRows.map(r=>{
      const customers=(r.customers&&typeof r.customers.size==='number')?r.customers.size:Number(r.customers||0);
      const debt=Math.max(0, normalizeDebtAmount(r.debt));
      return `<tr><td><strong>${escapeHtml(r.label||debtPersonLabel(r.code,r.name))}</strong></td><td class="price">${customers}</td><td class="price">${Number(r.orders||0)}</td><td class="price cash-in">${money(r.credit)}</td><td class="price debt-positive">${money(Math.max(debt,0))}</td><td class="price ${hasOpenDebt(debt)?'debt-positive':'debt-zero'}">${money(debt)}</td></tr>`;
    }).join(''):'<tr><td colspan="6">Chưa có công nợ theo NVGH.</td></tr>';
  }
  renderDebtWarnings(rows, json.arDiagnostics||[]);
}

function renderDebtWarnings(rows, diagnostics=[]){
  if(!receiptTimeline)return;
  const overdueWarnings=rows.filter(d=>hasOpenDebt(d.debt)&&Number(d.overdueDays||0)>0).slice(0,20).map(d=>({
    code:d.orderCode, date:d.dueDate||d.documentDate, customerCode:d.customerCode, customerName:d.customerName, amount:d.debt,
    message:`Đơn quá hạn ${Number(d.overdueDays||0)} ngày, còn nợ ${money(d.debt)}`
  }));
  const negativeWarnings=rows.filter(d=>isOverpaidDebt(d.debt)).slice(0,20).map(d=>({
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

function updateDebtSelectionSummary(){
  const checked=[...document.querySelectorAll('.debt-order-allocation-check:checked')];
  const selectedTotal=checked.reduce((sum,chk)=>{
    const order=selectedCollectionCustomerOrders[Number(chk.dataset.index)];
    return sum+Math.max(0,normalizeDebtAmount(order?.debt));
  },0);
  const payAmount=parseDebtMoneyInput(debtPaymentAmount?debtPaymentAmount.value:0);
  if(selectedDebtOrdersTotal)selectedDebtOrdersTotal.textContent=money(selectedTotal);
  if(selectedDebtPaymentPreview)selectedDebtPaymentPreview.textContent=money(Math.min(payAmount,selectedTotal));
}

function renderCollectionOrderAllocations(customer = null){
  if(!collectionOrderAllocationBox)return;
  const orders = (customer && Array.isArray(customer.orders) ? customer.orders : [])
    .filter(o=>hasOpenDebt(o.debt))
    .sort((a,b)=>String(a.documentDate||'').localeCompare(String(b.documentDate||'')) || String(a.orderCode||'').localeCompare(String(b.orderCode||'')));
  selectedCollectionCustomerOrders=orders;
  if(!customer){collectionOrderAllocationBox.innerHTML='<div class="empty-state">Chọn khách để hiện danh sách đơn còn nợ.</div>';updateDebtSelectionSummary();return;}
  if(!orders.length){collectionOrderAllocationBox.innerHTML='<div class="empty-state success-text">Khách này không còn đơn nợ.</div>';updateDebtSelectionSummary();return;}
  collectionOrderAllocationBox.innerHTML=`<div class="allocation-head"><b>Công nợ theo từng đơn</b><small>Mặc định tick tất cả đơn còn nợ. Tiền sẽ phân bổ từ đơn lâu nhất trước.</small></div>
    <div class="allocation-list debt-v2-allocation-list">${orders.map((o,index)=>`<label class="allocation-row debt-v2-order-row">
      <input type="checkbox" class="debt-order-allocation-check" data-index="${index}" checked>
      <span><b>${escapeHtml(o.orderCode||o.orderId||'')}</b><small>${escapeHtml(o.documentDate||'')} · Còn nợ ${money(o.debt)}${Number(o.overdueDays||0)>0?` · Quá hạn ${Number(o.overdueDays||0)} ngày`:''}</small></span>
      <strong>${money(o.debt)}</strong>
    </label>`).join('')}</div>`;
  collectionOrderAllocationBox.querySelectorAll('.debt-order-allocation-check').forEach(chk=>{
    chk.addEventListener('change',()=>{
      const total=[...collectionOrderAllocationBox.querySelectorAll('.debt-order-allocation-check:checked')].reduce((sum,box)=>{
        const order=selectedCollectionCustomerOrders[Number(box.dataset.index)];
        return sum+Math.max(0,normalizeDebtAmount(order?.debt));
      },0);
      if(debtPaymentAmount)debtPaymentAmount.value=money(total);
      updateDebtSelectionSummary();
    });
  });
  const total=orders.reduce((sum,o)=>sum+Math.max(0,normalizeDebtAmount(o.debt)),0);
  if(debtPaymentAmount)debtPaymentAmount.value=money(total);
  updateDebtSelectionSummary();
}

function getSelectedDebtOrderAllocations(totalAmount){
  if(!collectionOrderAllocationBox)return [];
  const checkedIndexes=[...collectionOrderAllocationBox.querySelectorAll('.debt-order-allocation-check:checked')]
    .map(chk=>Number(chk.dataset.index))
    .filter(index=>Number.isFinite(index));
  let remain=Number(totalAmount||0);
  const rows=[];
  checkedIndexes.forEach(index=>{
    const order=selectedCollectionCustomerOrders[index];
    const debt=Math.max(0,normalizeDebtAmount(order?.debt));
    const applied=Math.min(debt, remain);
    if(order && applied>0){
      rows.push({orderId:order.orderId||'',orderCode:order.orderCode||'',amount:applied});
      remain-=applied;
    }
  });
  return rows;
}

function getCollectionCustomerMatches(){
  const q=collectionCustomerSearch?collectionCustomerSearch.value.trim():'';
  return debtsCache
    .filter(d=>hasOpenDebt(d.debt))
    .filter(d=>matchSearch(q,[d.customerCode,d.customerName]));
}
function selectCollectionCustomer(d, options={}){
  if(!d)return;
  const key=getDebtCustomerKey(d);
  collectionCustomerSelect.value=key;
  collectionCustomerSelect.dataset.debt=String(normalizeDebtAmount(d.debt));
  if(collectionCustomerSearch){
    collectionCustomerSearch.value=debtCustomerSuggestionLabel(d);
    collectionCustomerSearch.dataset.selectedId=key;
    collectionCustomerSearch.dataset.targetHidden='collectionCustomerSelect';
  }
  document.querySelectorAll('.debt-v2-customer-card').forEach(card=>card.classList.remove('active'));
  const index=(debtsCache||[]).findIndex(row=>getDebtCustomerKey(row)===key);
  const active=document.querySelector(`.debt-v2-customer-card[data-debt-index="${index}"]`);
  if(active)active.classList.add('active');
  if(debtDetailStatus)debtDetailStatus.textContent='Đang xử lý';
  if(debtCustomerInfoBox){
    debtCustomerInfoBox.innerHTML=`<div class="debt-info-main"><div><small>Mã khách</small><b>${escapeHtml(d.customerCode||'')}</b></div><div><small>Tên khách</small><b>${escapeHtml(d.customerName||'')}</b></div><div><small>Công nợ hiện tại</small><strong class="debt-positive">${money(d.debt)}</strong></div></div>
      <div class="debt-info-sub"><span>NVBH: <b>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</b></span><span>NVGH: <b>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</b></span><span>Số đơn nợ: <b>${Number(d.orderCount||0)}</b></span></div>`;
  }
  updateSelectedCustomerDebt();
  renderCollectionOrderAllocations(d);
  hideSuggestions(collectionCustomerSuggestions);
  if(!options.silent && collectionOrderAllocationBox)collectionOrderAllocationBox.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSearch)return;
  const has=debtsCache.some(d=>hasOpenDebt(d.debt));
  collectionCustomerSearch.disabled=!has;
  collectionCustomerSearch.placeholder=has?'Gõ mã/tên khách đang nợ...':'Không có khách đang nợ';
  if(!has){collectionCustomerSelect.value='';selectedCustomerDebt.textContent='0';renderCollectionOrderAllocations(null);}
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  selectedCustomerDebt.textContent=collectionCustomerSelect.value?money(collectionCustomerSelect.dataset.debt||0):'0';
}
async function submitDebtCollection(event){
  event.preventDefault();
  if(!collectionCustomerSelect.value){showMessage(collectionMessage,'Bạn chưa chọn khách hàng cần thanh toán.',true);return}
  const payload=Object.fromEntries(new FormData(debtCollectionForm).entries());
  const amount=parseDebtMoneyInput(payload.paymentAmount);
  const method=payload.paymentMethod||'cash';
  payload.cashAmount=method==='cash'?amount:0;
  payload.transferAmount=method==='transfer'?amount:0;
  payload.returnAmount=method==='return'?amount:0;
  payload.amount=amount;
  if(amount<=0){showMessage(collectionMessage,'Bạn cần nhập số tiền thanh toán lớn hơn 0.',true);return}
  payload.allocations=getSelectedDebtOrderAllocations(amount);
  if(selectedCollectionCustomerOrders.length && !payload.allocations.length){showMessage(collectionMessage,'Bạn cần tick ít nhất một đơn nợ để thanh toán.',true);return}
  const selectedTotal=[...document.querySelectorAll('.debt-order-allocation-check:checked')].reduce((sum,chk)=>{
    const order=selectedCollectionCustomerOrders[Number(chk.dataset.index)];
    return sum+Math.max(0,normalizeDebtAmount(order?.debt));
  },0);
  if(amount>selectedTotal){showMessage(collectionMessage,`Số tiền thanh toán (${money(amount)}) lớn hơn tổng nợ đã tick (${money(selectedTotal)}).`,true);return}
  try{
    const res=await fetch('/api/debt-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xử lý được công nợ');
    const currentKey=collectionCustomerSelect.value;
    showMessage(collectionMessage,json.message||'Đã ghi chứng từ công nợ');
    await loadDebts();await loadArLedger();await loadCashbook();await loadReturnOrders();
    const next=(debtsCache||[]).find(d=>getDebtCustomerKey(d)===currentKey);
    if(next && hasOpenDebt(next.debt))selectCollectionCustomer(next,{silent:true});
    else clearDebtCustomerSelection();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}

function clearDebtCustomerSelection(){
  if(collectionCustomerSelect)collectionCustomerSelect.value='';
  if(collectionCustomerSearch)collectionCustomerSearch.value='';
  if(debtPaymentAmount)debtPaymentAmount.value='';
  if(selectedCustomerDebt)selectedCustomerDebt.textContent='0';
  if(debtDetailStatus)debtDetailStatus.textContent='Chưa chọn khách';
  if(debtCustomerInfoBox)debtCustomerInfoBox.innerHTML='<div class="empty-state">Chọn một khách hàng trong danh sách công nợ để xem chi tiết.</div>';
  document.querySelectorAll('.debt-v2-customer-card').forEach(card=>card.classList.remove('active'));
  renderCollectionOrderAllocations(null);
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
  if(!rows.length){
    unmergedReturnOrderTable.innerHTML='<div class="empty-state">Không có phiếu trả hàng chưa gộp.</div>';
    return;
  }
  unmergedReturnOrderTable.innerHTML=rows.map(r=>{
    const id=String(r.id||r.code||'');
    const checked=selectedReturnOrderIdsForMaster.has(id)?'checked':'';
    const staff=debtPersonLabel(r.deliveryStaffCode||r.staffCode,r.deliveryStaffName||r.staffName);
    const customer=[r.customerCode,r.customerName].filter(Boolean).join(' - ');
    const selected=checked?' selected':'';
    return `<label class="child-order-row return-child-order-row${selected}">
      <input type="checkbox" class="master-return-check" data-id="${escapeHtml(id)}" ${checked}>
      <div>
        <div class="child-order-title">${escapeHtml(r.code||r.id||'')}</div>
        <div class="child-order-meta">${escapeHtml(r.date||r.documentDate||'')} · ${escapeHtml(customer||'Không rõ khách')}</div>
        <div class="child-order-meta">NVGH: ${escapeHtml(staff)}</div>
      </div>
      <div class="child-order-money">
        <span>SL: <b>${money(r.totalQuantity)}</b></span>
        <span>Giá trị: <b class="cash-in">${money(r.debtReduction??r.totalAmount)}</b></span>
      </div>
    </label>`;
  }).join('');
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
  if(!rows.length){
    masterReturnOrderTable.innerHTML='<div class="empty-state">Chưa có đơn tổng trả hàng.</div>';
    return;
  }
  masterReturnOrderTable.innerHTML=rows.map(r=>{
    const status=String(r.status||'pending_warehouse_receive');
    const statusText=status==='pending_warehouse_receive'?'Chờ kho nhận':(status==='received'?'Kho đã nhận':(status==='cancelled'?'Đã hủy':status));
    const badgeClass=status==='cancelled'?'out':(status==='received'?'in':'warn');
    const staff=debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName);
    const id=escapeHtml(r.id||r.code||'');
    const returnCount=Number(r.returnCount || (Array.isArray(r.children)?r.children.length:0));
    return `<div class="order-card master-return-card">
      <div class="master-return-card-head">
        <div>
          <h3>${escapeHtml(r.code||r.id||'')}</h3>
          <div class="order-meta">Ngày: ${escapeHtml(r.returnDate||r.date||'')} · Giao hàng: ${escapeHtml(staff)}</div>
        </div>
        <span class="badge ${badgeClass}">${escapeHtml(statusText)}</span>
      </div>
      <div class="master-return-card-metrics">
        <span>Số phiếu: <b>${money(returnCount)}</b></span>
        <span>Tổng SL: <b>${money(r.totalQuantity)}</b></span>
        <span>Tổng tiền: <b class="cash-in">${money(r.debtReduction??r.totalAmount)}</b></span>
        <span>Kho: <b>${escapeHtml(statusText)}</b></span>
      </div>
      ${r.note?`<div class="order-meta">Ghi chú: ${escapeHtml(r.note)}</div>`:''}
      <div class="master-return-actions">
        <button class="secondary small" type="button" onclick="viewMasterReturnOrder('${id}')">Xem</button>
        <button class="secondary small" type="button" onclick="printMasterReturnOrder('${id}')">In</button>
        ${status==='received'?'':`<button class="secondary small" type="button" onclick="receiveMasterReturnOrder('${id}')">Nhập kho</button>`}
        <button class="secondary small danger" type="button" onclick="cancelMasterReturnOrder('${id}')">Hủy</button>
      </div>
    </div>`;
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
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/receive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receivedBy:'Kho'})});
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
