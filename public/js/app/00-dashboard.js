'use strict';

(function initHomeDashboardModule(){
  const elements = {
    month: document.getElementById('dashboardMonth'),
    refresh: document.getElementById('dashboardRefreshButton'),
    targetButton: document.getElementById('dashboardTargetButton'),
    targetTemplateButton: document.getElementById('dashboardTargetTemplateButton'),
    targetUploadButton: document.getElementById('dashboardTargetUploadButton'),
    targetUploadInput: document.getElementById('dashboardTargetUploadInput'),
    state: document.getElementById('dashboardLoadState'),
    salesTable: document.getElementById('dashboardSalesTable'),
    deliveryMonthTable: document.getElementById('dashboardDeliveryMonthTable'),
    deliveryTodayTable: document.getElementById('dashboardDeliveryTodayTable'),
    targetTotal: document.getElementById('dashboardTargetTotal'),
    salesTotal: document.getElementById('dashboardSalesTotal'),
    returnTotal: document.getElementById('dashboardReturnTotal'),
    netSalesTotal: document.getElementById('dashboardNetSalesTotal'),
    debtTotal: document.getElementById('dashboardDebtTotal'),
    todaySalesTotal: document.getElementById('dashboardTodaySalesTotal'),
    achievementText: document.getElementById('dashboardAchievementText'),
    orderCount: document.getElementById('dashboardOrderCount'),
    todayOrderCount: document.getElementById('dashboardTodayOrderCount'),
    targetModal: document.getElementById('dashboardTargetModal'),
    targetClose: document.getElementById('dashboardTargetCloseButton'),
    targetSave: document.getElementById('dashboardTargetSaveButton'),
    targetPeriod: document.getElementById('dashboardTargetPeriod'),
    targetTable: document.getElementById('dashboardTargetTable'),
    targetMessage: document.getElementById('dashboardTargetMessage')
  };

  if(!elements.month || !elements.salesTable) return;

  let currentDashboard = null;
  let dashboardRequestController = null;

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function formatMoney(value){
    const amount = Number(value || 0);
    return `${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Number.isFinite(amount) ? amount : 0)} ₫`;
  }

  function formatPercent(value){
    const number = Number(value || 0);
    return `${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(Number.isFinite(number) ? number : 0)}%`;
  }

  function currentMonthVN(){
    const parts = new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'
    }).formatToParts(new Date()).reduce((result,part)=>{
      if(part.type!=='literal') result[part.type]=part.value;
      return result;
    },{});
    return `${parts.year}-${parts.month}`;
  }

  function readStoredUser(){
    for(const key of ['mk_web_user','v43_mobile_user']){
      try{
        const user=JSON.parse(localStorage.getItem(key)||'{}');
        if(user && user.role) return user;
      }catch(_){ }
    }
    return {};
  }

  function updateTargetPermission(user=readStoredUser()){
    const role=String(user?.role||'').toLowerCase();
    const canManageTargets=['admin','manager'].includes(role);
    elements.targetButton.hidden=!canManageTargets;
    elements.targetTemplateButton.hidden=!canManageTargets;
    elements.targetUploadButton.hidden=!canManageTargets;
  }

  function setState(message,isError=false){
    elements.state.textContent=message||'';
    elements.state.classList.toggle('error',Boolean(isError));
  }

  function setTargetMessage(message,isError=false){
    elements.targetMessage.textContent=message||'';
    elements.targetMessage.classList.toggle('error',Boolean(isError));
  }

  function statusLabel(status){
    const labels={
      achieved:'Đạt chỉ tiêu',
      near_target:'Sắp đạt',
      below_target:'Chưa đạt',
      no_target:'Chưa giao chỉ tiêu'
    };
    return labels[status]||'Chưa đạt';
  }

  function progressHtml(rate){
    const safeRate=Math.max(0,Math.min(100,Number(rate||0)));
    return `<div class="dashboard-progress"><span>${escapeHtml(formatPercent(rate))}</span><span class="dashboard-progress-track"><span class="dashboard-progress-bar" style="width:${safeRate}%"></span></span></div>`;
  }

  function renderSummary(summary={}){
    elements.targetTotal.textContent=formatMoney(summary.targetAmount);
    elements.salesTotal.textContent=formatMoney(summary.salesAmount);
    elements.returnTotal.textContent=formatMoney(summary.returnAmount);
    elements.netSalesTotal.textContent=formatMoney(summary.netSalesAmount);
    elements.debtTotal.textContent=formatMoney(summary.debtAmount);
    elements.todaySalesTotal.textContent=formatMoney(summary.todaySalesAmount);
    elements.achievementText.textContent=`Đạt ${formatPercent(summary.achievementRate)}`;
    elements.orderCount.textContent=`${Number(summary.orderCount||0)} đơn đã xác nhận`;
    elements.todayOrderCount.textContent=`${Number(summary.todayOrderCount||0)} đơn đã xác nhận`;
  }

  function renderSalesRows(rows=[]){
    if(!rows.length){
      elements.salesTable.innerHTML='<tr><td colspan="10" class="empty-cell">Chưa có dữ liệu nhân viên bán hàng trong tháng.</td></tr>';
      return;
    }
    elements.salesTable.innerHTML=rows.map(row=>{
      const displayName=row.salesStaffName||row.salesStaffCode||'Chưa xác định';
      return `<tr>
        <td><span class="dashboard-staff-name"><strong>${escapeHtml(displayName)}</strong><small>${Number(row.orderCount||0)} đơn tháng · ${Number(row.todayOrderCount||0)} đơn hôm nay</small></span></td>
        <td>${escapeHtml(row.salesStaffCode||'—')}</td>
        <td>${escapeHtml(formatMoney(row.targetAmount))}</td>
        <td>${escapeHtml(formatMoney(row.salesAmount))}</td>
        <td>${progressHtml(row.achievementRate)}</td>
        <td>${escapeHtml(formatMoney(row.returnAmount))}</td>
        <td><strong>${escapeHtml(formatMoney(row.netSalesAmount))}</strong></td>
        <td>${escapeHtml(formatMoney(row.debtAmount))}</td>
        <td>${escapeHtml(formatMoney(row.todaySalesAmount))}</td>
        <td><span class="dashboard-status-badge ${escapeHtml(row.status||'no_target')}">${escapeHtml(statusLabel(row.status))}</span></td>
      </tr>`;
    }).join('');
  }

  function renderDeliveryRows(rows=[],target,todayMode=false){
    if(!target) return;
    if(!rows.length){
      target.innerHTML='<tr><td colspan="10" class="empty-cell">Chưa có dữ liệu giao hàng trong kỳ.</td></tr>';
      return;
    }
    target.innerHTML=rows.map(row=>{
      const displayName=row.deliveryStaffName||row.deliveryStaffCode||'Chưa xác định';
      if(todayMode){
        return `<tr>
          <td><span class="dashboard-staff-name"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(formatMoney(row.deliveredAmount))} đã giao</small></span></td>
          <td>${escapeHtml(row.deliveryStaffCode||'—')}</td>
          <td>${Number(row.salesStaffCount||0)}</td>
          <td>${Number(row.assignedOrders||0)}</td>
          <td>${Number(row.deliveredOrders||0)}</td>
          <td>${Number(row.deliveringOrders||0)}</td>
          <td>${Number(row.pendingOrders||0)}</td>
          <td>${Number(row.failedOrders||0)}</td>
          <td>${escapeHtml(formatMoney(row.returnAmount))}</td>
          <td>${progressHtml(row.completionRate)}</td>
        </tr>`;
      }
      return `<tr>
        <td><span class="dashboard-staff-name"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(formatMoney(row.deliveredAmount))} đã giao</small></span></td>
        <td>${escapeHtml(row.deliveryStaffCode||'—')}</td>
        <td>${Number(row.assignedOrders||0)}</td>
        <td>${Number(row.deliveredOrders||0)}</td>
        <td>${Number(row.deliveringOrders||0)}</td>
        <td>${Number(row.pendingOrders||0)}</td>
        <td>${Number(row.failedOrders||0)}</td>
        <td>${escapeHtml(formatMoney(row.assignedAmount))}</td>
        <td>${escapeHtml(formatMoney(row.returnAmount))}</td>
        <td>${progressHtml(row.completionRate)}</td>
      </tr>`;
    }).join('');
  }

  function switchToProducts(){
    const button=document.querySelector('.tab-button[data-tab="productsTab"]');
    if(button) button.click();
  }

  function renderDashboard(data={}){
    currentDashboard=data;
    renderSummary(data.summary||{});
    renderSalesRows(data.salesByStaff||[]);
    renderDeliveryRows(data.deliveryMonth||[],elements.deliveryMonthTable,false);
    renderDeliveryRows(data.deliveryToday||[],elements.deliveryTodayTable,true);
    const generated=data.generatedAt?new Date(data.generatedAt).toLocaleString('vi-VN'):'—';
    const cached=data.cacheHit===true?' · dữ liệu cache ngắn hạn':'';
    setState(`Cập nhật lúc ${generated}${cached}`);
  }

  async function loadHomeDashboard(options={}){
    const month=String(elements.month.value||currentMonthVN());
    elements.month.value=month;
    dashboardRequestController?.abort();
    dashboardRequestController=new AbortController();
    elements.refresh.disabled=true;
    setState('Đang tổng hợp doanh số, hàng trả, công nợ và giao hàng...');
    try{
      const params=new URLSearchParams({month});
      if(options.force===true) params.set('refresh','1');
      const response=await fetch(`/api/dashboard/home?${params.toString()}`,{signal:dashboardRequestController.signal});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok || !payload.ok) throw new Error(payload.message||'Không tải được Dashboard tổng quan');
      if(payload.data?.enabled===false){
        const dashboardButton=document.querySelector('.tab-button[data-tab="dashboardTab"]');
        if(dashboardButton) dashboardButton.hidden=true;
        switchToProducts();
        return;
      }
      renderDashboard(payload.data||{});
    }catch(error){
      if(error?.name==='AbortError') return;
      setState(error?.message||'Không tải được Dashboard tổng quan',true);
      elements.salesTable.innerHTML='<tr><td colspan="10" class="empty-cell">Không tải được dữ liệu.</td></tr>';
      elements.deliveryMonthTable.innerHTML='<tr><td colspan="10" class="empty-cell">Không tải được dữ liệu.</td></tr>';
      elements.deliveryTodayTable.innerHTML='<tr><td colspan="10" class="empty-cell">Không tải được dữ liệu.</td></tr>';
    }finally{
      elements.refresh.disabled=false;
    }
  }

  function closeTargetModal(){
    elements.targetModal.hidden=true;
    elements.targetModal.setAttribute('aria-hidden','true');
  }

  async function openTargetModal(){
    const month=String(elements.month.value||currentMonthVN());
    elements.targetModal.hidden=false;
    elements.targetModal.setAttribute('aria-hidden','false');
    elements.targetPeriod.textContent=`Tháng ${month.slice(5,7)}/${month.slice(0,4)}`;
    elements.targetTable.innerHTML='<tr><td colspan="3">Đang tải danh sách chỉ tiêu...</td></tr>';
    setTargetMessage('');
    try{
      const response=await fetch(`/api/dashboard/targets?period=${encodeURIComponent(month)}`);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok || !payload.ok) throw new Error(payload.message||'Không tải được chỉ tiêu');
      const targetMap=new Map((payload.data?.targets||[]).map(row=>[String(row.salesStaffCode||''),row]));
      const staffRows=Array.isArray(currentDashboard?.salesByStaff)?currentDashboard.salesByStaff:[];
      if(!staffRows.length){
        elements.targetTable.innerHTML='<tr><td colspan="3">Chưa có tài khoản nhân viên bán hàng đang hoạt động.</td></tr>';
        return;
      }
      elements.targetTable.innerHTML=staffRows.map(row=>{
        const target=targetMap.get(String(row.salesStaffCode||''))||row;
        return `<tr>
          <td>${escapeHtml(row.salesStaffCode||'—')}</td>
          <td>${escapeHtml(row.salesStaffName||row.salesStaffCode||'Chưa xác định')}</td>
          <td><input class="dashboard-target-input" type="number" min="0" step="1000" data-code="${escapeHtml(row.salesStaffCode||'')}" data-name="${escapeHtml(row.salesStaffName||'')}" value="${Math.max(0,Number(target.targetAmount||0))}" /></td>
        </tr>`;
      }).join('');
    }catch(error){
      elements.targetTable.innerHTML='<tr><td colspan="3">Không tải được danh sách chỉ tiêu.</td></tr>';
      setTargetMessage(error?.message||'Không tải được chỉ tiêu',true);
    }
  }

  function responseErrorMessage(payload={},fallback='Có lỗi xảy ra'){
    const message=String(payload?.message||fallback);
    const details=Array.isArray(payload?.details)?payload.details:[];
    if(!details.length) return message;
    const first=details.slice(0,3).map(item=>`Dòng ${item.row||'?'}: ${item.message||'Không hợp lệ'}`).join('; ');
    return `${message}. ${first}`;
  }

  async function downloadTargetTemplate(){
    const month=String(elements.month.value||currentMonthVN());
    elements.targetTemplateButton.disabled=true;
    setState(`Đang tạo file mẫu chỉ tiêu tháng ${month}...`);
    try{
      const response=await fetch(`/api/dashboard/targets/template?period=${encodeURIComponent(month)}`);
      if(!response.ok){
        const payload=await response.json().catch(()=>({}));
        throw new Error(responseErrorMessage(payload,'Không tải được file mẫu chỉ tiêu'));
      }
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=`Mau_Chi_Tieu_NVBH_${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState(`Đã tải file mẫu chỉ tiêu tháng ${month}.`);
    }catch(error){
      setState(error?.message||'Không tải được file mẫu chỉ tiêu',true);
    }finally{
      elements.targetTemplateButton.disabled=false;
    }
  }

  async function uploadTargetFile(file){
    if(!file) return;
    const month=String(elements.month.value||currentMonthVN());
    const confirmed=window.confirm(`Upload chỉ tiêu cho tháng ${month}? Dữ liệu hợp lệ trong file sẽ cập nhật theo mã NVBH.`);
    if(!confirmed){
      elements.targetUploadInput.value='';
      return;
    }

    elements.targetUploadButton.disabled=true;
    elements.targetButton.disabled=true;
    setState(`Đang kiểm tra và upload chỉ tiêu tháng ${month}...`);
    try{
      const formData=new FormData();
      formData.append('file',file,file.name||`chi-tieu-${month}.xlsx`);
      const response=await fetch(`/api/dashboard/targets/${encodeURIComponent(month)}/import`,{
        method:'POST',
        body:formData
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok || !payload.ok){
        throw new Error(responseErrorMessage(payload,'Không upload được chỉ tiêu'));
      }
      await loadHomeDashboard({force:true});
      setState(payload.message||`Đã upload chỉ tiêu tháng ${month}.`);
    }catch(error){
      setState(error?.message||'Không upload được chỉ tiêu',true);
    }finally{
      elements.targetUploadInput.value='';
      elements.targetUploadButton.disabled=false;
      elements.targetButton.disabled=false;
    }
  }

  async function saveTargets(){
    const month=String(elements.month.value||currentMonthVN());
    const inputs=Array.from(elements.targetTable.querySelectorAll('.dashboard-target-input'));
    const targets=inputs.map(input=>({
      salesStaffCode:String(input.dataset.code||'').trim(),
      salesStaffName:String(input.dataset.name||'').trim(),
      targetAmount:Math.max(0,Math.round(Number(input.value||0)))
    })).filter(row=>row.salesStaffCode);
    if(!targets.length){
      setTargetMessage('Không có nhân viên hợp lệ để lưu chỉ tiêu.',true);
      return;
    }
    elements.targetSave.disabled=true;
    setTargetMessage('Đang lưu chỉ tiêu...');
    try{
      const response=await fetch(`/api/dashboard/targets/${encodeURIComponent(month)}`,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({targets})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok || !payload.ok) throw new Error(payload.message||'Không lưu được chỉ tiêu');
      setTargetMessage('Đã cập nhật chỉ tiêu tháng.');
      await loadHomeDashboard({force:true});
      setTimeout(closeTargetModal,350);
    }catch(error){
      setTargetMessage(error?.message||'Không lưu được chỉ tiêu',true);
    }finally{
      elements.targetSave.disabled=false;
    }
  }

  elements.month.value=currentMonthVN();
  elements.month.addEventListener('change',()=>loadHomeDashboard({force:false}));
  elements.refresh.addEventListener('click',()=>loadHomeDashboard({force:true}));
  elements.targetButton.addEventListener('click',openTargetModal);
  elements.targetTemplateButton.addEventListener('click',downloadTargetTemplate);
  elements.targetUploadButton.addEventListener('click',()=>elements.targetUploadInput.click());
  elements.targetUploadInput.addEventListener('change',()=>uploadTargetFile(elements.targetUploadInput.files?.[0]));
  elements.targetClose.addEventListener('click',closeTargetModal);
  elements.targetSave.addEventListener('click',saveTargets);
  elements.targetModal.addEventListener('click',(event)=>{
    if(event.target===elements.targetModal) closeTargetModal();
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && !elements.targetModal.hidden) closeTargetModal();
  });

  updateTargetPermission();
  Promise.resolve(window.__authReady).then(updateTargetPermission).catch(()=>{});

  window.loadHomeDashboard=loadHomeDashboard;
})();
