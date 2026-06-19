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
  catalogPromise:null,
  activeRequestController:null,
  lastTriggerCode:''
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
  if(reportCenterState.activeRequestController){
    reportCenterState.activeRequestController.abort();
    reportCenterState.activeRequestController=null;
    reportCenterState.requestSeq+=1;
  }
  setReportLoading(false,'Sẵn sàng tải báo cáo');
  modal.classList.remove('show');
  modal.hidden=true;
  modal.setAttribute('aria-hidden','true');
  if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open');
  if(options.restoreFocus!==false){
    const code=reportCenterState.lastTriggerCode;
    const trigger=code?document.querySelector(`[data-report-code="${code}"]`):null;
    trigger?.focus();
  }
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

function setReportPeriod(preset){
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
}

function setReportDefaults(){
  if(reportPeriodPreset && !reportPeriodPreset.value)reportPeriodPreset.value='month';
  if(reportFromDate && !reportFromDate.value)setReportPeriod(reportPeriodPreset?.value||'month');
  if(reportToDate && !reportToDate.value)setReportPeriod(reportPeriodPreset?.value||'month');
}

async function fetchJson(url,options={}){
  const res=await fetch(url,{headers:{Accept:'application/json'},signal:options.signal});
  let json={};
  try{json=await res.json();}catch(_error){json={};}
  if(!res.ok||!json.ok){
    const error=new Error(json.message||`Không tải được dữ liệu (${res.status})`);
    error.status=res.status;
    throw error;
  }
  return json;
}

function reportRequestWasAborted(error){
  return error?.name==='AbortError'||/aborted|aborterror/i.test(String(error?.message||''));
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

function reportDirectoryState(message,kind=''){
  const element=document.getElementById('reportDirectoryState');
  if(!element)return;
  element.textContent=message;
  element.classList.toggle('is-loading',kind==='loading');
  element.classList.toggle('is-error',kind==='error');
}

function markActiveReportCard(){
  document.querySelectorAll('[data-report-card]').forEach(card=>{
    card.classList.toggle('is-active',card.dataset.reportCard===reportCenterState.lastTriggerCode);
  });
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
    return `<section class="report-directory-group">
      <div class="report-directory-group-title">
        <div><strong>${reportEscape(category.title)}</strong><small>${reportEscape(category.description||'')}</small></div>
        <span>${reportFormatNumber(children.length)} báo cáo</span>
      </div>
      <div class="report-directory-grid">
        ${children.map(report=>`<article class="report-directory-item ${report.code===reportCenterState.lastTriggerCode?'is-active':''}" data-report-card="${reportEscape(report.code)}">
          <div class="report-directory-item-copy">
            <span class="report-category-badge">${reportEscape(category.title)}</span>
            <h4>${reportEscape(report.title)}</h4>
            <p>${reportEscape(report.description||'')}</p>
          </div>
          <button type="button" data-report-code="${reportEscape(report.code)}">Xem báo cáo</button>
        </article>`).join('')}
      </div>
    </section>`;
  }).join('');
  reportCatalog.innerHTML=html||'<div class="report-catalog-loading">Không tìm thấy mẫu báo cáo phù hợp.</div>';
  reportCatalog.querySelectorAll('[data-report-code]').forEach(button=>button.addEventListener('click',()=>openReport(button.dataset.reportCode,button)));
}

async function loadReportCatalog(options={}){
  const force=options===true||options?.force===true;
  if(reportCenterState.catalog&&!force){
    renderReportCatalog();
    reportDirectoryState(`Đã tải ${reportFormatNumber(reportCenterState.catalog.reports?.length||0)} báo cáo`);
    return reportCenterState.catalog;
  }
  if(reportCenterState.catalogPromise)return reportCenterState.catalogPromise;

  reportDirectoryState('Đang tải danh mục...','loading');
  setReportCatalogLoading(true);
  const request=(async()=>{
    try{
      const payload=await fetchJson('/api/reports/catalog');
      reportCenterState.catalog={categories:payload.categories||[],reports:payload.reports||[]};
      if(!reportDefinition(reportCenterState.activeCode))reportCenterState.activeCode=payload.reports?.[0]?.code||'';
      renderReportCatalog();
      reportDirectoryState(`Đã tải ${reportFormatNumber(reportCenterState.catalog.reports.length)} báo cáo`);
      return reportCenterState.catalog;
    }catch(error){
      reportDirectoryState(error.message||'Không tải được danh mục','error');
      if(reportCatalog)reportCatalog.innerHTML=`<div class="report-catalog-loading">${reportEscape(error.message||'Không tải được danh mục báo cáo.')}</div>`;
      throw error;
    }finally{
      setReportCatalogLoading(false);
      reportCenterState.catalogPromise=null;
    }
  })();
  reportCenterState.catalogPromise=request;
  return request;
}

