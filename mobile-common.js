const DEFAULT_API_URL = 'https://kho-api-2.onrender.com';
const AUTH_KEY='kho_pro_auth_token';
const USER_KEY='kho_pro_auth_user';
let AUTH_TOKEN=localStorage.getItem(AUTH_KEY)||'';
let CURRENT_USER=JSON.parse(localStorage.getItem(USER_KEY)||'null');
let db={products:[],orders:[],customers:[],staff:[],deliveryStaff:[],returns:[],payments:[],deliveryReports:[]};

function cleanApiUrl(url){return String(url||'').trim().replace(/\/+$/,'')}
function getApiUrl(){return cleanApiUrl(localStorage.getItem('KHO_API_URL')||window.KHO_API_URL||DEFAULT_API_URL)}
async function apiFetch(path,opt={},timeout=30000){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const headers={Accept:'application/json',...(opt.headers||{})};
    if(AUTH_TOKEN) headers.Authorization='Bearer '+AUTH_TOKEN;
    return await fetch(getApiUrl()+path,{...opt,headers,signal:ctrl.signal,cache:'no-store'});
  }finally{clearTimeout(timer)}
}
function money(v){return Math.round(Number(v)||0).toLocaleString('vi-VN')}
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function todayStr(){return new Date().toISOString().slice(0,10)}
function nowIso(){return new Date().toISOString()}
function toast(msg){
  let t=document.getElementById('toast'); if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}
  t.textContent=msg; t.classList.remove('hidden'); clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>t.classList.add('hidden'),2200)
}
function qtyView(qty,pack){
  qty=Number(qty)||0; pack=Number(pack)||1;
  const box=Math.floor(qty/pack), each=qty%pack;
  return `${box}/${each}`;
}
function totalQty(box,each,pack){return (Number(box)||0)*(Number(pack)||1)+(Number(each)||0)}
function splitQty(qty,pack){qty=Number(qty)||0;pack=Number(pack)||1;return {box:Math.floor(qty/pack),each:qty%pack}}
function setLoginVisible(logged){
  document.getElementById('loginScreen')?.classList.toggle('hidden',logged);
  document.getElementById('appShell')?.classList.toggle('hidden',!logged);
  const u=document.getElementById('currentUserName'); if(u)u.textContent=CURRENT_USER?.name||CURRENT_USER?.username||'';
}

function userKeys(){
  const arr=[
    CURRENT_USER?.id,
    CURRENT_USER?.userId,
    CURRENT_USER?.username,
    CURRENT_USER?.code,
    CURRENT_USER?.staffCode,
    CURRENT_USER?.employeeCode,
    CURRENT_USER?.salesCode,
    CURRENT_USER?.deliveryStaffCode,
    CURRENT_USER?.deliveryCode,
    CURRENT_USER?.name,
    CURRENT_USER?.fullName
  ].map(x=>norm(x)).filter(Boolean);
  return [...new Set(arr)];
}
function orderBelongsToCurrentSales(o){
  const keys=userKeys();
  if(!keys.length) return false;
  const fields=[
    o.staffCode,o.salesCode,o.salesmanCode,o.nvbh,o.employeeCode,o.userCode,o.userId,o.createdBy,o.createdByCode,o.staff,o.salesman,o.employeeName,o.createdByName
  ].map(x=>norm(x)).filter(Boolean);
  return fields.some(f=>keys.includes(f)) || keys.some(k=>fields.some(f=>f===k || (k.length>=3 && f.includes(k))));
}
function orderBelongsToCurrentDelivery(o){
  const keys=userKeys();
  if(!keys.length) return false;
  const fields=[
    o.deliveryStaffCode,o.deliveryCode,o.shipperCode,o.driverCode,o.deliveryUserId,o.deliveryStaffName,o.deliveryName,o.shipperName
  ].map(x=>norm(x)).filter(Boolean);
  return fields.some(f=>keys.includes(f)) || keys.some(k=>fields.some(f=>f===k || (k.length>=3 && f.includes(k))));
}

