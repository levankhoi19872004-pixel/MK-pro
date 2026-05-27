// Customers
async function loadCustomers(){
  const q=customerSearchInput?customerSearchInput.value.trim():'';
  const url=q?`/api/customers?q=${encodeURIComponent(q)}`:'/api/customers';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được khách hàng');
    customersCache=json.customers||[];if(customerCount)customerCount.textContent=`${customersCache.length} khách hàng`;
    renderCustomerTable();renderSalesCustomerSelect();renderCollectionCustomerSelect();
  }catch(err){if(customerCount)customerCount.textContent='Lỗi tải khách';if(customerTable)customerTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
function renderCustomerTable(){
  if(!customerTable)return;
  if(!customersCache.length){customerTable.innerHTML='<tr><td colspan="6">Chưa có khách hàng</td></tr>';return}
  customerTable.innerHTML=customersCache.map(c=>`<tr><td><strong>${c.code||''}</strong></td><td>${c.name||''}</td><td>${c.phone||''}</td><td>${c.address||''}</td><td>${c.area||''}</td><td>${c.staffName||''}</td></tr>`).join('');
}
customerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(customerForm).entries());
  try{
    const res=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được khách hàng');
    customerForm.reset();showMessage(customerMessage,json.message||'Đã lưu khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
});

// Import
function renderImportProductSelect(){
  if(!importProductSelect)return;
  const active=productsCache.filter(p=>p.isActive!==false);
  if(!active.length){importProductSelect.innerHTML='<option value="">Chưa có sản phẩm mở bán</option>';return}
  importProductSelect.innerHTML=active.map(p=>`<option value="${p.id}" data-cost-price="${p.costPrice||0}">${p.code} - ${p.name} (${p.unit||''})</option>`).join('');
  syncImportCostPrice();
}
function syncImportCostPrice(){const selected=importProductSelect.options[importProductSelect.selectedIndex];if(selected)importCostPrice.value=Number(selected.dataset.costPrice||0)}
function renderImportItems(){
  const tq=importItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=importItems.reduce((s,i)=>s+Number(i.amount||0),0);
  importTotalQuantity.textContent=money(tq);importTotalAmount.textContent=money(ta);
  if(!importItems.length){importItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  importItemsTable.innerHTML=importItems.map((i,idx)=>`<tr><td><strong>${i.productCode}</strong></td><td>${i.productName}</td><td>${money(i.quantity)}</td><td class="price">${money(i.costPrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" onclick="removeImportItem(${idx})">Xóa</button></td></tr>`).join('');
}
window.removeImportItem=index=>{importItems.splice(index,1);renderImportItems()};
function addImportItem(){
  const p=productsCache.find(x=>x.id===importProductSelect.value);if(!p){showMessage(importMessage,'Bạn chưa chọn sản phẩm',true);return}
  const quantity=Number(importQuantity.value||0);const costPrice=Number(importCostPrice.value||0);
  if(quantity<=0){showMessage(importMessage,'Số lượng nhập phải lớn hơn 0',true);return}
  if(costPrice<0){showMessage(importMessage,'Giá nhập không được âm',true);return}
  const existed=importItems.find(i=>i.productId===p.id&&i.costPrice===costPrice);
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.costPrice}else importItems.push({productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,quantity,costPrice,amount:quantity*costPrice});
  importQuantity.value=1;showMessage(importMessage,'');renderImportItems();
}
async function submitImportOrder(event){
  event.preventDefault();
  if(!importItems.length){showMessage(importMessage,'Phiếu nhập chưa có dòng hàng',true);return}
  const payload=Object.fromEntries(new FormData(importForm).entries());
  payload.items=importItems.map(i=>({productId:i.productId,quantity:i.quantity,costPrice:i.costPrice}));
  try{
    const res=await fetch('/api/import-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tạo được phiếu nhập');
    importItems=[];importForm.reset();importForm.elements.date.value=today();renderImportItems();showMessage(importMessage,json.message||'Đã tạo phiếu nhập');
    await loadStock();await loadImportOrders();
  }catch(err){showMessage(importMessage,err.message,true)}
}

