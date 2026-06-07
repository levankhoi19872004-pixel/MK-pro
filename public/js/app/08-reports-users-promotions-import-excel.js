let importShortageActionMode='';
let importPreviewSessionId='';
let importSelectedRowKeySet=new Set();
const IMPORT_PREVIEW_RENDER_LIMIT=Number(window.IMPORT_PREVIEW_RENDER_LIMIT||120);

function reportDateInRange(dateText, fromDate, toDate){
  return isDateInRange(dateText, fromDate, toDate);
}

function orderSourceLabel(source, row){
  const order={...(row||{}), orderSource: source ?? row?.orderSource};
  const value=[order.orderSource,order.source,order.sourceType,order.orderSourceName,order.importSource,order.importType,order.origin,order.note].filter(Boolean).join(' ').toUpperCase();
  if(/(^|[^A-Z])DMS([^A-Z]|$)|DMS_IMPORT|IMPORT EXCEL DMS|EXCEL DMS|FILE DMS|UNILEVER DMS/.test(value))return '<span class="badge source-dms">Từ DMS</span>';
  return '<span class="badge source-nvbh">Từ NVBH</span>';
}

function deliveryLabel(status){
  if(status==='delivered')return 'Đã giao';
  if(status==='failed')return 'Giao lỗi';
  if(status==='cancelled')return 'Đã hủy';
  return 'Chờ giao';
}
function setReportDefaults(){
  if(reportFromDate && !reportFromDate.value)reportFromDate.value=today();
  if(reportToDate && !reportToDate.value)reportToDate.value=today();
}
async function fetchJson(url){
  const res=await fetch(url);
  const json=await res.json();
  if(!json.ok)throw new Error(json.message||`Không tải được ${url}`);
  return json;
}
function exportReportExcel(type){
  const cleanType=String(type||'').trim();
  if(!cleanType)return;
  setReportDefaults();
  const params=new URLSearchParams();
  const from=reportFromDate?.value||document.getElementById('reportFromDate')?.value||'';
  const to=reportToDate?.value||document.getElementById('reportToDate')?.value||'';
  if(from)params.set('dateFrom',from);
  if(to)params.set('dateTo',to);
  params.set('limit','100000');
  window.location.href=`/api/export/${encodeURIComponent(cleanType)}.xlsx?${params.toString()}`;
}

async function loadReports(){
  setReportDefaults();
  if(reportSalesSummary){
    reportSalesSummary.textContent='Báo cáo chi tiết đã chuyển sang xuất Excel theo yêu cầu. Dashboard không tải bảng realtime để hệ thống nhẹ hơn.';
  }
  if(reportRevenue)reportRevenue.textContent='0';
  if(reportCollected)reportCollected.textContent='0';
  if(reportDebt)reportDebt.textContent='0';
  if(reportCashBalance)reportCashBalance.textContent='0';
  if(reportOrderCount)reportOrderCount.textContent='Chọn mẫu Excel để xuất';
}

