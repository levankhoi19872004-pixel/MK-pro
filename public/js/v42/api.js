(function(){
  const API_BASE = window.API_URL || '/api';
  async function request(path, options={}){
    const res = await fetch(API_BASE + path, { headers:{'Content-Type':'application/json'}, ...options });
    const text = await res.text(); let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
    if(!res.ok) throw new Error((data && data.error) || data || res.statusText);
    return data;
  }
  window.KHO_API = {
    get: path => request(path),
    post: (path, body) => request(path,{method:'POST',body:JSON.stringify(body || {})}),
    list: c => request('/v42/'+c),
    save: (c,item) => request('/v42/'+c,{method:'POST',body:JSON.stringify(item || {})})
  };
})();
