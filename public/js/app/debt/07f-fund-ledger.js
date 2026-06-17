'use strict';

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

let activeFundVoucherModalType='';
function fundVoucherUi(type){
  if(type==='delivery')return {
    modal:deliveryCashSubmissionModal,
    form:deliveryCashSubmissionForm,
    message:deliveryCashSubmissionMessage,
    title:document.getElementById('deliveryCashSubmissionModalTitle'),
    createTitle:'Tạo phiếu nộp quỹ giao hàng',
    editTitle:'Sửa phiếu nộp quỹ giao hàng',
    dateField:'deliveryDate'
  };
  if(type==='expense')return {
    modal:expenseVoucherModal,
    form:expenseVoucherForm,
    message:expenseVoucherMessage,
    title:document.getElementById('expenseVoucherModalTitle'),
    createTitle:'Tạo phiếu chi',
    editTitle:'Sửa phiếu chi',
    dateField:'date'
  };
  if(type==='transfer')return {
    modal:fundTransferModal,
    form:fundTransferForm,
    message:fundTransferMessage,
    title:document.getElementById('fundTransferModalTitle'),
    createTitle:'Tạo phiếu nộp ngân hàng',
    editTitle:'Sửa phiếu nộp ngân hàng',
    dateField:'date'
  };
  return null;
}
function fundResetVoucherForm(type){
  const ui=fundVoucherUi(type);
  if(!ui||!ui.form)return;
  ui.form.reset();
  if(ui.form.elements[ui.dateField])ui.form.elements[ui.dateField].value=today();
  if(ui.message)showMessage(ui.message,'');
  fundResetEditing(type);
  if(type==='delivery')clearDeliveryCashSubmissionPreview();
}
function openFundVoucherModal(type,{reset=false}={}){
  const ui=fundVoucherUi(type);
  if(!ui||!ui.modal)return;
  if(reset)fundResetVoucherForm(type);
  if(ui.title)ui.title.textContent=fundEditing.type===type?ui.editTitle:ui.createTitle;
  activeFundVoucherModalType=type;
  ui.modal.classList.add('show');
  ui.modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  const firstField=ui.form&&ui.form.querySelector('input, select, textarea');
  if(firstField)window.requestAnimationFrame(()=>firstField.focus());
  if(type==='delivery')scheduleDeliveryCashSubmissionPreview({syncSubmitted:fundEditing.type!=='delivery',immediate:true});
}
function closeFundVoucherModal(type=activeFundVoucherModalType,{reset=true}={}){
  const ui=fundVoucherUi(type);
  if(!ui||!ui.modal)return;
  ui.modal.classList.remove('show');
  ui.modal.setAttribute('aria-hidden','true');
  if(reset)fundResetVoucherForm(type);
  if(activeFundVoucherModalType===type)activeFundVoucherModalType='';
  const hasOpenModal=document.querySelector('.modal-backdrop.show');
  if(!hasOpenModal)document.body.classList.remove('modal-open');
}
function bindFundVoucherModal(type,openButton,closeButton){
  const ui=fundVoucherUi(type);
  if(openButton)openButton.addEventListener('click',()=>openFundVoucherModal(type,{reset:true}));
  if(closeButton)closeButton.addEventListener('click',()=>closeFundVoucherModal(type));
  if(ui&&ui.modal)ui.modal.addEventListener('click',event=>{if(event.target===ui.modal)closeFundVoucherModal(type);});
}

let deliveryCashPreviewTimer=null;
let deliveryCashPreviewRequestSeq=0;
let deliveryCashPreviewAbortController=null;
let deliveryCashPreviewDraft=null;

function setDeliveryCashSubmissionPreviewStatus(message,{loading=false,error=false}={}){
  if(deliveryCashSubmissionPreview)deliveryCashSubmissionPreview.setAttribute('aria-busy',loading?'true':'false');
  if(deliveryCashSubmissionPreviewStatus){
    deliveryCashSubmissionPreviewStatus.hidden=false;
    deliveryCashSubmissionPreviewStatus.textContent=message||'';
    deliveryCashSubmissionPreviewStatus.classList.toggle('is-loading',loading);
    deliveryCashSubmissionPreviewStatus.classList.toggle('is-error',error);
  }
  if(deliveryCashSubmissionPreviewContent)deliveryCashSubmissionPreviewContent.hidden=true;
}

