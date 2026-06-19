'use strict';
module.exports = {
  ...require('./sales-order/SalesOrderQueryService'),
  ...require('./sales-order/SalesOrderCommandService'),
  ...require('./sales-order/SalesOrderPostingCoordinator')
};
