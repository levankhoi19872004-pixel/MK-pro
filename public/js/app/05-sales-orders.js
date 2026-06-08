const PRICING_DIRECT_PRICE='DIRECT_PRICE';
const PRICING_PROMOTION='PROMOTION';
function normalizePricingModeClient(value){
  const raw=String(value||'').trim().toUpperCase();
  return raw==='PROMOTION'||raw==='PROMO'||raw==='KM'||raw.includes('KHUYEN')?PRICING_PROMOTION:PRICING_DIRECT_PRICE;
}
let editingSalesOrderId = '';

function getSalesOrderSourceText(order){
  return [
    order?.source,
    order?.orderSource,
    order?.orderSourceName,
    order?.sourceType,
    order?.origin,
    order?.channel,
    order?.createdFrom,
    order?.importSource
  ].filter(v=>v!==undefined&&v!==null).join(' ').toUpperCase();
}
function isAppSalesOrder(order){
  const source=getSalesOrderSourceText(order);
  return source.includes('APP') || source.includes('MOBILE') || source.includes('MOBILE_SALES') || source.includes('NVBH');
}
function isImportSalesOrder(order){
  const source=getSalesOrderSourceText(order);
  return source.includes('DMS') || source.includes('IMPORT') || source.includes('EXCEL');
}
function getExplicitPricingModeForEdit(order){
  // Chỉ ưu tiên các field mode rõ ràng. saleMethod cũ có thể bị backend mặc định sai DIRECT_PRICE cho đơn APP,
  // nên với đơn APP legacy không dùng saleMethod một mình để tránh mở sửa bị tích nhầm bán thẳng.
  const explicit = order?.saleMode || order?.pricingMode || order?.orderPricingMode;
  if(explicit) return normalizePricingModeClient(explicit);
  if(!isAppSalesOrder(order) && order?.saleMethod) return normalizePricingModeClient(order.saleMethod);
  return '';
}
function resolveSalesOrderEditMode(order){
  const explicitMode=getExplicitPricingModeForEdit(order);
  if(explicitMode) return explicitMode;
  if(isAppSalesOrder(order)) return PRICING_PROMOTION;
  if(isImportSalesOrder(order)) return PRICING_DIRECT_PRICE;
  return PRICING_PROMOTION;
}

