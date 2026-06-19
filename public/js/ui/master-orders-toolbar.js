'use strict';

(function bindMasterOrdersToolbar(){
  const byId=(id)=>document.getElementById(id);
  const applyButton=byId('applyMasterOrderFiltersButton');
  const clearButton=byId('clearMasterOrderFiltersButton');
  const reloadButton=byId('reloadMasterOrdersButton');
  const searchInput=byId('masterOrderSearch');
  const dateFrom=byId('masterOrderDateFrom');
  const dateTo=byId('masterOrderDateTo');

  function load(button, loadingText, task){
    const request=typeof task==='function'?task:window.loadMasterOrders;
    if(typeof request!=='function')return undefined;
    if(window.ToolbarActions?.run)return window.ToolbarActions.run(button,request,{loadingText});
    return request();
  }

  function resetFilters(){
    if(searchInput)searchInput.value='';
    const defaultDate=typeof today==='function'?today():new Date().toISOString().slice(0,10);
    if(dateFrom)dateFrom.value=defaultDate;
    if(dateTo)dateTo.value=defaultDate;
    return load(clearButton,'Đang xóa...');
  }

  if(applyButton)applyButton.addEventListener('click',()=>load(applyButton,'Đang tìm...'));
  if(clearButton)clearButton.addEventListener('click',resetFilters);
  if(searchInput)searchInput.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    load(applyButton,'Đang tìm...');
  });
  if(reloadButton)reloadButton.addEventListener('click',(event)=>{
    event.stopImmediatePropagation();
    load(reloadButton,'Đang tải...',window.loadMasterOrderModule);
  },{capture:true});
})();