// Sales
function renderSalesCustomerSelect(){
  if(!salesCustomerSelect)return;
  const active=customersCache.filter(c=>c.isActive!==false);
  if(!active.length){salesCustomerSelect.innerHTML='<option value="">Chưa có khách hàng</option>';return}
  salesCustomerSelect.innerHTML=active.map(c=>`<option value="${c.id}">${c.code} - ${c.name}</option>`).join('');
}
function renderSalesProductSelect(){
  if(!salesProductSelect)return;
  const active=productsCache.filter(p=>p.isActive!==false);
  if(!active.length){salesProductSelect.innerHTML='<option value="">Chưa có sản phẩm mở bán</option>';return}
  salesProductSelect.innerHTML=active.map(p=>`<option value="${p.id}" data-sale-price="${p.salePrice||0}">${p.code} - ${p.name} (${p.unit||''})</option>`).join('');
  syncSalesPrice();
}
function syncSalesPrice(){const selected=salesProductSelect.options[salesProductSelect.selectedIndex];if(selected)salesPrice.value=Number(selected.dataset.salePrice||0)}
function renderSalesItems(){
  const tq=salesItems.reduce((s,i)=>s+Number(i.quantity||0),0);const ta=salesItems.reduce((s,i)=>s+Number(i.amount||0),0);
  salesTotalQuantity.textContent=money(tq);salesTotalAmount.textContent=money(ta);
  if(!salesItems.length){salesItemsTable.innerHTML='<tr><td colspan="6">Chưa có dòng hàng</td></tr>';return}
  salesItemsTable.innerHTML=salesItems.map((i,idx)=>`<tr><td><strong>${i.productCode}</strong></td><td>${i.productName}</td><td>${money(i.quantity)}</td><td class="price">${money(i.salePrice)}</td><td class="price">${money(i.amount)}</td><td><button type="button" class="small danger" onclick="removeSalesItem(${idx})">Xóa</button></td></tr>`).join('');
}
window.removeSalesItem=index=>{salesItems.splice(index,1);renderSalesItems()};
function addSalesItem(){
  const p=productsCache.find(x=>x.id===salesProductSelect.value);if(!p){showMessage(salesMessage,'Bạn chưa chọn sản phẩm',true);return}
  const quantity=Number(salesQuantity.value||0);const salePrice=Number(salesPrice.value||0);
  if(quantity<=0){showMessage(salesMessage,'Số lượng bán phải lớn hơn 0',true);return}
  if(salePrice<0){showMessage(salesMessage,'Giá bán không được âm',true);return}
  const existed=salesItems.find(i=>i.productId===p.id&&i.salePrice===salePrice);
  if(existed){existed.quantity+=quantity;existed.amount=existed.quantity*existed.salePrice}else salesItems.push({productId:p.id,productCode:p.code,productName:p.name,unit:p.unit,quantity,salePrice,amount:quantity*salePrice});
  salesQuantity.value=1;showMessage(salesMessage,'');renderSalesItems();
}
async function submitSalesOrder(event){
  event.preventDefault();
  if(!salesItems.length){showMessage(salesMessage,'Đơn bán chưa có dòng hàng',true);return}
  const payload=Object.fromEntries(new FormData(salesForm).entries());
  payload.items=salesItems.map(i=>({productId:i.productId,quantity:i.quantity,salePrice:i.salePrice}));
  payload.paidAmount=Number(payload.paidAmount||0);
  try{
    const res=await fetch('/api/sales-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tạo được đơn bán');
    salesItems=[];salesForm.reset();salesForm.elements.date.value=today();salesForm.elements.paidAmount.value=0;renderSalesItems();showMessage(salesMessage,json.message||'Đã tạo đơn bán');
    await loadStock();await loadSalesOrders();await loadDebts();await loadCashbook();
  }catch(err){showMessage(salesMessage,err.message,true)}
}

