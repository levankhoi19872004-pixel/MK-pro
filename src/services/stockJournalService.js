const { num, today, nowIso, uid, cleanCode } = require('../utils/coreUtils');
const auditLogService = require('./auditLogService');

function ensure(db){ db.stockJournals = Array.isArray(db.stockJournals) ? db.stockJournals : []; return db.stockJournals; }
function addStockJournal(db, input = {}, user = {}){
  const rows = ensure(db);
  const entry = {
    id: input.id || uid('STK_'),
    date: input.date || today(),
    time: nowIso(),
    type: input.type || 'ADJUST',
    refId: input.refId || '',
    sku: cleanCode(input.sku || input.productCode),
    productName: input.productName || input.name || '',
    warehouseCode: input.warehouseCode || 'KHO_CHINH',
    inQty: num(input.inQty),
    outQty: num(input.outQty),
    adjustQty: num(input.adjustQty),
    beforeQty: num(input.beforeQty),
    afterQty: num(input.afterQty),
    note: input.note || '',
    userCode: user.code || input.userCode || ''
  };
  rows.unshift(entry);
  auditLogService.addLog(db, 'STOCK_JOURNAL', { module:'STOCK', refType:entry.type, refId:entry.refId || entry.id, after:entry, user });
  return entry;
}
function listStockJournal(db, filter = {}){
  let rows = ensure(db);
  if(filter.sku) rows = rows.filter(x => cleanCode(x.sku) === cleanCode(filter.sku));
  if(filter.warehouseCode) rows = rows.filter(x => cleanCode(x.warehouseCode) === cleanCode(filter.warehouseCode));
  if(filter.fromDate) rows = rows.filter(x => String(x.date) >= String(filter.fromDate));
  if(filter.toDate) rows = rows.filter(x => String(x.date) <= String(filter.toDate));
  return rows;
}
module.exports = { ensure, addStockJournal, listStockJournal };
