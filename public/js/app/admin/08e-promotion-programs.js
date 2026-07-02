'use strict';

// V47 Promotion program management: 4 tab, gộp SL nhóm SP vào Điều kiện KM / Ontop qua field basis
(function setupPromotionProgramManagement(){
  const $ = (id)=>document.getElementById(id);
  const msg = $('promotion3Message');
  const searchInput = $('promotionSearchAllInput');
  const esc = (v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtPct = (v)=>v===''||v===null||v===undefined?'':`${Number(v||0).toLocaleString('vi-VN')}%`;
  const fmtMoney = (v)=>v===''||v===null||v===undefined?'':Number(v||0).toLocaleString('vi-VN');
  const show = (text,isError=false)=>{ if(msg) showMessage(msg,text,isError); };
  const TYPE_CONFIG = {
    productRules: {
      label: 'CK sản phẩm',
      table: 'promotionProductProgramTable', count: 'promotionProductProgramCount', detail: 'promotionProductProgramDetailTable', form: 'promotionProductProgramForm', reload: 'reloadPromotionProductProgramsButton', cancel: 'cancelPromotionProductProgramButton', create: 'createPromotionProductProgramButton', colspan: 6, listColspan: 8
    },
    groupItems: {
      label: 'Nhóm sản phẩm KM',
      table: 'promotionGroupItemProgramTable', count: 'promotionGroupItemProgramCount', detail: 'promotionGroupItemProgramDetailTable', form: 'promotionGroupItemProgramForm', reload: 'reloadPromotionGroupItemProgramsButton', cancel: 'cancelPromotionGroupItemProgramButton', create: 'createPromotionGroupItemProgramButton', colspan: 5, listColspan: 8
    },
    groupRules: {
      label: 'Điều kiện nhóm KM / Ontop',
      table: 'promotionGroupRuleProgramTable', count: 'promotionGroupRuleProgramCount', detail: 'promotionGroupRuleProgramDetailTable', form: 'promotionGroupRuleProgramForm', reload: 'reloadPromotionGroupRuleProgramsButton', cancel: 'cancelPromotionGroupRuleProgramButton', create: 'createPromotionGroupRuleProgramButton', colspan: 7, listColspan: 8
    },
    customerOrderValueDiscounts: {
      label: 'CK thêm theo DS',
      table: 'promotionCustomerOrderValueDiscountProgramTable', count: 'promotionCustomerOrderValueDiscountProgramCount', detail: 'promotionCustomerOrderValueDiscountProgramDetailTable', form: 'promotionCustomerOrderValueDiscountProgramForm', reload: 'reloadPromotionCustomerOrderValueDiscountProgramsButton', cancel: 'cancelPromotionCustomerOrderValueDiscountProgramButton', create: 'createPromotionCustomerOrderValueDiscountProgramButton', colspan: 6, listColspan: 8, saveUrl: '/api/promotions/customer-order-value-discounts'
    }
  };
  const states = Object.fromEntries(Object.keys(TYPE_CONFIG).map(type=>[type,{ programs: [], selectedCode: '', detail: null } ]));
  let activeType = 'productRules';
  if(!$('promotionProductProgramTable'))return;

  /* PROMOTION_SEPARATE_POPUP_CONTROLLER_START: tách popup khuyến mại theo từng nghiệp vụ, không còn popup/tab dùng chung */
  const popupConfig = {
    productRules: {
      overlay: 'promotionProductPopup',
      body: 'promotionProductPopupBody',
      title: 'promotionProductPopupTitle',
      subtitle: 'promotionProductPopupSubtitle',
      empty: 'Chưa chọn chương trình CK sản phẩm.'
    },
    groupItems: {
      overlay: 'promotionGroupPopup',
      body: 'promotionGroupPopupBody',
      title: 'promotionGroupPopupTitle',
      subtitle: 'promotionGroupPopupSubtitle',
      empty: 'Chưa chọn nhóm sản phẩm KM.'
    },
    groupRules: {
      overlay: 'promotionConditionPopup',
      body: 'promotionConditionPopupBody',
      title: 'promotionConditionPopupTitle',
      subtitle: 'promotionConditionPopupSubtitle',
      empty: 'Chưa chọn điều kiện KM / Ontop.'
    },
    customerOrderValueDiscounts: {
      overlay: 'promotionCustomerOrderValueDiscountPopup',
      body: 'promotionCustomerOrderValueDiscountPopupBody',
      title: 'promotionCustomerOrderValueDiscountPopupTitle',
      subtitle: 'promotionCustomerOrderValueDiscountPopupSubtitle',
      empty: 'Chưa chọn rule CK thêm theo DS.'
    }
  };
  const detailPlaceholders = {};
  const programListRequests = new Map();
  let promotionProgramSearchTimer = null;
  function detailSectionByType(type){
    return $(TYPE_CONFIG[type]?.form)?.closest('.promotion-program-detail') || null;
  }
  function popupParts(type){
    const cfg = popupConfig[type] || {};
    return {
      overlay: $(cfg.overlay),
      body: $(cfg.body),
      title: $(cfg.title),
      subtitle: $(cfg.subtitle),
      empty: cfg.empty || 'Chưa chọn chương trình.'
    };
  }
  function ensureDetailPlaceholder(type){
    const section = detailSectionByType(type);
    if(!section || detailPlaceholders[type]) return;
    const placeholder = document.createComment(`PROMOTION_SEPARATE_POPUP_DETAIL_PLACEHOLDER_${type}`);
    section.parentNode.insertBefore(placeholder, section);
    detailPlaceholders[type] = placeholder;
  }
  function restorePopupDetail(type){
    const section = detailSectionByType(type);
    const placeholder = detailPlaceholders[type];
    const { body } = popupParts(type);
    if(section && placeholder?.parentNode && body && section.parentNode === body){
      placeholder.parentNode.insertBefore(section, placeholder.nextSibling);
    }
  }
  function restoreAllPopupDetails(){
    Object.keys(popupConfig).forEach(restorePopupDetail);
  }
  function openPromotionWorkspace(type, mode='edit'){
    if(!TYPE_CONFIG[type]) return;
    ensureDetailPlaceholder(type);
    const cfg = TYPE_CONFIG[type];
    const section = detailSectionByType(type);
    const { overlay, body, title, subtitle } = popupParts(type);
    if(!overlay || !body) return;
    if(title){
      if(mode === 'create'){
        title.textContent = type === 'customerOrderValueDiscounts'
          ? 'Tạo rule CK thêm theo DS'
          : `+ Tạo ${cfg.label}`;
      }else{
        title.textContent = `Chi tiết ${cfg.label}`;
      }
    }
    if(subtitle){
      const selectedCode = states[type]?.selectedCode || '';
      subtitle.textContent = selectedCode
        ? `Đang mở ${selectedCode}. Popup này chỉ xử lý ${cfg.label}, không lẫn với nghiệp vụ khuyến mại khác.`
        : `Tạo/xem ${cfg.label}. Danh sách bên ngoài vẫn giữ nguyên để không mất ngữ cảnh.`;
    }
    restoreAllPopupDetails();
    if(section){
      body.replaceChildren(section);
    }else{
      body.innerHTML = '<p class="muted">Chưa chọn chương trình.</p>';
    }
    overlay.hidden = false;
    document.body.classList.add('promotion-workspace-open');
  }
  function closePromotionWorkspace(type){
    if(type){
      const { overlay, body, empty } = popupParts(type);
      restorePopupDetail(type);
      if(body) body.innerHTML = `<p class="muted">${esc(empty)}</p>`;
      if(overlay) overlay.hidden = true;
    }else{
      Object.keys(popupConfig).forEach(closePromotionWorkspace);
    }
    const hasOpenPopup = Object.keys(popupConfig).some(t=>{
      const { overlay } = popupParts(t);
      return overlay && !overlay.hidden;
    });
    if(!hasOpenPopup) document.body.classList.remove('promotion-workspace-open');
  }
  window.openPromotionWorkspace = openPromotionWorkspace;
  window.closePromotionWorkspace = closePromotionWorkspace;
  document.querySelectorAll('[data-promotion-popup-close]').forEach(btn=>{
    btn.addEventListener('click',()=>closePromotionWorkspace(btn.dataset.promotionPopupClose));
  });
  Object.keys(popupConfig).forEach(type=>{
    const { overlay } = popupParts(type);
    overlay?.addEventListener('click',(e)=>{ if(e.target===overlay) closePromotionWorkspace(type); });
  });
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Escape') closePromotionWorkspace();
  });
  document.querySelectorAll('[data-promotion-scroll-target]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const target = $(btn.dataset.promotionScrollTarget);
      target?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  /* PROMOTION_SEPARATE_POPUP_CONTROLLER_END */

  async function api(url, options={}){
    const res = await fetch(url, options);
    const json = await res.json();
    if(!json.ok)throw new Error(json.message||json.error||'Có lỗi xảy ra');
    return json;
  }
  function queryParams(type){
    const params = new URLSearchParams();
    params.set('type', type);
    const q = searchInput?.value || '';
    if(q)params.set('q', q);
    return params.toString();
  }
  function statusBadge(p){
    const text=p.statusText||((p.isActive===false)?'Không hoạt động':'Hoạt động');
    const cls=text==='Hoạt động'?'ok':(text==='Không hoạt động'?'danger':'warn');
    return `<span class="status-badge ${cls}">${esc(text)}</span>`;
  }
  function timeText(row){ return esc(row.timeText || [row.startDate || '', row.endDate || ''].filter(Boolean).join(' - ') || 'Chưa đặt'); }
  function sourceText(p){
    if(p.productCount)return `${p.productCount} SP`;
    if(p.lineCount)return `${p.lineCount} dòng`;
    return '';
  }
  function renderProgramListByType(type){
    const cfg=TYPE_CONFIG[type]; const state=states[type]; const table=$(cfg.table); const count=$(cfg.count);
    if(!table)return;
    if(count)count.textContent=`${state.programs.length} chương trình ${cfg.label}`;
    if(!state.programs.length){ table.innerHTML=`<tr><td colspan="${cfg.listColspan||8}">Chưa có chương trình ${esc(cfg.label)}.</td></tr>`; return; }
    table.innerHTML=state.programs.map(p=>`<tr class="${String(p.programCode)===String(state.selectedCode)?'selected-row':''}">
      <td><input type="checkbox" data-promo-check="${esc(type)}:${esc(p.programCode)}" /></td>
      <td><strong>${esc(p.programCode)}</strong><br><span class="muted">${esc(sourceText(p))}</span></td>
      <td>${esc(p.programName||p.content||'')}</td>
      <td>${timeText(p)}</td>
      <td>${statusBadge(p)}</td>
      <td><button type="button" class="small secondary" data-promo-program-action="view" data-promo-type="${esc(type)}" data-program-code="${esc(p.programCode)}">Xem</button></td>
      <td><button type="button" class="small" data-promo-program-action="select" data-promo-type="${esc(type)}" data-program-code="${esc(p.programCode)}">Sửa</button></td>
      <td><button type="button" class="small danger" data-promo-program-action="cancel" data-promo-type="${esc(type)}" data-program-code="${esc(p.programCode)}">Huỷ</button></td>
    </tr>`).join('');
  }
  function renderDetailEmpty(type, text='Chưa chọn chương trình.'){
    const cfg=TYPE_CONFIG[type]; const detailTable=$(cfg.detail);
    if(detailTable)detailTable.innerHTML=`<tr><td colspan="${cfg.colspan}">${esc(text)}</td></tr>`;
  }
  function setFormValue(form,name,value){ if(form?.elements?.[name]) form.elements[name].value=value??''; }
  function fillForm(type, program={}){
    const form=$(TYPE_CONFIG[type].form); if(!form)return;
    setFormValue(form,'programCode',program.programCode||program.code||'');
    setFormValue(form,'programName',program.programName||program.name||program.content||'');
    setFormValue(form,'startDate',program.startDate||'');
    setFormValue(form,'endDate',program.endDate||'');
    setFormValue(form,'isActive',String(program.isActive!==false && program.active!==false));
    setFormValue(form,'productGroupCode',program.productGroupCode||program.groupCode||'');
    setFormValue(form,'productGroupName',program.productGroupName||program.groupName||'');
    setFormValue(form,'minQty',program.minQty||'');
    setFormValue(form,'qtyUnit',program.qtyUnit||'dây');
    setFormValue(form,'minOrderAmount',program.minOrderAmount||'');
    setFormValue(form,'discountPercent',program.discountPercent||'');
    setFormValue(form,'baseAmountMode',program.baseAmountMode||'after_line_promotions');
    setFormValue(form,'productCodes',Array.isArray(program.productCodes)?program.productCodes.join('\\n'):(program.productCodes||''));
    setFormValue(form,'customerCodes',Array.isArray(program.customerCodes)?program.customerCodes.join('\\n'):(program.customerCodes||''));
    setFormValue(form,'note',program.note||'');
  }
  function rowKey(row){ return encodeURIComponent(row.rowId || row.id || row._id || ''); }
  function fillTierGroupSelect(detail){
    const select=$('promotionTierGroupSelect'); if(!select)return;
    const groups=detail?.availableGroups||[];
    const selected=detail?.selectedGroupCode||'';
    select.innerHTML='<option value="">Chọn nhóm sản phẩm</option>'+groups.map(g=>`<option value="${esc(g.programCode)}" ${String(g.programCode)===String(selected)?'selected':''}>${esc(g.programCode)} - ${esc(g.programName||g.content||'')}</option>`).join('');
  }
  function normalizeTierBasis(value){
    const text=String(value||'').trim().toUpperCase();
    return text==='QUANTITY'?'QUANTITY':'ORDER_VALUE';
  }
  function tierBasisText(value){
    return normalizeTierBasis(value)==='QUANTITY'?'Số lượng':'Doanh số';
  }
  function tierThresholdText(row={}){
    const basis=normalizeTierBasis(row.basis||row.calculationBasis);
    const value=fmtMoney(row.minAmount);
    return basis==='QUANTITY'?`${value} lẻ`:value;
  }
  function updateTierBasisUi(){
    const basis=normalizeTierBasis($('promotionTierBasisSelect')?.value);
    const label=$('promotionTierThresholdLabel');
    const input=$('promotionTierThresholdInput');
    if(label){
      for(const node of Array.from(label.childNodes)){
        if(node.nodeType===Node.TEXT_NODE){ node.nodeValue=basis==='QUANTITY'?'Số lượng từ':'Doanh số từ'; break; }
      }
    }
    if(input){
      input.placeholder=basis==='QUANTITY'?'VD: 10':'VD: 1000000';
      input.step=basis==='QUANTITY'?'1':'1000';
    }
  }
  function renderProgramDetailByType(type, detail){
    const cfg=TYPE_CONFIG[type]; const detailTable=$(cfg.detail); if(!detailTable)return;
    const p=detail?.program||{}; fillForm(type,p);
    if(type==='productRules'){
      const rows=detail?.productRules||[];
      if(!rows.length){ renderDetailEmpty(type,'Chương trình chưa có dòng CK sản phẩm.'); return; }
      detailTable.innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.productCode)}</td><td>${esc(r.productName)}</td><td>${fmtPct(r.discountPercent)}</td><td><button type="button" class="small" data-promo-program-action="edit-product-rule" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Sửa</button></td><td><button type="button" class="small danger" data-promo-program-action="delete-product-rule" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Xóa</button></td></tr>`).join('');
      return;
    }
    if(type==='groupItems'){
      const rows=detail?.groupItems||[];
      if(!rows.length){ renderDetailEmpty(type,'Nhóm chưa có sản phẩm.'); return; }
      detailTable.innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.productCode)}</td><td>${esc(r.productName)}</td><td><button type="button" class="small" data-promo-program-action="edit-group-product" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Sửa</button></td><td><button type="button" class="small danger" data-promo-program-action="delete-group-product" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Xóa</button></td></tr>`).join('');
      return;
    }
    if(type==='customerOrderValueDiscounts'){
      const rule=detail?.rule||detail?.customerOrderValueDiscounts?.[0]||{};
      fillForm(type,rule);
      const customerCodes=Array.isArray(rule.customerCodes)?rule.customerCodes:[];
      if(!customerCodes.length){ renderDetailEmpty(type,'Rule chưa có khách hàng áp dụng.'); return; }
      detailTable.innerHTML=customerCodes.map((code,i)=>`<tr><td>${i+1}</td><td>${esc(code)}</td><td>${fmtMoney(rule.minOrderAmount)}</td><td>${fmtPct(rule.discountPercent)}</td><td>${esc(rule.baseAmountMode||'after_line_promotions')}</td><td>${statusBadge(rule)}</td></tr>`).join('');
      return;
    }
    fillTierGroupSelect(detail);
    const rows=detail?.groupRules||[];
    if(!rows.length){ renderDetailEmpty(type,'Chương trình chưa có điều kiện bậc thang.'); return; }
    detailTable.innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.groupCode||r.programCode||'')}</td><td>${esc(tierBasisText(r.basis||r.calculationBasis))}</td><td>${tierThresholdText(r)}</td><td>${fmtPct(r.discountPercent)}</td><td><button type="button" class="small" data-promo-program-action="edit-tier" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Sửa</button></td><td><button type="button" class="small danger" data-promo-program-action="delete-tier" data-program-code="${esc(p.programCode)}" data-row-id="${rowKey(r)}">Xóa</button></td></tr>`).join('');
  }
  async function loadPromotionProgramsByType(type){
    const cfg=TYPE_CONFIG[type]; const table=$(cfg.table); const state=states[type]; if(!table)return;
    const params=queryParams(type);
    const requestKey=`${type}:${params}`;
    if(programListRequests.has(requestKey)) return programListRequests.get(requestKey);
    const request=(async()=>{
      try{
        const json=await api(`/api/promotions/programs?${params}`);
        state.programs=json.programs||[];
        renderProgramListByType(type);
        if(state.selectedCode && !state.programs.some(p=>String(p.programCode)===String(state.selectedCode))){
          state.selectedCode=''; state.detail=null; fillForm(type,{}); renderDetailEmpty(type);
        }
      }catch(err){ table.innerHTML=`<tr><td colspan="${cfg.listColspan||8}">${esc(err.message)}</td></tr>`; }
      finally{ programListRequests.delete(requestKey); }
    })();
    programListRequests.set(requestKey,request);
    return request;
  }
  async function loadAllPromotionProgramTabs(){
    const requestKey=`all:${searchInput?.value||''}`;
    if(programListRequests.has(requestKey)) return programListRequests.get(requestKey);
    const request=(async()=>{
      try{
        const params=new URLSearchParams();
        params.set('type','all');
        const q=searchInput?.value||'';
        if(q)params.set('q',q);
        const json=await api(`/api/promotions/programs?${params.toString()}`);
        const byType=json.programsByType||{};
        Object.keys(TYPE_CONFIG).forEach(type=>{
          states[type].programs=byType[type]||[];
          renderProgramListByType(type);
          if(states[type].selectedCode && !states[type].programs.some(p=>String(p.programCode)===String(states[type].selectedCode))){
            states[type].selectedCode=''; states[type].detail=null; fillForm(type,{}); renderDetailEmpty(type);
          }
        });
      }catch(err){
        await Promise.all(Object.keys(TYPE_CONFIG).map(type=>loadPromotionProgramsByType(type)));
      }finally{ programListRequests.delete(requestKey); }
    })();
    programListRequests.set(requestKey,request);
    return request;
  }
  window.loadPromotionProgramsByType=loadPromotionProgramsByType;
  window.loadPromotionPrograms=loadAllPromotionProgramTabs;
  window.reloadPromotionRules=loadAllPromotionProgramTabs;
  window.viewPromotionProgramByType=async(type, programCode)=>{
    await window.selectPromotionProgramByType(type, programCode);
  };
  window.selectPromotionProgramByType=async(type, programCode)=>{
    if(!TYPE_CONFIG[type])return;
    try{
      activeType=type; activateProgramTab(type);
      states[type].selectedCode=programCode;
      renderProgramListByType(type);
      const json=await api(`/api/promotions/programs/${encodeURIComponent(programCode)}?type=${encodeURIComponent(type)}`);
      states[type].detail=json;
      renderProgramDetailByType(type,json);
      openPromotionWorkspace(type,'edit');
    }catch(err){ show(err.message,true); }
  };
  window.cancelPromotionProgramByType=async(type, programCode)=>{
    const state=states[type]; const cfg=TYPE_CONFIG[type]; const code=programCode||state?.selectedCode;
    if(!code){show('Chưa chọn chương trình cần hủy',true);return;}
    if(!confirm(`Hủy chương trình ${code} trong tab ${cfg.label}? Dữ liệu không bị xóa, chỉ chuyển sang Không hoạt động.`))return;
    try{
      await api(`/api/promotions/programs/${encodeURIComponent(code)}/cancel?type=${encodeURIComponent(type)}`,{method:'POST'});
      show(`Đã hủy chương trình ${cfg.label}`);
      await loadPromotionProgramsByType(type);
      if(state.selectedCode===code) await window.selectPromotionProgramByType(type,code);
    }catch(err){ show(err.message,true); }
  };
  function activateProgramTab(type){
    if(!TYPE_CONFIG[type])return;
    activeType=type;
    // PROMOTION_MAIN_TAB_STATE_START: màn chính giữ 3 tab, chỉ hiển thị danh sách của tab đang chọn; popup vẫn tách riêng theo nghiệp vụ.
    document.querySelectorAll('[data-promotion-program-tab]').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.promotionProgramTab === type);
    });
    document.querySelectorAll('[data-promotion-program-panel]').forEach(panel=>{
      panel.classList.toggle('active', panel.dataset.promotionProgramPanel === type);
    });
    // PROMOTION_MAIN_TAB_STATE_END
  }

  async function refreshSelected(type){
    const code=states[type]?.selectedCode;
    if(code) await window.selectPromotionProgramByType(type,code);
  }
  function selectedOrWarn(type){
    const code=states[type]?.selectedCode;
    if(!code){ show('Chưa chọn chương trình/nhóm bên trái',true); return ''; }
    return code;
  }
  function bodyFromForm(form){ return Object.fromEntries(new FormData(form).entries()); }

  window.editProductRuleLine=async(programCode,rowId)=>{
    const detail=states.productRules.detail; const row=(detail?.productRules||[]).find(r=>encodeURIComponent(r.rowId||r.id||r._id||'')===rowId);
    if(!row)return show('Không tìm thấy dòng cần sửa',true);
    const productCode=prompt('Sửa mã sản phẩm', row.productCode||''); if(productCode===null)return;
    const discountPercent=prompt('Sửa mức CK %', row.discountPercent??0); if(discountPercent===null)return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/products/${rowId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({productCode,discountPercent})}); show('Đã sửa sản phẩm trong CTKM'); await refreshSelected('productRules'); await loadPromotionProgramsByType('productRules'); }catch(err){show(err.message,true);}
  };
  window.deleteProductRuleLine=async(programCode,rowId)=>{
    if(!confirm('Xóa sản phẩm này khỏi CTKM?'))return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/products/${rowId}`,{method:'DELETE'}); show('Đã xóa sản phẩm khỏi CTKM'); await refreshSelected('productRules'); await loadPromotionProgramsByType('productRules'); }catch(err){show(err.message,true);}
  };
  window.editGroupProductLine=async(programCode,rowId)=>{
    const detail=states.groupItems.detail; const row=(detail?.groupItems||[]).find(r=>encodeURIComponent(r.rowId||r.id||r._id||'')===rowId);
    if(!row)return show('Không tìm thấy dòng cần sửa',true);
    const productCode=prompt('Sửa mã sản phẩm trong nhóm', row.productCode||''); if(productCode===null)return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/group-products/${rowId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({productCode})}); show('Đã sửa sản phẩm trong nhóm'); await refreshSelected('groupItems'); await loadPromotionProgramsByType('groupItems'); }catch(err){show(err.message,true);}
  };
  window.deleteGroupProductLine=async(programCode,rowId)=>{
    if(!confirm('Xóa sản phẩm này khỏi nhóm?'))return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/group-products/${rowId}`,{method:'DELETE'}); show('Đã xóa sản phẩm khỏi nhóm'); await refreshSelected('groupItems'); await loadPromotionProgramsByType('groupItems'); }catch(err){show(err.message,true);}
  };
  window.editTierLine=async(programCode,rowId)=>{
    const detail=states.groupRules.detail; const row=(detail?.groupRules||[]).find(r=>encodeURIComponent(r.rowId||r.id||r._id||'')===rowId);
    if(!row)return show('Không tìm thấy điều kiện cần sửa',true);
    const groupCode=prompt('Sửa nhóm áp dụng', row.groupCode||row.programCode||''); if(groupCode===null)return;
    const currentBasis=normalizeTierBasis(row.basis||row.calculationBasis);
    const basisInput=prompt('Sửa cách tính: nhập DS/ORDER_VALUE hoặc SL/QUANTITY', currentBasis==='QUANTITY'?'SL':'DS'); if(basisInput===null)return;
    const basis=/^(SL|SO LUONG|SỐ LƯỢNG|QUANTITY)$/i.test(String(basisInput).trim())?'QUANTITY':'ORDER_VALUE';
    const minAmount=prompt(basis==='QUANTITY'?'Sửa số lượng từ':'Sửa doanh số từ', row.minAmount??0); if(minAmount===null)return;
    const discountPercent=prompt('Sửa CK %', row.discountPercent??0); if(discountPercent===null)return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/tiers/${rowId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({groupCode,basis,minAmount,discountPercent})}); show('Đã sửa điều kiện khuyến mại'); await refreshSelected('groupRules'); await loadPromotionProgramsByType('groupRules'); }catch(err){show(err.message,true);}
  };
  window.deleteTierLine=async(programCode,rowId)=>{
    if(!confirm('Xóa điều kiện khuyến mại này?'))return;
    try{ await api(`/api/promotions/programs/${encodeURIComponent(programCode)}/tiers/${rowId}`,{method:'DELETE'}); show('Đã xóa điều kiện khuyến mại'); await refreshSelected('groupRules'); await loadPromotionProgramsByType('groupRules'); }catch(err){show(err.message,true);}
  };

  $('promotionProductLineForm')?.addEventListener('submit',async(e)=>{
    e.preventDefault(); const code=selectedOrWarn('productRules'); if(!code)return;
    const body={...bodyFromForm(e.currentTarget), programName: $('promotionProductProgramForm')?.elements?.programName?.value||'', startDate: $('promotionProductProgramForm')?.elements?.startDate?.value||'', endDate: $('promotionProductProgramForm')?.elements?.endDate?.value||'', isActive: $('promotionProductProgramForm')?.elements?.isActive?.value||'true'};
    try{ await api(`/api/promotions/programs/${encodeURIComponent(code)}/products`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); e.currentTarget.reset(); show('Đã thêm sản phẩm vào CTKM'); await refreshSelected('productRules'); await loadPromotionProgramsByType('productRules'); }catch(err){show(err.message,true);}
  });
  $('promotionGroupProductLineForm')?.addEventListener('submit',async(e)=>{
    e.preventDefault(); const code=selectedOrWarn('groupItems'); if(!code)return;
    const body={...bodyFromForm(e.currentTarget), programName: $('promotionGroupItemProgramForm')?.elements?.programName?.value||'', startDate: $('promotionGroupItemProgramForm')?.elements?.startDate?.value||'', endDate: $('promotionGroupItemProgramForm')?.elements?.endDate?.value||'', isActive: $('promotionGroupItemProgramForm')?.elements?.isActive?.value||'true'};
    try{ await api(`/api/promotions/programs/${encodeURIComponent(code)}/group-products`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); e.currentTarget.reset(); show('Đã thêm sản phẩm vào nhóm'); await refreshSelected('groupItems'); await loadPromotionProgramsByType('groupItems'); }catch(err){show(err.message,true);}
  });
  $('promotionTierLineForm')?.addEventListener('submit',async(e)=>{
    e.preventDefault(); const code=selectedOrWarn('groupRules'); if(!code)return;
    const body={...bodyFromForm(e.currentTarget), programName: $('promotionGroupRuleProgramForm')?.elements?.programName?.value||'', startDate: $('promotionGroupRuleProgramForm')?.elements?.startDate?.value||'', endDate: $('promotionGroupRuleProgramForm')?.elements?.endDate?.value||'', isActive: $('promotionGroupRuleProgramForm')?.elements?.isActive?.value||'true'};
    try{ await api(`/api/promotions/programs/${encodeURIComponent(code)}/tiers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); e.currentTarget.reset(); updateTierBasisUi(); show('Đã thêm điều kiện khuyến mại'); await refreshSelected('groupRules'); await loadPromotionProgramsByType('groupRules'); }catch(err){show(err.message,true);}
  });

  Object.keys(TYPE_CONFIG).forEach(type=>{
    const cfg=TYPE_CONFIG[type]; const form=$(cfg.form);
    form?.addEventListener('submit',async(e)=>{
      e.preventDefault();
      const body=Object.fromEntries(new FormData(form).entries());
      const code=body.programCode||states[type].selectedCode;
      if(!code){show('Chưa chọn chương trình cần lưu',true);return;}
      try{
        if(cfg.saveUrl){
          const method=states[type].selectedCode?'PUT':'POST';
          const url=method==='PUT'?`${cfg.saveUrl}/${encodeURIComponent(code)}`:cfg.saveUrl;
          await api(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        }else{
          await api(`/api/promotions/programs/${encodeURIComponent(code)}?type=${encodeURIComponent(type)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        }
        show(`Đã lưu chương trình ${cfg.label}`);
        states[type].selectedCode=code;
        await loadPromotionProgramsByType(type);
        await window.selectPromotionProgramByType(type,code);
      }catch(err){ show(err.message,true); }
    });
    $(cfg.cancel)?.addEventListener('click',()=>window.cancelPromotionProgramByType(type,states[type].selectedCode));
    $(cfg.reload)?.addEventListener('click',()=>loadPromotionProgramsByType(type));
    $(cfg.create)?.addEventListener('click',()=>{
      activeType=type;
      activateProgramTab(type);
      states[type].selectedCode=''; states[type].detail=null;
      fillForm(type,{});
      renderDetailEmpty(type, cfg.saveUrl ? 'Nhập thông tin rule mới rồi bấm Lưu.' : 'Tạo mới CTKM hiện đi theo quy trình import Excel. Có thể dùng popup này để chọn/sửa chương trình sau khi import.');
      openPromotionWorkspace(type,'create');
    });
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-promo-program-action]');
    if(!button)return;
    const action=button.dataset.promoProgramAction;
    const type=button.dataset.promoType||'';
    const code=button.dataset.programCode||'';
    const rowId=button.dataset.rowId||'';
    if(action==='view')window.viewPromotionProgramByType(type,code);
    if(action==='select')window.selectPromotionProgramByType(type,code);
    if(action==='cancel')window.cancelPromotionProgramByType(type,code);
    if(action==='edit-product-rule')window.editProductRuleLine(code,rowId);
    if(action==='delete-product-rule')window.deleteProductRuleLine(code,rowId);
    if(action==='edit-group-product')window.editGroupProductLine(code,rowId);
    if(action==='delete-group-product')window.deleteGroupProductLine(code,rowId);
    if(action==='edit-tier')window.editTierLine(code,rowId);
    if(action==='delete-tier')window.deleteTierLine(code,rowId);
  });
  document.querySelectorAll('[data-promotion-program-tab]').forEach(btn=>btn.addEventListener('click',()=>activateProgramTab(btn.dataset.promotionProgramTab)));
  $('promotionTierBasisSelect')?.addEventListener('change', updateTierBasisUi);
  updateTierBasisUi();
  searchInput?.addEventListener('input',()=>{
    clearTimeout(promotionProgramSearchTimer);
    promotionProgramSearchTimer=setTimeout(()=>loadPromotionProgramsByType(activeType),250);
  });
  activateProgramTab(activeType);
  loadAllPromotionProgramTabs();
})();

