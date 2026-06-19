'use strict';
const legacy = require('../orderLegacy.service');
module.exports = {
  applySalesOrderPosting: legacy.applySalesOrderPosting,
  reverseSalesOrderPosting: legacy.reverseSalesOrderPosting
};
