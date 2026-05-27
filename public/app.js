const serverStatus=document.getElementById('serverStatus');

const productForm=document.getElementById('productForm');
const productTable=document.getElementById('productTable');
const formMessage=document.getElementById('formMessage');
const searchInput=document.getElementById('searchInput');
const resetButton=document.getElementById('resetButton');
const formTitle=document.getElementById('formTitle');
const productCount=document.getElementById('productCount');
const productBulkActions=document.getElementById('productBulkActions');
const productSelectedCount=document.getElementById('productSelectedCount');
const productCheckAll=document.getElementById('productCheckAll');
const bulkEditProductButton=document.getElementById('bulkEditProductButton');
const bulkOpenProductButton=document.getElementById('bulkOpenProductButton');
const bulkStopProductButton=document.getElementById('bulkStopProductButton');
let selectedProductIds=new Set();

const customerForm=document.getElementById('customerForm');
const customerMessage=document.getElementById('customerMessage');
const customerTable=document.getElementById('customerTable');
const customerCount=document.getElementById('customerCount');
const customerSearchInput=document.getElementById('customerSearchInput');

const importForm=document.getElementById('importForm');
const importProductSelect=document.getElementById('importProductSelect');
const importQuantity=document.getElementById('importQuantity');
const importCostPrice=document.getElementById('importCostPrice');
const addImportItemButton=document.getElementById('addImportItemButton');
const importItemsTable=document.getElementById('importItemsTable');
const importTotalQuantity=document.getElementById('importTotalQuantity');
const importTotalAmount=document.getElementById('importTotalAmount');
const importMessage=document.getElementById('importMessage');

const salesForm=document.getElementById('salesForm');
const salesCustomerSelect=document.getElementById('salesCustomerSelect');
const salesProductSelect=document.getElementById('salesProductSelect');
const salesQuantity=document.getElementById('salesQuantity');
const salesPrice=document.getElementById('salesPrice');
const addSalesItemButton=document.getElementById('addSalesItemButton');
const salesItemsTable=document.getElementById('salesItemsTable');
const salesTotalQuantity=document.getElementById('salesTotalQuantity');
const salesTotalAmount=document.getElementById('salesTotalAmount');
const salesMessage=document.getElementById('salesMessage');

const stockTable=document.getElementById('stockTable');
const stockCount=document.getElementById('stockCount');
const stockSearchInput=document.getElementById('stockSearchInput');
const importOrderList=document.getElementById('importOrderList');
const importOrderCount=document.getElementById('importOrderCount');
const reloadImportOrdersButton=document.getElementById('reloadImportOrdersButton');

const salesOrderList=document.getElementById('salesOrderList');
const salesOrderCount=document.getElementById('salesOrderCount');
const reloadSalesOrdersButton=document.getElementById('reloadSalesOrdersButton');
const salesOrderSearchInput=document.getElementById('salesOrderSearchInput');
const salesOrderSourceFilter=document.getElementById('salesOrderSourceFilter');

const masterOrderForm=document.getElementById('masterOrderForm');
const unmergedOrderList=document.getElementById('unmergedOrderList');
const unmergedOrderCount=document.getElementById('unmergedOrderCount');
const unmergedOrderSearch=document.getElementById('unmergedOrderSearch');
const unmergedSourceFilter=document.getElementById('unmergedSourceFilter');
const unmergedDateFilter=document.getElementById('unmergedDateFilter');
const selectedChildOrderCount=document.getElementById('selectedChildOrderCount');
const selectedChildOrderAmount=document.getElementById('selectedChildOrderAmount');
const selectedChildOrderDebt=document.getElementById('selectedChildOrderDebt');
const masterOrderMessage=document.getElementById('masterOrderMessage');
const masterOrderCount=document.getElementById('masterOrderCount');
const masterOrderList=document.getElementById('masterOrderList');
const masterOrderSearch=document.getElementById('masterOrderSearch');
const reloadMasterOrdersButton=document.getElementById('reloadMasterOrdersButton');

const debtTable=document.getElementById('debtTable');
const debtCount=document.getElementById('debtCount');
const debtSearchInput=document.getElementById('debtSearchInput');

