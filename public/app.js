// App bootstrap: module files are loaded before this file in index.html.
// Product/customer list uses server-side pagination; search resets to page 1.
// Không dùng popup autocomplete ở màn danh sách; gõ là lọc trực tiếp bảng.
function debounce(fn, wait=250){let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}}
const debouncedLoadProducts=debounce(()=>loadProducts({resetPage:true}),250);
const debouncedLoadCustomers=debounce(()=>loadCustomers({resetPage:true}),250);
if(searchInput)searchInput.addEventListener('input',()=>{if(window.SearchAutocomplete){window.SearchAutocomplete.hide(document.getElementById('productListSuggestions'));}debouncedLoadProducts();});
if(productPrevPage)productPrevPage.addEventListener('click',()=>{productPage=Math.max(1,productPage-1);loadProducts();});
if(productNextPage)productNextPage.addEventListener('click',()=>{productPage=Math.min(productTotalPages||1,productPage+1);loadProducts();});
if(productPageSizeSelect)productPageSizeSelect.addEventListener('change',()=>{productPageSize=Number(productPageSizeSelect.value||50);productPage=1;loadProducts();});
if(customerSearchInput)customerSearchInput.addEventListener('input',()=>{if(window.SearchAutocomplete){window.SearchAutocomplete.hide(document.getElementById('customerListSuggestions'));}debouncedLoadCustomers();});
if(customerTable)customerTable.addEventListener('change',event=>{const check=event.target.closest('.customer-row-check');if(!check)return;if(check.checked)selectedCustomerIds.add(check.dataset.id);else selectedCustomerIds.delete(check.dataset.id);updateCustomerBulkUI();});
if(customerCheckAll)customerCheckAll.addEventListener('change',()=>{getCustomerPageRows().forEach(c=>{if(!c.id)return;if(customerCheckAll.checked)selectedCustomerIds.add(c.id);else selectedCustomerIds.delete(c.id)});renderCustomerTable();});
if(customerPrevPage)customerPrevPage.addEventListener('click',()=>{customerPage=Math.max(1,customerPage-1);loadCustomers();});
if(customerNextPage)customerNextPage.addEventListener('click',()=>{customerPage=Math.min(getCustomerTotalPages(),customerPage+1);loadCustomers();});
if(customerPageSizeSelect)customerPageSizeSelect.addEventListener('change',()=>{customerPageSize=Number(customerPageSizeSelect.value||50);customerPage=1;loadCustomers();});
if(bulkDeleteCustomerButton)bulkDeleteCustomerButton.addEventListener('click',bulkDeleteCustomers);
initConfiguredAutocomplete();
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(importForm){importForm.addEventListener('submit',submitImportOrder);importForm.elements.date.value=today()}
if(addSalesItemButton)addSalesItemButton.addEventListener('click',addSalesItem);
if(salesForm){salesForm.addEventListener('submit',submitSalesOrder);salesForm.elements.date.value=today()}

if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);if(debtCollectionForm.elements.date)debtCollectionForm.elements.date.value=today()}
if(debtPaymentAmount)debtPaymentAmount.addEventListener('input',updateDebtSelectionSummary);
if(clearDebtCustomerButton)clearDebtCustomerButton.addEventListener('click',clearDebtCustomerSelection);

if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);cashbookForm.elements.date.value=today()}

