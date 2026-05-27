resetButton.addEventListener('click',resetForm);
searchInput.addEventListener('input',loadProducts);
customerSearchInput.addEventListener('input',loadCustomers);

if(importProductSelect)importProductSelect.addEventListener('change',syncImportCostPrice);
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(importForm){importForm.addEventListener('submit',submitImportOrder);importForm.elements.date.value=today()}

if(salesProductSelect)salesProductSelect.addEventListener('change',syncSalesPrice);
if(addSalesItemButton)addSalesItemButton.addEventListener('click',addSalesItem);
if(salesForm){salesForm.addEventListener('submit',submitSalesOrder);salesForm.elements.date.value=today()}

if(collectionCustomerSelect)collectionCustomerSelect.addEventListener('change',updateSelectedCustomerDebt);
if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);debtCollectionForm.elements.date.value=today()}

if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);cashbookForm.elements.date.value=today()}

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(debtSearchInput)debtSearchInput.addEventListener('input',loadDebts);
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',loadCashbook);
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',commitImportExcel);
if(importDataType)importDataType.addEventListener('change',()=>{importPreviewRows=[];if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chưa có dữ liệu preview.</td></tr>';if(commitImportButton)commitImportButton.disabled=true;resetImportPreviewMessage();});
if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',loadImportOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',loadSalesOrders);
if(salesOrderSearchInput)salesOrderSearchInput.addEventListener('input',loadSalesOrders);
if(salesOrderSourceFilter)salesOrderSourceFilter.addEventListener('change',loadSalesOrders);

if(reloadMasterOrdersButton)reloadMasterOrdersButton.addEventListener('click',loadMasterOrderModule);
if(masterOrderForm){masterOrderForm.addEventListener('submit',submitMasterOrder);masterOrderForm.elements.date.value=today()}
if(unmergedOrderSearch)unmergedOrderSearch.addEventListener('input',loadUnmergedChildOrders);
if(unmergedSourceFilter)unmergedSourceFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateFilter)unmergedDateFilter.addEventListener('change',loadUnmergedChildOrders);
if(masterOrderSearch)masterOrderSearch.addEventListener('input',loadMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedChildOrderIds.add(check.dataset.id);else selectedChildOrderIds.delete(check.dataset.id);renderUnmergedChildOrders();});
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);

setupTabs();
checkServer();
loadProducts();
loadCustomers();
loadStock();
loadImportOrders();
loadSalesOrders();
loadMasterOrderModule();
loadDebts();
loadCashbook();
setReportDefaults();
renderImportItems();
renderSalesItems();
