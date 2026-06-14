'use strict';

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
let salesProductsCache=[]; // Catalog riêng cho ô gợi ý bán hàng, không phụ thuộc bộ lọc danh sách sản phẩm
let customersCache=[];
let debtsCache=[];
let selectedCollectionCustomerOrders=[];
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
// MASTER_ORDER_POPUP_PATCH_START: tách trạng thái tích ở layer 2 và đơn đã đưa sang layer 3
let selectedUnmergedChildOrderIds=new Set();
let selectedGroupedChildOrderIds=new Set();
let selectedGroupedChildOrderCheckIds=new Set();
// Giữ biến cũ để tương thích các đoạn cũ, nhưng luồng tạo đơn tổng mới dùng selectedGroupedChildOrderIds.
let selectedChildOrderIds=selectedUnmergedChildOrderIds;
// MASTER_ORDER_POPUP_PATCH_END
let masterOrdersCache=[];
let importPreviewRows=[];
let customImportFields=[];
let customImportTemplates=[];

const reloadSystemStatusButton=document.getElementById('reloadSystemStatusButton');
const reloadSystemDataSourceButton=document.getElementById('reloadSystemDataSourceButton');
const createSystemBackupButton=document.getElementById('createSystemBackupButton');
const resetSystemDataButton=document.getElementById('resetSystemDataButton');
const systemResetScope=document.getElementById('systemResetScope');
const systemResetConfirm=document.getElementById('systemResetConfirm');
const systemMongoState=document.getElementById('systemMongoState');
const systemResetState=document.getElementById('systemResetState');
const systemDataSource=document.getElementById('systemDataSource');
const systemCountsTable=document.getElementById('systemCountsTable');
const systemMessage=document.getElementById('systemMessage');
const apiMonitorFilter=document.getElementById('apiMonitorFilter');
const reloadApiMonitorButton=document.getElementById('reloadApiMonitorButton');
const resetApiMonitorButton=document.getElementById('resetApiMonitorButton');
const apiMonitorTable=document.getElementById('apiMonitorTable');
const apiSlowTable=document.getElementById('apiSlowTable');
const apiTopSlowTable=document.getElementById('apiTopSlowTable');
const apiTopCalledTable=document.getElementById('apiTopCalledTable');
const apiTopRowsTable=document.getElementById('apiTopRowsTable');
const apiTopQueryTraceTable=document.getElementById('apiTopQueryTraceTable');
const apiMonitorTabButtons=document.querySelectorAll('[data-api-monitor-tab]');
const apiMonitorTabPanels=document.querySelectorAll('[data-api-monitor-panel]');
const apiMonitorTotalRoutes=document.getElementById('apiMonitorTotalRoutes');
const apiMonitorTotalCalls=document.getElementById('apiMonitorTotalCalls');
const apiMonitorSlowRoutes=document.getElementById('apiMonitorSlowRoutes');
const apiMonitorSlowCalls=document.getElementById('apiMonitorSlowCalls');
const apiMonitorErrorCalls=document.getElementById('apiMonitorErrorCalls');
const apiMonitorTotalMongoMs=document.getElementById('apiMonitorTotalMongoMs');
const apiMonitorTotalJsMs=document.getElementById('apiMonitorTotalJsMs');
const apiMonitorTotalDbQueries=document.getElementById('apiMonitorTotalDbQueries');