const debtCollectionForm=document.getElementById('debtCollectionForm');
const collectionCustomerSelect=document.getElementById('collectionCustomerSelect');
const selectedCustomerDebt=document.getElementById('selectedCustomerDebt');
const collectionMessage=document.getElementById('collectionMessage');

const cashbookForm=document.getElementById('cashbookForm');
const cashbookMessage=document.getElementById('cashbookMessage');
const cashbookTable=document.getElementById('cashbookTable');
const cashSummary=document.getElementById('cashSummary');
const cashbookSearchInput=document.getElementById('cashbookSearchInput');

const importDataType=document.getElementById('importDataType');
const importExcelFile=document.getElementById('importExcelFile');
const previewImportButton=document.getElementById('previewImportButton');
const downloadImportTemplateButton=document.getElementById('downloadImportTemplateButton');
const commitImportButton=document.getElementById('commitImportButton');
const importDataMessage=document.getElementById('importDataMessage');
const importPreviewSummary=document.getElementById('importPreviewSummary');
const importPreviewHead=document.getElementById('importPreviewHead');
const importPreviewTable=document.getElementById('importPreviewTable');

const reportFromDate=document.getElementById('reportFromDate');
const reportToDate=document.getElementById('reportToDate');
const reloadReportsButton=document.getElementById('reloadReportsButton');
const reportRevenue=document.getElementById('reportRevenue');
const reportOrderCount=document.getElementById('reportOrderCount');
const reportCollected=document.getElementById('reportCollected');
const reportDebt=document.getElementById('reportDebt');
const reportCashBalance=document.getElementById('reportCashBalance');
const reportSalesSummary=document.getElementById('reportSalesSummary');
const reportSalesTable=document.getElementById('reportSalesTable');
const reportStockSummary=document.getElementById('reportStockSummary');
const reportStockTable=document.getElementById('reportStockTable');
const reportDebtSummary=document.getElementById('reportDebtSummary');
const reportDebtTable=document.getElementById('reportDebtTable');
const reportCashSummary=document.getElementById('reportCashSummary');
const reportCashTable=document.getElementById('reportCashTable');

let productsCache=[];
let customersCache=[];
let debtsCache=[];
let importItems=[];
let salesItems=[];

let unmergedOrdersCache=[];
let selectedChildOrderIds=new Set();
let masterOrdersCache=[];
let importPreviewRows=[];

function money(value){return Number(value||0).toLocaleString('vi-VN')}
function today(){return new Date().toISOString().slice(0,10)}
function showMessage(el,text,isError=false){if(!el)return;el.textContent=text;el.classList.toggle('error',isError)}

async function printDocument(type, documentData){
  try{
    const res=await fetch('/api/print/render',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type,
        document:documentData,
        options:{companyName:'NHÀ PHÂN PHỐI MINH KHAI'}
      })
    });
    const html=await res.text();
    if(!res.ok)throw new Error(html||'Không tạo được mẫu in');
    const printWindow=window.open('','_blank');
    if(!printWindow)throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }catch(err){alert(err.message||'Không in được chứng từ')}
}
window.printDocument=printDocument;


