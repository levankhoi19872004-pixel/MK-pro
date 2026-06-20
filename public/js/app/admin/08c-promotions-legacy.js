'use strict';

function promotionTypeText(type){return {discount:'Chiết khấu',display:'Trưng bày',coupon:'Coupon',ontop:'Ontop',combo:'Combo'}[type]||type||''}
async function loadPromotions(){
  if(!promotionTable)return;
  try{
    const q=encodeURIComponent(promotionSearchInput?.value||'');
    const res=await fetch(`/api/promotions?q=${q}`);
    const json=await res.json(); if(!json.ok)throw new Error(json.message||'Không tải được khuyến mại');
    promotionsCache=json.promotions||[]; if(promotionCount)promotionCount.textContent=`${promotionsCache.length} chương trình`;
    if(!promotionsCache.length){promotionTable.innerHTML='<tr><td colspan="6">Chưa có chương trình khuyến mại.</td></tr>';return}
    promotionTable.innerHTML=promotionsCache.map(p=>{
      const encodedId=safeInlineEncodedArg(p.id);
      const productCodes=(p.productCodes||[]).slice(0,8).map(escapeImportHtml).join(', ');
      return `<tr>
      <td><strong>${escapeImportHtml(p.code||'')}</strong><br><span class="muted">${escapeImportHtml(promotionTypeText(p.type))}</span></td>
      <td><strong>${escapeImportHtml(p.name||'')}</strong><br><span class="muted">Điều kiện: ${escapeImportHtml(p.conditionText||'-')}</span><br><span class="muted">CK/Thưởng: ${escapeImportHtml(p.discountText||'-')}</span>${p.displayReward?`<br><span class="muted">Trưng bày: ${escapeImportHtml(p.displayReward)}</span>`:''}${p.couponText?`<br><span class="muted">Coupon: ${escapeImportHtml(p.couponText)}</span>`:''}${p.ontopText?`<br><span class="muted">Ontop: ${escapeImportHtml(p.ontopText)}</span>`:''}</td>
      <td>${productCodes}${(p.productCodes||[]).length>8?'...':''}</td>
      <td>${escapeImportHtml(p.startDate||'')} ${p.endDate?`→ ${escapeImportHtml(p.endDate)}`:''}</td>
      <td><span class="badge ${p.isActive!==false?'active':'inactive'}">${p.isActive!==false?'Đang áp dụng':'Ngừng'}</span></td>
      <td class="row-actions"><button class="small" data-promotion-action="edit" data-promotion-id="${encodedId}">Sửa</button><button class="small danger" data-promotion-action="delete" data-promotion-id="${encodedId}">Xóa</button></td>
    </tr>`;
    }).join('');
  }catch(err){promotionTable.innerHTML=`<tr><td colspan="6">${escapeImportHtml(err.message)}</td></tr>`}
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


// PHASE35_PROMOTION_EVENT_OWNERSHIP
if(promotionForm)promotionForm.addEventListener('submit',submitPromotion);
if(resetPromotionButton)resetPromotionButton.addEventListener('click',resetPromotionForm);
if(promotionSearchInput)promotionSearchInput.addEventListener('input',debounce(loadPromotions,250));

if(promotionTable&&!promotionTable.dataset.securityDelegationBound){
  promotionTable.dataset.securityDelegationBound='1';
  promotionTable.addEventListener('click',event=>{
    const button=event.target.closest('[data-promotion-action]');
    if(!button||!promotionTable.contains(button))return;
    const id=decodeURIComponent(button.dataset.promotionId||'');
    if(button.dataset.promotionAction==='edit')editPromotion(id);
    if(button.dataset.promotionAction==='delete')deletePromotion(id);
  });
}
