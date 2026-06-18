'use strict';

let importShortageActionMode='';
let importPreviewSessionId='';
let importSelectedRowKeySet=new Set();
const IMPORT_PREVIEW_RENDER_LIMIT=Number(window.IMPORT_PREVIEW_RENDER_LIMIT||120);

const reportCenterState={
  catalog:null,
  activeCode:'sales-by-day',
  activeDefinition:null,
  activePayload:null,
  page:1,
  requestSeq:0,
  loading:false,
  searchTimer:null
};
window.__reportCenterState=reportCenterState;

function reportModalElement(){
  return document.getElementById('reportCenterModal');
}

function reportModalIsOpen(){
  const modal=reportModalElement();
  return Boolean(modal&&!modal.hidden&&modal.classList.contains('show'));
}

function openReportCenterModal(options={}){
  const modal=reportModalElement();
  if(!modal)return;
  modal.hidden=false;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  const closeButton=document.getElementById('closeReportCenterButton');
  setTimeout(()=>closeButton?.focus(),0);
  if(options.load===true&&!reportCenterState.activePayload&&!reportCenterState.loading){
    loadReports({openModal:false}).catch(error=>setReportLoading(false,error.message||'Không tải được báo cáo'));
  }
}

function closeReportCenterModal(options={}){
  const modal=reportModalElement();
  if(!modal)return;
  modal.classList.remove('show');
  modal.hidden=true;
  modal.setAttribute('aria-hidden','true');
  if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open');
  if(options.restoreFocus!==false)document.getElementById('openReportCenterButton')?.focus();
}

window.openReportCenterModal=openReportCenterModal;
window.closeReportCenterModal=closeReportCenterModal;

function reportDateInRange(dateText, fromDate, toDate){
  return isDateInRange(dateText, fromDate, toDate);
}

function orderSourceLabel(source, row){
  const order={...(row||{}), orderSource: source ?? row?.orderSource};
  const value=[order.orderSource,order.source,order.sourceType,order.orderSourceName,order.importSource,order.importType,order.origin,order.note].filter(Boolean).join(' ').toUpperCase();
  if(/(^|[^A-Z])DMS([^A-Z]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(value))return '<span class="badge source-dms">Từ DMS</span>';
  return '<span class="badge source-nvbh">Từ NVBH</span>';
}

function resolveImportPackingRate(row = {}){
  let rate=Number(
    row.conversionRate || row.sourcePackingRate || row.packingQty || row.unitsPerCase ||
    row.qtyPerCase || row.packSize || row.Qc || row.QC || 0
  );
  if(!(rate>1) && typeof inferPackingRateFromTextClient === 'function'){
    const inferred=Number(inferPackingRateFromTextClient(row));
    if(inferred>1)rate=inferred;
  }
  return Number.isFinite(rate)&&rate>0?rate:1;
}
function displayImportQtyTL(quantity, row = {}){
  const rate=resolveImportPackingRate(row);
  if(typeof formatCaseLooseStock === 'function') return formatCaseLooseStock(Number(quantity||0), rate);
  if(window.V45Common && typeof window.V45Common.calculateCartonUnit === 'function') return window.V45Common.calculateCartonUnit(Number(quantity||0), rate).display;
  return String(Number(quantity||0));
}
function displayImportAggregateQty(quantity){
  return `${reportFormatNumber(Number(quantity||0))} SU`;
}

function deliveryLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='failed')return 'Giao lỗi';
  if(status==='cancelled')return 'Đã hủy';
  return 'Chờ giao';
}

