'use strict';

// Import dữ liệu Excel
const SELECTIVE_UPDATE_IMPORT_TYPES=new Set(['products','customers','users']);
const IMPORT_SESSION_ROWS_PAGE_SIZE=500;
const IMPORT_SESSION_ROWS_MAX=20000;
function getSelectedImportMode(){
  const type=importDataType?importDataType.value:'';
  if(!SELECTIVE_UPDATE_IMPORT_TYPES.has(type))return 'create';
  return importDataMode&&importDataMode.value==='update'?'update':'create';
}
function syncImportModeAvailability(){
  const supported=SELECTIVE_UPDATE_IMPORT_TYPES.has(importDataType?importDataType.value:'');
  if(importModeLabel)importModeLabel.hidden=!supported;
  if(importModeHelp)importModeHelp.hidden=!supported;
  if(importDataMode){
    importDataMode.disabled=!supported;
    if(!supported)importDataMode.value='create';
  }
}
function resetImportPreviewForModeChange(){
  importPreviewRows=[];
  importPreviewSessionId='';
  importSelectedRowKeySet=new Set();
  if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="5">Chọn file rồi bấm xem trước.</td></tr>';
  if(commitImportButton){
    commitImportButton.disabled=!(importExcelFile&&importExcelFile.files&&importExcelFile.files.length);
    commitImportButton.textContent='Xem trước dữ liệu import';
  }
  resetImportPreviewMessage();
}
function formatSelectiveUpdateChanges(row){
  const changes=Array.isArray(row&&row.changes)?row.changes:[];
  if(!changes.length)return '';
  return changes.map(change=>`${change.label||change.field}: ${change.oldValue??''} → ${change.newValue??''}`).join(' | ');
}

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
  syncImportModeAvailability();
  resetImportPreviewForModeChange();
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
async function downloadCustomImportTemplate(){
  const template=getSelectedCustomTemplate();
  if(!template){showMessage(importDataMessage,'Bạn chưa chọn mẫu tự tạo',true);return;}
  try{
    await downloadImportBlob(
      `/api/import/custom-template/${encodeURIComponent(template.id)}/download`,
      `${template.name || 'custom-import-template'}.xlsx`
    );
  }catch(err){
    showMessage(importDataMessage,err.message||'Không tải được mẫu Excel',true);
  }
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
  const code=String(row?.documentCode||row?.orderCode||row?.code||row?.username||'').trim();
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
    const shortage=row.hasShortage?` | Vượt tồn: ${displayImportQtyTL(row.shortageQuantity||0,row)} | Cắt: ${money(row.shortageAmount||0)}`:'';
    const sourceFile=row.sourceFile||row.fileName||'';
    return `Mã đơn: ${row.documentCode||''} | Khách/NCC: ${customer} | Số dòng: ${row.lineCount||0} | Giá trị: ${total} | File: ${sourceFile||'-'} | Trạng thái: ${status}${shortage}`;
  }
  const skip=['valid','errors','rowNo','raw','__importRows','__adjustedRows','lineDetails','shortageReport','detailErrors','password','changes','changeCount','importMode','canImport','action','statusText'];
  const base=Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??''}`).join(' | ');
  const changes=formatSelectiveUpdateChanges(row);
  return [base,changes?`Thay đổi: ${changes}`:''].filter(Boolean).join(' | ');
}
function getImportRowMainFields(row){
  if(row&&row.previewMode==='order'){
    return [
      {key:'Mã đơn',value:row.documentCode||''},
      {key:'File nguồn',value:row.sourceFile||row.fileName||''},
      {key:'Mã NVBH',value:row.salesStaffCode||row.salesmanCode||''},
      {key:'NVBH',value:row.salesStaffName||row.salesmanName||''},
      {key:row.supplier?'Nhà cung cấp':'Mã KH',value:row.supplier||row.customerCode||''},
      {key:'Tên KH/NCC',value:row.customerName||row.supplier||''},
      {key:'Số dòng hàng',value:row.lineCount||0},
      {key:'Giá trị đơn',value:money(row.totalAmount||0)},
      {key:'Trạng thái',value:row.statusText||(row.valid?'Hợp lệ':'Lỗi')},
      ...(row.hasShortage?[
        {key:'SL vượt tồn',value:displayImportQtyTL(row.shortageQuantity||0,row)},
        {key:'Giá trị bị cắt',value:money(row.shortageAmount||0)}
      ]:[])
    ];
  }
  const fields=[
    'documentCode',
    'date',
    'customerCode',
    'customerName',
    'productCode',
    'productName',
    'quantity',
    'stockQuantity',
    'soldQuantity',
    'salePrice',
    'amount',
    'salesStaffCode',
    'salesStaffName',
    'salesmanCode',
    'salesmanName',
    'note'
  ];
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
          <div>${displayImportQtyTL(s.requestedQuantity||0,s)}</div>
          <div>${displayImportQtyTL(s.availableQuantity||0,s)}</div>
          <div>${displayImportQtyTL(s.importQuantity||0,s)}</div>
          <div>${displayImportQtyTL(s.missingQuantity||0,s)}</div>
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
            <span>SL: ${displayImportQtyTL(l.requestedQuantity||l.quantity||0,l)}</span>
            ${l.availableQuantity!==undefined?`<span>Tồn: ${displayImportQtyTL(l.availableQuantity||0,l)}</span>`:''}
            ${Number(l.missingQuantity||0)>0?`<span class="danger-text">Cắt: ${displayImportQtyTL(l.missingQuantity||0,l)}</span>`:''}
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
  return row.salesStaffCode || row.salesmanCode || '';
}
function getImportPreviewSalesStaffName(row){
  return row.salesStaffName || row.salesmanName || '';
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
    const keys=[
      u.code,
      u.staffCode,
      u.salesStaffCode,
      u.salesmanCode,
      u.employeeCode,
      u.maNhanVien
    ].map(v=>normalizeImportStaffCode(v).toLowerCase()).filter(Boolean);
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
      <div class="import-order-shortage-line">↳ ${escapeImportHtml(s.productName||s.productCode||'Sản phẩm')} (-${displayImportQtyTL(s.missingQuantity||s.shortageQuantity||0,s)})</div>
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
          ${Array.isArray(row.changes)&&row.changes.length?`<div class="import-preview-change"><b>Thay đổi:</b> ${escapeImportHtml(formatSelectiveUpdateChanges(row))}</div>`:''}
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
      <span>Hệ thống sẽ tự cắt theo tồn thực tế khi import. SL bị cắt: ${displayImportQtyTL(shortageQty)} · Giá trị bị cắt: ${money(shortageAmount)}</span>
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
  const total=Math.max(importPreviewRows.length,Number(result.total||result.totalRows||0));
  const valid=importPreviewRows.length===total
    ? importPreviewRows.filter(r=>r&&r.valid).length
    : Number(result.valid||result.validRows||0);
  const selectable=importPreviewRows.filter(r=>r&&r.valid&&r.canImport!==false).length;
  const unchanged=importPreviewRows.filter(r=>r&&r.action==='no_change').length;
  const invalid=Math.max(0,total-valid);
  if(importPreviewSummary){
    const fileCount=Number(result.totalFiles||0);
    const fileText=fileCount>1?`<span>Số file: <strong>${fileCount}</strong></span>`:'';
    const updateText=getSelectedImportMode()==='update'?`<span>Có thay đổi: <strong>${selectable}</strong></span><span>Giữ nguyên: <strong>${unchanged}</strong></span>`:'';
    importPreviewSummary.innerHTML=`${fileText}<span>Tổng dòng/đơn: <strong>${total}</strong></span>${updateText}<span>Hợp lệ: <strong>${valid}</strong></span><span>Lỗi: <strong>${invalid}</strong></span>`;
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
          <td>${escapeImportHtml(importRowToText(row))}</td>
          <td>${escapeImportHtml([(row.errors||[]).join('; '),(row.warnings||[]).join('; ')].filter(Boolean).join(' | '))}</td>
        </tr>`).join('')+hiddenNote;
    }
    bindImportInlinePreviewChecks();
  }
  // Bỏ cửa sổ popup preview: chỉ hiển thị báo cáo gọn ngay trên màn import.
  renderImportShortageActions(importPreviewRows);
  if(commitImportButton){commitImportButton.disabled=selectable<=0;commitImportButton.textContent=getSelectedImportMode()==='update'?'Cập nhật các dòng đã chọn':'Import các dòng đã chọn';}
}
function sleepImportPreview(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function loadAllImportSessionRows(sessionId,totalRows){
  const expected=Math.max(0,Number(totalRows||0));
  if(!expected)return[];
  if(expected>IMPORT_SESSION_ROWS_MAX){
    throw new Error(`File có ${formatNumber(expected)} dòng, vượt giới hạn xem trước ${formatNumber(IMPORT_SESSION_ROWS_MAX)} dòng. Vui lòng tách file để kiểm tra an toàn trước khi cập nhật.`);
  }

  const rows=[];
  let offset=0;
  while(offset<expected){
    const res=await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}/rows?offset=${offset}&limit=${IMPORT_SESSION_ROWS_PAGE_SIZE}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.error||json.message||'Không tải được toàn bộ dòng import');
    const pageRows=Array.isArray(json.rows)?json.rows:[];
    rows.push(...pageRows);
    offset+=pageRows.length;
    if(!json.hasMore)break;
    if(!pageRows.length)throw new Error('Phiên import bị thiếu dữ liệu dòng. Vui lòng tải lại file.');
  }

  if(rows.length!==expected){
    throw new Error(`Phiên import đọc thiếu dòng: Mongo đã ghi nhận ${formatNumber(expected)} nhưng chỉ tải được ${formatNumber(rows.length)}. Hệ thống đã dừng để tránh cập nhật thiếu.`);
  }
  return rows;
}

