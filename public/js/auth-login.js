(function(){
  'use strict';
  var WEB_TOKEN='mk_web_token', WEB_REFRESH='mk_web_refresh_token', WEB_USER='mk_web_user';
  var MOBILE_TOKEN='v43_mobile_token', MOBILE_REFRESH='v43_mobile_refresh_token', MOBILE_USER='v43_mobile_user';
  var contract=window.AppTargetContract;
  function el(id){return document.getElementById(id)}
  function setMsg(text, bad){var m=el('loginMessage'); if(m){m.textContent=text||''; m.style.color=bad?'#b91c1c':'#047857';}}
  function roleOf(user){return contract.normalizeRole(user&&user.role)}
  function canOpen(target, user){return contract.canRoleOpenTarget(roleOf(user),target)}
  function targetUrl(target){return contract.getTargetUrl(target)}
  function renderTargets(){
    var select=el('targetApp');
    if(select&&!select.dataset.appTargetContractBound){
      var current=select.value||select.dataset.defaultTarget||'web';
      select.innerHTML='';
      contract.listSelectTargets().forEach(function(target){
        var option=document.createElement('option');
        option.value=target.key;
        option.textContent=target.label;
        select.appendChild(option);
      });
      select.value=contract.getAppTarget(current)?current:'web';
      select.dataset.appTargetContractBound='true';
    }
    var links=el('loginQuickLinks');
    if(links&&!links.dataset.appTargetContractBound){
      links.textContent='';
      contract.listQuickLinkTargets().forEach(function(target){
        var link=document.createElement('a');
        link.href=target.url;
        link.textContent=target.shortLabel||target.label;
        link.dataset.targetApp=target.key;
        links.appendChild(link);
      });
      links.dataset.appTargetContractBound='true';
    }
  }
  function saveSession(data){
    localStorage.removeItem(WEB_TOKEN); localStorage.removeItem(MOBILE_TOKEN);
    localStorage.removeItem(WEB_REFRESH); localStorage.removeItem(MOBILE_REFRESH);
    localStorage.setItem(WEB_USER,JSON.stringify(data.user||{}));
    localStorage.setItem(MOBILE_USER,JSON.stringify(data.user||{}));
  }
  if(!contract){setMsg('Cấu hình màn hình đăng nhập chưa sẵn sàng',true);return;}
  renderTargets();
  el('webLoginForm')?.addEventListener('submit', async function(ev){
    ev.preventDefault(); setMsg('Đang đăng nhập...');
    var username=el('username').value.trim(); var password=el('password').value; var target=el('targetApp').value||'web';
    try{
      var url=targetUrl(target);
      if(!url)throw new Error('Màn hình đã chọn không hợp lệ');
      var res=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username,password:password})});
      var data=await res.json().catch(function(){return {}});
      if(!res.ok||data.ok===false)throw new Error(data.message||'Không đăng nhập được');
      if(!canOpen(target,data.user))throw new Error('Tài khoản không có quyền vào màn hình đã chọn');
      saveSession(data); window.location.href=url;
    }catch(err){setMsg(err.message||'Không đăng nhập được',true)}
  });
})();
