'use strict';

(function bindSalesToolbarPilot(){
  const byId=(id)=>document.getElementById(id);
  const applyButton=byId('applySalesOrderFiltersButton');
  const clearButton=byId('clearSalesOrderFiltersButton');
  const reloadButton=byId('reloadSalesOrdersButton');

  function stopPendingSearch(){
    if(typeof salesOrderSearchTimer!=='undefined')clearTimeout(salesOrderSearchTimer);
  }

  function run(button, loadingText, beforeLoad){
    stopPendingSearch();
    if(typeof beforeLoad==='function')beforeLoad();
    const task=()=>loadSalesOrders({page:1,append:false});
    if(window.ToolbarActions?.run)return window.ToolbarActions.run(button,task,{loadingText});
    return task();
  }

  function clearFilters(){
    return run(clearButton,'Đang xóa...',()=>{
      if(salesOrderSearchInput)salesOrderSearchInput.value='';
      if(salesOrderStaffFilter)salesOrderStaffFilter.value='';
      if(typeof clearSalesOrderStaffDataset==='function')clearSalesOrderStaffDataset();
      const suggestions=byId('salesOrderStaffFilterSuggestions');
      if(suggestions){suggestions.hidden=true;suggestions.innerHTML='';}
      const defaultDate=typeof today==='function'?today():new Date().toISOString().slice(0,10);
      if(salesOrderDateFrom)salesOrderDateFrom.value=defaultDate;
      if(salesOrderDateTo)salesOrderDateTo.value=defaultDate;
      if(salesOrderSourceFilter)salesOrderSourceFilter.value='';
    });
  }

  if(applyButton)applyButton.addEventListener('click',()=>run(applyButton,'Đang tìm...'));
  if(clearButton)clearButton.addEventListener('click',clearFilters);
  if(reloadButton)reloadButton.addEventListener('click',(event)=>{
    event.stopImmediatePropagation();
    run(reloadButton,'Đang tải...');
  },{capture:true});
})();
