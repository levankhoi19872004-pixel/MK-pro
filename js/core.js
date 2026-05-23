const KEY='kho_pro_professional_v2';

// ===== API ổn định cho Netlify + Render =====
// Khi đưa web lên Netlify, HTML luôn gọi sang API Render cố định này.
// Có thể đổi nhanh bằng cách đặt localStorage.KHO_API_URL hoặc window.KHO_API_URL.
const DEFAULT_API_URL='https://kho-api-1.onrender.com';
let API_URL=DEFAULT_API_URL;

function cleanApiUrl(url){
  return String(url || '').trim().replace(/\/+$/,'');
}

function getApiCandidates(){
  const saved=cleanApiUrl(localStorage.getItem('KHO_API_URL') || '');
  const runtime=cleanApiUrl(window.KHO_API_URL || '');
  const list=[];

  // Ưu tiên link người dùng đã lưu, sau đó đến link Render mặc định.
  if(saved) list.push(saved);
  if(runtime) list.push(runtime);
  list.push(DEFAULT_API_URL);

  // Chỉ dùng localhost khi đang chạy file/web trên máy tính. Không dùng location.origin trên Netlify để tránh gọi nhầm frontend.
  if(location.hostname==='localhost' || location.hostname==='127.0.0.1'){
    list.push('https://kho-api-1.onrender.com');
    list.push('https://kho-api-1.onrender.com');
  }

  return [...new Set(list.filter(Boolean).map(cleanApiUrl))];
}

async function apiFetch(path, options={}, timeout=30000){
  let lastErr=null;
  const requestOptions={
    ...options,
    headers:{
      Accept:'application/json',
      ...(options.headers||{})
    },
    cache: options.cache || 'no-store'
  };

  for(const base of getApiCandidates()){
    try{
      const res=await fetchWithTimeout(base+path, requestOptions, timeout);

      // Nếu gọi nhầm domain frontend hoặc route không có, thử link kế tiếp.
      if(res.status===404 || res.status===405){
        lastErr=new Error('API không đúng hoặc thiếu route tại '+base);
        if(cleanApiUrl(localStorage.getItem('KHO_API_URL'))===base){
          localStorage.removeItem('KHO_API_URL');
        }
        continue;
      }

      API_URL=base;
      localStorage.setItem('KHO_API_URL',base);
      return res;
    }catch(err){
      lastErr=err;
      if(cleanApiUrl(localStorage.getItem('KHO_API_URL'))===base){
        localStorage.removeItem('KHO_API_URL');
      }
    }
  }

  throw lastErr || new Error('Không kết nối được API Render');
}
const AUTH_KEY='kho_pro_auth_token';
const USER_KEY='kho_pro_auth_user';
let AUTH_TOKEN=localStorage.getItem(AUTH_KEY)||'';
let CURRENT_USER=JSON.parse(localStorage.getItem(USER_KEY)||'null');
let API_ONLINE=false;
let API_READY=false;
let API_SYNC_TIMER=null;

function emptyDb(){
  return {products:[],receipts:[],orders:[],customers:[],customerGroups:[],staff:[],deliveryStaff:[],users:[],masterOrders:[],debts:[],promotions:[],productPromotions:[],groupPromotions:[],customerGroupPromotions:[],productGroups:[],categoryGroups:[],shortageReports:[],payments:[],returns:[],dmsStocks:[],dmsAllocations:[],dmsHistory:[],dmsAllowSales:[]};
}
function normalizeDb(data){
  const base=emptyDb();
  const src=(data&&typeof data==='object')?data:{};
  Object.keys(base).forEach(k=>{base[k]=Array.isArray(src[k])?src[k]:[]});

  base.returns=base.returns.map((r,i)=>{
    const amount=Number(r.amount!==undefined?r.amount:(r.returnAmount!==undefined?r.returnAmount:0))||0;
    return {
      id:r.id || ('RT-'+Date.now()+'-'+i),
      orderId:String(r.orderId||r.order||''),
      customerCode:String(r.customerCode||''),
      customerName:String(r.customerName||r.customer||''),
      amount,
      date:r.date || new Date().toISOString(),
      note:r.note || 'Hàng trả về',
      createdBy:r.createdBy || '',
      createdByRole:r.createdByRole || '',
      createdByCode:r.createdByCode || '',
      source:r.source || 'manual'
    };
  }).filter(r=>r.orderId && r.amount!==0);

  // Chống trùng bản ghi returns nếu trước đó bị lưu lặp id/source.
  const uniqueReturns=[];
  const seenReturnIds=new Set();
  base.returns.forEach(r=>{
    const key=String(r.id||'') || [r.orderId,r.source,r.amount,r.date].join('|');
    if(seenReturnIds.has(key)) return;
    seenReturnIds.add(key);
    uniqueReturns.push(r);
  });
  base.returns=uniqueReturns;

  // Tự chuyển dữ liệu hàng trả về kiểu cũ trong đơn sang sổ returns riêng.
  // Chỉ chuyển 1 lần nếu đơn CHƯA có bất kỳ bản ghi returns nào.
  // Tránh lỗi nhân đôi hàng trả về/công nợ khi dữ liệu được load-save nhiều lần.
  const existedReturnOrderIds=new Set(base.returns.map(r=>String(r.orderId||'')));
  (base.orders||[]).forEach(o=>{
    const orderId=String(o.id||'');
    const legacyReturn=(Number(o.returnGoodsAmount||0)||0) || (Number(o.returnedGoodsAmount||0)||0) || (Number(o.returnAmount||0)||0) || (Number(o.goodsReturn||0)||0);
    if(legacyReturn>0 && orderId && !existedReturnOrderIds.has(orderId)){
      base.returns.push({
        id:'RT-LEGACY-'+orderId,
        orderId,
        customerCode:String(o.customerCode||''),
        customerName:String(o.customer||o.customerName||''),
        amount:legacyReturn,
        date:o.returnDate || o.date || new Date().toISOString(),
        note:o.returnNote || 'Tự chuyển từ giá trị hàng trả về trên đơn',
        createdBy:o.returnCreatedBy || '',
        createdByRole:'',
        createdByCode:'',
        source:'legacy-order-field'
      });
      existedReturnOrderIds.add(orderId);
    }
  });

  const returnByOrder={};
  base.returns.forEach(r=>{returnByOrder[String(r.orderId)]=(returnByOrder[String(r.orderId)]||0)+(Number(r.amount)||0);});

  base.orders=base.orders.map(o=>{
    if(o.masterId===undefined)o.masterId='';
    if(o.cashPaid===undefined)o.cashPaid=0;
    if(o.bankPaid===undefined)o.bankPaid=0;
    if(!o.deliveryStaffCode)o.deliveryStaffCode='';
    if(!o.deliveryStaffName)o.deliveryStaffName='';
    if(o.dueDate===undefined)o.dueDate='';
    const total=Number(o.total||0);
    const paid=(Number(o.cashPaid)||0)+(Number(o.bankPaid)||0);
    const returned=Math.max(0,returnByOrder[String(o.id)]||0);
    // Giữ trường này như giá trị tổng hợp để tương thích server cũ, nhưng nguồn chuẩn là db.returns.
    o.returnGoodsAmount=returned;
    o.returnedGoodsAmount=returned;
    o.debt=total-paid-returned;
    o.paymentStatus=getPaymentStatusText(total,paid+returned,o.dueDate||'');
    return o;
  });
  base.payments=base.payments.map(p=>{
    const cash=Number(p.cash||0)||0;
    const bank=Number(p.bank||0)||0;
    const amount=Number(p.amount!==undefined?p.amount:(cash+bank))||0;
    const type=p.type || (bank!==0?'bank':'cash');
    return {...p, amount, type, cash, bank, method:p.method || (type==='bank'?'Chuyển khoản':'Tiền mặt')};
  });
  base.masterOrders=base.masterOrders.map(m=>{if(!m.deliveryStaffCode)m.deliveryStaffCode=''; if(!m.deliveryStaffName)m.deliveryStaffName=''; return m});
  base.customers=base.customers.map(c=>{if(!c.customerGroup)c.customerGroup=''; return c});
  return base;
}

function getPaymentStatusText(total,paid,dueDate){
  const debt=Number(total||0)-Number(paid||0);
  if(debt<0) return 'Thu thừa';
  if(debt===0) return 'Đã thanh toán';
  if(dueDate){
    const d=new Date(String(dueDate).slice(0,10)+'T00:00:00');
    const today=new Date(); today.setHours(0,0,0,0);
    if(!isNaN(d)&&d.getTime()<today.getTime()) return 'Quá hạn';
  }
  return 'Còn nợ';
}


function authHeaders(extra={}){
  return AUTH_TOKEN ? {...extra, Authorization:'Bearer '+AUTH_TOKEN} : extra;
}
function setLoginState(loggedIn){
  const login=document.getElementById('loginScreen');
  const app=document.getElementById('appRoot');
  if(login) login.style.display=loggedIn?'none':'flex';
  if(app) app.classList.toggle('locked',!loggedIn);
  if(loggedIn && CURRENT_USER){
    const n=document.getElementById('currentUserName');
    const r=document.getElementById('currentUserRole');
    if(n)n.textContent=CURRENT_USER.name||CURRENT_USER.username||'User';
    if(r)r.textContent=roleLabel();
    applyRoleAccess();
  }
}

async function login(){
  const username=(document.getElementById('loginUser')?.value||'').trim();
  const password=(document.getElementById('loginPass')?.value||'').trim();
  if(!username||!password) return toast('Nhập tài khoản và mật khẩu');
  try{
    const res=await apiFetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,password})
    },30000);
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||data.detail||'Đăng nhập thất bại');
    if(!data.token && data.success && data.user){
      // Tương thích server cũ nếu trả success nhưng chưa trả token.
      data.token=data.user.token || '';
    }
    if(!data.token) throw new Error('Server đăng nhập chưa trả token. Cần dùng server.js bản ổn định mới.');
    AUTH_TOKEN=data.token;
    CURRENT_USER=data.user || {username};
    localStorage.setItem(AUTH_KEY,AUTH_TOKEN);
    localStorage.setItem(USER_KEY,JSON.stringify(CURRENT_USER));
    setLoginState(true);
    toast('Đăng nhập thành công');
    await loadDataFromAPI();
  }catch(err){
    console.warn(err);
    toast(err.message||'Không đăng nhập được');
  }
}
async function logout(){
  try{ if(AUTH_TOKEN) await apiFetch('/api/logout',{method:'POST',headers:authHeaders()}); }catch(e){}
  AUTH_TOKEN=''; CURRENT_USER=null;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_KEY);
  document.body.classList.remove('mobile-role-app','sales-customer-selected','sales-step-customers','sales-step-products','sales-step-cart','sales-step-debt','sales-step-confirm','sales-step-orders','driver-step-orders','driver-step-debt','driver-step-report');
  setLoginState(false);
  const u=document.getElementById('loginUser');
  const p=document.getElementById('loginPass');
  if(u)u.value='';
  if(p)p.value='';
  setTimeout(()=>{u?.focus?.();},80);
  toast('Đã đăng xuất');
}

async function fetchWithTimeout(url, options={}, timeout=25000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(), timeout);
  try{
    return await fetch(url,{...options, signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function readApiError(res){
  try{
    const data=await res.json();
    return data.detail || data.error || ('HTTP '+res.status);
  }catch(e){
    return 'HTTP '+res.status;
  }
}
async function apiGetData(){
  const res=await apiFetch('/api/data',{cache:'no-store',headers:authHeaders()},120000);
  if(!res.ok){
    const detail=await readApiError(res);
    throw new Error('Không lấy được dữ liệu kho từ server: '+detail);
  }
  return normalizeDb(await res.json());
}
async function apiSaveData(data){
  const payload=normalizeDb(data);
  const res=await apiFetch('/api/data',{
    method:'POST',
    headers:authHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify(payload)
  },120000);
  if(!res.ok){
    const detail=await readApiError(res);
    throw new Error(detail);
  }
  return await res.json();
}
function scheduleApiSync(){
  if(!API_READY) return;
  clearTimeout(API_SYNC_TIMER);
  API_SYNC_TIMER=setTimeout(pushDataToAPI,1200);
}
async function pushDataToAPI(){
  try{
    const result=await apiSaveData(db);
    API_ONLINE=true;
    console.log('Đã đồng bộ dữ liệu kho lên API',result);
  }catch(err){
    API_ONLINE=false;
    console.warn('Chưa đồng bộ được API:',err);
    toast('Chưa đồng bộ được server: '+(err.message||'lỗi không rõ')+'. Đã lưu tạm trên máy.');
  }
}
async function loadDataFromAPI(retry=0){
  if(!AUTH_TOKEN){setLoginState(false);return;}
  setLoginState(true);
  try{
    const onlineDb=await apiGetData();
    db=onlineDb;
    API_ONLINE=true;
    localStorage.setItem(KEY,JSON.stringify(db));
    toast('Đã tải dữ liệu kho từ database online');
  }catch(err){
    API_ONLINE=false;
    console.warn('API offline hoặc đang ngủ:',err);
    db=normalizeDb(JSON.parse(localStorage.getItem(KEY)||'null'));
    toast(retry<3?'Server đang thức dậy, thử lại lần '+(retry+1):'API chưa phản hồi, tạm dùng dữ liệu trên máy');
    if(retry<3){
      setTimeout(()=>loadDataFromAPI(retry+1),5000);
    }
  }
  API_READY=true;
  ensureDefaultData();
  newSaleOrder();
  render();
}
// Giữ lại các hàm cũ để những nút tạo/sửa/xóa đơn vẫn hoạt động,
// nhưng thực tế sẽ đồng bộ TOÀN BỘ dữ liệu kho qua /api/data.
async function apiGetOrders(){
  const data=await apiGetData();
  return data.orders||[];
}
async function apiSaveOrder(order){
  return await apiSaveData(db);
}
async function apiDeleteOrder(id){
  return await apiSaveData(db);
}
async function syncOrdersFromAPI(){
  return await loadDataFromAPI();
}
const BUSINESS_NAME='Kho Minh Khai Thái Bình';
const BUSINESS_SUB='Quản lý kho & phân phối hàng hóa';
let db=normalizeDb(JSON.parse(localStorage.getItem(KEY)||'null'));
let editingProduct=null, editingCustomer=null, editingStaff=null, editingOrderId=null, editingReceiptIndex=null, cart=[], receiveCart=[];
function save(){
  db=normalizeDb(db);
  localStorage.setItem(KEY,JSON.stringify(db));
  scheduleApiSync();
}
function ensureDefaultData(){
  if(!db.customers.length)db.customers.push({code:'KH001',name:'Khách lẻ',address:'',phone:'',tax:''});
  if(!db.staff.length)db.staff.push({code:'NV001',name:'Admin',phone:''});
  if(!db.deliveryStaff.length)db.deliveryStaff.push({code:'GH001',name:'Chưa gán giao hàng',phone:''});
  db.staff.forEach((n,i)=>{if(!n.code&&!n.ma)n.code='NV'+String(i+1).padStart(3,'0'); if(!n.name&&n.ten)n.name=n.ten; if(!n.phone&&n.sdt)n.phone=n.sdt});
  ensureStaffAccounts();
  db.products.forEach(p=>{if(!p.brand)p.brand=''; if(!p.category)p.category=''; if(!p.warehouse)p.warehouse='Kho chính';});
  localStorage.setItem(KEY,JSON.stringify(db));
  if(API_READY) scheduleApiSync();
}

function ensureCustomersFromOrders(){
  (db.orders||[]).forEach(o=>{
    let code=String(o.customerCode||o.cCode||'').trim();
    if(!code) return;
    let name=normalizeCustomerNameFromUpload(code,o.customer);
    let c=(db.customers||[]).find(x=>String(x.code).trim()===code);
    if(!c){
      db.customers.push({code,name,address:o.customerAddress||'',phone:o.customerPhone||'',tax:o.customerTax||''});
    }else if(!c.name || normText(c.name)==='khach le'){
      c.name=name;
    }
    if(normText(o.customer||'')==='khach le' || !o.customer) o.customer=name;
  });
}
function money(n){return (Number(n)||0).toLocaleString('vi-VN')}
function today(){return new Date().toLocaleString('vi-VN')}
function qtyView(qty,pack){pack=Number(pack)||1; return Math.floor((Number(qty)||0)/pack)+'/'+((Number(qty)||0)%pack)}
function totalQty(box,each,pack){return (Number(box)||0)*(Number(pack)||1)+(Number(each)||0)}
function parseQtySlash(value,pack){
  pack=Number(pack)||1;
  if(value===undefined||value===null||value==='') return 0;
  let s=String(value).trim().replace(',', '.');
  if(s.includes('/')){
    let parts=s.split('/');
    let box=Number(String(parts[0]||'0').trim())||0;
    let each=Number(String(parts[1]||'0').trim())||0;
    return box*pack+each;
  }
  return Number(s)||0;
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function page(id){if(!isAllowedPage(id)){id=defaultPageForRole();}document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));let sec=document.getElementById(id);if(sec)sec.classList.add('active');document.querySelectorAll('#nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));let btn=document.querySelector('#nav button[data-page="'+id+'"]');pageTitle.textContent=btn?btn.textContent.replace(/[⌂▧⇩⇧☷▤♙♟▥🚚₫🛒🔐]/g,'').trim():'Kho Minh Khai';sidebar.classList.remove('show');updateMobileAppMode(id);render()}
document.querySelectorAll('#nav button[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));

function currentActivePage(){return document.querySelector('.section.active')?.id||defaultPageForRole();}
function updateMobileAppMode(activeId){
  activeId=activeId||currentActivePage();
  const mobile=window.innerWidth<=780;
  const isApp=(activeId==='salesApp'||activeId==='deliveryApp');
  document.body.classList.toggle('mobile-role-app', mobile && isApp);
  if(activeId!=='salesApp')document.body.classList.remove('sales-customer-selected');
  updateMobileAppTabs(activeId);
}
function updateMobileAppTabs(activeId){
  const box=document.getElementById('mobileAppTabs'); if(!box)return;
  const sales=activeId==='salesApp'; const driver=activeId==='deliveryApp';
  box.querySelectorAll('button').forEach(b=>{
    const tab=b.dataset.appTab||'';
    b.style.display=(sales&&tab.startsWith('sales-'))||(driver&&tab.startsWith('driver-'))?'block':'none';
    b.classList.remove('active');
  });
  if(sales){
    const active=document.body.classList.contains('sales-customer-selected')?'sales-products':'sales-customers';
    box.querySelector(`[data-app-tab="${active}"]`)?.classList.add('active');
  }
  if(driver)box.querySelector('[data-app-tab="driver-orders"]')?.classList.add('active');
}
function mobileBackToSalesCustomers(){
  document.body.classList.remove('sales-customer-selected');
  updateMobileAppTabs('salesApp');
  setTimeout(()=>document.getElementById('salesCustomerPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
}
function mobileAppGo(tab){
  if(tab.startsWith('sales-')){
    if(currentActivePage()!=='salesApp')page('salesApp');
    if(tab==='sales-customers'){
      mobileBackToSalesCustomers();
    }else{
      if(tab==='sales-products'){
        if(salesSelectedCustomerCode)document.body.classList.add('sales-customer-selected');
        document.getElementById('salesSelectedCustomerInfo')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
      if(tab==='sales-orders')document.getElementById('salesOrdersPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
      if(tab==='sales-debt')document.getElementById('salesDebtPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    updateMobileAppTabs('salesApp');
  }
  if(tab.startsWith('driver-')){
    if(currentActivePage()!=='deliveryApp')page('deliveryApp');
    if(tab==='driver-orders')document.getElementById('driverOrdersPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    if(tab==='driver-debt')document.getElementById('driverDebtPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    updateMobileAppTabs('deliveryApp');
  }
}
window.addEventListener('resize',()=>updateMobileAppMode(currentActivePage()));

function findProduct(sku){return db.products.find(p=>String(p.sku).trim()===String(sku).trim())}
function productBrand(p){return p.brand||p.nhanHang||p['Nhãn hàng']||''}
function productCategory(p){return p.category||p.nganhHang||p['Ngành hàng']||''}
function productWarehouse(p){return p.warehouse||p.khoHang||p['Kho hàng']||'Kho chính'}
function upsertProduct(row){let sku=String(row.sku||'').trim(); if(!sku) return null; let p=findProduct(sku); let data={sku,name:String(row.name||''),brand:String(row.brand||row.nhanHang||row['Nhãn hàng']||''),category:String(row.category||row.nganhHang||row['Ngành hàng']||''),warehouse:String(row.warehouse||row.khoHang||row['Kho hàng']||'Kho chính'),pack:Number(row.pack)||1,qty:Number(row.qty)||0,cost:Number(row.cost)||0,sale:Number(row.sale)||0}; if(!p){p=data; db.products.push(p)} else {p.name=data.name||p.name;p.brand=data.brand||productBrand(p);p.category=data.category||productCategory(p);p.warehouse=data.warehouse||productWarehouse(p);p.pack=Number(data.pack)||p.pack;p.sale=Number(data.sale)||p.sale;p.cost=Number(data.cost)||p.cost} return p}
function receiptItems(r){return Array.isArray(r.items)?r.items:[{sku:r.sku,name:r.name,pack:r.pack||1,qty:Number(r.qty)||0,cost:Number(r.cost)||0,sale:r.sale||0,note:r.note||''}]}
function receiptTotalQty(r){return receiptItems(r).reduce((a,b)=>a+Number(b.qty||0),0)}
function receiptTotalMoney(r){return Number(r.total||receiptItems(r).reduce((a,b)=>a+Number(b.qty||0)*Number(b.cost||0),0))}
function receiptId(){return 'PN'+String(Date.now()).slice(-8)}
function staffCode(n,i){return n.code||n.ma||('NV'+String(i+1).padStart(3,'0'))}
function staffName(n){return n.name||n.ten||''}
function deliveryCode(n,i){return n.code||n.ma||('GH'+String(i+1).padStart(3,'0'))}
function deliveryName(n){return n.name||n.ten||''}
function deliveryDisplay(code,name){return (name||code||'Chưa gán GH')}
function masterForOrder(o){return (db.masterOrders||[]).find(m=>String(m.id)===String(o?.masterId||''))||null}
function orderDeliveryText(o){
  let m=masterForOrder(o);
  return deliveryDisplay(o?.deliveryStaffCode||(m&&m.deliveryStaffCode)||'',o?.deliveryStaffName||(m&&m.deliveryStaffName)||'');
}
function orderDeliveryCode(o){
  let m=masterForOrder(o);
  return o?.deliveryStaffCode||(m&&m.deliveryStaffCode)||'';
}
function orderPaymentStatusText(total,cash,bank){
  return Math.max(0,Number(total||0)-Number(cash||0)-Number(bank||0))<=0?'Đã thanh toán':'Còn công nợ';
}
function staffDisplayOrder(o){return o.staffName||o.staff||''}
function orderDateObj(o){
  if(o.isoDate) return new Date(o.isoDate);
  let d=String(o.date||'');
  let m=d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
  let dt=new Date(d); return isNaN(dt)?null:dt;
}
function filteredOrdersForReport(){
  let from=rpFrom?.value?new Date(rpFrom.value+'T00:00:00'):null;
  let to=rpTo?.value?new Date(rpTo.value+'T23:59:59'):null;
  return db.orders.filter(o=>{let d=orderDateObj(o); if(!d) return !from&&!to; if(from&&d<from)return false; if(to&&d>to)return false; return true;});
}
function buildStaffReportRows(){
  let map={};
  db.staff.forEach((n,i)=>{let code=staffCode(n,i); map[code]={code,name:staffName(n),orders:0,lines:0,revenue:0,cost:0,profit:0};});
  filteredOrdersForReport().forEach(o=>{
    let code=o.staffCode||o.staffMa||'';
    let name=o.staffName||o.staff||'Chưa gán NV';
    if(!code){let found=db.staff.find((n,i)=>staffName(n)===name); code=found?staffCode(found,db.staff.indexOf(found)):'KHONG_NV'}
    if(!map[code]) map[code]={code,name,orders:0,lines:0,revenue:0,cost:0,profit:0};
    map[code].orders+=1; map[code].lines+=Array.isArray(o.items)?o.items.length:0; map[code].revenue+=Number(o.total||0); map[code].cost+=Number(o.cost||0); map[code].profit=map[code].revenue-map[code].cost;
  });
  return Object.values(map).filter(r=>r.orders>0||r.revenue>0).sort((a,b)=>b.revenue-a.revenue);
}

function normText(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function dateValue(v){
  if(!v) return null;
  let d=String(v);
  if(/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d.slice(0,10)+'T12:00:00');
  let m=d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12,0,0);
  let dt=new Date(d); return isNaN(dt)?null:dt;
}
function inDateRange(dateLike, fromId, toId){
  let d=dateValue(dateLike);
  let from=document.getElementById(fromId)?.value;
  let to=document.getElementById(toId)?.value;
  if(!from&&!to) return true;
  if(!d) return false;
  if(from && d<new Date(from+'T00:00:00')) return false;
  if(to && d>new Date(to+'T23:59:59')) return false;
  return true;
}
function customerByName(name){return db.customers.find(c=>normText(c.name)===normText(name))||{};}
function orderCustomerCode(o){return o.customerCode||o.cCode||customerByName(o.customer).code||'';}
function matchText(value, filterId){let q=normText(document.getElementById(filterId)?.value||''); return !q || normText(value).includes(q);}
function filteredReceipts(){
  return db.receipts.map((r,i)=>({r,i})).filter(x=>{
    let items=receiptItems(x.r);
    let productText=items.map(it=>`${it.sku||''} ${it.name||''}`).join(' ');
    return inDateRange(x.r.date,'receiveFilterFrom','receiveFilterTo') &&
      matchText(x.r.id,'receiveFilterId') &&
      matchText(x.r.supplier,'receiveFilterSupplier') &&
      matchText(productText,'receiveFilterProduct');
  });
}
function filteredOrders(){
  return db.orders.filter(o=>{
    return inDateRange(o.isoDate||o.date,'orderFilterFrom','orderFilterTo') &&
      matchText(staffDisplayOrder(o),'orderFilterStaff') &&
      matchText(orderCustomerCode(o),'orderFilterCustomerCode') &&
      matchText(o.customer,'orderFilterCustomerName');
  });
}
function filteredMergeOrders(){
  return db.orders.filter(o=>!o.masterId).filter(o=>{
    return inDateRange(o.isoDate||o.date,'mergeFilterFrom','mergeFilterTo') &&
      matchText(staffDisplayOrder(o),'mergeFilterStaff') &&
      matchText(orderCustomerCode(o),'mergeFilterCustomerCode') &&
      matchText(o.customer,'mergeFilterCustomerName');
  });
}
function filteredMasterOrders(){
  return (db.masterOrders||[]).filter(m=>{
    let productText=(m.items||[]).map(it=>`${it.sku||''} ${it.name||''}`).join(' ');
    return inDateRange(m.isoDate||m.date,'masterFilterFrom','masterFilterTo') &&
      matchText(m.id,'masterFilterId') &&
      matchText(m.note,'masterFilterNote') &&
      matchText(productText,'masterFilterProduct');
  });
}
function clearInputs(ids){ids.forEach(id=>{let el=document.getElementById(id); if(el)el.value='';});render();}
function clearOrderFilters(){clearInputs(['orderFilterFrom','orderFilterTo','orderFilterStaff','orderFilterCustomerCode','orderFilterCustomerName']);}
function clearReceiveFilters(){clearInputs(['receiveFilterFrom','receiveFilterTo','receiveFilterId','receiveFilterSupplier','receiveFilterProduct']);}
function clearMergeFilters(){clearInputs(['mergeFilterFrom','mergeFilterTo','mergeFilterStaff','mergeFilterCustomerCode','mergeFilterCustomerName']);}
function clearMasterFilters(){clearInputs(['masterFilterFrom','masterFilterTo','masterFilterId','masterFilterNote','masterFilterProduct']);}
function clearProductFilters(){clearInputs(['productSearch','productBrandFilter','productCategoryFilter','productWarehouseFilter']);}
function filteredProducts(){
  let q=normText(document.getElementById('productSearch')?.value||'');
  let brand=normText(document.getElementById('productBrandFilter')?.value||'');
  let category=normText(document.getElementById('productCategoryFilter')?.value||'');
  let warehouse=normText(document.getElementById('productWarehouseFilter')?.value||'');
  return db.products.filter(p=>{
    let productText=normText(`${p.sku||''} ${p.name||''}`);
    return (!q||productText.includes(q)) && (!brand||normText(productBrand(p)).includes(brand)) && (!category||normText(productCategory(p)).includes(category)) && (!warehouse||normText(productWarehouse(p)).includes(warehouse));
  });
}
function productLevelRows(products){
  let map={};
  products.forEach(p=>{
    let key=[productWarehouse(p)||'Kho chính',productCategory(p)||'Chưa phân ngành',productBrand(p)||'Chưa phân nhãn'].join('|||');
    if(!map[key])map[key]={warehouse:productWarehouse(p)||'Kho chính',category:productCategory(p)||'Chưa phân ngành',brand:productBrand(p)||'Chưa phân nhãn',skuCount:0,qty:0,costValue:0,saleValue:0};
    map[key].skuCount+=1; map[key].qty+=Number(p.qty)||0; map[key].costValue+=(Number(p.qty)||0)*(Number(p.cost)||0); map[key].saleValue+=(Number(p.qty)||0)*(Number(p.sale)||0);
  });
  return Object.values(map).sort((a,b)=>String(a.warehouse+a.category+a.brand).localeCompare(String(b.warehouse+b.category+b.brand)));
}
function aggregateOrderItems(orders){
  let map={};
  orders.forEach(o=>(o.items||[]).forEach(it=>{
    let sku=String(it.sku||'').trim(); if(!sku)return;
    if(!map[sku]) map[sku]={sku,name:it.name||sku,pack:Number(it.pack)||1,qty:0,sale:Number(it.sale)||0,cost:Number(it.cost)||0,goods:0,discount:0,total:0};
    let q=Number(it.qty)||0, sale=Number(it.sale)||0, cost=Number(it.cost)||0, disc=Number(it.disc)||0;
    map[sku].qty+=q;
    map[sku].goods+=q*sale;
    map[sku].discount+=q*sale*(disc/100);
    map[sku].total+=q*sale-(q*sale*(disc/100));
    if(sale) map[sku].sale=sale;
    if(cost) map[sku].cost=cost;
  }));
  return Object.values(map).sort((a,b)=>String(a.sku).localeCompare(String(b.sku)));
}


function safeAttr(v){return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toggleAllByClass(cls,checked){document.querySelectorAll('.'+cls).forEach(x=>x.checked=!!checked)}
function checkedValues(cls){return [...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value)}
function checkedIndexes(cls){return checkedValues(cls).map(x=>Number(x)).filter(x=>!isNaN(x))}
function bulkDeleteProducts(){
  let skus=checkedValues('product-delete-check');
  if(!skus.length)return toast('Chưa chọn sản phẩm để xóa');
  if(!confirm('Xóa '+skus.length+' sản phẩm đã chọn?'))return;
  db.products=db.products.filter(p=>!skus.includes(String(p.sku)));
  save();render();toast('Đã xóa '+skus.length+' sản phẩm');
}
function bulkDeleteReceipts(){
  let indexes=checkedIndexes('receipt-delete-check').sort((a,b)=>b-a);
  if(!indexes.length)return toast('Chưa chọn phiếu nhập để xóa');
  let blocked=[];
  indexes.forEach(i=>{let r=db.receipts[i]; if(r){let check=receiptUpdateCheck(receiptItems(r).map(x=>({...x})),[]); if(!check.ok)blocked.push((r.id||'PN')+' - '+check.name);}});
  if(blocked.length)return toast('Không thể xóa vì có hàng đã xuất bán: '+blocked.slice(0,3).join(', '));
  if(!confirm('Xóa '+indexes.length+' phiếu nhập đã chọn? Tồn kho sẽ được trừ lại.'))return;
  indexes.forEach(i=>{let r=db.receipts[i]; if(!r)return; applyReceiptStockChange(receiptItems(r).map(x=>({...x})),[]); db.receipts.splice(i,1);});
  editingReceiptIndex=null; clearReceiptForm(); save();render();toast('Đã xóa '+indexes.length+' phiếu nhập');
}
function bulkDeleteOrders(){
  let ids=checkedValues('print-order-check');
  if(!ids.length)return toast('Chưa chọn đơn hàng để xóa');
  let merged=ids.filter(id=>{let o=db.orders.find(x=>String(x.id)===String(id)); return o&&o.masterId;});
  if(merged.length)return toast('Có đơn đã gộp đơn tổng, cần hủy gộp trước: '+merged.slice(0,3).join(', '));
  if(!confirm('Xóa '+ids.length+' đơn hàng đã chọn? Tồn kho sẽ được cộng trả lại.'))return;
  ids.forEach(id=>{let o=db.orders.find(x=>String(x.id)===String(id)); if(o)(o.items||[]).forEach(it=>{let p=findProduct(it.sku); if(p)p.qty+=Number(it.qty||0);});});
  removePaymentsByOrderIds(ids);
  db.orders=db.orders.filter(o=>!ids.includes(String(o.id)));
  save();render();toast('Đã xóa '+ids.length+' đơn hàng');
}
function bulkDeleteCustomers(){
  let codes=checkedValues('customer-delete-check');
  if(!codes.length)return toast('Chưa chọn khách hàng để xóa');
  if(!confirm('Xóa '+codes.length+' khách hàng đã chọn?'))return;
  db.customers=db.customers.filter(c=>!codes.includes(String(c.code)));
  save();render();toast('Đã xóa '+codes.length+' khách hàng');
}
function bulkDeleteStaff(){
  let indexes=checkedIndexes('staff-delete-check').sort((a,b)=>b-a);
  if(!indexes.length)return toast('Chưa chọn nhân viên để xóa');
  if(!confirm('Xóa '+indexes.length+' nhân viên đã chọn?'))return;
  indexes.forEach(i=>{if(db.staff[i])db.staff.splice(i,1)});
  save();render();toast('Đã xóa '+indexes.length+' nhân viên');
}


/* ===== Phân quyền và app bán hàng/giao hàng ===== */
let salesSelectedCustomerCode='';
let salesCart=[];
function currentRole(){return String(CURRENT_USER?.role||'admin').toLowerCase();}
function roleLabel(){const r=currentRole(); if(r==='admin')return 'Quản trị'; if(['delivery','driver','giaohang'].includes(r))return 'Nhân viên giao hàng'; return 'Nhân viên bán hàng';}
function isAdmin(){return currentRole()==='admin';}
function isSales(){return ['staff','sales','sale','banhang','nhanvien'].includes(currentRole());}
function isDriver(){return ['delivery','driver','giaohang'].includes(currentRole());}
function currentUserDisplayName(){return CURRENT_USER?.name||CURRENT_USER?.username||'';}
function currentUserCode(){return CURRENT_USER?.code||CURRENT_USER?.username||'';}
function defaultPageForRole(){return isDriver()?'deliveryApp':(isSales()?'salesApp':'dashboard');}
function allowedPagesForRole(){if(isAdmin())return null; if(isDriver())return ['deliveryApp']; return ['salesApp'];}
function isAllowedPage(id){const a=allowedPagesForRole(); return !a || a.includes(id);}
function applyRoleAccess(){
  const allowed=allowedPagesForRole();
  document.querySelectorAll('#nav button[data-page]').forEach(b=>{b.classList.toggle('role-hidden', !!allowed && !allowed.includes(b.dataset.page));});
  if(!isAdmin()){page(defaultPageForRole());}
}
function accountUsernameFromCode(code){return String(code||'').trim().toLowerCase();}
function accountPasswordOf(item){return String(item?.password||'123456').trim()||'123456';}
function accountRoleText(role){role=String(role||'').toLowerCase(); if(role==='admin')return 'Quản trị'; if(role==='delivery')return 'Giao hàng'; return 'Bán hàng';}
function upsertUserAccount(acc){
  db.users=db.users||[];
  const username=String(acc.username||'').trim();
  if(!username)return null;
  let old=db.users.find(u=>String(u.username||'').toLowerCase()===username.toLowerCase());
  const fixed={
    username,
    password:String(acc.password||'123456').trim()||'123456',
    role:String(acc.role||'sales').trim()||'sales',
    name:String(acc.name||'').trim(),
    code:String(acc.code||acc.staffCode||acc.deliveryCode||'').trim(),
    staffCode:String(acc.staffCode||acc.code||'').trim(),
    deliveryCode:String(acc.deliveryCode||acc.code||'').trim(),
    phone:String(acc.phone||acc.sdt||'').trim(),
    active:acc.active!==false
  };
  if(fixed.role==='sales') fixed.deliveryCode='';
  if(fixed.role==='delivery') fixed.staffCode='';
  if(old)Object.assign(old,fixed); else db.users.push(fixed);
  return old||fixed;
}
function syncUserToStaff(acc){
  const role=String(acc.role||'').toLowerCase();
  const code=String(acc.code||acc.staffCode||acc.deliveryCode||acc.username||'').trim();
  const name=String(acc.name||acc.username||code).trim();
  const phone=String(acc.phone||'').trim();
  if(!code || !name)return;
  if(role==='sales'){
    let old=(db.staff||[]).find((x,i)=>normText(staffCode(x,i))===normText(code));
    const data={code,name,phone,username:acc.username,password:acc.password,role:'sales'};
    if(old)Object.assign(old,data); else db.staff.push(data);
  }else if(role==='delivery'){
    let old=(db.deliveryStaff||[]).find((x,i)=>normText(deliveryCode(x,i))===normText(code));
    const data={code,name,phone,username:acc.username,password:acc.password,role:'delivery'};
    if(old)Object.assign(old,data); else db.deliveryStaff.push(data);
  }
}
function ensureStaffAccounts(){
  db.users=db.users||[];
  (db.staff||[]).forEach((n,i)=>{
    const code=staffCode(n,i);
    if(code){
      n.code=code;
      if(!n.username)n.username=accountUsernameFromCode(code);
      if(!n.password)n.password='123456';
      n.role='sales';
      upsertUserAccount({username:n.username,password:n.password,role:'sales',name:staffName(n),code,staffCode:code,phone:n.phone||n.sdt||'',active:n.active!==false});
    }
  });
  (db.deliveryStaff||[]).forEach((n,i)=>{
    const code=deliveryCode(n,i);
    if(code){
      n.code=code;
      if(!n.username)n.username=accountUsernameFromCode(code);
      if(!n.password)n.password='123456';
      n.role='delivery';
      upsertUserAccount({username:n.username,password:n.password,role:'delivery',name:deliveryName(n),code,deliveryCode:code,phone:n.phone||n.sdt||'',active:n.active!==false});
    }
  });
}
function accountBadge(username,password){
  return `<div class="account-badge"><b>TK: ${escapeHtml(username||'')}</b><br><span>MK: ${escapeHtml(password||'123456')}</span></div>`;
}
function copyAccount(username,password){
  const text=`Tài khoản: ${username}\nMật khẩu: ${password}`;
  if(navigator.clipboard) navigator.clipboard.writeText(text).then(()=>toast('Đã copy tài khoản')).catch(()=>toast(text));
  else toast(text);
}
function clearAccountForm(){['aCode','aName','aPhone','aUsername'].forEach(id=>{let el=document.getElementById(id);if(el)el.value=''}); if(document.getElementById('aPassword'))aPassword.value='123456'; if(document.getElementById('aRole'))aRole.value='sales';}
function updateAccountRoleHint(){
  const role=document.getElementById('aRole')?.value||'sales';
  const code=document.getElementById('aCode');
  if(code)code.placeholder=role==='delivery'?'VD: GH001':(role==='admin'?'VD: ADMIN2':'VD: NV001');
}
function saveAccount(){
  const role=(document.getElementById('aRole')?.value||'sales').trim();
  const code=(document.getElementById('aCode')?.value||'').trim();
  const name=(document.getElementById('aName')?.value||'').trim();
  const phone=(document.getElementById('aPhone')?.value||'').trim();
  const username=((document.getElementById('aUsername')?.value||'').trim() || accountUsernameFromCode(code));
  const password=(document.getElementById('aPassword')?.value||'123456').trim()||'123456';
  if(!username)return toast('Thiếu tài khoản đăng nhập hoặc mã nhân viên');
  if(role!=='admin' && (!code||!name))return toast('Nhập đủ mã và tên nhân viên');
  const acc=upsertUserAccount({username,password,role,name:name||username,code,staffCode:role==='sales'?code:'',deliveryCode:role==='delivery'?code:'',phone,active:true});
  syncUserToStaff(acc);
  clearAccountForm();
  save(); render();
  toast(role==='delivery'?'Đã tạo tài khoản và đồng bộ sang nhân viên giao hàng':(role==='sales'?'Đã tạo tài khoản và đồng bộ sang nhân viên bán hàng':'Đã tạo tài khoản quản trị'));
}
function editAccount(username){
  const u=(db.users||[]).find(x=>String(x.username||'')===String(username)); if(!u)return;
  if(document.getElementById('aRole'))aRole.value=u.role||'sales';
  if(document.getElementById('aCode'))aCode.value=u.code||u.staffCode||u.deliveryCode||'';
  if(document.getElementById('aName'))aName.value=u.name||'';
  if(document.getElementById('aPhone'))aPhone.value=u.phone||'';
  if(document.getElementById('aUsername'))aUsername.value=u.username||'';
  if(document.getElementById('aPassword'))aPassword.value=u.password||'123456';
  page('accounts');
}
function deleteAccount(username){
  if(!confirm('Xóa tài khoản này? Danh sách nhân viên vẫn được giữ lại.'))return;
  db.users=(db.users||[]).filter(u=>String(u.username||'')!==String(username));
  save();render();toast('Đã xóa tài khoản');
}
function renderAccounts(){
  if(!document.getElementById('accountBody'))return;
  ensureStaffAccounts();
  const rows=(db.users||[]).slice().sort((a,b)=>String(a.role).localeCompare(String(b.role))||String(a.username).localeCompare(String(b.username)));
  accountBody.innerHTML=rows.map(u=>{
    const code=u.code||u.staffCode||u.deliveryCode||'';
    const source=u.role==='sales'?'NVBH':(u.role==='delivery'?'Giao hàng':'Tài khoản riêng');
    return `<tr><td>${accountRoleText(u.role)}</td><td>${escapeHtml(code)}</td><td><b>${escapeHtml(u.name||'')}</b></td><td>${escapeHtml(u.phone||'')}</td><td>${escapeHtml(u.username||'')}</td><td>${escapeHtml(u.password||'123456')}</td><td><span class="pill">${source}</span></td><td><button class="btn small light" onclick="copyAccount('${safeAttr(u.username)}','${safeAttr(u.password||'123456')}')">Copy</button> <button class="btn small green" onclick="editAccount('${safeAttr(u.username)}')">Sửa</button> <button class="btn small red" onclick="deleteAccount('${safeAttr(u.username)}')">Xóa</button></td></tr>`;
  }).join('')||'<tr><td colspan="8" class="center muted">Chưa có tài khoản</td></tr>';
}
function salesCustomerDebtInfo(code,name){
  const rows=(db.orders||[]).filter(o=>{const c=String(orderCustomerCode(o)||''); const n=normText(o.customer||''); return (code&&c===String(code)) || (!code&&name&&n.includes(normText(name)));});
  const debtRows=rows.filter(o=>orderDebtRemaining(o)>0);
  return {debt:debtRows.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0), orders:debtRows.length, rows:debtRows};
}
function renderSalesApp(){renderSalesCustomerList();renderSalesProductList();renderSalesCart();renderSalesOrders();renderSalesDebt();updateMobileAppMode('salesApp');}
function renderSalesCustomerList(){
  const box=document.getElementById('salesCustomerList'); if(!box)return;
  const q=normText(document.getElementById('salesCustomerSearch')?.value||'');
  const rows=(db.customers||[]).filter(c=>!q || normText([c.code,c.name,c.phone,c.address].join(' ')).includes(q));
  box.innerHTML=rows.map(c=>{const info=salesCustomerDebtInfo(c.code,c.name);return `<div class="role-list-row ${String(c.code)===String(salesSelectedCustomerCode)?'active':''}" onclick="salesSelectCustomer('${safeAttr(c.code)}')"><b>${c.code||''} - ${c.name||''}</b><span class="muted">${c.phone||''} · ${c.address||''}</span><div>Công nợ: <b class="${info.debt>0?'debt-money-unpaid':'debt-money-paid'}">${money(info.debt)}</b></div></div>`}).join('')||'<div class="sale-auto-empty">Chưa có khách hàng phù hợp</div>';
}
function salesSelectCustomer(code){
  const c=(db.customers||[]).find(x=>String(x.code)===String(code)); if(!c)return;
  salesSelectedCustomerCode=c.code;
  document.body.classList.add('sales-customer-selected');
  const info=salesCustomerDebtInfo(c.code,c.name);
  if(document.getElementById('salesSelectedCustomerInfo'))salesSelectedCustomerInfo.innerHTML=`<button class="btn light mobile-back-btn" onclick="mobileBackToSalesCustomers()">← Khách hàng</button><span class="mobile-app-title">Khách đang thao tác</span><b>${escapeHtml(c.code||'')} - ${escapeHtml(c.name||'')}</b><br><span class="muted">${escapeHtml(c.phone||'')} · ${escapeHtml(c.address||'')}</span>`;
  if(document.getElementById('salesCustomerDebt'))salesCustomerDebt.textContent=money(info.debt);
  if(document.getElementById('salesCustomerDebtOrders'))salesCustomerDebtOrders.textContent=info.orders;
  if(document.getElementById('salesPayCustomerCode'))salesPayCustomerCode.value=c.code||'';
  if(document.getElementById('salesPayCustomerName'))salesPayCustomerName.value=c.name||'';
  renderSalesCustomerList();renderSalesProductList();renderSalesDebt();
  if(window.innerWidth<=780)setTimeout(()=>document.getElementById('salesSelectedCustomerInfo')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
}
function salesAddProduct(sku){
  const p=findProduct(sku); if(!p)return toast('Không tìm thấy sản phẩm');
  const qty=parseQtySlash(document.getElementById('salesQty_'+cssSafeId(sku))?.value||'1/0',p.pack||1);
  if(qty<=0)return toast('Nhập số lượng cần chấm');
  if(qty>Number(p.qty||0))return toast('Không đủ tồn thực tế: '+p.name+' còn '+qtyView(p.qty,p.pack));
  let old=salesCart.find(x=>String(x.sku)===String(sku));
  if(old)old.qty+=qty; else salesCart.push({sku:p.sku,name:p.name,pack:Number(p.pack)||1,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0});
  renderSalesCart();
}
function renderSalesProductList(){
  const body=document.getElementById('salesProductList'); if(!body)return;
  const q=normText(document.getElementById('salesProductSearch')?.value||'');
  const rows=(db.products||[]).filter(p=>!q || normText([p.sku,p.name,productBrand(p),productCategory(p)].join(' ')).includes(q));
  const isMobile=window.innerWidth<=780 || document.body.classList.contains('mobile-role-app');
  if(isMobile){
    body.innerHTML=rows.map(p=>`<tr><td colspan="6" class="mobile-product-cell"><div class="mobile-product-card">
      <div class="sku">Mã: ${escapeHtml(p.sku||'')}</div>
      <div class="name">${escapeHtml(p.name||'')}</div>
      <div class="meta">
        <div><span>Giá bán</span><b>${money(p.sale)}</b></div>
        <div><span>Tồn thực tế</span><b class="${Number(p.qty||0)<Number(p.pack||1)?'stock-warn':''}">${qtyView(p.qty,p.pack)}</b></div>
      </div>
      <div class="qty-grid">
        <input id="salesQty_${cssSafeId(p.sku)}" placeholder="SL dạng 1/0" value="1/0">
        <button class="btn green" onclick="salesAddProduct('${safeAttr(p.sku)}')">Chấm hàng</button>
      </div>
    </div></td></tr>`).join('')||'<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
    return;
  }
  body.innerHTML=rows.map(p=>`<tr><td><b>${p.sku}</b></td><td>${p.name}</td><td class="right">${money(p.sale)}</td><td class="right"><span class="pill ${Number(p.qty||0)<Number(p.pack||1)?'low':''}">${qtyView(p.qty,p.pack)}</span></td><td><input id="salesQty_${cssSafeId(p.sku)}" placeholder="1/0" style="width:90px"></td><td><button class="btn small green" onclick="salesAddProduct('${safeAttr(p.sku)}')">Chấm</button></td></tr>`).join('')||'<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
}
function renderSalesCart(){
  const box=document.getElementById('salesCartBody'); if(!box)return;
  let total=salesCart.reduce((a,x)=>a+Number(x.qty||0)*Number(x.sale||0),0);
  box.innerHTML=salesCart.map((x,i)=>`<div class="cart-item"><div><b>${x.sku} - ${x.name}</b><br><span class="muted">SL: ${qtyView(x.qty,x.pack)} · Giá: ${money(x.sale)}</span></div><div><b>${money(x.qty*x.sale)}</b><br><button class="btn small red" onclick="salesCart.splice(${i},1);renderSalesCart()">Xóa</button></div></div>`).join('')||'<div class="muted">Chưa chấm hàng.</div>';
  if(document.getElementById('salesCartGoods'))salesCartGoods.textContent=money(total);
  if(document.getElementById('salesCartTotal'))salesCartTotal.textContent=money(total);
  if(document.getElementById('salesCartLines'))salesCartLines.textContent=salesCart.length;
}
async function salesConfirmOrder(){
  const c=(db.customers||[]).find(x=>String(x.code)===String(salesSelectedCustomerCode));
  if(!c)return toast('Chọn khách hàng cần bán');
  if(!salesCart.length)return toast('Chưa chấm sản phẩm nào');
  for(const it of salesCart){const p=findProduct(it.sku); if(!p||Number(it.qty)>Number(p.qty||0))return toast('Không đủ tồn: '+(p?.name||it.sku));}
  const cash=Number(document.getElementById('salesCashPaid')?.value||0)||0; const bank=Number(document.getElementById('salesBankPaid')?.value||0)||0;
  const goods=salesCart.reduce((a,x)=>a+Number(x.qty||0)*Number(x.sale||0),0); const cost=salesCart.reduce((a,x)=>a+Number(x.qty||0)*Number(x.cost||0),0);
  salesCart.forEach(it=>{const p=findProduct(it.sku); if(p)p.qty-=Number(it.qty||0);});
  const id=orderId();
  const o={id,date:today(),isoDate:new Date().toISOString(),customer:c.name,customerCode:c.code,staffCode:currentUserCode(),staffName:currentUserDisplayName(),staff:currentUserDisplayName(),warehouse:'',note:document.getElementById('salesNote')?.value||'',delivery:'Chưa giao',xk:'',dueDate:document.getElementById('salesDueDate')?.value||'',cashPaid:cash,bankPaid:bank,debt:goods-cash-bank,paymentStatus:(goods-cash-bank)<=0?'Đã thanh toán':'Còn nợ',goods,discount:0,adjust:0,total:goods,cost,masterId:'',items:salesCart.map(x=>({...x}))};
  db.orders.push(o);
  save();
  salesCart=[]; if(document.getElementById('salesCashPaid'))salesCashPaid.value=0; if(document.getElementById('salesBankPaid'))salesBankPaid.value=0;
  render(); toast('Đã gửi đơn '+id+' về hệ thống');
}
function mySalesOrders(){if(isAdmin())return db.orders||[]; const name=normText(currentUserDisplayName()); const code=normText(currentUserCode()); return (db.orders||[]).filter(o=>normText(o.staffName||o.staff||'').includes(name)||normText(o.staffCode||'')===code);}
function renderSalesOrders(){const body=document.getElementById('salesOrdersBody'); if(!body)return; body.innerHTML=mySalesOrders().slice().reverse().map(o=>{const p=orderPaymentInfo(o);return `<tr><td><b>${o.id}</b></td><td>${o.date}</td><td>${o.customer}</td><td class="right">${money(p.total)}</td><td class="right">${money(p.paid)}</td><td class="right"><b class="${p.debt>0?'debt-money-unpaid':'debt-money-paid'}">${money(p.debt)}</b></td><td><span class="pill ${orderPaymentPillClass(p.status,p.debt)}">${p.status}</span></td><td><button class="btn small green" onclick="editOrder('${safeAttr(o.id)}')">Sửa</button> <button class="btn small red" onclick="deleteOrder('${safeAttr(o.id)}')">Xóa</button></td></tr>`}).join('')||'<tr><td colspan="8" class="center muted">Chưa có đơn đã chấm</td></tr>';}
function renderSalesDebt(){
  const body=document.getElementById('salesDebtBody'); if(!body)return;
  const map={}; mySalesOrders().forEach(o=>{const debt=Math.max(0,orderDebtRemaining(o)); if(debt<=0)return; const k=orderCustomerCode(o)||o.customer; if(!map[k])map[k]={code:orderCustomerCode(o)||'',name:o.customer||'',orders:0,debt:0}; map[k].orders++; map[k].debt+=debt;});
  const rows=Object.values(map); body.innerHTML=rows.map(r=>`<tr><td>${r.code}</td><td><b>${r.name}</b></td><td class="center">${r.orders}</td><td class="right"><b class="debt-money-unpaid">${money(r.debt)}</b></td><td><button class="btn small light" onclick="salesSelectCustomer('${safeAttr(r.code)}')">Chọn thu</button></td></tr>`).join('')||'<tr><td colspan="5" class="center muted">Không có công nợ khách hàng</td></tr>';
}
function salesCollectDebt(){
  const code=document.getElementById('salesPayCustomerCode')?.value||''; const name=document.getElementById('salesPayCustomerName')?.value||'';
  const cash=Number(document.getElementById('salesPayCash')?.value||0)||0; const bank=Number(document.getElementById('salesPayBank')?.value||0)||0;
  const note=(document.getElementById('salesPayNote')?.value||'Nhân viên bán hàng thu công nợ').trim();
  if(cash+bank<=0)return toast('Nhập số tiền cần thu');
  const orders=mySalesOrders().filter(o=>{const c=String(orderCustomerCode(o)||''); const n=normText(o.customer||''); return ((code&&c===String(code))||(!code&&name&&n.includes(normText(name)))) && orderDebtRemaining(o)>0;}).sort((a,b)=>debtPaymentSortDate(a)-debtPaymentSortDate(b));
  if(!orders.length)return toast('Không tìm thấy đơn còn nợ của khách này');
  const rs=applyCustomerPaymentToOrders(orders,cash,bank,note+' - Người thu: '+currentUserDisplayName());
  save();render(); if(document.getElementById('salesPayCash'))salesPayCash.value=0; if(document.getElementById('salesPayBank'))salesPayBank.value=0; toast('Đã ghi nhận thu '+money(rs.paidTotal)+' bởi '+currentUserDisplayName());
}
function driverMatchCodeName(code,name){const u=normText(currentUserCode()); const n=normText(currentUserDisplayName()); return (code&&normText(code)===u)||(name&&normText(name).includes(n))||(n&&normText(name)===n);}
function driverMasters(){if(isAdmin())return db.masterOrders||[]; return (db.masterOrders||[]).filter(m=>driverMatchCodeName(m.deliveryStaffCode,m.deliveryStaffName));}
function driverChildOrders(){const ids=new Set(driverMasters().flatMap(m=>m.childIds||[])); return (db.orders||[]).filter(o=>ids.has(o.id)||driverMatchCodeName(o.deliveryStaffCode,o.deliveryStaffName));}
function applyCustomerReturnToOrders(orders, returnAmount, note){
  let returnLeft=Number(returnAmount)||0;
  let returnTotal=0;
  const touchedMasters=new Set();
  orders.forEach(order=>{
    if(returnLeft<=0) return;
    const remain=Math.max(0,orderDebtRemaining(order));
    if(remain<=0) return;
    const amount=Math.min(remain,returnLeft);
    addReturnLedger(order,amount,note||'Nhân viên giao hàng ghi nhận hàng trả về','driver-customer-debt-return');
    returnLeft-=amount;
    returnTotal+=amount;
    if(order.masterId) touchedMasters.add(order.masterId);
  });
  touchedMasters.forEach(id=>recalcMasterOrder(id));
  return {returnTotal,returnLeft};
}
function driverCollectDebt(code,name){
  const sid=cssSafeId(code||name);
  const cash=Number(document.getElementById('driverCash_'+sid)?.value||0)||0;
  const bank=Number(document.getElementById('driverBank_'+sid)?.value||0)||0;
  const returned=Number(document.getElementById('driverReturnDebt_'+sid)?.value||0)||0;
  const note=(document.getElementById('driverNote_'+sid)?.value||'Nhân viên giao hàng thu tiền').trim();
  if(cash<0||bank<0||returned<0)return toast('Số tiền không được âm');
  if(cash+bank+returned<=0)return toast('Nhập tiền mặt, chuyển khoản hoặc giá trị hàng trả về');
  const orders=driverChildOrders().filter(o=>{const c=String(orderCustomerCode(o)||''); const n=normText(o.customer||''); return ((code&&c===String(code))||(!code&&name&&n.includes(normText(name)))) && orderDebtRemaining(o)>0;}).sort((a,b)=>debtPaymentSortDate(a)-debtPaymentSortDate(b));
  if(!orders.length)return toast('Khách này không còn công nợ trong đơn giao');
  const returnRs=applyCustomerReturnToOrders(orders,returned,note+' - Hàng trả về bởi: '+currentUserDisplayName());
  const rs=applyCustomerPaymentToOrders(orders,cash,bank,note+' - Người thu: '+currentUserDisplayName());
  save();render();toast('Đã ghi nhận: tiền thu '+money(rs.paidTotal)+' · hàng trả về '+money(returnRs.returnTotal)+' bởi '+currentUserDisplayName());
}
function driverSaveOrderReturn(orderId){
  const order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
  if(!order)return toast('Không tìm thấy đơn giao hàng');
  const input=document.getElementById('driverReturn_'+cssSafeId(orderId));
  const amount=Number(input?.value||0)||0;
  if(amount<0)return toast('Tiền hàng trả về không được âm');
  const total=Number(order.total||0)||0;
  const paid=(Number(order.cashPaid||0)||0)+(Number(order.bankPaid||0)||0);
  if(amount>total) return toast('Tiền hàng trả về không được lớn hơn tổng đơn');
  const rs=setOrderReturnAmount(order,amount,'Nhân viên giao hàng cập nhật hàng trả về cho đơn '+orderId);
  save();
  renderDeliveryApp();
  renderDebtReports?.();
  toast('Đã lưu hàng trả về '+money(rs.total)+' cho đơn '+orderId);
}
function driverDeliveryReportRows(){
  return driverChildOrders().slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')));
}
function renderDeliveryApp(){
  updateMobileAppMode('deliveryApp');
  const masters=driverMasters();
  const child=driverChildOrders();
  const debts=child.filter(o=>orderDebtRemaining(o)>0);
  const debtTotal=debts.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
  const cashTotal=child.reduce((a,o)=>a+(Number(o.cashPaid||0)||0),0);
  const bankTotal=child.reduce((a,o)=>a+(Number(o.bankPaid||0)||0),0);
  const returnTotal=child.reduce((a,o)=>a+orderReturnAmount(o),0);
  const reconcileTotal=cashTotal+bankTotal+returnTotal+Math.max(0,debtTotal);

  if(document.getElementById('driverMasterCount'))driverMasterCount.textContent=masters.length;
  if(document.getElementById('driverChildCount'))driverChildCount.textContent=child.length;
  if(document.getElementById('driverDebtTotal'))driverDebtTotal.textContent=money(debtTotal);
  if(document.getElementById('driverCashTotal'))driverCashTotal.textContent=money(cashTotal);
  if(document.getElementById('driverBankTotal'))driverBankTotal.textContent=money(bankTotal);
  if(document.getElementById('driverReturnTotal'))driverReturnTotal.textContent=money(returnTotal);
  if(document.getElementById('driverReconcileTotal'))driverReconcileTotal.textContent=money(reconcileTotal);

  const map={};
  debts.forEach(o=>{
    const k=orderCustomerCode(o)||o.customer;
    if(!map[k])map[k]={code:orderCustomerCode(o)||'',name:o.customer||'',orders:0,debt:0};
    map[k].orders++;
    map[k].debt+=Math.max(0,orderDebtRemaining(o));
  });
  if(document.getElementById('driverDebtCustomerCount'))driverDebtCustomerCount.textContent=Object.keys(map).length;

  const list=document.getElementById('driverMasterList');
  if(list)list.innerHTML=masters.map(m=>{
    const orders=(db.orders||[]).filter(o=>(m.childIds||[]).includes(o.id));
    const masterReturn=orders.reduce((a,o)=>a+orderReturnAmount(o),0);
    const masterCash=orders.reduce((a,o)=>a+(Number(o.cashPaid||0)||0),0);
    const masterBank=orders.reduce((a,o)=>a+(Number(o.bankPaid||0)||0),0);
    const masterDebt=orders.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
    return `<div class="driver-order-card"><h3>Đơn tổng ${escapeHtml(m.id||'')}</h3><div class="muted">Ngày: ${escapeHtml(m.date||'')} · Tổng tiền: ${money(m.total||0)} · Tiền mặt: ${money(masterCash)} · Chuyển khoản: ${money(masterBank)} · Hàng trả về: ${money(masterReturn)} · Công nợ: ${money(masterDebt)} · Ghi chú: ${escapeHtml(m.note||'')}</div><div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Đơn con</th><th>Mã KH</th><th>Khách hàng</th><th class="right">Tổng tiền</th><th class="right">Tiền mặt</th><th class="right">Chuyển khoản</th><th class="right">Hàng trả về</th><th class="right">Còn nợ</th><th>Thao tác</th></tr></thead><tbody>${orders.map(o=>{const rid=cssSafeId(o.id);return `<tr><td>${escapeHtml(o.id||'')}</td><td>${escapeHtml(orderCustomerCode(o)||'')}</td><td>${escapeHtml(o.customer||'')}</td><td class="right">${money(o.total||0)}</td><td class="right">${money(o.cashPaid||0)}</td><td class="right">${money(o.bankPaid||0)}</td><td class="right"><input class="driver-return-input" id="driverReturn_${rid}" type="number" inputmode="numeric" value="${orderReturnAmount(o)}" min="0"></td><td class="right"><b class="${orderDebtRemaining(o)>0?'debt-money-unpaid':'debt-money-paid'}">${money(orderDebtRemaining(o))}</b></td><td><button class="btn small orange" onclick="driverSaveOrderReturn('${safeAttr(o.id)}')">Lưu hàng trả</button></td></tr>`}).join('')}</tbody></table></div></div>`;
  }).join('')||'<div class="debt-search-note">Chưa có đơn tổng nào mang tên nhân viên giao hàng này.</div>';

  const body=document.getElementById('driverDebtBody');
  if(body)body.innerHTML=Object.values(map).map(r=>{
    const sid=cssSafeId(r.code||r.name);
    return `<tr><td>${escapeHtml(r.code)}</td><td><b>${escapeHtml(r.name)}</b></td><td class="center">${r.orders}</td><td class="right"><b class="debt-money-unpaid">${money(r.debt)}</b></td><td><div class="driver-collect-box"><div class="form"><div class="field"><label>Tiền mặt</label><input id="driverCash_${sid}" type="number" value="0"></div><div class="field"><label>Chuyển khoản</label><input id="driverBank_${sid}" type="number" value="0"></div><div class="field"><label>Giá trị hàng trả về</label><input id="driverReturnDebt_${sid}" type="number" value="0"></div><div class="field"><label>Ghi chú</label><input id="driverNote_${sid}" value="Nhân viên giao hàng thu tiền"></div></div><div class="toolbar" style="margin:8px 0 0"><button class="btn small green" onclick="driverCollectDebt('${safeAttr(r.code)}','${safeAttr(r.name)}')">Xác nhận thu</button><button class="btn small light" onclick="page('debts');debtFilterCustomerCode.value='${safeAttr(r.code)}';openDebtSearchResults()">Chi tiết</button></div></div></td></tr>`;
  }).join('')||'<tr><td colspan="5" class="center muted">Không có công nợ thuộc đơn giao</td></tr>';

  const reportRows=driverDeliveryReportRows();
  if(document.getElementById('driverReportCash'))driverReportCash.textContent=money(cashTotal);
  if(document.getElementById('driverReportBank'))driverReportBank.textContent=money(bankTotal);
  if(document.getElementById('driverReportDebt'))driverReportDebt.textContent=money(debtTotal);
  if(document.getElementById('driverReportReturn'))driverReportReturn.textContent=money(returnTotal);
  const reportBody=document.getElementById('driverReportBody');
  if(reportBody)reportBody.innerHTML=reportRows.map(o=>`<tr><td>${escapeHtml(o.id||'')}</td><td>${escapeHtml(orderCustomerCode(o)||'')}</td><td>${escapeHtml(o.customer||'')}</td><td class="right">${money(o.total||0)}</td><td class="right">${money(o.cashPaid||0)}</td><td class="right">${money(o.bankPaid||0)}</td><td class="right">${money(orderReturnAmount(o))}</td><td class="right"><b class="${orderDebtRemaining(o)>0?'debt-money-unpaid':'debt-money-paid'}">${money(orderDebtRemaining(o))}</b></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có đơn giao hàng để báo cáo</td></tr>';
}
function cssSafeId(v){return String(v).replace(/[^a-zA-Z0-9_-]/g,'_');}

function render(){
 ensureCustomersFromOrders();
 ensureStaffAccounts();
 let rev=db.orders.reduce((a,o)=>a+Number(o.total||0),0), cost=db.orders.reduce((a,o)=>a+Number(o.cost||0),0), low=db.products.filter(p=>Number(p.qty||0)<Number(p.pack||1));
 stProducts.textContent=db.products.length;stReceive.textContent=db.receipts.length;stOrders.textContent=db.orders.length;stRevenue.textContent=money(rev);lowCount.textContent=low.length;rpRevenue.textContent=money(rev);rpCost.textContent=money(cost);rpProfit.textContent=money(rev-cost);rpLow.textContent=low.length;
 lowStockBody.innerHTML=(low.slice(0,8).map(p=>`<tr><td>${p.sku}</td><td><b>${p.name}</b></td><td>${p.pack}</td><td class="right"><span class="pill low">${qtyView(p.qty,p.pack)}</span></td></tr>`).join(''))||'<tr><td colspan="4" class="center muted">Không có hàng tồn thấp</td></tr>';
 recentOrdersBody.innerHTML=(db.orders.slice(-5).reverse().map(o=>`<tr><td>${o.id}</td><td>${o.customer}</td><td>${staffDisplayOrder(o)}</td><td class="right">${money(o.total)}</td><td>${o.date}</td><td><span class="pill">Hoàn thành</span></td></tr>`).join(''))||'<tr><td colspan="6" class="center muted">Chưa có đơn hàng</td></tr>';
 let ps=filteredProducts(); productBody.innerHTML=ps.map((p,i)=>`<tr><td class="center"><input type="checkbox" class="product-delete-check" value="${safeAttr(p.sku)}"></td><td>${p.sku}</td><td><b>${p.name}</b></td><td>${productBrand(p)||''}</td><td>${productCategory(p)||''}</td><td>${productWarehouse(p)||''}</td><td>${p.pack}</td><td class="right"><span class="pill ${p.qty<p.pack?'low':''}">${qtyView(p.qty,p.pack)}</span></td><td class="right">${money(p.cost)}</td><td class="right">${money(p.sale)}</td><td><button class="btn small light" onclick="editProduct('${p.sku}')">Sửa</button> <button class="btn small red" onclick="delProduct('${p.sku}')">Xóa</button></td></tr>`).join('')||'<tr><td colspan="11" class="center muted">Chưa có sản phẩm phù hợp</td></tr>';
 if(document.getElementById('productLevelBody'))productLevelBody.innerHTML=productLevelRows(ps).map(r=>`<tr><td>${r.warehouse}</td><td>${r.category}</td><td>${r.brand}</td><td class="center">${r.skuCount}</td><td class="right">${money(r.qty)}</td><td class="right">${money(r.costValue)}</td><td class="right">${money(r.saleValue)}</td></tr>`).join('')||'<tr><td colspan="7" class="center muted">Chưa có dữ liệu tổng hợp</td></tr>';
 skuList.innerHTML=db.products.map(p=>`<option value="${p.sku}">${p.name}</option>`).join('');
 renderSaleAutocompleteOptions();
 receiveBody.innerHTML=filteredReceipts().reverse().map(x=>`<tr><td class="center"><input type="checkbox" class="receipt-delete-check" value="${x.i}"></td><td><b>${x.r.id||'PN cũ'}</b></td><td>${x.r.date||''}</td><td>${x.r.supplier||''}</td><td class="center">${receiptItems(x.r).length}</td><td class="right">${receiptTotalQty(x.r)}</td><td class="right">${money(receiptTotalMoney(x.r))}</td><td>${x.r.note||''}</td><td><button class="btn small light" onclick="editReceipt(${x.i})">Sửa</button> <button class="btn small red" onclick="deleteReceipt(${x.i})">Xóa</button></td></tr>`).join('')||'<tr><td colspan="9" class="center muted">Chưa có phiếu nhập phù hợp</td></tr>';
 ordersBody.innerHTML=filteredOrders().slice().reverse().map(o=>{let merged=!!o.masterId;let cCode=orderCustomerCode(o);let pay=orderPaymentInfo(o);let pill=orderPaymentPillClass(pay.status,pay.debt);return `<tr><td class="center"><input type="checkbox" class="print-order-check" value="${escapeHtml(o.id)}"></td><td>${o.id}</td><td>${o.date}</td><td>${cCode||''}</td><td>${o.customer}</td><td>${staffDisplayOrder(o)}</td><td class="right">${money(pay.total)}</td><td class="right">${money(pay.paid)}</td><td class="right"><b class="${pay.debt>0?'debt-money-unpaid':(pay.debt<0?'debt-money-overpaid':'debt-money-paid')}">${money(pay.debt)}</b></td><td><span class="pill ${pill}">${pay.status}</span>${o.dueDate?`<div class="muted" style="font-size:12px;margin-top:4px">Hạn: ${o.dueDate}</div>`:''}</td><td class="center">${(o.items||[]).length}</td><td class="center"><span class="pill ${merged?'warn':''}">${merged?'Đã gộp đơn tổng: '+o.masterId:'Chưa gộp đơn tổng'}</span></td><td><button class="btn small light" onclick="printInvoice('${o.id}')">In PDF</button> <button class="btn small green" onclick="editOrder('${o.id}')">Sửa</button> <button class="btn small red" onclick="deleteOrder('${o.id}')">Xóa</button></td></tr>`}).join('')||'<tr><td colspan="13" class="center muted">Chưa có đơn hàng phù hợp</td></tr>';
 customerBody.innerHTML=db.customers.map(c=>`<tr><td class="center"><input type="checkbox" class="customer-delete-check" value="${safeAttr(c.code)}"></td><td>${c.code}</td><td><b>${c.name}</b></td><td>${c.address||''}</td><td>${c.phone||''}</td><td>${c.tax||''}</td><td>${c.customerGroup||''}</td><td><button class="btn small light" onclick="editCustomer('${c.code}')">Sửa</button> <button class="btn small red" onclick="delCustomer('${c.code}')">Xóa</button></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có khách hàng</td></tr>';
 staffBody.innerHTML=db.staff.map((n,i)=>{const code=staffCode(n,i);const user=accountUsernameFromCode(n.username||code);const pass=accountPasswordOf(n);return `<tr><td class="center"><input type="checkbox" class="staff-delete-check" value="${i}"></td><td>${code}</td><td><b>${staffName(n)}</b></td><td>${n.phone||n.sdt||''}</td><td>${accountBadge(user,pass)}<button class="btn small light" onclick="copyAccount('${safeAttr(user)}','${safeAttr(pass)}')">Copy</button></td><td><button class="btn small light" onclick="editStaff(${i})">Sửa</button> <button class="btn small red" onclick="delStaff(${i})">Xóa</button></td></tr>`}).join('')||'<tr><td colspan="6" class="center muted">Chưa có nhân viên</td></tr>';
 populateDeliveryStaffSelects();
 const sr=buildStaffReportRows(); if(document.getElementById('staffReportBody')) staffReportBody.innerHTML=sr.map(r=>`<tr><td>${r.code}</td><td><b>${r.name}</b></td><td class="center">${r.orders}</td><td class="right">${r.lines}</td><td class="right">${money(r.revenue)}</td><td class="right">${money(r.cost)}</td><td class="right"><b>${money(r.profit)}</b></td></tr>`).join('')||'<tr><td colspan="7" class="center muted">Chưa có dữ liệu bán hàng theo nhân viên</td></tr>';
 if(document.getElementById('shortageReportBody')) renderShortageReports();
 if(document.getElementById('mergeOrderBody')) renderMergeOrders();
 if(document.getElementById('masterOrdersBody')) renderMasterOrders();
 if(document.getElementById('deliveryStaffBody')) renderDeliveryStaff();
 if(document.getElementById('accountBody')) renderAccounts();
 if(document.getElementById('debtBody')) renderDebtReports();
 if(document.getElementById('productCatalogBody')) renderProductCatalog();
 if(document.getElementById('promotionBody')) renderPromotions();
 renderSalesApp(); renderDeliveryApp();
 renderCart(); renderReceiveCart();
}
function saveProduct(){let sku=pSku.value.trim(); if(!sku||!pName.value.trim())return toast('Thiếu SKU hoặc tên sản phẩm'); let old=findProduct(sku); let data={sku,name:pName.value.trim(),brand:pBrand?.value||'',category:pCategory?.value||'',warehouse:pWarehouse?.value||'Kho chính',pack:Number(pPack.value)||1,sale:Number(pSale.value)||0}; if(!old){db.products.push({...data,qty:0,cost:0})} else {old.name=data.name;old.brand=data.brand;old.category=data.category;old.warehouse=data.warehouse;old.pack=data.pack;old.sale=data.sale} ['pSku','pName','pBrand','pCategory','pWarehouse','pSale'].forEach(id=>{let el=document.getElementById(id);if(el)el.value=''});pPack.value=12;save();render();toast('Đã lưu sản phẩm')}
function editProduct(sku){let p=findProduct(sku); pSku.value=p.sku;pName.value=p.name;pBrand.value=productBrand(p);pCategory.value=productCategory(p);pWarehouse.value=productWarehouse(p);pPack.value=p.pack;pSale.value=p.sale;page('products')}
function delProduct(sku){if(confirm('Xóa sản phẩm này?')){db.products=db.products.filter(p=>p.sku!==sku);save();render()}}
function addReceiveItem(){let qty=totalQty(rBox.value,rEach.value,rPack.value); if(!rSku.value.trim()||qty<=0)return toast('Thiếu SKU hoặc số lượng'); let item={sku:rSku.value.trim(),name:rName.value.trim(),pack:Number(rPack.value)||1,qty,cost:Number(rCost.value)||0}; let old=receiveCart.find(x=>x.sku===item.sku&&Number(x.cost)===Number(item.cost)); if(old){old.qty+=item.qty}else receiveCart.push(item); ['rSku','rName','rCost'].forEach(id=>document.getElementById(id).value='');rBox.value=0;rEach.value=0;renderReceiveCart();toast('Đã thêm hàng vào phiếu')}
function renderReceiveCart(){
  if(!document.getElementById('receiveCartBody'))return;
  receiveCartBody.innerHTML=receiveCart.map((c,i)=>`
    <div class="cart-item">
      <div style="flex:1">
        <b>${c.name||c.sku}</b><br>
        <span class="muted">${c.sku} · Quy cách ${c.pack}</span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <div><span class="muted">SL thùng/lẻ</span><input value="${qtyView(c.qty,c.pack)}" onchange="updateReceiveCartQty(${i},this.value)"></div>
          <div><span class="muted">Giá nhập</span><input type="number" value="${Number(c.cost)||0}" onchange="updateReceiveCartCost(${i},this.value)"></div>
        </div>
      </div>
      <button class="btn small red" onclick="removeReceiveCartItem(${i})">Xóa</button>
    </div>`).join('')||'<div class="muted">Chưa có hàng trong phiếu</div>';
  receiveCartTotal.textContent=money(receiveCart.reduce((a,b)=>a+Number(b.qty||0)*Number(b.cost||0),0));
}
function updateReceiveCartQty(i,value){
  let c=receiveCart[i]; if(!c)return;
  let q=parseQtySlash(value,c.pack);
  if(q<=0){toast('Số lượng phải lớn hơn 0');renderReceiveCart();return;}
  c.qty=q;
  renderReceiveCart();
}
function updateReceiveCartCost(i,value){
  let c=receiveCart[i]; if(!c)return;
  c.cost=Number(value)||0;
  renderReceiveCart();
}
function removeReceiveCartItem(i){
  receiveCart.splice(i,1);
  renderReceiveCart();
}
function sumQtyBySku(items){
  let map={};
  (items||[]).forEach(it=>{let sku=String(it.sku||'').trim(); if(sku) map[sku]=(map[sku]||0)+Number(it.qty||0);});
  return map;
}
function receiptUpdateCheck(oldItems,newItems){
  let oldMap=sumQtyBySku(oldItems), newMap=sumQtyBySku(newItems);
  let skus=[...new Set([...Object.keys(oldMap),...Object.keys(newMap)])];
  for(let sku of skus){
    let p=findProduct(sku);
    let current=Number(p?.qty||0);
    let next=current-Number(oldMap[sku]||0)+Number(newMap[sku]||0);
    if(next<0){
      return {ok:false,sku,next,current,oldQty:Number(oldMap[sku]||0),newQty:Number(newMap[sku]||0),name:(p&&p.name)||sku,pack:(p&&p.pack)||1};
    }
  }
  return {ok:true};
}
function applyReceiptStockChange(oldItems,newItems){
  let oldMap=sumQtyBySku(oldItems), newMap=sumQtyBySku(newItems);
  let itemMap={};
  (oldItems||[]).concat(newItems||[]).forEach(it=>{if(it&&it.sku)itemMap[String(it.sku).trim()]=it;});
  let skus=[...new Set([...Object.keys(oldMap),...Object.keys(newMap)])];
  skus.forEach(sku=>{
    let delta=Number(newMap[sku]||0)-Number(oldMap[sku]||0);
    if(delta===0)return;
    let base=itemMap[sku]||{sku,name:sku,pack:1,cost:0};
    let p=upsertProduct({sku:base.sku,name:base.name,pack:base.pack,cost:base.cost});
    p.qty=Number(p.qty||0)+delta;
    if(newMap[sku]>0 && base.cost!==undefined)p.cost=Number(base.cost)||p.cost;
  });
}
function clearReceiptForm(){
  receiveCart=[]; editingReceiptIndex=null;
  ['rId','rSupplier','rNote'].forEach(id=>{let el=document.getElementById(id); if(el)el.value='';});
  if(document.getElementById('rDate'))rDate.value='';
  const backBtn=document.getElementById('receiveEditBackBtn'); if(backBtn) backBtn.remove();
  renderReceiveCart();
}
function focusReceiveHistory(){
  setTimeout(()=>{
    const body=document.getElementById('receiveBody');
    const panel=body ? body.closest('.card.panel') : null;
    if(panel){
      try{ panel.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){ panel.scrollIntoView(); }
    }
  },80);
}
function cancelEditReceipt(){
  clearReceiptForm();
  focusReceiveHistory();
  toast('Đã quay lại danh sách phiếu nhập');
}
function createReceipt(){
  if(!receiveCart.length)return toast('Phiếu nhập chưa có hàng');
  let id=(rId.value||receiptId()).trim();
  let date=rDate.value||today();
  let wasEditing=editingReceiptIndex!==null;
  let newItems=receiveCart.map(x=>({...x,qty:Number(x.qty)||0,cost:Number(x.cost)||0,pack:Number(x.pack)||1}));
  let oldReceipt=editingReceiptIndex!==null?db.receipts[editingReceiptIndex]:null;
  let oldItems=oldReceipt?receiptItems(oldReceipt).map(x=>({...x})):[];
  let check=receiptUpdateCheck(oldItems,newItems);
  if(!check.ok){
    return toast('Không thể cập nhật phiếu nhập vì hàng đã xuất bán: '+check.name+' | Tồn sau sửa sẽ âm');
  }
  applyReceiptStockChange(oldItems,newItems);
  let newReceipt={id,date,supplier:rSupplier.value||'Unilever',note:rNote.value,total:newItems.reduce((a,b)=>a+b.qty*b.cost,0),items:newItems};
  if(oldReceipt){
    db.receipts[editingReceiptIndex]=newReceipt;
    toast('Đã cập nhật phiếu nhập '+id);
  }else{
    db.receipts.push(newReceipt);
    toast('Đã chốt phiếu nhập '+id);
  }
  clearReceiptForm();
  save();render();
  if(wasEditing) focusReceiveHistory();
}
function editReceipt(index){
  let r=db.receipts[index];
  if(!r)return toast('Không tìm thấy phiếu nhập');
  editingReceiptIndex=index;
  if(document.getElementById('rId'))rId.value=r.id||'';
  if(document.getElementById('rSupplier'))rSupplier.value=r.supplier||'';
  if(document.getElementById('rDate'))rDate.value=(r.date&&String(r.date).includes('-'))?String(r.date).slice(0,10):'';
  if(document.getElementById('rNote'))rNote.value=r.note||'';
  receiveCart=receiptItems(r).map(x=>({...x,pack:Number(x.pack)||1,qty:Number(x.qty)||0,cost:Number(x.cost)||0}));
  page('receive');
  renderReceiveCart();
  const formPanel=document.querySelector('#receive .layout2 .card.panel');
  if(formPanel && !document.getElementById('receiveEditBackBtn')){
    const btn=document.createElement('button');
    btn.id='receiveEditBackBtn';
    btn.className='btn light';
    btn.type='button';
    btn.style.marginLeft='8px';
    btn.textContent='Quay lại danh sách phiếu nhập';
    btn.onclick=cancelEditReceipt;
    const submitBtn=[...formPanel.querySelectorAll('button')].find(b=>String(b.textContent||'').includes('Chốt phiếu nhập'));
    if(submitBtn) submitBtn.insertAdjacentElement('afterend',btn);
  }
  toast('Đang sửa phiếu nhập '+(r.id||''));
}
function deleteReceipt(index){
  let r=db.receipts[index];
  if(!r)return toast('Không tìm thấy phiếu nhập');
  if(!confirm('Xóa phiếu nhập '+(r.id||'')+'? Tồn kho sẽ được trừ lại.'))return;
  let oldItems=receiptItems(r).map(x=>({...x}));
  let check=receiptUpdateCheck(oldItems,[]);
  if(!check.ok){
    return toast('Không thể xóa phiếu vì hàng đã xuất bán: '+check.name+' | Tồn sau xóa sẽ âm');
  }
  applyReceiptStockChange(oldItems,[]);
  db.receipts.splice(index,1);
  if(editingReceiptIndex===index)clearReceiptForm();
  save();render();toast('Đã xóa phiếu nhập');
}
function receiveStock(){addReceiveItem();createReceipt()}
rSku.onchange=()=>{let p=findProduct(rSku.value); if(p){rName.value=p.name;rPack.value=p.pack;rCost.value=p.cost}}
let selectedSaleSku=null;
function orderId(){return 'DH'+String(Date.now()).slice(-8)}
function newSaleOrder(){
  editingOrderId=null;
  if(document.getElementById('oId')) oId.value=orderId();
  if(document.getElementById('oDate')) oDate.value=new Date().toISOString().slice(0,10);
  if(document.getElementById('xkCode')) xkCode.value='XK'+String(Date.now()).slice(-6);
  if(document.getElementById('sNote')) sNote.value='';
  if(document.getElementById('adjustDiscount')) adjustDiscount.value=0;
  if(document.getElementById('lineDiscount')) lineDiscount.value=0;
  if(document.getElementById('sStaff')) sStaff.value='';
  if(document.getElementById('sStaffCode')) sStaffCode.value='';
  if(document.getElementById('sCustomer')) sCustomer.value='';
  if(document.getElementById('sCustomerCode')) sCustomerCode.value='';
  if(document.getElementById('saleLineDisc')) saleLineDisc.value=0;
  if(document.getElementById('deliveryStatus')) deliveryStatus.value='Giao thành công';
  cart=[];selectedSaleSku=null;renderCart();
}
function searchSaleProducts(){
  let q=(sSearch.value||'').toLowerCase().trim();
  if(!q){saleResults.style.display='none';saleResults.innerHTML='';return}
  let rs=db.products.filter(p=>(p.sku+' '+p.name).toLowerCase().includes(q)).slice(0,12);
  saleResults.innerHTML=rs.map(p=>`<div class="sale-result-row" onclick="chooseSaleProduct('${String(p.sku).replace(/'/g,"\'")}')"><div><b>${p.sku}</b> - ${p.name}<br><span class="muted">Tồn ${qtyView(p.qty,p.pack)} · Quy cách ${p.pack} · Giá ${money(p.sale)}</span></div><button class="btn small">Chọn</button></div>`).join('');
  saleResults.style.display=rs.length?'block':'none';
}
function chooseSaleProduct(sku){let p=findProduct(sku); if(!p)return; selectedSaleSku=sku; sSearch.value=p.sku+' - '+p.name; saleResults.style.display='none'; saleQtySlash.focus();}
function addSelectedSaleItem(){if(!selectedSaleSku)return toast('Chưa chọn sản phẩm'); addCart(selectedSaleSku);}
function addCart(sku, qtySlash=null, discount=null){
  let p=findProduct(sku); if(!p)return toast('Không tìm thấy sản phẩm');
  let qty=parseQtySlash(qtySlash!==null?qtySlash:(saleQtySlash?.value||''),p.pack);
  if(qty<=0)return toast('Nhập số lượng dạng 1/0');
  let current=cart.filter(x=>x.sku===sku).reduce((a,b)=>a+b.qty,0);
  if(current+qty>Number(p.qty||0))return toast('Không đủ tồn kho: '+p.name+' | Tồn '+qtyView(p.qty,p.pack));
  let disc=Number(discount!==null?discount:(saleLineDisc?.value||lineDiscount?.value||0))||0;
  cart.push({sku:p.sku,name:p.name,pack:p.pack,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc});
  if(document.getElementById('saleQtySlash'))saleQtySlash.value='';
  if(document.getElementById('sSearch'))sSearch.value='';
  selectedSaleSku=null;renderCart();
}

function productInPromoGroup(sku, groupName){
  sku=String(sku||'').trim();
  groupName=String(groupName||'').trim();
  if(!sku || !groupName) return false;
  const p=findProduct(sku)||{};
  if(normText(p.productGroup||'')===normText(groupName)) return true;
  const g=(db.productGroups||[]).find(x=>normText(x.name)===normText(groupName));
  return !!(g && Array.isArray(g.skus) && g.skus.map(String).includes(String(sku)));
}

/* ===== Autocomplete xịn cho mục Xuất bán: NVBH / Khách hàng ===== */
function saleAutoText(v){return normText(String(v||''));}
function saleStaffLabel(s,i){
  const code=staffCode(s,i);
  const name=staffName(s);
  const phone=s.phone||s.sdt||'';
  return `${code} - ${name}${phone?' - '+phone:''}`;
}
function saleCustomerLabel(c){
  const code=c.code||'';
  const name=c.name||'';
  const phone=c.phone||c.sdt||'';
  return `${code?code+' - ':''}${name}${phone?' - '+phone:''}`;
}
function renderSaleAutocompleteOptions(){
  const staffInput=document.getElementById('sStaff');
  const staffCodeInput=document.getElementById('sStaffCode');
  const customerInput=document.getElementById('sCustomer');
  const customerCodeInput=document.getElementById('sCustomerCode');
  if(staffInput && staffCodeInput && !staffInput.value && db.staff && db.staff.length){
    // giữ trống để người dùng chủ động chọn, không tự ép chọn
  }
  if(customerInput && customerCodeInput && !customerInput.value && db.customers && db.customers.length){
    // giữ trống để người dùng chủ động chọn, không tự ép chọn
  }
}
function chooseSaleStaff(code){
  const i=(db.staff||[]).findIndex(s=>String(staffCode(s,0))===String(code) || saleAutoText(staffCode(s,0))===saleAutoText(code));
  let s=(db.staff||[]).find((x,idx)=>String(staffCode(x,idx))===String(code));
  if(!s) s=(db.staff||[]).find((x,idx)=>saleAutoText(staffCode(x,idx))===saleAutoText(code));
  if(!s) return;
  const idx=(db.staff||[]).indexOf(s);
  document.getElementById('sStaff').value=saleStaffLabel(s,idx);
  document.getElementById('sStaffCode').value=staffCode(s,idx);
  const box=document.getElementById('saleStaffResults');
  if(box) box.style.display='none';
}
function chooseSaleCustomer(code){
  let c=(db.customers||[]).find(x=>String(x.code||'')===String(code));
  if(!c) c=(db.customers||[]).find(x=>saleAutoText(x.code||'')===saleAutoText(code));
  if(!c) return;
  document.getElementById('sCustomer').value=saleCustomerLabel(c);
  document.getElementById('sCustomerCode').value=c.code||c.name||'';
  const box=document.getElementById('saleCustomerResults');
  if(box) box.style.display='none';
  renderCart();
}
function searchSaleStaff(){
  const input=document.getElementById('sStaff');
  const box=document.getElementById('saleStaffResults');
  const hidden=document.getElementById('sStaffCode');
  if(!input||!box) return;
  if(hidden && input.value && hidden.value){
    const s=(db.staff||[]).find((x,i)=>String(staffCode(x,i))===String(hidden.value));
    if(s && saleAutoText(input.value)!==saleAutoText(saleStaffLabel(s,(db.staff||[]).indexOf(s)))) hidden.value='';
  }
  const q=saleAutoText(input.value);
  let rs=(db.staff||[]).map((s,i)=>({s,i,code:staffCode(s,i),name:staffName(s),phone:s.phone||s.sdt||''}))
    .filter(x=>!q || saleAutoText(`${x.code} ${x.name} ${x.phone}`).includes(q))
    .slice(0,30);
  box.innerHTML=rs.length?rs.map(x=>`<div class="sale-auto-row" onclick="chooseSaleStaff('${safeAttr(x.code)}')"><div><b>${escapeHtml(x.code)}</b> - ${escapeHtml(x.name||'')}</div><div class="muted">${escapeHtml(x.phone||'')}</div></div>`).join(''):'<div class="sale-auto-empty">Không tìm thấy nhân viên</div>';
  box.style.display='block';
}
function searchSaleCustomer(){
  const input=document.getElementById('sCustomer');
  const box=document.getElementById('saleCustomerResults');
  const hidden=document.getElementById('sCustomerCode');
  if(!input||!box) return;
  if(hidden && input.value && hidden.value){
    const c=(db.customers||[]).find(x=>String(x.code||'')===String(hidden.value));
    if(c && saleAutoText(input.value)!==saleAutoText(saleCustomerLabel(c))) hidden.value='';
  }
  const q=saleAutoText(input.value);
  let rs=(db.customers||[]).map(c=>({c,code:c.code||'',name:c.name||'',phone:c.phone||c.sdt||'',address:c.address||''}))
    .filter(x=>!q || saleAutoText(`${x.code} ${x.name} ${x.phone} ${x.address}`).includes(q))
    .slice(0,30);
  box.innerHTML=rs.length?rs.map(x=>`<div class="sale-auto-row" onclick="chooseSaleCustomer('${safeAttr(x.code||x.name)}')"><div><b>${escapeHtml(x.code||'')}</b> - ${escapeHtml(x.name||'')}<br><span class="muted">${escapeHtml(x.address||'')}</span></div><div class="muted">${escapeHtml(x.phone||'')}</div></div>`).join(''):'<div class="sale-auto-empty">Không tìm thấy khách hàng</div>';
  box.style.display='block';
}
function saleAutoKey(ev,type){
  if(ev.key==='Escape'){
    const box=document.getElementById(type==='staff'?'saleStaffResults':'saleCustomerResults');
    if(box) box.style.display='none';
  }
  if(ev.key==='Enter'){
    ev.preventDefault();
    if(type==='staff'){
      const first=document.querySelector('#saleStaffResults .sale-auto-row');
      if(first) first.click();
    }else{
      const first=document.querySelector('#saleCustomerResults .sale-auto-row');
      if(first) first.click();
    }
  }
}
document.addEventListener('click',function(ev){
  if(!ev.target.closest('.sale-auto-wrap')){
    const a=document.getElementById('saleStaffResults'); if(a) a.style.display='none';
    const b=document.getElementById('saleCustomerResults'); if(b) b.style.display='none';
  }
});
function getSelectedSaleStaff(){
  const hidden=document.getElementById('sStaffCode')?.value||'';
  const raw=document.getElementById('sStaff')?.value||'';
  let s=(db.staff||[]).find((x,i)=>String(staffCode(x,i))===String(hidden));
  if(!s) s=(db.staff||[]).find((x,i)=>saleAutoText(staffCode(x,i))===saleAutoText(raw) || saleAutoText(staffName(x))===saleAutoText(raw) || saleAutoText(saleStaffLabel(x,i))===saleAutoText(raw));
  if(!s) return {code:hidden||raw,name:raw};
  const idx=(db.staff||[]).indexOf(s);
  return {code:staffCode(s,idx),name:staffName(s),display:saleStaffLabel(s,idx)};
}
function getSelectedSaleCustomer(){
  const hidden=document.getElementById('sCustomerCode')?.value||'';
  const raw=document.getElementById('sCustomer')?.value||'';
  let c=(db.customers||[]).find(x=>String(x.code||'')===String(hidden));
  if(!c) c=(db.customers||[]).find(x=>saleAutoText(x.code||'')===saleAutoText(raw) || saleAutoText(x.name||'')===saleAutoText(raw) || saleAutoText(saleCustomerLabel(x))===saleAutoText(raw));
  if(!c) return {code:hidden||raw,name:raw,customerGroup:''};
  return c;
}
function setSaleStaffByCode(code,name){
  const input=document.getElementById('sStaff');
  const hidden=document.getElementById('sStaffCode');
  let s=(db.staff||[]).find((x,i)=>String(staffCode(x,i))===String(code));
  if(!s && name) s=(db.staff||[]).find(x=>saleAutoText(staffName(x))===saleAutoText(name));
  if(s){
    const idx=(db.staff||[]).indexOf(s);
    if(input) input.value=saleStaffLabel(s,idx);
    if(hidden) hidden.value=staffCode(s,idx);
  }else{
    if(input) input.value=name||code||'';
    if(hidden) hidden.value=code||'';
  }
}
function setSaleCustomerByCode(code,name){
  const input=document.getElementById('sCustomer');
  const hidden=document.getElementById('sCustomerCode');
  let c=(db.customers||[]).find(x=>String(x.code||'')===String(code));
  if(!c && name) c=(db.customers||[]).find(x=>saleAutoText(x.name||'')===saleAutoText(name));
  if(c){
    if(input) input.value=saleCustomerLabel(c);
    if(hidden) hidden.value=c.code||c.name||'';
  }else{
    if(input) input.value=name||code||'';
    if(hidden) hidden.value=code||'';
  }
}

function currentSaleCustomer(){
  return getSelectedSaleCustomer();
}
function customerInPromoGroup(customer, groupName){
  groupName=String(groupName||'').trim();
  if(!groupName) return false;
  if(normText(customer?.customerGroup||'')===normText(groupName)) return true;
  const g=(db.customerGroups||[]).find(x=>normText(x.name)===normText(groupName));
  return !!(g && Array.isArray(g.codes) && g.codes.map(String).includes(String(customer?.code||'')));
}
function appliedPromotionsForCart(){
  ensurePromotionArrays();
  const customer=currentSaleCustomer();
  const details=[];
  const lineDiscountBySku={};

  cart.forEach(c=>{
    const sku=String(c.sku||'').trim();
    const base=Number(c.qty||0)*Number(c.sale||0);
    const manualPercent=Number(c.disc||0)||0;
    const promos=(db.productPromotions||[]).filter(k=>String(k.sku||'').trim()===sku && Number(k.discount||0)>0);
    const best=promos.sort((a,b)=>(Number(b.discount)||0)-(Number(a.discount)||0))[0];
    const autoPercent=best ? Number(best.discount||0)||0 : 0;
    const finalPercent=Math.max(manualPercent, autoPercent);
    const amount=base*finalPercent/100;
    lineDiscountBySku[sku]=(lineDiscountBySku[sku]||0)+amount;
    if(best && autoPercent>=manualPercent && autoPercent>0){
      details.push({
        code:best.code||'KMSP',
        type:'product',
        content:best.content||('Chiết khấu sản phẩm '+sku),
        base,
        percent:autoPercent,
        amount,
        sku,
        name:c.name||sku
      });
    }else if(manualPercent>0){
      details.push({
        code:'CKDONG',
        type:'manualLine',
        content:'Chiết khấu dòng '+(c.name||sku),
        base,
        percent:manualPercent,
        amount,
        sku,
        name:c.name||sku
      });
    }
  });

  let extraAmount=0;

  (db.groupPromotions||[]).forEach(k=>{
    const groupName=String(k.groupName||'').trim();
    if(!groupName) return;
    const eligible=cart.filter(c=>productInPromoGroup(c.sku, groupName));
    const base=eligible.reduce((a,c)=>a+Number(c.qty||0)*Number(c.sale||0),0);
    const applyAmount=Number(k.applyAmount||0)||0;
    if(!eligible.length || base<=0 || base<applyAmount) return;
    const percent=Number(k.discountPercent||0)||0;
    const fixed=Number(k.discountAmount||0)||0;
    const amount=base*percent/100+fixed;
    if(amount>0){
      extraAmount+=amount;
      details.push({
        code:k.code||'KMNHOM',
        type:'productGroup',
        content:k.content||groupPromoDescription(k),
        base,
        percent,
        amount,
        groupName
      });
    }
  });

  (db.customerGroupPromotions||[]).forEach(k=>{
    const groupName=String(k.customerGroupName||'').trim();
    if(!customerInPromoGroup(customer, groupName)) return;
    const base=cart.reduce((a,c)=>a+Number(c.qty||0)*Number(c.sale||0),0);
    const applyAmount=Number(k.applyAmount||0)||0;
    if(base<=0 || base<applyAmount) return;
    const percent=Number(k.discountPercent||0)||0;
    const fixed=Number(k.discountAmount||0)||0;
    const amount=base*percent/100+fixed;
    if(amount>0){
      extraAmount+=amount;
      details.push({
        code:k.code||'KMKH',
        type:'customerGroup',
        content:k.content||customerGroupPromoDescription(k),
        base,
        percent,
        amount,
        customerGroupName:groupName
      });
    }
  });

  return {details,lineDiscountBySku,extraAmount};
}
function promoExplanationHtml(details){
  if(!details || !details.length) return '<div class="muted">Chưa áp dụng khuyến mại nào cho đơn này.</div>';
  return '<div style="line-height:1.6">'+details.map(d=>`<div>• <b>${escapeHtml(d.code||'KM')}</b>: ${escapeHtml(d.content||'Khuyến mại')} - Giá trị tính KM ${money(d.base||0)}${Number(d.percent||0)>0?' - CK '+Number(d.percent||0)+'%':''} - Giảm <b>${money(d.amount||0)}</b></div>`).join('')+'</div>';
}

function saleTotals(){
  const promo=appliedPromotionsForCart();
  let goods=cart.reduce((a,b)=>a+b.qty*Number(b.sale||0),0);
  let lineDiscount=Object.values(promo.lineDiscountBySku||{}).reduce((a,b)=>a+Number(b||0),0);
  let promoDiscount=Number(promo.extraAmount||0)||0;
  let discount=lineDiscount+promoDiscount;
  let adjust=Number(document.getElementById('adjustDiscount')?.value||0)||0;
  let cost=cart.reduce((a,b)=>a+b.qty*Number(b.cost||0),0);
  let pay=Math.max(0, goods-discount-adjust);
  return {goods,lineDiscount,promoDiscount,discount,adjust,pay,cost,promoDetails:promo.details||[]};
}
function renderCart(){
  if(!document.getElementById('cartBody'))return;
  const t=saleTotals();
  const lineDiscountBySku={};
  (t.promoDetails||[]).forEach(d=>{
    if(d.sku) lineDiscountBySku[String(d.sku)]=(lineDiscountBySku[String(d.sku)]||0)+Number(d.amount||0);
  });
  cartBody.innerHTML=cart.map((c,i)=>{
    let p=findProduct(c.sku)||{};
    let lineGoods=c.qty*c.sale;
    let d=lineDiscountBySku[String(c.sku)] ?? (lineGoods*(Number(c.disc||0)/100));
    let line=lineGoods-d;
    let warn=c.qty>Number(p.qty||0)?'stock-warn':'';
    return `<tr><td>${i+1}</td><td>${c.sku}</td><td><b>${c.name}</b></td><td class="right">${money(c.sale)}</td><td>${qtyView(c.qty,c.pack)}</td><td class="right">${c.qty}</td><td class="right"><input type="number" value="${c.disc||0}" style="width:82px" onchange="cart[${i}].disc=Number(this.value)||0;renderCart()"></td><td class="right">${money(d)}</td><td class="right"><b>${money(line)}</b></td><td class="${warn}">${qtyView(p.qty||0,c.pack)}</td><td><button class="btn small red" onclick="cart.splice(${i},1);renderCart()">Xóa</button></td></tr>`;
  }).join('')||'<tr><td colspan="11" class="center muted">Chưa có hàng trong đơn</td></tr>';
  if(document.getElementById('sumGoods'))sumGoods.textContent=money(t.goods);
  if(document.getElementById('sumDiscount'))sumDiscount.textContent=money(t.discount);
  if(document.getElementById('sumAdjust'))sumAdjust.textContent=money(t.adjust);
  if(document.getElementById('cartTotal'))cartTotal.textContent=money(t.pay);
  let paid=(Number(document.getElementById('cashPaid')?.value||0)||0)+(Number(document.getElementById('bankPaid')?.value||0)||0);
  if(document.getElementById('sumPaid'))sumPaid.textContent=money(paid);
  if(document.getElementById('sumDebt'))sumDebt.textContent=money(Math.max(0,t.pay-paid));

  let box=document.getElementById('salePromoExplainBox');
  const holder=document.querySelector('.sale-summary');
  if(!box && holder){
    box=document.createElement('div');
    box.id='salePromoExplainBox';
    box.className='sale-setting';
    const before=holder.querySelector('.sale-setting');
    holder.insertBefore(box,before||null);
  }
  if(box){
    box.innerHTML='<b>Diễn giải khuyến mại áp dụng</b>'+promoExplanationHtml(t.promoDetails);
  }
}
async function createOrder(){
  if(!cart.length)return toast('Đơn hàng chưa có hàng');
  if(!sCustomer.value)return toast('Chưa chọn khách hàng');
  if(!sStaff.value)return toast('Chưa chọn nhân viên');

  let oldOrder=editingOrderId?db.orders.find(o=>o.id===editingOrderId):null;
  let affectedMasterId=oldOrder?oldOrder.masterId:'';

  let oldQtyMap={};
  if(oldOrder && Array.isArray(oldOrder.items)){
    oldOrder.items.forEach(it=>{oldQtyMap[it.sku]=(oldQtyMap[it.sku]||0)+Number(it.qty||0);});
  }

  let newQtyMap={};
  cart.forEach(c=>{newQtyMap[c.sku]=(newQtyMap[c.sku]||0)+Number(c.qty||0);});
  for(const sku in newQtyMap){
    let p=findProduct(sku);
    let available=Number(p?.qty||0)+Number(oldQtyMap[sku]||0);
    if(!p||newQtyMap[sku]>available){
      let name=(p&&p.name)||sku;
      return toast('Không đủ tồn kho khi lưu đơn: '+name+' | Có thể xuất '+qtyView(available,p?.pack||1));
    }
  }

  if(oldOrder && Array.isArray(oldOrder.items)){
    oldOrder.items.forEach(it=>{let p=findProduct(it.sku); if(p)p.qty+=Number(it.qty||0);});
  }
  cart.forEach(c=>findProduct(c.sku).qty-=Number(c.qty||0));

  let selectedStaff=getSelectedSaleStaff();let t=saleTotals();
  let selectedCustomer=getSelectedSaleCustomer();
  let selectedCustomerCode=selectedCustomer.code||selectedCustomer.name||'';
  let dOpt=document.getElementById('deliveryStaffSelect')?.selectedOptions?.[0];
  let cash=Number(document.getElementById('cashPaid')?.value||0)||0;
  let bank=Number(document.getElementById('bankPaid')?.value||0)||0;
  let orderData={id:oId?.value||orderId(),date:oDate?.value||today(),isoDate:oDate?.value?new Date(oDate.value+'T12:00:00').toISOString():new Date().toISOString(),customer:selectedCustomer.name||selectedCustomerCode,customerCode:selectedCustomer.code||selectedCustomerCode,staffCode:selectedStaff.code,staffName:selectedStaff.name,staff:selectedStaff.display||selectedStaff.name||selectedStaff.code,warehouse:sWarehouse?.value||'',note:sNote?.value||'',delivery:deliveryStatus?.value||'Giao thành công',xk:xkCode?.value||'',deliveryStaffCode:document.getElementById('deliveryStaffSelect')?.value||'',deliveryStaffName:dOpt?dOpt.dataset.name:'',dueDate:document.getElementById('dueDate')?.value||'',cashPaid:cash,bankPaid:bank,debt:Math.max(0,t.pay-cash-bank),paymentStatus:(t.pay-cash-bank)<=0?'Đã thanh toán':'Còn nợ',goods:t.goods,discount:t.discount,lineDiscount:t.lineDiscount,promoDiscount:t.promoDiscount,promoDetails:t.promoDetails,promoExplanation:(t.promoDetails||[]).map(d=>`${d.code||'KM'}: ${d.content||''} - giảm ${money(d.amount||0)}`).join('\n'),adjust:t.adjust,total:t.pay,cost:t.cost,masterId:oldOrder?oldOrder.masterId:'',items:cart.map(x=>({...x}))};

  if(oldOrder){
    Object.assign(oldOrder,orderData);
    try{
      await apiDeleteOrder(oldOrder.id);
      await apiSaveOrder(orderData);
      API_ONLINE=true;
    }catch(err){
      API_ONLINE=false;
      console.warn(err);
      toast('Đã sửa đơn trên máy, nhưng chưa đồng bộ được API');
    }
    if(affectedMasterId) recalcMasterOrder(affectedMasterId);
    toast('Đã cập nhật đơn '+oldOrder.id+(affectedMasterId?' và đơn tổng '+affectedMasterId:''));
  }else{
    db.orders.push(orderData);
    try{
      await apiSaveOrder(orderData);
      API_ONLINE=true;
    }catch(err){
      API_ONLINE=false;
      console.warn(err);
      toast('Đã lưu đơn trên máy, nhưng chưa đồng bộ được API');
    }
    toast('Đã chốt đơn bán '+orderData.id);
  }
  editingOrderId=null;
  cart=[];save();render();newSaleOrder();
}


function editOrder(id){
  let o=db.orders.find(x=>x.id===id);
  if(!o)return toast('Không tìm thấy đơn hàng');
  page('sale');
  editingOrderId=id;
  cart=(o.items||[]).map(x=>({...x}));
  if(document.getElementById('oId')) oId.value=o.id;
  if(document.getElementById('oDate')){
    let d=orderDateObj(o);
    oDate.value=d&&!isNaN(d)?d.toISOString().slice(0,10):(o.isoDate?String(o.isoDate).slice(0,10):'');
  }
  setSaleCustomerByCode(o.customerCode||'',o.customer||'');
  setSaleStaffByCode(o.staffCode||'',o.staffName||o.staff||'');
  if(document.getElementById('sWarehouse')) sWarehouse.value=o.warehouse||'KHOCHINH';
  if(document.getElementById('sNote')) sNote.value=o.note||'';
  if(document.getElementById('dueDate')) dueDate.value=o.dueDate||'';
  if(document.getElementById('deliveryStatus')) deliveryStatus.value=o.delivery||'Giao thành công';
  if(document.getElementById('xkCode')) xkCode.value=o.xk||'';
  if(document.getElementById('adjustDiscount')) adjustDiscount.value=Number(o.adjust||0);
  if(document.getElementById('deliveryStaffSelect')) deliveryStaffSelect.value=o.deliveryStaffCode||'';
  if(document.getElementById('cashPaid')) cashPaid.value=Number(o.cashPaid||0);
  if(document.getElementById('bankPaid')) bankPaid.value=Number(o.bankPaid||0);
  renderCart();
  toast('Đang chỉnh sửa đơn '+id);
}
async function deleteOrder(id){
  let o=db.orders.find(x=>x.id===id);
  if(!o)return toast('Không tìm thấy đơn hàng');
  if(o.masterId)return toast('Đơn đã gộp đơn tổng, cần hủy gộp trước khi xóa');
  if(!confirm('Xóa đơn '+id+'? Tồn kho của đơn này sẽ được cộng trả lại.'))return;
  (o.items||[]).forEach(it=>{let p=findProduct(it.sku); if(p)p.qty+=Number(it.qty||0);});
  removePaymentsByOrderIds([id]);
  db.orders=db.orders.filter(x=>x.id!==id);
  try{
    await apiDeleteOrder(id);
    API_ONLINE=true;
  }catch(err){
    API_ONLINE=false;
    console.warn(err);
    toast('Đã xóa đơn trên máy, nhưng chưa đồng bộ được API');
  }
  save();render();toast('Đã xóa đơn '+id);
}

function masterOrderId(){return 'GT'+String(Date.now()).slice(-8)}
function orderMergedText(o){return o.masterId?'Đã gộp đơn tổng: '+o.masterId:'Chưa gộp đơn tổng'}
function renderMergeOrders(){
  let rows=filteredMergeOrders().slice().reverse();
  mergeOrderBody.innerHTML=rows.map(o=>`<tr><td class="center"><input type="checkbox" class="merge-check" value="${o.id}"></td><td><b>${o.id}</b></td><td>${o.date}</td><td>${orderCustomerCode(o)||''}</td><td>${o.customer}</td><td>${staffDisplayOrder(o)}</td><td class="right">${money(o.total)}</td><td class="center"><span class="pill">Chưa gộp đơn tổng</span></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Không còn đơn con phù hợp để gộp</td></tr>';
}
function renderMasterOrders(){
  masterOrdersBody.innerHTML=filteredMasterOrders().slice().reverse().map(m=>{let items=m.items||[];let totalQty=items.reduce((a,b)=>a+Number(b.qty||0),0);return `<tr><td><b>${m.id}</b></td><td>${m.date}</td><td class="center">${(m.childIds||[]).length}</td><td class="center">${items.length}</td><td class="right">${totalQty}</td><td class="right">${money(m.total)}</td><td>${deliveryDisplay(m.deliveryStaffCode,m.deliveryStaffName)}</td><td>${m.note||''}</td><td><button class="btn small light" onclick="printMasterOrder('${m.id}')">In PDF</button> <button class="btn small red" onclick="unmergeMasterOrder('${m.id}')">Hủy gộp</button></td></tr>`}).join('')||'<tr><td colspan="9" class="center muted">Chưa có đơn tổng phù hợp</td></tr>';
}
function toggleAllMergeOrders(cb){document.querySelectorAll('.merge-check').forEach(x=>x.checked=cb.checked)}
function createMasterOrder(){
  let ids=[...document.querySelectorAll('.merge-check:checked')].map(x=>x.value);
  if(ids.length<2)return toast('Chọn ít nhất 2 đơn con để gộp đơn tổng');
  let id=(masterId.value||masterOrderId()).trim();
  if((db.masterOrders||[]).some(m=>m.id===id))return toast('Mã đơn tổng đã tồn tại');
  let orders=db.orders.filter(o=>ids.includes(o.id)&&!o.masterId);
  if(orders.length!==ids.length)return toast('Có đơn đã được gộp trước đó, vui lòng làm mới');
  let items=aggregateOrderItems(orders);
  let total=items.reduce((a,b)=>a+Number(b.total||0),0);
  let goods=items.reduce((a,b)=>a+Number(b.goods||0),0);
  let discount=items.reduce((a,b)=>a+Number(b.discount||0),0);
  let cost=orders.reduce((a,o)=>a+Number(o.cost||0),0);
  let mdOpt=document.getElementById('masterDeliveryStaff')?.selectedOptions?.[0];
  let cashPaid=orders.reduce((a,o)=>a+Number(o.cashPaid||0),0);
  let bankPaid=orders.reduce((a,o)=>a+Number(o.bankPaid||0),0);
  let m={id,date:today(),isoDate:new Date().toISOString(),childIds:ids,items,goods,discount,total,cost,cashPaid,bankPaid,debt:Math.max(0,total-cashPaid-bankPaid),deliveryStaffCode:document.getElementById('masterDeliveryStaff')?.value||'',deliveryStaffName:mdOpt?mdOpt.dataset.name:'',note:masterNote.value||''};
  db.masterOrders.push(m);
  db.orders.forEach(o=>{if(ids.includes(o.id)){o.masterId=id; if(m.deliveryStaffCode){o.deliveryStaffCode=m.deliveryStaffCode; o.deliveryStaffName=m.deliveryStaffName;}}});
  masterId.value='';masterNote.value=''; if(document.getElementById('masterDeliveryStaff')) masterDeliveryStaff.value=''; save();render();toast('Đã tạo đơn tổng '+id+' với '+items.length+' mặt hàng');
}
function unmergeMasterOrder(id){
  if(!confirm('Hủy gộp đơn tổng '+id+'? Các đơn con sẽ chuyển về trạng thái chưa gộp.'))return;
  db.orders.forEach(o=>{if(o.masterId===id)o.masterId=''});
  db.masterOrders=db.masterOrders.filter(m=>m.id!==id);
  save();render();toast('Đã hủy gộp '+id);
}


function populateDeliveryStaffSelects(){
  let options='<option value="">-- Chọn NV giao hàng --</option>'+db.deliveryStaff.map((n,i)=>`<option value="${deliveryCode(n,i)}" data-name="${deliveryName(n)}">${deliveryCode(n,i)} - ${deliveryName(n)}</option>`).join('');
  ['deliveryStaffSelect','masterDeliveryStaff'].forEach(id=>{let el=document.getElementById(id); if(el){let old=el.value; el.innerHTML=options; el.value=old;}});
}
let editingDeliveryStaff=null;
function renderDeliveryStaff(){
  if(!document.getElementById('deliveryStaffBody')) return;
  deliveryStaffBody.innerHTML=db.deliveryStaff.map((n,i)=>{const code=deliveryCode(n,i);const user=accountUsernameFromCode(n.username||code);const pass=accountPasswordOf(n);return `<tr><td class="center"><input type="checkbox" class="delivery-delete-check" value="${i}"></td><td>${code}</td><td><b>${deliveryName(n)}</b></td><td>${n.phone||n.sdt||''}</td><td>${accountBadge(user,pass)}<button class="btn small light" onclick="copyAccount('${safeAttr(user)}','${safeAttr(pass)}')">Copy</button></td><td><button class="btn small light" onclick="editDeliveryStaff(${i})">Sửa</button> <button class="btn small red" onclick="delDeliveryStaff(${i})">Xóa</button></td></tr>`}).join('')||'<tr><td colspan="6" class="center muted">Chưa có nhân viên giao hàng</td></tr>';
}
function saveDeliveryStaff(){
  let code=(dCode.value||'').trim()||('GH'+String(Date.now()).slice(-5));
  let name=(dName.value||'').trim();
  if(!name)return toast('Nhập tên nhân viên giao hàng');
  let old=editingDeliveryStaff!==null?db.deliveryStaff[editingDeliveryStaff]:null;
  if(!old) old=(db.deliveryStaff||[]).find((x,i)=>normText(deliveryCode(x,i))===normText(code));
  let data={code,name,phone:(dPhone.value||'').trim(),username:(old&&old.username)||accountUsernameFromCode(code),password:(old&&old.password)||'123456',role:'delivery'};
  if(editingDeliveryStaff!==null) db.deliveryStaff[editingDeliveryStaff]=data; else if(old) Object.assign(old,data); else db.deliveryStaff.push(data);
  upsertUserAccount({username:data.username,password:data.password,role:'delivery',name:data.name,code,deliveryCode:code,phone:data.phone,active:true});
  editingDeliveryStaff=null; dCode.value=''; dName.value=''; dPhone.value=''; save(); render(); toast('Đã lưu nhân viên giao hàng và tài khoản');
}
function editDeliveryStaff(i){let n=db.deliveryStaff[i]; if(!n)return; editingDeliveryStaff=i; dCode.value=deliveryCode(n,i); dName.value=deliveryName(n); dPhone.value=n.phone||n.sdt||'';}
function delDeliveryStaff(i){if(!confirm('Xóa nhân viên giao hàng này?'))return; db.deliveryStaff.splice(i,1); save(); render();}
function bulkDeleteDeliveryStaff(){let ids=[...document.querySelectorAll('.delivery-delete-check:checked')].map(x=>Number(x.value)).sort((a,b)=>b-a); if(!ids.length)return toast('Chưa chọn NVGH để xóa'); if(!confirm('Xóa '+ids.length+' nhân viên giao hàng?'))return; ids.forEach(i=>db.deliveryStaff.splice(i,1)); save(); render();}
function recalcMasterOrder(masterId){
  if(!masterId)return;
  let m=(db.masterOrders||[]).find(x=>x.id===masterId); if(!m)return;
  let orders=db.orders.filter(o=>(m.childIds||[]).includes(o.id));
  let items=aggregateOrderItems(orders);
  m.items=items; m.goods=items.reduce((a,b)=>a+Number(b.goods||0),0); m.discount=items.reduce((a,b)=>a+Number(b.discount||0),0);
  m.total=items.reduce((a,b)=>a+Number(b.total||0),0); m.cost=orders.reduce((a,o)=>a+Number(o.cost||0),0);
  m.cashPaid=orders.reduce((a,o)=>a+Number(o.cashPaid||0),0); m.bankPaid=orders.reduce((a,o)=>a+Number(o.bankPaid||0),0); m.debt=Math.max(0,Number(m.total||0)-Number(m.cashPaid||0)-Number(m.bankPaid||0));
}
function orderAgeDays(o){let d=orderDateObj(o); if(!d)return 0; return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
function debtDueAge(o){
  const d=o.dueDate?new Date(o.dueDate+'T12:00:00'):orderDateObj(o);
  if(!d||isNaN(d))return 0;
  return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));
}

function orderPaymentInfo(o){
  const total=Number(o?.total||0)||0;
  const cash=Number(o?.cashPaid||0)||0;
  const bank=Number(o?.bankPaid||0)||0;
  const paid=cash+bank;
  const debt=total-paid;
  const status=getPaymentStatusText(total,paid,o?.dueDate||'');
  return {total,cash,bank,paid,debt,status};
}
function orderPaymentPillClass(status,debt){
  if(Number(debt)<0) return 'debt-status-overpaid';
  if(Number(debt)===0) return 'debt-status-paid';
  if(status==='Quá hạn') return 'debt-status-unpaid';
  return 'debt-status-unpaid';
}
function removePaymentsByOrderIds(ids){
  const set=new Set((ids||[]).map(x=>String(x)));
  db.payments=(db.payments||[]).filter(p=>!set.has(String(p.orderId||'')));
}
function debtRows(){return (db.orders||[]).map(o=>{let total=Number(o.total||0), cash=Number(o.cashPaid||0), bank=Number(o.bankPaid||0), paid=cash+bank, debt=total-paid; o.debt=debt; o.paymentStatus=getPaymentStatusText(total,paid,o.dueDate||''); return {delivery:orderDeliveryText(o),deliveryCode:orderDeliveryCode(o),orderId:o.id,customerCode:orderCustomerCode(o)||'',customer:o.customer||'',total,cash,bank,paid,debt,status:o.paymentStatus,date:o.date||'',dueDate:o.dueDate||'',age:debtDueAge(o)};});}
function filteredDebtRows(){
  let rows=debtRows();
  let fd=normText(document.getElementById('debtFilterDelivery')?.value||'');
  let fc=normText(document.getElementById('debtFilterCustomerCode')?.value||'');
  let fn=normText(document.getElementById('debtFilterCustomerName')?.value||'');
  let overRaw=(document.getElementById('debtOverDays')?.value||'').trim();
  let overDays=overRaw===''?null:(Number(overRaw)||0);
  return rows.filter(r=>{
    if(fd && !normText((r.delivery||'')+' '+(r.deliveryCode||'')).includes(fd)) return false;
    if(fc && !normText(r.customerCode).includes(fc)) return false;
    if(fn && !normText(r.customer).includes(fn)) return false;
    if(overDays!==null && !(Number(r.debt)>0 && Number(r.age)>=overDays)) return false;
    return true;
  });
}
function debtStatusInfo(r){
  let debt=Number(r.debt)||0;
  if(debt<0) return {text:'Thanh toán dư', pill:'debt-status-overpaid', row:'debt-row-overpaid', money:'debt-money-overpaid', btn:'Sửa thanh toán'};
  if(debt===0) return {text:'Đã thanh toán', pill:'debt-status-paid', row:'debt-row-paid', money:'debt-money-paid', btn:'Sửa thanh toán'};
  return {text:'Còn nợ', pill:'debt-status-unpaid', row:'debt-row-unpaid', money:'debt-money-unpaid', btn:'Thu tiền'};
}
async function payOrderRealtime(orderId, rowIndex){
  let order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
  if(!order)return toast('Không tìm thấy đơn hàng');

  let cash=Number(document.getElementById('debtCash_'+rowIndex)?.value||0)||0;
  let bank=Number(document.getElementById('debtBank_'+rowIndex)?.value||0)||0;

  if(cash<0||bank<0)return toast('Tiền thanh toán không được âm');

  const oldCash=Number(order.cashPaid||0)||0;
  const oldBank=Number(order.bankPaid||0)||0;
  const addCash=cash-oldCash;
  const addBank=bank-oldBank;
  const total=Number(order.total||0)||0;
  order.cashPaid=cash;
  order.bankPaid=bank;
  order.debt=total-cash-bank;
  order.paymentStatus=getPaymentStatusText(total,cash+bank,order.dueDate||'');

  db.payments=db.payments||[];
  if(addCash!==0){
    const receiptId='PT'+Date.now()+'C';
    db.payments.push({id:receiptId,receiptNo:receiptId,orderId,date:new Date().toISOString(),customerCode:orderCustomerCode(order)||'',customerName:order.customer||'',amount:addCash,type:'cash',method:'Tiền mặt',cash:addCash,bank:0,total:addCash,note:'Cập nhật từ màn hình công nợ'});
  }
  if(addBank!==0){
    const receiptId='PT'+Date.now()+'B';
    db.payments.push({id:receiptId,receiptNo:receiptId,orderId,date:new Date().toISOString(),customerCode:orderCustomerCode(order)||'',customerName:order.customer||'',amount:addBank,type:'bank',method:'Chuyển khoản',cash:0,bank:addBank,total:addBank,note:'Cập nhật từ màn hình công nợ'});
  }

  if(order.masterId)recalcMasterOrder(order.masterId);

  localStorage.setItem(KEY,JSON.stringify(normalizeDb(db)));

  try{
    const res=await apiFetch('/api/pay-order',{
      method:'POST',
      headers:authHeaders({'Content-Type':'application/json'}),
      body:JSON.stringify({orderId,cashPaid:cash,bankPaid:bank,dueDate:order.dueDate||'',note:'Cập nhật từ màn hình công nợ'})
    },120000);

    if(!res.ok){
      const detail=await readApiError(res);
      throw new Error(detail);
    }

    const result=await res.json();
    if(result.data){
      db=normalizeDb(result.data);
      localStorage.setItem(KEY,JSON.stringify(db));
    }

    API_ONLINE=true;
    render();
    renderDebtReports();
    toast('Đã cập nhật thanh toán đơn '+orderId);
  }catch(err){
    API_ONLINE=false;
    console.warn(err);
    save();
    render();
    renderDebtReports();
    toast('Đã lưu thanh toán trên máy. Chưa đồng bộ server: '+(err.message||'lỗi không rõ'));
  }
}

function fillPayCustomerFromDebtFilter(){
  const code=document.getElementById('debtFilterCustomerCode')?.value||'';
  const name=document.getElementById('debtFilterCustomerName')?.value||'';
  if(document.getElementById('debtPayCustomerCode')) debtPayCustomerCode.value=code;
  if(document.getElementById('debtPayCustomerName')) debtPayCustomerName.value=name;
  if(!code && !name) toast('Bạn chưa nhập mã hoặc tên khách ở bộ lọc công nợ');
}
function orderReturnAmount(o){
  const orderId=String(o?.id||'');
  const fromLedger=(db.returns||[])
    .filter(r=>String(r.orderId||'')===orderId)
    .reduce((sum,r)=>sum+(Number(r.amount)||0),0);
  if(fromLedger!==0) return Math.max(0,fromLedger);
  return Math.max(0,
    (Number(o?.returnGoodsAmount||0)||0) ||
    (Number(o?.returnedGoodsAmount||0)||0) ||
    (Number(o?.returnAmount||0)||0) ||
    (Number(o?.goodsReturn||0)||0)
  );
}
function addReturnLedger(order, amount, note, source){
  db.returns=Array.isArray(db.returns)?db.returns:[];
  const value=Number(amount)||0;
  if(!order || !order.id || value===0) return null;
  const currentUser=CURRENT_USER||{};
  const item={
    id:'RT-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
    orderId:String(order.id),
    customerCode:String(order.customerCode||''),
    customerName:String(order.customer||order.customerName||''),
    amount:value,
    date:new Date().toISOString(),
    note:note||'Hàng trả về',
    createdBy:currentUser.name||currentUser.username||'',
    createdByRole:currentUser.role||'',
    createdByCode:currentUser.staffCode||currentUser.deliveryCode||'',
    source:source||'driver-return'
  };
  db.returns.push(item);
  syncOrderReturnSummary(order);
  return item;
}
function syncOrderReturnSummary(order){
  if(!order) return;
  const totalReturn=(db.returns||[])
    .filter(r=>String(r.orderId||'')===String(order.id||''))
    .reduce((sum,r)=>sum+(Number(r.amount)||0),0);
  order.returnGoodsAmount=Math.max(0,totalReturn);
  order.returnedGoodsAmount=order.returnGoodsAmount;
  const total=Number(order.total||0)||0;
  const paid=(Number(order.cashPaid||0)||0)+(Number(order.bankPaid||0)||0);
  order.debt=total-paid-order.returnGoodsAmount;
  order.paymentStatus=getPaymentStatusText(total,paid+order.returnGoodsAmount,order.dueDate||'');
  if(order.masterId)recalcMasterOrder(order.masterId);
}
function setOrderReturnAmount(order, desiredAmount, note){
  const desired=Math.max(0,Number(desiredAmount)||0);
  const current=orderReturnAmount(order);
  const delta=desired-current;
  if(delta!==0) addReturnLedger(order,delta,note || 'Điều chỉnh giá trị hàng trả về', 'driver-return-adjustment');
  syncOrderReturnSummary(order);
  return {current,desired,delta,total:orderReturnAmount(order)};
}
function orderDebtRemaining(o){
  const total=Number(o?.total||0)||0;
  const paid=(Number(o?.cashPaid||0)||0)+(Number(o?.bankPaid||0)||0);
  const returned=orderReturnAmount(o);
  return total-paid-returned;
}
function debtPaymentSortDate(o){
  const raw=o.dueDate||o.date||o.isoDate||'';
  const d=raw?new Date(String(raw).length===10?raw+'T12:00:00':raw):null;
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
}
function addPaymentHistoryForOrder(order, amount, type, note){
  if(!amount) return;
  db.payments=db.payments||[];
  const receiptId='PT'+Date.now()+Math.random().toString(16).slice(2,7);
  db.payments.push({
    id:receiptId,
    receiptNo:receiptId,
    orderId:order.id||'',
    date:new Date().toISOString(),
    customerCode:orderCustomerCode(order)||'',
    customerName:order.customer||order.customerName||'',
    amount:Number(amount)||0,
    type:type,
    method:type==='bank'?'Chuyển khoản':'Tiền mặt',
    cash:type==='cash'?Number(amount)||0:0,
    bank:type==='bank'?Number(amount)||0:0,
    total:Number(amount)||0,
    note:note||'Thu công nợ khách hàng',
    collectedByCode: currentUserCode(),
    collectedByName: currentUserDisplayName(),
    collectedByRole: currentRole()
  });
}
function applyCustomerPaymentToOrders(orders, cashAmount, bankAmount, note){
  let cashLeft=Number(cashAmount)||0;
  let bankLeft=Number(bankAmount)||0;
  let paidTotal=0;
  const touchedMasters=new Set();

  orders.forEach(order=>{
    let remain=orderDebtRemaining(order);
    if(remain<=0) return;

    if(cashLeft>0){
      const pay=Math.min(remain,cashLeft);
      order.cashPaid=(Number(order.cashPaid)||0)+pay;
      cashLeft-=pay;
      remain-=pay;
      paidTotal+=pay;
      addPaymentHistoryForOrder(order,pay,'cash',note);
    }

    if(remain>0 && bankLeft>0){
      const pay=Math.min(remain,bankLeft);
      order.bankPaid=(Number(order.bankPaid)||0)+pay;
      bankLeft-=pay;
      remain-=pay;
      paidTotal+=pay;
      addPaymentHistoryForOrder(order,pay,'bank',note);
    }

    const total=Number(order.total||0)||0;
    const paid=(Number(order.cashPaid||0)||0)+(Number(order.bankPaid||0)||0);
    const returned=orderReturnAmount(order);
    order.debt=total-paid-returned;
    order.paymentStatus=getPaymentStatusText(total,paid+returned,order.dueDate||'');
    if(order.masterId) touchedMasters.add(order.masterId);
  });

  touchedMasters.forEach(id=>recalcMasterOrder(id));
  return {paidTotal,cashLeft,bankLeft};
}
function payCustomerDebt(){
  const code=normText(document.getElementById('debtPayCustomerCode')?.value||'');
  const name=normText(document.getElementById('debtPayCustomerName')?.value||'');
  const cash=Number(document.getElementById('debtPayCash')?.value||0)||0;
  const bank=Number(document.getElementById('debtPayBank')?.value||0)||0;
  const note=(document.getElementById('debtPayNote')?.value||'Thu công nợ khách hàng').trim();

  if(!code && !name) return toast('Nhập mã KH hoặc tên khách hàng cần thu tiền');
  if(cash<0 || bank<0) return toast('Số tiền thu không được âm');
  if(cash+bank<=0) return toast('Nhập số tiền cần thu');

  const orders=(db.orders||[]).filter(o=>{
    const c=normText(orderCustomerCode(o)||'');
    const n=normText(o.customer||o.customerName||'');
    if(code && !c.includes(code)) return false;
    if(name && !n.includes(name)) return false;
    return orderDebtRemaining(o)>0;
  }).sort((a,b)=>debtPaymentSortDate(a)-debtPaymentSortDate(b));

  if(!orders.length) return toast('Không tìm thấy đơn còn nợ của khách hàng này');

  const beforeDebt=orders.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
  if(!confirm('Phân bổ '+money(cash+bank)+' vào '+orders.length+' đơn còn nợ của khách này?')) return;

  const result=applyCustomerPaymentToOrders(orders,cash,bank,note);
  save();
  render();
  renderDebtReports();

  if(document.getElementById('debtPayCash')) debtPayCash.value=0;
  if(document.getElementById('debtPayBank')) debtPayBank.value=0;

  const left=result.cashLeft+result.bankLeft;
  let msg='Đã thu '+money(result.paidTotal)+' / công nợ trước thu '+money(beforeDebt);
  if(left>0) msg+=' · Còn dư chưa phân bổ '+money(left);
  toast(msg);
}


function openDebtSearchResults(){
  renderDebtReports();
  const modal=document.getElementById('debtSearchModal');
  if(modal) modal.classList.add('show');
}
function closeDebtSearchModal(){
  const modal=document.getElementById('debtSearchModal');
  if(modal) modal.classList.remove('show');
}

function renderDebtReports(){
  let rows=filteredDebtRows();
  const sum=document.getElementById('debtSearchSummary');
  if(sum){
    const total=rows.reduce((a,b)=>a+Number(b.total||0),0);
    const paid=rows.reduce((a,b)=>a+Number(b.cash||0)+Number(b.bank||0),0);
    const debt=rows.reduce((a,b)=>a+Number(b.debt||0),0);
    sum.textContent=`${rows.length} đơn · Giá trị ${money(total)} · Đã thu ${money(paid)} · Công nợ ${money(debt)}`;
  }

  if(document.getElementById('debtBody')){
    debtBody.innerHTML=rows.map((r,i)=>{
      const st=debtStatusInfo(r);
      return `<tr class="${st.row}">
        <td>${r.delivery||'<span class="muted">Chưa gán GH</span>'}</td>
        <td><b>${r.orderId}</b></td>
        <td>${r.customerCode}</td>
        <td>${r.customer}</td>
        <td class="right">${money(r.total)}</td>
        <td class="right"><input id="debtCash_${i}" type="number" value="${r.cash}" style="width:120px;text-align:right" onkeydown="if(event.key==='Enter')payOrderRealtime('${r.orderId}',${i})"></td>
        <td class="right"><input id="debtBank_${i}" type="number" value="${r.bank}" style="width:120px;text-align:right" onkeydown="if(event.key==='Enter')payOrderRealtime('${r.orderId}',${i})"></td>
        <td class="right"><b class="${st.money}">${money(r.debt)}</b></td>
        <td><span class="pill ${st.pill}">${st.text}</span></td>
        <td>${r.date}</td>
        <td>${r.dueDate||'-'}</td>
        <td class="right">${r.debt>0?r.age+' ngày':'-'}</td>
        <td><button class="btn small ${r.debt>0?'green':'light'}" onclick="payOrderRealtime('${r.orderId}',${i})">${st.btn}</button> <button class="btn small light" onclick="showPaymentHistory('${r.orderId}')">Lịch sử</button></td>
      </tr>`;
    }).join('')||'<tr><td colspan="12" class="center muted">Không có đơn phù hợp</td></tr>';
  }

  let byD={};
  rows.forEach(r=>{
    let k=r.delivery||'Chưa gán GH';
    if(!byD[k])byD[k]={name:k,orders:0,total:0,paid:0,debt:0};
    byD[k].orders++;
    byD[k].total+=r.total;
    byD[k].paid+=r.cash+r.bank;
    byD[k].debt+=r.debt;
  });
  if(document.getElementById('debtDeliveryBody')) debtDeliveryBody.innerHTML=Object.values(byD).sort((a,b)=>b.debt-a.debt).map(r=>`<tr><td>${r.name}</td><td class="center">${r.orders}</td><td class="right">${money(r.total)}</td><td class="right">${money(r.paid)}</td><td class="right"><b class="${r.debt>0?'debt-money-unpaid':'debt-money-paid'}">${money(r.debt)}</b></td></tr>`).join('')||'<tr><td colspan="5" class="center muted">Không có công nợ</td></tr>';

  let byC={};
  rows.forEach(r=>{
    let k=(r.customerCode||'')+'|'+(r.customer||'');
    if(!byC[k])byC[k]={code:r.customerCode,name:r.customer,orders:0,total:0,paid:0,debt:0};
    byC[k].orders++;
    byC[k].total+=r.total;
    byC[k].paid+=r.cash+r.bank;
    byC[k].debt+=r.debt;
  });
  if(document.getElementById('debtCustomerBody')) debtCustomerBody.innerHTML=Object.values(byC).sort((a,b)=>b.debt-a.debt).map(r=>`<tr><td>${r.code}</td><td>${r.name}</td><td class="center">${r.orders}</td><td class="right">${money(r.total)}</td><td class="right">${money(r.paid)}</td><td class="right"><b class="${r.debt>0?'debt-money-unpaid':'debt-money-paid'}">${money(r.debt)}</b></td></tr>`).join('')||'<tr><td colspan="6" class="center muted">Không có công nợ</td></tr>';

  let days=Number(document.getElementById('debtOverDays')?.value||7)||0;
  let oldRows=rows.filter(r=>r.debt>0 && r.age>=days).sort((a,b)=>b.age-a.age);
  if(document.getElementById('debtOldBody')) debtOldBody.innerHTML=oldRows.map(r=>`<tr><td>${r.delivery||'Chưa gán GH'}</td><td><b>${r.orderId}</b></td><td>${r.customerCode}</td><td>${r.customer}</td><td class="right"><b class="debt-money-unpaid">${money(r.debt)}</b></td><td>${r.date}</td><td class="right">${r.age} ngày</td></tr>`).join('')||'<tr><td colspan="7" class="center muted">Không có công nợ quá lâu</td></tr>';
  renderPaymentHistoryAll();
}


function paymentAmount(p){
  if(p.amount!==undefined && p.amount!==null && p.amount!=='') return Number(p.amount)||0;
  return (Number(p.cash)||0)+(Number(p.bank)||0)+(Number(p.total)||0);
}
function paymentDateText(v){
  if(!v)return '';
  const d=new Date(v);
  if(!isNaN(d)) return d.toLocaleDateString('vi-VN');
  return String(v).slice(0,10);
}
function paymentReceiptNo(p){
  return p.receiptNo || p.receiptNumber || p.id || '';
}
function paymentMethodText(p){
  return p.method || (p.type==='bank'?'Chuyển khoản':(p.type==='cash'?'Tiền mặt':(p.type||'Thu tiền')));
}
function escapePrintText(v){
  return String(v??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
}
function printPaymentReceipt(paymentId){
  const p=(db.payments||[]).find(x=>String(x.id)===String(paymentId));
  if(!p) return toast('Không tìm thấy phiếu thu');
  const o=(db.orders||[]).find(x=>String(x.id)===String(p.orderId||''))||{};
  const amount=paymentAmount(p);
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Phiếu thu ${escapePrintText(paymentReceiptNo(p))}</title><style>
    body{font-family:Arial,sans-serif;margin:0;padding:28px;color:#111;font-size:14px} .wrap{max-width:760px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:20px}.company{font-weight:800;font-size:18px}.muted{color:#555}.title{text-align:center;font-size:26px;font-weight:800;margin:22px 0 8px}.sub{text-align:center;margin-bottom:20px}.grid{display:grid;grid-template-columns:170px 1fr;gap:8px 12px;margin:18px 0}.line{border-top:1px dashed #999;margin:18px 0}.amount{font-size:20px;font-weight:800}.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;text-align:center;margin-top:42px}.sign b{display:block;margin-bottom:60px}.note{line-height:1.6}
  

/* ===== V13: Mobile chia màn hình App bán hàng / giao hàng theo từng bước ===== */
@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs{left:6px;right:6px;bottom:6px;border-radius:18px;padding:5px;gap:3px}
  body.mobile-role-app .mobile-app-tabs button{font-size:10px;padding:7px 2px;border-radius:13px;white-space:nowrap}
  body.mobile-role-app .mobile-app-tabs button span{font-size:17px;margin-bottom:1px}
  body.mobile-role-app .section.active{padding:8px 8px 78px!important}
  body.mobile-role-app #salesApp .card.panel,
  body.mobile-role-app #deliveryApp .card.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
  body.mobile-role-app #salesApp .panel-head,
  body.mobile-role-app #deliveryApp .panel-head{position:sticky;top:0;z-index:30;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 10px;box-shadow:0 8px 22px rgba(15,23,42,.08)}
  body.mobile-role-app #salesApp .panel-head h2,
  body.mobile-role-app #deliveryApp .panel-head h2{font-size:20px;line-height:1.2}
  body.mobile-role-app #salesApp .panel-head .toolbar,
  body.mobile-role-app #deliveryApp .panel-head .toolbar{display:none!important}
  body.mobile-role-app .mobile-step-title{display:block;background:#0f172a;color:#fff;border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 10px 26px rgba(15,23,42,.16)}
  body.mobile-role-app .mobile-step-title b{display:block;font-size:20px;margin-bottom:3px}
  body.mobile-role-app .mobile-step-title span{font-size:13px;color:#cbd5e1}
  body.mobile-role-app .mobile-step-actions{display:flex;gap:8px;margin:10px 0;position:sticky;bottom:76px;z-index:25;background:rgba(243,244,246,.92);padding:6px 0;backdrop-filter:blur(10px)}
  body.mobile-role-app .mobile-step-actions .btn{flex:1;font-size:15px;min-height:48px}
  body.mobile-role-app .role-kpi{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 10px!important}
  body.mobile-role-app .role-kpi .mini-card{padding:13px!important;border-radius:18px!important;background:#fff!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
  body.mobile-role-app .role-kpi .mini-card span{font-size:12px!important}
  body.mobile-role-app .role-kpi .mini-card b{font-size:22px!important;line-height:1.25!important}
  body.mobile-role-app .role-list-row{padding:16px!important;border-radius:20px!important;font-size:16px!important}
  body.mobile-role-app .role-list-row b{font-size:17px!important;line-height:1.35!important}
  body.mobile-role-app .role-list-row .muted{font-size:13px!important;line-height:1.5!important}
  body.mobile-role-app input{font-size:17px!important;min-height:50px!important;border-radius:14px!important}
  body.mobile-role-app .btn{font-size:15px!important;min-height:48px!important;border-radius:14px!important}

  /* Sales wizard visibility */
  body.mobile-role-app #salesCustomerPanel,
  body.mobile-role-app #salesOrdersPanel,
  body.mobile-role-app #salesDebtPanel{display:none!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel,
  body.mobile-role-app.sales-step-products #salesCustomerPanel,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel{display:block!important}
  body.mobile-role-app.sales-step-debt #salesDebtPanel{display:block!important}
  body.mobile-role-app.sales-step-orders #salesOrdersPanel{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:nth-child(2){display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:nth-child(2){display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .sales-cart-box{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .sales-cart-box,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-kpi{display:none!important}
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{border:2px solid #16a34a!important;background:#f7fff9!important}

  /* Mobile product cards */
  body.mobile-role-app .sales-product-table{min-width:0!important;width:100%!important;border-collapse:separate!important;border-spacing:0 10px!important}
  body.mobile-role-app .sales-product-table thead{display:none!important}
  body.mobile-role-app .sales-product-table tr{display:block!important;background:transparent!important}
  body.mobile-role-app .sales-product-table td.mobile-product-cell{display:block!important;padding:0!important;border:0!important}
  body.mobile-role-app .mobile-product-card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:15px;box-shadow:0 8px 20px rgba(15,23,42,.06);margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .sku{font-size:13px;color:#64748b;font-weight:800;margin-bottom:6px}
  body.mobile-role-app .mobile-product-card .name{font-size:17px;line-height:1.35;font-weight:800;color:#111827;margin-bottom:10px}
  body.mobile-role-app .mobile-product-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .meta div{background:#f8fafc;border:1px solid #eef2f7;border-radius:15px;padding:10px}
  body.mobile-role-app .mobile-product-card .meta span{display:block;font-size:12px;color:#64748b;margin-bottom:3px}
  body.mobile-role-app .mobile-product-card .meta b{font-size:18px}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  body.mobile-role-app .mobile-product-card .quick-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  body.mobile-role-app .mobile-product-card .quick-grid .btn{min-height:48px!important}
  body.mobile-role-app .mobile-product-card .btn.green{font-size:16px!important;font-weight:900!important}

  /* Cart as full screen card list */
  body.mobile-role-app .sales-cart-box{border-radius:22px!important;padding:14px!important;background:#fff!important;box-shadow:0 8px 22px rgba(15,23,42,.08)!important}
  body.mobile-role-app .cart-item{border-radius:18px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:14px!important;font-size:16px!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
  body.mobile-role-app .sum-line b{font-size:22px!important}

  /* Debt screen: cards instead of table */
  body.mobile-role-app #salesDebtPanel .table-wrap,
  body.mobile-role-app #driverDebtPanel .table-wrap{border:0!important;background:transparent!important;overflow:visible!important}
  body.mobile-role-app #salesDebtPanel table,
  body.mobile-role-app #driverDebtPanel table{display:block!important;min-width:0!important;width:100%!important}
  body.mobile-role-app #salesDebtPanel thead,
  body.mobile-role-app #driverDebtPanel thead{display:none!important}
  body.mobile-role-app #salesDebtPanel tbody,
  body.mobile-role-app #driverDebtPanel tbody{display:block!important}
  body.mobile-role-app #salesDebtPanel tr,
  body.mobile-role-app #driverDebtPanel tr{display:block!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:22px!important;margin-bottom:12px!important;padding:14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important}
  body.mobile-role-app #salesDebtPanel td,
  body.mobile-role-app #driverDebtPanel td{display:block!important;border:0!important;padding:4px 0!important;font-size:15px!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(2) b,
  body.mobile-role-app #driverDebtPanel td:nth-child(2) b{font-size:18px!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(4),
  body.mobile-role-app #driverDebtPanel td:nth-child(4){font-size:24px!important;font-weight:900!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(5) .btn,
  body.mobile-role-app #driverDebtPanel td:nth-child(5) .btn{width:100%;margin-top:8px}

  /* Driver wizard visibility */
  body.mobile-role-app #deliveryApp #driverOrdersPanel,
  body.mobile-role-app #deliveryApp #driverDebtPanel,
  body.mobile-role-app #deliveryApp #driverReportPanel{display:none!important}
  body.mobile-role-app.driver-step-orders #deliveryApp #driverOrdersPanel{display:block!important}
  body.mobile-role-app.driver-step-debt #deliveryApp #driverDebtPanel{display:block!important}
  body.mobile-role-app.driver-step-report #deliveryApp #driverReportPanel{display:block!important}
  body.mobile-role-app .driver-order-card{border-radius:22px!important;padding:16px!important;background:#fff!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;margin-bottom:12px!important}
  body.mobile-role-app .driver-order-card h3{font-size:20px!important;margin-bottom:8px!important}
  body.mobile-role-app .driver-order-card .table-wrap{border:0!important;overflow:visible!important}
  body.mobile-role-app .driver-order-card table{min-width:0!important;width:100%!important;display:block!important}
  body.mobile-role-app .driver-order-card thead{display:none!important}
  body.mobile-role-app .driver-order-card tbody{display:block!important}
  body.mobile-role-app .driver-order-card tr{display:block!important;background:#f8fafc!important;border:1px solid #eef2f7!important;border-radius:16px!important;margin-top:8px!important;padding:10px!important}
  body.mobile-role-app .driver-order-card td{display:block!important;border:0!important;padding:3px 0!important;text-align:left!important;font-size:14px!important}
  body.mobile-role-app .driver-collect-box{padding:12px!important;border-radius:18px!important;background:#f8fafc!important;border:1px solid #e5e7eb!important}
  body.mobile-role-app .driver-collect-box .toolbar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
  body.mobile-role-app .driver-collect-box .btn{width:100%!important}
}


/* ===== Nút thoát cố định cho bản app điện thoại ===== */
.mobile-logout-fixed{display:none}
@media(max-width:780px){
  body.mobile-role-app .mobile-logout-fixed{
    display:flex!important;position:fixed;right:12px;top:12px;z-index:150;
    align-items:center;justify-content:center;gap:6px;
    border:0;border-radius:999px;background:#fee2e2;color:#991b1b;
    padding:10px 13px;font-size:14px;font-weight:900;
    box-shadow:0 10px 24px rgba(153,27,27,.18);
  }
  body:not(.mobile-role-app) .mobile-logout-fixed{display:none!important}
}


@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs button.mobile-logout-tab{display:block!important;background:#fee2e2!important;color:#991b1b!important}
}



/* ===== FIX V2: App bán hàng mobile nhập số lượng không bị thanh dưới che ===== */
@media(max-width:780px){
  body.mobile-role-app .section.active{padding-bottom:190px!important;}
  body.mobile-role-app #salesProductList{padding-bottom:160px!important;}
  body.mobile-role-app .mobile-product-card{position:relative!important;z-index:1!important;margin-bottom:24px!important;padding-bottom:18px!important;}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:200!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;}
  body.mobile-role-app .mobile-product-card input.sales-qty-input{
    display:block!important;width:100%!important;height:54px!important;min-height:54px!important;
    font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;
    border:2px solid #94a3b8!important;border-radius:16px!important;box-shadow:none!important;
    pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;
    position:relative!important;z-index:210!important;opacity:1!important;
  }
  body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
  body.mobile-role-app .mobile-product-card .quick-grid{position:relative!important;z-index:190!important;margin-top:10px!important;}
  body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
  body.mobile-role-app .mobile-cart-float{z-index:118!important;}
}

</style></head><body><div class="wrap">
    <div class="top"><div><div class="company">KHO MINH KHAI THÁI BÌNH</div><div class="muted">Phiếu thu công nợ khách hàng</div></div><div><b>Số phiếu:</b> ${escapePrintText(paymentReceiptNo(p))}<br><b>Ngày:</b> ${escapePrintText(paymentDateText(p.date))}</div></div>
    <div class="title">PHIẾU THU</div><div class="sub">Liên lưu nội bộ / giao khách khi cần</div>
    <div class="grid">
      <b>Khách hàng:</b><span>${escapePrintText(p.customerName||o.customer||'')}</span>
      <b>Mã khách hàng:</b><span>${escapePrintText(p.customerCode||orderCustomerCode(o)||'')}</span>
      <b>Đơn hàng:</b><span>${escapePrintText(p.orderId||'')}</span>
      <b>Hình thức thu:</b><span>${escapePrintText(paymentMethodText(p))}</span>
      <b>Số tiền:</b><span class="amount">${money(amount)}</span>
      <b>Bằng chữ:</b><span>${escapePrintText(numberToVietnameseWords(amount))}</span>
      <b>Nội dung:</b><span class="note">${escapePrintText(p.note||'Thu tiền công nợ')}</span>
    </div>
    <div class="line"></div>
    <div class="grid">
      <b>Tổng đơn:</b><span>${money(o.total||0)}</span>
      <b>Đã thu trên đơn:</b><span>${money((Number(o.cashPaid||0)||0)+(Number(o.bankPaid||0)||0))}</span>
      <b>Còn nợ hiện tại:</b><span>${money(orderDebtRemaining(o))}</span>
    </div>
    <div class="sign"><div><b>Người lập phiếu</b><span>________________</span></div><div><b>Người nộp tiền</b><span>________________</span></div><div><b>Thủ quỹ</b><span>________________</span></div></div>
  </div><script>window.print()<\/script>

</body></html>`;
  const w=window.open('','_blank');
  if(!w) return toast('Trình duyệt đang chặn cửa sổ in phiếu thu');
  w.document.write(html); w.document.close();
}

/* ===== MK PATCH 53: sửa các phần yêu cầu, giữ nguyên logic cũ =====
   1) Giá bán import danh mục sản phẩm ép số nguyên.
   2) Bổ sung nút Thoát cố định cho App bán hàng/App giao hàng mobile.
   3) Ẩn chức năng thu nợ khỏi App nhân viên bán hàng.
   4) Gia cố input số lượng mobile để luôn bật bàn phím số.
   5) App giao hàng thêm Giá trị trả thưởng trưng bày.
   6) Bọc render từng mảng bằng safe-wrapper để lỗi 1 mảng không kéo sập toàn bộ.
   7) Thêm thanh trượt ngang cho các mục/menu/bảng trên màn hình nhỏ. */
(function(){
  'use strict';

  function mkInt(v){
    if(typeof parseImportNumber === 'function'){
      try{ return Math.trunc(Number(parseImportNumber(v)) || 0); }catch(e){}
    }
    let s = String(v == null ? '' : v).trim();
    if(!s) return 0;
    s = s.replace(/[₫đĐ\s]/g,'');
    if(s.includes(',') && s.includes('.')){
      const lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
      if(lastComma>lastDot) s=s.replace(/\./g,'').replace(',', '.');
      else s=s.replace(/,/g,'');
    }else if(s.includes(',')){
      const parts=s.split(',');
      if(parts[parts.length-1].length<=2) s=s.replace(/\./g,'').replace(',', '.');
      else s=s.replace(/,/g,'');
    }else if(s.includes('.')){
      const parts=s.split('.');
      if(parts.length>1 && parts[parts.length-1].length===3) s=s.replace(/\./g,'');
    }
    return Math.trunc(Number(s.replace(/[^0-9.-]/g,'')) || 0);
  }
  window.mkImportInteger = mkInt;

  function mkPick(row, keys){
    if(typeof pickImportValue === 'function') return pickImportValue(row, keys);
    for(const k of keys){ if(Object.prototype.hasOwnProperty.call(row,k)) return row[k]; }
    const norm = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const map={}; Object.keys(row||{}).forEach(k=>map[norm(k)]=row[k]);
    for(const k of keys){ const nk=norm(k); if(Object.prototype.hasOwnProperty.call(map,nk)) return map[nk]; }
    return '';
  }

  // 1) Import danh mục sản phẩm: giá bán luôn là số nguyên, không lưu thập phân.
  window.importProductCatalogExcel = function(ev){
    const file=ev?.target?.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=e=>{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
      let count=0, priceCount=0;
      rows.forEach(r=>{
        const sku=String(mkPick(r,['ma_san_pham','Mã sản phẩm','Mã SP','SKU','sku','Code','Mã hàng','Ma hang'])||'').trim();
        if(!sku) return;
        let p=typeof findProduct==='function'?findProduct(sku):(db.products||[]).find(x=>String(x.sku)===sku);
        const rawSale=mkPick(r,['gia_ban','Giá bán','Gia ban','Giá bán chưa KM','Gia ban chua KM','Đơn giá bán','Don gia ban','Giá','Gia','sale','price']);
        const rawPack=mkPick(r,['quy_cach','Quy cách','Quy cach','pack']);
        const sale=mkInt(rawSale);
        if(String(rawSale ?? '').trim()!=='' && sale>=0) priceCount++;
        const data={
          sku,
          name:String(mkPick(r,['ten_san_pham','Tên sản phẩm','Ten san pham','name','Tên hàng','Ten hang'])||'').trim(),
          pack:mkInt(rawPack)||1,
          sale,
          brand:String(mkPick(r,['nhan_hang','Nhãn hàng','Nhan hang','brand'])||'').trim(),
          category:String(mkPick(r,['nganh_hang','Ngành hàng','Nganh hang','category'])||'').trim(),
          warehouse:String(mkPick(r,['kho_hang_quan_ly','Kho hàng quản lý','Kho hang quan ly','Kho hàng','Kho hang','warehouse'])||'Kho chính').trim()||'Kho chính',
          productGroup:String(mkPick(r,['nhom_san_pham','Nhóm sản phẩm','Nhom san pham','productGroup'])||'').trim()
        };
        db.products=Array.isArray(db.products)?db.products:[];
        if(!p) db.products.push({...data,qty:0,cost:0});
        else Object.assign(p,data);
        count++;
      });
      if(typeof save==='function') save();
      if(typeof render==='function') render();
      if(typeof toast==='function') toast('Đã import '+count+' sản phẩm · giá bán đã làm tròn số nguyên '+priceCount+' dòng');
      ev.target.value='';
    };
    reader.readAsArrayBuffer(file);
  };

  // 2) Nút thoát mobile luôn hiện ở App bán hàng/App giao hàng.
  function ensureMobileLogout(){
    let btn=document.getElementById('mobileLogoutFixed');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button'; btn.id='mobileLogoutFixed'; btn.className='mobile-logout-fixed';
      btn.innerHTML='🚪 Thoát'; btn.onclick=function(){ if(typeof logout==='function') logout(); };
      document.body.appendChild(btn);
    }
    const pageId = typeof currentActivePage==='function' ? currentActivePage() : '';
    const show = window.innerWidth<=780 && document.body.classList.contains('mobile-role-app') && (pageId==='salesApp' || pageId==='deliveryApp');
    btn.style.display = show ? 'flex' : 'none';
  }

  // 3) Bỏ phần thu nợ khỏi App nhân viên bán hàng: chỉ ẩn ở App bán hàng, không xóa module công nợ chính.
  function hideSalesDebtInApp(){
    const panel=document.getElementById('salesDebtPanel');
    if(panel) panel.style.display='none';
    document.querySelectorAll('[data-app-tab="sales-debt"]').forEach(x=>x.style.display='none');
    document.querySelectorAll('#salesApp .customer-pay-box, #salesApp [onclick*="salesCollectDebt"]').forEach(x=>{
      const box=x.closest('.customer-pay-box') || x;
      box.style.display='none';
    });
  }

  // 4) Gia cố input số lượng mobile để hiện bàn phím số và không bị lớp phủ ăn click.
  function hardenSalesQtyInputs(){
    document.querySelectorAll('#salesApp input.sales-qty-input, #salesProductList input[id^="salesBox_"], #salesProductList input[id^="salesEach_"]').forEach(inp=>{
      inp.removeAttribute('readonly'); inp.removeAttribute('disabled');
      inp.type='tel'; inp.inputMode='numeric'; inp.pattern='[0-9]*'; inp.autocomplete='off'; inp.enterKeyHint='done';
      inp.style.pointerEvents='auto'; inp.style.userSelect='text'; inp.style.webkitUserSelect='text'; inp.style.touchAction='manipulation'; inp.style.opacity='1';
    });
  }
  document.addEventListener('touchstart', function(e){
    const inp=e.target.closest && e.target.closest('#salesApp input.sales-qty-input');
    if(inp){ setTimeout(()=>{ try{ inp.focus({preventScroll:true}); }catch(_){ inp.focus(); } }, 0); }
  }, true);
  document.addEventListener('click', function(e){
    const inp=e.target.closest && e.target.closest('#salesApp input.sales-qty-input');
    if(inp){ try{ inp.focus({preventScroll:true}); }catch(_){ inp.focus(); } }
  }, true);

  // 5) Giá trị trả thưởng trưng bày cho App giao hàng.
  function displayRewardAmount(o){
    const orderId=String(o?.id||'');
    const fromLedger=(db.displayRewards||[]).filter(r=>String(r.orderId||'')===orderId).reduce((s,r)=>s+(Number(r.amount)||0),0);
    if(fromLedger!==0) return Math.max(0,fromLedger);
    return Math.max(0, Number(o?.displayRewardAmount||o?.displayReward||o?.displayBonus||0)||0);
  }
  window.orderDisplayRewardAmount=displayRewardAmount;
  window.setOrderDisplayRewardAmount=function(order, desiredAmount, note){
    if(!order || !order.id) return;
    db.displayRewards=Array.isArray(db.displayRewards)?db.displayRewards:[];
    const desired=Math.max(0,Math.trunc(Number(desiredAmount)||0));
    const current=displayRewardAmount(order);
    const delta=desired-current;
    if(delta!==0){
      db.displayRewards.push({
        id:'DR-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
        orderId:String(order.id), customerCode:orderCustomerCode(order)||'', customerName:order.customer||order.customerName||'',
        amount:delta, date:new Date().toISOString(), note:note||'Trả thưởng trưng bày', source:'driver-display-reward'
      });
    }
    order.displayRewardAmount=desired;
    if(order.masterId && typeof recalcMasterOrder==='function') recalcMasterOrder(order.masterId);
  };
  window.driverSaveDisplayReward=function(orderId){
    const order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
    if(!order) return toast('Không tìm thấy đơn');
    const id=cssSafeId(orderId);
    const val=mkInt(document.getElementById('driverDisplayReward_'+id)?.value||0);
    setOrderDisplayRewardAmount(order,val,'Nhân viên giao hàng cập nhật trả thưởng trưng bày');
    if(typeof save==='function') save();
    if(typeof renderDeliveryApp==='function') renderDeliveryApp();
    if(typeof toast==='function') toast('Đã lưu trả thưởng trưng bày '+money(val));
  };

  function augmentDriverDisplayRewards(){
    if(!document.getElementById('deliveryApp')) return;
    const child=(typeof driverDeliveryReportRows==='function'?driverDeliveryReportRows():(db.orders||[])) || [];
    const rewardTotal=child.reduce((a,o)=>a+displayRewardAmount(o),0);

    const kpiBox=document.querySelector('#driverOrdersPanel .role-kpi');
    if(kpiBox && !document.getElementById('driverDisplayRewardTotal')){
      kpiBox.insertAdjacentHTML('beforeend','<div class="mini-card"><span>Trả thưởng trưng bày</span><b id="driverDisplayRewardTotal">0</b></div>');
    }
    const kpi=document.getElementById('driverDisplayRewardTotal'); if(kpi) kpi.textContent=money(rewardTotal);

    const reportGrid=document.querySelector('#driverReportPanel .driver-report-grid');
    if(reportGrid && !document.getElementById('driverReportDisplayReward')){
      reportGrid.insertAdjacentHTML('beforeend','<div class="driver-report-card"><span>Trả thưởng trưng bày</span><b id="driverReportDisplayReward">0</b></div>');
    }
    const reportKpi=document.getElementById('driverReportDisplayReward'); if(reportKpi) reportKpi.textContent=money(rewardTotal);

    // Thêm cột nhập trả thưởng ở danh sách đơn giao.
    document.querySelectorAll('#driverMasterList table').forEach(table=>{
      const head=table.querySelector('thead tr');
      if(head && !head.querySelector('.mk-display-reward-th')){
        const th=document.createElement('th'); th.className='right mk-display-reward-th'; th.textContent='Trả thưởng trưng bày';
        const debtTh=[...head.children].find(x=>String(x.textContent||'').includes('Còn nợ'));
        head.insertBefore(th, debtTh || head.lastElementChild);
      }
      table.querySelectorAll('tbody tr').forEach(tr=>{
        if(tr.querySelector('.mk-display-reward-td')) return;
        const orderId=tr.children[0]?.textContent?.trim();
        const order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
        if(!order) return;
        const td=document.createElement('td'); td.className='right mk-display-reward-td';
        const rid=cssSafeId(order.id);
        td.innerHTML='<input class="driver-return-input" id="driverDisplayReward_'+rid+'" type="number" inputmode="numeric" value="'+displayRewardAmount(order)+'" min="0">';
        const debtTd=[...tr.children].find(x=>x.textContent && x.textContent.includes(money(typeof orderDebtRemaining==='function'?orderDebtRemaining(order):0)));
        tr.insertBefore(td, debtTd || tr.lastElementChild);
        const btnCell=tr.lastElementChild;
        if(btnCell && !btnCell.querySelector('.mk-save-display-reward')){
          btnCell.insertAdjacentHTML('beforeend',' <button class="btn small purple mk-save-display-reward" onclick="driverSaveDisplayReward(\''+safeAttr(order.id)+'\')">Lưu thưởng</button>');
        }
      });
    });

    // Thêm cột báo cáo trả thưởng.
    const reportTable=document.querySelector('#driverReportPanel table');
    if(reportTable){
      const hr=reportTable.querySelector('thead tr');
      if(hr && !hr.querySelector('.mk-report-display-reward-th')){
        const th=document.createElement('th'); th.className='right mk-report-display-reward-th'; th.textContent='Trả thưởng trưng bày';
        const debtTh=[...hr.children].find(x=>String(x.textContent||'').includes('Công nợ'));
        hr.insertBefore(th, debtTh || hr.lastElementChild);
      }
      reportTable.querySelectorAll('tbody tr').forEach(tr=>{
        if(tr.querySelector('.mk-report-display-reward-td')) return;
        const orderId=tr.children[0]?.textContent?.trim();
        const order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
        if(!order) return;
        const td=document.createElement('td'); td.className='right mk-report-display-reward-td'; td.textContent=money(displayRewardAmount(order));
        tr.insertBefore(td, tr.lastElementChild);
      });
    }
  }

  // Gộp lưu hàng trả về + thưởng nếu người dùng bấm nút lưu hàng trả cũ.
  const oldDriverSaveOrderReturn = window.driverSaveOrderReturn;
  if(typeof oldDriverSaveOrderReturn==='function'){
    window.driverSaveOrderReturn=function(orderId){
      const res=oldDriverSaveOrderReturn.apply(this, arguments);
      const input=document.getElementById('driverDisplayReward_'+cssSafeId(orderId));
      const order=(db.orders||[]).find(o=>String(o.id)===String(orderId));
      if(input && order) setOrderDisplayRewardAmount(order, mkInt(input.value||0), 'Cập nhật kèm khi lưu hàng trả');
      if(typeof save==='function') save();
      setTimeout(augmentDriverDisplayRewards,50);
      return res;
    };
  }

  // 6) Chia mảng quản lý theo nhóm + safe wrapper render để 1 lỗi không làm hỏng toàn bộ màn hình.
  window.MK_MODULES = window.MK_MODULES || {
    catalog:['products','productGroups','categoryGroups'],
    stock:['products','receipts'],
    sales:['orders','customers','staff','promotions','returns','payments'],
    delivery:['masterOrders','orders','deliveryStaff','returns','displayRewards'],
    debt:['orders','payments','returns']
  };
  function ensureModuleArrays(){
    Object.values(window.MK_MODULES).flat().forEach(k=>{ if(!Array.isArray(db[k])) db[k]=[]; });
  }
  window.ensureModuleArrays = ensureModuleArrays;
  ['renderSalesApp','renderDeliveryApp','renderProductCatalog','renderPromotions','renderDebtReports'].forEach(fn=>{
    const old=window[fn];
    if(typeof old==='function' && !old.__mkSafeWrapped){
      const wrapped=function(){
        try{ ensureModuleArrays(); return old.apply(this, arguments); }
        catch(err){ console.error('Lỗi mảng '+fn, err); if(typeof toast==='function') toast('Một mảng bị lỗi: '+fn+'. Các phần khác vẫn dùng được.'); }
        finally{ afterUiPatch(); }
      };
      wrapped.__mkSafeWrapped=true;
      window[fn]=wrapped;
    }
  });

  // 7) Thanh trượt ngang cho các mục/menu/bảng.
  function injectCss(){
    if(document.getElementById('mkPatch53Css')) return;
    const st=document.createElement('style'); st.id='mkPatch53Css';
    st.textContent=`
      .nav{max-height:calc(100vh - 220px);overflow-y:auto;scrollbar-width:thin;padding-right:4px;}
      .toolbar,.promo-tabs,.filter-grid{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;}
      .toolbar{flex-wrap:nowrap!important;padding-bottom:4px;}
      .toolbar>*{flex:0 0 auto;}
      .table-wrap{overflow:auto!important;-webkit-overflow-scrolling:touch;}
      @media(max-width:780px){
        body.mobile-role-app .mobile-logout-fixed{display:flex!important;position:fixed!important;right:10px!important;top:10px!important;z-index:9999!important;align-items:center!important;justify-content:center!important;border:0!important;border-radius:999px!important;background:#fee2e2!important;color:#991b1b!important;padding:10px 13px!important;font-size:14px!important;font-weight:900!important;box-shadow:0 10px 24px rgba(153,27,27,.18)!important;}
        body.mobile-role-app #salesDebtPanel{display:none!important;}
        body.mobile-role-app .mobile-app-tabs{overflow-x:auto!important;display:flex!important;white-space:nowrap!important;scrollbar-width:thin!important;}
        body.mobile-role-app .mobile-app-tabs button{min-width:76px!important;flex:0 0 auto!important;}
        body.mobile-role-app .mobile-app-tabs button[data-app-tab="sales-debt"],body.mobile-role-app .mobile-app-tabs button[data-app-tab="sales-confirm"]{display:none!important;}
        body.mobile-role-app #salesApp input.sales-qty-input{pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;position:relative!important;z-index:999!important;}
        body.mobile-role-app #salesApp .qty-stepper,body.mobile-role-app #salesApp .qty-grid{position:relative!important;z-index:998!important;}
        body.mobile-role-app .driver-return-input{max-width:160px!important;min-width:120px!important;}
      }`;
    document.head.appendChild(st);
  }

  function afterUiPatch(){
    injectCss(); ensureModuleArrays(); ensureMobileLogout(); hideSalesDebtInApp(); hardenSalesQtyInputs(); augmentDriverDisplayRewards();
  }

  const oldRenderProductList = window.renderSalesProductList;
  if(typeof oldRenderProductList==='function' && !oldRenderProductList.__mkPatch53){
    window.renderSalesProductList=function(){ const r=oldRenderProductList.apply(this, arguments); hardenSalesQtyInputs(); return r; };
    window.renderSalesProductList.__mkPatch53=true;
  }
  const oldUpdateMobileMode=window.updateMobileAppMode;
  if(typeof oldUpdateMobileMode==='function'){
    window.updateMobileAppMode=function(){ const r=oldUpdateMobileMode.apply(this, arguments); afterUiPatch(); return r; };
  }
  const oldPage=window.page;
  if(typeof oldPage==='function'){
    window.page=function(){ const r=oldPage.apply(this, arguments); setTimeout(afterUiPatch,20); return r; };
  }

  document.addEventListener('DOMContentLoaded', afterUiPatch);
  window.addEventListener('resize', afterUiPatch);
  setInterval(ensureMobileLogout, 1000);
  setTimeout(afterUiPatch, 250);
})();

function showPaymentHistory(orderId){
  const pays=(db.payments||[]).filter(p=>String(p.orderId)===String(orderId));
  const o=(db.orders||[]).find(x=>String(x.id)===String(orderId));
  const html=pays.slice().reverse().map(p=>`<div class="debt-history-row"><b>${paymentDateText(p.date)||''}</b><span>${p.method||p.type||'Thu tiền'} · ${p.note||'Thu tiền'}</span><b class="right">${money(paymentAmount(p))}</b></div>`).join('')||'<div class="muted">Chưa có lịch sử thu tiền riêng cho đơn này.</div>';
  const holder=document.getElementById('debtSearchSummary');
  if(holder){holder.innerHTML=`<b>Lịch sử thu tiền đơn ${orderId}</b><br><span class="muted">Khách: ${o?.customer||''} · Tổng đơn: ${money(o?.total||0)} · Đã thu: ${money((Number(o?.cashPaid||0)||0)+(Number(o?.bankPaid||0)||0))} · Còn nợ: ${money(o?.debt||0)}</span><div class="debt-history-list">${html}</div>`;}
}
function renderPaymentHistoryAll(){
  const body=document.getElementById('paymentHistoryBody');
  if(!body)return;
  const rows=(db.payments||[]).slice().reverse();
  body.innerHTML=rows.map(p=>`<tr><td>${paymentDateText(p.date)}</td><td><b>${p.orderId||''}</b><div class="muted" style="font-size:12px">${paymentReceiptNo(p)||''}</div></td><td>${p.customerCode||''}</td><td>${p.customerName||''}</td><td>${paymentMethodText(p)}</td><td class="right"><b>${money(paymentAmount(p))}</b></td><td>${p.note||''}<div class="muted" style="font-size:12px">Người thu: ${p.collectedByName||''}</div></td><td><button class="btn small light" onclick="printPaymentReceipt('${safeAttr(p.id)}')">In phiếu thu</button></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có lịch sử thu tiền</td></tr>';
}
function clearDebtFilters(){['debtFilterDelivery','debtFilterCustomerCode','debtFilterCustomerName','debtOverDays'].forEach(id=>{let e=document.getElementById(id); if(e)e.value='';}); renderDebtReports();}
function exportDebtReport(){let rows=filteredDebtRows().map(r=>({'Nhân viên giao hàng':r.delivery,'Đơn hàng':r.orderId,'Mã khách hàng':r.customerCode,'Tên khách hàng':r.customer,'Giá trị đơn hàng':r.total,'Tiền mặt thanh toán':r.cash,'Tiền chuyển khoản':r.bank,'Đã thu':r.paid,'Công nợ':r.debt,'Trạng thái':r.status,'Ngày bán':r.date,'Hạn thanh toán':r.dueDate,'Quá hạn ngày':r.age})); if(!rows.length)return toast('Không có dữ liệu công nợ để xuất'); downloadExcel(rows,'bao_cao_cong_no.xlsx');}
function exportPaymentHistory(){let rows=(db.payments||[]).map(p=>({'Số phiếu':paymentReceiptNo(p),'Ngày thu':paymentDateText(p.date),'Đơn hàng':p.orderId||'','Mã khách hàng':p.customerCode||'','Tên khách hàng':p.customerName||'','Hình thức':paymentMethodText(p),'Số tiền':paymentAmount(p),'Ghi chú':p.note||'','Người thu':p.collectedByName||'','Vai trò thu':p.collectedByRole||''})); if(!rows.length)return toast('Chưa có lịch sử thu tiền để xuất'); downloadExcel(rows,'lich_su_thu_tien.xlsx');}


function numberToVietnameseWords(num){
  num=Math.round(Number(num)||0);
  if(num===0) return 'Không đồng';
  const dv=['','nghìn','triệu','tỷ','nghìn tỷ','triệu tỷ'];
  const chu=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
  function doc3(n, full){
    let tram=Math.floor(n/100), chuc=Math.floor((n%100)/10), don=n%10, s=[];
    if(full||tram>0){s.push(chu[tram]+' trăm');}
    if(chuc>1){s.push(chu[chuc]+' mươi'); if(don===1)s.push('mốt'); else if(don===5)s.push('lăm'); else if(don>0)s.push(chu[don]);}
    else if(chuc===1){s.push('mười'); if(don===5)s.push('lăm'); else if(don>0)s.push(chu[don]);}
    else if(don>0){if((full||tram>0))s.push('lẻ'); s.push(chu[don]);}
    return s.join(' ');
  }
  let parts=[], n=num;
  while(n>0){parts.push(n%1000); n=Math.floor(n/1000);}
  let out=[];
  for(let i=parts.length-1;i>=0;i--){
    if(parts[i]!==0){
      out.push(doc3(parts[i], i<parts.length-1));
      if(dv[i]) out.push(dv[i]);
    }
  }
  let text=out.join(' ').replace(/\s+/g,' ').trim();
  return text.charAt(0).toUpperCase()+text.slice(1)+' đồng';
}
function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function invoiceHtmlForOrder(o){
  const VAT_RATE=0.08;
  const moneyInt=(n)=>Math.round(Number(n)||0).toLocaleString('vi-VN',{maximumFractionDigits:0});
  const items=o.items||[];
  const customerObj=(db.customers||[]).find(c=>c.name===o.customer||c.code===o.customer)||{};
  const staffText=staffDisplayOrder(o)||'';
  const orderNo=escapeHtml(o.xk||o.id||'');
  const invoiceNo=escapeHtml(o.id||'');
  const orderTime=escapeHtml(o.date||'');
  const customerLine=escapeHtml((customerObj.code?customerObj.code+' - ':'')+(o.customer||'')+(customerObj.phone?' - '+customerObj.phone:''));
  const addressLine=escapeHtml(customerObj.address||o.note||'');
  const taxCode=escapeHtml(customerObj.tax||'');
  let goods=Number(o.goods||items.reduce((a,it)=>a+Number(it.qty||0)*Number(it.sale||0),0));
  let discount=Number(o.discount||0), adjust=Number(o.adjust||0), pay=Number(o.total||goods-discount-adjust);
  let totalQty=items.reduce((a,it)=>a+Number(it.qty||0),0);
  let beforeKmTotal=items.reduce((a,it)=>a+Number(it.qty||0)*Number(it.sale||0),0);
  let promoTotal=discount+adjust;
  let taxTotal=0;
  const invoicePromoDetails=Array.isArray(o.promoDetails)?o.promoDetails:[];
  function money3(n){ return moneyInt(n); }
  function lineBase(it){
    return Number(it.qty||0)*Number(it.sale||0);
  }
  function detailAppliesToItem(d,it){
    if(d && d.sku) return String(d.sku)===String(it.sku);
    if(d && d.groupName) return productInPromoGroup(String(it.sku||''), String(d.groupName||''));
    return true;
  }
  function linePromoAmount(it){
    const qty=Number(it.qty||0);
    const base=lineBase(it);
    if(qty<=0 || base<=0) return 0;

    if(invoicePromoDetails.length){
      return invoicePromoDetails.reduce((sum,d)=>{
        const amount=Number(d.amount||0)||0;
        if(amount<=0) return sum;

        if(d.sku){
          return String(d.sku)===String(it.sku) ? sum+amount : sum;
        }

        const eligible=items.filter(x=>detailAppliesToItem(d,x));
        const totalBase=eligible.reduce((a,x)=>a+lineBase(x),0);
        if(!eligible.includes(it) || totalBase<=0) return sum;
        return sum + amount*base/totalBase;
      },0);
    }

    return base*(Number(it.disc||0)/100);
  }
  function unitAfterDiscount(it){
    const qty=Number(it.qty||0);
    const priceSell=Number(it.sale||0);
    const unitPromo=qty>0 ? linePromoAmount(it)/qty : 0;
    return Math.max(0, priceSell-unitPromo);
  }
  function mainRows(){
    let body=items.map((it,i)=>{
      let qty=Number(it.qty||0);
      let priceSell=Number(it.sale||0);          // Cột 4: giá bán của sản phẩm
      let beforeTaxKm=priceSell/(1+VAT_RATE);    // Cột 3 = cột 4 / 1.08
      let promoPerUnit=qty>0 ? linePromoAmount(it)/qty : 0;
      let afterKmCk=Math.max(0, priceSell-promoPerUnit); // Cột 5 = cột 4 - khuyến mại
      let taxValue=(afterKmCk*qty)*VAT_RATE/(1+VAT_RATE); // Cột 6: tiền thuế, 3 số thập phân
      let amount=afterKmCk*qty;
      taxTotal+=taxValue;
      return `<tr>
        <td class="c">${i+1}</td>
        <td class="c">${escapeHtml(it.sku)}</td>
        <td class="prod">${escapeHtml(it.name)}</td>
        <td class="c">${escapeHtml(qtyView(qty,it.pack))}</td>
        <td class="r">${moneyInt(qty)}</td>
        <td class="r">${moneyInt(beforeTaxKm)}</td>
        <td class="r">${moneyInt(priceSell)}</td>
        <td class="r">${moneyInt(afterKmCk)}</td>
        <td class="r">${money3(taxValue)}</td>
        <td class="r b">${moneyInt(amount)}</td>
      </tr>`;
    }).join('');
    return body || '<tr><td colspan="10" class="c">Không có hàng</td></tr>';
  }
  const rows = mainRows();
  const totalAfterKm = items.reduce((a,it)=>a+Number(it.qty||0)*unitAfterDiscount(it),0);
  const nppDiscount = Number(o.nppDiscount||o.nppDiscountAmount||o.nppCk||o.nppCK||0);
  const hasNppDiscount = nppDiscount > 0;
  const kmRate = beforeKmTotal ? ((promoTotal+(hasNppDiscount?nppDiscount:0))/beforeKmTotal*100) : 0;
  function promoRows(){
    let savedDetails=Array.isArray(o.promoDetails)?o.promoDetails:[];
    if(savedDetails.length){
      let rows=savedDetails.map((d,i)=>{
        let amount=Number(d.amount||0)||0;
        let base=Number(d.base||0)||0;
        let percent=Number(d.percent||0)||0;
        return `<tr>
          <td class="c">${escapeHtml(d.code||('KM'+String(i+1).padStart(3,'0')))}</td>
          <td>${escapeHtml(d.content||'Khuyến mại')}</td>
          <td class="r">${moneyInt(base)}</td>
          <td class="c">${percent?String(percent.toFixed(2)).replace('.',','):''}</td>
          <td class="r">${moneyInt(amount/(1+VAT_RATE))}</td>
          <td class="r">${moneyInt(amount)}</td>
        </tr>`;
      }).join('');
      if(adjust>0){
        rows += `<tr><td class="c">CKHC</td><td>Chiết khấu hiệu chỉnh trên đơn hàng</td><td class="r">${moneyInt(beforeKmTotal)}</td><td class="c"></td><td class="r">${moneyInt(adjust/(1+VAT_RATE))}</td><td class="r">${moneyInt(adjust)}</td></tr>`;
      }
      return rows;
    }
    let rows=items.filter(it=>Number(it.disc||0)>0).map((it,i)=>{
      let base=Number(it.qty||0)*Number(it.sale||0);
      let ckBefore=base*(Number(it.disc||0)/100)/(1+VAT_RATE);
      let ckAfter=base*(Number(it.disc||0)/100);
      return `<tr>
        <td class="c">CK${String(i+1).padStart(3,'0')}</td>
        <td>Chiết khấu ${Number(it.disc||0).toFixed(2)}% cho mặt hàng ${escapeHtml(it.name)}</td>
        <td class="r">${moneyInt(base)}</td>
        <td class="c">${Number(it.disc||0).toFixed(2).replace('.',',')}</td>
        <td class="r">${moneyInt(ckBefore)}</td>
        <td class="r">${moneyInt(ckAfter)}</td>
      </tr>`;
    }).join('');
    if(adjust>0){
      rows += `<tr><td class="c">CKHC</td><td>Chiết khấu hiệu chỉnh trên đơn hàng</td><td class="r">${moneyInt(beforeKmTotal)}</td><td class="c"></td><td class="r">${moneyInt(adjust/(1+VAT_RATE))}</td><td class="r">${moneyInt(adjust)}</td></tr>`;
    }
    return rows || '<tr><td colspan="6" class="c">Không có chi tiết khuyến mãi</td></tr>';
  }
  function pageHtml(copyLabel){
    return `<div class="invoice-page">
      <div class="inv-head">
        <div></div>
        <div class="inv-title">PHIẾU GIAO NHẬN VÀ THANH TOÁN</div>
        <div class="inv-copy"><div>Số xe tải:</div><div class="copy-line">(${copyLabel}) &nbsp;&nbsp;&nbsp;&nbsp; Trang: 1 / 1</div></div>
      </div>

      <div class="inv-info">
        <div class="info-left">
          <p><b>Số hóa đơn:</b> ${invoiceNo}</p>
          <p><b>Số đơn hàng:</b> ${orderNo}</p>
          <p><b>NVBH:</b> ${escapeHtml(staffText)}</p>
          <p><b>Khách hàng - Điện thoại:</b> ${customerLine}</p>
          <p><b>Địa chỉ giao hàng:</b> ${addressLine}</p>
          <p><b>Điều khoản thanh toán:</b> đáo hạn trong 7 ngày</p>
          <p><b>MST:</b> ${taxCode}</p>
        </div>
        <div class="info-mid">
          <p><b>Loại hóa đơn:</b> Từ NVTT</p>
        </div>
        <div class="info-right">
          <p><b>Thời gian đặt hàng:</b> ${orderTime}</p>
          <p><b>Nhà phân phối:</b> 3293 - Công Ty TNHH MTV Minh Khai</p>
          <p><b>Địa chỉ:</b> Cầu Cánh Sẻ,Quang Bình TỈNH THÁI BÌNH</p>
          <p><b>Điện thoại:</b> 0396198753</p>
        </div>
      </div>

      <table class="main-inv-table">
        <colgroup>
          <col style="width:3.8%"><col style="width:7.7%"><col style="width:37%"><col style="width:6.4%"><col style="width:5.7%"><col style="width:8.7%"><col style="width:9.6%"><col style="width:8.6%"><col style="width:8%"><col style="width:10.5%">
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2">STT</th>
            <th rowspan="2">Mã hàng</th>
            <th rowspan="2">Tên sản phẩm</th>
            <th>Số lượng<br>(CS/SU)</th>
            <th>Số<br>lượng<br>(lẻ)</th>
            <th>Đơn Giá<br>(Trước<br>Thuế/KM)</th>
            <th>Đơn Giá (Sau<br>Thuế, Trước<br>KM)</th>
            <th>Đơn giá<br>(Sau<br>Thuế/KM&CK)</th>
            <th>Thuế<br>GTGT</th>
            <th>Thành tiền<br>(Sau Thuế/<br>KM&CK)</th>
          </tr>
          <tr class="code-row"><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th></tr>
          <tr class="code-row"><th></th><th></th><th>A</th><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row"><td></td><td></td><td class="c b">Tổng cộng (A)</td><td></td><td class="r b">${moneyInt(totalQty)}</td><td></td><td></td><td></td><td></td><td class="r b">${moneyInt(pay)}</td></tr>
        </tbody>
      </table>

      <div class="inv-summary">
        <div class="amount-words"><b>Số tiền viết bằng chữ :</b> ${numberToVietnameseWords(pay)}</div>
        <div class="calc-box">
          <div class="pay-row"><span><b>Số tiền phải thanh toán (A7-D-E-H)</b></span><b>${moneyInt(pay)}</b></div>
          <div><span>Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</span><span>${moneyInt(beforeKmTotal)}</span></div>
          <div><span>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</span><span>${moneyInt(promoTotal)}</span></div>
          <div><span>Cấn trừ tiền (D+E+H):</span><span>${moneyInt(adjust)}</span></div>
          ${hasNppDiscount ? `<div><span>Tổng tiền CK của NPP (F)=(G-C)* 2,00% :</span><span>${moneyInt(nppDiscount)}</span></div>` : ''}
          <div><span>${hasNppDiscount ? 'Tỉ lệ KM & CK của đơn hàng [(B+C+F)/G]*100%:' : 'Tỉ lệ KM của đơn hàng [(B+C)/G]*100%:'}</span><span>${kmRate.toFixed(2).replace('.',',')}%</span></div>
        </div>
      </div>

      <div class="sign-row">
        <div>Người lập biểu<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Người bán hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Nhân viên giao hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Người nhận hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
      </div>

      <div class="promo-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>
      <table class="promo-table">
        <colgroup><col style="width:15%"><col style="width:46%"><col style="width:10%"><col style="width:9%"><col style="width:10%"><col style="width:10%"></colgroup>
        <thead><tr><th>Mã CTKM Tiền</th><th>Khuyến mãi bằng tiền</th><th>Giá trị hàng<br>hóa mua</th><th>% chiết<br>khấu</th><th>Tiền CK trước<br>thuế</th><th>Tiền CK sau<br>thuế</th></tr></thead>
        <tbody>${promoRows()}</tbody>
        <tfoot><tr><td colspan="5" class="c b">Tổng giá trị khuyến mãi tiền (C)</td><td class="r b">${moneyInt(promoTotal)}</td></tr></tfoot>
      </table>
      <div class="promo-explain"><b>Diễn giải khuyến mại:</b><br>${promoExplanationHtml(Array.isArray(o.promoDetails)?o.promoDetails:[])}</div>
    </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Phiếu giao nhận ${invoiceNo}</title><style>
    @page{size:A4 portrait;margin:6mm 6mm 6mm 6mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;background:#fff;font-size:9.6px;line-height:1.18}
    .print-btn{position:fixed;top:8px;right:8px;z-index:9;background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:700}
    .invoice-page{width:198mm;min-height:285mm;margin:0 auto;page-break-after:always;padding:0 0 2mm 0;background:#fff}
    .invoice-page:last-child{page-break-after:auto}
    .inv-head{display:grid;grid-template-columns:33% 34% 33%;align-items:start;margin:0 0 3mm 0;height:11mm}
    .inv-title{text-align:center;font-size:11.5px;font-weight:800;text-transform:uppercase;padding-top:2.2mm;letter-spacing:.1px}
    .inv-copy{text-align:right;font-weight:700;font-size:9.8px;line-height:1.25}.copy-line{margin-top:2.2mm}
    .inv-info{display:grid;grid-template-columns:33% 21% 46%;gap:0;margin-bottom:18mm;min-height:38mm}
    .inv-info p{margin:0 0 2.1mm 0;white-space:normal}.info-left{padding-left:0}.info-mid{text-align:left;padding-top:12.5mm}.info-right{padding-left:2mm;padding-top:12.5mm}
    table{width:100%;border-collapse:collapse;table-layout:fixed}.main-inv-table{margin-top:0;border:1px solid #111}
    th,td{border:1px solid #111;padding:2.1px 3px;vertical-align:middle;word-wrap:break-word}
    th{font-weight:800;text-align:center}.main-inv-table th{font-size:9.3px;line-height:1.12}.main-inv-table td{font-size:9.6px;line-height:1.13}
    .main-inv-table tbody tr:not(.total-row) td{border-top:1px dotted #777;border-bottom:1px dotted #777}
    .main-inv-table tbody tr:first-child td{border-top:1px solid #111}.main-inv-table tbody tr.total-row td{border-top:1px solid #111;border-bottom:1px solid #111;font-weight:800}
    .code-row th{font-size:9.2px;padding:1.8px}.prod{font-size:9.5px}.c{text-align:center}.r{text-align:right}.b{font-weight:800}.total-row td{font-weight:800}
    .inv-summary{display:grid;grid-template-columns:48% 52%;margin-top:1mm}.amount-words{padding:10.5mm 3mm 0 1.5mm;line-height:1.2}.calc-box{font-size:9.8px}.calc-box div{display:grid;grid-template-columns:72% 28%;gap:2mm;padding:2.05mm 0}.calc-box div span:last-child,.calc-box div b:last-child{text-align:right}.pay-row{font-size:11.5px}.pay-row b:last-child{font-size:14px}
    .sign-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111;margin-top:3.8mm;height:22mm}.sign-row div{text-align:center;font-weight:800;border-right:1px solid #111;padding-top:1.4mm}.sign-row div:last-child{border-right:0}.sign-row span{font-weight:700}
    .promo-title{font-weight:800;text-decoration:underline;margin:8mm 0 3mm .6mm}.promo-table{border:1px solid #111}.promo-table th{font-size:9.6px;line-height:1.12}.promo-table td{font-size:9.2px;line-height:1.13;padding:2.6px 3px}.promo-table tfoot td{font-size:9.6px;border-top:1px solid #111}.promo-explain{display:none}
    @media print{.print-btn{display:none}.invoice-page{min-height:auto;margin:0;width:198mm}}
  

/* ===== V13: Mobile chia màn hình App bán hàng / giao hàng theo từng bước ===== */
@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs{left:6px;right:6px;bottom:6px;border-radius:18px;padding:5px;gap:3px}
  body.mobile-role-app .mobile-app-tabs button{font-size:10px;padding:7px 2px;border-radius:13px;white-space:nowrap}
  body.mobile-role-app .mobile-app-tabs button span{font-size:17px;margin-bottom:1px}
  body.mobile-role-app .section.active{padding:8px 8px 78px!important}
  body.mobile-role-app #salesApp .card.panel,
  body.mobile-role-app #deliveryApp .card.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
  body.mobile-role-app #salesApp .panel-head,
  body.mobile-role-app #deliveryApp .panel-head{position:sticky;top:0;z-index:30;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 10px;box-shadow:0 8px 22px rgba(15,23,42,.08)}
  body.mobile-role-app #salesApp .panel-head h2,
  body.mobile-role-app #deliveryApp .panel-head h2{font-size:20px;line-height:1.2}
  body.mobile-role-app #salesApp .panel-head .toolbar,
  body.mobile-role-app #deliveryApp .panel-head .toolbar{display:none!important}
  body.mobile-role-app .mobile-step-title{display:block;background:#0f172a;color:#fff;border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 10px 26px rgba(15,23,42,.16)}
  body.mobile-role-app .mobile-step-title b{display:block;font-size:20px;margin-bottom:3px}
  body.mobile-role-app .mobile-step-title span{font-size:13px;color:#cbd5e1}
  body.mobile-role-app .mobile-step-actions{display:flex;gap:8px;margin:10px 0;position:sticky;bottom:76px;z-index:25;background:rgba(243,244,246,.92);padding:6px 0;backdrop-filter:blur(10px)}
  body.mobile-role-app .mobile-step-actions .btn{flex:1;font-size:15px;min-height:48px}
  body.mobile-role-app .role-kpi{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 10px!important}
  body.mobile-role-app .role-kpi .mini-card{padding:13px!important;border-radius:18px!important;background:#fff!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
  body.mobile-role-app .role-kpi .mini-card span{font-size:12px!important}
  body.mobile-role-app .role-kpi .mini-card b{font-size:22px!important;line-height:1.25!important}
  body.mobile-role-app .role-list-row{padding:16px!important;border-radius:20px!important;font-size:16px!important}
  body.mobile-role-app .role-list-row b{font-size:17px!important;line-height:1.35!important}
  body.mobile-role-app .role-list-row .muted{font-size:13px!important;line-height:1.5!important}
  body.mobile-role-app input{font-size:17px!important;min-height:50px!important;border-radius:14px!important}
  body.mobile-role-app .btn{font-size:15px!important;min-height:48px!important;border-radius:14px!important}

  /* Sales wizard visibility */
  body.mobile-role-app #salesCustomerPanel,
  body.mobile-role-app #salesOrdersPanel,
  body.mobile-role-app #salesDebtPanel{display:none!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel,
  body.mobile-role-app.sales-step-products #salesCustomerPanel,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel{display:block!important}
  body.mobile-role-app.sales-step-debt #salesDebtPanel{display:block!important}
  body.mobile-role-app.sales-step-orders #salesOrdersPanel{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:nth-child(2){display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:nth-child(2){display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .sales-cart-box{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .sales-cart-box,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-kpi{display:none!important}
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{border:2px solid #16a34a!important;background:#f7fff9!important}

  /* Mobile product cards */
  body.mobile-role-app .sales-product-table{min-width:0!important;width:100%!important;border-collapse:separate!important;border-spacing:0 10px!important}
  body.mobile-role-app .sales-product-table thead{display:none!important}
  body.mobile-role-app .sales-product-table tr{display:block!important;background:transparent!important}
  body.mobile-role-app .sales-product-table td.mobile-product-cell{display:block!important;padding:0!important;border:0!important}
  body.mobile-role-app .mobile-product-card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:15px;box-shadow:0 8px 20px rgba(15,23,42,.06);margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .sku{font-size:13px;color:#64748b;font-weight:800;margin-bottom:6px}
  body.mobile-role-app .mobile-product-card .name{font-size:17px;line-height:1.35;font-weight:800;color:#111827;margin-bottom:10px}
  body.mobile-role-app .mobile-product-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .meta div{background:#f8fafc;border:1px solid #eef2f7;border-radius:15px;padding:10px}
  body.mobile-role-app .mobile-product-card .meta span{display:block;font-size:12px;color:#64748b;margin-bottom:3px}
  body.mobile-role-app .mobile-product-card .meta b{font-size:18px}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  body.mobile-role-app .mobile-product-card .quick-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  body.mobile-role-app .mobile-product-card .quick-grid .btn{min-height:48px!important}
  body.mobile-role-app .mobile-product-card .btn.green{font-size:16px!important;font-weight:900!important}

  /* Cart as full screen card list */
  body.mobile-role-app .sales-cart-box{border-radius:22px!important;padding:14px!important;background:#fff!important;box-shadow:0 8px 22px rgba(15,23,42,.08)!important}
  body.mobile-role-app .cart-item{border-radius:18px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:14px!important;font-size:16px!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
  body.mobile-role-app .sum-line b{font-size:22px!important}

  /* Debt screen: cards instead of table */
  body.mobile-role-app #salesDebtPanel .table-wrap,
  body.mobile-role-app #driverDebtPanel .table-wrap{border:0!important;background:transparent!important;overflow:visible!important}
  body.mobile-role-app #salesDebtPanel table,
  body.mobile-role-app #driverDebtPanel table{display:block!important;min-width:0!important;width:100%!important}
  body.mobile-role-app #salesDebtPanel thead,
  body.mobile-role-app #driverDebtPanel thead{display:none!important}
  body.mobile-role-app #salesDebtPanel tbody,
  body.mobile-role-app #driverDebtPanel tbody{display:block!important}
  body.mobile-role-app #salesDebtPanel tr,
  body.mobile-role-app #driverDebtPanel tr{display:block!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:22px!important;margin-bottom:12px!important;padding:14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important}
  body.mobile-role-app #salesDebtPanel td,
  body.mobile-role-app #driverDebtPanel td{display:block!important;border:0!important;padding:4px 0!important;font-size:15px!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(2) b,
  body.mobile-role-app #driverDebtPanel td:nth-child(2) b{font-size:18px!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(4),
  body.mobile-role-app #driverDebtPanel td:nth-child(4){font-size:24px!important;font-weight:900!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(5) .btn,
  body.mobile-role-app #driverDebtPanel td:nth-child(5) .btn{width:100%;margin-top:8px}

  /* Driver wizard visibility */
  body.mobile-role-app #deliveryApp #driverOrdersPanel,
  body.mobile-role-app #deliveryApp #driverDebtPanel,
  body.mobile-role-app #deliveryApp #driverReportPanel{display:none!important}
  body.mobile-role-app.driver-step-orders #deliveryApp #driverOrdersPanel{display:block!important}
  body.mobile-role-app.driver-step-debt #deliveryApp #driverDebtPanel{display:block!important}
  body.mobile-role-app.driver-step-report #deliveryApp #driverReportPanel{display:block!important}
  body.mobile-role-app .driver-order-card{border-radius:22px!important;padding:16px!important;background:#fff!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;margin-bottom:12px!important}
  body.mobile-role-app .driver-order-card h3{font-size:20px!important;margin-bottom:8px!important}
  body.mobile-role-app .driver-order-card .table-wrap{border:0!important;overflow:visible!important}
  body.mobile-role-app .driver-order-card table{min-width:0!important;width:100%!important;display:block!important}
  body.mobile-role-app .driver-order-card thead{display:none!important}
  body.mobile-role-app .driver-order-card tbody{display:block!important}
  body.mobile-role-app .driver-order-card tr{display:block!important;background:#f8fafc!important;border:1px solid #eef2f7!important;border-radius:16px!important;margin-top:8px!important;padding:10px!important}
  body.mobile-role-app .driver-order-card td{display:block!important;border:0!important;padding:3px 0!important;text-align:left!important;font-size:14px!important}
  body.mobile-role-app .driver-collect-box{padding:12px!important;border-radius:18px!important;background:#f8fafc!important;border:1px solid #e5e7eb!important}
  body.mobile-role-app .driver-collect-box .toolbar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
  body.mobile-role-app .driver-collect-box .btn{width:100%!important}
}


/* ===== Nút thoát cố định cho bản app điện thoại ===== */
.mobile-logout-fixed{display:none}
@media(max-width:780px){
  body.mobile-role-app .mobile-logout-fixed{
    display:flex!important;position:fixed;right:12px;top:12px;z-index:150;
    align-items:center;justify-content:center;gap:6px;
    border:0;border-radius:999px;background:#fee2e2;color:#991b1b;
    padding:10px 13px;font-size:14px;font-weight:900;
    box-shadow:0 10px 24px rgba(153,27,27,.18);
  }
  body:not(.mobile-role-app) .mobile-logout-fixed{display:none!important}
}


@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs button.mobile-logout-tab{display:block!important;background:#fee2e2!important;color:#991b1b!important}
}



/* ===== FIX V2: App bán hàng mobile nhập số lượng không bị thanh dưới che ===== */
@media(max-width:780px){
  body.mobile-role-app .section.active{padding-bottom:190px!important;}
  body.mobile-role-app #salesProductList{padding-bottom:160px!important;}
  body.mobile-role-app .mobile-product-card{position:relative!important;z-index:1!important;margin-bottom:24px!important;padding-bottom:18px!important;}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:200!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;}
  body.mobile-role-app .mobile-product-card input.sales-qty-input{
    display:block!important;width:100%!important;height:54px!important;min-height:54px!important;
    font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;
    border:2px solid #94a3b8!important;border-radius:16px!important;box-shadow:none!important;
    pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;
    position:relative!important;z-index:210!important;opacity:1!important;
  }
  body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
  body.mobile-role-app .mobile-product-card .quick-grid{position:relative!important;z-index:190!important;margin-top:10px!important;}
  body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
  body.mobile-role-app .mobile-cart-float{z-index:118!important;}
}

</style></head><body><button class="print-btn" onclick="window.print()">In / Lưu PDF</button>${pageHtml('Liên 1')}${pageHtml('Liên 2')}<script>window.onload=function(){setTimeout(()=>window.print(),350)}<\/script></body></html>`;
}

function printInvoice(id){let o=db.orders.find(x=>x.id===id);if(!o)return toast('Không tìm thấy đơn hàng');let w=window.open('','_blank');w.document.open();w.document.write(invoiceHtmlForOrder(o));w.document.close();}

function toggleAllPrintOrders(cb){
  document.querySelectorAll('.print-order-check').forEach(x=>x.checked=cb.checked);
}
function getInvoicePagesOnly(html){
  let bodyMatch=html.match(/<body[^>]*>([\s\S]*?)<script>window\.onload/);
  if(!bodyMatch)return '';
  return bodyMatch[1].replace(/<button[\s\S]*?<\/button>/,'');
}
function getInvoiceStyle(html){
  let m=html.match(/<style>([\s\S]*?)<\/style>/);
  return m?m[1]:'';
}
function printSelectedOrders(){
  let ids=[...document.querySelectorAll('.print-order-check:checked')].map(x=>x.value);
  if(!ids.length)return toast('Chưa chọn đơn nào để in');
  let orders=ids.map(id=>db.orders.find(o=>String(o.id)===String(id))).filter(Boolean);
  if(!orders.length)return toast('Không tìm thấy đơn đã chọn');
  let firstHtml=invoiceHtmlForOrder(orders[0]);
  let style=getInvoiceStyle(firstHtml);
  let pages=orders.map(o=>getInvoicePagesOnly(invoiceHtmlForOrder(o))).join('');
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>In ${orders.length} đơn hàng</title><style>${style}
    .batch-separator{page-break-after:always;height:0;overflow:hidden}
    .invoice-page:nth-last-child(2){page-break-after:always}
    @media print{.print-btn{display:none!important}}
  

/* ===== V13: Mobile chia màn hình App bán hàng / giao hàng theo từng bước ===== */
@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs{left:6px;right:6px;bottom:6px;border-radius:18px;padding:5px;gap:3px}
  body.mobile-role-app .mobile-app-tabs button{font-size:10px;padding:7px 2px;border-radius:13px;white-space:nowrap}
  body.mobile-role-app .mobile-app-tabs button span{font-size:17px;margin-bottom:1px}
  body.mobile-role-app .section.active{padding:8px 8px 78px!important}
  body.mobile-role-app #salesApp .card.panel,
  body.mobile-role-app #deliveryApp .card.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
  body.mobile-role-app #salesApp .panel-head,
  body.mobile-role-app #deliveryApp .panel-head{position:sticky;top:0;z-index:30;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 10px;box-shadow:0 8px 22px rgba(15,23,42,.08)}
  body.mobile-role-app #salesApp .panel-head h2,
  body.mobile-role-app #deliveryApp .panel-head h2{font-size:20px;line-height:1.2}
  body.mobile-role-app #salesApp .panel-head .toolbar,
  body.mobile-role-app #deliveryApp .panel-head .toolbar{display:none!important}
  body.mobile-role-app .mobile-step-title{display:block;background:#0f172a;color:#fff;border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 10px 26px rgba(15,23,42,.16)}
  body.mobile-role-app .mobile-step-title b{display:block;font-size:20px;margin-bottom:3px}
  body.mobile-role-app .mobile-step-title span{font-size:13px;color:#cbd5e1}
  body.mobile-role-app .mobile-step-actions{display:flex;gap:8px;margin:10px 0;position:sticky;bottom:76px;z-index:25;background:rgba(243,244,246,.92);padding:6px 0;backdrop-filter:blur(10px)}
  body.mobile-role-app .mobile-step-actions .btn{flex:1;font-size:15px;min-height:48px}
  body.mobile-role-app .role-kpi{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 10px!important}
  body.mobile-role-app .role-kpi .mini-card{padding:13px!important;border-radius:18px!important;background:#fff!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
  body.mobile-role-app .role-kpi .mini-card span{font-size:12px!important}
  body.mobile-role-app .role-kpi .mini-card b{font-size:22px!important;line-height:1.25!important}
  body.mobile-role-app .role-list-row{padding:16px!important;border-radius:20px!important;font-size:16px!important}
  body.mobile-role-app .role-list-row b{font-size:17px!important;line-height:1.35!important}
  body.mobile-role-app .role-list-row .muted{font-size:13px!important;line-height:1.5!important}
  body.mobile-role-app input{font-size:17px!important;min-height:50px!important;border-radius:14px!important}
  body.mobile-role-app .btn{font-size:15px!important;min-height:48px!important;border-radius:14px!important}

  /* Sales wizard visibility */
  body.mobile-role-app #salesCustomerPanel,
  body.mobile-role-app #salesOrdersPanel,
  body.mobile-role-app #salesDebtPanel{display:none!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel,
  body.mobile-role-app.sales-step-products #salesCustomerPanel,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel{display:block!important}
  body.mobile-role-app.sales-step-debt #salesDebtPanel{display:block!important}
  body.mobile-role-app.sales-step-orders #salesOrdersPanel{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:nth-child(2){display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:nth-child(2){display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .sales-cart-box{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .sales-cart-box,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-kpi{display:none!important}
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{border:2px solid #16a34a!important;background:#f7fff9!important}

  /* Mobile product cards */
  body.mobile-role-app .sales-product-table{min-width:0!important;width:100%!important;border-collapse:separate!important;border-spacing:0 10px!important}
  body.mobile-role-app .sales-product-table thead{display:none!important}
  body.mobile-role-app .sales-product-table tr{display:block!important;background:transparent!important}
  body.mobile-role-app .sales-product-table td.mobile-product-cell{display:block!important;padding:0!important;border:0!important}
  body.mobile-role-app .mobile-product-card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:15px;box-shadow:0 8px 20px rgba(15,23,42,.06);margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .sku{font-size:13px;color:#64748b;font-weight:800;margin-bottom:6px}
  body.mobile-role-app .mobile-product-card .name{font-size:17px;line-height:1.35;font-weight:800;color:#111827;margin-bottom:10px}
  body.mobile-role-app .mobile-product-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .meta div{background:#f8fafc;border:1px solid #eef2f7;border-radius:15px;padding:10px}
  body.mobile-role-app .mobile-product-card .meta span{display:block;font-size:12px;color:#64748b;margin-bottom:3px}
  body.mobile-role-app .mobile-product-card .meta b{font-size:18px}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  body.mobile-role-app .mobile-product-card .quick-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  body.mobile-role-app .mobile-product-card .quick-grid .btn{min-height:48px!important}
  body.mobile-role-app .mobile-product-card .btn.green{font-size:16px!important;font-weight:900!important}

  /* Cart as full screen card list */
  body.mobile-role-app .sales-cart-box{border-radius:22px!important;padding:14px!important;background:#fff!important;box-shadow:0 8px 22px rgba(15,23,42,.08)!important}
  body.mobile-role-app .cart-item{border-radius:18px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:14px!important;font-size:16px!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
  body.mobile-role-app .sum-line b{font-size:22px!important}

  /* Debt screen: cards instead of table */
  body.mobile-role-app #salesDebtPanel .table-wrap,
  body.mobile-role-app #driverDebtPanel .table-wrap{border:0!important;background:transparent!important;overflow:visible!important}
  body.mobile-role-app #salesDebtPanel table,
  body.mobile-role-app #driverDebtPanel table{display:block!important;min-width:0!important;width:100%!important}
  body.mobile-role-app #salesDebtPanel thead,
  body.mobile-role-app #driverDebtPanel thead{display:none!important}
  body.mobile-role-app #salesDebtPanel tbody,
  body.mobile-role-app #driverDebtPanel tbody{display:block!important}
  body.mobile-role-app #salesDebtPanel tr,
  body.mobile-role-app #driverDebtPanel tr{display:block!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:22px!important;margin-bottom:12px!important;padding:14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important}
  body.mobile-role-app #salesDebtPanel td,
  body.mobile-role-app #driverDebtPanel td{display:block!important;border:0!important;padding:4px 0!important;font-size:15px!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(2) b,
  body.mobile-role-app #driverDebtPanel td:nth-child(2) b{font-size:18px!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(4),
  body.mobile-role-app #driverDebtPanel td:nth-child(4){font-size:24px!important;font-weight:900!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(5) .btn,
  body.mobile-role-app #driverDebtPanel td:nth-child(5) .btn{width:100%;margin-top:8px}

  /* Driver wizard visibility */
  body.mobile-role-app #deliveryApp #driverOrdersPanel,
  body.mobile-role-app #deliveryApp #driverDebtPanel,
  body.mobile-role-app #deliveryApp #driverReportPanel{display:none!important}
  body.mobile-role-app.driver-step-orders #deliveryApp #driverOrdersPanel{display:block!important}
  body.mobile-role-app.driver-step-debt #deliveryApp #driverDebtPanel{display:block!important}
  body.mobile-role-app.driver-step-report #deliveryApp #driverReportPanel{display:block!important}
  body.mobile-role-app .driver-order-card{border-radius:22px!important;padding:16px!important;background:#fff!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;margin-bottom:12px!important}
  body.mobile-role-app .driver-order-card h3{font-size:20px!important;margin-bottom:8px!important}
  body.mobile-role-app .driver-order-card .table-wrap{border:0!important;overflow:visible!important}
  body.mobile-role-app .driver-order-card table{min-width:0!important;width:100%!important;display:block!important}
  body.mobile-role-app .driver-order-card thead{display:none!important}
  body.mobile-role-app .driver-order-card tbody{display:block!important}
  body.mobile-role-app .driver-order-card tr{display:block!important;background:#f8fafc!important;border:1px solid #eef2f7!important;border-radius:16px!important;margin-top:8px!important;padding:10px!important}
  body.mobile-role-app .driver-order-card td{display:block!important;border:0!important;padding:3px 0!important;text-align:left!important;font-size:14px!important}
  body.mobile-role-app .driver-collect-box{padding:12px!important;border-radius:18px!important;background:#f8fafc!important;border:1px solid #e5e7eb!important}
  body.mobile-role-app .driver-collect-box .toolbar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
  body.mobile-role-app .driver-collect-box .btn{width:100%!important}
}


/* ===== Nút thoát cố định cho bản app điện thoại ===== */
.mobile-logout-fixed{display:none}
@media(max-width:780px){
  body.mobile-role-app .mobile-logout-fixed{
    display:flex!important;position:fixed;right:12px;top:12px;z-index:150;
    align-items:center;justify-content:center;gap:6px;
    border:0;border-radius:999px;background:#fee2e2;color:#991b1b;
    padding:10px 13px;font-size:14px;font-weight:900;
    box-shadow:0 10px 24px rgba(153,27,27,.18);
  }
  body:not(.mobile-role-app) .mobile-logout-fixed{display:none!important}
}


@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs button.mobile-logout-tab{display:block!important;background:#fee2e2!important;color:#991b1b!important}
}



/* ===== FIX V2: App bán hàng mobile nhập số lượng không bị thanh dưới che ===== */
@media(max-width:780px){
  body.mobile-role-app .section.active{padding-bottom:190px!important;}
  body.mobile-role-app #salesProductList{padding-bottom:160px!important;}
  body.mobile-role-app .mobile-product-card{position:relative!important;z-index:1!important;margin-bottom:24px!important;padding-bottom:18px!important;}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:200!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;}
  body.mobile-role-app .mobile-product-card input.sales-qty-input{
    display:block!important;width:100%!important;height:54px!important;min-height:54px!important;
    font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;
    border:2px solid #94a3b8!important;border-radius:16px!important;box-shadow:none!important;
    pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;
    position:relative!important;z-index:210!important;opacity:1!important;
  }
  body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
  body.mobile-role-app .mobile-product-card .quick-grid{position:relative!important;z-index:190!important;margin-top:10px!important;}
  body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
  body.mobile-role-app .mobile-cart-float{z-index:118!important;}
}

</style></head><body><button class="print-btn" onclick="window.print()">In / Lưu PDF ${orders.length} đơn</button>${pages}<script>window.onload=function(){setTimeout(()=>window.print(),350)}<\/script></body></html>`;
  let w=window.open('','_blank');
  w.document.open();
  w.document.write(html);
  w.document.close();
}
function printMasterOrder(id){
  let m=(db.masterOrders||[]).find(x=>x.id===id);if(!m)return toast('Không tìm thấy đơn tổng');
  let orders=db.orders.filter(o=>(m.childIds||[]).includes(o.id));
  let items=(m.items&&m.items.length)?m.items:aggregateOrderItems(orders);
  let rows=items.map((it,i)=>`<tr><td>${i+1}</td><td>${it.sku}</td><td>${it.name||''}</td><td class="r">${money(it.sale)}</td><td class="r">${qtyView(it.qty,it.pack)}</td><td class="r">${Number(it.qty)||0}</td><td class="r">${money(it.goods||0)}</td><td class="r">${money(it.discount||0)}</td><td class="r"><b>${money(it.total||0)}</b></td></tr>`).join('');
  let childRows=orders.map((o,i)=>`<tr><td>${i+1}</td><td>${o.id}</td><td>${o.date}</td><td>${orderCustomerCode(o)||''}</td><td>${o.customer}</td><td>${staffDisplayOrder(o)}</td></tr>`).join('');
  let total=items.reduce((a,b)=>a+Number(b.total||0),0);
  let goods=items.reduce((a,b)=>a+Number(b.goods||0),0);
  let discount=items.reduce((a,b)=>a+Number(b.discount||0),0);
  let totalQty=items.reduce((a,b)=>a+Number(b.qty||0),0);
  let html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Don tong ${m.id}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#111}.top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px}.invoice-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px}.invoice-mark{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#1d4ed8,#16a34a);display:inline-grid;place-items:center;color:#fff}.title{text-align:center;font-size:22px;font-weight:800;margin:18px 0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #bbb;padding:7px;font-size:12px}th{background:#f3f4f6}.r{text-align:right}.sum{width:420px;margin-left:auto;margin-top:14px}.sum div{display:flex;justify-content:space-between;border-bottom:1px dashed #bbb;padding:6px 0}.small-title{font-weight:800;margin-top:18px}@media print{button{display:none}body{margin:10mm}}

/* ===== V13: Mobile chia màn hình App bán hàng / giao hàng theo từng bước ===== */
@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs{left:6px;right:6px;bottom:6px;border-radius:18px;padding:5px;gap:3px}
  body.mobile-role-app .mobile-app-tabs button{font-size:10px;padding:7px 2px;border-radius:13px;white-space:nowrap}
  body.mobile-role-app .mobile-app-tabs button span{font-size:17px;margin-bottom:1px}
  body.mobile-role-app .section.active{padding:8px 8px 78px!important}
  body.mobile-role-app #salesApp .card.panel,
  body.mobile-role-app #deliveryApp .card.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
  body.mobile-role-app #salesApp .panel-head,
  body.mobile-role-app #deliveryApp .panel-head{position:sticky;top:0;z-index:30;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 10px;box-shadow:0 8px 22px rgba(15,23,42,.08)}
  body.mobile-role-app #salesApp .panel-head h2,
  body.mobile-role-app #deliveryApp .panel-head h2{font-size:20px;line-height:1.2}
  body.mobile-role-app #salesApp .panel-head .toolbar,
  body.mobile-role-app #deliveryApp .panel-head .toolbar{display:none!important}
  body.mobile-role-app .mobile-step-title{display:block;background:#0f172a;color:#fff;border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 10px 26px rgba(15,23,42,.16)}
  body.mobile-role-app .mobile-step-title b{display:block;font-size:20px;margin-bottom:3px}
  body.mobile-role-app .mobile-step-title span{font-size:13px;color:#cbd5e1}
  body.mobile-role-app .mobile-step-actions{display:flex;gap:8px;margin:10px 0;position:sticky;bottom:76px;z-index:25;background:rgba(243,244,246,.92);padding:6px 0;backdrop-filter:blur(10px)}
  body.mobile-role-app .mobile-step-actions .btn{flex:1;font-size:15px;min-height:48px}
  body.mobile-role-app .role-kpi{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 10px!important}
  body.mobile-role-app .role-kpi .mini-card{padding:13px!important;border-radius:18px!important;background:#fff!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
  body.mobile-role-app .role-kpi .mini-card span{font-size:12px!important}
  body.mobile-role-app .role-kpi .mini-card b{font-size:22px!important;line-height:1.25!important}
  body.mobile-role-app .role-list-row{padding:16px!important;border-radius:20px!important;font-size:16px!important}
  body.mobile-role-app .role-list-row b{font-size:17px!important;line-height:1.35!important}
  body.mobile-role-app .role-list-row .muted{font-size:13px!important;line-height:1.5!important}
  body.mobile-role-app input{font-size:17px!important;min-height:50px!important;border-radius:14px!important}
  body.mobile-role-app .btn{font-size:15px!important;min-height:48px!important;border-radius:14px!important}

  /* Sales wizard visibility */
  body.mobile-role-app #salesCustomerPanel,
  body.mobile-role-app #salesOrdersPanel,
  body.mobile-role-app #salesDebtPanel{display:none!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel,
  body.mobile-role-app.sales-step-products #salesCustomerPanel,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel{display:block!important}
  body.mobile-role-app.sales-step-debt #salesDebtPanel{display:block!important}
  body.mobile-role-app.sales-step-orders #salesOrdersPanel{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:nth-child(2){display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:nth-child(2){display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .sales-cart-box{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .sales-cart-box,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-kpi{display:none!important}
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{border:2px solid #16a34a!important;background:#f7fff9!important}

  /* Mobile product cards */
  body.mobile-role-app .sales-product-table{min-width:0!important;width:100%!important;border-collapse:separate!important;border-spacing:0 10px!important}
  body.mobile-role-app .sales-product-table thead{display:none!important}
  body.mobile-role-app .sales-product-table tr{display:block!important;background:transparent!important}
  body.mobile-role-app .sales-product-table td.mobile-product-cell{display:block!important;padding:0!important;border:0!important}
  body.mobile-role-app .mobile-product-card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:15px;box-shadow:0 8px 20px rgba(15,23,42,.06);margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .sku{font-size:13px;color:#64748b;font-weight:800;margin-bottom:6px}
  body.mobile-role-app .mobile-product-card .name{font-size:17px;line-height:1.35;font-weight:800;color:#111827;margin-bottom:10px}
  body.mobile-role-app .mobile-product-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .meta div{background:#f8fafc;border:1px solid #eef2f7;border-radius:15px;padding:10px}
  body.mobile-role-app .mobile-product-card .meta span{display:block;font-size:12px;color:#64748b;margin-bottom:3px}
  body.mobile-role-app .mobile-product-card .meta b{font-size:18px}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  body.mobile-role-app .mobile-product-card .quick-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  body.mobile-role-app .mobile-product-card .quick-grid .btn{min-height:48px!important}
  body.mobile-role-app .mobile-product-card .btn.green{font-size:16px!important;font-weight:900!important}

  /* Cart as full screen card list */
  body.mobile-role-app .sales-cart-box{border-radius:22px!important;padding:14px!important;background:#fff!important;box-shadow:0 8px 22px rgba(15,23,42,.08)!important}
  body.mobile-role-app .cart-item{border-radius:18px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:14px!important;font-size:16px!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
  body.mobile-role-app .sum-line b{font-size:22px!important}

  /* Debt screen: cards instead of table */
  body.mobile-role-app #salesDebtPanel .table-wrap,
  body.mobile-role-app #driverDebtPanel .table-wrap{border:0!important;background:transparent!important;overflow:visible!important}
  body.mobile-role-app #salesDebtPanel table,
  body.mobile-role-app #driverDebtPanel table{display:block!important;min-width:0!important;width:100%!important}
  body.mobile-role-app #salesDebtPanel thead,
  body.mobile-role-app #driverDebtPanel thead{display:none!important}
  body.mobile-role-app #salesDebtPanel tbody,
  body.mobile-role-app #driverDebtPanel tbody{display:block!important}
  body.mobile-role-app #salesDebtPanel tr,
  body.mobile-role-app #driverDebtPanel tr{display:block!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:22px!important;margin-bottom:12px!important;padding:14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important}
  body.mobile-role-app #salesDebtPanel td,
  body.mobile-role-app #driverDebtPanel td{display:block!important;border:0!important;padding:4px 0!important;font-size:15px!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(2) b,
  body.mobile-role-app #driverDebtPanel td:nth-child(2) b{font-size:18px!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(4),
  body.mobile-role-app #driverDebtPanel td:nth-child(4){font-size:24px!important;font-weight:900!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(5) .btn,
  body.mobile-role-app #driverDebtPanel td:nth-child(5) .btn{width:100%;margin-top:8px}

  /* Driver wizard visibility */
  body.mobile-role-app #deliveryApp #driverOrdersPanel,
  body.mobile-role-app #deliveryApp #driverDebtPanel,
  body.mobile-role-app #deliveryApp #driverReportPanel{display:none!important}
  body.mobile-role-app.driver-step-orders #deliveryApp #driverOrdersPanel{display:block!important}
  body.mobile-role-app.driver-step-debt #deliveryApp #driverDebtPanel{display:block!important}
  body.mobile-role-app.driver-step-report #deliveryApp #driverReportPanel{display:block!important}
  body.mobile-role-app .driver-order-card{border-radius:22px!important;padding:16px!important;background:#fff!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;margin-bottom:12px!important}
  body.mobile-role-app .driver-order-card h3{font-size:20px!important;margin-bottom:8px!important}
  body.mobile-role-app .driver-order-card .table-wrap{border:0!important;overflow:visible!important}
  body.mobile-role-app .driver-order-card table{min-width:0!important;width:100%!important;display:block!important}
  body.mobile-role-app .driver-order-card thead{display:none!important}
  body.mobile-role-app .driver-order-card tbody{display:block!important}
  body.mobile-role-app .driver-order-card tr{display:block!important;background:#f8fafc!important;border:1px solid #eef2f7!important;border-radius:16px!important;margin-top:8px!important;padding:10px!important}
  body.mobile-role-app .driver-order-card td{display:block!important;border:0!important;padding:3px 0!important;text-align:left!important;font-size:14px!important}
  body.mobile-role-app .driver-collect-box{padding:12px!important;border-radius:18px!important;background:#f8fafc!important;border:1px solid #e5e7eb!important}
  body.mobile-role-app .driver-collect-box .toolbar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
  body.mobile-role-app .driver-collect-box .btn{width:100%!important}
}


/* ===== Nút thoát cố định cho bản app điện thoại ===== */
.mobile-logout-fixed{display:none}
@media(max-width:780px){
  body.mobile-role-app .mobile-logout-fixed{
    display:flex!important;position:fixed;right:12px;top:12px;z-index:150;
    align-items:center;justify-content:center;gap:6px;
    border:0;border-radius:999px;background:#fee2e2;color:#991b1b;
    padding:10px 13px;font-size:14px;font-weight:900;
    box-shadow:0 10px 24px rgba(153,27,27,.18);
  }
  body:not(.mobile-role-app) .mobile-logout-fixed{display:none!important}
}


@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs button.mobile-logout-tab{display:block!important;background:#fee2e2!important;color:#991b1b!important}
}



/* ===== FIX V2: App bán hàng mobile nhập số lượng không bị thanh dưới che ===== */
@media(max-width:780px){
  body.mobile-role-app .section.active{padding-bottom:190px!important;}
  body.mobile-role-app #salesProductList{padding-bottom:160px!important;}
  body.mobile-role-app .mobile-product-card{position:relative!important;z-index:1!important;margin-bottom:24px!important;padding-bottom:18px!important;}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:200!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;}
  body.mobile-role-app .mobile-product-card input.sales-qty-input{
    display:block!important;width:100%!important;height:54px!important;min-height:54px!important;
    font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;
    border:2px solid #94a3b8!important;border-radius:16px!important;box-shadow:none!important;
    pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;
    position:relative!important;z-index:210!important;opacity:1!important;
  }
  body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
  body.mobile-role-app .mobile-product-card .quick-grid{position:relative!important;z-index:190!important;margin-top:10px!important;}
  body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
  body.mobile-role-app .mobile-cart-float{z-index:118!important;}
}

</style></head><body><button onclick="window.print()">In / Lưu PDF</button><div class="top"><div><div class="invoice-logo"><span class="invoice-mark">▣</span><span>Kho Minh Khai Thái Bình</span></div><div>Phiếu gộp đơn tổng theo sản phẩm</div></div><div><b>Mã đơn tổng:</b> ${m.id}<br><b>Ngày tạo:</b> ${m.date}</div></div><div class="title">ĐƠN TỔNG HÀNG HÓA</div><p><b>Ghi chú:</b> ${m.note||''}</p><div class="small-title">Danh sách đơn con</div><table><thead><tr><th>STT</th><th>Mã đơn</th><th>Ngày</th><th>Mã KH</th><th>Khách hàng</th><th>Nhân viên</th></tr></thead><tbody>${childRows}</tbody></table><div class="small-title">Bảng hàng gộp theo SKU</div><table><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Đơn giá</th><th>T/L</th><th>SL lẻ</th><th>Tiền hàng</th><th>CK</th><th>Thành tiền</th></tr></thead><tbody>${rows}</tbody></table><div class="sum"><div><span>Tổng số mặt hàng</span><b>${items.length}</b></div><div><span>Tổng SL lẻ</span><b>${totalQty}</b></div><div><span>Tổng tiền hàng</span><b>${money(goods)}</b></div><div><span>Tổng chiết khấu</span><b>${money(discount)}</b></div><div><span>Phải thanh toán</span><b>${money(total)}</b></div></div><script>window.onload=function(){setTimeout(()=>window.print(),300)}<\/script></body></html>`;
  let w=window.open('','_blank');w.document.open();w.document.write(html);w.document.close();
}

function saveCustomer(){if(!cCode.value.trim()||!cName.value.trim())return toast('Thiếu mã hoặc tên khách hàng'); let c=db.customers.find(x=>x.code===cCode.value.trim()); const data={code:cCode.value.trim(),name:cName.value.trim(),address:cAddress.value,phone:cPhone.value,tax:cTax.value,customerGroup:(document.getElementById('cGroup')?.value||'').trim()}; if(!c){db.customers.push(data)}else{Object.assign(c,data)} ['cCode','cName','cAddress','cPhone','cTax','cGroup'].forEach(id=>{let el=document.getElementById(id);if(el)el.value=''});save();render();toast('Đã lưu khách hàng')}
function editCustomer(code){let c=db.customers.find(x=>x.code===code);cCode.value=c.code;cName.value=c.name;cAddress.value=c.address||'';cPhone.value=c.phone||'';cTax.value=c.tax||'';if(document.getElementById('cGroup'))cGroup.value=c.customerGroup||'';page('customers')}
function delCustomer(code){if(confirm('Xóa khách hàng?')){db.customers=db.customers.filter(c=>c.code!==code);save();render()}}
function downloadStaffTemplate(){rowsToSheet([{'Mã NV':'NV001','Tên nhân viên':'Nguyễn Văn A','SĐT':'0900000000'}], 'Mau_nhan_vien')}
function importStaffExcel(e){
  let f=e.target.files[0];if(!f)return;
  readExcel(f,rows=>{
    let n=0,skip=0;
    rows.forEach(r=>{
      let code=String(r['Mã NV']||r['Ma NV']||r['Mã nhân viên']||r.code||r.ma||'').trim();
      let name=String(r['Tên nhân viên']||r['Tên NV']||r['Tên']||r.name||r.ten||'').trim();
      let phone=String(r['SĐT']||r['SDT']||r['Điện thoại']||r.phone||r.sdt||'').trim();
      if(!code||!name){skip++;return}
      let existed=db.staff.find((x,i)=>staffCode(x,i)===code);
      let data={code,name,phone};
      if(existed)Object.assign(existed,data); else db.staff.push(data);
      n++;
    });
    save();render();toast('Đã import '+n+' nhân viên'+(skip?`, bỏ qua ${skip} dòng lỗi`:''));
  });
}
function saveStaff(){if(!nCode.value.trim()||!nName.value.trim())return toast('Thiếu mã hoặc tên nhân viên');let code=nCode.value.trim();let existed=db.staff.find((x,i)=>normText(staffCode(x,i))===normText(code));let data={code,name:nName.value.trim(),phone:nPhone.value,username:(existed&&existed.username)||accountUsernameFromCode(code),password:(existed&&existed.password)||'123456',role:'sales'};if(existed)Object.assign(existed,data);else db.staff.push(data);upsertUserAccount({username:data.username,password:data.password,role:'sales',name:data.name,code,staffCode:code,phone:data.phone,active:true});nCode.value=nName.value=nPhone.value='';save();render();toast('Đã lưu nhân viên và tài khoản bán hàng')}
function editStaff(i){let n=db.staff[i];nCode.value=staffCode(n,i);nName.value=staffName(n);nPhone.value=n.phone||n.sdt||'';page('staff')}
function delStaff(i){if(confirm('Xóa nhân viên?')){db.staff.splice(i,1);save();render()}}
function safeFileName(name){
  name=String(name||'mau_excel').trim();
  name=name.replace(/[\\/:*?"<>|]+/g,'_');
  return name.toLowerCase().endsWith('.xlsx') ? name : name+'.xlsx';
}
function downloadBlobFile(blob,fileName){
  const a=document.createElement('a');
  const url=URL.createObjectURL(blob);
  a.href=url; a.download=fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function rowsToSheet(rows,name){
  const fileName=safeFileName(name);
  try{
    if(!window.XLSX || !XLSX.utils || !XLSX.write){
      throw new Error('Thư viện Excel chưa tải xong');
    }
    const ws=XLSX.utils.json_to_sheet(rows||[]);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Mau');
    const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    downloadBlobFile(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fileName);
  }catch(err){
    console.warn('Không tạo được XLSX, chuyển sang CSV:',err);
    const arr=rows||[];
    const headers=[...new Set(arr.flatMap(r=>Object.keys(r||{})))];
    const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const csv='\ufeff'+headers.join(',')+'\n'+arr.map(r=>headers.map(h=>esc(r[h])).join(',')).join('\n');
    downloadBlobFile(new Blob([csv],{type:'text/csv;charset=utf-8'}),fileName.replace(/\.xlsx$/i,'.csv'));
  }
}
function downloadExcel(rows,fileName){rowsToSheet(rows,fileName)}

function excelDateToInput(v){
  if(!v)return '';
  if(typeof v==='number'){
    let d=new Date(Math.round((v-25569)*86400*1000));
    if(!isNaN(d))return d.toISOString().slice(0,10);
  }
  let str=String(v).trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}/.test(str)){
    let d=new Date(str); if(!isNaN(d))return d.toISOString().slice(0,10);
  }
  let m=str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    let d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
    if(!isNaN(d))return d.toISOString().slice(0,10);
  }
  let d=new Date(str); if(!isNaN(d))return d.toISOString().slice(0,10);
  return new Date().toISOString().slice(0,10);
}
function normKeyName(v){
  return normText(v).replace(/[^a-z0-9]+/g,' ').trim();
}
function cell(r,names,def=''){
  // Đọc cột Excel theo cả tên gốc và tên đã chuẩn hóa dấu/khoảng trắng.
  // Việc này giúp nhận đúng cột kiểu "Họ" trong file Unilever dù chữ dấu khác Unicode.
  for(let name of names){
    if(r[name]!==undefined && r[name]!==null && String(r[name]).trim()!=='')return r[name];
  }
  const keys=Object.keys(r||{});
  const normalizedKeys=keys.map(k=>({key:k,norm:normKeyName(k)}));
  for(let name of names){
    const want=normKeyName(name);
    const hit=normalizedKeys.find(x=>x.norm===want);
    if(hit && r[hit.key]!==undefined && r[hit.key]!==null && String(r[hit.key]).trim()!=='')return r[hit.key];
  }
  return def;
}
function normalizeCustomerNameFromUpload(code,name){
  code=String(code||'').trim(); name=String(name||'').trim();
  // File mẫu Unilever có cột tên khách là "Họ". Nếu có tên trong file thì ưu tiên tuyệt đối tên đó.
  if(name && normText(name)!=='khach le') return name;
  if(code) return 'KH '+code;
  return 'Khách lẻ';
}
function findOrCreateCustomer(code,name,address='',phone='',tax=''){
  code=String(code||'').trim();
  name=normalizeCustomerNameFromUpload(code,name);
  if(!code && !name){
    let def=db.customers[0]||{code:'KH001',name:'Khách lẻ',address:'',phone:'',tax:''};
    if(!db.customers.length)db.customers.push(def);
    return def;
  }
  // CHUẨN UNILEVER: Mã cửa hàng/Mã khách hàng là khóa chính.
  // Không lấy khách cũ theo tên, vì nhiều cửa hàng có thể trùng tên hoặc cùng tên chủ.
  let c=code ? db.customers.find(x=>String(x.code).trim()===code) : db.customers.find(x=>normText(x.name)===normText(name));
  if(!c){
    c={code:code||('KH'+String(db.customers.length+1).padStart(3,'0')),name,address:String(address||''),phone:String(phone||''),tax:String(tax||'')};
    db.customers.push(c);
  }else{
    if(code)c.code=code;
    // Nếu file upload có tên khách thật ở cột "Họ" thì cập nhật theo tên đó.
    if(name && normText(name)!=='khach le') c.name=name;
    if(address)c.address=String(address); if(phone)c.phone=String(phone); if(tax)c.tax=String(tax);
  }
  return c;
}
function findOrCreateStaff(code,name,phone=''){
  code=String(code||'').trim(); name=String(name||'').trim();
  if(!code && !name){
    if(!db.staff.length)db.staff.push({code:'NV001',name:'Admin',phone:''});
  if(!db.deliveryStaff.length)db.deliveryStaff.push({code:'GH001',name:'Chưa gán giao hàng',phone:''});
    return db.staff[0];
  }
  let n=(code?db.staff.find((x,i)=>String(staffCode(x,i))===code):null) || db.staff.find(x=>normText(staffName(x))===normText(name));
  if(!n){
    n={code:code||('NV'+String(db.staff.length+1).padStart(3,'0')),name:name||code,phone:String(phone||'')};
    db.staff.push(n);
  }else{
    if(name)n.name=name; if(phone)n.phone=String(phone);
  }
  return n;
}
function downloadBulkOrderTemplate(){
  rowsToSheet([
    {
      'Tuyến bán hàng':'W1SPW','Số hóa đơn':'HU90198129','Ngày lập hóa đơn':'2026-05-05',
      'Mã hàng hóa':'64811767','Mô tả mặt hàng':'SUNLIGHT NLS TD Thơm Mát Hương Lily & Bách Trà 1kg/12 chai','Đóng gói':12,
      'Số lượng thùng':1,'Số lượng SU':0,'SL khuyến mãi theo thùng':0,'SL khuyến mãi theo SU':0,
      'Mã nhân viên':'33949','Tên NVTT':'Nhân viên A','Mã cửa hàng':'KH001',
      'Số hóa đơn trong 1 ngày':1,'Số SKU trong 1 ngày':1,'Đơn giá':25000,
      'GSV bán ra':300000,'NIV bán ra':270000,'Họ':'Khách lẻ','Doanh số mỗi ngày':291600,'Loại hóa đơn':'ZID1','Thuế':21600
    },
    {
      'Tuyến bán hàng':'W1SPW','Số hóa đơn':'HU90198129','Ngày lập hóa đơn':'2026-05-05',
      'Mã hàng hóa':'64811768','Mô tả mặt hàng':'Hàng khuyến mại không tính tiền','Đóng gói':12,
      'Số lượng thùng':0,'Số lượng SU':0,'SL khuyến mãi theo thùng':0,'SL khuyến mãi theo SU':2,
      'Mã nhân viên':'33949','Tên NVTT':'Nhân viên A','Mã cửa hàng':'KH001',
      'Số hóa đơn trong 1 ngày':0,'Số SKU trong 1 ngày':1,'Đơn giá':25000,
      'GSV bán ra':0,'NIV bán ra':0,'Họ':'Khách lẻ','Doanh số mỗi ngày':0,'Loại hóa đơn':'ZID1','Thuế':0
    }
  ],'Mau_import_nhieu_don_Unilever');
}
let BULK_IMPORT_PREVIEW=null;

function importBulkOrdersExcel(e){
  let f=e.target.files[0]; if(!f)return;
  readExcel(f,rows=>{
    const unknown=detectUnknownProductCodesFromRows(rows);
    if(unknown.length){
      openNewProductCodeModal(unknown);
      toast('Phát hiện '+unknown.length+' code hàng mới. Hãy bổ sung thông tin sản phẩm.');
    }
    BULK_IMPORT_PREVIEW=buildBulkOrderPreview(rows,f.name);
    showBulkImportPreview();
  });
  e.target.value='';
}

function getStaffNameByCode(code,fallback=''){
  let s=db.staff.find((n,i)=>normText(staffCode(n,i))===normText(code));
  return s?staffName(s):(fallback||'');
}
function getStaffByCodeOrCreate(code,name){
  let s=db.staff.find((n,i)=>normText(staffCode(n,i))===normText(code));
  if(s)return s;
  return findOrCreateStaff(code,name||code||'Nhân viên');
}
function excelQtyFromBoxEach(row,pack,boxKeys,eachKeys){
  return (Number(cell(row,boxKeys,0))||0)*(Number(pack)||1)+(Number(cell(row,eachKeys,0))||0);
}
function lineMoneyFromExcel(row,qtySell,sale,disc){
  let explicit=Number(cell(row,['Doanh số mỗi ngày','Doanh so moi ngay','Doanh số','Doanh so','Thành tiền','Thanh tien'],NaN));
  if(!isNaN(explicit) && explicit>0) return explicit;
  let niv=Number(cell(row,['NIV bán ra','NIV ban ra','NIV'],NaN));
  let tax=Number(cell(row,['Thuế','Thue','VAT'],0))||0;
  if(!isNaN(niv) && niv>0) return niv+tax;
  let gross=qtySell*(Number(sale)||0);
  return gross-(gross*((Number(disc)||0)/100));
}
function buildBulkOrderPreview(rows,fileName){
  let groups={}, fail=0, errors=[];
  const firstCols=rows && rows[0] ? Object.keys(rows[0]).join(', ') : '';

  rows.forEach((r,idx)=>{
    const rowNo=idx+2;

    // ===== MAP CỘT CHUẨN THEO FILE UNILEVER =====
    let id=String(cell(r,[
      'Số hóa đơn','So hoa don','Số HĐ','So HD','Số HD','So HD',
      'Mã đơn','Ma don','Mã HĐ','Ma HD','Invoice No','Invoice'
    ], '')).trim();

    let sku=String(cell(r,[
      'Mã hàng hóa','Ma hang hoa','Mã hàng hoá','Ma hang hoa','SKU','sku',
      'Mã hàng','Ma hang','Mã SP','Ma SP','Item Code','Product Code'
    ], '')).trim();

    let nameFromFile=String(cell(r,[
      'Mô tả mặt hàng','Mo ta mat hang','Tên hàng','Ten hang','Tên hàng hóa','Ten hang hoa',
      'Tên sản phẩm','Ten san pham','Product Name','Item Name'
    ], '')).trim();

    if(!id){fail++;errors.push('Dòng '+rowNo+': thiếu Số hóa đơn');return;}
    if(!sku){fail++;errors.push('Dòng '+rowNo+': thiếu Mã hàng hóa/SKU');return;}

    if(db.orders.some(o=>String(o.id)===id)){
      fail++;errors.push('Dòng '+rowNo+': mã đơn đã tồn tại '+id);return;
    }

    // Nếu SKU chưa có trong kho vẫn cho vào preview để lập báo cáo hàng thiếu.
    // Không còn chặn ngay từ đầu nữa, tránh lỗi "không có đơn hợp lệ để import".
    let p=findProduct(sku);
    let pack=Number(cell(r,['Đóng gói','Dong goi','Quy cách','Quy cach','T/L','TL','Pack','Quy cach thung'],p?p.pack:1))||Number(p&&p.pack)||1;

    // SL bán: tính tiền. SL KM: chỉ trừ kho, không tính tiền.
    let qtySell=excelQtyFromBoxEach(
      r,pack,
      ['Số lượng thùng','So luong thung','SL thùng','SL thung','Thùng','Thung','SL bán thùng','SL ban thung'],
      ['Số lượng SU','So luong SU','SL SU','Số lượng lẻ','So luong le','Lẻ','Le','SL bán lẻ','SL ban le']
    );

    let qtyKM=excelQtyFromBoxEach(
      r,pack,
      ['SL khuyến mãi theo thùng','SL khuyen mai theo thung','SL khuyến mại theo thùng','SL khuyen mại theo thung','KM thùng','KM thung','Khuyến mại thùng','Khuyen mai thung'],
      ['SL khuyến mãi theo SU','SL khuyen mai theo SU','SL khuyến mại theo SU','SL khuyen mại theo SU','KM SU','KM lẻ','KM le','Khuyến mại lẻ','Khuyen mai le']
    );

    if(qtySell<=0 && qtyKM<=0){
      // Hỗ trợ thêm mẫu cũ có cột SL dạng 1/0
      qtySell=parseQtySlash(cell(r,['SL','Số lượng','So luong','Quantity','Qty','sl'],''),pack);
      qtyKM=0;
    }

    let qty=qtySell+qtyKM;
    if(qty<=0){fail++;errors.push('Dòng '+rowNo+': số lượng bán/KM không hợp lệ');return;}

    let date=excelDateToInput(cell(r,['Ngày lập hóa đơn','Ngay lap hoa don','Ngày','Ngay','Ngày bán','Ngay ban','Ngày đơn','Ngay don','Invoice Date'], new Date().toISOString().slice(0,10)));
    let cCode=String(cell(r,['Mã cửa hàng','Ma cua hang','Mã KH','Ma KH','Mã khách hàng','Ma khach hang','Customer Code','Shop Code'],'')).trim();
    let rawCustomerName=String(cell(r,['Họ','Họ','Ho','Tên KH','Ten KH','Tên khách hàng','Ten khach hang','Khách hàng','Khach hang','Tên cửa hàng','Ten cua hang','Customer Name','Shop Name'], '')).trim();
    let cName=normalizeCustomerNameFromUpload(cCode,rawCustomerName);
    let cAddress=String(cell(r,['Địa chỉ','Dia chi','Address'],'')).trim();
    let cPhone=String(cell(r,['SĐT','SDT','Điện thoại','Dien thoai','Phone'],'')).trim();
    let cTax=String(cell(r,['MST','Mã số thuế','Ma so thue','Tax Code'],'')).trim();
    let staffCodeValue=String(cell(r,['Mã nhân viên','Ma nhan vien','Mã NV','Ma NV','Mã NVBH','Ma NVBH','Staff Code','Salesman Code'],'')).trim();
    let staffNameFromFile=String(cell(r,['Tên NVTT','Ten NVTT','Tên NV','Ten NV','Tên nhân viên','Ten nhan vien','NVBH','Nhân viên','Staff Name','Salesman'], '')).trim();
    let staffNameValue=getStaffNameByCode(staffCodeValue,staffNameFromFile||staffCodeValue||'Nhân viên');
    let route=String(cell(r,['Tuyến bán hàng','Tuyen ban hang','Tuyến','Tuyen','Route'], '')).trim();
    let invoiceType=String(cell(r,['Loại hóa đơn','Loai hoa don','Invoice Type'], '')).trim();

    if(!groups[id]){
      groups[id]={
        id,date,customer:cName,customerCode:cCode,customerAddress:cAddress,customerPhone:cPhone,customerTax:cTax,
        staffCode:staffCodeValue,staffName:staffNameValue,
        warehouse:String(cell(r,['Kho','Kho hàng','Kho hang','Warehouse'], 'KHOCHINH')),
        route,invoiceType,note:String(cell(r,['Ghi chú','Ghi chu','Note'],'')),
        delivery:String(cell(r,['Trạng thái giao','Trang thai giao'],'Giao thành công')),
        xk:String(cell(r,['Phiếu XK','Phieu XK'],'')),
        adjust:Number(cell(r,['CK hiệu chỉnh','CK hieu chinh','Điều chỉnh','Dieu chinh'],0))||0,
        items:[],selected:true
      };
    }

    // Nếu dòng sau cùng đơn có đủ tên KH/NV hơn dòng trước thì cập nhật lại.
    if(cCode)groups[id].customerCode=cCode;
    if(rawCustomerName)groups[id].customer=cName;
    if(staffCodeValue)groups[id].staffCode=staffCodeValue;
    if(staffNameFromFile)groups[id].staffName=staffNameValue;
    if(route)groups[id].route=route;
    if(invoiceType)groups[id].invoiceType=invoiceType;

    let sale=Number(cell(r,['Đơn giá','Don gia','Giá bán','Gia ban','Price','Unit Price'],p?p.sale:0))||Number(p&&p.sale)||0;
    let disc=Number(cell(r,['%CK','CK','Chiết khấu','Chiet khau','Discount'],0))||0;
    let tax=Number(cell(r,['Thuế','Thue','VAT'],0))||0;
    let lineTotal=lineMoneyFromExcel(r,qtySell,sale,disc);
    let finalName=(p&&p.name)||nameFromFile||sku;

    // Nếu SKU chưa tồn tại, tạo sản phẩm tạm tồn 0 để báo thiếu rõ ràng và có tên hàng.
    if(!p){
      p={sku,name:finalName,pack,qty:0,cost:0,sale,brand:'',category:'',warehouse:groups[id].warehouse};
    }

    groups[id].items.push({
      sku:String(p.sku||sku),
      name:finalName,
      pack:Number(pack)||1,
      qty,
      sellQty:qtySell,
      kmQty:qtyKM,
      sale,
      cost:Number(p.cost)||0,
      disc,
      tax,
      lineTotal,
      route,
      invoiceType,
      originalQty:qty,
      originalSellQty:qtySell,
      originalKmQty:qtyKM,
      productMissing:!findProduct(sku)
    });
  });

  let orders=Object.values(groups).filter(o=>(o.items||[]).length>0);
  orders.forEach(o=>{
    let goods=o.items.reduce((a,b)=>a+(Number(b.sellQty)||0)*(Number(b.sale)||0),0);
    let discount=o.items.reduce((a,b)=>a+((Number(b.sellQty)||0)*(Number(b.sale)||0)*(Number(b.disc||0)/100)),0);
    let lineTotal=o.items.reduce((a,b)=>a+Number(b.lineTotal||0),0);
    o.previewTotal=lineTotal || (goods-discount-Number(o.adjust||0));
  });

  if(!orders.length && firstCols){
    errors.unshift('Không tạo được đơn nào. Các cột đọc được trong file: '+firstCols);
  }

  return {fileName:fileName||'',orders,errors,fail};
}
function showBulkImportPreview(){
  if(!BULK_IMPORT_PREVIEW || !BULK_IMPORT_PREVIEW.orders.length){
    console.warn('Import errors:',BULK_IMPORT_PREVIEW&&BULK_IMPORT_PREVIEW.errors);
    toast('Không có đơn hợp lệ. Xem lỗi ở Console hoặc kiểm tra tên cột Excel');
    return;
  }
  let m=document.getElementById('bulkImportPreviewModal');
  if(m)m.classList.add('show');
  renderBulkImportPreview();
}
function closeBulkImportPreview(){
  let m=document.getElementById('bulkImportPreviewModal');
  if(m)m.classList.remove('show');
}
function renderBulkImportPreview(){
  if(!BULK_IMPORT_PREVIEW)return;
  let orders=BULK_IMPORT_PREVIEW.orders||[];
  let selected=orders.filter(o=>o.selected!==false);
  bulkPreviewOrderCount.textContent=orders.length;
  bulkPreviewLineCount.textContent=orders.reduce((a,o)=>a+(o.items||[]).length,0);
  bulkPreviewValue.textContent=money(orders.reduce((a,o)=>a+Number(o.previewTotal||0),0));
  bulkPreviewFailCount.textContent=BULK_IMPORT_PREVIEW.fail||0;
  bulkPreviewBody.innerHTML=orders.map((o,i)=>`<tr>
    <td class="center"><input type="checkbox" ${o.selected!==false?'checked':''} onchange="setPreviewOrderSelected(${i},this.checked)"></td>
    <td><b>${escapeHtml(o.id)}</b></td><td>${escapeHtml(o.date)}</td><td>${escapeHtml(o.staffCode||'')}</td><td>${escapeHtml(o.staffName||'')}</td><td>${escapeHtml(o.customerCode||'')}</td><td>${escapeHtml(o.customer||'')}</td><td class="center">${(o.items||[]).length}</td><td class="right">${money(o.previewTotal)}</td>
  </tr>`).join('');
  bulkImportPreviewNote.textContent='Đã chọn '+selected.length+'/'+orders.length+' đơn. Hàng khuyến mại sẽ trừ kho nhưng không tính tiền.';
  bulkPreviewErrors.innerHTML=(BULK_IMPORT_PREVIEW.errors||[]).length?('<b>Lỗi bỏ qua:</b><br>'+BULK_IMPORT_PREVIEW.errors.slice(0,8).map(escapeHtml).join('<br>')+((BULK_IMPORT_PREVIEW.errors||[]).length>8?'<br>...':'')):'';
  let all=document.getElementById('bulkPreviewSelectAll'); if(all)all.checked=selected.length===orders.length;
}
function setPreviewOrderSelected(i,checked){
  if(!BULK_IMPORT_PREVIEW||!BULK_IMPORT_PREVIEW.orders[i])return;
  BULK_IMPORT_PREVIEW.orders[i].selected=checked;
  renderBulkImportPreview();
}
function toggleAllPreviewOrders(checked){
  if(!BULK_IMPORT_PREVIEW)return;
  BULK_IMPORT_PREVIEW.orders.forEach(o=>o.selected=checked);
  renderBulkImportPreview();
}
function allocateImportedQty(it,used){
  let sell=Number(it.sellQty||0), km=Number(it.kmQty||0);
  let importedKm=Math.min(km,used);          // ưu tiên giữ hàng khuyến mại nếu còn tồn
  let remain=used-importedKm;
  let importedSell=Math.min(sell,Math.max(0,remain));
  if(importedSell<sell && used>=sell){      // trường hợp còn đủ bán nhưng thiếu KM
    importedSell=sell;
    importedKm=Math.max(0,used-sell);
  }
  if(used<sell){                            // thiếu cả hàng bán thì giảm hàng bán
    importedSell=used;
    importedKm=0;
  }
  return {importedSell,importedKm};
}
function recalcItemMoney(it){
  let sell=Number(it.sellQty||0), sale=Number(it.sale)||0, disc=Number(it.disc)||0;
  let gross=sell*sale;
  let oldSell=Number(it.originalSellQty||it.sellQty||0);
  let oldLine=Number(it.lineTotal||0);
  if(oldLine>0 && oldSell>0 && sell!==oldSell) return oldLine*(sell/oldSell);
  return gross-(gross*(disc/100));
}
function simulateAndAdjustSelectedOrders(orders){
  let available={};
  db.products.forEach(p=>available[p.sku]=Number(p.qty)||0);
  let shortages=[];
  let adjustedOrders=orders.map(o=>{
    let no={...o,items:[]};
    (o.items||[]).forEach(it=>{
      let stock=available[it.sku]||0;
      let requested=Number(it.qty)||0;
      let used=Math.min(requested,Math.max(0,stock));
      if(used<requested){
        shortages.push({orderId:o.id,date:o.date,staffCode:o.staffCode,staffName:o.staffName,customerCode:o.customerCode,customerName:o.customer,route:o.route,sku:it.sku,name:it.name,pack:Number(it.pack)||1,requested,stock,shortage:requested-used,importedQty:used,requestedSell:Number(it.sellQty||0),requestedKM:Number(it.kmQty||0)});
      }
      if(used>0){
        let alloc=allocateImportedQty(it,used);
        let newItem={...it,qty:used,sellQty:alloc.importedSell,kmQty:alloc.importedKm,originalQty:requested};
        newItem.lineTotal=recalcItemMoney(newItem);
        no.items.push(newItem);
        available[it.sku]=stock-used;
      }
    });
    return no;
  }).filter(o=>(o.items||[]).length>0);
  return {orders:adjustedOrders,shortages};
}
function confirmBulkOrderImport(){
  if(!BULK_IMPORT_PREVIEW)return;
  let selected=(BULK_IMPORT_PREVIEW.orders||[]).filter(o=>o.selected!==false);
  if(!selected.length)return toast('Chưa chọn đơn nào để import');
  let sim=simulateAndAdjustSelectedOrders(selected);
  if(sim.shortages.length){
    let msg='Có '+sim.shortages.length+' dòng hàng thiếu tồn. Phần mềm sẽ tự giảm số lượng thiếu để tiếp tục import. Hàng khuyến mại không tính tiền, nhưng vẫn trừ kho nếu còn tồn.\n\nVí dụ:\n'+sim.shortages.slice(0,6).map(x=>`${x.orderId} - ${x.sku}: cần ${qtyView(x.requested,x.pack)}, còn ${qtyView(x.stock,x.pack)}, sẽ nhập ${qtyView(x.importedQty,x.pack)}`).join('\n')+'\n\nAnh có muốn tiếp tục không?';
    if(!confirm(msg))return;
    createShortageReportFromImport(sim.shortages,selected,BULK_IMPORT_PREVIEW.fileName,BULK_IMPORT_PREVIEW.errors,BULK_IMPORT_PREVIEW.fail);
  }
  if(!sim.orders.length)return toast('Không còn dòng hàng nào đủ tồn để import');
  sim.orders.forEach(o=>{
    let c=findOrCreateCustomer(o.customerCode,o.customer,o.customerAddress,o.customerPhone,o.customerTax);
    let nv=getStaffByCodeOrCreate(o.staffCode,o.staffName);
    let nvc=staffCode(nv,db.staff.indexOf(nv)), nvn=staffName(nv);
    let goods=o.items.reduce((a,b)=>a+(Number(b.sellQty)||0)*(Number(b.sale)||0),0);
    let discount=o.items.reduce((a,b)=>a+((Number(b.sellQty)||0)*(Number(b.sale)||0)*(Number(b.disc||0)/100)),0);
    let tax=o.items.reduce((a,b)=>a+Number(b.tax||0),0);
    let lineTotal=o.items.reduce((a,b)=>a+Number(b.lineTotal||0),0);
    let cost=o.items.reduce((a,b)=>a+Number(b.qty||0)*Number(b.cost||0),0);
    let finalOrder={id:o.id,date:o.date,customer:c.name,customerCode:c.code,staffCode:nvc,staffName:nvn,staff:nvc+' - '+nvn,warehouse:o.warehouse,route:o.route,invoiceType:o.invoiceType,note:o.note,delivery:o.delivery,xk:o.xk,adjust:Number(o.adjust||0),items:o.items,goods,discount,tax,total:(lineTotal||goods-discount)-Number(o.adjust||0),cost,masterId:'',isoDate:new Date(o.date+'T12:00:00').toISOString()};
    finalOrder.items.forEach(it=>{
      let p=findProduct(it.sku);
      if(!p){
        p={sku:it.sku,name:it.name,pack:Number(it.pack)||1,qty:0,cost:Number(it.cost)||0,sale:Number(it.sale)||0,brand:'',category:'',warehouse:finalOrder.warehouse||'Kho chính'};
        db.products.push(p);
      }
      p.qty-=Number(it.qty||0);
    });
    db.orders.push(finalOrder);
  });
  save();render();closeBulkImportPreview();
  let txt='Đã import '+sim.orders.length+' đơn theo mẫu Unilever';
  if(sim.shortages.length)txt+=' sau khi tự giảm hàng thiếu và lưu báo cáo thiếu';
  toast(txt);
  BULK_IMPORT_PREVIEW=null;
}


function shortageReportId(){return 'HT'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}
function createShortageReportFromImport(shortages,orders,fileName,errors=[],fail=0){
  db.shortageReports=db.shortageReports||[];
  let report={
    id:shortageReportId(),
    date:today(),
    isoDate:new Date().toISOString(),
    fileName:fileName||'',
    orderCount:orders.length,
    lineCount:orders.reduce((a,o)=>a+(o.items||[]).length,0),
    failCount:fail||0,
    errors:(errors||[]).slice(0,100),
    items:shortages.map(x=>({...x}))
  };
  db.shortageReports.push(report);
  return report;
}
function renderShortageReports(){
  let reports=(db.shortageReports||[]).slice().reverse();
  shortageReportBody.innerHTML=reports.map(r=>{
    let totalShort=(r.items||[]).reduce((a,b)=>a+Number(b.shortage||0),0);
    let orderCount=(r.orderCount||new Set((r.items||[]).map(x=>x.orderId)).size||0);
    return `<tr><td><b>${r.id}</b></td><td>${r.date||''}</td><td>${r.fileName||''}</td><td class="center">${orderCount}</td><td class="center">${(r.items||[]).length}</td><td class="right">${totalShort}</td><td><button class="btn small light" onclick="showShortageReport('${r.id}')">Xem</button> <button class="btn small light" onclick="exportShortageReport('${r.id}')">Xuất Excel</button> <button class="btn small red" onclick="deleteShortageReport('${r.id}')">Xóa</button></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="center muted">Chưa có báo cáo hàng thiếu</td></tr>';
  renderShortageVisual();
}
function allShortageDetailRows(){
  return (db.shortageReports||[]).slice().reverse().flatMap(r=>(r.items||[]).map(it=>({reportId:r.id,reportDate:r.date,fileName:r.fileName,...it})));
}
function renderShortageVisual(reportId=''){
  const body=document.getElementById('shortageVisualBody');
  if(!body)return;
  let q=normText(document.getElementById('shortageSearch')?.value||'');
  let rows=allShortageDetailRows();
  if(reportId)rows=rows.filter(x=>String(x.reportId)===String(reportId));
  if(q)rows=rows.filter(x=>normText(`${x.reportId||''} ${x.orderId||''} ${x.staffCode||''} ${x.staffName||''} ${x.customerCode||''} ${x.customerName||''} ${x.sku||''} ${x.name||''}`).includes(q));
  body.innerHTML=rows.map(it=>`<tr>
    <td><b>${it.reportId||''}</b></td>
    <td>${it.orderId||''}</td>
    <td>${it.staffCode||''}</td>
    <td>${it.staffName||''}</td>
    <td>${it.customerCode||''}</td>
    <td>${it.customerName||''}</td>
    <td>${it.sku||''}</td>
    <td><b>${it.name||''}</b></td>
    <td class="right">${qtyView(it.requested,it.pack)}</td>
    <td class="right">${qtyView(it.stock,it.pack)}</td>
    <td class="right"><span class="pill low">${qtyView(it.shortage,it.pack)}</span></td>
    <td class="right">${qtyView(it.importedQty,it.pack)}</td>
  </tr>`).join('')||'<tr><td colspan="12" class="center muted">Chưa có chi tiết hàng thiếu</td></tr>';
}
function showShortageReport(id){
  const input=document.getElementById('shortageSearch');
  if(input)input.value=id;
  renderShortageReports();
}
function shortageReportRows(r){
  return (r.items||[]).map(it=>({
    'Mã báo cáo':r.id,
    'Ngày tạo':r.date||'',
    'File import':r.fileName||'',
    'Mã đơn':it.orderId||'',
    'Ngày đơn':it.date||'',
    'Mã NV':it.staffCode||'',
    'Nhân viên':it.staffName||'',
    'Mã KH':it.customerCode||'',
    'Khách hàng':it.customerName||'',
    'Tuyến':it.route||'',
    'SKU':it.sku,
    'Tên hàng':it.name,
    'Quy cách':it.pack,
    'Cần xuất (lẻ)':it.requested,
    'Tồn hiện tại (lẻ)':it.stock,
    'Thiếu (lẻ)':it.shortage,
    'Sẽ import (lẻ)':it.importedQty,
    'Cần xuất thùng/lẻ':qtyView(it.requested,it.pack),
    'Tồn thùng/lẻ':qtyView(it.stock,it.pack),
    'Thiếu thùng/lẻ':qtyView(it.shortage,it.pack),
    'Sẽ import thùng/lẻ':qtyView(it.importedQty,it.pack)
  }));
}
function exportShortageReport(id){
  let r=(db.shortageReports||[]).find(x=>x.id===id);
  if(!r)return toast('Không tìm thấy báo cáo hàng thiếu');
  rowsToSheet(shortageReportRows(r),'Bao_cao_hang_thieu_'+id);
}
function exportAllShortageReports(){
  let rows=(db.shortageReports||[]).flatMap(shortageReportRows);
  if(!rows.length)return toast('Chưa có báo cáo hàng thiếu');
  rowsToSheet(rows,'Tat_ca_bao_cao_hang_thieu');
}
function deleteShortageReport(id){
  if(!confirm('Xóa báo cáo hàng thiếu '+id+'?'))return;
  db.shortageReports=(db.shortageReports||[]).filter(x=>x.id!==id);
  save();render();toast('Đã xóa báo cáo hàng thiếu');
}
function clearShortageReports(){
  if(!confirm('Xóa toàn bộ báo cáo hàng thiếu?'))return;
  db.shortageReports=[];save();render();toast('Đã xóa toàn bộ báo cáo hàng thiếu');
}

function downloadSaleTemplate(){rowsToSheet([{SKU:'64811767','SL':'1/0','%CK':0,'Ghi chú':'SL nhập dạng thùng/lẻ. Ví dụ 1/0 = 1 thùng, 0 lẻ'}], 'Mau_xuat_ban_1_0')}
function importSaleExcel(e){let f=e.target.files[0];if(!f)return;readExcel(f,rows=>{let ok=0,fail=0;rows.forEach(r=>{let sku=String(r.SKU||r.sku||r['Mã hàng']||'').trim();if(!sku){fail++;return}let p=findProduct(sku);if(!p){fail++;return}let qty=parseQtySlash(r['SL']||r['Số lượng']||r['So luong']||r.sl,p.pack);if(qty<=0||qty>Number(p.qty||0)){fail++;return}cart.push({sku:p.sku,name:p.name,pack:p.pack,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:Number(r['%CK']||r['CK']||0)||0});ok++});renderCart();toast('Import đơn bán: '+ok+' dòng hợp lệ, '+fail+' dòng lỗi')})}
function downloadProductTemplate(){rowsToSheet([{SKU:'64811767','Tên sản phẩm':'SUNLIGHT NLS TD Thơm Mát Hương Lily & Bách Trà 1kg/12 chai','Nhãn hàng':'Sunlight','Ngành hàng':'Chăm sóc nhà cửa','Kho hàng':'Kho chính','Quy cách':12,'Giá nhập':0,'Giá bán':0}], 'Mau_san_pham_theo_cap')}
function downloadReceiveTemplate(){rowsToSheet([{'Mã phiếu':'PN001','Ngày nhập':'2026-05-20','Nhà cung cấp':'Unilever',SKU:'64811767','Tên sản phẩm':'SUNLIGHT NLS TD Thơm Mát Hương Lily & Bách Trà 1kg/12 chai','Quy cách':12,'SL':'10/0','Giá nhập':0,'Ghi chú':'SL nhập dạng thùng/lẻ. Ví dụ 10/0 = 10 thùng, 0 lẻ'}, {'Mã phiếu':'PN001','Ngày nhập':'2026-05-20','Nhà cung cấp':'Unilever',SKU:'64811768','Tên sản phẩm':'SUNLIGHT NLS TD Thơm Mát Hương Lily & Bách Trà 3.6kg/3 can','Quy cách':3,'SL':'5/0','Giá nhập':0,'Ghi chú':'Có thể nhập 0/5 nếu chỉ có 5 lẻ'}], 'Mau_don_nhap_kho_1_0')}
function downloadCustomerTemplate(){downloadExcel([{'Mã KH':'KH001','Tên KH':'Cửa hàng Minh Anh','Địa chỉ':'Thái Bình','SĐT':'','MST':'','Nhóm khách hàng':'Khách sỉ'}], 'Mau_khach_hang.xlsx')}
function readExcel(file,cb){let reader=new FileReader();reader.onload=e=>{let data=e.target.result, wb;if(file.name.toLowerCase().endsWith('.csv')){wb=XLSX.read(data,{type:'string',codepage:65001})}else{wb=XLSX.read(data,{type:'array'})}let rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});cb(rows)}; if(file.name.toLowerCase().endsWith('.csv'))reader.readAsText(file,'UTF-8');else reader.readAsArrayBuffer(file)}
function importProducts(e){let f=e.target.files[0];if(!f)return;readExcel(f,rows=>{let n=0;rows.forEach(r=>{let sku=r.SKU||r.sku||r['Mã SP'];if(!sku)return;upsertProduct({sku,name:r['Tên sản phẩm']||r.Ten||r['Tên']||r.name,brand:r['Nhãn hàng']||r['Nhan hang']||r.brand||r.nhanHang,category:r['Ngành hàng']||r['Nganh hang']||r.category||r.nganhHang,warehouse:r['Kho hàng']||r['Kho hang']||r.warehouse||r.khoHang,pack:r['Quy cách']||r.pack,cost:r['Giá nhập']||r.cost,sale:r['Giá bán']||r.sale});n++});save();render();toast('Đã import '+n+' sản phẩm')})}
function importReceive(e){let f=e.target.files[0];if(!f)return;readExcel(f,rows=>{let groups={};rows.forEach(r=>{let sku=r.SKU||r.sku;if(!sku)return;let pack=Number(r['Quy cách']||r.pack)||1;let qty=0;let sl=r['SL']||r['Số lượng']||r['So luong']||r['sl']; if(sl!==undefined&&sl!=='') qty=parseQtySlash(sl,pack); else qty=totalQty(r['Thùng']||r.thung,r['Lẻ']||r.le,pack);if(qty<=0)return;let id=String(r['Mã phiếu']||r['Mã đơn']||r['Số phiếu']||receiptId()).trim(); if(!groups[id])groups[id]={id,date:r['Ngày nhập']||r['Ngày']||today(),supplier:r['Nhà cung cấp']||r.NCC||'Unilever',note:r['Ghi chú']||'',items:[]}; groups[id].items.push({sku:String(sku),name:r['Tên sản phẩm']||r['Tên']||r.name,brand:r['Nhãn hàng']||r['Nhan hang']||r.brand||'',category:r['Ngành hàng']||r['Nganh hang']||r.category||'',warehouse:r['Kho hàng']||r['Kho hang']||r.warehouse||'Kho chính',pack,qty,cost:Number(r['Giá nhập']||0)})}); let n=0;Object.values(groups).forEach(g=>{g.items.forEach(it=>{let p=upsertProduct({sku:it.sku,name:it.name,brand:it.brand,category:it.category,warehouse:it.warehouse,pack:it.pack,cost:it.cost});p.qty+=it.qty;p.cost=Number(it.cost)||p.cost});g.total=g.items.reduce((a,b)=>a+b.qty*b.cost,0);db.receipts.push(g);n++});save();render();toast('Đã import '+n+' phiếu nhập theo mẫu 1/0')})}
function importCustomers(e){let f=e.target.files[0];if(!f)return;readExcel(f,rows=>{let n=0;rows.forEach(r=>{let code=r['Mã KH']||r.ma||r.code;if(!code)return;let c=db.customers.find(x=>x.code==code);let data={code:String(code),name:r['Tên KH']||r['Tên']||r.name,address:r['Địa chỉ']||r.address,phone:r['SĐT']||r.phone,tax:r.MST||r.tax,customerGroup:String(r['Nhóm khách hàng']||r.customerGroup||r.group||'').trim()};if(c)Object.assign(c,data);else db.customers.push(data);n++});save();render();toast('Đã import '+n+' khách hàng')})}
function exportProducts(){rowsToSheet(db.products.map(p=>({SKU:p.sku,'Tên sản phẩm':p.name,'Nhãn hàng':productBrand(p),'Ngành hàng':productCategory(p),'Kho hàng':productWarehouse(p),'Quy cách':p.pack,'Tồn':p.qty,'Tồn thùng/lẻ':qtyView(p.qty,p.pack),'Giá nhập':p.cost,'Giá bán':p.sale})),'Danh_sach_san_pham_theo_cap')}
function exportCustomers(){rowsToSheet(db.customers.map(c=>({'Mã KH':c.code,'Tên KH':c.name,'Địa chỉ':c.address,'SĐT':c.phone,MST:c.tax,'Nhóm khách hàng':c.customerGroup||''})),'Danh_sach_khach_hang')}
function exportOrders(){rowsToSheet(db.orders.map(o=>({'Mã đơn':o.id,Ngày:o.date,'Khách hàng':o.customer,'Mã NV':o.staffCode||'','Nhân viên':staffDisplayOrder(o),'Tổng tiền':o.total,'Giá vốn':o.cost,'Lợi nhuận':o.total-o.cost,'Trạng thái gộp':orderMergedText(o),'Mã đơn tổng':o.masterId||''})),'Don_hang')}
function exportStaffReport(){rowsToSheet(buildStaffReportRows().map(r=>({'Mã NV':r.code,'Nhân viên':r.name,'Số đơn':r.orders,'Số dòng hàng':r.lines,'Doanh thu':r.revenue,'Giá vốn':r.cost,'Lợi nhuận tạm tính':r.profit})),'Bao_cao_doanh_so_nhan_vien')}
function clearReportFilter(){rpFrom.value='';rpTo.value='';render()}
function backupData(){let blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kho-pro-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click()}
function restoreData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=ev=>{try{db=JSON.parse(ev.target.result);save();render();toast('Đã khôi phục dữ liệu')}catch(err){toast('File backup không hợp lệ')}};r.readAsText(f)}
function toggleSettings(){settings.classList.toggle('show');fontBtn.classList.toggle('active')}
function applyFont(v){document.documentElement.style.setProperty('--font',v);localStorage.setItem('kho_font',v)}
applyFont(localStorage.getItem('kho_font')||"'Noto Sans','Segoe UI',Arial,sans-serif");
window.addEventListener('DOMContentLoaded',()=>{
  if(AUTH_TOKEN){setLoginState(true);loadDataFromAPI();}
  else setLoginState(false);
});

// ===== DANH MỤC SẢN PHẨM RIÊNG =====
let editingCatalogSku = null;
function productCatalogRows(){
  const q=normText(document.getElementById('pcSearch')?.value||'');
  const b=normText(document.getElementById('pcBrandFilter')?.value||'');
  const c=normText(document.getElementById('pcCategoryFilter')?.value||'');
  const w=normText(document.getElementById('pcWarehouseFilter')?.value||'');
  const g=normText(document.getElementById('pcGroupFilter')?.value||'');
  return (db.products||[]).filter(p=>{
    if(q && !normText((p.sku||'')+' '+(p.name||'')).includes(q)) return false;
    if(b && !normText(productBrand(p)).includes(b)) return false;
    if(c && !normText(productCategory(p)).includes(c)) return false;
    if(w && !normText(productWarehouse(p)).includes(w)) return false;
    if(g && !normText(p.productGroup||'').includes(g)) return false;
    return true;
  });
}
function renderProductCatalog(){
  const body=document.getElementById('productCatalogBody');
  if(!body) return;
  body.innerHTML=productCatalogRows().map(p=>`<tr>
    <td class="center"><input type="checkbox" class="catalog-delete-check" value="${safeAttr(p.sku)}"></td>
    <td><b>${p.sku||''}</b></td>
    <td>${p.name||''}</td>
    <td>${Number(p.pack)||1}</td>
    <td class="right">${money(p.sale||0)}</td>
    <td>${productBrand(p)||''}</td>
    <td>${productCategory(p)||''}</td>
    <td>${productWarehouse(p)||''}</td>
    <td>${p.productGroup||''}</td>
    <td><button class="btn small light" onclick="editProductCatalog('${safeAttr(p.sku)}')">Sửa</button> <button class="btn small red" onclick="deleteProductCatalog('${safeAttr(p.sku)}')">Xóa</button></td>
  </tr>`).join('') || '<tr><td colspan="10" class="center muted">Chưa có sản phẩm</td></tr>';
  renderGroupCatalog();
  renderLinkedProductLists();
}
function saveProductCatalog(){
  const sku=(document.getElementById('pcSku')?.value||'').trim();
  const name=(document.getElementById('pcName')?.value||'').trim();
  if(!sku || !name) return toast('Thiếu mã sản phẩm hoặc tên sản phẩm');
  let old=findProduct(editingCatalogSku || sku);
  const data={
    sku,
    name,
    pack:Number(document.getElementById('pcPack')?.value||1)||1,
    sale:Number(document.getElementById('pcSale')?.value||0)||0,
    brand:(document.getElementById('pcBrand')?.value||'').trim(),
    category:(document.getElementById('pcCategory')?.value||'').trim(),
    warehouse:(document.getElementById('pcWarehouse')?.value||'Kho chính').trim()||'Kho chính',
    productGroup:(document.getElementById('pcProductGroup')?.value||'').trim()
  };
  if(old){
    old.sku=data.sku; old.name=data.name; old.pack=data.pack; old.sale=data.sale; old.brand=data.brand; old.category=data.category; old.warehouse=data.warehouse; old.productGroup=data.productGroup;
  }else{
    db.products.push({...data,qty:0,cost:0});
  }
  editingCatalogSku=null;
  ['pcSku','pcName','pcBrand','pcCategory','pcProductGroup'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  if(document.getElementById('pcPack')) pcPack.value=12;
  if(document.getElementById('pcSale')) pcSale.value=0;
  if(document.getElementById('pcWarehouse')) pcWarehouse.value='Kho chính';
  save(); render(); toast('Đã lưu sản phẩm');
}
function editProductCatalog(sku){
  const p=findProduct(sku); if(!p)return;
  editingCatalogSku=sku;
  pcSku.value=p.sku||''; pcName.value=p.name||''; pcPack.value=Number(p.pack)||1; pcSale.value=Number(p.sale)||0;
  pcBrand.value=productBrand(p)||''; pcCategory.value=productCategory(p)||''; pcWarehouse.value=productWarehouse(p)||'Kho chính';
  if(document.getElementById('pcProductGroup')) pcProductGroup.value=p.productGroup||'';
  toast('Đang sửa '+sku);
}
function deleteProductCatalog(sku){
  if(!confirm('Xóa sản phẩm '+sku+'?'))return;
  db.products=(db.products||[]).filter(p=>String(p.sku)!==String(sku));
  save(); render();
}
function bulkDeleteProductCatalog(){
  const skus=checkedValues('catalog-delete-check');
  if(!skus.length) return toast('Chưa chọn sản phẩm để xóa');
  if(!confirm('Xóa '+skus.length+' sản phẩm đã chọn trong danh mục?')) return;
  db.products=(db.products||[]).filter(p=>!skus.includes(String(p.sku)));
  save(); render(); toast('Đã xóa '+skus.length+' sản phẩm');
}
function downloadProductCatalogTemplate(){
  downloadExcel([{'Mã sản phẩm':'SKU001','Tên sản phẩm':'Tên hàng mẫu','Quy cách':12,'Giá bán':100000,'Nhãn hàng':'OMO','Ngành hàng':'Giặt giũ','Kho hàng quản lý':'Kho chính','Nhóm sản phẩm':'Nhóm bán chạy'}],'mau_danh_muc_san_pham.xlsx');
}
function parseImportNumber(v){
  if(v===null || v===undefined) return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  let s=String(v).trim();
  if(!s) return 0;
  s=s.replace(/\s+/g,'').replace(/[₫đĐVNĐvnd]/g,'');
  const hasComma=s.includes(','), hasDot=s.includes('.');
  if(hasComma && hasDot){
    // Hỗ trợ cả 1,234.56 và 1.234,56
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(hasComma){
    const parts=s.split(',');
    if(parts.length>1 && parts[parts.length-1].length===3) s=parts.join('');
    else s=s.replace(',','.');
  }else if(hasDot){
    const parts=s.split('.');
    if(parts.length>1 && parts[parts.length-1].length===3) s=parts.join('');
  }
  s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s);
  return isFinite(n) ? n : 0;
}
function pickImportValue(row, keys){
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(row,k) && row[k]!=='' && row[k]!==null && row[k]!==undefined) return row[k];
  }
  const normKey=s=>normText(String(s||'')).replace(/\s+/g,'_');
  const map={};
  Object.keys(row||{}).forEach(k=>map[normKey(k)]=row[k]);
  for(const k of keys){
    const nk=normKey(k);
    if(Object.prototype.hasOwnProperty.call(map,nk) && map[nk]!=='' && map[nk]!==null && map[nk]!==undefined) return map[nk];
  }
  return '';
}
function importProductCatalogExcel(ev){
  const file=ev.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    let count=0, priceCount=0;
    rows.forEach(r=>{
      const sku=String(pickImportValue(r,['ma_san_pham','Mã sản phẩm','Mã SP','SKU','sku','Code','Mã hàng','Ma hang'])||'').trim();
      if(!sku) return;
      let p=findProduct(sku);
      const rawSale=pickImportValue(r,['gia_ban','Giá bán','Gia ban','Giá bán chưa KM','Gia ban chua KM','Đơn giá bán','Don gia ban','Giá','Gia','sale','price']);
      const rawPack=pickImportValue(r,['quy_cach','Quy cách','Quy cach','pack']);
      const sale=parseImportNumber(rawSale);
      if(rawSale!=='' && sale>0) priceCount++;
      const data={
        sku,
        name:String(pickImportValue(r,['ten_san_pham','Tên sản phẩm','Ten san pham','name','Tên hàng','Ten hang'])||'').trim(),
        pack:parseImportNumber(rawPack)||1,
        sale,
        brand:String(pickImportValue(r,['nhan_hang','Nhãn hàng','Nhan hang','brand'])||'').trim(),
        category:String(pickImportValue(r,['nganh_hang','Ngành hàng','Nganh hang','category'])||'').trim(),
        warehouse:String(pickImportValue(r,['kho_hang_quan_ly','Kho hàng quản lý','Kho hang quan ly','Kho hàng','Kho hang','warehouse'])||'Kho chính').trim()||'Kho chính',
        productGroup:String(pickImportValue(r,['nhom_san_pham','Nhóm sản phẩm','Nhom san pham','productGroup'])||'').trim()
      };
      if(!p) db.products.push({...data,qty:0,cost:0});
      else Object.assign(p,data);
      count++;
    });
    save(); render(); toast('Đã import '+count+' sản phẩm · nhận giá bán '+priceCount+' dòng');
    ev.target.value='';
  };
  reader.readAsArrayBuffer(file);
}
function exportProductCatalog(){
  const rows=(db.products||[]).map(p=>({'Mã sản phẩm':p.sku,'Tên sản phẩm':p.name,'Quy cách':p.pack,'Giá bán':p.sale,'Nhãn hàng':productBrand(p),'Ngành hàng':productCategory(p),'Kho hàng quản lý':productWarehouse(p),'Nhóm sản phẩm':p.productGroup||''}));
  if(!rows.length)return toast('Chưa có sản phẩm để xuất');
  downloadExcel(rows,'danh_muc_san_pham.xlsx');
}
function saveProductGroup(){
  db.productGroups=Array.isArray(db.productGroups)?db.productGroups:[];
  const name=(document.getElementById('pgName')?.value||'').trim();
  const skus=(document.getElementById('pgSkus')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!name || !skus.length) return toast('Thiếu tên nhóm sản phẩm hoặc danh sách mã');
  const old=db.productGroups.find(g=>normText(g.name)===normText(name));
  if(old) old.skus=skus; else db.productGroups.push({id:'PG'+Date.now(),name,skus});
  db.products.forEach(p=>{if(skus.includes(String(p.sku))) p.productGroup=name;});
  pgName.value=''; pgSkus.value='';
  save(); render(); toast('Đã lưu nhóm sản phẩm');
}
function saveCategoryGroup(){
  db.categoryGroups=Array.isArray(db.categoryGroups)?db.categoryGroups:[];
  const name=(document.getElementById('cgName')?.value||'').trim();
  const categories=(document.getElementById('cgCategories')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!name || !categories.length) return toast('Thiếu tên nhóm ngành hàng hoặc danh sách ngành');
  const old=db.categoryGroups.find(g=>normText(g.name)===normText(name));
  if(old) old.categories=categories; else db.categoryGroups.push({id:'CG'+Date.now(),name,categories});
  cgName.value=''; cgCategories.value='';
  save(); render(); toast('Đã lưu nhóm ngành hàng');
}
function renderGroupCatalog(){
  const body=document.getElementById('groupCatalogBody'); if(!body) return;
  const rows=[
    ...(db.productGroups||[]).map(g=>({type:'Nhóm sản phẩm',id:g.id,name:g.name,list:(g.skus||[]).join(', '),kind:'product'})),
    ...(db.categoryGroups||[]).map(g=>({type:'Nhóm ngành hàng',id:g.id,name:g.name,list:(g.categories||[]).join(', '),kind:'category'}))
  ];
  body.innerHTML=rows.map(g=>`<tr><td>${g.type}</td><td><b>${g.name}</b></td><td>${g.list}</td><td><button class="btn small red" onclick="deleteCatalogGroup('${g.kind}','${g.id}')">Xóa</button></td></tr>`).join('')||'<tr><td colspan="4" class="center muted">Chưa có nhóm</td></tr>';
}
function deleteCatalogGroup(kind,id){
  if(!confirm('Xóa nhóm này?')) return;
  if(kind==='product') db.productGroups=(db.productGroups||[]).filter(g=>g.id!==id);
  if(kind==='category') db.categoryGroups=(db.categoryGroups||[]).filter(g=>g.id!==id);
  save(); render();
}

// ===== CẢNH BÁO CODE HÀNG MỚI KHI IMPORT ĐƠN =====
let pendingNewProductCodes=[];
function detectUnknownProductCodesFromRows(rows){
  const found=[];
  rows.forEach(r=>{
    const sku=String(r.SKU||r.sku||r['Mã hàng']||r['Mã sản phẩm']||r.ma_san_pham||r.code||'').trim();
    if(sku && !findProduct(sku) && !found.includes(sku)) found.push(sku);
  });
  return found;
}
function openNewProductCodeModal(codes){
  pendingNewProductCodes=codes.map(sku=>({sku,name:'',pack:12,sale:0,brand:'',category:'',warehouse:'Kho chính'}));
  let old=document.getElementById('newProductCodeModal');
  if(old) old.remove();
  const div=document.createElement('div');
  div.className='modal show';
  div.id='newProductCodeModal';
  div.innerHTML=`<div class="search-modal-box">
    <div class="panel-head"><div><h2>Phát hiện code hàng mới</h2><div class="muted">Điền thông tin cần thiết cho từng mã rồi bấm lưu. Sau đó có thể import lại đơn.</div></div><button class="btn light" onclick="closeNewProductCodeModal()">Đóng</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Quy cách</th><th>Giá bán</th><th>Nhãn hàng</th><th>Ngành hàng</th><th>Kho hàng</th></tr></thead><tbody>
    ${pendingNewProductCodes.map((p,i)=>`<tr>
      <td><b>${p.sku}</b></td>
      <td><input id="np_name_${i}" placeholder="Tên sản phẩm"></td>
      <td><input id="np_pack_${i}" type="number" value="12"></td>
      <td><input id="np_sale_${i}" type="number" value="0"></td>
      <td><input id="np_brand_${i}"></td>
      <td><input id="np_category_${i}"></td>
      <td><input id="np_warehouse_${i}" value="Kho chính"></td>
    </tr>`).join('')}
    </tbody></table></div><br>
    <button class="btn green" onclick="saveNewProductCodes()">Lưu các code mới</button>
  </div>`;
  document.body.appendChild(div);
}
function closeNewProductCodeModal(){const m=document.getElementById('newProductCodeModal'); if(m)m.remove();}
function saveNewProductCodes(){
  pendingNewProductCodes.forEach((p,i)=>{
    if(findProduct(p.sku)) return;
    db.products.push({
      sku:p.sku,
      name:(document.getElementById('np_name_'+i)?.value||p.sku).trim(),
      pack:Number(document.getElementById('np_pack_'+i)?.value||12)||12,
      sale:Number(document.getElementById('np_sale_'+i)?.value||0)||0,
      brand:(document.getElementById('np_brand_'+i)?.value||'').trim(),
      category:(document.getElementById('np_category_'+i)?.value||'').trim(),
      warehouse:(document.getElementById('np_warehouse_'+i)?.value||'Kho chính').trim()||'Kho chính',
      qty:0,
      cost:0
    });
  });
  save(); render(); closeNewProductCodeModal(); toast('Đã lưu code hàng mới');
}


// ===== KHUYẾN MẠI =====
let currentPromoType='product';
function promoTypeText(t){return {product:'Khuyến mại theo sản phẩm',productGroup:'Khuyến mại theo nhóm sản phẩm'}[t]||t;}

function ensureCustomerGroups(){
  db.customerGroups=Array.isArray(db.customerGroups)?db.customerGroups:[];
  db.customers=Array.isArray(db.customers)?db.customers:[];
}
function customerGroupNames(){
  ensureCustomerGroups();
  return uniqueList([...(db.customerGroups||[]).map(g=>g.name),...(db.customers||[]).map(c=>c.customerGroup||'')]);
}
function renderCustomerGroups(){
  ensureCustomerGroups();
  const body=document.getElementById('customerGroupBody');
  if(body){
    body.innerHTML=db.customerGroups.map(g=>`<tr><td><b>${g.name||''}</b></td><td>${(g.codes||[]).join(', ')}</td><td><button class="btn small light" onclick="editCustomerGroup('${safeAttr(g.id)}')">Sửa</button> <button class="btn small red" onclick="deleteCustomerGroup('${safeAttr(g.id)}')">Xóa</button></td></tr>`).join('')||'<tr><td colspan="3" class="center muted">Chưa có nhóm khách hàng</td></tr>';
  }
  fillDatalist('customerGroupList',customerGroupNames());
}
function saveCustomerGroup(){
  ensureCustomerGroups();
  const name=(document.getElementById('customerGroupName')?.value||'').trim();
  const codes=String(document.getElementById('customerGroupCodes')?.value||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  if(!name || !codes.length) return toast('Thiếu tên nhóm hoặc danh sách mã KH');
  let old=db.customerGroups.find(g=>normText(g.name)===normText(name));
  if(old) old.codes=codes; else db.customerGroups.push({id:'CGKH'+Date.now(),name,codes});
  db.customers.forEach(c=>{if(codes.includes(String(c.code))) c.customerGroup=name;});
  customerGroupName.value=''; customerGroupCodes.value=''; save(); render(); toast('Đã lưu nhóm khách hàng');
}
function editCustomerGroup(id){
  ensureCustomerGroups(); const g=db.customerGroups.find(x=>x.id===id); if(!g)return;
  customerGroupName.value=g.name||''; customerGroupCodes.value=(g.codes||[]).join(', '); page('customers');
}
function deleteCustomerGroup(id){
  if(!confirm('Xóa nhóm khách hàng này?'))return;
  ensureCustomerGroups(); const g=db.customerGroups.find(x=>x.id===id);
  db.customerGroups=db.customerGroups.filter(x=>x.id!==id);
  if(g) db.customers.forEach(c=>{if(c.customerGroup===g.name)c.customerGroup='';});
  save(); render();
}
function downloadCustomerGroupTemplate(){
  downloadExcel([
    {'Tên nhóm khách hàng':'Khách sỉ','Danh sách mã KH':'KH001'},
    {'Tên nhóm khách hàng':'Khách sỉ','Danh sách mã KH':'KH002'},
    {'Tên nhóm khách hàng':'Khách sỉ','Danh sách mã KH':'KH003'},
    {'Tên nhóm khách hàng':'Khách tuyến 1','Danh sách mã KH':'KH101'},
    {'Tên nhóm khách hàng':'Khách tuyến 1','Danh sách mã KH':'KH102'}
  ],'mau_nhom_khach_hang.xlsx');
}
function collectGroupedRows(rows, nameKeys, itemKeys){
  const grouped={};
  rows.forEach(r=>{
    const name=String(nameKeys.map(k=>r[k]).find(v=>v!==undefined && v!==null && String(v).trim()!=='')||'').trim();
    const raw=String(itemKeys.map(k=>r[k]).find(v=>v!==undefined && v!==null && String(v).trim()!=='')||'').trim();
    if(!name || !raw) return;
    const parts=raw.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
    if(!grouped[name]) grouped[name]=[];
    parts.forEach(x=>{ if(!grouped[name].includes(x)) grouped[name].push(x); });
  });
  return grouped;
}
function importCustomerGroupExcel(ev){
  const file=ev.target.files[0]; if(!file)return;
  readExcel(file,rows=>{
    ensureCustomerGroups();
    const grouped=collectGroupedRows(rows,['Tên nhóm khách hàng','ten_nhom_khach_hang','name'],['Danh sách mã KH','Mã khách hàng','ma_khach_hang','danh_sach_ma_kh','codes']);
    let count=0;
    Object.entries(grouped).forEach(([name,codes])=>{
      if(!name||!codes.length)return;
      const old=db.customerGroups.find(g=>normText(g.name)===normText(name));
      if(old){
        old.codes=[...new Set([...(old.codes||[]),...codes])];
      }else{
        db.customerGroups.push({id:'CGKH'+Date.now()+count,name,codes});
      }
      db.customers.forEach(c=>{if(codes.includes(String(c.code))) c.customerGroup=name;});
      count++;
    });
    save(); render(); toast('Đã import '+count+' nhóm khách hàng'); ev.target.value='';
  });
}
function setPromoType(t){
  currentPromoType=t;
  document.querySelectorAll('[data-promo-type]').forEach(b=>b.classList.toggle('active',b.dataset.promoType===t));
  const productForm=document.getElementById('promoProductForm');
  const groupForm=document.getElementById('promoGroupForm');
  const customerGroupForm=document.getElementById('promoCustomerGroupForm');
  if(productForm) productForm.classList.toggle('hidden',t!=='product');
  if(groupForm) groupForm.classList.toggle('hidden',t!=='productGroup');
  if(customerGroupForm) customerGroupForm.classList.toggle('hidden',t!=='customerGroup');
  renderLinkedProductLists();
}
function uniqueList(arr){return [...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'))}
function fillDatalist(id,items,labelFn){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=items.map(x=>`<option value="${safeAttr(typeof x==='string'?x:x.value)}">${labelFn?labelFn(x):safeAttr(typeof x==='string'?x:x.label||x.value)}</option>`).join('');
}
function renderLinkedProductLists(){
  const products=db.products||[];
  fillDatalist('productSkuList',products.map(p=>({value:p.sku,label:(p.sku||'')+' - '+(p.name||'')})),x=>safeAttr(x.label));
  fillDatalist('brandList',uniqueList(products.map(p=>productBrand(p))));
  fillDatalist('categoryList',uniqueList(products.map(p=>productCategory(p))));
  fillDatalist('productGroupList',uniqueList([...(products.map(p=>p.productGroup||'')),...((db.productGroups||[]).map(g=>g.name))]));
  fillDatalist('categoryGroupList',uniqueList((db.categoryGroups||[]).map(g=>g.name)));
  fillDatalist('customerGroupList',customerGroupNames());
}
function getProductNameBySku(sku){
  const p=findProduct(sku);
  return p ? (p.name||'') : '';
}
function ensurePromotionArrays(){
  db.productPromotions=Array.isArray(db.productPromotions)?db.productPromotions:[];
  db.groupPromotions=Array.isArray(db.groupPromotions)?db.groupPromotions:[];
  db.customerGroupPromotions=Array.isArray(db.customerGroupPromotions)?db.customerGroupPromotions:[];
  db.promotions=Array.isArray(db.promotions)?db.promotions:[];

  // Tự chuyển dữ liệu khuyến mại kiểu cũ trong db.promotions sang 3 danh sách mới
  // để import xong luôn hiện ở bảng bên dưới, kể cả khi server cũ chỉ lưu mảng promotions.
  db.promotions.forEach((p,idx)=>{
    const kind=String(p.kind||p.type||p.promoType||'').trim();
    const code=String(p.code||p.maKhuyenMai||p['Mã khuyến mại']||p.id||('KM'+idx)).trim();
    const content=String(p.content||p.noiDung||p.description||p['Nội dung khuyến mại']||'').trim();

    if(kind==='product' || p.sku || p.productCode || p.targetSku || p.maSanPham){
      const sku=String(p.sku||p.productCode||p.targetSku||p.maSanPham||p.target||'').trim();
      if(sku && !db.productPromotions.some(x=>String(x.code)===code && String(x.sku)===sku)){
        db.productPromotions.push({
          id:p.id||('KMSP_MIG_'+idx),
          code,
          content:content||('Khuyến mại sản phẩm '+sku),
          sku,
          discount:Number(p.discount||p.discountPercent||p.chietKhau||p['% chiết khấu']||0)||0
        });
      }
    }

    if(kind==='productGroup' || kind==='group' || p.groupName || p.productGroupName || p.nhomHang){
      const groupName=String(p.groupName||p.productGroupName||p.nhomHang||p.target||'').trim();
      if(groupName && !db.groupPromotions.some(x=>String(x.code)===code && normText(x.groupName)===normText(groupName))){
        db.groupPromotions.push({
          id:p.id||('KMN_MIG_'+idx),
          code,
          content:content||('Khuyến mại nhóm '+groupName),
          groupName,
          applyAmount:Number(p.applyAmount||p.minAmount||p.giaTriCanMua||0)||0,
          discountPercent:Number(p.discountPercent||p.discount||p.chietKhau||0)||0,
          discountAmount:Number(p.discountAmount||p.amount||p.giaTriGiamGia||0)||0
        });
      }
    }

    if(kind==='customerGroup' || p.customerGroupName || p.nhomKhachHang){
      const customerGroupName=String(p.customerGroupName||p.nhomKhachHang||p.target||'').trim();
      if(customerGroupName && !db.customerGroupPromotions.some(x=>String(x.code)===code && normText(x.customerGroupName)===normText(customerGroupName))){
        db.customerGroupPromotions.push({
          id:p.id||('KMKH_MIG_'+idx),
          code,
          content:content||('Khuyến mại nhóm khách hàng '+customerGroupName),
          customerGroupName,
          applyAmount:Number(p.applyAmount||p.minAmount||p.giaTriCanMua||0)||0,
          discountPercent:Number(p.discountPercent||p.discount||p.chietKhau||0)||0,
          discountAmount:Number(p.discountAmount||p.amount||p.giaTriGiamGia||0)||0
        });
      }
    }
  });
}
function rebuildLegacyPromotions(){
  ensurePromotionArrays();
  db.promotions=[
    ...db.productPromotions.map(k=>({id:k.id,kind:'product',code:k.code,content:k.content,target:k.sku,discount:k.discount})),
    ...db.groupPromotions.map(k=>({id:k.id,kind:'productGroup',code:k.code,content:k.content,target:k.groupName,applyAmount:k.applyAmount,discountPercent:k.discountPercent,discountAmount:k.discountAmount})),
    ...db.customerGroupPromotions.map(k=>({id:k.id,kind:'customerGroup',code:k.code,content:k.content,target:k.customerGroupName,applyAmount:k.applyAmount,discountPercent:k.discountPercent,discountAmount:k.discountAmount}))
  ];
}
function saveProductPromotion(){
  ensurePromotionArrays();
  const code=(document.getElementById('promoProductCode')?.value||'').trim();
  const content=(document.getElementById('promoProductContent')?.value||'').trim();
  const sku=(document.getElementById('promoProductSku')?.value||'').trim();
  const discount=Number(document.getElementById('promoProductDiscount')?.value||0)||0;
  if(!code || !content || !sku) return toast('Thiếu mã KM, nội dung KM hoặc mã sản phẩm');
  const old=db.productPromotions.find(k=>String(k.code)===code && String(k.sku)===String(sku));
  const data={id:old?.id||('KMSP'+Date.now()),code,content,sku,discount};
  if(old) Object.assign(old,data); else db.productPromotions.push(data);
  ['promoProductCode','promoProductContent','promoProductSku'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  if(document.getElementById('promoProductDiscount')) promoProductDiscount.value=0;
  rebuildLegacyPromotions(); save(); render(); toast('Đã lưu khuyến mại sản phẩm');
}
function saveGroupPromotion(){
  ensurePromotionArrays();
  const code=(document.getElementById('promoGroupCode')?.value||'').trim();
  const content=(document.getElementById('promoGroupContent')?.value||'').trim();
  const groupName=(document.getElementById('promoGroupName')?.value||'').trim();
  const applyAmount=Number(document.getElementById('promoGroupApplyAmount')?.value||0)||0;
  const discountPercent=Number(document.getElementById('promoGroupDiscountPercent')?.value||0)||0;
  const discountAmount=Number(document.getElementById('promoGroupDiscountAmount')?.value||0)||0;
  if(!code || !content || !groupName) return toast('Thiếu mã KM, nội dung KM hoặc nhóm hàng');
  const old=db.groupPromotions.find(k=>String(k.code)===code && normText(k.groupName)===normText(groupName));
  const data={id:old?.id||('KMN'+Date.now()),code,content,groupName,applyAmount,discountPercent,discountAmount};
  if(old) Object.assign(old,data); else db.groupPromotions.push(data);
  ['promoGroupCode','promoGroupContent','promoGroupName'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  if(document.getElementById('promoGroupApplyAmount')) promoGroupApplyAmount.value=0;
  if(document.getElementById('promoGroupDiscountPercent')) promoGroupDiscountPercent.value=0;
  if(document.getElementById('promoGroupDiscountAmount')) promoGroupDiscountAmount.value=0;
  rebuildLegacyPromotions(); save(); render(); toast('Đã lưu khuyến mại nhóm sản phẩm');
}
function groupPromoDescription(k){
  const percent=Number(k.discountPercent||0)||0;
  const amount=Number(k.discountAmount||0)||0;
  let parts=[];
  if(percent>0) parts.push(`chiết khấu ${percent}%`);
  if(amount>0) parts.push(`giảm ${money(amount)}`);
  return `Mua nhóm ${k.groupName||''} đạt ${money(k.applyAmount||0)} sẽ được ${parts.join(' và ')||'khuyến mại'}`;
}
function renderPromotions(){
  ensurePromotionArrays();
  const productBody=document.getElementById('productPromotionBody');
  if(productBody){
    productBody.innerHTML=db.productPromotions.map(k=>`<tr>
      <td><b>${k.code||''}</b></td>
      <td>${k.content||''}</td>
      <td>${k.sku||''}</td>
      <td>${getProductNameBySku(k.sku)||''}</td>
      <td class="right">${Number(k.discount||0)}%</td>
      <td><button class="btn small red" onclick="deleteProductPromotion('${k.id}')">Xóa</button></td>
    </tr>`).join('')||'<tr><td colspan="6" class="center muted">Chưa có khuyến mại sản phẩm</td></tr>';
  }
  const groupBody=document.getElementById('groupPromotionBody');
  if(groupBody){
    groupBody.innerHTML=db.groupPromotions.map(k=>`<tr>
      <td><b>${k.code||''}</b></td>
      <td>${k.content||''}</td>
      <td>${k.groupName||''}</td>
      <td class="right">${money(k.applyAmount||0)}</td>
      <td class="right">${Number(k.discountPercent||0)}%</td>
      <td class="right">${money(k.discountAmount||0)}</td>
      <td>${groupPromoDescription(k)}</td>
      <td><button class="btn small red" onclick="deleteGroupPromotion('${k.id}')">Xóa</button></td>
    </tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có khuyến mại nhóm sản phẩm</td></tr>';
  }
  const customerGroupBody=document.getElementById('customerGroupPromotionBody');
  if(customerGroupBody){
    customerGroupBody.innerHTML=(db.customerGroupPromotions||[]).map(k=>`<tr>
      <td><b>${k.code||''}</b></td>
      <td>${k.content||''}</td>
      <td>${k.customerGroupName||''}</td>
      <td class="right">${money(k.applyAmount||0)}</td>
      <td class="right">${Number(k.discountPercent||0)}%</td>
      <td class="right">${money(k.discountAmount||0)}</td>
      <td>${customerGroupPromoDescription(k)}</td>
      <td><button class="btn small red" onclick="deleteCustomerGroupPromotion('${k.id}')">Xóa</button></td>
    </tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có khuyến mại nhóm khách hàng</td></tr>';
  }
  const legacyBody=document.getElementById('promotionBody');
  if(legacyBody) legacyBody.innerHTML='';
  renderLinkedProductLists();
}
function deleteProductPromotion(id){
  if(!confirm('Xóa khuyến mại sản phẩm này?'))return;
  db.productPromotions=(db.productPromotions||[]).filter(k=>k.id!==id);
  rebuildLegacyPromotions(); save(); render();
}
function deleteGroupPromotion(id){
  if(!confirm('Xóa khuyến mại nhóm sản phẩm này?'))return;
  db.groupPromotions=(db.groupPromotions||[]).filter(k=>k.id!==id);
  rebuildLegacyPromotions(); save(); render();
}

function saveCustomerGroupPromotion(){
  ensurePromotionArrays();
  const code=(document.getElementById('promoCustomerGroupCode')?.value||'').trim();
  const content=(document.getElementById('promoCustomerGroupContent')?.value||'').trim();
  const customerGroupName=(document.getElementById('promoCustomerGroupName')?.value||'').trim();
  const applyAmount=Number(document.getElementById('promoCustomerGroupApplyAmount')?.value||0)||0;
  const discountPercent=Number(document.getElementById('promoCustomerGroupDiscountPercent')?.value||0)||0;
  const discountAmount=Number(document.getElementById('promoCustomerGroupDiscountAmount')?.value||0)||0;
  if(!code || !content || !customerGroupName) return toast('Thiếu mã KM, nội dung KM hoặc nhóm khách hàng');
  const old=db.customerGroupPromotions.find(k=>String(k.code)===code && normText(k.customerGroupName)===normText(customerGroupName));
  const data={id:old?.id||('KMKH'+Date.now()),code,content,customerGroupName,applyAmount,discountPercent,discountAmount};
  if(old) Object.assign(old,data); else db.customerGroupPromotions.push(data);
  ['promoCustomerGroupCode','promoCustomerGroupContent','promoCustomerGroupName'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
  if(document.getElementById('promoCustomerGroupApplyAmount')) promoCustomerGroupApplyAmount.value=0;
  if(document.getElementById('promoCustomerGroupDiscountPercent')) promoCustomerGroupDiscountPercent.value=0;
  if(document.getElementById('promoCustomerGroupDiscountAmount')) promoCustomerGroupDiscountAmount.value=0;
  rebuildLegacyPromotions(); save(); render(); toast('Đã lưu khuyến mại nhóm khách hàng');
}
function customerGroupPromoDescription(k){
  const percent=Number(k.discountPercent||0)||0;
  const amount=Number(k.discountAmount||0)||0;
  let parts=[];
  if(percent>0) parts.push(`chiết khấu ${percent}%`);
  if(amount>0) parts.push(`giảm ${money(amount)}`);
  return `Khách thuộc nhóm ${k.customerGroupName||''} mua đạt ${money(k.applyAmount||0)} sẽ được ${parts.join(' và ')||'khuyến mại'}`;
}
function deleteCustomerGroupPromotion(id){
  if(!confirm('Xóa khuyến mại nhóm khách hàng này?'))return;
  db.customerGroupPromotions=(db.customerGroupPromotions||[]).filter(k=>k.id!==id);
  rebuildLegacyPromotions(); save(); render();
}
function downloadCustomerGroupPromotionTemplate(){
  downloadExcel([
    {'Mã khuyến mại':'KMKH001','Nội dung khuyến mại':'Khách sỉ đạt giá trị được giảm','Nhóm khách hàng được khuyến mại':'Khách sỉ','Giá trị cần mua':1000000,'% chiết khấu':2,'Giá trị giảm giá':30000}
  ],'mau_khuyen_mai_theo_nhom_khach_hang.xlsx');
}
function downloadProductPromotionTemplate(){
  downloadExcel([
    {'Mã khuyến mại':'KM001','Nội dung khuyến mại':'Chiết khấu sản phẩm OMO','Mã sản phẩm':'SKU001','% chiết khấu':5}
  ],'mau_khuyen_mai_theo_san_pham.xlsx');
}
function downloadGroupPromotionTemplate(){
  downloadExcel([
    {'Mã khuyến mại':'KMG001','Nội dung khuyến mại':'Mua nhóm OMO đạt giá trị','Nhóm hàng được khuyến mại':'Nhóm OMO','Giá trị cần mua':1000000,'% chiết khấu':3,'Giá trị giảm giá':50000}
  ],'mau_khuyen_mai_theo_nhom_san_pham.xlsx');
}

function normalizeExcelKeyName(v){
  return String(v||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g,'')
    .trim();
}
function promoCell(row, aliases, fallback=''){
  if(!row || typeof row!=='object') return fallback;
  const map={};
  Object.keys(row).forEach(k=>{map[normalizeExcelKeyName(k)]=row[k];});
  for(const a of aliases){
    const key=normalizeExcelKeyName(a);
    if(Object.prototype.hasOwnProperty.call(map,key) && map[key]!==undefined && map[key]!==null && String(map[key]).trim()!=='') return map[key];
  }
  return fallback;
}
function promoText(row, aliases, fallback=''){
  return String(promoCell(row,aliases,fallback)||'').trim();
}
function promoNumber(row, aliases, fallback=0){
  let v=promoCell(row,aliases,fallback);
  if(v===undefined || v===null || v==='') return Number(fallback)||0;
  if(typeof v==='string'){
    v=v.trim().replace(/%/g,'').replace(/\s/g,'');
    if(v.includes(',') && !v.includes('.')) v=v.replace(',','.');
    v=v.replace(/,/g,'');
  }
  const n=Number(v);
  return Number.isFinite(n) ? n : (Number(fallback)||0);
}
function promoAutoCode(prefix,count){
  return prefix + Date.now() + String(count).padStart(3,'0');
}
function importPromotionRows(file, handler, done){
  if(!file) return;
  readExcel(file, rows=>{
    ensurePromotionArrays();
    let count=0, skip=0;
    (rows||[]).forEach((r,idx)=>{
      try{
        const ok=handler(r,idx,count);
        if(ok) count++; else skip++;
      }catch(err){
        console.error('Lỗi import KM dòng',idx+2,err,r);
        skip++;
      }
    });

    // Sau khi import: dựng lại mảng legacy, lưu, render lại ngay bảng KM.
    rebuildLegacyPromotions();
    save();
    render();
    renderPromotions();
    page('promotions');

    if(typeof done==='function') done(count,skip,rows||[]);
  });
}
function importProductPromotionExcel(ev){
  const file=ev.target.files[0];
  importPromotionRows(file,(r,idx,count)=>{
    const sku=promoText(r,['Mã sản phẩm','Ma san pham','Mã SP','Ma SP','SKU','Mã hàng','Ma hang','Mã hàng hóa','Ma hang hoa','Product Code','ProductCode','Item Code','ItemCode']);
    if(!sku) return false;
    const code=promoText(r,['Mã khuyến mại','Ma khuyen mai','Mã KM','Ma KM','Mã CTKM','Ma CTKM','CTKM','Code','Promotion Code','PromotionCode','Campaign Code'],promoAutoCode('KMSP',count));
    const content=promoText(r,['Nội dung khuyến mại','Noi dung khuyen mai','Nội dung KM','Noi dung KM','Tên khuyến mại','Ten khuyen mai','Tên KM','Ten KM','Mô tả','Mo ta','Content','Description'],`Khuyến mại sản phẩm ${sku}`);
    const discount=promoNumber(r,['% chiết khấu','% chiet khau','Chiết khấu %','Chiet khau %','CK %','%CK','CK','Discount','DiscountPercent','discountPercent'],0);
    const old=db.productPromotions.find(k=>String(k.code)===String(code) && String(k.sku)===String(sku));
    const data={id:old?.id||('KMSP'+Date.now()+count),code,content,sku,discount};
    if(old) Object.assign(old,data); else db.productPromotions.push(data);
    return true;
  },(count,skip)=>{
    toast(count>0 ? `✅ Đã import ${count} dòng KM sản phẩm${skip?`, bỏ qua ${skip} dòng lỗi`:''}` : '❌ Không import được KM sản phẩm. Kiểm tra cột SKU/Mã sản phẩm');
    ev.target.value='';
  });
}
function importGroupPromotionExcel(ev){
  const file=ev.target.files[0];
  importPromotionRows(file,(r,idx,count)=>{
    const groupName=promoText(r,['Nhóm hàng được khuyến mại','Nhom hang duoc khuyen mai','Nhóm sản phẩm','Nhom san pham','Nhóm hàng','Nhom hang','Product Group','ProductGroup','Group Name','GroupName']);
    if(!groupName) return false;
    const code=promoText(r,['Mã khuyến mại','Ma khuyen mai','Mã KM','Ma KM','Mã CTKM','Ma CTKM','CTKM','Code','Promotion Code','PromotionCode','Campaign Code'],promoAutoCode('KMN',count));
    const content=promoText(r,['Nội dung khuyến mại','Noi dung khuyen mai','Nội dung KM','Noi dung KM','Tên khuyến mại','Ten khuyen mai','Tên KM','Ten KM','Mô tả','Mo ta','Content','Description'],`Khuyến mại nhóm ${groupName}`);
    const applyAmount=promoNumber(r,['Giá trị cần mua','Gia tri can mua','Giá trị áp dụng','Gia tri ap dung','Mức mua','Muc mua','Doanh số','Doanh so','Apply Amount','ApplyAmount','Min Amount','MinAmount'],0);
    const discountPercent=promoNumber(r,['% chiết khấu','% chiet khau','Chiết khấu %','Chiet khau %','CK %','%CK','CK','Discount Percent','DiscountPercent','discountPercent'],0);
    const discountAmount=promoNumber(r,['Giá trị giảm giá','Gia tri giam gia','Số tiền giảm','So tien giam','Tiền giảm','Tien giam','Giảm tiền','Giam tien','Discount Amount','DiscountAmount','Amount'],0);
    const old=db.groupPromotions.find(k=>String(k.code)===String(code) && normText(k.groupName)===normText(groupName));
    const data={id:old?.id||('KMN'+Date.now()+count),code,content,groupName,applyAmount,discountPercent,discountAmount};
    if(old) Object.assign(old,data); else db.groupPromotions.push(data);
    if(!db.productGroups.find(g=>normText(g.name)===normText(groupName))) db.productGroups.push({name:groupName,skus:[]});
    return true;
  },(count,skip)=>{
    toast(count>0 ? `✅ Đã import ${count} dòng KM nhóm sản phẩm${skip?`, bỏ qua ${skip} dòng lỗi`:''}` : '❌ Không import được KM nhóm sản phẩm. Kiểm tra cột Nhóm hàng/Nhóm sản phẩm');
    ev.target.value='';
  });
}
function importCustomerGroupPromotionExcel(ev){
  const file=ev.target.files[0];
  importPromotionRows(file,(r,idx,count)=>{
    const customerGroupName=promoText(r,['Nhóm khách hàng được khuyến mại','Nhom khach hang duoc khuyen mai','Nhóm khách hàng','Nhom khach hang','Nhóm KH','Nhom KH','Customer Group','CustomerGroup','Group Name','GroupName']);
    if(!customerGroupName) return false;
    const code=promoText(r,['Mã khuyến mại','Ma khuyen mai','Mã KM','Ma KM','Mã CTKM','Ma CTKM','CTKM','Code','Promotion Code','PromotionCode','Campaign Code'],promoAutoCode('KMKH',count));
    const content=promoText(r,['Nội dung khuyến mại','Noi dung khuyen mai','Nội dung KM','Noi dung KM','Tên khuyến mại','Ten khuyen mai','Tên KM','Ten KM','Mô tả','Mo ta','Content','Description'],`Khuyến mại nhóm khách hàng ${customerGroupName}`);
    const applyAmount=promoNumber(r,['Giá trị cần mua','Gia tri can mua','Giá trị áp dụng','Gia tri ap dung','Mức mua','Muc mua','Doanh số','Doanh so','Apply Amount','ApplyAmount','Min Amount','MinAmount'],0);
    const discountPercent=promoNumber(r,['% chiết khấu','% chiet khau','Chiết khấu %','Chiet khau %','CK %','%CK','CK','Discount Percent','DiscountPercent','discountPercent'],0);
    const discountAmount=promoNumber(r,['Giá trị giảm giá','Gia tri giam gia','Số tiền giảm','So tien giam','Tiền giảm','Tien giam','Giảm tiền','Giam tien','Discount Amount','DiscountAmount','Amount'],0);
    const old=db.customerGroupPromotions.find(k=>String(k.code)===String(code) && normText(k.customerGroupName)===normText(customerGroupName));
    const data={id:old?.id||('KMKH'+Date.now()+count),code,content,customerGroupName,applyAmount,discountPercent,discountAmount};
    if(old) Object.assign(old,data); else db.customerGroupPromotions.push(data);
    if(!db.customerGroups.find(g=>normText(g.name)===normText(customerGroupName))) db.customerGroups.push({name:customerGroupName,codes:[]});
    return true;
  },(count,skip)=>{
    toast(count>0 ? `✅ Đã import ${count} dòng KM nhóm khách hàng${skip?`, bỏ qua ${skip} dòng lỗi`:''}` : '❌ Không import được KM nhóm khách hàng. Kiểm tra cột Nhóm khách hàng');
    ev.target.value='';
  });
}
function downloadProductGroupTemplate(){
  downloadExcel([
    {'Tên nhóm sản phẩm':'Nhóm OMO','Danh sách mã sản phẩm':'SKU001'},
    {'Tên nhóm sản phẩm':'Nhóm OMO','Danh sách mã sản phẩm':'SKU002'},
    {'Tên nhóm sản phẩm':'Nhóm OMO','Danh sách mã sản phẩm':'SKU003'},
    {'Tên nhóm sản phẩm':'Nhóm PS','Danh sách mã sản phẩm':'PS1'},
    {'Tên nhóm sản phẩm':'Nhóm PS','Danh sách mã sản phẩm':'PS2'},
    {'Tên nhóm sản phẩm':'Nhóm PS','Danh sách mã sản phẩm':'PS3'}
  ],'mau_nhom_san_pham.xlsx');
}
function importProductGroupExcel(ev){
  const file=ev.target.files[0]; if(!file)return;
  readExcel(file,rows=>{
    db.productGroups=Array.isArray(db.productGroups)?db.productGroups:[];
    const grouped=collectGroupedRows(rows,['Tên nhóm sản phẩm','ten_nhom_san_pham','name'],['Danh sách mã sản phẩm','Mã sản phẩm','ma_san_pham','danh_sach_ma_san_pham','skus']);
    let count=0;
    Object.entries(grouped).forEach(([name,skus])=>{
      if(!name || !skus.length) return;
      const old=db.productGroups.find(g=>normText(g.name)===normText(name));
      if(old){
        old.skus=[...new Set([...(old.skus||[]),...skus])];
      }else{
        db.productGroups.push({id:'PG'+Date.now()+count,name,skus});
      }
      db.products.forEach(p=>{if(skus.includes(String(p.sku))) p.productGroup=name;});
      count++;
    });
    save(); render(); toast('Đã import '+count+' nhóm sản phẩm'); ev.target.value='';
  });
}
function downloadCategoryGroupTemplate(){
  downloadExcel([
    {'Tên nhóm ngành hàng':'Chăm sóc gia đình','Danh sách ngành hàng':'Giặt giũ'},
    {'Tên nhóm ngành hàng':'Chăm sóc gia đình','Danh sách ngành hàng':'Nước rửa chén'},
    {'Tên nhóm ngành hàng':'Chăm sóc cá nhân','Danh sách ngành hàng':'Dầu gội'},
    {'Tên nhóm ngành hàng':'Chăm sóc cá nhân','Danh sách ngành hàng':'Sữa tắm'}
  ],'mau_nhom_nganh_hang.xlsx');
}
function importCategoryGroupExcel(ev){
  const file=ev.target.files[0]; if(!file)return;
  readExcel(file,rows=>{
    db.categoryGroups=Array.isArray(db.categoryGroups)?db.categoryGroups:[];
    const grouped=collectGroupedRows(rows,['Tên nhóm ngành hàng','ten_nhom_nganh_hang','name'],['Danh sách ngành hàng','Ngành hàng','nganh_hang','danh_sach_nganh_hang','categories']);
    let count=0;
    Object.entries(grouped).forEach(([name,categories])=>{
      if(!name || !categories.length) return;
      const old=db.categoryGroups.find(g=>normText(g.name)===normText(name));
      if(old){
        old.categories=[...new Set([...(old.categories||[]),...categories])];
      }else{
        db.categoryGroups.push({id:'CG'+Date.now()+count,name,categories});
      }
      count++;
    });
    save(); render(); toast('Đã import '+count+' nhóm ngành hàng'); ev.target.value='';
  });
}




/* ===== V13: App mobile theo từng màn hình, thẻ lớn dễ thao tác ===== */
let mobileSalesStep = 'customers';
let mobileDriverStep = 'orders';
function isMobileAppView(){return window.innerWidth<=780 && (currentActivePage()==='salesApp'||currentActivePage()==='deliveryApp');}
function clearMobileStepClasses(){
  document.body.classList.remove('sales-step-customers','sales-step-products','sales-step-cart','sales-step-debt','sales-step-confirm','sales-step-orders','driver-step-orders','driver-step-debt');
}
function setSalesStep(step){
  mobileSalesStep=step||'customers';
  clearMobileStepClasses();
  document.body.classList.add('sales-step-'+mobileSalesStep);
  if(mobileSalesStep!=='customers' && salesSelectedCustomerCode)document.body.classList.add('sales-customer-selected');
  if(mobileSalesStep==='customers')document.body.classList.remove('sales-customer-selected');
  updateMobileAppTabs('salesApp');
  setTimeout(()=>{document.getElementById('salesApp')?.scrollTo?.({top:0,behavior:'smooth'});},20);
}
function setDriverStep(step){
  mobileDriverStep=step||'orders';
  clearMobileStepClasses();
  document.body.classList.add('driver-step-'+mobileDriverStep);
  updateMobileAppTabs('deliveryApp');
  setTimeout(()=>{document.getElementById('deliveryApp')?.scrollTo?.({top:0,behavior:'smooth'});},20);
}
function stepTitle(title,sub){return `<div class="mobile-step-title"><b>${title}</b><span>${sub||''}</span></div>`;}
const _oldUpdateMobileAppMode=updateMobileAppMode;
updateMobileAppMode=function(activeId){
  activeId=activeId||currentActivePage();
  _oldUpdateMobileAppMode(activeId);
  if(window.innerWidth<=780 && activeId==='salesApp'){
    clearMobileStepClasses();
    document.body.classList.add('sales-step-'+(mobileSalesStep||'customers'));
    if(mobileSalesStep!=='customers' && salesSelectedCustomerCode)document.body.classList.add('sales-customer-selected');
  }
  if(window.innerWidth<=780 && activeId==='deliveryApp'){
    clearMobileStepClasses();
    document.body.classList.add('driver-step-'+(mobileDriverStep||'orders'));
  }
  updateMobileAppTabs(activeId);
};
updateMobileAppTabs=function(activeId){
  const box=document.getElementById('mobileAppTabs'); if(!box)return;
  const sales=activeId==='salesApp'; const driver=activeId==='deliveryApp';
  box.querySelectorAll('button').forEach(b=>{
    const tab=b.dataset.appTab||'';
    const show=tab==='logout'||(sales&&tab.startsWith('sales-'))||(driver&&tab.startsWith('driver-'));
    b.style.display=show?'block':'none';
    b.classList.remove('active');
  });
  if(sales) box.querySelector(`[data-app-tab="sales-${mobileSalesStep||'customers'}"]`)?.classList.add('active');
  if(driver) box.querySelector(`[data-app-tab="driver-${mobileDriverStep||'orders'}"]`)?.classList.add('active');
};
mobileBackToSalesCustomers=function(){setSalesStep('customers');};
mobileAppGo=function(tab){
  if(tab.startsWith('sales-')){
    if(currentActivePage()!=='salesApp')page('salesApp');
    const step=tab.replace('sales-','');
    if(step!=='customers' && !salesSelectedCustomerCode){toast('Chọn khách hàng trước'); return setSalesStep('customers');}
    setSalesStep(step);
  }
  if(tab.startsWith('driver-')){
    if(currentActivePage()!=='deliveryApp')page('deliveryApp');
    setDriverStep(tab.replace('driver-',''));
  }
};

const _oldSalesSelectCustomer=salesSelectCustomer;
salesSelectCustomer=function(code){
  _oldSalesSelectCustomer(code);
  if(window.innerWidth<=780)setSalesStep('products');
};
function salesQtyBox(sku){return Number(document.getElementById('salesBox_'+cssSafeId(sku))?.value||0)||0;}
function salesQtyEach(sku){return Number(document.getElementById('salesEach_'+cssSafeId(sku))?.value||0)||0;}
function salesQtyFromInputs(sku,pack){return totalQty(salesQtyBox(sku),salesQtyEach(sku),pack||1);}
function setSalesQtyInputs(sku,box,each){
  const id=cssSafeId(sku);
  const b=document.getElementById('salesBox_'+id); if(b)b.value=box;
  const e=document.getElementById('salesEach_'+id); if(e)e.value=each;
}
function salesQuickAdd(sku,box,each){
  const p=findProduct(sku); if(!p)return;
  setSalesQtyInputs(sku,box,each);
  salesAddProduct(sku);
}
salesAddProduct=function(sku){
  const p=findProduct(sku); if(!p)return toast('Không tìm thấy sản phẩm');
  let qty=salesQtyFromInputs(sku,p.pack||1);
  if(qty<=0){qty=Number(p.pack)||1; setSalesQtyInputs(sku,1,0);}
  if(qty>Number(p.qty||0))return toast('Không đủ tồn: '+p.name+' còn '+qtyView(p.qty,p.pack));
  let old=salesCart.find(x=>String(x.sku)===String(sku));
  if(old)old.qty+=qty; else salesCart.push({sku:p.sku,name:p.name,pack:Number(p.pack)||1,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0});
  renderSalesCart();
  toast('Đã chấm '+qtyView(qty,p.pack)+' · '+p.name);
  if(window.innerWidth<=780){setSalesQtyInputs(sku,0,0);}
};
renderSalesProductList=function(){
  const body=document.getElementById('salesProductList'); if(!body)return;
  const q=normText(document.getElementById('salesProductSearch')?.value||'');
  const rows=(db.products||[]).filter(p=>!q || normText([p.sku,p.name,productBrand(p),productCategory(p)].join(' ')).includes(q));
  const mobile=window.innerWidth<=780;
  if(mobile){
    body.innerHTML=rows.map(p=>{const id=cssSafeId(p.sku);const low=Number(p.qty||0)<Number(p.pack||1);return `<tr><td colspan="6" class="mobile-product-cell"><div class="mobile-product-card">
      <div class="sku">${escapeHtml(p.sku||'')}</div>
      <div class="name">${escapeHtml(p.name||'')}</div>
      <div class="meta"><div><span>Giá bán chưa KM</span><b>${money(p.sale)}</b></div><div><span>Tồn thực tế</span><b class="${low?'debt-money-unpaid':'debt-money-paid'}">${qtyView(p.qty,p.pack)}</b></div></div>
      <div class="qty-grid"><div class="field"><label>Thùng</label><input id="salesBox_${id}" type="number" inputmode="numeric" value="0" min="0"></div><div class="field"><label>Lẻ</label><input id="salesEach_${id}" type="number" inputmode="numeric" value="0" min="0"></div></div>
      <div class="quick-grid"><button class="btn light" onclick="salesQuickAdd('${safeAttr(p.sku)}',1,0)">+1 thùng</button><button class="btn light" onclick="salesQuickAdd('${safeAttr(p.sku)}',0,1)">+1 lẻ</button><button class="btn green" onclick="salesAddProduct('${safeAttr(p.sku)}')">Chấm</button></div>
    </div></td></tr>`}).join('')||'<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
  }else{
    body.innerHTML=rows.map(p=>{const id=cssSafeId(p.sku);return `<tr><td><b>${p.sku}</b></td><td>${p.name}</td><td class="right">${money(p.sale)}</td><td class="right"><span class="pill ${Number(p.qty||0)<Number(p.pack||1)?'low':''}">${qtyView(p.qty,p.pack)}</span></td><td><div style="display:flex;gap:6px"><input id="salesBox_${id}" type="number" placeholder="Thùng" style="width:70px"><input id="salesEach_${id}" type="number" placeholder="Lẻ" style="width:70px"></div></td><td><button class="btn small green" onclick="salesAddProduct('${safeAttr(p.sku)}')">Chấm</button></td></tr>`}).join('')||'<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
  }
};
const _oldRenderSalesCart=renderSalesCart;
renderSalesCart=function(){
  _oldRenderSalesCart();
  const box=document.getElementById('salesCartBody'); if(!box)return;
  if(window.innerWidth<=780 && salesCart.length){
    box.insertAdjacentHTML('afterbegin', stepTitle('Giỏ hàng đang chấm','Kiểm tra lại số lượng trước khi sang công nợ hoặc xác nhận.'));
    box.insertAdjacentHTML('beforeend', `<div class="mobile-step-actions"><button class="btn light" onclick="setSalesStep('products')">← Thêm hàng</button><button class="btn green" onclick="setSalesStep('debt')">Tiếp tục công nợ →</button></div>`);
  }
};
const _oldSalesConfirmOrder=salesConfirmOrder;
salesConfirmOrder=async function(){
  await _oldSalesConfirmOrder();
  if(window.innerWidth<=780)setSalesStep('orders');
};

const _oldRenderSalesCustomerList=renderSalesCustomerList;
renderSalesCustomerList=function(){
  _oldRenderSalesCustomerList();
  const panel=document.getElementById('salesCustomerPanel');
  if(panel && window.innerWidth<=780 && !panel.querySelector('.mobile-customer-title')){
    panel.insertAdjacentHTML('afterbegin', `<div class="mobile-step-title mobile-customer-title"><b>1. Chọn khách hàng</b><span>Chỉ hiển thị danh sách khách. Bấm vào khách để chuyển sang màn hình hàng hóa.</span></div>`);
  }
};
const _oldRenderSalesDebt=renderSalesDebt;
renderSalesDebt=function(){
  _oldRenderSalesDebt();
  const panel=document.getElementById('salesDebtPanel');
  if(panel && window.innerWidth<=780 && !panel.querySelector('.mobile-debt-title')){
    panel.insertAdjacentHTML('afterbegin', `<div class="mobile-step-title mobile-debt-title"><b>4. Công nợ khách hàng</b><span>Thu công nợ nếu cần, sau đó chuyển sang xác nhận đơn.</span></div><div class="mobile-step-actions"><button class="btn light" onclick="setSalesStep('cart')">← Giỏ hàng</button><button class="btn green" onclick="setSalesStep('confirm')">Sang xác nhận →</button></div>`);
  }
};
const _oldRenderSalesOrders=renderSalesOrders;
renderSalesOrders=function(){
  _oldRenderSalesOrders();
  const panel=document.getElementById('salesOrdersPanel');
  if(panel && window.innerWidth<=780 && !panel.querySelector('.mobile-orders-title')){
    panel.insertAdjacentHTML('afterbegin', `<div class="mobile-step-title mobile-orders-title"><b>Danh sách đơn đã chấm</b><span>Có thể sửa hoặc xóa đơn đã gửi về hệ thống.</span></div>`);
  }
};

renderDeliveryApp=function(){
  updateMobileAppMode('deliveryApp');
  const masters=driverMasters();
  const child=driverChildOrders();
  const debts=child.filter(o=>orderDebtRemaining(o)>0);
  const debtTotal=debts.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
  const cashTotal=child.reduce((a,o)=>a+(Number(o.cashPaid||0)||0),0);
  const bankTotal=child.reduce((a,o)=>a+(Number(o.bankPaid||0)||0),0);
  const returnTotal=child.reduce((a,o)=>a+orderReturnAmount(o),0);
  const reconcileTotal=cashTotal+bankTotal+returnTotal+Math.max(0,debtTotal);

  if(document.getElementById('driverMasterCount'))driverMasterCount.textContent=masters.length;
  if(document.getElementById('driverChildCount'))driverChildCount.textContent=child.length;
  if(document.getElementById('driverDebtTotal'))driverDebtTotal.textContent=money(debtTotal);
  if(document.getElementById('driverCashTotal'))driverCashTotal.textContent=money(cashTotal);
  if(document.getElementById('driverBankTotal'))driverBankTotal.textContent=money(bankTotal);
  if(document.getElementById('driverReturnTotal'))driverReturnTotal.textContent=money(returnTotal);
  if(document.getElementById('driverReconcileTotal'))driverReconcileTotal.textContent=money(reconcileTotal);

  const map={};
  debts.forEach(o=>{
    const k=orderCustomerCode(o)||o.customer;
    if(!map[k])map[k]={code:orderCustomerCode(o)||'',name:o.customer||'',orders:0,debt:0};
    map[k].orders++;
    map[k].debt+=Math.max(0,orderDebtRemaining(o));
  });
  if(document.getElementById('driverDebtCustomerCount'))driverDebtCustomerCount.textContent=Object.keys(map).length;

  const list=document.getElementById('driverMasterList');
  if(list){
    list.innerHTML=(window.innerWidth<=780?stepTitle('1. Đơn cần giao','Mỗi đơn tổng/đơn con hiển thị dạng thẻ lớn dễ đọc. Hàng trả về được lưu riêng vào sổ returns và tự trừ công nợ.'):'')+
    (masters.map(m=>{
      const orders=(db.orders||[]).filter(o=>(m.childIds||[]).includes(o.id));
      const masterReturn=orders.reduce((a,o)=>a+orderReturnAmount(o),0);
      const masterCash=orders.reduce((a,o)=>a+(Number(o.cashPaid||0)||0),0);
      const masterBank=orders.reduce((a,o)=>a+(Number(o.bankPaid||0)||0),0);
      const masterDebt=orders.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
      return `<div class="driver-order-card"><h3>Đơn tổng ${escapeHtml(m.id||'')}</h3><div class="muted">Ngày: ${escapeHtml(m.date||'')} · Tổng tiền: ${money(m.total||0)} · Tiền mặt: ${money(masterCash)} · Chuyển khoản: ${money(masterBank)} · Hàng trả về: ${money(masterReturn)} · Công nợ: ${money(masterDebt)} · Ghi chú: ${escapeHtml(m.note||'')}</div><div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Đơn con</th><th>Mã KH</th><th>Khách hàng</th><th class="right">Tổng tiền</th><th class="right">Tiền mặt</th><th class="right">Chuyển khoản</th><th class="right">Giá trị hàng trả về</th><th class="right">Còn nợ</th><th>Thao tác</th></tr></thead><tbody>${orders.map(o=>{const rid=cssSafeId(o.id);return `<tr><td><b>${escapeHtml(o.id||'')}</b></td><td>${escapeHtml(orderCustomerCode(o)||'')}</td><td>${escapeHtml(o.customer||'')}</td><td class="right">${money(o.total||0)}</td><td class="right">${money(o.cashPaid||0)}</td><td class="right">${money(o.bankPaid||0)}</td><td class="right"><input class="driver-return-input" id="driverReturn_${rid}" type="number" inputmode="numeric" value="${orderReturnAmount(o)}" min="0"></td><td class="right"><b class="${orderDebtRemaining(o)>0?'debt-money-unpaid':'debt-money-paid'}">${money(orderDebtRemaining(o))}</b></td><td><button class="btn small orange" onclick="driverSaveOrderReturn('${safeAttr(o.id)}')">Lưu hàng trả</button></td></tr>`}).join('')}</tbody></table></div></div>`;
    }).join('')||'<div class="debt-search-note">Chưa có đơn tổng nào mang tên nhân viên giao hàng này.</div>');
  }

  const body=document.getElementById('driverDebtBody');
  if(body){
    body.innerHTML=Object.values(map).map(r=>{
      const sid=cssSafeId(r.code||r.name);
      return `<tr><td>${escapeHtml(r.code)}</td><td><b>${escapeHtml(r.name)}</b></td><td class="center">${r.orders} đơn còn nợ</td><td class="right"><b class="debt-money-unpaid">${money(r.debt)}</b></td><td><div class="driver-collect-box"><div class="form"><div class="field"><label>Tiền mặt</label><input id="driverCash_${sid}" type="number" inputmode="numeric" value="0"></div><div class="field"><label>Chuyển khoản</label><input id="driverBank_${sid}" type="number" inputmode="numeric" value="0"></div><div class="field"><label>Giá trị hàng trả về</label><input id="driverReturnDebt_${sid}" type="number" inputmode="numeric" value="0"></div><div class="field"><label>Ghi chú</label><input id="driverNote_${sid}" value="Nhân viên giao hàng thu tiền"></div></div><div class="muted" style="background:#eef6ff;border-radius:10px;padding:8px;margin-top:8px">Giá trị hàng trả về được lưu riêng vào sổ hàng trả về, không gộp vào tiền mặt/chuyển khoản.</div><div class="toolbar" style="margin:8px 0 0"><button class="btn small green" onclick="driverCollectDebt('${safeAttr(r.code)}','${safeAttr(r.name)}')">Xác nhận thu</button><button class="btn small light" onclick="page('debts');debtFilterCustomerCode.value='${safeAttr(r.code)}';openDebtSearchResults()">Chi tiết</button></div></div></td></tr>`;
    }).join('')||'<tr><td colspan="5" class="center muted">Không có công nợ thuộc đơn giao</td></tr>';
    const panel=document.getElementById('driverDebtPanel');
    if(panel && window.innerWidth<=780 && !panel.querySelector('.mobile-driver-debt-title')) panel.insertAdjacentHTML('afterbegin', `<div class="mobile-step-title mobile-driver-debt-title"><b>2. Thu tiền khách giao</b><span>Mỗi khách một thẻ riêng, nhập tiền mặt/chuyển khoản/hàng trả về rồi xác nhận thu.</span></div>`);
  }

  if(document.getElementById('driverReportCash'))driverReportCash.textContent=money(cashTotal);
  if(document.getElementById('driverReportBank'))driverReportBank.textContent=money(bankTotal);
  if(document.getElementById('driverReportDebt'))driverReportDebt.textContent=money(debtTotal);
  if(document.getElementById('driverReportReturn'))driverReportReturn.textContent=money(returnTotal);
  const reportBody=document.getElementById('driverReportBody');
  if(reportBody){
    const rows=driverDeliveryReportRows();
    reportBody.innerHTML=rows.map(o=>`<tr><td>${escapeHtml(o.id||'')}</td><td>${escapeHtml(orderCustomerCode(o)||'')}</td><td>${escapeHtml(o.customer||'')}</td><td class="right">${money(o.total||0)}</td><td class="right">${money(o.cashPaid||0)}</td><td class="right">${money(o.bankPaid||0)}</td><td class="right">${money(orderReturnAmount(o))}</td><td class="right"><b class="${orderDebtRemaining(o)>0?'debt-money-unpaid':'debt-money-paid'}">${money(orderDebtRemaining(o))}</b></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có đơn giao hàng để báo cáo</td></tr>';
  }
};
window.addEventListener('resize',()=>{if(currentActivePage()==='salesApp'){renderSalesProductList();setSalesStep(mobileSalesStep||'customers')} if(currentActivePage()==='deliveryApp'){setDriverStep(mobileDriverStep||'orders')}});


/* ===== V14: Đơn giản hóa App bán hàng trên điện thoại ===== */
(function(){
  function mobile(){return window.innerWidth<=780;}
  function updateTabLabels(){
    const labels={
      'sales-customers':['👥','Khách'],
      'sales-products':['📦','Hàng'],
      'sales-cart':['🛒','Giỏ'],
      'sales-orders':['🧾','Đơn']
    };
    const box=document.getElementById('mobileAppTabs'); if(!box)return;
    Object.keys(labels).forEach(k=>{const b=box.querySelector(`[data-app-tab="${k}"]`); if(b)b.innerHTML=`<span>${labels[k][0]}</span>${labels[k][1]}`;});
  }
  const oldTabs=updateMobileAppTabs;
  updateMobileAppTabs=function(activeId){
    updateTabLabels();
    if(oldTabs)oldTabs(activeId);
    const box=document.getElementById('mobileAppTabs'); if(!box)return;
    if(activeId==='salesApp' && mobile()){
      box.querySelectorAll('button').forEach(b=>{
        const tab=b.dataset.appTab||'';
        b.style.display=['sales-customers','sales-products','sales-cart','sales-orders'].includes(tab)?'block':'none';
        b.classList.toggle('active',tab==='sales-'+(mobileSalesStep||'customers'));
      });
    }
  };
  const oldSetSalesStep=setSalesStep;
  setSalesStep=function(step){
    if(step==='confirm')step='cart';
    if(step==='debt')step='cart';
    oldSetSalesStep(step);
    renderMobileCartFloat();
  };
  function renderMobileCartFloat(){
    document.querySelectorAll('.mobile-cart-float').forEach(x=>x.remove());
    if(!mobile() || currentActivePage()!=='salesApp')return;
    if(!['products'].includes(mobileSalesStep||''))return;
    if(!salesCart || !salesCart.length)return;
    const total=salesCart.reduce((a,x)=>a+Number(x.qty||0)*Number(x.sale||0),0);
    document.body.insertAdjacentHTML('beforeend',`<div class="mobile-cart-float"><div><b>${salesCart.length} dòng hàng</b><br><span>Tổng: ${money(total)}</span></div><button onclick="setSalesStep('cart')">Xem giỏ</button></div>`);
  }
  const oldRenderSalesCart=renderSalesCart;
  renderSalesCart=function(){
    oldRenderSalesCart();
    renderMobileCartFloat();
  };
  const oldSalesAddProduct=salesAddProduct;
  salesAddProduct=function(sku){
    oldSalesAddProduct(sku);
    renderMobileCartFloat();
  };
  const oldSalesSelect=salesSelectCustomer;
  salesSelectCustomer=function(code){
    oldSalesSelect(code);
    if(mobile())setSalesStep('products');
  };
  const oldMobileGo=mobileAppGo;
  mobileAppGo=function(tab){
    if(tab==='sales-debt'||tab==='sales-confirm')tab='sales-cart';
    oldMobileGo(tab);
    renderMobileCartFloat();
  };
  window.addEventListener('resize',renderMobileCartFloat);
  document.addEventListener('DOMContentLoaded',()=>{updateTabLabels();renderMobileCartFloat();});
})();



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
    else salesCart.push({sku:p.sku,name:p.name,pack:Number(p.pack)||1,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0});
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



/* ===== STABLE MOBILE SALES OVERRIDE - 2026-05-22 =====
   Mục tiêu: ổn định App bán hàng mobile, tránh các lớp V13/V14/V15/FIX V2 ghi đè lẫn nhau.
   - Render sản phẩm mobile dạng thẻ ổn định.
   - Nút +/- dùng event delegation, không phụ thuộc onclick lồng trong HTML.
   - Chặn nhập âm/ký tự lạ.
   - Không tự cộng mặc định 1 thùng khi chưa nhập số lượng.
   - Kiểm tra tồn theo tổng số đã có trong giỏ + số mới chấm.
   - Giới hạn render mobile để tránh lag khi nhiều SKU.
   - Debounce ô tìm kiếm sản phẩm.
*/
(function(){
  if(window.__MK_STABLE_SALES_MOBILE__) return;
  window.__MK_STABLE_SALES_MOBILE__ = true;

  function mobileSales(){
    return window.innerWidth <= 780 || document.body.classList.contains('mobile-role-app');
  }
  function toCleanNumber(v){
    v = String(v == null ? '' : v).replace(/[^0-9]/g,'');
    return v === '' ? 0 : Number(v);
  }
  function qtyInputId(sku,type){
    return (type === 'box' ? 'salesBox_' : 'salesEach_') + cssSafeId(sku);
  }
  function setInputValue(el,val){
    if(!el) return;
    const n = Math.max(0, Number(val || 0));
    el.value = n ? String(n) : '';
  }
  function cartQtyOfSku(sku){
    const row = (salesCart || []).find(x => String(x.sku) === String(sku));
    return row ? Number(row.qty || 0) : 0;
  }
  function stableMobileCartFloat(){
    document.querySelectorAll('.mobile-cart-float').forEach(x=>x.remove());
    if(!mobileSales() || currentActivePage() !== 'salesApp') return;
    if((mobileSalesStep || '') !== 'products') return;
    if(!salesCart || !salesCart.length) return;
    const total = salesCart.reduce((a,x)=>a + Number(x.qty||0) * Number(x.sale||0), 0);
    document.body.insertAdjacentHTML('beforeend',
      `<div class="mobile-cart-float"><div><b>${salesCart.length} dòng hàng</b><br><span>Tổng: ${money(total)}</span></div><button type="button" data-mk-sales-step="cart">Xem giỏ</button></div>`
    );
  }
  window.mkStableMobileCartFloat = stableMobileCartFloat;

  window.salesMobileQtyChange = function(sku,type,delta){
    const el = document.getElementById(qtyInputId(sku,type));
    if(!el) return;
    setInputValue(el, toCleanNumber(el.value) + Number(delta || 0));
  };
  window.salesMobileQtyFocus = function(el){
    if(!el) return;
    setTimeout(()=>{
      try{ el.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
    }, 80);
  };
  window.salesQtyBox = function(sku){ return toCleanNumber(document.getElementById(qtyInputId(sku,'box'))?.value || 0); };
  window.salesQtyEach = function(sku){ return toCleanNumber(document.getElementById(qtyInputId(sku,'each'))?.value || 0); };
  window.salesQtyFromInputs = function(sku,pack){ return totalQty(salesQtyBox(sku), salesQtyEach(sku), Number(pack)||1); };
  window.setSalesQtyInputs = function(sku,box,each){
    setInputValue(document.getElementById(qtyInputId(sku,'box')), box);
    setInputValue(document.getElementById(qtyInputId(sku,'each')), each);
  };
  window.salesQuickAdd = function(sku,box,each){
    setSalesQtyInputs(sku,box,each);
    salesAddProduct(sku);
  };

  window.salesAddProduct = function(sku){
    const p = findProduct(sku);
    if(!p) return toast('Không tìm thấy sản phẩm');
    const pack = Number(p.pack) || 1;
    const qty = salesQtyFromInputs(sku, pack);
    if(qty <= 0) return toast('Nhập số lượng thùng hoặc lẻ trước khi chấm');
    const stock = Number(p.qty || 0);
    const current = cartQtyOfSku(sku);
    if(current + qty > stock){
      return toast('Không đủ tồn: đã chấm '+qtyView(current,pack)+'; còn tồn '+qtyView(stock,pack));
    }
    let old = (salesCart || []).find(x => String(x.sku) === String(sku));
    if(old) old.qty = Number(old.qty || 0) + qty;
    else salesCart.push({sku:p.sku,name:p.name,pack:pack,qty:qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0});
    renderSalesCart();
    stableMobileCartFloat();
    toast('Đã chấm '+qtyView(qty,pack)+' · '+(p.name || p.sku));
    if(mobileSales()) setSalesQtyInputs(sku,0,0);
  };

  window.renderSalesProductList = function(){
    const body = document.getElementById('salesProductList');
    if(!body) return;
    const searchEl = document.getElementById('salesProductSearch');
    const q = normText(searchEl?.value || '');
    const all = (db.products || []).filter(p => !q || normText([p.sku,p.name,productBrand(p),productCategory(p)].join(' ')).includes(q));
    const mobile = mobileSales();
    const limit = mobile ? (q ? 120 : 80) : all.length;
    const rows = all.slice(0, limit);
    const note = mobile && all.length > rows.length
      ? `<tr><td colspan="6" class="center muted" style="padding:12px">Đang hiển thị ${rows.length}/${all.length} sản phẩm. Gõ thêm mã hoặc tên để lọc nhanh hơn.</td></tr>`
      : '';

    if(mobile){
      body.innerHTML = rows.map(p=>{
        const id = cssSafeId(p.sku);
        const sku = safeAttr(p.sku);
        const low = Number(p.qty||0) < Number(p.pack||1);
        return `<tr><td colspan="6" class="mobile-product-cell"><div class="mobile-product-card" data-sku="${sku}">
          <div class="sku">${escapeHtml(p.sku||'')}</div>
          <div class="name">${escapeHtml(p.name||'')}</div>
          <div class="meta">
            <div><span>Giá bán</span><b>${money(p.sale)}</b></div>
            <div><span>Tồn</span><b class="${low?'debt-money-unpaid':'debt-money-paid'}">${qtyView(p.qty,p.pack)}</b></div>
          </div>
          <div class="qty-grid">
            <div class="field"><label>Thùng</label><div class="qty-stepper">
              <button type="button" data-qty-btn="1" data-sku="${sku}" data-type="box" data-delta="-1">−</button>
              <input class="sales-qty-input" id="salesBox_${id}" type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" data-qty-input="1">
              <button type="button" data-qty-btn="1" data-sku="${sku}" data-type="box" data-delta="1">+</button>
            </div></div>
            <div class="field"><label>Lẻ</label><div class="qty-stepper">
              <button type="button" data-qty-btn="1" data-sku="${sku}" data-type="each" data-delta="-1">−</button>
              <input class="sales-qty-input" id="salesEach_${id}" type="tel" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" data-qty-input="1">
              <button type="button" data-qty-btn="1" data-sku="${sku}" data-type="each" data-delta="1">+</button>
            </div></div>
          </div>
          <div class="quick-grid">
            <button class="btn light" type="button" data-quick-add="1" data-sku="${sku}" data-box="1" data-each="0">+1 thùng</button>
            <button class="btn light" type="button" data-quick-add="1" data-sku="${sku}" data-box="0" data-each="1">+1 lẻ</button>
            <button class="btn green" type="button" data-sales-add="1" data-sku="${sku}">Chấm hàng</button>
          </div>
        </div></td></tr>`;
      }).join('') + note || '<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
    }else{
      body.innerHTML = rows.map(p=>{
        const id = cssSafeId(p.sku);
        return `<tr><td><b>${escapeHtml(p.sku||'')}</b></td><td>${escapeHtml(p.name||'')}</td><td class="right">${money(p.sale)}</td><td class="right"><span class="pill ${Number(p.qty||0)<Number(p.pack||1)?'low':''}">${qtyView(p.qty,p.pack)}</span></td><td><div style="display:flex;gap:6px"><input id="salesBox_${id}" type="number" placeholder="Thùng" style="width:70px"><input id="salesEach_${id}" type="number" placeholder="Lẻ" style="width:70px"></div></td><td><button class="btn small green" type="button" data-sales-add="1" data-sku="${safeAttr(p.sku)}">Chấm</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="center muted">Không có hàng hóa phù hợp</td></tr>';
    }
    stableMobileCartFloat();
  };

  window.salesDebouncedRenderProducts = (function(){
    let t = null;
    return function(){
      clearTimeout(t);
      t = setTimeout(()=>renderSalesProductList(), 250);
    };
  })();

  function bindStableEvents(){
    const search = document.getElementById('salesProductSearch');
    if(search) search.setAttribute('oninput','salesDebouncedRenderProducts()');
    if(document.__MK_STABLE_SALES_EVENTS__) return;
    document.__MK_STABLE_SALES_EVENTS__ = true;
    document.addEventListener('click', function(e){
      const stepBtn = e.target.closest('[data-mk-sales-step]');
      if(stepBtn){ e.preventDefault(); setSalesStep(stepBtn.dataset.mkSalesStep); return; }
      const qtyBtn = e.target.closest('[data-qty-btn]');
      if(qtyBtn){ e.preventDefault(); e.stopPropagation(); salesMobileQtyChange(qtyBtn.dataset.sku, qtyBtn.dataset.type, qtyBtn.dataset.delta); return; }
      const quickBtn = e.target.closest('[data-quick-add]');
      if(quickBtn){ e.preventDefault(); e.stopPropagation(); salesQuickAdd(quickBtn.dataset.sku, Number(quickBtn.dataset.box||0), Number(quickBtn.dataset.each||0)); return; }
      const addBtn = e.target.closest('[data-sales-add]');
      if(addBtn){ e.preventDefault(); e.stopPropagation(); salesAddProduct(addBtn.dataset.sku); return; }
    }, true);
    document.addEventListener('input', function(e){
      if(e.target && e.target.matches('input.sales-qty-input')){
        e.target.value = String(e.target.value || '').replace(/[^0-9]/g,'');
      }
    }, true);
    document.addEventListener('focusin', function(e){
      if(e.target && e.target.matches('input.sales-qty-input')) salesMobileQtyFocus(e.target);
    }, true);
  }

  const oldRenderSalesCartStable = window.renderSalesCart;
  if(typeof oldRenderSalesCartStable === 'function'){
    window.renderSalesCart = function(){
      oldRenderSalesCartStable.apply(this, arguments);
      stableMobileCartFloat();
    };
  }
  const oldSetSalesStepStable = window.setSalesStep;
  if(typeof oldSetSalesStepStable === 'function'){
    window.setSalesStep = function(step){
      if(step === 'debt' || step === 'confirm') step = 'cart';
      oldSetSalesStepStable(step || 'customers');
      stableMobileCartFloat();
    };
  }

  function injectStableCss(){
    if(document.getElementById('mkStableSalesMobileCss')) return;
    const style = document.createElement('style');
    style.id = 'mkStableSalesMobileCss';
    style.textContent = `
      @media(max-width:780px){
        body.mobile-role-app .section.active{padding-bottom:190px!important;}
        body.mobile-role-app #salesProductList{padding-bottom:170px!important;}
        body.mobile-role-app #salesApp .table-wrap{border:0!important;background:transparent!important;overflow:visible!important;}
        body.mobile-role-app #salesApp table.sales-product-table{display:block!important;width:100%!important;min-width:0!important;}
        body.mobile-role-app #salesApp table.sales-product-table tbody,body.mobile-role-app #salesApp table.sales-product-table tr{display:block!important;width:100%!important;}
        body.mobile-role-app #salesApp table.sales-product-table thead{display:none!important;}
        body.mobile-role-app .mobile-product-cell{display:block!important;width:100%!important;padding:0!important;border:0!important;}
        body.mobile-role-app .mobile-product-card{width:100%!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:24px!important;padding:16px!important;margin:0 0 14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;position:relative!important;z-index:1!important;}
        body.mobile-role-app .mobile-product-card .name{font-size:18px!important;line-height:1.35!important;font-weight:900!important;}
        body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:20!important;}
        body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
        body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;touch-action:manipulation!important;}
        body.mobile-role-app .mobile-product-card input.sales-qty-input{display:block!important;width:100%!important;height:54px!important;min-height:54px!important;font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;border:2px solid #94a3b8!important;border-radius:16px!important;pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;position:relative!important;z-index:25!important;opacity:1!important;}
        body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
        body.mobile-role-app .mobile-product-card .quick-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin-top:10px!important;position:relative!important;z-index:18!important;}
        body.mobile-role-app .mobile-product-card .quick-grid .btn.green{grid-column:1/3!important;min-height:54px!important;font-size:17px!important;font-weight:900!important;}
        body.mobile-role-app .mobile-cart-float{z-index:118!important;}
        body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
      }`;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', function(){
    injectStableCss();
    bindStableEvents();
    if(currentActivePage && currentActivePage()==='salesApp') renderSalesProductList();
  });
  setTimeout(function(){ injectStableCss(); bindStableEvents(); }, 300);
})();

/* ===== MK PATCH: Chuẩn hoá 2 mô hình tạo đơn con DMS / NVBH =====
   - Đơn import Excel: source='DMS', giá bán lấy từ cột P, ghi chú nổi bật ĐƠN TỪ DMS.
   - Đơn tạo từ Xuất bán/App bán hàng: source='NVBH', giá bán cuối dựa trên % chiết khấu/khuyến mại, ghi chú nổi bật ĐƠN TỪ NVBH.
   - Không đổi API/server, chỉ bổ sung dữ liệu salePrice/finalUnitPrice/source/sourceNote để in và báo cáo ổn định. */
(function(){
  'use strict';

  function mkNum(v){
    if(typeof parseImportNumber === 'function'){
      try{ return Math.round(Number(parseImportNumber(v)) || 0); }catch(e){}
    }
    if(typeof v === 'number') return Math.round(v || 0);
    let s=String(v==null?'':v).trim();
    if(!s) return 0;
    s=s.replace(/[₫đĐ\s]/g,'');
    if(s.includes(',') && s.includes('.')){
      const lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
      s = lastComma>lastDot ? s.replace(/\./g,'').replace(',', '.') : s.replace(/,/g,'');
    }else if(s.includes(',')){
      const parts=s.split(',');
      s = parts[parts.length-1].length<=2 ? s.replace(/\./g,'').replace(',', '.') : s.replace(/,/g,'');
    }else{
      const parts=s.split('.');
      if(parts.length>2 || (parts.length===2 && parts[1].length===3)) s=s.replace(/\./g,'');
    }
    return Math.round(Number(s)||0);
  }

  function mkCell(row, keys, fallback){
    if(typeof cell === 'function'){
      try{ return cell(row, keys, fallback); }catch(e){}
    }
    for(const k of keys){
      if(row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return fallback;
  }

  function mkExcelCol(row, index){
    if(!row || typeof row !== 'object') return undefined;
    const vals=Object.values(row);
    return vals[index];
  }

  function mkInvoiceIdFromRow(r){
    return String(mkCell(r,[
      'Số hóa đơn','So hoa don','Số HĐ','So HD','Số HD',
      'Mã đơn','Ma don','Mã HĐ','Ma HD','Invoice No','Invoice'
    ], '')).trim();
  }

  function mkSkuFromRow(r){
    return String(mkCell(r,[
      'Mã hàng hóa','Ma hang hoa','Mã hàng hoá','SKU','sku',
      'Mã hàng','Ma hang','Mã SP','Ma SP','Item Code','Product Code'
    ], '')).trim();
  }

  // Cột P = index 15. Nếu file có tiêu đề rõ ràng thì ưu tiên tiêu đề, nếu không lấy cột thứ 16.
  function mkDmsPriceFromRow(r){
    const byName=mkCell(r,[
      'P','Cột P','Cot P','Giá cột P','Gia cot P',
      'Giá bán cột P','Gia ban cot P','Đơn giá cột P','Don gia cot P',
      'Giá bán DMS','Gia ban DMS','DMS Price','DMSPrice'
    ], undefined);
    const raw = (byName!==undefined && byName!==null && byName!=='') ? byName : mkExcelCol(r,15);
    return mkNum(raw);
  }

  function mkSourceLabel(source){
    return String(source||'').toUpperCase()==='DMS' ? 'ĐƠN TỪ DMS' : 'ĐƠN TỪ NVBH';
  }

  function mkFinalUnitBySource(item, source){
    source=String(source||'NVBH').toUpperCase();
    if(source==='DMS'){
      const p=mkNum(item.excelPrice ?? item.salePrice ?? item.finalUnitPrice ?? item.sale);
      return Math.max(0,p);
    }
    const explicit=mkNum(item.salePrice ?? item.finalUnitPrice);
    if(explicit>0) return explicit;
    const base=Number(item.sale||0)||0;
    const disc=Number(item.disc||item.discountPercent||0)||0;
    return Math.max(0, Math.round(base*(1-disc/100)));
  }

  function mkAllocatePromoSalePrices(items, promoDetails){
    items=Array.isArray(items)?items:[];
    promoDetails=Array.isArray(promoDetails)?promoDetails:[];
    function lineBase(it){ return Number(it.qty||0)*Number(it.sale||0); }
    function detailApplies(d,it){
      if(d && d.sku) return String(d.sku)===String(it.sku);
      if(d && d.groupName && typeof productInPromoGroup === 'function') return productInPromoGroup(String(it.sku||''), String(d.groupName||''));
      return true;
    }
    return items.map(it=>{
      const qty=Number(it.qty||0)||0;
      const baseUnit=Number(it.sale||0)||0;
      const base=lineBase(it);
      let promoAmount=0;
      if(promoDetails.length){
        promoAmount=promoDetails.reduce((sum,d)=>{
          const amount=Number(d.amount||0)||0;
          if(amount<=0) return sum;
          if(d.sku) return String(d.sku)===String(it.sku) ? sum+amount : sum;
          const eligible=items.filter(x=>detailApplies(d,x));
          const totalBase=eligible.reduce((a,x)=>a+lineBase(x),0);
          if(!eligible.includes(it) || totalBase<=0 || base<=0) return sum;
          return sum + amount*base/totalBase;
        },0);
      }else{
        promoAmount=base*(Number(it.disc||0)/100);
      }
      const salePrice=qty>0 ? Math.max(0,Math.round(baseUnit-(promoAmount/qty))) : baseUnit;
      return {...it, source:'NVBH', orderSource:'NVBH', originalPrice:baseUnit, salePrice, finalUnitPrice:salePrice, discountAmount:Math.round(promoAmount)};
    });
  }

  function mkNormalizeOrder(o, source, promoDetails){
    if(!o) return o;
    source=String(source || o.source || o.orderSource || 'NVBH').toUpperCase()==='DMS' ? 'DMS' : 'NVBH';
    o.source=source;
    o.orderSource=source;
    o.sourceNote=mkSourceLabel(source);
    if(!String(o.note||'').includes(o.sourceNote)){
      o.note = o.note ? (o.sourceNote+' - '+o.note) : o.sourceNote;
    }
    if(source==='DMS'){
      o.items=(o.items||[]).map(it=>{
        const salePrice=mkFinalUnitBySource(it,'DMS');
        return {...it, source:'DMS', orderSource:'DMS', excelPrice:salePrice, salePrice, finalUnitPrice:salePrice, originalPrice:Number(it.sale||salePrice)||salePrice, disc:0};
      });
      o.goods=o.items.reduce((a,it)=>a+(Number(it.sellQty ?? it.qty)||0)*mkFinalUnitBySource(it,'DMS'),0);
      o.discount=0;
      o.lineDiscount=0;
      o.promoDiscount=0;
      o.promoDetails=[];
      o.total=Math.max(0, o.items.reduce((a,it)=>a+(Number(it.sellQty ?? it.qty)||0)*mkFinalUnitBySource(it,'DMS'),0)-Number(o.adjust||0));
    }else{
      o.items=mkAllocatePromoSalePrices(o.items||[], promoDetails || o.promoDetails || []);
    }
    const paid=(Number(o.cashPaid||0)||0)+(Number(o.bankPaid||0)||0);
    o.debt=Math.max(0,(Number(o.total||0)||0)-paid-(typeof orderReturnAmount==='function'?orderReturnAmount(o):0));
    o.paymentStatus=o.debt<=0?'Đã thanh toán':'Còn nợ';
    return o;
  }

  window.mkFinalUnitBySource=mkFinalUnitBySource;
  window.mkNormalizeOrder=mkNormalizeOrder;

  if(typeof buildBulkOrderPreview === 'function'){
    const oldBuildBulkOrderPreview=buildBulkOrderPreview;
    buildBulkOrderPreview=function(rows,fileName){
      const preview=oldBuildBulkOrderPreview(rows,fileName);
      const priceMap={};
      (rows||[]).forEach(r=>{
        const id=mkInvoiceIdFromRow(r), sku=mkSkuFromRow(r);
        if(!id || !sku) return;
        const key=id+'|||'+sku;
        if(!priceMap[key]) priceMap[key]=[];
        priceMap[key].push(mkDmsPriceFromRow(r));
      });
      (preview.orders||[]).forEach(o=>{
        o.source='DMS';
        o.orderSource='DMS';
        o.sourceNote='ĐƠN TỪ DMS';
        if(!String(o.note||'').includes('ĐƠN TỪ DMS')) o.note=o.note?('ĐƠN TỪ DMS - '+o.note):'ĐƠN TỪ DMS';
        const used={};
        o.items=(o.items||[]).map(it=>{
          const key=o.id+'|||'+it.sku;
          const idx=used[key]||0; used[key]=idx+1;
          const fromP=(priceMap[key] && priceMap[key][idx]!==undefined) ? priceMap[key][idx] : mkFinalUnitBySource(it,'DMS');
          const dmsPrice=fromP>0 ? fromP : mkFinalUnitBySource(it,'DMS');
          const sellQty=Number(it.sellQty ?? it.qty)||0;
          return {...it, source:'DMS', orderSource:'DMS', excelPrice:dmsPrice, salePrice:dmsPrice, finalUnitPrice:dmsPrice, originalPrice:Number(it.sale||dmsPrice)||dmsPrice, sale:dmsPrice, disc:0, lineTotal:sellQty*dmsPrice};
        });
        o.previewTotal=(o.items||[]).reduce((a,it)=>a+(Number(it.sellQty ?? it.qty)||0)*mkFinalUnitBySource(it,'DMS'),0)-Number(o.adjust||0);
      });
      return preview;
    };
  }

  if(typeof confirmBulkOrderImport === 'function'){
    const oldConfirmBulkOrderImport=confirmBulkOrderImport;
    confirmBulkOrderImport=function(){
      const ids=(BULK_IMPORT_PREVIEW?.orders||[]).filter(o=>o.selected!==false).map(o=>String(o.id));
      oldConfirmBulkOrderImport();
      if(ids.length){
        (db.orders||[]).forEach(o=>{ if(ids.includes(String(o.id))) mkNormalizeOrder(o,'DMS'); });
        save(); render();
      }
    };
  }

  if(typeof createOrder === 'function'){
    const oldCreateOrder=createOrder;
    createOrder=async function(){
      const beforeId=(document.getElementById('oId')?.value||'').trim();
      await oldCreateOrder.apply(this,arguments);
      const targetId=beforeId || (db.orders||[])[(db.orders||[]).length-1]?.id;
      const o=(db.orders||[]).find(x=>String(x.id)===String(targetId));
      if(o){
        mkNormalizeOrder(o,'NVBH',o.promoDetails||[]);
        save(); render();
      }
    };
  }

  // Ghi đè tạo đơn từ App bán hàng để lưu source=NVBH và giá bán cuối theo % chiết khấu từng dòng.
  salesConfirmOrder=async function(){
    const c=(db.customers||[]).find(x=>String(x.code)===String(salesSelectedCustomerCode));
    if(!c)return toast('Chọn khách hàng cần bán');
    if(!salesCart.length)return toast('Chưa chấm sản phẩm nào');
    for(const it of salesCart){
      const p=findProduct(it.sku);
      if(!p||Number(it.qty)>Number(p.qty||0))return toast('Không đủ tồn: '+(p?.name||it.sku));
    }
    const cash=Number(document.getElementById('salesCashPaid')?.value||0)||0;
    const bank=Number(document.getElementById('salesBankPaid')?.value||0)||0;
    const items=(salesCart||[]).map(x=>{
      const salePrice=mkFinalUnitBySource(x,'NVBH');
      return {...x, source:'NVBH', orderSource:'NVBH', originalPrice:Number(x.sale||0)||0, salePrice, finalUnitPrice:salePrice};
    });
    const goods=items.reduce((a,x)=>a+Number(x.qty||0)*Number(x.salePrice||x.sale||0),0);
    const cost=items.reduce((a,x)=>a+Number(x.qty||0)*Number(x.cost||0),0);
    items.forEach(it=>{const p=findProduct(it.sku); if(p)p.qty-=Number(it.qty||0);});
    const id=orderId();
    const userNote=document.getElementById('salesNote')?.value||'';
    const o={
      id,date:today(),isoDate:new Date().toISOString(),
      customer:c.name,customerCode:c.code,
      staffCode:currentUserCode(),staffName:currentUserDisplayName(),staff:currentUserDisplayName(),
      warehouse:'',source:'NVBH',orderSource:'NVBH',sourceNote:'ĐƠN TỪ NVBH',
      note:userNote?('ĐƠN TỪ NVBH - '+userNote):'ĐƠN TỪ NVBH',
      delivery:'Chưa giao',xk:'',dueDate:document.getElementById('salesDueDate')?.value||'',
      cashPaid:cash,bankPaid:bank,debt:Math.max(0,goods-cash-bank),paymentStatus:(goods-cash-bank)<=0?'Đã thanh toán':'Còn nợ',
      goods,discount:0,adjust:0,total:goods,cost,masterId:'',items
    };
    db.orders.push(o);
    save();
    salesCart=[];
    if(document.getElementById('salesCashPaid'))salesCashPaid.value=0;
    if(document.getElementById('salesBankPaid'))salesBankPaid.value=0;
    render(); toast('Đã gửi đơn '+id+' về hệ thống');
  };

  if(typeof invoiceHtmlForOrder === 'function'){
    const oldInvoiceHtmlForOrder=invoiceHtmlForOrder;
    invoiceHtmlForOrder=function(order){
      const source=String(order?.source||order?.orderSource||'NVBH').toUpperCase()==='DMS'?'DMS':'NVBH';
      const copy={...order, items:(order.items||[]).map(it=>({...it}))};
      // Ép đơn giá in theo giá bán cuối cùng để cột giá trên đơn con không bị tính nhầm.
      copy.items=copy.items.map(it=>{
        const finalUnit=mkFinalUnitBySource(it,source);
        return {...it, sale:finalUnit, salePrice:finalUnit, finalUnitPrice:finalUnit, disc:0};
      });
      copy.source=source; copy.orderSource=source; copy.sourceNote=mkSourceLabel(source);
      if(source==='DMS'){ copy.discount=0; copy.adjust=Number(copy.adjust||0); copy.promoDetails=[]; }
      let html=oldInvoiceHtmlForOrder(copy);
      // Không chèn nhãn nguồn đơn vào bản in. Nguồn đơn chỉ hiển thị ở bảng Đơn hàng.
      html=html.replace(/<p><b>Loại hóa đơn:<\/b>.*?<\/p>/, `<p><b>Loại hóa đơn:</b> ${source==='DMS'?'DMS':'Từ NVBH'}</p>`);
      return html;
    };
  }

  // Chuẩn hoá dữ liệu cũ khi load/render: đơn chưa có source mặc định là NVBH, tránh null.
  const oldNormalizeDb=normalizeDb;
  normalizeDb=function(data){
    const out=oldNormalizeDb(data);
    (out.orders||[]).forEach(o=>{
      if(!o.source && !o.orderSource){ o.source='NVBH'; o.orderSource='NVBH'; o.sourceNote='ĐƠN TỪ NVBH'; }
      (o.items||[]).forEach(it=>{
        if(!it.source) it.source=o.source||'NVBH';
        if(!it.salePrice && !it.finalUnitPrice){
          const finalUnit=mkFinalUnitBySource(it,it.source||o.source||'NVBH');
          it.salePrice=finalUnit; it.finalUnitPrice=finalUnit;
        }
      });
    });
    return out;
  };
})();


/* ===== PATCH: UI đẹp + căn đúng cột Nguồn đơn trong bảng Đơn hàng =====
   - Đưa tiêu đề "Nguồn đơn" về ngay sau "Mã đơn"
   - Dữ liệu nguồn đơn nằm đúng dưới tiêu đề
   - DMS màu cam, NVBH màu xanh, dạng badge gọn đẹp
   - Không ảnh hưởng mẫu in hóa đơn. */
(function(){
  function mkOrderSourceKey(order){
    const raw=String(order?.source || order?.orderSource || order?.sourceNote || order?.note || '').trim().toUpperCase();
    if(raw.includes('DMS')) return 'DMS';
    return 'NVBH';
  }

  function mkOrderSourceBadge(order){
    const source=mkOrderSourceKey(order || {});
    if(source === 'DMS'){
      return '<span title="Đơn import từ DMS/Excel" style="display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:999px;padding:6px 11px;background:linear-gradient(135deg,#fff7ed,#ffedd5);color:#c2410c;border:1px solid #fdba74;font-weight:900;font-size:12px;line-height:1;white-space:nowrap;box-shadow:0 1px 2px rgba(194,65,12,.08)">📥 DMS</span>';
    }
    return '<span title="Đơn tạo từ nhân viên bán hàng" style="display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:999px;padding:6px 11px;background:linear-gradient(135deg,#ecfdf5,#dcfce7);color:#047857;border:1px solid #86efac;font-weight:900;font-size:12px;line-height:1;white-space:nowrap;box-shadow:0 1px 2px rgba(4,120,87,.08)">🛒 NVBH</span>';
  }

  function cellLooksLikeSourceCell(td){
    if(!td) return false;
    if(td.getAttribute('data-order-source-cell')==='1') return true;
    const t=normText(td.textContent || '');
    return t.includes('don tu dms') || t.includes('don tu nvbh') || t === 'dms' || t === 'nvbh';
  }

  function headLooksLikeSource(th){
    if(!th) return false;
    if(th.getAttribute('data-order-source-head')==='1') return true;
    return normText(th.textContent || '') === 'nguon don';
  }

  function findOrderByRow(tr){
    const cells=[...tr.children];
    const idCell=cells.find(td=>{
      const t=String(td.textContent||'').trim();
      return /^HU\d+/i.test(t) || /^DH\d+/i.test(t) || /^OD\d+/i.test(t) || /^XK\d+/i.test(t);
    });
    const orderId=String(idCell?.textContent||'').trim();
    return (db.orders||[]).find(o=>String(o.id||'').trim()===orderId) || {source:'NVBH'};
  }

  function mkNormalizeOrdersSourceColumn(){
    const body=document.getElementById('ordersBody');
    if(!body) return;

    const table=body.closest('table');
    const headerRow=table?.querySelector('thead tr');

    if(headerRow){
      const heads=[...headerRow.children];

      // Gom tất cả header "Nguồn đơn" cũ để tránh lệch/nhân đôi.
      let sourceHead=heads.find(headLooksLikeSource);
      heads.filter(th=>headLooksLikeSource(th) && th!==sourceHead).forEach(th=>th.remove());

      if(!sourceHead){
        sourceHead=document.createElement('th');
      }

      sourceHead.setAttribute('data-order-source-head','1');
      sourceHead.textContent='Nguồn đơn';
      sourceHead.style.textAlign='center';
      sourceHead.style.whiteSpace='nowrap';

      const freshHeads=[...headerRow.children];
      const orderIdHead=freshHeads.find(th=>normText(th.textContent||'').includes('ma don'));
      const desiredIndex=orderIdHead ? freshHeads.indexOf(orderIdHead)+1 : 2;
      const currentIndex=[...headerRow.children].indexOf(sourceHead);

      if(currentIndex === -1){
        headerRow.insertBefore(sourceHead, headerRow.children[desiredIndex] || null);
      }else if(currentIndex !== desiredIndex){
        sourceHead.remove();
        headerRow.insertBefore(sourceHead, headerRow.children[desiredIndex] || null);
      }
    }

    [...body.querySelectorAll('tr')].forEach(tr=>{
      // Dòng rỗng "Chưa có đơn hàng phù hợp"
      if(tr.children.length===1){
        const td=tr.children[0];
        const headCount=headerRow ? headerRow.children.length : Number(td.getAttribute('colspan')||0);
        if(headCount>0) td.setAttribute('colspan', String(headCount));
        return;
      }

      const order=findOrderByRow(tr);

      // Xóa toàn bộ cell nguồn đơn cũ để tránh lệch cột.
      [...tr.children].filter(cellLooksLikeSourceCell).forEach(td=>td.remove());

      const td=document.createElement('td');
      td.setAttribute('data-order-source-cell','1');
      td.style.textAlign='center';
      td.style.whiteSpace='nowrap';
      td.innerHTML=mkOrderSourceBadge(order);

      // Cột chuẩn: checkbox | Mã đơn | Nguồn đơn | Ngày | ...
      const insertIndex=2;
      tr.insertBefore(td, tr.children[insertIndex] || null);
    });
  }

  const oldRenderWithOrderSource=render;
  render=function(){
    const rs=oldRenderWithOrderSource.apply(this,arguments);
    try{ mkNormalizeOrdersSourceColumn(); }catch(e){ console.warn('Không căn được cột nguồn đơn:',e); }
    return rs;
  };

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{try{mkNormalizeOrdersSourceColumn();}catch(e){}},80));
})();


/* ===== FINAL PATCH: Tối ưu hóa đơn in - bỏ nhãn nguồn, cột 4 lấy giá danh mục ===== */
function invoiceHtmlForOrder(o){
  const VAT_RATE=0.08;
  const moneyInt=(n)=>Math.round(Number(n)||0).toLocaleString('vi-VN',{maximumFractionDigits:0});
  const items=o.items||[];
  const invoiceSource=String(o?.source||o?.orderSource||'').trim().toUpperCase()==='DMS'?'DMS':'NVBH';
  function invoiceBaseUnit(it){
    const p=(typeof findProduct==='function') ? findProduct(it?.sku) : null;
    const v=(p && Number(p.sale||0)>0) ? Number(p.sale||0) : Number(it?.originalPrice||it?.basePrice||it?.saleBeforeKm||it?.sale||it?.salePrice||it?.finalUnitPrice||0);
    return Math.max(0, Math.round(Number(v)||0));
  }
  function invoiceFinalUnit(it){
    const explicit=Number(it?.salePrice ?? it?.finalUnitPrice ?? (invoiceSource==='DMS'?it?.excelPrice:undefined));
    if(explicit>0) return Math.max(0,Math.round(explicit));
    const base=invoiceBaseUnit(it);
    const disc=Number(it?.disc||it?.discountPercent||0)||0;
    if(disc>0) return Math.max(0,Math.round(base*(1-disc/100)));
    const fallback=Number(it?.sale||0)||base;
    return Math.max(0,Math.round(fallback));
  }
  const customerObj=(db.customers||[]).find(c=>c.name===o.customer||c.code===o.customer)||{};
  const staffText=staffDisplayOrder(o)||'';
  const orderNo=escapeHtml(o.xk||o.id||'');
  const invoiceNo=escapeHtml(o.id||'');
  const orderTime=escapeHtml(o.date||'');
  const customerLine=escapeHtml((customerObj.code?customerObj.code+' - ':'')+(o.customer||'')+(customerObj.phone?' - '+customerObj.phone:''));
  const cleanOrderNoteForAddress=String(o.note||'').replace(/ĐƠN\s*TỪ\s*(DMS|NVBH)\s*-?\s*/gi,'').trim();
  const addressLine=escapeHtml(customerObj.address||o.customerAddress||cleanOrderNoteForAddress||'');
  const taxCode=escapeHtml(customerObj.tax||'');
  let goods=Number(o.goods||items.reduce((a,it)=>a+Number(it.qty||0)*invoiceFinalUnit(it),0));
  let discount=Number(o.discount||0), adjust=Number(o.adjust||0), pay=Number(o.total||goods-discount-adjust);
  let totalQty=items.reduce((a,it)=>a+Number(it.qty||0),0);
  let beforeKmTotal=items.reduce((a,it)=>a+Number(it.qty||0)*invoiceBaseUnit(it),0);
  let promoTotal=discount+adjust;
  let taxTotal=0;
  const invoicePromoDetails=Array.isArray(o.promoDetails)?o.promoDetails:[];
  function money3(n){ return moneyInt(n); }
  function lineBase(it){
    return Number(it.qty||0)*invoiceBaseUnit(it);
  }
  function detailAppliesToItem(d,it){
    if(d && d.sku) return String(d.sku)===String(it.sku);
    if(d && d.groupName) return productInPromoGroup(String(it.sku||''), String(d.groupName||''));
    return true;
  }
  function linePromoAmount(it){
    const qty=Number(it.qty||0);
    const base=lineBase(it);
    if(qty<=0 || base<=0) return 0;
    if(invoiceSource==='DMS'){
      return Math.max(0,(invoiceBaseUnit(it)-invoiceFinalUnit(it))*qty);
    }

    if(invoicePromoDetails.length){
      return invoicePromoDetails.reduce((sum,d)=>{
        const amount=Number(d.amount||0)||0;
        if(amount<=0) return sum;

        if(d.sku){
          return String(d.sku)===String(it.sku) ? sum+amount : sum;
        }

        const eligible=items.filter(x=>detailAppliesToItem(d,x));
        const totalBase=eligible.reduce((a,x)=>a+lineBase(x),0);
        if(!eligible.includes(it) || totalBase<=0) return sum;
        return sum + amount*base/totalBase;
      },0);
    }

    return base*(Number(it.disc||0)/100);
  }
  function unitAfterDiscount(it){
    return invoiceFinalUnit(it);
  }
  const computedLinePromoTotal=items.reduce((a,it)=>a+linePromoAmount(it),0);
  if(!Number(o.discount||0)) promoTotal=computedLinePromoTotal+adjust;
  function mainRows(){
    let body=items.map((it,i)=>{
      let qty=Number(it.qty||0);
      let priceSell=invoiceBaseUnit(it);          // Cột 4: giá bán mặc định trong danh mục sản phẩm
      let beforeTaxKm=priceSell/(1+VAT_RATE);    // Cột 3 = cột 4 / 1.08
      let promoPerUnit=qty>0 ? linePromoAmount(it)/qty : 0;
      let afterKmCk=invoiceFinalUnit(it); // Cột 5 = giá bán thực tế sau KM/CK hoặc giá DMS cột P
      let taxValue=(afterKmCk*qty)*VAT_RATE/(1+VAT_RATE); // Cột 6: tiền thuế, 3 số thập phân
      let amount=afterKmCk*qty;
      taxTotal+=taxValue;
      return `<tr>
        <td class="c">${i+1}</td>
        <td class="c">${escapeHtml(it.sku)}</td>
        <td class="prod">${escapeHtml(it.name)}</td>
        <td class="c">${escapeHtml(qtyView(qty,it.pack))}</td>
        <td class="r">${moneyInt(qty)}</td>
        <td class="r">${moneyInt(beforeTaxKm)}</td>
        <td class="r">${moneyInt(priceSell)}</td>
        <td class="r">${moneyInt(afterKmCk)}</td>
        <td class="r">${money3(taxValue)}</td>
        <td class="r b">${moneyInt(amount)}</td>
      </tr>`;
    }).join('');
    return body || '<tr><td colspan="10" class="c">Không có hàng</td></tr>';
  }
  const rows = mainRows();
  const totalAfterKm = items.reduce((a,it)=>a+Number(it.qty||0)*unitAfterDiscount(it),0);
  const nppDiscount = Number(o.nppDiscount||o.nppDiscountAmount||o.nppCk||o.nppCK||0);
  const hasNppDiscount = nppDiscount > 0;
  const kmRate = beforeKmTotal ? ((promoTotal+(hasNppDiscount?nppDiscount:0))/beforeKmTotal*100) : 0;
  function promoRows(){
    let savedDetails=Array.isArray(o.promoDetails)?o.promoDetails:[];
    if(savedDetails.length){
      let rows=savedDetails.map((d,i)=>{
        let amount=Number(d.amount||0)||0;
        let base=Number(d.base||0)||0;
        let percent=Number(d.percent||0)||0;
        return `<tr>
          <td class="c">${escapeHtml(d.code||('KM'+String(i+1).padStart(3,'0')))}</td>
          <td>${escapeHtml(d.content||'Khuyến mại')}</td>
          <td class="r">${moneyInt(base)}</td>
          <td class="c">${percent?String(percent.toFixed(2)).replace('.',','):''}</td>
          <td class="r">${moneyInt(amount/(1+VAT_RATE))}</td>
          <td class="r">${moneyInt(amount)}</td>
        </tr>`;
      }).join('');
      if(adjust>0){
        rows += `<tr><td class="c">CKHC</td><td>Chiết khấu hiệu chỉnh trên đơn hàng</td><td class="r">${moneyInt(beforeKmTotal)}</td><td class="c"></td><td class="r">${moneyInt(adjust/(1+VAT_RATE))}</td><td class="r">${moneyInt(adjust)}</td></tr>`;
      }
      return rows;
    }
    let rows=items.filter(it=>Number(it.disc||0)>0).map((it,i)=>{
      let base=Number(it.qty||0)*Number(it.sale||0);
      let ckBefore=base*(Number(it.disc||0)/100)/(1+VAT_RATE);
      let ckAfter=base*(Number(it.disc||0)/100);
      return `<tr>
        <td class="c">CK${String(i+1).padStart(3,'0')}</td>
        <td>Chiết khấu ${Number(it.disc||0).toFixed(2)}% cho mặt hàng ${escapeHtml(it.name)}</td>
        <td class="r">${moneyInt(base)}</td>
        <td class="c">${Number(it.disc||0).toFixed(2).replace('.',',')}</td>
        <td class="r">${moneyInt(ckBefore)}</td>
        <td class="r">${moneyInt(ckAfter)}</td>
      </tr>`;
    }).join('');
    if(adjust>0){
      rows += `<tr><td class="c">CKHC</td><td>Chiết khấu hiệu chỉnh trên đơn hàng</td><td class="r">${moneyInt(beforeKmTotal)}</td><td class="c"></td><td class="r">${moneyInt(adjust/(1+VAT_RATE))}</td><td class="r">${moneyInt(adjust)}</td></tr>`;
    }
    return rows || '<tr><td colspan="6" class="c">Không có chi tiết khuyến mãi</td></tr>';
  }
  function pageHtml(copyLabel){
    return `<div class="invoice-page">
      <div class="inv-head">
        <div></div>
        <div class="inv-title">PHIẾU GIAO NHẬN VÀ THANH TOÁN</div>
        <div class="inv-copy"><div>Số xe tải:</div><div class="copy-line">(${copyLabel}) &nbsp;&nbsp;&nbsp;&nbsp; Trang: 1 / 1</div></div>
      </div>

      <div class="inv-info">
        <div class="info-left">
          <p><b>Số hóa đơn:</b> ${invoiceNo}</p>
          <p><b>Số đơn hàng:</b> ${orderNo}</p>
          <p><b>NVBH:</b> ${escapeHtml(staffText)}</p>
          <p><b>Khách hàng - Điện thoại:</b> ${customerLine}</p>
          <p><b>Địa chỉ giao hàng:</b> ${addressLine}</p>
          <p><b>Điều khoản thanh toán:</b> đáo hạn trong 7 ngày</p>
          <p><b>MST:</b> ${taxCode}</p>
        </div>
        <div class="info-mid">
          <p><b>Loại hóa đơn:</b> Từ NVTT</p>
        </div>
        <div class="info-right">
          <p><b>Thời gian đặt hàng:</b> ${orderTime}</p>
          <p><b>Nhà phân phối:</b> 3293 - Công Ty TNHH MTV Minh Khai</p>
          <p><b>Địa chỉ:</b> Cầu Cánh Sẻ,Quang Bình TỈNH THÁI BÌNH</p>
          <p><b>Điện thoại:</b> 0396198753</p>
        </div>
      </div>

      <table class="main-inv-table">
        <colgroup>
          <col style="width:3.8%"><col style="width:7.7%"><col style="width:37%"><col style="width:6.4%"><col style="width:5.7%"><col style="width:8.7%"><col style="width:9.6%"><col style="width:8.6%"><col style="width:8%"><col style="width:10.5%">
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2">STT</th>
            <th rowspan="2">Mã hàng</th>
            <th rowspan="2">Tên sản phẩm</th>
            <th>Số lượng<br>(CS/SU)</th>
            <th>Số<br>lượng<br>(lẻ)</th>
            <th>Đơn Giá<br>(Trước<br>Thuế/KM)</th>
            <th>Đơn Giá (Sau<br>Thuế, Trước<br>KM)</th>
            <th>Đơn giá<br>(Sau<br>Thuế/KM&CK)</th>
            <th>Thuế<br>GTGT</th>
            <th>Thành tiền<br>(Sau Thuế/<br>KM&CK)</th>
          </tr>
          <tr class="code-row"><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7=(5*2)</th></tr>
          <tr class="code-row"><th></th><th></th><th>A</th><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row"><td></td><td></td><td class="c b">Tổng cộng (A)</td><td></td><td class="r b">${moneyInt(totalQty)}</td><td></td><td></td><td></td><td></td><td class="r b">${moneyInt(pay)}</td></tr>
        </tbody>
      </table>

      <div class="inv-summary">
        <div class="amount-words"><b>Số tiền viết bằng chữ :</b> ${numberToVietnameseWords(pay)}</div>
        <div class="calc-box">
          <div class="pay-row"><span><b>Số tiền phải thanh toán (A7-D-E-H)</b></span><b>${moneyInt(pay)}</b></div>
          <div><span>Tổng tiền sau thuế chưa trừ KM (G) = (2)*(4):</span><span>${moneyInt(beforeKmTotal)}</span></div>
          <div><span>Tổng trị giá khuyến mãi bằng hàng và tiền (B+C):</span><span>${moneyInt(promoTotal)}</span></div>
          <div><span>Cấn trừ tiền (D+E+H):</span><span>${moneyInt(adjust)}</span></div>
          ${hasNppDiscount ? `<div><span>Tổng tiền CK của NPP (F)=(G-C)* 2,00% :</span><span>${moneyInt(nppDiscount)}</span></div>` : ''}
          <div><span>${hasNppDiscount ? 'Tỉ lệ KM & CK của đơn hàng [(B+C+F)/G]*100%:' : 'Tỉ lệ KM của đơn hàng [(B+C)/G]*100%:'}</span><span>${kmRate.toFixed(2).replace('.',',')}%</span></div>
        </div>
      </div>

      <div class="sign-row">
        <div>Người lập biểu<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Người bán hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Nhân viên giao hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
        <div>Người nhận hàng<br><span>(Ký, ghi rõ họ tên)</span></div>
      </div>

      <div class="promo-title">CHI TIẾT KHUYẾN MÃI: (B+C)</div>
      <table class="promo-table">
        <colgroup><col style="width:15%"><col style="width:46%"><col style="width:10%"><col style="width:9%"><col style="width:10%"><col style="width:10%"></colgroup>
        <thead><tr><th>Mã CTKM Tiền</th><th>Khuyến mãi bằng tiền</th><th>Giá trị hàng<br>hóa mua</th><th>% chiết<br>khấu</th><th>Tiền CK trước<br>thuế</th><th>Tiền CK sau<br>thuế</th></tr></thead>
        <tbody>${promoRows()}</tbody>
        <tfoot><tr><td colspan="5" class="c b">Tổng giá trị khuyến mãi tiền (C)</td><td class="r b">${moneyInt(promoTotal)}</td></tr></tfoot>
      </table>
      <div class="promo-explain"><b>Diễn giải khuyến mại:</b><br>${promoExplanationHtml(Array.isArray(o.promoDetails)?o.promoDetails:[])}</div>
    </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Phiếu giao nhận ${invoiceNo}</title><style>
    @page{size:A4 portrait;margin:6mm 6mm 6mm 6mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;background:#fff;font-size:9.6px;line-height:1.18}
    .print-btn{position:fixed;top:8px;right:8px;z-index:9;background:#2563eb;color:#fff;border:0;border-radius:6px;padding:8px 12px;font-weight:700}
    .invoice-page{width:198mm;min-height:285mm;margin:0 auto;page-break-after:always;padding:0 0 2mm 0;background:#fff}
    .invoice-page:last-child{page-break-after:auto}
    .inv-head{display:grid;grid-template-columns:33% 34% 33%;align-items:start;margin:0 0 3mm 0;height:11mm}
    .inv-title{text-align:center;font-size:11.5px;font-weight:800;text-transform:uppercase;padding-top:2.2mm;letter-spacing:.1px}
    .inv-copy{text-align:right;font-weight:700;font-size:9.8px;line-height:1.25}.copy-line{margin-top:2.2mm}
    .inv-info{display:grid;grid-template-columns:33% 21% 46%;gap:0;margin-bottom:18mm;min-height:38mm}
    .inv-info p{margin:0 0 2.1mm 0;white-space:normal}.info-left{padding-left:0}.info-mid{text-align:left;padding-top:12.5mm}.info-right{padding-left:2mm;padding-top:12.5mm}
    table{width:100%;border-collapse:collapse;table-layout:fixed}.main-inv-table{margin-top:0;border:1px solid #111}
    th,td{border:1px solid #111;padding:2.1px 3px;vertical-align:middle;word-wrap:break-word}
    th{font-weight:800;text-align:center}.main-inv-table th{font-size:9.3px;line-height:1.12}.main-inv-table td{font-size:9.6px;line-height:1.13}
    .main-inv-table tbody tr:not(.total-row) td{border-top:1px dotted #777;border-bottom:1px dotted #777}
    .main-inv-table tbody tr:first-child td{border-top:1px solid #111}.main-inv-table tbody tr.total-row td{border-top:1px solid #111;border-bottom:1px solid #111;font-weight:800}
    .code-row th{font-size:9.2px;padding:1.8px}.prod{font-size:9.5px}.c{text-align:center}.r{text-align:right}.b{font-weight:800}.total-row td{font-weight:800}
    .inv-summary{display:grid;grid-template-columns:48% 52%;margin-top:1mm}.amount-words{padding:10.5mm 3mm 0 1.5mm;line-height:1.2}.calc-box{font-size:9.8px}.calc-box div{display:grid;grid-template-columns:72% 28%;gap:2mm;padding:2.05mm 0}.calc-box div span:last-child,.calc-box div b:last-child{text-align:right}.pay-row{font-size:11.5px}.pay-row b:last-child{font-size:14px}
    .sign-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #111;margin-top:3.8mm;height:22mm}.sign-row div{text-align:center;font-weight:800;border-right:1px solid #111;padding-top:1.4mm}.sign-row div:last-child{border-right:0}.sign-row span{font-weight:700}
    .promo-title{font-weight:800;text-decoration:underline;margin:8mm 0 3mm .6mm}.promo-table{border:1px solid #111}.promo-table th{font-size:9.6px;line-height:1.12}.promo-table td{font-size:9.2px;line-height:1.13;padding:2.6px 3px}.promo-table tfoot td{font-size:9.6px;border-top:1px solid #111}.promo-explain{display:none}
    @media print{.print-btn{display:none}.invoice-page{min-height:auto;margin:0;width:198mm}}
  

/* ===== V13: Mobile chia màn hình App bán hàng / giao hàng theo từng bước ===== */
@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs{left:6px;right:6px;bottom:6px;border-radius:18px;padding:5px;gap:3px}
  body.mobile-role-app .mobile-app-tabs button{font-size:10px;padding:7px 2px;border-radius:13px;white-space:nowrap}
  body.mobile-role-app .mobile-app-tabs button span{font-size:17px;margin-bottom:1px}
  body.mobile-role-app .section.active{padding:8px 8px 78px!important}
  body.mobile-role-app #salesApp .card.panel,
  body.mobile-role-app #deliveryApp .card.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
  body.mobile-role-app #salesApp .panel-head,
  body.mobile-role-app #deliveryApp .panel-head{position:sticky;top:0;z-index:30;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin:0 0 10px;box-shadow:0 8px 22px rgba(15,23,42,.08)}
  body.mobile-role-app #salesApp .panel-head h2,
  body.mobile-role-app #deliveryApp .panel-head h2{font-size:20px;line-height:1.2}
  body.mobile-role-app #salesApp .panel-head .toolbar,
  body.mobile-role-app #deliveryApp .panel-head .toolbar{display:none!important}
  body.mobile-role-app .mobile-step-title{display:block;background:#0f172a;color:#fff;border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 10px 26px rgba(15,23,42,.16)}
  body.mobile-role-app .mobile-step-title b{display:block;font-size:20px;margin-bottom:3px}
  body.mobile-role-app .mobile-step-title span{font-size:13px;color:#cbd5e1}
  body.mobile-role-app .mobile-step-actions{display:flex;gap:8px;margin:10px 0;position:sticky;bottom:76px;z-index:25;background:rgba(243,244,246,.92);padding:6px 0;backdrop-filter:blur(10px)}
  body.mobile-role-app .mobile-step-actions .btn{flex:1;font-size:15px;min-height:48px}
  body.mobile-role-app .role-kpi{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin:8px 0 10px!important}
  body.mobile-role-app .role-kpi .mini-card{padding:13px!important;border-radius:18px!important;background:#fff!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
  body.mobile-role-app .role-kpi .mini-card span{font-size:12px!important}
  body.mobile-role-app .role-kpi .mini-card b{font-size:22px!important;line-height:1.25!important}
  body.mobile-role-app .role-list-row{padding:16px!important;border-radius:20px!important;font-size:16px!important}
  body.mobile-role-app .role-list-row b{font-size:17px!important;line-height:1.35!important}
  body.mobile-role-app .role-list-row .muted{font-size:13px!important;line-height:1.5!important}
  body.mobile-role-app input{font-size:17px!important;min-height:50px!important;border-radius:14px!important}
  body.mobile-role-app .btn{font-size:15px!important;min-height:48px!important;border-radius:14px!important}

  /* Sales wizard visibility */
  body.mobile-role-app #salesCustomerPanel,
  body.mobile-role-app #salesOrdersPanel,
  body.mobile-role-app #salesDebtPanel{display:none!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel,
  body.mobile-role-app.sales-step-products #salesCustomerPanel,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel{display:block!important}
  body.mobile-role-app.sales-step-debt #salesDebtPanel{display:block!important}
  body.mobile-role-app.sales-step-orders #salesOrdersPanel{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-customers #salesCustomerPanel .role-app-grid>div:nth-child(2){display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .role-app-grid>div:nth-child(2),
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .role-app-grid>div:nth-child(2){display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .layout2>div:first-child{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .sales-cart-box{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .layout2>div:first-child,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .layout2>div:first-child{display:none!important}
  body.mobile-role-app.sales-step-cart #salesCustomerPanel .sales-cart-box,
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{display:block!important}
  body.mobile-role-app.sales-step-products #salesCustomerPanel .role-kpi{display:none!important}
  body.mobile-role-app.sales-step-confirm #salesCustomerPanel .sales-cart-box{border:2px solid #16a34a!important;background:#f7fff9!important}

  /* Mobile product cards */
  body.mobile-role-app .sales-product-table{min-width:0!important;width:100%!important;border-collapse:separate!important;border-spacing:0 10px!important}
  body.mobile-role-app .sales-product-table thead{display:none!important}
  body.mobile-role-app .sales-product-table tr{display:block!important;background:transparent!important}
  body.mobile-role-app .sales-product-table td.mobile-product-cell{display:block!important;padding:0!important;border:0!important}
  body.mobile-role-app .mobile-product-card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:15px;box-shadow:0 8px 20px rgba(15,23,42,.06);margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .sku{font-size:13px;color:#64748b;font-weight:800;margin-bottom:6px}
  body.mobile-role-app .mobile-product-card .name{font-size:17px;line-height:1.35;font-weight:800;color:#111827;margin-bottom:10px}
  body.mobile-role-app .mobile-product-card .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  body.mobile-role-app .mobile-product-card .meta div{background:#f8fafc;border:1px solid #eef2f7;border-radius:15px;padding:10px}
  body.mobile-role-app .mobile-product-card .meta span{display:block;font-size:12px;color:#64748b;margin-bottom:3px}
  body.mobile-role-app .mobile-product-card .meta b{font-size:18px}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  body.mobile-role-app .mobile-product-card .quick-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  body.mobile-role-app .mobile-product-card .quick-grid .btn{min-height:48px!important}
  body.mobile-role-app .mobile-product-card .btn.green{font-size:16px!important;font-weight:900!important}

  /* Cart as full screen card list */
  body.mobile-role-app .sales-cart-box{border-radius:22px!important;padding:14px!important;background:#fff!important;box-shadow:0 8px 22px rgba(15,23,42,.08)!important}
  body.mobile-role-app .cart-item{border-radius:18px!important;background:#fff!important;border:1px solid #e5e7eb!important;padding:14px!important;font-size:16px!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
  body.mobile-role-app .sum-line b{font-size:22px!important}

  /* Debt screen: cards instead of table */
  body.mobile-role-app #salesDebtPanel .table-wrap,
  body.mobile-role-app #driverDebtPanel .table-wrap{border:0!important;background:transparent!important;overflow:visible!important}
  body.mobile-role-app #salesDebtPanel table,
  body.mobile-role-app #driverDebtPanel table{display:block!important;min-width:0!important;width:100%!important}
  body.mobile-role-app #salesDebtPanel thead,
  body.mobile-role-app #driverDebtPanel thead{display:none!important}
  body.mobile-role-app #salesDebtPanel tbody,
  body.mobile-role-app #driverDebtPanel tbody{display:block!important}
  body.mobile-role-app #salesDebtPanel tr,
  body.mobile-role-app #driverDebtPanel tr{display:block!important;background:#fff!important;border:1px solid #e5e7eb!important;border-radius:22px!important;margin-bottom:12px!important;padding:14px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important}
  body.mobile-role-app #salesDebtPanel td,
  body.mobile-role-app #driverDebtPanel td{display:block!important;border:0!important;padding:4px 0!important;font-size:15px!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(2) b,
  body.mobile-role-app #driverDebtPanel td:nth-child(2) b{font-size:18px!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(4),
  body.mobile-role-app #driverDebtPanel td:nth-child(4){font-size:24px!important;font-weight:900!important;text-align:left!important}
  body.mobile-role-app #salesDebtPanel td:nth-child(5) .btn,
  body.mobile-role-app #driverDebtPanel td:nth-child(5) .btn{width:100%;margin-top:8px}

  /* Driver wizard visibility */
  body.mobile-role-app #deliveryApp #driverOrdersPanel,
  body.mobile-role-app #deliveryApp #driverDebtPanel,
  body.mobile-role-app #deliveryApp #driverReportPanel{display:none!important}
  body.mobile-role-app.driver-step-orders #deliveryApp #driverOrdersPanel{display:block!important}
  body.mobile-role-app.driver-step-debt #deliveryApp #driverDebtPanel{display:block!important}
  body.mobile-role-app.driver-step-report #deliveryApp #driverReportPanel{display:block!important}
  body.mobile-role-app .driver-order-card{border-radius:22px!important;padding:16px!important;background:#fff!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;margin-bottom:12px!important}
  body.mobile-role-app .driver-order-card h3{font-size:20px!important;margin-bottom:8px!important}
  body.mobile-role-app .driver-order-card .table-wrap{border:0!important;overflow:visible!important}
  body.mobile-role-app .driver-order-card table{min-width:0!important;width:100%!important;display:block!important}
  body.mobile-role-app .driver-order-card thead{display:none!important}
  body.mobile-role-app .driver-order-card tbody{display:block!important}
  body.mobile-role-app .driver-order-card tr{display:block!important;background:#f8fafc!important;border:1px solid #eef2f7!important;border-radius:16px!important;margin-top:8px!important;padding:10px!important}
  body.mobile-role-app .driver-order-card td{display:block!important;border:0!important;padding:3px 0!important;text-align:left!important;font-size:14px!important}
  body.mobile-role-app .driver-collect-box{padding:12px!important;border-radius:18px!important;background:#f8fafc!important;border:1px solid #e5e7eb!important}
  body.mobile-role-app .driver-collect-box .toolbar{display:grid!important;grid-template-columns:1fr!important;gap:8px!important}
  body.mobile-role-app .driver-collect-box .btn{width:100%!important}
}


/* ===== Nút thoát cố định cho bản app điện thoại ===== */
.mobile-logout-fixed{display:none}
@media(max-width:780px){
  body.mobile-role-app .mobile-logout-fixed{
    display:flex!important;position:fixed;right:12px;top:12px;z-index:150;
    align-items:center;justify-content:center;gap:6px;
    border:0;border-radius:999px;background:#fee2e2;color:#991b1b;
    padding:10px 13px;font-size:14px;font-weight:900;
    box-shadow:0 10px 24px rgba(153,27,27,.18);
  }
  body:not(.mobile-role-app) .mobile-logout-fixed{display:none!important}
}


@media(max-width:780px){
  body.mobile-role-app .mobile-app-tabs button.mobile-logout-tab{display:block!important;background:#fee2e2!important;color:#991b1b!important}
}



/* ===== FIX V2: App bán hàng mobile nhập số lượng không bị thanh dưới che ===== */
@media(max-width:780px){
  body.mobile-role-app .section.active{padding-bottom:190px!important;}
  body.mobile-role-app #salesProductList{padding-bottom:160px!important;}
  body.mobile-role-app .mobile-product-card{position:relative!important;z-index:1!important;margin-bottom:24px!important;padding-bottom:18px!important;}
  body.mobile-role-app .mobile-product-card .qty-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:12px 0!important;position:relative!important;z-index:200!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper{display:grid!important;grid-template-columns:48px 1fr 48px!important;gap:6px!important;align-items:center!important;}
  body.mobile-role-app .mobile-product-card .qty-stepper button{height:54px!important;border:0!important;border-radius:16px!important;background:#e0edff!important;color:#1d4ed8!important;font-size:24px!important;font-weight:900!important;}
  body.mobile-role-app .mobile-product-card input.sales-qty-input{
    display:block!important;width:100%!important;height:54px!important;min-height:54px!important;
    font-size:22px!important;font-weight:900!important;text-align:center!important;background:#fff!important;color:#0f172a!important;
    border:2px solid #94a3b8!important;border-radius:16px!important;box-shadow:none!important;
    pointer-events:auto!important;touch-action:manipulation!important;-webkit-user-select:text!important;user-select:text!important;
    position:relative!important;z-index:210!important;opacity:1!important;
  }
  body.mobile-role-app .mobile-product-card input.sales-qty-input:focus{border-color:#2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.18)!important;}
  body.mobile-role-app .mobile-product-card .quick-grid{position:relative!important;z-index:190!important;margin-top:10px!important;}
  body.mobile-role-app .mobile-app-tabs{z-index:120!important;}
  body.mobile-role-app .mobile-cart-float{z-index:118!important;}
}

</style></head><body><button class="print-btn" onclick="window.print()">In / Lưu PDF</button>${pageHtml('Liên 1')}${pageHtml('Liên 2')}<script>window.onload=function(){setTimeout(()=>window.print(),350)}<\/script></body></html>`;
}


/* ===== MK FINAL SAFETY PATCH: Bỏ nhãn "ĐƠN TỪ DMS/NVBH" khỏi hóa đơn in =====
   Nguồn đơn chỉ hiển thị tại bảng Đơn hàng, không hiển thị trên bản in. */
(function(){
  if(typeof invoiceHtmlForOrder !== 'function') return;
  const _mkInvoiceHtmlNoSourceBadge = invoiceHtmlForOrder;
  invoiceHtmlForOrder = function(order){
    let html = _mkInvoiceHtmlNoSourceBadge(order);

    // Xóa banner nguồn đơn nếu còn sót từ các patch cũ.
    html = String(html).replace(
      /<div[^>]*>\s*ĐƠN\s*TỪ\s*(DMS|NVBH)\s*<\/div>/gi,
      ''
    );

    // Xóa trường hợp text nguồn đơn bị chèn trần vào HTML.
    html = html.replace(/ĐƠN\s*TỪ\s*(DMS|NVBH)/gi, '');

    return html;
  };
})();


/* ===== MK PATCH: Chặn số thập phân + xuất đơn Excel chi tiết =====
   - Chặn nhập dấu thập phân trên các ô số (number/tel/numeric).
   - Ép tiền, số lượng, giá, công nợ về số nguyên trước khi hiển thị/lưu.
   - Nâng cấp nút Xuất Excel đơn hàng: xuất chi tiết từng dòng sản phẩm, ưu tiên đơn đang chọn. */
(function(){
  'use strict';

  function mkInt(v){
    if(v===undefined || v===null || v==='') return 0;
    if(typeof v === 'string'){
      const s=v.trim();
      if(!s) return 0;
      // Nếu chuỗi dạng tiền Việt "2.470.582,944" thì bỏ phần sau dấu phẩy và bỏ dấu chấm ngăn cách.
      if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)){
        return Math.round(Number(s.split(',')[0].replace(/\./g,'')) || 0);
      }
      // Nếu là chuỗi số kiểu JS "2470582.944" thì làm tròn.
      const direct=Number(s.replace(/,/g,''));
      if(!isNaN(direct)) return Math.round(direct || 0);
      const onlyDigits=s.replace(/[^\d-]/g,'');
      return Math.round(Number(onlyDigits)||0);
    }
    return Math.round(Number(v)||0);
  }

  function mkPositiveInt(v){
    return Math.max(0,mkInt(v));
  }

  function mkCleanIntegerInput(el){
    if(!el) return;
    const old=String(el.value ?? '');
    let next=old;
    // Chặn toàn bộ dấu thập phân, chữ e, dấu cộng/trừ. Chỉ giữ số nguyên dương.
    next=next.replace(/[^\d]/g,'');
    if(old!==next) el.value=next;
  }

  window.cleanIntegerInput = mkCleanIntegerInput;

  // Ghi đè formatter tiền: mọi tiền hiển thị đều là số nguyên.
  window.money = function(n){
    return mkInt(n).toLocaleString('vi-VN');
  };
  money = window.money;

  // Ghi đè hiển thị thùng/lẻ: không để số lượng thập phân lọt ra màn hình.
  window.qtyView = function(qty,pack){
    qty=mkPositiveInt(qty);
    pack=mkPositiveInt(pack)||1;
    return Math.floor(qty/pack)+'/'+(qty%pack);
  };
  qtyView = window.qtyView;

  // Ghi đè tổng số lượng: thùng/lẻ đều là số nguyên.
  window.totalQty = function(box,each,pack){
    return mkPositiveInt(box)*(mkPositiveInt(pack)||1)+mkPositiveInt(each);
  };
  totalQty = window.totalQty;

  // Ghi đè parse dạng 1/0: nếu nhập 1.5 hoặc 1,5 sẽ chỉ lấy số nguyên an toàn.
  window.parseQtySlash = function(value,pack){
    pack=mkPositiveInt(pack)||1;
    if(value===undefined||value===null||value==='') return 0;
    let s=String(value).trim();
    if(s.includes('/')){
      let parts=s.split('/');
      let box=mkPositiveInt(parts[0]);
      let each=mkPositiveInt(parts[1]);
      return box*pack+each;
    }
    return mkPositiveInt(s);
  };
  parseQtySlash = window.parseQtySlash;

  function mkRoundItem(it){
    const x={...(it||{})};
    x.qty=mkPositiveInt(x.qty);
    x.pack=mkPositiveInt(x.pack)||1;
    x.sale=mkPositiveInt(x.sale);
    x.cost=mkPositiveInt(x.cost);
    if(x.disc!==undefined) x.disc=mkPositiveInt(x.disc);
    if(x.discountPercent!==undefined) x.discountPercent=mkPositiveInt(x.discountPercent);
    if(x.excelPrice!==undefined) x.excelPrice=mkPositiveInt(x.excelPrice);
    if(x.salePrice!==undefined) x.salePrice=mkPositiveInt(x.salePrice);
    if(x.finalUnitPrice!==undefined) x.finalUnitPrice=mkPositiveInt(x.finalUnitPrice);
    if(x.basePrice!==undefined) x.basePrice=mkPositiveInt(x.basePrice);
    if(x.originalPrice!==undefined) x.originalPrice=mkPositiveInt(x.originalPrice);
    return x;
  }

  function mkRoundOrder(o){
    if(!o || typeof o!=='object') return o;
    o.items=Array.isArray(o.items)?o.items.map(mkRoundItem):[];
    ['goods','discount','adjust','total','cost','cashPaid','bankPaid','debt','returnGoodsAmount','returnedGoodsAmount','returnAmount','goodsReturn'].forEach(k=>{
      if(o[k]!==undefined) o[k]=mkInt(o[k]);
    });
    return o;
  }

  function mkRoundDbNumbers(){
    try{
      if(!window.db && typeof db==='undefined') return;
      const d=(typeof db!=='undefined')?db:window.db;
      if(!d) return;
      if(Array.isArray(d.products)){
        d.products=d.products.map(p=>{
          if(!p || typeof p!=='object') return p;
          p.qty=mkPositiveInt(p.qty);
          p.pack=mkPositiveInt(p.pack)||1;
          p.cost=mkPositiveInt(p.cost);
          p.sale=mkPositiveInt(p.sale);
          return p;
        });
      }
      if(Array.isArray(d.orders)) d.orders=d.orders.map(mkRoundOrder);
      if(Array.isArray(d.masterOrders)){
        d.masterOrders=d.masterOrders.map(m=>{
          if(!m || typeof m!=='object') return m;
          ['goods','discount','adjust','total','cost','cashPaid','bankPaid','debt'].forEach(k=>{
            if(m[k]!==undefined) m[k]=mkInt(m[k]);
          });
          if(Array.isArray(m.items)) m.items=m.items.map(mkRoundItem);
          return m;
        });
      }
      if(Array.isArray(d.returns)){
        d.returns=d.returns.map(r=>{
          if(r && typeof r==='object' && r.amount!==undefined) r.amount=mkInt(r.amount);
          return r;
        });
      }
      if(Array.isArray(d.payments)){
        d.payments=d.payments.map(p=>{
          if(!p || typeof p!=='object') return p;
          ['amount','cash','bank'].forEach(k=>{ if(p[k]!==undefined) p[k]=mkInt(p[k]); });
          return p;
        });
      }
    }catch(e){ console.warn('Không thể làm tròn dữ liệu:',e); }
  }

  // Bọc normalizeDb để dữ liệu cũ/từ API cũng được làm tròn khi load.
  if(typeof normalizeDb === 'function'){
    const _oldNormalizeDbInteger = normalizeDb;
    normalizeDb=function(data){
      const d=_oldNormalizeDbInteger(data);
      try{
        if(Array.isArray(d.products)){
          d.products=d.products.map(p=>{
            if(!p || typeof p!=='object') return p;
            p.qty=mkPositiveInt(p.qty);
            p.pack=mkPositiveInt(p.pack)||1;
            p.cost=mkPositiveInt(p.cost);
            p.sale=mkPositiveInt(p.sale);
            return p;
          });
        }
        if(Array.isArray(d.orders)) d.orders=d.orders.map(mkRoundOrder);
        if(Array.isArray(d.masterOrders)){
          d.masterOrders=d.masterOrders.map(m=>{
            if(!m || typeof m!=='object') return m;
            ['goods','discount','adjust','total','cost','cashPaid','bankPaid','debt'].forEach(k=>{
              if(m[k]!==undefined) m[k]=mkInt(m[k]);
            });
            if(Array.isArray(m.items)) m.items=m.items.map(mkRoundItem);
            return m;
          });
        }
      }catch(e){ console.warn('Làm tròn normalizeDb lỗi:',e); }
      return d;
    };
  }

  // Bọc save để trước khi lưu luôn ép số nguyên.
  if(typeof save === 'function'){
    const _oldSaveInteger = save;
    save=function(){
      mkRoundDbNumbers();
      return _oldSaveInteger.apply(this,arguments);
    };
  }

  // Chặn nhập thập phân trực tiếp ở input động/tĩnh.
  document.addEventListener('beforeinput',function(e){
    const el=e.target;
    if(!el || !el.matches) return;
    if(!el.matches('input[type="number"], input[type="tel"], input[inputmode="numeric"], input.sales-qty-input')) return;
    if(e.data && /[^\d]/.test(e.data)){
      e.preventDefault();
    }
  },true);

  document.addEventListener('input',function(e){
    const el=e.target;
    if(!el || !el.matches) return;
    if(el.matches('input[type="number"], input[type="tel"], input[inputmode="numeric"], input.sales-qty-input')){
      mkCleanIntegerInput(el);
    }
  },true);

  document.addEventListener('paste',function(e){
    const el=e.target;
    if(!el || !el.matches) return;
    if(!el.matches('input[type="number"], input[type="tel"], input[inputmode="numeric"], input.sales-qty-input')) return;
    setTimeout(()=>mkCleanIntegerInput(el),0);
  },true);

  // Bọc salesAddProduct để số lượng trong giỏ luôn nguyên.
  if(typeof salesAddProduct === 'function'){
    const _oldSalesAddProductInteger = salesAddProduct;
    salesAddProduct=function(sku){
      const rs=_oldSalesAddProductInteger.apply(this,arguments);
      try{
        if(Array.isArray(salesCart)){
          salesCart=salesCart.map(mkRoundItem).filter(x=>mkPositiveInt(x.qty)>0);
          if(typeof renderSalesCart==='function') renderSalesCart();
        }
      }catch(e){}
      return rs;
    };
    window.salesAddProduct=salesAddProduct;
  }

  // Bọc tạo đơn từ App bán hàng: trước khi lưu trừ kho/lưu đơn, giỏ hàng đã được ép số nguyên.
  if(typeof salesConfirmOrder === 'function'){
    const _oldSalesConfirmOrderInteger = salesConfirmOrder;
    salesConfirmOrder=async function(){
      try{
        if(Array.isArray(salesCart)){
          salesCart=salesCart.map(mkRoundItem).filter(x=>mkPositiveInt(x.qty)>0);
        }
        ['salesCashPaid','salesBankPaid','salesPayCash','salesPayBank'].forEach(id=>mkCleanIntegerInput(document.getElementById(id)));
      }catch(e){}
      const beforeCount=(db.orders||[]).length;
      const rs=await _oldSalesConfirmOrderInteger.apply(this,arguments);
      try{
        // Làm tròn đơn mới vừa tạo nếu có.
        if((db.orders||[]).length>beforeCount){
          db.orders=db.orders.map(mkRoundOrder);
          if(typeof localStorage!=='undefined') localStorage.setItem(KEY,JSON.stringify(db));
        }
      }catch(e){}
      return rs;
    };
    window.salesConfirmOrder=salesConfirmOrder;
  }

  function mkOrderSourceText(o){
    const src=String(o?.source||o?.orderSource||'').toUpperCase();
    return src==='DMS'?'DMS':'NVBH';
  }

  function mkOrderFinalUnit(it,o){
    const src=mkOrderSourceText(o);
    if(src==='DMS'){
      const v=mkPositiveInt(it?.salePrice ?? it?.finalUnitPrice ?? it?.excelPrice);
      if(v>0) return v;
    }
    const explicit=mkPositiveInt(it?.salePrice ?? it?.finalUnitPrice);
    if(explicit>0) return explicit;
    const base=mkPositiveInt(it?.sale);
    const disc=mkPositiveInt(it?.disc ?? it?.discountPercent);
    if(disc>0) return Math.round(base*(1-disc/100));
    return base;
  }

  function mkSelectedOrderIds(){
    try{
      const vals=[...document.querySelectorAll('.print-order-check:checked')].map(x=>String(x.value||'')).filter(Boolean);
      return vals;
    }catch(e){ return []; }
  }

  // Nâng cấp nút "Xuất Excel": xuất chi tiết từng dòng hàng. Nếu tick đơn nào thì chỉ xuất đơn đã tick.
  window.exportOrders = function(){
    try{
      const selected=mkSelectedOrderIds();
      const sourceOrders=(selected.length ? (db.orders||[]).filter(o=>selected.includes(String(o.id))) : (typeof filteredOrders==='function'?filteredOrders():(db.orders||[])));
      const rows=[];
      sourceOrders.forEach(o=>{
        const pay=(typeof orderPaymentInfo==='function') ? orderPaymentInfo(o) : {total:mkInt(o.total),paid:mkInt(o.cashPaid)+mkInt(o.bankPaid),debt:mkInt(o.debt),status:o.paymentStatus||''};
        const items=Array.isArray(o.items)?o.items:[];
        if(!items.length){
          rows.push({
            'Mã đơn':o.id||'',
            'Nguồn đơn':mkOrderSourceText(o),
            'Ngày':o.date||'',
            'Mã KH':(typeof orderCustomerCode==='function'?orderCustomerCode(o):(o.customerCode||''))||'',
            'Khách hàng':o.customer||'',
            'Mã NV':o.staffCode||'',
            'Nhân viên':(typeof staffDisplayOrder==='function'?staffDisplayOrder(o):(o.staffName||o.staff||'')),
            'Mã hàng':'',
            'Tên sản phẩm':'',
            'Quy cách':'',
            'Số lượng':0,
            'SL thùng/lẻ':'',
            'Đơn giá gốc':0,
            'CK %':0,
            'Đơn giá bán':0,
            'Thành tiền':0,
            'Tổng đơn':mkInt(pay.total),
            'Đã thu':mkInt(pay.paid),
            'Công nợ':mkInt(pay.debt),
            'TT thanh toán':pay.status||'',
            'Trạng thái gộp':typeof orderMergedText==='function'?orderMergedText(o):'',
            'Mã đơn tổng':o.masterId||''
          });
          return;
        }
        items.forEach(it=>{
          const qty=mkPositiveInt(it.qty);
          const pack=mkPositiveInt(it.pack)||1;
          const base=mkPositiveInt((typeof findProduct==='function' && findProduct(it.sku))?.sale || it.sale || it.basePrice || it.originalPrice);
          const finalUnit=mkOrderFinalUnit(it,o);
          const lineTotal=mkInt(qty*finalUnit);
          rows.push({
            'Mã đơn':o.id||'',
            'Nguồn đơn':mkOrderSourceText(o),
            'Ngày':o.date||'',
            'Mã KH':(typeof orderCustomerCode==='function'?orderCustomerCode(o):(o.customerCode||''))||'',
            'Khách hàng':o.customer||'',
            'Mã NV':o.staffCode||'',
            'Nhân viên':(typeof staffDisplayOrder==='function'?staffDisplayOrder(o):(o.staffName||o.staff||'')),
            'Mã hàng':it.sku||'',
            'Tên sản phẩm':it.name||'',
            'Quy cách':pack,
            'Số lượng':qty,
            'SL thùng/lẻ':qtyView(qty,pack),
            'Đơn giá gốc':base,
            'CK %':mkPositiveInt(it.disc ?? it.discountPercent),
            'Đơn giá bán':finalUnit,
            'Thành tiền':lineTotal,
            'Tổng đơn':mkInt(pay.total),
            'Đã thu':mkInt(pay.paid),
            'Công nợ':mkInt(pay.debt),
            'TT thanh toán':pay.status||'',
            'Trạng thái gộp':typeof orderMergedText==='function'?orderMergedText(o):'',
            'Mã đơn tổng':o.masterId||''
          });
        });
      });
      if(!rows.length) return toast('Không có đơn hàng để xuất Excel');
      const name=selected.length?'Don_hang_da_chon_chi_tiet':'Don_hang_chi_tiet';
      if(typeof rowsToSheet==='function') rowsToSheet(rows,name);
      else if(typeof downloadExcel==='function') downloadExcel(rows,name+'.xlsx');
      toast('Đã xuất '+rows.length+' dòng đơn hàng ra Excel');
    }catch(err){
      console.error(err);
      toast('Không xuất được Excel đơn hàng: '+(err.message||'lỗi không rõ'));
    }
  };
  exportOrders=window.exportOrders;

  // Nếu có nút xuất Excel cũ bị gắn onclick sau khi render thì vẫn dùng được exportOrders mới.
  setTimeout(function(){
    try{ mkRoundDbNumbers(); }catch(e){}
  },300);
})();


/* ===== PATCH: Today default + VNPT TT78 full mapping export ===== */
(function(){
  function mkTodayISO(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function mkSafeNum(v){
    const n=Number(String(v ?? '').replace(/\./g,'').replace(',','.'));
    return isNaN(n)?0:n;
  }
  function mkRoundMoney(v){return Math.round(Number(v)||0);}
  function mkDateObj(v){
    if(!v) return null;
    if(v instanceof Date && !isNaN(v)) return v;
    const s=String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0,10)+'T12:00:00');
    let m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12,0,0);
    const d=new Date(s); return isNaN(d)?null:d;
  }
  function mkDateISO(v){
    const d=mkDateObj(v); if(!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function mkDateVNPT(v){
    const d=mkDateObj(v) || new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function mkSetDateIfBlank(id,value){
    const el=document.getElementById(id);
    if(el && !el.value) el.value=value;
  }
  function mkSetDefaultTodayFilters(){
    const today=mkTodayISO();
    [
      ['orderFilterFrom','orderFilterTo'],
      ['mergeFilterFrom','mergeFilterTo'],
      ['masterFilterFrom','masterFilterTo'],
      ['receiveFilterFrom','receiveFilterTo'],
      ['rpFrom','rpTo']
    ].forEach(pair=>pair.forEach(id=>mkSetDateIfBlank(id,today)));
  }

  // Mặc định các bảng/báo cáo trực quan lấy ngày hiện tại nếu người dùng chưa chọn ngày.
  if(typeof render === 'function'){
    const _oldRenderTodayVNPT=render;
    render=function(){
      try{ mkSetDefaultTodayFilters(); }catch(e){}
      const rs=_oldRenderTodayVNPT.apply(this,arguments);
      try{ mkEnsureVNPTButton(); }catch(e){}
      return rs;
    };
    window.render=render;
  }

  if(typeof clearOrderFilters === 'function'){
    clearOrderFilters=function(){
      ['orderFilterFrom','orderFilterTo','orderFilterStaff','orderFilterCustomerCode','orderFilterCustomerName'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
      mkSetDefaultTodayFilters();
      if(typeof render==='function') render();
    };
    window.clearOrderFilters=clearOrderFilters;
  }

  function mkCustomerByCodeOrName(o){
    const code=String((typeof orderCustomerCode==='function'?orderCustomerCode(o):o?.customerCode)||'').trim();
    const name=String(o?.customer||o?.customerName||'').trim().toLowerCase();
    return (db.customers||[]).find(c=>String(c.code||'').trim()===code)
      || (db.customers||[]).find(c=>String(c.name||'').trim().toLowerCase()===name)
      || {};
  }
  function mkProductBySku(sku){
    try{return typeof findProduct==='function'?findProduct(sku):((db.products||[]).find(p=>String(p.sku||'').trim()===String(sku||'').trim())||{});}catch(e){return {};}
  }
  function mkFinalUnitPrice(it,o){
    const src=String(o?.source||o?.orderSource||'').toUpperCase();
    if(src==='DMS'){
      const dms=mkRoundMoney(it?.salePrice ?? it?.finalUnitPrice ?? it?.excelPrice ?? it?.priceP);
      if(dms>0) return dms;
    }
    const explicit=mkRoundMoney(it?.salePrice ?? it?.finalUnitPrice ?? it?.priceAfterDiscount);
    if(explicit>0) return explicit;
    const base=mkRoundMoney(it?.sale || mkProductBySku(it?.sku).sale || it?.basePrice || 0);
    const disc=Number(it?.disc ?? it?.discountPercent ?? 0)||0;
    return disc>0 ? Math.round(base*(1-disc/100)) : base;
  }
  function mkTaxRate(o,it){
    const p=mkProductBySku(it?.sku);
    const v=Number(it?.taxRate ?? it?.vatRate ?? p.taxRate ?? p.vatRate ?? o?.taxRate ?? o?.vatRate ?? 8);
    return isNaN(v)?8:v;
  }
  function mkPayMethod(o){
    const cash=mkSafeNum(o?.cashPaid);
    const bank=mkSafeNum(o?.bankPaid);
    if(cash>0 && bank>0) return 'TM/CK';
    if(bank>0) return 'CK';
    if(cash>0) return 'TM';
    return 'TM/CK';
  }
  function mkUnitName(it){
    const p=mkProductBySku(it?.sku);
    return it?.unit || it?.dvt || p.unit || p.dvt || p['Đvt'] || p['Dvt'] || p['Đơn vị tính'] || 'cái';
  }
  function mkInvoiceCustomer(o){
    const c=mkCustomerByCodeOrName(o);
    const code=(typeof orderCustomerCode==='function'?orderCustomerCode(o):o?.customerCode)||o?.customerCode||'';
    return {
      code:String(code||'').trim(),
      name:String(o?.invoiceName || c.invoiceName || c.companyName || c.name || o?.customer || '').trim(),
      buyer:String(o?.buyerName || c.buyerName || c.contactName || c.name || o?.customer || '').trim(),
      tax:String(o?.customerTax || o?.tax || c.tax || c.taxCode || c.maSoThue || '').trim(),
      address:String(o?.customerAddress || o?.address || c.address || c.diaChi || '').trim(),
      phone:String(o?.customerPhone || o?.phone || c.phone || c.dienThoai || '').trim(),
      bankAccount:String(o?.customerBankAccount || c.bankAccount || c.soTaiKhoan || '').trim(),
      bankName:String(o?.customerBankName || c.bankName || c.nganHang || '').trim(),
      email:String(o?.customerEmail || c.email || '').trim(),
      citizenId:String(o?.customerCitizenId || c.cccd || c.cccdan || '').trim()
    };
  }
  function mkSelectedOrdersForVNPT(){
    const selected=[...document.querySelectorAll('.print-order-check:checked')].map(x=>String(x.value||'')).filter(Boolean);
    if(selected.length) return (db.orders||[]).filter(o=>selected.includes(String(o.id)));
    return (typeof filteredOrders==='function' ? filteredOrders() : (db.orders||[]));
  }

  const VNPT_HEADERS=[
    'STT','NgayHoaDon','MaKhachHang','TenKhachHang','TenNguoiMua','MaSoThue','DiaChiKhachHang','DienThoaiKhachHang','SoTaiKhoan','NganHang','HinhThucTT','MaSanPham','SanPham','DonViTinh','Extra1SP','Extra2SP','SoLuong','DonGia','TyLeChietKhau','SoTienChietKhau','ThanhTien','TienBan','ThueSuat','TienThueSanPham','TienThue','TongCong','TinhChatHangHoa','DonViTienTe','TyGia','Fkey','Extra1','Extra2','EmailKhachHang','VungDuLieu','Extra3','Extra4','Extra5','Extra6','Extra7','Extra8','Extra9','Extra10','Extra11','Extra12','LDDNBo','HDSo','HVTNXHang','TNVChuyen','PTVChuyen','HDKTNgay','HDKTSo','CCCDan','','','mau_01'
  ];

  function mkVNPTLineRow(o,it,stt){
    const c=mkInvoiceCustomer(o);
    const qty=mkRoundMoney(it?.qty ?? it?.sellQty ?? 0);
    const grossUnit=mkFinalUnitPrice(it,o);
    const grossLine=mkRoundMoney(qty*grossUnit);
    const taxRate=mkTaxRate(o,it);
    const preTaxLine=taxRate>0 ? grossLine/(1+taxRate/100) : grossLine;
    const preTaxUnit=qty>0 ? preTaxLine/qty : 0;
    const taxAmount=grossLine-preTaxLine;
    const discPercent=Number(it?.disc ?? it?.discountPercent ?? 0)||0;
    const productName=String(it?.name || mkProductBySku(it?.sku).name || '').trim();
    return [
      stt,
      mkDateVNPT(o?.isoDate || o?.date),
      c.code,
      c.name,
      c.buyer,
      c.tax,
      c.address,
      c.phone,
      c.bankAccount,
      c.bankName,
      mkPayMethod(o),
      String(it?.sku||''),
      productName,
      mkUnitName(it),
      '',
      '',
      qty,
      Number(preTaxUnit.toFixed(6)),
      discPercent||'',
      '',
      Number(preTaxLine.toFixed(6)),
      Number(preTaxLine.toFixed(6)),
      taxRate,
      '',
      Number(taxAmount.toFixed(6)),
      grossLine,
      0,
      'VND',
      '',
      String(o?.id||''),
      '',
      '',
      c.email,
      '',
      '', '', '', '', '', '', '', '', '', '',
      '',
      '',
      '',
      o?.deliveryStaffName || '',
      '',
      '',
      '',
      c.citizenId,
      '',
      '',
      ''
    ];
  }

  function mkVNPTDebugRows(orders){
    const rows=[['Ngày','Số Đơn','Mã Nv','Tên Nv','Mã Khách','Tên Khách','Địa chỉ','Phone','Stt','Mã hàng','Tên hàng','Qc','Là Km','Số lượng','Đơn giá sau KM/Ck','Thành tiền','Mã Kho','Nhóm hàng','Kênh hàng']];
    let stt=1;
    orders.forEach(o=>{
      const c=mkInvoiceCustomer(o);
      (Array.isArray(o.items)?o.items:[]).forEach(it=>{
        const p=mkProductBySku(it.sku);
        const qty=mkRoundMoney(it.qty ?? it.sellQty ?? 0);
        const unit=mkFinalUnitPrice(it,o);
        rows.push([mkDateVNPT(o.isoDate||o.date),o.id||'',o.staffCode||'',o.staffName||o.staff||'',c.code,c.name,c.address,c.phone,stt++,it.sku||'',it.name||p.name||'',it.pack||p.pack||'',it.isPromo?'KM':'',qty,unit,qty*unit,p.warehouse||o.warehouse||'',p.category||'',p.channel||'']);
      });
    });
    return rows;
  }

  window.exportVNPTInvoices=function(){
    try{
      if(typeof XLSX==='undefined') return toast('Thiếu thư viện XLSX để xuất hóa đơn VNPT');
      const orders=mkSelectedOrdersForVNPT().filter(o=>Array.isArray(o.items)&&o.items.length);
      if(!orders.length) return toast('Chưa có đơn hàng để xuất hóa đơn VNPT');
      const aoa=[VNPT_HEADERS];
      let stt=1;
      orders.forEach(o=>{
        (o.items||[]).forEach(it=>{
          const qty=mkRoundMoney(it.qty ?? it.sellQty ?? 0);
          if(qty<=0) return;
          aoa.push(mkVNPTLineRow(o,it,stt++));
        });
      });
      if(aoa.length<=1) return toast('Không có dòng hàng hợp lệ để xuất VNPT');
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=VNPT_HEADERS.map((h,i)=>({wch: i===6?34:(i===12?42:(i===17||i===20||i===21||i===24||i===25?15:14))}));
      XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
      const debug=XLSX.utils.aoa_to_sheet(mkVNPTDebugRows(orders));
      XLSX.utils.book_append_sheet(wb,debug,'S3');
      const fileName='Hoa_don_VNPT_TT78_'+mkTodayISO()+(orders.length===1?'_'+String(orders[0].id||''):'')+'.xlsx';
      XLSX.writeFile(wb,fileName);
      toast('Đã xuất file hóa đơn VNPT: '+(aoa.length-1)+' dòng hàng');
    }catch(err){
      console.error(err);
      toast('Không xuất được hóa đơn VNPT: '+(err.message||'lỗi không rõ'));
    }
  };

  function mkEnsureVNPTButton(){
    if(document.getElementById('btnExportVNPTInvoices')) return;
    const ordersSection=document.getElementById('orders') || document.querySelector('.section.active');
    if(!ordersSection) return;
    const buttons=[...ordersSection.querySelectorAll('button')];
    let anchor=buttons.find(b=>/Xuất Excel/i.test(b.textContent||'') || String(b.getAttribute('onclick')||'').includes('exportOrders'));
    let toolbar=anchor ? anchor.parentElement : ordersSection.querySelector('.toolbar');
    if(!toolbar) return;
    const btn=document.createElement('button');
    btn.id='btnExportVNPTInvoices';
    btn.type='button';
    btn.className='btn';
    btn.style.background='#7c3aed';
    btn.style.color='#fff';
    btn.style.fontWeight='800';
    btn.onclick=window.exportVNPTInvoices;
    btn.textContent='Xuất hóa đơn VNPT';
    if(anchor && anchor.nextSibling) toolbar.insertBefore(btn,anchor.nextSibling); else toolbar.appendChild(btn);
  }

  const mo=new MutationObserver(function(){try{mkEnsureVNPTButton();}catch(e){}});
  try{mo.observe(document.body,{childList:true,subtree:true});}catch(e){}
  setTimeout(function(){try{mkSetDefaultTodayFilters(); mkEnsureVNPTButton();}catch(e){}},500);
})();


/* ===== PATCH 2026-05-22: VNPT TT78 đúng mẫu + ĐVT danh mục/import hàng hóa ===== */
(function(){
  function mkTxt(v){return String(v===undefined||v===null?'':v).trim();}
  function mkNum(v){
    if(v===undefined||v===null||v==='') return 0;
    if(typeof v==='number') return isFinite(v)?v:0;
    let s=String(v).trim();
    if(!s) return 0;
    s=s.replace(/\s+/g,'').replace(/[₫đĐVNĐvnd]/g,'');
    const hasComma=s.includes(','), hasDot=s.includes('.');
    if(hasComma && hasDot){
      if(s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    }else if(hasComma){
      const parts=s.split(',');
      if(parts.length>1 && parts[parts.length-1].length===3) s=parts.join('');
      else s=s.replace(',','.');
    }else if(hasDot){
      const parts=s.split('.');
      if(parts.length>1 && parts[parts.length-1].length===3) s=parts.join('');
    }
    s=s.replace(/[^0-9.-]/g,'');
    const n=Number(s);
    return isFinite(n)?n:0;
  }
  function mkInt(v){return Math.round(mkNum(v));}
  function mkNorm(v){
    try{return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
    catch(e){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  }
  function mkPick(row,keys){
    if(!row) return '';
    for(const k of keys){
      if(Object.prototype.hasOwnProperty.call(row,k) && row[k]!=='' && row[k]!==null && row[k]!==undefined) return row[k];
    }
    const map={};
    Object.keys(row).forEach(k=>{map[mkNorm(k)]=row[k];});
    for(const k of keys){
      const nk=mkNorm(k);
      if(Object.prototype.hasOwnProperty.call(map,nk) && map[nk]!=='' && map[nk]!==null && map[nk]!==undefined) return map[nk];
    }
    return '';
  }
  function productUnit(p){
    return mkTxt(p?.unit || p?.dvt || p?.donViTinh || p?.DonViTinh || p?.['Đơn vị tính'] || p?.['Don vi tinh'] || p?.['DVT'] || p?.['ĐVT'] || 'cái') || 'cái';
  }
  window.productUnit=productUnit;

  // Ghi đè hàm upsert để lưu cả đơn vị tính, phục vụ hóa đơn đỏ.
  window.upsertProduct = function(row){
    const sku=mkTxt(row?.sku || row?.SKU || row?.['Mã sản phẩm'] || row?.['Mã hàng']);
    if(!sku) return null;
    db.products=Array.isArray(db.products)?db.products:[];
    let p=(typeof findProduct==='function'?findProduct(sku):db.products.find(x=>mkTxt(x.sku)===sku));
    const data={
      sku,
      name:mkTxt(row?.name || row?.['Tên sản phẩm'] || row?.['Tên hàng'] || row?.Ten || row?.['Tên']),
      unit:mkTxt(row?.unit || row?.dvt || row?.donViTinh || row?.DonViTinh || row?.['Đơn vị tính'] || row?.['Don vi tinh'] || row?.DVT || row?.['ĐVT'] || (p?productUnit(p):'cái')) || 'cái',
      brand:mkTxt(row?.brand || row?.nhanHang || row?.['Nhãn hàng'] || row?.['Nhan hang']),
      category:mkTxt(row?.category || row?.nganhHang || row?.['Ngành hàng'] || row?.['Nganh hang']),
      warehouse:mkTxt(row?.warehouse || row?.khoHang || row?.['Kho hàng'] || row?.['Kho hang'] || row?.['Kho hàng quản lý']) || 'Kho chính',
      productGroup:mkTxt(row?.productGroup || row?.['Nhóm sản phẩm'] || row?.['Nhom san pham']),
      pack:mkInt(row?.pack || row?.['Quy cách'] || row?.['Quy cach']) || (p&&p.pack) || 1,
      qty:row?.qty!==undefined ? mkInt(row.qty) : (p&&p.qty!==undefined?mkInt(p.qty):0),
      cost:row?.cost!==undefined || row?.['Giá nhập']!==undefined ? mkInt(row?.cost || row?.['Giá nhập']) : (p&&p.cost!==undefined?mkInt(p.cost):0),
      sale:row?.sale!==undefined || row?.['Giá bán']!==undefined ? mkInt(row?.sale || row?.['Giá bán']) : (p&&p.sale!==undefined?mkInt(p.sale):0)
    };
    if(!p){p=data; db.products.push(p);} else {
      p.sku=data.sku;
      if(data.name) p.name=data.name;
      p.unit=data.unit;
      p.dvt=data.unit;
      if(data.brand) p.brand=data.brand;
      if(data.category) p.category=data.category;
      if(data.warehouse) p.warehouse=data.warehouse;
      if(data.productGroup) p.productGroup=data.productGroup;
      p.pack=data.pack;
      p.sale=data.sale;
      p.cost=data.cost;
      if(row?.qty!==undefined) p.qty=data.qty;
    }
    return p;
  };

  function ensureProductUnitUI(){
    // Thêm ô nhập ĐVT nếu component chưa có.
    const pack=document.getElementById('pcPack');
    if(pack && !document.getElementById('pcUnit')){
      const wrap=document.createElement('div');
      wrap.className='field';
      wrap.innerHTML='<label>Đơn vị tính</label><input id="pcUnit" placeholder="VD: chai, thùng, gói, cái" value="cái">';
      const parent=pack.closest('.field') || pack.parentElement;
      if(parent && parent.parentNode) parent.parentNode.insertBefore(wrap,parent);
    }
    // Thêm tiêu đề cột ĐVT trong bảng danh mục nếu component thiếu.
    const body=document.getElementById('productCatalogBody');
    const tr=body?.closest('table')?.querySelector('thead tr');
    if(tr && ![...tr.children].some(th=>/đơn vị|đvt|dvt/i.test(th.textContent||''))){
      const th=document.createElement('th'); th.textContent='ĐVT';
      const cells=[...tr.children];
      const nameIdx=cells.findIndex(x=>/tên/i.test(x.textContent||''));
      tr.insertBefore(th, cells[nameIdx+1] || cells[3] || null);
    }
  }
  window.ensureProductUnitUI=ensureProductUnitUI;

  // Ghi đè render danh mục để có cột ĐVT.
  window.renderProductCatalog=function(){
    ensureProductUnitUI();
    const body=document.getElementById('productCatalogBody');
    if(!body) return;
    const rows=(typeof productCatalogRows==='function'?productCatalogRows():(db.products||[]));
    body.innerHTML=rows.map(p=>`<tr>
      <td class="center"><input type="checkbox" class="catalog-delete-check" value="${safeAttr(p.sku)}"></td>
      <td><b>${p.sku||''}</b></td>
      <td>${p.name||''}</td>
      <td>${productUnit(p)}</td>
      <td>${mkInt(p.pack)||1}</td>
      <td class="right">${money(mkInt(p.sale||0))}</td>
      <td>${productBrand(p)||''}</td>
      <td>${productCategory(p)||''}</td>
      <td>${productWarehouse(p)||''}</td>
      <td>${p.productGroup||''}</td>
      <td><button class="btn small light" onclick="editProductCatalog('${safeAttr(p.sku)}')">Sửa</button> <button class="btn small red" onclick="deleteProductCatalog('${safeAttr(p.sku)}')">Xóa</button></td>
    </tr>`).join('') || '<tr><td colspan="11" class="center muted">Chưa có sản phẩm</td></tr>';
    if(typeof renderGroupCatalog==='function') renderGroupCatalog();
    if(typeof renderLinkedProductLists==='function') renderLinkedProductLists();
  };

  window.saveProductCatalog=function(){
    ensureProductUnitUI();
    const sku=mkTxt(document.getElementById('pcSku')?.value);
    const name=mkTxt(document.getElementById('pcName')?.value);
    if(!sku || !name) return toast('Thiếu mã sản phẩm hoặc tên sản phẩm');
    const old=(typeof findProduct==='function'?findProduct(editingCatalogSku || sku):null);
    const data={
      sku,
      name,
      unit:mkTxt(document.getElementById('pcUnit')?.value)||'cái',
      pack:mkInt(document.getElementById('pcPack')?.value)||1,
      sale:mkInt(document.getElementById('pcSale')?.value)||0,
      brand:mkTxt(document.getElementById('pcBrand')?.value),
      category:mkTxt(document.getElementById('pcCategory')?.value),
      warehouse:mkTxt(document.getElementById('pcWarehouse')?.value)||'Kho chính',
      productGroup:mkTxt(document.getElementById('pcProductGroup')?.value)
    };
    if(old){Object.assign(old,data,{dvt:data.unit});}
    else {db.products.push({...data,dvt:data.unit,qty:0,cost:0});}
    editingCatalogSku=null;
    ['pcSku','pcName','pcBrand','pcCategory','pcProductGroup'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';});
    if(document.getElementById('pcUnit')) pcUnit.value='cái';
    if(document.getElementById('pcPack')) pcPack.value=12;
    if(document.getElementById('pcSale')) pcSale.value=0;
    if(document.getElementById('pcWarehouse')) pcWarehouse.value='Kho chính';
    save(); render(); toast('Đã lưu sản phẩm');
  };

  window.editProductCatalog=function(sku){
    ensureProductUnitUI();
    const p=typeof findProduct==='function'?findProduct(sku):null; if(!p)return;
    editingCatalogSku=sku;
    if(document.getElementById('pcSku')) pcSku.value=p.sku||'';
    if(document.getElementById('pcName')) pcName.value=p.name||'';
    if(document.getElementById('pcUnit')) pcUnit.value=productUnit(p);
    if(document.getElementById('pcPack')) pcPack.value=mkInt(p.pack)||1;
    if(document.getElementById('pcSale')) pcSale.value=mkInt(p.sale)||0;
    if(document.getElementById('pcBrand')) pcBrand.value=productBrand(p)||'';
    if(document.getElementById('pcCategory')) pcCategory.value=productCategory(p)||'';
    if(document.getElementById('pcWarehouse')) pcWarehouse.value=productWarehouse(p)||'Kho chính';
    if(document.getElementById('pcProductGroup')) pcProductGroup.value=p.productGroup||'';
    toast('Đang sửa '+sku);
  };

  // Mẫu danh mục mới có Đơn vị tính. Import cũng nhận thêm ĐVT/DVT/unit.
  window.downloadProductCatalogTemplate=function(){
    downloadExcel([{
      'Mã sản phẩm':'SKU001','Tên sản phẩm':'Tên hàng mẫu','Đơn vị tính':'chai','Quy cách':12,'Giá bán':100000,
      'Nhãn hàng':'OMO','Ngành hàng':'Giặt giũ','Kho hàng quản lý':'Kho chính','Nhóm sản phẩm':'Nhóm bán chạy'
    }],'mau_danh_muc_san_pham.xlsx');
  };

  window.importProductCatalogExcel=function(ev){
    const file=ev?.target?.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=e=>{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
      let count=0, priceCount=0, unitCount=0;
      rows.forEach(r=>{
        const sku=mkTxt(mkPick(r,['ma_san_pham','Mã sản phẩm','Mã SP','SKU','sku','Code','Mã hàng','Ma hang']));
        if(!sku) return;
        const unit=mkTxt(mkPick(r,['don_vi_tinh','Đơn vị tính','Don vi tinh','ĐVT','DVT','DonViTinh','Unit','unit']))||'cái';
        const rawSale=mkPick(r,['gia_ban','Giá bán','Gia ban','Giá bán chưa KM','Gia ban chua KM','Đơn giá bán','Don gia ban','Giá','Gia','sale','price']);
        if(mkTxt(rawSale)!=='') priceCount++;
        if(unit) unitCount++;
        upsertProduct({
          sku,
          name:mkTxt(mkPick(r,['ten_san_pham','Tên sản phẩm','Ten san pham','name','Tên hàng','Ten hang'])),
          unit,
          pack:mkInt(mkPick(r,['quy_cach','Quy cách','Quy cach','pack']))||1,
          sale:mkInt(rawSale),
          brand:mkTxt(mkPick(r,['nhan_hang','Nhãn hàng','Nhan hang','brand'])),
          category:mkTxt(mkPick(r,['nganh_hang','Ngành hàng','Nganh hang','category'])),
          warehouse:mkTxt(mkPick(r,['kho_hang_quan_ly','Kho hàng quản lý','Kho hang quan ly','Kho hàng','Kho hang','warehouse']))||'Kho chính',
          productGroup:mkTxt(mkPick(r,['nhom_san_pham','Nhóm sản phẩm','Nhom san pham','productGroup']))
        });
        count++;
      });
      save(); render(); toast('Đã import '+count+' sản phẩm · giá bán nguyên '+priceCount+' dòng · ĐVT '+unitCount+' dòng');
      ev.target.value='';
    };
    reader.readAsArrayBuffer(file);
  };

  window.exportProductCatalog=function(){
    const rows=(db.products||[]).map(p=>({
      'Mã sản phẩm':p.sku,'Tên sản phẩm':p.name,'Đơn vị tính':productUnit(p),'Quy cách':p.pack,'Giá bán':p.sale,
      'Nhãn hàng':productBrand(p),'Ngành hàng':productCategory(p),'Kho hàng quản lý':productWarehouse(p),'Nhóm sản phẩm':p.productGroup||''
    }));
    if(!rows.length)return toast('Chưa có sản phẩm để xuất');
    downloadExcel(rows,'danh_muc_san_pham.xlsx');
  };

  // Mẫu import sản phẩm/tồn kho cũ cũng thêm ĐVT để đồng bộ.
  window.downloadProductTemplate=function(){
    rowsToSheet([{SKU:'64811767','Tên sản phẩm':'SUNLIGHT NLS TD Thơm Mát Hương Lily & Bách Trà 1kg/12 chai','Đơn vị tính':'chai','Nhãn hàng':'Sunlight','Ngành hàng':'Chăm sóc nhà cửa','Kho hàng':'Kho chính','Quy cách':12,'Giá nhập':0,'Giá bán':0}], 'Mau_san_pham_theo_cap');
  };
  window.importProducts=function(e){
    const f=e.target.files[0];if(!f)return;
    readExcel(f,rows=>{let n=0;rows.forEach(r=>{let sku=mkPick(r,['SKU','sku','Mã SP','Mã sản phẩm','Mã hàng']);if(!sku)return;upsertProduct({
      sku,
      name:mkPick(r,['Tên sản phẩm','Tên hàng','Ten','Tên','name']),
      unit:mkPick(r,['Đơn vị tính','Don vi tinh','ĐVT','DVT','unit']),
      brand:mkPick(r,['Nhãn hàng','Nhan hang','brand','nhanHang']),
      category:mkPick(r,['Ngành hàng','Nganh hang','category','nganhHang']),
      warehouse:mkPick(r,['Kho hàng','Kho hang','warehouse','khoHang']),
      pack:mkPick(r,['Quy cách','Quy cach','pack']),
      cost:mkPick(r,['Giá nhập','Gia nhap','cost']),
      sale:mkPick(r,['Giá bán','Gia ban','sale'])
    });n++;});save();render();toast('Đã import '+n+' sản phẩm')});
  };
  window.exportProducts=function(){
    rowsToSheet(db.products.map(p=>({SKU:p.sku,'Tên sản phẩm':p.name,'Đơn vị tính':productUnit(p),'Nhãn hàng':productBrand(p),'Ngành hàng':productCategory(p),'Kho hàng':productWarehouse(p),'Quy cách':p.pack,'Tồn':p.qty,'Tồn thùng/lẻ':qtyView(p.qty,p.pack),'Giá nhập':p.cost,'Giá bán':p.sale})),'Danh_sach_san_pham_theo_cap');
  };

  // ===== VNPT TT78: xuất đúng cấu trúc Sheet1 của file mẫu 1 thuế TT78 =====
  const VNPT_TT78_HEADERS=[
    'STT','NgayHoaDon','MaKhachHang','TenKhachHang','TenNguoiMua','MaSoThue','DiaChiKhachHang','DienThoaiKhachHang','SoTaiKhoan','NganHang','HinhThucTT','MaSanPham','SanPham','DonViTinh','Extra1SP','Extra2SP','SoLuong','DonGia','TyLeChietKhau','SoTienChietKhau','ThanhTien','TienBan','ThueSuat','TienThueSanPham','TienThue','TongCong','TinhChatHangHoa','DonViTienTe','TyGia','Fkey','Extra1','Extra2','EmailKhachHang','VungDuLieu','Extra3','Extra4','Extra5','Extra6','Extra7','Extra8','Extra9','Extra10','Extra11','Extra12','LDDNBo','HDSo','HVTNXHang','TNVChuyen','PTVChuyen','HDKTNgay','HDKTSo','CCCDan'
  ];
  function vDateObj(v){
    if(!v) return null;
    if(v instanceof Date && !isNaN(v)) return v;
    const s=String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0,10)+'T12:00:00');
    let m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12,0,0);
    const d=new Date(s); return isNaN(d)?null:d;
  }
  function vDate(v){const d=vDateObj(v)||new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
  function vProduct(sku){try{return typeof findProduct==='function'?findProduct(sku)||{}:{};}catch(e){return {};}}
  function vFinalUnit(it,o){
    const src=mkTxt(o?.source||o?.orderSource).toUpperCase();
    if(src==='DMS'){
      const dms=mkInt(it?.salePrice ?? it?.finalUnitPrice ?? it?.excelPrice ?? it?.priceP);
      if(dms>0) return dms;
    }
    const explicit=mkInt(it?.salePrice ?? it?.finalUnitPrice ?? it?.priceAfterDiscount);
    if(explicit>0) return explicit;
    const p=vProduct(it?.sku);
    const base=mkInt(it?.sale || p.sale || it?.basePrice || 0);
    const disc=Number(it?.disc ?? it?.discountPercent ?? 0)||0;
    return disc>0 ? Math.round(base*(1-disc/100)) : base;
  }
  function vTax(o,it){const p=vProduct(it?.sku); const n=Number(it?.taxRate ?? it?.vatRate ?? p.taxRate ?? p.vatRate ?? o?.taxRate ?? o?.vatRate ?? 8); return isNaN(n)?8:n;}
  function vCustomer(o){
    let c={};
    try{
      const code=(typeof orderCustomerCode==='function'?orderCustomerCode(o):o?.customerCode)||o?.customerCode||'';
      c=(db.customers||[]).find(x=>mkTxt(x.code)===mkTxt(code)) || (db.customers||[]).find(x=>mkNorm(x.name)===mkNorm(o?.customer)) || {};
    }catch(e){}
    return {
      code:mkTxt((typeof orderCustomerCode==='function'?orderCustomerCode(o):o?.customerCode)||o?.customerCode),
      name:mkTxt(o?.invoiceName || c.invoiceName || c.companyName || c.name || o?.customer),
      buyer:mkTxt(o?.buyerName || c.buyerName || c.contactName || c.name || o?.customer),
      tax:mkTxt(o?.customerTax || o?.tax || c.tax || c.taxCode || c.maSoThue),
      address:mkTxt(o?.customerAddress || o?.address || c.address || c.diaChi),
      phone:mkTxt(o?.customerPhone || o?.phone || c.phone || c.dienThoai),
      bankAccount:mkTxt(o?.customerBankAccount || c.bankAccount || c.soTaiKhoan),
      bankName:mkTxt(o?.customerBankName || c.bankName || c.nganHang),
      email:mkTxt(o?.customerEmail || c.email),
      citizenId:mkTxt(o?.customerCitizenId || c.cccd || c.cccdan)
    };
  }
  function vPay(o){const cash=mkNum(o?.cashPaid), bank=mkNum(o?.bankPaid); if(cash>0&&bank>0)return 'TM/CK'; if(bank>0)return 'CK'; if(cash>0)return 'TM'; return 'TM/CK';}
  function vSelectedOrders(){
    const selected=[...document.querySelectorAll('.print-order-check:checked')].map(x=>mkTxt(x.value)).filter(Boolean);
    if(selected.length) return (db.orders||[]).filter(o=>selected.includes(mkTxt(o.id)));
    return (typeof filteredOrders==='function'?filteredOrders():(db.orders||[]));
  }
  function vLineCalc(o,it){
    const qty=mkInt(it?.qty ?? it?.sellQty ?? 0);
    const grossUnit=vFinalUnit(it,o);
    const grossLine=Math.round(qty*grossUnit);
    const tax=vTax(o,it);
    const preTaxLine=tax>0? grossLine/(1+tax/100):grossLine;
    const preTaxUnit=qty>0? preTaxLine/qty:0;
    return {qty,grossUnit,grossLine,tax,preTaxLine,preTaxUnit,taxAmount:grossLine-preTaxLine};
  }
  function vOrderTotals(o){
    let pre=0,tax=0,gross=0;
    (o.items||[]).forEach(it=>{const c=vLineCalc(o,it); if(c.qty<=0)return; pre+=c.preTaxLine; tax+=c.taxAmount; gross+=c.grossLine;});
    return {pre,tax,gross};
  }
  function vRow(o,it,stt,isFirst,totals){
    const c=vCustomer(o), p=vProduct(it?.sku), lc=vLineCalc(o,it);
    return [
      isFirst?stt:'',
      isFirst?vDate(o?.isoDate||o?.date):'',
      isFirst?c.code:'',
      isFirst?c.name:'',
      isFirst?c.buyer:'',
      isFirst?c.tax:'',
      isFirst?c.address:'',
      isFirst?c.phone:'',
      isFirst?c.bankAccount:'',
      isFirst?c.bankName:'',
      isFirst?vPay(o):'',
      mkTxt(it?.sku),
      mkTxt(it?.name || p.name),
      productUnit({...p,...it}),
      '',
      '',
      lc.qty,
      Number(lc.preTaxUnit.toFixed(6)),
      '',
      '',
      Number(lc.preTaxLine.toFixed(6)),
      isFirst?Number(totals.pre.toFixed(6)):'',
      isFirst?lc.tax:'',
      '',
      isFirst?Number(totals.tax.toFixed(6)):'',
      isFirst?Math.round(totals.gross):'',
      0,
      isFirst?'VND':'',
      '',
      isFirst?mkTxt(o?.id):'',
      '',
      '',
      isFirst?c.email:'',
      '',
      '', '', '', '', '', '', '', '', '', '',
      '',
      '',
      '',
      isFirst?mkTxt(o?.deliveryStaffName):'',
      '',
      '',
      '',
      isFirst?c.citizenId:''
    ];
  }
  window.exportVNPTInvoices=function(){
    try{
      if(typeof XLSX==='undefined') return toast('Thiếu thư viện XLSX để xuất hóa đơn VNPT');
      const orders=vSelectedOrders().filter(o=>Array.isArray(o.items)&&o.items.length);
      if(!orders.length) return toast('Chưa có đơn hàng để xuất hóa đơn VNPT');
      const aoa=[VNPT_TT78_HEADERS];
      let invoiceNo=1;
      orders.forEach(o=>{
        const valid=(o.items||[]).filter(it=>mkInt(it?.qty ?? it?.sellQty ?? 0)>0);
        if(!valid.length) return;
        const totals=vOrderTotals({...o,items:valid});
        valid.forEach((it,idx)=>aoa.push(vRow(o,it,invoiceNo,idx===0,totals)));
        invoiceNo++;
      });
      if(aoa.length<=1) return toast('Không có dòng hàng hợp lệ để xuất VNPT');
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=VNPT_TT78_HEADERS.map((h,i)=>({wch: i===6?36:(i===12?46:(i===17||i===20||i===21||i===24||i===25?16:14))}));
      XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
      const d=new Date(); const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      XLSX.writeFile(wb,'Hoa_don_VNPT_TT78_'+ds+'.xlsx');
      toast('Đã xuất file VNPT TT78 đúng mẫu: '+(aoa.length-1)+' dòng hàng');
    }catch(err){console.error(err); toast('Không xuất được hóa đơn VNPT: '+(err.message||'lỗi không rõ'));}
  };

  setTimeout(function(){try{ensureProductUnitUI(); if(document.getElementById('productCatalogBody')) renderProductCatalog();}catch(e){}},800);
})();



/* =========================================================
   PATCH 2026-05-22 - DON TONG / CONG NO
   1) Cho phep 1 don con van gop thanh don tong.
   2) In gop tam nhieu don tong: khong luu, khong tao ma moi.
   3) Phieu in don tong bo bang "don con da gop" cho de nhin.
   4) San pham trong phieu in don tong tach rieng theo Kho quan ly.
   5) Bao cao cong no them loc theo nhan vien ban hang.
   ========================================================= */

function mkMasterItemWarehouse(it){
  const sku=String(it?.sku||'').trim();
  const p=sku ? findProduct(sku) : null;
  return String(
    (p && productWarehouse(p)) ||
    it?.warehouse ||
    it?.khoHang ||
    it?.['Kho hàng'] ||
    'Chưa phân kho'
  ).trim() || 'Chưa phân kho';
}

function mkNormalizeMasterItem(it){
  const qty=Number(it?.qty||0)||0;
  const sale=Number(it?.sale||0)||0;
  const disc=Number(it?.disc||0)||0;
  const goods=Number(it?.goods!==undefined?it.goods:(qty*sale))||0;
  const discount=Number(it?.discount!==undefined?it.discount:(qty*sale*(disc/100)))||0;
  const total=Number(it?.total!==undefined?it.total:(goods-discount))||0;
  const p=findProduct(it?.sku||'')||{};
  return {
    ...it,
    sku:String(it?.sku||''),
    name:it?.name || p.name || '',
    pack:Number(it?.pack||p.pack||1)||1,
    sale:sale || Number(p.sale||0)||0,
    cost:Number(it?.cost||p.cost||0)||0,
    qty,
    goods,
    discount,
    total,
    warehouse:mkMasterItemWarehouse(it)
  };
}

function mkAggregateMasterItems(items){
  const map={};
  (items||[]).forEach(raw=>{
    const it=mkNormalizeMasterItem(raw);
    const key=String(it.sku||'').trim();
    if(!key)return;
    if(!map[key]){
      map[key]={...it, qty:0, goods:0, discount:0, total:0};
    }
    map[key].qty+=Number(it.qty||0);
    map[key].goods+=Number(it.goods||0);
    map[key].discount+=Number(it.discount||0);
    map[key].total+=Number(it.total||0);
    if(it.sale)map[key].sale=it.sale;
    if(it.cost)map[key].cost=it.cost;
    if(it.pack)map[key].pack=it.pack;
    map[key].warehouse=it.warehouse||map[key].warehouse||'Chưa phân kho';
  });
  return Object.values(map).sort((a,b)=>{
    const wa=normText(a.warehouse), wb=normText(b.warehouse);
    if(wa!==wb)return wa.localeCompare(wb);
    return String(a.sku||'').localeCompare(String(b.sku||''));
  });
}

function mkGroupItemsByWarehouse(items){
  const groups={};
  mkAggregateMasterItems(items).forEach(it=>{
    const wh=mkMasterItemWarehouse(it);
    if(!groups[wh])groups[wh]={warehouse:wh,items:[],qty:0,goods:0,discount:0,total:0};
    groups[wh].items.push(it);
    groups[wh].qty+=Number(it.qty||0);
    groups[wh].goods+=Number(it.goods||0);
    groups[wh].discount+=Number(it.discount||0);
    groups[wh].total+=Number(it.total||0);
  });
  return Object.values(groups).sort((a,b)=>normText(a.warehouse).localeCompare(normText(b.warehouse)));
}

function mkMasterPrintRowsByWarehouse(items){
  const groups=mkGroupItemsByWarehouse(items);
  let index=1;
  return groups.map(g=>{
    const head=`<tr class="warehouse-row"><td colspan="9"><b>Kho quản lý: ${escapeHtml(g.warehouse)}</b> <span>· ${g.items.length} mặt hàng · SL ${money(g.qty)} · Giá trị ${money(g.total)}</span></td></tr>`;
    const rows=g.items.map(it=>`<tr>
      <td>${index++}</td>
      <td>${escapeHtml(it.sku||'')}</td>
      <td>${escapeHtml(it.name||'')}</td>
      <td class="r">${money(it.sale)}</td>
      <td class="r">${qtyView(it.qty,it.pack)}</td>
      <td class="r">${Number(it.qty)||0}</td>
      <td class="r">${money(it.goods||0)}</td>
      <td class="r">${money(it.discount||0)}</td>
      <td class="r"><b>${money(it.total||0)}</b></td>
    </tr>`).join('');
    const foot=`<tr class="warehouse-total"><td colspan="5" class="r"><b>Cộng kho ${escapeHtml(g.warehouse)}</b></td><td class="r"><b>${money(g.qty)}</b></td><td class="r"><b>${money(g.goods)}</b></td><td class="r"><b>${money(g.discount)}</b></td><td class="r"><b>${money(g.total)}</b></td></tr>`;
    return head+rows+foot;
  }).join('');
}

function mkBuildMasterPrintHtml({title,id,date,note,delivery,items,childCount}){
  const normalized=mkAggregateMasterItems(items||[]);
  const rows=mkMasterPrintRowsByWarehouse(normalized);
  const total=normalized.reduce((a,b)=>a+Number(b.total||0),0);
  const goods=normalized.reduce((a,b)=>a+Number(b.goods||0),0);
  const discount=normalized.reduce((a,b)=>a+Number(b.discount||0),0);
  const totalQty=normalized.reduce((a,b)=>a+Number(b.qty||0),0);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title||'Đơn tổng')}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#111}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px}
    .invoice-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px}
    .invoice-mark{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#1d4ed8,#16a34a);display:inline-grid;place-items:center;color:#fff}
    .title{text-align:center;font-size:22px;font-weight:800;margin:18px 0}
    .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 14px}
    .info div{border:1px solid #ddd;border-radius:8px;padding:8px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #bbb;padding:7px;font-size:12px;vertical-align:top}
    th{background:#f3f4f6}
    .r{text-align:right}
    .warehouse-row td{background:#dbeafe!important;font-size:14px;color:#0f172a}
    .warehouse-row span{font-weight:400;color:#475569}
    .warehouse-total td{background:#f8fafc}
    .sum{width:420px;margin-left:auto;margin-top:14px}
    .sum div{display:flex;justify-content:space-between;border-bottom:1px dashed #bbb;padding:6px 0}
    .note{margin-top:12px;border:1px solid #ddd;border-radius:8px;padding:8px}
    @media print{button{display:none}body{margin:10mm}.warehouse-row td{background:#dbeafe!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.warehouse-total td{background:#f8fafc!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <button onclick="window.print()">In / Lưu PDF</button>
    <div class="top">
      <div class="invoice-logo"><div class="invoice-mark">MK</div><div>Kho Minh Khai<br><small>Thái Bình</small></div></div>
      <div class="r"><b>Ngày in:</b> ${today()}<br><b>Số đơn con:</b> ${childCount||0}</div>
    </div>
    <div class="title">${escapeHtml(title||'PHIẾU ĐƠN TỔNG')}</div>
    <div class="info">
      <div><b>Mã đơn tổng:</b> ${escapeHtml(id||'')}</div>
      <div><b>Ngày tạo:</b> ${escapeHtml(date||'')}</div>
      <div><b>Nhân viên giao hàng:</b> ${escapeHtml(delivery||'Chưa gán')}</div>
      <div><b>Tổng mặt hàng:</b> ${normalized.length}</div>
    </div>
    <table>
      <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th class="r">Giá bán</th><th class="r">SL thùng/lẻ</th><th class="r">SL lẻ</th><th class="r">Tiền hàng</th><th class="r">CK</th><th class="r">Thành tiền</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#777">Không có sản phẩm</td></tr>'}</tbody>
    </table>
    <div class="sum">
      <div><span>Tổng số lượng lẻ</span><b>${money(totalQty)}</b></div>
      <div><span>Tổng tiền hàng</span><b>${money(goods)}</b></div>
      <div><span>Tổng chiết khấu</span><b>${money(discount)}</b></div>
      <div><span>Tổng thanh toán</span><b>${money(total)}</b></div>
    </div>
    ${note?`<div class="note"><b>Ghi chú:</b> ${escapeHtml(note)}</div>`:''}
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script>
  </body></html>`;
}

printMasterOrder=function(id){
  let m=(db.masterOrders||[]).find(x=>String(x.id)===String(id));
  if(!m)return toast('Không tìm thấy đơn tổng');
  let orders=(db.orders||[]).filter(o=>(m.childIds||[]).includes(o.id));
  let items=(m.items&&m.items.length)?m.items:aggregateOrderItems(orders);
  const html=mkBuildMasterPrintHtml({
    title:'PHIẾU ĐƠN TỔNG',
    id:m.id,
    date:m.date,
    note:m.note||'',
    delivery:deliveryDisplay(m.deliveryStaffCode,m.deliveryStaffName),
    items,
    childCount:(m.childIds||[]).length
  });
  let w=window.open('','_blank');
  w.document.open();w.document.write(html);w.document.close();
};

function printSelectedMasterOrdersTemporary(){
  const ids=[...document.querySelectorAll('.master-print-check:checked')].map(x=>x.value);
  if(!ids.length)return toast('Chọn ít nhất 1 đơn tổng để in gộp tạm');
  const masters=(db.masterOrders||[]).filter(m=>ids.includes(String(m.id)));
  if(!masters.length)return toast('Không tìm thấy đơn tổng đã chọn');

  let allItems=[];
  let childCount=0;
  const notes=[];
  const deliveries=new Set();
  masters.forEach(m=>{
    const orders=(db.orders||[]).filter(o=>(m.childIds||[]).includes(o.id));
    const items=(m.items&&m.items.length)?m.items:aggregateOrderItems(orders);
    allItems=allItems.concat(items||[]);
    childCount+=(m.childIds||[]).length;
    if(m.note)notes.push(m.id+': '+m.note);
    const d=deliveryDisplay(m.deliveryStaffCode,m.deliveryStaffName);
    if(d)deliveries.add(d);
  });

  const html=mkBuildMasterPrintHtml({
    title:'PHIẾU IN GỘP TẠM NHIỀU ĐƠN TỔNG',
    id:ids.join(', '),
    date:today(),
    note:notes.join(' | '),
    delivery:[...deliveries].join(', ') || 'Nhiều nhân viên/Chưa gán',
    items:allItems,
    childCount
  });
  let w=window.open('','_blank');
  w.document.open();w.document.write(html);w.document.close();
}

function toggleAllMasterPrintOrders(cb){
  document.querySelectorAll('.master-print-check').forEach(x=>x.checked=!!cb.checked);
}

function ensureMasterTempPrintToolbar(){
  const body=document.getElementById('masterOrdersBody');
  if(!body)return;
  const wrap=body.closest('.table-wrap') || body.parentElement;
  if(!wrap || document.getElementById('masterTempPrintToolbar'))return;
  wrap.insertAdjacentHTML('beforebegin', `<div id="masterTempPrintToolbar" class="toolbar" style="margin:10px 0">
    <label class="pill" style="cursor:pointer"><input type="checkbox" onchange="toggleAllMasterPrintOrders(this)"> Chọn tất cả đơn tổng</label>
    <button class="btn orange" onclick="printSelectedMasterOrdersTemporary()">In gộp tạm các đơn tổng đã chọn</button>
    <span class="muted">Chỉ in tạm thời, không lưu và không tạo mã đơn tổng mới.</span>
  </div>`);
}

renderMasterOrders=function(){
  const body=document.getElementById('masterOrdersBody');
  if(!body)return;
  body.innerHTML=filteredMasterOrders().slice().reverse().map(m=>{
    let items=m.items||[];
    let totalQty=items.reduce((a,b)=>a+Number(b.qty||0),0);
    return `<tr>
      <td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" class="master-print-check" value="${safeAttr(m.id)}"><b>${escapeHtml(m.id||'')}</b></label></td>
      <td>${escapeHtml(m.date||'')}</td>
      <td class="center">${(m.childIds||[]).length}</td>
      <td class="center">${items.length}</td>
      <td class="right">${totalQty}</td>
      <td class="right">${money(m.total)}</td>
      <td>${escapeHtml(deliveryDisplay(m.deliveryStaffCode,m.deliveryStaffName))}</td>
      <td>${escapeHtml(m.note||'')}</td>
      <td><button class="btn small light" onclick="printMasterOrder('${safeAttr(m.id)}')">In PDF</button> <button class="btn small red" onclick="unmergeMasterOrder('${safeAttr(m.id)}')">Hủy gộp</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="9" class="center muted">Chưa có đơn tổng phù hợp</td></tr>';
  ensureMasterTempPrintToolbar();
};

createMasterOrder=function(){
  let ids=[...document.querySelectorAll('.merge-check:checked')].map(x=>x.value);
  if(ids.length<1)return toast('Chọn ít nhất 1 đơn con để gộp đơn tổng');
  let id=(document.getElementById('masterId')?.value||masterOrderId()).trim();
  if((db.masterOrders||[]).some(m=>m.id===id))return toast('Mã đơn tổng đã tồn tại');
  let orders=db.orders.filter(o=>ids.includes(o.id)&&!o.masterId);
  if(orders.length!==ids.length)return toast('Có đơn đã được gộp trước đó, vui lòng làm mới');
  let items=aggregateOrderItems(orders);
  let total=items.reduce((a,b)=>a+Number(b.total||0),0);
  let goods=items.reduce((a,b)=>a+Number(b.goods||0),0);
  let discount=items.reduce((a,b)=>a+Number(b.discount||0),0);
  let cost=orders.reduce((a,o)=>a+Number(o.cost||0),0);
  let mdOpt=document.getElementById('masterDeliveryStaff')?.selectedOptions?.[0];
  let cashPaid=orders.reduce((a,o)=>a+Number(o.cashPaid||0),0);
  let bankPaid=orders.reduce((a,o)=>a+Number(o.bankPaid||0),0);
  let m={id,date:today(),isoDate:new Date().toISOString(),childIds:ids,items,goods,discount,total,cost,cashPaid,bankPaid,debt:Math.max(0,total-cashPaid-bankPaid),deliveryStaffCode:document.getElementById('masterDeliveryStaff')?.value||'',deliveryStaffName:mdOpt?mdOpt.dataset.name:'',note:document.getElementById('masterNote')?.value||''};
  db.masterOrders.push(m);
  db.orders.forEach(o=>{if(ids.includes(o.id)){o.masterId=id; if(m.deliveryStaffCode){o.deliveryStaffCode=m.deliveryStaffCode; o.deliveryStaffName=m.deliveryStaffName;}}});
  if(document.getElementById('masterId'))masterId.value='';
  if(document.getElementById('masterNote'))masterNote.value='';
  if(document.getElementById('masterDeliveryStaff')) masterDeliveryStaff.value='';
  save();render();toast('Đã tạo đơn tổng '+id+' với '+items.length+' mặt hàng');
};

function debtOrderByIdForFilter(orderId){
  return (db.orders||[]).find(o=>String(o.id)===String(orderId))||{};
}

debtRows=function(){
  return (db.orders||[]).map(o=>{
    let total=Number(o.total||0), cash=Number(o.cashPaid||0), bank=Number(o.bankPaid||0), paid=cash+bank, debt=total-paid;
    o.debt=debt;
    o.paymentStatus=getPaymentStatusText(total,paid,o.dueDate||'');
    return {
      delivery:orderDeliveryText(o),
      deliveryCode:orderDeliveryCode(o),
      salesStaff:staffDisplayOrder(o),
      salesStaffCode:o.staffCode||o.staffMa||'',
      orderId:o.id,
      customerCode:orderCustomerCode(o)||'',
      customer:o.customer||'',
      total,cash,bank,paid,debt,
      status:o.paymentStatus,
      date:o.date||'',
      dueDate:o.dueDate||'',
      age:debtDueAge(o)
    };
  });
};

filteredDebtRows=function(){
  let rows=debtRows();
  let fd=normText(document.getElementById('debtFilterDelivery')?.value||'');
  let fs=normText(document.getElementById('debtFilterSalesStaff')?.value||'');
  let fc=normText(document.getElementById('debtFilterCustomerCode')?.value||'');
  let fn=normText(document.getElementById('debtFilterCustomerName')?.value||'');
  let overRaw=(document.getElementById('debtOverDays')?.value||'').trim();
  let overDays=overRaw===''?null:(Number(overRaw)||0);
  return rows.filter(r=>{
    if(fd && !normText((r.delivery||'')+' '+(r.deliveryCode||'')).includes(fd)) return false;
    if(fs && !normText((r.salesStaff||'')+' '+(r.salesStaffCode||'')).includes(fs)) return false;
    if(fc && !normText(r.customerCode).includes(fc)) return false;
    if(fn && !normText(r.customer).includes(fn)) return false;
    if(overDays!==null && !(Number(r.debt)>0 && Number(r.age)>=overDays)) return false;
    return true;
  });
};

function ensureDebtSalesStaffFilter(){
  const delivery=document.getElementById('debtFilterDelivery');
  if(!delivery || document.getElementById('debtFilterSalesStaff'))return;
  const field=delivery.closest('.field') || delivery.parentElement;
  if(!field)return;
  field.insertAdjacentHTML('afterend', `<div class="field"><label>Nhân viên bán hàng</label><input id="debtFilterSalesStaff" placeholder="Mã hoặc tên NVBH" onkeydown="if(event.key==='Enter')openDebtSearchResults()"></div>`);
}

const _mkOldClearDebtFilters=typeof clearDebtFilters==='function'?clearDebtFilters:null;
clearDebtFilters=function(){
  ['debtFilterDelivery','debtFilterSalesStaff','debtFilterCustomerCode','debtFilterCustomerName','debtOverDays'].forEach(id=>{let e=document.getElementById(id); if(e)e.value='';});
  renderDebtReports();
};

exportDebtReport=function(){
  let rows=filteredDebtRows().map(r=>({
    'Nhân viên giao hàng':r.delivery,
    'Nhân viên bán hàng':r.salesStaff,
    'Mã NVBH':r.salesStaffCode,
    'Đơn hàng':r.orderId,
    'Mã khách hàng':r.customerCode,
    'Tên khách hàng':r.customer,
    'Giá trị đơn hàng':r.total,
    'Tiền mặt thanh toán':r.cash,
    'Tiền chuyển khoản':r.bank,
    'Đã thu':r.paid,
    'Công nợ':r.debt,
    'Trạng thái':r.status,
    'Ngày bán':r.date,
    'Hạn thanh toán':r.dueDate,
    'Quá hạn ngày':r.age
  }));
  if(!rows.length)return toast('Không có dữ liệu công nợ để xuất');
  downloadExcel(rows,'bao_cao_cong_no.xlsx');
};

(function mkPatchInit(){
  const oldPage=typeof page==='function'?page:null;
  if(oldPage && !oldPage.__mkDebtSalesPatch){
    page=function(){
      const r=oldPage.apply(this,arguments);
      setTimeout(()=>{ensureDebtSalesStaffFilter();ensureMasterTempPrintToolbar();},30);
      return r;
    };
    page.__mkDebtSalesPatch=true;
  }
  const oldRender=typeof render==='function'?render:null;
  if(oldRender && !oldRender.__mkDebtSalesPatch){
    render=function(){
      const r=oldRender.apply(this,arguments);
      setTimeout(()=>{ensureDebtSalesStaffFilter();ensureMasterTempPrintToolbar();},30);
      return r;
    };
    render.__mkDebtSalesPatch=true;
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ensureDebtSalesStaffFilter();ensureMasterTempPrintToolbar();},100));
})();



/* =========================================================
   PATCH IN ĐƠN TỔNG THEO KHO - TÁCH BIỆT TỪNG KHO ĐỂ BỐ HÀNG
   Ghi chú:
   - Không lưu thêm dữ liệu.
   - Khi in đơn tổng, sản phẩm được gom theo kho quản lý.
   - Mỗi kho in thành một khối riêng: tiêu đề kho + bảng hàng riêng.
   ========================================================= */

function getProductWarehouseForPrint(sku, item) {
  const p = (db.products || []).find(x => String(x.sku || '').trim() === String(sku || '').trim());
  return (
    (p && (p.warehouse || p.khoHang || p['Kho hàng'] || p['Kho quản lý'])) ||
    item?.warehouse ||
    item?.khoHang ||
    item?.['Kho hàng'] ||
    'Kho chưa phân loại'
  );
}

function groupPrintItemsByWarehouse(items) {
  const map = {};
  (items || []).forEach(it => {
    const sku = String(it.sku || '').trim();
    const wh = String(getProductWarehouseForPrint(sku, it) || 'Kho chưa phân loại').trim() || 'Kho chưa phân loại';
    if (!map[wh]) map[wh] = [];
    map[wh].push(it);
  });

  return Object.keys(map)
    .sort((a, b) => a.localeCompare(b, 'vi'))
    .map(warehouse => ({
      warehouse,
      items: map[warehouse].sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || ''), 'vi'))
    }));
}

function buildWarehouseSeparatedItemsHtml(items) {
  const groups = groupPrintItemsByWarehouse(items);

  if (!groups.length) {
    return '<div style="padding:12px;border:1px solid #ddd;margin-top:10px">Không có sản phẩm để in.</div>';
  }

  return groups.map((g, groupIndex) => {
    const totalQty = g.items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
    const totalMoney = g.items.reduce((a, it) => a + ((Number(it.qty) || 0) * (Number(it.sale || it.price || 0) || 0)), 0);

    return `
      <div class="warehouse-print-block">
        <div class="warehouse-print-title">
          <div>
            <b>KHO ${groupIndex + 1}: ${escapeHtml(g.warehouse)}</b>
            <span> - Số dòng: ${g.items.length} - Tổng SL: ${money(totalQty)}</span>
          </div>
          <div><b>${money(totalMoney)} đ</b></div>
        </div>

        <table class="print-table warehouse-print-table">
          <thead>
            <tr>
              <th style="width:40px">STT</th>
              <th style="width:110px">Mã hàng</th>
              <th>Tên hàng</th>
              <th style="width:70px">ĐVT</th>
              <th style="width:90px">Quy cách</th>
              <th style="width:90px">Số lượng</th>
              <th style="width:110px">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${g.items.map((it, i) => {
              const p = (db.products || []).find(x => String(x.sku || '').trim() === String(it.sku || '').trim()) || {};
              return `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td><b>${escapeHtml(it.sku || '')}</b></td>
                  <td>${escapeHtml(it.name || '')}</td>
                  <td class="center">${escapeHtml(it.unit || p.unit || p.dvt || p['Đơn vị tính'] || '')}</td>
                  <td class="center">${escapeHtml(it.pack || p.pack || '')}</td>
                  <td class="right"><b>${typeof qtyView === 'function' ? qtyView(Number(it.qty) || 0, Number(it.pack || p.pack || 1) || 1) : money(it.qty || 0)}</b></td>
                  <td></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="warehouse-print-sign">
          <span>Kho xuất hàng</span>
          <span>Người nhận hàng</span>
          <span>Kiểm soát</span>
        </div>
      </div>
    `;
  }).join('');
}

function openPrintWindowWarehouseSeparated(title, headerHtml, items) {
  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title || 'In đơn tổng')}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:18px;font-size:12px}
        h1,h2,h3{margin:0}
        .print-head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
        .muted{color:#555}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
        .summary div{border:1px solid #ddd;padding:7px;border-radius:6px}
        .warehouse-print-block{
          margin-top:18px;
          padding-top:8px;
          page-break-inside:avoid;
          border-top:3px solid #111;
        }
        .warehouse-print-block + .warehouse-print-block{
          page-break-before:always;
        }
        .warehouse-print-title{
          display:flex;
          justify-content:space-between;
          align-items:center;
          background:#f1f5f9;
          border:1px solid #111;
          padding:8px 10px;
          font-size:15px;
          margin-bottom:0;
        }
        .print-table{
          width:100%;
          border-collapse:collapse;
        }
        .print-table th,.print-table td{
          border:1px solid #111;
          padding:6px;
          vertical-align:top;
        }
        .print-table th{
          background:#f8fafc;
          text-align:center;
        }
        .center{text-align:center}
        .right{text-align:right}
        .warehouse-print-sign{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:16px;
          margin-top:18px;
          text-align:center;
          font-weight:bold;
          min-height:70px;
        }
        @media print{
          body{margin:10mm}
          .warehouse-print-block + .warehouse-print-block{page-break-before:always}
        }
      </style>
    </head>
    <body>
      ${headerHtml || ''}
      ${buildWarehouseSeparatedItemsHtml(items || [])}
      <script>
        window.onload = function(){
          setTimeout(function(){ window.print(); }, 250);
        };
      </script>
    </body>
    </html>
  `;

  const w = window.open('', '_blank');
  if (!w) {
    toast && toast('Trình duyệt đang chặn cửa sổ in');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* 
  Hàm tiện ích cho các hàm in đơn tổng dùng lại:
  - master: đơn tổng
  - items: danh sách sản phẩm đã aggregate
*/
function printMasterOrderWarehouseSeparated(master, items) {
  const header = `
    <div class="print-head">
      <div>
        <h2>Kho Minh Khai Thái Bình</h2>
        <div class="muted">Phiếu bố hàng theo từng kho</div>
      </div>
      <div style="text-align:right">
        <h2>ĐƠN TỔNG</h2>
        <div>Mã đơn tổng: <b>${escapeHtml(master?.id || '')}</b></div>
        <div>Ngày: ${escapeHtml(master?.date || today())}</div>
      </div>
    </div>

    <div class="summary">
      <div>Nhân viên giao hàng<br><b>${escapeHtml(master?.deliveryStaffName || master?.delivery || '')}</b></div>
      <div>Số đơn con<br><b>${Array.isArray(master?.childIds) ? master.childIds.length : ''}</b></div>
      <div>Tổng dòng hàng<br><b>${Array.isArray(items) ? items.length : 0}</b></div>
      <div>Tổng giá trị<br><b>${money(master?.total || 0)} đ</b></div>
    </div>

    ${master?.note ? `<div style="border:1px solid #ddd;padding:8px;margin:8px 0"><b>Ghi chú:</b> ${escapeHtml(master.note)}</div>` : ''}
  `;

  openPrintWindowWarehouseSeparated('Đơn tổng theo kho', header, items || master?.items || []);
}

/* =========================================================
   FINAL PATCH - PHIEU XUAT KHO GOP THEO BO CUC MAU
   - In đơn tổng theo bố cục phiếu xuất kho gộp.
   - Bảng trên: tổng hợp đơn con ngắn gọn.
   - Bảng dưới: sản phẩm tách riêng theo Kho quản lý.
   - Không tạo mã đơn tổng mới khi in gộp tạm nhiều đơn tổng.
   - Không thay đổi dữ liệu công nợ, chỉ xử lý dữ liệu lúc in.
   ========================================================= */

function mkPxkgNum(n){
  return (Number(n)||0).toLocaleString('vi-VN');
}
function mkPxkgDateText(v){
  if(!v) return '';
  const d=dateValue ? dateValue(v) : new Date(v);
  if(!d || isNaN(d)) return String(v||'');
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
}
function mkPxkgProductUnit(p,it){
  return String(it?.unit || it?.dvt || p?.unit || p?.dvt || p?.['Đơn vị tính'] || '').trim();
}
function mkPxkgWarehouseName(sku,it){
  const p=sku ? findProduct(sku) : null;
  return String((p && productWarehouse(p)) || it?.warehouse || it?.khoHang || it?.['Kho hàng'] || it?.['Kho quản lý'] || 'Kho chưa phân loại').trim() || 'Kho chưa phân loại';
}
function mkPxkgNormalizeItem(raw){
  const p=findProduct(raw?.sku||'')||{};
  const qty=Number(raw?.qty||0)||0;
  const pack=Number(raw?.pack||p.pack||1)||1;
  const sale=Number(raw?.sale||raw?.price||p.sale||0)||0;
  const disc=Number(raw?.disc||0)||0;
  const goods=Number(raw?.goods!==undefined?raw.goods:qty*sale)||0;
  const discount=Number(raw?.discount!==undefined?raw.discount:goods*(disc/100))||0;
  const total=Number(raw?.total!==undefined?raw.total:goods-discount)||0;
  return {
    ...raw,
    sku:String(raw?.sku||'').trim(),
    name:String(raw?.name||p.name||'').trim(),
    pack,
    unit:mkPxkgProductUnit(p,raw),
    qty,
    sale,
    goods,
    discount,
    total,
    warehouse:mkPxkgWarehouseName(raw?.sku,raw)
  };
}
function mkPxkgAggregateItems(items){
  const map={};
  (items||[]).forEach(raw=>{
    const it=mkPxkgNormalizeItem(raw);
    if(!it.sku) return;
    const key=it.sku+'|||'+it.warehouse;
    if(!map[key]) map[key]={...it,qty:0,goods:0,discount:0,total:0};
    map[key].qty+=it.qty;
    map[key].goods+=it.goods;
    map[key].discount+=it.discount;
    map[key].total+=it.total;
    if(it.sale) map[key].sale=it.sale;
    if(it.pack) map[key].pack=it.pack;
    if(it.unit) map[key].unit=it.unit;
  });
  return Object.values(map).sort((a,b)=>{
    const aw=normText(a.warehouse), bw=normText(b.warehouse);
    if(aw!==bw) return aw.localeCompare(bw);
    return String(a.sku||'').localeCompare(String(b.sku||''),'vi');
  });
}
function mkPxkgGroupByWarehouse(items){
  const groups={};
  mkPxkgAggregateItems(items).forEach(it=>{
    const wh=it.warehouse || 'Kho chưa phân loại';
    if(!groups[wh]) groups[wh]={warehouse:wh,items:[],goods:0,discount:0,total:0,qty:0};
    groups[wh].items.push(it);
    groups[wh].goods+=Number(it.goods||0);
    groups[wh].discount+=Number(it.discount||0);
    groups[wh].total+=Number(it.total||0);
    groups[wh].qty+=Number(it.qty||0);
  });
  return Object.values(groups).sort((a,b)=>String(a.warehouse).localeCompare(String(b.warehouse),'vi'));
}
function mkPxkgOrdersFromMasters(masters){
  const ids=new Set();
  (masters||[]).forEach(m=>(m.childIds||[]).forEach(id=>ids.add(String(id))));
  return (db.orders||[]).filter(o=>ids.has(String(o.id)));
}
function mkPxkgItemsFromMasters(masters){
  let items=[];
  (masters||[]).forEach(m=>{
    const orders=(db.orders||[]).filter(o=>(m.childIds||[]).map(String).includes(String(o.id)));
    const its=(m.items&&m.items.length)?m.items:aggregateOrderItems(orders);
    items=items.concat(its||[]);
  });
  return items;
}
function mkPxkgOrderSummaryRows(orders){
  const rows=(orders||[]).slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''),'vi'));
  if(!rows.length) return '<tr><td colspan="7" class="center muted">Không có đơn con</td></tr>';
  const goods=rows.reduce((a,o)=>a+Number(o.goods!==undefined?o.goods:o.total||0),0);
  const discount=rows.reduce((a,o)=>a+Number(o.discount||0),0);
  const total=rows.reduce((a,o)=>a+Number(o.total||0),0);
  const sumRow=`<tr class="summary-total"><td></td><td></td><td class="right"><b>Tổng cộng</b></td><td class="right"><b>${mkPxkgNum(goods)}</b></td><td class="right"><b>0</b></td><td class="right"><b>${mkPxkgNum(discount)}</b></td><td class="right"><b>${mkPxkgNum(total)}</b></td></tr>`;
  const body=rows.map((o,i)=>{
    const og=Number(o.goods!==undefined?o.goods:o.total||0)||0;
    const od=Number(o.discount||0)||0;
    const ot=Number(o.total||0)||0;
    return `<tr>
      <td class="center">${i+1}</td>
      <td class="center"><b>${escapeHtml(o.id||'')}</b><br><i>${escapeHtml(mkPxkgDateText(o.isoDate||o.date))}</i></td>
      <td>${escapeHtml(orderCustomerCode(o)||'')} ${escapeHtml(o.customer||'')}<br><i>${escapeHtml(staffDisplayOrder(o)||'')}</i></td>
      <td class="right">${mkPxkgNum(og)}</td>
      <td class="right">0</td>
      <td class="right">${mkPxkgNum(od)}</td>
      <td class="right">${mkPxkgNum(ot)}</td>
    </tr>`;
  }).join('');
  return sumRow+body;
}
function mkPxkgWarehouseBlocks(items){
  const groups=mkPxkgGroupByWarehouse(items);
  if(!groups.length) return '<table class="pxkg-table"><tbody><tr><td class="center muted">Không có sản phẩm để in</td></tr></tbody></table>';
  return groups.map(g=>{
    const totalPack=g.items.reduce((a,it)=>a+Math.floor((Number(it.qty)||0)/(Number(it.pack)||1)),0);
    const totalEach=g.items.reduce((a,it)=>a+((Number(it.qty)||0)%(Number(it.pack)||1)),0);
    const rows=g.items.map((it,i)=>`<tr>
      <td class="center">${i+1}</td>
      <td>${escapeHtml(it.sku||'')}</td>
      <td>${escapeHtml(it.name||'')}</td>
      <td class="center">${escapeHtml(it.unit||'')}</td>
      <td class="center">${escapeHtml(it.pack||'')}</td>
      <td class="right">${mkPxkgNum(it.sale||0)}</td>
      <td class="center"><b>${qtyView(Number(it.qty)||0,Number(it.pack)||1)}</b></td>
      <td class="center"></td>
      <td class="center"><b>${qtyView(Number(it.qty)||0,Number(it.pack)||1)}</b></td>
      <td class="center"></td>
      <td></td>
    </tr>`).join('');
    return `<table class="pxkg-table detail-table">
      <thead>
        <tr class="warehouse-title"><td colspan="11"><b>Kho Xuất: ${escapeHtml(g.warehouse)}</b> | Tổng tiền hàng Bán: ${mkPxkgNum(g.goods)} | Tổng tiền hàng KM: 0 | Tổng tiền XK: ${mkPxkgNum(g.total)}</td></tr>
        <tr>
          <th style="width:38px">Stt</th>
          <th style="width:120px">Mã hàng</th>
          <th>Tên hàng</th>
          <th style="width:55px">ĐVT</th>
          <th style="width:55px">Qc</th>
          <th style="width:90px">Đơn giá</th>
          <th style="width:82px">Số Bán<br>Th\\Lẻ</th>
          <th style="width:82px">Số KM<br>Th\\Lẻ</th>
          <th style="width:82px">Tổng Xuất<br>Th\\Lẻ</th>
          <th style="width:30px">X</th>
          <th style="width:90px">Ghi chú</th>
        </tr>
      </thead>
      <tbody>${rows}
        <tr class="warehouse-total"><td colspan="6" class="right"><b>Tổng cộng kho ${escapeHtml(g.warehouse)}</b></td><td class="center"><b>${totalPack}\\${totalEach}</b></td><td></td><td class="center"><b>${totalPack}\\${totalEach}</b></td><td></td><td></td></tr>
      </tbody>
    </table>`;
  }).join('');
}
function mkPxkgBuildPrintHtml({masters,orders,items,title}){
  masters=masters||[]; orders=orders||[]; items=items||[];
  const allGroups=mkPxkgGroupByWarehouse(items);
  const whText=allGroups.map(g=>g.warehouse).join(' - ') || 'Kho chưa phân loại';
  const totalGoods=mkPxkgAggregateItems(items).reduce((a,it)=>a+Number(it.goods||0),0);
  const totalDiscount=mkPxkgAggregateItems(items).reduce((a,it)=>a+Number(it.discount||0),0);
  const totalPay=mkPxkgAggregateItems(items).reduce((a,it)=>a+Number(it.total||0),0);
  const dateText=mkPxkgDateText(new Date().toISOString());
  const masterIds=masters.map(m=>m.id).filter(Boolean).join(', ');
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${escapeHtml(title||'PHIẾU XUẤT KHO GỘP')}</title>
    <style>
      *{box-sizing:border-box} body{font-family:"Times New Roman",Arial,sans-serif;margin:6mm;color:#000;font-size:13px} .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px}.company{line-height:1.25}.right-head{text-align:left;min-width:260px;line-height:1.9}.title{text-align:center;font-weight:800;font-size:24px;margin:0 0 2px}.sub-info{text-align:center;font-size:12px;margin-bottom:4px}.pxkg-table{width:100%;border-collapse:collapse;margin-top:4px;page-break-inside:auto}.pxkg-table th,.pxkg-table td{border:1px solid #333;padding:4px 5px;vertical-align:middle}.pxkg-table th{font-weight:800;background:#eee;text-align:center}.summary-table td{height:28px}.detail-table{margin-top:6px}.detail-table td{height:25px}.center{text-align:center}.right{text-align:right}.muted{color:#555}.summary-total td{font-weight:700}.warehouse-title td{font-weight:700;text-align:center;background:#fff}.warehouse-total td{font-weight:700}.sign{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;margin-top:10px;font-weight:700}.sign i{font-weight:400}.sign div{min-height:58px}.page-break{page-break-after:always}@media print{button{display:none!important}body{margin:4mm}.detail-table{page-break-inside:auto}.warehouse-title{page-break-after:avoid}.pxkg-table th{background:#eee!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <button style="position:fixed;top:8px;right:8px;z-index:99;padding:8px 12px" onclick="window.print()">In / Lưu PDF</button>
    <div class="top"><div class="company"><b>NPP Minh Khai</b><br>Địa chỉ: Cầu Cảnh Sẽ - Xã Quang Bình - Huyện Kiến Xương - TB<br>ĐT/Fax:</div><div class="right-head">Ngày xuất: <b>${dateText}</b><br>Xuất tại Kho: <b>${escapeHtml(whText)}</b></div></div>
    <div class="title">${escapeHtml(title||'PHIẾU XUẤT KHO GỘP')}</div>
    <div class="sub-info">${masterIds?`Mã đơn tổng: <b>${escapeHtml(masterIds)}</b> · `:''}Tổng tiền hàng: <b>${mkPxkgNum(totalGoods)}</b> · KM Tiền: <b>${mkPxkgNum(totalDiscount)}</b> · Thành tiền: <b>${mkPxkgNum(totalPay)}</b></div>
    <table class="pxkg-table summary-table"><thead><tr><th style="width:42px">Stt</th><th style="width:180px">Số/Ngày giao</th><th>Giao hàng/Diễn giải</th><th style="width:140px">Tiền hàng</th><th style="width:100px">KM Hàng</th><th style="width:130px">KM Tiền</th><th style="width:140px">Thành Tiền</th></tr></thead><tbody>${mkPxkgOrderSummaryRows(orders)}</tbody></table>
    ${mkPxkgWarehouseBlocks(items)}
    <div class="sign"><div>Kế toán<br><i>(Ký và ghi rõ Họ tên)</i></div><div>Thủ Kho<br><i>(Ký và ghi rõ Họ tên)</i></div><div>Giao hàng<br><i>(Ký và ghi rõ Họ tên)</i></div></div>
    <script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`;
}

printMasterOrder=function(id){
  const m=(db.masterOrders||[]).find(x=>String(x.id)===String(id));
  if(!m) return toast('Không tìm thấy đơn tổng');
  const orders=(db.orders||[]).filter(o=>(m.childIds||[]).map(String).includes(String(o.id)));
  const items=(m.items&&m.items.length)?m.items:aggregateOrderItems(orders);
  const html=mkPxkgBuildPrintHtml({masters:[m],orders,items,title:'PHIẾU XUẤT KHO GỘP'});
  const w=window.open('','_blank');
  if(!w){toast('Trình duyệt đang chặn cửa sổ in');return;}
  w.document.open();w.document.write(html);w.document.close();
};

printSelectedMasterOrdersTemporary=function(){
  const ids=[...document.querySelectorAll('.master-print-check:checked')].map(x=>String(x.value||'')).filter(Boolean);
  if(!ids.length) return toast('Chọn ít nhất 1 đơn tổng để in gộp tạm');
  const masters=(db.masterOrders||[]).filter(m=>ids.includes(String(m.id)));
  if(!masters.length) return toast('Không tìm thấy đơn tổng đã chọn');
  const orders=mkPxkgOrdersFromMasters(masters);
  const items=mkPxkgItemsFromMasters(masters);
  const html=mkPxkgBuildPrintHtml({masters,orders,items,title:'PHIẾU XUẤT KHO GỘP'});
  const w=window.open('','_blank');
  if(!w){toast('Trình duyệt đang chặn cửa sổ in');return;}
  w.document.open();w.document.write(html);w.document.close();
};


/* ===== MK PATCH: TỒN KHO DMS - ĐỌC ĐÚNG FILE MẪU DMS + CHÊNH LỆCH 2 CHIỀU ===== */
(function(){
  /*
    File mẫu tồn kho DMS đang dùng các cột vàng:
    - U: Số hiệu hàng hóa
    - V: Mô tả mặt hàng
    - W: Qui cách đóng gói
    - AX: Tồn cuối (CS/SU)
    - AY: Tồn kho cuối kỳ (SU)

    Logic nghiệp vụ:
    1) Tồn DMS > tồn thực tế: DMS đang dư ảo => báo kế toán chấm ra trên DMS.
    2) Tồn DMS < tồn thực tế: thực tế dư hơn DMS => mở trên App bán hàng, NVBH chỉ chấm trong giới hạn chênh lệch.
       Đơn chấm gửi về vẫn trừ tồn thực tế trên phần mềm như đơn thường.
  */

  function dmsEnsureDb(){
    if(typeof db==='undefined' || !db) return;
    db.dmsStocks=Array.isArray(db.dmsStocks)?db.dmsStocks:[];
    db.dmsAllocations=Array.isArray(db.dmsAllocations)?db.dmsAllocations:[]; // giữ tương thích dữ liệu cũ
    db.dmsHistory=Array.isArray(db.dmsHistory)?db.dmsHistory:[];
    db.dmsAllowSales=Array.isArray(db.dmsAllowSales)?db.dmsAllowSales:[];
  }

  function dmsDate(){
    const el=document.getElementById('dmsDate');
    return (el&&el.value) ? el.value : new Date().toISOString().slice(0,10);
  }

  function dmsText(v){
    return String(v===undefined||v===null?'':v).trim();
  }

  function dmsNum(v){
    if(v===undefined||v===null||v==='') return 0;
    if(typeof v==='number') return isFinite(v)?v:0;
    let s=String(v).trim().replace(/\s/g,'');
    if(!s) return 0;
    s=s.replace(/[^\d,.\-]/g,'');
    if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',', '.');
    else s=s.replace(',', '.');
    const n=Number(s);
    return isFinite(n)?n:0;
  }

  function dmsRoundQty(v){
    const n=Number(v)||0;
    return Math.max(0, Math.round(n));
  }

  function dmsPick(row,keys){
    row=row||{};
    for(const k of keys){
      if(row[k]!==undefined && row[k]!==null && String(row[k]).trim()!=='') return row[k];
    }
    const normKeys=Object.keys(row);
    for(const k of keys){
      const nk=normText(k);
      const found=normKeys.find(x=>normText(x)===nk);
      if(found && row[found]!==undefined && row[found]!==null && String(row[found]).trim()!=='') return row[found];
    }
    return '';
  }

  function dmsQtySlashToUnits(value,pack){
    pack=Number(pack)||1;
    const raw=dmsText(value);
    if(!raw) return 0;
    if(raw.includes('/')){
      const parts=raw.split('/');
      const box=dmsNum(parts[0]);
      const each=dmsNum(parts[1]);
      return dmsRoundQty(box*pack+each);
    }
    return dmsRoundQty(dmsNum(raw));
  }

  function dmsSku(row){
    return dmsText(dmsPick(row,[
      'Số hiệu hàng hóa','So hieu hang hoa',
      'Mã hàng','Ma hang','Mã sản phẩm','Ma san pham','Mã SP','Ma SP',
      'sku','SKU','Item Code','Product Code','Code'
    ]));
  }

  function dmsName(row){
    return dmsText(dmsPick(row,[
      'Mô tả mặt hàng','Mo ta mat hang',
      'Tên hàng','Ten hang','Tên sản phẩm','Ten san pham',
      'name','Product Name','Item Name','Tên'
    ]));
  }

  function dmsPack(row){
    const pack=dmsNum(dmsPick(row,[
      'Qui cách đóng gói','Quy cách đóng gói','Qui cach dong goi','Quy cach dong goi',
      'pack','Pack','Đóng gói','Dong goi'
    ]));
    return pack>0?pack:1;
  }

  function dmsQty(row,pack){
    // Ưu tiên cột vàng AY: Tồn kho cuối kỳ (SU)
    const finalSu=dmsPick(row,[
      'Tồn kho cuối kỳ (SU)','Ton kho cuoi ky (SU)',
      'Tồn kho cuối kỳ','Ton kho cuoi ky',
      'Tồn cuối SU','Ton cuoi SU',
      'Tồn cuối (SU)','Ton cuoi (SU)',
      'Tồn DMS','Ton DMS','Tồn kho','Ton kho','qty','Qty','Quantity','Stock','On hand'
    ]);
    if(finalSu!=='' && finalSu!==undefined && finalSu!==null) return dmsRoundQty(dmsNum(finalSu));

    // Nếu chưa có AY thì dùng cột vàng AX: Tồn cuối (CS/SU), quy đổi theo pack
    const finalCsSu=dmsPick(row,[
      'Tồn cuối (CS/SU)','Ton cuoi (CS/SU)',
      'Tồn Cuối (CS/SU)','Ton Cuoi (CS/SU)',
      'Tồn cuối CS/SU','Ton cuoi CS/SU'
    ]);
    return dmsQtySlashToUnits(finalCsSu,pack);
  }

  function dmsCsSu(row){
    return dmsText(dmsPick(row,[
      'Tồn cuối (CS/SU)','Ton cuoi (CS/SU)',
      'Tồn Cuối (CS/SU)','Ton Cuoi (CS/SU)',
      'Tồn cuối CS/SU','Ton cuoi CS/SU'
    ]));
  }

  function dmsWarehouse(row){
    return dmsText(dmsPick(row,['Loại kho','Loai kho','warehouse','Kho','Kho hàng','Kho hang','Warehouse'])) || 'DMS';
  }

  function dmsSourceRowsFromSheet(sheet){
    if(!sheet || !window.XLSX) return [];
    let rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
    if(rows && rows.length) return rows;

    const arr=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
    if(!arr.length) return [];
    const header=(arr[0]||[]).map(x=>String(x||'').trim());
    return arr.slice(1).map(r=>{const o={};header.forEach((h,i)=>{if(h)o[h]=r[i];});return o;});
  }

  function dmsCurrentStock(date){
    dmsEnsureDb();
    date=date||dmsDate();
    let rows=(db.dmsStocks||[]).filter(x=>String(x.date||'').slice(0,10)===String(date).slice(0,10));
    if(!rows.length && db.dmsStocks.length){
      const latest=[...new Set(db.dmsStocks.map(x=>String(x.date||'').slice(0,10)).filter(Boolean))].sort().pop();
      rows=db.dmsStocks.filter(x=>String(x.date||'').slice(0,10)===latest);
    }
    return rows;
  }

  function dmsStockMap(date){
    const map={};
    dmsCurrentStock(date).forEach(x=>{
      const sku=String(x.sku||'').trim();
      if(!sku) return;
      if(!map[sku]) map[sku]={sku,name:x.name||'',qty:0,warehouse:x.warehouse||'DMS',pack:Number(x.pack)||1,csSu:x.csSu||''};
      map[sku].qty+=Number(x.qty||0)||0;
      if(x.name) map[sku].name=x.name;
      if(Number(x.pack)>0) map[sku].pack=Number(x.pack)||1;
      if(x.csSu) map[sku].csSu=x.csSu;
    });
    return map;
  }

  function dmsSetAllowSalesFromDiff(diffRows,date){
    dmsEnsureDb();
    date=date||dmsDate();
    const other=(db.dmsAllowSales||[]).filter(x=>String(x.date||'').slice(0,10)!==date);
    const allowRows=diffRows
      .filter(x=>Number(x.allowSalesQty||0)>0)
      .map(x=>({
        id:'DMSALLOW-'+date+'-'+x.sku,
        date,
        sku:x.sku,
        name:x.name,
        warehouse:x.warehouse||'',
        pack:Number(x.pack)||1,
        originalQty:Number(x.allowSalesQty)||0,
        remainQty:Number(x.allowSalesQty)||0,
        sale:Number(x.sale)||0,
        value:(Number(x.allowSalesQty)||0)*(Number(x.sale)||0),
        status:'Đang mở bán',
        updatedAt:new Date().toISOString()
      }));
    db.dmsAllowSales=other.concat(allowRows);
  }

  function dmsAllowanceList(date){
    dmsEnsureDb();
    date=date||dmsDate();
    return (db.dmsAllowSales||[]).filter(x=>String(x.date||'').slice(0,10)===String(date).slice(0,10) && Number(x.remainQty||0)>0);
  }

  function dmsAllowanceMap(date){
    const map={};
    dmsAllowanceList(date).forEach(x=>{
      const sku=String(x.sku||'').trim();
      if(!sku) return;
      if(!map[sku]) map[sku]={...x,remainQty:0,originalQty:0};
      map[sku].remainQty+=Number(x.remainQty)||0;
      map[sku].originalQty+=Number(x.originalQty)||0;
    });
    return map;
  }

  function dmsGetRemainForSku(sku){
    const map=dmsAllowanceMap(dmsDate());
    return Number(map[String(sku||'').trim()]?.remainQty||0)||0;
  }

  function dmsConsumeSalesAllowance(items){
    dmsEnsureDb();
    const date=dmsDate();
    (items||[]).forEach(it=>{
      let need=Number(it.qty||it.sellQty||0)||0;
      if(need<=0) return;
      const sku=String(it.sku||'').trim();
      (db.dmsAllowSales||[]).forEach(row=>{
        if(need<=0) return;
        if(String(row.date||'').slice(0,10)!==date) return;
        if(String(row.sku||'').trim()!==sku) return;
        const take=Math.min(Number(row.remainQty||0)||0,need);
        row.remainQty=Math.max(0,(Number(row.remainQty)||0)-take);
        row.status=row.remainQty>0?'Đang mở bán':'Đã chấm hết';
        row.updatedAt=new Date().toISOString();
        need-=take;
      });
    });
  }

  window.importDMSStockFromFile=function(ev){
    dmsEnsureDb();
    const file=ev?.target?.files?.[0];
    if(!file) return;
    if(!window.XLSX){toast('Thiếu thư viện XLSX để đọc Excel');return;}
    const date=dmsDate();
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        let rows=[];
        wb.SheetNames.forEach(sn=>{rows=rows.concat(dmsSourceRowsFromSheet(wb.Sheets[sn]));});

        const data=[];
        const seen={};
        rows.forEach(r=>{
          const sku=dmsSku(r);
          if(!sku) return;
          const pack=dmsPack(r);
          const qty=dmsQty(r,pack);
          const item={
            date,
            sku,
            name:dmsName(r),
            pack,
            qty,
            csSu:dmsCsSu(r),
            warehouse:dmsWarehouse(r),
            importedAt:new Date().toISOString()
          };
          if(!seen[sku]){
            seen[sku]=item;
            data.push(item);
          }else{
            seen[sku].qty+=item.qty;
            if(item.name) seen[sku].name=item.name;
            if(item.pack) seen[sku].pack=item.pack;
            if(item.csSu) seen[sku].csSu=item.csSu;
          }
        });

        if(!data.length){
          toast('Không tìm thấy dữ liệu theo file mẫu DMS. Cần các cột vàng: Số hiệu hàng hóa, Mô tả mặt hàng, Qui cách đóng gói, Tồn cuối, Tồn kho cuối kỳ.');
          return;
        }

        db.dmsStocks=(db.dmsStocks||[]).filter(x=>String(x.date||'').slice(0,10)!==date).concat(data);
        db.dmsHistory=db.dmsHistory||[];
        db.dmsHistory.unshift({
          id:'DMS'+Date.now(),
          date,
          lines:data.length,
          totalQty:data.reduce((a,x)=>a+(Number(x.qty)||0),0),
          createdAt:new Date().toISOString(),
          fileName:file.name||'',
          template:'DMS yellow columns U,V,W,AX,AY'
        });

        // Import xong tính luôn chênh lệch và mở giới hạn App bán hàng.
        const diff=calculateDMSDiff({saveAllow:true});
        save();
        renderDMSStockModule();
        toast('Đã import tồn kho DMS '+data.length+' mã. Mở bán app: '+money(diff.reduce((a,x)=>a+(Number(x.allowSalesQty)||0),0))+' SU.');
      }catch(err){
        console.error(err);
        toast('Lỗi đọc file tồn kho DMS: '+(err.message||err));
      }
      if(ev.target) ev.target.value='';
    };
    reader.readAsArrayBuffer(file);
  };

  window.calculateDMSDiff=function(options={}){
    dmsEnsureDb();
    const date=dmsDate();
    const map=dmsStockMap(date);
    const q=normText(document.getElementById('dmsSearch')?.value||'');
    const view=document.getElementById('dmsViewMode')?.value || 'all';

    const rows=(db.products||[]).map(p=>{
      const sku=String(p.sku||'').trim();
      const d=map[sku]||{qty:0,name:'',pack:Number(p.pack)||1};
      const pack=Number(p.pack||d.pack)||1;
      const realQty=Number(p.qty||0)||0;
      const dmsQty=Number(d.qty||0)||0;
      const diff=dmsQty-realQty; // DƯƠNG: DMS dư. ÂM: thực tế dư.
      const accountantQty=Math.max(0,diff);
      const allowSalesQty=Math.max(0,-diff);
      const sale=Number(p.sale||0)||0;
      return {
        sku,
        name:p.name||d.name||sku,
        warehouse:productWarehouse(p),
        pack,
        realQty,
        dmsQty,
        dmsCsSu:d.csSu||qtyView(dmsQty,pack),
        diff,
        accountantQty,
        allowSalesQty,
        sale,
        accountantValue:accountantQty*sale,
        allowSalesValue:allowSalesQty*sale
      };
    }).filter(x=>{
      if(q && !normText(`${x.sku} ${x.name} ${x.warehouse}`).includes(q)) return false;
      if(view==='accountant') return x.accountantQty>0;
      if(view==='sales') return x.allowSalesQty>0;
      if(view==='diff') return x.accountantQty>0 || x.allowSalesQty>0;
      return true;
    }).sort((a,b)=>String(a.warehouse).localeCompare(String(b.warehouse))||String(a.sku).localeCompare(String(b.sku)));

    if(options.saveAllow) dmsSetAllowSalesFromDiff(rows,date);
    return rows;
  };

  window.refreshDMSAllowSales=function(){
    const rows=calculateDMSDiff({saveAllow:true});
    save();
    renderDMSStockModule();
    toast('Đã cập nhật giới hạn App bán hàng từ chênh lệch DMS');
    return rows;
  };

  function dmsAccountantRows(){
    return calculateDMSDiff().filter(x=>x.accountantQty>0);
  }

  function dmsSalesOpenRows(){
    const allow=dmsAllowanceMap(dmsDate());
    return Object.values(allow).sort((a,b)=>String(a.sku).localeCompare(String(b.sku)));
  }

  window.exportDMSAccountantExcel=function(){
    if(!window.XLSX){toast('Thiếu thư viện XLSX');return;}
    const rows=dmsAccountantRows().map((x,i)=>({
      'STT':i+1,
      'Ngày':dmsDate(),
      'Mã hàng':x.sku,
      'Tên hàng':x.name,
      'Kho':x.warehouse,
      'Quy cách':x.pack,
      'Tồn DMS':x.dmsQty,
      'Tồn thực tế':x.realQty,
      'Kế toán cần chấm ra':x.accountantQty,
      'Giá bán':x.sale,
      'Giá trị':x.accountantValue
    }));
    if(!rows.length){toast('Không có hàng DMS dư để kế toán chấm ra');return;}
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,'Ke_toan_cham_DMS');
    XLSX.writeFile(wb,'ke_toan_can_cham_dms_'+dmsDate()+'.xlsx');
  };

  window.exportDMSAllowSalesExcel=function(){
    if(!window.XLSX){toast('Thiếu thư viện XLSX');return;}
    const rows=dmsSalesOpenRows().map((x,i)=>({
      'STT':i+1,
      'Ngày':x.date,
      'Mã hàng':x.sku,
      'Tên hàng':x.name,
      'Kho':x.warehouse,
      'Quy cách':x.pack,
      'SL mở ban đầu':x.originalQty,
      'SL còn được chấm':x.remainQty,
      'Giá bán':x.sale,
      'Giá trị còn lại':(Number(x.remainQty)||0)*(Number(x.sale)||0),
      'Trạng thái':x.status||''
    }));
    if(!rows.length){toast('Không có hàng mở cho App bán hàng');return;}
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,'Mo_app_ban_hang');
    XLSX.writeFile(wb,'hang_mo_app_ban_hang_'+dmsDate()+'.xlsx');
  };

  // Giữ tên hàm cũ để các nút cũ không lỗi.
  window.autoSplitDMS=function(){
    const rows=dmsAccountantRows();
    toast(rows.length ? 'Theo logic mới, phần DMS dư là danh sách cho kế toán chấm ra; không chia cho NVBH nữa.' : 'Không có hàng DMS dư cần kế toán chấm ra.');
    return rows;
  };
  window.saveDMSAllocation=function(){
    refreshDMSAllowSales();
  };
  window.clearDMSAllocation=function(){
    const date=dmsDate();
    if(!confirm('Xóa giới hạn App bán hàng và phân bổ DMS ngày '+date+'?')) return;
    db.dmsAllowSales=(db.dmsAllowSales||[]).filter(x=>String(x.date||'').slice(0,10)!==date);
    db.dmsAllocations=(db.dmsAllocations||[]).filter(x=>String(x.date||'').slice(0,10)!==date);
    save();
    renderDMSStockModule();
    toast('Đã xóa dữ liệu DMS mở bán ngày '+date);
  };
  window.exportDMSAllocationExcel=function(){
    exportDMSAccountantExcel();
  };
  window.dmsToggleStaff=function(){};

  function dmsSummary(){
    const diff=calculateDMSDiff();
    const accountant=diff.filter(x=>x.accountantQty>0);
    const sales=dmsSalesOpenRows();
    return {
      stockLines:dmsCurrentStock().length,
      accountantSku:accountant.length,
      accountantQty:accountant.reduce((a,x)=>a+x.accountantQty,0),
      accountantValue:accountant.reduce((a,x)=>a+x.accountantValue,0),
      salesSku:sales.length,
      salesRemain:sales.reduce((a,x)=>a+(Number(x.remainQty)||0),0),
      salesValue:sales.reduce((a,x)=>a+(Number(x.remainQty)||0)*(Number(x.sale)||0),0)
    };
  }

  window.renderDMSStockModule=function(){
    dmsEnsureDb();
    const sec=document.getElementById('dmsStock'); if(!sec) return;
    const sum=dmsSummary();
    const set=(id,v)=>{const el=document.getElementById(id); if(el)el.textContent=v;};

    set('dmsStockLines',money(sum.stockLines));
    set('dmsNeedSku',money(sum.accountantSku));
    set('dmsNeedQty',money(sum.accountantQty));
    set('dmsNeedValue',money(sum.accountantValue));
    set('dmsSalesSku',money(sum.salesSku));
    set('dmsSalesRemain',money(sum.salesRemain));
    set('dmsSalesValue',money(sum.salesValue));

    const all=calculateDMSDiff();
    const accountant=all.filter(x=>x.accountantQty>0);
    const salesOpen=dmsSalesOpenRows();

    const abody=document.getElementById('dmsAccountantBody');
    if(abody) abody.innerHTML=accountant.map((x,i)=>`<tr>
      <td>${i+1}</td>
      <td><b>${escapeHtml(x.sku)}</b></td>
      <td>${escapeHtml(x.name)}</td>
      <td>${escapeHtml(x.warehouse||'')}</td>
      <td class="right">${qtyView(x.dmsQty,x.pack)}</td>
      <td class="right">${qtyView(x.realQty,x.pack)}</td>
      <td class="right"><b class="debt-money-unpaid">${qtyView(x.accountantQty,x.pack)}</b></td>
      <td class="right">${money(x.sale)}</td>
      <td class="right"><b>${money(x.accountantValue)}</b></td>
    </tr>`).join('')||'<tr><td colspan="9" class="center muted">Không có hàng DMS lớn hơn tồn thực tế.</td></tr>';

    const sbody=document.getElementById('dmsSalesOpenBody');
    if(sbody) sbody.innerHTML=salesOpen.map((x,i)=>`<tr>
      <td>${i+1}</td>
      <td><b>${escapeHtml(x.sku)}</b></td>
      <td>${escapeHtml(x.name)}</td>
      <td>${escapeHtml(x.warehouse||'')}</td>
      <td class="right">${qtyView(x.originalQty,x.pack)}</td>
      <td class="right"><b class="${Number(x.remainQty||0)>0?'debt-money-paid':'muted'}">${qtyView(x.remainQty,x.pack)}</b></td>
      <td class="right">${money(x.sale)}</td>
      <td class="right"><b>${money((Number(x.remainQty)||0)*(Number(x.sale)||0))}</b></td>
      <td>${escapeHtml(x.status||'')}</td>
    </tr>`).join('')||'<tr><td colspan="9" class="center muted">Chưa có hàng thực tế lớn hơn DMS để mở trên App bán hàng.</td></tr>';

    const oldBody=document.getElementById('dmsDiffBody');
    if(oldBody) oldBody.innerHTML=all.filter(x=>x.accountantQty>0||x.allowSalesQty>0).map((x,i)=>`<tr>
      <td>${i+1}</td><td><b>${escapeHtml(x.sku)}</b></td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.warehouse||'')}</td>
      <td class="right">${qtyView(x.realQty,x.pack)}</td>
      <td class="right">${qtyView(x.dmsQty,x.pack)}</td>
      <td class="right"><b>${qtyView(Math.abs(x.diff),x.pack)}</b></td>
      <td class="right">${x.accountantQty>0?'Kế toán chấm ra':'Mở App bán hàng'}</td>
      <td class="right">${money(x.sale)}</td>
      <td class="right">${money(x.accountantValue||x.allowSalesValue)}</td>
    </tr>`).join('')||'<tr><td colspan="10" class="center muted">Chưa có chênh lệch DMS.</td></tr>';

    const hbody=document.getElementById('dmsHistoryBody');
    if(hbody) hbody.innerHTML=(db.dmsHistory||[]).slice(0,20).map(h=>`<tr>
      <td>${escapeHtml(h.date||'')}</td>
      <td>${escapeHtml(h.fileName||'')}</td>
      <td class="right">${money(h.lines||0)}</td>
      <td class="right">${money(h.totalQty||0)}</td>
      <td>${escapeHtml(h.createdAt?new Date(h.createdAt).toLocaleString('vi-VN'):'')}</td>
    </tr>`).join('')||'<tr><td colspan="5" class="center muted">Chưa có lịch sử upload</td></tr>';

    dmsDecorateSalesProductList();
  };

  function dmsSectionHtml(){
    const today=new Date().toISOString().slice(0,10);
    return `<section class="section" id="dmsStock">
      <div class="panel-head">
        <div>
          <h2>Tồn kho DMS & kiểm soát chấm hàng</h2>
          <div class="muted">Import đúng file mẫu DMS. Cột vàng dùng để đọc: Số hiệu hàng hóa, Mô tả mặt hàng, Qui cách đóng gói, Tồn cuối (CS/SU), Tồn kho cuối kỳ (SU).</div>
        </div>
        <div class="toolbar">
          <button class="btn light" onclick="renderDMSStockModule()">Làm mới</button>
          <button class="btn green" onclick="refreshDMSAllowSales()">Cập nhật mở App</button>
          <button class="btn orange" onclick="exportDMSAccountantExcel()">Xuất kế toán chấm</button>
        </div>
      </div>

      <div class="stats" style="grid-template-columns:repeat(7,minmax(110px,1fr));margin-bottom:12px">
        <div class="card stat"><div class="stat-icon blue">D</div><div><div class="label">Mã DMS</div><div class="value" id="dmsStockLines">0</div></div></div>
        <div class="card stat"><div class="stat-icon orange">KT</div><div><div class="label">SKU KT chấm</div><div class="value" id="dmsNeedSku">0</div></div></div>
        <div class="card stat"><div class="stat-icon purple">SL</div><div><div class="label">SL KT chấm</div><div class="value" id="dmsNeedQty">0</div></div></div>
        <div class="card stat"><div class="stat-icon green">₫</div><div><div class="label">Giá trị KT</div><div class="value" id="dmsNeedValue">0</div></div></div>
        <div class="card stat"><div class="stat-icon blue">APP</div><div><div class="label">SKU mở App</div><div class="value" id="dmsSalesSku">0</div></div></div>
        <div class="card stat"><div class="stat-icon green">Còn</div><div><div class="label">SL App còn</div><div class="value" id="dmsSalesRemain">0</div></div></div>
        <div class="card stat"><div class="stat-icon green">₫</div><div><div class="label">Giá trị App</div><div class="value" id="dmsSalesValue">0</div></div></div>
      </div>

      <div class="card panel">
        <h2>1. Upload tồn kho DMS</h2>
        <div class="form">
          <div class="field"><label>Ngày DMS</label><input id="dmsDate" type="date" value="${today}" onchange="renderDMSStockModule()"></div>
          <div class="field"><label>Tìm mã/tên/kho</label><input id="dmsSearch" placeholder="Tìm hàng chênh lệch" oninput="renderDMSStockModule()"></div>
          <div class="field"><label>Hiển thị tổng hợp</label><select id="dmsViewMode" onchange="renderDMSStockModule()"><option value="diff">Chỉ hàng có chênh lệch</option><option value="accountant">DMS > thực tế</option><option value="sales">DMS < thực tế</option><option value="all">Tất cả SKU</option></select></div>
          <div class="field"><label>File tồn kho DMS</label><input type="file" accept=".xlsx,.xls,.csv" onchange="importDMSStockFromFile(event)"></div>
        </div>
        <div class="muted" style="margin-top:8px">Đúng file mẫu: U=Số hiệu hàng hóa, V=Mô tả mặt hàng, W=Qui cách đóng gói, AX=Tồn cuối (CS/SU), AY=Tồn kho cuối kỳ (SU). Phần mềm ưu tiên lấy tồn DMS từ cột AY.</div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h2>2. DMS > Tồn thực tế: báo kế toán chấm ra</h2><div class="toolbar"><button class="btn orange" onclick="exportDMSAccountantExcel()">Xuất Excel kế toán</button></div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Kho</th><th class="right">Tồn DMS</th><th class="right">Tồn thực tế</th><th class="right">KT cần chấm ra</th><th class="right">Giá bán</th><th class="right">Giá trị</th></tr></thead>
          <tbody id="dmsAccountantBody"></tbody>
        </table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h2>3. DMS < Tồn thực tế: mở trên App bán hàng</h2><div class="toolbar"><button class="btn green" onclick="refreshDMSAllowSales()">Cập nhật giới hạn App</button><button class="btn orange" onclick="exportDMSAllowSalesExcel()">Xuất danh sách mở App</button><button class="btn red" onclick="clearDMSAllocation()">Xóa mở App ngày này</button></div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Kho</th><th class="right">SL mở ban đầu</th><th class="right">SL còn được chấm</th><th class="right">Giá bán</th><th class="right">Giá trị còn lại</th><th>Trạng thái</th></tr></thead>
          <tbody id="dmsSalesOpenBody"></tbody>
        </table></div>
      </div>

      <div class="card panel">
        <div class="panel-head"><h2>4. Bảng tổng hợp chênh lệch</h2><div class="toolbar"><button class="btn light" onclick="renderDMSStockModule()">Tính lại</button></div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Kho</th><th class="right">Tồn thực tế</th><th class="right">Tồn DMS</th><th class="right">Chênh</th><th>Hướng xử lý</th><th class="right">Giá bán</th><th class="right">Giá trị</th></tr></thead>
          <tbody id="dmsDiffBody"></tbody>
        </table></div>
      </div>

      <div class="card panel">
        <h2>5. Lịch sử upload DMS</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Ngày DMS</th><th>File</th><th class="right">Số mã</th><th class="right">Tổng SL</th><th>Thời gian upload</th></tr></thead>
          <tbody id="dmsHistoryBody"></tbody>
        </table></div>
      </div>
    </section>`;
  }

  function ensureDMSNavAndSection(){
    if(!document.querySelector('#nav button[data-page="dmsStock"]')){
      const nav=document.getElementById('nav');
      const btn=document.createElement('button');
      btn.dataset.page='dmsStock';
      btn.textContent='📊 Tồn kho DMS';
      btn.onclick=function(){page('dmsStock')};
      const productsBtn=document.querySelector('#nav button[data-page="products"]');
      if(productsBtn && productsBtn.parentNode) productsBtn.insertAdjacentElement('afterend',btn);
      else if(nav) nav.appendChild(btn);
    }
    const root=document.getElementById('sectionsRoot');
    if(root && !document.getElementById('dmsStock')) root.insertAdjacentHTML('beforeend',dmsSectionHtml());
  }

  function dmsCartQty(sku){
    return (window.salesCart||salesCart||[]).filter(x=>String(x.sku)===String(sku)).reduce((a,x)=>a+(Number(x.qty)||0),0);
  }

  function dmsDecorateSalesProductList(){
    try{
      if(currentActivePage && currentActivePage()!=='salesApp') return;
      (db.products||[]).forEach(p=>{
        const input=document.getElementById('salesQty_'+cssSafeId(p.sku));
        if(!input) return;
        const remain=dmsGetRemainForSku(p.sku);
        let box=input.parentElement;
        if(!box) return;
        let label=box.querySelector('.dms-sales-limit-label');
        if(!label){
          label=document.createElement('div');
          label.className='dms-sales-limit-label';
          label.style.cssText='font-size:12px;margin-top:4px;font-weight:800;color:#ea580c';
          box.appendChild(label);
        }
        label.textContent=remain>0 ? ('DMS cho phép còn: '+qtyView(remain,p.pack||1)) : 'DMS không mở chấm';
      });
    }catch(e){}
  }

  const oldRenderSalesProductList=window.renderSalesProductList;
  if(typeof oldRenderSalesProductList==='function' && !oldRenderSalesProductList.__dmsWrapped){
    const wrapped=function(){
      const rs=oldRenderSalesProductList.apply(this,arguments);
      setTimeout(dmsDecorateSalesProductList,0);
      return rs;
    };
    wrapped.__dmsWrapped=true;
    window.renderSalesProductList=wrapped;
    try{renderSalesProductList=wrapped;}catch(e){}
  }

  const oldSalesAddProduct=window.salesAddProduct;
  window.salesAddProduct=function(sku){
    dmsEnsureDb();
    const p=findProduct(sku);
    if(!p) return toast('Không tìm thấy sản phẩm');
    const qty=parseQtySlash(document.getElementById('salesQty_'+cssSafeId(sku))?.value||'1/0',p.pack||1);
    if(qty<=0) return toast('Nhập số lượng cần chấm');

    const remain=dmsGetRemainForSku(sku);
    if(remain<=0) return toast('Sản phẩm này DMS chưa mở cho chấm trên App');
    if(dmsCartQty(sku)+qty>remain) return toast('Vượt giới hạn DMS cho phép. Còn được chấm: '+qtyView(Math.max(0,remain-dmsCartQty(sku)),p.pack||1));
    if(qty>Number(p.qty||0)) return toast('Không đủ tồn thực tế: '+p.name+' còn '+qtyView(p.qty,p.pack));

    let old=salesCart.find(x=>String(x.sku)===String(sku));
    if(old) old.qty+=qty;
    else salesCart.push({sku:p.sku,name:p.name,pack:Number(p.pack)||1,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0,source:'DMS_APP_LIMIT'});
    renderSalesCart();
    dmsDecorateSalesProductList();
  };
  try{salesAddProduct=window.salesAddProduct;}catch(e){}

  const oldSalesConfirmOrder=window.salesConfirmOrder;
  if(typeof oldSalesConfirmOrder==='function' && !oldSalesConfirmOrder.__dmsWrapped){
    const wrapped=async function(){
      dmsEnsureDb();
      const items=(salesCart||[]).map(x=>({...x}));
      if(!items.length) return oldSalesConfirmOrder.apply(this,arguments);

      for(const it of items){
        const remain=dmsGetRemainForSku(it.sku);
        const cartQty=items.filter(x=>String(x.sku)===String(it.sku)).reduce((a,x)=>a+(Number(x.qty)||0),0);
        const p=findProduct(it.sku);
        if(remain<=0) return toast('Sản phẩm '+(p?.name||it.sku)+' DMS chưa mở cho chấm');
        if(cartQty>remain) return toast('Sản phẩm '+(p?.name||it.sku)+' vượt giới hạn DMS: '+qtyView(remain,p?.pack||1));
      }

      const before=(db.orders||[]).length;
      const rs=await oldSalesConfirmOrder.apply(this,arguments);
      const after=(db.orders||[]).length;
      if(after>before){
        dmsConsumeSalesAllowance(items);
        save();
        renderDMSStockModule();
      }
      return rs;
    };
    wrapped.__dmsWrapped=true;
    window.salesConfirmOrder=wrapped;
    try{salesConfirmOrder=wrapped;}catch(e){}
  }

  const oldRender=window.render;
  if(typeof oldRender==='function' && !oldRender.__dmsWrapped){
    const wrapped=function(){
      const rs=oldRender.apply(this,arguments);
      try{ensureDMSNavAndSection();renderDMSStockModule();}catch(e){console.warn('DMS render lỗi',e);}
      return rs;
    };
    wrapped.__dmsWrapped=true;
    window.render=wrapped;
    try{render=wrapped;}catch(e){}
  }

  document.addEventListener('DOMContentLoaded',function(){try{ensureDMSNavAndSection();renderDMSStockModule();dmsDecorateSalesProductList();}catch(e){console.warn(e);}});
  setTimeout(function(){try{ensureDMSNavAndSection();renderDMSStockModule();dmsDecorateSalesProductList();}catch(e){}},500);
})();


/* ===== MK PATCH FINAL: APP BÁN HÀNG HIỂN THỊ TỒN ĐƯỢC MỞ BÁN DMS + BÁO HẾT HÀNG ===== */
(function(){
  'use strict';

  function mkDmsFinalEnsure(){
    if(typeof db==='undefined' || !db) return;
    db.dmsAllowSales=Array.isArray(db.dmsAllowSales)?db.dmsAllowSales:[];
  }

  function mkDmsFinalDate(){
    const el=document.getElementById('dmsDate');
    return (el&&el.value) ? el.value : new Date().toISOString().slice(0,10);
  }

  function mkDmsFinalRemain(sku){
    mkDmsFinalEnsure();
    const date=mkDmsFinalDate();
    let total=0;
    (db.dmsAllowSales||[]).forEach(x=>{
      if(String(x.date||'').slice(0,10)!==date) return;
      if(String(x.sku||'').trim()!==String(sku||'').trim()) return;
      total+=Number(x.remainQty||0)||0;
    });
    return Math.max(0,Math.round(total));
  }

  function mkDmsFinalCartQty(sku){
    const cart=Array.isArray(window.salesCart)?window.salesCart:(Array.isArray(salesCart)?salesCart:[]);
    return cart.filter(x=>String(x.sku||'').trim()===String(sku||'').trim())
      .reduce((a,x)=>a+(Number(x.qty)||0),0);
  }

  function mkDmsFinalInputQty(sku,pack){
    try{
      if(typeof salesQtyFromInputs==='function'){
        const q=Number(salesQtyFromInputs(sku,pack||1))||0;
        if(q>0) return q;
      }
    }catch(e){}
    try{
      return parseQtySlash(document.getElementById('salesQty_'+cssSafeId(sku))?.value||'1/0',pack||1);
    }catch(e){
      return 0;
    }
  }

  function mkDmsFinalSetStockInCard(card,sku,pack){
    const remain=mkDmsFinalRemain(sku);
    const stockText=qtyView(remain,pack||1);

    // Mobile card: đổi nhãn "Tồn thực tế" thành "Tồn mở bán" và số lượng là giới hạn DMS.
    const metaBlocks=[...card.querySelectorAll('.meta > div')];
    const stockBlock=metaBlocks.find(div=>/tồn/i.test(div.textContent||'')) || metaBlocks[1];
    if(stockBlock){
      const span=stockBlock.querySelector('span');
      const b=stockBlock.querySelector('b');
      if(span) span.textContent='Tồn mở bán';
      if(b){
        b.textContent=stockText;
        b.classList.toggle('stock-warn',remain<Number(pack||1));
      }
    }

    let label=card.querySelector('.dms-sales-limit-label');
    if(!label){
      label=document.createElement('div');
      label.className='dms-sales-limit-label';
      label.style.cssText='font-size:12px;margin-top:6px;font-weight:800;color:#ea580c';
      card.appendChild(label);
    }
    label.textContent=remain>0 ? ('Được chấm tối đa: '+stockText) : 'Hết hàng';
  }

  function mkDmsFinalDecorateSalesProductList(){
    try{
      const body=document.getElementById('salesProductList');
      if(!body) return;

      // Mobile layout.
      body.querySelectorAll('.mobile-product-card').forEach(card=>{
        const skuText=(card.querySelector('.sku')?.textContent||'').replace(/^.*?:/,'').trim();
        const p=(db.products||[]).find(x=>String(x.sku||'').trim()===skuText);
        if(p) mkDmsFinalSetStockInCard(card,p.sku,Number(p.pack)||1);
      });

      // Desktop layout: hàng table có mã ở cột đầu, cột tồn là cột thứ 4.
      body.querySelectorAll('tr').forEach(tr=>{
        if(tr.querySelector('.mobile-product-card')) return;
        const sku=tr.querySelector('td:first-child b')?.textContent?.trim() || tr.querySelector('td:first-child')?.textContent?.trim();
        if(!sku) return;
        const p=(db.products||[]).find(x=>String(x.sku||'').trim()===sku);
        if(!p) return;
        const remain=mkDmsFinalRemain(p.sku);
        const tds=tr.querySelectorAll('td');
        if(tds.length>=4){
          const stockTd=tds[3];
          let pill=stockTd.querySelector('.pill');
          if(!pill){
            stockTd.innerHTML='<span class="pill"></span>';
            pill=stockTd.querySelector('.pill');
          }
          pill.textContent=qtyView(remain,p.pack||1);
          pill.classList.toggle('low',remain<Number(p.pack||1));
          pill.title='Tồn được mở bán theo DMS';
        }
      });
    }catch(e){
      console.warn('DMS decorate sales stock lỗi',e);
    }
  }

  const _mkDmsFinalRenderSalesProductList=window.renderSalesProductList || (typeof renderSalesProductList==='function'?renderSalesProductList:null);
  if(typeof _mkDmsFinalRenderSalesProductList==='function'){
    window.renderSalesProductList=function(){
      const rs=_mkDmsFinalRenderSalesProductList.apply(this,arguments);
      setTimeout(mkDmsFinalDecorateSalesProductList,0);
      return rs;
    };
    try{renderSalesProductList=window.renderSalesProductList;}catch(e){}
  }

  window.salesAddProduct=function(sku){
    mkDmsFinalEnsure();
    const p=findProduct(sku);
    if(!p) return toast('Không tìm thấy sản phẩm');

    const pack=Number(p.pack)||1;
    const qty=mkDmsFinalInputQty(sku,pack);
    if(qty<=0) return toast('Nhập số lượng cần chấm');

    const remain=mkDmsFinalRemain(sku);
    const inCart=mkDmsFinalCartQty(sku);
    const available=Math.max(0,remain-inCart);

    // Theo yêu cầu: vượt tồn mở bán hoặc không còn mở bán đều báo hết hàng.
    if(remain<=0 || available<=0 || qty>available) return toast('Hết hàng');

    // Đơn gửi về vẫn trừ tồn thực tế trên phần mềm, nên vẫn cần kiểm tra tồn thực tế để tránh âm kho.
    if(qty>Number(p.qty||0)) return toast('Hết hàng');

    const cart=Array.isArray(window.salesCart)?window.salesCart:salesCart;
    let old=cart.find(x=>String(x.sku)===String(sku));
    if(old) old.qty+=qty;
    else cart.push({sku:p.sku,name:p.name,pack,qty,sale:Number(p.sale)||0,cost:Number(p.cost)||0,disc:0,source:'DMS_APP_LIMIT'});

    if(typeof renderSalesCart==='function') renderSalesCart();
    mkDmsFinalDecorateSalesProductList();
  };
  try{salesAddProduct=window.salesAddProduct;}catch(e){}

  // Trang đang mở thì cập nhật ngay.
  setTimeout(mkDmsFinalDecorateSalesProductList,100);
  document.addEventListener('DOMContentLoaded',function(){setTimeout(mkDmsFinalDecorateSalesProductList,300);});
})();


/* ===== MK FINAL PATCH 2026-05-23: nhập kho, preview import, công nợ hôm nay, quỹ tiền ===== */
(function(){
  function arr(name){ db[name]=Array.isArray(db[name])?db[name]:[]; return db[name]; }
  function ymd(v){
    if(!v) return new Date().toISOString().slice(0,10);
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return new Date().toISOString().slice(0,10);
  }
  function num(v){
    if(typeof parseImportNumber==='function') return Number(parseImportNumber(v))||0;
    let s=String(v??'').replace(/[₫đĐ\s]/g,'');
    if(s.includes(',')&&s.includes('.')){ const c=s.lastIndexOf(','), d=s.lastIndexOf('.'); s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,''); }
    else if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
    else if((s.match(/\./g)||[]).length===1 && s.split('.').pop().length===3) s=s.replace('.','');
    return Number(s.replace(/[^0-9.-]/g,''))||0;
  }
  function pick(r,keys){
    if(typeof pickImportValue==='function') return pickImportValue(r,keys);
    const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const map={}; Object.keys(r||{}).forEach(k=>map[norm(k)]=r[k]);
    for(const k of keys){ if(Object.prototype.hasOwnProperty.call(r,k)) return r[k]; const nk=norm(k); if(Object.prototype.hasOwnProperty.call(map,nk)) return map[nk]; }
    return '';
  }
  function showImportConfirm(title, columns, rows, onOk){
    const old=document.getElementById('mkImportConfirmModal'); if(old) old.remove();
    const modal=document.createElement('div'); modal.id='mkImportConfirmModal'; modal.className='modal';
    modal.innerHTML=`<div class="modal-box" style="width:min(1200px,98vw)"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2><div class="muted">Tích chọn dòng muốn nhập. Bỏ tích để loại bỏ trước khi ghi vào phần mềm.</div></div><div class="toolbar"><button class="btn light" id="mkImpAll">Chọn tất cả</button><button class="btn light" id="mkImpNone">Bỏ chọn</button><button class="btn green" id="mkImpOk">Xác nhận import</button><button class="btn gray" id="mkImpClose">Đóng</button></div></div><div class="table-wrap" style="max-height:70vh"><table class="table"><thead><tr><th class="center"><input type="checkbox" id="mkImpCheckAll" checked></th>${columns.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr><td class="center"><input class="mk-imp-check" type="checkbox" value="${i}" ${r.__ok===false?'':'checked'}></td>${columns.map(c=>`<td class="${c.right?'right':''}">${escapeHtml(c.format?c.format(r[c.key],r):r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    document.body.appendChild(modal);
    const checks=()=>[...modal.querySelectorAll('.mk-imp-check')];
    modal.querySelector('#mkImpAll').onclick=()=>{checks().forEach(x=>x.checked=true); modal.querySelector('#mkImpCheckAll').checked=true;};
    modal.querySelector('#mkImpNone').onclick=()=>{checks().forEach(x=>x.checked=false); modal.querySelector('#mkImpCheckAll').checked=false;};
    modal.querySelector('#mkImpCheckAll').onchange=e=>checks().forEach(x=>x.checked=e.target.checked);
    modal.querySelector('#mkImpClose').onclick=()=>modal.remove();
    modal.querySelector('#mkImpOk').onclick=()=>{ const selected=checks().filter(x=>x.checked).map(x=>rows[Number(x.value)]); if(!selected.length) return toast('Chưa chọn dòng nào để import'); onOk(selected); modal.remove(); };
  }
  window.mkShowImportConfirm=showImportConfirm;

  // Nhập kho thủ công chắc chắn ghi được phiếu và hiện lịch sử.
  const oldCreateReceipt=window.createReceipt;
  window.createReceipt=function(){
    try{
      if(!Array.isArray(receiveCart) || !receiveCart.length) return toast('Phiếu nhập chưa có hàng');
      arr('receipts'); arr('products');
      const id=(document.getElementById('rId')?.value||receiptId()).trim()||receiptId();
      const date=document.getElementById('rDate')?.value || ymd(new Date());
      const supplier=document.getElementById('rSupplier')?.value || 'Unilever';
      const note=document.getElementById('rNote')?.value || '';
      const items=receiveCart.map(x=>({sku:String(x.sku||'').trim(),name:String(x.name||x.sku||'').trim(),pack:Number(x.pack)||1,qty:Number(x.qty)||0,cost:num(x.cost)})).filter(x=>x.sku&&x.qty>0);
      if(!items.length) return toast('Phiếu nhập chưa có dòng hợp lệ');
      const old=editingReceiptIndex!==null && db.receipts[editingReceiptIndex] ? receiptItems(db.receipts[editingReceiptIndex]).map(x=>({...x})) : [];
      const check=receiptUpdateCheck(old,items); if(!check.ok) return toast('Không thể lưu phiếu vì tồn sau sửa sẽ âm: '+check.name);
      applyReceiptStockChange(old,items);
      const receipt={id,date,supplier,note,total:items.reduce((a,b)=>a+b.qty*b.cost,0),items};
      if(editingReceiptIndex!==null && db.receipts[editingReceiptIndex]) db.receipts[editingReceiptIndex]=receipt; else db.receipts.push(receipt);
      receiveCart=[]; editingReceiptIndex=null; clearReceiptForm(); save(); render(); page('receive');
      toast('Đã lưu và hiển thị phiếu nhập '+id);
    }catch(e){ console.error(e); if(oldCreateReceipt) return oldCreateReceipt(); toast('Lỗi lưu phiếu nhập: '+(e.message||e)); }
  };

  // Import phiếu nhập có cửa sổ xác nhận trước khi ghi.
  window.importReceive=function(e){
    const f=e?.target?.files?.[0]; if(!f) return;
    readExcel(f, rows=>{
      const parsed=[];
      rows.forEach((r,idx)=>{
        const sku=String(pick(r,['SKU','sku','Mã SP','Mã sản phẩm','Mã hàng','Code'])||'').trim();
        const pack=Number(pick(r,['Quy cách','Quy cach','pack']))||1;
        const rawQty=pick(r,['SL','Số lượng','So luong','sl','Số lượng nhập']);
        const qty=rawQty!==''&&rawQty!==undefined ? parseQtySlash(rawQty,pack) : totalQty(pick(r,['Thùng','Thung','thung']),pick(r,['Lẻ','Le','le']),pack);
        const id=String(pick(r,['Mã phiếu','Mã đơn','Số phiếu','Ma phieu'])||receiptId()).trim();
        if(!sku || qty<=0) return;
        parsed.push({__row:idx+2,id,date:ymd(pick(r,['Ngày nhập','Ngày','Ngay'])),supplier:String(pick(r,['Nhà cung cấp','NCC','Supplier'])||'Unilever'),note:String(pick(r,['Ghi chú','Ghi chu'])||''),sku,name:String(pick(r,['Tên sản phẩm','Tên','Ten','name'])||sku),pack,qty,cost:num(pick(r,['Giá nhập','Gia nhap','cost']))});
      });
      if(!parsed.length){ e.target.value=''; return toast('File nhập kho không có dòng hợp lệ'); }
      showImportConfirm('Xác nhận import phiếu nhập kho',[
        {key:'id',label:'Mã phiếu'},{key:'date',label:'Ngày'},{key:'supplier',label:'NCC'},{key:'sku',label:'SKU'},{key:'name',label:'Tên hàng'},{key:'qty',label:'SL',right:true,format:(v,r)=>qtyView(v,r.pack)},{key:'cost',label:'Giá nhập',right:true,format:v=>money(v)}
      ], parsed, selected=>{
        const groups={}; selected.forEach(it=>{ if(!groups[it.id]) groups[it.id]={id:it.id,date:it.date,supplier:it.supplier,note:it.note,items:[]}; groups[it.id].items.push({sku:it.sku,name:it.name,pack:it.pack,qty:it.qty,cost:it.cost}); });
        Object.values(groups).forEach(g=>{ g.items.forEach(it=>{ const p=upsertProduct({sku:it.sku,name:it.name,pack:it.pack,cost:it.cost}); p.qty=Number(p.qty||0)+Number(it.qty||0); p.cost=Number(it.cost)||Number(p.cost)||0; }); g.total=g.items.reduce((a,b)=>a+b.qty*b.cost,0); db.receipts.push(g); });
        save(); render(); page('receive'); toast('Đã import '+Object.keys(groups).length+' phiếu nhập kho');
      });
      e.target.value='';
    });
  };

  // Công nợ: thêm các ô trực quan của ngày hôm nay ngay trên màn công nợ.
  function todayDebtSummary(){
    const t=new Date().toISOString().slice(0,10);
    const orders=(db.orders||[]).filter(o=>String(o.isoDate||o.date||'').slice(0,10)===t);
    const total=orders.reduce((a,o)=>a+Number(o.total||0),0);
    const paid=orders.reduce((a,o)=>a+(Number(o.cashPaid||0)||0)+(Number(o.bankPaid||0)||0),0);
    const debt=orders.reduce((a,o)=>a+Math.max(0,orderDebtRemaining(o)),0);
    const customers=new Set(orders.map(o=>orderCustomerCode(o)||o.customer).filter(Boolean)).size;
    return {orders:orders.length,total,paid,debt,customers};
  }
  window.renderTodayDebtCards=function(){
    const sec=document.getElementById('debts'); if(!sec) return;
    let box=document.getElementById('todayDebtCards');
    if(!box){ box=document.createElement('div'); box.id='todayDebtCards'; box.className='stats'; box.style.cssText='grid-template-columns:repeat(5,minmax(130px,1fr));margin-bottom:14px'; const panel=sec.querySelector('.card.panel'); panel?.insertBefore(box,panel.firstChild); }
    const s=todayDebtSummary();
    box.innerHTML=`<div class="card stat"><div class="stat-icon blue">🧾</div><div><div class="label">Đơn hôm nay</div><div class="value">${s.orders}</div></div></div><div class="card stat"><div class="stat-icon green">₫</div><div><div class="label">Doanh số hôm nay</div><div class="value">${money(s.total)}</div></div></div><div class="card stat"><div class="stat-icon purple">✓</div><div><div class="label">Đã thu</div><div class="value">${money(s.paid)}</div></div></div><div class="card stat"><div class="stat-icon orange">!</div><div><div class="label">Công nợ hôm nay</div><div class="value">${money(s.debt)}</div></div></div><div class="card stat"><div class="stat-icon blue">♙</div><div><div class="label">Khách phát sinh</div><div class="value">${s.customers}</div></div></div>`;
  };

  // Quỹ tiền thủ quỹ.
  window.saveCashFundEntry=function(type){
    arr('cashFunds'); const amount=num(document.getElementById('cashFundAmount')?.value); if(amount<=0) return toast('Nhập số tiền hợp lệ');
    const entry={id:'Q-'+Date.now(),type,date:document.getElementById('cashFundDate')?.value||new Date().toISOString().slice(0,10),time:new Date().toLocaleTimeString('vi-VN'),amount,person:document.getElementById('cashFundPerson')?.value||'',note:document.getElementById('cashFundNote')?.value||'',createdBy:currentUserDisplayName?.()||''};
    db.cashFunds.push(entry); ['cashFundAmount','cashFundPerson','cashFundNote'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';}); save(); renderCashFund(); toast('Đã ghi sổ quỹ');
  };
  window.deleteCashFundEntry=function(id){ if(!confirm('Xóa dòng sổ quỹ này?')) return; db.cashFunds=arr('cashFunds').filter(x=>String(x.id)!==String(id)); save(); renderCashFund(); };
  window.renderCashFund=function(){
    arr('cashFunds'); const date=document.getElementById('cashFundDate')?.value || new Date().toISOString().slice(0,10); const rows=db.cashFunds.filter(x=>String(x.date).slice(0,10)===date);
    const sum=t=>rows.filter(x=>x.type===t).reduce((a,b)=>a+Number(b.amount||0),0); const inc=sum('income'), exp=sum('expense'), dep=sum('deposit');
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=money(v);}; set('cashFundIncomeToday',inc); set('cashFundExpenseToday',exp); set('cashFundDepositToday',dep); set('cashFundBalanceToday',inc-exp-dep);
    const body=document.getElementById('cashFundBody'); if(body) body.innerHTML=rows.slice().reverse().map(r=>`<tr><td>${escapeHtml(r.date||'')} ${escapeHtml(r.time||'')}</td><td>${r.type==='income'?'Thu':r.type==='expense'?'Chi':'Nộp TK công ty'}</td><td>${escapeHtml(r.person||'')}</td><td>${escapeHtml(r.note||'')}</td><td class="right">${r.type==='income'?money(r.amount):''}</td><td class="right">${r.type==='expense'?money(r.amount):''}</td><td class="right">${r.type==='deposit'?money(r.amount):''}</td><td><button class="btn small red" onclick="deleteCashFundEntry('${safeAttr(r.id)}')">Xóa</button></td></tr>`).join('')||'<tr><td colspan="8" class="center muted">Chưa có phát sinh quỹ trong ngày</td></tr>';
  };

  const oldRender=window.render;
  window.render=function(){ oldRender&&oldRender(); renderTodayDebtCards(); renderCashFund(); };
  document.addEventListener('DOMContentLoaded',()=>{ const d=document.getElementById('cashFundDate'); if(d&&!d.value)d.value=new Date().toISOString().slice(0,10); });
})();
