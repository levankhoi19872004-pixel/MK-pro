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
  lastTriggerCode:'',
  sortKey:'',
  sortDirection:'asc',
  visibleRows:[]
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
  const endpoint=String(url||'');
  const res=await fetch(endpoint,{headers:{Accept:'application/json'},signal:options.signal});
  let json={};
  try{json=await res.json();}catch(_error){json={};}
  if(!res.ok||!json.ok){
    const requestId=res.headers?.get?.('x-request-id')||json.requestId||json.traceId||'';
    const error=new Error(json.message||`Không tải được dữ liệu (${res.status})`);
    error.status=res.status;
    error.endpoint=endpoint;
    error.code=json.code||json.errorCode||'';
    error.requestId=requestId;
    throw error;
  }
  return json;
}

function reportErrorMessage(error, fallback='Không tải được dữ liệu. Vui lòng thử lại hoặc liên hệ quản trị.'){
  const status=Number(error?.status||0);
  if(status===401)return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if(status===403)return 'Bạn không có quyền xem dữ liệu báo cáo này.';
  if(status===404)return 'Không tìm thấy API báo cáo. Vui lòng liên hệ quản trị.';
  if(status>=500)return fallback;
  return error?.message||fallback;
}

function logReportFetchError(scope,error){
  console.warn(scope,{
    endpoint:error?.endpoint||'',
    status:error?.status||0,
    code:error?.code||'',
    requestId:error?.requestId||''
  });
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

async function exportReportCodeExcel(reportCode){
  const code=String(reportCode||'').trim();
  if(!code)return;
  setReportDefaults();
  const definition=reportDefinition(code)||{};
  const filters=collectReportDynamicFilters();
  const search=String(reportSearchInput?.value||'').trim();
  if(search)filters.q=search;
  if(definition.dateMode==='month')filters.month=String(reportFromDate?.value||reportToday()).slice(0,7);
  else if(definition.dateMode!=='none'){
    if(reportFromDate?.value)filters.dateFrom=reportFromDate.value;
    if(reportToDate?.value)filters.dateTo=reportToDate.value;
  }
  try{
    if(!window.ExcelInteraction||typeof window.ExcelInteraction.downloadWorkbook!=='function')throw new Error('Chức năng Excel chưa sẵn sàng');
    await window.ExcelInteraction.downloadWorkbook({type:'REPORT',scope:'FILTERED',reportCode:code,filters});
  }catch(error){alert(error.message||'Không xuất được báo cáo Excel');}
}

async function exportActiveReportExcel(){
  const definition=reportCenterState.activeDefinition||reportDefinition(reportCenterState.activeCode);
  if(!definition?.code)return;
  const filters=collectReportDynamicFilters();
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
      const message=reportErrorMessage(error,'Không tải được danh mục báo cáo. Vui lòng thử lại hoặc liên hệ quản trị.');
      logReportFetchError('[ReportCenter] loadCatalog failed',error);
      reportDirectoryState(message,'error');
      if(reportCatalog)reportCatalog.innerHTML=`<div class="report-catalog-loading">${reportEscape(message)}</div>`;
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


function reportIsDateLess(definition){
  return definition?.dateMode==='none';
}

function reportDateControlElements(){
  return [
    reportPeriodPreset?.closest?.('label') || null,
    reportFromDate?.closest?.('label') || null,
    reportToDate?.closest?.('label') || null
  ].filter(Boolean);
}

function syncReportDateControls(definition){
  const hide=reportIsDateLess(definition);
  reportDateControlElements().forEach(element=>{
    element.hidden=hide;
    element.setAttribute('aria-hidden',hide?'true':'false');
  });
}

function reportFilterDefinitions(definition){
  return Array.isArray(definition?.filters)?definition.filters:[];
}

function renderReportDynamicFilters(definition){
  if(!reportDynamicFilters)return;
  const filters=reportFilterDefinitions(definition);
  if(!filters.length){
    reportDynamicFilters.hidden=true;
    reportDynamicFilters.innerHTML='';
    return;
  }
  reportDynamicFilters.hidden=false;
  reportDynamicFilters.innerHTML=filters.map(filter=>{
    const key=reportEscape(filter.key||'');
    const label=reportEscape(filter.label||filter.key||'Bộ lọc');
    if(filter.type==='select'){
      const options=Array.isArray(filter.options)?filter.options:[];
      return `<label class="ui-toolbar-field report-dynamic-filter-field">${label}<select data-report-filter-key="${key}">${options.map(option=>{
        const value=Array.isArray(option)?option[0]:option;
        const textValue=Array.isArray(option)?option[1]:option;
        return `<option value="${reportEscape(value)}">${reportEscape(textValue)}</option>`;
      }).join('')}</select></label>`;
    }
    return `<label class="ui-toolbar-field report-dynamic-filter-field">${label}<input data-report-filter-key="${key}" placeholder="${reportEscape(filter.placeholder||label)}" autocomplete="off" /></label>`;
  }).join('');
  reportDynamicFilters.querySelectorAll('[data-report-filter-key]').forEach(input=>{
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      applyReportFilters();
    });
    input.addEventListener('change',()=>{
      reportCenterState.page=1;
    });
  });
}

