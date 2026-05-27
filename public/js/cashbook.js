// Debt collection
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSelect)return;
  const debtCustomers=debtsCache.filter(d=>d.debt>0);
  if(!debtCustomers.length){collectionCustomerSelect.innerHTML='<option value="">Không có khách đang nợ</option>';selectedCustomerDebt.textContent='0';return}
  collectionCustomerSelect.innerHTML=debtCustomers.map(d=>`<option value="${d.customerId}" data-debt="${d.debt}">${d.customerCode} - ${d.customerName} | Nợ: ${money(d.debt)}</option>`).join('');
  updateSelectedCustomerDebt();
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  const selected=collectionCustomerSelect.options[collectionCustomerSelect.selectedIndex];
  selectedCustomerDebt.textContent=selected?money(selected.dataset.debt||0):'0';
}
async function submitDebtCollection(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(debtCollectionForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const res=await fetch('/api/debt-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không thu được công nợ');
    debtCollectionForm.reset();debtCollectionForm.elements.date.value=today();showMessage(collectionMessage,json.message||'Đã thu công nợ');
    await loadDebts();await loadCashbook();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}

// Cashbook
async function loadCashbook(){
  const q=cashbookSearchInput?cashbookSearchInput.value.trim():'';const url=q?`/api/cashbook?q=${encodeURIComponent(q)}`:'/api/cashbook';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sổ quỹ');
    const entries=json.cashbook||[];const s=json.summary||{cashIn:0,cashOut:0,balance:0};
    cashSummary.textContent=`Tổng thu: ${money(s.cashIn)} · Tổng chi: ${money(s.cashOut)} · Tồn quỹ: ${money(s.balance)}`;
    if(!entries.length){cashbookTable.innerHTML='<tr><td colspan="8">Chưa có phát sinh quỹ.</td></tr>';return}
    cashbookTable.innerHTML=entries.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join('');
  }catch(err){cashSummary.textContent='Lỗi tải sổ quỹ';cashbookTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`}
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

