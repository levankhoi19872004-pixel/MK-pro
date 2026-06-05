const flexModel = require('./_flexModel');

module.exports = flexModel('PromotionGroupItem', 'promotionGroupItems', {
  id: String,
  programCode: String,
  productCode: String,
  productName: String,
  isActive: Boolean,
  createdAt: String,
  updatedAt: String
});
