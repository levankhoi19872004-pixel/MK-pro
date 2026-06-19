const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionGroupItem', 'promotionGroupItems', {
  id: String,
  programCode: String,
  productCode: String,
  productName: String,
  productMatched: Boolean,
  missingProduct: Boolean,
  source: String,
  startDate: String,
  endDate: String,
  cancelledAt: String,
  isActive: Boolean,
  createdAt: String,
  updatedAt: String
});
