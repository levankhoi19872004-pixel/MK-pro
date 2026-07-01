'use strict';

const ImportHandlerRegistry = require('./ImportHandlerRegistry');
const handlers = [
  require('./handlers/ProductImportHandler'),
  require('./handlers/CustomerImportHandler'),
  require('./handlers/UserImportHandler'),
  require('./handlers/OpeningStockImportHandler'),
  require('./handlers/ImportOrderHandler'),
  require('./handlers/SalesOrderImportHandler'),
  require('./handlers/OpeningDebtImportHandler'),
  require('./handlers/DebtCollectionImportHandler'),
  require('./handlers/CashbookImportHandler'),
  require('./handlers/PromotionProductImportHandler'),
  require('./handlers/PromotionGroupItemImportHandler'),
  require('./handlers/PromotionGroupRuleImportHandler'),
  require('./handlers/PromotionQuantityGroupDiscountImportHandler'),
  require('./handlers/PromotionCustomerOrderValueDiscountImportHandler')
];

const registry = new ImportHandlerRegistry(handlers);

async function commit(type, rows, context = {}) {
  return registry.commit(type, rows, context);
}

function supports(type) {
  return registry.has(type);
}

function supportedTypes() {
  return registry.listTypes();
}

module.exports = { commit, supports, supportedTypes, registry };
