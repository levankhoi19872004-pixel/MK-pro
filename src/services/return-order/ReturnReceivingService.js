'use strict';
const legacy = require('../returnOrderLegacy.service');
module.exports = { confirmReceiveReturnOrder: legacy.confirmReceiveReturnOrder, stockInReturnOrder: legacy.stockInReturnOrder };
