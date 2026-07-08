'use strict';

// VAT/không VAT dùng bộ lọc ngày + NVBH/khách hàng; SSE dùng ngày + NVGH đã gán trên đơn tổng.
(function initInvoiceExports(){
  const vatButton=document.getElementById('exportVatInvoiceTT78Button');
  const nonVatButton=document.getElementById('exportVatNonInvoiceOrdersButton');
  const sseButton=document.getElementById('exportSseInvoiceButton');
  const sseErrorButton=document.getElementById('downloadSseErrorReportButton');
  const fromInput=document.getElementById('invoiceExportFromDate');
  const toInput=document.getElementById('invoiceExportToDate');
  const salesStaffSelect=document.getElementById('invoiceExportSalesStaffCode');
  const deliveryStaffSelect=document.getElementById('invoiceExportDeliveryStaffCode');
  const customerInput=document.getElementById('invoiceExportCustomerSearch');
  const customerCodeInput=document.getElementById('invoiceExportCustomerCode');
  const customerClearButton=document.getElementById('clearInvoiceExportCustomerButton');
  const customerSuggestions=document.getElementById('invoiceExportCustomerSuggestions');
  const clearFiltersButton=document.getElementById('clearInvoiceExportFiltersButton');
  const summary=document.getElementById('vatInvoiceExportSummary');
  const exportButtons=[vatButton,nonVatButton,sseButton,sseErrorButton].filter(Boolean);
  const controls=[fromInput,toInput,salesStaffSelect,deliveryStaffSelect,customerInput,customerClearButton,clearFiltersButton].filter(Boolean);
  let exportInFlight=false;
  let sseErrorReportUrl='';
  let selectedCustomer=null;
  let customerSearchTimer=null;

  if(!exportButtons.length)return;

  function setSummary(message,isError=false){
    if(!summary)return;
    summary.textContent=message;
    summary.classList.toggle('error',Boolean(isError));
  }

  function setBusy(active,activeButton){
    exportInFlight=active;
    exportButtons.forEach(button=>{
      button.disabled=active;
      button.setAttribute('aria-busy',active?'true':'false');
      const idleLabel=button.dataset.idleLabel||button.textContent;
      button.dataset.idleLabel=idleLabel;
      button.textContent=active&&button===activeButton?'Đang tạo file...':idleLabel;
    });
    controls.forEach(control=>{ control.disabled=active; });
  }

  function initializeDateDefaults(){
    if(typeof setReportDefaults==='function')setReportDefaults();
    if(fromInput&&!fromInput.value)fromInput.value=document.getElementById('reportFromDate')?.value||'';
    if(toInput&&!toInput.value)toInput.value=document.getElementById('reportToDate')?.value||'';
  }

  function currentCustomerCode(){
    return String(customerCodeInput?.value||selectedCustomer?.code||selectedCustomer?.customerCode||'').trim();
  }

  function selectedDeliveryStaffCode(){
    if(!deliveryStaffSelect)return '';
    const value=String(deliveryStaffSelect.value||'').trim();
    if(value)return value;
    const option=deliveryStaffSelect.selectedOptions&&deliveryStaffSelect.selectedOptions[0];
    const optionValue=String(option?.value||option?.dataset?.code||'').trim();
    if(optionValue)return optionValue;
    const label=String(option?.textContent||'').trim();
    if(!label||/^Tất cả/i.test(label))return '';
    return String(label.split('-')[0]||'').trim();
  }

  function validateFilters(){
    const from=fromInput?.value||'';
    const to=toInput?.value||'';
    if(from&&to&&from>to)throw new Error('Từ ngày không được lớn hơn Đến ngày');
    const typedCustomer=String(customerInput?.value||'').trim();
    const customerCode=currentCustomerCode();
    if(typedCustomer&&!customerCode)throw new Error('Vui lòng chọn khách hàng từ danh sách gợi ý hoặc bấm x để bỏ chọn.');
    return {from,to,salesStaffCode:salesStaffSelect?.value||'',deliveryStaffCode:selectedDeliveryStaffCode(),customerCode};
  }

  function exportParams(invoiceType,options={}){
    const filters=validateFilters();
    const params=new URLSearchParams({invoiceType,limit:'20000'});
    if(filters.from)params.set('dateFrom',filters.from);
    if(filters.to)params.set('dateTo',filters.to);
    if(options.deliveryStaffExport){
      params.set('summaryBy','deliveryStaff');
      if(filters.deliveryStaffCode)params.set('deliveryStaffCode',filters.deliveryStaffCode);
    }else{
      if(filters.salesStaffCode)params.set('salesStaffCode',filters.salesStaffCode);
      if(filters.customerCode)params.set('customerCode',filters.customerCode);
    }
    return params;
  }

  function responseFileName(response,fallback){
    const disposition=String(response.headers.get('content-disposition')||'');
    const utf8Match=disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch=disposition.match(/filename="?([^";]+)"?/i);
    const raw=utf8Match?.[1]||plainMatch?.[1]||fallback;
    try{return decodeURIComponent(raw);}catch(_error){return raw;}
  }

  async function responseError(response){
    const type=String(response.headers.get('content-type')||'');
    if(type.includes('application/json')){
      const payload=await response.json().catch(()=>({}));
      const error=new Error(payload.message||payload.error||`Không xuất được file (${response.status})`);
      error.payload=payload;
      return error;
    }
    return new Error(`Không xuất được file (${response.status})`);
  }

  function saveBlob(blob,fileName){
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function successSummary(response,fileName){
    const orderCount=Number(response.headers.get('x-export-order-count')||0);
    const rowCount=Number(response.headers.get('x-export-row-count')||0);
    const warningCount=Number(response.headers.get('x-export-warning-count')||0);
    const counts=orderCount||rowCount?` — ${orderCount.toLocaleString('vi-VN')} đơn, ${rowCount.toLocaleString('vi-VN')} dòng sản phẩm`:'';
    const warning=warningCount?` — ${warningCount.toLocaleString('vi-VN')} cảnh báo trả vượt`:'';
    return `Đã tải ${fileName}${counts}${warning}`;
  }

  async function waitForExportJob(jobId){
    const deadline=Date.now()+Number(window.EXPORT_JOB_UI_TIMEOUT_MS||10*60*1000);
    while(Date.now()<deadline){
      const response=await fetch(`/api/background-jobs/${encodeURIComponent(jobId)}`);
      if(!response.ok)throw await responseError(response);
      const payload=await response.json();
      const job=payload.job||{};
      const percent=Math.max(0,Math.min(100,Number(job.progress?.percent||0)));
      setSummary(`Đang tạo file... ${percent}%${job.progress?.step?` · ${job.progress.step}`:''}`);
      if(job.status==='completed')return job;
      if(['failed','dead_letter','cancelled'].includes(job.status)){
        const error=new Error(job.error?.message||'Worker không tạo được file');
        error.payload=job.error?.details||{};
        throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,600));
    }
    throw new Error('Tác vụ tạo file quá thời gian chờ. Có thể kiểm tra lại trạng thái job sau.');
  }

  async function download(url,button,label,fallback){
    if(exportInFlight)return false;
    setBusy(true,button);
    setSummary(`Đang tạo ${label}...`);
    try{
      const response=await fetch(url,{
        method:'GET',
        headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json'}
      });
      if(!response.ok)throw await responseError(response);
      const contentType=String(response.headers.get('content-type')||'');

      if(contentType.includes('application/json')){
        const queued=await response.json();
        if(!queued.jobId)throw new Error('Máy chủ không trả về file Excel hoặc mã tác vụ export');
        const job=await waitForExportJob(queued.jobId);
        const artifactResponse=await fetch(job.artifact?.downloadUrl||`/api/background-jobs/${encodeURIComponent(queued.jobId)}/artifact`,{
          headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
        });
        if(!artifactResponse.ok)throw await responseError(artifactResponse);
        const artifactContentType=String(artifactResponse.headers.get('content-type')||'');
        if(!artifactContentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('Máy chủ không trả về file Excel hợp lệ');
        const artifactRowCountHeader=artifactResponse.headers.get('x-export-row-count');
        if(artifactRowCountHeader!==null&&artifactRowCountHeader!==''&&Number(artifactRowCountHeader)===0)throw new Error('Không có dữ liệu phù hợp với bộ lọc đã chọn. File trống đã được chặn tải xuống.');
        const artifactFileName=responseFileName(artifactResponse,job.artifact?.fileName||fallback);
        saveBlob(await artifactResponse.blob(),artifactFileName);
        setSummary(successSummary(artifactResponse,artifactFileName));
        return true;
      }

      if(!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('Máy chủ không trả về file Excel hợp lệ');
      const rowCountHeader=response.headers.get('x-export-row-count');
      if(rowCountHeader!==null&&rowCountHeader!==''&&Number(rowCountHeader)===0)throw new Error('Không có dữ liệu phù hợp với bộ lọc đã chọn. File trống đã được chặn tải xuống.');
      const fileName=responseFileName(response,fallback);
      saveBlob(await response.blob(),fileName);
      setSummary(successSummary(response,fileName));
      return true;
    }catch(error){
      console.error('[INVOICE_EXPORT_ERROR]',error);
      const payload=error.payload||{};
      sseErrorReportUrl=payload.errorReportUrl||'';
      if(sseErrorButton)sseErrorButton.hidden=!sseErrorReportUrl;
      setSummary(error.message||`Không xuất được ${label}`,true);
      return false;
    }finally{
      setBusy(false,button);
    }
  }

  function downloadInvoiceExport(invoiceType,button){
    let params;
    try{params=exportParams(invoiceType);}catch(error){setSummary(error.message,true);return Promise.resolve(false);}
    const label=invoiceType==='VAT'?'hóa đơn VAT':'hóa đơn không VAT';
    const fallback=invoiceType==='VAT'?'Hoa_don_VAT.xlsx':'Hoa_don_khong_VAT.xlsx';
    return download(`/api/export/invoice-orders.xlsx?${params.toString()}`,button,label,fallback);
  }

  function downloadSseExport(){
    let params;
    try{params=exportParams('ALL',{deliveryStaffExport:true});}catch(error){setSummary(error.message,true);return Promise.resolve(false);}
    const scopedDeliveryStaffCode=params.get('deliveryStaffCode')||'';
    sseErrorReportUrl='';
    if(sseErrorButton)sseErrorButton.hidden=true;
    if(scopedDeliveryStaffCode)setSummary(`Đang tạo Excel SSE cho NVGH ${scopedDeliveryStaffCode}...`);
    return download(`/api/export/sse-invoice-orders.xlsx?${params.toString()}`,sseButton,scopedDeliveryStaffCode?`Excel SSE NVGH ${scopedDeliveryStaffCode}`:'Excel SSE tất cả đơn',scopedDeliveryStaffCode?`SSE_Hoa_don_tat_ca_NVGH_${scopedDeliveryStaffCode}.xlsx`:'SSE_Hoa_don_tat_ca.xlsx');
  }

  function downloadSseErrors(){
    if(!sseErrorReportUrl)return Promise.resolve(false);
    return download(sseErrorReportUrl,sseErrorButton,'báo cáo lỗi/cảnh báo SSE','SSE_Loi_mapping.xlsx');
  }

  function clearCustomerSelection(options={}){
    selectedCustomer=null;
    if(customerCodeInput)customerCodeInput.value='';
    if(customerInput)customerInput.value='';
    if(customerClearButton)customerClearButton.hidden=true;
    hideCustomerSuggestions();
    if(!options.silent)setSummary('Đã bỏ lọc khách hàng.');
  }

  function clearFilters(){
    if(fromInput)fromInput.value='';
    if(toInput)toInput.value='';
    if(salesStaffSelect)salesStaffSelect.value='';
    if(deliveryStaffSelect)deliveryStaffSelect.value='';
    clearCustomerSelection({silent:true});
    sseErrorReportUrl='';
    if(sseErrorButton)sseErrorButton.hidden=true;
    setSummary('Đã xóa bộ lọc xuất hóa đơn.');
  }


  function customerCodeOf(item={}){
    return String(item.customerCode||item.code||item.customerId||item.id||'').trim();
  }

  function customerNameOf(item={}){
    return String(item.customerName||item.name||item.fullName||'').trim();
  }

  function customerLabel(item={}){
    return [customerCodeOf(item),customerNameOf(item),item.phone||item.mobile||item.customerPhone].filter(Boolean).join(' - ');
  }

  function hideCustomerSuggestions(){
    if(!customerSuggestions)return;
    customerSuggestions.hidden=true;
    customerSuggestions.innerHTML='';
  }

  function selectCustomer(item={}){
    const code=customerCodeOf(item);
    if(!code)return;
    const name=customerNameOf(item);
    selectedCustomer={code,customerCode:code,name,customerName:name};
    if(customerCodeInput)customerCodeInput.value=code;
    if(customerInput)customerInput.value=customerLabel(item)||code;
    if(customerClearButton)customerClearButton.hidden=false;
    hideCustomerSuggestions();
    setSummary(`Đã chọn khách hàng ${[code,name].filter(Boolean).join(' - ')}.`);
  }

  function renderCustomerSuggestions(rows=[]){
    if(!customerSuggestions)return;
    customerSuggestions.innerHTML='';
    const valid=(rows||[]).filter(item=>customerCodeOf(item)).slice(0,20);
    if(!valid.length){
      customerSuggestions.hidden=true;
      return;
    }
    valid.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='invoice-export-customer-option';
      button.setAttribute('role','option');
      const title=document.createElement('strong');
      title.textContent=[customerCodeOf(item),customerNameOf(item)].filter(Boolean).join(' - ');
      const sub=document.createElement('span');
      sub.textContent=[item.address||item.customerAddress||'',item.phone||item.mobile||item.customerPhone||''].filter(Boolean).join(' · ');
      button.appendChild(title);
      if(sub.textContent)button.appendChild(sub);
      button.addEventListener('click',()=>selectCustomer(item));
      customerSuggestions.appendChild(button);
    });
    customerSuggestions.hidden=false;
  }

  async function searchCustomersForInvoice(keyword){
    const q=String(keyword||'').trim();
    if(q.length<2)return [];
    if(window.UnifiedSearchEngine?.searchCustomer){
      return window.UnifiedSearchEngine.searchCustomer(q,{limit:20,minChars:2,allowEmpty:'',showOnFocus:''});
    }
    if(window.CatalogCache?.searchCustomers){
      return window.CatalogCache.searchCustomers(q,{limit:20});
    }
    const response=await fetch(`/api/search/customers?q=${encodeURIComponent(q)}&limit=20&activeOnly=1`,{headers:{Accept:'application/json'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false)throw new Error(payload.message||'Không tìm được khách hàng');
    return payload.customers||payload.items||payload.data||[];
  }

  function scheduleCustomerSearch(){
    if(!customerInput)return;
    const q=String(customerInput.value||'').trim();
    selectedCustomer=null;
    if(customerCodeInput)customerCodeInput.value='';
    if(customerClearButton)customerClearButton.hidden=!q;
    if(customerSearchTimer)clearTimeout(customerSearchTimer);
    if(q.length<2){hideCustomerSuggestions();return;}
    customerSearchTimer=setTimeout(async()=>{
      try{renderCustomerSuggestions(await searchCustomersForInvoice(q));}
      catch(error){console.warn('[INVOICE_EXPORT_CUSTOMER_SEARCH]',error);hideCustomerSuggestions();}
    },180);
  }

  function bindCustomerAutocomplete(){
    if(!customerInput)return;
    customerInput.addEventListener('input',scheduleCustomerSearch);
    customerInput.addEventListener('focus',()=>{
      if(String(customerInput.value||'').trim().length>=2)scheduleCustomerSearch();
    });
    customerInput.addEventListener('keydown',(event)=>{
      if(event.key==='Escape')hideCustomerSuggestions();
    });
    if(customerClearButton){
      customerClearButton.addEventListener('click',()=>clearCustomerSelection());
    }
    document.addEventListener('click',(event)=>{
      if(!customerSuggestions||customerSuggestions.hidden)return;
      const target=event.target;
      if(target===customerInput||target===customerSuggestions||customerSuggestions.contains?.(target))return;
      hideCustomerSuggestions();
    });
  }

  async function loadSalesStaffOptions(){
    if(!salesStaffSelect||!window.UnifiedSearchEngine?.searchSalesStaff)return;
    const selected=salesStaffSelect.value;
    try{
      const rows=await window.UnifiedSearchEngine.searchSalesStaff('',{limit:50,minChars:0,allowEmpty:'1',showOnFocus:'1'});
      const unique=new Map();
      (rows||[]).forEach(item=>{
        const code=String(item.code||item.salesStaffCode||item.businessStaffCode||'').trim();
        if(!code||unique.has(code))return;
        const name=String(item.name||item.salesStaffName||item.businessStaffName||'').trim();
        unique.set(code,{code,name});
      });
      salesStaffSelect.replaceChildren(new Option('Tất cả nhân viên bán hàng',''));
      [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi')).forEach(item=>{
        salesStaffSelect.add(new Option([item.code,item.name].filter(Boolean).join(' - '),item.code));
      });
      salesStaffSelect.value=selected;
    }catch(error){
      console.warn('[INVOICE_EXPORT_STAFF_LOAD]',error);
      setSummary('Không tải được danh sách NVBH; vẫn có thể xuất tất cả nhân viên.',true);
    }
  }

  async function loadDeliveryStaffOptions(){
    if(!deliveryStaffSelect||!window.UnifiedSearchEngine?.searchDeliveryStaff)return;
    const selected=deliveryStaffSelect.value;
    try{
      const rows=await window.UnifiedSearchEngine.searchDeliveryStaff('',{limit:50,minChars:0,allowEmpty:'1',showOnFocus:'1'});
      const unique=new Map();
      (rows||[]).forEach(item=>{
        const code=String(item.code||item.deliveryStaffCode||item.businessStaffCode||item.staffCode||'').trim();
        if(!code||unique.has(code))return;
        const name=String(item.name||item.deliveryStaffName||item.businessStaffName||item.fullName||'').trim();
        unique.set(code,{code,name});
      });
      deliveryStaffSelect.replaceChildren(new Option('Tất cả nhân viên giao hàng',''));
      [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi')).forEach(item=>{
        deliveryStaffSelect.add(new Option([item.code,item.name].filter(Boolean).join(' - '),item.code));
      });
      deliveryStaffSelect.value=selected;
    }catch(error){
      console.warn('[INVOICE_EXPORT_DELIVERY_STAFF_LOAD]',error);
      setSummary('Không tải được danh sách NVGH; SSE vẫn có thể xuất tất cả NVGH.',true);
    }
  }

  function bind(button,handler,key){
    if(!button||button.dataset[key]==='1')return;
    button.dataset[key]='1';
    button.addEventListener('click',handler);
  }

  initializeDateDefaults();
  bindCustomerAutocomplete();
  loadSalesStaffOptions();
  loadDeliveryStaffOptions();
  bind(vatButton,()=>downloadInvoiceExport('VAT',vatButton),'boundInvoiceExport');
  bind(nonVatButton,()=>downloadInvoiceExport('NON_VAT',nonVatButton),'boundInvoiceExport');
  bind(sseButton,downloadSseExport,'boundSseExport');
  bind(sseErrorButton,downloadSseErrors,'boundSseErrorExport');
  bind(clearFiltersButton,clearFilters,'boundInvoiceFilterClear');
})();
