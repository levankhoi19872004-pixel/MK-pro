(function initExcelFeatureBindings(global){
  'use strict';

  const Excel=global.ExcelInteraction||{};
  if(!Excel.registerContextMenu||!Excel.SpreadsheetGrid)return;

  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const number=value=>{
    const raw=text(value).replace(/\s/g,'').replace(/[₫đ]/gi,'');
    if(!raw)return 0;
    let normalized=raw;
    if(/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw))normalized=raw.replace(/\./g,'').replace(',','.');
    else if(/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw))normalized=raw.replace(/,/g,'');
    else normalized=raw.replace(',','.');
    const result=Number(normalized);
    return Number.isFinite(result)?result:NaN;
  };
  const identity=row=>text(row?.id||row?._id||row?.code||row?.orderCode||row?.documentCode||row?.salesOrderCode);
  const notify=(message,error=false)=>{
    const fn=global.showMessage;
    if(typeof fn==='function'){
      const target=byId('systemMessage')||byId('importMessage')||byId('salesMessage');
      if(target)return fn(target,message,error);
    }
    if(error)alert(message);
  };
  const openModal=modal=>{
    if(!modal)return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  };
  const closeModal=modal=>{
    if(!modal)return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open');
  };
  const setStatus=(element,message,state='')=>{
    if(!element)return;
    element.textContent=message||'';
    element.classList.toggle('error',state==='error');
    element.classList.toggle('success',state==='success');
  };
  const selectedIds=(root,selector,cache,indexAttribute='idx')=>Array.from(root?.querySelectorAll(`${selector}:checked`)||[])
    .map(check=>{
      const direct=text(check.dataset.id);
      if(direct)return direct;
      const index=Number(check.dataset[indexAttribute]);
      return identity(cache?.[index]);
    }).filter(Boolean);
  const rowCellText=({row,cell})=>({
    cellText:cell?.innerText||cell?.textContent||'',
    rowText:Array.from(row.querySelectorAll('td,span,.import-order-cell,.import-order-cell-code,.master-order-code'))
      .map(el=>text(el.innerText||el.textContent)).filter(Boolean).join('\t')
  });

  function salesFilters(){
    return {
      q:text(byId('salesOrderSearchInput')?.value),
      salesStaffText:text(byId('salesOrderStaffFilter')?.value),
      dateFrom:text(byId('salesOrderDateFrom')?.value),
      dateTo:text(byId('salesOrderDateTo')?.value),
      source:text(byId('salesOrderSourceFilter')?.value),
      excludeInactive:'1'
    };
  }

  function importFilters(){
    return {
      dateFrom:text(byId('importDateFromFilter')?.value),
      dateTo:text(byId('importDateToFilter')?.value),
      excludeInactive:'1'
    };
  }

  function masterFilters(){
    return {
      q:text(byId('masterOrderSearch')?.value),
      dateFrom:text(byId('masterOrderDateFrom')?.value),
      dateTo:text(byId('masterOrderDateTo')?.value),
      excludeInactive:'1'
    };
  }

  function reportFilters(){
    const state=global.__reportCenterState||{};
    const definition=state.activeDefinition||{};
    const filters={q:text(byId('reportSearchInput')?.value)};
    if(definition.dateMode==='month')filters.month=text(byId('reportFromDate')?.value).slice(0,7);
    else if(definition.dateMode!=='none'){
      filters.dateFrom=text(byId('reportFromDate')?.value);
      filters.dateTo=text(byId('reportToDate')?.value);
    }
    return filters;
  }

  function registerContextMenus(){
    const salesRoot=byId('salesOrderList');
    if(salesRoot)Excel.registerContextMenu({
      root:salesRoot,rowSelector:'.sales-order-row',
      getContext(args){
        const base=rowCellText(args);
        const check=args.row.querySelector('.sales-order-check');
        const index=Number(check?.dataset.idx);
        const clicked=identity(global.__salesOrdersCache?.[index]);
        const selected=selectedIds(salesRoot,'.sales-order-check',global.__salesOrdersCache);
        const page=(global.__salesOrdersCache||[]).map(identity).filter(Boolean);
        return {...base,selectedCount:selected.length,
          clickedPayload:clicked?{type:'SALES_ORDERS',scope:'SELECTED',selectedIds:[clicked],includeDetails:true}:null,
          selectedPayload:selected.length?{type:'SALES_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:false}:null,
          pagePayload:page.length?{type:'SALES_ORDERS',scope:'PAGE',selectedIds:page,includeDetails:false}:null,
          filteredPayload:{type:'SALES_ORDERS',scope:'FILTERED',filters:salesFilters(),includeDetails:false},
          detailsPayload:selected.length?{type:'SALES_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:true}:null};
      },onExportDone:r=>notify(`Đã xuất ${r.rowCount} đơn con ra Excel`),onError:e=>notify(e.message,true)
    });

    const importRoot=byId('importOrderList');
    if(importRoot)Excel.registerContextMenu({
      root:importRoot,rowSelector:'.import-order-one-line-row',
      getContext(args){
        const base=rowCellText(args);
        const check=args.row.querySelector('.import-order-check');
        const index=Number(check?.dataset.idx);
        const cache=global.__importOrdersCache||[];
        const clicked=identity(cache[index]);
        const selected=selectedIds(importRoot,'.import-order-check',cache);
        const page=cache.map(identity).filter(Boolean);
        return {...base,selectedCount:selected.length,
          clickedPayload:clicked?{type:'IMPORT_ORDERS',scope:'SELECTED',selectedIds:[clicked],includeDetails:true}:null,
          selectedPayload:selected.length?{type:'IMPORT_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:false}:null,
          pagePayload:page.length?{type:'IMPORT_ORDERS',scope:'PAGE',selectedIds:page,includeDetails:false}:null,
          filteredPayload:{type:'IMPORT_ORDERS',scope:'FILTERED',filters:importFilters(),includeDetails:false},
          detailsPayload:selected.length?{type:'IMPORT_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:true}:null};
      },onExportDone:r=>notify(`Đã xuất ${r.rowCount} phiếu nhập ra Excel`),onError:e=>notify(e.message,true)
    });

    const masterRoot=byId('masterOrderList');
    if(masterRoot)Excel.registerContextMenu({
      root:masterRoot,rowSelector:'.master-order-row',
      getContext(args){
        const base=rowCellText(args);
        const clicked=text(args.row.querySelector('.master-order-check')?.dataset.id);
        const selected=selectedIds(masterRoot,'.master-order-check',[], 'id');
        const page=Array.from(masterRoot.querySelectorAll('.master-order-check')).map(check=>text(check.dataset.id)).filter(Boolean);
        return {...base,selectedCount:selected.length,
          clickedPayload:clicked?{type:'MASTER_ORDERS',scope:'SELECTED',selectedIds:[clicked],includeDetails:true}:null,
          selectedPayload:selected.length?{type:'MASTER_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:false}:null,
          pagePayload:page.length?{type:'MASTER_ORDERS',scope:'PAGE',selectedIds:page,includeDetails:false}:null,
          filteredPayload:{type:'MASTER_ORDERS',scope:'FILTERED',filters:masterFilters(),includeDetails:false},
          detailsPayload:selected.length?{type:'MASTER_ORDERS',scope:'SELECTED',selectedIds:selected,includeDetails:true}:null};
      },onExportDone:r=>notify(`Đã xuất ${r.rowCount} đơn tổng ra Excel`),onError:e=>notify(e.message,true)
    });

    const reportRoot=byId('reportTableBody');
    if(reportRoot){
      reportRoot.addEventListener('click',event=>{
        if(!event.ctrlKey&&!event.metaKey)return;
        const row=event.target.closest('tr[data-report-row-index]');
        if(!row)return;
        row.classList.toggle('excel-row-selected');
      });
      Excel.registerContextMenu({
      root:reportRoot,rowSelector:'tr',
      getContext(args){
        const base=rowCellText(args);
        const rows=Array.from(reportRoot.querySelectorAll('tr')).filter(row=>!row.querySelector('.empty-cell'));
        const rowIndex=rows.indexOf(args.row);
        const selectedIndexes=Array.from(reportRoot.querySelectorAll('tr.excel-row-selected[data-report-row-index]'))
          .map(row=>Number(row.dataset.reportRowIndex)).filter(value=>Number.isInteger(value)&&value>=0);
        const state=global.__reportCenterState||{};
        const meta=state.activePayload?.meta||{};
        const reportCode=text(state.activeDefinition?.code||state.activeCode);
        const filters=reportFilters();
        const page=Number(meta.page||state.page||1);
        const limit=Number(meta.limit||byId('reportPageSize')?.value||50);
        return {...base,selectedCount:selectedIndexes.length,
          clickedPayload:rowIndex>=0&&reportCode?{type:'REPORT',scope:'PAGE',reportCode,filters,page,limit,rowIndexes:[rowIndex]}:null,
          selectedPayload:selectedIndexes.length&&reportCode?{type:'REPORT',scope:'PAGE',reportCode,filters,page,limit,rowIndexes:selectedIndexes}:null,
          pagePayload:reportCode?{type:'REPORT',scope:'PAGE',reportCode,filters,page,limit}:null,
          filteredPayload:reportCode?{type:'REPORT',scope:'FILTERED',reportCode,filters}:null,
          detailsPayload:selectedIndexes.length&&reportCode?{type:'REPORT',scope:'PAGE',reportCode,filters,page,limit,rowIndexes:selectedIndexes,includeDetails:true}:null};
      },onExportDone:r=>notify(`Đã xuất ${r.rowCount} dòng báo cáo ra Excel`),onError:e=>notify(e.message,true)
      });
    }

    const previewRoot=byId('importPreviewTable');
    if(previewRoot)Excel.registerContextMenu({
      root:previewRoot,rowSelector:'tr[data-import-row-number]',
      getContext(args){
        const base=rowCellText(args);
        const clicked=Number(args.row.dataset.importRowNumber||0);
        const selected=Array.from(previewRoot.querySelectorAll('.import-row-check:checked')).map(check=>{
          const index=Number(check.dataset.index);
          const row=global.__importPreviewRows?.[index];
          return Number(row?.rowNo||row?.__rowNo||index+1);
        }).filter(Number.isFinite);
        const sessionId=text(global.__importPreviewSessionId);
        return {...base,selectedCount:selected.length,
          clickedPayload:sessionId&&clicked?{type:'IMPORT_PREVIEW',scope:'SELECTED',sessionId,selectedRowNumbers:[clicked]}:null,
          selectedPayload:sessionId&&selected.length?{type:'IMPORT_PREVIEW',scope:'SELECTED',sessionId,selectedRowNumbers:selected}:null,
          pagePayload:sessionId?{type:'IMPORT_PREVIEW',scope:'PAGE',sessionId}:null,
          filteredPayload:sessionId?{type:'IMPORT_PREVIEW',scope:'FILTERED',sessionId}:null,
          detailsPayload:sessionId&&selected.length?{type:'IMPORT_PREVIEW',scope:'SELECTED',sessionId,selectedRowNumbers:selected,includeDetails:true}:null};
      },onExportDone:r=>notify(`Đã xuất ${r.rowCount} dòng import ra Excel`),onError:e=>notify(e.message,true)
    });
  }

  function bindExportButtons(){
    const importButton=byId('exportSelectedImportOrdersButton');
    if(importButton&&!importButton.dataset.excelBound){
      importButton.dataset.excelBound='1';
      importButton.addEventListener('click',async()=>{
        const root=byId('importOrderList');
        const ids=selectedIds(root,'.import-order-check',global.__importOrdersCache||[]);
        if(!ids.length)return alert('Chưa chọn phiếu nhập để xuất Excel');
        try{await Excel.downloadWorkbook({type:'IMPORT_ORDERS',scope:'SELECTED',selectedIds:ids,includeDetails:true});}catch(error){notify(error.message,true);}
      });
    }
    const masterButton=byId('exportSelectedMasterOrdersButton');
    if(masterButton&&!masterButton.dataset.excelBound){
      masterButton.dataset.excelBound='1';
      masterButton.addEventListener('click',async()=>{
        const ids=Array.from(byId('masterOrderList')?.querySelectorAll('.master-order-check:checked')||[]).map(check=>text(check.dataset.id)).filter(Boolean);
        if(!ids.length)return alert('Chưa chọn đơn tổng để xuất Excel');
        try{await Excel.downloadWorkbook({type:'MASTER_ORDERS',scope:'SELECTED',selectedIds:ids,includeDetails:true});}catch(error){notify(error.message,true);}
      });
    }
  }

  let importPasteGrid=null;
  const pasteImportModal=byId('excelPasteImportModal');
  const pasteImportStatus=byId('excelPasteImportStatus');
  function countRows(grid,element){if(element)element.textContent=`${grid?.getRows().length||0} dòng có dữ liệu`;}
  async function openPasteImport(){
    const type=text(byId('importDataType')?.value);
    if(!type)return alert('Hãy chọn loại dữ liệu import trước');
    setStatus(pasteImportStatus,'Đang tải cấu trúc cột...');
    openModal(pasteImportModal);
    try{
      const response=await fetch(`/api/import/fields/${encodeURIComponent(type)}`);
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.message||'Không tải được cấu trúc import');
      const fields=(json.fields||[]).filter(field=>field&&field.field).map(field=>({key:field.field,label:field.label||field.field,type:/qty|quantity|price|amount|rate/i.test(field.field)?'number':'text'}));
      if(!fields.length)throw new Error('Loại import này chưa có cấu trúc cột');
      byId('excelPasteImportTypeLabel').textContent=byId('importDataType')?.selectedOptions?.[0]?.textContent||type;
      importPasteGrid=new Excel.SpreadsheetGrid({container:byId('excelPasteImportGrid'),columns:fields,minRows:30,maxRows:5000,onChange:()=>countRows(importPasteGrid,byId('excelPasteImportRowCount'))});
      setStatus(pasteImportStatus,'Dán dữ liệu bắt đầu từ ô đầu tiên. Thứ tự cột đúng theo tiêu đề trên bảng.');
      setTimeout(()=>importPasteGrid.focus(),0);
    }catch(error){setStatus(pasteImportStatus,error.message,'error');}
  }
  async function validatePasteImport(){
    const rows=importPasteGrid?.getRows()||[];
    if(!rows.length)return setStatus(pasteImportStatus,'Chưa có dữ liệu để kiểm tra','error');
    const button=byId('validateExcelPasteImportButton');
    if(button){button.disabled=true;button.textContent='Đang kiểm tra...';}
    setStatus(pasteImportStatus,`Đang kiểm tra ${rows.length} dòng...`);
    try{
      const response=await fetch('/api/excel/import/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:text(byId('importDataType')?.value),importMode:text(byId('importDataMode')?.value),rows})});
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.message||json.error||'Không tạo được bản xem trước');
      if(typeof global.renderImportPreviewFromExcel!=='function')throw new Error('Màn import chưa sẵn sàng nhận bản xem trước');
      global.renderImportPreviewFromExcel(json);
      closeModal(pasteImportModal);
      setStatus(pasteImportStatus,'Đã tạo bản xem trước','success');
      byId('importPreviewTable')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){setStatus(pasteImportStatus,error.message,'error');}
    finally{if(button){button.disabled=false;button.textContent='Kiểm tra và tạo bản xem trước';}}
  }

  let lineGrid=null;
  let lineMode='';
  const lineModal=byId('lineItemPasteModal');
  const lineStatus=byId('lineItemPasteStatus');
  function openLinePaste(mode){
    lineMode=mode;
    const isSales=mode==='sales';
    byId('lineItemPasteTitle').textContent=isSales?'Dán hàng vào đơn bán':'Dán hàng vào phiếu nhập';
    byId('lineItemPasteDescription').textContent=isSales
      ? 'Cột: mã sản phẩm, số thùng, số lẻ, giá bán. Giá trống sẽ dùng giá sản phẩm.'
      : 'Cột: mã sản phẩm, số thùng, số lẻ, tổng số lượng lẻ, giá nhập. Có thể chỉ nhập một kiểu số lượng.';
    const columns=isSales?[
      {key:'productCode',label:'Mã SP',type:'text'},
      {key:'cartonQty',label:'Thùng',type:'integer'},
      {key:'unitQty',label:'Lẻ',type:'integer'},
      {key:'salePrice',label:'Giá bán',type:'money'}
    ]:[
      {key:'productCode',label:'Mã SP',type:'text'},
      {key:'cartonQty',label:'Thùng',type:'integer'},
      {key:'unitQty',label:'Lẻ',type:'integer'},
      {key:'quantity',label:'Tổng lẻ',type:'integer'},
      {key:'costPrice',label:'Giá nhập',type:'money'}
    ];
    lineGrid=new Excel.SpreadsheetGrid({container:byId('lineItemPasteGrid'),columns,minRows:25,maxRows:2000,onChange:()=>countRows(lineGrid,byId('lineItemPasteRowCount'))});
    setStatus(lineStatus,'Dán dữ liệu từ Excel rồi bấm Đối chiếu và thêm.');
    openModal(lineModal);
    setTimeout(()=>lineGrid.focus(),0);
  }
  async function applyLinePaste(){
    const rows=lineGrid?.getRows()||[];
    if(!rows.length)return setStatus(lineStatus,'Chưa có dòng hàng','error');
    const codes=[...new Set(rows.map(row=>text(row.productCode)).filter(Boolean))];
    if(!codes.length)return setStatus(lineStatus,'Chưa có mã sản phẩm','error');
    const button=byId('applyLineItemPasteButton');
    if(button){button.disabled=true;button.textContent='Đang đối chiếu...';}
    try{
      const response=await fetch('/api/excel/products/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codes})});
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.message||'Không đối chiếu được mã sản phẩm');
      const products=json.products||[];
      const helper=lineMode==='sales'?global.applyPastedSalesItems:global.applyPastedImportItems;
      if(typeof helper!=='function')throw new Error('Màn chứng từ chưa sẵn sàng nhận dữ liệu');
      const result=await helper(rows,products);
      const errors=result?.errors||[];
      if(errors.length){
        errors.forEach(item=>lineGrid.markCell(Math.max(0,Number(item.rowNo||1)-1),item.key||'productCode',{error:item.message||'Dữ liệu không hợp lệ'}));
        setStatus(lineStatus,`Đã thêm ${result.added||0} dòng; còn ${errors.length} dòng lỗi. Rê chuột vào ô đỏ để xem.`,result.added?'success':'error');
      }else{
        setStatus(lineStatus,`Đã thêm ${result?.added||0} dòng vào chứng từ.`,'success');
        closeModal(lineModal);
      }
    }catch(error){setStatus(lineStatus,error.message,'error');}
    finally{if(button){button.disabled=false;button.textContent='Đối chiếu và thêm vào chứng từ';}}
  }

  function bindPasteControls(){
    byId('openExcelPasteImportButton')?.addEventListener('click',openPasteImport);
    byId('closeExcelPasteImportButton')?.addEventListener('click',()=>closeModal(pasteImportModal));
    byId('clearExcelPasteImportButton')?.addEventListener('click',()=>importPasteGrid?.clear());
    byId('addExcelPasteRowsButton')?.addEventListener('click',()=>importPasteGrid?.addRows(20));
    byId('validateExcelPasteImportButton')?.addEventListener('click',validatePasteImport);
    pasteImportModal?.addEventListener('click',event=>{if(event.target===pasteImportModal)closeModal(pasteImportModal);});

    byId('openSalesItemPasteButton')?.addEventListener('click',()=>openLinePaste('sales'));
    byId('openImportItemPasteButton')?.addEventListener('click',()=>openLinePaste('import'));
    byId('closeLineItemPasteButton')?.addEventListener('click',()=>closeModal(lineModal));
    byId('clearLineItemPasteButton')?.addEventListener('click',()=>lineGrid?.clear());
    byId('addLineItemPasteRowsButton')?.addEventListener('click',()=>lineGrid?.addRows(20));
    byId('applyLineItemPasteButton')?.addEventListener('click',applyLinePaste);
    lineModal?.addEventListener('click',event=>{if(event.target===lineModal)closeModal(lineModal);});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    registerContextMenus();
    bindExportButtons();
    bindPasteControls();
  });
})(window);
