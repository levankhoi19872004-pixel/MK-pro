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
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchCustomer(q,{limit:20});
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
  const has=customersCache.some(c=>c.isActive!==false);
  salesCustomerSearch.disabled=!has;
  salesCustomerSearch.placeholder=has?'Gõ mã/tên/sđt/địa chỉ khách hàng...':'Chưa có khách hàng';
}
async function getSalesStaffMatches(){
  const q=salesStaffSearch?salesStaffSearch.value.trim():'';
  if(window.UnifiedSearchEngine) return window.UnifiedSearchEngine.searchSalesStaff(q,{limit:20});
  return (usersCache||[])
    .filter(u=>u.isActive!==false && ['sales','admin'].includes(String(u.role||'').toLowerCase()))
    .filter(u=>matchSearch(q,[u.code,u.username,u.name,u.fullName,u.phone,u.roleLabel,u.role]));
}
function selectSalesStaff(u){
  if(!u)return;
  if(salesStaffSelect)salesStaffSelect.value=u.code||u.username||u.id||'';
  if(salesStaffName)salesStaffName.value=u.name||u.fullName||u.username||'';
  if(salesStaffSearch){
    salesStaffSearch.value=staffSuggestionLabel(u);
    salesStaffSearch.dataset.selectedId=u.code||u.username||u.id||'';
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
function renderSalesItems(){
  const tq=salesItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=salesItems.reduce((s,i)=>s+Number(i.amount||0),0);
  salesTotalQuantity.textContent=money(tq);salesTotalAmount.textContent=money(ta);
  if(!salesItems.length){salesItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  salesItemsTable.innerHTML=salesItems.map((i,idx)=>`<tr><td><strong>${i.productCode}</strong></td><td>${i.productName}</td><td>${money(i.quantity)}</td><td class="price">${money(i.salePrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" onclick="removeSalesItem(${idx})">Xóa</button></td></tr>`).join('');
}
window.removeSalesItem=index=>{salesItems.splice(index,1);renderSalesItems()};
function addSalesItem(){
  const p=findProductByKey(salesProductSelect.value);if(!p){showMessage(salesMessage,'Bạn chưa chọn sản phẩm. Hãy gõ mã/tên rồi nhấn Enter hoặc chọn gợi ý.',true);return}
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
  const existed=salesItems.find(i=>i.productCode===p.code&&i.salePrice===salePrice);
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.salePrice}else salesItems.push({productId:getProductKey(p),productCode:p.code,productName:p.name,...productLineMeta(p),quantity,salePrice,amount:quantity*salePrice});
  if(salesQuantity)salesQuantity.value=1;if(salesQuantityCase)salesQuantityCase.value='';if(salesQuantityLoose)salesQuantityLoose.value='';salesProductSelect.value='';if(salesProductSearch){salesProductSearch.value='';salesProductSearch.dataset.selectedId='';}showMessage(salesMessage,'');renderSalesItems();
}
function resetSalesFormAfterSave(){
  editingSalesOrderId='';
  salesItems=[];
  salesForm.reset();
  salesForm.elements.date.value=today();
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
  payload.items=salesItems.map(i=>({productCode:i.productCode,quantity:i.quantity,salePrice:i.salePrice}));
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
  const q=stockSearchInput?stockSearchInput.value.trim():'';const url=q?`/api/stock?q=${encodeURIComponent(q)}`:'/api/stock';
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
  return /(^|[^A-Z])DMS([^A-Z]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(raw)?'DMS':'NVBH';
}
function getOrderSourceText(order){
  return normalizeOrderSourceClient(order)==='DMS'?'Từ DMS':'Từ NVBH';
}
function getOrderSourceClass(order){
  return normalizeOrderSourceClient(order)==='DMS'?'source-dms':'source-nvbh';
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
      bodies.push(extractPrintBody(await renderSalesOrderPrintHtml(order)));
    }
    const w=window.open('','_blank');
    if(!w)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
    w.document.open();
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>In nhiều đơn con</title><link rel="stylesheet" href="/print.css"></head><body class="dms-print-body">${bodies.join('')}<script>window.onload=function(){window.focus();window.print()}<\/script></body></html>`);
    w.document.close();
  }catch(err){alert(err.message||'Không in được nhiều đơn con')}
}
window.printSelectedSalesOrders=printSelectedSalesOrders;

function openSalesOrderEdit(idx){
  const order=window.__salesOrdersCache?.[idx];
  if(!order)return;
  editingSalesOrderId=order.id||order.code||'';
  salesItems=(order.items||[]).map(i=>({productId:i.productId||i.productCode,productCode:i.productCode,productName:i.productName,...productLineMeta(i),quantity:Number(i.quantity||0),salePrice:Number(i.salePrice||0),amount:Number(i.amount||Number(i.quantity||0)*Number(i.salePrice||0))}));
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


function normalizeOrderDateForFilter(value){
  return toDateOnly(value);
}

async function loadSalesOrders(){
  try{
    const q=String(salesOrderSearchInput?.value||'').trim().toLowerCase();
    const source=String(salesOrderSourceFilter?.value||'').trim().toUpperCase();
    const dateFrom=String(salesOrderDateFrom?.value||today()).trim();
    const dateTo=String(salesOrderDateTo?.value||dateFrom).trim();
    const params=new URLSearchParams();
    if(dateFrom)params.set('dateFrom',dateFrom);
    if(dateTo)params.set('dateTo',dateTo);
    if(source)params.set('source',source);
    params.set('excludeInactive','1');
    const res=await fetch(`/api/sales-orders?${params.toString()}`);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử bán');
    const allOrders=(json.salesOrders||[]).filter(isActiveDocument);
    const staff=String(salesOrderStaffFilter?.value||'').trim().toLowerCase();
    const orders=allOrders.filter(o=>{
      const text=[o.code,o.customerCode,o.customerName,o.customerPhone,o.customerAddress].join(' ').toLowerCase();
      const sourceOk=!source || normalizeOrderSourceClient(o)===source;
      const date=normalizeOrderDateForFilter(o.date||o.orderDate||o.deliveryDate||'');
      const dateOk=(!dateFrom||date>=dateFrom)&&(!dateTo||date<=dateTo);
      const staffText=[o.staffCode,o.staffName,o.salesStaffCode,o.salesStaffName,o.createdByName,o.createdBy].join(' ').toLowerCase();
      const staffOk=!staff||staffText.includes(staff);
      const searchOk=!q || text.includes(q);
      return sourceOk && dateOk && staffOk && searchOk;
    });
    salesOrderCount.textContent=`${orders.length} / ${allOrders.length} đơn bán`;
    if(!orders.length){salesOrderList.innerHTML='<div class="empty-state">Không có đơn bán phù hợp bộ lọc.</div>';return}
    window.__salesOrdersCache=orders;
    if(typeof selectAllSalesOrdersButton!=='undefined' && selectAllSalesOrdersButton)selectAllSalesOrdersButton.textContent='Chọn tất cả';
    salesOrderList.innerHTML=orders.map((o,idx)=>`
      <article class="sales-order-card sales-order-card-compact sales-order-one-line">
        <label class="sales-order-select"><input type="checkbox" class="sales-order-check" data-idx="${idx}"></label>
        <strong class="sales-order-code-text" title="Mã đơn">${o.code||o.id}</strong>
        <span class="sales-order-customer-inline" title="Khách hàng">${o.customerName||o.customerCode||''}</span>
        <span class="sales-order-date" title="Ngày đơn">${typeof formatDateVN==='function'?formatDateVN(o.date||o.orderDate||''):(o.date||o.orderDate||'')}</span>
        <strong class="sales-order-total-one-line" title="Giá trị đơn hàng">${money(o.totalAmount)}</strong>
        <span class="badge ${getOrderSourceClass(o)} sales-order-source-one-line" title="Nguồn đơn">${getOrderSourceText(o)}</span>
        <div class="sales-order-actions sales-order-actions-one-line">
          <button class="small" onclick="openSalesOrderEdit(${idx})">Sửa</button>
          ${['cancelled','void','delivered','returned'].includes(String(o.status||'').toLowerCase())?'':`<button class="small danger" onclick="cancelSalesOrder(${idx})">Xóa</button>`}
        </div>
      </article>`).join('');
  }catch(err){salesOrderCount.textContent='Lỗi tải lịch sử';salesOrderList.innerHTML=err.message}
}


// Bảo vệ riêng cho ô gợi ý sản phẩm bán hàng: catalog luôn được tải độc lập với bộ lọc tồn kho/danh sách sản phẩm.
if(typeof salesProductSearch !== 'undefined' && salesProductSearch){
  salesProductSearch.addEventListener('focus', async()=>{
    if(!getSalesProductCatalog().length) await loadSalesProductCatalog();
  });
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
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',loadSalesOrders);
