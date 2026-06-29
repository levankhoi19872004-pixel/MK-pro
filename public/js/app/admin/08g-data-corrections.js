'use strict';

(function initAdminDataCorrections(){
  const table=document.getElementById('adminCorrectionsTable');
  const form=document.getElementById('adminCorrectionForm');
  const message=document.getElementById('adminCorrectionFormMessage');
  const detail=document.getElementById('adminCorrectionDetailBox');
  const reloadButton=document.getElementById('reloadAdminCorrectionsButton');
  const standardButton=document.getElementById('loadAdminCorrectionStandardButton');
  const standardBox=document.getElementById('adminCorrectionStandardBox');
  const validateButton=document.getElementById('validateAdminCorrectionButton');
  const pendingCount=document.getElementById('adminCorrectionPendingCount');
  const highRiskCount=document.getElementById('adminCorrectionHighRiskCount');
  const appliedCount=document.getElementById('adminCorrectionAppliedCount');
  if(!table||!form) return;

  let rows=[];

  function esc(value){
    return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function setMessage(text,isError=false){
    if(!message) return;
    message.textContent=text||'';
    message.classList.toggle('error',Boolean(isError));
  }

  function pretty(value){
    try{return JSON.stringify(value,null,2);}catch(_){return String(value??'');}
  }

  async function api(url,options={}){
    const res=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
    const json=await res.json().catch(()=>({ok:false,message:'Không đọc được phản hồi máy chủ'}));
    if(!res.ok||json.ok===false) throw new Error(json.message||'API lỗi');
    return json.data??json;
  }

  function statusLabel(status){
    const map={pending:'Chờ duyệt',approved:'Đã duyệt',applied:'Đã áp dụng',rejected:'Từ chối',rolled_back:'Đã rollback',draft:'Nháp'};
    return map[status]||status||'-';
  }

  function riskClass(risk){
    if(risk==='high') return 'danger';
    if(risk==='medium') return 'warning';
    return 'success';
  }

  function updateSummary(){
    if(pendingCount) pendingCount.textContent=String(rows.filter(r=>r.status==='pending').length);
    if(highRiskCount) highRiskCount.textContent=String(rows.filter(r=>r.riskLevel==='high').length);
    if(appliedCount) appliedCount.textContent=String(rows.filter(r=>r.status==='applied').length);
  }

  function render(){
    updateSummary();
    if(!rows.length){
      table.innerHTML='<tr><td colspan="9" class="empty-cell">Chưa có phiếu chỉnh sửa số liệu.</td></tr>';
      return;
    }
    table.innerHTML=rows.map(row=>`<tr data-correction-id="${esc(row.id||row.correctionCode)}">
      <td><strong>${esc(row.correctionCode||row.id)}</strong></td>
      <td>${esc(row.entityType||'-')}</td>
      <td>${esc(row.entityCode||row.entityId||'-')}</td>
      <td><span class="badge ${riskClass(row.riskLevel)}">${esc(row.riskLevel||'-')}</span></td>
      <td>${esc(statusLabel(row.status))}</td>
      <td title="${esc(row.reason||'')}">${esc(String(row.reason||'').slice(0,80))}</td>
      <td>${esc(row.requestedBy?.name||row.requestedBy?.username||'-')}</td>
      <td>${esc(String(row.createdAt||'').replace('T',' ').slice(0,19))}</td>
      <td class="button-row compact-actions">
        <button type="button" class="small secondary" data-admin-correction-action="detail">Xem</button>
        <button type="button" class="small" data-admin-correction-action="approve">Duyệt</button>
        <button type="button" class="small success" data-admin-correction-action="apply">Áp dụng</button>
        <button type="button" class="small danger" data-admin-correction-action="rollback">Rollback</button>
      </td>
    </tr>`).join('');
  }

  async function loadCorrections(){
    table.innerHTML='<tr><td colspan="9">Đang tải phiếu chỉnh sửa...</td></tr>';
    try{
      rows=await api('/api/admin/corrections?limit=100');
      render();
    }catch(err){
      table.innerHTML=`<tr><td colspan="9" class="error">${esc(err.message)}</td></tr>`;
    }
  }

  function parsePatch(){
    const raw=String(form.elements.proposedPatch?.value||'').trim();
    if(!raw) throw new Error('Cần nhập patch JSON / dữ liệu điều chỉnh');
    try{return JSON.parse(raw);}catch(err){throw new Error(`Patch JSON không hợp lệ: ${err.message}`);}
  }

  function formBody(){
    const patch=parsePatch();
    const entityType=String(form.elements.entityType?.value||'').trim();
    const entityId=String(form.elements.entityId?.value||'').trim();
    const correctionType=String(form.elements.correctionType?.value||'').trim();
    const reason=String(form.elements.reason?.value||'').trim();
    return {entityType, entityId, entityCode:entityId, correctionType, proposedPatch:patch, reason, applyImmediately:Boolean(form.elements.applyImmediately?.checked)};
  }

  async function submitForm(event){
    event.preventDefault();
    setMessage('Đang tạo phiếu...');
    try{
      const body=formBody();
      const data=await api('/api/admin/corrections',{method:'POST',body:JSON.stringify(body)});
      detail.textContent=pretty(data);
      setMessage('Đã tạo phiếu chỉnh sửa số liệu.');
      form.reset();
      await loadCorrections();
    }catch(err){setMessage(err.message,true);}
  }

  async function validateForm(){
    setMessage('Đang kiểm tra patch...');
    try{
      const body=formBody();
      if(['inventory','ar','fund'].includes(body.entityType)){
        detail.textContent=pretty({message:'Nhóm tồn kho/công nợ/quỹ sẽ được tạo phiếu điều chỉnh ledger.', body});
        setMessage('Dữ liệu điều chỉnh ledger hợp lệ về mặt JSON.');
        return;
      }
      const data=await api(`/api/admin/entities/${encodeURIComponent(body.entityType)}/${encodeURIComponent(body.entityId)}/validate-change`,{method:'POST',body:JSON.stringify({proposedPatch:body.proposedPatch})});
      detail.textContent=pretty(data);
      setMessage('Đã kiểm tra thay đổi.');
    }catch(err){setMessage(err.message,true);}
  }

  async function loadStandard(){
    try{
      const data=await api('/api/admin/data-correction/standard');
      standardBox.hidden=false;
      standardBox.innerHTML=`<strong>${esc(data.summary)}</strong><ul>${(data.riskGroups||[]).map(g=>`<li><b>Nhóm ${esc(g.group)}</b> - ${esc(g.riskLevel)}: ${esc(g.method)}</li>`).join('')}</ul>`;
    }catch(err){setMessage(err.message,true);}
  }

  async function handleTableClick(event){
    const button=event.target.closest('[data-admin-correction-action]');
    if(!button) return;
    const tr=button.closest('tr[data-correction-id]');
    const id=tr?.getAttribute('data-correction-id');
    if(!id) return;
    const action=button.getAttribute('data-admin-correction-action');
    try{
      if(action==='detail'){
        const data=await api(`/api/admin/corrections/${encodeURIComponent(id)}`);
        detail.textContent=pretty(data);
        return;
      }
      if(action==='approve'){
        const data=await api(`/api/admin/corrections/${encodeURIComponent(id)}/approve`,{method:'POST',body:JSON.stringify({note:'Duyệt từ Trung tâm chỉnh sửa số liệu'})});
        detail.textContent=pretty(data);
      }
      if(action==='apply'){
        const data=await api(`/api/admin/corrections/${encodeURIComponent(id)}/apply`,{method:'POST',body:'{}'});
        detail.textContent=pretty(data);
      }
      if(action==='rollback'){
        const reason=prompt('Nhập lý do rollback phiếu chỉnh sửa:');
        if(!reason) return;
        const data=await api(`/api/admin/corrections/${encodeURIComponent(id)}/rollback`,{method:'POST',body:JSON.stringify({reason})});
        detail.textContent=pretty(data);
      }
      await loadCorrections();
    }catch(err){setMessage(err.message,true);}
  }

  form.addEventListener('submit',submitForm);
  validateButton?.addEventListener('click',validateForm);
  reloadButton?.addEventListener('click',loadCorrections);
  standardButton?.addEventListener('click',loadStandard);
  table.addEventListener('click',handleTableClick);
  document.querySelector('[data-tab="adminCorrectionsTab"]')?.addEventListener('click',loadCorrections);
})();
