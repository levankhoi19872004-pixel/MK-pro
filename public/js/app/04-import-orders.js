const escapeImportOrderHtml = (window.V45Common && window.V45Common.escapeHtml) || ((value='')=>String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])));
function importOrderNoteText(order={}){
  return [
    order.note,
    order.notes,
    order.remark,
    order.remarks,
    order.description,
    order.memo
  ].map(value=>String(value??'').trim()).find(Boolean)||'';
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
  importItemsTable.innerHTML=importItems.map((i,idx)=>`<tr><td><strong>${escapeImportOrderHtml(i.productCode||'')}</strong></td><td>${escapeImportOrderHtml(i.productName||'')}</td><td>${escapeImportOrderHtml(displayImportItemQtyTL(i))}</td><td class="price">${money(i.costPrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" data-import-item-action="remove" data-item-index="${idx}">Xóa</button></td></tr>`).join('');
}
window.removeImportItem=index=>{importItems.splice(index,1);renderImportItems()};
if(importItemsTable&&!importItemsTable.dataset.securityDelegationBound){
  importItemsTable.dataset.securityDelegationBound='1';
  importItemsTable.addEventListener('click',event=>{
    const button=event.target.closest('[data-import-item-action="remove"]');
    if(button&&importItemsTable.contains(button))window.removeImportItem(Number(button.dataset.itemIndex));
  });
}
function addImportItem(){
  const p=getSelectedImportProduct();if(!p){showMessage(importMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const quantity=Number(importQuantity.value||0);const costPrice=importProductCost(p);
  if(importCostPrice)importCostPrice.value=costPrice;
  if(quantity<=0){showMessage(importMessage,'Số lượng nhập phải lớn hơn 0',true);return}
  const meta=productLineMeta(p);
  // HC/PC chỉ là nhóm in/gộp đơn nhập, không phải kho tồn.
  const pickingZone=meta.pickingZone||p.pickingZone||((meta.printGroup||meta.warehouseCode||p.printGroup||p.defaultWarehouse||p.warehouseCode)==='KHO_PC'?'PC':'HC');
  const warehouseCode=pickingZone==='PC'?'KHO_PC':'KHO_HC';
  const warehouseName=pickingZone;
  const productCode=p.code||p.productCode||p.sku||getProductKey(p);
  const existed=importItems.find(i=>i.productCode===productCode&&i.costPrice===costPrice&&String(i.warehouseCode||'KHO_HC')===String(warehouseCode));
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.costPrice}else importItems.push({productId:getProductKey(p),productCode,productName:p.name||p.productName||'',...meta,pickingZone,printGroup:warehouseCode,printGroupName:warehouseName,warehouseCode,warehouseName,quantity,costPrice,amount:quantity*costPrice});
  importQuantity.value=1;importProductSelect.value='';window.__selectedImportProduct=null;if(importProductSearch){importProductSearch.value='';importProductSearch.dataset.selectedId='';}if(importCostPrice)importCostPrice.value=0;showMessage(importMessage,'');renderImportItems();
}

window.applyPastedImportItems=function applyPastedImportItems(rows=[],products=[]){
  const productMap=new Map();
  const addKey=(key,product)=>{const normalized=String(key||'').trim().toLowerCase();if(normalized&&!productMap.has(normalized))productMap.set(normalized,product);};
  (products||[]).forEach(product=>[product.code,product.productCode,product.sku,product.barcode,product.id].forEach(key=>addKey(key,product)));
  const errors=[];
  let added=0;
  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    const rowNo=Number(row.__rowNo||index+1);
    const code=String(row.productCode||'').trim();
    const product=productMap.get(code.toLowerCase());
    if(!product){errors.push({rowNo,key:'productCode',message:`Không tìm thấy mã sản phẩm ${code||'(trống)'}`});return;}
    const rate=Math.max(1,Number(product.conversionRate||product.unitsPerCase||1));
    const cases=Number(row.cartonQty||0);
    const loose=Number(row.unitQty||0);
    const explicit=Number(row.quantity||0);
    if(![cases,loose,explicit].every(Number.isFinite)||cases<0||loose<0||explicit<0){errors.push({rowNo,key:'quantity',message:'Số lượng phải là số không âm'});return;}
    const quantity=explicit>0?explicit:(cases*rate+loose);
    if(!(quantity>0)){errors.push({rowNo,key:'quantity',message:'Số lượng nhập phải lớn hơn 0'});return;}
    const costInput=String(row.costPrice??'').trim();
    const costPrice=costInput===''?importProductCost(product):Number(costInput);
    if(!Number.isFinite(costPrice)||costPrice<0){errors.push({rowNo,key:'costPrice',message:'Giá nhập không hợp lệ'});return;}
    const meta=productLineMeta(product);
    const pickingZone=meta.pickingZone||product.pickingZone||((meta.printGroup||meta.warehouseCode||product.printGroup||product.defaultWarehouse||product.warehouseCode)==='KHO_PC'?'PC':'HC');
    const warehouseCode=pickingZone==='PC'?'KHO_PC':'KHO_HC';
    const productCode=product.code||product.productCode||product.sku||code;
    const existed=importItems.find(item=>item.productCode===productCode&&Number(item.costPrice||0)===costPrice&&String(item.warehouseCode||'KHO_HC')===warehouseCode);
    if(existed){existed.quantity=Number(existed.quantity||0)+quantity;existed.amount=existed.quantity*costPrice;}
    else importItems.push({productId:getProductKey(product),productCode,productName:product.name||product.productName||'',...meta,pickingZone,printGroup:warehouseCode,printGroupName:pickingZone,warehouseCode,warehouseName:pickingZone,quantity,costPrice,amount:quantity*costPrice});
    added+=1;
  });
  renderImportItems();
  if(added)showMessage(importMessage,`Đã thêm ${added} dòng từ Excel${errors.length?`, ${errors.length} dòng lỗi`:''}`,false);
  return {added,errors};
};

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