function setupTabs(){
  document.querySelectorAll('.tab-button').forEach(button=>{
    button.addEventListener('click',async()=>{
      document.querySelectorAll('.tab-button').forEach(btn=>btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tab=>tab.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active');

      if(button.dataset.tab==='customersTab') await loadCustomers();
      if(button.dataset.tab==='stockTab') await loadStock();
      if(button.dataset.tab==='importHistoryTab') await loadImportOrders();
      if(button.dataset.tab==='salesHistoryTab') await loadSalesOrders();
      if(button.dataset.tab==='masterOrdersTab') await loadMasterOrderModule();
      if(button.dataset.tab==='debtTab') await loadDebts();
      if(button.dataset.tab==='debtCollectionTab'){await loadCustomers();await loadDebts();renderCollectionCustomerSelect()}
      if(button.dataset.tab==='cashbookTab') await loadCashbook();
      if(button.dataset.tab==='reportsTab') await loadReports();
      if(button.dataset.tab==='importDataTab'){resetImportPreviewMessage();}
      if(button.dataset.tab==='importTab'){await loadProducts();renderImportProductSelect()}
      if(button.dataset.tab==='salesTab'){await loadProducts();await loadCustomers();renderSalesProductSelect();renderSalesCustomerSelect()}
    });
  });
}

async function checkServer(){
  try{
    const res=await fetch('/api/health');const json=await res.json();
    if(json.ok){serverStatus.textContent='Server đang chạy';serverStatus.className='status ok'}else throw new Error();
  }catch{serverStatus.textContent='Server lỗi';serverStatus.className='status error'}
}

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
  productForm.elements.unit.value=p.unit||'';productForm.elements.category.value=p.category||'';productForm.elements.barcode.value=p.barcode||'';
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

// Debt collection
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSelect)return;
  const debtCustomers=debtsCache.filter(d=>d.debt>0);
  if(!debtCustomers.length){collectionCustomerSelect.innerHTML='<option value="">Không có khách đang nợ</option>';selectedCustomerDebt.textContent='0';return}
  collectionCustomerSelect.innerHTML=debtCustomers.map(d=>`<option value="${d.customerId}" data-debt="${d.debt}">${d.customerCode} - ${d.customerName} | Nợ: ${money(d.debt)}</option>`).join('');
  updateSelectedCustomerDebt();
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  const selected=collectionCustomerSelect.options[collectionCustomerSelect.selectedIndex];
  selectedCustomerDebt.textContent=selected?money(selected.dataset.debt||0):'0';
}
async function submitDebtCollection(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(debtCollectionForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const res=await fetch('/api/debt-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không thu được công nợ');
    debtCollectionForm.reset();debtCollectionForm.elements.date.value=today();showMessage(collectionMessage,json.message||'Đã thu công nợ');
    await loadDebts();await loadCashbook();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}

// Cashbook
async function loadCashbook(){
  const q=cashbookSearchInput?cashbookSearchInput.value.trim():'';const url=q?`/api/cashbook?q=${encodeURIComponent(q)}`:'/api/cashbook';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sổ quỹ');
    const entries=json.cashbook||[];const s=json.summary||{cashIn:0,cashOut:0,balance:0};
    cashSummary.textContent=`Tổng thu: ${money(s.cashIn)} · Tổng chi: ${money(s.cashOut)} · Tồn quỹ: ${money(s.balance)}`;
    if(!entries.length){cashbookTable.innerHTML='<tr><td colspan="8">Chưa có phát sinh quỹ.</td></tr>';return}
    cashbookTable.innerHTML=entries.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join('');
  }catch(err){cashSummary.textContent='Lỗi tải sổ quỹ';cashbookTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`}
}
async function submitCashbook(event){
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(cashbookForm).entries());
  payload.amount=Number(payload.amount||0);
  try{
    const res=await fetch('/api/cashbook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không ghi được quỹ tiền');
    cashbookForm.reset();cashbookForm.elements.date.value=today();showMessage(cashbookMessage,json.message||'Đã ghi quỹ tiền');
    await loadCashbook();
  }catch(err){showMessage(cashbookMessage,err.message,true)}
 }

function reportDateInRange(dateText, fromDate, toDate){
  const value=String(dateText||'').slice(0,10);
  if(fromDate && value<fromDate)return false;
  if(toDate && value>toDate)return false;
  return true;
}

function orderSourceLabel(source){
  const value=String(source||'NVBH').toUpperCase();
  if(value==='DMS')return '<span class="badge source-dms">Từ DMS</span>';
  return '<span class="badge source-nvbh">Từ NVBH</span>';
}
function mergeStatusLabel(status){
  const value=String(status||'unmerged');
  if(value==='merged')return '<span class="badge merged">Đã gộp</span>';
  return '<span class="badge unmerged">Chưa gộp</span>';
}

function masterStatusLabel(status){
  const value=String(status||'assigned');
  if(value==='completed')return '<span class="badge merged">Hoàn thành</span>';
  if(value==='cancelled')return '<span class="badge danger-badge">Đã hủy</span>';
  if(value==='delivering')return '<span class="badge source-dms">Đang giao</span>';
  return '<span class="badge source-nvbh">Đã giao tuyến</span>';
}

function deliveryLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='failed')return 'Giao lỗi';
  if(status==='cancelled')return 'Đã hủy';
  return 'Chờ giao';
}
function setReportDefaults(){
  if(reportFromDate && !reportFromDate.value)reportFromDate.value=today();
  if(reportToDate && !reportToDate.value)reportToDate.value=today();
}
async function fetchJson(url){
  const res=await fetch(url);
  const json=await res.json();
  if(!json.ok)throw new Error(json.message||`Không tải được ${url}`);
  return json;
}
async function loadReports(){
  if(!reportSalesTable)return;
  setReportDefaults();
  const fromDate=reportFromDate?reportFromDate.value:'';
  const toDate=reportToDate?reportToDate.value:'';
  try{
    reportSalesSummary.textContent='Đang tải báo cáo...';
    reportStockSummary.textContent='Đang tải tồn kho...';
    reportDebtSummary.textContent='Đang tải công nợ...';
    reportCashSummary.textContent='Đang tải quỹ tiền...';
    const [salesJson,stockJson,debtJson,cashJson]=await Promise.all([
      fetchJson('/api/sales-orders'),
      fetchJson('/api/stock'),
      fetchJson('/api/debts'),
      fetchJson('/api/cashbook')
    ]);

    const salesOrders=(salesJson.salesOrders||[]).filter(order=>reportDateInRange(order.date||order.createdAt,fromDate,toDate));
    const stockRows=stockJson.stock||[];
    const debtRows=debtJson.debts||[];
    const cashRows=(cashJson.cashbook||[]).filter(entry=>reportDateInRange(entry.date||entry.createdAt,fromDate,toDate));
    const cashSummaryData=cashJson.summary||{cashIn:0,cashOut:0,balance:0};

    const revenue=salesOrders.reduce((sum,o)=>sum+Number(o.totalAmount||0),0);
    const collected=salesOrders.reduce((sum,o)=>sum+Number(o.paidAmount||0),0);
    const orderDebt=salesOrders.reduce((sum,o)=>sum+Number(o.debtAmount||0),0);
    const totalDebt=debtRows.reduce((sum,d)=>sum+Number(d.debt||0),0);

    if(reportRevenue)reportRevenue.textContent=money(revenue);
    if(reportCollected)reportCollected.textContent=money(collected);
    if(reportDebt)reportDebt.textContent=money(totalDebt);
    if(reportCashBalance)reportCashBalance.textContent=money(cashSummaryData.balance);
    if(reportOrderCount)reportOrderCount.textContent=`${salesOrders.length} đơn bán · nợ theo kỳ ${money(orderDebt)}`;

    reportSalesSummary.textContent=`${salesOrders.length} đơn · Doanh thu ${money(revenue)} · Đã thu ${money(collected)}`;
    if(!salesOrders.length){
      reportSalesTable.innerHTML='<tr><td colspan="9">Không có đơn bán trong khoảng ngày đã chọn.</td></tr>';
    }else{
      reportSalesTable.innerHTML=salesOrders.slice(0,100).map(o=>`<tr><td><strong>${o.code||''}</strong></td><td>${orderSourceLabel(o.orderSource)}</td><td>${o.date||''}</td><td>${o.customerCode||''} ${o.customerName||''}</td><td>${money(o.totalQuantity)}</td><td class="price">${money(o.totalAmount)}</td><td class="price cash-in">${money(o.paidAmount)}</td><td class="price ${Number(o.debtAmount||0)>0?'debt-positive':'debt-zero'}">${money(o.debtAmount)}</td><td>${deliveryLabel(o.deliveryStatus)}</td></tr>`).join('');
    }

    const productMinMap=new Map((productsCache||[]).map(p=>[String(p.code||''),Number(p.minStock||0)]));
    const importantStock=stockRows
      .map(row=>({ ...row, minStock:productMinMap.get(String(row.productCode||''))||0 }))
      .filter(row=>Number(row.quantity||0)<=0 || (row.minStock>0 && Number(row.quantity||0)<=row.minStock))
      .sort((a,b)=>Number(a.quantity||0)-Number(b.quantity||0));
    reportStockSummary.textContent=`${importantStock.length} mặt hàng cần chú ý / ${stockRows.length} dòng tồn`;
    if(!importantStock.length){
      reportStockTable.innerHTML='<tr><td colspan="5">Chưa có mặt hàng dưới tồn tối thiểu hoặc hết hàng.</td></tr>';
    }else{
      reportStockTable.innerHTML=importantStock.slice(0,100).map(r=>`<tr><td><strong>${r.productCode||''}</strong></td><td>${r.productName||''}</td><td>${r.unit||''}</td><td class="stock-qty">${money(r.quantity)}</td><td><span class="badge ${Number(r.quantity||0)<=0?'out':'warn'}">${Number(r.quantity||0)<=0?'Hết hàng':'Dưới tồn min'}</span></td></tr>`).join('');
    }

    const debtTop=[...debtRows].sort((a,b)=>Number(b.debt||0)-Number(a.debt||0)).filter(d=>Number(d.debt||0)>0);
    reportDebtSummary.textContent=`${debtTop.length} khách còn nợ · Tổng nợ ${money(totalDebt)}`;
    if(!debtTop.length){
      reportDebtTable.innerHTML='<tr><td colspan="6">Không có khách còn nợ.</td></tr>';
    }else{
      reportDebtTable.innerHTML=debtTop.slice(0,100).map(d=>`<tr><td><strong>${d.customerCode||''}</strong></td><td>${d.customerName||''}</td><td>${d.phone||''}</td><td class="price">${money(d.debit)}</td><td class="price cash-in">${money(d.credit)}</td><td class="price debt-positive">${money(d.debt)}</td></tr>`).join('');
    }

    const cashIn=cashRows.filter(e=>e.type==='in').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const cashOut=cashRows.filter(e=>e.type==='out').reduce((sum,e)=>sum+Number(e.amount||0),0);
    reportCashSummary.textContent=`Trong kỳ: Thu ${money(cashIn)} · Chi ${money(cashOut)} · Chênh lệch ${money(cashIn-cashOut)}`;
    if(!cashRows.length){
      reportCashTable.innerHTML='<tr><td colspan="6">Không có phát sinh quỹ trong khoảng ngày đã chọn.</td></tr>';
    }else{
      reportCashTable.innerHTML=cashRows.slice(0,100).map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.staffName||e.customerName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td></tr>`).join('');
    }
  }catch(err){
    if(reportSalesSummary)reportSalesSummary.textContent=err.message;
    if(reportSalesTable)reportSalesTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;
  }
}


