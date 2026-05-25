const { num, cleanCode } = require('../utils/coreUtils');

function ensureStocks(db){ db.stocks = Array.isArray(db.stocks) ? db.stocks : []; return db.stocks; }
function getStock(db, sku, warehouseCode = 'KHO_CHINH'){
  const stocks = ensureStocks(db);
  let row = stocks.find(x => cleanCode(x.sku || x.productCode) === cleanCode(sku) && cleanCode(x.warehouseCode || x.warehouse || 'KHO_CHINH') === cleanCode(warehouseCode));
  if(!row){ row = { sku: cleanCode(sku), productCode: cleanCode(sku), warehouseCode, qty:0, realStock:0, openSaleStock:0 }; stocks.push(row); }
  return row;
}
function getQty(row){ return num(row.qty !== undefined ? row.qty : row.realStock); }
function setQty(row, qty){ row.qty = num(qty); row.realStock = num(qty); return row; }
function calcOpenSaleStock(db, sku, warehouseCode = 'KHO_CHINH'){
  const stock = getStock(db, sku, warehouseCode);
  const realStock = getQty(stock);
  const dmsStock = (db.dmsStocks || []).filter(x => cleanCode(x.sku || x.productCode) === cleanCode(sku)).reduce((s,x)=>s+num(x.qty || x.quantity),0);
  return Math.max(0, dmsStock > 0 ? realStock - dmsStock : realStock);
}
function assertCanSell(db, items = []){
  const errors = [];
  items.forEach(item => {
    const sku = item.sku || item.productCode;
    const warehouseCode = item.warehouseCode || 'KHO_CHINH';
    const canSell = calcOpenSaleStock(db, sku, warehouseCode);
    if(num(item.qty || item.quantity) > canSell){
      errors.push({ sku, productName:item.name || item.productName || '', requestQty:num(item.qty || item.quantity), openSaleStock:canSell });
    }
  });
  if(errors.length){ const err = new Error('Tồn mở bán không đủ'); err.details = errors; throw err; }
  return true;
}
module.exports = { ensureStocks, getStock, getQty, setQty, calcOpenSaleStock, assertCanSell };
