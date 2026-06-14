'use strict';

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