function reportEscape(value=''){
  const common=window.V45Common||{};
  return typeof common.escapeHtml==='function'
    ? common.escapeHtml(value)
    : String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function reportFormatNumber(value){
  const number=Number(value||0);
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(Number.isFinite(number)?number:0);
}
function reportFormatMoney(value){
  const number=Number(value||0);
  return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number.isFinite(number)?number:0);
}
function reportFormatDate(value){
  const raw=String(value||'').slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:raw;
}
function reportToday(){
  const common=window.V45Common||{};
  if(typeof common.todayValue==='function')return common.todayValue();
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function reportDateOffset(dateText, days){
  const date=new Date(`${dateText}T12:00:00+07:00`);
  date.setDate(date.getDate()+days);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function reportMonthRange(dateText, previous=false){
  const [year,month]=String(dateText).split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1-(previous?1:0),1,12));
  const start=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-01`;
  const endDate=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12));
  const end=`${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-${String(endDate.getUTCDate()).padStart(2,'0')}`;
  return {start,end};
}

function setReportPeriod(preset, shouldLoad=false){
  const todayValue=reportToday();
  let range={start:todayValue,end:todayValue};
  if(preset==='currentDay')range={start:todayValue,end:todayValue};
  if(preset==='7days')range={start:reportDateOffset(todayValue,-6),end:todayValue};
  if(preset==='month')range=reportMonthRange(todayValue,false);
  if(preset==='previousMonth')range=reportMonthRange(todayValue,true);
  if(preset!=='custom'){
    if(reportFromDate)reportFromDate.value=range.start;
    if(reportToDate)reportToDate.value=range.end;
  }
  if(shouldLoad)loadReports();
}

function setReportDefaults(){
  if(reportPeriodPreset && !reportPeriodPreset.value)reportPeriodPreset.value='month';
  if(reportFromDate && !reportFromDate.value)setReportPeriod(reportPeriodPreset?.value||'month',false);
  if(reportToDate && !reportToDate.value)setReportPeriod(reportPeriodPreset?.value||'month',false);
}

async function fetchJson(url){
  const res=await fetch(url,{headers:{Accept:'application/json'}});
  let json={};
  try{json=await res.json();}catch(_error){json={};}
  if(!res.ok||!json.ok){
    const error=new Error(json.message||`Không tải được dữ liệu (${res.status})`);
    error.status=res.status;
    throw error;
  }
  return json;
}

function reportDateParams(definition){
  const params=new URLSearchParams();
  if(definition?.dateMode==='month'){
    params.set('month',String(reportFromDate?.value||reportToday()).slice(0,7));
  }else if(definition?.dateMode!=='none'){
    if(reportFromDate?.value)params.set('dateFrom',reportFromDate.value);
    if(reportToDate?.value)params.set('dateTo',reportToDate.value);
  }
  return params;
}

function exportReportExcel(type){
  const cleanType=String(type||'').trim();
  if(!cleanType)return;
  setReportDefaults();
  const params=new URLSearchParams();
  const from=reportFromDate?.value||'';
  const to=reportToDate?.value||'';
  if(cleanType!=='stock-report'){
    if(from)params.set('dateFrom',from);
    if(to)params.set('dateTo',to);
  }
  params.set('limit','100000');
  window.location.href=`/api/export/${encodeURIComponent(cleanType)}.xlsx?${params.toString()}`;
}

async function exportActiveReportExcel(){
  const definition=reportCenterState.activeDefinition||reportDefinition(reportCenterState.activeCode);
  if(!definition?.code)return;
  const filters={};
  const search=String(reportSearchInput?.value||'').trim();
  if(search)filters.q=search;
  if(definition.dateMode==='month')filters.month=String(reportFromDate?.value||reportToday()).slice(0,7);
  else if(definition.dateMode!=='none'){
    if(reportFromDate?.value)filters.dateFrom=reportFromDate.value;
    if(reportToDate?.value)filters.dateTo=reportToDate.value;
  }
  try{
    if(!window.ExcelInteraction||typeof window.ExcelInteraction.downloadWorkbook!=='function')throw new Error('Chức năng Excel chưa sẵn sàng');
    await window.ExcelInteraction.downloadWorkbook({type:'REPORT',scope:'FILTERED',reportCode:definition.code,filters});
  }catch(error){alert(error.message||'Không xuất được báo cáo Excel');}
}

function reportCategoryMap(){
  return new Map((reportCenterState.catalog?.categories||[]).map(category=>[category.code,category]));
}
function reportDefinition(code){
  return (reportCenterState.catalog?.reports||[]).find(report=>report.code===code)||null;
}

function renderReportCatalog(){
  if(!reportCatalog)return;
  const search=String(reportCatalogSearch?.value||'').trim().toLowerCase();
  const categories=reportCenterState.catalog?.categories||[];
  const reports=reportCenterState.catalog?.reports||[];
  const html=categories.map(category=>{
    const children=reports.filter(report=>report.category===category.code).filter(report=>{
      if(!search)return true;
      return [report.title,report.description,category.title].some(value=>String(value||'').toLowerCase().includes(search));
    });
    if(!children.length)return '';
    return `<section class="report-catalog-group">
      <div class="report-catalog-group-title"><strong>${reportEscape(category.title)}</strong><small>${reportEscape(category.description||'')}</small></div>
      ${children.map(report=>`<button type="button" class="report-catalog-item ${report.code===reportCenterState.activeCode?'is-active':''}" data-report-code="${reportEscape(report.code)}">
        <span>${reportEscape(report.title)}</span><small>${reportEscape(report.description||'')}</small>
      </button>`).join('')}
    </section>`;
  }).join('');
  reportCatalog.innerHTML=html||'<div class="report-catalog-loading">Không tìm thấy mẫu báo cáo phù hợp.</div>';
  reportCatalog.querySelectorAll('[data-report-code]').forEach(button=>button.addEventListener('click',()=>openReport(button.dataset.reportCode)));
}

async function loadReportCatalog(){
  if(reportCenterState.catalog)return reportCenterState.catalog;
  const payload=await fetchJson('/api/reports/catalog');
  reportCenterState.catalog={categories:payload.categories||[],reports:payload.reports||[]};
  if(!reportDefinition(reportCenterState.activeCode))reportCenterState.activeCode=payload.reports?.[0]?.code||'';
  renderReportCatalog();
  return reportCenterState.catalog;
}

function setReportLoading(loading,message=''){
  reportCenterState.loading=loading;
  if(reportLoadState){
    reportLoadState.textContent=message||(loading?'Đang tổng hợp dữ liệu...':'Đã cập nhật');
    reportLoadState.classList.toggle('is-loading',loading);
    reportLoadState.classList.toggle('is-error',!loading&&/lỗi|không/i.test(message));
  }
  if(reloadReportsButton)reloadReportsButton.disabled=loading;
}

function renderReportOverview(payload){
  const values=new Map((payload.cards||[]).map(card=>[card.code,card]));
  const set=(element,code)=>{
    if(!element)return;
    const card=values.get(code);
    const cardElement=element.closest('.report-overview-card');
    if(cardElement)cardElement.hidden=!card;
    if(!card)return;
    element.textContent=card.type==='money'?reportFormatMoney(card.value):reportFormatNumber(card.value||0);
  };
  set(reportRevenue,'actualSales');
  set(reportNetSales,'netSales');
  set(reportCollected,'collected');
  set(reportDebt,'debt');
  set(reportCashBalance,'cash');
  set(reportStockProducts,'stock');
  set(reportDeliveredOrders,'delivery');
  set(reportReturnAmount,'returns');
  if(reportOrderCount)reportOrderCount.textContent=`Kỳ ${reportFormatDate(payload.dateFrom)} - ${reportFormatDate(payload.dateTo)}`;

  if(reportAlertStrip){
    const alerts=payload.alerts||[];
    reportAlertStrip.innerHTML=alerts.map(alert=>`<button type="button" class="report-alert is-${reportEscape(alert.severity||'ok')}" data-report-alert-open="${reportEscape(alert.reportCode||'data-quality')}">
      <span>${reportEscape(alert.label)}</span><strong>${reportFormatNumber(alert.value)}</strong>
    </button>`).join('')||'<span class="report-alert is-ok">Chưa phát hiện cảnh báo nghiêm trọng</span>';
    reportAlertStrip.querySelectorAll('[data-report-alert-open]').forEach(button=>button.addEventListener('click',()=>openReport(button.dataset.reportAlertOpen)));
  }
}

const REPORT_SUMMARY_LABELS={
  rowCount:'Số dòng',orderCount:'Số đơn',customerCount:'Khách hàng',productCount:'Sản phẩm',transactionCount:'Giao dịch',
  tripCount:'Số chuyến',returnCount:'Phiếu trả',rewardTransactionCount:'Lần trả thưởng',issueCount:'Ngoại lệ',criticalCount:'Critical',majorCount:'Major',warningCount:'Cảnh báo',
  targetAmount:'Chỉ tiêu',actualAmount:'Doanh số thực',beforePromoAmount:'Trước khuyến mại',netSalesAmount:'Doanh số ròng',totalRewardAmount:'Tổng trả thưởng',averageRewardPerCustomer:'Bình quân/khách',averageRewardPerTransaction:'Bình quân/lần',
  promotionValue:'Giá trị KM',promotionDiscountAmount:'Chiết khấu',receiptAmount:'Đã thu',returnAmount:'Hàng trả',
  totalReturnAmount:'Tổng hàng trả',debtAmount:'Công nợ',openingBalance:'Đầu kỳ',closingBalance:'Cuối kỳ',
  debitInPeriod:'Phát sinh nợ',receiptInPeriod:'Thu trong kỳ',returnInPeriod:'Trả trong kỳ',endingBalance:'Cuối kỳ',
  cashBalance:'Tiền mặt',bankBalance:'Ngân hàng',totalFundIn:'Tổng thu',totalFundOut:'Tổng chi',
  openingQty:'Tồn đầu',inQty:'Nhập',outQty:'Xuất',endingQty:'Tồn cuối',negativeStockCount:'Tồn âm',
  reconciliationMismatchCount:'Lệch tồn',collectedAmount:'Đã thu',totalAmount:'Tổng giá trị',affectedAmount:'Giá trị ảnh hưởng'
};
function summaryValueType(key){
  if(/amount|balance|sales|debt|fund|cash|bank|receipt|return|target|collected|totalvalue/i.test(key))return 'money';
  if(/rate|percent/i.test(key))return 'percent';
  return 'number';
}
function renderReportSummary(summary={}){
  if(!reportSummaryMetrics)return;
  const entries=Object.entries(summary).filter(([key,value])=>REPORT_SUMMARY_LABELS[key]!==undefined&&typeof value==='number').slice(0,12);
  reportSummaryMetrics.innerHTML=entries.map(([key,value])=>{
    const type=summaryValueType(key);
    const formatted=type==='money'?reportFormatMoney(value):(type==='percent'?`${reportFormatNumber(value)}%`:reportFormatNumber(value));
    return `<div class="report-summary-metric"><span>${reportEscape(REPORT_SUMMARY_LABELS[key])}</span><strong>${formatted}</strong></div>`;
  }).join('');
}

function statusLabel(value){
  const raw=String(value||'').trim();
  const normalized=raw.toLowerCase();
  const labels={
    accounting_confirmed:'Đã xác nhận KT',confirmed:'Đã xác nhận',pending:'Chờ xử lý',delivered:'Đã giao',
    assigned:'Đã phân công',cancelled:'Đã hủy',canceled:'Đã hủy',received:'Đã nhập kho',posted:'Đã ghi sổ',
    achieved:'Đạt chỉ tiêu',near_target:'Gần đạt',below_target:'Chưa đạt',no_target:'Chưa giao chỉ tiêu',
    khớp:'Khớp','lệch snapshot':'Lệch snapshot','thiếu đơn con':'Thiếu đơn con'
  };
  return labels[normalized]||raw||'—';
}
function renderReportCell(value,column){
  if(value===null||value===undefined||value==='')return '<span class="report-empty-value">—</span>';
  if(column.type==='money')return `<span class="report-number-cell">${reportFormatMoney(value)}</span>`;
  if(column.type==='number')return `<span class="report-number-cell">${reportFormatNumber(value)}</span>`;
  if(column.type==='percent')return `<span class="report-number-cell">${reportFormatNumber(value)}%</span>`;
  if(column.type==='date')return reportEscape(reportFormatDate(value));
  if(column.type==='status')return `<span class="report-status-badge">${reportEscape(statusLabel(value))}</span>`;
  if(column.type==='severity')return `<span class="report-severity is-${reportEscape(String(value).toLowerCase())}">${reportEscape(String(value).toUpperCase())}</span>`;
  return reportEscape(typeof value==='object'?JSON.stringify(value):value);
}

function renderReportTable(payload){
  const definition=payload.definition||reportCenterState.activeDefinition;
  const columns=definition?.columns||[];
  const rows=payload.rows||[];
  if(reportTableHead)reportTableHead.innerHTML=`<tr>${columns.map(column=>`<th>${reportEscape(column.label)}</th>`).join('')}</tr>`;
  if(reportTableBody){
    reportTableBody.innerHTML=rows.length
      ? rows.map((row,rowIndex)=>`<tr data-report-row-index="${rowIndex}">${columns.map(column=>`<td>${renderReportCell(row[column.key],column)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${Math.max(columns.length,1)}" class="empty-cell">Không có dữ liệu phù hợp trong kỳ đã chọn.</td></tr>`;
  }
  const meta=payload.meta||{};
  if(reportTableStatus)reportTableStatus.textContent=`Hiển thị ${rows.length}/${reportFormatNumber(meta.total||0)} dòng · Nguồn ${payload.source||'domain report'}`;
  if(reportPageInfo)reportPageInfo.textContent=`Trang ${meta.page||0}/${meta.totalPages||0}`;
  if(reportPreviousPageButton)reportPreviousPageButton.disabled=(meta.page||1)<=1;
  if(reportNextPageButton)reportNextPageButton.disabled=!meta.hasMore;
}

function renderReportChart(payload){
  const chart=payload.definition?.chart;
  const rows=(payload.rows||[]).slice(0,10);
  if(!reportChartPanel||!reportChart)return;
  if(!chart||!rows.length){
    reportChartPanel.hidden=true;
    reportChart.innerHTML='';
    return;
  }
  const ranked=[...rows].sort((a,b)=>Math.abs(Number(b[chart.valueKey]||0))-Math.abs(Number(a[chart.valueKey]||0))).slice(0,8);
  const max=Math.max(...ranked.map(row=>Math.abs(Number(row[chart.valueKey]||0))),1);
  reportChartPanel.hidden=false;
  if(reportChartCaption)reportChartCaption.textContent=`Top ${ranked.length} theo ${payload.definition.columns.find(column=>column.key===chart.valueKey)?.label||chart.valueKey}`;
  reportChart.innerHTML=ranked.map(row=>{
    const value=Number(row[chart.valueKey]||0);
    const display=chart.valueType==='money'?reportFormatMoney(value):reportFormatNumber(value);
    const width=Math.max(2,Math.round(Math.abs(value)/max*100));
    return `<div class="report-bar-row"><span title="${reportEscape(row[chart.labelKey]||'')}">${reportEscape(row[chart.labelKey]||'Không xác định')}</span><div class="report-bar-track"><i style="width:${width}%"></i></div><strong>${display}</strong></div>`;
  }).join('');
}

function renderActiveReport(payload){
  reportCenterState.activePayload=payload;
  reportCenterState.activeDefinition=payload.definition||reportDefinition(reportCenterState.activeCode);
  const definition=reportCenterState.activeDefinition;
  const categories=reportCategoryMap();
  if(reportActiveTitle)reportActiveTitle.textContent=definition?.title||'Báo cáo';
  if(reportActiveCategory)reportActiveCategory.textContent=categories.get(definition?.category)?.title||definition?.category||'Báo cáo';
  if(reportSalesSummary)reportSalesSummary.textContent=`${definition?.description||''}${payload.dateFrom&&payload.dateTo?` · Kỳ ${reportFormatDate(payload.dateFrom)} - ${reportFormatDate(payload.dateTo)}`:''}`;
  if(reportExportCurrentButton){
    reportExportCurrentButton.disabled=!definition?.code;
    reportExportCurrentButton.title=definition?.code?'Xuất toàn bộ báo cáo theo bộ lọc hiện tại':'Chưa chọn báo cáo';
  }
  renderReportSummary(payload.summary||{});
  renderReportTable(payload);
  renderReportChart(payload);
  renderReportCatalog();
}

async function loadOverview(){
  const definition={dateMode:'range'};
  const params=reportDateParams(definition);
  const payload=await fetchJson(`/api/reports/overview?${params.toString()}`);
  renderReportOverview(payload);
  return payload;
}

async function loadActiveReport(){
  const definition=reportDefinition(reportCenterState.activeCode);
  if(!definition)return null;
  reportCenterState.activeDefinition=definition;
  const params=reportDateParams(definition);
  params.set('page',String(reportCenterState.page||1));
  params.set('limit',String(Number(reportPageSize?.value||50)));
  const search=String(reportSearchInput?.value||'').trim();
  if(search)params.set('q',search);
  const payload=await fetchJson(`/api/reports/run/${encodeURIComponent(definition.code)}?${params.toString()}`);
  renderActiveReport(payload);
  return payload;
}

async function loadReports(options={}){
  if(reportCenterState.loading)return null;
  if(options.openModal!==false)openReportCenterModal({load:false});
  setReportDefaults();
  const requestSeq=++reportCenterState.requestSeq;
  setReportLoading(true,'Đang tổng hợp dữ liệu báo cáo...');
  try{
    await loadReportCatalog();
    const tasks=[loadOverview(),loadActiveReport()];
    const results=await Promise.allSettled(tasks);
    if(requestSeq!==reportCenterState.requestSeq)return;
    const failures=results.filter(result=>result.status==='rejected');
    if(failures.length===results.length)throw failures[0].reason;
    if(failures.length){
      console.warn('[REPORT_CENTER_PARTIAL_FAILURE]',failures.map(result=>result.reason));
      setReportLoading(false,'Một phần báo cáo chưa tải được');
    }else{
      setReportLoading(false,`Đã cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`);
    }
  }catch(error){
    console.error('[REPORT_CENTER_LOAD_ERROR]',error);
    setReportLoading(false,error.message||'Không tải được báo cáo');
    if(reportTableBody)reportTableBody.innerHTML=`<tr><td class="empty-cell">${reportEscape(error.message||'Không tải được báo cáo')}</td></tr>`;
  }
}

async function openReport(code){
  if(!reportDefinition(code))return;
  openReportCenterModal({load:false});
  reportCenterState.activeCode=code;
  reportCenterState.page=1;
  renderReportCatalog();
  setReportLoading(true,'Đang tải báo cáo đã chọn...');
  try{
    await loadActiveReport();
    setReportLoading(false,'Đã tải báo cáo');
  }catch(error){
    setReportLoading(false,error.message||'Không tải được báo cáo');
  }
}

function initReportExportButtons(){
  document.querySelectorAll('.report-export-btn[data-report-type]').forEach(btn=>{
    if(btn.dataset.boundReportExport==='1')return;
    btn.dataset.boundReportExport='1';
    btn.addEventListener('click',()=>exportReportExcel(btn.dataset.reportType));
  });
}

function bindReportCenterEvents(){
  const openButton=document.getElementById('openReportCenterButton');
  const closeButton=document.getElementById('closeReportCenterButton');
  const modal=reportModalElement();
  const reportTabButton=document.querySelector('.tab-button[data-tab="reportsTab"]');

  if(openButton&&!openButton.dataset.boundReportCenter){
    openButton.dataset.boundReportCenter='1';
    openButton.addEventListener('click',()=>openReportCenterModal({load:true}));
  }
  if(closeButton&&!closeButton.dataset.boundReportCenter){
    closeButton.dataset.boundReportCenter='1';
    closeButton.addEventListener('click',()=>closeReportCenterModal());
  }
  if(modal&&!modal.dataset.boundReportCenter){
    modal.dataset.boundReportCenter='1';
    modal.addEventListener('click',event=>{if(event.target===modal)closeReportCenterModal();});
  }
  if(reportTabButton&&!reportTabButton.dataset.boundReportPopup){
    reportTabButton.dataset.boundReportPopup='1';
    reportTabButton.addEventListener('click',()=>openReportCenterModal({load:true}));
  }
  document.querySelectorAll('.tab-button:not([data-tab="reportsTab"])').forEach(button=>{
    if(button.dataset.boundReportPopupClose)return;
    button.dataset.boundReportPopupClose='1';
    button.addEventListener('click',()=>{if(reportModalIsOpen())closeReportCenterModal({restoreFocus:false});});
  });
  if(!document.documentElement.dataset.boundReportPopupEscape){
    document.documentElement.dataset.boundReportPopupEscape='1';
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&reportModalIsOpen())closeReportCenterModal();
    });
  }

  if(reloadReportsButton&&!reloadReportsButton.dataset.boundReportCenter){
    reloadReportsButton.dataset.boundReportCenter='1';
    reloadReportsButton.addEventListener('click',()=>{reportCenterState.page=1;loadReports();});
  }
  if(reportPeriodPreset&&!reportPeriodPreset.dataset.boundReportCenter){
    reportPeriodPreset.dataset.boundReportCenter='1';
    reportPeriodPreset.addEventListener('change',()=>setReportPeriod(reportPeriodPreset.value,true));
  }
  [reportFromDate,reportToDate].filter(Boolean).forEach(input=>{
    if(input.dataset.boundReportCenter)return;
    input.dataset.boundReportCenter='1';
    input.addEventListener('change',()=>{
      if(reportPeriodPreset)reportPeriodPreset.value='custom';
      reportCenterState.page=1;
    });
  });
  if(reportSearchInput&&!reportSearchInput.dataset.boundReportCenter){
    reportSearchInput.dataset.boundReportCenter='1';
    reportSearchInput.addEventListener('input',()=>{
      clearTimeout(reportCenterState.searchTimer);
      reportCenterState.searchTimer=setTimeout(()=>{reportCenterState.page=1;loadActiveReport().catch(error=>setReportLoading(false,error.message));},350);
    });
  }
  if(reportCatalogSearch&&!reportCatalogSearch.dataset.boundReportCenter){
    reportCatalogSearch.dataset.boundReportCenter='1';
    reportCatalogSearch.addEventListener('input',renderReportCatalog);
  }
  if(reportPageSize&&!reportPageSize.dataset.boundReportCenter){
    reportPageSize.dataset.boundReportCenter='1';
    reportPageSize.addEventListener('change',()=>{reportCenterState.page=1;loadActiveReport().catch(error=>setReportLoading(false,error.message));});
  }
  if(reportPreviousPageButton&&!reportPreviousPageButton.dataset.boundReportCenter){
    reportPreviousPageButton.dataset.boundReportCenter='1';
    reportPreviousPageButton.addEventListener('click',()=>{if(reportCenterState.page>1){reportCenterState.page-=1;loadActiveReport();}});
  }
  if(reportNextPageButton&&!reportNextPageButton.dataset.boundReportCenter){
    reportNextPageButton.dataset.boundReportCenter='1';
    reportNextPageButton.addEventListener('click',()=>{reportCenterState.page+=1;loadActiveReport();});
  }
  if(reportClearSearchButton&&!reportClearSearchButton.dataset.boundReportCenter){
    reportClearSearchButton.dataset.boundReportCenter='1';
    reportClearSearchButton.addEventListener('click',()=>{
      if(reportSearchInput)reportSearchInput.value='';
      reportCenterState.page=1;
      loadActiveReport();
    });
  }
  if(reportExportCurrentButton&&!reportExportCurrentButton.dataset.boundReportCenter){
    reportExportCurrentButton.dataset.boundReportCenter='1';
    reportExportCurrentButton.addEventListener('click',exportActiveReportExcel);
  }
  document.querySelectorAll('[data-report-open]').forEach(button=>{
    if(button.dataset.boundReportCenter)return;
    button.dataset.boundReportCenter='1';
    button.addEventListener('click',()=>openReport(button.dataset.reportOpen));
  });
}

function initReportCenter(){
  setReportDefaults();
  initReportExportButtons();
  bindReportCenterEvents();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initReportCenter);
else initReportCenter();
