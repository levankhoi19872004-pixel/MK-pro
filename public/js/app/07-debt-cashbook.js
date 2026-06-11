var DEBT_ZERO_TOLERANCE = window.DEBT_ZERO_TOLERANCE || 1000;
window.DEBT_ZERO_TOLERANCE = DEBT_ZERO_TOLERANCE;
// ===== SCOPED CHANGE: DEBT_UI_RENDER_FROM_DEBT_ROWS_START =====
// Màn Công nợ hiển thị NVBH/NVGH từ chính dòng công nợ (API debts/arLedgers),
// không lấy lại từ customer summary, users map hoặc legacy audit fields.
window.debtLedgerRowsCache = Array.isArray(window.debtLedgerRowsCache) ? window.debtLedgerRowsCache : [];
// ===== SCOPED CHANGE: DEBT_UI_RENDER_FROM_DEBT_ROWS_END =====
function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}
function hasOpenDebt(value){ return normalizeDebtAmount(value) > 0; }
function isOverpaidDebt(value){ return normalizeDebtAmount(value) < 0; }
function debtDisplayMeta(value){
  const debt=normalizeDebtAmount(value);
  if(debt>0)return {amount:debt,text:money(debt),className:'debt-positive',label:'Còn nợ'};
  if(debt<0)return {amount:debt,text:`Dư có ${money(Math.abs(debt))}`,className:'cash-in',label:'Dư có'};
  return {amount:0,text:'0',className:'debt-zero',label:'Hết nợ'};
}
function parseDebtMoneyInput(value){
  if(typeof value==='number')return Number.isFinite(value)?Math.round(value):0;
  const raw=String(value||'').trim().toLowerCase();
  if(!raw)return 0;
  const multiplier=raw.endsWith('k')?1000:(raw.endsWith('tr')?1000000:1);
  const cleaned=raw.replace(/tr|k/g,'').replace(/[^0-9,.-]/g,'').replace(/[.,](?=\d{3}(\D|$))/g,'').replace(',', '.');
  const n=Number(cleaned);
  return Number.isFinite(n)?Math.max(0,Math.round(n*multiplier)):0;
}