function clearDeliveryCashSubmissionPreview(){
  deliveryCashPreviewRequestSeq+=1;
  deliveryCashPreviewDraft=null;
  if(deliveryCashPreviewTimer){clearTimeout(deliveryCashPreviewTimer);deliveryCashPreviewTimer=null;}
  if(deliveryCashPreviewAbortController){deliveryCashPreviewAbortController.abort();deliveryCashPreviewAbortController=null;}
  if(fundEditing.type!=='delivery'){
    if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value='';
    if(deliveryCashSubmissionBankInput)deliveryCashSubmissionBankInput.value='';
  }
  setDeliveryCashSubmissionPreviewStatus('Chọn ngày giao và nhập mã NV giao hàng để xem tiền cần thu.');
  if(deliveryCashSubmissionPreviewTable)deliveryCashSubmissionPreviewTable.innerHTML='<tr><td colspan="5">Chưa có dữ liệu.</td></tr>';
  [deliveryCashSubmissionReportCash,deliveryCashSubmissionReportBank,deliveryCashSubmissionReportTotal,deliveryCashSubmissionInputDifference,deliveryCashSubmissionPreviewCashTotal,deliveryCashSubmissionPreviewBankTotal,deliveryCashSubmissionPreviewGrandTotal].forEach(el=>{if(el)el.textContent='0';});
  if(deliveryCashSubmissionInputDifference){
    deliveryCashSubmissionInputDifference.removeAttribute('title');
    deliveryCashSubmissionInputDifference.classList.remove('is-positive','is-negative','is-matched');
  }
}

function deliveryCashSubmissionSelectedFilters(){
  return {
    deliveryDate:String(deliveryCashSubmissionDate&&deliveryCashSubmissionDate.value||'').trim(),
    deliveryStaffCode:String(deliveryCashSubmissionStaffCode&&deliveryCashSubmissionStaffCode.value||'').trim()
  };
}

function deliveryCashSubmissionOrderMoney(order,keyList){
  for(const key of keyList){
    const value=Number(order&&order[key]||0);
    if(Number.isFinite(value)&&value>0)return Math.round(value);
  }
  return 0;
}

function updateDeliveryCashSubmissionDifference(){
  const draft=deliveryCashPreviewDraft;
  if(!draft||!deliveryCashSubmissionInputDifference)return;
  const reportCash=Number(draft.reportCashAmount||0);
  const reportBank=Number(draft.reportBankAmount||0);
  const submittedCash=deliveryCashSubmissionCashInput&&deliveryCashSubmissionCashInput.value!==''?Number(deliveryCashSubmissionCashInput.value||0):reportCash;
  const submittedBank=deliveryCashSubmissionBankInput&&deliveryCashSubmissionBankInput.value!==''?Number(deliveryCashSubmissionBankInput.value||0):reportBank;
  const cashDifference=Math.round(submittedCash-reportCash);
  const bankDifference=Math.round(submittedBank-reportBank);
  const difference=cashDifference+bankDifference;
  const signed=value=>`${value>0?'+':''}${money(value)}`;
  deliveryCashSubmissionInputDifference.textContent=`TM ${signed(cashDifference)} · TK ${signed(bankDifference)}`;
  deliveryCashSubmissionInputDifference.title=`Tổng chênh: ${signed(difference)}`;
  deliveryCashSubmissionInputDifference.classList.toggle('is-positive',cashDifference>0||bankDifference>0);
  deliveryCashSubmissionInputDifference.classList.toggle('is-negative',cashDifference<0||bankDifference<0);
  deliveryCashSubmissionInputDifference.classList.toggle('is-matched',cashDifference===0&&bankDifference===0);
}

