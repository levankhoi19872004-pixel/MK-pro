'use strict';
module.exports = {
  ...require('./return-order/ReturnOrderQueryService'),
  ...require('./return-order/ReturnOrderCommandService'),
  ...require('./return-order/ReturnReceivingService'),
  ...require('./return-order/ReturnAccountingService'),
  ...require('./return-order/ReturnDraftSyncService')
};
