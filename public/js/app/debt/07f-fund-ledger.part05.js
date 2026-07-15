/* GENERATED FILE — edit public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-01b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-02b.jsfrag, public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag and run npm run build:source-bundles. */
function renderFundLedgerSummary(s={}){const cashEnding=Number(s.cashEndingBalance??s.cashBalance??0);const bankEnding=Number(s.bankEndingBalance??s.bankBalance??0)
;const totalInPeriod=Number(s.filteredRowsTotalIn??s.totalInPeriod??s.totalIn??0);const totalOutPeriod=Number(s.filteredRowsTotalOut??s.totalOutPeriod??s.totalOut??0)
;const dateFrom=String(s.period&&s.period.dateFrom||fundDateFrom&&fundDateFrom.value||"");const dateTo=String(s.period&&s.period.dateTo||fundDateTo&&fundDateTo.value||"")
;if(fundCashBalanceKpi)fundCashBalanceKpi.textContent=money(cashEnding);if(fundBankBalanceKpi)fundBankBalanceKpi.textContent=money(bankEnding)
;if(fundTotalInKpi)fundTotalInKpi.textContent=money(totalInPeriod);if(fundTotalOutKpi)fundTotalOutKpi.textContent=money(totalOutPeriod)
;if(fundCashBalanceLabel)fundCashBalanceLabel.textContent=`Tồn tiền mặt toàn quỹ cuối ngày ${dateTo||""}`.trim()
;if(fundBankBalanceLabel)fundBankBalanceLabel.textContent=`Tồn ngân hàng toàn quỹ cuối ngày ${dateTo||""}`.trim()
;const period=`${dateFrom||""}${dateTo&&dateTo!==dateFrom?"–"+dateTo:""}`;if(fundTotalInLabel)fundTotalInLabel.textContent=`Tổng thu theo bộ lọc ${period}`.trim()
;if(fundTotalOutLabel)fundTotalOutLabel.textContent=`Tổng chi theo bộ lọc ${period}`.trim()
;if(fundSummary)fundSummary.textContent=`Tiền mặt: đầu kỳ ${money(s.cashOpeningBalance||0)} · thu kỳ ${money(s.cashInPeriod??s.cashIn??0)} · chi kỳ ${money(s.cashOutPeriod??s.cashOut??0)} · cuối ngày ${money(cashEnding)} | Ngân hàng: đầu kỳ ${money(s.bankOpeningBalance||0)} · thu kỳ ${money(s.bankInPeriod??s.bankIn??0)} · chi kỳ ${money(s.bankOutPeriod??s.bankOut??0)} · cuối ngày ${money(bankEnding)}`
}async function submitExpenseVoucher(event){event.preventDefault();const payload=Object.fromEntries(new FormData(expenseVoucherForm).entries())
;payload.amount=Number(payload.amount||0);try{const editing=fundEditing.type==="expense"&&fundEditing.id
;const url=editing?`/api/funds/expenses/${encodeURIComponent(fundEditing.id)}`:"/api/funds/expenses";const res=await fetch(url,{method:editing?"PUT":"POST",headers:{
"Content-Type":"application/json"},body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,editing?"Không cập nhật được phiếu chi":"Không ghi được phiếu chi")
;if(!json.ok)throw new Error(json.message||"Không lưu được phiếu chi");expenseVoucherForm.reset();if(expenseVoucherForm.elements.date)expenseVoucherForm.elements.date.value=today()
;fundResetEditing("expense");showMessage(expenseVoucherMessage,json.message||"Đã lưu phiếu chi");await loadExpenseVouchers();await fundRefreshAfterMutation()
;closeFundVoucherModal("expense")}catch(err){showMessage(expenseVoucherMessage,err.message,true)}}async function submitFundTransfer(event){event.preventDefault()
;const payload=Object.fromEntries(new FormData(fundTransferForm).entries());payload.amount=Number(payload.amount||0);try{const editing=fundEditing.type==="transfer"&&fundEditing.id
;const url=editing?`/api/funds/transfers/${encodeURIComponent(fundEditing.id)}`:"/api/funds/transfers";const res=await fetch(url,{method:editing?"PUT":"POST",headers:{
"Content-Type":"application/json"},body:JSON.stringify(payload)});const json=await fundReadJsonResponse(res,editing?"Không cập nhật được chuyển quỹ":"Không ghi được chuyển quỹ")
;if(!json.ok)throw new Error(json.message||"Không lưu được chuyển quỹ");fundTransferForm.reset();if(fundTransferForm.elements.date)fundTransferForm.elements.date.value=today()
;fundResetEditing("transfer");showMessage(fundTransferMessage,json.message||"Đã lưu chuyển quỹ");await loadFundTransfers();await fundRefreshAfterMutation()
;closeFundVoucherModal("transfer")}catch(err){showMessage(fundTransferMessage,err.message,true)}}function reloadActiveFundTab(){
if(activeFundTab==="fundDashboard")return loadFundDashboard();if(activeFundTab==="fundLedger")return loadFundLedger()
;if(activeFundTab==="fundSummaryBook"&&window.FundSummaryBook)return window.FundSummaryBook.load();if(activeFundTab==="deliverySubmission")return loadDeliveryCashSubmissions()
;if(activeFundTab==="expenseVoucher")return loadExpenseVouchers();if(activeFundTab==="bankTransfer")return loadFundTransfers();return Promise.resolve()}function resetFundFilters(){
fundDashboardActiveFilter="";if(fundSearchInput)fundSearchInput.value="";if(fundDateFrom)fundDateFrom.value="";if(fundDateTo)fundDateTo.value=""
;if(fundTypeFilter)fundTypeFilter.value="all";if(fundDirectionFilter)fundDirectionFilter.value="all";return reloadActiveFundTab()}
if(!document.documentElement.dataset.fundSecurityDelegationBound){document.documentElement.dataset.fundSecurityDelegationBound="1";document.addEventListener("click",event=>{
const button=event.target.closest("[data-fund-action]");if(!button)return;const action=button.dataset.fundAction;const type=button.dataset.fundType||""
;const code=button.dataset.fundCode||"";if(action==="edit")editFundVoucher(type,code);if(action==="confirm")confirmFundVoucher(type,code,button)
;if(action==="classify-shortage")classifyDeliveryCashShortages(code);if(action==="open-shortage")openDeliveryShortageRepayment(button.dataset.shortageKey||"")
;if(action==="confirm-repayment")confirmDeliveryShortageRepayment(code,button)
;if(action==="confirm-remittance-line")confirmDeliveryRemittanceLine(code,button.dataset.lineId||"",button)})}document.addEventListener("click",event=>{
const button=event.target.closest("[data-fund-dashboard-jump]");if(button)handleFundDashboardJump(button)})
;if(fundTabButtons)fundTabButtons.forEach(btn=>btn.addEventListener("click",()=>setActiveFundTab(btn.dataset.fundTab)))
;document.querySelector('.tab-button[data-tab="fundsTab"]')?.addEventListener("click",()=>{if(activeFundTab==="fundDashboard"&&!fundDashboardLoaded)loadFundDashboard({force:true})
});if(deliverySubmissionTabButtons)deliverySubmissionTabButtons.forEach(btn=>btn.addEventListener("click",()=>setActiveDeliverySubmissionTab(btn.dataset.deliverySubtab)))
;bindFundVoucherModal("delivery",createDeliveryCashSubmissionButton,closeDeliveryCashSubmissionModalButton)
;bindFundVoucherModal("expense",createExpenseVoucherButton,closeExpenseVoucherModalButton);bindFundVoucherModal("transfer",createFundTransferButton,closeFundTransferModalButton)
;document.addEventListener("keydown",event=>{if(event.key!=="Escape")return
;if(fundConfirmPreviewModal&&fundConfirmPreviewModal.classList.contains("show"))return closeFundConfirmPreview()
;if(deliveryShortageResolutionModal&&deliveryShortageResolutionModal.classList.contains("show"))return closeDeliveryShortageResolutionModal()
;if(deliveryShortageRepaymentModal&&deliveryShortageRepaymentModal.classList.contains("show"))return closeDeliveryShortageRepaymentModal()
;if(activeFundVoucherModalType)closeFundVoucherModal(activeFundVoucherModalType)});if(applyFundFiltersButton)applyFundFiltersButton.addEventListener("click",reloadActiveFundTab)
;if(clearFundFiltersButton)clearFundFiltersButton.addEventListener("click",resetFundFilters)
;if(reloadFundLedgerButton)reloadFundLedgerButton.addEventListener("click",reloadActiveFundTab)
;if(fundDashboardRefreshButton)fundDashboardRefreshButton.addEventListener("click",()=>loadFundDashboard({force:true}))
;if(fundDashboardAsOf)fundDashboardAsOf.addEventListener("change",()=>loadFundDashboard({force:true}))
;if(fundConfirmPreviewCancelButton)fundConfirmPreviewCancelButton.addEventListener("click",closeFundConfirmPreview)
;if(fundConfirmPreviewSubmitButton)fundConfirmPreviewSubmitButton.addEventListener("click",submitFundConfirmPreview)
;if(fundConfirmPreviewModal)fundConfirmPreviewModal.addEventListener("click",event=>{if(event.target===fundConfirmPreviewModal)closeFundConfirmPreview()})
;if(fundSearchInput)fundSearchInput.addEventListener("keydown",event=>{if(event.key!=="Enter")return;event.preventDefault();reloadActiveFundTab()})
;if(deliveryCashSubmissionDate)deliveryCashSubmissionDate.addEventListener("change",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))
;if(deliveryCashSubmissionStaffCode){deliveryCashSubmissionStaffCode.addEventListener("input",()=>scheduleDeliveryCashSubmissionPreview())
;deliveryCashSubmissionStaffCode.addEventListener("change",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))
;deliveryCashSubmissionStaffCode.addEventListener("blur",()=>scheduleDeliveryCashSubmissionPreview({immediate:true}))}
if(addDeliveryCashLineButton)addDeliveryCashLineButton.addEventListener("click",()=>addDeliveryRemittanceLine("cash"))
;if(addDeliveryBankLineButton)addDeliveryBankLineButton.addEventListener("click",()=>addDeliveryRemittanceLine("bank"));if(deliveryRemittanceLineTable){
deliveryRemittanceLineTable.addEventListener("input",event=>{if(!event.target.closest("[data-remittance-field]"))return;collectDeliveryRemittanceLines()
;updateDeliveryCashSubmissionDifference()});deliveryRemittanceLineTable.addEventListener("change",event=>{if(!event.target.closest("[data-remittance-field]"))return
;const methodChanged=event.target.dataset.remittanceField==="method";collectDeliveryRemittanceLines();if(methodChanged)renderDeliveryRemittanceLineEditor()
;updateDeliveryCashSubmissionDifference()});deliveryRemittanceLineTable.addEventListener("click",event=>{const button=event.target.closest("[data-remittance-remove]")
;if(!button)return;const index=Number(button.dataset.remittanceRemove);const line=deliveryRemittanceLines[index];if(line&&(line.status==="confirmed"||line.fundLedgerId)){
alert("Dòng đã ghi quỹ không được xóa");return}deliveryRemittanceLines.splice(index,1);renderDeliveryRemittanceLineEditor();updateDeliveryCashSubmissionDifference()})}
if(deliveryCashSubmissionForm)deliveryCashSubmissionForm.addEventListener("submit",submitDeliveryCashSubmission)
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
;clearDeliveryCashSubmissionPreview();setActiveDeliverySubmissionTab("cash");if(fundDashboardAsOf&&!fundDashboardAsOf.value)fundDashboardAsOf.value=today()
;setActiveFundTab("fundDashboard",{reload:document.getElementById("fundsTab")?.classList.contains("active")});
