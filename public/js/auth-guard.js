(function(){
  'use strict';
  var WEB_TOKEN='mk_web_token', WEB_USER='mk_web_user';
  var MOBILE_TOKEN='v43_mobile_token', MOBILE_USER='v43_mobile_user';
  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(e){return {}}}
  function getToken(){return localStorage.getItem(WEB_TOKEN)||localStorage.getItem(MOBILE_TOKEN)||''}
  function getUser(){var u=readJson(WEB_USER); return u&&u.role?u:readJson(MOBILE_USER)}
  function logout(){['mk_web_token','mk_web_refresh_token','mk_web_user','v43_mobile_token','v43_mobile_refresh_token','v43_mobile_user'].forEach(function(k){localStorage.removeItem(k)}); window.location.href='/login.html'}
  var user=getUser(); var role=String(user.role||'').toLowerCase();
  if(!getToken()){window.location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
  if(['sales','delivery'].indexOf(role)>=0){window.location.replace(role==='sales'?'/mobile/sales.html':'/mobile/delivery.html');return;}
  document.addEventListener('DOMContentLoaded',function(){
    var header=document.querySelector('.header'); if(!header)return;
    var box=document.createElement('div'); box.style.display='flex'; box.style.alignItems='center'; box.style.gap='8px';
    var info=document.createElement('span'); info.className='status'; info.textContent=(user.name||user.username||'Tài khoản')+' · '+(user.roleLabel||role||'');
    var btn=document.createElement('button'); btn.textContent='Đăng xuất'; btn.className='secondary-btn'; btn.style.padding='8px 12px'; btn.onclick=logout;
    box.appendChild(info); box.appendChild(btn); header.appendChild(box);
  });
})();
