'use strict';

const paymentRepository = require('../repositories/paymentRepository');

module.exports = {
  dateUtil: require('../utils/date.util'),
  paymentRepository,
  paymentRepositoryRuntime: () => require('../repositories/paymentRepository'),
  commonUtil: require('../utils/common.util'),
  debugUtil: require('../utils/debug.util'),
  arLedgerValidation: require('../utils/arLedgerValidation.util'),
  arLedgerStatus: require('../utils/arLedgerStatus.util'),
  arLedgerContractValidation: require('../domain/ar/arLedgerValidator'),
  returnArPostingService: require('../services/accounting/returnArPostingService'),
  staffIdentity: require('../domain/staff/staffIdentity')
};
