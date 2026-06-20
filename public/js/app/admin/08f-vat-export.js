
'use strict';

// Các luồng xuất hóa đơn và SSE độc lập, dùng invoiceType rõ ràng và một request tại một thời điểm.
(function initInvoiceExports(){
  const vatButton=document.getElementById('exportVatInvoiceTT78Button');
  const nonVatButton=document.getElementById('exportVatNonInvoiceOrdersButton');
  const sseButton=document.getElementById('exportSseInvoiceButton');
  const sseErrorButton=document.getElementById('downloadSseErrorReportButton');
  const sseTypeSelect=document.getElementById('sseInvoiceTypeSelect');
  const summary=document.getElementById('vatInvoiceExportSummary');
  const buttons=[vatButton,nonVatButton,sseButton,sseErrorButton].filter(Boolean);
  let exportInFlight=false;
  let sseErrorReportUrl='';

  if(!buttons.length)return;

  function setSummary(message,isError=false){
    if(!summary)return;
    summary.textContent=message;
    summary.classList.toggle('error',Boolean(isError));
  }
  function setBusy(active,activeButton){
    exportInFlight=active;
    buttons.forEach(button=>{
      button.disabled=active;
      button.setAttribute('aria-busy',active?'true':'false');
      const idleLabel=button.dataset.idleLabel||button.textContent;
      button.dataset.idleLabel=idleLabel;
      button.textContent=active&&button===activeButton?'Đang tạo file...':idleLabel;
    });
    if(sseTypeSelect)sseTypeSelect.disabled=active;
  }
  function exportDateParams(invoiceType){
    if(typeof setReportDefaults==='function')setReportDefaults();
    const params=new URLSearchParams({invoiceType,limit:'20000'});
    const from=document.getElementById('reportFromDate')?.value||'';
    const to=document.getElementById('reportToDate')?.value||'';
    if(from)params.set('dateFrom',from);
    if(to)params.set('dateTo',to);
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
    anchor.href=url; anchor.download=fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function download(url,button,label,fallback){
    if(exportInFlight)return;
    setBusy(true,button); setSummary(`Đang tạo file ${label}...`);
    try{
      const response=await fetch(url,{method:'GET',headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      if(!response.ok)throw await responseError(response);
      const contentType=String(response.headers.get('content-type')||'');
      if(!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('Máy chủ không trả về file Excel hợp lệ');
      const fileName=responseFileName(response,fallback);
      saveBlob(await response.blob(),fileName);
      setSummary(`Đã tải ${fileName}`);
      return true;
    }catch(error){
      console.error('[INVOICE_EXPORT_ERROR]',error);
      const payload=error.payload||{};
      sseErrorReportUrl=payload.errorReportUrl||'';
      if(sseErrorButton)sseErrorButton.hidden=!sseErrorReportUrl;
      setSummary(error.message||`Không xuất được ${label}`,true);
      return false;
    }finally{ setBusy(false,button); }
  }
  function downloadInvoiceExport(invoiceType,button){
    const params=exportDateParams(invoiceType);
    const label=invoiceType==='VAT'?'hóa đơn VAT':'hóa đơn không VAT';
    const fallback=invoiceType==='VAT'?'Hoa_don_VAT.xlsx':'Hoa_don_khong_VAT.xlsx';
    return download(`/api/export/invoice-orders.xlsx?${params.toString()}`,button,label,fallback);
  }
  function downloadSseExport(){
    const invoiceType=sseTypeSelect?.value==='NON_VAT'?'NON_VAT':'VAT';
    const params=exportDateParams(invoiceType);
    sseErrorReportUrl=''; if(sseErrorButton)sseErrorButton.hidden=true;
    return download(`/api/export/sse-invoice-orders.xlsx?${params.toString()}`,sseButton,'Excel SSE',`SSE_Hoa_don_${invoiceType}.xlsx`);
  }
  function downloadSseErrors(){
    if(!sseErrorReportUrl)return;
    return download(sseErrorReportUrl,sseErrorButton,'báo cáo lỗi SSE','SSE_Loi_mapping.xlsx');
  }
  function bind(button,handler,key){
    if(!button||button.dataset[key]==='1')return;
    button.dataset[key]='1'; button.addEventListener('click',handler);
  }
  bind(vatButton,()=>downloadInvoiceExport('VAT',vatButton),'boundInvoiceExport');
  bind(nonVatButton,()=>downloadInvoiceExport('NON_VAT',nonVatButton),'boundInvoiceExport');
  bind(sseButton,downloadSseExport,'boundSseExport');
  bind(sseErrorButton,downloadSseErrors,'boundSseErrorExport');
})();
