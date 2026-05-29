// Products
let productListRequestSeq = 0;

function normalizeProductTableSearch(value){
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .trim();
}
function productMatchesTableQuery(product = {}, keyword = ''){
  const q = normalizeProductTableSearch(keyword);
  if(!q) return true;
  const fields = [
    product.code,
    product.sku,
    product.productCode,
    product.barcode,
    product.name,
    product.category,
    product.brand,
    product.packing,
    product.unit,
    product.baseUnit,
    product.searchText
  ];
  return fields.some(value => normalizeProductTableSearch(value).includes(q));
}
function getFormPayload(){
  const formData=new FormData(productForm);const payload=Object.fromEntries(formData.entries());
  payload.costPrice=Number(payload.costPrice||0);payload.salePrice=Number(payload.salePrice||0);
  payload.conversionRate=Number(payload.conversionRate||1);
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
  productForm.elements.barcode.value=p.barcode||'';
  productForm.elements.costPrice.value=p.costPrice||0;productForm.elements.salePrice.value=p.salePrice||0;
  productForm.elements.minStock.value=p.minStock||0;productForm.elements.maxStock.value=p.maxStock||0;
  productForm.elements.isActive.checked=p.isActive!==false;formTitle.textContent=`Sửa sản phẩm: ${p.code}`;
  showMessage(formMessage,'Đang sửa sản phẩm. Bấm "Nhập mới" nếu muốn thêm sản phẩm khác.');window.scrollTo({top:0,behavior:'smooth'});
}
async function loadProducts(options = {}){
  const requestSeq = ++productListRequestSeq;
  const q=searchInput?searchInput.value.trim():'';
  const resetPage=options.resetPage===true;
  if(resetPage) productPage=1;
  if(productPage<1) productPage=1;
  const limit=Number(productPageSize||50);
  try{
    if(productTable) productTable.innerHTML='<tr><td colspan="3" class="empty-cell">Đang tải sản phẩm...</td></tr>';
    // Phase 3.6 fixed: danh sách chính dùng server-side pagination thật.
    // limit chỉ là số dòng hiển thị/trang, không giới hạn nguồn dữ liệu.
    const result = window.CatalogCache
      ? await window.CatalogCache.listProducts({page:productPage,limit,q})
      : await fetch(`/api/products?page=${productPage}&limit=${limit}${q?`&q=${encodeURIComponent(q)}`:''}&_t=${Date.now()}`).then(async res=>{const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sản phẩm');return {rows:json.products||[],meta:json.meta||null}});
    if(requestSeq !== productListRequestSeq) return;
    const rawRows = Array.isArray(result.rows) ? result.rows : [];
    // Chốt chặn frontend: nếu backend/proxy trả nhầm trang mặc định khi có q,
    // không để bảng sản phẩm hiển thị dữ liệu cũ hoặc dữ liệu không khớp từ khóa.
    productsCache = q ? rawRows.filter(row => productMatchesTableQuery(row, q)) : rawRows;
    if(window.UnifiedProductSearch) window.UnifiedProductSearch.sync(productsCache);
    productTotal = Number(result.meta?.total ?? productsCache.length);
    if(q && rawRows.length !== productsCache.length){
      productTotal = productsCache.length;
    }
    productTotalPages = Math.max(1, Number(result.meta?.totalPages ?? Math.ceil(productTotal/limit) ?? 1));
    if(productPage>productTotalPages && productTotalPages>0){
      productPage=productTotalPages;
      return loadProducts();
    }
    if(productCount)productCount.textContent=`${productTotal} sản phẩm`;
    renderProductTable();renderProductPagination();renderImportProductSelect();renderSalesProductSelect();
  }catch(err){if(productCount)productCount.textContent='Lỗi tải dữ liệu';if(productTable)productTable.innerHTML=`<tr><td colspan="3" class="empty-cell">${err.message}</td></tr>`}
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
  if(productPrevPage)productPrevPage.disabled=productPage<=1;
  if(productNextPage)productNextPage.disabled=productPage>=totalPages;
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
    return `
    <tr class="product-compact-row ${selected?'selected':''}">
      <td class="product-select-cell">
        <input type="checkbox" class="product-row-check" data-id="${p.id}" ${selected?'checked':''} aria-label="Chọn sản phẩm ${p.code||''}" />
      </td>
      <td class="product-compact-cell" colspan="2">
        <div class="product-compact-main">
          <div class="product-title-wrap">
            <strong class="product-code-chip">${p.code||''}</strong>
            <span class="product-name-line" title="${p.name||''}">${p.name||''}</span>
            <span class="product-status-badge ${active?'active':'inactive'}">${active?'Mở bán':'Ngừng bán'}</span>
          </div>
        </div>
        <div class="product-compact-meta">
          ${p.category?`<span>Nhóm: <b>${p.category}</b></span>`:''}
          ${packingText?`<span>Quy cách: <b>${packingText}</b></span>`:''}
          <span>ĐVT: <b>${p.unit||''}</b></span>
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
    showMessage(formMessage,json.message);if(window.CatalogCache)window.CatalogCache.invalidate('products');await loadProducts();await loadStock();
  }catch(err){showMessage(formMessage,err.message,true)}
};
async function bulkToggleProductStatus(nextStatus){
  const ids=getSelectedProductIds();
  if(!ids.length)return showMessage(formMessage,'Chưa chọn sản phẩm',true);
  const actionText=nextStatus?'mở bán':'ngừng bán';
  if(!confirm(`Xác nhận ${actionText} ${ids.length} sản phẩm đã chọn?`))return;
  try{
    for(const id of ids){
      const res=await fetch(`/api/products/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isActive:nextStatus})});
      const json=await res.json();if(!json.ok)throw new Error(json.message||`Không ${actionText} được sản phẩm`);
    }
    selectedProductIds.clear();
    showMessage(formMessage,`Đã ${actionText} ${ids.length} sản phẩm`);
    if(window.CatalogCache)window.CatalogCache.invalidate('products');await loadProducts();await loadStock();
  }catch(err){showMessage(formMessage,err.message,true)}
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
if(bulkOpenProductButton)bulkOpenProductButton.addEventListener('click',()=>bulkToggleProductStatus(true));
if(bulkStopProductButton)bulkStopProductButton.addEventListener('click',()=>bulkToggleProductStatus(false));
productForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload=getFormPayload();const id=productForm.elements.id.value;const url=id?`/api/products/${id}`:'/api/products';const method=id?'PUT':'POST';
  try{
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được sản phẩm');
    resetForm();showMessage(formMessage,json.message||'Đã lưu sản phẩm thành công');if(window.CatalogCache)window.CatalogCache.invalidate('products');await loadProducts();await loadStock();
  }catch(err){showMessage(formMessage,err.message,true)}
});

// Customers