async function waitImportPreviewSession(sessionId){
  if(!sessionId)throw new Error('Thiếu mã phiên import');

  const maxAttempts=80;
  const delayMs=1500;

  for(let attempt=0;attempt<maxAttempts;attempt+=1){
    const res=await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}`);
    const json=await res.json();

    if(!json.ok){
      throw new Error(json.error||json.message||'Không đọc được trạng thái phiên import');
    }

    const status=String(json.status||'').toLowerCase();

    if(status==='preview_ready'){
      const totalRows=Math.max(0,Number(json.totalRows||0));
      const rows=await loadAllImportSessionRows(json.sessionId||sessionId,totalRows);
      if(importDataMode&&json.importMode==='update')importDataMode.value='update';
      return {
        ok:true,
        source:'import-session-status',
        sessionId:json.sessionId||sessionId,
        importSessionId:json.importSessionId||json.sessionId||sessionId,
        status,
        importMode:json.importMode||getSelectedImportMode(),
        rows,
        total:totalRows,
        valid:json.validRows||0,
        invalid:json.errorRows||0,
        importErrors:json.importErrors||[],
        result:json.result||{}
      };
    }

    if(status==='failed'){
      throw new Error(json.errorMessage||'Import thất bại khi đọc file Excel');
    }

    const percent=json.progress&&json.progress.percent?json.progress.percent:0;
    const step=json.progress&&json.progress.step?json.progress.step:status;

    showMessage(
      importDataMessage,
      `Đang xử lý file Excel... ${percent}% (${step||'queued'})`
    );

    await sleepImportPreview(delayMs);
  }

  throw new Error('Import xử lý quá lâu, vui lòng thử lại hoặc tách nhỏ file Excel');
}

async function downloadImportBlob(url,fileName){
  const res=await fetch(url);
  const blob=await res.blob();

  if(!res.ok){
    let message='Không tải được file Excel';
    try{
      const text=await blob.text();
      const json=JSON.parse(text);
      message=json.message||json.error||message;
    }catch(_){}
    throw new Error(message);
  }

  const objectUrl=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=objectUrl;
  a.download=fileName||'template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

async function downloadImportTemplate(){
  if(!importDataType)return;

  try{
    const type=encodeURIComponent(importDataType.value);
    await downloadImportBlob(`/api/import/template/${type}`,`import-template-${type}.xlsx`);
  }catch(err){
    showMessage(importDataMessage,err.message||'Không tải được mẫu Excel',true);
  }
}

async function previewImportExcel(){
  if(!importDataType||!importExcelFile)return;
  try{
    showMessage(importDataMessage,'Đang đọc file và kiểm tra dữ liệu...');
    const json=await previewImportExcelSilent();
    await ensureImportUsersCache();
    renderImportPreview(json);
    const validNow=importPreviewRows.filter(r=>r&&r.valid).length;
    const selectableNow=importPreviewRows.filter(r=>r&&r.valid&&r.canImport!==false).length;
    const unchangedNow=importPreviewRows.filter(r=>r&&r.action==='no_change').length;
    const invalidNow=Math.max(0,importPreviewRows.length-validNow);
    const fileCount=Array.from(importExcelFile.files||[]).length;
    const modeText=getSelectedImportMode()==='update'?`${selectableNow} dòng có thay đổi, ${unchangedNow} dòng giữ nguyên`:`${validNow} dòng/đơn hợp lệ`;
    showMessage(importDataMessage,`Đã đọc ${fileCount} file: ${modeText}, ${invalidNow} lỗi. Hãy chọn dòng rồi xác nhận.`);
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
  formData.append('importMode',getSelectedImportMode());

  if(customImportTemplateSelect&&customImportTemplateSelect.value){
    formData.append('templateId',customImportTemplateSelect.value);
  }

  files.forEach(file=>formData.append('files',file));

  const res=await fetch('/api/import/preview',{
    method:'POST',
    body:formData
  });

  const json=await res.json();

  if(!json.ok){
    throw new Error(json.error||json.message||'Không đọc được file import');
  }

  // Backend đang chạy async preview: 202 queued.
  // Không render ngay, phải poll session đến khi preview_ready.
  if(res.status===202||json.accepted||String(json.status||'').toLowerCase()==='queued'){
    const sessionId=json.sessionId||json.importSessionId;
    return await waitImportPreviewSession(sessionId);
  }

  return json;
}

async function handleImportExcelAction(){
  if(!importPreviewRows.length){
    await previewImportExcel();
    return;
  }
  await commitImportExcel();
}


function describeImportCommitProgress(progress={},selectedCount=0){
  const percent=Math.max(0,Math.min(100,Number(progress.percent||0)));
  const step=String(progress.step||'').trim();
  const chunkMatch=step.match(/^committing:(\d+)\/(\d+)$/);
  if(chunkMatch){
    return `Đang ghi đơn và trừ tồn theo lô ${chunkMatch[1]}/${chunkMatch[2]} · ${percent}% · ${formatNumber(selectedCount)} đơn/dòng đã chọn`;
  }
  const labels={
    preparing_commit:'Đang chuẩn bị phiên import',
    loading_selected_rows:'Đang tải các dòng đã chọn từ MongoDB',
    revalidating_orders:'Đang kiểm tra lại mã đơn, khách hàng, sản phẩm và NVBH',
    committing:'Đang ghi dữ liệu',
    finalizing:'Đang hoàn tất và ghi nhật ký',
    done:'Đã hoàn tất'
  };
  return `${labels[step]||'Đang import'} · ${percent}% · ${formatNumber(selectedCount)} đơn/dòng đã chọn`;
}

function startImportCommitProgressPolling(sessionId,selectedCount){
  let stopped=false;
  let timer=null;
  const poll=async()=>{
    if(stopped||!sessionId)return;
    try{
      const res=await fetch(`/api/import/sessions/${encodeURIComponent(sessionId)}?t=${Date.now()}`,{cache:'no-store'});
      const json=await res.json();
      if(res.ok&&json.ok){
        const status=String(json.status||'').toLowerCase();
        if(status==='importing'){
          showMessage(importDataMessage,describeImportCommitProgress(json.progress||{},selectedCount));
        }else if(status==='failed'){
          showMessage(importDataMessage,json.errorMessage||'Import thất bại',true);
          stopped=true;
          return;
        }else if(status==='done'){
          stopped=true;
          return;
        }
      }
    }catch(_){
      // Request commit chính vẫn là nguồn kết quả; lỗi polling không được làm hỏng import.
    }
    if(!stopped)timer=setTimeout(poll,1200);
  };
  timer=setTimeout(poll,500);
  return()=>{stopped=true;if(timer)clearTimeout(timer);};
}

async function refreshAfterImport(type){
  if(['promotionProductRules','promotionGroupItems','promotionGroupRules'].includes(type)){
    if(typeof window.reloadPromotionRules==='function')await window.reloadPromotionRules();
    return;
  }
  if(type==='users'){
    if(typeof loadUsers==='function')await loadUsers();
    return;
  }

  const tasks=[];
  const add=(fn)=>{if(typeof fn==='function')tasks.push(Promise.resolve().then(fn));};
  if(type==='salesOrders'){
    add(loadSalesOrders);add(loadStock);
  }else if(type==='products'){
    add(loadProducts);add(loadStock);
  }else if(type==='customers'){
    add(loadCustomers);
  }else if(type==='openingStock'){
    add(loadStock);add(loadProducts);
  }else if(type==='importOrders'){
    add(loadImportOrders);
  }else if(type==='openingDebt'){
    add(loadDebts);
  }else if(type==='debtCollections'){
    add(loadDebts);add(loadReceipts);add(loadCashbook);
  }else if(type==='cashbook'){
    add(loadCashbook);
  }
  if(tasks.length)await Promise.allSettled(tasks);
}

async function commitImportExcel(){
  if(!importDataType||!importExcelFile)return;
  let stopProgressPolling=()=>{};
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
    stopProgressPolling=startImportCommitProgressPolling(importPreviewSessionId,selectedRows.length);

    const res=await fetch('/api/import/commit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        type:importDataType.value,
        importMode:getSelectedImportMode(),
        importSessionId:importPreviewSessionId,
        selectedOrderCodes:selectedRows.map(r=>String(r.documentCode||r.orderCode||r.code||r.username||'').trim()).filter(Boolean),
        shortageMode:importShortageActionMode||'cut'
      })
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.error||json.message||'Import thất bại');

    const shortageText=(json.shortageReport&&json.shortageReport.length)
      ? ` · Đã tự cắt ${displayImportQtyTL(json.shortageSummary?.totalMissingQty||0)} sản phẩm thiếu (${money(json.shortageSummary?.totalCutAmount||0)})`
      : '';
    const durationMs=Number(json.performance&&json.performance.durationMs||0);
    const performanceText=durationMs>0?` · ${Math.max(0.1,durationMs/1000).toFixed(1)} giây`:'';
    const savedReportText=json.shortageReportSaved&&json.shortageReportCode?` · Đã lưu báo cáo ${json.shortageReportCode}`:'';
    showMessage(importDataMessage,(json.message||'Import thành công')+shortageText+savedReportText+performanceText);

    const reportRows=(json.shortageReport||[]).slice(0,80);
    if(importPreviewTable){
      if(reportRows.length){
        importPreviewTable.innerHTML=reportRows.map(r=>`
          <tr>
            <td>${escapeImportHtml(r.documentCode||'')}</td>
            <td>${escapeImportHtml(r.customerName||r.customerCode||'')}</td>
            <td>${escapeImportHtml(r.productCode||'')}</td>
            <td>${escapeImportHtml(r.productName||'')}</td>
            <td>${displayImportQtyTL(r.missingQuantity||0,r)}</td>
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

    await refreshAfterImport(importDataType.value);
    if(importDataType.value==='salesOrders')await loadImportShortageReports();
  }catch(err){
    if(commitImportButton){
      commitImportButton.disabled=false;
      if(commitImportButton.dataset.originalText) commitImportButton.textContent=commitImportButton.dataset.originalText;
    }
    showMessage(importDataMessage,err.message,true);
  }finally{
    stopProgressPolling();
  }
}