// Import dữ liệu Excel
function resetImportPreviewMessage(){
  if(importDataMessage)showMessage(importDataMessage,'');
}
function getSelectedImportRows(){
  return importPreviewRows.filter((row,index)=>{
    const checkbox=document.querySelector(`.import-row-check[data-index="${index}"]`);
    return checkbox && checkbox.checked && row.valid;
  });
}
function importRowToText(row){
  const skip=['valid','errors','rowNo'];
  return Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??''}`).join(' | ');
}
function renderImportPreview(result){
  importPreviewRows=result.rows||[];
  const total=result.total||importPreviewRows.length;
  const valid=result.valid||0;
  const invalid=result.invalid||0;
  if(importPreviewSummary){
    importPreviewSummary.innerHTML=`<span>Tổng dòng: <strong>${total}</strong></span><span>Hợp lệ: <strong>${valid}</strong></span><span>Lỗi: <strong>${invalid}</strong></span>`;
  }
  if(!importPreviewRows.length){
    if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Không có dữ liệu preview.</td></tr>';
    if(commitImportButton)commitImportButton.disabled=true;
    return;
  }
  if(importPreviewHead)importPreviewHead.innerHTML='<tr><th>Chọn</th><th>Dòng</th><th>Trạng thái</th><th>Dữ liệu</th><th>Lỗi</th></tr>';
  if(importPreviewTable){
    importPreviewTable.innerHTML=importPreviewRows.map((row,index)=>`
      <tr class="${row.valid?'import-valid':'import-invalid'}">
        <td>${row.valid?`<input class="import-row-check" data-index="${index}" type="checkbox" checked />`:''}</td>
        <td>${row.rowNo||''}</td>
        <td><span class="badge ${row.valid?'active':'inactive'}">${row.valid?'Hợp lệ':'Lỗi'}</span></td>
        <td>${importRowToText(row)}</td>
        <td>${(row.errors||[]).join('; ')}</td>
      </tr>`).join('');
  }
  if(commitImportButton)commitImportButton.disabled=valid<=0;
}
function downloadImportTemplate(){
  if(!importDataType)return;
  const type=encodeURIComponent(importDataType.value);
  window.location.href=`/api/import/template/${type}`;
}

async function previewImportExcel(){
  if(!importDataType||!importExcelFile)return;
  const file=importExcelFile.files[0];
  if(!file){showMessage(importDataMessage,'Bạn chưa chọn file Excel',true);return}
  const formData=new FormData();
  formData.append('type',importDataType.value);
  formData.append('file',file);
  try{
    showMessage(importDataMessage,'Đang đọc file và kiểm tra dữ liệu...');
    const res=await fetch('/api/import/preview',{method:'POST',body:formData});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không preview được file import');
    renderImportPreview(json);
    showMessage(importDataMessage,`Preview xong: ${json.valid||0} dòng hợp lệ, ${json.invalid||0} dòng lỗi.`);
  }catch(err){
    importPreviewRows=[];
    if(commitImportButton)commitImportButton.disabled=true;
    showMessage(importDataMessage,err.message,true);
  }
}
async function commitImportExcel(){
  if(!importDataType)return;
  const rows=getSelectedImportRows();
  if(!rows.length){showMessage(importDataMessage,'Chưa chọn dòng hợp lệ nào để import',true);return}
  try{
    showMessage(importDataMessage,'Đang ghi dữ liệu import vào hệ thống...');
    const res=await fetch('/api/import/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:importDataType.value,rows})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Import thất bại');
    showMessage(importDataMessage,json.message||'Import thành công');
    if(commitImportButton)commitImportButton.disabled=true;
    await loadProducts();await loadCustomers();await loadStock();await loadImportOrders();await loadSalesOrders();await loadDebts();await loadCashbook();
  }catch(err){showMessage(importDataMessage,err.message,true)}
}

resetButton.addEventListener('click',resetForm);
searchInput.addEventListener('input',loadProducts);
customerSearchInput.addEventListener('input',loadCustomers);

if(importProductSelect)importProductSelect.addEventListener('change',syncImportCostPrice);
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(importForm){importForm.addEventListener('submit',submitImportOrder);importForm.elements.date.value=today()}

if(salesProductSelect)salesProductSelect.addEventListener('change',syncSalesPrice);
if(addSalesItemButton)addSalesItemButton.addEventListener('click',addSalesItem);
if(salesForm){salesForm.addEventListener('submit',submitSalesOrder);salesForm.elements.date.value=today()}

if(collectionCustomerSelect)collectionCustomerSelect.addEventListener('change',updateSelectedCustomerDebt);
if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);debtCollectionForm.elements.date.value=today()}

if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);cashbookForm.elements.date.value=today()}

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(debtSearchInput)debtSearchInput.addEventListener('input',loadDebts);
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',loadCashbook);
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',commitImportExcel);
if(importDataType)importDataType.addEventListener('change',()=>{importPreviewRows=[];if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chưa có dữ liệu preview.</td></tr>';if(commitImportButton)commitImportButton.disabled=true;resetImportPreviewMessage();});
if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',loadImportOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',loadSalesOrders);
if(salesOrderSearchInput)salesOrderSearchInput.addEventListener('input',loadSalesOrders);
if(salesOrderSourceFilter)salesOrderSourceFilter.addEventListener('change',loadSalesOrders);

if(reloadMasterOrdersButton)reloadMasterOrdersButton.addEventListener('click',loadMasterOrderModule);
if(masterOrderForm){masterOrderForm.addEventListener('submit',submitMasterOrder);masterOrderForm.elements.date.value=today()}
if(unmergedOrderSearch)unmergedOrderSearch.addEventListener('input',loadUnmergedChildOrders);
if(unmergedSourceFilter)unmergedSourceFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateFilter)unmergedDateFilter.addEventListener('change',loadUnmergedChildOrders);
if(masterOrderSearch)masterOrderSearch.addEventListener('input',loadMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedChildOrderIds.add(check.dataset.id);else selectedChildOrderIds.delete(check.dataset.id);renderUnmergedChildOrders();});
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);

setupTabs();
checkServer();
loadProducts();
loadCustomers();
loadStock();
loadImportOrders();
loadSalesOrders();
loadMasterOrderModule();
loadDebts();
loadCashbook();
setReportDefaults();
renderImportItems();
renderSalesItems();
