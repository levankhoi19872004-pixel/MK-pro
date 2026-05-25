(function(){
  const { menus, columns } = window.KHO_SCHEMA;
  const UI = window.KHO_UI;
  const API = window.KHO_API;
  const state = { page:'dashboard', cache:{} };
  const view = () => document.getElementById('view');
  const dateEl = () => document.getElementById('workDate');

  function init(){
    dateEl().value = UI.today();
    document.getElementById('menu').innerHTML = menus.map(([id,name])=>`<button data-page="${id}">${name}</button>`).join('');
    document.getElementById('menu').addEventListener('click', e=>{ const b=e.target.closest('[data-page]'); if(b) openPage(b.dataset.page); });
    document.getElementById('reloadBtn').onclick = ()=>openPage(state.page,true);
    document.body.addEventListener('click', globalClick);
    openPage('dashboard');
  }
  async function load(c, force=false){ if(!force && state.cache[c]) return state.cache[c]; const data=await API.list(c); state.cache[c]=data; return data; }
  async function openPage(page, force=false){
    state.page=page; state.cache = force ? {} : state.cache;
    document.querySelectorAll('#menu button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    const meta = menus.find(m=>m[0]===page); document.getElementById('pageTitle').textContent=meta[1]; document.getElementById('pageSub').textContent=meta[2];
    try{ await pages[page](); }catch(e){ view().innerHTML=`<div class="card"><b>Lỗi:</b> ${UI.esc(e.message)}</div>`; }
  }
  function bindSave(formId, collection, extra=()=>({})){ const f=document.getElementById(formId); if(!f) return; f.onsubmit=async e=>{ e.preventDefault(); await API.save(collection,{...UI.collectForm(f),...extra()}); state.cache[collection]=null; UI.toast('Đã lưu'); openPage(state.page,true); }; }
  function bindWorkflow(formId, path, payloadFn){ const f=document.getElementById(formId); if(!f) return; f.onsubmit=async e=>{ e.preventDefault(); await API.post(path, payloadFn(f)); UI.toast('Đã tạo chứng từ'); openPage(state.page,true); }; }
  function globalClick(e){
    const add=e.target.closest('[data-add-item]'); if(add){ const wrap=document.getElementById(add.dataset.addItem); wrap.insertAdjacentHTML('beforeend', `<div class="item-row"><input placeholder="Mã hàng" data-f="productCode"><input placeholder="Tên hàng" data-f="productName"><input placeholder="ĐVT" data-f="unit"><input type="number" placeholder="SL" data-f="qty"><input type="number" placeholder="Giá" data-f="price"><button type="button" data-remove>×</button></div>`); }
    const rm=e.target.closest('[data-remove]'); if(rm) rm.closest('.item-row').remove();
    const backup=e.target.closest('[data-backup]'); if(backup) API.get('/v42/system/backup').then(data=>{ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='backup-kho-minh-khai-'+UI.today()+'.json'; a.click(); UI.toast('Đã tải backup'); });
  }

  const pages = {
    dashboard: async()=>{
      const d=await API.get('/v42/dashboard?date='+dateEl().value);
      const c=d.cards||{};
      view().innerHTML = `<div class="grid cards">${[
        ['Doanh số hôm nay',c.sales],['Số đơn hôm nay',c.orderCount],['Tiền đã thu',c.collected],['Công nợ còn lại',c.debtBalance],['Phiếu nhập',c.receiptCount],['Quỹ trong ngày',c.cashBalance],['Sản phẩm',c.productCount],['Khách hàng',c.customerCount]
      ].map(x=>`<div class="kpi"><span>${x[0]}</span><b>${typeof x[1]==='number'?UI.money(x[1]):x[1]}</b></div>`).join('')}</div>`+
      UI.section('Cảnh báo vận hành', `<div class="grid two"><div><b>Hàng hết tồn mở bán</b>${UI.table((d.alerts.lowOpenStocks||[]), ['productCode','warehouse','actualQty','openQty'])}</div><div><b>Hàng thiếu khi chấm/import</b>${UI.table((d.alerts.shortages||[]), ['date','orderCode','status'])}</div></div>`);
    },
    sales: async()=>{
      const orders=await load('orders',true);
      view().innerHTML = UI.section('Tạo đơn bán / phiếu xuất', `<form id="orderForm" class="form">${UI.input('customerCode','Mã khách')}${UI.input('customerName','Tên khách')}${UI.input('staffCode','Mã NV')}${UI.input('staffName','Tên NV')}${UI.input('warehouse','Kho xuất')}${UI.input('note','Ghi chú')}<div class="full">${UI.itemRows('orderItems')}</div><button class="primary" type="submit">Tạo đơn bán</button></form>`) + UI.table(orders, columns.orders);
      bindWorkflow('orderForm','/v42/orders/create', f=>({...UI.collectForm(f), date:dateEl().value, items:UI.collectItems('orderItems')}));
    },
    receive: async()=>{
      const receipts=await load('receipts',true);
      view().innerHTML = UI.section('Tạo phiếu nhập kho', `<form id="receiptForm" class="form">${UI.input('supplier','Nhà cung cấp')}${UI.input('warehouse','Kho nhập')}${UI.input('note','Ghi chú')}<div class="full">${UI.itemRows('receiptItems')}</div><button class="primary" type="submit">Tạo phiếu nhập</button></form>`) + UI.table(receipts, columns.receipts);
      bindWorkflow('receiptForm','/v42/receipts/create', f=>({...UI.collectForm(f), date:dateEl().value, items:UI.collectItems('receiptItems')}));
    },
    warehouse: async()=>{
      const [stocks,journal]=await Promise.all([load('stocks',true),load('stockJournal',true)]);
      view().innerHTML = UI.section('Điều chỉnh tồn kho', `<form id="adjustForm" class="form">${UI.input('productCode','Mã hàng')}${UI.input('productName','Tên hàng')}${UI.input('warehouse','Kho')}${UI.input('actualQty','Tồn thực tế','number')}${UI.input('openQty','Tồn mở bán','number')}${UI.input('reason','Lý do')}<button class="primary" type="submit">Ghi điều chỉnh</button></form>`) + UI.section('Tồn kho hiện tại', UI.table(stocks, columns.stocks)) + UI.section('Nhật ký nhập xuất tồn', UI.table(journal, columns.stockJournal));
      bindWorkflow('adjustForm','/v42/stock/adjust', f=>({...UI.collectForm(f), date:dateEl().value}));
    },
    products: async()=> crudPage('products','Danh mục sản phẩm', [['code','Mã hàng'],['name','Tên hàng'],['unit','ĐVT'],['warehouse','Kho quản lý'],['price','Giá bán','number'],['dmsCode','Mã DMS'],['vnptCode','Mã VNPT']]),
    customers: async()=> crudPage('customers','Danh mục khách hàng', [['code','Mã KH'],['name','Tên khách'],['address','Địa chỉ'],['phone','SĐT'],['staffName','NV phụ trách'],['debtLimit','Hạn mức nợ','number']]),
    staff: async()=> crudPage('staff','Nhân viên và tài khoản', [['code','Mã NV'],['name','Tên NV'],['phone','SĐT'],['role','Vai trò'],['username','Tài khoản']]),
    debt: async()=>{
      const [debts,ledger]=await Promise.all([load('debts',true),load('debtLedger',true)]);
      view().innerHTML = UI.section('Thu tiền công nợ', `<form id="paymentForm" class="form">${UI.input('customerCode','Mã KH')}${UI.input('customerName','Tên khách')}${UI.input('staffCode','Mã NV thu')}${UI.input('staffName','Tên NV thu')}${UI.input('amount','Số tiền','number')}${UI.input('note','Ghi chú')}<button class="primary" type="submit">Ghi phiếu thu</button></form>`) + UI.section('Bảng công nợ', UI.table(debts, columns.debts)) + UI.section('Sổ chi tiết công nợ', UI.table(ledger, ['date','customerName','amount','refType','refId','balanceAfter','note']));
      bindWorkflow('paymentForm','/v42/payments/create', f=>({...UI.collectForm(f), date:dateEl().value}));
    },
    cash: async()=>{
      const rows=await load('cashFund',true);
      view().innerHTML = UI.section('Phiếu thu / Phiếu chi quỹ', `<form id="cashForm" class="form">${UI.select('type',[['thu','Phiếu thu'],['chi','Phiếu chi']])}${UI.input('amount','Số tiền','number')}${UI.input('source','Nguồn/khoản mục')}${UI.input('staffName','Nhân viên')}${UI.input('note','Ghi chú')}<button class="primary" type="submit">Ghi quỹ</button></form>`) + UI.table(rows, columns.cashFund);
      bindWorkflow('cashForm','/v42/cash/create', f=>({...UI.collectForm(f), date:dateEl().value}));
    },
    reports: async()=>{
      const [orders,receipts,debts,cash,shortages]=await Promise.all([load('orders',true),load('receipts',true),load('debts',true),load('cashFund',true),load('stockShortages',true)]);
      view().innerHTML = UI.section('Báo cáo nhanh', `<div class="grid cards"><div class="kpi"><span>Doanh số</span><b>${UI.money(orders.reduce((s,o)=>s+(+o.totalAmount||0),0))}</b></div><div class="kpi"><span>Phiếu nhập</span><b>${receipts.length}</b></div><div class="kpi"><span>Công nợ</span><b>${UI.money(debts.reduce((s,d)=>s+(+d.balance||0),0))}</b></div><div class="kpi"><span>Dòng quỹ</span><b>${UI.money(cash.reduce((s,c)=>s+(c.type==='thu'?+c.amount||0:-(+c.amount||0)),0))}</b></div></div>`) + UI.section('Hàng thiếu cần xử lý', UI.table(shortages, ['date','orderCode','status']));
    },
    importExport: async()=>{
      view().innerHTML = UI.section('Import / Xuất file', `<p class="muted">Khung v42 đã tách riêng khu vực import/export. Bước tiếp theo có thể gắn engine đọc Excel và mapping mẫu VNPT TT78 vào đây.</p><div class="toolbar"><button data-backup>Xuất backup JSON</button><button onclick="window.print()">In màn hình hiện tại</button></div>`);
    },
    system: async()=>{
      const [docs,logs]=await Promise.all([load('documents',true),load('auditLogs',true)]);
      view().innerHTML = UI.section('Cấu hình hệ thống', `<div class="toolbar"><button data-backup>Backup dữ liệu</button><span class="badge">Start command chuẩn: node server.js</span><span class="badge">API v42: /api/v42</span></div>`) + UI.section('Chứng từ hệ thống', UI.table(docs, columns.documents)) + UI.section('Nhật ký thao tác', UI.table(logs, columns.auditLogs));
    }
  };
  async function crudPage(collection,title,fields){
    const rows=await load(collection,true);
    view().innerHTML = UI.section('Thêm / sửa '+title, UI.form(fields,'crudForm')) + UI.table(rows, columns[collection]);
    bindSave('crudForm',collection);
  }
  window.addEventListener('DOMContentLoaded', init);
})();
