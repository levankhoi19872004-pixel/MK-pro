(function(){
  function money(v){ return new Intl.NumberFormat('vi-VN').format(Number(v)||0); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }
  function esc(v){ return String(v ?? '').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  function table(rows, cols){
    rows = Array.isArray(rows) ? rows : [];
    return `<div class="card"><table><thead><tr>${cols.map(c=>`<th>${esc(label(c))}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,200).map(r=>`<tr>${cols.map(c=>`<td>${esc(formatCell(r[c],c))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
  }
  function formatCell(v,c){ if(['price','totalAmount','amount','balance','opening','increase','decrease'].includes(c)) return money(v); return v ?? ''; }
  function label(k){ return ({code:'Mã',name:'Tên',unit:'ĐVT',warehouse:'Kho',price:'Giá',dmsCode:'Mã DMS',vnptCode:'Mã VNPT',productCode:'Mã hàng',productName:'Tên hàng',actualQty:'Tồn thực tế',openQty:'Tồn mở bán',dmsQty:'Tồn DMS',date:'Ngày',supplier:'Nhà cung cấp',totalQty:'Tổng SL',status:'Trạng thái',customerName:'Khách hàng',customerCode:'Mã KH',staffName:'Nhân viên',staffCode:'Mã NV',phone:'SĐT',address:'Địa chỉ',role:'Vai trò',username:'Tài khoản',debtLimit:'Hạn mức nợ',type:'Loại',source:'Nguồn',note:'Ghi chú',qty:'SL',actualAfter:'Tồn sau',refId:'Tham chiếu',at:'Thời gian',user:'Người dùng',action:'Thao tác',detail:'Chi tiết',opening:'Đầu kỳ',increase:'Tăng',decrease:'Giảm',balance:'Còn nợ'}[k] || k); }
  function section(title, body, actions=''){ return `<div class="card"><div class="section-title"><h2>${esc(title)}</h2><div>${actions}</div></div>${body}</div>`; }
  function input(name, ph='', type='text'){ return `<input name="${name}" placeholder="${esc(ph||label(name))}" type="${type}">`; }
  function select(name, opts){ return `<select name="${name}">${opts.map(o=>`<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`; }
  function form(fields, id){ return `<form id="${id}" class="form">${fields.map(f=>Array.isArray(f)? input(f[0],f[1],f[2]||'text') : f).join('')}<button class="primary" type="submit">Lưu</button></form>`; }
  function itemRows(id){ return `<div id="${id}"><div class="item-row"><input placeholder="Mã hàng" data-f="productCode"><input placeholder="Tên hàng" data-f="productName"><input placeholder="ĐVT" data-f="unit"><input type="number" placeholder="SL" data-f="qty"><input type="number" placeholder="Giá" data-f="price"><button type="button" data-remove>×</button></div></div><button type="button" data-add-item="${id}">+ Thêm dòng</button>`; }
  function collectForm(form){ return Object.fromEntries(new FormData(form).entries()); }
  function collectItems(id){ return [...document.querySelectorAll(`#${id} .item-row`)].map(row=>{ const obj={}; row.querySelectorAll('[data-f]').forEach(i=>obj[i.dataset.f]=i.value); return obj; }).filter(x=>x.productCode || x.productName); }
  window.KHO_UI = { money,today,toast,esc,table,label,section,input,select,form,itemRows,collectForm,collectItems };
})();
