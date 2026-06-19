'use strict';

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
  }catch(err){if(receiptHistoryTable)receiptHistoryTable.innerHTML=`<tr><td colspan="9">${escapeHtml(err.message)}</td></tr>`;if(receiptTimeline)receiptTimeline.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;if(arLedgerSummary)arLedgerSummary.textContent='Lỗi tải AR Ledger'}
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




// PHASE35_AR_CASHBOOK_EVENT_OWNERSHIP_START
if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);if(cashbookForm.elements.date)cashbookForm.elements.date.value=today();}
if(receiptSearchInput)receiptSearchInput.addEventListener('input',debounce(loadReceipts,250));
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',debounce(loadCashbook,250));
// PHASE35_AR_CASHBOOK_EVENT_OWNERSHIP_END