// IMPORT_ORDER_POPUP_PATCH_START: isolated modal controls; no API/business logic changed
function openImportOrderModal(){
  if(!importOrderModal)return;
  importOrderModal.classList.add('show');
  importOrderModal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  setTimeout(()=>{
    try{ importForm?.elements?.date?.focus(); }catch(_err){}
  },0);
}
function closeImportOrderModal(){
  if(!importOrderModal)return;
  importOrderModal.classList.remove('show');
  importOrderModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
function openNewImportOrderModal(){
  resetImportFormAfterSave();
  showMessage(importMessage,'');
  openImportOrderModal();
}
// IMPORT_ORDER_POPUP_PATCH_END
function skipImportDraft(){
  resetImportFormAfterSave();
  showMessage(importMessage,'');
  // IMPORT_ORDER_POPUP_PATCH_START
  closeImportOrderModal();
  // IMPORT_ORDER_POPUP_PATCH_END
}
function editImportOrder(idx){
  const order=window.__importOrdersCache?.[idx];
  if(!order)return;
  editingImportOrderId=order.id||order.code;
  importForm.elements.date.value=order.date||today();
  importForm.elements.supplier.value=order.supplier||'';
  importForm.elements.note.value=importOrderNoteText(order);
  importItems=(order.items||[]).map(i=>({
    productId:i.productId,
    productCode:i.productCode,
    productName:i.productName,
    unit:i.unit||'',
    baseUnit:i.baseUnit||'',
    conversionRate:Number(i.conversionRate||1),
    packing:i.packing||'',
    pickingZone:i.pickingZone||((i.printGroup||i.warehouseCode)==='KHO_PC'?'PC':'HC'),
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
  // IMPORT_ORDER_POPUP_PATCH_START: sửa phiếu mở popup, không scroll form cố định nữa
  openImportOrderModal();
  // IMPORT_ORDER_POPUP_PATCH_END
}
window.editImportOrder=editImportOrder;
async function submitImportOrder(event){
  event.preventDefault();
  if(!importItems.length){showMessage(importMessage,'Phiếu nhập chưa có dòng hàng',true);return}
  const payload=Object.fromEntries(new FormData(importForm).entries());
  payload.items=importItems.map(i=>({productCode:i.productCode,productId:i.productId,quantity:i.quantity,pickingZone:i.pickingZone||((i.printGroup||i.warehouseCode)==='KHO_PC'?'PC':'HC'),printGroup:i.printGroup||i.warehouseCode,printGroupName:i.printGroupName||i.warehouseName,warehouseCode:i.warehouseCode,warehouseName:i.warehouseName}));
  try{
    const url=editingImportOrderId?`/api/import-orders/${encodeURIComponent(editingImportOrderId)}`:'/api/import-orders';
    const method=editingImportOrderId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-User-Role':'admin'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được phiếu nhập');
    resetImportFormAfterSave();
    showMessage(importMessage,json.message||'Đã lưu phiếu nhập nháp');
    // IMPORT_ORDER_POPUP_PATCH_START
    closeImportOrderModal();
    // IMPORT_ORDER_POPUP_PATCH_END
    await loadImportOrders();
  }catch(err){showMessage(importMessage,err.message,true)}
}

// Sales

if(importForm)importForm.addEventListener('submit',submitImportOrder);
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(skipImportDraftButton)skipImportDraftButton.addEventListener('click',skipImportDraft);
if(importProductSearch)importProductSearch.addEventListener('change',syncImportCostPrice);
// IMPORT_ORDER_POPUP_PATCH_START: button wiring only for import modal
if(openImportOrderModalButton)openImportOrderModalButton.addEventListener('click',openNewImportOrderModal);
if(closeImportOrderModalButton)closeImportOrderModalButton.addEventListener('click',()=>{showMessage(importMessage,'');closeImportOrderModal();});
if(importOrderModal)importOrderModal.addEventListener('click',(event)=>{if(event.target===importOrderModal){showMessage(importMessage,'');closeImportOrderModal();}});
// IMPORT_ORDER_POPUP_PATCH_END
