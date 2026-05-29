const flexModel = require('./_flexModel');
module.exports = flexModel('Cashbook', 'cashbooks', {
  id: String,
  code: String,
  type: String,
  amount: Number,
  source: String,
  refType: String,
  refId: String,
  note: String,
  createdAt: String
});
