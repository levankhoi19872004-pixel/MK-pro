function reportDateInRange(dateText, fromDate, toDate){
  const value=String(dateText||'').slice(0,10);
  if(fromDate && value<fromDate)return false;
  if(toDate && value>toDate)return false;
  return true;
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
async function loadReports(){
  if(!reportSalesTable)return;
  setReportDefaults();
  const fromDate=reportFromDate?reportFromDate.value:'';
  const toDate=reportToDate?reportToDate.value:'';
  try{
    reportSalesSummary.textContent='Đang tải báo cáo...';
    reportStockSummary.textContent='Đang tải tồn kho...';
    reportDebtSummary.textContent='Đang tải công nợ...';
    reportCashSummary.textContent='Đang tải quỹ tiền...';
    const [salesJson,stockJson,debtJson,cashJson]=await Promise.all([
      fetchJson('/api/sales-orders'),
      fetchJson('/api/stock'),
      fetchJson('/api/debts'),
      fetchJson('/api/cashbook')
    ]);

    const salesOrders=(salesJson.salesOrders||[]).filter(order=>reportDateInRange(order.date||order.createdAt,fromDate,toDate));
    const stockRows=stockJson.stock||[];
    const debtRows=debtJson.debts||[];
    const cashRows=(cashJson.cashbook||[]).filter(entry=>reportDateInRange(entry.date||entry.createdAt,fromDate,toDate));
    const cashSummaryData=cashJson.summary||{cashIn:0,cashOut:0,balance:0};

    const revenue=salesOrders.reduce((sum,o)=>sum+Number(o.totalAmount||0),0);
    const collected=salesOrders.reduce((sum,o)=>sum+Number(o.paidAmount||0),0);
    const orderDebt=salesOrders.reduce((sum,o)=>sum+Number(o.debtAmount||0),0);
    const totalDebt=debtRows.reduce((sum,d)=>sum+Number(d.debt||0),0);

    if(reportRevenue)reportRevenue.textContent=money(revenue);
    if(reportCollected)reportCollected.textContent=money(collected);
    if(reportDebt)reportDebt.textContent=money(totalDebt);
    if(reportCashBalance)reportCashBalance.textContent=money(cashSummaryData.balance);
    if(reportOrderCount)reportOrderCount.textContent=`${salesOrders.length} đơn bán · nợ theo kỳ ${money(orderDebt)}`;

    reportSalesSummary.textContent=`${salesOrders.length} đơn · Doanh thu ${money(revenue)} · Đã thu ${money(collected)}`;
    if(!salesOrders.length){
      reportSalesTable.innerHTML='<tr><td colspan="9">Không có đơn bán trong khoảng ngày đã chọn.</td></tr>';
    }else{
      reportSalesTable.innerHTML=salesOrders.slice(0,100).map(o=>`<tr><td><strong>${o.code||''}</strong></td><td>${orderSourceLabel(o.orderSource,o)}</td><td>${o.date||''}</td><td>${o.customerCode||''} ${o.customerName||''}</td><td>${money(o.totalQuantity)}</td><td class="price">${money(o.totalAmount)}</td><td class="price cash-in">${money(o.paidAmount)}</td><td class="price ${Number(o.debtAmount||0)>0?'debt-positive':'debt-zero'}">${money(o.debtAmount)}</td><td>${deliveryLabel(o.deliveryStatus)}</td></tr>`).join('');
    }

    const productMinMap=new Map((productsCache||[]).map(p=>[String(p.code||''),Number(p.minStock||0)]));
    const importantStock=stockRows
      .map(row=>({ ...row, minStock:productMinMap.get(String(row.productCode||''))||0 }))
      .filter(row=>Number(row.quantity||0)<=0 || (row.minStock>0 && Number(row.quantity||0)<=row.minStock))
      .sort((a,b)=>Number(a.quantity||0)-Number(b.quantity||0));
    reportStockSummary.textContent=`${importantStock.length} mặt hàng cần chú ý / ${stockRows.length} dòng tồn`;
    if(!importantStock.length){
      reportStockTable.innerHTML='<tr><td colspan="5">Chưa có mặt hàng dưới tồn tối thiểu hoặc hết hàng.</td></tr>';
    }else{
      reportStockTable.innerHTML=importantStock.slice(0,100).map(r=>`<tr><td><strong>${r.productCode||''}</strong></td><td>${r.productName||''}</td><td>${r.unit||''}</td><td class="stock-qty">${money(r.quantity)}</td><td><span class="badge ${Number(r.quantity||0)<=0?'out':'warn'}">${Number(r.quantity||0)<=0?'Hết hàng':'Dưới tồn min'}</span></td></tr>`).join('');
    }

    const debtTop=[...debtRows].sort((a,b)=>Number(b.debt||0)-Number(a.debt||0)).filter(d=>Number(d.debt||0)>0);
    reportDebtSummary.textContent=`${debtTop.length} khách còn nợ · Tổng nợ ${money(totalDebt)}`;
    if(!debtTop.length){
      reportDebtTable.innerHTML='<tr><td colspan="6">Không có khách còn nợ.</td></tr>';
    }else{
      reportDebtTable.innerHTML=debtTop.slice(0,100).map(d=>`<tr><td><strong>${d.customerCode||''}</strong></td><td>${d.customerName||''}</td><td>${d.phone||''}</td><td class="price">${money(d.debit)}</td><td class="price cash-in">${money(d.credit)}</td><td class="price debt-positive">${money(d.debt)}</td></tr>`).join('');
    }

    const cashIn=cashRows.filter(e=>e.type==='in').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const cashOut=cashRows.filter(e=>e.type==='out').reduce((sum,e)=>sum+Number(e.amount||0),0);
    reportCashSummary.textContent=`Trong kỳ: Thu ${money(cashIn)} · Chi ${money(cashOut)} · Chênh lệch ${money(cashIn-cashOut)}`;
    if(!cashRows.length){
      reportCashTable.innerHTML='<tr><td colspan="6">Không có phát sinh quỹ trong khoảng ngày đã chọn.</td></tr>';
    }else{
      reportCashTable.innerHTML=cashRows.slice(0,100).map(e=>`<tr><td><strong>${e.code||''}</strong></td><td>${e.date||''}</td><td><span class="badge ${e.type==='out'?'out':'in'}">${e.isBank?'NH ':''}${e.type==='out'?'Chi':'Thu'}</span></td><td>${e.source||''}</td><td>${e.staffName||e.customerName||''}</td><td class="price ${e.type==='out'?'cash-out':'cash-in'}">${money(e.amount)}</td></tr>`).join('');
    }
  }catch(err){
    if(reportSalesSummary)reportSalesSummary.textContent=err.message;
    if(reportSalesTable)reportSalesTable.innerHTML=`<tr><td colspan="9">${err.message}</td></tr>`;
  }
}



function roleText(role){
  const map={admin:'Admin',accountant:'Kế toán',sales:'Bán hàng',delivery:'Giao hàng'};
  return map[role]||role||'';
}
async function loadUsers(){
  if(!userTable)return;
  try{
    const q=encodeURIComponent(userSearchInput?.value||'');
    const res=await fetch(`/api/users?q=${q}`);
    const json=await res.json();
    if(!json.ok)throw new Error(json.message||'Không tải được tài khoản');
    usersCache=json.users||[];
    renderSalesStaffSelect();
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
  }catch(err){showMessage(importDataMessage,err.message,true)}
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
  }catch(err){showMessage(importDataMessage,err.message,true)}
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
  }catch(err){showMessage(importDataMessage,err.message,true)}
}
function resetImportPreviewMessage(){
  if(importDataMessage)showMessage(importDataMessage,'');
}
function getSelectedImportRows(){
  return importPreviewRows.filter((row,index)=>{
    const checkbox=document.querySelector(`.import-row-check[data-index="${index}"]`);
    return checkbox && checkbox.checked && row.valid;
  });
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
    return `Mã đơn: ${row.documentCode||''} | Khách/NCC: ${customer} | Số dòng: ${row.lineCount||0} | Giá trị: ${total} | Trạng thái: ${status}${shortage}`;
  }
  const skip=['valid','errors','rowNo','raw','__importRows','__adjustedRows','lineDetails','shortageReport','detailErrors'];
  return Object.keys(row).filter(k=>!skip.includes(k)).map(k=>`${k}: ${row[k]??''}`).join(' | ');
}
function getImportRowMainFields(row){
  if(row&&row.previewMode==='order'){
    return [
      {key:'Mã đơn',value:row.documentCode||''},
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
            ${row.valid?`<input class="import-row-check import-modal-row-check" data-index="${index}" type="checkbox" checked />`:''}
            <span>Dòng ${escapeImportHtml(row.rowNo||'')}</span>
          </label>
          <span class="badge ${row.valid?'active':'inactive'}">${row.valid?'Hợp lệ':'Lỗi'}</span>
        </div>
        <div class="import-preview-grid">${fieldHtml}</div>
        ${row.previewMode==='order'?renderImportOrderDetailHtml(row):''}
        ${errors.length?`<div class="import-preview-error"><b>Lỗi:</b> ${escapeImportHtml(errors.join('; '))}</div>`:''}
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
  const selected=document.querySelectorAll('.import-modal-row-check:checked').length || getSelectedImportRows().length;
  const el=document.getElementById('importPreviewSelectedCount');
  if(el)el.textContent=formatNumber(selected);
}
function syncImportChecksFromModal(){
  document.querySelectorAll('.import-modal-row-check').forEach(cb=>{
    const inline=document.querySelector(`.import-preview-wrap .import-row-check[data-index="${cb.dataset.index}"]`);
    if(inline)inline.checked=cb.checked;
  });
  syncImportSelectedCount();
}
function bindImportPreviewModalControls(){
  const closeBtn=document.getElementById('closeImportPreviewModalButton');
  if(closeBtn)closeBtn.onclick=closeImportPreviewModal;
  const selectAll=document.getElementById('selectAllImportPreviewButton');
  if(selectAll)selectAll.onclick=()=>{document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.checked=true);syncImportChecksFromModal();};
  const clearAll=document.getElementById('clearAllImportPreviewButton');
  if(clearAll)clearAll.onclick=()=>{document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.checked=false);syncImportChecksFromModal();};
  const importBtn=document.getElementById('commitImportFromModalButton');
  if(importBtn)importBtn.onclick=()=>{syncImportChecksFromModal();commitImportExcel();};
  document.querySelectorAll('.import-modal-row-check').forEach(cb=>cb.onchange=syncImportChecksFromModal);
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
  const orderMode=importPreviewRows.some(r=>r&&r.previewMode==='order');
  if(importPreviewHead){
    importPreviewHead.innerHTML=orderMode
      ? '<tr><th>Chọn</th><th>Mã đơn</th><th>Khách hàng/NCC</th><th>Số dòng</th><th>Giá trị</th><th>Trạng thái</th><th>Báo cáo vượt tồn</th></tr>'
      : '<tr><th>Chọn</th><th>Dòng</th><th>Trạng thái</th><th>Dữ liệu</th><th>Lỗi</th></tr>';
  }
  if(importPreviewTable){
    if(orderMode){
      importPreviewTable.innerHTML=importPreviewRows.map((row,index)=>`
        <tr class="${row.valid?'import-valid':'import-invalid'} ${row.hasShortage?'import-shortage-row':''}">
          <td>${row.valid?`<input class="import-row-check" data-index="${index}" type="checkbox" checked />`:''}</td>
          <td><strong>${escapeImportHtml(row.documentCode||'')}</strong></td>
          <td>${escapeImportHtml(row.customerName||row.supplier||row.customerCode||'')}</td>
          <td>${formatNumber(row.lineCount||0)}</td>
          <td class="price">${money(row.totalAmount||0)}</td>
          <td><span class="badge ${row.valid?(row.hasShortage?'warn':'active'):'inactive'}">${escapeImportHtml(row.statusText||(row.valid?'Hợp lệ':'Lỗi'))}</span></td>
          <td>${row.hasShortage?`Vượt ${formatNumber(row.shortageQuantity||0)} · Cắt ${money(row.shortageAmount||0)}`:(row.errors||[]).join('; ')}</td>
        </tr>`).join('');
    }else{
      importPreviewTable.innerHTML=importPreviewRows.map((row,index)=>`
        <tr class="${row.valid?'import-valid':'import-invalid'}">
          <td>${row.valid?`<input class="import-row-check" data-index="${index}" type="checkbox" checked />`:''}</td>
          <td>${row.rowNo||''}</td>
          <td><span class="badge ${row.valid?'active':'inactive'}">${row.valid?'Hợp lệ':'Lỗi'}</span></td>
          <td>${importRowToText(row)}</td>
          <td>${(row.errors||[]).join('; ')}</td>
        </tr>`).join('');
    }
  }
  renderImportPreviewModal(result);
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
  if(customImportTemplateSelect&&customImportTemplateSelect.value)formData.append('templateId',customImportTemplateSelect.value);
  formData.append('file',file);
  try{
    showMessage(importDataMessage,'Đang đọc file và kiểm tra dữ liệu...');
    const res=await fetch('/api/import/preview',{method:'POST',body:formData});
    const json=await res.json();
    if(!json.ok)throw new Error(json.error||json.message||'Không preview được file import');
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
  const hasShortage=rows.some(row=>row&&row.hasShortage);
  let shortageMode='';
  if(importDataType.value==='salesOrders'&&hasShortage){
    const shortageAmount=rows.reduce((sum,row)=>sum+Number(row.shortageAmount||0),0);
    const shortageQty=rows.reduce((sum,row)=>sum+Number(row.shortageQuantity||0),0);
    const ok=confirm(`Có đơn vượt tồn.\n\nSL hàng sẽ bị cắt: ${formatNumber(shortageQty)}\nGiá trị bị cắt: ${money(shortageAmount)}\n\nBấm OK để TIẾP TỤC import theo tồn thực tế.\nBấm Cancel để DỪNG import.`);
    if(!ok){
      showMessage(importDataMessage,'Đã dừng import vì có đơn vượt tồn.',true);
      return;
    }
    shortageMode='cut';
  }
  try{
    showMessage(importDataMessage,'Đang ghi dữ liệu import vào hệ thống...');
    const commitPayload=(mode='')=>({type:importDataType.value,rows,shortageMode:mode||shortageMode});
    let res=await fetch('/api/import/commit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(commitPayload(shortageMode))
    });
    let json=await res.json();

    // Fallback an toàn: nếu backend phát hiện còn đơn vượt tồn nhưng frontend chưa gửi shortageMode=cut
    // thì hỏi lại người dùng và gửi lại request với chế độ cắt theo tồn thực tế.
    if(!json.ok && json.hasShortage && importDataType.value==='salesOrders'){
      const shortageRows=Array.isArray(json.shortageReport)?json.shortageReport:[];
      const shortageQty=shortageRows.reduce((sum,item)=>sum+Number(item.missingQuantity||0),0);
      const shortageAmount=shortageRows.reduce((sum,item)=>sum+Number(item.cutAmount||0),0);
      const ok=confirm(`Backend phát hiện đơn vượt tồn.\n\nSL hàng sẽ bị cắt: ${formatNumber(shortageQty)}\nGiá trị bị cắt: ${money(shortageAmount)}\n\nBấm OK để TIẾP TỤC import theo tồn thực tế.\nBấm Cancel để DỪNG import.`);
      if(!ok){
        showMessage(importDataMessage,'Đã dừng import vì có đơn vượt tồn.',true);
        return;
      }
      showMessage(importDataMessage,'Đang import theo tồn thực tế...');
      res=await fetch('/api/import/commit',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(commitPayload('cut'))
      });
      json=await res.json();
    }

    if(!json.ok)throw new Error(json.error||json.message||'Import thất bại');
    const shortageText=(json.shortageReport&&json.shortageReport.length)?` · Đã cắt ${formatNumber(json.shortageSummary?.totalMissingQty||0)} sản phẩm thiếu (${money(json.shortageSummary?.totalCutAmount||0)})`:'';
    showMessage(importDataMessage,(json.message||'Import thành công')+shortageText);
    if(commitImportButton)commitImportButton.disabled=true;

    // Khi import đơn bán DMS, tự chuyển bộ lọc danh sách đơn bán về đúng ngày của file import.
    // Tránh trường hợp dữ liệu đã ghi vào Mongo nhưng danh sách đang mặc định lọc hôm nay nên người dùng tưởng chưa có đơn.
    if(importDataType.value==='salesOrders' && rows.length){
      const dates=rows.map(r=>String(r.date||r.orderDate||r.deliveryDate||'').slice(0,10)).filter(Boolean).sort();
      if(dates.length){
        if(salesOrderDateFrom)salesOrderDateFrom.value=dates[0];
        if(salesOrderDateTo)salesOrderDateTo.value=dates[dates.length-1];
      }
      if(salesOrderSourceFilter)salesOrderSourceFilter.value='DMS';
    }

    await loadProducts();await loadCustomers();await loadStock();await loadImportOrders();await loadSalesOrders();await loadDebts();await loadReceipts();await loadCashbook();
  }catch(err){showMessage(importDataMessage,err.message,true)}
}

resetButton.addEventListener('click',resetForm);
