(function(){
  'use strict';

  var WEB_USER='mk_web_user';
  var MOBILE_USER='v43_mobile_user';
  var LEGACY_TOKEN_KEYS=['mk_web_token','mk_web_refresh_token','v43_mobile_token','v43_mobile_refresh_token','mobile_token'];
  var nativeFetch=window.fetch.bind(window);
  var refreshInFlight=null;

  function readJson(key){
    try{return JSON.parse(localStorage.getItem(key)||'{}')}
    catch(e){return {}}
  }

  function getStoredUser(){
    var user=readJson(WEB_USER);
    return user&&user.role?user:readJson(MOBILE_USER);
  }

  function saveUser(user){
    var value=JSON.stringify(user||{});
    localStorage.setItem(WEB_USER,value);
    localStorage.setItem(MOBILE_USER,value);
  }

  function removeLegacyTokens(){
    LEGACY_TOKEN_KEYS.forEach(function(key){
      localStorage.removeItem(key);
      try{sessionStorage.removeItem(key)}catch(_){ }
    });
  }

  function clearLocalSession(){
    removeLegacyTokens();
    localStorage.removeItem(WEB_USER);
    localStorage.removeItem(MOBILE_USER);
  }

  function goToLogin(){
    if(window.location.pathname==='/login.html')return;
    window.location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));
  }

  function logout(){
    clearLocalSession();
    nativeFetch('/api/auth/logout',{
      method:'POST',
      credentials:'same-origin',
      keepalive:true,
      headers:{'X-Requested-With':'XMLHttpRequest'}
    }).catch(function(){}).finally(goToLogin);
  }

  function refreshAccessSession(){
    if(refreshInFlight)return refreshInFlight;
    refreshInFlight=nativeFetch('/api/auth/refresh',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body:'{}'
    }).then(function(res){
      if(!res.ok)throw new Error('Không làm mới được phiên đăng nhập');
      return res.json();
    }).then(function(data){
      if(!data||!data.user)throw new Error('Phản hồi refresh không hợp lệ');
      saveUser(data.user);
      removeLegacyTokens();
      return data;
    }).finally(function(){refreshInFlight=null;});
    return refreshInFlight;
  }

  // WEB_AUTH_FETCH_BOUNDARY_START
  function authorizedFetch(url,options,retried){
    options=Object.assign({},options||{});
    var requestUrl=typeof url==='string'?url:String(url&&url.url||'');
    var isApiRequest=requestUrl.indexOf('/api/')===0||requestUrl.indexOf(location.origin+'/api/')===0;
    if(!isApiRequest)return nativeFetch(url,options);

    var isAuthEndpoint=/\/api\/auth\/(login|refresh|logout)(?:[/?]|$)/.test(requestUrl);
    var headers=new Headers(options.headers||{});
    headers.delete('Authorization');
    if(!/^(GET|HEAD|OPTIONS)$/i.test(String(options.method||'GET'))&&!headers.has('X-Requested-With')){
      headers.set('X-Requested-With','XMLHttpRequest');
    }
    options.headers=headers;
    options.credentials=options.credentials||'same-origin';

    return nativeFetch(url,options).then(function(res){
      if(res.status===401&&!retried&&!isAuthEndpoint){
        return refreshAccessSession().then(function(){
          return authorizedFetch(url,options,true);
        }).catch(function(){clearLocalSession();goToLogin();return res;});
      }
      return res;
    });
  }

  window.authFetch=function(url,options){return authorizedFetch(url,options,false)};
  window.fetch=window.authFetch;
  // WEB_AUTH_FETCH_BOUNDARY_END
  removeLegacyTokens();

  function renderAccount(user){
    var role=String(user&&user.role||'').toLowerCase();
    if(['sales','delivery'].indexOf(role)>=0){
      window.location.replace(role==='sales'?'/mobile/sales.html':'/mobile/delivery.html');
      return;
    }

    var header=document.querySelector('.header');
    if(!header||header.querySelector('[data-auth-account]'))return;
    var box=document.createElement('div');
    box.dataset.authAccount='1';
    box.style.display='flex';
    box.style.alignItems='center';
    box.style.gap='8px';

    var info=document.createElement('span');
    info.className='status';
    info.textContent=(user.name||user.username||'Tài khoản')+' · '+(user.roleLabel||role||'');

    var button=document.createElement('button');
    button.type='button';
    button.textContent='Đăng xuất';
    button.className='secondary-btn';
    button.style.padding='8px 12px';
    button.addEventListener('click',logout);

    box.appendChild(info);
    box.appendChild(button);
    header.appendChild(box);
  }

  async function bootstrap(){
    var response=await authorizedFetch('/api/auth/me',{credentials:'same-origin'},false);
    if(!response.ok)throw new Error('Phiên đăng nhập không hợp lệ');
    var data=await response.json();
    var user=data&&data.user?data.user:getStoredUser();
    if(!user||!user.role)throw new Error('Không xác định được tài khoản');
    saveUser(user);
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){renderAccount(user)},{once:true});
    }else{
      renderAccount(user);
    }
    return user;
  }

  window.__authReady=bootstrap().catch(function(){clearLocalSession();goToLogin();throw new Error('AUTH_REQUIRED')});
})();
