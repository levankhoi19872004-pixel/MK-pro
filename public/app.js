// App bootstrap: module files are loaded before this file in index.html.
if(window.CatalogCache) window.CatalogCache.preloadAll({force:false}).catch(err=>console.warn('Không preload được catalog:',err.message||err));
if(customerSearchInput)customerSearchInput.addEventListener('input',loadCustomers);
if(customerTable)customerTable.addEventListener('change',event=>{const check=event.target.closest('.customer-row-check');if(!check)return;if(check.checked)selectedCustomerIds.add(check.dataset.id);else selectedCustomerIds.delete(check.dataset.id);updateCustomerBulkUI();});
if(customerCheckAll)customerCheckAll.addEventListener('change',()=>{getCustomerPageRows().forEach(c=>{if(!c.id)return;if(customerCheckAll.checked)selectedCustomerIds.add(c.id);else selectedCustomerIds.delete(c.id)});renderCustomerTable();});
if(customerPrevPage)customerPrevPage.addEventListener('click',()=>{customerPage=Math.max(1,customerPage-1);renderCustomerTable();});
if(customerNextPage)customerNextPage.addEventListener('click',()=>{customerPage=Math.min(getCustomerTotalPages(),customerPage+1);renderCustomerTable();});
if(customerPageSizeSelect)customerPageSizeSelect.addEventListener('change',()=>{customerPageSize=Number(customerPageSizeSelect.value||50);customerPage=1;renderCustomerTable();});
if(bulkDeleteCustomerButton)bulkDeleteCustomerButton.addEventListener('click',bulkDeleteCustomers);
initConfiguredAutocomplete();
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(importForm){importForm.addEventListener('submit',submitImportOrder);importForm.elements.date.value=today()}
if(addSalesItemButton)addSalesItemButton.addEventListener('click',addSalesItem);
if(salesForm){salesForm.addEventListener('submit',submitSalesOrder);salesForm.elements.date.value=today()}

if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);debtCollectionForm.elements.date.value=today()}

if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);cashbookForm.elements.date.value=today()}

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(debtSearchInput)debtSearchInput.addEventListener('input',loadDebts);
[debtSalesmanFilter,debtDeliveryFilter,debtStatusFilter,debtDateFrom,debtDateTo].forEach(el=>{if(el)el.addEventListener('input',loadDebts);if(el)el.addEventListener('change',loadDebts);});
if(receiptSearchInput)receiptSearchInput.addEventListener('input',loadReceipts);
if(returnOrderSearchInput)returnOrderSearchInput.addEventListener('input',loadReturnOrders);
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
if(masterOrderSearch)masterOrderSearch.addEventListener('input',loadMasterOrders);
if(masterOrderDateFrom)masterOrderDateFrom.addEventListener('change',loadMasterOrders);
if(masterOrderDateTo)masterOrderDateTo.addEventListener('change',loadMasterOrders);
if(printSelectedMasterOrdersButton)printSelectedMasterOrdersButton.addEventListener('click',printSelectedMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedChildOrderIds.add(check.dataset.id);else selectedChildOrderIds.delete(check.dataset.id);renderUnmergedChildOrders();});
if(reloadDeliveryTodayButton)reloadDeliveryTodayButton.addEventListener('click',loadDeliveryToday);
if(deliveryDateFilter){deliveryDateFilter.value=today();deliveryDateFilter.addEventListener('change',loadDeliveryToday);}
if(deliverySearchInput)deliverySearchInput.addEventListener('input',loadDeliveryToday);
if(deliverySalesmanFilter)deliverySalesmanFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStaffFilter)deliveryStaffFilter.addEventListener('input',loadDeliveryToday);
if(deliveryRouteFilter)deliveryRouteFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStatusFilter)deliveryStatusFilter.addEventListener('change',loadDeliveryToday);
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
loadSalesProductCatalog();
loadCustomers();
loadStock();
loadImportOrders();
loadSalesOrders();
loadMasterOrderModule();
loadDeliveryToday();
loadDebts();
loadReceipts();
loadCashbook();
loadUsers();
loadPromotions();
setReportDefaults();
renderImportItems();
renderSalesItems();
