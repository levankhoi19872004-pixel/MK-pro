function getImportProductMatches(){
  const q=importProductSearch?importProductSearch.value.trim():'';
  return productsCache
    .filter(p=>p.isActive!==false)
    .filter(p=>matchSearch(q,[p.code,p.name,p.barcode,p.category,p.packing,p.unit,p.baseUnit]));
}
function selectImportProduct(p){
  if(!p)return;
  importProductSelect.value=getProductKey(p);
  if(importProductSearch){
    importProductSearch.value=productSuggestionLabel(p);
    importProductSearch.dataset.selectedId=getProductKey(p);
    importProductSearch.dataset.targetHidden='importProductSelect';
  }
  if(importCostPrice)importCostPrice.value=Number(p.costPrice||0);
  hideSuggestions(importProductSuggestions);
}
function renderImportProductSelect(){
  if(!importProductSearch)return;
  if(!productsCache.some(p=>p.isActive!==false)){
    importProductSearch.placeholder='Chưa có sản phẩm mở bán';
    importProductSearch.disabled=true;
    return;
  }
  importProductSearch.disabled=false;
  importProductSearch.placeholder='Gõ mã/tên/barcode sản phẩm...';
}
function syncImportCostPrice(){
  const p=findProductByKey(importProductSelect.value);
  if(p&&importCostPrice)importCostPrice.value=Number(p.costPrice||0);
}
function renderImportItems(){
  const tq=importItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=importItems.reduce((s,i)=>s+Number(i.amount||0),0);
  importTotalQuantity.textContent=money(tq);importTotalAmount.textContent=money(ta);
  if(!importItems.length){importItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  importItemsTable.innerHTML=importItems.map((i,idx)=>`<tr><td><strong>${i.productCode}</strong></td><td>${i.productName}</td><td>${money(i.quantity)}</td><td class="price">${money(i.costPrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" onclick="removeImportItem(${idx})">Xóa</button></td></tr>`).join('');
}
window.removeImportItem=index=>{importItems.splice(index,1);renderImportItems()};
function addImportItem(){
  const p=findProductByKey(importProductSelect.value);if(!p){showMessage(importMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const quantity=Number(importQuantity.value||0);const costPrice=Number(importCostPrice.value||0);
  if(quantity<=0){showMessage(importMessage,'Số lượng nhập phải lớn hơn 0',true);return}
  if(costPrice<0){showMessage(importMessage,'Giá nhập không được âm',true);return}
  const existed=importItems.find(i=>i.productCode===p.code&&i.costPrice===costPrice);
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.costPrice}else importItems.push({productId:getProductKey(p),productCode:p.code,productName:p.name,...productLineMeta(p),quantity,costPrice,amount:quantity*costPrice});
  importQuantity.value=1;importProductSelect.value='';if(importProductSearch){importProductSearch.value='';importProductSearch.dataset.selectedId='';}showMessage(importMessage,'');renderImportItems();
}
function resetImportFormAfterSave(){
  editingImportOrderId=null;
  importItems=[];
  importForm.reset();
  importForm.elements.date.value=today();
  const submitButton=importForm.querySelector('button[type="submit"]');
  if(submitButton)submitButton.textContent='Tạo phiếu nhập & cộng tồn';
  renderImportItems();
}
function editImportOrder(idx){
  const order=window.__importOrdersCache?.[idx];
  if(!order)return;
  editingImportOrderId=order.id||order.code;
  importForm.elements.date.value=order.date||today();
  importForm.elements.supplier.value=order.supplier||'';
  importForm.elements.note.value=order.note||'';
  importItems=(order.items||[]).map(i=>({
    productId:i.productId,
    productCode:i.productCode,
    productName:i.productName,
    unit:i.unit||'',
    baseUnit:i.baseUnit||'',
    conversionRate:Number(i.conversionRate||1),
    packing:i.packing||'',
    quantity:Number(i.quantity||0),
    costPrice:Number(i.costPrice||0),
    amount:Number(i.amount||Number(i.quantity||0)*Number(i.costPrice||0))
  }));
  const submitButton=importForm.querySelector('button[type="submit"]');
  if(submitButton)submitButton.textContent='Lưu sửa phiếu nhập';
  renderImportItems();
  showMessage(importMessage,`Đang sửa phiếu nhập ${order.code||order.id}. Kiểm tra lại dòng hàng rồi bấm lưu.`);
  document.getElementById('importTab')?.scrollIntoView({behavior:'smooth',block:'start'});
}
window.editImportOrder=editImportOrder;
async function submitImportOrder(event){
  event.preventDefault();
  if(!importItems.length){showMessage(importMessage,'Phiếu nhập chưa có dòng hàng',true);return}
  const payload=Object.fromEntries(new FormData(importForm).entries());
  payload.items=importItems.map(i=>({productCode:i.productCode,quantity:i.quantity,costPrice:i.costPrice}));
  try{
    const url=editingImportOrderId?`/api/import-orders/${encodeURIComponent(editingImportOrderId)}`:'/api/import-orders';
    const method=editingImportOrderId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-User-Role':'admin'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được phiếu nhập');
    resetImportFormAfterSave();
    showMessage(importMessage,json.message||'Đã lưu phiếu nhập');
    await loadStock();await loadImportOrders();
  }catch(err){showMessage(importMessage,err.message,true)}
}

// Sales
