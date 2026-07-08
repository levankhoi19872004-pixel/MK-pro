#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { buildTrace, parseArgs } = require('./trace-order-payment-debt');

async function main() {
  const options = parseArgs();
  await connectDB();
  try {
    const trace = await buildTrace(options);
    const out = {
      orderCode: (trace.order || {}).orderCode || options.orderCode || '',
      customerCode: (trace.order || {}).customerCode || '',
      debtNewOrderBalance: ((trace.debtNew || {}).orderBalance) || 0,
      debtNewCustomerBalance: ((trace.debtNew || {}).customerBalance) || 0,
      arLedgerOrderBalance: ((trace.arLedgerBalance || {}).currentArBalance) || 0,
      allocationExpectedDebt: ((trace.reconcile || {}).expectedDebtAmount) || 0,
      diffDebtNewVsAr: ((trace.debtNew || {}).diffDebtNewVsArLedger) || 0,
      diffArVsAllocation: ((trace.reconcile || {}).diff) || 0,
      suggestedFix: ((trace.debtNew || {}).diffDebtNewVsArLedger)
        ? 'DebtNewService đang lệch arLedgers; kiểm tra cache/filter/category.'
        : (((trace.reconcile || {}).diff) ? 'Chạy order-payment:repair:debt cho order này.' : 'DebtNew, arLedgers và allocation đang khớp theo trace.')
    };
    if (options.json) console.log(JSON.stringify(out, null, 2));
    else console.log(JSON.stringify(out, null, 2));
  } finally {
    await mongoose.connection.close();
  }
}
if (require.main === module) main().catch((err) => { console.error(err && err.stack ? err.stack : err); process.exitCode = 1; });
