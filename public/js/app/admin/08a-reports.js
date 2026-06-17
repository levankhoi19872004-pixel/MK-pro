'use strict';

let importShortageActionMode='';
let importPreviewSessionId='';
let importSelectedRowKeySet=new Set();
const IMPORT_PREVIEW_RENDER_LIMIT=Number(window.IMPORT_PREVIEW_RENDER_LIMIT||120);

function reportDateInRange(dateText, fromDate, toDate){
  return isDateInRange(dateText, fromDate, toDate);
}

function orderSourceLabel(source, row){
  const order={...(row||{}), orderSource: source ?? row?.orderSource};
  const value=[order.orderSource,order.source,order.sourceType,order.orderSourceName,order.importSource,order.importType,order.origin,order.note].filter(Boolean).join(' ').toUpperCase();
  if(/(^|[^A-Z])DMS([^A-Z]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(value))return '<span class="badge source-dms">Từ DMS</span>';
  return '<span class="badge source-nvbh">Từ NVBH</span>';
}


function displayImportQtyTL(quantity, row = {}){
  const rate = Number(row.conversionRate || row.packingQty || row.unitsPerCase || row.qtyPerCase || row.packSize || 1);
  if(typeof formatCaseLooseStock === 'function') return formatCaseLooseStock(Number(quantity||0), rate);
  if(window.V45Common && typeof window.V45Common.calculateCartonUnit === 'function') return window.V45Common.calculateCartonUnit(Number(quantity||0), rate).display;
  return String(Number(quantity||0));
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
function exportReportExcel(type){
  const cleanType=String(type||'').trim();
  if(!cleanType)return;
  setReportDefaults();
  const params=new URLSearchParams();
  const from=reportFromDate?.value||document.getElementById('reportFromDate')?.value||'';
  const to=reportToDate?.value||document.getElementById('reportToDate')?.value||'';
  // Tồn kho hiện tại là snapshot canonical từ inventories, không phụ thuộc ngày.
  // Nhập-xuất-tồn và thẻ kho mới dùng khoảng ngày.
  if(cleanType!=='stock-report'){
    if(from)params.set('dateFrom',from);
    if(to)params.set('dateTo',to);
  }
  params.set('limit','100000');
  window.location.href=`/api/export/${encodeURIComponent(cleanType)}.xlsx?${params.toString()}`;
}

async function loadReports(){
  setReportDefaults();
  if(reportSalesSummary){
    reportSalesSummary.textContent='Báo cáo chi tiết đã chuyển sang xuất Excel theo yêu cầu. Dashboard không tải bảng realtime để hệ thống nhẹ hơn.';
  }
  if(reportRevenue)reportRevenue.textContent='0';
  if(reportCollected)reportCollected.textContent='0';
  if(reportDebt)reportDebt.textContent='0';
  if(reportCashBalance)reportCashBalance.textContent='0';
  if(reportOrderCount)reportOrderCount.textContent='Chọn mẫu Excel để xuất';
}

function initReportExportButtons(){
  document.querySelectorAll('.report-export-btn[data-report-type]').forEach(btn=>{
    if(btn.dataset.boundReportExport==='1')return;
    btn.dataset.boundReportExport='1';
    btn.addEventListener('click',()=>exportReportExcel(btn.dataset.reportType));
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initReportExportButtons);
}else{
  initReportExportButtons();
}






// PHASE35_REPORT_EVENT_OWNERSHIP
if(reloadReportsButton)reloadReportsButton.addEventListener('click',loadReports);
if(reportFromDate)reportFromDate.addEventListener('change',loadReports);
if(reportToDate)reportToDate.addEventListener('change',loadReports);