// Stock / histories / debt
async function loadStock(){
  const q=stockSearchInput?stockSearchInput.value.trim():'';const url=q?`/api/stock?q=${encodeURIComponent(q)}`:'/api/stock';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được tồn kho');
    const stock=json.stock||[];stockCount.textContent=`${stock.length} dòng tồn kho`;
    if(!stock.length){stockTable.innerHTML='<tr><td colspan="5">Chưa có tồn kho. Hãy tạo phiếu nhập trước.</td></tr>';return}
    stockTable.innerHTML=stock.map(r=>`<tr><td><strong>${r.productCode||''}</strong></td><td>${r.productName||''}</td><td>${r.unit||''}</td><td class="stock-qty">${money(r.quantity)}</td><td>${r.updatedAt?new Date(r.updatedAt).toLocaleString('vi-VN'):''}</td></tr>`).join('');
  }catch(err){stockCount.textContent='Lỗi tải tồn kho';stockTable.innerHTML=`<tr><td colspan="5">${err.message}</td></tr>`}
}
async function loadImportOrders(){
  try{
    const res=await fetch('/api/import-orders');const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử nhập');
    const orders=json.importOrders||[];importOrderCount.textContent=`${orders.length} phiếu nhập`;
    if(!orders.length){importOrderList.innerHTML='Chưa có phiếu nhập nào.';return}
    window.__importOrdersCache=orders;
    importOrderList.innerHTML=orders.map((o,idx)=>`<div class="order-card"><div class="order-card-head"><h3>${o.code||o.id}</h3><button class="small" onclick="printDocument('IMPORT_ORDER', window.__importOrdersCache[${idx}])">In phiếu</button></div><div class="order-meta">Ngày nhập: ${o.date||''} · Nhà cung cấp: ${o.supplier||'Chưa khai báo'} · Tổng SL: ${money(o.totalQuantity)} · Tổng tiền: ${money(o.totalAmount)}</div>${o.note?`<div class="order-meta">Ghi chú: ${o.note}</div>`:''}<ul class="order-items">${(o.items||[]).map(i=>`<li>${i.productCode} - ${i.productName}: ${money(i.quantity)} ${i.unit||''} × ${money(i.costPrice)} = ${money(i.amount)}</li>`).join('')}</ul></div>`).join('');
  }catch(err){importOrderCount.textContent='Lỗi tải lịch sử';importOrderList.innerHTML=err.message}
}
function getOrderSourceText(order){
  const source=String(order.orderSource||'NVBH').toUpperCase();
  return source==='DMS'?'Từ DMS':'Từ NVBH';
}
function getOrderSourceClass(order){
  return String(order.orderSource||'NVBH').toUpperCase()==='DMS'?'source-dms':'source-nvbh';
}
function getOrderMergeText(order){
  return String(order.mergeStatus||'unmerged')==='merged'?'Đã gộp':'Chưa gộp';
}
function getOrderMergeClass(order){
  return String(order.mergeStatus||'unmerged')==='merged'?'merged':'unmerged';
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
async function loadSalesOrders(){
  try{
    const res=await fetch('/api/sales-orders');const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử bán');
    const allOrders=json.salesOrders||[];
    const q=String(salesOrderSearchInput?.value||'').trim().toLowerCase();
    const source=String(salesOrderSourceFilter?.value||'').trim().toUpperCase();
    const orders=allOrders.filter(o=>{
      const text=[o.code,o.customerCode,o.customerName,o.customerPhone,o.customerAddress].join(' ').toLowerCase();
      const sourceOk=!source || String(o.orderSource||'NVBH').toUpperCase()===source;
      const searchOk=!q || text.includes(q);
      return sourceOk && searchOk;
    });
    salesOrderCount.textContent=`${orders.length} / ${allOrders.length} đơn bán`;
    if(!orders.length){salesOrderList.innerHTML='<div class="empty-state">Không có đơn bán phù hợp bộ lọc.</div>';return}
    window.__salesOrdersCache=orders;
    salesOrderList.innerHTML=orders.map((o,idx)=>`
      <article class="sales-order-card">
        <div class="sales-order-top">
          <div class="sales-order-code">
            <strong>${o.code||o.id}</strong>
            <span>${o.date||''}</span>
          </div>
          <div class="sales-order-badges">
            <span class="badge ${getOrderSourceClass(o)}">${getOrderSourceText(o)}</span>
            <span class="badge ${getOrderMergeClass(o)}">${getOrderMergeText(o)}</span>
          </div>
        </div>

        <div class="sales-order-main">
          <div class="sales-order-customer">
            <span>Khách hàng</span>
            <strong>${o.customerCode||''} - ${o.customerName||''}</strong>
            <small>${o.customerPhone||''}${o.customerAddress?` · ${o.customerAddress}`:''}</small>
          </div>
          <div class="sales-order-money">
            <div><span>Tổng tiền</span><strong>${money(o.totalAmount)}</strong></div>
            <div><span>Đã thu</span><strong class="cash-in">${money(o.paidAmount)}</strong></div>
            <div><span>Còn nợ</span><strong class="${Number(o.debtAmount||0)>0?'debt-positive':'debt-zero'}">${money(o.debtAmount)}</strong></div>
          </div>
        </div>

        <div class="sales-order-lines">${renderSalesOrderItems(o.items)}</div>

        <div class="sales-order-footer">
          <span>${o.note?`Ghi chú: ${o.note}`:'Đơn bán đã ghi nhận vào hệ thống'}</span>
          <button class="small" onclick="printDocument('ORDER_SINGLE', window.__salesOrdersCache[${idx}])">In đơn</button>
        </div>
      </article>`).join('');
  }catch(err){salesOrderCount.textContent='Lỗi tải lịch sử';salesOrderList.innerHTML=err.message}
}
async function loadUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  const params=new URLSearchParams();
  if(unmergedOrderSearch && unmergedOrderSearch.value.trim())params.set('q',unmergedOrderSearch.value.trim());
  if(unmergedSourceFilter && unmergedSourceFilter.value)params.set('source',unmergedSourceFilter.value);
  if(unmergedDateFilter && unmergedDateFilter.value)params.set('date',unmergedDateFilter.value);
  const url=`/api/master-orders/unmerged-child-orders${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn con chưa gộp');
    unmergedOrdersCache=json.orders||[];
    if(unmergedOrderCount)unmergedOrderCount.textContent=`${unmergedOrdersCache.length} đơn con chưa gộp`;
    selectedChildOrderIds=new Set([...selectedChildOrderIds].filter(id=>unmergedOrdersCache.some(o=>o.id===id)));
    renderUnmergedChildOrders();
  }catch(err){
    if(unmergedOrderCount)unmergedOrderCount.textContent='Lỗi tải đơn con';
    unmergedOrderList.innerHTML=err.message;
  }
}

function renderUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  if(!unmergedOrdersCache.length){
    unmergedOrderList.innerHTML='Không có đơn con chưa gộp.';
    updateSelectedChildOrderSummary();
    return;
  }
  unmergedOrderList.innerHTML=unmergedOrdersCache.map(order=>`
    <label class="child-order-row ${selectedChildOrderIds.has(order.id)?'selected':''}">
      <input type="checkbox" class="child-order-check" data-id="${order.id}" ${selectedChildOrderIds.has(order.id)?'checked':''} />
      <div class="child-order-main">
        <div class="child-order-title"><strong>${order.code||order.id}</strong> ${orderSourceLabel(order.orderSource)} ${mergeStatusLabel(order.mergeStatus)}</div>
        <div class="order-meta">${order.date||''} · ${order.customerCode||''} - ${order.customerName||''}</div>
        <div class="order-meta">${order.customerPhone||''} · ${order.customerAddress||''}</div>
      </div>
      <div class="child-order-money">
        <strong>${money(order.totalAmount)}</strong>
        <small>Còn thu: ${money(order.debtAmount)}</small>
      </div>
    </label>`).join('');
  updateSelectedChildOrderSummary();
}

function updateSelectedChildOrderSummary(){
  const selected=unmergedOrdersCache.filter(order=>selectedChildOrderIds.has(order.id));
  const totalAmount=selected.reduce((sum,order)=>sum+Number(order.totalAmount||0),0);
  const totalDebt=selected.reduce((sum,order)=>sum+Number(order.debtAmount||0),0);
  if(selectedChildOrderCount)selectedChildOrderCount.textContent=selected.length;
  if(selectedChildOrderAmount)selectedChildOrderAmount.textContent=money(totalAmount);
  if(selectedChildOrderDebt)selectedChildOrderDebt.textContent=money(totalDebt);
}

async function submitMasterOrder(event){
  event.preventDefault();
  if(!masterOrderForm)return;
  const selectedIds=[...selectedChildOrderIds];
  if(!selectedIds.length){showMessage(masterOrderMessage,'Chưa chọn đơn con để gộp',true);return}
  const payload=Object.fromEntries(new FormData(masterOrderForm).entries());
  payload.childOrderIds=selectedIds;
  try{
    showMessage(masterOrderMessage,'Đang tạo đơn tổng...');
    const res=await fetch('/api/master-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tạo được đơn tổng');
    selectedChildOrderIds.clear();
    masterOrderForm.reset();
    masterOrderForm.elements.date.value=today();
    showMessage(masterOrderMessage,json.message||'Đã tạo đơn tổng');
    await loadMasterOrderModule();
    await loadSalesOrders();
  }catch(err){showMessage(masterOrderMessage,err.message,true)}
}

async function loadMasterOrders(){
  if(!masterOrderList)return;
  const q=masterOrderSearch?masterOrderSearch.value.trim():'';
  const url=q?`/api/master-orders?q=${encodeURIComponent(q)}`:'/api/master-orders';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng');
    masterOrdersCache=json.masterOrders||[];
    if(masterOrderCount)masterOrderCount.textContent=`${masterOrdersCache.length} đơn tổng`;
    if(!masterOrdersCache.length){masterOrderList.innerHTML='Chưa có đơn tổng nào.';return}
    masterOrderList.innerHTML=masterOrdersCache.map((order,idx)=>`
      <div class="order-card master-order-card">
        <div class="order-card-head">
          <h3>${order.code||order.id}</h3>
          <div class="order-actions">${masterStatusLabel(order.status)} ${order.status!=='cancelled'?`<button class="small danger" onclick="cancelMasterOrder('${order.id}')">Hủy gộp</button>`:''}</div>
        </div>
        <div class="order-meta">Ngày: ${order.date||''} · Tuyến: <strong>${order.routeName||''}</strong> · Giao hàng: ${order.deliveryStaffCode||''} ${order.deliveryStaffName||''}</div>
        <div class="master-kpis">
          <span>${money(order.totalOrders)} đơn con</span>
          <span>Tổng SL: ${money(order.totalQuantity)}</span>
          <span>Tổng tiền: ${money(order.totalAmount)}</span>
          <span>Còn thu: ${money(order.totalDebt)}</span>
        </div>
        ${(order.note)?`<div class="order-meta">Ghi chú: ${order.note}</div>`:''}
        <details class="master-details"><summary>Xem đơn con</summary><ul class="order-items">${(order.children||[]).map(child=>`<li><strong>${child.code}</strong> · ${orderSourceLabel(child.orderSource)} · ${child.customerCode||''} ${child.customerName||''} · ${money(child.totalAmount)} · Còn thu ${money(child.debtAmount)}</li>`).join('')}</ul></details>
      </div>`).join('');
  }catch(err){
    if(masterOrderCount)masterOrderCount.textContent='Lỗi tải đơn tổng';
    masterOrderList.innerHTML=err.message;
  }
}

async function cancelMasterOrder(id){
  if(!confirm('Hủy gộp đơn tổng này và trả các đơn con về trạng thái chưa gộp?'))return;
  try{
    const res=await fetch(`/api/master-orders/${encodeURIComponent(id)}/cancel`,{method:'POST'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không hủy được đơn tổng');
    showMessage(masterOrderMessage,json.message||'Đã hủy gộp');
    selectedChildOrderIds.clear();
    await loadMasterOrderModule();
    await loadSalesOrders();
  }catch(err){alert(err.message)}
}
window.cancelMasterOrder=cancelMasterOrder;

async function loadMasterOrderModule(){
  await loadUnmergedChildOrders();
  await loadMasterOrders();
}


async function loadDebts(){
  const q=debtSearchInput?debtSearchInput.value.trim():'';const url=q?`/api/debts?q=${encodeURIComponent(q)}`:'/api/debts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được công nợ');
    debtsCache=json.debts||[];debtCount.textContent=`${debtsCache.length} khách có phát sinh`;
    if(!debtsCache.length){debtTable.innerHTML='<tr><td colspan="7">Chưa có công nợ.</td></tr>';renderCollectionCustomerSelect();return}
    debtTable.innerHTML=debtsCache.map(d=>`<tr><td><strong>${d.customerCode||''}</strong></td><td>${d.customerName||''}</td><td>${d.phone||''}</td><td>${d.address||''}</td><td class="price">${money(d.debit)}</td><td class="price">${money(d.credit)}</td><td class="price ${d.debt>0?'debt-positive':'debt-zero'}">${money(d.debt)}</td></tr>`).join('');
    renderCollectionCustomerSelect();
  }catch(err){debtCount.textContent='Lỗi tải công nợ';debtTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
}

