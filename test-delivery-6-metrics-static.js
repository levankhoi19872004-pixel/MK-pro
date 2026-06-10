const fs = require('fs');
const path = require('path');
const root = process.cwd();
const service = fs.readFileSync(path.join(root, 'src/services/masterOrderService.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/app/06-master-delivery.js'), 'utf8');
function must(text, needle) {
  if (!text.includes(needle)) throw new Error(`Missing: ${needle}`);
}
[
  'function buildDeliveryAmount(order = {}, returnAmountFromReturnOrders = null)',
  'returnAmountFromReturnOrders',
  "returnAmountSource: 'returnOrders'",
  "sourceOrderId",
  "sourceOrderCode",
  "deliveryOrderId",
  "masterOrderId",
  "cleared",
  'totalReceivable',
  'bonusAmount',
  'debtAmount'
].forEach((needle) => must(service, needle));
[
  'function deliveryAmountMetricLine(row)',
  'PT ${deliveryCompactMoney(pt)}',
  'TM ${deliveryCompactMoney(tm)}',
  'CK ${deliveryCompactMoney(ck)}',
  'TT ${deliveryCompactMoney(tt)}',
  'TH ${deliveryCompactMoney(th)}',
  'CN ${deliveryDebtCompactLabel(cn)}',
  'Trả hàng từ returnOrders'
].forEach((needle) => must(ui, needle));
console.log('delivery 6-metrics static checks OK');
