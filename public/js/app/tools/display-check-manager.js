(function(){
  'use strict';
  const api='/api/tools/display-check';
  const state={loaded:false,activeTab:'groups',bootstrap:null,groups:[],setups:[],plans:[],preview:null,editingGroup:null,editingStore:null};
  const $=(id)=>document.getElementById(id);
  const fmt=(n)=>Number(n||0).toLocaleString('vi-VN');
  const money=(n)=>`${fmt(Math.round(Number(n||0)))}đ`;
  const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const esc=(v)=>String(v==null?'':v).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function jsonFetch(url,options){ const res=await fetch(url,options); const data=await res.json().catch(()=>({ok:false,message:'Không đọc được phản hồi server.'})); if(!res.ok||!data.ok) throw new Error(data.message||'Lỗi API Quản lý chấm Trưng bày.'); return data; }
  function setStatus(msg,type){ const el=$('displayCheckStatus'); if(el){ el.textContent=msg||''; el.className=`message display-check-status ${type||''}`; } }
  function workingDate(){ return $('displayCheckWorkingDate')?.value||today(); }
  function groupByCode(code){ return state.groups.find(g=>g.groupCode===code); }
  function groupText(code){ const g=groupByCode(code); return g?g.groupName:code; }
  function badge(text,type){ return `<span class="display-check-badge ${type||''}">${esc(text)}</span>`; }
  function sourceLabel(g){ return `${esc(g.sourceType||'custom')}<br><small>${esc(g.sourceName||g.sourceCode||'')}</small>`; }
  function conditionLabel(g){ return g.conditionType==='quantity'?`Đủ SL: ${fmt(g.thresholdQty)}`:`Đủ tiền: ${money(g.thresholdAmount)}`; }
  function activeGroups(){ return state.groups.filter(g=>g.isActive!==false); }

  async function loadAll(){
    const date=workingDate();
    const [boot,groups,setups,plans]=await Promise.all([
      jsonFetch(`${api}/bootstrap?workingDate=${encodeURIComponent(date)}`),
      jsonFetch(`${api}/groups`),
      jsonFetch(`${api}/store-setups?date=${encodeURIComponent(date)}`),
      jsonFetch(`${api}/plans?date=${encodeURIComponent(date)}`)
    ]);
    state.bootstrap=boot.data||{}; state.groups=groups.groups||[]; state.setups=setups.setups||[]; state.plans=plans.plans||[];
    renderSources(); renderGroups(); renderStoreChoices(); renderStores(); renderPlans();
  }
  function renderSources(){
    const sel=$('displayCheckSourceCode'); if(!sel) return; const type=$('displayCheckSourceType')?.value||'product_group';
    const data=state.bootstrap||{}; let rows=[];
    if(type==='product_group') rows=data.productGroups||[];
    else if(type==='promotion_group') rows=data.promotionGroups||[];
    else if(type==='promotion_program') rows=data.promotionPrograms||[];
    if(type==='custom') { sel.innerHTML='<option value="">Custom - không liên kết nguồn</option>'; return; }
    sel.innerHTML=(rows.length?rows:[{code:'',name:'Không có nguồn'}]).map(r=>`<option value="${esc(r.code)}">${esc(r.name||r.code)} (${esc(r.code)})</option>`).join('');
  }
  function renderGroups(){
    const tb=$('displayCheckGroupsTable'); if(!tb) return;
    if(!state.groups.length){ tb.innerHTML='<tr><td colspan="6">Chưa có nhóm chấm.</td></tr>'; return; }
    tb.innerHTML=state.groups.map(g=>`<tr><td><strong>${esc(g.groupCode)}</strong></td><td>${esc(g.groupName)}</td><td>${sourceLabel(g)}</td><td>${esc(conditionLabel(g))}</td><td>${g.isActive!==false?badge('Đang dùng','ok'):badge('Tắt','bad')}</td><td><div class="display-check-mini-actions"><button type="button" data-dc-edit-group="${esc(g.id)}">Sửa</button><button type="button" class="secondary" data-dc-delete-group="${esc(g.id)}">Tắt</button></div></td></tr>`).join('');
  }
  function renderStoreChoices(selected){
    const box=$('displayCheckStoreGroupChoices'); if(!box) return; const set=new Set(selected||[]); const rows=activeGroups();
    box.innerHTML=rows.length?rows.map(g=>`<label class="display-check-choice-item"><input type="checkbox" value="${esc(g.groupCode)}" ${set.has(g.groupCode)?'checked':''}/><span><strong>${esc(g.groupName)}</strong><br><small>${esc(conditionLabel(g))}</small></span></label>`).join(''):'<span class="muted">Chưa có nhóm active.</span>';
  }
  function renderStores(){
    const tb=$('displayCheckStoresTable'); if(!tb) return;
    if(!state.setups.length){ tb.innerHTML='<tr><td colspan="7">Chưa có cửa hàng cần chấm trong ngày.</td></tr>'; return; }
    tb.innerHTML=state.setups.map(s=>`<tr><td><strong>${esc(s.customerCode)}</strong></td><td>${esc(s.customerName)}</td><td class="num">${money(s.targetAmount)}</td><td class="num">${fmt(s.targetLineCount)}</td><td>${(s.selectedGroupCodes||[]).map(c=>badge(groupText(c),'')).join(' ')||'<span class="muted">Không chọn</span>'}</td><td>${badge(s.status==='confirmed'?'Đã xác nhận':'Nháp',s.status==='confirmed'?'ok':'warn')}</td><td><div class="display-check-mini-actions"><button type="button" data-dc-generate="${esc(s.id)}">Sinh đơn</button><button type="button" class="secondary" data-dc-edit-store="${esc(s.id)}">Sửa</button><button type="button" class="secondary" data-dc-delete-store="${esc(s.id)}">Hủy</button></div></td></tr>`).join('');
  }
  function renderPlans(){
    const tb=$('displayCheckPlansTable'); if(!tb) return;
    if(!state.plans.length){ tb.innerHTML='<tr><td colspan="10">Chưa có danh sách chấm đã xác nhận trong ngày.</td></tr>'; return; }
    tb.innerHTML=state.plans.map(p=>`<tr><td>${esc(p.workingDate)}</td><td><strong>${esc(p.customerCode)}</strong></td><td>${esc(p.customerName)}</td><td class="num">${money(p.targetAmount)}</td><td class="num">${money(p.generatedAmount)}</td><td class="num">${fmt(p.actualLineCount)}/${fmt(p.targetLineCount)}</td><td>${(p.selectedGroups||[]).map(g=>badge(g.groupName||g.groupCode,g.status==='passed'?'ok':'warn')).join(' ')}</td><td>${badge(p.status==='cancelled'?'Đã hủy':'Đã xác nhận chấm',p.status==='cancelled'?'bad':'ok')}</td><td>${esc(p.confirmedBy||'')}</td><td><div class="display-check-mini-actions"><button type="button" data-dc-plan-detail="${esc(p.id)}">Chi tiết</button>${p.status!=='cancelled'?`<button type="button" class="secondary" data-dc-cancel-plan="${esc(p.id)}">Hủy</button>`:''}</div></td></tr>`).join('');
  }

  function resetGroupForm(){ state.editingGroup=null; $('displayCheckGroupId').value=''; $('displayCheckGroupFormTitle').textContent='Tạo nhóm chấm'; ['displayCheckGroupCode','displayCheckGroupName','displayCheckThresholdAmount','displayCheckThresholdQty','displayCheckGroupNote'].forEach(id=>{ const el=$(id); if(el) el.value=id.includes('Threshold')?'0':''; }); $('displayCheckGroupActive').checked=true; renderSources(); }
  function fillGroupForm(g){ state.editingGroup=g.id; $('displayCheckGroupId').value=g.id; $('displayCheckGroupFormTitle').textContent='Sửa nhóm chấm'; $('displayCheckGroupCode').value=g.groupCode; $('displayCheckGroupName').value=g.groupName; $('displayCheckSourceType').value=g.sourceType||'custom'; renderSources(); $('displayCheckSourceCode').value=g.sourceCode||''; $('displayCheckConditionType').value=g.conditionType||'amount'; $('displayCheckThresholdAmount').value=g.thresholdAmount||0; $('displayCheckThresholdQty').value=g.thresholdQty||0; $('displayCheckGroupNote').value=g.note||''; $('displayCheckGroupActive').checked=g.isActive!==false; }
  async function saveGroup(){
    const payload={ groupCode:$('displayCheckGroupCode').value, groupName:$('displayCheckGroupName').value, sourceType:$('displayCheckSourceType').value, sourceCode:$('displayCheckSourceCode').value, sourceName:$('displayCheckSourceCode').selectedOptions[0]?.textContent||'', conditionType:$('displayCheckConditionType').value, thresholdAmount:$('displayCheckThresholdAmount').value, thresholdQty:$('displayCheckThresholdQty').value, isActive:$('displayCheckGroupActive').checked, note:$('displayCheckGroupNote').value };
    const id=$('displayCheckGroupId').value; await jsonFetch(id?`${api}/groups/${id}`:`${api}/groups`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); setStatus('Đã lưu nhóm chấm.','ok'); resetGroupForm(); await loadAll();
  }
  function resetStoreForm(){ state.editingStore=null; $('displayCheckStoreId').value=''; $('displayCheckStoreFormTitle').textContent='Cài đặt cửa hàng chấm'; ['displayCheckCustomerCode','displayCheckCustomerName','displayCheckTargetAmount','displayCheckStoreNote'].forEach(id=>{ const el=$(id); if(el) el.value=''; }); $('displayCheckTargetLineCount').value='5'; renderStoreChoices(); }
  function fillStoreForm(s){ state.editingStore=s.id; $('displayCheckStoreId').value=s.id; $('displayCheckStoreFormTitle').textContent='Sửa cửa hàng chấm'; $('displayCheckCustomerCode').value=s.customerCode; $('displayCheckCustomerName').value=s.customerName; $('displayCheckTargetAmount').value=s.targetAmount; $('displayCheckTargetLineCount').value=s.targetLineCount; $('displayCheckStoreNote').value=s.note||''; renderStoreChoices(s.selectedGroupCodes||[]); }
  function selectedStoreGroups(){ return Array.from(document.querySelectorAll('#displayCheckStoreGroupChoices input[type="checkbox"]:checked')).map(el=>el.value); }
  async function saveStore(){
    const payload={ workingDate:workingDate(), customerCode:$('displayCheckCustomerCode').value, targetAmount:$('displayCheckTargetAmount').value, targetLineCount:$('displayCheckTargetLineCount').value, selectedGroupCodes:selectedStoreGroups(), note:$('displayCheckStoreNote').value };
    const id=$('displayCheckStoreId').value; const data=await jsonFetch(id?`${api}/store-setups/${id}`:`${api}/store-setups`,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); $('displayCheckCustomerName').value=data.setup?.customerName||''; setStatus('Đã lưu cửa hàng chấm.','ok'); resetStoreForm(); await loadAll();
  }
  async function generateForSetup(id){
    const s=state.setups.find(x=>x.id===id); if(!s) return; setStatus('Đang sinh preview danh sách chấm...','');
    const payload={ workingDate:workingDate(), customerCode:s.customerCode, targetAmount:s.targetAmount, targetLineCount:s.targetLineCount, selectedGroupCodes:s.selectedGroupCodes, dmsGapType:$('displayCheckDmsGapType').value, toleranceAmount:$('displayCheckToleranceAmount').value, maxOverAmount:$('displayCheckMaxOverAmount').value, allowOverTargetForDisplay:$('displayCheckAllowOverTarget').checked };
    const data=await jsonFetch(`${api}/generate-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); state.preview=data.preview; renderPreviewModal();
  }
  function renderPreviewModal(){
    const p=state.preview; if(!p) return; const s=p.summary||{}; $('displayCheckPreviewSummary').textContent=`${s.customerCode} - ${s.customerName} · Cần chấm ${money(s.targetAmount)} · Đã sinh ${money(s.generatedAmount)} · ${s.actualLineCount}/${s.targetLineCount} dòng · ${p.feasible?'Khả thi':'Không khả thi'}`;
    $('displayCheckPreviewAlerts').innerHTML=[...(p.errors||[]).map(e=>`<div class="display-check-alert error">${esc(e.message||e.type)}</div>`),...(p.warnings||[]).map(w=>`<div class="display-check-alert warn">${esc(w.message||w.type)}</div>`)].join('');
    $('displayCheckPreviewGroups').innerHTML=(p.selectedGroups||[]).map(g=>`<tr><td>${esc(g.groupCode)}</td><td>${esc(g.groupName)}</td><td>${g.conditionType==='quantity'?'Số lượng':'Doanh số'}</td><td class="num">${g.conditionType==='quantity'?fmt(g.thresholdQty):money(g.thresholdAmount)}</td><td class="num">${g.conditionType==='quantity'?fmt(g.generatedQty):money(g.generatedAmount)}</td><td class="num">${g.conditionType==='quantity'?fmt(g.remainingQty):money(g.remainingAmount)}</td><td>${badge(g.status==='passed'?'Đạt':'Không đạt',g.status==='passed'?'ok':'bad')}</td></tr>`).join('')||'<tr><td colspan="7">Không chọn nhóm trưng bày.</td></tr>';
    $('displayCheckPreviewItems').innerHTML=(p.items||[]).map(i=>`<tr><td>${esc(i.productCode)}</td><td>${esc(i.productName)}</td><td>${(i.groupCodes||[]).map(c=>badge(groupText(c),'')).join(' ')}</td><td class="num">${fmt(i.qty)}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.amount)}</td><td>${esc(i.reason||'')}</td></tr>`).join('')||'<tr><td colspan="7">Chưa sinh được sản phẩm.</td></tr>';
    $('displayCheckConfirmPreviewButton').disabled=!p.feasible;
    $('displayCheckPreviewModal').hidden=false;
  }
  async function confirmPreview(){ if(!state.preview) return; await jsonFetch(`${api}/confirm-plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({previewPayload:state.preview})}); $('displayCheckPreviewModal').hidden=true; state.preview=null; setStatus('Đã xác nhận chấm và lưu vào Tab 3.','ok'); await loadAll(); }
  async function showPlanDetail(id){ const data=await jsonFetch(`${api}/plans/${id}`); const p=data.plan; $('displayCheckDetailBody').innerHTML=`<p><strong>${esc(p.planCode)}</strong> · ${esc(p.customerCode)} - ${esc(p.customerName)} · ${money(p.generatedAmount)}</p><h4>Nhóm chấm</h4><div class="display-check-table-wrap"><table class="display-check-table"><thead><tr><th>Nhóm</th><th>Điều kiện</th><th>Đã sinh</th><th>Trạng thái</th></tr></thead><tbody>${(p.selectedGroups||[]).map(g=>`<tr><td>${esc(g.groupName||g.groupCode)}</td><td>${g.conditionType==='quantity'?fmt(g.thresholdQty):money(g.thresholdAmount)}</td><td>${g.conditionType==='quantity'?fmt(g.generatedQty):money(g.generatedAmount)}</td><td>${badge(g.status==='passed'?'Đạt':'Không đạt',g.status==='passed'?'ok':'bad')}</td></tr>`).join('')}</tbody></table></div><h4>Sản phẩm</h4><div class="display-check-table-wrap"><table class="display-check-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th>SL</th><th>Giá</th><th>Thành tiền</th><th>Lý do</th></tr></thead><tbody>${(p.items||[]).map(i=>`<tr><td>${esc(i.productCode)}</td><td>${esc(i.productName)}</td><td class="num">${fmt(i.qty)}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.amount)}</td><td>${esc(i.reason||'')}</td></tr>`).join('')}</tbody></table></div>`; $('displayCheckDetailModal').hidden=false; }

  function bind(){
    $('displayCheckWorkingDate')?.addEventListener('change',()=>loadAll().catch(e=>setStatus(e.message,'error')));
    document.querySelectorAll('.display-check-tab').forEach(btn=>btn.addEventListener('click',()=>{ state.activeTab=btn.dataset.displayCheckTab; document.querySelectorAll('.display-check-tab').forEach(b=>b.classList.toggle('active',b===btn)); document.querySelectorAll('.display-check-panel').forEach(p=>p.classList.toggle('active',p.dataset.displayCheckPanel===state.activeTab)); }));
    $('displayCheckSourceType')?.addEventListener('change',renderSources);
    $('displayCheckSaveGroupButton')?.addEventListener('click',()=>saveGroup().catch(e=>setStatus(e.message,'error'))); $('displayCheckResetGroupButton')?.addEventListener('click',resetGroupForm); $('displayCheckReloadGroupsButton')?.addEventListener('click',()=>loadAll().catch(e=>setStatus(e.message,'error')));
    $('displayCheckSaveStoreButton')?.addEventListener('click',()=>saveStore().catch(e=>setStatus(e.message,'error'))); $('displayCheckResetStoreButton')?.addEventListener('click',resetStoreForm); $('displayCheckReloadStoresButton')?.addEventListener('click',()=>loadAll().catch(e=>setStatus(e.message,'error'))); $('displayCheckReloadPlansButton')?.addEventListener('click',()=>loadAll().catch(e=>setStatus(e.message,'error')));
    $('displayCheckClosePreviewButton')?.addEventListener('click',()=>$('displayCheckPreviewModal').hidden=true); $('displayCheckSkipPreviewButton')?.addEventListener('click',()=>$('displayCheckPreviewModal').hidden=true); $('displayCheckConfirmPreviewButton')?.addEventListener('click',()=>confirmPreview().catch(e=>setStatus(e.message,'error'))); $('displayCheckCloseDetailButton')?.addEventListener('click',()=>$('displayCheckDetailModal').hidden=true);
    document.addEventListener('click',(ev)=>{ const t=ev.target; const eg=t.closest('[data-dc-edit-group]'); if(eg){ const g=state.groups.find(x=>x.id===eg.dataset.dcEditGroup); if(g) fillGroupForm(g); } const dg=t.closest('[data-dc-delete-group]'); if(dg&&confirm('Tắt nhóm chấm này?')) jsonFetch(`${api}/groups/${dg.dataset.dcDeleteGroup}`,{method:'DELETE'}).then(loadAll).catch(e=>setStatus(e.message,'error')); const es=t.closest('[data-dc-edit-store]'); if(es){ const s=state.setups.find(x=>x.id===es.dataset.dcEditStore); if(s) fillStoreForm(s); } const ds=t.closest('[data-dc-delete-store]'); if(ds&&confirm('Hủy cấu hình cửa hàng này?')) jsonFetch(`${api}/store-setups/${ds.dataset.dcDeleteStore}`,{method:'DELETE'}).then(loadAll).catch(e=>setStatus(e.message,'error')); const gen=t.closest('[data-dc-generate]'); if(gen) generateForSetup(gen.dataset.dcGenerate).catch(e=>setStatus(e.message,'error')); const det=t.closest('[data-dc-plan-detail]'); if(det) showPlanDetail(det.dataset.dcPlanDetail).catch(e=>setStatus(e.message,'error')); const cp=t.closest('[data-dc-cancel-plan]'); if(cp&&confirm('Hủy danh sách chấm này?')) jsonFetch(`${api}/plans/${cp.dataset.dcCancelPlan}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Hủy từ giao diện'})}).then(loadAll).catch(e=>setStatus(e.message,'error')); });
  }
  async function loadDisplayCheckManager(){ if(!$('displayCheckManagerTab')) return; if(!state.loaded){ state.loaded=true; $('displayCheckWorkingDate').value=today(); bind(); } setStatus('Đang tải Quản lý chấm Trưng bày...',''); try{ await loadAll(); setStatus('Đã tải dữ liệu Quản lý chấm Trưng bày.','ok'); }catch(e){ setStatus(e.message,'error'); } }
  window.loadDisplayCheckManager=loadDisplayCheckManager;
})();
