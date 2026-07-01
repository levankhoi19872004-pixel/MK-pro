'use strict';

// Legacy web Debt screen was retired. Keep only tiny compatibility helpers that are
// still referenced by shared modules (sales refresh hooks, pending collections, AR/fund views).
// This file must not render debtTab or create legacy collection/external-debt UI.
var DEBT_ZERO_TOLERANCE = window.DEBT_ZERO_TOLERANCE || 1000;
window.DEBT_ZERO_TOLERANCE = DEBT_ZERO_TOLERANCE;
window.__legacyDebtScreenRetired = true;

function normalizeDebtAmount(value, tolerance = DEBT_ZERO_TOLERANCE){
  const n = Number(value || 0);
  if(!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}
function hasOpenDebt(value){ return normalizeDebtAmount(value) > 0; }
function isOverpaidDebt(value){ return normalizeDebtAmount(value) < 0; }
function debtAmountForStatus(row={}){
  return normalizeDebtAmount(row.debt ?? row.totalDebtDisplay ?? row.totalDebt ?? row.remainingDebtDisplay ?? row.remainingDebt ?? 0);
}
function matchDebtStatus(row={}, status=''){
  const normalizedStatus=String(status||'open').trim().toLowerCase();
  const debt=debtAmountForStatus(row);
  if(['paid','settled','done','het_no','hết nợ'].includes(normalizedStatus))return debt===0;
  if(['overpaid','credit','du_co','dư có'].includes(normalizedStatus))return debt<0;
  if(normalizedStatus==='overdue')return debt>0 && Number(row.overdueDays||row.overdueCount||0)>0;
  if(normalizedStatus==='all')return true;
  return debt>0;
}
function debtDisplayMeta(value){
  const debt=normalizeDebtAmount(value);
  if(debt>0)return {amount:debt,text:money(debt),className:'debt-positive',label:'Còn nợ'};
  if(debt<0)return {amount:debt,text:`Dư có ${money(Math.abs(debt))}`,className:'cash-in',label:'Dư có'};
  return {amount:0,text:'0',className:'debt-zero',label:'Hết nợ'};
}
function parseDebtMoneyInput(value){
  if(typeof value==='number')return Number.isFinite(value)?Math.round(value):0;
  const raw=String(value||'').trim().toLowerCase();
  if(!raw)return 0;
  const multiplier=raw.endsWith('k')?1000:(raw.endsWith('tr')?1000000:1);
  const cleaned=raw.replace(/tr|k/g,'').replace(/[^0-9,.-]/g,'').replace(/[.,](?=\d{3}(\D|$))/g,'').replace(',', '.');
  const n=Number(cleaned);
  return Number.isFinite(n)?Math.max(0,Math.round(n*multiplier)):0;
}
function formatNumber(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n.toLocaleString('vi-VN'):'0';
}
function renderDebtWarnings(rows=[], diagnostics=[]){
  if(typeof debtWarningList === 'undefined' || !debtWarningList)return;
  const warnings=[];
  (Array.isArray(diagnostics)?diagnostics:[]).forEach(item=>warnings.push(item));
  (Array.isArray(rows)?rows:[]).forEach(row=>{
    if(isOverpaidDebt(row.debt ?? row.totalDebt ?? row.remainingDebt))warnings.push({message:'Công nợ âm, cần kiểm tra thu thừa/ghi giảm sai', row});
  });
  debtWarningList.innerHTML=warnings.length
    ? warnings.slice(0,50).map(item=>`<li>${escapeHtml(item.message||item.reason||'Cảnh báo công nợ')}</li>`).join('')
    : '<li>Không có cảnh báo công nợ.</li>';
}
async function loadDebts(){
  // Compatibility bridge for old refresh hooks. The legacy debtTab is gone; refresh New when present.
  if(typeof window.loadDebtNew === 'function')return window.loadDebtNew({ silent: true });
  return null;
}
function resetDebtFilters(){ return loadDebts(); }
function clearDebtCustomerSelection(){ return null; }
function renderDebtManagementReports(){ return null; }
function renderCollectionCustomerSelect(){ return null; }
function setCollectionAmount(){ return null; }
function setExternalDebtCustomerDefaults(){ return null; }

window.normalizeDebtAmount=window.normalizeDebtAmount||normalizeDebtAmount;
window.hasOpenDebt=window.hasOpenDebt||hasOpenDebt;
window.isOverpaidDebt=window.isOverpaidDebt||isOverpaidDebt;
window.debtAmountForStatus=window.debtAmountForStatus||debtAmountForStatus;
window.matchDebtStatus=window.matchDebtStatus||matchDebtStatus;
window.debtDisplayMeta=window.debtDisplayMeta||debtDisplayMeta;
window.parseDebtMoneyInput=window.parseDebtMoneyInput||parseDebtMoneyInput;
window.formatNumber=window.formatNumber||formatNumber;
window.renderDebtWarnings=window.renderDebtWarnings||renderDebtWarnings;
window.loadDebts=loadDebts;
window.resetDebtFilters=resetDebtFilters;
window.clearDebtCustomerSelection=clearDebtCustomerSelection;
window.renderDebtManagementReports=renderDebtManagementReports;
window.renderCollectionCustomerSelect=renderCollectionCustomerSelect;
window.setCollectionAmount=setCollectionAmount;
window.setExternalDebtCustomerDefaults=setExternalDebtCustomerDefaults;
