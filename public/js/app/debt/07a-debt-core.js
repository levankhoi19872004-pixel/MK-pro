'use strict';

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
let debtLoadPromise=null;
function setDebtToolbarLoading(isLoading){
  [applyDebtFiltersButton,debtClearFiltersButton,reloadDebtsButton].forEach(button=>{
    if(!button)return;
    button.disabled=isLoading;
    if(isLoading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
}
async function loadDebts(){
  const criteria=getDebtSearchCriteria();
  if(!hasDebtSearchCriteria(criteria)){
    clearDebtSearchResultState();
    return;
  }
  if(debtLoadPromise)return debtLoadPromise;
  setDebtToolbarLoading(true);
  debtLoadPromise=(async()=>{
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
          return `<article class="debt-v2-customer-card" data-debt-index="${idx}" tabindex="0" role="button">
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
    }finally{
      setDebtToolbarLoading(false);
      debtLoadPromise=null;
    }
  })();
  return debtLoadPromise;
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
      rows.push({salesOrderId:order.orderId||'',salesOrderCode:order.orderCode||'',allocatedAmount:applied});
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
  const selectedCustomer=getSelectedDebtCustomer();
  payload.customerId=selectedCustomer?.customerId || payload.customerId || '';
  payload.customerCode=selectedCustomer?.customerCode || payload.customerCode || payload.customerId || '';
  payload.customerName=selectedCustomer?.customerName || payload.customerName || '';
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
    showMessage(collectionMessage,json.message||'Đã ghi nhận thu nợ, chờ kế toán xác nhận');
    await loadDebts();if(typeof loadDebtCollections==='function')await loadDebtCollections();
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


function setExternalDebtField(element, value){
  if(element)element.value=String(value||'').trim();
}

function setExternalDebtCustomerDefaults(item={}){
  const customerCode=item.customerCode||item.code||'';
  const customerName=item.customerName||item.name||'';
  const salesCode=item.salesStaffCode||item.salesmanCode||item.nvbhCode||item.staffCode||'';
  const salesName=item.salesStaffName||item.salesmanName||item.nvbhName||item.staffName||'';
  const deliveryCode=item.deliveryStaffCode||item.deliveryCode||item.nvghCode||'';
  const deliveryName=item.deliveryStaffName||item.deliveryName||item.nvghName||'';

  setExternalDebtField(externalDebtCustomerId,item.id||item._id||customerCode);
  setExternalDebtField(externalDebtCustomerCode,customerCode);
  setExternalDebtField(externalDebtCustomerName,customerName);

  if(salesCode){
    setExternalDebtField(externalDebtSalesStaffCode,salesCode);
    setExternalDebtField(externalDebtSalesStaffName,salesName);
    setExternalDebtField(externalDebtSalesStaffSearch,[salesCode,salesName].filter(Boolean).join(' - '));
  }
  if(deliveryCode){
    setExternalDebtField(externalDebtDeliveryStaffCode,deliveryCode);
    setExternalDebtField(externalDebtDeliveryStaffName,deliveryName);
    setExternalDebtField(externalDebtDeliveryStaffSearch,[deliveryCode,deliveryName].filter(Boolean).join(' - '));
  }
}
window.setExternalDebtCustomerDefaults=setExternalDebtCustomerDefaults;

function resetExternalDebtForm(){
  if(!externalDebtForm)return;
  externalDebtForm.reset();
  [externalDebtCustomerId,externalDebtCustomerCode,externalDebtCustomerName,
    externalDebtSalesStaffCode,externalDebtSalesStaffName,
    externalDebtDeliveryStaffCode,externalDebtDeliveryStaffName].forEach(function(input){if(input)input.value=''});
  if(externalDebtDocumentDate)externalDebtDocumentDate.value=today();
  if(externalDebtMessage)externalDebtMessage.textContent='';
  if(externalDebtForm)delete externalDebtForm.dataset.idempotencyKey;
}

function openExternalDebtModal(){
  if(!externalDebtModal)return;
  resetExternalDebtForm();
  externalDebtModal.classList.add('show');
  externalDebtModal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  setTimeout(function(){if(externalDebtCustomerSearch)externalDebtCustomerSearch.focus()},20);
}

function closeExternalDebtModal(){
  if(!externalDebtModal)return;
  externalDebtModal.classList.remove('show');
  externalDebtModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}

function clearExternalDebtSelectionOnTyping(input, hiddenFields=[]){
  if(!input)return;
  input.addEventListener('input',function(){
    const selectedLabel=String(input.dataset.selectedLabel||'');
    if(selectedLabel&&input.value===selectedLabel)return;
    hiddenFields.forEach(function(field){if(field)field.value=''});
  });
}

async function submitExternalDebtOrder(event){
  event.preventDefault();
  const customerCode=String(externalDebtCustomerCode?.value||'').trim();
  const salesStaffCode=String(externalDebtSalesStaffCode?.value||'').trim();
  const deliveryStaffCode=String(externalDebtDeliveryStaffCode?.value||'').trim();
  const amount=parseDebtMoneyInput(externalDebtAmount?.value||'');
  const documentDate=String(externalDebtDocumentDate?.value||'').trim();
  const dueDate=String(externalDebtDueDate?.value||'').trim();
  const referenceCode=String(externalDebtReferenceCode?.value||'').trim();
  const reason=String(externalDebtReason?.value||'').trim();

  if(!customerCode){showMessage(externalDebtMessage,'Cần chọn khách hàng từ danh sách gợi ý.',true);return}
  if(!salesStaffCode){showMessage(externalDebtMessage,'Cần chọn nhân viên bán hàng phụ trách.',true);return}
  if(!deliveryStaffCode){showMessage(externalDebtMessage,'Cần chọn nhân viên giao hàng phụ trách.',true);return}
  if(amount<=0){showMessage(externalDebtMessage,'Số tiền công nợ phải lớn hơn 0.',true);return}
  if(!documentDate){showMessage(externalDebtMessage,'Cần chọn ngày ghi nhận.',true);return}
  if(!reason){showMessage(externalDebtMessage,'Cần nhập lý do tạo công nợ.',true);return}

  const idempotencySeed=(referenceCode||documentDate||'manual').replace(/[^a-zA-Z0-9_-]+/g,'').slice(0,60);
  if(!externalDebtForm.dataset.idempotencyKey){
    externalDebtForm.dataset.idempotencyKey=`external-debt-${customerCode}-${idempotencySeed}-${Date.now()}`;
  }
  const payload={
    customerCode,
    salesStaffCode,
    deliveryStaffCode,
    amount,
    documentDate,
    dueDate,
    referenceCode,
    reason,
    idempotencyKey:externalDebtForm.dataset.idempotencyKey
  };

  try{
    showMessage(externalDebtMessage,'Đang tạo công nợ ngoài luồng...');
    const res=await fetch('/api/external-debt-orders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tạo được công nợ ngoài luồng');
    showMessage(externalDebtMessage,json.message||'Đã tạo công nợ ngoài luồng');
    if(debtSearchInput)debtSearchInput.value=customerCode;
    await loadDebts();
    setTimeout(function(){closeExternalDebtModal();resetExternalDebtForm()},500);
  }catch(err){showMessage(externalDebtMessage,err.message||'Không tạo được công nợ ngoài luồng',true)}
}

if(openExternalDebtModalButton)openExternalDebtModalButton.addEventListener('click',openExternalDebtModal);
if(closeExternalDebtModalButton)closeExternalDebtModalButton.addEventListener('click',closeExternalDebtModal);
if(resetExternalDebtFormButton)resetExternalDebtFormButton.addEventListener('click',resetExternalDebtForm);
if(reloadDebtsButton)reloadDebtsButton.addEventListener('click',loadDebts);
if(externalDebtForm)externalDebtForm.addEventListener('submit',submitExternalDebtOrder);
if(externalDebtModal)externalDebtModal.addEventListener('click',function(event){if(event.target===externalDebtModal)closeExternalDebtModal()});
if(externalDebtAmount)externalDebtAmount.addEventListener('blur',function(){const value=parseDebtMoneyInput(externalDebtAmount.value);externalDebtAmount.value=value>0?money(value):''});
clearExternalDebtSelectionOnTyping(externalDebtCustomerSearch,[externalDebtCustomerId,externalDebtCustomerCode,externalDebtCustomerName]);
clearExternalDebtSelectionOnTyping(externalDebtSalesStaffSearch,[externalDebtSalesStaffCode,externalDebtSalesStaffName]);
clearExternalDebtSelectionOnTyping(externalDebtDeliveryStaffSearch,[externalDebtDeliveryStaffCode,externalDebtDeliveryStaffName]);
if(externalDebtDocumentDate&&!externalDebtDocumentDate.value)externalDebtDocumentDate.value=today();

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



// PHASE35_DEBT_EVENT_OWNERSHIP_START
if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);if(debtCollectionForm.elements.date)debtCollectionForm.elements.date.value=today();}
if(debtPaymentAmount)debtPaymentAmount.addEventListener('input',updateDebtSelectionSummary);
if(clearDebtCustomerButton)clearDebtCustomerButton.addEventListener('click',clearDebtCustomerSelection);
if(typeof resetDebtFilters==='function')resetDebtFilters({load:false});
if(applyDebtFiltersButton)applyDebtFiltersButton.addEventListener('click',loadDebts);
[debtSearchInput,debtSalesmanFilter,debtDeliveryFilter].forEach(input=>{
  if(input)input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadDebts();}});
});
if(debtClearFiltersButton)debtClearFiltersButton.addEventListener('click',()=>resetDebtFilters());
debtInnerTabs.forEach(btn=>btn.addEventListener('click',()=>setDebtPanel(btn.dataset.debtPanel)));
window.voidReceipt=voidReceipt;
// PHASE35_DEBT_EVENT_OWNERSHIP_END

if(debtCardList&&!debtCardList.dataset.securityDelegationBound){
  debtCardList.dataset.securityDelegationBound='1';
  const activateDebtCard=event=>{
    const card=event.target.closest('.debt-v2-customer-card[data-debt-index]');
    if(!card||!debtCardList.contains(card))return;
    if(event.type==='keydown'&&event.key!=='Enter'&&event.key!==' ')return;
    if(event.type==='keydown')event.preventDefault();
    selectDebtCustomerFromCard(Number(card.dataset.debtIndex));
  };
  debtCardList.addEventListener('click',activateDebtCard);
  debtCardList.addEventListener('keydown',activateDebtCard);
}