function renderDeliveryCashSubmissionPreview(payload={}){
  const draft=payload.draft||{};
  const orders=Array.isArray(payload.orders)?payload.orders:[];
  deliveryCashPreviewDraft=draft;
  const reportCash=Math.round(Number(draft.reportCashAmount||0));
  const reportBank=Math.round(Number(draft.reportBankAmount||0));
  const reportTotal=reportCash+reportBank;
  if(deliveryCashSubmissionPreviewStatus)deliveryCashSubmissionPreviewStatus.hidden=true;
  if(deliveryCashSubmissionPreviewContent)deliveryCashSubmissionPreviewContent.hidden=false;
  if(deliveryCashSubmissionPreview)deliveryCashSubmissionPreview.setAttribute('aria-busy','false');
  if(deliveryCashSubmissionPreviewStaff)deliveryCashSubmissionPreviewStaff.textContent=`${draft.deliveryStaffCode||''}${draft.deliveryStaffName&&draft.deliveryStaffName!==draft.deliveryStaffCode?' · '+draft.deliveryStaffName:''}`;
  if(deliveryCashSubmissionPreviewDate)deliveryCashSubmissionPreviewDate.textContent=draft.deliveryDate?`Ngày giao ${draft.deliveryDate}`:'';
  if(deliveryCashSubmissionPreviewOrderCount)deliveryCashSubmissionPreviewOrderCount.textContent=`${orders.length} đơn`;
  if(deliveryCashSubmissionReportCash)deliveryCashSubmissionReportCash.textContent=money(reportCash);
  if(deliveryCashSubmissionReportBank)deliveryCashSubmissionReportBank.textContent=money(reportBank);
  if(deliveryCashSubmissionReportTotal)deliveryCashSubmissionReportTotal.textContent=money(reportTotal);
  if(deliveryCashSubmissionPreviewCashTotal)deliveryCashSubmissionPreviewCashTotal.textContent=money(reportCash);
  if(deliveryCashSubmissionPreviewBankTotal)deliveryCashSubmissionPreviewBankTotal.textContent=money(reportBank);
  if(deliveryCashSubmissionPreviewGrandTotal)deliveryCashSubmissionPreviewGrandTotal.textContent=money(reportTotal);

  if(deliveryCashSubmissionPreviewTable){
    const rows=orders.map(order=>{
      const cash=deliveryCashSubmissionOrderMoney(order,['cashAmount','cashCollected']);
      const bank=deliveryCashSubmissionOrderMoney(order,['bankAmount','bankCollected','transferAmount']);
      const customer=[order.customerCode,order.customerName].filter(Boolean).join(' · ');
      return `<tr><td><strong>${escapeHtml(order.orderCode||order.code||'')}</strong></td><td>${escapeHtml(customer||'')}</td><td class="price">${money(cash)}</td><td class="price">${money(bank)}</td><td class="price">${money(cash+bank)}</td></tr>`;
    });
    const oldDebtCash=Math.round(Number(draft.reportOldDebtCashAmount||0));
    const oldDebtBank=Math.round(Number(draft.reportOldDebtBankAmount||0));
    if(oldDebtCash>0||oldDebtBank>0){
      rows.push(`<tr class="delivery-cash-preview-extra"><td><strong>THU NỢ CŨ</strong></td><td>Khoản thu nợ được ghi nhận trong ngày</td><td class="price">${money(oldDebtCash)}</td><td class="price">${money(oldDebtBank)}</td><td class="price">${money(oldDebtCash+oldDebtBank)}</td></tr>`);
    }
    deliveryCashSubmissionPreviewTable.innerHTML=rows.length?rows.join(''):'<tr><td colspan="5">Không có khoản tiền mặt hoặc tài khoản cần thu.</td></tr>';
  }
  updateDeliveryCashSubmissionDifference();
}

async function loadDeliveryCashSubmissionPreview({syncSubmitted=true}={}){
  const filters=deliveryCashSubmissionSelectedFilters();
  if(!filters.deliveryDate||!filters.deliveryStaffCode){
    clearDeliveryCashSubmissionPreview();
    return;
  }
  const requestSeq=++deliveryCashPreviewRequestSeq;
  deliveryCashPreviewDraft=null;
  if(syncSubmitted){
    if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value='';
    if(deliveryCashSubmissionBankInput)deliveryCashSubmissionBankInput.value='';
  }
  if(deliveryCashPreviewAbortController)deliveryCashPreviewAbortController.abort();
  deliveryCashPreviewAbortController=typeof AbortController!=='undefined'?new AbortController():null;
  setDeliveryCashSubmissionPreviewStatus('Đang tải tiền mặt và tài khoản cần thu theo ngày giao và NVGH...',{loading:true});
  try{
    const res=await fetch('/api/funds/delivery-cash-submissions/preview',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(filters),
      ...(deliveryCashPreviewAbortController?{signal:deliveryCashPreviewAbortController.signal}:{})
    });
    const json=await fundReadJsonResponse(res,'Không tải được tiền cần thu của NVGH');
    if(requestSeq!==deliveryCashPreviewRequestSeq)return;
    if(!json.ok||!json.draft)throw new Error(json.message||'Không có dữ liệu tiền cần thu');
    if(syncSubmitted){
      if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value=Math.round(Number(json.draft.reportCashAmount||0));
      if(deliveryCashSubmissionBankInput)deliveryCashSubmissionBankInput.value=Math.round(Number(json.draft.reportBankAmount||0));
    }
    renderDeliveryCashSubmissionPreview(json);
  }catch(err){
    if(err&&err.name==='AbortError')return;
    if(requestSeq!==deliveryCashPreviewRequestSeq)return;
    deliveryCashPreviewDraft=null;
    setDeliveryCashSubmissionPreviewStatus(err.message||'Không tải được tiền cần thu',{error:true});
  }finally{
    if(requestSeq===deliveryCashPreviewRequestSeq)deliveryCashPreviewAbortController=null;
  }
}

