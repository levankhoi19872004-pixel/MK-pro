'use strict';

(function initDmsInventoryModule(){
  const el = {
    currentSubtab: document.getElementById('stockCurrentSubtab'),
    dmsSubtab: document.getElementById('stockDmsSubtab'),
    currentPanel: document.getElementById('stockCurrentPanel'),
    dmsPanel: document.getElementById('dmsInventoryPanel'),
    latestInfo: document.getElementById('dmsInventoryLatestInfo'),
    reload: document.getElementById('dmsInventoryReloadButton'),
    upload: document.getElementById('dmsInventoryUploadButton'),
    history: document.getElementById('dmsInventoryHistoryButton'),
    search: document.getElementById('dmsInventorySearch'),
    type: document.getElementById('dmsInventoryTypeFilter'),
    message: document.getElementById('dmsInventoryMessage'),
    table: document.getElementById('dmsInventoryTable'),
    count: document.getElementById('dmsInventoryCount'),
    prev: document.getElementById('dmsInventoryPrevButton'),
    next: document.getElementById('dmsInventoryNextButton'),
    dmsGreaterSku: document.getElementById('dmsGreaterSkuCount'),
    dmsGreaterQty: document.getElementById('dmsGreaterQty'),
    internalGreaterSku: document.getElementById('internalGreaterSkuCount'),
    internalGreaterQty: document.getElementById('internalGreaterQty'),
    matchedSku: document.getElementById('dmsMatchedSkuCount'),
    warningSku: document.getElementById('dmsWarningSkuCount'),
    uploadModal: document.getElementById('dmsInventoryUploadModal'),
    uploadClose: document.getElementById('dmsInventoryUploadCloseButton'),
    file: document.getElementById('dmsInventoryFileInput'),
    snapshotDate: document.getElementById('dmsInventorySnapshotDate'),
    note: document.getElementById('dmsInventoryNote'),
    preview: document.getElementById('dmsInventoryPreviewButton'),
    commit: document.getElementById('dmsInventoryCommitButton'),
    uploadMessage: document.getElementById('dmsInventoryUploadMessage'),
    previewSummary: document.getElementById('dmsInventoryPreviewSummary'),
    previewTable: document.getElementById('dmsInventoryPreviewTable'),
    historyModal: document.getElementById('dmsInventoryHistoryModal'),
    historyClose: document.getElementById('dmsInventoryHistoryCloseButton'),
    historyTable: document.getElementById('dmsInventoryHistoryTable')
  };

  if(!el.dmsPanel) return;

  const state = { page: 1, limit: 100, hasMore: false, preview: null, loading: false };

  function escapeHtml(value=''){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function number(value){
    const n=Number(value||0);
    return Number.isFinite(n)?n:0;
  }

  function formatNumber(value){
    return Math.round(number(value)).toLocaleString('vi-VN');
  }

  function formatDateTime(value){
    if(!value) return '—';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?String(value):date.toLocaleString('vi-VN');
  }

  function stockDisplay(qty, rate){
    const safeQty=Math.max(0,Math.round(number(qty)));
    const safeRate=Math.max(1,Math.round(number(rate)||1));
    return `${Math.floor(safeQty/safeRate)}/${safeQty%safeRate}`;
  }

  function setMessage(target, message='', isError=false){
    if(!target) return;
    target.textContent=message;
    target.classList.toggle('error',Boolean(isError));
    target.classList.toggle('success',Boolean(message)&&!isError);
  }

  function readUser(){
    for(const key of ['mk_web_user','v43_mobile_user']){
      try{
        const user=JSON.parse(localStorage.getItem(key)||'{}');
        if(user&&user.role) return user;
      }catch(_){ }
    }
    return {};
  }

  function applyPermissions(){
    const role=String(readUser().role||'').toLowerCase();
    if(el.upload) el.upload.hidden=!['admin','accountant','warehouse'].includes(role);
  }

  function setModal(modal, open){
    if(!modal) return;
    modal.hidden=!open;
    modal.classList.toggle('show',Boolean(open));
    modal.setAttribute('aria-hidden',open?'false':'true');
  }

  function switchPanel(panelId){
    const showDms=panelId==='dmsInventoryPanel';
    el.currentSubtab?.classList.toggle('active',!showDms);
    el.dmsSubtab?.classList.toggle('active',showDms);
    if(el.currentPanel){el.currentPanel.hidden=showDms;el.currentPanel.classList.toggle('active',!showDms);}
    if(el.dmsPanel){el.dmsPanel.hidden=!showDms;el.dmsPanel.classList.toggle('active',showDms);}
    if(showDms) loadDmsInventory({resetPage:true});
    else if(typeof window.loadStock==='function') window.loadStock().catch(()=>{});
  }

  function statusLabel(type){
    return ({
      internal_greater:'Thực tế nhiều hơn DMS',
      dms_greater:'DMS nhiều hơn thực tế',
      matched:'Khớp',
      unmapped:'Chưa ghép mã',
      conversion_mismatch:'Sai quy cách'
    })[type]||type||'—';
  }

  function renderSummary(summary={}){
    el.dmsGreaterSku.textContent=`${formatNumber(summary.dmsGreaterRows)} SKU`;
    el.dmsGreaterQty.textContent=`${formatNumber(summary.totalDmsExcessQty)} đơn vị lẻ`;
    el.internalGreaterSku.textContent=`${formatNumber(summary.internalGreaterRows)} SKU`;
    el.internalGreaterQty.textContent=`${formatNumber(summary.totalInternalExcessQty)} đơn vị lẻ`;
    el.matchedSku.textContent=`${formatNumber(summary.matchedRows)} SKU`;
    el.warningSku.textContent=`${formatNumber(number(summary.unmappedRows)+number(summary.conversionMismatchRows))} SKU`;
  }

  function renderRows(rows=[]){
    if(!rows.length){
      el.table.innerHTML='<tr><td colspan="10">Không có sản phẩm phù hợp bộ lọc.</td></tr>';
      return;
    }
    el.table.innerHTML=rows.map(row=>{
      const rate=number(row.internalConversionRate||row.dmsConversionRate||1);
      const allocation=row.allocation||{};
      const difference=number(row.differenceQty);
      const diffClass=difference>0?'dms-diff-positive':difference<0?'dms-diff-negative':'';
      const diffText=difference>0?`+${formatNumber(difference)}`:formatNumber(difference);
      const warning=row.warning?` title="${escapeHtml(row.warning)}"`:'';
      return `<tr${warning}>
        <td><strong>${escapeHtml(row.productCode||'')}</strong></td>
        <td>${escapeHtml(row.productName||row.dmsProductName||'')}</td>
        <td>${formatNumber(rate)}</td>
        <td>${escapeHtml(row.dmsCaseLoose||stockDisplay(row.dmsBaseQty,row.dmsConversionRate))}<small>${formatNumber(row.dmsBaseQty)} lẻ</small></td>
        <td>${escapeHtml(stockDisplay(row.internalBaseQty,rate))}<small>${formatNumber(row.internalBaseQty)} lẻ</small></td>
        <td class="${diffClass}">${diffText}</td>
        <td>${formatNumber(allocation.openingQty||0)}</td>
        <td>${formatNumber(allocation.consumedQty||0)}</td>
        <td><strong>${formatNumber(allocation.remainingQty||0)}</strong></td>
        <td><span class="dms-status ${escapeHtml(row.comparisonType||'')}">${escapeHtml(statusLabel(row.comparisonType))}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadDmsInventory(options={}){
    if(state.loading) return;
    if(options.resetPage) state.page=1;
    state.loading=true;
    setMessage(el.message,'Đang tải dữ liệu đối chiếu...');
    const params=new URLSearchParams({
      type:el.type?.value||'internal_greater',
      search:el.search?.value?.trim()||'',
      page:String(state.page),
      limit:String(state.limit)
    });
    try{
      const response=await fetch(`/api/dms-inventory/latest?${params.toString()}`);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.ok===false) throw new Error(payload.message||'Không tải được đối chiếu DMS');
      const data=payload.data||payload;
      renderSummary(data.summary||{});
      renderRows(data.rows||[]);
      state.hasMore=Boolean(data.hasMore);
      el.prev.disabled=state.page<=1;
      el.next.disabled=!state.hasMore;
      el.count.textContent=`${formatNumber(data.total)} dòng · Trang ${state.page}`;
      if(data.import){
        el.latestInfo.textContent=`Cập nhật gần nhất: ${formatDateTime(data.import.committedAt||data.import.snapshotAt)} · File ${data.import.originalFilename||''} · Hạn mức App lấy theo chênh lệch lần này`;
        setMessage(el.message,'');
      }else{
        el.latestInfo.textContent='Chưa có file tồn DMS. App bán hàng sẽ chưa có hạn mức bán.';
        setMessage(el.message,'Hãy tải file tồn DMS buổi sáng để tạo hạn mức bán App.',true);
      }
    }catch(error){
      el.table.innerHTML=`<tr><td colspan="10">${escapeHtml(error.message||'Không tải được dữ liệu')}</td></tr>`;
      setMessage(el.message,error.message||'Không tải được dữ liệu',true);
    }finally{state.loading=false;}
  }

  function resetUpload(){
    state.preview=null;
    if(el.file) el.file.value='';
    if(el.note) el.note.value='';
    if(el.snapshotDate) el.snapshotDate.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    el.commit.disabled=true;
    el.previewSummary.hidden=true;
    el.previewSummary.innerHTML='';
    el.previewTable.innerHTML='<tr><td colspan="5">Chưa đọc file.</td></tr>';
    setMessage(el.uploadMessage,'');
  }

  function renderPreview(data={}){
    const summary=data.summary||{};
    el.previewSummary.hidden=false;
    el.previewSummary.innerHTML=[
      ['Tổng SKU',summary.totalRows],
      ['DMS > thực tế',summary.dmsGreaterRows],
      ['Thực tế > DMS',summary.internalGreaterRows],
      ['Chưa ghép mã',summary.unmappedRows],
      ['Sai quy cách',summary.conversionMismatchRows]
    ].map(([label,value])=>`<article><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></article>`).join('');
    const rows=Array.isArray(data.rows)?data.rows:[];
    el.previewTable.innerHTML=rows.length?rows.map(row=>`<tr>
      <td><strong>${escapeHtml(row.productCode||'')}</strong></td>
      <td>${escapeHtml(row.productName||row.dmsProductName||'')}</td>
      <td>${formatNumber(row.dmsBaseQty)}</td>
      <td>${formatNumber(row.internalBaseQty)}</td>
      <td>${escapeHtml(statusLabel(row.comparisonType))}</td>
    </tr>`).join(''):'<tr><td colspan="5">Không có dòng xem trước.</td></tr>';
    el.commit.disabled=false;
  }

  async function previewFile(){
    const file=el.file?.files?.[0];
    if(!file) return setMessage(el.uploadMessage,'Chưa chọn file .xlsx',true);
    const form=new FormData();
    form.append('file',file);
    form.append('snapshotDate',el.snapshotDate?.value||'');
    form.append('note',el.note?.value||'');
    el.preview.disabled=true;
    el.commit.disabled=true;
    setMessage(el.uploadMessage,'Đang đọc file và đối chiếu với tồn thực tế...');
    try{
      const response=await fetch('/api/dms-inventory/preview',{method:'POST',body:form});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.ok===false) throw new Error(payload.message||'Không đọc được file');
      state.preview=payload.data||payload;
      renderPreview(state.preview);
      setMessage(el.uploadMessage,'Đã đọc file. Kiểm tra số liệu rồi bấm xác nhận cập nhật hạn mức.');
    }catch(error){
      state.preview=null;
      setMessage(el.uploadMessage,error.message||'Không đọc được file',true);
    }finally{el.preview.disabled=false;}
  }

  async function commitPreview(){
    if(!state.preview?.importId) return;
    el.commit.disabled=true;
    setMessage(el.uploadMessage,'Đang khóa hạn mức cũ và tạo hạn mức mới...');
    try{
      const response=await fetch(`/api/dms-inventory/${encodeURIComponent(state.preview.importId)}/commit`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({previewToken:state.preview.previewToken})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.ok===false) throw new Error(payload.message||'Không lưu được file DMS');
      setMessage(el.uploadMessage,payload.message||'Đã cập nhật hạn mức bán App.');
      setTimeout(()=>{
        setModal(el.uploadModal,false);
        resetUpload();
        loadDmsInventory({resetPage:true});
      },500);
    }catch(error){
      setMessage(el.uploadMessage,error.message||'Không lưu được file DMS',true);
      el.commit.disabled=false;
    }
  }

  async function openHistory(){
    setModal(el.historyModal,true);
    el.historyTable.innerHTML='<tr><td colspan="5">Đang tải...</td></tr>';
    try{
      const response=await fetch('/api/dms-inventory/history?limit=50');
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.ok===false) throw new Error(payload.message||'Không tải được lịch sử');
      const data=payload.data||payload;
      const rows=Array.isArray(data.items)?data.items:[];
      el.historyTable.innerHTML=rows.length?rows.map(row=>`<tr>
        <td>${escapeHtml(formatDateTime(row.committedAt||row.createdAt))}</td>
        <td>${escapeHtml(row.originalFilename||'')}</td>
        <td>${formatNumber(row.dmsGreaterRows)} SKU · ${formatNumber(row.totalDmsExcessQty)} lẻ</td>
        <td>${formatNumber(row.internalGreaterRows)} SKU · ${formatNumber(row.totalInternalExcessQty)} lẻ</td>
        <td>${escapeHtml(row.importedByName||row.importedByCode||'')}</td>
      </tr>`).join(''):'<tr><td colspan="5">Chưa có lịch sử.</td></tr>';
    }catch(error){
      el.historyTable.innerHTML=`<tr><td colspan="5">${escapeHtml(error.message||'Không tải được lịch sử')}</td></tr>`;
    }
  }

  let searchTimer=null;
  el.currentSubtab?.addEventListener('click',()=>switchPanel('stockCurrentPanel'));
  el.dmsSubtab?.addEventListener('click',()=>switchPanel('dmsInventoryPanel'));
  el.reload?.addEventListener('click',()=>loadDmsInventory({resetPage:true}));
  el.type?.addEventListener('change',()=>loadDmsInventory({resetPage:true}));
  el.search?.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadDmsInventory({resetPage:true}),280);});
  el.prev?.addEventListener('click',()=>{if(state.page>1){state.page-=1;loadDmsInventory();}});
  el.next?.addEventListener('click',()=>{if(state.hasMore){state.page+=1;loadDmsInventory();}});
  el.upload?.addEventListener('click',()=>{resetUpload();setModal(el.uploadModal,true);});
  el.uploadClose?.addEventListener('click',()=>setModal(el.uploadModal,false));
  el.preview?.addEventListener('click',previewFile);
  el.commit?.addEventListener('click',commitPreview);
  el.history?.addEventListener('click',openHistory);
  el.historyClose?.addEventListener('click',()=>setModal(el.historyModal,false));
  [el.uploadModal,el.historyModal].forEach(modal=>modal?.addEventListener('click',event=>{if(event.target===modal)setModal(modal,false);}));

  applyPermissions();
  window.loadDmsInventory=loadDmsInventory;
})();
