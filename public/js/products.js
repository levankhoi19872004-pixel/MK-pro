// Products
function getFormPayload(){
  const formData=new FormData(productForm);const payload=Object.fromEntries(formData.entries());
  payload.costPrice=Number(payload.costPrice||0);payload.salePrice=Number(payload.salePrice||0);
  payload.minStock=Number(payload.minStock||0);payload.maxStock=Number(payload.maxStock||0);
  payload.isActive=productForm.elements.isActive.checked;return payload;
}
function resetForm(){productForm.reset();productForm.elements.id.value='';productForm.elements.isActive.checked=true;formTitle.textContent='Thêm sản phẩm';showMessage(formMessage,'')}
function fillForm(p){
  productForm.elements.id.value=p.id||'';productForm.elements.code.value=p.code||'';productForm.elements.name.value=p.name||'';
  productForm.elements.unit.value=p.unit||'';productForm.elements.category.value=p.category||'';if(productForm.elements.packing)productForm.elements.packing.value=p.packing||'';productForm.elements.barcode.value=p.barcode||'';
  productForm.elements.costPrice.value=p.costPrice||0;productForm.elements.salePrice.value=p.salePrice||0;
  productForm.elements.minStock.value=p.minStock||0;productForm.elements.maxStock.value=p.maxStock||0;
  productForm.elements.isActive.checked=p.isActive!==false;formTitle.textContent=`Sửa sản phẩm: ${p.code}`;
  showMessage(formMessage,'Đang sửa sản phẩm. Bấm "Nhập mới" nếu muốn thêm sản phẩm khác.');window.scrollTo({top:0,behavior:'smooth'});
}
async function loadProducts(){
  const q=searchInput?searchInput.value.trim():'';
  const url=q?`/api/products?q=${encodeURIComponent(q)}`:'/api/products';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sản phẩm');
    productsCache=json.products||[];if(productCount)productCount.textContent=`${productsCache.length} sản phẩm`;
    renderProductTable();renderImportProductSelect();renderSalesProductSelect();
  }catch(err){if(productCount)productCount.textContent='Lỗi tải dữ liệu';if(productTable)productTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
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
    productTable.innerHTML='<tr><td colspan="7">Chưa có sản phẩm</td></tr>';
    updateProductBulkUI();
    return;
  }
  productTable.innerHTML=productsCache.map(p=>`
    <tr class="product-row ${selectedProductIds.has(p.id)?'selected':''}">
      <td class="product-select-cell"><input type="checkbox" class="product-row-check" data-id="${p.id}" ${selectedProductIds.has(p.id)?'checked':''} aria-label="Chọn sản phẩm ${p.code||''}" /></td>
      <td class="product-code-cell"><strong>${p.code||''}</strong></td>
      <td class="product-info-cell">
        <div class="product-name-line" title="${p.name||''}">${p.name||''}</div>
        <div class="product-meta-line">
          ${p.barcode?`<span>Barcode: ${p.barcode}</span>`:''}
          ${p.category?`<span>Nhóm: ${p.category}</span>`:''}
          ${p.packing?`<span>Quy cách: ${p.packing}</span>`:''}
          <span>Tồn min/max: ${money(p.minStock)} / ${money(p.maxStock)}</span>
        </div>
      </td>
      <td class="product-unit-cell">${p.unit||''}</td>
      <td class="price">${money(p.costPrice)}</td>
      <td class="price">${money(p.salePrice)}</td>
      <td><span class="badge ${p.isActive!==false?'active':'inactive'}">${p.isActive!==false?'Mở bán':'Ngừng bán'}</span></td>
    </tr>`).join('');
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
    showMessage(formMessage,json.message);await loadProducts();await loadStock();
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
    await loadProducts();await loadStock();
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
    resetForm();showMessage(formMessage,json.message||'Đã lưu sản phẩm thành công');await loadProducts();await loadStock();
  }catch(err){showMessage(formMessage,err.message,true)}
});

