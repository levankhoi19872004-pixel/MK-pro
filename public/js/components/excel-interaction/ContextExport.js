(function initExcelContextExport(global){
  'use strict';

  const registrations=[];
  let menu=null;
  let activeRegistration=null;
  let activeContext=null;

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
  }

  function fileNameFromDisposition(disposition){
    const value=String(disposition||'');
    const utf=value.match(/filename\*=UTF-8''([^;]+)/i);
    if(utf){try{return decodeURIComponent(utf[1]);}catch(_err){return utf[1];}}
    const plain=value.match(/filename="?([^";]+)"?/i);
    return plain?plain[1]:'export.xlsx';
  }

  async function downloadWorkbook(payload){
    const response=await fetch('/api/excel/export',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload||{})
    });
    if(!response.ok){
      let message='Không xuất được Excel';
      try{const json=await response.json();message=json.message||message;}catch(_err){}
      throw new Error(message);
    }
    const blob=await response.blob();
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=fileNameFromDisposition(response.headers.get('Content-Disposition'));
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return {rowCount:Number(response.headers.get('X-Export-Row-Count')||0)};
  }

  async function copyText(text){
    const value=String(text??'');
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea=document.createElement('textarea');
    textarea.value=value;
    textarea.style.position='fixed';
    textarea.style.opacity='0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function ensureMenu(){
    if(menu)return menu;
    menu=document.createElement('div');
    menu.className='excel-context-menu';
    menu.hidden=true;
    menu.setAttribute('role','menu');
    document.body.appendChild(menu);
    document.addEventListener('click',hideMenu,true);
    document.addEventListener('scroll',hideMenu,true);
    window.addEventListener('resize',hideMenu);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')hideMenu();});
    return menu;
  }

  function hideMenu(){
    if(menu)menu.hidden=true;
    document.querySelectorAll('.excel-context-row').forEach(el=>el.classList.remove('excel-context-row'));
    activeRegistration=null;
    activeContext=null;
  }

  function menuItem(label,action,{disabled=false,danger=false}={}){
    return `<button type="button" role="menuitem" data-action="${escapeHtml(action)}" ${disabled?'disabled':''} class="${danger?'danger':''}">${escapeHtml(label)}</button>`;
  }

  function separator(){return '<div class="excel-context-separator" role="separator"></div>';}

  function resolveActions(registration,context){
    const selectedCount=Number(context.selectedCount||0);
    return [
      menuItem('Sao chép ô','copy-cell',{disabled:!context.cellText}),
      menuItem('Sao chép dòng','copy-row',{disabled:!context.rowText}),
      separator(),
      menuItem('Xuất dòng đang chọn ra Excel','export-clicked',{disabled:!context.clickedPayload}),
      menuItem(`Xuất các dòng đã chọn${selectedCount?` (${selectedCount})`:''}`,'export-selected',{disabled:!context.selectedPayload||!selectedCount}),
      menuItem('Xuất trang hiện tại','export-page',{disabled:!context.pagePayload}),
      menuItem('Xuất toàn bộ theo bộ lọc','export-filtered',{disabled:!context.filteredPayload}),
      menuItem('Xuất dữ liệu đang chọn kèm chi tiết','export-details',{disabled:!context.detailsPayload})
    ].join('');
  }

  async function handleMenuAction(action){
    const context=activeContext;
    const registration=activeRegistration;
    if(!context||!registration)return;
    hideMenu();
    try{
      if(action==='copy-cell')return await copyText(context.cellText);
      if(action==='copy-row')return await copyText(context.rowText);
      const payload={
        'export-clicked':context.clickedPayload,
        'export-selected':context.selectedPayload,
        'export-page':context.pagePayload,
        'export-filtered':context.filteredPayload,
        'export-details':context.detailsPayload
      }[action];
      if(!payload)return;
      if(typeof registration.onExportStart==='function')registration.onExportStart(payload);
      const result=await downloadWorkbook(payload);
      if(typeof registration.onExportDone==='function')registration.onExportDone(result,payload);
    }catch(error){
      if(typeof registration.onError==='function')registration.onError(error);
      else alert(error.message||'Không xử lý được thao tác Excel');
    }
  }

  function showMenu(registration,context,x,y){
    const el=ensureMenu();
    activeRegistration=registration;
    activeContext=context;
    el.innerHTML=resolveActions(registration,context);
    el.hidden=false;
    el.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',event=>{
      event.stopPropagation();
      handleMenuAction(button.dataset.action);
    }));
    const rect=el.getBoundingClientRect();
    const left=Math.min(Math.max(8,x),window.innerWidth-rect.width-8);
    const top=Math.min(Math.max(8,y),window.innerHeight-rect.height-8);
    el.style.left=`${left}px`;
    el.style.top=`${top}px`;
  }

  function register(config){
    const root=typeof config.root==='string'?document.querySelector(config.root):config.root;
    if(!root)return()=>{};
    const registration={...config,root};
    const listener=event=>{
      const row=event.target.closest(config.rowSelector||'tr');
      if(!row||!root.contains(row))return;
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.excel-context-row').forEach(el=>el.classList.remove('excel-context-row'));
      row.classList.add('excel-context-row');
      const cell=event.target.closest(config.cellSelector||'td,th,span,div');
      const context=typeof config.getContext==='function'
        ? config.getContext({event,row,cell,root})
        : {};
      context.cellText=context.cellText??cell?.innerText??cell?.textContent??'';
      context.rowText=context.rowText??Array.from(row.querySelectorAll(config.copyCellSelector||'td,span')).map(el=>el.innerText||el.textContent||'').join('\t');
      showMenu(registration,context,event.clientX,event.clientY);
    };
    root.addEventListener('contextmenu',listener);
    registrations.push(registration);
    return()=>root.removeEventListener('contextmenu',listener);
  }

  global.ExcelInteraction=Object.assign(global.ExcelInteraction||{}, {
    registerContextMenu:register,
    downloadWorkbook,
    copyText,
    hideContextMenu:hideMenu
  });
})(window);
