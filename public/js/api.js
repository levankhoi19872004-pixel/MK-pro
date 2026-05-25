const API = {
  token: localStorage.getItem('KHO_TOKEN') || '',
  user: JSON.parse(localStorage.getItem('KHO_USER') || 'null'),
  base(){ return window.APP_CONFIG?.API_BASE || ''; },
  headers(extra={}){ return { 'Content-Type':'application/json', ...(this.token?{Authorization:'Bearer '+this.token}:{}), ...extra }; },
  async request(path, options={}){
    const res = await fetch(this.base()+path, { ...options, headers: this.headers(options.headers || {}) });
    const text = await res.text();
    let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){ data = { error:text }; }
    if(!res.ok) throw new Error(data?.error || 'Lỗi API');
    return data;
  },
  async login(username,password){
    const data = await this.request('/api/login',{method:'POST',body:JSON.stringify({username,password})});
    this.token = data.token; this.user = data.user;
    localStorage.setItem('KHO_TOKEN',this.token); localStorage.setItem('KHO_USER',JSON.stringify(this.user));
    return data;
  },
  logout(){ this.token=''; this.user=null; localStorage.removeItem('KHO_TOKEN'); localStorage.removeItem('KHO_USER'); },
  getData(){ return this.request('/api/data',{method:'GET'}); },
  saveData(db){ return this.request('/api/data',{method:'POST',body:JSON.stringify(db)}); },
  upsertUser(user){ return this.request('/api/users',{method:'POST',body:JSON.stringify(user)}); },
  deleteUser(username){ return this.request('/api/users/'+encodeURIComponent(username),{method:'DELETE'}); },

  // API nghiệp vụ chuẩn mới
  listOrders(params={}){ const q = new URLSearchParams(params).toString(); return this.request('/api/orders' + (q ? '?' + q : ''), {method:'GET'}); },
  getOrder(id){ return this.request('/api/orders/' + encodeURIComponent(id), {method:'GET'}); },
  createOrder(order){ return this.request('/api/orders', {method:'POST', body:JSON.stringify(order)}); },
  cancelOrder(id, reason=''){ return this.request('/api/orders/' + encodeURIComponent(id) + '/cancel', {method:'POST', body:JSON.stringify({reason})}); },
  listInventory(params={}){ const q = new URLSearchParams(params).toString(); return this.request('/api/inventory' + (q ? '?' + q : ''), {method:'GET'}); },
  getInventoryItem(sku){ return this.request('/api/inventory/' + encodeURIComponent(sku), {method:'GET'}); },
  receiveInventory(receipt){ return this.request('/api/inventory/receive', {method:'POST', body:JSON.stringify(receipt)}); },
  listDebts(){ return this.request('/api/debts', {method:'GET'}); },
  getCustomerDebt(customerCode){ return this.request('/api/debts/' + encodeURIComponent(customerCode), {method:'GET'}); },
  collectDebt(payload){ return this.request('/api/debts/collect', {method:'POST', body:JSON.stringify(payload)}); },
  completeDelivery(payload){ return this.request('/api/delivery/complete', {method:'POST', body:JSON.stringify(payload)}); },
    listUsers(){ return this.request('/api/users',{method:'GET'}); }
};
