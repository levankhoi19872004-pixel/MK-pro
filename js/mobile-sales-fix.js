/* ===== FIX V2: Số lượng App bán hàng mobile =====
   Nguyên nhân hay gặp: ô thùng/lẻ nằm sát thanh menu dưới nên không focus/không nhập được.
   Bản này render lại thẻ sản phẩm với nút +/- và input type=tel, đồng thời chặn sự kiện lan ra card. */
(function(){
  function mobile(){ return window.innerWidth <= 780 || document.body.classList.contains('mobile-role-app'); }
  function qtyInputId(sku, type){ return (type === 'box' ? 'salesBox_' : 'salesEach_') + cssSafeId(sku); }
  function cleanNum(v){ v = String(v == null ? '' : v).replace(/[^0-9]/g,''); return v === '' ? 0 : Number(v); }
  window.salesMobileQtyChange = function(sku, type, delta){
    const el = document.getElementById(qtyInputId(sku, type));
    if(!el) return;
    const next = Math.max(0, cleanNum(el.value) + Number(delta || 0));
    el.value = next || '';
    try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); }
  };
  window.salesMobileQtyFocus = function(el){
    if(!el) return;
    setTimeout(()=>{
      try{ el.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
      try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); }
    }, 40);
  };
  window.salesQtyBox = function(sku){ return cleanNum(document.getElementById(qtyInputId(sku,'box'))?.value || 0); };
  window.salesQtyEach = function(sku){ return cleanNum(document.getElementById(qtyInputId(sku,'each'))?.value || 0); };
  window.salesQtyFromInputs = function(sku, pack){ return totalQty(salesQtyBox(sku), salesQtyEach(sku), pack || 1); };
  window.setSalesQtyInputs = function(sku, box, each){
    const b=document.getElementById(qtyInputId(sku,'box')); if(b) b.value = Number(box||0) || '';
    const e=document.getElementById(qtyInputId(sku,'each')); if(e) e.value = Number(each||0) || '';
  };
  window.salesQuickAdd = function(sku, box, each){
    setSalesQtyInputs(sku, box, each);
    salesAddProduct(sku);
  };
  const oldAdd = window.salesAddProduct;
  window.salesAddProduct = function(sku){
    const p=findProduct(sku); if(!p) return toast('Không tìm thấy sản phẩm');
    let qty=salesQtyFromInputs(sku, p.pack || 1);
    if(qty <= 0) return toast('Nhập số lượng thùng hoặc lẻ trước khi chấm');
    if(qty > Number(p.qty || 0)) return toast('Không đủ tồn: '+p.name+' còn '+qtyView(p.qty,p.pack));
    let old=salesCart.find(x=>String(x.sku)===String(sku));
    if(old) old.qty += qty;
    else { const base=Number(p.sale)||0; salesCart.push({sku:p.sku,name:p.name,pack:Number(p.pack)||1,qty,sale:base,originalPrice:base,salePrice:base,finalUnitPrice:base,cost:Number(p.cost)||0,disc:0,source:'NVBH',orderSource:'NVBH'}); }
    renderSalesCart();
    toast('Đã chấm '+qtyView(qty,p.pack)+' · '+p.name);
    if(mobile()) setSalesQtyInputs(sku,0,0);
  };
  window.renderSalesProductList = function(){
    const body=document.getElementById('salesProductList'); if(!body) return;
    const q=normText(document.getElementById('salesProductSearch')?.value||'');
    const rows=(db.products||[]).filter(p=>!q || normText([p.sku,p.name,productBrand(p),productCategory(p)].join(' ')).includes(q));
    if(mobile()){
      body.innerHTML=rows.map(p=>{
        const id=cssSafeId(p.sku); const sku=safeAttr(p.sku); const low=Number(p.qty||0)<Number(p.pack||1);
        return `<tr><td colspan="6" class="mobile-product-cell"><div class="mobile-product-card">
          <div class="sku">${escapeHtml(p.sku||'')}</div>
          <div class="name">${escapeHtml(p.name||'')}</div>
          <div class="meta"><div><span>Giá bán chưa KM</span><b>${money(p.sale)}</b></div><div><span>Tồn thực tế</span><b class="${low?'debt-money-unpaid':'debt-money-paid'}">${qtyView(p.qty,p.pack)}</b></div></div>
          <div class="qty-grid">
            <div class="field"><label>Thùng</label><div class="qty-stepper"><button type="button" onclick="salesMobileQtyChange('${sku}','box',-1)">−</button><input class="sales-qty-input" id="salesBox_${id}" type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" onfocus="salesMobileQtyFocus(this)" onclick="event.stopPropagation();salesMobileQtyFocus(this)" onpointerdown="event.stopPropagation()" oninput="this.value=this.value.replace(/[^0-9]/g,'')"><button type="button" onclick="salesMobileQtyChange('${sku}','box',1)">+</button></div></div>
            <div class="field"><label>Lẻ</label><div class="qty-stepper"><button type="button" onclick="salesMobileQtyChange('${sku}','each',-1)">−</button><input class="sales-qty-input" id="salesEach_${id}" type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" onfocus="salesMobileQtyFocus(this)" onclick="event.stopPropagation();salesMobileQtyFocus(this)" onpointerdown="event.stopPropagation()" oninput="this.value=this.value.replace(/[^0-9]/g,'')"><button type="button" onclick="salesMobileQtyChange('${sku}','each',1)">+</button></div></div>
          </div>
          <div class="quick-grid"><button class="btn light" type="button" onclick="salesQuickAdd('${sku}',1,0)">+1 thùng</button><button class="btn light" type="button" onclick="salesQuickAdd('${sku}',0,1)">+1 lẻ</button><button class="btn green" type="button" onclick="salesAddProduct('${sku}')">Chấm hàng</button></div>
        </div></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
    }else{
      body.innerHTML=rows.map(p=>{const id=cssSafeId(p.sku);return `<tr><td><b>${escapeHtml(p.sku||'')}</b></td><td>${escapeHtml(p.name||'')}</td><td class="right">${money(p.sale)}</td><td class="right"><span class="pill ${Number(p.qty||0)<Number(p.pack||1)?'low':''}">${qtyView(p.qty,p.pack)}</span></td><td><div style="display:flex;gap:6px"><input id="salesBox_${id}" type="number" placeholder="Thùng" style="width:70px"><input id="salesEach_${id}" type="number" placeholder="Lẻ" style="width:70px"></div></td><td><button class="btn small green" onclick="salesAddProduct('${safeAttr(p.sku)}')">Chấm</button></td></tr>`}).join('')||'<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{ if(currentActivePage && currentActivePage()==='salesApp') renderSalesProductList(); });
})();
