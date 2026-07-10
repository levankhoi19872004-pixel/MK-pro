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
deliveryStaffCode:String(deliveryCashSubmissionStaffCode&&deliveryCashSubmissionStaffCode.value||"").trim()}}function fundDashboardCount(value){
if(value===null||value===undefined)return"-";return String(Number(value||0))}function fundDashboardMoney(value){if(value===null||value===undefined)return"—";return money(value)}
function fundDashboardSection(data,section){const sections=data&&data.sections||{};return sections[section]||{status:"ok",data:null,error:null}}
function fundDashboardSectionOk(data,section){return fundDashboardSection(data,section).status!=="error"}function fundDashboardTableError(message,colspan){
return`<tr><td colspan="${colspan}">${escapeHtml(message||"Không tải được dữ liệu")}</td></tr>`}function setFundDashboardLoading(message){
if(fundDashboardStatus)fundDashboardStatus.textContent=message||"Đang cập nhật tổng quan quỹ...";if(!fundDashboardLoaded){
if(fundDashboardCashInTransitTable)fundDashboardCashInTransitTable.innerHTML='<tr><td colspan="6">Đang tải...</td></tr>'
;if(fundDashboardRecentTable)fundDashboardRecentTable.innerHTML='<tr><td colspan="6">Đang tải...</td></tr>'}}function renderFundDashboard(payload={}){
const data=payload.data||payload||{};const topStatus=payload.status||data.status||"ok";const topErrors=Array.isArray(payload.errors)?payload.errors:[]
;const balances=data.balances||{};const cash=balances.cash||{};const bank=balances.bank||{};const queues=data.workQueues||{};const pending=queues.pendingRemittances||{}
;const overdue=queues.overdueDeliveryCash||{};const shortages=queues.unresolvedShortages||queues.unclassifiedShortages||{};const bankQueue=queues.unmatchedBankTransactions||{}
;const transit=data.cashInTransit||{};const transitRows=Array.isArray(transit.items)?transit.items:[]
;const recentRows=Array.isArray(data.recentTransactions)?data.recentTransactions:[]
;const suspenseAmount=pending.amount==null||shortages.amount==null?null:Number(pending.amount||0)+Number(shortages.amount||0)
;if(fundDashboardAsOf&&!fundDashboardAsOf.value)fundDashboardAsOf.value=data.asOf||today()
;if(fundDashboardCashAmount)fundDashboardCashAmount.textContent=fundDashboardMoney(cash.closing)
;if(fundDashboardCashSub)fundDashboardCashSub.textContent=fundDashboardSectionOk(data,"balances")?`Thu ${fundDashboardMoney(cash.inflow)} · chi ${fundDashboardMoney(cash.outflow)}`:"Không tải được số dư"
;if(fundDashboardBankAmount)fundDashboardBankAmount.textContent=fundDashboardMoney(bank.closing)
;if(fundDashboardBankSub)fundDashboardBankSub.textContent=fundDashboardSectionOk(data,"balances")?`Thu ${fundDashboardMoney(bank.inflow)} · chi ${fundDashboardMoney(bank.outflow)}`:"Không tải được số dư"
;if(fundDashboardTransitAmount)fundDashboardTransitAmount.textContent=fundDashboardMoney(transit.totalAmount)
;if(fundDashboardTransitSub)fundDashboardTransitSub.textContent=`${fundDashboardCount(transit.staffCount)} NVGH · ${fundDashboardCount(transit.totalRows)} dòng`
;if(fundDashboardSuspenseAmount)fundDashboardSuspenseAmount.textContent=fundDashboardMoney(suspenseAmount)
;if(fundDashboardSuspenseSub)fundDashboardSuspenseSub.textContent=`${fundDashboardCount(pending.count)} phiếu · ${fundDashboardCount(shortages.count)} thiếu`
;if(fundDashboardPendingRemittanceCount)fundDashboardPendingRemittanceCount.textContent=fundDashboardCount(pending.count)
;if(fundDashboardPendingRemittanceAmount)fundDashboardPendingRemittanceAmount.textContent=fundDashboardMoney(pending.amount)
;if(fundDashboardOverdueCashCount)fundDashboardOverdueCashCount.textContent=fundDashboardCount(overdue.count)
;if(fundDashboardOverdueCashAmount)fundDashboardOverdueCashAmount.textContent=fundDashboardMoney(overdue.amount)
;if(fundDashboardShortageCount)fundDashboardShortageCount.textContent=fundDashboardCount(shortages.count)
;if(fundDashboardShortageAmount)fundDashboardShortageAmount.textContent=fundDashboardMoney(shortages.amount)
;if(fundDashboardBankQueueCount)fundDashboardBankQueueCount.textContent=bankQueue.supported===false?"-":fundDashboardCount(bankQueue.count)
;if(fundDashboardBankQueueAmount)fundDashboardBankQueueAmount.textContent=bankQueue.supported===false?"Chưa hỗ trợ":fundDashboardMoney(bankQueue.amount)
;if(fundDashboardCashInTransitMeta)fundDashboardCashInTransitMeta.textContent=`${fundDashboardCount(transit.totalRows)} dòng · hiển thị ${transitRows.length}${transit.truncated?" · đang rút gọn":""}`
;if(fundDashboardCashInTransitTable){const section=fundDashboardSection(data,"cashInTransit")
;fundDashboardCashInTransitTable.innerHTML=section.status==="error"?fundDashboardTableError(section.error&&section.error.message,6):transitRows.length?transitRows.map(row=>`<tr><td>${escapeHtml(row.deliveryDate||"")}</td><td>${escapeHtml(((row.deliveryStaffCode||"")+" "+(row.deliveryStaffName||"")).trim())}</td><td class="price">${fundDashboardMoney(row.requiredAmount)}</td><td class="price cash-in">${fundDashboardMoney(row.submittedAmount)}</td><td class="price cash-out">${fundDashboardMoney(row.remainingAmount)}</td><td>${Number(row.ageDays||0)} ngày</td></tr>`).join(""):'<tr><td colspan="6">Không có tiền NVGH đang giữ.</td></tr>'
}if(fundDashboardRecentMeta)fundDashboardRecentMeta.textContent=`${recentRows.length} giao dịch`;if(fundDashboardRecentTable){
const section=fundDashboardSection(data,"recentTransactions")
;fundDashboardRecentTable.innerHTML=section.status==="error"?fundDashboardTableError(section.error&&section.error.message,6):recentRows.length?recentRows.map(row=>`<tr><td>${escapeHtml(row.accountingDate||row.date||"")}</td><td><strong>${escapeHtml(row.code||"")}</strong></td><td>${escapeHtml(fundTypeName(row.fundType))}</td><td class="price cash-in">${Number(row.inAmount||0)>0?money(row.inAmount):""}</td><td class="price cash-out">${Number(row.outAmount||0)>0?money(row.outAmount):""}</td><td>${escapeHtml(row.sourceType||"")}</td></tr>`).join(""):'<tr><td colspan="6">Chưa có giao dịch quỹ.</td></tr>'
}if(fundSummary)fundSummary.textContent=`Tổng quan quỹ ngày ${data.asOf||""}: tiền mặt ${fundDashboardMoney(cash.closing)}, ngân hàng ${fundDashboardMoney(bank.closing)}.`
;if(fundDashboardStatus)fundDashboardStatus.textContent=topStatus==="partial"?`Một phần dữ liệu chưa tải được (${topErrors.length||1} lỗi). Các phần đã tải vẫn được giữ.`:`Dữ liệu tổng quan ngày ${data.asOf||""} từ fundLedgers.`
;fundDashboardLoaded=true}function loadFundDashboard({force:force=false}={}){
if(!fundDashboardStatus&&!fundDashboardCashInTransitTable&&!fundDashboardRecentTable)return Promise.resolve()
;if(!force&&!document.getElementById("fundsTab")?.classList.contains("active"))return Promise.resolve();const requestSeq=++fundDashboardRequestSeq
;if(fundDashboardAbortController)fundDashboardAbortController.abort();fundDashboardAbortController=typeof AbortController!=="undefined"?new AbortController:null
;setFundDashboardLoading(fundDashboardLoaded?"Đang cập nhật tổng quan quỹ...":"Đang tải tổng quan quỹ...");return Promise.resolve().then(async()=>{try{
const params=new URLSearchParams;const asOf=fundDashboardAsOf&&fundDashboardAsOf.value?fundDashboardAsOf.value:today();params.set("asOf",asOf);params.set("recentLimit","10")
;params.set("cashInTransitLimit","20");const res=await fetch(`/api/funds/dashboard?${params.toString()}`,fundDashboardAbortController?{signal:fundDashboardAbortController.signal
}:{});const json=await fundReadJsonResponse(res,"Không tải được tổng quan quỹ");if(requestSeq!==fundDashboardRequestSeq)return
;if(!json.ok||!json.data)throw new Error(json.message||"Không tải được tổng quan quỹ");renderFundDashboard(json)}catch(err){if(err&&err.name==="AbortError")return
;if(requestSeq!==fundDashboardRequestSeq)return;if(fundDashboardStatus)fundDashboardStatus.textContent=err.message||"Lỗi tải tổng quan quỹ"
;if(!fundDashboardLoaded&&fundDashboardCashInTransitTable)fundDashboardCashInTransitTable.innerHTML=`<tr><td colspan="6">${escapeHtml(err.message||"Lỗi tải tổng quan quỹ")}</td></tr>`
;if(!fundDashboardLoaded&&fundDashboardRecentTable)fundDashboardRecentTable.innerHTML='<tr><td colspan="6">Không tải được giao dịch gần nhất.</td></tr>'}finally{
if(requestSeq===fundDashboardRequestSeq)fundDashboardAbortController=null}})}function handleFundDashboardJump(button){
const target=button&&button.dataset&&button.dataset.fundDashboardJump;const filter=button&&button.dataset&&button.dataset.fundDashboardFilter||"";if(!target)return
;fundDashboardActiveFilter=filter;if(target==="fundLedger"){if(fundDateTo&&fundDashboardAsOf)fundDateTo.value=fundDashboardAsOf.value||today();setActiveFundTab("fundLedger");return
}setActiveFundTab(target)}function setActiveFundTab(tab,{reload:reload=true}={}){activeFundTab=tab||"fundDashboard";if(fundTabButtons)fundTabButtons.forEach(btn=>{
const active=btn.dataset.fundTab===activeFundTab;btn.classList.toggle("active",active);btn.setAttribute("aria-selected",active?"true":"false")})
;if(fundTabPanels)fundTabPanels.forEach(panel=>panel.classList.toggle("active",panel.dataset.fundPanel===activeFundTab))
;const commonToolbar=fundToolbarGrid&&fundToolbarGrid.closest(".fund-module-toolbar")
;if(commonToolbar)commonToolbar.hidden=activeFundTab==="fundSummaryBook"||activeFundTab==="fundDashboard";const showLedgerFilters=activeFundTab==="fundLedger"
;if(fundLedgerOnlyFields)fundLedgerOnlyFields.forEach(field=>{field.hidden=!showLedgerFilters})
;if(fundToolbarGrid)fundToolbarGrid.classList.toggle("fund-toolbar-compact",!showLedgerFilters);if(reload)reloadActiveFundTab()}function buildFundLedgerParams(){
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