function getSalesProductCatalog(){
  if(window.UnifiedProductSearch) return window.UnifiedProductSearch.getCatalog();
  const catalog = Array.isArray(salesProductsCache) && salesProductsCache.length ? salesProductsCache : productsCache;
  return Array.isArray(catalog) ? catalog : [];
}
async function loadSalesProductCatalog(){
  try{
    if(window.UnifiedProductSearch){
      salesProductsCache = await window.UnifiedProductSearch.preload({force:false});
      renderSalesProductSelect();
      return salesProductsCache;
    }
    const res = await fetch(`/api/catalog/products/search?q=&limit=50&includeStock=1&activeOnly=1&_t=${Date.now()}`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.message || 'Không tải được danh mục sản phẩm bán hàng');
    salesProductsCache = (json.products || json.items || []).map(p => ({...p}));
    renderSalesProductSelect();
    return salesProductsCache;
  }catch(err){
    console.warn('Không tải được catalog sản phẩm bán hàng:', err.message || err);
    salesProductsCache = Array.isArray(productsCache) ? productsCache : [];
    renderSalesProductSelect();
    return salesProductsCache;
  }
}
function getSalesCustomerMatches(){
  const q=salesCustomerSearch?salesCustomerSearch.value.trim():'';
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchCustomer(q,{limit:20,minChars:0,allowEmpty:'1',showOnFocus:'1'});
  return customersCache
    .filter(c=>c.isActive!==false)
    .filter(c=>matchSearch(q,[c.code,c.name,c.phone,c.address,c.area,c.route,c.staffName]));
}
function selectSalesCustomer(c){
  if(!c)return;
  salesCustomerSelect.value=c.id||'';
  if(salesCustomerSearch){
    salesCustomerSearch.value=customerSuggestionLabel(c);
    salesCustomerSearch.dataset.selectedId=c.id||'';
    salesCustomerSearch.dataset.targetHidden='salesCustomerSelect';
  }
  hideSuggestions(salesCustomerSuggestions);
}
function renderSalesCustomerSelect(){
  if(!salesCustomerSearch)return;
  // V45: khách hàng dùng Unified Search từ /api/search/customers, không phụ thuộc customersCache cũ.
  salesCustomerSearch.disabled=false;
  salesCustomerSearch.placeholder='Bấm để chọn hoặc gõ mã/tên/sđt/tuyến khách hàng...';
}
async function getSalesStaffMatches(){
  const q=salesStaffSearch?salesStaffSearch.value.trim():'';
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchSalesStaff(q,{limit:20,minChars:0,allowEmpty:'1',showOnFocus:'1'});
  return (usersCache||window.__usersCache||[])
    .filter(u=>{
      const role=String(u.role||u.roleLabel||'').toLowerCase();
      return u.isActive!==false && (u.isSalesman===true || u.isSalesStaff===true || ['sales','admin','nvbh','salesstaff','sales_staff'].includes(role) || role.includes('ban hang') || role.includes('sales'));
    })
    .filter(u=>matchSearch(q,[u.code,u.username,u.name,u.fullName,u.phone,u.roleLabel,u.role]));
}
function selectSalesStaff(u){
  if(!u)return;
  if(salesStaffSelect)salesStaffSelect.value=u.code||u.staffCode||u.username||u.id||'';
  if(salesStaffName)salesStaffName.value=u.name||u.fullName||u.username||'';
  if(salesStaffSearch){
    salesStaffSearch.value=staffSuggestionLabel(u);
    salesStaffSearch.dataset.selectedId=u.code||u.staffCode||u.username||u.id||'';
  }
  hideSuggestions(salesStaffSuggestions);
}
function renderSalesStaffSelect(){
  if(!salesStaffSearch)return;
  const has=(usersCache||window.__usersCache||[]).some(u=>u.isActive!==false && ['sales','admin','nvbh'].includes(String(u.role||'').toLowerCase()));
  salesStaffSearch.disabled=false;
  salesStaffSearch.placeholder=has?'Gõ mã/tên/tài khoản NV bán hàng...':'Gõ để tìm NV bán hàng từ Tài khoản';
}
// Product autocomplete is handled centrally by public/js/search/autocompleteEngine.js + productSearchBox.js.
function selectSalesProduct(p){
  if(!p)return;
  salesProductSelect.value=getProductKey(p);
  if(salesProductSearch){
    salesProductSearch.value=productSuggestionLabel(p);
    salesProductSearch.dataset.selectedId=getProductKey(p);
    salesProductSearch.dataset.targetHidden='salesProductSelect';
  }
  if(salesPrice)salesPrice.value=Number(p.salePrice||0);
  hideSuggestions(salesProductSuggestions);
}
function renderSalesProductSelect(){
  if(!salesProductSearch)return;
  const has=getSalesProductCatalog().some(p=>p.isActive!==false);
  salesProductSearch.disabled=false;
  salesProductSearch.placeholder=has?'Gõ mã/tên/barcode sản phẩm...':'Đang tải sản phẩm, bấm vào để tải lại...';
}
function syncSalesPrice(){
  const p=findProductByKey(salesProductSelect.value);
  if(p&&salesPrice)salesPrice.value=Number(p.salePrice||0);
}
function getSelectedSalesProduct(){
  // Ưu tiên hidden value do autocomplete set, sau đó fallback từ dataset, object vừa chọn và text đang hiển thị.
  // Lỗi cũ: input đã hiện label nhưng hidden/cache rỗng nên bấm Thêm vào đơn vẫn báo chưa chọn sản phẩm.
  const keys=[
    salesProductSelect?.value,
    salesProductSearch?.dataset?.selectedId,
    salesProductSearch?.value
  ];
  for(const key of keys){
    const found=findProductByKey(key);
    if(found){
      const productKey=getProductKey(found);
      if(salesProductSelect) salesProductSelect.value=productKey;
      if(salesProductSearch) salesProductSearch.dataset.selectedId=productKey;
      return found;
    }
  }

  const picked=window.__selectedSalesProduct;
  if(picked){
    const pickedKey=getProductKey(picked);
    const inputCode=extractProductCodeFromInput(salesProductSearch?.value || '');
    const selectedKey=String(salesProductSearch?.dataset?.selectedId || salesProductSelect?.value || '').trim();
    if(pickedKey && (!inputCode || inputCode===pickedKey || selectedKey===pickedKey)){
      if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') window.UnifiedProductSearch.sync([picked]);
      if(salesProductSelect) salesProductSelect.value=pickedKey;
      if(salesProductSearch) salesProductSearch.dataset.selectedId=pickedKey;
      return picked;
    }
  }

  // Fallback cuối: người dùng gõ/giữ label dạng "Mã | Tên" thì lấy phần mã để tìm lại.
  const code=extractProductCodeFromInput(salesProductSearch?.value || '');
  const byCode=code ? findProductByKey(code) : null;
  if(byCode){
    const productKey=getProductKey(byCode);
    if(salesProductSelect) salesProductSelect.value=productKey;
    if(salesProductSearch) salesProductSearch.dataset.selectedId=productKey;
    return byCode;
  }
  return null;
}
function getSalesMode(){
  const checked=salesForm?.querySelector('input[name="saleMode"]:checked');
  return checked && checked.value==='promotion' ? PRICING_PROMOTION : PRICING_DIRECT_PRICE;
}
function setSalesMode(mode){
  const normalized=normalizePricingModeClient(mode);
  const input=salesForm?.querySelector(`input[name="saleMode"][value="${normalized===PRICING_PROMOTION?'promotion':'direct'}"]`);
  if(input)input.checked=true;
}
function isDirectSaleMode(){return getSalesMode()===PRICING_DIRECT_PRICE}
function recalcSalesItem(index){
  const item=salesItems[index];
  if(!item)return;
  item.quantity=Number(item.quantity||0);
  item.salePrice=Number(item.salePrice||0);
  item.price=item.salePrice;
  item.amount=item.quantity*item.salePrice;
}
async function recalculateSalesPromotionPrices(){
  if(!salesItems.length)return;
  if(getSalesMode()!==PRICING_PROMOTION)return;
  try{
    const res=await fetch('/api/promotions/calculate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items:salesItems.map(i=>({productCode:i.productCode,quantity:i.quantity}))})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tính được khuyến mại');
    const lines=((json.result&&json.result.lines)||[]);
    const byCode=new Map(lines.map(line=>[String(line.productCode||'').trim(),line]));
    salesItems=salesItems.map(item=>{
      const line=byCode.get(String(item.productCode||'').trim())||{};
      const quantity=Number(item.quantity||0);
      const grossPrice=Number(line.catalogSalePrice||item.grossPrice||item.salePrice||item.price||0);
      const grossAmount=Math.round(quantity*grossPrice);
      const directDiscountAmount=Number(line.directDiscountAmount||0);
      const groupDiscountAmount=Number(line.groupDiscountAmount||0);
      const discountAmount=Math.min(grossAmount,directDiscountAmount+groupDiscountAmount);
      const amount=Math.max(0,grossAmount-discountAmount);
      const finalPrice=quantity>0?Math.round(amount/quantity):0;
      return {...item,grossPrice,catalogSalePrice:grossPrice,grossAmount,directDiscountPercent:Number(line.directDiscountPercent||0),groupDiscountPercent:Number(line.groupDiscountPercent||0),discountPercent:grossAmount>0?(discountAmount/grossAmount)*100:0,directDiscountAmount,groupDiscountAmount,discountAmount,totalDiscountAmount:discountAmount,finalPrice,salePrice:finalPrice,price:finalPrice,amount,saleMethod:PRICING_PROMOTION,saleMode:PRICING_PROMOTION,pricingMode:PRICING_PROMOTION,priceLocked:true,promotionCalculated:true};
    });
  }catch(err){
    showMessage(salesMessage,err.message||'Không tính được khuyến mại',true);
  }
}
async function updateSalesItemQuantity(index,value){
  const item=salesItems[index];
  if(!item)return;
  const next=Number(value||0);
  if(next<0)return;
  item.quantity=next;
  const rate=normalizePackingRate(item);
  const split=splitCaseLoose(item.quantity,rate);
  item.caseQty=split.caseQty;
  item.looseQty=split.looseQty;
  recalcSalesItem(index);
  await recalculateSalesPromotionPrices();
  renderSalesItems();
}
async function rebuildSalesItemQuantity(index){
  const item=salesItems[index];
  if(!item)return;
  const rate=normalizePackingRate(item);
  let caseQty=Math.max(0,Number(item.caseQty||0));
  let looseQty=Math.max(0,Number(item.looseQty||0));
  if(looseQty>=rate){
    caseQty += Math.floor(looseQty/rate);
    looseQty = looseQty % rate;
  }
  item.caseQty=caseQty;
  item.looseQty=looseQty;
  item.quantity=(caseQty*rate)+looseQty;
  recalcSalesItem(index);
  await recalculateSalesPromotionPrices();
  renderSalesItems();
}
function updateSalesItemCase(index,value){
  const item=salesItems[index];
  if(!item)return;
  item.caseQty=Number(value||0);
  rebuildSalesItemQuantity(index);
}
function updateSalesItemLoose(index,value){
  const item=salesItems[index];
  if(!item)return;
  item.looseQty=Number(value||0);
  rebuildSalesItemQuantity(index);
}
function updateSalesItemPrice(index,value){
  if(!isDirectSaleMode())return;
  const item=salesItems[index];
  if(!item)return;
  const next=Number(value||0);
  if(next<0)return;
  item.salePrice=next;
  item.price=next;
  recalcSalesItem(index);
  renderSalesItems();
}
function syncSalesModeUi(){
  const direct=isDirectSaleMode();
  if(salesPrice){
    salesPrice.readOnly=!direct;
    salesPrice.title=direct?'Được sửa giá bán khi bán thẳng':'Giá khóa theo chương trình khuyến mại';
    salesPrice.classList.toggle('readonly-price',!direct);
  }
  renderSalesItems();
}
window.updateSalesItemQuantity=updateSalesItemQuantity;
window.updateSalesItemCase=updateSalesItemCase;
window.updateSalesItemLoose=updateSalesItemLoose;
window.rebuildSalesItemQuantity=rebuildSalesItemQuantity;
window.updateSalesItemPrice=updateSalesItemPrice;
function ensureSalesItemCaseLoose(item){
  if(!item)return;
  const rate=normalizePackingRate(item);
  const hasCaseLoose=item.caseQty!==undefined || item.looseQty!==undefined;
  if(!hasCaseLoose){
    const split=splitCaseLoose(item.quantity,rate);
    item.caseQty=split.caseQty;
    item.looseQty=split.looseQty;
  }
}
function renderSalesItems(){
  const direct=isDirectSaleMode();
  salesItems.forEach(ensureSalesItemCaseLoose);
  const tq=salesItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=salesItems.reduce((s,i)=>s+Number(i.amount||0),0);
  salesTotalQuantity.textContent=money(tq);salesTotalAmount.textContent=money(ta);
  if(!salesItems.length){salesItemsTable.innerHTML='<tr><td colspan="7">Chưa có dòng hàng</td></tr>';return}
  salesItemsTable.innerHTML=salesItems.map((i,idx)=>`<tr>
    <td><strong>${i.productCode}</strong></td>
    <td class="sales-product-name-cell"><span class="sales-product-name-text">${i.productName}</span></td>
    <td><input class="sales-line-input qty-case" type="number" min="0" value="${Number(i.caseQty||0)}" onchange="updateSalesItemCase(${idx}, this.value)"></td>
    <td><input class="sales-line-input qty-loose" type="number" min="0" value="${Number(i.looseQty||0)}" onchange="updateSalesItemLoose(${idx}, this.value)"></td>
    <td class="price"><input class="sales-line-input price" type="number" min="0" value="${Number(i.salePrice||0)}" ${direct?'':'readonly'} onchange="updateSalesItemPrice(${idx}, this.value)"></td>
    <td class="price">${money(i.amount)}</td>
    <td><button type="button" class="small danger" onclick="removeSalesItem(${idx})">Xóa</button></td>
  </tr>`).join('');
}
window.removeSalesItem=async index=>{salesItems.splice(index,1);await recalculateSalesPromotionPrices();renderSalesItems()};
async function addSalesItem(){
  const p=getSelectedSalesProduct();if(!p){showMessage(salesMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const caseQty=Number(salesQuantityCase?.value||0);
  const looseQty=Number(salesQuantityLoose?.value||0);
  const packingRate=Number(p.conversionRate||p.unitsPerCase||0);
  const quantity=(caseQty>0&&packingRate>0?caseQty*packingRate:0)+looseQty+(salesQuantity&&!salesQuantityCase&&!salesQuantityLoose?Number(salesQuantity.value||0):0);
  const salePrice=Number(salesPrice.value||0);
  if(quantity<=0){showMessage(salesMessage,'Số lượng bán phải lớn hơn 0',true);return}
  const availableQty=productAvailableQty(p);
  if(availableQty<=0){showMessage(salesMessage,`Sản phẩm ${p.code||''} hiện hết tồn mở bán. Vui lòng nhập kho/rebuild tồn kho trước khi bán.`,true);return}
  if(quantity>availableQty){showMessage(salesMessage,`Số lượng bán vượt tồn mở bán. Tồn mở bán hiện tại: ${displayQtyTL(availableQty,p)}.`,true);return}
  if(salePrice<0){showMessage(salesMessage,'Giá bán không được âm',true);return}
  const lineMode=getSalesMode();
  const existed=salesItems.find(i=>i.productCode===p.code&&i.salePrice===salePrice&&normalizePricingModeClient(i.saleMode)===lineMode);
  const meta=productLineMeta(p);
  const split=splitCaseLoose(quantity,meta.conversionRate);
  if(existed){
    existed.quantity+=quantity;
    const existedSplit=splitCaseLoose(existed.quantity,normalizePackingRate(existed));
    existed.caseQty=existedSplit.caseQty;
    existed.looseQty=existedSplit.looseQty;
    existed.amount=existed.quantity*existed.salePrice;
  }else salesItems.push({productId:getProductKey(p),productCode:p.code,productName:p.name,...meta,quantity,caseQty:split.caseQty,looseQty:split.looseQty,grossPrice:salePrice,salePrice,price:salePrice,finalPrice:salePrice,discountPercent:0,discountAmount:0,amount:quantity*salePrice,saleMethod:lineMode,saleMode:lineMode,pricingMode:lineMode,priceLocked:true});
  await recalculateSalesPromotionPrices();
  if(salesQuantity)salesQuantity.value=1;if(salesQuantityCase)salesQuantityCase.value='';if(salesQuantityLoose)salesQuantityLoose.value='';salesProductSelect.value='';window.__selectedSalesProduct=null;if(salesProductSearch){salesProductSearch.value='';salesProductSearch.dataset.selectedId='';}showMessage(salesMessage,'');renderSalesItems();
}
function resetSalesFormAfterSave(){
  editingSalesOrderId='';
  salesItems=[];
  salesForm.reset();
  salesForm.elements.date.value=today();
  // Đơn tạo tay/App mặc định bán theo khuyến mại; radio vẫn mở để kế toán/admin đổi linh động.
  setSalesMode(PRICING_PROMOTION);
  salesForm.elements.paidAmount.value=0;
  if(salesCustomerSearch)salesCustomerSearch.value='';
  salesCustomerSelect.value='';
  if(salesStaffSearch)salesStaffSearch.value='';
  if(salesStaffSelect)salesStaffSelect.value='';
  if(salesStaffName)salesStaffName.value='';
  const submitBtn=salesForm.querySelector('[type="submit"]');
  if(submitBtn)submitBtn.textContent='Tạo đơn bán & trừ tồn';
  syncSalesModeUi();
  renderSalesItems();
}

function hasSalesDraftData(){
  if(!salesForm)return false;
  const note=String(salesForm.elements.note?.value||'').trim();
  const paidAmount=Number(salesForm.elements.paidAmount?.value||0);
  return Boolean(
    editingSalesOrderId ||
    salesItems.length ||
    String(salesCustomerSelect?.value||'').trim() ||
    String(salesCustomerSearch?.value||'').trim() ||
    String(salesStaffSelect?.value||'').trim() ||
    String(salesStaffSearch?.value||'').trim() ||
    String(salesProductSelect?.value||'').trim() ||
    String(salesProductSearch?.value||'').trim() ||
    note ||
    paidAmount>0
  );
}

function cancelSalesDraft(){
  if(!salesForm)return;
  if(hasSalesDraftData() && !confirm('Bạn có chắc muốn huỷ đơn đang nhập?'))return;

  // Chỉ xóa dữ liệu nháp trên form, tuyệt đối không gọi API tạo đơn/trừ tồn/ghi sổ.
  resetSalesFormAfterSave();
  if(salesProductSelect)salesProductSelect.value='';
  if(salesProductSearch){
    salesProductSearch.value='';
    salesProductSearch.dataset.selectedId='';
  }
  if(salesQuantityCase)salesQuantityCase.value='0';
  if(salesQuantityLoose)salesQuantityLoose.value='1';
  if(salesPrice)salesPrice.value='0';
  window.__selectedSalesProduct=null;
  showMessage(salesMessage,'Đã huỷ tạo đơn');
  closeSalesOrderModal(true);
}
window.cancelSalesDraft=cancelSalesDraft;

function getSalesOrderModal(){return document.getElementById('salesOrderModal');}
function setSalesOrderModalTitle(mode='create'){
  const title=document.getElementById('salesOrderModalTitle');
  if(title)title.textContent=mode==='edit'?'Sửa đơn bán hàng':'Tạo đơn bán hàng';
}
function openSalesOrderModal(mode='create'){
  const modal=getSalesOrderModal();
  if(!modal)return;
  if(mode==='create'){
    resetSalesFormAfterSave();
    editingSalesOrderId='';
  }
  setSalesOrderModalTitle(mode);
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  syncSalesModeUi();
  renderSalesItems();
  setTimeout(()=>{
    const first=mode==='edit'?salesProductSearch:salesCustomerSearch;
    if(first && typeof first.focus==='function')first.focus();
  },0);
}
function closeSalesOrderModal(force=false){
  const modal=getSalesOrderModal();
  if(!modal)return;
  if(!force && hasSalesDraftData() && !confirm('Bạn có chắc muốn đóng cửa sổ? Dữ liệu đang nhập sẽ bị bỏ qua.'))return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
}
window.openSalesOrderModal=openSalesOrderModal;
window.closeSalesOrderModal=closeSalesOrderModal;
async function submitSalesOrder(event){
  event.preventDefault();
  if(!salesItems.length){showMessage(salesMessage,'Đơn bán chưa có dòng hàng',true);return}
  if(!salesCustomerSelect.value){showMessage(salesMessage,'Bạn chưa chọn khách hàng. Hãy gõ mã/tên khách rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const payload=Object.fromEntries(new FormData(salesForm).entries());
  payload.date=toDateOnly(payload.date||today());
  payload.orderDate=payload.date;
  payload.documentDate=payload.date;
  if(salesStaffSelect)payload.salesStaffCode=salesStaffSelect.value||'';
  if(salesStaffName)payload.salesStaffName=salesStaffName.value||'';
  const saleMode=getSalesMode();
  payload.saleMethod=saleMode;
  payload.saleMode=saleMode;
  payload.pricingMode=saleMode;
  payload.orderPricingMode=saleMode;
  payload.items=salesItems.map(i=>({productCode:i.productCode,quantity:i.quantity,conversionRate:normalizePackingRate(i),packingQty:normalizePackingRate(i),unitsPerCase:normalizePackingRate(i),grossPrice:i.grossPrice||i.salePrice,salePrice:i.salePrice,price:i.salePrice,finalPrice:i.finalPrice||i.salePrice,discountPercent:i.discountPercent||0,discountAmount:i.discountAmount||0,saleMethod:saleMode,saleMode:saleMode,pricingMode:saleMode,priceLocked:saleMode!==PRICING_DIRECT_PRICE}));
  payload.paidAmount=Number(payload.paidAmount||0);
  if(editingSalesOrderId)payload.actorRole='admin';
  try{
    const url=editingSalesOrderId?`/api/sales-orders/${encodeURIComponent(editingSalesOrderId)}`:'/api/sales-orders';
    const method=editingSalesOrderId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-User-Role':'admin'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được đơn bán');
    resetSalesFormAfterSave();
    showMessage(salesMessage,json.message||'Đã lưu đơn bán');
    closeSalesOrderModal(true);
    await loadStock();await loadSalesOrders();await loadDebts();await loadReceipts();await loadCashbook();
  }catch(err){showMessage(salesMessage,err.message,true)}
}

// Stock / histories / debt
async function loadStock(){
  const q=stockSearchInput?stockSearchInput.value.trim():'';
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  // Màn Tồn kho hiện tại phải đọc nguồn inventories hiện tại, không lọc mặc định theo ngày bán hôm nay.
  // Báo cáo phát sinh/thẻ kho mới dùng dateFrom/dateTo riêng.
  const url=`/api/stock${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được tồn kho');
    const stock=json.stock||[];stockCount.textContent=`${stock.length} dòng tồn kho`;
    if(!stock.length){stockTable.innerHTML='<tr><td colspan="6">Chưa có tồn kho. Hãy tạo phiếu nhập trước.</td></tr>';return}
    stockTable.innerHTML=stock.map(r=>`<tr><td><strong>${r.productCode||''}</strong></td><td>${r.productName||''}</td><td>${r.unit||''}</td><td>${productPackingText(r)}</td><td class="stock-qty">${displayQtyTL(r.quantity,r)}</td><td>${r.updatedAt?new Date(r.updatedAt).toLocaleString('vi-VN'):''}</td></tr>`).join('');
  }catch(err){stockCount.textContent='Lỗi tải tồn kho';stockTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
async function openImportOrderDetail(idx){
  const order=window.__importOrdersCache?.[idx];if(!order)return;
  const lines=(order.items||[]).map(i=>`<li>${i.productCode} - ${i.productName}: ${displayQtyTL(i.quantity,i)} × ${money(i.costPrice)} = ${money(i.amount)}</li>`).join('');
  const card=document.querySelector(`[data-import-detail="${idx}"]`);
  if(card)card.innerHTML=card.innerHTML?'' : `<ul class="order-items">${lines}</ul>`;
}
window.openImportOrderDetail=openImportOrderDetail;

function buildPrintPreviewHtml(title, bodyClass, bodyHtml){
  return `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>${title||'Bản in'}</title><link rel="stylesheet" href="/print.css"></head><body class="${bodyClass||''}">
    <div class="print-preview-actions"><button type="button" onclick="window.close()">Bỏ qua</button><button type="button" onclick="window.print()">In đơn</button><button type="button" onclick="exportCurrentPrintToExcel()">Xuất Excel</button></div>
    ${bodyHtml||''}
    <script>
      function exportCurrentPrintToExcel(){
        var pages=Array.prototype.slice.call(document.querySelectorAll('.print-page, .dms-print-page'));
        var html=pages.length?pages.map(function(page){return page.outerHTML;}).join(''):document.body.innerHTML;
        var fullHtml='<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}</style></head><body>'+html+'</body></html>';
        var blob=new Blob(['\ufeff'+fullHtml],{type:'application/vnd.ms-excel;charset=utf-8;'});
        var a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        var safe=(document.title||'ban-in').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'ban-in';
        a.download=safe+'.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
      }
    <\/script>
  </body></html>`;
}

window.buildPrintPreviewHtml=buildPrintPreviewHtml;
function getImportItemWarehouse(item, order){
  const product = findProductByKey(item?.productCode || item?.productId || '');
  const rawCode = String(item?.printGroup || item?.warehouseCode || item?.warehouse || order?.printGroup || order?.warehouseCode || order?.warehouse || product?.printGroup || product?.defaultWarehouse || product?.warehouseCode || 'KHO_HC').trim() || 'KHO_HC';
  const code = rawCode === 'KHO_PC' ? 'KHO_PC' : 'KHO_HC';
  return {code,name:String(item?.printGroupName||item?.warehouseName||order?.printGroupName||order?.warehouseName||product?.printGroupName||product?.warehouseName||(code==='KHO_PC'?'KHO PC':'KHO HC')).trim()};
}
function printSelectedImportOrders(){
  const checks=[...document.querySelectorAll('.import-order-check:checked')];
  const orders=checks.map(ch=>window.__importOrdersCache?.[Number(ch.dataset.idx)]).filter(isActiveDocument);
  if(!orders.length){alert('Chưa chọn phiếu nhập để in gộp');return}
  const groups=new Map();
  orders.forEach(o=>{
    (o.items||[]).forEach(i=>{
      const wh=getImportItemWarehouse(i,o);
      const costPrice=Number(i.costPrice||0);
      const key=[wh.code,i.productCode||i.productId||'',costPrice].join('@@');
      if(!groups.has(wh.code))groups.set(wh.code,{warehouseCode:wh.code,warehouseName:wh.name,lines:new Map(),sourceCodes:new Set()});
      const g=groups.get(wh.code);g.sourceCodes.add(o.code||o.id||'');
      const line=g.lines.get(key)||{productCode:i.productCode||'',productName:i.productName||'',unit:i.unit||'',quantity:0,costPrice,amount:0};
      line.quantity+=Number(i.quantity||i.qty||0);
      line.amount+=Number(i.amount||Number(i.quantity||i.qty||0)*costPrice);
      g.lines.set(key,line);
    });
  });
  const html=[...groups.values()].map(g=>{
    const lines=[...g.lines.values()];
    const totalQty=lines.reduce((sum,i)=>sum+Number(i.quantity||0),0);
    const totalAmount=lines.reduce((sum,i)=>sum+Number(i.amount||0),0);
    return `<section class="print-page"><h2>ĐƠN TỔNG NHẬP KHO - ${g.warehouseName||g.warehouseCode}</h2><p>Gồm các phiếu: ${[...g.sourceCodes].filter(Boolean).join(', ')}</p><p>Tổng SL: ${money(totalQty)} · Tổng tiền: ${money(totalAmount)}</p><table class="print-table"><thead><tr><th>Mã</th><th>Tên</th><th>ĐVT</th><th>SL gộp</th><th>Giá</th><th>Tiền</th></tr></thead><tbody>${lines.map(i=>`<tr><td>${i.productCode||''}</td><td>${i.productName||''}</td><td>${i.unit||''}</td><td>${displayQtyTL(i.quantity,i)}</td><td>${money(i.costPrice)}</td><td>${money(i.amount)}</td></tr>`).join('')}</tbody></table></section>`;
  }).join('');
  const w=window.open('','_blank');if(!w){alert('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');return;}w.document.write(buildPrintPreviewHtml('In gộp phiếu nhập','',html));w.document.close();
}
window.printSelectedImportOrders=printSelectedImportOrders;
function isActiveDocument(row){
  const status=String(row?.status||'').toLowerCase();
  return !['cancelled','canceled','void','deleted','removed'].includes(status) && !row?.deletedAt;
}


async function postImportOrder(idx){
  const order=window.__importOrdersCache?.[idx];if(!order)return;
  if(!confirm(`Nhập kho phiếu ${order.code||order.id}? Sau khi nhập kho phiếu sẽ bị khóa sửa trực tiếp.`))return;
  try{
    const res=await fetch(`/api/import-orders/${encodeURIComponent(order.id||order.code)}/post`,{method:'POST',headers:{'Content-Type':'application/json','X-User-Role':'admin'}});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không nhập kho được phiếu');
    alert(json.message||'Đã nhập kho thành công');
    await loadStock();await loadImportOrders();
  }catch(err){alert(err.message)}
}
window.postImportOrder=postImportOrder;

async function cancelImportOrder(idx){
  const order=window.__importOrdersCache?.[idx];if(!order)return;
  if(String(order.status||'draft').toLowerCase()==='posted'){alert('Phiếu đã nhập kho, không được huỷ');return}
  if(!confirm(`Huỷ phiếu nhập ${order.code||order.id}? Phiếu nháp sẽ không được cộng tồn kho.`))return;
  try{
    const res=await fetch(`/api/import-orders/${encodeURIComponent(order.id||order.code)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json','X-User-Role':'admin'}});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không huỷ được phiếu nhập');
    alert(json.message||'Đã huỷ phiếu nhập');
    await loadImportOrders();
  }catch(err){alert(err.message)}
}
window.cancelImportOrder=cancelImportOrder;

let importDateFilter={fromDate:'',toDate:'',all:false};
function importDateValue(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function firstDayOfCurrentMonth(){const d=new Date();return importDateValue(new Date(d.getFullYear(),d.getMonth(),1));}
function startOfCurrentWeek(){const d=new Date();const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return importDateValue(d);}
function firstDayOfCurrentQuarter(){const d=new Date();const q=Math.floor(d.getMonth()/3)*3;return importDateValue(new Date(d.getFullYear(),q,1));}
function formatImportDateLabel(value){
  if(!value)return '';
  const parts=String(value).slice(0,10).split('-');
  return parts.length===3?`${parts[2]}/${parts[1]}/${parts[0]}`:value;
}
function syncImportDateFilterFromInputs(){
  importDateFilter.fromDate=importDateFromFilter?.value||'';
  importDateFilter.toDate=importDateToFilter?.value||'';
  importDateFilter.all=false;
}
function setImportDateFilter(fromDate,toDate,all=false){
  if(importDateFromFilter)importDateFromFilter.value=fromDate||'';
  if(importDateToFilter)importDateToFilter.value=toDate||'';
  importDateFilter={fromDate:fromDate||'',toDate:toDate||'',all:!!all};
}
function updateImportDateFilterInfo(count){
  if(!importDateFilterInfo)return;
  if(importDateFilter.all){importDateFilterInfo.textContent=`Hiển thị: Tất cả (${count} phiếu nhập)`;return}
  const from=formatImportDateLabel(importDateFilter.fromDate)||'...';
  const to=formatImportDateLabel(importDateFilter.toDate)||'...';
  importDateFilterInfo.textContent=`Hiển thị: ${from} → ${to} (${count} phiếu nhập)`;
}
// IMPORT_HISTORY_LAYOUT_GROUPED_START: chỉ cập nhật 3 ô thống kê nhanh của tab Nhập kho
function updateImportOrderSummaryCards(orders){
  const list=Array.isArray(orders)?orders:[];
  const totalQty=list.reduce((sum,o)=>sum+Number(o?.totalQuantity||0),0);
  const totalAmount=list.reduce((sum,o)=>sum+Number(o?.totalAmount||0),0);
  const countEl=document.getElementById('importSummaryCount');
  const qtyEl=document.getElementById('importSummaryQty');
  const amountEl=document.getElementById('importSummaryAmount');
  if(countEl)countEl.textContent=money(list.length);
  if(qtyEl)qtyEl.textContent=money(totalQty);
  if(amountEl)amountEl.textContent=money(totalAmount);
}
// IMPORT_HISTORY_LAYOUT_GROUPED_END
function buildImportOrderQuery(){
  const params=new URLSearchParams({excludeInactive:'1',limit:'100'});
  if(importDateFilter.fromDate)params.set('fromDate',importDateFilter.fromDate);
  if(importDateFilter.toDate)params.set('toDate',importDateFilter.toDate);
  return params.toString();
}
async function applyImportDateFilter(){syncImportDateFilterFromInputs();await loadImportOrders()}
async function clearImportDateFilter(){const t=importDateValue(new Date());setImportDateFilter(t,t,false);await loadImportOrders()}

function initImportDateFilterControls(){
  if(importDateFromFilter||importDateToFilter){
    if(!importDateFromFilter?.value&&!importDateToFilter?.value){const t=importDateValue(new Date());setImportDateFilter(t,t,false);}
    else syncImportDateFilterFromInputs();
  }
  if(applyImportDateFilterButton)applyImportDateFilterButton.addEventListener('click',applyImportDateFilter);
  if(clearImportDateFilterButton)clearImportDateFilterButton.addEventListener('click',clearImportDateFilter);
  if(printSelectedImportOrdersButton)printSelectedImportOrdersButton.addEventListener('click',printSelectedImportOrders);
  if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',()=>loadImportOrders());
}
async function loadImportOrders(){
  try{
    const res=await fetch(`/api/import-orders?${buildImportOrderQuery()}`);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử nhập');
    const orders=(json.importOrders||[]).filter(isActiveDocument);
    importOrderCount.textContent=`${orders.length} phiếu nhập`;
    updateImportDateFilterInfo(orders.length);
    window.__importOrdersCache=orders;
    updateImportOrderSummaryCards(orders);
    if(!orders.length){
      importOrderList.classList.add('import-order-one-line-list');
      importOrderList.innerHTML='<div class="import-order-empty">Không có phiếu nhập trong khoảng thời gian đã chọn.</div>';
      return;
    }
    // IMPORT_HISTORY_LAYOUT_GROUPED_START: chỉ đổi HTML render danh sách phiếu nhập sang header + dòng, không đổi API/logic
    importOrderList.classList.add('import-order-one-line-list');
    importOrderList.innerHTML=`
      <div class="import-order-list-head">
        <div><input type="checkbox" id="checkAllImportOrders" title="Chọn tất cả phiếu nhập"></div>
        <div>Mã phiếu</div>
        <div>Ngày nhập</div>
        <div>Nhà cung cấp</div>
        <div>Số lượng</div>
        <div>Giá trị</div>
        <div>Trạng thái</div>
        <div>Thao tác</div>
      </div>
      ${orders.map((o,idx)=>{
        const posted=String(o.status||'draft').toLowerCase()==='posted';
        const displayDate=o.displayDate||o.date||o.documentDate||o.importDate||'';
        const supplier=o.supplier||'Chưa khai báo';
        const code=o.code||o.id||'';
        const statusHtml=`<span class="status-badge ${posted?'ok':'pending'}">${posted?'Đã nhập kho':'Bản nháp'}</span>`;
        const actionHtml=posted
          ? `<button class="small secondary" onclick="editImportOrder(${idx})">Xem</button>`
          : `<button class="small success" onclick="editImportOrder(${idx})">Sửa</button> <button class="small primary" onclick="postImportOrder(${idx})">Nhập kho</button> <button class="small danger" onclick="cancelImportOrder(${idx})">Huỷ</button>`;
        return `<div class="import-order-one-line-row" title="${code} - ${supplier}${o.note?' - '+o.note:''}">
          <div><input type="checkbox" class="import-order-check" data-idx="${idx}"></div>
          <div class="import-order-cell-code">${code}</div>
          <div class="import-order-cell">${displayDate}</div>
          <div class="import-order-cell">${supplier}</div>
          <div class="import-order-cell">${money(o.totalQuantity)}</div>
          <div class="import-order-cell import-order-money">${money(o.totalAmount)}</div>
          <div class="import-order-cell">${statusHtml}</div>
          <div class="import-order-actions">${actionHtml}</div>
          <div data-import-detail="${idx}" hidden></div>
        </div>`;
      }).join('')}`;
    const checkAll=document.getElementById('checkAllImportOrders');
    if(checkAll){
      checkAll.addEventListener('change',()=>{
        document.querySelectorAll('#importOrderList .import-order-check').forEach(cb=>{cb.checked=checkAll.checked;});
      });
    }
    // IMPORT_HISTORY_LAYOUT_GROUPED_END
  }catch(err){importOrderCount.textContent='Lỗi tải lịch sử';updateImportOrderSummaryCards([]);if(importDateFilterInfo)importDateFilterInfo.textContent='Không tải được khoảng thời gian';importOrderList.innerHTML=err.message}
}
initImportDateFilterControls();
function normalizeOrderSourceClient(order){
  const raw=[order?.orderSource,order?.source,order?.sourceType,order?.orderSourceName,order?.importSource,order?.importType,order?.origin,order?.note].filter(Boolean).join(' ').toUpperCase();
  if(/(^|[^A-Z0-9])DMS([^A-Z0-9]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(raw))return 'DMS';
  if(/(^|[^A-Z0-9])S3([^A-Z0-9]|$)|S3_IMPORT|IMPORT EXCEL S3|FILE S3/.test(raw))return 'S3';
  if(/MANUAL|THU CONG|THỦ CÔNG/.test(raw))return 'MANUAL';
  if(/SALES_APP|APP_SALES|MOBILE_SALES|NVBH|SALE APP|APP BÁN|APP BAN/.test(raw))return 'APP';
  return 'APP';
}
function getOrderSourceText(order){
  const src=normalizeOrderSourceClient(order);
  if(src==='DMS')return 'DMS';
  if(src==='S3')return 'S3';
  if(src==='MANUAL')return 'Thủ công';
  return 'APP';
}
function getOrderSourceClass(order){
  const src=normalizeOrderSourceClient(order);
  if(src==='DMS')return 'source-dms';
  if(src==='S3')return 'source-s3';
  if(src==='MANUAL')return 'source-manual';
  return 'source-nvbh';
}
function getSalesOrderStatusLabel(order){
  const status=window.OrderStatusUtil?window.OrderStatusUtil.normalizeOrderStatus(order):(order?.status||'pending');
  const merge=window.OrderStatusUtil?window.OrderStatusUtil.normalizeMergeStatus(order):(order?.mergeStatus||'unmerged');
  const accounting=window.OrderStatusUtil?window.OrderStatusUtil.normalizeAccountingStatus(order):(order?.accountingStatus||'pending');
  if(status==='cancelled')return 'Đã hủy';
  if(accounting==='confirmed')return 'Đã CN';
  if(status==='delivered')return 'Đã giao';
  if(merge==='merged'||status==='assigned')return 'Đã gộp';
  return 'Chờ gộp';
}
function getSalesOrderStatusClass(order){
  const status=window.OrderStatusUtil?window.OrderStatusUtil.normalizeOrderStatus(order):(order?.status||'pending');
  const merge=window.OrderStatusUtil?window.OrderStatusUtil.normalizeMergeStatus(order):(order?.mergeStatus||'unmerged');
  const accounting=window.OrderStatusUtil?window.OrderStatusUtil.normalizeAccountingStatus(order):(order?.accountingStatus||'pending');
  if(status==='cancelled')return 'status-cancelled';
  if(accounting==='confirmed')return 'status-accounted';
  if(status==='delivered')return 'status-delivered';
  if(merge==='merged'||status==='assigned')return 'status-assigned';
  return 'status-pending';
}
function isOrderMerged(order){
  return String(order?.mergeStatus||'unmerged')==='merged' && Boolean(order?.masterOrderId || order?.masterOrderCode);
}
function getOrderMergeText(order){
  return isOrderMerged(order)?'Đã gộp':'Chưa gộp';
}
function getOrderMergeClass(order){
  return isOrderMerged(order)?'merged':'unmerged';
}
function renderSalesOrderItems(items){
  const rows=(items||[]).slice(0,3).map(i=>`
    <div class="sales-order-item">
      <span>${i.productCode||''} - ${i.productName||''}</span>
      <strong>${displayQtyTL(i.quantity,i)}</strong>
    </div>`).join('');
  const more=(items||[]).length>3?`<div class="sales-order-more">+ ${(items||[]).length-3} dòng hàng khác</div>`:'';
  return rows+more;
}
async function renderSalesOrderPrintHtml(order){
  const key=String(
    order?.id ||
    order?.code ||
    order?.orderCode ||
    order?.invoiceCode ||
    ''
  ).trim();
  if(!key)throw new Error('Thiếu mã đơn để in');

  // Luồng in đơn con phải đi qua API theo ID để backend enrich dữ liệu in
  // từ printRepository.enrichSalesOrderForPrint(), bao gồm fallback CTKM cho đơn cũ.
  const res=await fetch(`/api/print/orders/${encodeURIComponent(key)}`);
  const html=await res.text();
  if(!res.ok)throw new Error(html||'Không tạo được mẫu in đơn con');
  return html;
}

function extractPrintBody(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  return doc.body ? doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi,'') : html;
}


function toggleSelectAllSalesOrders(){
  const checks=[...document.querySelectorAll('.sales-order-check')];
  if(!checks.length)return;
  const shouldCheck=checks.some(ch=>!ch.checked);
  checks.forEach(ch=>{ch.checked=shouldCheck;});
  if(typeof selectAllSalesOrdersButton!=='undefined' && selectAllSalesOrdersButton){
    selectAllSalesOrdersButton.textContent=shouldCheck?'Bỏ chọn tất cả':'Chọn tất cả';
  }
}
window.toggleSelectAllSalesOrders=toggleSelectAllSalesOrders;

async function printSelectedSalesOrders(){
  try{
    const checks=[...document.querySelectorAll('.sales-order-check:checked')];
    const orders=checks.map(ch=>window.__salesOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
    if(!orders.length){alert('Chưa chọn đơn con để in');return}
    const bodies=[];
    for(const order of orders){
      // Gọi trực tiếp API in theo ID/code; không lấy detail từ /api/sales-orders để tránh bỏ qua enrich CTKM.
      bodies.push(extractPrintBody(await renderSalesOrderPrintHtml(order)));
    }
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
    w.document.open();
    w.document.write(buildPrintPreviewHtml('In nhiều đơn con','dms-print-body',bodies.join('')));
    w.document.close();
  }catch(err){alert(err.message||'Không in được nhiều đơn con')}
}
window.printSelectedSalesOrders=printSelectedSalesOrders;

async function openSalesOrderEdit(idx){
  let order=window.__salesOrdersCache?.[idx];
  if(!order)return;
  try{order=await fetchSalesOrderDetail(order)}catch(err){alert(err.message||'Không tải được chi tiết đơn');return;}
  editingSalesOrderId=order.id||order.code||'';
  const editMode=resolveSalesOrderEditMode(order);
  // Khi sửa đơn: APP/mobile mặc định bán theo khuyến mại, DMS/import mặc định bán thẳng; radio vẫn cho đổi linh hoạt.
  setSalesMode(editMode);
  salesItems=(order.items||[]).map(i=>{
    const sourceProduct = findProductByKey(i.productCode || i.productId) || {};
    const lineSource = {
      ...sourceProduct,
      ...i,
      conversionRate: i.conversionRate ?? i.unitsPerCase ?? i.packingQty ?? sourceProduct.conversionRate ?? sourceProduct.unitsPerCase ?? sourceProduct.packingQty,
      unitsPerCase: i.unitsPerCase ?? i.conversionRate ?? i.packingQty ?? sourceProduct.unitsPerCase ?? sourceProduct.conversionRate ?? sourceProduct.packingQty,
      packingQty: i.packingQty ?? i.conversionRate ?? i.unitsPerCase ?? sourceProduct.packingQty ?? sourceProduct.conversionRate ?? sourceProduct.unitsPerCase
    };
    const meta = productLineMeta(lineSource);
    const quantity=Number(i.quantity||0);
    const split=splitCaseLoose(quantity,meta.conversionRate);
    return {
      productId:i.productId||i.productCode,
      productCode:i.productCode,
      productName:i.productName,
      ...meta,
      quantity,
      caseQty:split.caseQty,
      looseQty:split.looseQty,
      grossPrice:Number(i.grossPrice||i.catalogSalePrice||i.salePrice||i.price||0),
      discountPercent:Number(i.discountPercent||0),
      discountAmount:Number(i.discountAmount||i.totalDiscountAmount||0),
      finalPrice:Number(i.finalPrice||i.salePrice||i.price||0),
      salePrice:Number(i.salePrice||i.price||0),
      price:Number(i.salePrice||i.price||0),
      amount:Number(i.amount||Number(i.quantity||0)*Number(i.salePrice||i.price||0)),
      saleMethod:i.saleMethod||i.saleMode||editMode,
      saleMode:i.saleMode||editMode,
      pricingMode:i.pricingMode||editMode,
      priceLocked:true
    };
  });
  salesForm.elements.date.value=toDateOnly(order.orderDate||order.date||order.documentDate||order.importDate||order.displayDate||today());
  salesForm.elements.paidAmount.value=Number(order.paidAmount||0);
  if(salesForm.elements.note)salesForm.elements.note.value=order.note||'';
  const c=customersCache.find(item=>String(item.id)===String(order.customerId)||String(item.code)===String(order.customerCode));
  salesCustomerSelect.value=c?.id||order.customerId||order.customerCode||'';
  if(salesCustomerSearch)salesCustomerSearch.value=c?customerSuggestionLabel(c):`${order.customerCode||''} - ${order.customerName||''}`;
  if(salesStaffSelect)salesStaffSelect.value=order.salesStaffCode||order.staffCode||'';
  if(salesStaffName)salesStaffName.value=order.salesStaffName||order.staffName||'';
  if(salesStaffSearch)salesStaffSearch.value=[order.salesStaffCode||order.staffCode,order.salesStaffName||order.staffName].filter(Boolean).join(' - ');
  const submitBtn=salesForm.querySelector('[type="submit"]');
  if(submitBtn)submitBtn.textContent='Lưu sửa đơn bán';
  renderSalesItems();
  showMessage(salesMessage,`Đang sửa đơn ${order.code||order.id}. Kế toán/Admin sửa trực tiếp trong mục Bán hàng.`);
  openSalesOrderModal('edit');
}
window.openSalesOrderEdit=openSalesOrderEdit;

async function cancelSalesOrder(idx){
  const order=window.__salesOrdersCache?.[idx];
  if(!order)return;
  const reason=prompt(`Lý do hủy đơn ${order.code||order.id}?`, 'Hủy đơn bán');
  if(reason===null)return;
  try{
    const res=await fetch(`/api/sales-orders/${encodeURIComponent(order.id||order.code)}/cancel`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không hủy được đơn');
    alert(json.message||'Đã hủy đơn');
    await loadSalesOrders();await loadStock();await loadDebts();await loadCashbook();
  }catch(err){alert(err.message)}
}
window.cancelSalesOrder=cancelSalesOrder;



function extractStaffCodeFromDisplay(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const first=raw.split(/\s+-\s+|\|/)[0].trim();
  const m=first.match(/[A-Za-z0-9_.-]+/);
  return (m?m[0]:first).trim();
}

function isSalesOrderStaffDatasetCurrent(){
  if(!salesOrderStaffFilter)return false;
  const value=String(salesOrderStaffFilter.value||'').trim();
  const label=String(salesOrderStaffFilter.dataset?.label || salesOrderStaffFilter.dataset?.selectedLabel || '').trim();
  return !!value && !!label && value===label;
}

function getSalesOrderStaffFilterCode(){
  if(!salesOrderStaffFilter)return '';
  // Chuẩn Unified Search V2: code phải lấy từ dataset.code sau khi chọn gợi ý.
  // Không dùng input.value để lọc vì input.value chỉ là label hiển thị.
  if(isSalesOrderStaffDatasetCurrent()){
    const code=String(salesOrderStaffFilter.dataset?.code || '').trim();
    if(code)return code;
  }
  // Fallback cho trường hợp người dùng tự gõ mã NVBH mà chưa chọn gợi ý.
  return extractStaffCodeFromDisplay(salesOrderStaffFilter.value || '');
}

function getSalesOrderStaffFilterName(){
  if(!salesOrderStaffFilter)return '';
  if(isSalesOrderStaffDatasetCurrent()){
    return String(salesOrderStaffFilter.dataset?.name || '').trim();
  }
  const raw=String(salesOrderStaffFilter.value || '').trim();
  if(!raw)return '';
  const parts=raw.split(/\s+-\s+/).map(s=>s.trim()).filter(Boolean);
  return parts.length>=2 ? parts[1] : raw;
}

function normalizeOrderDateForFilter(value){
  return toDateOnly(value);
}


const SALES_ORDER_PAGE_LIMIT = 50;
let salesOrderCurrentPage = 1;
let salesOrderTotalRows = 0;
let salesOrderHasMore = false;
let salesOrderSearchTimer = null;
const salesOrderDetailCache = new Map();

function buildSalesOrderSearchParams(page = 1){
  const q=String(salesOrderSearchInput?.value||'').trim();
  const source=String(salesOrderSourceFilter?.value||'').trim();
  const dateType='orderDate';
  const dateFrom=String(salesOrderDateFrom?.value||today()).trim();
  const dateTo=String(salesOrderDateTo?.value||dateFrom).trim();
  const params=new URLSearchParams();
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  if(dateType)params.set('dateType',dateType);
  if(source)params.set('source',source);
  if(q)params.set('q',q);
  const staffCodeFilter=getSalesOrderStaffFilterCode();
  const staffTextFilter=getSalesOrderStaffFilterName();
  if(staffCodeFilter){
    params.set('salesStaffCode',staffCodeFilter);
    // Bật alias để đơn DMS/import cũ dùng staffCode/salesmanCode vẫn lọc đúng.
    params.set('includeStaffAliases','1');
  }
  if(staffTextFilter)params.set('salesStaffName',staffTextFilter);
  params.set('page',String(page));
  params.set('limit',String(SALES_ORDER_PAGE_LIMIT));
  return params;
}

async function fetchSalesOrderDetail(order){
  const key=String(order?.id||order?.code||'').trim();
  if(!key)return order;
  if(salesOrderDetailCache.has(key))return salesOrderDetailCache.get(key);
  const res=await fetch(`/api/sales-orders/${encodeURIComponent(key)}`);
  const json=await res.json();
  if(!json.ok)throw new Error(json.message||'Không tải được chi tiết đơn');
  const detail=json.salesOrder||json.order||order;
  salesOrderDetailCache.set(key,detail);
  return detail;
}

function renderSalesOrderRows(orders, {append=false} = {}){
  if(!append){
    window.__salesOrdersCache=[];
    if(typeof selectAllSalesOrdersButton!=='undefined' && selectAllSalesOrdersButton)selectAllSalesOrdersButton.textContent='Chọn tất cả';
  }
  const startIndex=(window.__salesOrdersCache||[]).length;
  window.__salesOrdersCache=(window.__salesOrdersCache||[]).concat(orders||[]);
  if(!window.__salesOrdersCache.length){
    salesOrderList.innerHTML='<div class="empty-state">Không có đơn bán phù hợp bộ lọc.</div>';
    return;
  }
  const html=(orders||[]).map((o,localIdx)=>{
    const idx=startIndex+localIdx;
    const orderDateText=typeof formatDateVN==='function'?formatDateVN(o.orderDate||o.date||''):(o.orderDate||o.date||'');
    return `
      <article class="sales-order-row">
        <label class="sales-order-select"><input type="checkbox" class="sales-order-check" data-idx="${idx}"></label>
        <strong class="sales-order-code-text" title="Mã đơn: ${o.code||o.id||''}">${o.code||o.id||''}</strong>
        <span class="sales-order-customer-inline" title="Khách hàng: ${o.customerName||o.customerCode||''}">${o.customerName||o.customerCode||''}</span>
        <span class="sales-order-date" title="Ngày bán">${orderDateText||'-'}</span>
        <strong class="sales-order-total-one-line" title="Giá trị đơn hàng">${money(o.totalAmount)}</strong>
        <span class="badge ${getOrderSourceClass(o)} sales-order-source-one-line" title="Nguồn đơn">${getOrderSourceText(o)}</span>
        <div class="sales-order-actions sales-order-actions-one-line">
          <button class="small" onclick="openSalesOrderEdit(${idx})">Sửa</button>
          ${['cancelled','void','delivered','returned'].includes(String(o.status||'').toLowerCase())?'':`<button class="small danger" onclick="cancelSalesOrder(${idx})">Xóa</button>`}
        </div>
      </article>`;
  }).join('');
  if(append)salesOrderList.insertAdjacentHTML('beforeend',html);
  else salesOrderList.innerHTML=html;
}

function updateSalesOrderLoadMoreButton(){
  if(!loadMoreSalesOrdersButton)return;
  loadMoreSalesOrdersButton.style.display=salesOrderHasMore?'inline-flex':'none';
  loadMoreSalesOrdersButton.textContent=salesOrderHasMore?`Tải thêm (${(window.__salesOrdersCache||[]).length}/${salesOrderTotalRows})`:'Đã tải hết';
}

function debounceLoadSalesOrders(){
  clearTimeout(salesOrderSearchTimer);
  salesOrderSearchTimer=setTimeout(()=>loadSalesOrders({page:1,append:false}),300);
}

async function loadSalesOrders({page=1, append=false} = {}){
  try{
    if(!append){
      salesOrderList.innerHTML='<div class="empty-state">Đang tải danh sách đơn...</div>';
      salesOrderDetailCache.clear();
    }
    const params=buildSalesOrderSearchParams(page);
    const clientStartedAt=performance.now();
    const res=await fetch(`/api/sales-orders/search?${params.toString()}`);
    const json=await res.json();
    const clientMs=Math.round(performance.now()-clientStartedAt);
    const serverMs=Number(json.serverMs||json.ms||res.headers.get('X-Response-Time-Ms')||0);
    console.log('[SALES_ORDER_LIST_PERF]', { clientMs, serverMs, queryMs: json.queryMs, countMs: json.countMs, mapMs: json.mapMs, page, total: json.total, returned: (json.salesOrders||json.rows||[]).length });
    if(!json.ok)throw new Error(json.message||'Không tải được lịch sử bán');
    const orders=json.salesOrders||json.rows||[];
    salesOrderCurrentPage=Number(json.page||page||1);
    salesOrderTotalRows=Number(json.total||orders.length||0);
    salesOrderHasMore=Boolean(json.hasMore);
    const loadedBefore=append?(window.__salesOrdersCache||[]).length:0;
    const totalAmountPage=orders.reduce((sum,o)=>sum+Number(o.totalAmount||o.amount||o.total||0),0);
    const perfText=` · API ${serverMs||json.ms||0}ms · Trình duyệt ${clientMs}ms${json.queryMs?` · Query ${json.queryMs}ms`:''}${json.countMs?` · Count ${json.countMs}ms`:''}`;
    salesOrderCount.innerHTML=`<strong>${loadedBefore+orders.length}</strong>/<strong>${salesOrderTotalRows}</strong> đơn · Trang này <strong>${money(totalAmountPage)}</strong>${perfText}`;
    renderSalesOrderRows(orders,{append});
    updateSalesOrderLoadMoreButton();
  }catch(err){
    salesOrderCount.textContent='Lỗi tải lịch sử';
    salesOrderList.innerHTML=err.message;
    salesOrderHasMore=false;
    updateSalesOrderLoadMoreButton();
  }
}



// Bảo vệ riêng cho ô gợi ý sản phẩm bán hàng: catalog luôn được tải độc lập với bộ lọc tồn kho/danh sách sản phẩm.
if(typeof salesProductSearch !== 'undefined' && salesProductSearch){
  salesProductSearch.addEventListener('focus', async()=>{
    if(!getSalesProductCatalog().length) await loadSalesProductCatalog();
  });
}



if(salesForm){
  salesForm.querySelectorAll('input[name="saleMode"]').forEach(input=>input.addEventListener('change',async()=>{
    syncSalesModeUi();
    await recalculateSalesPromotionPrices();
    renderSalesItems();
  }));
  syncSalesModeUi();
}

function selectedSalesOrders(){
  const checks=[...document.querySelectorAll('.sales-order-check:checked')];
  return checks.map(ch=>window.__salesOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
}
function exportSelectedSalesOrders(){
  const orders=selectedSalesOrders();
  if(!orders.length){alert('Chưa chọn đơn bán để xuất Excel');return}
  exportErpRows('don-ban-hang.csv', ['Mã chứng từ','Khách hàng/NV','Ngày','Giá trị','Trạng thái'], orders.map(o=>[o.code||o.id||'', o.customerName||o.customerCode||'', typeof formatDateVN==='function'?formatDateVN(o.date||o.orderDate||''):(o.date||o.orderDate||''), Number(o.totalAmount||0), getOrderSourceText(o)]));
}
window.exportSelectedSalesOrders=exportSelectedSalesOrders;
const openCreateSalesOrderButton=document.getElementById('openCreateSalesOrderButton');
const closeSalesOrderModalButton=document.getElementById('closeSalesOrderModalButton');
if(openCreateSalesOrderButton)openCreateSalesOrderButton.addEventListener('click',()=>openSalesOrderModal('create'));
if(closeSalesOrderModalButton)closeSalesOrderModalButton.addEventListener('click',()=>closeSalesOrderModal(false));
const salesOrderModalEl=document.getElementById('salesOrderModal');
if(salesOrderModalEl)salesOrderModalEl.addEventListener('click',(event)=>{if(event.target===salesOrderModalEl)closeSalesOrderModal(false);});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&document.getElementById('salesOrderModal')?.classList.contains('show'))closeSalesOrderModal(false);});
if(typeof btnCancelSale!=='undefined' && btnCancelSale)btnCancelSale.addEventListener('click',cancelSalesDraft);
if(selectAllSalesOrdersButton)selectAllSalesOrdersButton.addEventListener('click',toggleSelectAllSalesOrders);
if(printSelectedSalesOrdersButton)printSelectedSalesOrdersButton.addEventListener('click',printSelectedSalesOrders);
if(exportSelectedSalesOrdersButton)exportSelectedSalesOrdersButton.addEventListener('click',exportSelectedSalesOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',()=>loadSalesOrders({page:1,append:false}));
if(loadMoreSalesOrdersButton)loadMoreSalesOrdersButton.addEventListener('click',()=>loadSalesOrders({page:salesOrderCurrentPage+1,append:true}));
[salesOrderSearchInput,salesOrderStaffFilter].forEach(input=>{if(input)input.addEventListener('input',debounceLoadSalesOrders)});
[salesOrderDateFrom,salesOrderDateTo,salesOrderSourceFilter].forEach(input=>{if(input)input.addEventListener('change',()=>loadSalesOrders({page:1,append:false}))});
// Các lọc ngày giao/trạng thái giao hàng/công nợ đã bỏ khỏi màn lên đơn.
