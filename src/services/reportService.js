'use strict';
module.exports = {
  ...require('./reports/StockReportService'),
  ...require('./reports/DebtReportService'),
  ...require('./reports/SalesReportService'),
  ...require('./reports/DeliveryReportService'),
  ...require('./reports/FinanceReportService'),
  ...require('./reports/DashboardReportService')
};