function setReportCatalogLoading(loading){
  [applyReportCatalogFiltersButton,clearReportCatalogFiltersButton,reloadReportCatalogButton].filter(Boolean).forEach(button=>{
    button.disabled=loading;
    if(button===reloadReportCatalogButton)button.setAttribute('aria-busy',loading?'true':'false');
  });
  if(reportCatalogSearch)reportCatalogSearch.disabled=loading;
}

function applyReportCatalogFilters(){
  renderReportCatalog();
}

function clearReportCatalogFilters(){
  if(reportCatalogSearch)reportCatalogSearch.value='';
  renderReportCatalog();
  reportCatalogSearch?.focus();
}

function setReportLoading(loading,message=''){
  reportCenterState.loading=loading;
  if(reportLoadState){
    reportLoadState.textContent=message||(loading?'Đang tổng hợp dữ liệu...':'Đã cập nhật');
    reportLoadState.classList.toggle('is-loading',loading);
    reportLoadState.classList.toggle('is-error',!loading&&/lỗi|không/i.test(message));
  }

  [reportSearchInput,reportPeriodPreset,reportFromDate,reportToDate,reportPageSize].filter(Boolean).forEach(control=>{
    control.disabled=loading;
  });
  [applyReportFiltersButton,clearReportFiltersButton,reloadReportsButton].filter(Boolean).forEach(button=>{
    button.disabled=loading;
  });
  [applyReportFiltersButton,reloadReportsButton].filter(Boolean).forEach(button=>{
    button.setAttribute('aria-busy',loading?'true':'false');
  });

  const meta=reportCenterState.activePayload?.meta||{};
  if(reportPreviousPageButton)reportPreviousPageButton.disabled=loading||!reportCenterState.activePayload||(Number(meta.page||reportCenterState.page||1)<=1);
  if(reportNextPageButton)reportNextPageButton.disabled=loading||!reportCenterState.activePayload||!meta.hasMore;
  if(reportExportCurrentButton){
    const definition=reportCenterState.activeDefinition||reportDefinition(reportCenterState.activeCode);
    reportExportCurrentButton.disabled=loading||!definition?.code;
    reportExportCurrentButton.setAttribute('aria-busy',loading?'true':'false');
  }
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
function reportColumnAlignment(column={}){
  if(['money','number','percent'].includes(column.type))return 'number';
  if(['date','status','severity'].includes(column.type))return 'center';
  return 'text';
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
  if(reportTableHead)reportTableHead.innerHTML=`<tr>${columns.map(column=>`<th class="report-col--${reportColumnAlignment(column)}">${reportEscape(column.label)}</th>`).join('')}</tr>`;
  if(reportTableBody){
    reportTableBody.innerHTML=rows.length
      ? rows.map((row,rowIndex)=>`<tr data-report-row-index="${rowIndex}">${columns.map(column=>`<td class="report-col--${reportColumnAlignment(column)}">${renderReportCell(row[column.key],column)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${Math.max(columns.length,1)}" class="empty-cell">Không có dữ liệu phù hợp trong kỳ đã chọn.</td></tr>`;
  }
  const meta=payload.meta||{};
  if(Number(meta.page)>0)reportCenterState.page=Number(meta.page);
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
  markActiveReportCard();
}

async function loadOverview(){
  const definition={dateMode:'range'};
  const params=reportDateParams(definition);
  const payload=await fetchJson(`/api/reports/overview?${params.toString()}`);
  renderReportOverview(payload);
  return payload;
}

async function loadActiveReport(options={}){
  const definition=reportDefinition(reportCenterState.activeCode);
  if(!definition)return null;
  reportCenterState.activeDefinition=definition;

  const params=reportDateParams(definition);
  params.set('page',String(reportCenterState.page||1));
  params.set('limit',String(Number(reportPageSize?.value||50)));
  const search=String(reportSearchInput?.value||'').trim();
  if(search)params.set('q',search);

  if(reportCenterState.activeRequestController)reportCenterState.activeRequestController.abort();
  const controller=new AbortController();
  const requestSeq=++reportCenterState.requestSeq;
  const requestCode=definition.code;
  reportCenterState.activeRequestController=controller;
  setReportLoading(true,options.loadingMessage||'Đang tổng hợp báo cáo đã chọn...');

  try{
    const payload=await fetchJson(`/api/reports/run/${encodeURIComponent(requestCode)}?${params.toString()}`,{signal:controller.signal});
    if(controller.signal.aborted||requestSeq!==reportCenterState.requestSeq||requestCode!==reportCenterState.activeCode)return null;
    renderActiveReport(payload);
    setReportLoading(false,options.successMessage||`Đã cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`);
    return payload;
  }catch(error){
    if(reportRequestWasAborted(error)||requestSeq!==reportCenterState.requestSeq)return null;
    console.error('[REPORT_CENTER_LOAD_ERROR]',error);
    setReportLoading(false,error.message||'Không tải được báo cáo');
    if(reportTableBody)reportTableBody.innerHTML=`<tr><td class="empty-cell">${reportEscape(error.message||'Không tải được báo cáo')}</td></tr>`;
    return null;
  }finally{
    if(reportCenterState.activeRequestController===controller)reportCenterState.activeRequestController=null;
  }
}

async function loadReports(options={}){
  setReportDefaults();
  try{
    await loadReportCatalog(options.forceCatalog===true?{force:true}:{});
  }catch(error){
    if(reportModalIsOpen())setReportLoading(false,error.message||'Không tải được danh mục');
    return null;
  }

  // Khi người dùng chỉ mở tab Báo cáo, chỉ tải danh mục ngoài màn hình chính.
  if(!reportModalIsOpen()&&options.openModal!==true)return reportCenterState.catalog;
  if(options.openModal===true)openReportCenterModal({load:false});
  return loadActiveReport({
    loadingMessage:options.loadingMessage||'Đang tổng hợp báo cáo đã chọn...',
    successMessage:options.successMessage
  });
}

async function openReport(code,trigger=null){
  if(reportCenterState.loading&&reportCenterState.activeCode===code){
    openReportCenterModal({load:false});
    return null;
  }
  if(!reportCenterState.catalog){
    try{await loadReportCatalog();}catch(_error){return null;}
  }
  const definition=reportDefinition(code);
  if(!definition)return null;
  reportCenterState.lastTriggerCode=code;
  reportCenterState.activeCode=code;
  reportCenterState.activeDefinition=definition;
  reportCenterState.activePayload=null;
  reportCenterState.page=1;
  markActiveReportCard();
  if(reportActiveTitle)reportActiveTitle.textContent=definition.title||'Báo cáo';
  if(reportActiveCategory)reportActiveCategory.textContent=reportCategoryMap().get(definition.category)?.title||definition.category||'Báo cáo';
  if(reportSalesSummary)reportSalesSummary.textContent=definition.description||'';
  openReportCenterModal({load:false});
  if(trigger)trigger.disabled=true;
  try{
    return await loadActiveReport({loadingMessage:'Đang tải báo cáo đã chọn...',successMessage:'Đã tải báo cáo'});
  }finally{
    if(trigger)trigger.disabled=false;
  }
}

function applyReportFilters(){
  reportCenterState.page=1;
  return loadActiveReport({loadingMessage:'Đang áp dụng bộ lọc báo cáo...'});
}

function clearReportFilters(){
  if(reportSearchInput)reportSearchInput.value='';
  if(reportPeriodPreset)reportPeriodPreset.value='month';
  setReportPeriod('month');
  if(reportPageSize)reportPageSize.value='50';
  reportCenterState.page=1;
  return loadActiveReport({loadingMessage:'Đang tải dữ liệu mặc định...'});
}

function reloadCurrentReport(){
  return loadActiveReport({loadingMessage:'Đang tải lại báo cáo...'});
}

function goToReportPage(page){
  const nextPage=Math.max(1,Number(page||1));
  if(reportCenterState.loading||nextPage===reportCenterState.page)return Promise.resolve(null);
  reportCenterState.page=nextPage;
  return loadActiveReport({loadingMessage:`Đang tải trang ${nextPage}...`});
}

function initReportExportButtons(){
  document.querySelectorAll('.report-export-btn[data-report-type]').forEach(btn=>{
    if(btn.dataset.boundReportExport==='1')return;
    btn.dataset.boundReportExport='1';
    btn.addEventListener('click',()=>exportReportExcel(btn.dataset.reportType));
  });
}

function bindReportCenterEvents(){
  const closeButton=document.getElementById('closeReportCenterButton');
  const modal=reportModalElement();
  const reportTabButton=document.querySelector('.tab-button[data-tab="reportsTab"]');

  if(closeButton&&!closeButton.dataset.boundReportCenter){
    closeButton.dataset.boundReportCenter='1';
    closeButton.addEventListener('click',()=>closeReportCenterModal());
  }
  if(modal&&!modal.dataset.boundReportCenter){
    modal.dataset.boundReportCenter='1';
    modal.addEventListener('click',event=>{if(event.target===modal)closeReportCenterModal();});
  }
  if(reportTabButton&&!reportTabButton.dataset.boundReportDirectory){
    reportTabButton.dataset.boundReportDirectory='1';
    reportTabButton.addEventListener('click',()=>loadReportCatalog().catch(error=>console.warn('[REPORT_CATALOG_LOAD_ERROR]',error)));
  }
  if(reloadReportCatalogButton&&!reloadReportCatalogButton.dataset.boundReportDirectory){
    reloadReportCatalogButton.dataset.boundReportDirectory='1';
    reloadReportCatalogButton.addEventListener('click',()=>loadReportCatalog({force:true}).catch(error=>console.warn('[REPORT_CATALOG_RELOAD_ERROR]',error)));
  }
  if(applyReportCatalogFiltersButton&&!applyReportCatalogFiltersButton.dataset.boundReportDirectory){
    applyReportCatalogFiltersButton.dataset.boundReportDirectory='1';
    applyReportCatalogFiltersButton.addEventListener('click',applyReportCatalogFilters);
  }
  if(clearReportCatalogFiltersButton&&!clearReportCatalogFiltersButton.dataset.boundReportDirectory){
    clearReportCatalogFiltersButton.dataset.boundReportDirectory='1';
    clearReportCatalogFiltersButton.addEventListener('click',clearReportCatalogFilters);
  }
  if(reportCatalogSearch&&!reportCatalogSearch.dataset.boundReportCenter){
    reportCatalogSearch.dataset.boundReportCenter='1';
    reportCatalogSearch.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      applyReportCatalogFilters();
    });
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

  if(applyReportFiltersButton&&!applyReportFiltersButton.dataset.boundReportCenter){
    applyReportFiltersButton.dataset.boundReportCenter='1';
    applyReportFiltersButton.addEventListener('click',applyReportFilters);
  }
  if(clearReportFiltersButton&&!clearReportFiltersButton.dataset.boundReportCenter){
    clearReportFiltersButton.dataset.boundReportCenter='1';
    clearReportFiltersButton.addEventListener('click',clearReportFilters);
  }
  if(reloadReportsButton&&!reloadReportsButton.dataset.boundReportCenter){
    reloadReportsButton.dataset.boundReportCenter='1';
    reloadReportsButton.addEventListener('click',reloadCurrentReport);
  }
  if(reportPeriodPreset&&!reportPeriodPreset.dataset.boundReportCenter){
    reportPeriodPreset.dataset.boundReportCenter='1';
    reportPeriodPreset.addEventListener('change',()=>setReportPeriod(reportPeriodPreset.value));
  }
  [reportFromDate,reportToDate].filter(Boolean).forEach(input=>{
    if(input.dataset.boundReportCenter)return;
    input.dataset.boundReportCenter='1';
    input.addEventListener('change',()=>{
      if(reportPeriodPreset)reportPeriodPreset.value='custom';
    });
  });
  if(reportSearchInput&&!reportSearchInput.dataset.boundReportCenter){
    reportSearchInput.dataset.boundReportCenter='1';
    reportSearchInput.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      applyReportFilters();
    });
  }
  if(reportPreviousPageButton&&!reportPreviousPageButton.dataset.boundReportCenter){
    reportPreviousPageButton.dataset.boundReportCenter='1';
    reportPreviousPageButton.addEventListener('click',()=>goToReportPage(reportCenterState.page-1));
  }
  if(reportNextPageButton&&!reportNextPageButton.dataset.boundReportCenter){
    reportNextPageButton.dataset.boundReportCenter='1';
    reportNextPageButton.addEventListener('click',()=>goToReportPage(reportCenterState.page+1));
  }
  if(reportExportCurrentButton&&!reportExportCurrentButton.dataset.boundReportCenter){
    reportExportCurrentButton.dataset.boundReportCenter='1';
    reportExportCurrentButton.addEventListener('click',exportActiveReportExcel);
  }
  document.querySelectorAll('[data-report-open]').forEach(button=>{
    if(button.dataset.boundReportCenter)return;
    button.dataset.boundReportCenter='1';
    button.addEventListener('click',()=>openReport(button.dataset.reportOpen,button));
  });
}

function initReportCenter(){
  setReportDefaults();
  initReportExportButtons();
  bindReportCenterEvents();
  setReportCatalogLoading(false);
  setReportLoading(false,'Sẵn sàng tải báo cáo');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initReportCenter);
else initReportCenter();