function scheduleDeliveryCashSubmissionPreview({syncSubmitted=fundEditing.type!=='delivery',immediate=false}={}){
  if(deliveryCashPreviewTimer)clearTimeout(deliveryCashPreviewTimer);
  if(immediate)return loadDeliveryCashSubmissionPreview({syncSubmitted});
  deliveryCashPreviewTimer=setTimeout(()=>{
    deliveryCashPreviewTimer=null;
    loadDeliveryCashSubmissionPreview({syncSubmitted});
  },350);
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
        const counterpartyLabel=canonicalFundCounterpartyLabel(e);
        return `<tr><td>${escapeHtml(e.date||'')}</td><td><strong>${escapeHtml(e.code||'')}</strong></td><td>${escapeHtml(fundTypeName(e.fundType))}</td><td class="price cash-in">${isIn?money(e.amount):''}</td><td class="price cash-out">${!isIn?money(e.amount):''}</td><td class="price">${money(balanceAfter[key]||0)}</td><td>${escapeHtml(e.sourceType||e.refType||'')}</td><td>${escapeHtml(counterpartyLabel)}</td><td>${escapeHtml(e.note||'')}</td></tr>`;
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
    closeFundVoucherModal('delivery');
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
  fundResetVoucherForm(type);
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
  openFundVoucherModal(type);
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
    closeFundVoucherModal('expense');
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
    closeFundVoucherModal('transfer');
  }catch(err){showMessage(fundTransferMessage,err.message,true)}
}

function reloadActiveFundTab(){
  if(activeFundTab==='fundLedger')loadFundLedger();
  else if(activeFundTab==='deliverySubmission')loadDeliveryCashSubmissions();
  else if(activeFundTab==='expenseVoucher')loadExpenseVouchers();
  else if(activeFundTab==='bankTransfer')loadFundTransfers();
}
if(fundTabButtons)fundTabButtons.forEach(btn=>btn.addEventListener('click',()=>setActiveFundTab(btn.dataset.fundTab)));
bindFundVoucherModal('delivery',createDeliveryCashSubmissionButton,closeDeliveryCashSubmissionModalButton);
bindFundVoucherModal('expense',createExpenseVoucherButton,closeExpenseVoucherModalButton);
bindFundVoucherModal('transfer',createFundTransferButton,closeFundTransferModalButton);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeFundVoucherModalType)closeFundVoucherModal(activeFundVoucherModalType);});
if(reloadFundLedgerButton)reloadFundLedgerButton.addEventListener('click',()=>{loadFundLedger();loadDeliveryCashSubmissions();loadExpenseVouchers();loadFundTransfers();});
if(fundSearchInput)fundSearchInput.addEventListener('input',debounce(reloadActiveFundTab,300));
[fundDateFrom,fundDateTo,fundTypeFilter,fundDirectionFilter].forEach(el=>{if(el)el.addEventListener('change',loadFundLedger)});
if(deliveryCashSubmissionDate)deliveryCashSubmissionDate.addEventListener('change',()=>scheduleDeliveryCashSubmissionPreview({immediate:true}));
if(deliveryCashSubmissionStaffCode){
  deliveryCashSubmissionStaffCode.addEventListener('input',()=>scheduleDeliveryCashSubmissionPreview());
  deliveryCashSubmissionStaffCode.addEventListener('change',()=>scheduleDeliveryCashSubmissionPreview({immediate:true}));
  deliveryCashSubmissionStaffCode.addEventListener('blur',()=>scheduleDeliveryCashSubmissionPreview({immediate:true}));
}
[deliveryCashSubmissionCashInput,deliveryCashSubmissionBankInput].forEach(el=>{if(el)el.addEventListener('input',updateDeliveryCashSubmissionDifference);});
if(deliveryCashSubmissionForm)deliveryCashSubmissionForm.addEventListener('submit',submitDeliveryCashSubmission);
if(expenseVoucherForm)expenseVoucherForm.addEventListener('submit',submitExpenseVoucher);
if(fundTransferForm)fundTransferForm.addEventListener('submit',submitFundTransfer);
[deliveryCashSubmissionForm, expenseVoucherForm, fundTransferForm].forEach(form=>{ if(form&&form.elements.date)form.elements.date.value=today(); if(form&&form.elements.deliveryDate)form.elements.deliveryDate.value=today(); });
clearDeliveryCashSubmissionPreview();
loadFundLedger();