function setTodayRange(fromEl, toEl){
  const d=today();
  if(fromEl && !fromEl.value)fromEl.value=d;
  if(toEl && !toEl.value)toEl.value=d;
}
function setDefaultDocumentDateFilters(){
  setTodayRange(salesOrderDateFrom, salesOrderDateTo);
  setTodayRange(masterOrderDateFrom, masterOrderDateTo);
  setTodayRange(returnOrderDateFrom, returnOrderDateTo);
  setTodayRange(masterReturnOrderDateFrom, masterReturnOrderDateTo);
  if(unmergedDateFilter && !unmergedDateFilter.value)unmergedDateFilter.value=today();
  if(deliveryDateFilter && !deliveryDateFilter.value)deliveryDateFilter.value=today();
  if(masterReturnDate && !masterReturnDate.value)masterReturnDate.value=today();
}
setDefaultDocumentDateFilters();

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(typeof resetDebtFilters==='function')resetDebtFilters({load:false});
if(debtSearchInput)debtSearchInput.addEventListener('input',loadDebts);
[debtSalesmanFilter,debtDeliveryFilter,debtStatusFilter,debtDateFrom,debtDateTo].forEach(el=>{if(el)el.addEventListener('input',loadDebts);if(el)el.addEventListener('change',loadDebts);});
if(debtClearFiltersButton)debtClearFiltersButton.addEventListener('click',()=>resetDebtFilters());
if(receiptSearchInput)receiptSearchInput.addEventListener('input',loadReceipts);
if(returnOrderSearchInput)returnOrderSearchInput.addEventListener('input',loadReturnOrders);
if(returnOrderDateFrom)returnOrderDateFrom.addEventListener('change',loadReturnOrders);
if(returnOrderDateTo)returnOrderDateTo.addEventListener('change',loadReturnOrders);
if(reloadReturnOrdersButton)reloadReturnOrdersButton.addEventListener('click',loadReturnOrders);
if(reloadUnmergedReturnOrdersButton)reloadUnmergedReturnOrdersButton.addEventListener('click',loadUnmergedReturnOrders);
if(masterReturnOrderForm)masterReturnOrderForm.addEventListener('submit',submitMasterReturnOrder);
if(clearMasterReturnSelectionButton)clearMasterReturnSelectionButton.addEventListener('click',()=>{selectedReturnOrderIdsForMaster.clear();loadUnmergedReturnOrders();});
if(unmergedReturnOrderTable)unmergedReturnOrderTable.addEventListener('change',event=>{const check=event.target.closest('.master-return-check');if(!check)return;if(check.checked)selectedReturnOrderIdsForMaster.add(check.dataset.id);else selectedReturnOrderIdsForMaster.delete(check.dataset.id);if(unmergedReturnOrderSummary)unmergedReturnOrderSummary.textContent=unmergedReturnOrderSummary.textContent.replace(/Đã chọn \d+$/,'Đã chọn '+selectedReturnOrderIdsForMaster.size);});
if(masterReturnDeliveryStaff)masterReturnDeliveryStaff.addEventListener('input',loadUnmergedReturnOrders);
// masterReturnDate là ngày tạo đơn tổng/kho nhận, không dùng để lọc phiếu chưa gộp.
// if(masterReturnDate)masterReturnDate.addEventListener('change',loadUnmergedReturnOrders);
if(reloadMasterReturnOrdersButton)reloadMasterReturnOrdersButton.addEventListener('click',loadMasterReturnOrders);
if(masterReturnOrderSearchInput)masterReturnOrderSearchInput.addEventListener('input',loadMasterReturnOrders);
if(masterReturnOrderDateFrom)masterReturnOrderDateFrom.addEventListener('change',loadMasterReturnOrders);
if(masterReturnOrderDateTo)masterReturnOrderDateTo.addEventListener('change',loadMasterReturnOrders);
window.cancelMasterReturnOrder=cancelMasterReturnOrder;
window.viewMasterReturnOrder=viewMasterReturnOrder;
window.receiveMasterReturnOrder=receiveMasterReturnOrder;
window.printMasterReturnOrder=printMasterReturnOrder;
debtInnerTabs.forEach(btn=>btn.addEventListener('click',()=>setDebtPanel(btn.dataset.debtPanel)));
window.voidReceipt=voidReceipt;
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',loadCashbook);
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',commitImportExcel);
if(addImportMappingButton)addImportMappingButton.addEventListener('click',()=>{if(customImportMappingTable)customImportMappingTable.insertAdjacentHTML('beforeend',createMappingRow({}))});
if(customImportMappingTable)customImportMappingTable.addEventListener('click',event=>{const btn=event.target.closest('.remove-custom-map');if(!btn)return;btn.closest('tr')?.remove();if(!customImportMappingTable.children.length)renderCustomImportMapping([]);});
if(saveCustomImportTemplateButton)saveCustomImportTemplateButton.addEventListener('click',saveCustomImportTemplate);
if(loadCustomImportTemplateButton)loadCustomImportTemplateButton.addEventListener('click',loadSelectedCustomTemplateToEditor);
if(downloadCustomImportTemplateButton)downloadCustomImportTemplateButton.addEventListener('click',downloadCustomImportTemplate);
if(deleteCustomImportTemplateButton)deleteCustomImportTemplateButton.addEventListener('click',deleteCustomImportTemplate);
if(importDataType)importDataType.addEventListener('change',async()=>{importPreviewRows=[];if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chưa có dữ liệu preview.</td></tr>';if(commitImportButton)commitImportButton.disabled=true;resetImportPreviewMessage();await loadImportFieldOptions();await loadCustomImportTemplates();});
if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',loadImportOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',loadSalesOrders);
if(salesOrderSearchInput)salesOrderSearchInput.addEventListener('input',loadSalesOrders);
if(salesOrderSourceFilter)salesOrderSourceFilter.addEventListener('change',loadSalesOrders);
if(salesOrderDateFrom)salesOrderDateFrom.addEventListener('change',loadSalesOrders);
if(salesOrderDateTo)salesOrderDateTo.addEventListener('change',loadSalesOrders);
if(salesOrderStaffFilter)salesOrderStaffFilter.addEventListener('input',loadSalesOrders);
if(printSelectedSalesOrdersButton)printSelectedSalesOrdersButton.addEventListener('click',printSelectedSalesOrders);

if(reloadMasterOrdersButton)reloadMasterOrdersButton.addEventListener('click',loadMasterOrderModule);
if(masterOrderForm){masterOrderForm.addEventListener('submit',submitMasterOrder);if(masterOrderForm.elements.deliveryDate)masterOrderForm.elements.deliveryDate.value=today();else if(masterOrderForm.elements.date)masterOrderForm.elements.date.value=today()}
if(unmergedOrderSearch)unmergedOrderSearch.addEventListener('input',loadUnmergedChildOrders);
if(unmergedSourceFilter)unmergedSourceFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateFilter)unmergedDateFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedSalesStaffFilter)unmergedSalesStaffFilter.addEventListener('input',loadUnmergedChildOrders);
if(selectAllUnmergedOrdersButton)selectAllUnmergedOrdersButton.addEventListener('click',toggleSelectAllUnmergedOrders);
if(masterOrderSearch)masterOrderSearch.addEventListener('input',loadMasterOrders);
if(masterOrderDateFrom)masterOrderDateFrom.addEventListener('change',loadMasterOrders);
if(masterOrderDateTo)masterOrderDateTo.addEventListener('change',loadMasterOrders);
if(printSelectedMasterOrdersButton)printSelectedMasterOrdersButton.addEventListener('click',printSelectedMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedChildOrderIds.add(check.dataset.id);else selectedChildOrderIds.delete(check.dataset.id);renderUnmergedChildOrders();});
if(reloadDeliveryTodayButton)reloadDeliveryTodayButton.addEventListener('click',loadDeliveryToday);
if(deliveryDateFilter){if(!deliveryDateFilter.value)deliveryDateFilter.value=today();deliveryDateFilter.addEventListener('change',loadDeliveryToday);}
if(deliverySearchInput)deliverySearchInput.addEventListener('input',loadDeliveryToday);
if(deliverySalesmanFilter)deliverySalesmanFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStaffFilter)deliveryStaffFilter.addEventListener('input',loadDeliveryToday);
if(deliveryRouteFilter)deliveryRouteFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStatusFilter)deliveryStatusFilter.addEventListener('change',loadDeliveryToday);
if(deliveryEditForm)deliveryEditForm.addEventListener('submit',submitDeliveryEdit);
if(deliveryEditResetButton)deliveryEditResetButton.addEventListener('click',clearDeliveryEditPanel);
[deliveryEditDebtBefore,deliveryEditCash,deliveryEditBank,deliveryEditReturn].filter(Boolean).forEach(input=>input.addEventListener('input',recalcDeliveryEditDebt));
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);
if(userForm)userForm.addEventListener('submit',submitUser);
if(resetUserButton)resetUserButton.addEventListener('click',resetUserForm);
if(userSearchInput)userSearchInput.addEventListener('input',loadUsers);
if(promotionForm)promotionForm.addEventListener('submit',submitPromotion);
if(resetPromotionButton)resetPromotionButton.addEventListener('click',resetPromotionForm);
if(promotionSearchInput)promotionSearchInput.addEventListener('input',loadPromotions);

setupTabs();
loadImportFieldOptions();
loadCustomImportTemplates();
checkServer();
loadProducts();
loadCustomers();
loadStock();
loadImportOrders();
loadSalesOrders();
loadMasterOrderModule();
loadUnmergedReturnOrders();
loadMasterReturnOrders();
loadDeliveryToday();
loadDebts();
loadReceipts();
loadCashbook();
loadUsers();
loadPromotions();
setReportDefaults();
renderImportItems();
renderSalesItems();