// Phase 66: persistent shortage report and reconciliation
let activeImportShortageReport=null;
function importShortageStatusLabel(status){return status==='resolved'?'Đã xử lý':status==='in_review'?'Đang đối soát':'Chưa đối soát';}
function importShortageItemStatusLabel(status){return status==='resolved'?'Đã xử lý':status==='verified'?'Đã kiểm tra':'Chưa kiểm tra';}
function formatImportReportDate(value){
  if(!value)return'';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function csvCell(value){const text=String(value==null?'':value);return `"${text.replace(/"/g,'""')}"`;}
async function loadImportShortageReports(){
  const table=document.getElementById('importShortageReportTable');
  if(!table)return;
  const status=document.getElementById('importShortageReportStatusFilter')?.value||'';
  const search=document.getElementById('importShortageReportSearch')?.value||'';
  table.innerHTML='<tr><td colspan="9">Đang tải báo cáo...</td></tr>';
  try{
    const params=new URLSearchParams({limit:'200'});
    if(status)params.set('status',status);
    if(search)params.set('search',search);
    const res=await fetch(`/api/import/shortage-reports?${params.toString()}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được báo cáo hàng thiếu');
    const rows=Array.isArray(json.reports)?json.reports:[];
    table.innerHTML=rows.length?rows.map(report=>`<tr>
      <td><strong>${escapeHtml(report.code||'')}</strong></td>
      <td>${escapeHtml(formatImportReportDate(report.importDate||report.createdAt))}</td>
      <td>${escapeHtml((report.fileNames||[]).join(', ')||'')}</td>
      <td class="number">${formatNumber(report.orderCount||0)}</td>
      <td class="number">${formatNumber(report.productCount||0)}</td>
      <td class="number">${displayImportQtyTL(report.totalMissingQuantity||0)}</td>
      <td class="number">${money(report.totalCutAmount||0)}</td>
      <td><span class="status-badge ${report.status==='resolved'?'success':report.status==='in_review'?'warning':'danger'}">${importShortageStatusLabel(report.status)}</span></td>
      <td><button type="button" class="secondary view-import-shortage-report" data-id="${escapeHtml(report._id||'')}">Chi tiết</button></td>
    </tr>`).join(''):'<tr><td colspan="9">Chưa có báo cáo hàng thiếu nào.</td></tr>';
  }catch(err){table.innerHTML=`<tr><td colspan="9">${escapeHtml(err.message)}</td></tr>`;}
}
function closeImportShortageReportModal(){
  const modal=document.getElementById('importShortageReportModal');
  if(modal)modal.hidden=true;
  activeImportShortageReport=null;
}
function renderImportShortageReportDetail(report){
  activeImportShortageReport=report;
  const modal=document.getElementById('importShortageReportModal');
  const title=document.getElementById('importShortageReportModalTitle');
  const meta=document.getElementById('importShortageReportModalMeta');
  const summary=document.getElementById('importShortageReportModalSummary');
  const status=document.getElementById('importShortageReportEditStatus');
  const note=document.getElementById('importShortageReportEditNote');
  const body=document.getElementById('importShortageReportDetailTable');
  if(title)title.textContent=`Báo cáo hàng thiếu ${report.code||''}`;
  if(meta)meta.textContent=`Import ${formatImportReportDate(report.importDate||report.createdAt)} · ${(report.fileNames||[]).join(', ')}`;
  if(summary)summary.innerHTML=`<span>Đơn: <strong>${formatNumber(report.orderCount||0)}</strong></span><span>Sản phẩm: <strong>${formatNumber(report.productCount||0)}</strong></span><span>Số lượng thiếu: <strong>${displayImportQtyTL(report.totalMissingQuantity||0)}</strong></span><span>Giá trị cắt: <strong>${money(report.totalCutAmount||0)}</strong></span>`;
  if(status)status.value=report.status||'open';
  if(note)note.value=report.note||'';
  if(body){
    const items=Array.isArray(report.items)?report.items:[];
    body.innerHTML=items.length?items.map(item=>`<tr data-item-id="${escapeHtml(item._id||'')}">
      <td>${escapeHtml(item.documentCode||'')}</td>
      <td>${escapeHtml([item.customerCode,item.customerName].filter(Boolean).join(' - '))}</td>
      <td>${escapeHtml(item.productCode||'')}</td>
      <td>${escapeHtml(item.productName||'')}</td>
      <td class="number">${displayImportQtyTL(item.requestedQuantity||0,item)}</td>
      <td class="number">${displayImportQtyTL(item.availableQuantity||0,item)}</td>
      <td class="number"><strong>${displayImportQtyTL(item.missingQuantity||0,item)}</strong></td>
      <td class="number">${money(item.cutAmount||0)}</td>
      <td><select class="shortage-item-status"><option value="open" ${item.reconciliationStatus==='open'?'selected':''}>Chưa kiểm tra</option><option value="verified" ${item.reconciliationStatus==='verified'?'selected':''}>Đã kiểm tra</option><option value="resolved" ${item.reconciliationStatus==='resolved'?'selected':''}>Đã xử lý</option></select></td>
      <td><input class="shortage-item-note" value="${escapeHtml(item.reconciliationNote||'')}" placeholder="Ghi chú đối soát" /></td>
    </tr>`).join(''):'<tr><td colspan="10">Báo cáo không có dòng hàng thiếu.</td></tr>';
  }
  if(modal)modal.hidden=false;
}
async function openImportShortageReport(id){
  try{
    const res=await fetch(`/api/import/shortage-reports/${encodeURIComponent(id)}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được chi tiết báo cáo');
    renderImportShortageReportDetail(json.report);
  }catch(err){showMessage(importDataMessage,err.message,true);}
}
async function saveImportShortageReport(){
  if(!activeImportShortageReport?._id)return;
  const button=document.getElementById('saveImportShortageReportButton');
  const rows=Array.from(document.querySelectorAll('#importShortageReportDetailTable tr[data-item-id]'));
  const items=rows.map(row=>({
    id:row.dataset.itemId,
    reconciliationStatus:row.querySelector('.shortage-item-status')?.value||'open',
    reconciliationNote:row.querySelector('.shortage-item-note')?.value||''
  }));
  if(button)button.disabled=true;
  try{
    const res=await fetch(`/api/import/shortage-reports/${encodeURIComponent(activeImportShortageReport._id)}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        status:document.getElementById('importShortageReportEditStatus')?.value||'open',
        note:document.getElementById('importShortageReportEditNote')?.value||'',items
      })
    });
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không lưu được đối soát');
    renderImportShortageReportDetail(json.report);
    await loadImportShortageReports();
    showMessage(importDataMessage,`Đã lưu đối soát báo cáo ${json.report?.code||''}`);
  }catch(err){showMessage(importDataMessage,err.message,true);}finally{if(button)button.disabled=false;}
}
function downloadActiveImportShortageReport(){
  const report=activeImportShortageReport;
  if(!report)return;
  const headers=['Mã báo cáo','Ngày import','Mã đơn','Mã KH','Tên KH','Mã SP','Tên SP','SL yêu cầu','Tồn lúc import','SL thiếu','Giá trị cắt','Trạng thái đối soát','Ghi chú'];
  const lines=[headers.map(csvCell).join(',')];
  (report.items||[]).forEach(item=>lines.push([
    report.code,formatImportReportDate(report.importDate||report.createdAt),item.documentCode,item.customerCode,item.customerName,item.productCode,item.productName,item.requestedQuantity,item.availableQuantity,item.missingQuantity,item.cutAmount,importShortageItemStatusLabel(item.reconciliationStatus),item.reconciliationNote
  ].map(csvCell).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${report.code||'bao-cao-hang-thieu'}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}

resetButton.addEventListener('click',resetForm);


// PHASE35_IMPORT_EVENT_OWNERSHIP_START
if(downloadImportTemplateButton)downloadImportTemplateButton.addEventListener('click',downloadImportTemplate);
if(previewImportButton)previewImportButton.addEventListener('click',previewImportExcel);
if(commitImportButton)commitImportButton.addEventListener('click',typeof handleImportExcelAction==='function'?handleImportExcelAction:previewImportExcel);
if(importExcelFile)importExcelFile.addEventListener('change',()=>{importPreviewRows=[];if(commitImportButton){commitImportButton.disabled=!importExcelFile.files.length;commitImportButton.textContent='Xem trước đơn import';}if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Chọn file rồi bấm Xem trước đơn import.</td></tr>';resetImportPreviewMessage();});
if(addImportMappingButton)addImportMappingButton.addEventListener('click',()=>{if(customImportMappingTable)customImportMappingTable.insertAdjacentHTML('beforeend',createMappingRow({}));});
if(customImportMappingTable)customImportMappingTable.addEventListener('click',event=>{const btn=event.target.closest('.remove-custom-map');if(!btn)return;btn.closest('tr')?.remove();if(!customImportMappingTable.children.length)renderCustomImportMapping([]);});
if(saveCustomImportTemplateButton)saveCustomImportTemplateButton.addEventListener('click',saveCustomImportTemplate);
if(loadCustomImportTemplateButton)loadCustomImportTemplateButton.addEventListener('click',loadSelectedCustomTemplateToEditor);
if(downloadCustomImportTemplateButton)downloadCustomImportTemplateButton.addEventListener('click',downloadCustomImportTemplate);
if(deleteCustomImportTemplateButton)deleteCustomImportTemplateButton.addEventListener('click',deleteCustomImportTemplate);
if(importDataType)importDataType.addEventListener('change',async()=>{syncImportModeAvailability();resetImportPreviewForModeChange();await loadImportFieldOptions();await loadCustomImportTemplates();});
if(importDataMode)importDataMode.addEventListener('change',resetImportPreviewForModeChange);
const importShortageReportTable=document.getElementById('importShortageReportTable');
if(importShortageReportTable)importShortageReportTable.addEventListener('click',event=>{const button=event.target.closest('.view-import-shortage-report');if(button)openImportShortageReport(button.dataset.id);});
const reloadImportShortageReportsButton=document.getElementById('reloadImportShortageReportsButton');
if(reloadImportShortageReportsButton)reloadImportShortageReportsButton.addEventListener('click',loadImportShortageReports);
const importShortageReportStatusFilter=document.getElementById('importShortageReportStatusFilter');
if(importShortageReportStatusFilter)importShortageReportStatusFilter.addEventListener('change',loadImportShortageReports);
const importShortageReportSearch=document.getElementById('importShortageReportSearch');
if(importShortageReportSearch)importShortageReportSearch.addEventListener('keydown',event=>{if(event.key==='Enter')loadImportShortageReports();});
document.querySelectorAll('[data-close-import-shortage-report]').forEach(button=>button.addEventListener('click',closeImportShortageReportModal));
const saveImportShortageReportButton=document.getElementById('saveImportShortageReportButton');
if(saveImportShortageReportButton)saveImportShortageReportButton.addEventListener('click',saveImportShortageReport);
const downloadImportShortageReportButton=document.getElementById('downloadImportShortageReportButton');
if(downloadImportShortageReportButton)downloadImportShortageReportButton.addEventListener('click',downloadActiveImportShortageReport);
loadImportShortageReports();
syncImportModeAvailability();
// PHASE35_IMPORT_EVENT_OWNERSHIP_END
