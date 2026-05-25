function num(v){
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}
function roundMoney(v){ return Math.round(num(v)); }
function today(){ return new Date().toISOString().slice(0,10); }
function nowIso(){ return new Date().toISOString(); }
function cleanCode(v){ return String(v || '').trim(); }
function uid(prefix){ return `${prefix}${Date.now()}${Math.floor(Math.random()*10000)}`; }
function sum(arr, fn){ return (arr || []).reduce((a,x)=>a+num(fn?fn(x):x),0); }
function sameId(a,b){ return cleanCode(a) === cleanCode(b); }
module.exports = { num, roundMoney, today, nowIso, cleanCode, uid, sum, sameId };