function formatNumber(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n.toLocaleString('vi-VN'):'0';
}
window.formatNumber=window.formatNumber||formatNumber;
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
  clearDebtSearchResultState();
  if(options.load!==false && typeof loadDebts==='function')loadDebts();
}
function getDebtSearchCriteria(){
  return {
    q: debtSearchInput ? debtSearchInput.value.trim() : '',
    salesman: debtSalesmanFilter ? debtSalesmanFilter.value.trim() : '',
    delivery: debtDeliveryFilter ? debtDeliveryFilter.value.trim() : '',
    status: debtStatusFilter ? debtStatusFilter.value : ''
  };
}
function hasDebtSearchCriteria(criteria=getDebtSearchCriteria()){
  // Màn công nợ phương án 3: không tải toàn bộ khách khi mở màn.
  // Chỉ gọi API khi có ít nhất một trường tìm kiếm thực sự: khách hàng, NVBH hoặc NVGH.
  return Boolean(criteria.q || criteria.salesman || criteria.delivery);
}
function clearDebtSearchResultState(message='Nhập mã, tên hoặc SĐT khách hàng để xem danh sách công nợ.'){
  debtsCache=[];
  window.debtVisibleRows=[];
  selectedCollectionCustomerOrders=[];
  if(debtTotalKpi)debtTotalKpi.textContent='0';
  if(debtCustomerCountKpi)debtCustomerCountKpi.textContent='0';
  if(debtOrderCountKpi)debtOrderCountKpi.textContent='0';
  if(debtOverdueCountKpi)debtOverdueCountKpi.textContent='0';
  if(debtCount)debtCount.textContent=message;
  if(debtCardList)debtCardList.innerHTML=`<div class="empty-state">${escapeHtml(message)}</div>`;
  if(debtTable)debtTable.innerHTML='';
  if(typeof renderDebtManagementReports==='function')renderDebtManagementReports([],{});
  if(typeof clearDebtCustomerSelection==='function')clearDebtCustomerSelection();
}
async function loadDebts(){
  const criteria=getDebtSearchCriteria();
  if(!hasDebtSearchCriteria(criteria)){
    clearDebtSearchResultState();
    return;
  }
  const params=new URLSearchParams();
  if(criteria.q)params.set('q',criteria.q);
  if(criteria.salesman)params.set('salesman',criteria.salesman);
  if(criteria.delivery)params.set('delivery',criteria.delivery);
  if(criteria.status && criteria.status!=='all')params.set('status',criteria.status);
  params.set('page','1');
  params.set('limit','50');
  params.set('includePaid',criteria.status==='paid'?'1':'0');
  const url=`/api/debts/customers?${params.toString()}`;
  try{
    if(debtCount)debtCount.textContent='Đang tra cứu công nợ...';
    const res=await fetch(url);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được công nợ');
    const ledger=Array.isArray(json.debts)?json.debts:[];
    window.debtLedgerRowsCache=ledger;
    const summary=json.summary||{};
    debtsCache=mergeDebtCustomerSummaryFromDebtRows(json.customerSummary, ledger);
    const totalDebt=Number(summary.totalDebt ?? ledger.reduce((sum,d)=>sum+normalizeDebtAmount(d.debt),0));
    if(debtTotalKpi)debtTotalKpi.textContent=money(totalDebt);
    if(debtCount)debtCount.textContent=`${summary.customerCount??debtsCache.length} khách · ${summary.orderCount??ledger.length} đơn · Quá hạn ${summary.overdueCount??0}`;
    if(debtCustomerCountKpi)debtCustomerCountKpi.textContent=money(summary.customerCount??debtsCache.length);
    if(debtOrderCountKpi)debtOrderCountKpi.textContent=money(summary.orderCount??ledger.length);
    if(debtOverdueCountKpi)debtOverdueCountKpi.textContent=money(summary.overdueCount??0);
    if(debtTable)debtTable.innerHTML=ledger.map(d=>`<tr><td>${escapeHtml(d.orderCode||'')}</td><td>${escapeHtml(d.customerCode||'')} ${escapeHtml(d.customerName||'')}</td><td>${money(d.debt)}</td></tr>`).join('');

    const rows=debtsCache.filter(d=>{
      if(criteria.status==='paid')return !hasOpenDebt(d.debt);
      if(criteria.status==='overdue')return hasOpenDebt(d.debt) && Number(d.overdueDays||0)>0;
      if(criteria.status==='all')return true;
      return hasOpenDebt(d.debt) || isOverpaidDebt(d.debt);
    });
    window.debtVisibleRows=rows;
    if(debtCardList){
      debtCardList.innerHTML=rows.length?rows.map((d,idx)=>{
        const meta=debtDisplayMeta(d.debt);
        const overdue=Number(d.overdueDays||0);
        return `<article class="debt-v2-customer-card" data-debt-index="${idx}" onclick="selectDebtCustomerFromCard(${idx})">
          <div class="debt-v2-card-top"><div><small>${escapeHtml(d.customerCode||'')}</small><b>${escapeHtml(d.customerName||'Chưa rõ khách')}</b></div><strong class="${meta.className}">${meta.text}</strong></div>
          <div class="debt-v2-card-meta"><span>${Number(d.orderCount||0)} đơn</span><span>${overdue>0?'Quá hạn '+overdue+' ngày':'Tuổi nợ '+Number(d.agingDays||0)+' ngày'}</span></div>
          <div class="debt-v2-card-staff"><span>NVBH: ${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</span><span>NVGH: ${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</span></div>
        </article>`;
      }).join(''):'<div class="empty-state">Không có khách phù hợp điều kiện tìm kiếm.</div>';
    }
    renderDebtManagementReports(ledger, json);
    renderCollectionCustomerSelect();
    const current=getSelectedDebtCustomer();
    const next=current || rows[0];
    if(next)selectCollectionCustomer(next,{silent:true});
    else clearDebtCustomerSelection();
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


// ===== SCOPED CHANGE: DEBT_UI_RENDER_FROM_DEBT_ROWS_START =====
function getDebtLedgerCustomerKey(row){
  return String(row?.customerId||row?.customerCode||row?.customerName||'').trim();
}
function getDebtLedgerOrderKey(row){
  return String(row?.orderId||row?.orderCode||row?.salesOrderId||row?.salesOrderCode||row?.refId||row?.refCode||'').trim();
}
function debtStaffFieldsFromDebtRow(row={}){
  return {
    salesmanCode: row.salesmanCode || row.salesStaffCode || row.nvbhCode || '',
    salesmanName: row.salesmanName || row.salesStaffName || row.nvbhName || '',
    deliveryStaffCode: row.deliveryStaffCode || row.deliveryCode || row.nvghCode || '',
    deliveryStaffName: row.deliveryStaffName || row.deliveryName || row.nvghName || ''
  };
}
function findDebtRowsForCustomer(customer){
  const rows=Array.isArray(window.debtLedgerRowsCache)?window.debtLedgerRowsCache:[];
  const key=getDebtCustomerKey(customer);
  const customerCode=String(customer?.customerCode||'').trim();
  const customerId=String(customer?.customerId||'').trim();
  return rows.filter(row=>{
    const rowKey=getDebtLedgerCustomerKey(row);
    return (key && rowKey===key) || (customerCode && String(row.customerCode||'')===customerCode) || (customerId && String(row.customerId||'')===customerId);
  });
}
function pickDebtDisplayRowFromDebtRows(customer){
  const debtRows=findDebtRowsForCustomer(customer)
    .filter(row=>hasOpenDebt(row.debt) || isOverpaidDebt(row.debt))
    .sort((a,b)=>String(a.documentDate||a.date||'').localeCompare(String(b.documentDate||b.date||'')) || String(a.orderCode||'').localeCompare(String(b.orderCode||'')));
  const checkedOrders=(Array.isArray(selectedCollectionCustomerOrders)?selectedCollectionCustomerOrders:[])
    .map(order=>getDebtLedgerOrderKey(order))
    .filter(Boolean);
  if(checkedOrders.length){
    const selected=debtRows.find(row=>checkedOrders.includes(getDebtLedgerOrderKey(row)));
    if(selected)return selected;
  }
  return debtRows[0] || getDebtPrimaryOpenOrder(customer) || customer || {};
}
function renderDebtStaffInfoFromDebt(customer){
  const row=pickDebtDisplayRowFromDebtRows(customer);
  const staff=debtStaffFieldsFromDebtRow(row);
  return `<span>NVBH: <b>${escapeHtml(debtPersonLabel(staff.salesmanCode,staff.salesmanName))}</b></span><span>NVGH: <b>${escapeHtml(debtPersonLabel(staff.deliveryStaffCode,staff.deliveryStaffName))}</b></span>`;
}
function mergeDebtCustomerSummaryFromDebtRows(customerSummary=[], debtRows=[]){
  const base=(Array.isArray(customerSummary)&&customerSummary.length)?customerSummary:buildCustomerDebtOverview(debtRows);
  const byCustomer=new Map();
  (Array.isArray(debtRows)?debtRows:[]).forEach(row=>{
    const key=getDebtLedgerCustomerKey(row);
    if(!key)return;
    const list=byCustomer.get(key)||[];
    list.push(row);
    byCustomer.set(key,list);
  });
  return base.map(customer=>{
    const key=getDebtCustomerKey(customer);
    const rows=byCustomer.get(key)||[];
    if(!rows.length)return customer;
    const openRows=rows.filter(row=>hasOpenDebt(row.debt)||isOverpaidDebt(row.debt));
    const ordered=(openRows.length?openRows:rows).slice().sort((a,b)=>String(a.documentDate||a.date||'').localeCompare(String(b.documentDate||b.date||'')) || String(a.orderCode||'').localeCompare(String(b.orderCode||'')));
    const first=ordered[0]||{};
    const staff=debtStaffFieldsFromDebtRow(first);
    return {
      ...customer,
      salesmanCode: staff.salesmanCode,
      salesmanName: staff.salesmanName,
      deliveryStaffCode: staff.deliveryStaffCode,
      deliveryStaffName: staff.deliveryStaffName,
      orders: ordered.map(row=>({
        orderId: row.orderId || row.salesOrderId || '',
        orderCode: row.orderCode || row.salesOrderCode || row.refCode || '',
        documentDate: row.documentDate || row.date || '',
        dueDate: row.dueDate || row.documentDate || row.date || '',
        debit: Number(row.debit||0),
        credit: Number(row.credit||0),
        receiptAmount: Number(row.receiptAmount||0),
        returnAmount: Number(row.returnAmount||0),
        bonusAmount: Number(row.bonusAmount||0),
        debt: normalizeDebtAmount(row.debt),
        overdueDays: Number(row.overdueDays||0),
        agingDays: Number(row.agingDays||0),
        status: row.status || '',
        ...debtStaffFieldsFromDebtRow(row)
      }))
    };
  });
}
// ===== SCOPED CHANGE: DEBT_UI_RENDER_FROM_DEBT_ROWS_END =====

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
    <div class="debt-v2-order-table-wrap"><table class="debt-v2-order-table"><thead><tr><th></th><th>Mã đơn</th><th>Ngày</th><th>AR Sale</th><th>Đã thu</th><th>Trả hàng</th><th>Trả thưởng</th><th>Còn nợ</th></tr></thead><tbody>
      ${orders.map((o,index)=>`<tr class="debt-v2-order-row-table"><td><input type="checkbox" class="debt-order-allocation-check" data-index="${index}" checked></td><td><b>${escapeHtml(o.orderCode||o.orderId||'')}</b>${Number(o.overdueDays||0)>0?`<small>Quá hạn ${Number(o.overdueDays||0)} ngày</small>`:''}</td><td>${escapeHtml(o.documentDate||'')}</td><td class="price">${money(o.debit)}</td><td class="price cash-in">${money(o.receiptAmount||0)}</td><td class="price cash-in">${money(o.returnAmount||0)}</td><td class="price cash-in">${money(o.bonusAmount||0)}</td><td class="price debt-positive"><b>${money(o.debt)}</b></td></tr>`).join('')}
    </tbody></table></div>`;
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
    .filter(d=>hasOpenDebt(d.debt) || isOverpaidDebt(d.debt))
    .filter(d=>matchSearch(q,[d.customerCode,d.customerName]));
}

function getDebtPrimaryOpenOrder(customer){
  const orders=Array.isArray(customer?.orders)?customer.orders:[];
  return orders
    .filter(o=>hasOpenDebt(o.debt) || isOverpaidDebt(o.debt))
    .sort((a,b)=>String(a.documentDate||'').localeCompare(String(b.documentDate||'')))[0] || orders[0] || null;
}
function getDebtDisplayStaffSource(customer){
  // Kept for compatibility with old callers; new UI rendering uses renderDebtStaffInfoFromDebt().
  return debtStaffFieldsFromDebtRow(pickDebtDisplayRowFromDebtRows(customer));
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
  const index=(window.debtVisibleRows||debtsCache||[]).findIndex(row=>getDebtCustomerKey(row)===key);
  const active=document.querySelector(`.debt-v2-customer-card[data-debt-index="${index}"]`);
  if(active)active.classList.add('active');
  if(debtDetailStatus)debtDetailStatus.textContent='Đang xử lý';
  const debtMeta=debtDisplayMeta(d.debt);
  if(debtCustomerInfoBox){
    debtCustomerInfoBox.innerHTML=`<div class="debt-info-main"><div><small>Mã khách</small><b>${escapeHtml(d.customerCode||'')}</b></div><div><small>Tên khách</small><b>${escapeHtml(d.customerName||'')}</b></div><div><small>${escapeHtml(debtMeta.label)}</small><strong class="${debtMeta.className}">${debtMeta.text}</strong></div></div>
      <div class="debt-info-sub">${renderDebtStaffInfoFromDebt(d)}<span>Số đơn nợ: <b>${Number(d.orderCount||0)}</b></span></div>`;
  }
  updateSelectedCustomerDebt();
  renderCollectionOrderAllocations(d);
  hideSuggestions(collectionCustomerSuggestions);
  if(!options.silent && collectionOrderAllocationBox)collectionOrderAllocationBox.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSearch)return;
  const has=debtsCache.some(d=>hasOpenDebt(d.debt) || isOverpaidDebt(d.debt));
  collectionCustomerSearch.disabled=!has;
  collectionCustomerSearch.placeholder=has?'Gõ mã/tên khách đang nợ hoặc dư có...':'Không có khách đang nợ/dư có';
  if(!has){collectionCustomerSelect.value='';selectedCustomerDebt.textContent='0';renderCollectionOrderAllocations(null);}
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  selectedCustomerDebt.textContent=collectionCustomerSelect.value?debtDisplayMeta(collectionCustomerSelect.dataset.debt||0).text:'0';
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


// V45 - Return Orders readonly split panel state
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
function renderReturnOrderDetail(order){
  const panel=document.getElementById('returnOrderDetailPanel');
  if(!panel) return;
  if(!order){
    panel.innerHTML='<div class="return-detail-empty"><strong>Chi tiết đơn trả hàng</strong><p>Chọn một phiếu bên trái để xem sản phẩm trả. Khu vực này chỉ xem, không cho chỉnh sửa.</p></div>';
    return;
  }
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
function selectReturnOrderByKey(key){
  selectedReturnOrderKey=String(key||'');
  const order=returnOrdersCache.find(r=>returnOrderRowKey(r)===selectedReturnOrderKey)||null;
  if(returnOrderTable){
    returnOrderTable.querySelectorAll('tr[data-return-key]').forEach(tr=>tr.classList.toggle('active', tr.dataset.returnKey===selectedReturnOrderKey));
  }
  renderReturnOrderDetail(order);
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
    await loadReturnOrders();
  }catch(err){alert(err.message||'Không hủy được phiếu trả hàng')}
}
window.cancelReturnOrder=cancelReturnOrder;

async function loadReturnOrders(){
  if(!returnOrderTable)return;
  const q=returnOrderSearchInput?returnOrderSearchInput.value.trim():'';
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  const mode=returnOrderDateMode?String(returnOrderDateMode.value||'today'):'today';
  params.set('dateMode',mode);
  if(mode==='today'){
    params.set('dateFrom', today());
    params.set('dateTo', today());
  }else if(mode==='range'){
    if(returnOrderDateFrom?.value)params.set('dateFrom',returnOrderDateFrom.value);
    if(returnOrderDateTo?.value)params.set('dateTo',returnOrderDateTo.value);
  }
  params.set('page','1');
  params.set('limit','50');
  params.set('excludeInactive','1');
  const url=`/api/return-orders?${params.toString()}`;
  try{
    const res=await fetch(url);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn trả hàng');
    const rawRows = Array.isArray(json.returnOrders) ? json.returnOrders :
      Array.isArray(json.returns) ? json.returns :
      Array.isArray(json.rows) ? json.rows :
      Array.isArray(json.items) ? json.items :
      Array.isArray(json.data) ? json.data : [];
    const rows = rawRows.filter(row => (typeof isActiveDocument === 'function' ? isActiveDocument(row) : true));
    const totalValue=rows.reduce((sum,r)=>sum+Number(r.debtReduction??r.totalAmount??0),0);
    const modeLabel=returnOrderDateMode?.value==='all'?'Tất cả':(returnOrderDateMode?.value==='range'?'Theo khoảng ngày':'Hôm nay');
    if(returnOrderCount) returnOrderCount.innerHTML=`${rows.length} phiếu · ${escapeHtml(modeLabel)} · Tổng giảm nợ ${money(totalValue)} · Chọn một phiếu để xem sản phẩm trả · <strong>Readonly</strong>`;
    returnOrdersCache=rows;
    if(!rows.length){
      selectedReturnOrderKey='';
      returnOrderTable.innerHTML='<tr><td colspan="6">Chưa có đơn trả hàng.</td></tr>';
      renderReturnOrderDetail(null);
      return;
    }
    if(!rows.some(r=>returnOrderRowKey(r)===selectedReturnOrderKey)) selectedReturnOrderKey=returnOrderRowKey(rows[0]);
    returnOrderTable.innerHTML=rows.map(r=>{
      const key=returnOrderRowKey(r);
      const status=String(r.status||'posted');
      const totalQty=Number(r.totalQuantity||0) || returnOrderItems(r).reduce((sum,it)=>sum+returnItemQty(it),0);
      const totalAmount=Number(r.debtReduction??r.totalAmount??r.amount??0) || returnOrderItems(r).reduce((sum,it)=>sum+returnItemAmount(it),0);
      return `<tr data-return-key="${escapeHtml(key)}" class="${key===selectedReturnOrderKey?'active':''}" title="Bấm để xem chi tiết sản phẩm trả">
        <td><strong>${escapeHtml(r.code||r.id||'')}</strong><div class="muted tiny-text">${escapeHtml(r.salesOrderCode||r.orderCode||'')}</div></td>
        <td>${escapeHtml(r.date||r.documentDate||r.returnDate||'')}</td>
        <td>${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</td>
        <td class="price">${money(totalQty)}</td>
        <td class="price cash-in">${money(totalAmount)}</td>
        <td><span class="badge ${returnOrderStatusBadgeClass(status)}">${escapeHtml(returnOrderStatusLabel(status))}</span></td>
      </tr>`;
    }).join('');
    selectReturnOrderByKey(selectedReturnOrderKey);
  }catch(err){
    if(returnOrderCount) returnOrderCount.textContent='Không tải được đơn trả hàng';
    returnOrderTable.innerHTML=`<tr><td colspan="6">${escapeHtml(err.message||'Không tải được đơn trả hàng')}</td></tr>`;
    renderReturnOrderDetail(null);
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
  if(value.includes('bonus')||value.includes('allowance')||value.includes('discount'))return 'Trả thưởng/cấn trừ';
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
  if(!params.has('dateFrom')){
    const d=(typeof today==='function') ? today() : new Date().toISOString().slice(0,10);
    params.set('dateFrom',d);
  }
  if(!params.has('dateTo')) params.set('dateTo',params.get('dateFrom'));
  const url=`/api/debts/ar-ledger?${params.toString()}`;
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
  // File này có thể được load ở màn Hệ thống, nơi không có UI Sổ quỹ.
  // Nếu không có bất kỳ phần tử quỹ tiền nào thì thoát sớm để tránh lỗi null.textContent/null.innerHTML.
  if(!cashSummary && !cashbookTable && !bankbookTable && !cashTotalKpi && !bankTotalKpi)return;

  const q=cashbookSearchInput?cashbookSearchInput.value.trim():'';
  const url=q?`/api/cashbook?q=${encodeURIComponent(q)}`:'/api/cashbook';
  try{
    const res=await fetch(url);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được sổ quỹ');
    const entries=json.cashbook||[];
    const s=json.summary||{cashIn:0,cashOut:0,balance:0};
    const bs=json.bankSummary||{bankIn:0,bankOut:0,balance:0};
    if(cashTotalKpi)cashTotalKpi.textContent=money(s.balance);
    if(bankTotalKpi)bankTotalKpi.textContent=money(bs.balance);
    if(cashSummary){
      cashSummary.textContent=`Tiền mặt: thu ${money(s.cashIn)} · chi ${money(s.cashOut)} · tồn ${money(s.balance)} | Chuyển khoản: ${money(bs.balance)}`;
    }
    const cashRows=entries.filter(e=>!e.isBank);
    const bankRows=entries.filter(e=>e.isBank);
    if(cashbookTable){
      cashbookTable.innerHTML=cashRows.length?cashRows.map(e=>`<tr><td><strong>${escapeHtml(e.code||'')}</strong></td><td>${escapeHtml(e.date||'')}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${escapeHtml(e.source||'')}</td><td>${escapeHtml((e.customerCode||'')+' '+(e.customerName||''))}</td><td>${escapeHtml(e.staffName||'')}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td><td>${escapeHtml(e.note||'')}</td></tr>`).join(''):'<tr><td colspan="8">Chưa có phát sinh tiền mặt.</td></tr>';
    }
    if(bankbookTable){
      bankbookTable.innerHTML=bankRows.length?bankRows.map(e=>`<tr><td><strong>${escapeHtml(e.code||'')}</strong></td><td>${escapeHtml(e.date||'')}</td><td>${escapeHtml(e.source||'')}</td><td>${escapeHtml((e.customerCode||'')+' '+(e.customerName||''))}</td><td>${escapeHtml(e.staffName||'')}</td><td class="price cash-in">${money(e.amount)}</td><td>${escapeHtml(e.note||'')}</td></tr>`).join(''):'<tr><td colspan="7">Chưa có phát sinh chuyển khoản.</td></tr>';
    }
  }catch(err){
    if(cashSummary)cashSummary.textContent='Lỗi tải sổ quỹ';
    if(cashbookTable)cashbookTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||'Lỗi tải sổ quỹ')}</td></tr>`;
    if(bankbookTable)bankbookTable.innerHTML=`<tr><td colspan="7">${escapeHtml(err.message||'Lỗi tải sổ quỹ')}</td></tr>`;
  }
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
  const head=`<div class="return-list-head"><span></span><span>Mã trả hàng</span><span>Khách hàng</span><span>NV giao</span><span>Ngày trả</span><span>SL</span><span>Giá trị</span></div>`;
  if(!rows.length){
    unmergedReturnOrderTable.innerHTML=head+'<div class="empty-state">Không có phiếu trả hàng chưa gộp.</div>';
    return;
  }
  unmergedReturnOrderTable.innerHTML=head+rows.map(r=>{
    const id=String(r.id||r.code||'');
    const checked=selectedReturnOrderIdsForMaster.has(id)?'checked':'';
    const staff=canonicalDeliveryStaffLabel(r);
    const customer=[r.customerCode,r.customerName].filter(Boolean).join(' - ');
    const selected=checked?' selected':'';
    return `<label class="return-one-line-row${selected}">
      <input type="checkbox" class="master-return-check" data-id="${escapeHtml(id)}" ${checked}>
      <strong class="return-row-code" title="${escapeHtml(r.code||r.id||'')}">${escapeHtml(r.code||r.id||'')}</strong>
      <span class="return-row-customer" title="${escapeHtml(customer||'Không rõ khách')}">${escapeHtml(customer||'Không rõ khách')}</span>
      <span class="return-row-staff" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="return-row-date">${escapeHtml(r.deliveryDate||r.returnDate||r.date||r.documentDate||'')}</span>
      <span class="return-row-qty">${money(r.totalQuantity)}</span>
      <strong class="return-row-money">${money(r.debtReduction??r.totalAmount)}</strong>
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
  const head=`<div class="master-return-list-head"><span></span><span>Mã đơn tổng trả</span><span>NV giao</span><span>Ngày trả</span><span>Giá trị</span><span>Huỷ đơn</span></div>`;
  if(!rows.length){
    masterReturnOrderTable.innerHTML=head+'<div class="empty-state">Chưa có đơn tổng trả hàng.</div>';
    return;
  }
  window.__masterReturnOrdersCache=rows;
  if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.textContent='Chọn tất cả';
  masterReturnOrderTable.innerHTML=head+rows.map((r,idx)=>{
    const warehouseStatus=String(r.warehouseStatus||r.warehouseReceiveStatus||r.status||'pending').toLowerCase();
    const accountingStatus=String(r.accountingStatus||'pending').toLowerCase();
    const locked=['posted','received','confirmed','completed'].includes(warehouseStatus) || accountingStatus==='confirmed' || r.stockPosted;
    const staff=debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName);
    const id=escapeHtml(r.id||r.code||'');
    const cancelCell=locked
      ? `<span class="erp-doc-action-state">Đã khóa</span>`
      : `<button class="secondary small danger" type="button" onclick="cancelMasterReturnOrder('${id}')">Hủy</button>`;
    return `<article class="erp-doc-row master-return-one-line">
      <label class="erp-doc-check"><input type="checkbox" class="master-return-order-check" data-idx="${idx}"></label>
      <strong class="erp-doc-code" title="${escapeHtml(r.code||r.id||'')}">${escapeHtml(r.code||r.id||'')}</strong>
      <span class="erp-doc-party" title="${escapeHtml(staff)}">${escapeHtml(staff)}</span>
      <span class="erp-doc-date" title="Ngày trả">${escapeHtml(r.returnDate||r.date||'')}</span>
      <strong class="erp-doc-value" title="Giá trị">${money(r.debtReduction??r.totalAmount)}</strong>
      <div class="erp-doc-actions">${cancelCell}</div>
    </article>`;
  }).join('');
}

async function loadMasterReturnOrders(){
  if(!masterReturnOrderTable)return;
  const params=new URLSearchParams();
  params.set('dateFrom', masterReturnOrderDateFrom?.value || today());
  params.set('dateTo', masterReturnOrderDateTo?.value || masterReturnOrderDateFrom?.value || today());
  params.set('page','1');
  params.set('limit','50');
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


async function editMasterReturnOrder(idx){
  const order=window.__masterReturnOrdersCache?.[Number(idx)];
  if(!order)return;
  const deliveryStaffCode=prompt('NV giao hàng', order.deliveryStaffCode||'');
  if(deliveryStaffCode===null)return;
  const note=prompt('Ghi chú', order.note||'');
  if(note===null)return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(order.id||order.code)}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({deliveryStaffCode,note})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không sửa được đơn tổng trả');
    showMessage(masterReturnOrderMessage,json.message||'Đã sửa đơn tổng trả');
    await loadMasterReturnOrders();
  }catch(err){showMessage(masterReturnOrderMessage,err.message||'Không sửa được đơn tổng trả',true)}
}
window.editMasterReturnOrder=editMasterReturnOrder;

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

async function receiveMasterReturnOrder(id, buttonEl){
  if(!id)return;
  if(!confirm('Xác nhận nhập kho toàn bộ hàng trả của đơn tổng này?\n\nSau khi xác nhận, hệ thống sẽ cộng tồn kho theo từng phiếu trả hàng con và chặn nhập kho lặp.'))return;
  const btn=buttonEl || null;
  const oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang nhập...';}
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/receive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receivedBy:'Kho'})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không nhập kho được đơn tổng trả hàng');
    showMessage(masterReturnOrderMessage,json.message||'Đã nhập kho hàng trả');
    await loadMasterReturnOrders();
    await loadUnmergedReturnOrders();
    if(typeof loadStock==='function')await loadStock();
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent=oldText||'Nhập kho';}
    showMessage(masterReturnOrderMessage,err.message||'Không nhập kho được đơn tổng trả hàng',true);
  }
}

function masterReturnItemQty(item={}){
  return Number(item.returnQty??item.qtyReturn??item.returnQuantity??item.returnedQty??item.quantity??item.qty??0)||0;
}
function masterReturnItemPrice(item={}){
  return Number(item.salePrice??item.productSalePrice??item.price??item.unitPrice??0)||0;
}
function masterReturnItemAmount(item={}){
  const direct=Number(item.returnAmount??item.amount??item.totalAmount??0)||0;
  if(direct>0)return direct;
  return masterReturnItemQty(item)*masterReturnItemPrice(item);
}
function masterReturnFirstValue(...values){
  for(const value of values){
    if(value===null||value===undefined)continue;
    if(typeof value==='string' && !value.trim())continue;
    return value;
  }
  return undefined;
}
function masterReturnNormalizeWarehouse(raw){
  const value=String(raw||'').trim().toUpperCase();
  if(!value)return '';
  if(value.includes('KHO_PC')||value.includes('KHO PC')||value==='PC'||value.includes(' PC'))return 'KHO_PC';
  if(value.includes('KHO_HC')||value.includes('KHO HC')||value==='HC'||value.includes(' HC'))return 'KHO_HC';
  if(value.includes('PC'))return 'KHO_PC';
  if(value.includes('HC'))return 'KHO_HC';
  return '';
}
function masterReturnParsePack(value){
  if(value===null||value===undefined)return 0;
  if(typeof value==='number')return Number.isFinite(value)&&value>0?value:0;
  const raw=String(value||'').trim();
  if(!raw)return 0;
  const direct=Number(raw.replace(',', '.'));
  if(Number.isFinite(direct)&&direct>0)return direct;
  const slashMatch=raw.match(/\/\s*(\d+(?:[.,]\d+)?)/);
  if(slashMatch){
    const parsed=Number(String(slashMatch[1]).replace(',', '.'));
    if(Number.isFinite(parsed)&&parsed>0)return parsed;
  }
  return 0;
}
function masterReturnItemPack(item={}){
  const productSnapshot=item.productSnapshot||item.productSnapShot||item.snapshot||{};
  const product=item.product||item.productInfo||{};
  const candidates=[
    item.packingQty,
    item.conversionRate,
    item.unitsPerCase,
    item.qtyPerCase,
    item.unitPerCase,
    productSnapshot.conversionRate,
    productSnapshot.packingQty,
    productSnapshot.unitsPerCase,
    productSnapshot.qtyPerCase,
    productSnapshot.unitPerCase,
    product.conversionRate,
    product.packingQty,
    product.unitsPerCase,
    product.qtyPerCase,
    product.unitPerCase,
    item.pack,
    productSnapshot.pack,
    product.pack,
    item.packing,
    productSnapshot.packing,
    product.packing
  ];
  for(const candidate of candidates){
    const pack=masterReturnParsePack(candidate);
    if(pack>0)return Math.max(1,Math.round(pack));
  }
  return 1;
}
function masterReturnCaseDisplay(qty, pack){
  const q=Math.max(0,Math.round(Number(qty||0)));
  const p=Math.max(1,Math.round(Number(pack||1)));
  const cases=Math.floor(q/p);
  const loose=q%p;
  return `${cases}/${loose}`;
}
function masterReturnLineAmount(item={}){
  return masterReturnItemQty(item)*masterReturnItemPrice(item);
}
function masterReturnWarehouseCode(item={}, child={}){
  const productSnapshot=item.productSnapshot||item.productSnapShot||item.snapshot||{};
  const product=item.product||item.productInfo||{};
  const candidates=[
    item.warehouseCode,
    item.defaultWarehouse,
    item.warehouse,
    item.warehouseId,
    item.stockWarehouseCode,
    productSnapshot.defaultWarehouse,
    productSnapshot.defaultWarehouseCode,
    productSnapshot.warehouseCode,
    productSnapshot.warehouse,
    productSnapshot.warehouseId,
    product.defaultWarehouse,
    product.defaultWarehouseCode,
    product.warehouseCode,
    product.warehouse,
    product.warehouseId,
    child.warehouseCode,
    child.defaultWarehouse,
    child.warehouse,
    child.warehouseId
  ];
  for(const candidate of candidates){
    const normalized=masterReturnNormalizeWarehouse(candidate);
    if(normalized)return normalized;
  }
  return 'KHO_HC';
}
function buildMasterReturnPrintPages(r={}, children=[]){
  const byWarehouse={};
  const getWarehouseMap=(warehouseCode)=>{
    if(!byWarehouse[warehouseCode])byWarehouse[warehouseCode]=new Map();
    return byWarehouse[warehouseCode];
  };
  children.forEach(child=>{
    (Array.isArray(child.items)?child.items:[]).forEach(item=>{
      const qty=masterReturnItemQty(item);
      if(qty<=0)return;
      const wh=masterReturnWarehouseCode(item,child);
      const productSnapshot=item.productSnapshot||item.productSnapShot||item.snapshot||{};
      const product=item.product||item.productInfo||{};
      const code=String(masterReturnFirstValue(item.productCode,item.code,item.sku,item.barcode,productSnapshot.productCode,productSnapshot.code,product.code,product.productCode,'')||'').trim();
      const name=String(masterReturnFirstValue(item.productName,item.name,item.description,productSnapshot.productName,productSnapshot.name,product.name,'')||'').trim();
      const pack=masterReturnItemPack(item);
      const price=masterReturnItemPrice(item);
      const normalizedPrice=Math.round(Number(price||0));
      const key=[wh,code,normalizedPrice].join('|');
      const map=getWarehouseMap(wh);
      const old=map.get(key)||{warehouseCode:wh,productCode:code,productName:name,pack,qty:0,salePrice:price,amount:0};
      old.qty+=qty;
      old.pack=old.pack||pack;
      if(!old.productName&&name)old.productName=name;
      old.salePrice=old.salePrice||price;
      old.caseDisplay=masterReturnCaseDisplay(old.qty, old.pack);
      old.amount=old.qty*old.salePrice;
      map.set(key,old);
    });
  });
  const order=['KHO_HC','KHO_PC'];
  return Object.entries(byWarehouse)
    .sort(([a],[b])=>{
      const ai=order.indexOf(a), bi=order.indexOf(b);
      if(ai!==-1||bi!==-1)return (ai===-1?99:ai)-(bi===-1?99:bi);
      return a.localeCompare(b);
    })
    .map(([warehouseCode,map])=>({
      warehouseCode,
      warehouseName:warehouseCode==='KHO_PC'?'KHO PC':warehouseCode==='KHO_HC'?'KHO HC':warehouseCode,
      items:[...map.values()].sort((a,b)=>String(a.productCode||'').localeCompare(String(b.productCode||'')))
    }))
    .filter(page=>page.items.length);
}
function buildMasterReturnKpiRows(r={}, children=[]){
  const rows=children.map(child=>{
    const saleAmount=(Array.isArray(child.items)?child.items:[]).reduce((sum,item)=>sum+(masterReturnItemQty(item)*masterReturnItemPrice(item)),0);
    const payable=Number(child.debtReduction??child.totalAmount??child.amount??0)||0;
    return {
      code: child.code||child.id||'',
      note: child.note||child.customerName||'',
      saleAmount,
      discountAmount: Math.max(0,saleAmount-payable),
      payableAmount: payable
    };
  });
  const totals=rows.reduce((acc,row)=>({
    saleAmount: acc.saleAmount+row.saleAmount,
    discountAmount: acc.discountAmount+row.discountAmount,
    payableAmount: acc.payableAmount+row.payableAmount
  }),{saleAmount:0,discountAmount:0,payableAmount:0});
  return {rows,totals};
}
async function printMasterReturnOrder(id){
  if(!id)return;
  try{
    const res=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng trả để in');
    const r=json.masterReturnOrder||{};
    const children=Array.isArray(r.children)?r.children:[];
    const pages=buildMasterReturnPrintPages(r,children);
    const kpi=buildMasterReturnKpiRows(r,children);
    const kpiRows=kpi.rows.map(row=>`<tr><td><strong>${escapeHtml(row.code)}</strong><br><small>${escapeHtml(row.note||'')}</small></td><td>${money(row.saleAmount)}</td><td>${money(row.discountAmount)}</td><td>${money(row.payableAmount)}</td></tr>`).join('');
    const kpiTable=`<h3>BÁO CÁO KPI ĐƠN TỔNG TRẢ ĐÃ GỘP</h3><table class="print-table"><thead><tr><th>Mã đơn + ghi chú</th><th>Giá trị hàng trả theo giá bán</th><th>Tổng giảm trừ/KM</th><th>Tổng giá trị giảm công nợ</th></tr></thead><tbody>${kpiRows||'<tr><td colspan="4">Không có KPI.</td></tr>'}<tr><th>Tổng cộng</th><th>${money(kpi.totals.saleAmount)}</th><th>${money(kpi.totals.discountAmount)}</th><th>${money(kpi.totals.payableAmount)}</th></tr></tbody></table>`;
    const body=(pages.length?pages:[{warehouseCode:'KHO_HC',warehouseName:'KHO HC',items:[]}]).map((page,pageIdx)=>{
      const rows=page.items.map((item,i)=>{
        const lineAmount=Number(item.qty||0)*Number(item.salePrice||0);
        return `<tr><td>${i+1}</td><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.caseDisplay||masterReturnCaseDisplay(item.qty,item.pack))}</td><td>${money(item.qty)}</td><td>${money(item.salePrice)}</td><td>${money(lineAmount)}</td></tr>`;
      }).join('');
      const pageBreak=pageIdx>0?' page-break-before':'';
      return `<section class="print-page${pageBreak}">
        <h1>ĐƠN TỔNG TRẢ HÀNG - LIÊN ${escapeHtml(page.warehouseName)}</h1>
        <p><b>Mã:</b> ${escapeHtml(r.code||r.id||'')} &nbsp; <b>Ngày trả:</b> ${escapeHtml(r.returnDate||r.date||'')} &nbsp; <b>NVGH:</b> ${escapeHtml(debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName))}</p>
        ${pageIdx===0?kpiTable:''}
        <h3>${escapeHtml(page.warehouseName)} - Hàng trả nhập kho</h3>
        <table class="print-table"><thead><tr><th>STT</th><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Thùng/Lẻ</th><th>SL lẻ</th><th>Giá bán</th><th>Tổng giá trị</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Không có hàng thuộc kho này.</td></tr>'}</tbody></table>
        <p class="total">Tổng SL: ${money(page.items.reduce((s,it)=>s+Number(it.qty||0),0))} · Tổng tiền: ${money(page.items.reduce((s,it)=>s+(Number(it.qty||0)*Number(it.salePrice||0)),0))}</p>
      </section>`;
    }).join('');
    const html=typeof buildPrintPreviewHtml==='function'
      ? buildPrintPreviewHtml(escapeHtml(r.code||'Đơn tổng trả'),'',body)
      : `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(r.code||'Đơn tổng trả')}</title><link rel="stylesheet" href="/print.css"></head><body>${body}</body></html>`;
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in');
    w.document.write(html);w.document.close();w.focus();
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


function selectedMasterReturnOrders(){
  const checks=[...document.querySelectorAll('.master-return-order-check:checked')];
  return checks.map(ch=>window.__masterReturnOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
}
function toggleSelectAllMasterReturnOrders(){
  const checks=[...document.querySelectorAll('.master-return-order-check')];
  if(!checks.length)return;
  const shouldCheck=checks.some(ch=>!ch.checked);
  checks.forEach(ch=>{ch.checked=shouldCheck;});
  if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.textContent=shouldCheck?'Bỏ chọn tất cả':'Chọn tất cả';
}
async function printSelectedMasterReturnOrders(){
  const orders=selectedMasterReturnOrders();
  if(!orders.length){alert('Chưa chọn đơn tổng trả để in');return}
  for(const r of orders){ await printMasterReturnOrder(r.id||r.code); }
}
async function receiveSelectedMasterReturnOrders(){
  const orders=selectedMasterReturnOrders();
  if(!orders.length){alert('Chưa chọn đơn tổng trả để nhập kho');return}
  if(!confirm(`Xác nhận nhập kho ${orders.length} đơn tổng trả đã chọn?\n\nSau khi xác nhận, hệ thống sẽ cộng tồn kho hàng trả và chặn nhập kho lặp.`))return;
  for(const r of orders){
    const id=r.id||r.code;
    const result=await fetch(`/api/master-return-orders/${encodeURIComponent(id)}/receive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receivedBy:'Kho'})});
    const json=await result.json();
    if(!json.ok)throw new Error(json.message||`Không nhập kho được ${r.code||id}`);
  }
  showMessage(masterReturnOrderMessage,'Đã nhập kho các đơn tổng trả đã chọn');
  await loadMasterReturnOrders();
  await loadUnmergedReturnOrders();
  if(typeof loadStock==='function')await loadStock();
}

