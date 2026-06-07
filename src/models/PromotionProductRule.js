const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionProductRule', 'promotionProductRules', {
  id: String,
  programCode: String,
  programName: String,
  productCode: String,
  productName: String,
  discountPercent: Number,
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
