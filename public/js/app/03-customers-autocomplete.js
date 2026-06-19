const escapeHtml = (window.V45Common || {}).escapeHtml;
let customerListRequestSeq = 0;
let customerListLoadPromise = null;
let customerListQueuedOptions = null;
let customerListActiveKey = '';
let customerListQueuedKey = '';
let customerListLoading = false;
let customerDeletePromise = null;
let customerBulkDeletePromise = null;
let customerSavePromise = null;

function setCustomerListLoading(loading){
  customerListLoading=Boolean(loading);
  [customerSearchInput,applyCustomerFiltersButton,clearCustomerFiltersButton,reloadCustomersButton,customerPageSizeSelect].forEach(control=>{
    if(control)control.disabled=customerListLoading;
  });
  [applyCustomerFiltersButton,clearCustomerFiltersButton,reloadCustomersButton].forEach(button=>{
    if(!button)return;
    if(customerListLoading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
  renderCustomerPagination();
}
function setCustomerBulkDeleteLoading(loading){
  [bulkDeleteCustomerButton,customerCheckAll].forEach(control=>{
    if(control)control.disabled=Boolean(loading);
  });
  document.querySelectorAll('#customerTable .customer-row-check').forEach(control=>{
    control.disabled=Boolean(loading);
  });
  if(bulkDeleteCustomerButton){
    if(loading)bulkDeleteCustomerButton.setAttribute('aria-busy','true');
    else bulkDeleteCustomerButton.removeAttribute('aria-busy');
  }
}
function setCustomerFormLoading(loading){
  const submitButton=customerForm&&customerForm.querySelector('button[type="submit"]');
  [submitButton,resetCustomerButton,closeCustomerModalButton].forEach(control=>{
    if(control)control.disabled=Boolean(loading);
  });
  if(submitButton){
    if(loading)submitButton.setAttribute('aria-busy','true');
    else submitButton.removeAttribute('aria-busy');
  }
}
function setCustomerRowActionLoading(button,loading){
  if(!button)return;
  const actionGroup=button.closest('.customer-row-actions');
  const controls=actionGroup?[...actionGroup.querySelectorAll('button')]:[button];
  controls.forEach(control=>{control.disabled=Boolean(loading);});
  if(loading)button.setAttribute('aria-busy','true');
  else button.removeAttribute('aria-busy');
}

function openCustomerModal(){
  if(!customerModal)return;
  customerModal.classList.add('show');
  customerModal.setAttribute('aria-hidden','false');
  setTimeout(()=>{
    const codeInput=customerForm&&customerForm.elements&&customerForm.elements.code;
    if(codeInput)codeInput.focus();
  },30);
}
function closeCustomerModal(){
  if(!customerModal)return;
  customerModal.classList.remove('show');
  customerModal.setAttribute('aria-hidden','true');
}
function resetCustomerForm(){
  if(!customerForm)return;
  customerForm.reset();
  customerForm.dataset.editingId='';
  const staffSearch=document.getElementById('customerStaffSearch');
  if(staffSearch){
    staffSearch.value='';
    staffSearch.dataset.selectedLabel='';
    staffSearch.dataset.code='';
    staffSearch.dataset.name='';
  }
  const staffCode=document.getElementById('customerStaffCode');
  const staffName=document.getElementById('customerStaffName');
  if(staffCode)staffCode.value='';
  if(staffName)staffName.value='';
  const btn=customerForm.querySelector('button[type="submit"]');
  if(btn)btn.textContent='Lưu khách hàng';
  if(customerFormTitle)customerFormTitle.textContent='Thêm khách hàng';
  showMessage(customerMessage,'');
}
window.openCustomerModal=openCustomerModal;
window.closeCustomerModal=closeCustomerModal;
window.resetCustomerForm=resetCustomerForm;
async function loadCustomers(options = {}){
  const q=customerSearchInput?customerSearchInput.value.trim():'';
  const resetPage=options.resetPage===true;
  const allowEmpty = options.allowEmpty === true;
  const forceRefresh = options.forceRefresh === true;
  if(resetPage) customerPage=1;
  if(customerPage<1) customerPage=1;
  const limit=Number(customerPageSize||50);
  const requestKey=JSON.stringify({q,page:customerPage,limit,allowEmpty});
  if(customerListLoadPromise){
    if(!forceRefresh && (requestKey===customerListActiveKey || requestKey===customerListQueuedKey))return customerListLoadPromise;
    customerListQueuedOptions={...options,resetPage:false};
    customerListQueuedKey=requestKey;
    customerListRequestSeq+=1;
    return customerListLoadPromise;
  }
  if(!allowEmpty && q.length < 2){
    customersCache=[];
    customerTotal=0;
    customerTotalPages=1;
    selectedCustomerIds.clear();
    if(customerCount)customerCount.textContent='Nhập ít nhất 2 ký tự để tìm khách hàng';
    if(customerTable)customerTable.innerHTML='<tr><td colspan="8" class="empty-cell">Nhập ít nhất 2 ký tự để tải danh sách khách hàng.</td></tr>';
    updateCustomerBulkUI();
    renderCustomerPagination();
    return null;
  }
  const requestSeq = ++customerListRequestSeq;
  customerListActiveKey=requestKey;
  setCustomerListLoading(true);
  const runPromise=(async()=>{
    try{
      if(customerTable) customerTable.innerHTML='<tr><td colspan="8">Đang tải khách hàng...</td></tr>';
      // Bảng danh sách khách hàng gọi thẳng API /api/customers để lấy Mongo + phân trang thật.
      // CatalogCache chỉ phục vụ autocomplete/lazy search.
      const result = await (window.fetchWithTimeout||fetch)(`/api/customers?page=${customerPage}&limit=${limit}${q?`&q=${encodeURIComponent(q)}`:''}&_t=${Date.now()}`, {}, 10000)
        .then(async res=>{
          const json=await res.json();
          if(!json.ok)throw new Error(json.message||'Không tải được khách hàng');
          return {rows:json.customers||[],meta:json.meta||null};
        });
      if(requestSeq !== customerListRequestSeq) return null;
      customersCache = Array.isArray(result.rows) ? result.rows : [];
      customerTotal = Number(result.meta?.total ?? customersCache.length);
      customerTotalPages = Math.max(1, Number(result.meta?.totalPages ?? Math.ceil(customerTotal/limit) ?? 1));
      if(customerPage>customerTotalPages && customerTotalPages>0){
        customerPage=customerTotalPages;
        if(!customerListQueuedOptions){
          customerListQueuedOptions={allowEmpty,forceRefresh:true};
          customerListQueuedKey='';
        }
        return null;
      }
      if(customerCount)customerCount.textContent=`${customerTotal} khách hàng`;
      renderCustomerTable();
      renderSalesCustomerSelect();
      renderCollectionCustomerSelect();
      return result;
    }catch(err){
      if(requestSeq !== customerListRequestSeq)return null;
      if(customerCount)customerCount.textContent='Lỗi tải khách';
      if(customerTable)customerTable.innerHTML=`<tr><td colspan="8">${escapeHtml(err.message)}</td></tr>`;
      return null;
    }
  })();
  customerListLoadPromise=runPromise;
  try{
    return await runPromise;
  }finally{
    customerListLoadPromise=null;
    customerListActiveKey='';
    const queuedOptions=customerListQueuedOptions;
    customerListQueuedOptions=null;
    customerListQueuedKey='';
    if(queuedOptions){
      await loadCustomers(queuedOptions);
      if(!customerListLoadPromise)setCustomerListLoading(false);
    }else setCustomerListLoading(false);
  }
}
function getCustomerTotalPages(){
  return Math.max(1,Number(customerTotalPages||1));
}
function getCustomerPageRows(){
  if(customerPage<1)customerPage=1;
  if(customerPage>getCustomerTotalPages())customerPage=getCustomerTotalPages();
  return customersCache || [];
}
function renderCustomerPagination(){
  if(!customerPagination)return;
  const total=Number(customerTotal||customersCache.length||0);
  const totalPages=getCustomerTotalPages();
  const start=total && customersCache.length ? ((customerPage-1)*customerPageSize+1) : 0;
  const end=Math.min(total,(customerPage-1)*customerPageSize+(customersCache?customersCache.length:0));
  if(customerPageInfo)customerPageInfo.textContent=`Hiển thị ${start}-${end} / ${total} khách hàng · Trang ${customerPage}/${totalPages}`;
  if(customerPrevPage)customerPrevPage.disabled=customerListLoading||customerPage<=1;
  if(customerNextPage)customerNextPage.disabled=customerListLoading||customerPage>=totalPages;
  if(customerPageSizeSelect&&Number(customerPageSizeSelect.value)!==customerPageSize)customerPageSizeSelect.value=String(customerPageSize);
}
function updateCustomerBulkUI(){
  if(customerSelectedCount)customerSelectedCount.textContent=String(selectedCustomerIds.size);
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
    const q=customerSearchInput?customerSearchInput.value.trim():'';
    customerTable.innerHTML=`<tr><td colspan="8">${q?'Không tìm thấy khách hàng phù hợp':'Chưa có khách hàng'}</td></tr>`;
    updateCustomerBulkUI();
    return;
  }
  selectedCustomerIds=new Set([...selectedCustomerIds].filter(id=>customersCache.some(c=>c.id===id)));
  const rows=getCustomerPageRows();
  customerTable.innerHTML=rows.map((c,rowIndex)=>`<tr class="${selectedCustomerIds.has(c.id)?'selected':''}">
    <td><input type="checkbox" class="customer-row-check" data-id="${escapeHtml(c.id||'')}" ${selectedCustomerIds.has(c.id)?'checked':''} /></td>
    <td><strong>${escapeHtml(c.code||'')}</strong></td>
    <td>${escapeHtml(c.name||'')}</td>
    <td>${escapeHtml(c.phone||'')}</td>
    <td>${escapeHtml(c.address||'')}</td>
    <td>${escapeHtml(c.area||'')}</td>
    <td>${escapeHtml(legacyCustomerStaffLabel(c)||'')}</td>
    <td class="row-actions"><span class="customer-row-actions"><button type="button" class="small" onclick="editCustomerByRow(${rowIndex})">Sửa</button><button type="button" class="small danger" onclick="deleteCustomerByRow(${rowIndex},this)">Xóa</button></span></td>
  </tr>`).join('');
  updateCustomerBulkUI();
}
function fillCustomerForm(c){
  if(!customerForm||!c)return;
  ['code','name','businessName','phone','area','address','taxCode','taxInvoiceAddress'].forEach(k=>{if(customerForm.elements[k])customerForm.elements[k].value=c[k]||''});
  const staffSearch=document.getElementById('customerStaffSearch');
  const staffCode=document.getElementById('customerStaffCode');
  const staffName=document.getElementById('customerStaffName');
  const staffLabel=legacyCustomerStaffLabel(c);
  if(staffSearch){
    staffSearch.value=staffLabel;
    staffSearch.dataset.selectedLabel=staffLabel;
    staffSearch.dataset.code=c.legacyStaffCode||'';
    staffSearch.dataset.name=c.legacyStaffName||'';
  }
  if(staffCode)staffCode.value=c.legacyStaffCode||'';
  if(staffName)staffName.value=c.legacyStaffName||'';
  customerForm.dataset.editingId=c.id||'';
  const btn=customerForm.querySelector('button[type="submit"]');if(btn)btn.textContent='Cập nhật khách hàng';
  if(customerFormTitle)customerFormTitle.textContent=`Sửa khách hàng: ${c.code||c.name||''}`;
  showMessage(customerMessage,'Đang sửa khách hàng. Bấm "Nhập mới" nếu muốn thêm khách hàng khác.');
}
window.editCustomer=id=>{const c=customersCache.find(x=>x.id===id);if(c){fillCustomerForm(c);openCustomerModal();}};
window.editCustomerByRow=rowIndex=>{const c=getCustomerPageRows()[Number(rowIndex)];if(c)window.editCustomer(c.id);};
window.deleteCustomerByRow=(rowIndex,button)=>{const c=getCustomerPageRows()[Number(rowIndex)];if(c)window.deleteCustomer(c.id,button);};
window.deleteCustomer=async(id,button)=>{
  if(customerDeletePromise)return customerDeletePromise;
  if(customerBulkDeletePromise||customerSavePromise)return null;
  if(!confirm('Xóa khách hàng này?'))return null;
  setCustomerRowActionLoading(button,true);
  customerDeletePromise=(async()=>{
    try{
      const res=await fetch(`/api/customers/${encodeURIComponent(id)}`,{method:'DELETE'});
      const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
      selectedCustomerIds.delete(id);
      showMessage(customerMessage,json.message||'Đã xóa khách hàng');
      if(window.CatalogCache)window.CatalogCache.invalidate('customers');
      await loadCustomers({forceRefresh:true});
      return json;
    }catch(err){
      showMessage(customerMessage,err.message,true);
      return null;
    }
  })();
  try{return await customerDeletePromise;}
  finally{
    customerDeletePromise=null;
    if(button&&button.isConnected)setCustomerRowActionLoading(button,false);
  }
};
async function bulkDeleteCustomers(){
  if(customerBulkDeletePromise)return customerBulkDeletePromise;
  if(customerDeletePromise||customerSavePromise)return null;
  const ids=[...selectedCustomerIds];
  if(!ids.length)return null;
  if(!confirm(`Xóa ${ids.length} khách hàng đã chọn?`))return null;
  setCustomerBulkDeleteLoading(true);
  customerBulkDeletePromise=(async()=>{
    try{
      const res=await fetch('/api/customers/bulk-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
      const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
      selectedCustomerIds.clear();
      showMessage(customerMessage,json.message||'Đã xóa khách hàng');
      if(window.CatalogCache)window.CatalogCache.invalidate('customers');
      await loadCustomers({forceRefresh:true});
      return json;
    }catch(err){
      showMessage(customerMessage,err.message,true);
      return null;
    }
  })();
  try{return await customerBulkDeletePromise;}
  finally{
    customerBulkDeletePromise=null;
    setCustomerBulkDeleteLoading(false);
  }
}
customerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(customerSavePromise)return customerSavePromise;
  if(customerDeletePromise||customerBulkDeletePromise)return null;
  const payload=Object.fromEntries(new FormData(customerForm).entries());
  setCustomerFormLoading(true);
  customerSavePromise=(async()=>{
    try{
      const editingId=customerForm.dataset.editingId;
      const res=await fetch(editingId?`/api/customers/${encodeURIComponent(editingId)}`:'/api/customers',{method:editingId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được khách hàng');
      resetCustomerForm();
      showMessage(customerMessage,json.message||'Đã lưu khách hàng');
      closeCustomerModal();
      if(window.CatalogCache)window.CatalogCache.invalidate('customers');
      await loadCustomers({forceRefresh:true});
      return json;
    }catch(err){
      showMessage(customerMessage,err.message,true);
      return null;
    }
  })();
  try{return await customerSavePromise;}
  finally{
    customerSavePromise=null;
    setCustomerFormLoading(false);
  }
});
if(openCustomerModalButton){
  openCustomerModalButton.addEventListener('click',()=>{resetCustomerForm();openCustomerModal();});
}
if(closeCustomerModalButton)closeCustomerModalButton.addEventListener('click',closeCustomerModal);
if(resetCustomerButton)resetCustomerButton.addEventListener('click',resetCustomerForm);
if(customerModal){
  customerModal.addEventListener('click',event=>{if(event.target===customerModal)closeCustomerModal();});
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&customerModal&&customerModal.classList.contains('show'))closeCustomerModal();
});

const customerStaffSearchEl=document.getElementById('customerStaffSearch');
if(customerStaffSearchEl){
  customerStaffSearchEl.addEventListener('input',()=>{
    const selectedLabel=String(customerStaffSearchEl.dataset.selectedLabel||'').trim();
    const current=String(customerStaffSearchEl.value||'').trim();
    if(current && selectedLabel && current===selectedLabel)return;
    const codeEl=document.getElementById('customerStaffCode');
    const nameEl=document.getElementById('customerStaffName');
    if(codeEl)codeEl.value='';
    if(nameEl)nameEl.value='';
  });
}

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
  const code=u.salesStaffCode||u.deliveryStaffCode||u.staffCode||u.code||u.employeeCode||'';
  const name=u.salesStaffName||u.deliveryStaffName||u.fullName||u.name||u.staffName||'';
  return `${code} - ${name}${role?` · ${role}`:''}${phone}`;
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
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchProduct(q,{limit:20,mode:'sales'});
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
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchCustomer(q,{limit:20});
  if(!q)return customersCache.filter(c=>c.isActive!==false).slice(0,10);
  return customersCache.filter(c=>matchSearch(q,[c.code,c.name,c.businessName,c.phone,c.address,c.taxCode,c.taxInvoiceAddress,c.area,c.route]));
}
function selectCustomerFromListSuggestion(c){
  if(!c)return;
  if(customerSearchInput)customerSearchInput.value=c.code||c.name||'';
  hideSuggestions(customerListSuggestions);
  loadCustomers();
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
