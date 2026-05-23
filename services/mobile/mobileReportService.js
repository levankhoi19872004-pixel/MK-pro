'use strict';
const { readKhoData } = require('../../config/db');
function num(v){return Number(v)||0;} function day(v){return String(v||'').slice(0,10);} function today(){return new Date().toISOString().slice(0,10);} function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();} function code(u){return norm(u.maNhanVien||u.code||u.username||'');}
module.exports={
  async getSalesReport(user,query){const data=await readKhoData(); const from=query.from||today(), to=query.to||from, c=code(user); const orders=(data.orders||[]).filter(o=>{const d=day(o.isoDate||o.date);return d>=from&&d<=to&&(!c||norm(o.staffCode||o.staffMa||o.salesCode)===c);}); return {user,from,to,orders,totalOrders:orders.length,totalRevenue:orders.reduce((a,o)=>a+num(o.total),0)};},
  async getDeliveryReport(user,query){const data=await readKhoData(); const from=query.from||today(), to=query.to||from; const orders=(data.orders||[]).filter(o=>{const d=day(o.isoDate||o.date);return d>=from&&d<=to;}); return {user,from,to,orders,totalOrders:orders.length,totalCollect:orders.reduce((a,o)=>a+num(o.cashPaid)+num(o.bankPaid),0)};}
};
