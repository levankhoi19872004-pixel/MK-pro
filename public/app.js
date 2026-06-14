// App bootstrap: module files are loaded before this file in index.html.
// Product/customer list uses server-side pagination; search resets to page 1.
// Không dùng popup autocomplete ở màn danh sách; gõ là lọc trực tiếp bảng.
const debounce = window.debounce || ((fn, wait=250)=>{let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}});
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
  setTodayRange(unmergedDateFrom, unmergedDateTo);
  if(deliveryDateFilter && !deliveryDateFilter.value)deliveryDateFilter.value=today();
  if(masterReturnDate && !masterReturnDate.value)masterReturnDate.value=today();
}
setDefaultDocumentDateFilters();

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(typeof resetDebtFilters==='function')resetDebtFilters({load:false});
const debouncedLoadDebts=debounce(()=>loadDebts(),300);
if(debtSearchInput){
  debtSearchInput.addEventListener('input',debouncedLoadDebts);
  debtSearchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadDebts();}});
}
[debtSalesmanFilter,debtDeliveryFilter].forEach(el=>{if(el)el.addEventListener('input',debouncedLoadDebts);});
if(debtStatusFilter)debtStatusFilter.addEventListener('change',loadDebts);
if(debtClearFiltersButton)debtClearFiltersButton.addEventListener('click',()=>resetDebtFilters());
if(receiptSearchInput)receiptSearchInput.addEventListener('input',loadReceipts);
if(returnOrderSearchInput)returnOrderSearchInput.addEventListener('input',loadReturnOrders);
if(returnOrderDateFrom)returnOrderDateFrom.addEventListener('change',loadReturnOrders);
if(returnOrderDateTo)returnOrderDateTo.addEventListener('change',loadReturnOrders);
if(reloadReturnOrdersButton)reloadReturnOrdersButton.addEventListener('click',loadReturnOrders);
if(reloadUnmergedReturnOrdersButton)reloadUnmergedReturnOrdersButton.addEventListener('click',loadUnmergedReturnOrders);
if(masterReturnOrderForm)masterReturnOrderForm.addEventListener('submit',submitMasterReturnOrder);
if(clearMasterReturnSelectionButton)clearMasterReturnSelectionButton.addEventListener('click',()=>{
  if(typeof resetSelectedMasterReturnOrders==='function')resetSelectedMasterReturnOrders();
  else { selectedReturnOrderIdsForMaster.clear(); loadUnmergedReturnOrders(); }
});
if(unmergedReturnOrderTable)unmergedReturnOrderTable.addEventListener('change',event=>{
  const check=event.target.closest('.master-return-check');
  if(!check)return;
  if(check.checked)selectedReturnOrderIdsForMaster.add(check.dataset.id);else selectedReturnOrderIdsForMaster.delete(check.dataset.id);
  if(typeof renderUnmergedReturnOrders==='function')renderUnmergedReturnOrders(window.__unmergedReturnOrdersCache||[]);
  else loadUnmergedReturnOrders();
});
const selectAllUnmergedReturnOrdersButton=document.getElementById('selectAllUnmergedReturnOrdersButton');
if(selectAllUnmergedReturnOrdersButton)selectAllUnmergedReturnOrdersButton.addEventListener('click',()=>{
  if(typeof toggleSelectAllUnmergedReturnOrders==='function')toggleSelectAllUnmergedReturnOrders();
  else loadUnmergedReturnOrders();
});
const reloadUnmergedReturnOrdersInlineButton=document.getElementById('reloadUnmergedReturnOrdersInlineButton');
if(reloadUnmergedReturnOrdersInlineButton)reloadUnmergedReturnOrdersInlineButton.addEventListener('click',loadUnmergedReturnOrders);
const unmergedReturnOrderSearchInput=document.getElementById('unmergedReturnOrderSearchInput');
if(unmergedReturnOrderSearchInput)unmergedReturnOrderSearchInput.addEventListener('input',loadUnmergedReturnOrders);
if(masterReturnDeliveryStaff)masterReturnDeliveryStaff.addEventListener('input',loadUnmergedReturnOrders);
// masterReturnDate là ngày tạo đơn tổng/kho nhận, không dùng để lọc phiếu chưa gộp.
// if(masterReturnDate)masterReturnDate.addEventListener('change',loadUnmergedReturnOrders);
if(reloadMasterReturnOrdersButton)reloadMasterReturnOrdersButton.addEventListener('click',loadMasterReturnOrders);
if(masterReturnOrderSearchInput)masterReturnOrderSearchInput.addEventListener('input',loadMasterReturnOrders);
if(masterReturnOrderDateFrom)masterReturnOrderDateFrom.addEventListener('change',loadMasterReturnOrders);
if(masterReturnOrderDateTo)masterReturnOrderDateTo.addEventListener('change',loadMasterReturnOrders);
if(openMasterReturnOrderModalButton && typeof openMasterReturnOrderModal==='function')openMasterReturnOrderModalButton.addEventListener('click',()=>{ if(typeof resetMasterReturnOrderModal==='function')resetMasterReturnOrderModal(); openMasterReturnOrderModal(); });
if(closeMasterReturnOrderModalButton && typeof closeMasterReturnOrderModal==='function')closeMasterReturnOrderModalButton.addEventListener('click',closeMasterReturnOrderModal);
if(masterReturnOrderModal)masterReturnOrderModal.addEventListener('click',event=>{ if(event.target===masterReturnOrderModal && typeof closeMasterReturnOrderModal==='function')closeMasterReturnOrderModal(); });
window.cancelMasterReturnOrder=cancelMasterReturnOrder;
window.viewMasterReturnOrder=viewMasterReturnOrder;
window.receiveMasterReturnOrder=receiveMasterReturnOrder;
window.printMasterReturnOrder=printMasterReturnOrder;
document.addEventListener('keydown',event=>{ if(event.key==='Escape' && typeof isMasterReturnOrderModalOpen==='function' && isMasterReturnOrderModalOpen() && typeof closeMasterReturnOrderModal==='function')closeMasterReturnOrderModal(); });
debtInnerTabs.forEach(btn=>btn.addEventListener('click',()=>setDebtPanel(btn.dataset.debtPanel)));
window.voidReceipt=voidReceipt;
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',loadCashbook);
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',typeof handleImportExcelAction==='function'?handleImportExcelAction:previewImportExcel);
if(importExcelFile)importExcelFile.addEventListener('change',()=>{importPreviewRows=[];if(commitImportButton){commitImportButton.disabled=!importExcelFile.files.length;commitImportButton.textContent='Xem trước đơn import';}if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chọn file rồi bấm Xem trước đơn import.</td></tr>';resetImportPreviewMessage();});
if(addImportMappingButton)addImportMappingButton.addEventListener('click',()=>{if(customImportMappingTable)customImportMappingTable.insertAdjacentHTML('beforeend',createMappingRow({}))});
if(customImportMappingTable)customImportMappingTable.addEventListener('click',event=>{const btn=event.target.closest('.remove-custom-map');if(!btn)return;btn.closest('tr')?.remove();if(!customImportMappingTable.children.length)renderCustomImportMapping([]);});
if(saveCustomImportTemplateButton)saveCustomImportTemplateButton.addEventListener('click',saveCustomImportTemplate);
if(loadCustomImportTemplateButton)loadCustomImportTemplateButton.addEventListener('click',loadSelectedCustomTemplateToEditor);
if(downloadCustomImportTemplateButton)downloadCustomImportTemplateButton.addEventListener('click',downloadCustomImportTemplate);
if(deleteCustomImportTemplateButton)deleteCustomImportTemplateButton.addEventListener('click',deleteCustomImportTemplate);
if(importDataType)importDataType.addEventListener('change',async()=>{importPreviewRows=[];if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chọn file rồi bấm Import ngay.</td></tr>';if(commitImportButton){commitImportButton.disabled=!(importExcelFile&&importExcelFile.files&&importExcelFile.files.length);commitImportButton.textContent='Xem trước đơn import';}resetImportPreviewMessage();await loadImportFieldOptions();await loadCustomImportTemplates();});
if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',loadImportOrders);
// Sales order history events are bound in /js/app/05-sales-orders.js.
// Không bind lại ở app.js để tránh gọi API 2 lần và tránh chạy trước khi autocomplete set dataset.
if(selectAllSalesOrdersButton)selectAllSalesOrdersButton.addEventListener('click',toggleSelectAllSalesOrders);
if(printSelectedSalesOrdersButton)printSelectedSalesOrdersButton.addEventListener('click',printSelectedSalesOrders);

// MASTER_ORDER_POPUP_PATCH_START: event popup tạo đơn tổng 3 layer, đóng khung để không ảnh hưởng module khác
if(reloadMasterOrdersButton && typeof loadMasterOrderModule==='function')reloadMasterOrdersButton.addEventListener('click',loadMasterOrderModule);
if(openMasterOrderModalButton && typeof openMasterOrderModal==='function')openMasterOrderModalButton.addEventListener('click',()=>{if(typeof resetMasterOrderModal==='function')resetMasterOrderModal();openMasterOrderModal();});
if(closeMasterOrderModalButton && typeof closeMasterOrderModal==='function')closeMasterOrderModalButton.addEventListener('click',closeMasterOrderModal);
if(masterOrderModal)masterOrderModal.addEventListener('click',event=>{if(event.target===masterOrderModal && typeof closeMasterOrderModal==='function')closeMasterOrderModal();});
if(moveToGroupedOrdersButton && typeof moveSelectedUnmergedToGrouped==='function')moveToGroupedOrdersButton.addEventListener('click',moveSelectedUnmergedToGrouped);
if(removeFromGroupedOrdersButton && typeof removeSelectedGroupedChildOrders==='function')removeFromGroupedOrdersButton.addEventListener('click',removeSelectedGroupedChildOrders);
if(masterOrderForm){if(typeof submitMasterOrder==='function')masterOrderForm.addEventListener('submit',submitMasterOrder);if(masterOrderForm.elements.deliveryDate)masterOrderForm.elements.deliveryDate.value=today();else if(masterOrderForm.elements.date)masterOrderForm.elements.date.value=today()}
if(unmergedOrderSearch && typeof loadUnmergedChildOrders==='function')unmergedOrderSearch.addEventListener('input',loadUnmergedChildOrders);
if(unmergedSourceFilter && typeof loadUnmergedChildOrders==='function')unmergedSourceFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateFrom && typeof loadUnmergedChildOrders==='function')unmergedDateFrom.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateTo && typeof loadUnmergedChildOrders==='function')unmergedDateTo.addEventListener('change',loadUnmergedChildOrders);
if(unmergedSalesStaffFilter && typeof loadUnmergedChildOrders==='function')unmergedSalesStaffFilter.addEventListener('input',loadUnmergedChildOrders);
if(selectAllUnmergedOrdersButton && typeof toggleSelectAllUnmergedOrders==='function')selectAllUnmergedOrdersButton.addEventListener('click',toggleSelectAllUnmergedOrders);
if(masterOrderSearch && typeof loadMasterOrders==='function')masterOrderSearch.addEventListener('input',loadMasterOrders);
if(masterOrderDateFrom && typeof loadMasterOrders==='function')masterOrderDateFrom.addEventListener('change',loadMasterOrders);
if(masterOrderDateTo && typeof loadMasterOrders==='function')masterOrderDateTo.addEventListener('change',loadMasterOrders);
if(selectAllMasterOrdersButton && typeof toggleSelectAllMasterOrders==='function')selectAllMasterOrdersButton.addEventListener('click',toggleSelectAllMasterOrders);
if(printSelectedMasterOrdersButton && typeof printSelectedMasterOrders==='function')printSelectedMasterOrdersButton.addEventListener('click',printSelectedMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedUnmergedChildOrderIds.add(check.dataset.id);else selectedUnmergedChildOrderIds.delete(check.dataset.id);selectedChildOrderIds=selectedUnmergedChildOrderIds;renderUnmergedChildOrders();});
if(selectedMasterChildOrderList)selectedMasterChildOrderList.addEventListener('change',event=>{const check=event.target.closest('.grouped-child-order-check');if(!check)return;if(check.checked)selectedGroupedChildOrderCheckIds.add(check.dataset.id);else selectedGroupedChildOrderCheckIds.delete(check.dataset.id);renderSelectedGroupedChildOrders();});
// MASTER_ORDER_POPUP_PATCH_END
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
if(reloadSystemStatusButton)reloadSystemStatusButton.addEventListener('click',()=>{loadSystemStatus();loadApiMonitor();});
if(typeof reloadSystemDataSourceButton!=='undefined'&&reloadSystemDataSourceButton)reloadSystemDataSourceButton.addEventListener('click',loadSystemDataSource);
if(createSystemBackupButton)createSystemBackupButton.addEventListener('click',createSystemBackup);
if(resetSystemDataButton)resetSystemDataButton.addEventListener('click',resetSystemData);
if(reloadApiMonitorButton)reloadApiMonitorButton.addEventListener('click',loadApiMonitor);
if(resetApiMonitorButton)resetApiMonitorButton.addEventListener('click',resetApiMonitorStats);
if(apiMonitorFilter)apiMonitorFilter.addEventListener('change',loadApiMonitor);
if(typeof setupApiMonitorTabs==='function')setupApiMonitorTabs();

setupTabs();

// V45 performance fix: không load toàn bộ module khi mở trang.
// Mở tab nào thì mới gọi API của tab đó; server health/import config chạy nền, không khóa UI.
const V45_BOOT_LOADED_TABS = window.V45_BOOT_LOADED_TABS || (window.V45_BOOT_LOADED_TABS = new Set());
function getActiveTabName(){
  return document.querySelector('.tab-content.active')?.id
    || document.querySelector('.tab-button.active')?.dataset?.tab
    || 'productsTab';
}
function markTabLoading(tabName, isLoading){
  const tab = document.getElementById(tabName);
  if(!tab) return;
  tab.dataset.loading = isLoading ? '1' : '0';
}
async function loadTabDataOnce(tabName, options = {}){
  if(!tabName) return;
  const force = options.force === true;
  if(!force && V45_BOOT_LOADED_TABS.has(tabName)) return;
  V45_BOOT_LOADED_TABS.add(tabName);
  markTabLoading(tabName, true);
  try{
    switch(tabName){
      case 'productsTab':
        if(typeof loadProducts === 'function') await loadProducts({allowEmpty:true});
        break;
      case 'customersTab':
        if(typeof loadCustomers === 'function') await loadCustomers({resetPage:true});
        break;
      case 'importTab':
        await Promise.allSettled([
          typeof loadProducts === 'function' ? loadProducts({allowEmpty:true}) : null,
          typeof loadImportOrders === 'function' ? loadImportOrders() : null
        ]);
        if(typeof renderImportProductSelect === 'function') renderImportProductSelect();
        break;
      case 'salesTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadSalesOrders === 'function' ? loadSalesOrders() : null
        ]);
        // Danh mục sản phẩm/khách hàng cho form bán hàng chỉ đồng bộ nền sau khi danh sách đơn đã hiện.
        setTimeout(()=>{
          Promise.allSettled([
            typeof loadProducts === 'function' ? loadProducts({allowEmpty:true}) : null,
            typeof loadCustomers === 'function' ? loadCustomers({resetPage:true}) : null
          ]).then(()=>{
            if(typeof renderSalesProductSelect === 'function') renderSalesProductSelect();
            if(typeof renderSalesCustomerSelect === 'function') renderSalesCustomerSelect();
            if(typeof renderSalesStaffSelect === 'function') renderSalesStaffSelect();
          });
        }, 50);
        break;
      case 'masterOrdersTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadMasterOrderModule === 'function' ? loadMasterOrderModule() : null
        ]);
        break;
      case 'returnOrdersTab':
        if(typeof loadReturnOrders === 'function') await loadReturnOrders();
        break;
      case 'masterReturnOrdersTab':
        await Promise.allSettled([
          typeof loadUnmergedReturnOrders === 'function' ? loadUnmergedReturnOrders() : null,
          typeof loadMasterReturnOrders === 'function' ? loadMasterReturnOrders() : null
        ]);
        break;
      case 'deliveryTodayTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadDeliveryToday === 'function' ? loadDeliveryToday() : null
        ]);
        break;
      case 'stockTab':
        if(typeof loadStock === 'function') await loadStock();
        break;
      case 'debtTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadDebts === 'function' ? loadDebts() : null,
          typeof loadReceipts === 'function' ? loadReceipts() : null,
          typeof loadCashbook === 'function' ? loadCashbook() : null
        ]);
        if(typeof renderCollectionCustomerSelect === 'function') renderCollectionCustomerSelect();
        break;
      case 'debtCollectionsTab':
        if(typeof loadDebtCollections === 'function') await loadDebtCollections();
        break;
      case 'reportsTab':
        if(typeof loadReports === 'function') await loadReports();
        break;
      case 'usersTab':
      case 'promotionsTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadPromotions === 'function' ? loadPromotions() : null
        ]);
        break;
      case 'systemTab':
        await Promise.allSettled([
          typeof loadSystemStatus === 'function' ? loadSystemStatus() : null,
          typeof loadApiMonitor === 'function' ? loadApiMonitor() : null
        ]);
        break;
    }
  }catch(error){
    console.warn('[V45_TAB_LOAD_ERROR]', tabName, error);
  }finally{
    markTabLoading(tabName, false);
  }
}
window.V45LoadTabDataOnce = loadTabDataOnce;

if(typeof setReportDefaults === 'function') setReportDefaults();
if(typeof renderImportItems === 'function') renderImportItems();
if(typeof renderSalesItems === 'function') renderSalesItems();

// Các tác vụ nền nhẹ, không await để tránh treo giao diện.
setTimeout(()=>{ if(typeof checkServer === 'function') checkServer().catch?.(console.warn); }, 0);
setTimeout(()=>{ if(typeof loadImportFieldOptions === 'function') loadImportFieldOptions().catch?.(console.warn); }, 200);
setTimeout(()=>{ if(typeof loadCustomImportTemplates === 'function') loadCustomImportTemplates().catch?.(console.warn); }, 400);

// Chỉ load tab đang mở ban đầu.
setTimeout(()=>loadTabDataOnce(getActiveTabName()), 0);
