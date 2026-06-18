'use strict';
module.exports = {
  ...require('./reports/StockReportService'),
  ...require('./reports/ReturnReportService'),
  ...require('./reports/DebtReportService'),
  ...require('./reports/SalesReportService'),
  ...require('./reports/DeliveryReportService'),
  ...require('./reports/FinanceReportService'),
  ...require('./reports/DashboardReportService'),
  ...require('./reports/ReportCenterService')
};
