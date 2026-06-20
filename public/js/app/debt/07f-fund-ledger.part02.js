/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
function setActiveDeliverySubmissionTab(tab="cash"){activeDeliverySubmissionTab=tab==="bank"?"bank":"cash"
;if(deliverySubmissionTabButtons)deliverySubmissionTabButtons.forEach(button=>{const active=button.dataset.deliverySubtab===activeDeliverySubmissionTab
;button.classList.toggle("active",active);button.setAttribute("aria-selected",active?"true":"false")});if(deliverySubmissionTabPanels)deliverySubmissionTabPanels.forEach(panel=>{
const active=panel.dataset.deliverySubpanel===activeDeliverySubmissionTab;panel.classList.toggle("active",active);panel.hidden=!active})}
function renderDeliverySubmissionRows(rows,{fundType:fundType="cash"}={}){const isBank=fundType==="bank";const reportField=isBank?"reportBankAmount":"reportCashAmount"
;const submittedField=isBank?"submittedBankAmount":"submittedCashAmount";const differenceField=isBank?"differenceBankAmount":"differenceCashAmount"
;const shortageField=isBank?"bankShortage":"cashShortage";const emptyText=isBank?"Chưa có phiếu nộp quỹ chuyển khoản.":"Chưa có phiếu nộp quỹ tiền mặt."
;if(!rows.length)return`<tr><td colspan="9">${emptyText}</td></tr>`;return rows.map(r=>{const diff=Number(r[differenceField]||0);const shortage=r[shortageField]||null
;const outstanding=shortage?Number(shortage.outstandingAmount||0):Math.max(0,-diff);const key=String(r.code||r.id||"");fundRowCache.delivery[key]=r
;const shortageState=deliveryShortageStatusText(shortage,r,diff);const baseActions=fundActionButtons("delivery",r)
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.deliveryDate||"")}</td><td>${escapeHtml(((r.deliveryStaffCode||"")+" "+(r.deliveryStaffName||"")).trim())}</td><td class="price">${money(r[reportField]||0)}</td><td class="price">${money(r[submittedField]||0)}</td><td class="price ${diff===0?"cash-in":"cash-out"}">${diff>0?"+":""}${money(diff)}</td><td class="price ${outstanding>0?"cash-out":""}">${outstanding>0?money(outstanding):"0"}</td><td>${fundStatusLabel(diff)} ${escapeHtml(fundStatusText(r))}${shortageState?`<div class="fund-shortage-state-wrap">${shortageState}</div>`:""}</td><td>${deliverySubmissionActions(r,{
fundType:fundType,baseActions:baseActions})}</td></tr>`}).join("")}function loadDeliveryCashSubmissions(){
if(!deliveryCashSubmissionTable&&!deliveryBankSubmissionTable)return Promise.resolve();return runFundListRequest("delivery",async()=>{try{const params=new URLSearchParams({
limit:"500"});const q=fundSearchInput?fundSearchInput.value.trim():"";if(q)params.set("q",q);const res=await fetch(`/api/funds/delivery-cash-submissions?${params.toString()}`)
;const json=await fundReadJsonResponse(res,"Không tải được phiếu nộp quỹ");if(!json.ok)throw new Error(json.message||"Không tải được phiếu nộp quỹ");const rows=json.submissions||[]
;if(deliveryCashSubmissionTable)deliveryCashSubmissionTable.innerHTML=renderDeliverySubmissionRows(rows,{fundType:"cash"})
;if(deliveryBankSubmissionTable)deliveryBankSubmissionTable.innerHTML=renderDeliverySubmissionRows(rows,{fundType:"bank"})}catch(err){
const message=escapeHtml(err.message||"Lỗi tải phiếu nộp quỹ");if(deliveryCashSubmissionTable)deliveryCashSubmissionTable.innerHTML=`<tr><td colspan="9">${message}</td></tr>`
;if(deliveryBankSubmissionTable)deliveryBankSubmissionTable.innerHTML=`<tr><td colspan="9">${message}</td></tr>`}})}function loadExpenseVouchers(){
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
event.preventDefault();const payload=Object.fromEntries(new FormData(deliveryCashSubmissionForm).entries());["submittedCashAmount","submittedBankAmount"].forEach(k=>{
if(payload[k]!==""&&payload[k]!=null)payload[k]=Number(payload[k]||0);else delete payload[k]});try{const editing=fundEditing.type==="delivery"&&fundEditing.id
;const url=editing?`/api/funds/delivery-cash-submissions/${encodeURIComponent(fundEditing.id)}`:"/api/funds/delivery-cash-submissions";const res=await fetch(url,{
method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
;const json=await fundReadJsonResponse(res,editing?"Không cập nhật được phiếu nộp quỹ":"Không tạo được phiếu nộp quỹ")
;if(!json.ok)throw new Error(json.message||"Không lưu được phiếu nộp quỹ");fundResetEditing("delivery")
;showMessage(deliveryCashSubmissionMessage,json.message||"Đã lưu phiếu nộp quỹ");await loadDeliveryCashSubmissions();await loadFundLedger();closeFundVoucherModal("delivery")
}catch(err){showMessage(deliveryCashSubmissionMessage,err.message,true)}}function setFundAuxModal(modal,show){if(!modal)return;modal.classList.toggle("show",Boolean(show))
;modal.setAttribute("aria-hidden",show?"false":"true")
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
;if(!json.ok)throw new Error(json.message||"Không xác nhận được phiếu nộp quỹ");await loadDeliveryCashSubmissions();await loadFundLedger();return json}
async function confirmDeliveryCashSubmission(code,triggerButton){if(!code)return;const row=fundRowCache.delivery[code];if(!row){alert("Không tìm thấy dữ liệu phiếu để xác nhận")
;return}const hasShortage=Number(row.differenceCashAmount||0)<0||Number(row.differenceBankAmount||0)<0;if(hasShortage){openDeliveryShortageResolution(row,{mode:"confirm"});return}
if(!confirm(`Xác nhận phiếu nộp quỹ ${code} và ghi vào fundLedgers?`))return;const actionKey=`confirm:delivery:${code}`;try{
const json=await runFundActionRequest(actionKey,triggerButton,()=>executeDeliveryCashSubmissionConfirmation(code,{}));alert(json.message||"Đã ghi sổ quỹ")}catch(err){
alert(err.message||"Không xác nhận được phiếu nộp quỹ")}}window.confirmDeliveryCashSubmission=confirmDeliveryCashSubmission;function classifyDeliveryCashShortages(code){
const row=fundRowCache.delivery[code];if(!row){alert("Không tìm thấy dữ liệu phiếu");return}openDeliveryShortageResolution(row,{mode:"classify"})}
window.classifyDeliveryCashShortages=classifyDeliveryCashShortages;async function submitDeliveryShortageResolution(event){event.preventDefault()
;const row=fundRowCache.delivery[shortageResolutionContext.submissionCode];if(!row){showMessage(deliveryShortageResolutionMessage,"Không tìm thấy dữ liệu phiếu",true);return}
const payload={shortageResolution:{}};if(Number(row.differenceCashAmount||0)<0){const reasonType=String(deliveryCashShortageReason&&deliveryCashShortageReason.value||"").trim()
;if(!reasonType){showMessage(deliveryShortageResolutionMessage,"Cần chọn cách xử lý khoản thiếu tiền mặt",true);return}payload.shortageResolution.cash={reasonType:reasonType,
note:String(deliveryCashShortageNote&&deliveryCashShortageNote.value||"").trim()}}if(Number(row.differenceBankAmount||0)<0){
const reasonType=String(deliveryBankShortageReason&&deliveryBankShortageReason.value||"").trim();if(!reasonType){
showMessage(deliveryShortageResolutionMessage,"Cần chọn cách xử lý khoản thiếu chuyển khoản",true);return}payload.shortageResolution.bank={reasonType:reasonType,
note:String(deliveryBankShortageNote&&deliveryBankShortageNote.value||"").trim()}}try{const mode=shortageResolutionContext.mode;const code=shortageResolutionContext.submissionCode
;const url=mode==="classify"?`/api/funds/delivery-cash-submissions/${encodeURIComponent(code)}/shortages`:`/api/funds/delivery-cash-submissions/${encodeURIComponent(code)}/confirm`
;const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
;const json=await fundReadJsonResponse(res,mode==="classify"?"Không phân loại được khoản thiếu":"Không xác nhận được phiếu nộp quỹ")
;if(!json.ok)throw new Error(json.message||"Không xử lý được khoản thiếu");await loadDeliveryCashSubmissions();await loadFundLedger();closeDeliveryShortageResolutionModal()
;alert(json.message||"Đã xử lý khoản thiếu")}catch(err){showMessage(deliveryShortageResolutionMessage,err.message,true)}}function closeDeliveryShortageRepaymentModal(){
setFundAuxModal(deliveryShortageRepaymentModal,false);activeDeliveryShortageId="";if(deliveryShortageRepaymentForm)deliveryShortageRepaymentForm.reset()
;if(deliveryShortageRepaymentMessage)showMessage(deliveryShortageRepaymentMessage,"")}function deliveryShortageStatusLabel(status){const labels={open:"Chưa nộp bù",
partial:"Đã nộp một phần",settled:"Đã tất toán",pending_reconciliation:"Chờ đối soát ngân hàng",customer_outstanding:"Công nợ khách hàng",adjusted:"Đã điều chỉnh",
disputed:"Chờ kiểm tra"};return labels[String(status||"").toLowerCase()]||String(status||"")}async function loadDeliveryShortageHistory(shortageId){
const res=await fetch(`/api/funds/delivery-cash-shortages/${encodeURIComponent(shortageId)}/history`)
;const json=await fundReadJsonResponse(res,"Không tải được lịch sử khoản thiếu");if(!json.ok)throw new Error(json.message||"Không tải được lịch sử khoản thiếu")
;const shortage=json.shortage||{};const summary=json.summary||{};activeDeliveryShortageId=String(shortage.id||shortage.code||shortageId)
;fundRowCache.shortage[activeDeliveryShortageId]=shortage;if(deliveryShortageRepaymentShortageId)deliveryShortageRepaymentShortageId.value=activeDeliveryShortageId
;if(deliveryShortageRepaymentSummary){
deliveryShortageRepaymentSummary.innerHTML=`\n      <div><span>NVGH</span><b>${escapeHtml(((shortage.deliveryStaffCode||"")+" "+(shortage.deliveryStaffName||"")).trim())}</b></div>\n      <div><span>Thiếu ban đầu</span><b>${money(summary.originalShortageAmount||0)}</b></div>\n      <div><span>Đã nộp bù</span><b>${money(summary.settledAmount||0)}</b></div>\n      <div><span>Phiếu đang chờ</span><b>${money(summary.pendingAmount||0)}</b></div>\n      <div><span>Còn thiếu</span><b>${money(summary.outstandingAmount||0)}</b></div>\n      <div><span>Trạng thái</span><b>${escapeHtml(deliveryShortageStatusLabel(shortage.status))}</b></div>`
}const canRepay=String(shortage.responsibleType||"")==="delivery_staff"&&Number(summary.availableToRepay||0)>0&&["open","partial"].includes(String(shortage.status||""))
;if(deliveryShortageRepaymentForm)deliveryShortageRepaymentForm.hidden=!canRepay;if(deliveryShortageRepaymentAmount){
deliveryShortageRepaymentAmount.max=String(Math.max(0,Number(summary.availableToRepay||0)))
;deliveryShortageRepaymentAmount.value=canRepay?String(Math.max(0,Number(summary.availableToRepay||0))):""}
if(deliveryShortageRepaymentDate&&!deliveryShortageRepaymentDate.value)deliveryShortageRepaymentDate.value=today();const repayments=json.repayments||[];repayments.forEach(r=>{
fundRowCache.repayment[String(r.code||r.id||"")]=r});if(deliveryShortageRepaymentTable){deliveryShortageRepaymentTable.innerHTML=repayments.length?repayments.map(r=>{
const rawCode=String(r.code||r.id||"");const code=fundSafeCode(rawCode);const pending=String(r.status||"").toLowerCase()==="pending"&&!r.fundPosted
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.repaymentDate||"")}</td><td>${escapeHtml(fundTypeName(r.fundType))}</td><td class="price">${money(r.amount||0)}</td><td>${escapeHtml(r.status||"")}</td><td>${pending?`<span class="fund-row-actions"><button type="button" class="secondary compact-action fund-confirm-action" data-fund-action-key="${escapeHtml(`confirm:repayment:${rawCode}`)}" onclick="confirmDeliveryShortageRepayment('${code}',this)">Xác nhận</button></span>`:'<span class="muted">Đã ghi quỹ</span>'}</td></tr>`
}).join(""):'<tr><td colspan="6">Chưa có phiếu nộp bù.</td></tr>'}return json}async function openDeliveryShortageRepayment(shortageId){if(!shortageId)return
;activeDeliveryShortageId=shortageId;if(deliveryShortageRepaymentDate)deliveryShortageRepaymentDate.value=today()
;if(deliveryShortageRepaymentMessage)showMessage(deliveryShortageRepaymentMessage,"");setFundAuxModal(deliveryShortageRepaymentModal,true);try{
await loadDeliveryShortageHistory(shortageId)}catch(err){showMessage(deliveryShortageRepaymentMessage,err.message,true)}}
window.openDeliveryShortageRepayment=openDeliveryShortageRepayment;async function submitDeliveryShortageRepayment(event){event.preventDefault();if(!activeDeliveryShortageId)return
;const payload=Object.fromEntries(new FormData(deliveryShortageRepaymentForm).entries());payload.amount=Number(payload.amount||0);try{
const res=await fetch(`/api/funds/delivery-cash-shortages/${encodeURIComponent(activeDeliveryShortageId)}/repayments`,{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,"Không tạo được phiếu nộp bù");if(!json.ok)throw new Error(json.message||"Không tạo được phiếu nộp bù")
;showMessage(deliveryShortageRepaymentMessage,json.message||"Đã tạo phiếu nộp bù");await loadDeliveryShortageHistory(activeDeliveryShortageId);await loadDeliveryCashSubmissions()
}catch(err){showMessage(deliveryShortageRepaymentMessage,err.message,true)}}async function confirmDeliveryShortageRepayment(code,triggerButton){if(!code)return
;if(!confirm(`Xác nhận phiếu nộp bù ${code} và ghi vào fundLedgers?`))return;const actionKey=`confirm:repayment:${code}`;try{
const json=await runFundActionRequest(actionKey,triggerButton,async()=>{const res=await fetch(`/api/funds/delivery-shortage-repayments/${encodeURIComponent(code)}/confirm`,{
method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const payload=await fundReadJsonResponse(res,"Không xác nhận được phiếu nộp bù")
;if(!payload.ok)throw new Error(payload.message||"Không xác nhận được phiếu nộp bù");await loadDeliveryShortageHistory(activeDeliveryShortageId);await loadDeliveryCashSubmissions()
;await loadFundLedger();return payload});alert(json.message||"Đã xác nhận nộp bù")}catch(err){alert(err.message||"Không xác nhận được phiếu nộp bù")}}
window.confirmDeliveryShortageRepayment=confirmDeliveryShortageRepayment;function editFundVoucher(type,code){const row=(fundRowCache[type]||{})[code];if(!row){
alert("Không tìm thấy dữ liệu phiếu để sửa");return}if(!fundCanEdit(row)){alert("Phiếu đã xác nhận hoặc đã khóa, không được sửa");return}fundResetVoucherForm(type);fundEditing={
type:type,id:code};if(type==="delivery"){fundFillForm(deliveryCashSubmissionForm,row,["deliveryDate","deliveryStaffCode","submittedCashAmount","submittedBankAmount","note"])
;fundSetSubmitLabel(deliveryCashSubmissionForm,"Cập nhật phiếu nộp quỹ")}else if(type==="expense"){
fundFillForm(expenseVoucherForm,row,["date","fundType","expenseType","amount","receiverCode","receiverName","receiverRole","note"])
;fundSetSubmitLabel(expenseVoucherForm,"Cập nhật phiếu chi")}else if(type==="transfer"){fundFillForm(fundTransferForm,row,["date","fromFund","toFund","amount","bankName","note"])
;fundSetSubmitLabel(fundTransferForm,"Cập nhật chuyển quỹ")}openFundVoucherModal(type)}window.editFundVoucher=editFundVoucher
;async function confirmFundVoucher(type,code,triggerButton){if(type==="delivery")return confirmDeliveryCashSubmission(code,triggerButton)
;const label=type==="expense"?"phiếu chi":"phiếu chuyển quỹ";const base=type==="expense"?"/api/funds/expenses":"/api/funds/transfers";if(!code)return
;if(!confirm(`Xác nhận ${label} ${code} và ghi vào fundLedgers?`))return;const actionKey=`confirm:${type}:${code}`;try{
const json=await runFundActionRequest(actionKey,triggerButton,async()=>{const res=await fetch(`${base}/${encodeURIComponent(code)}/confirm`,{method:"POST",headers:{
"Content-Type":"application/json"},body:"{}"});const payload=await fundReadJsonResponse(res,`Không xác nhận được ${label}`)
;if(!payload.ok)throw new Error(payload.message||`Không xác nhận được ${label}`);if(type==="expense")await loadExpenseVouchers();else await loadFundTransfers()
;await loadFundLedger();return payload});alert(json.message||"Đã xác nhận và ghi sổ quỹ")}catch(err){alert(err.message||`Không xác nhận được ${label}`)}}
window.confirmFundVoucher=confirmFundVoucher;
