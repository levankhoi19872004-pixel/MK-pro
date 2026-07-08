'use strict';

(function(){
  const state = { result: null, activeTable: 'orders' };
  const $ = (id) => document.getElementById(id);
  function text(value){ return String(value == null ? '' : value); }
  function fmt(value){ return Number(value || 0).toLocaleString('vi-VN'); }
  function escapeHtml(value){ return text(value).replace(/[&<>'"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function setStatus(message, type){ const el=$('dmsGapStatus'); if(!el)return; el.textContent=message||''; el.className='message dms-gap-status '+(type||''); }
  function optionPayload(){ return {
    scenarioCount:Number($('dmsGapScenarioCount')?.value||300),
    toleranceAmount:Number($('dmsGapToleranceAmount')?.value||10000),
    globalToleranceAmount:Number($('dmsGapGlobalToleranceAmount')?.value||50000),
    temperature:Number($('dmsGapTemperature')?.value||0.35),
    weightPromotion:Number($('dmsGapWeightPromotion')?.value||0.45),
    weightCustomerFit:Number($('dmsGapWeightCustomerFit')?.value||0.25),
    weightDmsGap:Number($('dmsGapWeightDmsGap')?.value||0.15),
    weightPriceFit:Number($('dmsGapWeightPriceFit')?.value||0.10),
    weightDuplicatePenalty:Number($('dmsGapWeightDuplicatePenalty')?.value||0.05),
    minLinesPerOrder:Number($('dmsGapMinLinesPerOrder')?.value||3),
    maxLinesPerOrder:Number($('dmsGapMaxLinesPerOrder')?.value||8),
    targetAmountPerLine:Number($('dmsGapTargetAmountPerLine')?.value||900000),
    maxSkuValueRatio:Number($('dmsGapMaxSkuValueRatio')?.value||0.65),
    promotionThresholdAware:true,
    dmsComparisonType:$('dmsGapComparisonType')?.value||'dms_greater',
    promotionDate:$('dmsGapPromotionDate')?.value||''
  }; }
  function table(headers, rows){ if(!rows||!rows.length)return '<p class="muted">Chưa có dữ liệu.</p>'; return '<div class="dms-gap-table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+escapeHtml(h.label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+headers.map(h=>'<td>'+escapeHtml(typeof h.value==='function'?h.value(row):row[h.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'; }
  function renderSummary(){ const box=$('dmsGapSummary'); if(!box)return; const s=state.result?.summary; if(!s){ box.innerHTML='<span>Chưa preview</span>'; return; } box.innerHTML=[
    ['Nguồn SP lệch', s.dmsGapSourceLabel||'MK-Pro'],
    ['Nguồn KM', s.promotionSourceLabel||'MK-Pro'],
    ['Chế độ', s.generationModeLabel||s.generationMode||''],
    ['DMS lệch', fmt(s.totalDmsGapAmount)],
    ['Chỉ tiêu KH', fmt(s.totalCustomerTargetAmount)],
    ['Đã sinh', fmt(s.generatedAmount)],
    ['DMS còn dư', fmt(s.dmsRemainingAmount)],
    ['KH đạt', fmt(s.achievedCustomerCount)+'/'+fmt(s.totalCustomerCount)],
    ['Nhóm KM đạt theo đơn', fmt(s.achievedGroupCount)+'/'+fmt((s.achievedGroupCount||0)+(s.notAchievedGroupCount||0))],
    ['Lượt đơn đủ Ontop', fmt(s.promotionQualifiedOrderCount||0)],
    ['Lượt đơn chưa đủ Ontop', fmt(s.promotionUnqualifiedOrderCount||0)]
  ].map(([label,value])=>'<span>'+escapeHtml(label)+': <strong>'+escapeHtml(value)+'</strong></span>').join(''); }
  function renderPreview(){ renderSummary(); const body=$('dmsGapPreviewBody'); if(!body)return; const r=state.result; if(!r){ body.innerHTML='<p class="muted">Upload file khách cần chấm và bấm Sinh đơn tham khảo để xem kết quả.</p>'; return; } document.querySelectorAll('.dms-gap-preview-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===state.activeTable));
    if(state.activeTable==='items'){ body.innerHTML=table([{label:'Mã KH',key:'customerCode'},{label:'Tên KH',key:'customerName'},{label:'Mã SP',key:'productCode'},{label:'Tên SP',key:'productName'},{label:'SL',key:'quantity'},{label:'Giá',value:x=>fmt(x.price)},{label:'Thành tiền',value:x=>fmt(x.amount)},{label:'Nhóm KM',key:'groupLabel'}],r.orderItems||[]); return; }
    if(state.activeTable==='groups'){ body.innerHTML=table([{label:'Mã nhóm',key:'groupCode'},{label:'Tên nhóm',key:'groupName'},{label:'Ngưỡng/đơn',value:x=>fmt(x.targetAmount)},{label:'DS gợi ý',value:x=>fmt(x.actualAmount)},{label:'Số đơn đạt',key:'qualifiedOrderCount'},{label:'Số đơn chưa đủ',key:'unqualifiedOrderCount'},{label:'DS đủ điều kiện',value:x=>fmt(x.qualifiedAmount)},{label:'DS chưa đủ',value:x=>fmt(x.unqualifiedAmount)},{label:'Trạng thái',key:'status'}],r.groupSummary||[]); return; }
    if(state.activeTable==='ontopOrders'){ body.innerHTML=table([{label:'Mã KH',key:'customerCode'},{label:'Tên KH',key:'customerName'},{label:'Mã nhóm',key:'groupCode'},{label:'Tên nhóm',key:'groupName'},{label:'Ngưỡng Ontop/đơn',value:x=>fmt(x.targetAmount)},{label:'Đã gợi ý trong đơn',value:x=>fmt(x.actualAmount)},{label:'Còn thiếu',value:x=>fmt(x.missingAmount)},{label:'Trạng thái',key:'status'}],r.promotionOrderSummary||[]); return; }
    if(state.activeTable==='products'){ body.innerHTML=table([{label:'Mã SP',key:'productCode'},{label:'Tên SP',key:'productName'},{label:'SL lệch ban đầu',key:'diffQty'},{label:'SL đã gợi ý',key:'usedQty'},{label:'SL còn lại',key:'remainingQty'},{label:'Giá',value:x=>fmt(x.price)},{label:'Giá trị còn lại',value:x=>fmt(x.remainingAmount)}],r.productUsageSummary||[]); return; }
    if(state.activeTable==='warnings'){ body.innerHTML=table([{label:'Loại',key:'type'},{label:'Nội dung',key:'message'},{label:'Dòng',key:'rowNumber'},{label:'Mức độ',key:'level'}],r.warnings||[]); return; }
    body.innerHTML=table([{label:'Mã KH',key:'customerCode'},{label:'Tên KH',key:'customerName'},{label:'Chỉ tiêu',value:x=>fmt(x.targetAmount)},{label:'Giá trị gợi ý',value:x=>fmt(x.actualAmount)},{label:'Lệch',value:x=>fmt(x.diff)},{label:'Số dòng SP',key:'lineCount'},{label:'Trạng thái',key:'status'}],r.customerOrders||[]);
  }
  async function downloadBlobResponse(res, fallback){ if(!res.ok){ let msg='Không xuất được file.'; try{ const json=await res.json(); msg=json.message||msg; }catch{} throw new Error(msg); } const blob=await res.blob(); const cd=res.headers.get('Content-Disposition')||''; const match=/filename="?([^";]+)"?/i.exec(cd); const name=match?match[1]:fallback; const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  async function preview(){ const file=$('dmsGapFile')?.files?.[0]; if(!file){ setStatus('Chưa chọn file Excel khách cần chấm.','error'); return; } const form=new FormData(); form.append('file',file); const options=optionPayload(); Object.keys(options).forEach(k=>form.append(k,options[k])); setStatus('Đang đọc file khách, đọc sản phẩm lệch DMS + nhóm KM từ MK-Pro và sinh đơn tham khảo...',''); const res=await fetch('/api/tools/dms-gap-simulator/preview',{method:'POST',body:form}); const json=await res.json().catch(()=>({ok:false,message:'Không đọc được phản hồi server.'})); if(!res.ok||!json.ok)throw new Error(json.message||'Sinh đơn tham khảo thất bại.'); state.result=json.result; state.activeTable='orders'; setStatus('Preview xong. Module chỉ đọc dữ liệu MK-Pro và mô phỏng trong RAM, không ghi dữ liệu nghiệp vụ.','ok'); renderPreview(); toggleExportButtons(); }
  async function exportResult(){ if(!state.result)throw new Error('Chưa có kết quả preview.'); setStatus('Đang xuất Excel kết quả...',''); const res=await fetch('/api/tools/dms-gap-simulator/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result:state.result})}); await downloadBlobResponse(res,'KET_QUA_SINH_DON_CHAM_DMS.xlsx'); setStatus('Đã xuất Excel kết quả.','ok'); }
  function toggleExportButtons(){ const b=$('dmsGapExportButton'); if(b)b.disabled=!state.result; }
  function reset(){ state.result=null; state.activeTable='orders'; const file=$('dmsGapFile'); if(file)file.value=''; setStatus('', ''); renderPreview(); toggleExportButtons(); }
  function bind(){ const root=$('dmsGapSimulatorTab'); if(!root||root.dataset.bound==='1')return; root.dataset.bound='1'; const dateInput=$('dmsGapPromotionDate'); if(dateInput&&!dateInput.value){ dateInput.value=new Date().toISOString().slice(0,10); } $('dmsGapPreviewButton')?.addEventListener('click',()=>preview().catch(err=>setStatus(err.message,'error'))); $('dmsGapExportButton')?.addEventListener('click',()=>exportResult().catch(err=>setStatus(err.message,'error'))); $('dmsGapResetButton')?.addEventListener('click',reset); document.querySelectorAll('.dms-gap-preview-tab').forEach(btn=>btn.addEventListener('click',()=>{ state.activeTable=btn.dataset.view||'orders'; renderPreview(); })); toggleExportButtons(); renderPreview(); }
  window.loadDmsGapSimulator = async function(){ bind(); };
  document.addEventListener('DOMContentLoaded', bind);
})();
