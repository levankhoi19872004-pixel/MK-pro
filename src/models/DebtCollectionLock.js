'use strict';

const flexModel = require('./_flexModel');

// Một dòng khóa logic cho mỗi đơn nợ. findOneAndUpdate($inc) trong transaction
// buộc các request cùng thu trên một đơn phải tuần tự hóa trước khi kiểm tra available debt.
module.exports = flexModel('DebtCollectionLock', 'debtCollectionLocks', {
  orderCode: String,
  version: Number,
  updatedAt: String
});
