const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionProductRule', 'promotionProductRules', {
  id: String,
  programCode: String,
  programName: String,
  productCode: String,
  productName: String,
  discountPercent: Number,
  isActive: Boolean,
  createdAt: String,
  updatedAt: String
});
