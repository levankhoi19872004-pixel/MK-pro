// Import dữ liệu Excel
function resetImportPreviewMessage(){
  if(importDataMessage)showMessage(importDataMessage,'');
}
function getSelectedImportRows(){
  return importPreviewRows.filter((row,index)=>{
    const checkbox=document.querySelector(`.import-row-check[data-index="${index}"]`);
    return checkbox && checkbox.checked && row.valid;
  });
}
function importRowToText(row){
  const skip=['valid','errors','rowNo'];
  return Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??''}`).join(' | ');
}
function renderImportPreview(result){
  importPreviewRows=result.rows||[];
  const total=result.total||importPreviewRows.length;
  const valid=result.valid||0;
  const invalid=result.invalid||0;
  if(importPreviewSummary){
    importPreviewSummary.innerHTML=`<span>Tổng dòng: <strong>${total}</strong></span><span>Hợp lệ: <strong>${valid}</strong></span><span>Lỗi: <strong>${invalid}</strong></span>`;
  }
  if(!importPreviewRows.length){
    if(importPreviewTable)importPreviewTable.innerHTML='<tr><td colspan="3">Không có dữ liệu preview.</td></tr>';
    if(commitImportButton)commitImportButton.disabled=true;
    return;
  }
  if(importPreviewHead)importPreviewHead.innerHTML='<tr><th>Chọn</th><th>Dòng</th><th>Trạng thái</th><th>Dữ liệu</th><th>Lỗi</th></tr>';
  if(importPreviewTable){
    importPreviewTable.innerHTML=importPreviewRows.map((row,index)=>`
      <tr class="${row.valid?'import-valid':'import-invalid'}">
        <td>${row.valid?`<input class="import-row-check" data-index="${index}" type="checkbox" checked />`:''}</td>
        <td>${row.rowNo||''}</td>
        <td><span class="badge ${row.valid?'active':'inactive'}">${row.valid?'Hợp lệ':'Lỗi'}</span></td>
        <td>${importRowToText(row)}</td>
        <td>${(row.errors||[]).join('; ')}</td>
      </tr>`).join('');
  }
  if(commitImportButton)commitImportButton.disabled=valid<=0;
}
function downloadImportTemplate(){
  if(!importDataType)return;
  const type=encodeURIComponent(importDataType.value);
  window.location.href=`/api/import/template/${type}`;
}

async function previewImportExcel(){
  if(!importDataType||!importExcelFile)return;
  const file=importExcelFile.files[0];
  if(!file){showMessage(importDataMessage,'Bạn chưa chọn file Excel',true);return}
  const formData=new FormData();
  formData.append('type',importDataType.value);
  formData.append('file',file);
  try{
    showMessage(importDataMessage,'Đang đọc file và kiểm tra dữ liệu...');
    const res=await fetch('/api/import/preview',{method:'POST',body:formData});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không preview được file import');
    renderImportPreview(json);
    showMessage(importDataMessage,`Preview xong: ${json.valid||0} dòng hợp lệ, ${json.invalid||0} dòng lỗi.`);
  }catch(err){
    importPreviewRows=[];
    if(commitImportButton)commitImportButton.disabled=true;
    showMessage(importDataMessage,err.message,true);
  }
}
async function commitImportExcel(){
  if(!importDataType)return;
  const rows=getSelectedImportRows();
  if(!rows.length){showMessage(importDataMessage,'Chưa chọn dòng hợp lệ nào để import',true);return}
  try{
    showMessage(importDataMessage,'Đang ghi dữ liệu import vào hệ thống...');
    const res=await fetch('/api/import/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:importDataType.value,rows})});
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Import thất bại');
    showMessage(importDataMessage,json.message||'Import thành công');
    if(commitImportButton)commitImportButton.disabled=true;
    await loadProducts();await loadCustomers();await loadStock();await loadImportOrders();await loadSalesOrders();await loadDebts();await loadCashbook();
  }catch(err){showMessage(importDataMessage,err.message,true)}
}

