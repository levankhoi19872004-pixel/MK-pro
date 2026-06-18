/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
async function submitExpenseVoucher(event){event.preventDefault();const payload=Object.fromEntries(new FormData(expenseVoucherForm).entries())
;payload.amount=Number(payload.amount||0);try{const editing=fundEditing.type==="expense"&&fundEditing.id
;const url=editing?`/api/funds/expenses/${encodeURIComponent(fundEditing.id)}`:"/api/funds/expenses";const res=await fetch(url,{method:editing?"PUT":"POST",headers:{
"Content-Type":"application/json"},body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,editing?"Không cập nhật được phiếu chi":"Không ghi được phiếu chi")
;if(!json.ok)throw new Error(json.message||"Không lưu được phiếu chi");expenseVoucherForm.reset();if(expenseVoucherForm.elements.date)expenseVoucherForm.elements.date.value=today()
;fundResetEditing("expense");showMessage(expenseVoucherMessage,json.message||"Đã lưu phiếu chi");await loadExpenseVouchers();await loadFundLedger();closeFundVoucherModal("expense")
}catch(err){showMessage(expenseVoucherMessage,err.message,true)}}async function submitFundTransfer(event){event.preventDefault()
;const payload=Object.fromEntries(new FormData(fundTransferForm).entries());payload.amount=Number(payload.amount||0);try{const editing=fundEditing.type==="transfer"&&fundEditing.id
;const url=editing?`/api/funds/transfers/${encodeURIComponent(fundEditing.id)}`:"/api/funds/transfers";const res=await fetch(url,{method:editing?"PUT":"POST",headers:{
"Content-Type":"application/json"},body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,editing?"Không cập nhật được chuyển quỹ":"Không ghi được chuyển quỹ")
;if(!json.ok)throw new Error(json.message||"Không lưu được chuyển quỹ");fundTransferForm.reset();if(fundTransferForm.elements.date)fundTransferForm.elements.date.value=today()
;fundResetEditing("transfer");showMessage(fundTransferMessage,json.message||"Đã lưu chuyển quỹ");await loadFundTransfers();await loadFundLedger();closeFundVoucherModal("transfer")
}catch(err){showMessage(fundTransferMessage,err.message,true)}}function reloadActiveFundTab(){
if(activeFundTab==="fundLedger")loadFundLedger();else if(activeFundTab==="deliverySubmission")loadDeliveryCashSubmissions();else if(activeFundTab==="expenseVoucher")loadExpenseVouchers();else if(activeFundTab==="bankTransfer")loadFundTransfers()
}if(fundTabButtons)fundTabButtons.forEach(btn=>btn.addEventListener("click",()=>setActiveFundTab(btn.dataset.fundTab)))
;if(deliverySubmissionTabButtons)deliverySubmissionTabButtons.forEach(btn=>btn.addEventListener("click",()=>setActiveDeliverySubmissionTab(btn.dataset.deliverySubtab)))
;bindFundVoucherModal("delivery",createDeliveryCashSubmissionButton,closeDeliveryCashSubmissionModalButton)
;bindFundVoucherModal("expense",createExpenseVoucherButton,closeExpenseVoucherModalButton);bindFundVoucherModal("transfer",createFundTransferButton,closeFundTransferModalButton)
;document.addEventListener("keydown",event=>{if(event.key!=="Escape")return
;if(deliveryShortageResolutionModal&&deliveryShortageResolutionModal.classList.contains("show"))return closeDeliveryShortageResolutionModal()
;if(deliveryShortageRepaymentModal&&deliveryShortageRepaymentModal.classList.contains("show"))return closeDeliveryShortageRepaymentModal()
;if(activeFundVoucherModalType)closeFundVoucherModal(activeFundVoucherModalType)});if(reloadFundLedgerButton)reloadFundLedgerButton.addEventListener("click",()=>{loadFundLedger()
;loadDeliveryCashSubmissions();loadExpenseVouchers();loadFundTransfers()});if(fundSearchInput)fundSearchInput.addEventListener("input",debounce(reloadActiveFundTab,300))
;[fundDateFrom,fundDateTo,fundTypeFilter,fundDirectionFilter].forEach(el=>{if(el)el.addEventListener("change",loadFundLedger)})
;if(deliveryCashSubmissionDate)deliveryCashSubmissionDate.addEventListener("change",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))
;if(deliveryCashSubmissionStaffCode){deliveryCashSubmissionStaffCode.addEventListener("input",()=>scheduleDeliveryCashSubmissionPreview())
;deliveryCashSubmissionStaffCode.addEventListener("change",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))
;deliveryCashSubmissionStaffCode.addEventListener("blur",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))}
[deliveryCashSubmissionCashInput,deliveryCashSubmissionBankInput].forEach(el=>{if(el)el.addEventListener("input",updateDeliveryCashSubmissionDifference)})
;if(deliveryCashSubmissionForm)deliveryCashSubmissionForm.addEventListener("submit",submitDeliveryCashSubmission)
;if(deliveryShortageResolutionForm)deliveryShortageResolutionForm.addEventListener("submit",submitDeliveryShortageResolution)
;if(deliveryShortageRepaymentForm)deliveryShortageRepaymentForm.addEventListener("submit",submitDeliveryShortageRepayment)
;if(closeDeliveryShortageResolutionModalButton)closeDeliveryShortageResolutionModalButton.addEventListener("click",closeDeliveryShortageResolutionModal)
;if(closeDeliveryShortageRepaymentModalButton)closeDeliveryShortageRepaymentModalButton.addEventListener("click",closeDeliveryShortageRepaymentModal)
;if(deliveryShortageResolutionModal)deliveryShortageResolutionModal.addEventListener("click",event=>{
if(event.target===deliveryShortageResolutionModal)closeDeliveryShortageResolutionModal()})
;if(deliveryShortageRepaymentModal)deliveryShortageRepaymentModal.addEventListener("click",event=>{
if(event.target===deliveryShortageRepaymentModal)closeDeliveryShortageRepaymentModal()});if(expenseVoucherForm)expenseVoucherForm.addEventListener("submit",submitExpenseVoucher)
;if(fundTransferForm)fundTransferForm.addEventListener("submit",submitFundTransfer)
;[deliveryCashSubmissionForm,expenseVoucherForm,fundTransferForm,deliveryShortageRepaymentForm].forEach(form=>{if(form&&form.elements.date)form.elements.date.value=today()
;if(form&&form.elements.deliveryDate)form.elements.deliveryDate.value=today();if(form&&form.elements.repaymentDate)form.elements.repaymentDate.value=today()})
;clearDeliveryCashSubmissionPreview();setActiveDeliverySubmissionTab("cash");loadFundLedger();
