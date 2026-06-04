let editingSalesOrderId = '';

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
  const checked=document.querySelector('input[name="saleMode"]:checked');
  return checked?.value === 'promotion' ? 'promotion' : 'direct';
}
function isDirectSaleMode(){return getSalesMode()==='direct'}
function recalcSalesItem(index){
  const item=salesItems[index];
  if(!item)return;
  item.quantity=Number(item.quantity||0);
  item.salePrice=Number(item.salePrice||0);
  item.price=item.salePrice;
  item.amount=item.quantity*item.salePrice;
}
function updateSalesItemQuantity(index,value){
  const item=salesItems[index];
  if(!item)return;
  const next=Number(value||0);
  if(next<0)return;
  item.quantity=next;
  recalcSalesItem(index);
  renderSalesItems();
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
window.updateSalesItemPrice=updateSalesItemPrice;
function renderSalesItems(){
  const direct=isDirectSaleMode();
  const tq=salesItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=salesItems.reduce((s,i)=>s+Number(i.amount||0),0);
  salesTotalQuantity.textContent=money(tq);salesTotalAmount.textContent=money(ta);
  if(!salesItems.length){salesItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  salesItemsTable.innerHTML=salesItems.map((i,idx)=>`<tr>
    <td><strong>${i.productCode}</strong></td>
    <td>${i.productName}</td>
    <td><input class="sales-line-input qty" type="number" min="0" value="${Number(i.quantity||0)}" onchange="updateSalesItemQuantity(${idx}, this.value)"></td>
    <td class="price"><input class="sales-line-input price" type="number" min="0" value="${Number(i.salePrice||0)}" ${direct?'':'readonly'} onchange="updateSalesItemPrice(${idx}, this.value)"></td>
    <td class="price">${money(i.amount)}</td>
    <td><button type="button" class="small danger" onclick="removeSalesItem(${idx})">Xóa</button></td>
  </tr>`).join('');
}
window.removeSalesItem=index=>{salesItems.splice(index,1);renderSalesItems()};
function addSalesItem(){
  const p=getSelectedSalesProduct();if(!p){showMessage(salesMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const caseQty=Number(salesQuantityCase?.value||0);
  const looseQty=Number(salesQuantityLoose?.value||0);
  const packingRate=Number(p.conversionRate||p.unitsPerCase||0);
  const quantity=(caseQty>0&&packingRate>0?caseQty*packingRate:0)+looseQty+(salesQuantity&&!salesQuantityCase&&!salesQuantityLoose?Number(salesQuantity.value||0):0);
  const salePrice=Number(salesPrice.value||0);
  if(quantity<=0){showMessage(salesMessage,'Số lượng bán phải lớn hơn 0',true);return}
  const availableQty=productAvailableQty(p);
  if(availableQty<=0){showMessage(salesMessage,`Sản phẩm ${p.code||''} hiện hết tồn mở bán. Vui lòng nhập kho/rebuild tồn kho trước khi bán.`,true);return}
  if(quantity>availableQty){showMessage(salesMessage,`Số lượng bán vượt tồn mở bán. Tồn mở bán hiện tại: ${money(availableQty)} lẻ.`,true);return}
  if(salePrice<0){showMessage(salesMessage,'Giá bán không được âm',true);return}
  const lineMode=getSalesMode();
  const existed=salesItems.find(i=>i.productCode===p.code&&i.salePrice===salePrice&&String(i.saleMode||'direct')===lineMode);
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.salePrice}else salesItems.push({productId:getProductKey(p),productCode:p.code,productName:p.name,...productLineMeta(p),quantity,salePrice,price:salePrice,amount:quantity*salePrice,saleMode:lineMode,priceLocked:lineMode==='promotion'});
  if(salesQuantity)salesQuantity.value=1;if(salesQuantityCase)salesQuantityCase.value='';if(salesQuantityLoose)salesQuantityLoose.value='';salesProductSelect.value='';window.__selectedSalesProduct=null;if(salesProductSearch){salesProductSearch.value='';salesProductSearch.dataset.selectedId='';}showMessage(salesMessage,'');renderSalesItems();
}
function resetSalesFormAfterSave(){
  editingSalesOrderId='';
  salesItems=[];
  salesForm.reset();
  salesForm.elements.date.value=today();
  const directMode=salesForm.querySelector('input[name="saleMode"][value="direct"]');
  if(directMode)directMode.checked=true;
  salesForm.elements.paidAmount.value=0;
  if(salesCustomerSearch)salesCustomerSearch.value='';
  salesCustomerSelect.value='';
  if(salesStaffSearch)salesStaffSearch.value='';
  if(salesStaffSelect)salesStaffSelect.value='';
  if(salesStaffName)salesStaffName.value='';
  const submitBtn=salesForm.querySelector('[type="submit"]');
  if(submitBtn)submitBtn.textContent='Tạo đơn bán hàng';
  renderSalesItems();
}
async function submitSalesOrder(event){
  event.preventDefault();
  if(!salesItems.length){showMessage(salesMessage,'Đơn bán chưa có dòng hàng',true);return}
  if(!salesCustomerSelect.value){showMessage(salesMessage,'Bạn chưa chọn khách hàng. Hãy gõ mã/tên khách rồi nhấn Enter hoặc chọn gợi ý.',true);return}
  const payload=Object.fromEntries(new FormData(salesForm).entries());
  if(salesStaffSelect)payload.salesStaffCode=salesStaffSelect.value||'';
  if(salesStaffName)payload.salesStaffName=salesStaffName.value||'';
  payload.saleMode=getSalesMode();
  payload.pricingMode=payload.saleMode;
  payload.items=salesItems.map(i=>({productCode:i.productCode,quantity:i.quantity,salePrice:i.salePrice,price:i.salePrice,saleMode:i.saleMode||getSalesMode(),priceLocked:(i.saleMode||getSalesMode())==='promotion'}));
  payload.paidAmount=Number(payload.paidAmount||0);
  if(editingSalesOrderId)payload.actorRole='admin';
  try{
    const url=editingSalesOrderId?`/api/sales-orders/${encodeURIComponent(editingSalesOrderId)}`:'/api/sales-orders';
    const method=editingSalesOrderId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-User-Role':'admin'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được đơn bán');
    resetSalesFormAfterSave();
    showMessage(salesMessage,json.message||'Đã lưu đơn bán');
    await loadStock();await loadSalesOrders();await loadDebts();await loadReceipts();await loadCashbook();
  }catch(err){showMessage(salesMessage,err.message,true)}
}

// Stock / histories / debt
async function loadStock(){
  const q=stockSearchInput?stockSearchInput.value.trim():'';
  const dateFrom=(typeof salesDate!=='undefined'&&salesDate&&salesDate.value) ? salesDate.value : (new Date()).toISOString().slice(0,10);
  const dateTo=dateFrom;
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  params.set('dateFrom',dateFrom);
  params.set('dateTo',dateTo);
  const url=`/api/stock?${params.toString()}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được tồn kho');
    const stock=json.stock||[];stockCount.textContent=`${stock.length} dòng tồn kho`;
    if(!stock.length){stockTable.innerHTML='<tr><td colspan="6">Chưa có tồn kho. Hãy tạo phiếu nhập trước.</td></tr>';return}
    stockTable.innerHTML=stock.map(r=>`<tr><td><strong>${r.productCode||''}</strong></td><td>${r.productName||''}</td><td>${r.unit||''}</td><td>${productPackingText(r)}</td><td class="stock-qty">${money(r.quantity)}</td><td>${r.updatedAt?new Date(r.updatedAt).toLocaleString('vi-VN'):''}</td></tr>`).join('');
  }catch(err){stockCount.textContent='Lỗi tải tồn kho';stockTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
async function openImportOrderDetail(idx){
  const order=window.__importOrdersCache?.[idx];if(!order)return;
  const lines=(order.items||[]).map(i=>`<li>${i.productCode} - ${i.productName}: ${money(i.quantity)} ${i.unit||''} × ${money(i.costPrice)} = ${money(i.amount)}</li>`).join('');
  const card=document.querySelector(`[data-import-detail="${idx}"]`);
  if(card)card.innerHTML=card.innerHTML?'' : `<ul class="order-items">${lines}</ul>`;
}
window.openImportOrderDetail=openImportOrderDetail;
function printSelectedImportOrders(){
  const checks=[...document.querySelectorAll('.import-order-check:checked')];
  const orders=checks.map(ch=>window.__importOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
  if(!orders.length){alert('Chưa chọn phiếu nhập để in gộp');return}
  const html=orders.map(o=>`<section class="print-page"><h2>Phiếu nhập: ${o.code||o.id}</h2><p>Ngày nhập: ${o.date||''} · Nhà cung cấp: ${o.supplier||''}</p><p>Tổng SL: ${money(o.totalQuantity)} · Tổng tiền: ${money(o.totalAmount)}</p><table class="print-table"><thead><tr><th>Mã</th><th>Tên</th><th>SL</th><th>Giá</th><th>Tiền</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td>${i.productCode||''}</td><td>${i.productName||''}</td><td>${money(i.quantity)}</td><td>${money(i.costPrice)}</td><td>${money(i.amount)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><title>In gộp phiếu nhập</title><link rel="stylesheet" href="/print.css"></head><body>${html}<script>window.print()<\/script></body></html>`);w.document.close();
}
window.printSelectedImportOrders=printSelectedImportOrders;
function isActiveDocument(row){
  const status=String(row?.status||'').toLowerCase();
  return !['cancelled','canceled','void','deleted','removed'].includes(status) && !row?.deletedAt;
}

async function loadImportOrders(){
  try{
    const res=await fetch('/api/import-orders?excludeInactive=1');const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử nhập');
    const orders=(json.importOrders||[]).filter(isActiveDocument);importOrderCount.textContent=`${orders.length} phiếu nhập`;
    if(!orders.length){importOrderList.innerHTML='Chưa có phiếu nhập nào.';return}
    window.__importOrdersCache=orders;
    importOrderList.innerHTML=`<div class="bulk-actions"><button class="secondary small" onclick="printSelectedImportOrders()">In gộp phiếu đã chọn</button></div>`+orders.map((o,idx)=>`<div class="order-card">
      <div class="order-card-head"><label><input type="checkbox" class="import-order-check" data-idx="${idx}"> <strong>${o.code||o.id}</strong></label><div><button class="small" onclick="openImportOrderDetail(${idx})">Xem đơn nhập</button> <button class="small success" onclick="editImportOrder(${idx})">Sửa phiếu</button> <button class="small" onclick="printDocument('IMPORT_ORDER', window.__importOrdersCache[${idx}])">In phiếu</button></div></div>
      <div class="order-meta">Ngày nhập: ${o.date||''} · Nhà cung cấp: ${o.supplier||'Chưa khai báo'} · Tổng SL: ${money(o.totalQuantity)} · Tổng tiền: ${money(o.totalAmount)}</div>
      ${o.note?`<div class="order-meta">Ghi chú: ${o.note}</div>`:''}
      <div data-import-detail="${idx}"></div>
    </div>`).join('');
  }catch(err){importOrderCount.textContent='Lỗi tải lịch sử';importOrderList.innerHTML=err.message}
}
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
      <strong>${money(i.quantity)} ${i.unit||''}</strong>
    </div>`).join('');
  const more=(items||[]).length>3?`<div class="sales-order-more">+ ${(items||[]).length-3} dòng hàng khác</div>`:'';
  return rows+more;
}
async function renderSalesOrderPrintHtml(order){
  const res=await fetch('/api/print/render',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      type:'ORDER_SINGLE',
      document:order,
      options:{companyName:'NHÀ PHÂN PHỐI MINH KHAI'}
    })
  });
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
      const detail=await fetchSalesOrderDetail(order);
      bodies.push(extractPrintBody(await renderSalesOrderPrintHtml(detail)));
    }
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
    w.document.open();
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>In nhiều đơn con</title><link rel="stylesheet" href="/print.css"></head><body class="dms-print-body">${bodies.join('')}<script>window.onload=function(){window.focus();window.print()}<\/script></body></html>`);
    w.document.close();
  }catch(err){alert(err.message||'Không in được nhiều đơn con')}
}
window.printSelectedSalesOrders=printSelectedSalesOrders;

async function openSalesOrderEdit(idx){
  let order=window.__salesOrdersCache?.[idx];
  if(!order)return;
  try{order=await fetchSalesOrderDetail(order)}catch(err){alert(err.message||'Không tải được chi tiết đơn');return;}
  editingSalesOrderId=order.id||order.code||'';
  const editMode=order.saleMode||order.pricingMode||order.orderPricingMode||'direct';
  const modeInput=salesForm.querySelector(`input[name="saleMode"][value="${editMode==='promotion'?'promotion':'direct'}"]`);
  if(modeInput)modeInput.checked=true;
  salesItems=(order.items||[]).map(i=>({productId:i.productId||i.productCode,productCode:i.productCode,productName:i.productName,...productLineMeta(i),quantity:Number(i.quantity||0),salePrice:Number(i.salePrice||i.price||0),price:Number(i.salePrice||i.price||0),amount:Number(i.amount||Number(i.quantity||0)*Number(i.salePrice||i.price||0)),saleMode:i.saleMode||editMode,priceLocked:Boolean(i.priceLocked)||editMode==='promotion'}));
  salesForm.elements.date.value=toDateOnly(order.date||today());
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
  document.getElementById('salesTab')?.scrollIntoView({behavior:'smooth',block:'start'});
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
function getSalesOrderStaffFilterCode(){
  if(!salesOrderStaffFilter)return '';
  // Ưu tiên text đang hiển thị trong ô vì dataset.selectedId có thể là Mongo _id.
  // Nếu lấy _id để gửi salesStaffCode thì backend sẽ không lọc đúng NVBH.
  const visibleValue=String(salesOrderStaffFilter.value||'').trim();
  const selected=String(salesOrderStaffFilter.dataset?.selectedId||'').trim();
  return extractStaffCodeFromDisplay(visibleValue || selected || '');
}
function getSalesOrderStaffFilterText(){
  if(!salesOrderStaffFilter)return '';
  return String(salesOrderStaffFilter.value||salesOrderStaffFilter.dataset?.selectedId||'').trim();
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
  const dateType='deliveryDate';
  const dateFrom=String(salesOrderDateFrom?.value||today()).trim();
  const dateTo=String(salesOrderDateTo?.value||dateFrom).trim();
  const params=new URLSearchParams();
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  if(dateType)params.set('dateType',dateType);
  if(source)params.set('source',source);
  if(q)params.set('q',q);
  const staffCodeFilter=getSalesOrderStaffFilterCode();
  const staffTextFilter=getSalesOrderStaffFilterText();
  if(staffCodeFilter){
    params.set('salesStaffCode',staffCodeFilter);
    // Bật alias để đơn DMS/import cũ dùng staffCode/salesmanCode vẫn lọc đúng.
    params.set('includeStaffAliases','1');
  }
  if(staffTextFilter)params.set('salesStaffText',staffTextFilter);
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
  salesForm.querySelectorAll('input[name="saleMode"]').forEach(input=>input.addEventListener('change',syncSalesModeUi));
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
if(selectAllSalesOrdersButton)selectAllSalesOrdersButton.addEventListener('click',toggleSelectAllSalesOrders);
if(printSelectedSalesOrdersButton)printSelectedSalesOrdersButton.addEventListener('click',printSelectedSalesOrders);
if(exportSelectedSalesOrdersButton)exportSelectedSalesOrdersButton.addEventListener('click',exportSelectedSalesOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',()=>loadSalesOrders({page:1,append:false}));
if(loadMoreSalesOrdersButton)loadMoreSalesOrdersButton.addEventListener('click',()=>loadSalesOrders({page:salesOrderCurrentPage+1,append:true}));
[salesOrderSearchInput,salesOrderStaffFilter].forEach(input=>{if(input)input.addEventListener('input',debounceLoadSalesOrders)});
[salesOrderDateFrom,salesOrderDateTo,salesOrderSourceFilter].forEach(input=>{if(input)input.addEventListener('change',()=>loadSalesOrders({page:1,append:false}))});
// Các lọc ngày giao/trạng thái giao hàng/công nợ đã bỏ khỏi màn lên đơn.
