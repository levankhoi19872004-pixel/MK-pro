'use strict';

const createOperationHandler = require('./createOperationHandler');

module.exports = createOperationHandler('salesOrders', 'importSalesOrders', { autoCutStock: true });
