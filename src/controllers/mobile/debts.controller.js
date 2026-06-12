'use strict';

const { createMobileDebtService } = require('../../services/mobile/debts.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileDebtController(ctx) {
  const service = createMobileDebtService(ctx);
  return {
    listDebts: wrapMobile(service, 'listDebts', 500, 'Không tải được công nợ mobile'),
    submitCollection: wrapMobile(service, 'submitDebtCollection', 400, 'Không gửi được phiếu thu nợ mobile')
  };
}

module.exports = { createMobileDebtController };
