// Products
const escapeProductHtml = (window.V45Common && window.V45Common.escapeHtml) || ((value='')=>String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])));
let productListRequestSeq = 0;
let productListLoadPromise = null;
let productListQueuedOptions = null;
let productListLoading = false;
let productBulkActionPromise = null;
let productSavePromise = null;

function setProductListLoading(loading){
  productListLoading=Boolean(loading);
  [searchInput,applyProductFiltersButton,clearProductFiltersButton,reloadProductsButton,productPageSizeSelect].forEach(control=>{
    if(control)control.disabled=productListLoading;
  });
  [applyProductFiltersButton,clearProductFiltersButton,reloadProductsButton].forEach(button=>{
    if(!button)return;
    if(productListLoading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
  renderProductPagination();
}
function setProductBulkActionLoading(loading){
  [bulkEditProductButton,bulkOpenProductButton,bulkStopProductButton,productCheckAll].forEach(control=>{
    if(control)control.disabled=Boolean(loading);
  });
  [bulkOpenProductButton,bulkStopProductButton].forEach(button=>{
    if(!button)return;
    if(loading)button.setAttribute('aria-busy','true');
    else button.removeAttribute('aria-busy');
  });
}
function setProductFormLoading(loading){
  const submitButton=productForm&&productForm.querySelector('button[type="submit"]');
  [submitButton,resetButton,closeProductModalButton].forEach(control=>{
    if(control)control.disabled=Boolean(loading);
  });
  if(submitButton){
    if(loading)submitButton.setAttribute('aria-busy','true');
    else submitButton.removeAttribute('aria-busy');
  }
}

function openProductModal(){
  if(!productModal)return;
  productModal.classList.add('show');
  productModal.setAttribute('aria-hidden','false');
  setTimeout(()=>{
    const codeInput=productForm&&productForm.elements&&productForm.elements.code;
    if(codeInput)codeInput.focus();
  },30);
}
function closeProductModal(){
  if(!productModal)return;
  productModal.classList.remove('show');
  productModal.setAttribute('aria-hidden','true');
}
window.openProductModal=openProductModal;
window.closeProductModal=closeProductModal;

function getFormPayload(){
  const formData=new FormData(productForm);const payload=Object.fromEntries(formData.entries());
  payload.costPrice=Number(payload.costPrice||0);payload.salePrice=Number(payload.salePrice||0);
  payload.conversionRate=Number(payload.conversionRate||1);
  payload.pickingZone=payload.pickingZone||'HC';
  payload.minStock=Number(payload.minStock||0);payload.maxStock=Number(payload.maxStock||0);
  payload.isActive=productForm.elements.isActive.checked;return payload;
}
function resetForm(){productForm.reset();productForm.elements.id.value='';productForm.elements.isActive.checked=true;formTitle.textContent='Thêm sản phẩm';showMessage(formMessage,'')}
function fillForm(p){
  productForm.elements.id.value=p.id||'';productForm.elements.code.value=p.code||'';productForm.elements.name.value=p.name||'';
  productForm.elements.unit.value=p.unit||'';productForm.elements.category.value=p.category||'';
  if(productForm.elements.baseUnit)productForm.elements.baseUnit.value=p.baseUnit||'';
  if(productForm.elements.conversionRate)productForm.elements.conversionRate.value=p.conversionRate||1;
  if(productForm.elements.packing)productForm.elements.packing.value=p.packing||'';
  if(productForm.elements.pickingZone)productForm.elements.pickingZone.value=p.pickingZone||((p.warehouseCode||p.printGroup)==='KHO_PC'?'PC':'HC');
  productForm.elements.barcode.value=p.barcode||'';
  productForm.elements.costPrice.value=p.costPrice||0;productForm.elements.salePrice.value=p.salePrice||0;
  productForm.elements.minStock.value=p.minStock||0;productForm.elements.maxStock.value=p.maxStock||0;
  productForm.elements.isActive.checked=p.isActive!==false;formTitle.textContent=`Sửa sản phẩm: ${p.code}`;
  showMessage(formMessage,'Đang sửa sản phẩm. Bấm "Nhập mới" nếu muốn thêm sản phẩm khác.');
  openProductModal();
}

async function loadProducts(options = {}){
  if(productListLoadPromise){
    productListQueuedOptions={...options};
    return productListLoadPromise;
  }
  const requestSeq = ++productListRequestSeq;
  const q=searchInput?searchInput.value.trim():'';
  const resetPage=options.resetPage===true;
  const allowEmpty = options.allowEmpty === true;
  if(resetPage) productPage=1;
  if(productPage<1) productPage=1;
  if(!allowEmpty && q.length < 2){
    productsCache=[];
    productTotal=0;
    productTotalPages=1;
    selectedProductIds.clear();
    if(productCount)productCount.textContent='Nhập ít nhất 2 ký tự để tìm sản phẩm';
    if(productTable)productTable.innerHTML='<tr><td colspan="3" class="empty-cell">Nhập ít nhất 2 ký tự để tải danh sách sản phẩm.</td></tr>';
    updateProductBulkUI();
    renderProductPagination();
    return null;
  }
  const limit=Number(productPageSize||50);
  setProductListLoading(true);
  const runPromise=(async()=>{
    try{
      if(productTable) productTable.innerHTML='<tr><td colspan="3" class="empty-cell">Đang tải sản phẩm...</td></tr>';
      // Bảng danh sách sản phẩm gọi thẳng API /api/products để lấy Mongo + phân trang thật.
      // CatalogCache chỉ phục vụ autocomplete/lazy search.
      const allowAllParam = allowEmpty && !q ? '&allowAll=1' : '';
      const result = await (window.fetchWithTimeout||fetch)(`/api/products?page=${productPage}&limit=${limit}${q?`&q=${encodeURIComponent(q)}`:''}${allowAllParam}&_t=${Date.now()}`, {}, 10000)
        .then(async res=>{
          const json=await res.json();
          if(!json.ok)throw new Error(json.message||'Không tải được sản phẩm');
          return {rows:json.products||json.rows||json.items||json.data||[],meta:json.meta||null};
        });
      if(requestSeq !== productListRequestSeq) return null;
      const rawRows = Array.isArray(result.rows) ? result.rows : [];
      productsCache = rawRows;
      if(window.UnifiedProductSearch) window.UnifiedProductSearch.sync(productsCache);
      productTotal = Number(result.meta?.total ?? productsCache.length);
      productTotalPages = Math.max(1, Number(result.meta?.totalPages ?? Math.ceil(productTotal/limit) ?? 1));
      if(productPage>productTotalPages && productTotalPages>0){
        productPage=productTotalPages;
        if(!productListQueuedOptions)productListQueuedOptions={allowEmpty};
        return null;
      }
      if(productCount)productCount.textContent=`${productTotal} sản phẩm`;
      renderProductTable();
      renderProductPagination();
      renderImportProductSelect();
      renderSalesProductSelect();
      return result;
    }catch(err){
      if(requestSeq !== productListRequestSeq)return null;
      if(productCount)productCount.textContent='Lỗi tải dữ liệu';
      if(productTable)productTable.innerHTML=`<tr><td colspan="3" class="empty-cell">${escapeProductHtml(err.message)}</td></tr>`;
      return null;
    }
  })();
  productListLoadPromise=runPromise;
  try{
    return await runPromise;
  }finally{
    productListLoadPromise=null;
    const queuedOptions=productListQueuedOptions;
    productListQueuedOptions=null;
    if(queuedOptions)await loadProducts(queuedOptions);
    else setProductListLoading(false);
  }
}
function getProductPageRows(){
  return productsCache || [];
}
function renderProductPagination(){
  if(!productPagination)return;
  const total=Number(productTotal||productsCache.length||0);
  const totalPages=Math.max(1,Number(productTotalPages||Math.ceil(total/(productPageSize||50))||1));
  const start=total && productsCache.length ? ((productPage-1)*productPageSize+1) : 0;
  const end=Math.min(total,(productPage-1)*productPageSize+(productsCache?productsCache.length:0));
  if(productPageInfo)productPageInfo.textContent=`Hiển thị ${start}-${end} / ${total} sản phẩm · Trang ${productPage}/${totalPages}`;
  if(productPrevPage)productPrevPage.disabled=productListLoading||productPage<=1;
  if(productNextPage)productNextPage.disabled=productListLoading||productPage>=totalPages;
  if(productPageSizeSelect&&Number(productPageSizeSelect.value)!==productPageSize)productPageSizeSelect.value=String(productPageSize);
}
function updateProductBulkUI(){
  if(!productBulkActions)return;
  const visibleIds=new Set((productsCache||[]).map(p=>p.id));
  selectedProductIds=new Set([...selectedProductIds].filter(id=>visibleIds.has(id)));
  const count=selectedProductIds.size;
  productBulkActions.hidden=count===0;
  if(productSelectedCount)productSelectedCount.textContent=String(count);
  if(bulkEditProductButton){
    bulkEditProductButton.disabled=count!==1;
    bulkEditProductButton.title=count!==1?'Chỉ sửa khi chọn đúng 1 sản phẩm':'Sửa sản phẩm đang chọn';
  }
  if(productCheckAll){
    const visibleCount=(productsCache||[]).length;
    productCheckAll.checked=visibleCount>0 && count===visibleCount;
    productCheckAll.indeterminate=count>0 && count<visibleCount;
  }
}
function renderProductTable(){
  if(!productTable)return;
  if(!productsCache.length){
    selectedProductIds.clear();
    const q = searchInput ? searchInput.value.trim() : '';
    productTable.innerHTML=`<tr><td colspan="3" class="empty-cell">${q ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm'}</td></tr>`;
    updateProductBulkUI();
    return;
  }
  productTable.innerHTML=productsCache.map(p=>{
    const selected=selectedProductIds.has(p.id);
    const active=p.isActive!==false;
    const packingText=p.packing||((p.baseUnit&&p.conversionRate>1)?`1 ${p.unit||''} = ${p.conversionRate} ${p.baseUnit}`:'');
    const id=escapeProductHtml(p.id||'');
    const code=escapeProductHtml(p.code||'');
    const name=escapeProductHtml(p.name||'');
    const category=escapeProductHtml(p.category||'');
    const safePacking=escapeProductHtml(packingText||'');
    const pickingZone=escapeProductHtml(p.pickingZoneName||p.pickingZone||((p.warehouseCode||p.printGroup)==='KHO_PC'?'PC':'HC'));
    const unit=escapeProductHtml(p.unit||'');
    return `
    <tr class="product-compact-row ${selected?'selected':''}">
      <td class="product-select-cell">
        <input type="checkbox" class="product-row-check" data-id="${id}" ${selected?'checked':''} aria-label="Chọn sản phẩm ${code}" />
      </td>
      <td class="product-compact-cell" colspan="2">
        <div class="product-compact-main">
          <div class="product-title-wrap">
            <strong class="product-code-chip">${code}</strong>
            <span class="product-name-line" title="${name}">${name}</span>
            <span class="product-status-badge ${active?'active':'inactive'}">${active?'Mở bán':'Ngừng bán'}</span>
          </div>
        </div>
        <div class="product-compact-meta">
          ${category?`<span>Nhóm: <b>${category}</b></span>`:''}
          ${safePacking?`<span>Quy cách: <b>${safePacking}</b></span>`:''}
          <span>Khu bốc: <b>${pickingZone}</b></span>
          <span>ĐVT: <b>${unit}</b></span>
          <span>Nhập: <b>${money(p.costPrice)}</b></span>
          <span>Bán: <b>${money(p.salePrice)}</b></span>
          <span>Min/max: <b>${money(p.minStock)} / ${money(p.maxStock)}</b></span>
        </div>
      </td>
    </tr>`;
  }).join('');
  updateProductBulkUI();
}
function getSelectedProductIds(){
  return [...selectedProductIds];
}
window.editProduct=id=>{const p=productsCache.find(x=>x.id===id);if(p)fillForm(p)};
window.toggleProductStatus=async(id,nextStatus)=>{
  try{
    const res=await fetch(`/api/products/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isActive:nextStatus})});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không đổi được trạng thái');
    showMessage(formMessage,json.message);if(window.CatalogCache)window.CatalogCache.invalidate('products');await loadProducts({allowEmpty:!(searchInput&&searchInput.value.trim())});await loadStock();
  }catch(err){showMessage(formMessage,err.message,true)}
};
async function bulkToggleProductStatus(nextStatus){
  if(productBulkActionPromise)return productBulkActionPromise;
  const ids=getSelectedProductIds();
  if(!ids.length)return showMessage(formMessage,'Chưa chọn sản phẩm',true);
  const actionText=nextStatus?'mở bán':'ngừng bán';
  if(!confirm(`Xác nhận ${actionText} ${ids.length} sản phẩm đã chọn?`))return null;
  setProductBulkActionLoading(true);
  productBulkActionPromise=(async()=>{
    try{
      for(const id of ids){
        const res=await fetch(`/api/products/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isActive:nextStatus})});
        const json=await res.json();if(!json.ok)throw new Error(json.message||`Không ${actionText} được sản phẩm`);
      }
      selectedProductIds.clear();
      showMessage(formMessage,`Đã ${actionText} ${ids.length} sản phẩm`);
      if(window.CatalogCache)window.CatalogCache.invalidate('products');
      await loadProducts({allowEmpty:!(searchInput&&searchInput.value.trim())});
      await loadStock();
    }catch(err){showMessage(formMessage,err.message,true)}
  })();
  try{return await productBulkActionPromise;}
  finally{
    productBulkActionPromise=null;
    setProductBulkActionLoading(false);
    updateProductBulkUI();
  }
}
if(productTable){
  productTable.addEventListener('change',event=>{
    const check=event.target.closest('.product-row-check');
    if(!check)return;
    if(check.checked)selectedProductIds.add(check.dataset.id);
    else selectedProductIds.delete(check.dataset.id);
    renderProductTable();
  });
}
if(productCheckAll){
  productCheckAll.addEventListener('change',()=>{
    if(productCheckAll.checked)(productsCache||[]).forEach(p=>selectedProductIds.add(p.id));
    else selectedProductIds.clear();
    renderProductTable();
  });
}
if(bulkEditProductButton){
  bulkEditProductButton.addEventListener('click',()=>{
    const ids=getSelectedProductIds();
    if(ids.length!==1)return showMessage(formMessage,'Chỉ được chọn 1 sản phẩm để sửa',true);
    const p=productsCache.find(x=>x.id===ids[0]);
    if(p)fillForm(p);
  });
}
if(openProductModalButton){
  openProductModalButton.addEventListener('click',()=>{resetForm();openProductModal();});
}
if(closeProductModalButton)closeProductModalButton.addEventListener('click',closeProductModal);
if(productModal){
  productModal.addEventListener('click',event=>{if(event.target===productModal)closeProductModal();});
}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&productModal&&productModal.classList.contains('show'))closeProductModal();
});

if(bulkOpenProductButton)bulkOpenProductButton.addEventListener('click',()=>bulkToggleProductStatus(true));
if(bulkStopProductButton)bulkStopProductButton.addEventListener('click',()=>bulkToggleProductStatus(false));
productForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(productSavePromise)return productSavePromise;
  const payload=getFormPayload();const id=productForm.elements.id.value;const url=id?`/api/products/${id}`:'/api/products';const method=id?'PUT':'POST';
  setProductFormLoading(true);
  productSavePromise=(async()=>{
    try{
      const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được sản phẩm');
      resetForm();
      showMessage(formMessage,json.message||'Đã lưu sản phẩm thành công');
      closeProductModal();
      if(window.CatalogCache)window.CatalogCache.invalidate('products');
      await loadProducts({allowEmpty:!(searchInput&&searchInput.value.trim())});
      await loadStock();
    }catch(err){showMessage(formMessage,err.message,true)}
  })();
  try{return await productSavePromise;}
  finally{
    productSavePromise=null;
    setProductFormLoading(false);
  }
});

// Customers
