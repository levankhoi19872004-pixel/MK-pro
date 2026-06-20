'use strict';

const legacyImplementation = require('./printDataBuilder.legacy');
const { createPrintDocumentBuilder } = require('./print/PrintDocumentBuilder');
const PrintFormatService = require('./print/PrintFormatService');

const documentBuilder = createPrintDocumentBuilder(legacyImplementation);

module.exports = {
  ...documentBuilder,
  formatMoney: PrintFormatService.formatMoney,
  formatDate: PrintFormatService.formatDate,
  formatDateTime: PrintFormatService.formatDateTime,
  numberToVietnameseWords: PrintFormatService.numberToVietnameseWords
};
