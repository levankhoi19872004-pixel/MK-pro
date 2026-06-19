'use strict';
const legacy = require('../printDataBuilder.legacy');
module.exports = {
  buildPrintData: legacy.buildPrintData,
  buildDeliveryInvoicePayload: legacy.buildDeliveryInvoicePayload,
  calculateDeliveryInvoiceSummary: legacy.calculateDeliveryInvoiceSummary,
  paginateDeliveryInvoice: legacy.paginateDeliveryInvoice,
  validateAgainstDmsSample: legacy.validateAgainstDmsSample
};
