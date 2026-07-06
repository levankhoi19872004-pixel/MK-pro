/* Import warning popup: shows only invalid/missing rows before committing valid rows. */
let importLastWarningRows=[];
function normalizeImportWarningText(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function inferImportWarningCode(message){
  const text=normalizeImportWarningText(message);
  if(/\bthieu\b|trong|bat buoc/.test(text))return 'MISSING_REQUIRED';
  if(/khong tim thay|chua co|khong ton tai|not found/.test(text))return 'REFERENCE_NOT_FOUND';
  if(/trung.*file|duplicate.*file/.test(text))return 'DUPLICATE_IN_FILE';
  if(/da ton tai|trung.*du lieu|duplicate/.test(text))return 'DUPLICATE_IN_DB';
  if(/sai dinh dang|khong hop le|invalid|format/.test(text))return 'INVALID_FORMAT';
  if(/bo qua|skip/.test(text))return 'SKIPPED';
  return 'BUSINESS_RULE_ERROR';
}
const IMPORT_WARNING_FIELD_HINTS=[
  {field:'programCode',label:'Mã CTKM',tokens:['ma ctkm','ma chuong trinh','chuong trinh','program','promotion']},
  {field:'groupCode',label:'Mã nhóm',tokens:['ma nhom','nhom san pham','group']},
  {field:'productCode',label:'Mã sản phẩm',tokens:['ma san pham','san pham','product','sku']},
  {field:'productName',label:'Tên sản phẩm',tokens:['ten san pham','product name']},
  {field:'customerCode',label:'Mã khách hàng',tokens:['ma khach hang','ma kh','khach hang','customer']},
  {field:'salesStaffCode',label:'Mã NVBH',tokens:['ma nvbh','nvbh','nhan vien ban hang','sales staff']},
  {field:'deliveryStaffCode',label:'Mã NVGH',tokens:['ma nvgh','nvgh','nhan vien giao hang','delivery staff']},
  {field:'documentCode',label:'Mã đơn/chứng từ',tokens:['ma don','ma chung tu','so don','order','document']},
  {field:'date',label:'Ngày',tokens:['ngay','date']},
  {field:'quantity',label:'Số lượng',tokens:['so luong','quantity','qty']},
  {field:'salePrice',label:'Giá bán',tokens:['gia ban','don gia','price']},
  {field:'discountPercent',label:'Chiết khấu',tokens:['chiet khau','ck','discount']},
  {field:'amount',label:'Số tiền',tokens:['so tien','amount','thanh tien']}
];
function normalizeImportWarningFieldKey(value){
  return normalizeImportWarningText(value).replace(/[^a-z0-9]/g,'');
}
function inferImportWarningField(message,explicitField='',explicitLabel=''){
  const field=String(explicitField||'').trim();
  if(field)return{field,label:explicitLabel||IMPORT_WARNING_FIELD_HINTS.find(item=>item.field===field)?.label||field};
  const text=normalizeImportWarningText(message);
  const found=IMPORT_WARNING_FIELD_HINTS.find(item=>item.tokens.some(token=>text.includes(token)));
  return found||{field:'',label:explicitLabel||'Dữ liệu'};
}
function pickImportWarningValue(row,field,explicitValue){
  if(explicitValue!==undefined&&explicitValue!==null&&String(explicitValue).trim()!=='')return explicitValue;
  if(!field)return '';
  const pools=[row,row&&row.raw,row&&row.source,row&&row.normalized,row&&row.payload].filter(item=>item&&typeof item==='object');
  const wanted=normalizeImportWarningFieldKey(field);
  for(const pool of pools){
    if(Object.prototype.hasOwnProperty.call(pool,field)&&pool[field]!==undefined&&pool[field]!==null)return pool[field];
    for(const [key,value] of Object.entries(pool)){
      if(normalizeImportWarningFieldKey(key)===wanted&&value!==undefined&&value!==null)return value;
    }
  }
  return '';
}
function rowHasImportWarningIssue(row){
  if(!row)return false;
  const status=String(row.status||'').toLowerCase();
  return row.valid===false||importRowErrorList(row).length>0||importRowHasMissingCatalogProduct(row)||['invalid','error','skipped'].includes(status);
}
function normalizeImportWarningIssue(row,index,issue){
  const source=issue&&typeof issue==='object'&&!Array.isArray(issue)?issue:{};
  const message=String(source.message||source.error||source.warning||source.reason||issue||row.statusText||'Dòng dữ liệu không hợp lệ').trim();
  const inferred=inferImportWarningField(message,source.field,source.label);
  const rowNo=Number(source.rowNo||source.row||row?.rowNo||row?.sourceRowNo||row?.__rowNo||row?.rowNumber||index+1)||0;
  const value=pickImportWarningValue(row,inferred.field,source.value!==undefined?source.value:source.rawValue);
  return{
    rowNo,
    field:inferred.field||'',
    label:source.label||inferred.label||'Dữ liệu',
    value:String(value??'').trim()||'Trống',
    code:String(source.code||source.errorCode||inferImportWarningCode(message)).toUpperCase(),
    message,
    sourceFile:source.sourceFile||row?.sourceFile||row?.__sourceFile||row?.fileName||''
  };
}
function buildImportWarningRowsFromPreview(rows=[]){
  const result=[];
  (Array.isArray(rows)?rows:[]).forEach((row,index)=>{
    if(!rowHasImportWarningIssue(row))return;
    const errors=importRowErrorList(row);
    if(errors.length){
      errors.forEach(error=>result.push(normalizeImportWarningIssue(row,index,error)));
    }else{
      result.push(normalizeImportWarningIssue(row,index,row.statusText||'Dòng dữ liệu không hợp lệ'));
    }
    if(Array.isArray(row.detailErrors)){
      row.detailErrors.forEach(detail=>{
        (Array.isArray(detail&&detail.errors)?detail.errors:[]).forEach(error=>{
          result.push(normalizeImportWarningIssue({...row,...detail},index,{message:error,rowNo:detail.rowNo,field:detail.field||'',value:detail.value}));
        });
      });
    }
  });
  return result;
}
function normalizeBackendImportInvalidRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map((item,index)=>normalizeImportWarningIssue({},index,{
    rowNo:item.rowNo||item.row,
    field:item.field,
    label:item.label,
    value:item.value!==undefined?item.value:item.rawValue,
    code:item.code,
    message:item.message||item.error||item.reason,
    sourceFile:item.sourceFile
  })).filter(item=>item.message);
}
function buildImportWarningRows(result={}){
  const derived=buildImportWarningRowsFromPreview(importPreviewRows);
  if(derived.length)return derived;
  return normalizeBackendImportInvalidRows(result.invalidRows||result.importErrors||[]);
}
function importWarningCsvCell(value){
  return `"${String(value??'').replace(/"/g,'""')}"`;
}
function exportImportWarningRows(){
  const rows=importLastWarningRows||[];
  if(!rows.length)return;
  const headers=['Dòng Excel','File nguồn','Cột lỗi','Giá trị','Mã lỗi','Lý do'];
  const lines=[headers.map(importWarningCsvCell).join(',')];
  rows.forEach(row=>lines.push([
    row.rowNo,
    row.sourceFile||'',
    row.label||row.field||'Dữ liệu',
    row.value,
    row.code,
    row.message
  ].map(importWarningCsvCell).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`import-loi-thieu-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function ensureImportWarningModal(){
  let modal=document.getElementById('importWarningModal');
  if(modal)return modal;
  document.body.insertAdjacentHTML('beforeend',`
    <div id="importWarningModal" class="modal-backdrop import-warning-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="importWarningModalTitle">
      <div class="modal-card import-warning-modal-card">
        <div class="modal-head">
          <div>
            <h3 id="importWarningModalTitle">Cảnh báo dữ liệu import</h3>
            <p class="muted">Chỉ liệt kê dòng lỗi hoặc dòng thiếu dữ liệu. Dòng hợp lệ không cần review và vẫn có thể import.</p>
          </div>
          <button type="button" id="closeImportWarningModalButton" class="secondary">Đóng</button>
        </div>
        <div id="importWarningModalReport" class="import-preview-report import-warning-report"></div>
        <div class="button-row import-preview-modal-actions import-warning-actions">
          <button type="button" id="commitImportWarningValidRowsButton">Import dòng hợp lệ</button>
          <button type="button" id="exportImportWarningRowsButton" class="secondary">Xuất danh sách lỗi</button>
          <button type="button" id="dismissImportWarningRowsButton" class="secondary">Đóng</button>
        </div>
        <div class="import-warning-table-wrap">
          <table class="import-warning-table">
            <thead><tr><th>Dòng Excel</th><th>Cột lỗi</th><th>Giá trị</th><th>Mã lỗi</th><th>Lý do</th></tr></thead>
            <tbody id="importWarningModalBody"></tbody>
          </table>
        </div>
      </div>
    </div>`);
  modal=document.getElementById('importWarningModal');
  modal.addEventListener('click',event=>{if(event.target===modal)closeImportWarningModal();});
  document.getElementById('closeImportWarningModalButton')?.addEventListener('click',closeImportWarningModal);
  document.getElementById('dismissImportWarningRowsButton')?.addEventListener('click',closeImportWarningModal);
  document.getElementById('exportImportWarningRowsButton')?.addEventListener('click',exportImportWarningRows);
  document.getElementById('commitImportWarningValidRowsButton')?.addEventListener('click',async()=>{
    if(!getSelectedImportRows().length){
      showMessage(importDataMessage,'Không có dòng hợp lệ để import.',true);
      return;
    }
    closeImportWarningModal();
    await commitImportExcel();
  });
  return modal;
}
function closeImportWarningModal(){
  const modal=document.getElementById('importWarningModal');
  if(modal){
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
  }
  if(!document.querySelector('.modal-backdrop.show'))document.body.classList.remove('modal-open');
}
function renderImportWarningModal(result={}){
  const warningRows=buildImportWarningRows(result);
  if(!warningRows.length)return false;
  importLastWarningRows=warningRows;
  const modal=ensureImportWarningModal();
  const report=document.getElementById('importWarningModalReport');
  const body=document.getElementById('importWarningModalBody');
  const commitButton=document.getElementById('commitImportWarningValidRowsButton');
  const total=Math.max(importPreviewRows.length,Number(result.total||result.totalRows||result.summary?.totalRows||0));
  const importable=importPreviewRows.filter(isImportRowSelectable).length;
  const skipped=warningRows.length;
  if(report){
    report.innerHTML=`
      <div class="import-report-card"><span>Tổng dòng/đơn</span><strong>${formatNumber(total)}</strong></div>
      <div class="import-report-card success"><span>Sẽ import</span><strong>${formatNumber(importable)}</strong></div>
      <div class="import-report-card danger"><span>Lỗi/thiếu</span><strong>${formatNumber(warningRows.length)}</strong></div>
      <div class="import-report-card danger"><span>Sẽ bỏ qua</span><strong>${formatNumber(skipped)}</strong></div>`;
  }
  if(body){
    const visible=warningRows.slice(0,500);
    const hidden=Math.max(0,warningRows.length-visible.length);
    body.innerHTML=visible.map(row=>`
      <tr class="import-warning-row">
        <td class="number"><strong>${escapeImportHtml(row.rowNo||'')}</strong>${row.sourceFile?`<div class="muted">${escapeImportHtml(row.sourceFile)}</div>`:''}</td>
        <td><span class="import-warning-field">${escapeImportHtml(row.label||row.field||'Dữ liệu')}</span></td>
        <td>${escapeImportHtml(row.value||'Trống')}</td>
        <td><code>${escapeImportHtml(row.code||'BUSINESS_RULE_ERROR')}</code></td>
        <td>${escapeImportHtml(row.message||'Dòng dữ liệu không hợp lệ')}</td>
      </tr>`).join('')+(hidden?`<tr><td colspan="5" class="muted">Còn ${formatNumber(hidden)} lỗi khác. Hãy xuất danh sách lỗi để xem đầy đủ.</td></tr>`:'');
  }
  if(commitButton){
    commitButton.disabled=importable<=0;
    commitButton.textContent=importable>0?`Import ${formatNumber(importable)} dòng hợp lệ`:'Không có dòng hợp lệ để import';
  }
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  return true;
}
