'use strict';

setupTabs();

// V45 performance fix: không load toàn bộ module khi mở trang.
// Mở tab nào thì mới gọi API của tab đó; server health/import config chạy nền, không khóa UI.
const V45_BOOT_LOADED_TABS = window.V45_BOOT_LOADED_TABS || (window.V45_BOOT_LOADED_TABS = new Set());
function getActiveTabName(){
  return document.querySelector('.tab-content.active')?.id
    || document.querySelector('.tab-button.active')?.dataset?.tab
    || 'productsTab';
}
function markTabLoading(tabName, isLoading){
  const tab = document.getElementById(tabName);
  if(!tab) return;
  tab.dataset.loading = isLoading ? '1' : '0';
}
async function loadTabDataOnce(tabName, options = {}){
  if(!tabName) return;
  const force = options.force === true;
  if(!force && V45_BOOT_LOADED_TABS.has(tabName)) return;
  V45_BOOT_LOADED_TABS.add(tabName);
  markTabLoading(tabName, true);
  try{
    switch(tabName){
      case 'dashboardTab':
        if(typeof loadHomeDashboard === 'function') await loadHomeDashboard();
        break;
      case 'productsTab':
        if(typeof loadProducts === 'function') await loadProducts({allowEmpty:true});
        break;
      case 'customersTab':
        if(typeof loadCustomers === 'function') await loadCustomers({resetPage:true});
        break;
      case 'importTab':
        await Promise.allSettled([
          typeof loadProducts === 'function' ? loadProducts({allowEmpty:true}) : null,
          typeof loadImportOrders === 'function' ? loadImportOrders() : null
        ]);
        if(typeof renderImportProductSelect === 'function') renderImportProductSelect();
        break;
      case 'salesTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadSalesOrders === 'function' ? loadSalesOrders() : null
        ]);
        // Danh mục sản phẩm/khách hàng cho form bán hàng chỉ đồng bộ nền sau khi danh sách đơn đã hiện.
        setTimeout(()=>{
          Promise.allSettled([
            typeof loadProducts === 'function' ? loadProducts({allowEmpty:true}) : null,
            typeof loadCustomers === 'function' ? loadCustomers({resetPage:true}) : null
          ]).then(()=>{
            if(typeof renderSalesProductSelect === 'function') renderSalesProductSelect();
            if(typeof renderSalesCustomerSelect === 'function') renderSalesCustomerSelect();
            if(typeof renderSalesStaffSelect === 'function') renderSalesStaffSelect();
          });
        }, 50);
        break;
      case 'masterOrdersTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadMasterOrderModule === 'function' ? loadMasterOrderModule() : null
        ]);
        break;
      case 'returnOrdersTab':
        if(typeof loadReturnOrders === 'function') await loadReturnOrders();
        break;
      case 'masterReturnOrdersTab':
        await Promise.allSettled([
          typeof loadUnmergedReturnOrders === 'function' ? loadUnmergedReturnOrders() : null,
          typeof loadMasterReturnOrders === 'function' ? loadMasterReturnOrders() : null
        ]);
        break;
      case 'deliveryTodayTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadDeliveryToday === 'function' ? loadDeliveryToday() : null
        ]);
        break;
      case 'stockTab':
        if(typeof loadStock === 'function') await loadStock();
        break;
      case 'debtTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadDebts === 'function' ? loadDebts() : null,
          typeof loadReceipts === 'function' ? loadReceipts() : null,
          typeof loadCashbook === 'function' ? loadCashbook() : null
        ]);
        if(typeof renderCollectionCustomerSelect === 'function') renderCollectionCustomerSelect();
        break;
      case 'debtCollectionsTab':
        if(typeof loadDebtCollections === 'function') await loadDebtCollections();
        break;
      case 'reportsTab':
        // Phase 76: chỉ tải danh mục ở cửa sổ chính; popup chỉ mở khi bấm Xem báo cáo.
        if(typeof loadReports === 'function') await loadReports({ openModal: false });
        break;
      case 'usersTab':
      case 'promotionsTab':
        await Promise.allSettled([
          typeof loadUsers === 'function' ? loadUsers() : null,
          typeof loadPromotions === 'function' ? loadPromotions() : null
        ]);
        break;
      case 'systemTab':
        await Promise.allSettled([
          typeof loadSystemStatus === 'function' ? loadSystemStatus() : null,
          typeof loadApiMonitor === 'function' ? loadApiMonitor() : null
        ]);
        break;
    }
  }catch(error){
    console.warn('[V45_TAB_LOAD_ERROR]', tabName, error);
  }finally{
    markTabLoading(tabName, false);
  }
}
window.V45LoadTabDataOnce = loadTabDataOnce;

if(typeof setReportDefaults === 'function') setReportDefaults();
if(typeof renderImportItems === 'function') renderImportItems();
if(typeof renderSalesItems === 'function') renderSalesItems();

// Các tác vụ nền nhẹ, không await để tránh treo giao diện.
setTimeout(()=>{ if(typeof checkServer === 'function') checkServer().catch?.(console.warn); }, 0);
setTimeout(()=>{ if(typeof loadImportFieldOptions === 'function') loadImportFieldOptions().catch?.(console.warn); }, 200);
setTimeout(()=>{ if(typeof loadCustomImportTemplates === 'function') loadCustomImportTemplates().catch?.(console.warn); }, 400);

// Phase36c: để GET / trả shell UI trước, không kích hoạt dashboard 10+ query ngay cùng tick render đầu.
// Dashboard vẫn tự tải nếu đang là tab active, nhưng trì hoãn nhẹ sau khi giao diện đã sẵn sàng.
const initialTabName = getActiveTabName();
const initialTabDelayMs = initialTabName === 'dashboardTab' ? 650 : 0;
setTimeout(()=>loadTabDataOnce(initialTabName), initialTabDelayMs);