function initReportExportButtons(){
  document.querySelectorAll('.report-export-btn[data-report-type]').forEach(btn=>{
    if(btn.dataset.boundReportExport==='1')return;
    btn.dataset.boundReportExport='1';
    btn.addEventListener('click',()=>exportReportExcel(btn.dataset.reportType));
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initReportExportButtons);
}else{
  initReportExportButtons();
}





function roleText(role){
  const map={admin:'Admin',accountant:'Kế toán',sales:'Bán hàng',delivery:'Giao hàng'};
  return map[role]||role||'';
}
async function loadUsers(){
  try{
    const q=encodeURIComponent(userSearchInput?.value||'');
    const res=await fetch(`/api/users?q=${q}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được tài khoản');
    usersCache=json.users||[];
    window.__usersCache = usersCache;
    try { window.usersCache = usersCache; } catch(e) {}
    renderSalesStaffSelect();
    if(!userTable)return;
    if(userCount)userCount.textContent=`${usersCache.length} tài khoản`;
    if(!usersCache.length){userTable.innerHTML='<tr><td colspan="7">Chưa có tài khoản.</td></tr>';return}
    userTable.innerHTML=usersCache.map(u=>`<tr>
      <td><strong>${u.code||''}</strong></td><td>${u.username||''}</td><td>${u.name||u.fullName||''}</td><td>${u.phone||''}</td>
      <td><span class="badge active">${roleText(u.role)}</span></td><td>${u.isActive!==false?'Đang hoạt động':'Ngừng'}</td>
      <td class="row-actions"><button class="small" onclick="editUser('${u.id}')">Sửa</button><button class="small danger" onclick="deleteUser('${u.id}')">Xóa</button></td>
    </tr>`).join('');
  }catch(err){userTable.innerHTML=`<tr><td colspan="7">${err.message}</td></tr>`}
}
function resetUserForm(){if(userForm){userForm.reset();userForm.elements.id.value='';userForm.elements.isActive.checked=true} if(userMessage)showMessage(userMessage,'')}
function editUser(id){
  const u=usersCache.find(x=>String(x.id)===String(id)); if(!u||!userForm)return;
  userForm.elements.id.value=u.id||''; userForm.elements.code.value=u.code||''; userForm.elements.username.value=u.username||'';
  userForm.elements.password.value=''; userForm.elements.name.value=u.name||u.fullName||''; userForm.elements.phone.value=u.phone||'';
  userForm.elements.role.value=u.role||'sales'; userForm.elements.isActive.checked=u.isActive!==false;
  document.querySelector('[data-tab="usersTab"]')?.click();
}
async function deleteUser(id){
  if(!confirm('Xóa tài khoản này?'))return;
  try{const res=await fetch(`/api/users/${encodeURIComponent(id)}`,{method:'DELETE'});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã xóa');await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}
async function submitUser(event){
  event.preventDefault();
  const body=Object.fromEntries(new FormData(userForm).entries()); body.isActive=userForm.elements.isActive.checked;
  try{const res=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(userMessage,json.message||'Đã lưu');resetUserForm();await loadUsers()}catch(err){showMessage(userMessage,err.message,true)}
}

function promotionTypeText(type){return {discount:'Chiết khấu',display:'Trưng bày',coupon:'Coupon',ontop:'Ontop',combo:'Combo'}[type]||type||''}
async function loadPromotions(){
  if(!promotionTable)return;
  try{
    const q=encodeURIComponent(promotionSearchInput?.value||'');
    const res=await fetch(`/api/promotions?q=${q}`);
    const json=await res.json(); if(!json.ok)throw new Error(json.message||'Không tải được khuyến mại');
    promotionsCache=json.promotions||[]; if(promotionCount)promotionCount.textContent=`${promotionsCache.length} chương trình`;
    if(!promotionsCache.length){promotionTable.innerHTML='<tr><td colspan="6">Chưa có chương trình khuyến mại.</td></tr>';return}
    promotionTable.innerHTML=promotionsCache.map(p=>`<tr>
      <td><strong>${p.code||''}</strong><br><span class="muted">${promotionTypeText(p.type)}</span></td>
      <td><strong>${p.name||''}</strong><br><span class="muted">Điều kiện: ${p.conditionText||'-'}</span><br><span class="muted">CK/Thưởng: ${p.discountText||'-'}</span>${p.displayReward?`<br><span class="muted">Trưng bày: ${p.displayReward}</span>`:''}${p.couponText?`<br><span class="muted">Coupon: ${p.couponText}</span>`:''}${p.ontopText?`<br><span class="muted">Ontop: ${p.ontopText}</span>`:''}</td>
      <td>${(p.productCodes||[]).slice(0,8).join(', ')}${(p.productCodes||[]).length>8?'...':''}</td>
      <td>${p.startDate||''} ${p.endDate?`→ ${p.endDate}`:''}</td>
      <td><span class="badge ${p.isActive!==false?'active':'inactive'}">${p.isActive!==false?'Đang áp dụng':'Ngừng'}</span></td>
      <td class="row-actions"><button class="small" onclick="editPromotion('${p.id}')">Sửa</button><button class="small danger" onclick="deletePromotion('${p.id}')">Xóa</button></td>
    </tr>`).join('');
  }catch(err){promotionTable.innerHTML=`<tr><td colspan="6">${err.message}</td></tr>`}
}
function resetPromotionForm(){if(promotionForm){promotionForm.reset();promotionForm.elements.id.value='';promotionForm.elements.isActive.checked=true} if(promotionMessage)showMessage(promotionMessage,'')}
function editPromotion(id){
  const p=promotionsCache.find(x=>String(x.id)===String(id)); if(!p||!promotionForm)return;
  ['id','code','name','type','conditionText','discountText','displayReward','couponText','ontopText','startDate','endDate','note'].forEach(k=>{if(promotionForm.elements[k])promotionForm.elements[k].value=p[k]||''});
  promotionForm.elements.productCodes.value=(p.productCodes||[]).join('\n'); promotionForm.elements.isActive.checked=p.isActive!==false;
  document.querySelector('[data-tab="promotionsTab"]')?.click();
}
async function deletePromotion(id){
  if(!confirm('Xóa chương trình khuyến mại này?'))return;
  try{const res=await fetch(`/api/promotions/${encodeURIComponent(id)}`,{method:'DELETE'});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(promotionMessage,json.message||'Đã xóa');await loadPromotions()}catch(err){showMessage(promotionMessage,err.message,true)}
}
async function submitPromotion(event){
  event.preventDefault();
  const body=Object.fromEntries(new FormData(promotionForm).entries()); body.isActive=promotionForm.elements.isActive.checked;
  try{const res=await fetch('/api/promotions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await res.json();if(!json.ok)throw new Error(json.message);showMessage(promotionMessage,json.message||'Đã lưu');resetPromotionForm();await loadPromotions()}catch(err){showMessage(promotionMessage,err.message,true)}
}

// Import dữ liệu Excel

function getCurrentImportFields(){
  return customImportFields || [];
}
function createMappingRow(field={}){
  const options=getCurrentImportFields().map(item=>`<option value="${escapeHtml(item.field)}" ${item.field===(field.dbField||'')?'selected':''}>${escapeHtml(item.label)} (${escapeHtml(item.field)})</option>`).join('');
  return `<tr>
    <td><input class="custom-excel-header" placeholder="VD: Mã KH" value="${escapeHtml(field.excelHeader||'')}" /></td>
    <td><select class="custom-db-field"><option value="">Chọn trường...</option>${options}</select></td>
    <td class="center"><input class="custom-required" type="checkbox" ${field.required?'checked':''} /></td>
    <td><input class="custom-default" placeholder="Có thể bỏ trống" value="${escapeHtml(field.defaultValue||'')}" /></td>
    <td><button type="button" class="secondary remove-custom-map">Xóa</button></td>
  </tr>`;
}
function renderCustomImportMapping(fields){
  if(!customImportMappingTable)return;
  const rows=(fields&&fields.length)?fields:[{excelHeader:'',dbField:'',required:false,defaultValue:''}];
  customImportMappingTable.innerHTML=rows.map(createMappingRow).join('');
}
function readCustomImportMapping(){
  if(!customImportMappingTable)return[];
  return Array.from(customImportMappingTable.querySelectorAll('tr')).map(row=>({
    excelHeader:(row.querySelector('.custom-excel-header')?.value||'').trim(),
    dbField:(row.querySelector('.custom-db-field')?.value||'').trim(),
    required:!!row.querySelector('.custom-required')?.checked,
    defaultValue:(row.querySelector('.custom-default')?.value||'').trim()
  })).filter(field=>field.excelHeader&&field.dbField);
}
async function loadImportFieldOptions(){
  if(!importDataType||!customImportMappingTable)return;
  try{
    const res=await fetch(`/api/import/fields/${encodeURIComponent(importDataType.value)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được trường import');
    customImportFields=json.fields||[];
    renderCustomImportMapping(readCustomImportMapping());
  }catch(err){customImportMappingTable.innerHTML=`<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`}
}
async function loadCustomImportTemplates(){
  if(!customImportTemplateSelect)return;
  try{
    const res=await fetch('/api/import/custom-templates');
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được mẫu tự tạo');
    customImportTemplates=json.templates||[];
    const type=importDataType?importDataType.value:'';
    const options=customImportTemplates.filter(t=>!type||t.type===type).map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} - ${escapeHtml(t.code||'')}</option>`).join('');
    customImportTemplateSelect.innerHTML=`<option value="">Không dùng mẫu tự tạo</option>${options}`;
  }catch(err){
    if(commitImportButton){
      commitImportButton.disabled=false;
      if(commitImportButton.dataset.originalText) commitImportButton.textContent=commitImportButton.dataset.originalText;
    }
    document.querySelectorAll('#stopShortageImportButton,#continueShortageImportButton').forEach(btn=>{btn.disabled=false;});
    showMessage(importDataMessage,err.message,true);
  }
}
function getSelectedCustomTemplate(){
  const id=customImportTemplateSelect?customImportTemplateSelect.value:'';
  return customImportTemplates.find(t=>t.id===id)||null;
}
function loadSelectedCustomTemplateToEditor(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  if(customImportTemplateName)customImportTemplateName.value=template.name||'';
  if(importDataType)importDataType.value=template.type||importDataType.value;
  loadImportFieldOptions().then(()=>renderCustomImportMapping(template.fields||[]));
}
async function saveCustomImportTemplate(){
  if(!importDataType)return;
  const fields=readCustomImportMapping();
  if(!fields.length){showMessage(importDataMessage,'Bạn chưa map cột Excel nào',true);return;}
  const selected=getSelectedCustomTemplate();
  const body={
    id:selected?selected.id:'',
    code:selected?selected.code:'',
    name:(customImportTemplateName&&customImportTemplateName.value.trim())||'Mẫu import tự tạo',
    type:importDataType.value,
    sheetName:'Import',
    startRow:2,
    fields
  };
  try{
    const res=await fetch('/api/import/custom-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không lưu được mẫu');
    showMessage(importDataMessage,json.message||'Đã lưu mẫu import');
    await loadCustomImportTemplates();
    if(json.template&&customImportTemplateSelect)customImportTemplateSelect.value=json.template.id;
  }catch(err){
    if(commitImportButton){
      commitImportButton.disabled=false;
      if(commitImportButton.dataset.originalText) commitImportButton.textContent=commitImportButton.dataset.originalText;
    }
    document.querySelectorAll('#stopShortageImportButton,#continueShortageImportButton').forEach(btn=>{btn.disabled=false;});
    showMessage(importDataMessage,err.message,true);
  }
}
function downloadCustomImportTemplate(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  window.location.href=`/api/import/custom-template/${encodeURIComponent(template.id)}/download`;
}
async function deleteCustomImportTemplate(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  if(!confirm('Xóa mẫu import tự tạo này?'))return;
  try{
    const res=await fetch(`/api/import/custom-templates/${encodeURIComponent(template.id)}`,{method:'DELETE'});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không xóa được mẫu');
    showMessage(importDataMessage,json.message||'Đã xóa mẫu');
    if(customImportTemplateName)customImportTemplateName.value='';
    await loadCustomImportTemplates();
    renderCustomImportMapping([]);
  }catch(err){
    if(commitImportButton){
      commitImportButton.disabled=false;
      if(commitImportButton.dataset.originalText) commitImportButton.textContent=commitImportButton.dataset.originalText;
    }
    document.querySelectorAll('#stopShortageImportButton,#continueShortageImportButton').forEach(btn=>{btn.disabled=false;});
    showMessage(importDataMessage,err.message,true);
  }
}
function resetImportPreviewMessage(){
  if(importDataMessage)showMessage(importDataMessage,'');
}
function getImportRowSelectKey(row,index){
  const code=String(row?.documentCode||row?.orderCode||row?.code||'').trim();
  return code || `ROW_${index}`;
}
function initImportSelectedRows(rows=[]){
  importSelectedRowKeySet=new Set();
  rows.forEach((row,index)=>{
    if(row&&row.valid&&row.canImport!==false)importSelectedRowKeySet.add(getImportRowSelectKey(row,index));
  });
}
function syncImportInlineSelection(){
  document.querySelectorAll('.import-row-check').forEach(cb=>{
    const index=Number(cb.dataset.index);
    const row=importPreviewRows[index];
    const key=getImportRowSelectKey(row,index);
    if(cb.checked)importSelectedRowKeySet.add(key);
    else importSelectedRowKeySet.delete(key);
  });
  syncImportSelectedCount();
}
function bindImportInlinePreviewChecks(){
  document.querySelectorAll('.import-row-check').forEach(cb=>{
    const index=Number(cb.dataset.index);
    const row=importPreviewRows[index];
    cb.checked=importSelectedRowKeySet.has(getImportRowSelectKey(row,index));
    cb.onchange=syncImportInlineSelection;
  });
}
function getSelectedImportRows(){
  return importPreviewRows.filter((row,index)=>row&&row.valid&&row.canImport!==false&&importSelectedRowKeySet.has(getImportRowSelectKey(row,index)));
}
function escapeImportHtml(value){
  return String(value ?? '').replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}
function importRowToText(row){
  if(row&&row.previewMode==='order'){
    const customer=row.customerName||row.supplier||'';
    const total=row.totalAmount!==undefined?money(row.totalAmount):'';
    const status=row.statusText||(row.valid?'Hợp lệ':'Lỗi');
    const shortage=row.hasShortage?` | Vượt tồn: ${formatNumber(row.shortageQuantity||0)} | Cắt: ${money(row.shortageAmount||0)}`:'';
    const sourceFile=row.sourceFile||row.fileName||'';
    return `Mã đơn: ${row.documentCode||''} | Khách/NCC: ${customer} | Số dòng: ${row.lineCount||0} | Giá trị: ${total} | File: ${sourceFile||'-'} | Trạng thái: ${status}${shortage}`;
  }
  const skip=['valid','errors','rowNo','raw','__importRows','__adjustedRows','lineDetails','shortageReport','detailErrors','password'];
  return Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??''}`).join(' | ');
}
function getImportRowMainFields(row){
  if(row&&row.previewMode==='order'){
    return [
      {key:'Mã đơn',value:row.documentCode||''},
      {key:'File nguồn',value:row.sourceFile||row.fileName||''},
      {key:'Mã NVBH',value:row.staffCode||row.salesStaffCode||''},
      {key:'NVBH',value:row.staffName||row.salesStaffName||''},
      {key:row.supplier?'Nhà cung cấp':'Mã KH',value:row.supplier||row.customerCode||''},
      {key:'Tên KH/NCC',value:row.customerName||row.supplier||''},
      {key:'Số dòng hàng',value:row.lineCount||0},
      {key:'Giá trị đơn',value:money(row.totalAmount||0)},
      {key:'Trạng thái',value:row.statusText||(row.valid?'Hợp lệ':'Lỗi')},
      ...(row.hasShortage?[
        {key:'SL vượt tồn',value:formatNumber(row.shortageQuantity||0)},
        {key:'Giá trị bị cắt',value:money(row.shortageAmount||0)}
      ]:[])
    ];
  }
  const fields=['documentCode','date','customerCode','customerName','productCode','productName','quantity','stockQuantity','soldQuantity','salePrice','amount','staffName','note'];
  return fields.filter(k=>row[k]!==undefined && row[k]!==null && row[k]!=='').map(k=>({key:k,value:row[k]}));
}

function renderImportOrderDetailHtml(row){
  const errors=(row.detailErrors||[]).flatMap(d=>(d.errors||[]).map(e=>`Dòng ${d.rowNo||''} - ${d.productCode||''}: ${e}`));
  const shortages=row.shortageReport||[];
  const lines=row.lineDetails||[];
  const shortageHtml=shortages.length?`
    <div class="import-preview-shortage">
      <b>Báo cáo hàng bị cắt do vượt tồn</b>
      <div class="import-shortage-table">
        <div class="import-shortage-head">Mã SP</div><div class="import-shortage-head">Tên SP</div><div class="import-shortage-head">SL đặt</div><div class="import-shortage-head">Tồn</div><div class="import-shortage-head">SL nhập</div><div class="import-shortage-head">SL cắt</div><div class="import-shortage-head">Giá trị cắt</div>
        ${shortages.map(s=>`
          <div>${escapeImportHtml(s.productCode||'')}</div>
          <div>${escapeImportHtml(s.productName||'')}</div>
          <div>${formatNumber(s.requestedQuantity||0)}</div>
          <div>${formatNumber(s.availableQuantity||0)}</div>
          <div>${formatNumber(s.importQuantity||0)}</div>
          <div>${formatNumber(s.missingQuantity||0)}</div>
          <div>${money(s.cutAmount||0)}</div>
        `).join('')}
      </div>
    </div>`:'';
  const lineHtml=lines.length?`
    <details class="import-preview-lines">
      <summary>Xem chi tiết ${formatNumber(lines.length)} dòng hàng</summary>
      <div class="import-line-list">
        ${lines.slice(0,80).map(l=>`
          <div class="import-line-item ${Number(l.missingQuantity||0)>0?'shortage':''}">
            <b>${escapeImportHtml(l.productCode||'')}</b>
            <span>${escapeImportHtml(l.productName||'')}</span>
            <span>SL: ${formatNumber(l.requestedQuantity||l.quantity||0)}</span>
            ${l.availableQuantity!==undefined?`<span>Tồn: ${formatNumber(l.availableQuantity||0)}</span>`:''}
            ${Number(l.missingQuantity||0)>0?`<span class="danger-text">Cắt: ${formatNumber(l.missingQuantity||0)}</span>`:''}
          </div>`).join('')}
      </div>
    </details>`:'';
  const errorHtml=errors.length?`<div class="import-preview-error"><b>Lỗi chi tiết:</b> ${escapeImportHtml(errors.join('; '))}</div>`:'';
  return `${shortageHtml}${lineHtml}${errorHtml}`;
}

function ensureImportPreviewModal(){
  let modal=document.getElementById('importPreviewModal');
  if(modal)return modal;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="importPreviewModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="importPreviewModalTitle">
      <div class="modal-card import-preview-modal-card">
        <div class="modal-head">
          <div>
            <h3 id="importPreviewModalTitle">Xem trước import</h3>
            <p class="muted">Kiểm tra tổng quan dữ liệu, dòng hợp lệ và dòng lỗi trước khi ghi vào hệ thống.</p>
          </div>
          <button type="button" id="closeImportPreviewModalButton" class="secondary">Đóng</button>
        </div>
        <div id="importPreviewModalReport" class="import-preview-report"></div>
        <div class="button-row import-preview-modal-actions">
          <button type="button" id="selectAllImportPreviewButton" class="secondary">Chọn tất cả hợp lệ</button>
          <button type="button" id="clearAllImportPreviewButton" class="secondary">Bỏ chọn</button>
          <button type="button" id="commitImportFromModalButton">Xác nhận import</button>
        </div>
        <div id="importPreviewModalBody" class="import-preview-modal-body"></div>
      </div>
    </div>`);
  modal=document.getElementById('importPreviewModal');
  modal.addEventListener('click', function(event){
    if(event.target===modal)closeImportPreviewModal();
  });
  document.addEventListener('keydown', function(event){
    if(event.key==='Escape')closeImportPreviewModal();
  });
  return modal;
}



function normalizeImportPreviewKey(value){
  return String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]/g,'');
}
function pickImportPreviewValue(source, keys){
  if(!source || typeof source!=='object')return '';
  for(const key of keys){
    const direct=source[key];
    if(direct!==undefined && direct!==null && String(direct).trim()!=='')return direct;
  }
  const normalizedKeys=keys.map(normalizeImportPreviewKey);
  for(const [k,v] of Object.entries(source)){
    if(v===undefined || v===null || String(v).trim()==='')continue;
    if(normalizedKeys.includes(normalizeImportPreviewKey(k)))return v;
  }
  return '';
}
function findImportPreviewValue(row, keys){
  const pools=[
    row,
    row&&row.raw,
    row&&row.source,
    row&&row.order,
    row&&row.meta,
    row&&row.customer,
    row&&Array.isArray(row.lineDetails)?row.lineDetails[0]:null,
    row&&Array.isArray(row.items)?row.items[0]:null,
    row&&Array.isArray(row.__importRows)?row.__importRows[0]:null
  ];
  for(const pool of pools){
    const value=pickImportPreviewValue(pool,keys);
    if(value!==undefined && value!==null && String(value).trim()!=='')return String(value).trim();
  }
  return '';
}
function getImportPreviewSalesStaffCode(row){
  return findImportPreviewValue(row,[
    'staffCode','salesStaffCode','salesmanCode','employeeCode','sellerCode','saleCode','salesCode',
    'maNV','maNVBH','maNhanVien','maNhanVienBanHang','maNvBanHang','maNVBanHang',
    'Mã NVBH','Ma NVBH','Mã nhân viên','Ma nhan vien','Mã nhân viên bán hàng','Ma nhan vien ban hang','Mã NV bán hàng','Ma NV ban hang',
    'Salesman Code','Sales Rep Code','Sales Staff Code'
  ]);
}
function getImportPreviewSalesStaffName(row){
  return findImportPreviewValue(row,[
    'staffName','salesStaffName','salesmanName','employeeName','sellerName','saleName','salesName',
    'tenNV','tenNVBH','tenNhanVien','tenNhanVienBanHang','tenNvBanHang','tenNVBanHang',
    'Tên NVBH','Ten NVBH','Tên NVTT','Ten NVTT','Nhân viên bán hàng','Nhan vien ban hang','NVBH',
    'Salesman','Sales Rep','Sales Staff Name'
  ]);
}


function normalizeImportStaffCode(value){
  return String(value||'').trim();
}
function isImportSalesAccount(user){
  const role=String(user&&user.role||'').toLowerCase();
  return user && user.isActive!==false && (!role || role==='sales' || role==='admin' || role==='sale' || role==='seller');
}
function findImportSalesAccountByCode(code){
  const target=normalizeImportStaffCode(code).toLowerCase();
  if(!target)return null;
  return (usersCache||[]).find(u=>{
    if(!isImportSalesAccount(u))return false;
    const keys=[u.code,u.staffCode,u.salesStaffCode,u.username,u.id].map(v=>normalizeImportStaffCode(v).toLowerCase()).filter(Boolean);
    return keys.includes(target);
  })||null;
}
async function ensureImportUsersCache(){
  // V45 fix: import preview đã được backend Rule Engine kiểm tra trực tiếp với Mongo users.
  // Frontend không gọi thêm /api/search/sales-staff nữa, vì endpoint search lỗi sẽ làm mất toàn bộ preview
  // và hiện "Lỗi hệ thống" dù backend preview đã có dữ liệu.
  usersCache=Array.isArray(usersCache)?usersCache:[];
  return usersCache;
}
function attachImportOrderError(row,message){
  row.valid=false;
  row.statusText='Lỗi';
  row.errors=Array.isArray(row.errors)?row.errors:[];
  if(!row.errors.includes(message))row.errors.push(message);
  return row;
}
function normalizeImportPreviewSalesStaffFromAccounts(rows=[]){
  // V45: tên/mã NVBH của preview phải do backend Rule Engine trả về.
  // Frontend chỉ render, không tự validate/tự sửa theo cache tài khoản.
  return Array.isArray(rows)?rows:[];
}

function getImportOrderShortageState(row){
  const shortages=Array.isArray(row.shortageReport)?row.shortageReport.filter(s=>Number(s.missingQuantity||s.shortageQuantity||0)>0):[];
  const lineCount=Number(row.lineCount||(Array.isArray(row.lineDetails)?row.lineDetails.length:0)||0);
  const valid=!!row.valid;
  if(!valid){
    return {type:'error',label:'🔴 Lỗi',count:0,shortages};
  }
  if(!row.hasShortage||!shortages.length){
    return {type:'ok',label:'🟢 Đủ tồn',count:0,shortages};
  }
  const fullShortage=lineCount>0
    && shortages.length>=lineCount
    && shortages.every(s=>{
      const requested=Number(s.requestedQuantity||s.quantity||0);
      const imported=Number(s.importQuantity||s.availableQuantityToImport||0);
      const missing=Number(s.missingQuantity||s.shortageQuantity||0);
      return requested>0 && missing>=requested && imported<=0;
    });
  if(fullShortage){
    return {type:'full-shortage',label:'🔴 Thiếu toàn bộ',count:shortages.length,shortages};
  }
  return {type:'shortage',label:`🟡 Thiếu ${formatNumber(shortages.length)} SP`,count:shortages.length,shortages};
}

function renderImportOrderShortageLines(row,limit=2){
  const state=getImportOrderShortageState(row);
  if(!state.shortages.length)return '';
  const visible=state.shortages.slice(0,limit);
  const more=state.shortages.length-visible.length;
  return `<div class="import-order-shortage-lines">
    ${visible.map(s=>`
      <div class="import-order-shortage-line">↳ ${escapeImportHtml(s.productName||s.productCode||'Sản phẩm')} (-${formatNumber(s.missingQuantity||s.shortageQuantity||0)})</div>
    `).join('')}
    ${more>0?`<div class="import-order-shortage-line more">+ ${formatNumber(more)} sản phẩm khác...</div>`:''}
  </div>`;
}

function renderImportOrderPreviewSummary(row,index,options={}){
  const state=getImportOrderShortageState(row);
  const checked=options.modal?'import-modal-row-check':'import-row-check';
  const showCheckbox=options.inline ? false : true;
  const canCheck=!!row.valid && row.canImport !== false;
  const checkHtml=(showCheckbox&&canCheck)?`<input class="${checked}" data-index="${index}" type="checkbox" checked />`:'';
  const customer=row.customerName||row.customer||row.supplier||row.customerCode||'';
  const lineCount=Number(
    row.lineCount ||
    row.skuCount ||
    row.itemCount ||
    (Array.isArray(row.lineDetails)?row.lineDetails.length:0) ||
    (Array.isArray(row.items)?row.items.length:0) ||
    (Array.isArray(row.__importRows)?row.__importRows.length:0) ||
    0
  );
  const staffCode=getImportPreviewSalesStaffCode(row);
  const staffName=getImportPreviewSalesStaffName(row);
  const code=row.documentCode||row.code||row.orderCode||row.invoiceCode||'';
  const total=Number(row.totalAmount ?? row.amount ?? row.grossAmount ?? 0);
  const sourceFile=row.sourceFile||row.fileName||'';
  return `
    <div class="import-order-preview-item ${state.type} ${showCheckbox?'':'no-check'}">
      ${showCheckbox?`<div class="import-order-preview-check">${checkHtml}</div>`:''}
      <div class="import-order-preview-content">
        <div class="import-order-line import-order-preview-line">
          <strong>${escapeImportHtml(code)}</strong> | ${escapeImportHtml(customer)} | ${money(total)} | ${formatNumber(lineCount)} SP | Mã NVBH: ${escapeImportHtml(staffCode||'-')} | NVBH: ${escapeImportHtml(staffName||'-')} | File: ${escapeImportHtml(sourceFile||'-')} | <span class="import-order-status ${state.type}">${escapeImportHtml(state.label)}</span>
        </div>
        ${renderImportOrderShortageLines(row,2)}
        ${!row.valid&&Array.isArray(row.errors)&&row.errors.length?`<div class="import-preview-error"><b>Lỗi:</b> ${escapeImportHtml(row.errors.join('; '))}</div>`:''}
      </div>
    </div>`;
}

function renderImportPreviewModal(result){
  const modal=ensureImportPreviewModal();
  const report=document.getElementById('importPreviewModalReport');
  const body=document.getElementById('importPreviewModalBody');
  const title=document.getElementById('importPreviewModalTitle');
  if(!modal||!body)return;
  const total=result.total||importPreviewRows.length;
  const valid=result.valid||0;
  const invalid=result.invalid||0;
  const orderMode=importPreviewRows.some(r=>r&&r.previewMode==='order');
  const shortageOrders=importPreviewRows.filter(r=>r&&r.hasShortage).length;
  const shortageAmount=importPreviewRows.reduce((sum,r)=>sum+Number(r.shortageAmount||0),0);
  if(title)title.textContent=`Xem trước import - ${formatNumber(total)} ${orderMode?'đơn/chứng từ':'dòng'}`;
  if(report){
    report.innerHTML=`
      <div class="import-report-card"><span>${orderMode?'Tổng đơn':'Tổng dòng'}</span><strong>${formatNumber(total)}</strong></div>
      <div class="import-report-card success"><span>Hợp lệ</span><strong>${formatNumber(valid)}</strong></div>
      <div class="import-report-card danger"><span>${orderMode?'Đơn lỗi':'Dòng lỗi'}</span><strong>${formatNumber(invalid)}</strong></div>
      ${orderMode?`<div class="import-report-card danger"><span>Đơn vượt tồn</span><strong>${formatNumber(shortageOrders)}</strong></div>
      <div class="import-report-card danger"><span>Giá trị bị cắt</span><strong>${money(shortageAmount)}</strong></div>`:''}
      <div class="import-report-card"><span>Được chọn</span><strong id="importPreviewSelectedCount">${formatNumber(valid)}</strong></div>`;
  }
  if(!importPreviewRows.length){
    body.innerHTML='<div class="empty-state">Không có dữ liệu xem trước.</div>';
  }else{
    body.innerHTML=importPreviewRows.map((row,index)=>{
      const fields=getImportRowMainFields(row);
      const fieldHtml=(fields.length?fields:Object.keys(row).filter(k=>!['valid','errors','rowNo'].includes(k)).slice(0,12).map(k=>({key:k,value:row[k]}))).map(f=>`
        <div class="import-preview-field"><span>${escapeImportHtml(f.key)}</span><b>${escapeImportHtml(f.value)}</b></div>`).join('');
      const errors=(row.errors||[]).filter(Boolean);
      return `<article class="import-preview-card ${row.valid?'valid':'invalid'}">
        <div class="import-preview-card-head">
          <label class="import-preview-check-wrap">
            ${row.valid&&row.canImport!==false?`<input class="import-row-check import-modal-row-check" data-index="${index}" type="checkbox" checked />`:''}
            <span>Dòng ${escapeImportHtml(row.rowNo||'')}</span>
          </label>
          <span class="badge ${row.valid?(row.hasShortage?'warn':'active'):'inactive'}">${escapeImportHtml(row.statusText||(row.valid?'Hợp lệ':'Lỗi'))}</span>
        </div>
        ${row.previewMode==='order' ? `
          ${renderImportOrderPreviewSummary(row,index,{modal:true})}
          ${renderImportOrderDetailHtml(row)}
        ` : `
          <div class="import-preview-grid">${fieldHtml}</div>
          ${errors.length?`<div class="import-preview-error"><b>Lỗi:</b> ${escapeImportHtml(errors.join('; '))}</div>`:''}
        `}
      </article>`;
    }).join('');
  }
  modal.classList.add('show');
  document.body.classList.add('modal-open');
  bindImportPreviewModalControls();
  syncImportSelectedCount();
}
function closeImportPreviewModal(){
  const modal=document.getElementById('importPreviewModal');
  if(modal)modal.classList.remove('show');
  document.body.classList.remove('modal-open');
}
function syncImportSelectedCount(){
  const selected=getSelectedImportRows().length;
  const el=document.getElementById('importPreviewSelectedCount');
  if(el)el.textContent=formatNumber(selected);
}
function syncImportChecksFromModal(){
  document.querySelectorAll('.import-modal-row-check').forEach(cb=>{
    const index=Number(cb.dataset.index);
    const row=importPreviewRows[index];
    const key=getImportRowSelectKey(row,index);
    if(cb.checked)importSelectedRowKeySet.add(key);
    else importSelectedRowKeySet.delete(key);
    const inline=document.querySelector(`.import-preview-wrap .import-row-check[data-index="${cb.dataset.index}"]`);
    if(inline)inline.checked=cb.checked;
  });
  syncImportSelectedCount();
}
function bindImportPreviewModalControls(){
  const closeBtn=document.getElementById('closeImportPreviewModalButton');
  if(closeBtn)closeBtn.onclick=closeImportPreviewModal;
  const selectAll=document.getElementById('selectAllImportPreviewButton');
  if(selectAll)selectAll.onclick=()=>{initImportSelectedRows(importPreviewRows);document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.checked=true);syncImportChecksFromModal();};
  const clearAll=document.getElementById('clearAllImportPreviewButton');
  if(clearAll)clearAll.onclick=()=>{importSelectedRowKeySet=new Set();document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.checked=false);syncImportChecksFromModal();};
  const importBtn=document.getElementById('commitImportFromModalButton');
  if(importBtn)importBtn.onclick=()=>{syncImportChecksFromModal();commitImportExcel();};
  document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.onchange=syncImportChecksFromModal);
}

function ensureImportShortageActions(){
  let box=document.getElementById('importShortageActions');
  if(!box){
    box=document.createElement('div');
    box.id='importShortageActions';
    box.className='import-shortage-actions';
    if(importPreviewSummary&&importPreviewSummary.parentNode){
      importPreviewSummary.parentNode.insertBefore(box,importPreviewSummary);
    }else if(importDataMessage&&importDataMessage.parentNode){
      importDataMessage.parentNode.insertBefore(box,importDataMessage.nextSibling);
    }
  }
  return box;
}
function renderImportShortageActions(rows=[]){
  const box=ensureImportShortageActions();
  if(!box)return;
  const shortageRows=rows.filter(r=>r&&r.hasShortage);
  if(importDataType?.value!=='salesOrders'||!shortageRows.length){
    box.innerHTML='';
    box.style.display='none';
    importShortageActionMode='';
    return;
  }
  const shortageQty=shortageRows.reduce((sum,row)=>sum+Number(row.shortageQuantity||0),0);
  const shortageAmount=shortageRows.reduce((sum,row)=>sum+Number(row.shortageAmount||0),0);
  box.style.display='flex';
  importShortageActionMode='cut';
  if(commitImportButton)commitImportButton.disabled=false;
  box.innerHTML=`
    <div class="import-shortage-actions-text">
      <b>Có ${formatNumber(shortageRows.length)} đơn vượt tồn</b>
      <span>Hệ thống sẽ tự cắt theo tồn thực tế khi import. SL bị cắt: ${formatNumber(shortageQty)} · Giá trị bị cắt: ${money(shortageAmount)}</span>
    </div>`;
}

function renderImportPreview(result){
  importShortageActionMode='';
  importPreviewSessionId=result.sessionId||result.importSessionId||'';
  importPreviewRows=result.rows||[];
  // Bảo hiểm dữ liệu: nếu backend trả shortageReport cấp tổng nhưng từng đơn chưa gắn hasShortage,
  // gom shortage theo mã đơn rồi đánh dấu lại để UI và commit nhận biết đúng.
  if(Array.isArray(result.shortageReport)&&result.shortageReport.length){
    const byDoc=new Map();
    result.shortageReport.forEach(item=>{
      const key=String(item.documentCode||item.refCode||item.orderCode||item.code||'').trim();
      if(!key)return;
      if(!byDoc.has(key))byDoc.set(key,[]);
      byDoc.get(key).push(item);
    });
    importPreviewRows=importPreviewRows.map(row=>{
      const key=String(row.documentCode||row.code||'').trim();
      const list=byDoc.get(key);
      if(!list||!list.length)return row;
      const q=list.reduce((sum,it)=>sum+Number(it.missingQuantity||it.shortageQuantity||0),0);
      const a=list.reduce((sum,it)=>sum+Number(it.cutAmount||it.shortageAmount||0),0);
      return {...row,hasShortage:true,statusText:row.statusText==='Hợp lệ'?'Vượt tồn':row.statusText,shortageReport:list,shortageCount:list.length,shortageQuantity:q,shortageAmount:a};
    });
  }
  importPreviewRows=normalizeImportPreviewSalesStaffFromAccounts(importPreviewRows);
  initImportSelectedRows(importPreviewRows);
  const total=importPreviewRows.length;
  const valid=importPreviewRows.filter(r=>r&&r.valid).length;
  const invalid=Math.max(0,total-valid);
  if(importPreviewSummary){
    const fileCount=Number(result.totalFiles||0);
    const fileText=fileCount>1?`<span>Số file: <strong>${fileCount}</strong></span>`:'';
    importPreviewSummary.innerHTML=`${fileText}<span>Tổng dòng/đơn: <strong>${total}</strong></span><span>Hợp lệ: <strong>${valid}</strong></span><span>Lỗi: <strong>${invalid}</strong></span>`;
  }
  if(!importPreviewRows.length){
    if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Không có dữ liệu import.</td></tr>';
    if(commitImportButton)commitImportButton.disabled=true;
    return;
  }
  const orderMode=importPreviewRows.some(r=>r&&r.previewMode==='order');
  if(importPreviewHead){
    importPreviewHead.innerHTML=orderMode
      ? '<tr><th style="width:54px">Chọn</th><th>Danh sách đơn import</th></tr>'
      : '<tr><th>Chọn</th><th>Dòng</th><th>Trạng thái</th><th>Dữ liệu</th><th>Lỗi</th></tr>';
  }
  if(importPreviewTable){
    const indexedRows=importPreviewRows.map((row,index)=>({row,index}));
    const invalidFirst=indexedRows.filter(x=>!x.row.valid).concat(indexedRows.filter(x=>x.row.valid));
    const visibleRows=invalidFirst.slice(0,IMPORT_PREVIEW_RENDER_LIMIT);
    const hiddenCount=Math.max(0,indexedRows.length-visibleRows.length);
    const hiddenNote=hiddenCount>0?`<tr><td colspan="${orderMode?2:5}" class="muted">Đang tối ưu tốc độ: chỉ hiển thị ${formatNumber(visibleRows.length)} dòng đầu, còn ${formatNumber(hiddenCount)} dòng vẫn đã được chọn/import theo session.</td></tr>`:'';
    if(orderMode){
      importPreviewTable.innerHTML=visibleRows.map(({row,index})=>`
        <tr class="${row.valid?'import-valid':'import-invalid'} ${row.hasShortage?'import-shortage-row':''}">
          <td>${row.valid&&row.canImport!==false?`<input class="import-row-check" data-index="${index}" type="checkbox" />`:''}</td>
          <td>${renderImportOrderPreviewSummary(row,index,{inline:true})}</td>
        </tr>`).join('')+hiddenNote;
    }else{
      importPreviewTable.innerHTML=visibleRows.map(({row,index})=>`
        <tr class="${row.valid?'import-valid':'import-invalid'}">
          <td>${row.valid&&row.canImport!==false?`<input class="import-row-check" data-index="${index}" type="checkbox" />`:''}</td>
          <td>${row.rowNo||''}</td>
          <td><span class="badge ${row.valid?(row.hasShortage?'warn':'active'):'inactive'}">${escapeImportHtml(row.statusText||(row.valid?'Hợp lệ':'Lỗi'))}</span></td>
          <td>${importRowToText(row)}</td>
          <td>${[(row.errors||[]).join('; '),(row.warnings||[]).join('; ')].filter(Boolean).join(' | ')}</td>
        </tr>`).join('')+hiddenNote;
    }
    bindImportInlinePreviewChecks();
  }
  // Bỏ cửa sổ popup preview: chỉ hiển thị báo cáo gọn ngay trên màn import.
  renderImportShortageActions(importPreviewRows);
  if(commitImportButton){commitImportButton.disabled=valid<=0;commitImportButton.textContent='Import các đơn đã chọn';}
}
function downloadImportTemplate(){
  if(!importDataType)return;
  const type=encodeURIComponent(importDataType.value);
  window.location.href=`/api/import/template/${type}`;
}

async function previewImportExcel(){
  if(!importDataType||!importExcelFile)return;
  try{
    showMessage(importDataMessage,'Đang đọc file và kiểm tra dữ liệu...');
    const json=await previewImportExcelSilent();
    await ensureImportUsersCache();
    renderImportPreview(json);
    const validNow=importPreviewRows.filter(r=>r&&r.valid).length;
    const invalidNow=Math.max(0,importPreviewRows.length-validNow);
    const fileCount=Array.from(importExcelFile.files||[]).length;
    showMessage(importDataMessage,`Đã đọc ${fileCount} file: ${validNow} dòng/đơn hợp lệ, ${invalidNow} lỗi. Hãy tick chọn đơn rồi bấm Import các đơn đã chọn.`);
  }catch(err){
    importPreviewRows=[];
    if(commitImportButton)commitImportButton.disabled=true;
    showMessage(importDataMessage,err.message,true);
  }
}

async function previewImportExcelSilent(){
  if(!importDataType||!importExcelFile)throw new Error('Thiếu thông tin import');
  const files=Array.from(importExcelFile.files||[]);
  if(!files.length)throw new Error('Bạn chưa chọn file Excel');
  const formData=new FormData();
  formData.append('type',importDataType.value);
  if(customImportTemplateSelect&&customImportTemplateSelect.value)formData.append('templateId',customImportTemplateSelect.value);
  files.forEach(file=>formData.append('files',file));
  const res=await fetch('/api/import/preview',{method:'POST',body:formData});
  const json=await res.json();
  if(!json.ok)throw new Error(json.error||json.message||'Không đọc được file import');
  return json;
}

async function handleImportExcelAction(){
  if(!importPreviewRows.length){
    await previewImportExcel();
    return;
  }
  await commitImportExcel();
}

async function commitImportExcel(){
  if(!importDataType||!importExcelFile)return;
  try{
    const files=Array.from(importExcelFile.files||[]);
    if(!files.length){showMessage(importDataMessage,'Bạn chưa chọn file Excel',true);return;}

    if(!importPreviewRows.length){
      await previewImportExcel();
      return;
    }

    // V45: backend validate lần 2 theo importSession; frontend không tự sửa dữ liệu preview.

    const selectedRows=getSelectedImportRows();
    if(!selectedRows.length){showMessage(importDataMessage,'Bạn chưa chọn đơn/dòng nào để import',true);return;}

    if(commitImportButton){
      commitImportButton.disabled=true;
      commitImportButton.dataset.originalText=commitImportButton.textContent||'Import các đơn đã chọn';
      commitImportButton.textContent='Đang import...';
    }

    showMessage(importDataMessage,`Đang import ${formatNumber(selectedRows.length)} đơn/dòng đã chọn...`);

    const res=await fetch('/api/import/commit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:importDataType.value,rows:selectedRows,sessionId:importPreviewSessionId,selectedOrderCodes:selectedRows.map(r=>String(r.documentCode||r.orderCode||r.code||'').trim()).filter(Boolean),shortageMode:importShortageActionMode||'cut'})
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.error||json.message||'Import thất bại');

    const shortageText=(json.shortageReport&&json.shortageReport.length)
      ? ` · Đã tự cắt ${formatNumber(json.shortageSummary?.totalMissingQty||0)} sản phẩm thiếu (${money(json.shortageSummary?.totalCutAmount||0)})`
      : '';
    showMessage(importDataMessage,(json.message||'Import thành công')+shortageText);

    const reportRows=(json.shortageReport||[]).slice(0,80);
    if(importPreviewTable){
      if(reportRows.length){
        importPreviewTable.innerHTML=reportRows.map(r=>`
          <tr>
            <td>${escapeImportHtml(r.documentCode||'')}</td>
            <td>${escapeImportHtml(r.customerName||r.customerCode||'')}</td>
            <td>${escapeImportHtml(r.productCode||'')}</td>
            <td>${escapeImportHtml(r.productName||'')}</td>
            <td>${formatNumber(r.missingQuantity||0)}</td>
            <td>${money(r.cutAmount||0)}</td>
          </tr>
        `).join('');
        if(importPreviewHead)importPreviewHead.innerHTML='<tr><th>Mã đơn</th><th>Khách hàng</th><th>Mã SP</th><th>Tên SP</th><th>SL thiếu</th><th>Giá trị cắt</th></tr>';
      }else{
        importPreviewTable.innerHTML=`<tr><td colspan="6">Import thành công. Không có hàng vượt tồn.</td></tr>`;
        if(importPreviewHead)importPreviewHead.innerHTML='<tr><th colspan="6">Báo cáo import</th></tr>';
      }
    }

    importPreviewRows=[];
    if(commitImportButton){
      commitImportButton.disabled=true;
      commitImportButton.textContent='Import ngay';
    }

    if(importDataType.value==='salesOrders'){
      if(salesOrderSourceFilter)salesOrderSourceFilter.value='DMS';
    }

    const isPromotionImport = ['promotionProductRules','promotionGroupItems','promotionGroupRules'].includes(importDataType.value);
    if(isPromotionImport){
      if(typeof window.reloadPromotionRules === 'function') await window.reloadPromotionRules();
    }else if(importDataType.value==='users'){
      if(typeof loadUsers === 'function') await loadUsers();
    }else{
      await loadProducts();await loadCustomers();await loadStock();await loadImportOrders();await loadSalesOrders();await loadDebts();await loadReceipts();await loadCashbook();
    }
  }catch(err){
    if(commitImportButton){
      commitImportButton.disabled=false;
      if(commitImportButton.dataset.originalText) commitImportButton.textContent=commitImportButton.dataset.originalText;
    }
    showMessage(importDataMessage,err.message,true);
  }
}

resetButton.addEventListener('click',resetForm);

// V46 Promotion program management: gom theo mã chương trình, giữ nguyên import Excel
(function setupPromotionProgramManagement(){
  const $ = (id)=>document.getElementById(id);
  const msg = $('promotion3Message');
  const searchInput = $('promotionSearchAllInput');
  const programTable = $('promotionProgramTable');
  const programCount = $('promotionProgramCount');
  const detailTable = $('promotionProgramDetailTable');
  const form = $('promotionProgramForm');
  const reloadButton = $('reloadPromotionProgramsButton');
  const cancelButton = $('cancelPromotionProgramButton');
  if(!programTable || !form)return;
  const state = { programs: [], selectedCode: '', detail: null };
  const esc = (v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtPct = (v)=>v===''||v===null||v===undefined?'':`${Number(v||0).toLocaleString('vi-VN')}%`;
  const fmtMoney = (v)=>v===''||v===null||v===undefined?'':Number(v||0).toLocaleString('vi-VN');
  const show = (text,isError=false)=>{ if(msg) showMessage(msg,text,isError); };
  async function api(url, options={}){
    const res = await fetch(url, options);
    const json = await res.json();
    if(!json.ok)throw new Error(json.message||json.error||'Có lỗi xảy ra');
    return json;
  }
  function q(){ return encodeURIComponent(searchInput?.value||''); }
  function statusBadge(p){
    const text=p.statusText||((p.isActive===false)?'Không hoạt động':'Hoạt động');
    const cls=text==='Hoạt động'?'ok':(text==='Không hoạt động'?'danger':'warn');
    return `<span class="status-badge ${cls}">${esc(text)}</span>`;
  }
  function renderProgramList(){
    if(programCount)programCount.textContent=`${state.programs.length} chương trình`;
    if(!state.programs.length){
      programTable.innerHTML='<tr><td colspan="7">Chưa có chương trình khuyến mại.</td></tr>';
      return;
    }
    programTable.innerHTML=state.programs.map(p=>`<tr class="${String(p.programCode)===String(state.selectedCode)?'selected-row':''}">
      <td><input type="checkbox" data-promo-check="${esc(p.programCode)}" /></td>
      <td><strong>${esc(p.programCode)}</strong></td>
      <td>${esc(p.programName||p.content||'')}</td>
      <td>${esc(p.timeText||[p.startDate,p.endDate].filter(Boolean).join(' - ')||'Chưa đặt')}</td>
      <td>${statusBadge(p)}</td>
      <td><button type="button" class="small" onclick="selectPromotionProgram('${esc(p.programCode)}')">Sửa</button></td>
      <td><button type="button" class="small danger" onclick="cancelPromotionProgram('${esc(p.programCode)}')">Huỷ</button></td>
    </tr>`).join('');
  }
  function renderDetailEmpty(text='Chưa chọn chương trình.'){
    detailTable.innerHTML=`<tr><td colspan="6">${esc(text)}</td></tr>`;
  }
  function renderProgramDetail(detail){
    const p=detail?.program||{};
    form.elements.programCode.value=p.programCode||'';
    form.elements.programName.value=p.programName||p.content||'';
    form.elements.startDate.value=p.startDate||'';
    form.elements.endDate.value=p.endDate||'';
    form.elements.isActive.value=String(p.isActive!==false);
    const rows=detail?.products||[];
    if(!rows.length){ renderDetailEmpty('Chương trình chưa có dòng sản phẩm/điều kiện.'); return; }
    detailTable.innerHTML=rows.map(r=>`<tr>
      <td>${esc(r.source)}</td>
      <td>${esc(r.productCode)}</td>
      <td>${esc(r.productName)}</td>
      <td>${r.minAmount!==''&&r.minAmount!==undefined?fmtMoney(r.minAmount):''}</td>
      <td>${fmtPct(r.discountPercent)}</td>
      <td>${r.isActive===false?'Không hoạt động':'Hoạt động'}</td>
    </tr>`).join('');
  }
  async function loadPromotionPrograms(){
    try{
      const json=await api(`/api/promotions/programs?q=${q()}`);
      state.programs=json.programs||[];
      renderProgramList();
      if(state.selectedCode && !state.programs.some(p=>String(p.programCode)===String(state.selectedCode))){
        state.selectedCode=''; state.detail=null; form.reset(); renderDetailEmpty();
      }
    }catch(err){ programTable.innerHTML=`<tr><td colspan="7">${esc(err.message)}</td></tr>`; }
  }
  window.loadPromotionPrograms=loadPromotionPrograms;
  window.selectPromotionProgram=async(programCode)=>{
    try{
      state.selectedCode=programCode;
      renderProgramList();
      const json=await api(`/api/promotions/programs/${encodeURIComponent(programCode)}`);
      state.detail=json;
      renderProgramDetail(json);
    }catch(err){ show(err.message,true); }
  };
  window.cancelPromotionProgram=async(programCode)=>{
    const code=programCode||state.selectedCode;
    if(!code){show('Chưa chọn chương trình cần hủy',true);return;}
    if(!confirm(`Hủy chương trình ${code}? Dữ liệu không bị xóa, chỉ chuyển sang Không hoạt động.`))return;
    try{
      await api(`/api/promotions/programs/${encodeURIComponent(code)}/cancel`,{method:'POST'});
      show('Đã hủy chương trình khuyến mại');
      await loadPromotionPrograms();
      if(state.selectedCode===code) await window.selectPromotionProgram(code);
    }catch(err){ show(err.message,true); }
  };
  form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const body=Object.fromEntries(new FormData(form).entries());
    const code=body.programCode||state.selectedCode;
    if(!code){show('Chưa chọn chương trình cần lưu',true);return;}
    try{
      await api(`/api/promotions/programs/${encodeURIComponent(code)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      show('Đã lưu chương trình khuyến mại');
      await loadPromotionPrograms();
      await window.selectPromotionProgram(code);
    }catch(err){ show(err.message,true); }
  });
  cancelButton?.addEventListener('click',()=>window.cancelPromotionProgram(state.selectedCode));
  reloadButton?.addEventListener('click',loadPromotionPrograms);
  searchInput?.addEventListener('input',loadPromotionPrograms);
  loadPromotionPrograms();
})();

// Xuất hóa đơn VAT TT78: Sheet1 sau đối trừ hàng trả.
(function initVatInvoiceTT78Export(){
  const button=document.getElementById('exportVatInvoiceTT78Button');
  const summary=document.getElementById('vatInvoiceExportSummary');
  if(!button)return;
  button.addEventListener('click',()=>{
    if(summary)summary.textContent='Đang tạo file Excel TT78...';
    exportReportExcel('vatInvoiceTT78');
    setTimeout(()=>{if(summary)summary.textContent='Đã gửi yêu cầu xuất Excel TT78. Kiểm tra file tải về của trình duyệt.';},800);
  });
})();
