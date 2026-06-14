'use strict';
const legacy = require('../reportLegacy.service');
module.exports = {
  debtReport: legacy.debtReport,
  debtInit: legacy.debtInit,
  debtCustomers: legacy.debtCustomers,
  debtCustomerDetail: legacy.debtCustomerDetail,
  debtArLedger: legacy.debtArLedger,
  debtBySalesmanReport: legacy.debtBySalesmanReport,
  debtByDeliveryReport: legacy.debtByDeliveryReport
};