function collectReportDynamicFilters(){
  const filters={};
  reportDynamicFilters?.querySelectorAll('[data-report-filter-key]').forEach(input=>{
    const key=String(input.dataset.reportFilterKey||'').trim();
    const value=String(input.value||'').trim();
    if(key&&value)filters[key]=value;
  });
  return filters;
}

function appendReportFilterParams(params, filters={}){
  Object.entries(filters).forEach(([key,value])=>{
    if(value!==undefined&&value!==null&&String(value).trim())params.set(key,String(value).trim());
  });
  return params;
}

function clearReportDynamicFilters(){
  reportDynamicFilters?.querySelectorAll('[data-report-filter-key]').forEach(input=>{input.value='';});
}

function syncReportFilterUi(definition){
  syncReportDateControls(definition);
  renderReportDynamicFilters(definition);
}

function isInformationReport(definition){
  return definition?.category==='information'||String(definition?.code||'').startsWith('info-');
}

function reportComparableValue(value,column={}){
  if(value===null||value===undefined)return '';
  if(['money','number','percent'].includes(column.type)){
    const number=Number(value);
    return Number.isFinite(number)?number:0;
  }
  if(column.type==='date'){
    const time=Date.parse(String(value).slice(0,10));
    return Number.isFinite(time)?time:0;
  }
  return String(value).toLocaleLowerCase('vi-VN');
}

function sortedReportRows(rows=[],columns=[]){
  const key=reportCenterState.sortKey;
  if(!key)return [...rows];
  const column=columns.find(item=>item.key===key)||{};
  const direction=reportCenterState.sortDirection==='desc'?-1:1;
  return [...rows].sort((a,b)=>{
    const left=reportComparableValue(a?.[key],column);
    const right=reportComparableValue(b?.[key],column);
    if(typeof left==='number'&&typeof right==='number')return (left-right)*direction;
    return String(left).localeCompare(String(right),'vi-VN',{numeric:true,sensitivity:'base'})*direction;
  });
}

function openReportRowDetail(rowIndex){
  const definition=reportCenterState.activeDefinition;
  if(!isInformationReport(definition))return;
  const row=reportCenterState.visibleRows?.[Number(rowIndex)];
  if(!row||!reportRowDetailDrawer||!reportRowDetailBody)return;
  const columns=definition?.columns||[];
  if(reportRowDetailTitle)reportRowDetailTitle.textContent=`Chi tiết ${definition?.title||'báo cáo'}`;
  reportRowDetailBody.innerHTML=columns.map(column=>`<div class="report-row-detail-item"><span>${reportEscape(column.label)}</span><strong>${renderReportCell(row[column.key],column)}</strong></div>`).join('');
  reportRowDetailDrawer.hidden=false;
  reportRowDetailDrawer.classList.add('show');
  closeReportRowDetailButton?.focus?.();
}