if(returnOrderDateMode) returnOrderDateMode.addEventListener('change',()=>{
  const mode=String(returnOrderDateMode.value||'today');
  if(returnOrderDateFrom) returnOrderDateFrom.disabled=(mode==='all');
  if(returnOrderDateTo) returnOrderDateTo.disabled=(mode==='all');
  loadReturnOrders();
});
if(returnOrderDateFrom) returnOrderDateFrom.addEventListener('change',()=>{ if(returnOrderDateMode && returnOrderDateMode.value!=='range') returnOrderDateMode.value='range'; loadReturnOrders(); });
if(returnOrderDateTo) returnOrderDateTo.addEventListener('change',()=>{ if(returnOrderDateMode && returnOrderDateMode.value!=='range') returnOrderDateMode.value='range'; loadReturnOrders(); });
if(returnOrderSearchInput) returnOrderSearchInput.addEventListener('input',()=>{ clearTimeout(window.__returnOrderSearchTimer); window.__returnOrderSearchTimer=setTimeout(loadReturnOrders,250); });
if(reloadReturnOrdersButton) reloadReturnOrdersButton.addEventListener('click',loadReturnOrders);
if(returnOrderTable) returnOrderTable.addEventListener('click',event=>{ const tr=event.target.closest('tr[data-return-key]'); if(tr) selectReturnOrderByKey(tr.dataset.returnKey); });

