const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionGroupRule', 'promotionGroupRules', {
  id: String,
  programCode: String,
  programName: String,
  groupCode: String,
  basis: String,
  calculationBasis: String,
  minAmount: Number,
  discountPercent: Number,
  source: String,
  startDate: String,
  endDate: String,
  cancelledAt: String,
  isActive: Boolean,
  createdAt: String,
  updatedAt: String
});
