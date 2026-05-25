const DataStore = require('../models/DataStore');
const { emptyDb } = require('./defaultDb');
const importEngine = require('./importEngine');

function normalizeDb(data){
  const base = emptyDb();
  const src = data && typeof data === 'object' ? data : {};
  Object.keys(base).forEach(k => { base[k] = Array.isArray(src[k]) ? src[k] : []; });
  // Tự dựng lại sổ cái công nợ nếu dữ liệu cũ chưa có ledger.
  if ((!base.debtLedger || base.debtLedger.length === 0) && base.orders.length > 0) {
    try { importEngine.rebuildLedgersFromCurrentOrders(base); } catch (e) { console.warn('REBUILD_LEDGER_WARN', e.message); }
  }
  return base;
}

async function getDb(){
  const doc = await DataStore.findOne({ key: 'main' }).lean();
  if(!doc) return emptyDb();
  return normalizeDb(doc.data);
}

async function saveDb(data){
  const normalized = normalizeDb(data);
  await DataStore.findOneAndUpdate({ key: 'main' }, { data: normalized }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return normalized;
}

module.exports = { getDb, saveDb, normalizeDb };
