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

