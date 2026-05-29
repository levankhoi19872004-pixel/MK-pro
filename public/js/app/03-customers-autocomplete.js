async function loadCustomers(){
  const q=customerSearchInput?customerSearchInput.value.trim():'';
  const url=`/api/customers?page=1&limit=100${q?`&q=${encodeURIComponent(q)}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được khách hàng');
    customersCache=json.customers||[];
    customerPage=1;
    const total=json.meta?.total||customersCache.length;if(customerCount)customerCount.textContent=`${customersCache.length}/${total} khách hàng`;
    renderCustomerTable();renderSalesCustomerSelect();renderCollectionCustomerSelect();
  }catch(err){if(customerCount)customerCount.textContent='Lỗi tải khách';if(customerTable)customerTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
function getCustomerTotalPages(){
  return Math.max(1,Math.ceil(customersCache.length/customerPageSize));
}
function getCustomerPageRows(){
  const totalPages=getCustomerTotalPages();
  if(customerPage>totalPages)customerPage=totalPages;
  if(customerPage<1)customerPage=1;
  const start=(customerPage-1)*customerPageSize;
  return customersCache.slice(start,start+customerPageSize);
}
function renderCustomerPagination(){
  if(!customerPagination)return;
  const total=customersCache.length;
  const totalPages=getCustomerTotalPages();
  const start=total?((customerPage-1)*customerPageSize+1):0;
  const end=Math.min(total,customerPage*customerPageSize);
  if(customerPageInfo)customerPageInfo.textContent=`Hiển thị ${start}-${end} / ${total} khách hàng · Trang ${customerPage}/${totalPages}`;
  if(customerPrevPage)customerPrevPage.disabled=customerPage<=1;
  if(customerNextPage)customerNextPage.disabled=customerPage>=totalPages;
  if(customerPageSizeSelect&&Number(customerPageSizeSelect.value)!==customerPageSize)customerPageSizeSelect.value=String(customerPageSize);
}
function updateCustomerBulkUI(){
  if(customerSelectedCount)customerSelectedCount.textContent=`${selectedCustomerIds.size} khách đã chọn`;
  if(customerBulkActions)customerBulkActions.hidden=selectedCustomerIds.size===0;
  if(customerCheckAll){
    const ids=getCustomerPageRows().map(c=>c.id).filter(Boolean);
    customerCheckAll.checked=ids.length>0 && ids.every(id=>selectedCustomerIds.has(id));
  }
  renderCustomerPagination();
}
function renderCustomerTable(){
  if(!customerTable)return;
  if(!customersCache.length){
    selectedCustomerIds.clear();
    customerTable.innerHTML='<tr><td colspan="8">Chưa có khách hàng</td></tr>';
    updateCustomerBulkUI();
    return;
  }
  selectedCustomerIds=new Set([...selectedCustomerIds].filter(id=>customersCache.some(c=>c.id===id)));
  const rows=getCustomerPageRows();
  customerTable.innerHTML=rows.map(c=>`<tr class="${selectedCustomerIds.has(c.id)?'selected':''}">
    <td><input type="checkbox" class="customer-row-check" data-id="${c.id}" ${selectedCustomerIds.has(c.id)?'checked':''} /></td>
    <td><strong>${c.code||''}</strong></td>
    <td>${c.name||''}</td>
    <td>${c.phone||''}</td>
    <td>${c.address||''}</td>
    <td>${c.area||''}</td>
    <td>${c.staffName||''}</td>
    <td class="row-actions"><button type="button" class="small" onclick="editCustomer('${c.id}')">Sửa</button><button type="button" class="small danger" onclick="deleteCustomer('${c.id}')">Xóa</button></td>
  </tr>`).join('');
  updateCustomerBulkUI();
}
function fillCustomerForm(c){
  if(!customerForm||!c)return;
  ['code','name','phone','area','address','staffName'].forEach(k=>{if(customerForm.elements[k])customerForm.elements[k].value=c[k]||''});
  customerForm.dataset.editingId=c.id||'';
  const btn=customerForm.querySelector('button[type="submit"]');if(btn)btn.textContent='Cập nhật khách hàng';
}
window.editCustomer=id=>{const c=customersCache.find(x=>x.id===id);if(c)fillCustomerForm(c)};
window.deleteCustomer=async id=>{
  if(!confirm('Xóa khách hàng này?'))return;
  try{
    const res=await fetch(`/api/customers/${encodeURIComponent(id)}`,{method:'DELETE'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
    selectedCustomerIds.delete(id);showMessage(customerMessage,json.message||'Đã xóa khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
};
async function bulkDeleteCustomers(){
  const ids=[...selectedCustomerIds];
  if(!ids.length)return;
  if(!confirm(`Xóa ${ids.length} khách hàng đã chọn?`))return;
  try{
    const res=await fetch('/api/customers/bulk-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
    selectedCustomerIds.clear();showMessage(customerMessage,json.message||'Đã xóa khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
}
customerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(customerForm).entries());
  try{
    const editingId=customerForm.dataset.editingId;
    const res=await fetch(editingId?`/api/customers/${encodeURIComponent(editingId)}`:'/api/customers',{method:editingId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được khách hàng');
    customerForm.reset();customerForm.dataset.editingId='';const btn=customerForm.querySelector('button[type="submit"]');if(btn)btn.textContent='Lưu khách hàng';showMessage(customerMessage,json.message||'Đã lưu khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
});


const SearchAutocomplete = window.SearchAutocomplete;

function matchSearch(value, terms){
  return SearchAutocomplete.matchText(value, terms);
}
function productSuggestionLabel(p){
  const stockText=` · ${productStockStatusText(p)}`;
  const packingText=p.packing?` · ${p.packing}`:(p.unit?` · ${p.unit}`:'');
  return `${p.code||''} - ${p.name||''}${packingText}${stockText}`;
}
function staffSuggestionLabel(u){
  const role=u.roleLabel||u.role||'';
  const phone=u.phone?` · ${u.phone}`:'';
  return `${u.code||u.username||''} - ${u.name||u.fullName||u.username||''}${role?` · ${role}`:''}${phone}`;
}
function customerSuggestionLabel(c){
  const phone=c.phone?` · ${c.phone}`:'';
  const address=c.address?` · ${c.address}`:'';
  return `${c.code||''} - ${c.name||''}${phone}${address}`;
}
function debtCustomerSuggestionLabel(d){
  return `${d.customerCode||''} - ${d.customerName||''} · Nợ: ${money(d.debt||0)}`;
}
function debtStatusLabel(status){
  if(status==='paid')return 'Đã tất toán';
  if(status==='overdue')return 'Quá hạn';
  if(status==='void')return 'Void/Cancel';
  return 'Còn nợ';
}
function debtFinanceClass(row){
  if(row.status==='void')return 'finance-gray';
  if(row.status==='paid' || Number(row.debt||0)<=0)return 'finance-green';
  if(row.status==='overdue' || Number(row.overdueDays||0)>0)return 'finance-orange';
  return 'finance-red';
}
function debtPersonLabel(code,name){
  return [code,name].filter(Boolean).join(' - ') || 'Chưa gán';
}
function getProductListMatches(){
  const q=searchInput?searchInput.value.trim():'';
  return productsCache
    .filter(p=>p.isActive!==false)
    .filter(p=>!q || matchSearch(q,[p.code,p.name,p.barcode,p.category,p.packing,p.unit,p.baseUnit]))
    .slice(0,20);
}
function selectProductFromListSuggestion(p){
  if(!p)return;
  if(searchInput)searchInput.value=p.code||p.name||'';
  hideSuggestions(productListSuggestions);
  loadProducts();
}
function getCustomerListMatches(){
  const q=customerSearchInput?customerSearchInput.value.trim():'';
  if(!q)return customersCache.filter(c=>c.isActive!==false).slice(0,10);
  return customersCache.filter(c=>matchSearch(q,[c.code,c.name,c.phone,c.address,c.area,c.route,c.staffName]));
}
function selectCustomerFromListSuggestion(c){
  if(!c)return;
  if(customerSearchInput)customerSearchInput.value=c.code||c.name||'';
  hideSuggestions(customerListSuggestions);
  loadCustomers();
}
function escapeHtml(value){
  return SearchAutocomplete.escapeHtml(value);
}
function hideSuggestions(box){
  SearchAutocomplete.hide(box);
}
function showSuggestionsBox(box){
  SearchAutocomplete.show(box);
}
function wireAutocomplete(options){
  SearchAutocomplete.wire(options);
}


// Centralized autocomplete binding from /js/search/searchFieldsConfig.js
function getSuggestElement(rule, propId='targetId', propSelector='targetSelector'){
  if(!rule) return null;
  if(rule[propId]) return document.getElementById(rule[propId]);
  if(rule[propSelector]) return document.querySelector(rule[propSelector]);
  return null;
}
function getConfiguredSource(config){
  const map={products:productsCache,customers:customersCache,users:usersCache,debts:debtsCache};
  let rows=Array.isArray(map[config.source])?map[config.source]:[];
  if(config.onlyActive) rows=rows.filter(item=>item.isActive!==false);
  if(config.roles && config.roles.length){
    const roles=config.roles.map(r=>String(r).toLowerCase());
    rows=rows.filter(item=>roles.includes(String(item.role||'').toLowerCase()));
  }
  if(config.onlyInStock) rows=rows.filter(item=>productHasStock(item));
  if(config.source==='debts') rows=rows.filter(item=>Number(item.debt||0)>0);
  const input=getSuggestElement(config,'inputId','inputSelector');
  const q=input?input.value.trim():'';
  rows=rows.filter(item=>matchSearch(q,(config.searchKeys||[]).map(key=>item[key])));
  return rows.slice(0, Number(config.limit||10));
}
function getSuggestValue(item, valueType, config){
  if(valueType==='label') return getConfiguredLabel(item, config);
  if(valueType==='id') return item.id||'';
  if(valueType==='idOrCode') return getProductKey(item) || item.id || item.code || '';
  if(valueType==='codeOrUsernameOrId') return item.code||item.username||item.id||'';
  if(valueType==='nameOrFullNameOrUsername') return item.name||item.fullName||item.username||'';
  if(valueType==='customerIdOrCode') return item.customerId||item.customerCode||'';
  return item[valueType] ?? '';
}
function getConfiguredLabel(item, config){
  if(!item) return '';
  if(config.type==='product') return productSuggestionLabel(item);
  if(config.type==='customer') return customerSuggestionLabel(item);
  if(config.type==='staff') return staffSuggestionLabel(item);
  if(config.type==='debtCustomer') return debtCustomerSuggestionLabel(item);
  return [item.code,item.name,item.phone].filter(Boolean).join(' - ');
}
function applyConfiguredSelect(config, item){
  (config.fill||[]).forEach(rule=>{
    const target=getSuggestElement(rule);
    if(target) target.value=getSuggestValue(item, rule.value, config);
  });
  const input=getSuggestElement(config,'inputId','inputSelector');
  if(input){
    input.dataset.selectedId=getSuggestValue(item,'idOrCode',config) || getSuggestValue(item,'codeOrUsernameOrId',config) || '';
    const hiddenRule=(config.fill||[]).find(rule=>rule.targetId && rule.targetId!==config.inputId);
    if(hiddenRule) input.dataset.targetHidden=hiddenRule.targetId;
  }
  if(config.afterSelect==='reloadProducts') loadProducts();
  if(config.afterSelect==='reloadCustomers') loadCustomers();
  if(config.afterSelect==='setImportCostPrice' && importCostPrice) importCostPrice.value=Number(item.costPrice||0);
  if(config.afterSelect==='setSalesPrice' && salesPrice) salesPrice.value=Number(item.salePrice||0);
  if(config.afterSelect==='setCollectionAmount'){
    if(collectionCustomerSelect) collectionCustomerSelect.dataset.debt=String(item.debt||0);
    updateSelectedCustomerDebt();
  }
}
function ensureSuggestionBox(config){
  const input=getSuggestElement(config,'inputId','inputSelector');
  if(!input) return null;
  let box=config.boxId?document.getElementById(config.boxId):null;
  if(!box){
    box=document.createElement('div');
    box.id=`${config.key||input.id||input.name}Suggestions`;
    box.className='suggestions';
    box.hidden=true;
    input.insertAdjacentElement('afterend',box);
  }
  return box;
}
function initConfiguredAutocomplete(){
  (window.SEARCH_FIELD_CONFIGS||[]).forEach(config=>{
    const input=getSuggestElement(config,'inputId','inputSelector');
    const box=ensureSuggestionBox(config);
    if(!input || !box) return;
    wireAutocomplete({
      input,
      box,
      getItems:()=>getConfiguredSource(config),
      label:item=>getConfiguredLabel(item,config),
      select:item=>applyConfiguredSelect(config,item),
      emptyText:config.emptyText||'Không tìm thấy dữ liệu'
    });
  });
}

// Import