function closeReportRowDetail(){
  if(!reportRowDetailDrawer)return;
  reportRowDetailDrawer.classList.remove('show');
  reportRowDetailDrawer.hidden=true;
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
  reportDynamicFilters?.querySelectorAll('[data-report-filter-key]').forEach(control=>{
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


function sourceNoteJoin(value){
  if(Array.isArray(value))return value.filter(Boolean).join(', ');
  if(value&&typeof value==='object')return JSON.stringify(value);
  return String(value||'');
}

function renderReportSourceNote(sourceNote={}){
  if(!reportSalesSummary)return;
  let box=document.getElementById('reportSourceNote');
  if(!box){
    box=document.createElement('div');
    box.id='reportSourceNote';
    box.className='report-source-note';
    reportSalesSummary.insertAdjacentElement('afterend',box);
  }
  if(!sourceNote||!sourceNote.reportCode){
    box.innerHTML='';
    box.hidden=true;
    return;
  }
  const status=String(sourceNote.sourceStatus||'OK').toUpperCase();
  const service=[sourceNote.service,sourceNote.serviceMethod].filter(Boolean).join('.');
  const primary=sourceNoteJoin(sourceNote.primaryCollections)||'—';
  const warnings=[...(sourceNote.sourceWarnings||[]),...(sourceNote.dataQualityWarnings||[])].filter(Boolean);
  box.hidden=false;
  box.dataset.sourceStatus=status;
  box.innerHTML=`
    <div class="report-source-note__summary">
      <strong>Nguồn dữ liệu:</strong> ${reportEscape(primary)} · Service: ${reportEscape(service||'—')} · Xuất Excel: ${sourceNote.viewAndExportSameSource?'cùng nguồn':'khác nguồn'} · Trạng thái nguồn: <span class="report-source-note__status">${reportEscape(status)}</span>
    </div>
    <details>
      <summary>Chi tiết nguồn</summary>
      <dl class="report-source-note__grid">
        <dt>Mã báo cáo</dt><dd>${reportEscape(sourceNote.reportCode)}</dd>
        <dt>Service</dt><dd>${reportEscape(service||'—')}</dd>
        <dt>Endpoint xem</dt><dd>${reportEscape(sourceNote.runEndpoint||'')}</dd>
        <dt>Endpoint export</dt><dd>${reportEscape(sourceNote.exportEndpoint||'/api/excel/export')}</dd>
        <dt>Nguồn chính</dt><dd>${reportEscape(primary)}</dd>
        <dt>Nguồn phụ</dt><dd>${reportEscape(sourceNoteJoin(sourceNote.secondaryCollections)||'—')}</dd>
        <dt>Nguồn bị cấm</dt><dd>${reportEscape(sourceNoteJoin(sourceNote.forbiddenCollections)||'—')}</dd>
        <dt>Quy tắc SSoT</dt><dd>${reportEscape(sourceNote.ssotRule||sourceNote.sourceLabel||'')}</dd>
        <dt>Bộ lọc</dt><dd>${reportEscape(sourceNoteJoin(sourceNote.filters||{}))}</dd>
        <dt>Sinh lúc</dt><dd>${reportEscape(sourceNote.generatedAt||'')}</dd>
        <dt>Người chạy</dt><dd>${reportEscape(sourceNote.generatedBy||'')}</dd>
        <dt>Cảnh báo</dt><dd>${warnings.length?reportEscape(warnings.join(' | ')):'Không có'}</dd>
      </dl>
    </details>`;
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
  const rows=sortedReportRows(payload.rows||[],columns);
  reportCenterState.visibleRows=rows;
  const informationMode=isInformationReport(definition);
  if(reportTableHead){
    reportTableHead.innerHTML=`<tr>${columns.map(column=>{
      const active=reportCenterState.sortKey===column.key;
      const indicator=active?(reportCenterState.sortDirection==='desc'?' ▼':' ▲'):'';
      return `<th class="report-col--${reportColumnAlignment(column)}"><button type="button" class="report-sort-button" data-report-sort-key="${reportEscape(column.key)}" title="Sắp xếp theo ${reportEscape(column.label)}">${reportEscape(column.label)}<span class="report-sort-indicator">${indicator}</span></button></th>`;
    }).join('')}</tr>`;
  }
  if(reportTableBody){
    reportTableBody.innerHTML=rows.length
      ? rows.map((row,rowIndex)=>`<tr data-report-row-index="${rowIndex}" ${informationMode?'class="is-detail-row" tabindex="0" title="Nhấn để xem chi tiết"':''}>${columns.map(column=>`<td class="report-col--${reportColumnAlignment(column)}">${renderReportCell(row[column.key],column)}</td>`).join('')}</tr>`).join('')
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
  renderReportSourceNote(payload.sourceNote||{});
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
  appendReportFilterParams(params,collectReportDynamicFilters());

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
    const message=reportErrorMessage(error,'Không tải được báo cáo. Vui lòng thử lại hoặc liên hệ quản trị.');
    logReportFetchError('[ReportCenter] loadReport failed',error);
    setReportLoading(false,message);
    if(reportTableBody)reportTableBody.innerHTML=`<tr><td class="empty-cell">${reportEscape(message)}</td></tr>`;
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
    if(reportModalIsOpen())setReportLoading(false,reportErrorMessage(error,'Không tải được danh mục báo cáo. Vui lòng thử lại hoặc liên hệ quản trị.'));
    return null;
  }

  const definition=reportDefinition(reportCenterState.activeCode);
  if(definition)syncReportFilterUi(definition);

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
  reportCenterState.sortKey='';
  reportCenterState.sortDirection='asc';
  closeReportRowDetail();
  syncReportFilterUi(definition);
  markActiveReportCard();
  if(reportActiveTitle)reportActiveTitle.textContent=definition.title||'Báo cáo';
  if(reportActiveCategory)reportActiveCategory.textContent=reportCategoryMap().get(definition.category)?.title||definition.category||'Báo cáo';
  if(reportSalesSummary)reportSalesSummary.textContent=definition.description||'';
  renderReportSourceNote(null);
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
  const definition=reportCenterState.activeDefinition||reportDefinition(reportCenterState.activeCode);
  if(reportSearchInput)reportSearchInput.value='';
  clearReportDynamicFilters();
  if(!reportIsDateLess(definition)){
    if(reportPeriodPreset)reportPeriodPreset.value='month';
    setReportPeriod('month');
  }
  if(reportPageSize)reportPageSize.value='50';
  reportCenterState.page=1;
  reportCenterState.sortKey='';
  reportCenterState.sortDirection='asc';
  closeReportRowDetail();
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
  document.querySelectorAll('.report-export-btn[data-report-code]').forEach(btn=>{
    if(btn.dataset.boundReportExport==='1')return;
    btn.dataset.boundReportExport='1';
    btn.addEventListener('click',()=>exportReportCodeExcel(btn.dataset.reportCode));
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
  if(reportTableHead&&!reportTableHead.dataset.boundReportCenterSort){
    reportTableHead.dataset.boundReportCenterSort='1';
    reportTableHead.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-report-sort-key]');
      if(!button)return;
      const key=button.dataset.reportSortKey;
      if(reportCenterState.sortKey===key){
        reportCenterState.sortDirection=reportCenterState.sortDirection==='asc'?'desc':'asc';
      }else{
        reportCenterState.sortKey=key;
        reportCenterState.sortDirection='asc';
      }
      if(reportCenterState.activePayload)renderReportTable(reportCenterState.activePayload);
    });
  }
  if(reportTableBody&&!reportTableBody.dataset.boundReportCenterDetail){
    reportTableBody.dataset.boundReportCenterDetail='1';
    reportTableBody.addEventListener('click',event=>{
      const row=event.target.closest?.('[data-report-row-index]');
      if(row)openReportRowDetail(row.dataset.reportRowIndex);
    });
    reportTableBody.addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;
      const row=event.target.closest?.('[data-report-row-index]');
      if(!row)return;
      event.preventDefault();
      openReportRowDetail(row.dataset.reportRowIndex);
    });
  }
  if(closeReportRowDetailButton&&!closeReportRowDetailButton.dataset.boundReportCenterDetail){
    closeReportRowDetailButton.dataset.boundReportCenterDetail='1';
    closeReportRowDetailButton.addEventListener('click',closeReportRowDetail);
  }
  document.querySelectorAll('[data-report-open]').forEach(button=>{
    if(button.dataset.boundReportCenter)return;
    button.dataset.boundReportCenter='1';
    button.addEventListener('click',()=>openReport(button.dataset.reportOpen,button));
  });
}

function initReportCenter(){
  setReportDefaults();
  syncReportDateControls(reportCenterState.activeDefinition||{dateMode:'range'});
  initReportExportButtons();
  bindReportCenterEvents();
  setReportCatalogLoading(false);
  setReportLoading(false,'Sẵn sàng tải báo cáo');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initReportCenter);
else initReportCenter();
