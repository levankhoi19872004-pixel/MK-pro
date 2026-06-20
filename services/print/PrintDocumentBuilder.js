'use strict';

const REQUIRED_METHODS = Object.freeze([
  'buildPrintData',
  'buildDeliveryInvoicePayload',
  'calculateDeliveryInvoiceSummary',
  'paginateDeliveryInvoice',
  'validateAgainstDmsSample'
]);

function createPrintDocumentBuilder(implementation) {
  if (!implementation || typeof implementation !== 'object') {
    throw new TypeError('PrintDocumentBuilder requires an implementation object');
  }

  const missing = REQUIRED_METHODS.filter((method) => typeof implementation[method] !== 'function');
  if (missing.length) {
    throw new TypeError(`PrintDocumentBuilder implementation is missing: ${missing.join(', ')}`);
  }

  return Object.freeze(Object.fromEntries(
    REQUIRED_METHODS.map((method) => [method, implementation[method].bind(implementation)])
  ));
}

module.exports = {
  REQUIRED_METHODS,
  createPrintDocumentBuilder
};
