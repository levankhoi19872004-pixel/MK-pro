'use strict';

(function bindDeliveryToolbar(){
  const byId=(id)=>document.getElementById(id);

  function todayVietnam(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const values=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function cloneControl(id){
    const current=byId(id);
    if(!current)return null;
    const clone=current.cloneNode(true);
    current.replaceWith(clone);
    return clone;
  }

  function run(button,loadingText){
    const task=()=>window.DeliveryWebView?.load?.();
    if(window.ToolbarActions?.run)return window.ToolbarActions.run(button,task,{loadingText});
    return task();
  }

  function clearFilters(button){
    const search=byId('deliveryCoreSearch');
    const deliveryStaff=byId('deliveryCoreDeliveryStaff');
    const salesStaff=byId('deliveryCoreSalesStaff');
    const date=byId('deliveryCoreDate');
    const status=byId('deliveryCoreStatus');
    if(search)search.value='';
    if(deliveryStaff)deliveryStaff.value='';
    if(salesStaff)salesStaff.value='';
    [deliveryStaff,salesStaff].forEach((input)=>{
      if(!input)return;
      ['selectedId','id','code','name','type','label','selectedLabel'].forEach((key)=>delete input.dataset[key]);
    });
    if(date)date.value=todayVietnam();
    if(status)status.value='all';
    ['deliveryCoreDeliveryStaffSuggestions','deliveryCoreSalesStaffSuggestions'].forEach((id)=>{
      const suggestions=byId(id);
      if(!suggestions)return;
      suggestions.classList.remove('show');
      suggestions.innerHTML='';
    });
    return run(button,'Đang xóa...');
  }

  function field(control,className){
    const label=control?.closest('label');
    if(!label)return null;
    label.classList.add('ui-toolbar-field',className);
    return label;
  }

  function decorateDangerAction(root){
    const clear=root.querySelector('#deliveryClearReturnButton');
    if(!clear)return;
    const actions=clear.closest('.delivery-v46-actions');
    const submit=actions?.querySelector('button[type="submit"]');
    if(!actions||!submit)return;
    actions.classList.add('delivery-v46-actions-danger-separated');
    clear.classList.remove('secondary');
    clear.classList.add('danger');
    if(clear.nextElementSibling!==submit)actions.insertBefore(clear,submit);
  }

  function enhance(){
    const root=byId('deliveryTodayRoot');
    const header=root?.querySelector('.delivery-v46-header');
    const filters=header?.querySelector('.delivery-v46-filters');
    if(!root||!header||!filters)return;
    decorateDangerAction(root);
    if(filters.dataset.uiToolbar==='true')return;

    filters.dataset.uiToolbar='true';
    header.classList.add('ui-list-toolbar');
    const title=header.firstElementChild;
    title?.classList.add('ui-page-title');
    title?.querySelector('.muted')?.classList.add('ui-page-meta');
    if(title){
      const pageHeader=document.createElement('div');
      pageHeader.className='ui-page-header';
      header.insertBefore(pageHeader,title);
      pageHeader.appendChild(title);
    }
    filters.classList.add('ui-search-filter-bar');

    const search=cloneControl('deliveryCoreSearch');
    const date=cloneControl('deliveryCoreDate');
    const status=cloneControl('deliveryCoreStatus');
    const reload=cloneControl('deliveryCoreReload');
    const searchField=field(search,'ui-field-search');
    const deliveryField=field(byId('deliveryCoreDeliveryStaff'),'delivery-v46-field-staff');
    const salesField=field(byId('deliveryCoreSalesStaff'),'delivery-v46-field-staff');
    const dateField=field(date,'delivery-v46-field-date');
    const statusField=field(status,'delivery-v46-field-status');
    deliveryField?.classList.add('ui-field-staff');
    salesField?.classList.add('ui-field-staff');

    const actions=document.createElement('div');
    actions.className='ui-toolbar-actions';
    const apply=document.createElement('button');
    apply.id='deliveryCoreApply';
    apply.type='button';
    apply.className='primary ui-action-primary';
    apply.textContent='Tìm kiếm';
    const clear=document.createElement('button');
    clear.id='deliveryCoreClear';
    clear.type='button';
    clear.className='ui-button-ghost';
    clear.textContent='Xóa lọc';
    reload.className='secondary';
    reload.textContent='Tải lại';
    actions.append(apply,clear,reload);

    [searchField,deliveryField,salesField,dateField,statusField,actions].forEach((node)=>{
      if(node)filters.appendChild(node);
    });
    apply.addEventListener('click',()=>run(apply,'Đang tìm...'));
    clear.addEventListener('click',()=>clearFilters(clear));
    reload.addEventListener('click',()=>run(reload,'Đang tải...'));
    search.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      run(apply,'Đang tìm...');
    });

    new MutationObserver(()=>decorateDangerAction(root)).observe(root,{childList:true,subtree:true});
  }

  document.addEventListener('DOMContentLoaded',enhance);
})();