window.toggleSelectAllMasterReturnOrders=toggleSelectAllMasterReturnOrders;
window.printSelectedMasterReturnOrders=printSelectedMasterReturnOrders;
window.receiveSelectedMasterReturnOrders=receiveSelectedMasterReturnOrders;
if(selectAllMasterReturnOrdersButton)selectAllMasterReturnOrdersButton.addEventListener('click',toggleSelectAllMasterReturnOrders);
if(printSelectedMasterReturnOrdersButton)printSelectedMasterReturnOrdersButton.addEventListener('click',printSelectedMasterReturnOrders);
if(receiveSelectedMasterReturnOrdersButton)receiveSelectedMasterReturnOrdersButton.addEventListener('click',()=>receiveSelectedMasterReturnOrders().catch(err=>showMessage(masterReturnOrderMessage,err.message,true)));

// Fund Ledger V45 - nguồn tiền chuẩn duy nhất cho thu/chi/chuyển quỹ.
let activeFundTab='fundLedger';

function fundStatusLabel(diff){
  const n=Number(diff||0);
  if(n===0)return '<span class="fund-status ok">Khớp</span>';
  if(n>0)return '<span class="fund-status warn">Thừa</span>';
  return '<span class="fund-status bad">Thiếu</span>';
}
function fundTypeName(value){return String(value)==='bank'?'Ngân hàng':'Tiền mặt'}
function directionName(value){return String(value)==='out'?'Chi':'Thu'}

