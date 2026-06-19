(function(){
  'use strict';
  var WEB_TOKEN='mk_web_token', WEB_REFRESH='mk_web_refresh_token', WEB_USER='mk_web_user';
  var MOBILE_TOKEN='v43_mobile_token', MOBILE_REFRESH='v43_mobile_refresh_token', MOBILE_USER='v43_mobile_user';
  function el(id){return document.getElementById(id)}
  function setMsg(text, bad){var m=el('loginMessage'); if(m){m.textContent=text||''; m.style.color=bad?'#b91c1c':'#047857';}}
  function roleOf(user){return String(user&&user.role||'').toLowerCase()}
  function canOpen(target, user){var r=roleOf(user); if(r==='admin')return true; if(target==='sales')return r==='sales'; if(target==='delivery')return r==='delivery'; if(target==='web')return ['manager','accountant','warehouse','admin'].indexOf(r)>=0; return false;}
  function targetUrl(target){if(target==='sales')return '/mobile/sales.html'; if(target==='delivery')return '/mobile/delivery.html'; return '/';}
  function saveSession(data){
    localStorage.removeItem(WEB_TOKEN); localStorage.removeItem(MOBILE_TOKEN);
    localStorage.removeItem(WEB_REFRESH); localStorage.removeItem(MOBILE_REFRESH);
    localStorage.setItem(WEB_USER,JSON.stringify(data.user||{}));
    localStorage.setItem(MOBILE_USER,JSON.stringify(data.user||{}));
  }
  el('webLoginForm')?.addEventListener('submit', async function(ev){
    ev.preventDefault(); setMsg('Đang đăng nhập...');
    var username=el('username').value.trim(); var password=el('password').value; var target=el('targetApp').value||'web';
    try{
      var res=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username,password:password})});
      var data=await res.json().catch(function(){return {}});
      if(!res.ok||data.ok===false)throw new Error(data.message||'Không đăng nhập được');
      if(!canOpen(target,data.user))throw new Error('Tài khoản không có quyền vào màn hình đã chọn');
      saveSession(data); window.location.href=targetUrl(target);
    }catch(err){setMsg(err.message||'Không đăng nhập được',true)}
  });
})();
