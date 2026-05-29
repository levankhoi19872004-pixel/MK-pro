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
const customerBulkActions=document.getElementById('customerBulkActions');
const customerSelectedCount=document.getElementById('customerSelectedCount');
const customerCheckAll=document.getElementById('customerCheckAll');
const bulkDeleteCustomerButton=document.getElementById('bulkDeleteCustomerButton');
const customerPagination=document.getElementById('customerPagination');
const customerPageInfo=document.getElementById('customerPageInfo');
const customerPrevPage=document.getElementById('customerPrevPage');
const customerNextPage=document.getElementById('customerNextPage');
const customerPageSizeSelect=document.getElementById('customerPageSize');
let selectedCustomerIds=new Set();
let customerPage=1;
let customerPageSize=50;
const productListSuggestions=document.createElement('div');
productListSuggestions.id='productListSuggestions';
productListSuggestions.className='suggestions';
productListSuggestions.hidden=true;
if(searchInput&&searchInput.parentElement){searchInput.parentElement.classList.add('autocomplete-host');searchInput.insertAdjacentElement('afterend',productListSuggestions)}
const customerListSuggestions=document.createElement('div');
customerListSuggestions.id='customerListSuggestions';
customerListSuggestions.className='suggestions';
customerListSuggestions.hidden=true;
if(customerSearchInput&&customerSearchInput.parentElement){customerSearchInput.parentElement.classList.add('autocomplete-host');customerSearchInput.insertAdjacentElement('afterend',customerListSuggestions)}

const importForm=document.getElementById('importForm');
const importProductSelect=document.getElementById('importProductSelect');
const importProductSearch=document.getElementById('importProductSearch');
const importProductSuggestions=document.getElementById('importProductSuggestions');
const importQuantity=document.getElementById('importQuantity');
const importCostPrice=document.getElementById('importCostPrice');
const addImportItemButton=document.getElementById('addImportItemButton');
const importItemsTable=document.getElementById('importItemsTable');
const importTotalQuantity=document.getElementById('importTotalQuantity');
const importTotalAmount=document.getElementById('importTotalAmount');
const importMessage=document.getElementById('importMessage');

const salesForm=document.getElementById('salesForm');
const salesCustomerSelect=document.getElementById('salesCustomerSelect');
const salesCustomerSearch=document.getElementById('salesCustomerSearch');
const salesCustomerSuggestions=document.getElementById('salesCustomerSuggestions');
const salesStaffSearch=document.getElementById('salesStaffSearch');
const salesStaffSelect=document.getElementById('salesStaffSelect');
const salesStaffName=document.getElementById('salesStaffName');
const salesStaffSuggestions=document.getElementById('salesStaffSuggestions');
const salesProductSelect=document.getElementById('salesProductSelect');
const salesProductSearch=document.getElementById('salesProductSearch');
const salesProductSuggestions=document.getElementById('salesProductSuggestions');
const salesQuantity=document.getElementById('salesQuantity');
const salesQuantityCase=document.getElementById('salesQuantityCase');
const salesQuantityLoose=document.getElementById('salesQuantityLoose');
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
const salesOrderDateFrom=document.getElementById('salesOrderDateFrom');
const salesOrderDateTo=document.getElementById('salesOrderDateTo');
const salesOrderStaffFilter=document.getElementById('salesOrderStaffFilter');
const printSelectedSalesOrdersButton=document.getElementById('printSelectedSalesOrdersButton');
const deliveryDateFilter=document.getElementById('deliveryDateFilter');
const deliverySearchInput=document.getElementById('deliverySearchInput');
const deliverySalesmanFilter=document.getElementById('deliverySalesmanFilter');
const deliveryStaffFilter=document.getElementById('deliveryStaffFilter');
const deliveryRouteFilter=document.getElementById('deliveryRouteFilter');
const deliveryStatusFilter=document.getElementById('deliveryStatusFilter');
const reloadDeliveryTodayButton=document.getElementById('reloadDeliveryTodayButton');
const deliveryTodayList=document.getElementById('deliveryTodayList');
const deliveryRouteSummary=document.getElementById('deliveryRouteSummary');
const deliveryTotalKpi=document.getElementById('deliveryTotalKpi');
const deliveryRunningKpi=document.getElementById('deliveryRunningKpi');
const deliveryDoneKpi=document.getElementById('deliveryDoneKpi');
const deliveryUnpaidKpi=document.getElementById('deliveryUnpaidKpi');
const deliveryLateKpi=document.getElementById('deliveryLateKpi');

const masterOrderForm=document.getElementById('masterOrderForm');
const unmergedOrderList=document.getElementById('unmergedOrderList');
const unmergedOrderCount=document.getElementById('unmergedOrderCount');
const unmergedOrderSearch=document.getElementById('unmergedOrderSearch');
const unmergedSourceFilter=document.getElementById('unmergedSourceFilter');
const unmergedDateFilter=document.getElementById('unmergedDateFilter');
const unmergedSalesStaffFilter=document.getElementById('unmergedSalesStaffFilter');
const selectedChildOrderCount=document.getElementById('selectedChildOrderCount');
const selectedChildOrderAmount=document.getElementById('selectedChildOrderAmount');
const selectedChildOrderDebt=document.getElementById('selectedChildOrderDebt');
const masterOrderMessage=document.getElementById('masterOrderMessage');
const masterOrderCount=document.getElementById('masterOrderCount');
const masterOrderList=document.getElementById('masterOrderList');
const masterOrderSearch=document.getElementById('masterOrderSearch');
const masterOrderDateFrom=document.getElementById('masterOrderDateFrom');
const masterOrderDateTo=document.getElementById('masterOrderDateTo');
const printSelectedMasterOrdersButton=document.getElementById('printSelectedMasterOrdersButton');
const reloadMasterOrdersButton=document.getElementById('reloadMasterOrdersButton');

const debtTable=document.getElementById('debtTable');
const debtCardList=document.getElementById('debtCardList');
const debtCount=document.getElementById('debtCount');
const debtSearchInput=document.getElementById('debtSearchInput');
const debtSalesmanFilter=document.getElementById('debtSalesmanFilter');
const debtDeliveryFilter=document.getElementById('debtDeliveryFilter');
const debtStatusFilter=document.getElementById('debtStatusFilter');
const debtDateFrom=document.getElementById('debtDateFrom');
const debtDateTo=document.getElementById('debtDateTo');
const debtTotalKpi=document.getElementById('debtTotalKpi');
const cashTotalKpi=document.getElementById('cashTotalKpi');
const bankTotalKpi=document.getElementById('bankTotalKpi');
const receiptHistoryTable=document.getElementById('receiptHistoryTable');
const receiptTimeline=document.getElementById('receiptTimeline');
const receiptSearchInput=document.getElementById('receiptSearchInput');
const debtInnerTabs=[...document.querySelectorAll('.debt-inner-tab')];
const debtPanels=[...document.querySelectorAll('.debt-panel[data-debt-panel-id]')];
const bankbookTable=document.getElementById('bankbookTable');
const returnOrderTable=document.getElementById('returnOrderTable');
const returnOrderSearchInput=document.getElementById('returnOrderSearchInput');

const debtCollectionForm=document.getElementById('debtCollectionForm');
const collectionCustomerSelect=document.getElementById('collectionCustomerSelect');
const collectionCustomerSearch=document.getElementById('collectionCustomerSearch');
const collectionCustomerSuggestions=document.getElementById('collectionCustomerSuggestions');
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
const customImportTemplateName=document.getElementById('customImportTemplateName');
const customImportTemplateSelect=document.getElementById('customImportTemplateSelect');
const customImportMappingTable=document.getElementById('customImportMappingTable');
const addImportMappingButton=document.getElementById('addImportMappingButton');
const saveCustomImportTemplateButton=document.getElementById('saveCustomImportTemplateButton');
const loadCustomImportTemplateButton=document.getElementById('loadCustomImportTemplateButton');
const downloadCustomImportTemplateButton=document.getElementById('downloadCustomImportTemplateButton');
const deleteCustomImportTemplateButton=document.getElementById('deleteCustomImportTemplateButton');

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
let editingImportOrderId=null;
let salesItems=[];

const userForm=document.getElementById('userForm');
const userTable=document.getElementById('userTable');
const userCount=document.getElementById('userCount');
const userMessage=document.getElementById('userMessage');
const userSearchInput=document.getElementById('userSearchInput');
const resetUserButton=document.getElementById('resetUserButton');

const promotionForm=document.getElementById('promotionForm');
const promotionTable=document.getElementById('promotionTable');
const promotionCount=document.getElementById('promotionCount');
const promotionMessage=document.getElementById('promotionMessage');
const promotionSearchInput=document.getElementById('promotionSearchInput');
const resetPromotionButton=document.getElementById('resetPromotionButton');
let usersCache=[];
let promotionsCache=[];

let unmergedOrdersCache=[];
let selectedChildOrderIds=new Set();
let masterOrdersCache=[];
let importPreviewRows=[];
let customImportFields=[];
let customImportTemplates=[];

