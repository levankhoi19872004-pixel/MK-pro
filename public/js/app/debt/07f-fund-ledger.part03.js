/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
function deliveryCashSubmissionOrderMoney(order,keyList){for(const key of keyList){const value=Number(order&&order[key]||0)
;if(Number.isFinite(value)&&value>0)return Math.round(value)}return 0}function updateDeliveryCashSubmissionDifference(){const draft=deliveryCashPreviewDraft
;if(!draft||!deliveryCashSubmissionInputDifference)return;const reportCash=Number(draft.reportCashAmount||0);const reportBank=Number(draft.reportBankAmount||0)
;const totals=deliveryRemittanceLineTotals();const submittedCash=totals.cash;const submittedBank=totals.bank
;if(deliveryCashSubmissionCashInput)deliveryCashSubmissionCashInput.value=String(submittedCash)
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
;deliveryCashPreviewTimer=setTimeout(()=>{deliveryCashPreviewTimer=null;loadDeliveryCashSubmissionPreview({syncSubmitted:syncSubmitted})},350)}
function setActiveDeliverySubmissionTab(tab="cash"){activeDeliverySubmissionTab=tab==="bank"?"bank":"cash"
;if(deliverySubmissionTabButtons)deliverySubmissionTabButtons.forEach(button=>{const active=button.dataset.deliverySubtab===activeDeliverySubmissionTab
;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false")});if(deliverySubmissionTabPanels)deliverySubmissionTabPanels.forEach(panel=>{
const active=panel.dataset.deliverySubpanel===activeDeliverySubmissionTab;panel.classList.toggle("active",active);panel.hidden=!active})}
function renderDeliveryRemittanceDates(row,fundType){
const lines=(Array.isArray(row.remittanceLines)?row.remittanceLines:[]).filter(line=>String(line.method||line.fundType||"cash")===fundType&&!["cancelled","reversed"].includes(String(line.status||"").toLowerCase()))
;if(!lines.length)return'<span class="muted">Chưa khai báo</span>';const dates=[...new Set(lines.map(line=>String(line.remittanceDate||"")).filter(Boolean))].sort()
;const label=!dates.length?"Cần chọn ngày":dates.length===1?dates[0]:`${dates[0]}–${dates[dates.length-1]}`
;return`<details class="fund-remittance-date-details"><summary>${escapeHtml(label)}</summary>${lines.map(line=>{
const confirmed=String(line.status||"").toLowerCase()==="confirmed"||Boolean(line.fundLedgerId);const rawCode=String(row.code||row.id||"");const rawLineId=String(line.lineId||"")
;const methodLabel=fundType==="bank"?"CK":"TM"
;const confirmButton=confirmed?'<span class="muted">Đã ghi quỹ</span>':`<button type="button" class="secondary compact-action" data-fund-action-key="${escapeHtml(`confirm-line:${rawCode}:${rawLineId}`)}" data-fund-action="confirm-remittance-line" data-fund-code="${escapeHtml(rawCode)}" data-line-id="${escapeHtml(rawLineId)}">Xác nhận dòng</button>`
;return`<div class="fund-remittance-date-line"><span>${methodLabel} ${money(line.amount||0)} · ${escapeHtml(line.remittanceDate||"Chưa chọn ngày")}</span>${confirmButton}</div>`
}).join("")}</details>`}function renderDeliverySubmissionRows(rows,{fundType:fundType="cash"}={}){const isBank=fundType==="bank"
;const reportField=isBank?"reportBankAmount":"reportCashAmount";const submittedField=isBank?"submittedBankAmount":"submittedCashAmount"
;const differenceField=isBank?"differenceBankAmount":"differenceCashAmount";const actualField=isBank?"totalActualBankAmount":"totalActualCashAmount"
;const remainingField=isBank?"remainingBankAmount":"remainingCashAmount";const shortageField=isBank?"bankShortage":"cashShortage"
;const emptyText=isBank?"Chưa có phiếu nộp quỹ chuyển khoản.":"Chưa có phiếu nộp quỹ tiền mặt.";if(!rows.length)return`<tr><td colspan="11">${emptyText}</td></tr>`
;return rows.map(r=>{const planned=Number(r[submittedField]||0);const actual=Number((r[actualField]??(r.fundPosted?r[submittedField]:0))||0);const report=Number(r[reportField]||0)
;const diff=Number(r[differenceField]??planned-report);const shortage=r[shortageField]||null;const remaining=Number(r[remainingField]??Math.max(0,report-actual))||0
;const key=String(r.code||r.id||"");fundRowCache.delivery[key]=r;const shortageState=deliveryShortageStatusText(shortage,r,diff);const baseActions=fundActionButtons("delivery",r)
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.deliveryDate||"")}</td><td>${renderDeliveryRemittanceDates(r,fundType)}</td><td>${escapeHtml(((r.deliveryStaffCode||"")+" "+(r.deliveryStaffName||"")).trim())}</td><td class="price">${money(report)}</td><td class="price">${money(planned)}</td><td class="price cash-in">${money(actual)}</td><td class="price ${diff<0?"cash-out":diff>0?"cash-in":""}">${diff>0?"+":""}${money(diff)}</td><td>${shortageState||fundStatusLabel(diff)}</td><td>${escapeHtml(fundStatusText(r))}</td><td>${deliverySubmissionActions(r,{
fundType:fundType,baseActions:baseActions})}</td></tr>`}).join("")}function loadDeliveryCashSubmissions(){
if(!deliveryCashSubmissionTable&&!deliveryBankSubmissionTable)return Promise.resolve();return runFundListRequest("delivery",async()=>{try{const params=new URLSearchParams({
limit:"500"});const q=fundSearchInput?fundSearchInput.value.trim():"";if(q)params.set("q",q);const res=await fetch(`/api/funds/delivery-cash-submissions?${params.toString()}`)
;const json=await fundReadJsonResponse(res,"Không tải được phiếu nộp quỹ");if(!json.ok)throw new Error(json.message||"Không tải được phiếu nộp quỹ");let rows=json.submissions||[]
;if(fundDashboardActiveFilter==="pendingRemittances"){rows=rows.filter(row=>fundCanConfirm(row))
;if(fundSummary)fundSummary.textContent="Đang lọc: phiếu/dòng nộp quỹ chờ xác nhận. Bấm Xóa lọc để bỏ lọc."}else if(fundDashboardActiveFilter==="overdueDeliveryCash"){
const asOf=fundDashboardAsOf&&fundDashboardAsOf.value?fundDashboardAsOf.value:today();rows=rows.filter(row=>{
const age=(new Date(`${asOf}T00:00:00Z`)-new Date(`${row.deliveryDate||asOf}T00:00:00Z`))/(24*60*60*1e3)
;return age>1&&(Number(row.remainingCashAmount||0)>0||Number(row.remainingBankAmount||0)>0||fundCanConfirm(row))})
;if(fundSummary)fundSummary.textContent="Đang lọc: tiền giao hàng quá hạn/còn cần xử lý. Bấm Xóa lọc để bỏ lọc."
}else if(fundDashboardActiveFilter==="unresolvedShortages"||fundDashboardActiveFilter==="unclassifiedShortages"){
rows=rows.filter(row=>row.cashShortage||row.bankShortage||Number(row.differenceCashAmount||0)<0||Number(row.differenceBankAmount||0)<0)
;if(fundSummary)fundSummary.textContent="Đang lọc: khoản thiếu quỹ còn tồn. Bấm Xóa lọc để bỏ lọc."}
if(deliveryCashSubmissionTable)deliveryCashSubmissionTable.innerHTML=renderDeliverySubmissionRows(rows,{fundType:"cash"})
;if(deliveryBankSubmissionTable)deliveryBankSubmissionTable.innerHTML=renderDeliverySubmissionRows(rows,{fundType:"bank"})}catch(err){
const message=escapeHtml(err.message||"Lỗi tải phiếu nộp quỹ");if(deliveryCashSubmissionTable)deliveryCashSubmissionTable.innerHTML=`<tr><td colspan="11">${message}</td></tr>`
;if(deliveryBankSubmissionTable)deliveryBankSubmissionTable.innerHTML=`<tr><td colspan="11">${message}</td></tr>`}})}function loadExpenseVouchers(){
if(!expenseVoucherTable)return Promise.resolve();return runFundListRequest("expense",async()=>{try{const params=new URLSearchParams({limit:"500"})
;const q=fundSearchInput?fundSearchInput.value.trim():"";if(q)params.set("q",q);const res=await fetch(`/api/funds/expenses?${params.toString()}`)
;const json=await fundReadJsonResponse(res,"Không tải được phiếu chi");if(!json.ok)throw new Error(json.message||"Không tải được phiếu chi");const rows=json.vouchers||[]
;expenseVoucherTable.innerHTML=rows.length?rows.map(r=>{const key=String(r.code||r.id||"");fundRowCache.expense[key]=r
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.date||"")}</td><td>${escapeHtml(fundTypeName(r.fundType))}</td><td>${escapeHtml(r.expenseType||"")}</td><td>${escapeHtml(r.receiverName||"")}</td><td class="price cash-out">${money(r.amount||0)}</td><td>${escapeHtml(fundStatusText(r))}</td><td><span class="fund-row-actions">${fundActionButtons("expense",r)}</span></td></tr>`
}).join(""):'<tr><td colspan="8">Chưa có phiếu chi.</td></tr>'}catch(err){
expenseVoucherTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||"Lỗi tải phiếu chi")}</td></tr>`}})}function loadFundTransfers(){
if(!fundTransferTable)return Promise.resolve();return runFundListRequest("transfer",async()=>{try{const params=new URLSearchParams({limit:"500"})
;const q=fundSearchInput?fundSearchInput.value.trim():"";if(q)params.set("q",q);const res=await fetch(`/api/funds/transfers?${params.toString()}`)
;const json=await fundReadJsonResponse(res,"Không tải được phiếu chuyển quỹ");if(!json.ok)throw new Error(json.message||"Không tải được phiếu chuyển quỹ")
;const rows=json.transfers||[];fundTransferTable.innerHTML=rows.length?rows.map(r=>{const key=String(r.code||r.id||"");fundRowCache.transfer[key]=r
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.date||"")}</td><td>${escapeHtml(fundTypeName(r.fromFund))}</td><td>${escapeHtml(fundTypeName(r.toFund))}</td><td>${escapeHtml(r.bankName||"")}</td><td class="price">${money(r.amount||0)}</td><td>${escapeHtml(fundStatusText(r))}</td><td><span class="fund-row-actions">${fundActionButtons("transfer",r)}</span></td></tr>`
}).join(""):'<tr><td colspan="8">Chưa có phiếu chuyển quỹ.</td></tr>'}catch(err){
fundTransferTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message||"Lỗi tải phiếu chuyển quỹ")}</td></tr>`}})}async function submitDeliveryCashSubmission(event){
event.preventDefault();collectDeliveryRemittanceLines();updateDeliveryCashSubmissionDifference()
;const payload=Object.fromEntries(new FormData(deliveryCashSubmissionForm).entries())
;payload.remittanceLines=deliveryRemittanceLines.map(normalizeDeliveryRemittanceLine).filter(line=>line.amount>0);["submittedCashAmount","submittedBankAmount"].forEach(k=>{
if(payload[k]!==""&&payload[k]!=null)payload[k]=Number(payload[k]||0);else delete payload[k]});if(!payload.remittanceLines.length){
showMessage(deliveryCashSubmissionMessage,"Cần thêm ít nhất một dòng nộp tiền",true);return}try{const editing=fundEditing.type==="delivery"&&fundEditing.id
;const url=editing?`/api/funds/delivery-cash-submissions/${encodeURIComponent(fundEditing.id)}`:"/api/funds/delivery-cash-submissions";const res=await fetch(url,{
method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
;const json=await fundReadJsonResponse(res,editing?"Không cập nhật được phiếu nộp quỹ":"Không tạo được phiếu nộp quỹ")
;if(!json.ok)throw new Error(json.message||"Không lưu được phiếu nộp quỹ");fundResetEditing("delivery")
;showMessage(deliveryCashSubmissionMessage,json.message||"Đã lưu phiếu nộp quỹ");await loadDeliveryCashSubmissions();await fundRefreshAfterMutation()
;closeFundVoucherModal("delivery")}catch(err){showMessage(deliveryCashSubmissionMessage,err.message,true)}}function setFundAuxModal(modal,show){if(!modal)return
;modal.classList.toggle("show",Boolean(show));modal.setAttribute("aria-hidden",show?"false":"true")
;if(show)document.body.classList.add("modal-open");else if(!document.querySelector(".modal-backdrop.show"))document.body.classList.remove("modal-open")}
function closeDeliveryShortageResolutionModal(){setFundAuxModal(deliveryShortageResolutionModal,false);shortageResolutionContext={mode:"",submissionCode:""}
;if(deliveryShortageResolutionForm)deliveryShortageResolutionForm.reset();if(deliveryShortageResolutionMessage)showMessage(deliveryShortageResolutionMessage,"")}
function openDeliveryShortageResolution(row,{mode:mode="confirm"}={}){if(!row)return;const cashShortage=Math.max(0,-Number(row.differenceCashAmount||0))
;const bankShortage=Math.max(0,-Number(row.differenceBankAmount||0));if(cashShortage<=0&&bankShortage<=0){
if(mode==="confirm")return executeDeliveryCashSubmissionConfirmation(row.code||row.id,{});alert("Phiếu không có khoản thiếu cần phân loại");return}shortageResolutionContext={
mode:mode,submissionCode:String(row.code||row.id||"")};if(deliveryShortageResolutionForm)deliveryShortageResolutionForm.reset()
;if(deliveryShortageResolutionSubmissionCode)deliveryShortageResolutionSubmissionCode.value=shortageResolutionContext.submissionCode
;if(deliveryShortageResolutionMode)deliveryShortageResolutionMode.value=mode;if(deliveryCashShortageResolutionSection)deliveryCashShortageResolutionSection.hidden=cashShortage<=0
;if(deliveryBankShortageResolutionSection)deliveryBankShortageResolutionSection.hidden=bankShortage<=0
;if(deliveryCashShortageResolutionAmount)deliveryCashShortageResolutionAmount.textContent=money(cashShortage)
;if(deliveryBankShortageResolutionAmount)deliveryBankShortageResolutionAmount.textContent=money(bankShortage);if(deliveryShortageResolutionSummary){
deliveryShortageResolutionSummary.innerHTML=`<strong>${escapeHtml(row.code||"")}</strong><span>${escapeHtml(((row.deliveryStaffCode||"")+" · "+(row.deliveryStaffName||"")).replace(/ · $/,""))}</span><span>Ngày giao ${escapeHtml(row.deliveryDate||"")}</span>`
}if(submitDeliveryShortageResolutionButton)submitDeliveryShortageResolutionButton.textContent=mode==="classify"?"Lưu phân loại khoản thiếu":"Xác nhận phiếu và ghi quỹ"
;if(deliveryShortageResolutionMessage)showMessage(deliveryShortageResolutionMessage,"");setFundAuxModal(deliveryShortageResolutionModal,true)}
async function executeDeliveryCashSubmissionConfirmation(code,payload={}){const res=await fetch(`/api/funds/delivery-cash-submissions/${encodeURIComponent(code)}/confirm`,{
method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,"Không xác nhận được phiếu nộp quỹ")
;if(!json.ok)throw new Error(json.message||"Không xác nhận được phiếu nộp quỹ");await loadDeliveryCashSubmissions();await fundRefreshAfterMutation();return json}
async function confirmDeliveryCashSubmission(code,triggerButton){if(!code)return;const row=fundRowCache.delivery[code];if(!row){alert("Không tìm thấy dữ liệu phiếu để xác nhận")
;return}const hasShortage=Number(row.differenceCashAmount||0)<0||Number(row.differenceBankAmount||0)<0;if(hasShortage){openDeliveryShortageResolution(row,{mode:"confirm"});return}
const actionKey=`confirm:delivery:${code}`;openFundConfirmPreview({title:"Xác nhận phiếu nộp quỹ",message:"Thao tác này ghi nhận tiền vào fundLedgers theo nguồn phiếu nộp.",
actionKey:actionKey,triggerButton:triggerButton,
rows:[["Mã phiếu",code],["NVGH",((row.deliveryStaffCode||"")+" "+(row.deliveryStaffName||"")).trim()],["Ngày giao",row.deliveryDate||""],["Tổng khai báo",money(Number(row.submittedCashAmount||0)+Number(row.submittedBankAmount||0))]],
onConfirm:()=>executeDeliveryCashSubmissionConfirmation(code,{})})}window.confirmDeliveryCashSubmission=confirmDeliveryCashSubmission
;async function confirmDeliveryRemittanceLine(code,lineId,triggerButton){if(!code||!lineId)return;const row=fundRowCache.delivery[code]
;const line=(row&&Array.isArray(row.remittanceLines)?row.remittanceLines:[]).find(item=>String(item.lineId)===String(lineId));if(!line){alert("Không tìm thấy dòng nộp tiền");return
}if(!line.remittanceDate){alert("Cần chọn ngày nộp thực tế trong phiếu trước khi xác nhận dòng");return}const actionKey=`confirm-line:${code}:${lineId}`;openFundConfirmPreview({
title:"Xác nhận dòng nộp tiền",message:"Chỉ dòng này được ghi vào fundLedgers; các dòng khác giữ nguyên trạng thái.",actionKey:actionKey,triggerButton:triggerButton,
rows:[["Mã phiếu",code],["Hình thức",fundTypeName(line.method)],["Số tiền",money(line.amount||0)],["Ngày nộp thực tế",line.remittanceDate||""]],onConfirm:async()=>{
const res=await fetch(`/api/funds/delivery-cash-submissions/${encodeURIComponent(code)}/lines/${encodeURIComponent(lineId)}/confirm`,{method:"POST",headers:{
"Content-Type":"application/json"},body:"{}"});const payload=await fundReadJsonResponse(res,"Không xác nhận được dòng nộp tiền")
;if(!payload.ok)throw new Error(payload.message||"Không xác nhận được dòng nộp tiền");await loadDeliveryCashSubmissions();await fundRefreshAfterMutation();return payload}})}
window.confirmDeliveryRemittanceLine=confirmDeliveryRemittanceLine;
