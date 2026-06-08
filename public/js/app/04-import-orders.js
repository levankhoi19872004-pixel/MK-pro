
function openImportOrderModal(){
  if(!importOrderModal)return;
  importOrderModal.classList.add('show');
  importOrderModal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  setTimeout(()=>{try{importForm?.elements?.date?.focus()}catch(_){}} ,0);
}
function closeImportOrderModal(){
  if(!importOrderModal)return;
  importOrderModal.classList.remove('show');
  importOrderModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
// Product autocomplete is handled centrally by public/js/search/autocompleteEngine.js + productSearchBox.js.
function importProductCost(p){
  return Number(p?.costPrice ?? p?.importPrice ?? p?.purchasePrice ?? p?.lastCostPrice ?? 0);
}
function getSelectedImportProduct(){
  const selected=window.__selectedImportProduct;
  const selectedKey=getProductKey(selected);
  const hiddenKey=String(importProductSelect?.value||'').trim();
  if(selected && (!hiddenKey || selectedKey===hiddenKey || [selected.code,selected.id,selected._id,selected.productCode,selected.sku,selected.barcode].map(v=>String(v||'').trim()).includes(hiddenKey))) return selected;
  return findProductByKey(hiddenKey || importProductSearch?.value || '');
}
function selectImportProduct(p){
  if(!p)return;
  window.__selectedImportProduct=p;
  if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync==='function') window.UnifiedProductSearch.sync([p]);
  importProductSelect.value=getProductKey(p);
  if(importProductSearch){
    importProductSearch.value=productSuggestionLabel(p);
    importProductSearch.dataset.selectedId=getProductKey(p);
    importProductSearch.dataset.targetHidden='importProductSelect';
  }
  if(importCostPrice)importCostPrice.value=importProductCost(p);
  hideSuggestions(importProductSuggestions);
}
function renderImportProductSelect(){
  if(!importProductSearch)return;
  const catalog = window.UnifiedProductSearch ? window.UnifiedProductSearch.getCatalog() : productsCache;
  const has=(catalog||[]).some(p=>p.isActive!==false);
  importProductSearch.disabled=false;
  importProductSearch.placeholder=has?'Gõ mã/tên/barcode sản phẩm...':'Đang tải sản phẩm, bấm vào để tải lại...';
}
function syncImportCostPrice(){
  const p=getSelectedImportProduct();
  if(p&&importCostPrice)importCostPrice.value=importProductCost(p);
}
function displayImportItemQtyTL(item = {}){
  if(typeof formatCaseLooseStock === 'function') return formatCaseLooseStock(Number(item.quantity||0), Number(item.conversionRate||item.packingQty||1));
  const helper = window.V45Common && window.V45Common.calculateCartonUnit;
  return helper ? helper(Number(item.quantity||0), Number(item.conversionRate||item.packingQty||1)).display : money(item.quantity||0);
}
function renderImportItems(){
  const tq=importItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=importItems.reduce((s,i)=>s+Number(i.amount||0),0);
  importTotalQuantity.textContent=money(tq);importTotalAmount.textContent=money(ta);
  if(!importItems.length){importItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  importItemsTable.innerHTML=importItems.map((i,idx)=>`<tr><td><strong>${i.productCode}</strong></td><td>${i.productName}</td><td>${displayImportItemQtyTL(i)}</td><td class="price">${money(i.costPrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" onclick="removeImportItem(${idx})">Xóa</button></td></tr>`).join('');
}
window.removeImportItem=index=>{importItems.splice(index,1);renderImportItems()};
function addImportItem(){
  const p=getSelectedImportProduct();if(!p){showMessage(importMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const quantity=Number(importQuantity.value||0);const costPrice=importProductCost(p);
  if(importCostPrice)importCostPrice.value=costPrice;
  if(quantity<=0){showMessage(importMessage,'Số lượng nhập phải lớn hơn 0',true);return}
  const meta=productLineMeta(p);
  // HC/PC chỉ là nhóm in/gộp đơn nhập, không phải kho tồn.
  const warehouseCode=meta.printGroup||meta.warehouseCode||p.printGroup||p.defaultWarehouse||p.warehouseCode||'KHO_HC';
  const warehouseName=meta.printGroupName||meta.warehouseName||(warehouseCode==='KHO_PC'?'KHO PC':'KHO HC');
  const productCode=p.code||p.productCode||p.sku||getProductKey(p);
  const existed=importItems.find(i=>i.productCode===productCode&&i.costPrice===costPrice&&String(i.warehouseCode||'KHO_HC')===String(warehouseCode));
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.costPrice}else importItems.push({productId:getProductKey(p),productCode,productName:p.name||p.productName||'',...meta,printGroup:warehouseCode,printGroupName:warehouseName,warehouseCode,warehouseName,quantity,costPrice,amount:quantity*costPrice});
  importQuantity.value=1;importProductSelect.value='';window.__selectedImportProduct=null;if(importProductSearch){importProductSearch.value='';importProductSearch.dataset.selectedId='';}if(importCostPrice)importCostPrice.value=0;showMessage(importMessage,'');renderImportItems();
}
function resetImportFormAfterSave(){
  editingImportOrderId=null;
  importItems=[];
  window.__selectedImportProduct=null;
  importForm.reset();
  importForm.elements.date.value=today();
  if(importProductSelect)importProductSelect.value='';
  if(importProductSearch){importProductSearch.value='';importProductSearch.dataset.selectedId='';}
  if(importCostPrice)importCostPrice.value=0;
  const submitButton=importForm.querySelector('button[type="submit"]');
  if(submitButton)submitButton.textContent='Lưu phiếu nhập nháp';
  renderImportItems();
}
function skipImportDraft(){
  resetImportFormAfterSave();
  showMessage(importMessage,'');
  closeImportOrderModal();
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
    printGroup:i.printGroup||i.warehouseCode||'KHO_HC',
    printGroupName:i.printGroupName||i.warehouseName||((i.printGroup||i.warehouseCode||'KHO_HC')==='KHO_PC'?'KHO PC':'KHO HC'),
    warehouseCode:i.warehouseCode||i.printGroup||'KHO_HC',
    warehouseName:i.warehouseName||i.printGroupName||((i.warehouseCode||i.printGroup||'KHO_HC')==='KHO_PC'?'KHO PC':'KHO HC'),
    quantity:Number(i.quantity||0),
    costPrice:Number(i.costPrice||0),
    amount:Number(i.amount||Number(i.quantity||0)*Number(i.costPrice||0))
  }));
  const submitButton=importForm.querySelector('button[type="submit"]');
  if(submitButton)submitButton.textContent='Lưu sửa phiếu nhập nháp';
  renderImportItems();
  showMessage(importMessage,`Đang sửa phiếu nhập ${order.code||order.id}. Kiểm tra lại dòng hàng rồi bấm lưu.`);
  openImportOrderModal();
}
window.editImportOrder=editImportOrder;
async function submitImportOrder(event){
  event.preventDefault();
  if(!importItems.length){showMessage(importMessage,'Phiếu nhập chưa có dòng hàng',true);return}
  const payload=Object.fromEntries(new FormData(importForm).entries());
  payload.items=importItems.map(i=>({productCode:i.productCode,productId:i.productId,quantity:i.quantity,printGroup:i.printGroup||i.warehouseCode,printGroupName:i.printGroupName||i.warehouseName,warehouseCode:i.warehouseCode,warehouseName:i.warehouseName}));
  try{
    const url=editingImportOrderId?`/api/import-orders/${encodeURIComponent(editingImportOrderId)}`:'/api/import-orders';
    const method=editingImportOrderId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-User-Role':'admin'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được phiếu nhập');
    resetImportFormAfterSave();
    showMessage(importMessage,json.message||'Đã lưu phiếu nhập nháp');
    closeImportOrderModal();
    await loadImportOrders();
  }catch(err){showMessage(importMessage,err.message,true)}
}

// Sales

if(openImportOrderModalButton)openImportOrderModalButton.addEventListener('click',()=>{
  resetImportFormAfterSave();
  showMessage(importMessage,'');
  openImportOrderModal();
});
if(closeImportOrderModalButton)closeImportOrderModalButton.addEventListener('click',closeImportOrderModal);
if(importOrderModal)importOrderModal.addEventListener('click',(event)=>{
  if(event.target===importOrderModal)closeImportOrderModal();
});
document.addEventListener('keydown',(event)=>{
  if(event.key==='Escape' && importOrderModal?.classList.contains('show'))closeImportOrderModal();
});
if(importForm)importForm.addEventListener('submit',submitImportOrder);
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(skipImportDraftButton)skipImportDraftButton.addEventListener('click',skipImportDraft);
if(importProductSearch)importProductSearch.addEventListener('change',syncImportCostPrice);