function money(value){return Number(value||0).toLocaleString('vi-VN')}
function productPackingText(p){
  if(!p)return '';
  if(p.packing)return p.packing;
  if(p.baseUnit&&Number(p.conversionRate||0)>1)return `1 ${p.unit||''} = ${p.conversionRate} ${p.baseUnit}`;
  return '';
}
function productLineMeta(p){
  return {unit:p.unit||'',baseUnit:p.baseUnit||'',conversionRate:Number(p.conversionRate||1),packing:productPackingText(p),units:Array.isArray(p.units)?p.units:[]};
}
function getProductKey(p){return String(p?.code||p?.id||'')}
function findProductByKey(key){const value=String(key||'');return productsCache.find(x=>String(x.code||'')===value||String(x.id||'')===value)}
function formatCaseLooseStock(quantity, conversionRate){
  const qty=Math.max(0,Number(quantity||0));
  const rate=Math.max(1,Number(conversionRate||1));
  return `${Math.floor(qty/rate)}/${qty%rate}`;
}
function productAvailableQty(p){
  const direct = Number(p?.stockQuantity ?? p?.availableQty ?? p?.availableStock ?? p?.quantity ?? 0);
  if(Number.isFinite(direct) && direct > 0) return direct;
  const cases = Number(p?.stockCase ?? p?.caseQty ?? p?.cases ?? p?.thung ?? 0);
  const loose = Number(p?.stockLoose ?? p?.looseQty ?? p?.loose ?? p?.le ?? 0);
  const rate = Math.max(1, Number(p?.conversionRate || p?.pack || 1));
  const converted = (Number.isFinite(cases) ? cases : 0) * rate + (Number.isFinite(loose) ? loose : 0);
  return Math.max(0, converted);
}
function productHasStock(p){
  return productAvailableQty(p) > 0;
}
function productStockDisplay(p){
  if(productAvailableQty(p) <= 0) return '0/0';
  if(p?.stockDisplay && String(p.stockDisplay).trim() !== '0/0') return p.stockDisplay;
  return formatCaseLooseStock(productAvailableQty(p), Number(p?.conversionRate||1));
}
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
      if(button.dataset.tab==='salesTab') await loadSalesOrders();
      if(button.dataset.tab==='masterOrdersTab') await loadMasterOrderModule();
      if(button.dataset.tab==='deliveryTodayTab') await loadDeliveryToday();
      if(button.dataset.tab==='debtTab'){await loadDebts();await loadReceipts();await loadCashbook();renderCollectionCustomerSelect()}
      if(button.dataset.tab==='reportsTab') await loadReports();
      if(button.dataset.tab==='importDataTab'){resetImportPreviewMessage();}
      if(button.dataset.tab==='importTab'){await loadProducts();renderImportProductSelect();await loadImportOrders()}
      if(button.dataset.tab==='salesTab'){await loadProducts();await loadCustomers();await loadUsers();renderSalesProductSelect();renderSalesCustomerSelect();renderSalesStaffSelect()}
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
async function loadProducts(){
  const q=searchInput?searchInput.value.trim():'';
  const url=q?`/api/products?q=${encodeURIComponent(q)}`:'/api/products';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sản phẩm');
    productsCache=json.products||[];if(productCount)productCount.textContent=`${productsCache.length} sản phẩm`;
    renderProductTable();renderImportProductSelect();renderSalesProductSelect();
  }catch(err){if(productCount)productCount.textContent='Lỗi tải dữ liệu';if(productTable)productTable.innerHTML=`<tr><td colspan="3" class="empty-cell">${err.message}</td></tr>`}
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
    productTable.innerHTML='<tr><td colspan="3" class="empty-cell">Chưa có sản phẩm</td></tr>';
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
    customersCache=json.customers||[];
    customerPage=1;
    if(customerCount)customerCount.textContent=`${customersCache.length} khách hàng`;
    renderCustomerTable();renderSalesCustomerSelect();renderCollectionCustomerSelect();
  }catch(err){if(customerCount)customerCount.textContent='Lỗi tải khách';if(customerTable)customerTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
function getCustomerTotalPages(){
  return Math.max(1,Math.ceil(customersCache.length/customerPageSize));
}
function getCustomerPageRows(){
  const totalPages=getCustomerTotalPages();
  if(customerPage>totalPages)customerPage=totalPages;
  if(customerPage<1)customerPage=1;
  const start=(customerPage-1)*customerPageSize;
  return customersCache.slice(start,start+customerPageSize);
}
function renderCustomerPagination(){
  if(!customerPagination)return;
  const total=customersCache.length;
  const totalPages=getCustomerTotalPages();
  const start=total?((customerPage-1)*customerPageSize+1):0;
  const end=Math.min(total,customerPage*customerPageSize);
  if(customerPageInfo)customerPageInfo.textContent=`Hiển thị ${start}-${end} / ${total} khách hàng · Trang ${customerPage}/${totalPages}`;
  if(customerPrevPage)customerPrevPage.disabled=customerPage<=1;
  if(customerNextPage)customerNextPage.disabled=customerPage>=totalPages;
  if(customerPageSizeSelect&&Number(customerPageSizeSelect.value)!==customerPageSize)customerPageSizeSelect.value=String(customerPageSize);
}
function updateCustomerBulkUI(){
  if(customerSelectedCount)customerSelectedCount.textContent=`${selectedCustomerIds.size} khách đã chọn`;
  if(customerBulkActions)customerBulkActions.hidden=selectedCustomerIds.size===0;
  if(customerCheckAll){
    const ids=getCustomerPageRows().map(c=>c.id).filter(Boolean);
    customerCheckAll.checked=ids.length>0 && ids.every(id=>selectedCustomerIds.has(id));
  }
  renderCustomerPagination();
}
function renderCustomerTable(){
  if(!customerTable)return;
  if(!customersCache.length){
    selectedCustomerIds.clear();
    customerTable.innerHTML='<tr><td colspan="8">Chưa có khách hàng</td></tr>';
    updateCustomerBulkUI();
    return;
  }
  selectedCustomerIds=new Set([...selectedCustomerIds].filter(id=>customersCache.some(c=>c.id===id)));
  const rows=getCustomerPageRows();
  customerTable.innerHTML=rows.map(c=>`<tr class="${selectedCustomerIds.has(c.id)?'selected':''}">
    <td><input type="checkbox" class="customer-row-check" data-id="${c.id}" ${selectedCustomerIds.has(c.id)?'checked':''} /></td>
    <td><strong>${c.code||''}</strong></td>
    <td>${c.name||''}</td>
    <td>${c.phone||''}</td>
    <td>${c.address||''}</td>
    <td>${c.area||''}</td>
    <td>${c.staffName||''}</td>
    <td class="row-actions"><button type="button" class="small" onclick="editCustomer('${c.id}')">Sửa</button><button type="button" class="small danger" onclick="deleteCustomer('${c.id}')">Xóa</button></td>
  </tr>`).join('');
  updateCustomerBulkUI();
}
function fillCustomerForm(c){
  if(!customerForm||!c)return;
  ['code','name','phone','area','address','staffName'].forEach(k=>{if(customerForm.elements[k])customerForm.elements[k].value=c[k]||''});
  customerForm.dataset.editingId=c.id||'';
  const btn=customerForm.querySelector('button[type="submit"]');if(btn)btn.textContent='Cập nhật khách hàng';
}
window.editCustomer=id=>{const c=customersCache.find(x=>x.id===id);if(c)fillCustomerForm(c)};
window.deleteCustomer=async id=>{
  if(!confirm('Xóa khách hàng này?'))return;
  try{
    const res=await fetch(`/api/customers/${encodeURIComponent(id)}`,{method:'DELETE'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
    selectedCustomerIds.delete(id);showMessage(customerMessage,json.message||'Đã xóa khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
};
async function bulkDeleteCustomers(){
  const ids=[...selectedCustomerIds];
  if(!ids.length)return;
  if(!confirm(`Xóa ${ids.length} khách hàng đã chọn?`))return;
  try{
    const res=await fetch('/api/customers/bulk-delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xóa được khách hàng');
    selectedCustomerIds.clear();showMessage(customerMessage,json.message||'Đã xóa khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
}
customerForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(customerForm).entries());
  try{
    const editingId=customerForm.dataset.editingId;
    const res=await fetch(editingId?`/api/customers/${encodeURIComponent(editingId)}`:'/api/customers',{method:editingId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không lưu được khách hàng');
    customerForm.reset();customerForm.dataset.editingId='';const btn=customerForm.querySelector('button[type="submit"]');if(btn)btn.textContent='Lưu khách hàng';showMessage(customerMessage,json.message||'Đã lưu khách hàng');await loadCustomers();
  }catch(err){showMessage(customerMessage,err.message,true)}
});


const SearchAutocomplete = window.SearchAutocomplete;

function matchSearch(value, terms){
  return SearchAutocomplete.matchText(value, terms);
}
function productSuggestionLabel(p){
  const stockText=` · Tồn: ${productStockDisplay(p)}`;
  const packingText=p.packing?` · ${p.packing}`:(p.unit?` · ${p.unit}`:'');
  return `${p.code||''} - ${p.name||''}${packingText}${stockText}`;
}
function staffSuggestionLabel(u){
  const role=u.roleLabel||u.role||'';
  const phone=u.phone?` · ${u.phone}`:'';
  return `${u.code||u.username||''} - ${u.name||u.fullName||u.username||''}${role?` · ${role}`:''}${phone}`;
}
function customerSuggestionLabel(c){
  const phone=c.phone?` · ${c.phone}`:'';
  const address=c.address?` · ${c.address}`:'';
  return `${c.code||''} - ${c.name||''}${phone}${address}`;
}
function debtCustomerSuggestionLabel(d){
  return `${d.customerCode||''} - ${d.customerName||''} · Nợ: ${money(d.debt||0)}`;
}
function debtStatusLabel(status){
  if(status==='paid')return 'Đã tất toán';
  if(status==='overdue')return 'Quá hạn';
  if(status==='void')return 'Void/Cancel';
  return 'Còn nợ';
}
function debtFinanceClass(row){
  if(row.status==='void')return 'finance-gray';
  if(row.status==='paid' || Number(row.debt||0)<=0)return 'finance-green';
  if(row.status==='overdue' || Number(row.overdueDays||0)>0)return 'finance-orange';
  return 'finance-red';
}
function debtPersonLabel(code,name){
  return [code,name].filter(Boolean).join(' - ') || 'Chưa gán';
}
function getProductListMatches(){
  const q=searchInput?searchInput.value.trim():'';
  return productsCache
    .filter(p=>p.isActive!==false && productHasStock(p))
    .filter(p=>!q || matchSearch(q,[p.code,p.name,p.barcode,p.category,p.packing,p.unit,p.baseUnit]))
    .slice(0,10);
}
function selectProductFromListSuggestion(p){
  if(!p)return;
  if(searchInput)searchInput.value=p.code||p.name||'';
  hideSuggestions(productListSuggestions);
  loadProducts();
}
function getCustomerListMatches(){
  const q=customerSearchInput?customerSearchInput.value.trim():'';
  if(!q)return customersCache.filter(c=>c.isActive!==false).slice(0,10);
  return customersCache.filter(c=>matchSearch(q,[c.code,c.name,c.phone,c.address,c.area,c.route,c.staffName]));
}
function selectCustomerFromListSuggestion(c){
  if(!c)return;
  if(customerSearchInput)customerSearchInput.value=c.code||c.name||'';
  hideSuggestions(customerListSuggestions);
  loadCustomers();
}
function escapeHtml(value){
  return SearchAutocomplete.escapeHtml(value);
}
function hideSuggestions(box){
  SearchAutocomplete.hide(box);
}
function showSuggestionsBox(box){
  SearchAutocomplete.show(box);
}
function wireAutocomplete(options){
  SearchAutocomplete.wire(options);
}


// Centralized autocomplete binding from /js/search/searchFieldsConfig.js
function getSuggestElement(rule, propId='targetId', propSelector='targetSelector'){
  if(!rule) return null;
  if(rule[propId]) return document.getElementById(rule[propId]);
  if(rule[propSelector]) return document.querySelector(rule[propSelector]);
  return null;
}
function getConfiguredSource(config){
  const map={products:productsCache,customers:customersCache,users:usersCache,debts:debtsCache};
  let rows=Array.isArray(map[config.source])?map[config.source]:[];
  if(config.onlyActive) rows=rows.filter(item=>item.isActive!==false);
  if(config.roles && config.roles.length){
    const roles=config.roles.map(r=>String(r).toLowerCase());
    rows=rows.filter(item=>roles.includes(String(item.role||'').toLowerCase()));
  }
  if(config.onlyInStock) rows=rows.filter(item=>productHasStock(item));
  if(config.source==='debts') rows=rows.filter(item=>Number(item.debt||0)>0);
  const input=getSuggestElement(config,'inputId','inputSelector');
  const q=input?input.value.trim():'';
  rows=rows.filter(item=>matchSearch(q,(config.searchKeys||[]).map(key=>item[key])));
  return rows.slice(0, Number(config.limit||10));
}
function getSuggestValue(item, valueType, config){
  if(valueType==='label') return getConfiguredLabel(item, config);
  if(valueType==='id') return item.id||'';
  if(valueType==='idOrCode') return getProductKey(item) || item.id || item.code || '';
  if(valueType==='codeOrUsernameOrId') return item.code||item.username||item.id||'';
  if(valueType==='nameOrFullNameOrUsername') return item.name||item.fullName||item.username||'';
  if(valueType==='customerIdOrCode') return item.customerId||item.customerCode||'';
  return item[valueType] ?? '';
}
function getConfiguredLabel(item, config){
  if(!item) return '';
  if(config.type==='product') return productSuggestionLabel(item);
  if(config.type==='customer') return customerSuggestionLabel(item);
  if(config.type==='staff') return staffSuggestionLabel(item);
  if(config.type==='debtCustomer') return debtCustomerSuggestionLabel(item);
  return [item.code,item.name,item.phone].filter(Boolean).join(' - ');
}
function applyConfiguredSelect(config, item){
  (config.fill||[]).forEach(rule=>{
    const target=getSuggestElement(rule);
    if(target) target.value=getSuggestValue(item, rule.value, config);
  });
  const input=getSuggestElement(config,'inputId','inputSelector');
  if(input){
    input.dataset.selectedId=getSuggestValue(item,'idOrCode',config) || getSuggestValue(item,'codeOrUsernameOrId',config) || '';
    const hiddenRule=(config.fill||[]).find(rule=>rule.targetId && rule.targetId!==config.inputId);
    if(hiddenRule) input.dataset.targetHidden=hiddenRule.targetId;
  }
  if(config.afterSelect==='reloadProducts') loadProducts();
  if(config.afterSelect==='reloadCustomers') loadCustomers();
  if(config.afterSelect==='setImportCostPrice' && importCostPrice) importCostPrice.value=Number(item.costPrice||0);
  if(config.afterSelect==='setSalesPrice' && salesPrice) salesPrice.value=Number(item.salePrice||0);
  if(config.afterSelect==='setCollectionAmount'){
    if(collectionCustomerSelect) collectionCustomerSelect.dataset.debt=String(item.debt||0);
    updateSelectedCustomerDebt();
  }
}
function ensureSuggestionBox(config){
  const input=getSuggestElement(config,'inputId','inputSelector');
  if(!input) return null;
  let box=config.boxId?document.getElementById(config.boxId):null;
  if(!box){
    box=document.createElement('div');
    box.id=`${config.key||input.id||input.name}Suggestions`;
    box.className='suggestions';
    box.hidden=true;
    input.insertAdjacentElement('afterend',box);
  }
  return box;
}
function initConfiguredAutocomplete(){
  (window.SEARCH_FIELD_CONFIGS||[]).forEach(config=>{
    const input=getSuggestElement(config,'inputId','inputSelector');
    const box=ensureSuggestionBox(config);
    if(!input || !box) return;
    wireAutocomplete({
      input,
      box,
      getItems:()=>getConfiguredSource(config),
      label:item=>getConfiguredLabel(item,config),
      select:item=>applyConfiguredSelect(config,item),
      emptyText:config.emptyText||'Không tìm thấy dữ liệu'
    });
  });
}

// Import
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
let editingSalesOrderId = '';
function getSalesCustomerMatches(){
  const q=salesCustomerSearch?salesCustomerSearch.value.trim():'';
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
function getSalesStaffMatches(){
  const q=salesStaffSearch?salesStaffSearch.value.trim():'';
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
  const has=(usersCache||[]).some(u=>u.isActive!==false && ['sales','admin'].includes(String(u.role||'').toLowerCase()));
  salesStaffSearch.disabled=!has;
  salesStaffSearch.placeholder=has?'Gõ mã/tên/tài khoản NV bán hàng...':'Chưa có tài khoản bán hàng';
}
function getSalesProductMatches(){
  const q=salesProductSearch?salesProductSearch.value.trim():'';
  return productsCache
    .filter(p=>p.isActive!==false && productHasStock(p))
    .filter(p=>!q || matchSearch(q,[p.code,p.name,p.barcode,p.category,p.packing,p.unit,p.baseUnit]))
    .slice(0,20);
}
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
  const has=productsCache.some(p=>p.isActive!==false && productHasStock(p));
  salesProductSearch.disabled=!has;
  salesProductSearch.placeholder=has?'Gõ mã/tên/barcode sản phẩm còn tồn...':'Chưa có sản phẩm còn tồn mở bán';
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
async function loadImportOrders(){
  try{
    const res=await fetch('/api/import-orders');const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử nhập');
    const orders=json.importOrders||[];importOrderCount.textContent=`${orders.length} phiếu nhập`;
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
function getOrderSourceText(order){
  const source=String(order.orderSource||'NVBH').toUpperCase();
  return source==='DMS'?'Từ DMS':'Từ NVBH';
}
function getOrderSourceClass(order){
  return String(order.orderSource||'NVBH').toUpperCase()==='DMS'?'source-dms':'source-nvbh';
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
function printSelectedSalesOrders(){
  const checks=[...document.querySelectorAll('.sales-order-check:checked')];
  const orders=checks.map(ch=>window.__salesOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
  if(!orders.length){alert('Chưa chọn đơn con để in');return}
  const html=orders.map(o=>`<section class="print-page"><h2>Đơn bán: ${o.code||o.id}</h2><p>Ngày: ${o.date||''} · Khách: ${o.customerCode||''} - ${o.customerName||''}</p><p>Tổng tiền: ${money(o.totalAmount)} · Đã thu: ${money(o.paidAmount)} · Còn nợ: ${money(o.debtAmount)}</p><table class="print-table"><thead><tr><th>Mã</th><th>Tên</th><th>SL</th><th>Giá</th><th>Tiền</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td>${i.productCode||''}</td><td>${i.productName||''}</td><td>${money(i.quantity)}</td><td>${money(i.salePrice)}</td><td>${money(i.amount)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><title>In nhiều đơn con</title><link rel="stylesheet" href="/print.css"></head><body>${html}<script>window.print()<\/script></body></html>`);w.document.close();
}
window.printSelectedSalesOrders=printSelectedSalesOrders;

function openSalesOrderEdit(idx){
  const order=window.__salesOrdersCache?.[idx];
  if(!order)return;
  editingSalesOrderId=order.id||order.code||'';
  salesItems=(order.items||[]).map(i=>({productId:i.productId||i.productCode,productCode:i.productCode,productName:i.productName,...productLineMeta(i),quantity:Number(i.quantity||0),salePrice:Number(i.salePrice||0),amount:Number(i.amount||Number(i.quantity||0)*Number(i.salePrice||0))}));
  salesForm.elements.date.value=String(order.date||today()).slice(0,10);
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

async function loadSalesOrders(){
  try{
    const res=await fetch('/api/sales-orders');const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được lịch sử bán');
    const allOrders=json.salesOrders||[];
    const q=String(salesOrderSearchInput?.value||'').trim().toLowerCase();
    const source=String(salesOrderSourceFilter?.value||'').trim().toUpperCase();
    const dateFrom=String(salesOrderDateFrom?.value||'').trim();
    const dateTo=String(salesOrderDateTo?.value||'').trim();
    const staff=String(salesOrderStaffFilter?.value||'').trim().toLowerCase();
    const orders=allOrders.filter(o=>{
      const text=[o.code,o.customerCode,o.customerName,o.customerPhone,o.customerAddress].join(' ').toLowerCase();
      const sourceOk=!source || String(o.orderSource||'NVBH').toUpperCase()===source;
      const date=String(o.date||'').slice(0,10);
      const dateOk=(!dateFrom||date>=dateFrom)&&(!dateTo||date<=dateTo);
      const staffText=[o.staffCode,o.staffName,o.salesStaffCode,o.salesStaffName,o.createdByName,o.createdBy].join(' ').toLowerCase();
      const staffOk=!staff||staffText.includes(staff);
      const searchOk=!q || text.includes(q);
      return sourceOk && dateOk && staffOk && searchOk;
    });
    salesOrderCount.textContent=`${orders.length} / ${allOrders.length} đơn bán`;
    if(!orders.length){salesOrderList.innerHTML='<div class="empty-state">Không có đơn bán phù hợp bộ lọc.</div>';return}
    window.__salesOrdersCache=orders;
    salesOrderList.innerHTML=orders.map((o,idx)=>`
      <article class="sales-order-card sales-order-card-compact">
        <div class="sales-order-row-main">
          <label class="sales-order-select"><input type="checkbox" class="sales-order-check" data-idx="${idx}"></label>
          <div class="sales-order-identity">
            <div class="sales-order-titleline">
              <strong class="sales-order-code-text">${o.code||o.id}</strong>
              <span class="sales-order-date">${o.date||''}</span>
              <span class="sales-order-customer-inline">${o.customerCode||''} - ${o.customerName||''}</span>
            </div>
            <div class="sales-order-subline">
              <span>${o.customerPhone||''}${o.customerAddress?` · ${o.customerAddress}`:''}</span>
              <span>${o.note?`Ghi chú: ${o.note}`:'Đơn bán đã ghi nhận vào hệ thống'}</span>
            </div>
          </div>
          <div class="sales-order-inline-total">
            <span>Tổng</span>
            <strong>${money(o.totalAmount)}</strong>
          </div>
          <div class="sales-order-badges">
            <span class="badge ${getOrderSourceClass(o)}">${getOrderSourceText(o)}</span>
            <span class="badge ${getOrderMergeClass(o)}">${getOrderMergeText(o)}</span>
          </div>
          <div class="sales-order-actions">
            <button class="small ghost" onclick="event.preventDefault();event.stopPropagation();document.getElementById('sales-order-lines-${idx}')?.toggleAttribute('open')">Chi tiết</button>
            <button class="small" onclick="openSalesOrderEdit(${idx})">Sửa</button>
            ${['cancelled','void','delivered','returned'].includes(String(o.status||'').toLowerCase())?'':`<button class="small danger" onclick="cancelSalesOrder(${idx})">Hủy đơn</button>`}
            <button class="small" onclick="printDocument('ORDER_SINGLE', window.__salesOrdersCache[${idx}])">In</button>
          </div>
        </div>

        <details id="sales-order-lines-${idx}" class="sales-order-lines sales-order-lines-compact">
          <summary>Chi tiết sản phẩm (${(o.items||[]).length} SP)</summary>
          <div class="sales-order-detail-finance">
            <span>Tổng tiền: <strong>${money(o.totalAmount)}</strong></span>
            <span>Đã thu: <strong class="cash-in">${money(o.paidAmount)}</strong></span>
            <span>Còn nợ: <strong class="debt-positive">${money(o.debtAmount)}</strong></span>
          </div>
          ${renderSalesOrderItems(o.items)}
        </details>
      </article>`).join('');
  }catch(err){salesOrderCount.textContent='Lỗi tải lịch sử';salesOrderList.innerHTML=err.message}
}
async function loadUnmergedChildOrders(){
  if(!unmergedOrderList)return;
  const params=new URLSearchParams();
  if(unmergedOrderSearch && unmergedOrderSearch.value.trim())params.set('q',unmergedOrderSearch.value.trim());
  if(unmergedSourceFilter && unmergedSourceFilter.value)params.set('source',unmergedSourceFilter.value);
  if(unmergedDateFilter && unmergedDateFilter.value)params.set('date',unmergedDateFilter.value);
  if(unmergedSalesStaffFilter && unmergedSalesStaffFilter.value.trim())params.set('salesStaff',unmergedSalesStaffFilter.value.trim());
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
        <div class="order-meta">NV bán hàng: <strong>${order.salesStaffCode||order.staffCode||''} ${order.salesStaffName||order.staffName||''}</strong></div>
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
  payload.deliveryDate = payload.deliveryDate || payload.date || today();
  payload.date = payload.deliveryDate;
  payload.childOrderIds=selectedIds;
  try{
    showMessage(masterOrderMessage,'Đang tạo đơn tổng...');
    const res=await fetch('/api/master-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tạo được đơn tổng');
    selectedChildOrderIds.clear();
    masterOrderForm.reset();
    if(masterOrderForm.elements.deliveryDate)masterOrderForm.elements.deliveryDate.value=today();
    showMessage(masterOrderMessage,json.message||'Đã tạo đơn tổng');
    await loadMasterOrderModule();
    await loadSalesOrders();
  }catch(err){showMessage(masterOrderMessage,err.message,true)}
}

async function printSelectedMasterOrders(){
  const checks=[...document.querySelectorAll('.master-order-check:checked')];
  const orders=checks.map(ch=>masterOrdersCache?.[Number(ch.dataset.idx)]).filter(Boolean);
  if(!orders.length){alert('Chưa chọn đơn tổng để in gộp');return}
  const html=orders.map(o=>`<section class="print-page"><h2>Đơn tổng: ${o.code||o.id}</h2><p>Ngày giao: ${o.deliveryDate||o.date||''} · Tuyến: ${o.routeName||''} · Giao hàng: ${o.deliveryStaffCode||''} ${o.deliveryStaffName||''} · NV bán: ${o.salesStaffCode||''} ${o.salesStaffName||''}</p><p>Số đơn con: ${money(o.totalOrders)} · Tổng tiền: ${money(o.totalAmount)} · Còn thu: ${money(o.totalDebt)}</p><table class="print-table"><thead><tr><th>Đơn con</th><th>NV bán</th><th>Khách hàng</th><th>Tổng tiền</th><th>Còn thu</th></tr></thead><tbody>${(o.children||[]).map(c=>`<tr><td>${c.code||''}</td><td>${c.salesStaffCode||c.staffCode||''} ${c.salesStaffName||c.staffName||''}</td><td>${c.customerCode||''} - ${c.customerName||''}</td><td>${money(c.totalAmount)}</td><td>${money(c.debtAmount)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const w=window.open('','_blank');w.document.write(`<!doctype html><html><head><title>In gộp đơn tổng</title><link rel="stylesheet" href="/print.css"></head><body>${html}<script>window.print()<\/script></body></html>`);w.document.close();
}
window.printSelectedMasterOrders=printSelectedMasterOrders;
async function loadMasterOrders(){
  if(!masterOrderList)return;
  const q=masterOrderSearch?masterOrderSearch.value.trim():'';
  const params=new URLSearchParams();
  if(q)params.set('q',q);
  if(masterOrderDateFrom?.value)params.set('dateFrom',masterOrderDateFrom.value);
  if(masterOrderDateTo?.value)params.set('dateTo',masterOrderDateTo.value);
  const url=`/api/master-orders${params.toString()?`?${params.toString()}`:''}`;
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được đơn tổng');
    masterOrdersCache=json.masterOrders||[];
    if(masterOrderCount)masterOrderCount.textContent=`${masterOrdersCache.length} đơn tổng`;
    if(!masterOrdersCache.length){masterOrderList.innerHTML='Chưa có đơn tổng nào.';return}
    masterOrderList.innerHTML=masterOrdersCache.map((order,idx)=>`
      <div class="order-card master-order-card">
        <div class="order-card-head">
          <h3><label><input type="checkbox" class="master-order-check" data-idx="${idx}"> ${order.code||order.id}</label></h3>
          <div class="order-actions">${masterStatusLabel(order.status)} ${order.status!=='cancelled'?`<button class="small danger" onclick="cancelMasterOrder('${order.id}')">Hủy gộp</button>`:''}</div>
        </div>
        <div class="order-meta">Ngày giao: ${order.deliveryDate||order.date||''} · Tuyến: <strong>${order.routeName||''}</strong> · Giao hàng: ${order.deliveryStaffCode||''} ${order.deliveryStaffName||''} · NV bán: <strong>${order.salesStaffCode||''} ${order.salesStaffName||''}</strong></div>
        <div class="master-kpis">
          <span>${money(order.totalOrders)} đơn con</span>
          <span>Tổng SL: ${money(order.totalQuantity)}</span>
          <span>Tổng tiền: ${money(order.totalAmount)}</span>
          <span>Còn thu: ${money(order.totalDebt)}</span>
        </div>
        ${(order.note)?`<div class="order-meta">Ghi chú: ${order.note}</div>`:''}
        <details class="master-details"><summary>Xem đơn con</summary><ul class="order-items">${(order.children||[]).map(child=>`<li><strong>${child.code}</strong> · Ngày giao: ${child.deliveryDate||order.deliveryDate||order.date||''} · Trạng thái: ${deliveryStatusLabel(child.deliveryStatus||'pending')} · ${orderSourceLabel(child.orderSource)} · NV bán: ${child.salesStaffCode||child.staffCode||''} ${child.salesStaffName||child.staffName||''} · NV giao: ${child.deliveryStaffCode||order.deliveryStaffCode||''} ${child.deliveryStaffName||order.deliveryStaffName||''} · ${child.customerCode||''} ${child.customerName||''} · ${money(child.totalAmount)} · Còn thu ${money(child.debtAmount)}</li>`).join('')}</ul></details>
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


function deliveryStatusLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='delivering')return 'Đang giao';
  if(status==='late')return 'Quá giờ';
  if(status==='unpaid')return 'Chưa thu tiền';
  return 'Chờ giao';
}
function deliveryStatusClass(row){
  if(row.isLate)return 'delivery-late';
  if(row.deliveryStatus==='delivered' && Number(row.debt||0)<=0)return 'delivery-done';
  if(Number(row.debt||0)>0)return 'delivery-unpaid';
  if(row.deliveryStatus==='delivering')return 'delivery-running';
  return 'delivery-waiting';
}
function deliveryTimelineHtml(row){
  const steps=[
    ['created','Tạo đơn',true],
    ['stock','Xuất kho',true],
    ['delivering','Đang giao',row.deliveryStatus==='delivering'||row.deliveryStatus==='delivered'],
    ['delivered','Đã giao',row.deliveryStatus==='delivered'],
    ['paid','Thu tiền',Number(row.debt||0)<=0]
  ];
  return `<div class="delivery-timeline">${steps.map(step=>`<span class="${step[2]?'done':''}">${step[1]}</span>`).join('')}</div>`;
}
async function loadDeliveryToday(){
  if(!deliveryTodayList)return;
  const params=new URLSearchParams();
  const date=deliveryDateFilter?.value||today();
  const q=deliverySearchInput?.value.trim()||'';
  const salesman=deliverySalesmanFilter?.value.trim()||'';
  const delivery=deliveryStaffFilter?.value.trim()||'';
  const route=deliveryRouteFilter?.value.trim()||'';
  const status=deliveryStatusFilter?.value||'';
  if(date)params.set('date',date);
  if(q)params.set('q',q);
  if(salesman)params.set('salesman',salesman);
  if(delivery)params.set('delivery',delivery);
  if(route)params.set('route',route);
  if(status)params.set('status',status);
  try{
    const res=await fetch(`/api/delivery-today?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được đơn đi giao');
    const rows=json.orders||[];
    if(deliveryTodayList && json.formula){ deliveryTodayList.dataset.formula=json.formula; }
    const kpi=json.kpi||{};
    if(deliveryTotalKpi)deliveryTotalKpi.textContent=kpi.totalOrders||0;
    if(deliveryRunningKpi)deliveryRunningKpi.textContent=kpi.delivering||0;
    if(deliveryDoneKpi)deliveryDoneKpi.textContent=kpi.delivered||0;
    if(deliveryUnpaidKpi)deliveryUnpaidKpi.textContent=kpi.unpaid||0;
    if(deliveryLateKpi)deliveryLateKpi.textContent=kpi.late||0;
    const routes=json.routes||[];
    if(deliveryRouteSummary){
      const formulaNote=`<div class="route-pill formula-pill"><strong>Công thức app</strong><span>${escapeHtml(json.formula||'Ngày giao + nhân viên giao + trạng thái chưa hoàn tất')}</span><small>Không lấy theo ngày tạo đơn</small></div>`;
      deliveryRouteSummary.innerHTML=formulaNote+(routes.length?routes.map(r=>`<div class="route-pill"><strong>${escapeHtml(r.routeName||'Chưa có tuyến')}</strong><span>${r.orderCount} đơn</span><small>NV giao: ${escapeHtml(r.deliveryStaffName||r.deliveryStaffCode||'Chưa gán')}</small></div>`).join(''):'');
    }
    if(!rows.length){
      deliveryTodayList.innerHTML='<div class="empty-state">Không có đơn đi giao theo bộ lọc hiện tại.</div>';
      return;
    }
    deliveryTodayList.innerHTML=rows.map(row=>{
      const cls=deliveryStatusClass(row);
      const paid=Number(row.cashCollected||0)+Number(row.bankCollected||0)+Number(row.returnAmount||0);
      return `<article class="delivery-card ${cls}">
        <div class="delivery-card-top">
          <div>
            <strong>${escapeHtml(row.orderCode||'')}</strong>
            <b>${escapeHtml(row.customerName||'')}</b>
            <small>${escapeHtml(row.customerCode||'')} · ${escapeHtml(row.customerPhone||'')} ${row.customerAddress?'· '+escapeHtml(row.customerAddress):''}</small>
          </div>
          <span class="delivery-badge">${deliveryStatusLabel(row.visualStatus||row.deliveryStatus)}</span>
        </div>
        <div class="delivery-info-grid">
          <span>NV bán <b>${escapeHtml(debtPersonLabel(row.salesmanCode,row.salesmanName))}</b></span>
          <span>NV giao <b>${escapeHtml(debtPersonLabel(row.deliveryStaffCode,row.deliveryStaffName))}</b></span>
          <span>Tuyến <b>${escapeHtml(row.routeName||'Chưa gán')}</b></span>
          <span>Ngày giao <b>${escapeHtml(row.deliveryDate||'')}</b></span>
        </div>
        <div class="delivery-money-grid">
          <span>Tổng tiền <b>${money(row.totalAmount)}</b></span>
          <span>Phải thu <b>${money(row.debtBeforeCollection ?? row.debt)}</b></span>
          <span>Đã xử lý <b class="cash-in">${money(paid)}</b></span>
          <span>Còn nợ <b class="${Number(row.debt||0)>0?'debt-positive':'debt-zero'}">${money(row.debt)}</b></span>
        </div>
        <div class="delivery-collection-row">
          <span>Tiền mặt: <b>${money(row.cashCollected||0)}</b></span>
          <span>Chuyển khoản: <b>${money(row.bankCollected||0)}</b></span>
          <span>Hàng trả về: <b>${money(row.returnAmount||0)}</b></span>
        </div>
        ${deliveryTimelineHtml(row)}
      </article>`;
    }).join('');
  }catch(err){
    deliveryTodayList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`;
  }
}


async function loadDebts(){
  const params=new URLSearchParams();
  const q=debtSearchInput?debtSearchInput.value.trim():'';
  const salesman=debtSalesmanFilter?debtSalesmanFilter.value.trim():'';
  const delivery=debtDeliveryFilter?debtDeliveryFilter.value.trim():'';
  const status=debtStatusFilter?debtStatusFilter.value:'';
  const dateFrom=debtDateFrom?debtDateFrom.value:'';
  const dateTo=debtDateTo?debtDateTo.value:'';
  if(q)params.set('q',q);
  if(salesman)params.set('salesman',salesman);
  if(delivery)params.set('delivery',delivery);
  if(status)params.set('status',status);
  if(dateFrom)params.set('dateFrom',dateFrom);
  if(dateTo)params.set('dateTo',dateTo);
  const url=params.toString()?`/api/debts?${params.toString()}`:'/api/debts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được công nợ');
    debtsCache=json.customerSummary||[];
    const ledger=json.debts||[];
    const summary=json.summary||{};
    const totalDebt=Number(summary.totalDebt ?? ledger.reduce((sum,d)=>sum+Number(d.debt||0),0));
    if(debtTotalKpi)debtTotalKpi.textContent=money(totalDebt);
    if(debtCount)debtCount.textContent=`${summary.orderCount??ledger.length} đơn · ${summary.customerCount??debtsCache.length} khách · Quá hạn ${summary.overdueCount??0} · Tổng nợ ${money(totalDebt)}`;
    if(!ledger.length){
      if(debtTable)debtTable.innerHTML='<tr><td colspan="9">Chưa có công nợ.</td></tr>';
      if(debtCardList)debtCardList.innerHTML='<div class="empty-state">Chưa có công nợ.</div>';
      renderCollectionCustomerSelect();return
    }
    if(debtTable)debtTable.innerHTML=ledger.map(d=>`<tr>
      <td><strong>${escapeHtml(d.orderCode||'')}</strong></td><td>${escapeHtml(d.documentDate||'')}</td>
      <td>${escapeHtml((d.customerCode||'')+' '+(d.customerName||''))}</td>
      <td>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</td>
      <td>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</td>
      <td>${escapeHtml(d.dueDate||'')}${Number(d.overdueDays||0)>0?` <span class="badge out">+${d.overdueDays} ngày</span>`:''}</td>
      <td class="price">${money(d.debit)}</td><td class="price cash-in">${money(d.credit)}</td>
      <td class="price ${Number(d.debt||0)>0?'debt-positive':'debt-zero'}">${money(d.debt)}</td></tr>`).join('');
    if(debtCardList)debtCardList.innerHTML=ledger.map(d=>{
      const debt=Number(d.debt||0);
      const statusClass=debtFinanceClass(d);
      const statusText=debtStatusLabel(d.status);
      const overdue=Number(d.overdueDays||0);
      const timeline=`SO ${escapeHtml(d.orderCode||'')} → Thu ${money(d.receiptAmount||0)} → Trả ${money(d.returnAmount||0)} → Còn ${money(d.debt||0)}`;
      return `<article class="erp-debt-card ${statusClass}">
        <div class="erp-debt-main">
          <div><strong>${escapeHtml((d.customerCode||'')+' · '+(d.orderCode||''))}</strong><b>${escapeHtml(d.customerName||'')}</b><small>${escapeHtml(d.phone||'')} ${d.address?'· '+escapeHtml(d.address):''}</small></div>
          <span class="debt-status-pill">${statusText}</span>
        </div>
        <div class="debt-staff-line"><span>NV bán: <b>${escapeHtml(debtPersonLabel(d.salesmanCode,d.salesmanName))}</b></span><span>NV giao: <b>${escapeHtml(debtPersonLabel(d.deliveryStaffCode,d.deliveryStaffName))}</b></span></div>
        <div class="debt-date-line"><span>Ngày bán: <b>${escapeHtml(d.documentDate||'')}</b></span><span>Hạn TT: <b>${escapeHtml(d.dueDate||'')}</b></span><span>${overdue>0?'Quá hạn':'Tuổi nợ'}: <b>${overdue>0?overdue:Number(d.agingDays||0)} ngày</b></span></div>
        <div class="erp-debt-money"><span>Phải thu <b>${money(d.debit)}</b></span><span>Đã thu/giảm <b class="cash-in">${money(d.credit)}</b></span><span>Còn nợ <b class="${debt>0?'debt-positive':'debt-zero'}">${money(debt)}</b></span></div>
        <div class="debt-mini-timeline">${timeline}</div>
      </article>`;
    }).join('');
    renderCollectionCustomerSelect();
  }catch(err){if(debtCount)debtCount.textContent='Lỗi tải công nợ';if(debtTable)debtTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;if(debtCardList)debtCardList.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}

// Debt collection
function getCollectionCustomerMatches(){
  const q=collectionCustomerSearch?collectionCustomerSearch.value.trim():'';
  return debtsCache
    .filter(d=>d.debt>0)
    .filter(d=>matchSearch(q,[d.customerCode,d.customerName]));
}
function selectCollectionCustomer(d){
  if(!d)return;
  collectionCustomerSelect.value=d.customerId||'';
  collectionCustomerSelect.dataset.debt=String(d.debt||0);
  if(collectionCustomerSearch){
    collectionCustomerSearch.value=debtCustomerSuggestionLabel(d);
    collectionCustomerSearch.dataset.selectedId=d.customerId||'';
    collectionCustomerSearch.dataset.targetHidden='collectionCustomerSelect';
  }
  updateSelectedCustomerDebt();
  hideSuggestions(collectionCustomerSuggestions);
}
function renderCollectionCustomerSelect(){
  if(!collectionCustomerSearch)return;
  const has=debtsCache.some(d=>d.debt>0);
  collectionCustomerSearch.disabled=!has;
  collectionCustomerSearch.placeholder=has?'Gõ mã/tên khách đang nợ...':'Không có khách đang nợ';
  if(!has){collectionCustomerSelect.value='';selectedCustomerDebt.textContent='0';}
}
function updateSelectedCustomerDebt(){
  if(!collectionCustomerSelect || !selectedCustomerDebt)return;
  selectedCustomerDebt.textContent=collectionCustomerSelect.value?money(collectionCustomerSelect.dataset.debt||0):'0';
}
async function submitDebtCollection(event){
  event.preventDefault();
  if(!collectionCustomerSelect.value){showMessage(collectionMessage,'Bạn chưa chọn khách hàng cần xử lý công nợ.',true);return}
  const payload=Object.fromEntries(new FormData(debtCollectionForm).entries());
  payload.cashAmount=Number(payload.cashAmount||0);
  payload.transferAmount=Number(payload.transferAmount||0);
  payload.returnAmount=Number(payload.returnAmount||0);
  payload.amount=payload.cashAmount+payload.transferAmount+payload.returnAmount;
  if(payload.amount<=0){showMessage(collectionMessage,'Bạn cần nhập ít nhất một giá trị: tiền mặt, chuyển khoản hoặc hàng trả về.',true);return}
  try{
    const res=await fetch('/api/debt-collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không xử lý được công nợ');
    debtCollectionForm.reset();debtCollectionForm.elements.date.value=today();collectionCustomerSelect.value='';if(collectionCustomerSearch)collectionCustomerSearch.value='';updateSelectedCustomerDebt();showMessage(collectionMessage,json.message||'Đã ghi chứng từ công nợ');
    await loadDebts();await loadReceipts();await loadCashbook();await loadReturnOrders();
  }catch(err){showMessage(collectionMessage,err.message,true)}
}


function setDebtPanel(panelId){
  if(!panelId)return;
  debtInnerTabs.forEach(btn=>btn.classList.toggle('active',btn.dataset.debtPanel===panelId));
  debtPanels.forEach(panel=>panel.classList.toggle('active',panel.dataset.debtPanelId===panelId));
  if(panelId==='debtOverviewPanel')loadDebts();
  if(panelId==='debtHistoryPanel')loadReceipts();
  if(panelId==='debtCashPanel'||panelId==='debtBankPanel')loadCashbook();
  if(panelId==='debtReturnPanel')loadReturnOrders();
}

function receiptMethodLabel(method){
  if(method==='transfer')return 'Chuyển khoản';
  if(method==='return')return 'Trả hàng';
  return 'Tiền mặt';
}

async function voidReceipt(id){
  const reason=prompt('Lý do hủy phiếu thu?','Hủy phiếu thu');
  if(reason===null)return;
  try{
    const res=await fetch(`/api/receipts/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`,{method:'DELETE'});
    const json=await res.json();if(!json.ok)throw new Error(json.message||'Không hủy được phiếu thu');
    await loadReceipts();await loadDebts();await loadCashbook();
  }catch(err){alert(err.message)}
}

async function loadReturnOrders(){
  if(!returnOrderTable)return;
  const q=returnOrderSearchInput?returnOrderSearchInput.value.trim():'';
  const url=q?`/api/return-orders?q=${encodeURIComponent(q)}`:'/api/return-orders';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được trả hàng');
    const rows=json.returnOrders||[];
    if(!rows.length){returnOrderTable.innerHTML='<tr><td colspan="8">Chưa có chứng từ trả hàng.</td></tr>';return}
    returnOrderTable.innerHTML=rows.map(r=>`<tr><td><strong>${r.code||''}</strong></td><td>${r.date||''}</td><td>${r.customerCode||''} ${r.customerName||''}</td><td>${r.salesOrderCode||''}</td><td class="price">${money(r.totalQuantity)}</td><td class="price cash-in">${money(r.totalAmount)}</td><td><span class="badge in">Đã ghi</span></td><td>${r.note||''}</td></tr>`).join('');
  }catch(err){returnOrderTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`}
}

async function loadReceipts(){
  if(!receiptHistoryTable)return;
  const q=receiptSearchInput?receiptSearchInput.value.trim():'';
  const url=q?`/api/receipts?q=${encodeURIComponent(q)}`:'/api/receipts';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được phiếu thu');
    const rows=json.receipts||[];
    if(!rows.length){
      if(receiptHistoryTable)receiptHistoryTable.innerHTML='<tr><td colspan="10">Chưa có phiếu thu.</td></tr>';
      if(receiptTimeline)receiptTimeline.innerHTML='<div class="empty-state">Chưa có phiếu thu.</div>';
      return
    }
    if(receiptHistoryTable)receiptHistoryTable.innerHTML=rows.map(r=>`<tr class="${r.status==='void'?'is-void':''}"><td><strong>${r.code||''}</strong></td><td>${r.date||''}</td><td>${receiptMethodLabel(r.method)}</td><td>${r.customerCode||''} ${r.customerName||''}</td><td>${debtPersonLabel(r.salesmanCode,r.salesmanName)}</td><td>${debtPersonLabel(r.deliveryStaffCode,r.deliveryStaffName)}</td><td>${r.staffName||''}</td><td class="price cash-in">${money(r.amount)}</td><td><span class="badge ${r.status==='void'?'void-badge':'in'}">${r.status==='void'?'Void':'Đã ghi'}</span></td><td>${r.status==='void'?`<small>${r.voidReason||''}</small>`:`<button class="small danger" type="button" onclick="voidReceipt('${r.id||r.code}')">Hủy</button>`}</td></tr>`).join('');
    if(receiptTimeline)receiptTimeline.innerHTML=rows.map(r=>{
      const isVoid=r.status==='void';
      const method=receiptMethodLabel(r.method);
      const methodClass=r.method==='transfer'?'finance-green':(r.method==='return'?'finance-orange':'finance-green');
      return `<article class="timeline-item ${isVoid?'is-void finance-gray':methodClass}">
        <div class="timeline-dot"></div>
        <div class="timeline-body"><div class="timeline-head"><strong>${escapeHtml(r.code||'')}</strong><span>${escapeHtml(r.date||'')}</span></div>
        <div class="timeline-meta"><b>${escapeHtml(method)}</b> · ${escapeHtml((r.customerCode||'')+' '+(r.customerName||''))}</div>
        <div class="timeline-money"><span>${escapeHtml(r.staffName||'')}</span><strong>${money(r.amount)}</strong></div>
        <div class="timeline-actions">${isVoid?`<span class="badge void-badge">Void/Cancel</span><small>${escapeHtml(r.voidReason||'')}</small>`:`<span class="badge in">Đã thu</span><button class="small danger" type="button" onclick="voidReceipt('${r.id||r.code}')">Hủy</button>`}</div></div>
      </article>`;
    }).join('');
  }catch(err){if(receiptHistoryTable)receiptHistoryTable.innerHTML=`<tr><td colspan="10">${err.message}</td></tr>`;if(receiptTimeline)receiptTimeline.innerHTML=`<div class="empty-state danger-text">${escapeHtml(err.message)}</div>`}
}

// Cashbook
async function loadCashbook(){
  const q=cashbookSearchInput?cashbookSearchInput.value.trim():'';const url=q?`/api/cashbook?q=${encodeURIComponent(q)}`:'/api/cashbook';
  try{
    const res=await fetch(url);const json=await res.json();if(!json.ok)throw new Error(json.message||'Không tải được sổ quỹ');
    const entries=json.cashbook||[];const s=json.summary||{cashIn:0,cashOut:0,balance:0};const bs=json.bankSummary||{bankIn:0,bankOut:0,balance:0};
    if(cashTotalKpi)cashTotalKpi.textContent=money(s.balance);
    if(bankTotalKpi)bankTotalKpi.textContent=money(bs.balance);
    cashSummary.textContent=`Tiền mặt: thu ${money(s.cashIn)} · chi ${money(s.cashOut)} · tồn ${money(s.balance)} | Chuyển khoản: ${money(bs.balance)}`;
    const cashRows=entries.filter(e=>!e.isBank);
    const bankRows=entries.filter(e=>e.isBank);
    if(cashbookTable){cashbookTable.innerHTML=cashRows.length?cashRows.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join(''):'<tr><td colspan="8">Chưa có phát sinh tiền mặt.</td></tr>';}
    if(bankbookTable){bankbookTable.innerHTML=bankRows.length?bankRows.map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td>${e.source||''}</td><td>${e.customerCode||''} ${e.customerName||''}</td><td>${e.staffName||''}</td><td class="price cash-in">${money(e.amount)}</td><td>${e.note||''}</td></tr>`).join(''):'<tr><td colspan="7">Chưa có phát sinh chuyển khoản.</td></tr>';}
  }catch(err){cashSummary.textContent='Lỗi tải sổ quỹ';cashbookTable.innerHTML=`<tr><td colspan="8">${err.message}</td></tr>`;if(bankbookTable)bankbookTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
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
      reportCashTable.innerHTML=cashRows.slice(0,100).map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.isBank?'NH ':''}${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.staffName||e.customerName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td></tr>`).join('');
    }
  }catch(err){
    if(reportSalesSummary)reportSalesSummary.textContent=err.message;
    if(reportSalesTable)reportSalesTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;
  }
}



function roleText(role){
  const map={admin:'Admin',accountant:'Kế toán',sales:'Bán hàng',delivery:'Giao hàng'};
  return map[role]||role||'';
}
async function loadUsers(){
  if(!userTable)return;
  try{
    const q=encodeURIComponent(userSearchInput?.value||'');
    const res=await fetch(`/api/users?q=${q}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được tài khoản');
    usersCache=json.users||[];
    renderSalesStaffSelect();
    if(userCount)userCount.textContent=`${usersCache.length} tài khoản`;
    if(!usersCache.length){userTable.innerHTML='<tr><td colspan="7">Chưa có tài khoản.</td></tr>';return}
    userTable.innerHTML=usersCache.map(u=>`<tr>
      <td><strong>${u.code||''}</strong></td><td>${u.username||''}</td><td>${u.name||u.fullName||''}</td><td>${u.phone||''}</td>
      <td><span class="badge active">${roleText(u.role)}</span></td><td>${u.isActive!==false?'Đang hoạt động':'Ngừng'}</td>
      <td class="row-actions"><button class="small" onclick="editUser('${u.id}')">Sửa</button><button class="small danger" onclick="deleteUser('${u.id}')">Xóa</button></td>
    </tr>`).join('');
  }catch(err){userTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
}
function resetUserForm(){if(userForm){userForm.reset();userForm.elements.id.value='';userForm.elements.isActive.checked=true} if(userMessage)showMessage(userMessage,'')}
function editUser(id){
  const u=usersCache.find(x=>String(x.id)===String(id)); if(!u||!userForm)return;
  userForm.elements.id.value=u.id||''; userForm.elements.code.value=u.code||''; userForm.elements.username.value=u.username||'';
  userForm.elements.password.value=''; userForm.elements.name.value=u.name||u.fullName||''; userForm.elements.phone.value=u.phone||'';
  userForm.elements.role.value=u.role||'sales'; userForm.elements.isActive.checked=u.isActive!==false;
  document.querySelector('[data-tab="usersTab"]')?.click();
}
async function deleteUser(id){
  if(!confirm('Xóa tài khoản này?'))return;
  try{const res=await fetch(`/api/users/${encodeURIComponent(id)}`,{method:'DELETE'});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã xóa');await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}
async function submitUser(event){
  event.preventDefault();
  const body=Object.fromEntries(new FormData(userForm).entries()); body.isActive=userForm.elements.isActive.checked;
  try{const res=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã lưu');resetUserForm();await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}

function promotionTypeText(type){return {discount:'Chiết khấu',display:'Trưng bày',coupon:'Coupon',ontop:'Ontop',combo:'Combo'}[type]||type||''}
async function loadPromotions(){
  if(!promotionTable)return;
  try{
    const q=encodeURIComponent(promotionSearchInput?.value||'');
    const res=await fetch(`/api/promotions?q=${q}`);
    const json=await res.json(); if(!json.ok)throw new Error(json.message||'Không tải được khuyến mại');
    promotionsCache=json.promotions||[]; if(promotionCount)promotionCount.textContent=`${promotionsCache.length} chương trình`;
    if(!promotionsCache.length){promotionTable.innerHTML='<tr><td colspan="6">Chưa có chương trình khuyến mại.</td></tr>';return}
    promotionTable.innerHTML=promotionsCache.map(p=>`<tr>
      <td><strong>${p.code||''}</strong><br><span class="muted">${promotionTypeText(p.type)}</span></td>
      <td><strong>${p.name||''}</strong><br><span class="muted">Điều kiện: ${p.conditionText||'-'}</span><br><span class="muted">CK/Thưởng: ${p.discountText||'-'}</span>${p.displayReward?`<br><span class="muted">Trưng bày: ${p.displayReward}</span>`:''}${p.couponText?`<br><span class="muted">Coupon: ${p.couponText}</span>`:''}${p.ontopText?`<br><span class="muted">Ontop: ${p.ontopText}</span>`:''}</td>
      <td>${(p.productCodes||[]).slice(0,8).join(', ')}${(p.productCodes||[]).length>8?'...':''}</td>
      <td>${p.startDate||''} ${p.endDate?`→ ${p.endDate}`:''}</td>
      <td><span class="badge ${p.isActive!==false?'active':'inactive'}">${p.isActive!==false?'Đang áp dụng':'Ngừng'}</span></td>
      <td class="row-actions"><button class="small" onclick="editPromotion('${p.id}')">Sửa</button><button class="small danger" onclick="deletePromotion('${p.id}')">Xóa</button></td>
    </tr>`).join('');
  }catch(err){promotionTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
function resetPromotionForm(){if(promotionForm){promotionForm.reset();promotionForm.elements.id.value='';promotionForm.elements.isActive.checked=true} if(promotionMessage)showMessage(promotionMessage,'')}
function editPromotion(id){
  const p=promotionsCache.find(x=>String(x.id)===String(id)); if(!p||!promotionForm)return;
  ['id','code','name','type','conditionText','discountText','displayReward','couponText','ontopText','startDate','endDate','note'].forEach(k=>{if(promotionForm.elements[k])promotionForm.elements[k].value=p[k]||''});
  promotionForm.elements.productCodes.value=(p.productCodes||[]).join('\n'); promotionForm.elements.isActive.checked=p.isActive!==false;
  document.querySelector('[data-tab="promotionsTab"]')?.click();
}
async function deletePromotion(id){
  if(!confirm('Xóa chương trình khuyến mại này?'))return;
  try{const res=await fetch(`/api/promotions/${encodeURIComponent(id)}`,{method:'DELETE'});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(promotionMessage,json.message||'Đã xóa');await loadPromotions()}catch(err){showMessage(promotionMessage,err.message,true)}
}
async function submitPromotion(event){
  event.preventDefault();
  const body=Object.fromEntries(new FormData(promotionForm).entries()); body.isActive=promotionForm.elements.isActive.checked;
  try{const res=await fetch('/api/promotions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(promotionMessage,json.message||'Đã lưu');resetPromotionForm();await loadPromotions()}catch(err){showMessage(promotionMessage,err.message,true)}
}

// Import dữ liệu Excel

function getCurrentImportFields(){
  return customImportFields || [];
}
function createMappingRow(field={}){
  const options=getCurrentImportFields().map(item=>`<option value="${escapeHtml(item.field)}" ${item.field===(field.dbField||'')?'selected':''}>${escapeHtml(item.label)} (${escapeHtml(item.field)})</option>`).join('');
  return `<tr>
    <td><input class="custom-excel-header" placeholder="VD: Mã KH" value="${escapeHtml(field.excelHeader||'')}" /></td>
    <td><select class="custom-db-field"><option value="">Chọn trường...</option>${options}</select></td>
    <td class="center"><input class="custom-required" type="checkbox" ${field.required?'checked':''} /></td>
    <td><input class="custom-default" placeholder="Có thể bỏ trống" value="${escapeHtml(field.defaultValue||'')}" /></td>
    <td><button type="button" class="secondary remove-custom-map">Xóa</button></td>
  </tr>`;
}
function renderCustomImportMapping(fields){
  if(!customImportMappingTable)return;
  const rows=(fields&&fields.length)?fields:[{excelHeader:'',dbField:'',required:false,defaultValue:''}];
  customImportMappingTable.innerHTML=rows.map(createMappingRow).join('');
}
function readCustomImportMapping(){
  if(!customImportMappingTable)return[];
  return Array.from(customImportMappingTable.querySelectorAll('tr')).map(row=>({
    excelHeader:(row.querySelector('.custom-excel-header')?.value||'').trim(),
    dbField:(row.querySelector('.custom-db-field')?.value||'').trim(),
    required:!!row.querySelector('.custom-required')?.checked,
    defaultValue:(row.querySelector('.custom-default')?.value||'').trim()
  })).filter(field=>field.excelHeader&&field.dbField);
}
async function loadImportFieldOptions(){
  if(!importDataType||!customImportMappingTable)return;
  try{
    const res=await fetch(`/api/import/fields/${encodeURIComponent(importDataType.value)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được trường import');
    customImportFields=json.fields||[];
    renderCustomImportMapping(readCustomImportMapping());
  }catch(err){customImportMappingTable.innerHTML=`<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`}
}
async function loadCustomImportTemplates(){
  if(!customImportTemplateSelect)return;
  try{
    const res=await fetch('/api/import/custom-templates');
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được mẫu tự tạo');
    customImportTemplates=json.templates||[];
    const type=importDataType?importDataType.value:'';
    const options=customImportTemplates.filter(t=>!type||t.type===type).map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} - ${escapeHtml(t.code||'')}</option>`).join('');
    customImportTemplateSelect.innerHTML=`<option value="">Không dùng mẫu tự tạo</option>${options}`;
  }catch(err){showMessage(importDataMessage,err.message,true)}
}
function getSelectedCustomTemplate(){
  const id=customImportTemplateSelect?customImportTemplateSelect.value:'';
  return customImportTemplates.find(t=>t.id===id)||null;
}
function loadSelectedCustomTemplateToEditor(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  if(customImportTemplateName)customImportTemplateName.value=template.name||'';
  if(importDataType)importDataType.value=template.type||importDataType.value;
  loadImportFieldOptions().then(()=>renderCustomImportMapping(template.fields||[]));
}
async function saveCustomImportTemplate(){
  if(!importDataType)return;
  const fields=readCustomImportMapping();
  if(!fields.length){showMessage(importDataMessage,'Bạn chưa map cột Excel nào',true);return;}
  const selected=getSelectedCustomTemplate();
  const body={
    id:selected?selected.id:'',
    code:selected?selected.code:'',
    name:(customImportTemplateName&&customImportTemplateName.value.trim())||'Mẫu import tự tạo',
    type:importDataType.value,
    sheetName:'Import',
    startRow:2,
    fields
  };
  try{
    const res=await fetch('/api/import/custom-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không lưu được mẫu');
    showMessage(importDataMessage,json.message||'Đã lưu mẫu import');
    await loadCustomImportTemplates();
    if(json.template&&customImportTemplateSelect)customImportTemplateSelect.value=json.template.id;
  }catch(err){showMessage(importDataMessage,err.message,true)}
}
function downloadCustomImportTemplate(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  window.location.href=`/api/import/custom-template/${encodeURIComponent(template.id)}/download`;
}
async function deleteCustomImportTemplate(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  if(!confirm('Xóa mẫu import tự tạo này?'))return;
  try{
    const res=await fetch(`/api/import/custom-templates/${encodeURIComponent(template.id)}`,{method:'DELETE'});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không xóa được mẫu');
    showMessage(importDataMessage,json.message||'Đã xóa mẫu');
    if(customImportTemplateName)customImportTemplateName.value='';
    await loadCustomImportTemplates();
    renderCustomImportMapping([]);
  }catch(err){showMessage(importDataMessage,err.message,true)}
}
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
  if(customImportTemplateSelect&&customImportTemplateSelect.value)formData.append('templateId',customImportTemplateSelect.value);
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
    await loadProducts();await loadCustomers();await loadStock();await loadImportOrders();await loadSalesOrders();await loadDebts();await loadReceipts();await loadCashbook();
  }catch(err){showMessage(importDataMessage,err.message,true)}
}

resetButton.addEventListener('click',resetForm);
if(searchInput)searchInput.addEventListener('input',loadProducts);
if(customerSearchInput)customerSearchInput.addEventListener('input',loadCustomers);
if(customerTable)customerTable.addEventListener('change',event=>{const check=event.target.closest('.customer-row-check');if(!check)return;if(check.checked)selectedCustomerIds.add(check.dataset.id);else selectedCustomerIds.delete(check.dataset.id);updateCustomerBulkUI();});
if(customerCheckAll)customerCheckAll.addEventListener('change',()=>{getCustomerPageRows().forEach(c=>{if(!c.id)return;if(customerCheckAll.checked)selectedCustomerIds.add(c.id);else selectedCustomerIds.delete(c.id)});renderCustomerTable();});
if(customerPrevPage)customerPrevPage.addEventListener('click',()=>{customerPage=Math.max(1,customerPage-1);renderCustomerTable();});
if(customerNextPage)customerNextPage.addEventListener('click',()=>{customerPage=Math.min(getCustomerTotalPages(),customerPage+1);renderCustomerTable();});
if(customerPageSizeSelect)customerPageSizeSelect.addEventListener('change',()=>{customerPageSize=Number(customerPageSizeSelect.value||50);customerPage=1;renderCustomerTable();});
if(bulkDeleteCustomerButton)bulkDeleteCustomerButton.addEventListener('click',bulkDeleteCustomers);
initConfiguredAutocomplete();
if(addImportItemButton)addImportItemButton.addEventListener('click',addImportItem);
if(importForm){importForm.addEventListener('submit',submitImportOrder);importForm.elements.date.value=today()}
if(addSalesItemButton)addSalesItemButton.addEventListener('click',addSalesItem);
if(salesForm){salesForm.addEventListener('submit',submitSalesOrder);salesForm.elements.date.value=today()}

if(debtCollectionForm){debtCollectionForm.addEventListener('submit',submitDebtCollection);debtCollectionForm.elements.date.value=today()}

if(cashbookForm){cashbookForm.addEventListener('submit',submitCashbook);cashbookForm.elements.date.value=today()}

if(stockSearchInput)stockSearchInput.addEventListener('input',loadStock);
if(debtSearchInput)debtSearchInput.addEventListener('input',loadDebts);
[debtSalesmanFilter,debtDeliveryFilter,debtStatusFilter,debtDateFrom,debtDateTo].forEach(el=>{if(el)el.addEventListener('input',loadDebts);if(el)el.addEventListener('change',loadDebts);});
if(receiptSearchInput)receiptSearchInput.addEventListener('input',loadReceipts);
if(returnOrderSearchInput)returnOrderSearchInput.addEventListener('input',loadReturnOrders);
debtInnerTabs.forEach(btn=>btn.addEventListener('click',()=>setDebtPanel(btn.dataset.debtPanel)));
window.voidReceipt=voidReceipt;
if(cashbookSearchInput)cashbookSearchInput.addEventListener('input',loadCashbook);
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',commitImportExcel);
if(addImportMappingButton)addImportMappingButton.addEventListener('click',()=>{if(customImportMappingTable)customImportMappingTable.insertAdjacentHTML('beforeend',createMappingRow({}))});
if(customImportMappingTable)customImportMappingTable.addEventListener('click',event=>{const btn=event.target.closest('.remove-custom-map');if(!btn)return;btn.closest('tr')?.remove();if(!customImportMappingTable.children.length)renderCustomImportMapping([]);});
if(saveCustomImportTemplateButton)saveCustomImportTemplateButton.addEventListener('click',saveCustomImportTemplate);
if(loadCustomImportTemplateButton)loadCustomImportTemplateButton.addEventListener('click',loadSelectedCustomTemplateToEditor);
if(downloadCustomImportTemplateButton)downloadCustomImportTemplateButton.addEventListener('click',downloadCustomImportTemplate);
if(deleteCustomImportTemplateButton)deleteCustomImportTemplateButton.addEventListener('click',deleteCustomImportTemplate);
if(importDataType)importDataType.addEventListener('change',async()=>{importPreviewRows=[];if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chưa có dữ liệu preview.</td></tr>';if(commitImportButton)commitImportButton.disabled=true;resetImportPreviewMessage();await loadImportFieldOptions();await loadCustomImportTemplates();});
if(reloadImportOrdersButton)reloadImportOrdersButton.addEventListener('click',loadImportOrders);
if(reloadSalesOrdersButton)reloadSalesOrdersButton.addEventListener('click',loadSalesOrders);
if(salesOrderSearchInput)salesOrderSearchInput.addEventListener('input',loadSalesOrders);
if(salesOrderSourceFilter)salesOrderSourceFilter.addEventListener('change',loadSalesOrders);
if(salesOrderDateFrom)salesOrderDateFrom.addEventListener('change',loadSalesOrders);
if(salesOrderDateTo)salesOrderDateTo.addEventListener('change',loadSalesOrders);
if(salesOrderStaffFilter)salesOrderStaffFilter.addEventListener('input',loadSalesOrders);
if(printSelectedSalesOrdersButton)printSelectedSalesOrdersButton.addEventListener('click',printSelectedSalesOrders);

if(reloadMasterOrdersButton)reloadMasterOrdersButton.addEventListener('click',loadMasterOrderModule);
if(masterOrderForm){masterOrderForm.addEventListener('submit',submitMasterOrder);if(masterOrderForm.elements.deliveryDate)masterOrderForm.elements.deliveryDate.value=today();else if(masterOrderForm.elements.date)masterOrderForm.elements.date.value=today()}
if(unmergedOrderSearch)unmergedOrderSearch.addEventListener('input',loadUnmergedChildOrders);
if(unmergedSourceFilter)unmergedSourceFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedDateFilter)unmergedDateFilter.addEventListener('change',loadUnmergedChildOrders);
if(unmergedSalesStaffFilter)unmergedSalesStaffFilter.addEventListener('input',loadUnmergedChildOrders);
if(masterOrderSearch)masterOrderSearch.addEventListener('input',loadMasterOrders);
if(masterOrderDateFrom)masterOrderDateFrom.addEventListener('change',loadMasterOrders);
if(masterOrderDateTo)masterOrderDateTo.addEventListener('change',loadMasterOrders);
if(printSelectedMasterOrdersButton)printSelectedMasterOrdersButton.addEventListener('click',printSelectedMasterOrders);
if(unmergedOrderList)unmergedOrderList.addEventListener('change',event=>{const check=event.target.closest('.child-order-check');if(!check)return;if(check.checked)selectedChildOrderIds.add(check.dataset.id);else selectedChildOrderIds.delete(check.dataset.id);renderUnmergedChildOrders();});
if(reloadDeliveryTodayButton)reloadDeliveryTodayButton.addEventListener('click',loadDeliveryToday);
if(deliveryDateFilter){deliveryDateFilter.value=today();deliveryDateFilter.addEventListener('change',loadDeliveryToday);}
if(deliverySearchInput)deliverySearchInput.addEventListener('input',loadDeliveryToday);
if(deliverySalesmanFilter)deliverySalesmanFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStaffFilter)deliveryStaffFilter.addEventListener('input',loadDeliveryToday);
if(deliveryRouteFilter)deliveryRouteFilter.addEventListener('input',loadDeliveryToday);
if(deliveryStatusFilter)deliveryStatusFilter.addEventListener('change',loadDeliveryToday);
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);
if(userForm)userForm.addEventListener('submit',submitUser);
if(resetUserButton)resetUserButton.addEventListener('click',resetUserForm);
if(userSearchInput)userSearchInput.addEventListener('input',loadUsers);
if(promotionForm)promotionForm.addEventListener('submit',submitPromotion);
if(resetPromotionButton)resetPromotionButton.addEventListener('click',resetPromotionForm);
if(promotionSearchInput)promotionSearchInput.addEventListener('input',loadPromotions);

setupTabs();
loadImportFieldOptions();
loadCustomImportTemplates();
checkServer();
loadProducts();
loadCustomers();
loadStock();
loadImportOrders();
loadSalesOrders();
loadMasterOrderModule();
loadDeliveryToday();
loadDebts();
loadReceipts();
loadCashbook();
loadUsers();
loadPromotions();
setReportDefaults();
renderImportItems();
renderSalesItems();
