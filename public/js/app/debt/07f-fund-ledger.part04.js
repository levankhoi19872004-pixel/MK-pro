/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
function classifyDeliveryCashShortages(code){const row=fundRowCache.delivery[code];if(!row){alert("Không tìm thấy dữ liệu phiếu");return}openDeliveryShortageResolution(row,{
mode:"classify"})}window.classifyDeliveryCashShortages=classifyDeliveryCashShortages;async function submitDeliveryShortageResolution(event){event.preventDefault()
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
;return`<tr><td><strong>${escapeHtml(r.code||"")}</strong></td><td>${escapeHtml(r.repaymentDate||"")}</td><td>${escapeHtml(fundTypeName(r.fundType))}</td><td class="price">${money(r.amount||0)}</td><td>${escapeHtml(r.status||"")}</td><td>${pending?`<span class="fund-row-actions"><button type="button" class="secondary compact-action fund-confirm-action" data-fund-action-key="${escapeHtml(`confirm:repayment:${rawCode}`)}" data-fund-action="confirm-repayment" data-fund-code="${escapeHtml(rawCode)}">Xác nhận</button></span>`:'<span class="muted">Đã ghi quỹ</span>'}</td></tr>`
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
type:type,id:code};if(type==="delivery"){fundFillForm(deliveryCashSubmissionForm,row,["deliveryDate","deliveryStaffCode","note"])
;setDeliveryRemittanceLines(row.remittanceLines||[]);fundSetSubmitLabel(deliveryCashSubmissionForm,"Cập nhật phiếu nộp quỹ")}else if(type==="expense"){
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