async function fundReadJsonResponse(res, fallbackMessage){
  const contentType = String(res && res.headers && res.headers.get ? res.headers.get('content-type') || '' : '');
  const text = await res.text();
  if(contentType.includes('application/json')){
    try{return JSON.parse(text || '{}');}
    catch(err){throw new Error(`API trả JSON lỗi định dạng: ${err.message}`);}
  }
  const preview = String(text || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
  throw new Error(`${fallbackMessage || 'API không trả JSON'} (HTTP ${res.status}). Có thể server Render chưa deploy đúng backend/route API. ${preview ? 'Nội dung trả về: '+preview : ''}`);
}

function fundSafeCode(value){return String(value||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ')}
let fundEditing={type:'',id:''};
const fundRowCache={delivery:{},expense:{},transfer:{}};
function fundStatusText(row){
  const status=String(row&&row.status||'pending').toLowerCase();
  if(status==='confirmed')return 'confirmed';
  if(status==='matched')return 'matched';
  if(status==='mismatch')return 'mismatch';
  return status||'pending';
}
function fundCanEdit(row){
  const status=String(row&&row.status||'').toLowerCase();
  return !row.fundPosted && ['pending','draft','submitted','mismatch',''].includes(status);
}
function fundCanConfirm(row){
  const status=String(row&&row.status||'').toLowerCase();
  return !row.fundPosted && !['confirmed','cancelled','canceled','void','deleted'].includes(status);
}
function fundActionButtons(type,row){
  const code=fundSafeCode(row.code||row.id);
  const actions=[];
  if(fundCanEdit(row))actions.push(`<button type="button" class="secondary compact-action" onclick="editFundVoucher('${type}','${code}')">Sửa</button>`);
  if(fundCanConfirm(row))actions.push(`<button type="button" class="secondary compact-action" onclick="confirmFundVoucher('${type}','${code}')">Xác nhận</button>`);
  if(!actions.length)return '<span class="muted">Đã xác nhận</span>';
  return actions.join(' ');
}
function fundSetSubmitLabel(form,label){const btn=form&&form.querySelector('button[type="submit"]'); if(btn)btn.textContent=label;}
function fundResetEditing(type){
  if(!type||type==='delivery'){fundSetSubmitLabel(deliveryCashSubmissionForm,'Tạo phiếu nộp quỹ');}
  if(!type||type==='expense'){fundSetSubmitLabel(expenseVoucherForm,'Ghi phiếu chi');}
  if(!type||type==='transfer'){fundSetSubmitLabel(fundTransferForm,'Ghi chuyển quỹ');}
  if(!type||fundEditing.type===type)fundEditing={type:'',id:''};
}
function fundFillForm(form,row,keys){
  if(!form||!row)return;
  keys.forEach(k=>{if(form.elements[k])form.elements[k].value=row[k]??'';});
}

function setActiveFundTab(tab){
  activeFundTab=tab||'fundLedger';
  if(fundTabButtons)fundTabButtons.forEach(btn=>btn.classList.toggle('active',btn.dataset.fundTab===activeFundTab));
  if(fundTabPanels)fundTabPanels.forEach(panel=>panel.classList.toggle('active',panel.dataset.fundPanel===activeFundTab));
  if(activeFundTab==='fundLedger')loadFundLedger();
  if(activeFundTab==='deliverySubmission')loadDeliveryCashSubmissions();
  if(activeFundTab==='expenseVoucher')loadExpenseVouchers();
  if(activeFundTab==='bankTransfer')loadFundTransfers();
}

function buildFundLedgerParams(){
  const params=new URLSearchParams();
  const q=fundSearchInput?fundSearchInput.value.trim():'';
  if(q)params.set('q',q);
  if(fundDateFrom&&fundDateFrom.value)params.set('dateFrom',fundDateFrom.value);
  if(fundDateTo&&fundDateTo.value)params.set('dateTo',fundDateTo.value);
  if(fundTypeFilter&&fundTypeFilter.value&&fundTypeFilter.value!=='all')params.set('fundType',fundTypeFilter.value);
  if(fundDirectionFilter&&fundDirectionFilter.value&&fundDirectionFilter.value!=='all')params.set('direction',fundDirectionFilter.value);
  params.set('limit','1000');
  return params;
}

async function loadFundLedger(){
  if(!fundLedgerTable && !fundSummary)return;
  try{
    const res=await fetch(`/api/funds/ledger?${buildFundLedgerParams().toString()}`);
    const json=await fundReadJsonResponse(res,'Không tải được fundLedgers');
    if(!json.ok)throw new Error(json.message||'Không tải được fundLedgers');
    const rows=json.fundLedgers||[];
    const s=json.summary||{};
    if(fundCashBalanceKpi)fundCashBalanceKpi.textContent=money(s.cashBalance||0);
    if(fundBankBalanceKpi)fundBankBalanceKpi.textContent=money(s.bankBalance||0);
    if(fundTotalInKpi)fundTotalInKpi.textContent=money(s.totalIn||0);
    if(fundTotalOutKpi)fundTotalOutKpi.textContent=money(s.totalOut||0);
    if(fundSummary)fundSummary.textContent=`Tiền mặt: thu ${money(s.cashIn||0)} · chi ${money(s.cashOut||0)} · tồn ${money(s.cashBalance||0)} | Ngân hàng: thu ${money(s.bankIn||0)} · chi ${money(s.bankOut||0)} · tồn ${money(s.bankBalance||0)}`;
    const balances={cash:0,bank:0};
    const balanceAfter={};
    [...rows].reverse().forEach(e=>{
      const fund=String(e.fundType)==='bank'?'bank':'cash';
      const amount=Number(e.amount||0);
      balances[fund]+=String(e.direction)==='out'?-amount:amount;
      balanceAfter[e.id||e.code||`${e.date}-${e.sourceCode}-${amount}`]=balances[fund];
    });
    if(fundLedgerTable){
      fundLedgerTable.innerHTML=rows.length?rows.map(e=>{
        const isIn=String(e.direction)==='in';
        const key=e.id||e.code||`${e.date}-${e.sourceCode}-${e.amount}`;
        const staffLabel=canonicalFundStaffLabel(e)||[e.customerCode,e.customerName].filter(Boolean).join(' ');
        return `<tr><td>${escapeHtml(e.date||'')}</td><td><strong>${escapeHtml(e.code||'')}</strong></td><td>${escapeHtml(fundTypeName(e.fundType))}</td><td class="price cash-in">${isIn?money(e.amount):''}</td><td class="price cash-out">${!isIn?money(e.amount):''}</td><td class="price">${money(balanceAfter[key]||0)}</td><td>${escapeHtml(e.sourceType||e.refType||'')}</td><td>${escapeHtml(staffLabel)}</td><td>${escapeHtml(e.note||'')}</td></tr>`;
      }).join(''):'<tr><td colspan="9">Chưa có phát sinh fundLedgers.</td></tr>';
    }
  }catch(err){
    if(fundSummary)fundSummary.textContent='Lỗi tải sổ quỹ fundLedgers';
    if(fundLedgerTable)fundLedgerTable.innerHTML=`<tr><td colspan="9">${escapeHtml(err.message||'Lỗi tải fundLedgers')}</td></tr>`;
  }
}

async function loadDeliveryCashSubmissions(){
  if(!deliveryCashSubmissionTable)return;
  try{
    const params=new URLSearchParams({limit:'500'});
    const q=fundSearchInput?fundSearchInput.value.trim():''; if(q)params.set('q',q);
    const res=await fetch(`/api/funds/delivery-cash-submissions?${params.toString()}`);
    const json=await fundReadJsonResponse(res,'Không tải được phiếu nộp quỹ');
    if(!json.ok)throw new Error(json.message||'Không tải được phiếu nộp quỹ');
    const rows=json.submissions||[];
    deliveryCashSubmissionTable.innerHTML=rows.length?rows.map(r=>{
      const diff=Number(r.differenceCashAmount||0);
      const key=String(r.code||r.id||''); fundRowCache.delivery[key]=r;
      return `<tr><td><strong>${escapeHtml(r.code||'')}</strong></td><td>${escapeHtml(r.deliveryDate||'')}</td><td>${escapeHtml(((r.deliveryStaffCode||'')+' '+(r.deliveryStaffName||'')).trim())}</td><td class="price">${money(r.reportCashAmount||0)}</td><td class="price">${money(r.submittedCashAmount||0)}</td><td class="price ${diff===0?'cash-in':'cash-out'}">${diff>0?'+':''}${money(diff)}</td><td>${fundStatusLabel(diff)} ${escapeHtml(fundStatusText(r))}</td><td>${fundActionButtons('delivery',r)}</td></tr>`;
    }).join(''):'<tr><td colspan="8">Chưa có phiếu nộp quỹ giao hàng.</td></tr>';
  }catch(err){
    deliveryCashSubmissionTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||'Lỗi tải phiếu nộp quỹ')}</td></tr>`;
  }
}

async function loadExpenseVouchers(){
  if(!expenseVoucherTable)return;
  try{
    const params=new URLSearchParams({limit:'500'});
    const q=fundSearchInput?fundSearchInput.value.trim():''; if(q)params.set('q',q);
    const res=await fetch(`/api/funds/expenses?${params.toString()}`);
    const json=await fundReadJsonResponse(res,'Không tải được phiếu chi');
    if(!json.ok)throw new Error(json.message||'Không tải được phiếu chi');
    const rows=json.vouchers||[];
    expenseVoucherTable.innerHTML=rows.length?rows.map(r=>{const key=String(r.code||r.id||''); fundRowCache.expense[key]=r; return `<tr><td><strong>${escapeHtml(r.code||'')}</strong></td><td>${escapeHtml(r.date||'')}</td><td>${escapeHtml(fundTypeName(r.fundType))}</td><td>${escapeHtml(r.expenseType||'')}</td><td>${escapeHtml(r.receiverName||'')}</td><td class="price cash-out">${money(r.amount||0)}</td><td>${escapeHtml(fundStatusText(r))}</td><td>${fundActionButtons('expense',r)}</td></tr>`;}).join(''):'<tr><td colspan="8">Chưa có phiếu chi.</td></tr>';
  }catch(err){
    expenseVoucherTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||'Lỗi tải phiếu chi')}</td></tr>`;
  }
}

async function loadFundTransfers(){
  if(!fundTransferTable)return;
  try{
    const params=new URLSearchParams({limit:'500'});
    const q=fundSearchInput?fundSearchInput.value.trim():''; if(q)params.set('q',q);
    const res=await fetch(`/api/funds/transfers?${params.toString()}`);
    const json=await fundReadJsonResponse(res,'Không tải được phiếu chuyển quỹ');
    if(!json.ok)throw new Error(json.message||'Không tải được phiếu chuyển quỹ');
    const rows=json.transfers||[];
    fundTransferTable.innerHTML=rows.length?rows.map(r=>{const key=String(r.code||r.id||''); fundRowCache.transfer[key]=r; return `<tr><td><strong>${escapeHtml(r.code||'')}</strong></td><td>${escapeHtml(r.date||'')}</td><td>${escapeHtml(fundTypeName(r.fromFund))}</td><td>${escapeHtml(fundTypeName(r.toFund))}</td><td>${escapeHtml(r.bankName||'')}</td><td class="price">${money(r.amount||0)}</td><td>${escapeHtml(fundStatusText(r))}</td><td>${fundActionButtons('transfer',r)}</td></tr>`;}).join(''):'<tr><td colspan="8">Chưa có phiếu chuyển quỹ.</td></tr>';
  }catch(err){
    fundTransferTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||'Lỗi tải phiếu chuyển quỹ')}</td></tr>`;
  }
}

async function submitDeliveryCashSubmission(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(deliveryCashSubmissionForm).entries());
  ['submittedCashAmount','submittedBankAmount'].forEach(k=>{ if(payload[k]!==''&&payload[k]!=null)payload[k]=Number(payload[k]||0); else delete payload[k]; });
  try{
    const editing=fundEditing.type==='delivery'&&fundEditing.id;
    const url=editing?`/api/funds/delivery-cash-submissions/${encodeURIComponent(fundEditing.id)}`:'/api/funds/delivery-cash-submissions';
    const res=await fetch(url,{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await fundReadJsonResponse(res,editing?'Không cập nhật được phiếu nộp quỹ':'Không tạo được phiếu nộp quỹ');
    if(!json.ok)throw new Error(json.message||'Không lưu được phiếu nộp quỹ');
    fundResetEditing('delivery');
    showMessage(deliveryCashSubmissionMessage,json.message||'Đã lưu phiếu nộp quỹ');
    await loadDeliveryCashSubmissions();
    await loadFundLedger();
  }catch(err){showMessage(deliveryCashSubmissionMessage,err.message,true)}
}

async function confirmDeliveryCashSubmission(code){
  if(!code)return;
  if(!confirm(`Xác nhận phiếu nộp quỹ ${code} và ghi vào fundLedgers?`))return;
  try{
    const res=await fetch(`/api/funds/delivery-cash-submissions/${encodeURIComponent(code)}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const json=await fundReadJsonResponse(res,'Không xác nhận được phiếu nộp quỹ');
    if(!json.ok)throw new Error(json.message||'Không xác nhận được phiếu nộp quỹ');
    await loadDeliveryCashSubmissions();
    await loadFundLedger();
    alert(json.message||'Đã ghi sổ quỹ');
  }catch(err){alert(err.message||'Không xác nhận được phiếu nộp quỹ')}
}
window.confirmDeliveryCashSubmission=confirmDeliveryCashSubmission;

