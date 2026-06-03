const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionGroupRule', 'promotionGroupRules', {
  id: String,
  programCode: String,
  programName: String,
  minAmount: Number,
  discountPercent: Number,
  isActive: Boolean,
  createdAt: String,
  updatedAt: String
});
