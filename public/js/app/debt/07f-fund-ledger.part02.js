/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
let deliveryCashPreviewTimer=null;let deliveryCashPreviewRequestSeq=0;let deliveryCashPreviewAbortController=null;let deliveryCashPreviewDraft=null;let deliveryRemittanceLines=[]
;function deliveryRemittanceLineId(method="cash"){if(window.crypto&&typeof window.crypto.randomUUID==="function")return`NQGHL-${window.crypto.randomUUID()}`
;return`NQGHL-${method}-${Date.now()}-${Math.random().toString(16).slice(2)}`}function normalizeDeliveryRemittanceLine(line={}){
const method=String(line.method||line.fundType||"cash").toLowerCase()==="bank"?"bank":"cash";return{lineId:String(line.lineId||line.id||deliveryRemittanceLineId(method)),
method:method,fundType:method,amount:Math.max(0,Math.round(Number(line.amount||0))),remittanceDate:String(line.remittanceDate||""),
bankAccountCode:method==="bank"?String(line.bankAccountCode||""):"",bankReference:method==="bank"?String(line.bankReference||""):"",
status:String(line.status||"draft").toLowerCase(),fundLedgerId:String(line.fundLedgerId||""),legacyDerived:Boolean(line.legacyDerived),
manualReviewRequired:Boolean(line.manualReviewRequired)}}function setDeliveryRemittanceLines(lines=[]){
deliveryRemittanceLines=(Array.isArray(lines)?lines:[]).map(normalizeDeliveryRemittanceLine).filter(line=>line.amount>0||!["confirmed","reversed","cancelled"].includes(line.status))
;renderDeliveryRemittanceLineEditor();updateDeliveryCashSubmissionDifference()}function addDeliveryRemittanceLine(method,amount=0,remittanceDate=today()){
deliveryRemittanceLines.push(normalizeDeliveryRemittanceLine({method:method,amount:amount,remittanceDate:remittanceDate,status:"draft"}));renderDeliveryRemittanceLineEditor()
;updateDeliveryCashSubmissionDifference()}function deliveryRemittanceLineTotals(){
return deliveryRemittanceLines.filter(line=>!["cancelled","reversed"].includes(line.status)).reduce((totals,line)=>{
totals[line.method]+=Math.max(0,Math.round(Number(line.amount||0)));return totals},{cash:0,bank:0})}function renderDeliveryRemittanceLineEditor(){
if(!deliveryRemittanceLineTable)return;if(!deliveryRemittanceLines.length){
deliveryRemittanceLineTable.innerHTML='<tr><td colspan="6">Chưa có dòng nộp tiền. Bấm + Tiền mặt hoặc + Chuyển khoản.</td></tr>';return}
deliveryRemittanceLineTable.innerHTML=deliveryRemittanceLines.map((line,index)=>{const locked=line.status==="confirmed"||Boolean(line.fundLedgerId);const bank=line.method==="bank"
;const statusLabel=locked?"Đã ghi quỹ":line.remittanceDate?"Nháp":"Cần chọn ngày"
;return`<tr data-remittance-line-index="${index}"><td><select data-remittance-field="method" ${locked?"disabled":""}><option value="cash" ${bank?"":"selected"}>Tiền mặt</option><option value="bank" ${bank?"selected":""}>Chuyển khoản</option></select></td><td><input data-remittance-field="amount" type="number" min="1" step="1" value="${escapeHtml(String(line.amount||""))}" ${locked?"disabled":""}></td><td><input data-remittance-field="remittanceDate" type="date" value="${escapeHtml(line.remittanceDate||"")}" ${locked?"disabled":""}></td><td>${bank?`<input data-remittance-field="bankAccountCode" placeholder="Mã tài khoản" value="${escapeHtml(line.bankAccountCode||"")}" ${locked?"disabled":""}><input data-remittance-field="bankReference" placeholder="Mã giao dịch" value="${escapeHtml(line.bankReference||"")}" ${locked?"disabled":""}>`:'<span class="muted">Không áp dụng</span>'}</td><td><span class="fund-remittance-line-status ${locked?"confirmed":"draft"}">${statusLabel}</span></td><td>${locked?'<span class="muted">Đã khóa</span>':`<button type="button" class="secondary compact-action" data-remittance-remove="${index}">Xóa</button>`}</td></tr>`
}).join("")}function collectDeliveryRemittanceLines(){if(deliveryRemittanceLineTable){deliveryRemittanceLineTable.querySelectorAll("tr[data-remittance-line-index]").forEach(row=>{
const index=Number(row.dataset.remittanceLineIndex);const current=deliveryRemittanceLines[index];if(!current||current.status==="confirmed"||current.fundLedgerId)return
;row.querySelectorAll("[data-remittance-field]").forEach(input=>{const field=input.dataset.remittanceField
;current[field]=field==="amount"?Math.max(0,Math.round(Number(input.value||0))):String(input.value||"")});current.method=current.method==="bank"?"bank":"cash"
;current.fundType=current.method;if(current.method==="cash"){current.bankAccountCode="";current.bankReference=""}})}
return deliveryRemittanceLines.map(normalizeDeliveryRemittanceLine).filter(line=>line.amount>0)}
function setDeliveryCashSubmissionPreviewStatus(message,{loading:loading=false,error:error=false}={}){
if(deliveryCashSubmissionPreview)deliveryCashSubmissionPreview.setAttribute("aria-busy",loading?"true":"false");if(deliveryCashSubmissionPreviewStatus){
deliveryCashSubmissionPreviewStatus.hidden=false;deliveryCashSubmissionPreviewStatus.textContent=message||""
;deliveryCashSubmissionPreviewStatus.classList.toggle("is-loading",loading);deliveryCashSubmissionPreviewStatus.classList.toggle("is-error",error)}
if(deliveryCashSubmissionPreviewContent)deliveryCashSubmissionPreviewContent.hidden=true}function clearDeliveryCashSubmissionPreview(){deliveryCashPreviewRequestSeq+=1
;deliveryCashPreviewDraft=null;if(deliveryCashPreviewTimer){clearTimeout(deliveryCashPreviewTimer);deliveryCashPreviewTimer=null}if(deliveryCashPreviewAbortController){
deliveryCashPreviewAbortController.abort();deliveryCashPreviewAbortController=null}if(fundEditing.type!=="delivery")setDeliveryRemittanceLines([])
;setDeliveryCashSubmissionPreviewStatus("Chọn ngày giao và nhập mã NV giao hàng để xem tiền cần thu.")
;if(deliveryCashSubmissionPreviewTable)deliveryCashSubmissionPreviewTable.innerHTML='<tr><td colspan="5">Chưa có dữ liệu.</td></tr>'
;[deliveryCashSubmissionReportCash,deliveryCashSubmissionReportBank,deliveryCashSubmissionReportTotal,deliveryCashSubmissionInputDifference,deliveryCashSubmissionPreviewCashTotal,deliveryCashSubmissionPreviewBankTotal,deliveryCashSubmissionPreviewGrandTotal].forEach(el=>{
if(el)el.textContent="0"});if(deliveryCashSubmissionInputDifference){deliveryCashSubmissionInputDifference.removeAttribute("title")
;deliveryCashSubmissionInputDifference.classList.remove("is-positive","is-negative","is-matched")}}function deliveryCashSubmissionSelectedFilters(){return{
deliveryDate:String(deliveryCashSubmissionDate&&deliveryCashSubmissionDate.value||"").trim(),
deliveryStaffCode:String(deliveryCashSubmissionStaffCode&&deliveryCashSubmissionStaffCode.value||"").trim()}}function deliveryCashSubmissionOrderMoney(order,keyList){
for(const key of keyList){const value=Number(order&&order[key]||0);if(Number.isFinite(value)&&value>0)return Math.round(value)}return 0}
function updateDeliveryCashSubmissionDifference(){const draft=deliveryCashPreviewDraft;if(!draft||!deliveryCashSubmissionInputDifference)return
;const reportCash=Number(draft.reportCashAmount||0);const reportBank=Number(draft.reportBankAmount||0);const totals=deliveryRemittanceLineTotals();const submittedCash=totals.cash
;const submittedBank=totals.bank;if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value=String(submittedCash)
;if(deliveryCashSubmissionBankInput)deliveryCashSubmissionBankInput.value=String(submittedBank);const cashDifference=Math.round(submittedCash-reportCash)
;const bankDifference=Math.round(submittedBank-reportBank);const difference=cashDifference+bankDifference;const signed=value=>`${value>0?"+":""}${money(value)}`
;deliveryCashSubmissionInputDifference.textContent=`TM ${signed(cashDifference)} · TK ${signed(bankDifference)}`
;deliveryCashSubmissionInputDifference.title=`Tổng chênh: ${signed(difference)}`
;deliveryCashSubmissionInputDifference.classList.toggle("is-positive",cashDifference>0||bankDifference>0)
;deliveryCashSubmissionInputDifference.classList.toggle("is-negative",cashDifference<0||bankDifference<0)
;deliveryCashSubmissionInputDifference.classList.toggle("is-matched",cashDifference===0&&bankDifference===0)}function renderDeliveryCashSubmissionPreview(payload={}){
const draft=payload.draft||{};const orders=Array.isArray(payload.orders)?payload.orders:[];deliveryCashPreviewDraft=draft
;const reportCash=Math.round(Number(draft.reportCashAmount||0));const reportBank=Math.round(Number(draft.reportBankAmount||0));const reportTotal=reportCash+reportBank
;if(deliveryCashSubmissionPreviewStatus)deliveryCashSubmissionPreviewStatus.hidden=true;if(deliveryCashSubmissionPreviewContent)deliveryCashSubmissionPreviewContent.hidden=false
;if(deliveryCashSubmissionPreview)deliveryCashSubmissionPreview.setAttribute("aria-busy","false")
;if(deliveryCashSubmissionPreviewStaff)deliveryCashSubmissionPreviewStaff.textContent=`${draft.deliveryStaffCode||""}${draft.deliveryStaffName&&draft.deliveryStaffName!==draft.deliveryStaffCode?" · "+draft.deliveryStaffName:""}`
;if(deliveryCashSubmissionPreviewDate)deliveryCashSubmissionPreviewDate.textContent=draft.deliveryDate?`Ngày giao ${draft.deliveryDate}`:""
;if(deliveryCashSubmissionPreviewOrderCount)deliveryCashSubmissionPreviewOrderCount.textContent=`${orders.length} đơn`
;if(deliveryCashSubmissionReportCash)deliveryCashSubmissionReportCash.textContent=money(reportCash)
;if(deliveryCashSubmissionReportBank)deliveryCashSubmissionReportBank.textContent=money(reportBank)
;if(deliveryCashSubmissionReportTotal)deliveryCashSubmissionReportTotal.textContent=money(reportTotal)
;if(deliveryCashSubmissionPreviewCashTotal)deliveryCashSubmissionPreviewCashTotal.textContent=money(reportCash)
;if(deliveryCashSubmissionPreviewBankTotal)deliveryCashSubmissionPreviewBankTotal.textContent=money(reportBank)
;if(deliveryCashSubmissionPreviewGrandTotal)deliveryCashSubmissionPreviewGrandTotal.textContent=money(reportTotal);if(deliveryCashSubmissionPreviewTable){
const rows=orders.map(order=>{const cash=deliveryCashSubmissionOrderMoney(order,["cashAmount","cashCollected"])
;const bank=deliveryCashSubmissionOrderMoney(order,["bankAmount","bankCollected","transferAmount"])
;const customer=[order.customerCode,order.customerName].filter(Boolean).join(" · ")
;return`<tr><td><strong>${escapeHtml(order.orderCode||order.code||"")}</strong></td><td>${escapeHtml(customer||"")}</td><td class="price">${money(cash)}</td><td class="price">${money(bank)}</td><td class="price">${money(cash+bank)}</td></tr>`
});const oldDebtCash=Math.round(Number(draft.reportOldDebtCashAmount||0));const oldDebtBank=Math.round(Number(draft.reportOldDebtBankAmount||0));if(oldDebtCash>0||oldDebtBank>0){
rows.push(`<tr class="delivery-cash-preview-extra"><td><strong>THU NỢ CŨ</strong></td><td>Khoản thu nợ được ghi nhận trong ngày</td><td class="price">${money(oldDebtCash)}</td><td class="price">${money(oldDebtBank)}</td><td class="price">${money(oldDebtCash+oldDebtBank)}</td></tr>`)
}deliveryCashSubmissionPreviewTable.innerHTML=rows.length?rows.join(""):'<tr><td colspan="5">Không có khoản tiền mặt hoặc tài khoản cần thu.</td></tr>'}
updateDeliveryCashSubmissionDifference()}async function loadDeliveryCashSubmissionPreview({syncSubmitted:syncSubmitted=true}={}){
const filters=deliveryCashSubmissionSelectedFilters();if(!filters.deliveryDate||!filters.deliveryStaffCode){clearDeliveryCashSubmissionPreview();return}
const requestSeq=++deliveryCashPreviewRequestSeq;deliveryCashPreviewDraft=null;if(syncSubmitted)setDeliveryRemittanceLines([])
;if(deliveryCashPreviewAbortController)deliveryCashPreviewAbortController.abort();deliveryCashPreviewAbortController=typeof AbortController!=="undefined"?new AbortController:null
;setDeliveryCashSubmissionPreviewStatus("Đang tải tiền mặt và tài khoản cần thu theo ngày giao và NVGH...",{loading:true});try{
const res=await fetch("/api/funds/delivery-cash-submissions/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(filters),
...deliveryCashPreviewAbortController?{signal:deliveryCashPreviewAbortController.signal}:{}});const json=await fundReadJsonResponse(res,"Không tải được tiền cần thu của NVGH")
;if(requestSeq!==deliveryCashPreviewRequestSeq)return;if(!json.ok||!json.draft)throw new Error(json.message||"Không có dữ liệu tiền cần thu");if(syncSubmitted){
if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value=Math.round(Number(json.draft.reportCashAmount||0))
;if(deliveryCashSubmissionBankInput)deliveryCashSubmissionBankInput.value=Math.round(Number(json.draft.reportBankAmount||0))
;setDeliveryRemittanceLines(json.draft.remittanceLines||[])}renderDeliveryCashSubmissionPreview(json)}catch(err){if(err&&err.name==="AbortError")return
;if(requestSeq!==deliveryCashPreviewRequestSeq)return;deliveryCashPreviewDraft=null;setDeliveryCashSubmissionPreviewStatus(err.message||"Không tải được tiền cần thu",{error:true})
}finally{if(requestSeq===deliveryCashPreviewRequestSeq)deliveryCashPreviewAbortController=null}}
function scheduleDeliveryCashSubmissionPreview({syncSubmitted:syncSubmitted=fundEditing.type!=="delivery",immediate:immediate=false}={}){
if(deliveryCashPreviewTimer)clearTimeout(deliveryCashPreviewTimer);if(immediate)return loadDeliveryCashSubmissionPreview({syncSubmitted:syncSubmitted})
;deliveryCashPreviewTimer=setTimeout(()=>{deliveryCashPreviewTimer=null;loadDeliveryCashSubmissionPreview({syncSubmitted:syncSubmitted})},350)}function fundDashboardCount(value){
if(value===null||value===undefined)return"-";return String(Number(value||0))}function setFundDashboardLoading(message){
if(fundDashboardStatus)fundDashboardStatus.textContent=message||"Đang tải tổng quan quỹ..."
;if(fundDashboardCashInTransitTable)fundDashboardCashInTransitTable.innerHTML='<tr><td colspan="6">Đang tải...</td></tr>'
;if(fundDashboardRecentTable)fundDashboardRecentTable.innerHTML='<tr><td colspan="6">Đang tải...</td></tr>'}function renderFundDashboard(data={}){const balances=data.balances||{}
;const cash=balances.cash||{};const bank=balances.bank||{};const queues=data.workQueues||{};const pending=queues.pendingRemittances||{};const overdue=queues.overdueDeliveryCash||{}
;const shortages=queues.unclassifiedShortages||{};const bankQueue=queues.unmatchedBankTransactions||{};const transit=data.cashInTransit||{}
;const transitRows=Array.isArray(transit.items)?transit.items:[];const recentRows=Array.isArray(data.recentTransactions)?data.recentTransactions:[]
;const suspenseAmount=Number(pending.amount||0)+Number(shortages.amount||0);if(fundDashboardAsOf&&!fundDashboardAsOf.value)fundDashboardAsOf.value=data.asOf||today()
;if(fundDashboardCashAmount)fundDashboardCashAmount.textContent=money(cash.closing||0)
;if(fundDashboardCashSub)fundDashboardCashSub.textContent=`Thu ${money(cash.inflow||0)} · chi ${money(cash.outflow||0)}`
;if(fundDashboardBankAmount)fundDashboardBankAmount.textContent=money(bank.closing||0)
;if(fundDashboardBankSub)fundDashboardBankSub.textContent=`Thu ${money(bank.inflow||0)} · chi ${money(bank.outflow||0)}`
;if(fundDashboardTransitAmount)fundDashboardTransitAmount.textContent=money(transit.totalAmount||0)
;if(fundDashboardTransitSub)fundDashboardTransitSub.textContent=`${fundDashboardCount(transit.staffCount)} NVGH · ${fundDashboardCount(transit.totalRows)} dòng`
;if(fundDashboardSuspenseAmount)fundDashboardSuspenseAmount.textContent=money(suspenseAmount)
;if(fundDashboardSuspenseSub)fundDashboardSuspenseSub.textContent=`${fundDashboardCount(pending.count)} phiếu · ${fundDashboardCount(shortages.count)} thiếu`
;if(fundDashboardPendingRemittanceCount)fundDashboardPendingRemittanceCount.textContent=fundDashboardCount(pending.count)
;if(fundDashboardPendingRemittanceAmount)fundDashboardPendingRemittanceAmount.textContent=money(pending.amount||0)
;if(fundDashboardOverdueCashCount)fundDashboardOverdueCashCount.textContent=fundDashboardCount(overdue.count)
;if(fundDashboardOverdueCashAmount)fundDashboardOverdueCashAmount.textContent=money(overdue.amount||0)
;if(fundDashboardShortageCount)fundDashboardShortageCount.textContent=fundDashboardCount(shortages.count)
;if(fundDashboardShortageAmount)fundDashboardShortageAmount.textContent=money(shortages.amount||0)
;if(fundDashboardBankQueueCount)fundDashboardBankQueueCount.textContent=bankQueue.supported===false?"-":fundDashboardCount(bankQueue.count)
;if(fundDashboardBankQueueAmount)fundDashboardBankQueueAmount.textContent=bankQueue.supported===false?"Chưa hỗ trợ":money(bankQueue.amount||0)
;if(fundDashboardCashInTransitMeta)fundDashboardCashInTransitMeta.textContent=`${fundDashboardCount(transit.totalRows)} dòng${transit.truncated?" · đang rút gọn":""}`
;if(fundDashboardCashInTransitTable){
fundDashboardCashInTransitTable.innerHTML=transitRows.length?transitRows.map(row=>`<tr><td>${escapeHtml(row.deliveryDate||"")}</td><td>${escapeHtml(((row.deliveryStaffCode||"")+" "+(row.deliveryStaffName||"")).trim())}</td><td class="price">${money(row.requiredAmount||0)}</td><td class="price cash-in">${money(row.submittedAmount||0)}</td><td class="price cash-out">${money(row.remainingAmount||0)}</td><td>${Number(row.ageDays||0)} ngày</td></tr>`).join(""):'<tr><td colspan="6">Không có tiền NVGH đang giữ.</td></tr>'
}if(fundDashboardRecentMeta)fundDashboardRecentMeta.textContent=`${recentRows.length} giao dịch`;if(fundDashboardRecentTable){
fundDashboardRecentTable.innerHTML=recentRows.length?recentRows.map(row=>`<tr><td>${escapeHtml(row.accountingDate||row.date||"")}</td><td><strong>${escapeHtml(row.code||"")}</strong></td><td>${escapeHtml(fundTypeName(row.fundType))}</td><td class="price cash-in">${Number(row.inAmount||0)>0?money(row.inAmount):""}</td><td class="price cash-out">${Number(row.outAmount||0)>0?money(row.outAmount):""}</td><td>${escapeHtml(row.sourceType||"")}</td></tr>`).join(""):'<tr><td colspan="6">Chưa có giao dịch quỹ.</td></tr>'
}if(fundSummary)fundSummary.textContent=`Tổng quan quỹ ngày ${data.asOf||""}: tiền mặt ${money(cash.closing||0)}, ngân hàng ${money(bank.closing||0)}.`
;if(fundDashboardStatus)fundDashboardStatus.textContent=data.status==="partial"?"Đã tải tổng quan, một số hàng chờ cần kiểm tra lại.":`Dữ liệu tổng quan ngày ${data.asOf||""} từ fundLedgers.`
}function loadFundDashboard(){if(!fundDashboardStatus&&!fundDashboardCashInTransitTable&&!fundDashboardRecentTable)return Promise.resolve()
;return runFundListRequest("dashboard",async()=>{setFundDashboardLoading();try{const params=new URLSearchParams
;const asOf=fundDashboardAsOf&&fundDashboardAsOf.value?fundDashboardAsOf.value:today();params.set("asOf",asOf);params.set("recentLimit","10");params.set("cashInTransitLimit","20")
;const res=await fetch(`/api/funds/dashboard?${params.toString()}`);const json=await fundReadJsonResponse(res,"Không tải được tổng quan quỹ")
;if(!json.ok||!json.data)throw new Error(json.message||"Không tải được tổng quan quỹ");renderFundDashboard(json.data)}catch(err){
if(fundDashboardStatus)fundDashboardStatus.textContent=err.message||"Lỗi tải tổng quan quỹ"
;if(fundDashboardCashInTransitTable)fundDashboardCashInTransitTable.innerHTML=`<tr><td colspan="6">${escapeHtml(err.message||"Lỗi tải tổng quan quỹ")}</td></tr>`
;if(fundDashboardRecentTable)fundDashboardRecentTable.innerHTML='<tr><td colspan="6">Không tải được giao dịch gần nhất.</td></tr>'}})}function handleFundDashboardJump(button){
const target=button&&button.dataset&&button.dataset.fundDashboardJump;if(!target)return;if(target==="fundLedger"){
if(fundDateTo&&fundDashboardAsOf)fundDateTo.value=fundDashboardAsOf.value||today();setActiveFundTab("fundLedger");return}setActiveFundTab(target)}function setActiveFundTab(tab){
activeFundTab=tab||"fundDashboard";if(fundTabButtons)fundTabButtons.forEach(btn=>{const active=btn.dataset.fundTab===activeFundTab;btn.classList.toggle("active",active)
;btn.setAttribute("aria-selected",active?"true":"false")});if(fundTabPanels)fundTabPanels.forEach(panel=>panel.classList.toggle("active",panel.dataset.fundPanel===activeFundTab))
;const commonToolbar=fundToolbarGrid&&fundToolbarGrid.closest(".fund-module-toolbar")
;if(commonToolbar)commonToolbar.hidden=activeFundTab==="fundSummaryBook"||activeFundTab==="fundDashboard";const showLedgerFilters=activeFundTab==="fundLedger"
;if(fundLedgerOnlyFields)fundLedgerOnlyFields.forEach(field=>{field.hidden=!showLedgerFilters})
;if(fundToolbarGrid)fundToolbarGrid.classList.toggle("fund-toolbar-compact",!showLedgerFilters);reloadActiveFundTab()}function buildFundLedgerParams(){
const params=new URLSearchParams;const q=fundSearchInput?fundSearchInput.value.trim():"";if(q)params.set("q",q)
;if(fundDateFrom&&fundDateFrom.value)params.set("dateFrom",fundDateFrom.value);if(fundDateTo&&fundDateTo.value)params.set("dateTo",fundDateTo.value)
;if(fundTypeFilter&&fundTypeFilter.value&&fundTypeFilter.value!=="all")params.set("fundType",fundTypeFilter.value)
;if(fundDirectionFilter&&fundDirectionFilter.value&&fundDirectionFilter.value!=="all")params.set("direction",fundDirectionFilter.value);params.set("limit","200");return params}
function loadFundLedger(){if(!fundLedgerTable&&!fundSummary)return Promise.resolve();return runFundListRequest("ledger",async()=>{try{
const res=await fetch(`/api/funds/ledger?${buildFundLedgerParams().toString()}`);const json=await fundReadJsonResponse(res,"Không tải được fundLedgers")
;if(!json.ok)throw new Error(json.message||"Không tải được fundLedgers");const rows=json.fundLedgers||[];const s=json.summary||{};renderFundLedgerSummary(s);if(fundLedgerTable){
fundLedgerTable.innerHTML=rows.length?rows.map(e=>{const isIn=String(e.direction)==="in";const counterpartyLabel=canonicalFundCounterpartyLabel(e)
;return`<tr><td>${escapeHtml(e.date||"")}</td><td><strong>${escapeHtml(e.code||"")}</strong></td><td>${escapeHtml(fundTypeName(e.fundType))}</td><td class="price cash-in">${isIn?money(e.amount):""}</td><td class="price cash-out">${!isIn?money(e.amount):""}</td><td class="price">${money(e.runningBalanceAfterTransaction||0)}</td><td>${escapeHtml(e.sourceType||e.refType||"")}</td><td>${escapeHtml(counterpartyLabel)}</td><td>${escapeHtml(e.note||"")}</td></tr>`
}).join(""):'<tr><td colspan="9">Chưa có phát sinh fundLedgers.</td></tr>'}}catch(err){if(fundSummary)fundSummary.textContent="Lỗi tải sổ quỹ fundLedgers"
;if(fundLedgerTable)fundLedgerTable.innerHTML=`<tr><td colspan="9">${escapeHtml(err.message||"Lỗi tải fundLedgers")}</td></tr>`}})}