function editFundVoucher(type,code){
  const row=(fundRowCache[type]||{})[code];
  if(!row){alert('Không tìm thấy dữ liệu phiếu để sửa');return;}
  if(!fundCanEdit(row)){alert('Phiếu đã xác nhận hoặc đã khóa, không được sửa');return;}
  fundEditing={type,id:code};
  if(type==='delivery'){
    fundFillForm(deliveryCashSubmissionForm,row,['deliveryDate','deliveryStaffCode','submittedCashAmount','submittedBankAmount','note']);
    fundSetSubmitLabel(deliveryCashSubmissionForm,'Cập nhật phiếu nộp quỹ');
  }else if(type==='expense'){
    fundFillForm(expenseVoucherForm,row,['date','fundType','expenseType','amount','receiverName','note']);
    fundSetSubmitLabel(expenseVoucherForm,'Cập nhật phiếu chi');
  }else if(type==='transfer'){
    fundFillForm(fundTransferForm,row,['date','fromFund','toFund','amount','bankName','note']);
    fundSetSubmitLabel(fundTransferForm,'Cập nhật chuyển quỹ');
  }
}
window.editFundVoucher=editFundVoucher;

async function confirmFundVoucher(type,code){
  if(type==='delivery')return confirmDeliveryCashSubmission(code);
  const label=type==='expense'?'phiếu chi':'phiếu chuyển quỹ';
  const base=type==='expense'?'/api/funds/expenses':'/api/funds/transfers';
  if(!code)return;
  if(!confirm(`Xác nhận ${label} ${code} và ghi vào fundLedgers?`))return;
  try{
    const res=await fetch(`${base}/${encodeURIComponent(code)}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const json=await fundReadJsonResponse(res,`Không xác nhận được ${label}`);
    if(!json.ok)throw new Error(json.message||`Không xác nhận được ${label}`);
    await loadExpenseVouchers();
    await loadFundTransfers();
    await loadFundLedger();
    alert(json.message||'Đã xác nhận và ghi sổ quỹ');
  }catch(err){alert(err.message||`Không xác nhận được ${label}`)}
}
window.confirmFundVoucher=confirmFundVoucher;

async function submitExpenseVoucher(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(expenseVoucherForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const editing=fundEditing.type==='expense'&&fundEditing.id;
    const url=editing?`/api/funds/expenses/${encodeURIComponent(fundEditing.id)}`:'/api/funds/expenses';
    const res=await fetch(url,{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await fundReadJsonResponse(res,editing?'Không cập nhật được phiếu chi':'Không ghi được phiếu chi'); if(!json.ok)throw new Error(json.message||'Không lưu được phiếu chi');
    expenseVoucherForm.reset(); if(expenseVoucherForm.elements.date)expenseVoucherForm.elements.date.value=today();
    fundResetEditing('expense');
    showMessage(expenseVoucherMessage,json.message||'Đã lưu phiếu chi');
    await loadExpenseVouchers();
    await loadFundLedger();
  }catch(err){showMessage(expenseVoucherMessage,err.message,true)}
}

async function submitFundTransfer(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(fundTransferForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const editing=fundEditing.type==='transfer'&&fundEditing.id;
    const url=editing?`/api/funds/transfers/${encodeURIComponent(fundEditing.id)}`:'/api/funds/transfers';
    const res=await fetch(url,{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await fundReadJsonResponse(res,editing?'Không cập nhật được chuyển quỹ':'Không ghi được chuyển quỹ'); if(!json.ok)throw new Error(json.message||'Không lưu được chuyển quỹ');
    fundTransferForm.reset(); if(fundTransferForm.elements.date)fundTransferForm.elements.date.value=today();
    fundResetEditing('transfer');
    showMessage(fundTransferMessage,json.message||'Đã lưu chuyển quỹ');
    await loadFundTransfers();
    await loadFundLedger();
  }catch(err){showMessage(fundTransferMessage,err.message,true)}
}

function reloadActiveFundTab(){
  if(activeFundTab==='fundLedger')loadFundLedger();
  else if(activeFundTab==='deliverySubmission')loadDeliveryCashSubmissions();
  else if(activeFundTab==='expenseVoucher')loadExpenseVouchers();
  else if(activeFundTab==='bankTransfer')loadFundTransfers();
}
if(fundTabButtons)fundTabButtons.forEach(btn=>btn.addEventListener('click',()=>setActiveFundTab(btn.dataset.fundTab)));
if(reloadFundLedgerButton)reloadFundLedgerButton.addEventListener('click',()=>{loadFundLedger();loadDeliveryCashSubmissions();loadExpenseVouchers();loadFundTransfers();});
if(fundSearchInput)fundSearchInput.addEventListener('input',debounce(reloadActiveFundTab,300));
[fundDateFrom,fundDateTo,fundTypeFilter,fundDirectionFilter].forEach(el=>{if(el)el.addEventListener('change',loadFundLedger)});
if(deliveryCashSubmissionForm)deliveryCashSubmissionForm.addEventListener('submit',submitDeliveryCashSubmission);
if(expenseVoucherForm)expenseVoucherForm.addEventListener('submit',submitExpenseVoucher);
if(fundTransferForm)fundTransferForm.addEventListener('submit',submitFundTransfer);
[deliveryCashSubmissionForm, expenseVoucherForm, fundTransferForm].forEach(form=>{ if(form&&form.elements.date)form.elements.date.value=today(); if(form&&form.elements.deliveryDate)form.elements.deliveryDate.value=today(); });
loadFundLedger();
