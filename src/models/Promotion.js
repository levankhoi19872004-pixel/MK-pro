const flexModel = require('./_flexModel');
module.exports = flexModel('Promotion', 'promotions', {
  id: String,
  code: String,
  name: String,
  type: String,
  productCodes: Array,
  conditions: Array,
  rewards: Array,
  startDate: String,
  endDate: String,
  isActive: Boolean
});