function detectRole(){
  const r=norm(CURRENT_USER?.role||CURRENT_USER?.type||CURRENT_USER?.position||'');
  const u=norm(CURRENT_USER?.username||CURRENT_USER?.code||'');
  if(r.includes('giao')||r.includes('delivery')||u.includes('gh')) return 'delivery';
  if(r.includes('ban')||r.includes('sale')||r.includes('nvbh')||u.includes('nv')) return 'sales';
  return '';
}
function redirectByRole(){
  const role=detectRole();
  const path=location.pathname.toLowerCase();
  if(role==='sales' && !path.endsWith('/sales-app.html')) location.href='sales-app.html';
  if(role==='delivery' && !path.endsWith('/delivery-app.html')) location.href='delivery-app.html';
}
async function login(){
  const username=document.getElementById('loginUser').value.trim();
  const password=document.getElementById('loginPass').value.trim();
  if(!username||!password) return toast('Nhập tài khoản và mật khẩu');
  try{
    const res=await apiFetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const data=await res.json();
    if(!res.ok||!data.token) throw new Error(data.error||data.detail||'Đăng nhập thất bại');
    AUTH_TOKEN=data.token; CURRENT_USER=data.user||{username};
    localStorage.setItem(AUTH_KEY,AUTH_TOKEN); localStorage.setItem(USER_KEY,JSON.stringify(CURRENT_USER));
    redirectByRole();
    setLoginVisible(true); await loadData(); afterLoad();
  }catch(e){toast(e.message||'Không đăng nhập được')}
}
async function logout(){
  try{await apiFetch('/api/logout',{method:'POST'})}catch(e){}
  AUTH_TOKEN=''; CURRENT_USER=null; localStorage.removeItem(AUTH_KEY); localStorage.removeItem(USER_KEY);
  location.href='../login.html';
}
function normalizeData(data){
  const base={products:[],orders:[],customers:[],staff:[],deliveryStaff:[],returns:[],payments:[],deliveryReports:[]};
  data=data&&typeof data==='object'?data:{};
  Object.keys(base).forEach(k=>base[k]=Array.isArray(data[k])?data[k]:[]);
  return base;
}
async function loadData(){
  const res=await apiFetch('/api/data',{},120000);
  if(!res.ok) throw new Error('Không lấy được dữ liệu');
  db=normalizeData(await res.json());
}
async function saveData(){
  const res=await apiFetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(db)},120000);
  if(!res.ok) throw new Error('Không lưu được dữ liệu');
}
function showTab(name){
  document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('hidden',x.dataset.view!==name));
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
}
function closeModal(){document.getElementById('modalRoot')?.classList.add('hidden');document.getElementById('modalRoot').innerHTML=''}
function openModal(html){let m=document.getElementById('modalRoot'); if(!m){m=document.createElement('div');m.id='modalRoot';document.body.appendChild(m)};m.className='modal';m.innerHTML=`<div class="modal-card">${html}</div>`}

function onlyDigits(v){return String(v||'').replace(/[^\d]/g,'')}
function formatVndInput(el){
  if(!el) return;
  const raw=onlyDigits(el.value);
  el.value=raw ? Number(raw).toLocaleString('vi-VN') : '';
}
function parseMoneyInput(v){return Number(onlyDigits(v))||0}
function bindMoneyInputs(root=document){
  root.querySelectorAll('input[data-money="1"]').forEach(el=>{
    if(el.__moneyBound) return;
    el.__moneyBound=true;
    el.addEventListener('input',()=>formatVndInput(el));
    el.addEventListener('blur',()=>formatVndInput(el));
  });
}

window.addEventListener('DOMContentLoaded',async()=>{
  redirectByRole();
  setLoginVisible(!!AUTH_TOKEN);
  if(AUTH_TOKEN){try{await loadData(); afterLoad();}catch(e){toast(e.message||'Không tải được dữ liệu')}}
});