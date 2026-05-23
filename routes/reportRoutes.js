const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { normalizeData } = require('../data/defaultData');
const { pool, getMemoryData } = require('../config/db');
const { rebuildDebts } = require('../services/orderDebtService');

function emptyReport(data) {
  return {
    totalDebt: data.debts.reduce((s, d) => s + Math.max(0, Number(d.debt) || 0), 0),
    totalPaid: data.debts.reduce((s, d) => s + (Number(d.paid) || 0), 0),
    overdueDebt: data.debts.filter(d => d.status === 'Quá hạn').reduce((s, d) => s + Math.max(0, Number(d.debt) || 0), 0),
    byStaff: {},
    byCustomer: {},
    byCollector: {},
    paymentsByCollector: {},
    overdue: [],
    payments: data.payments || []
  };
}

router.get('/api/debt-report', auth, async (req, res) => {
  try {
    let data;

    if (!process.env.DATABASE_URL) {
      data = normalizeData(getMemoryData());
      data.debts = rebuildDebts(data);
      return res.json(emptyReport(data));
    }

    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      return res.json({
        totalDebt: 0,
        totalPaid: 0,
        overdueDebt: 0,
        byStaff: {},
        byCustomer: {},
        byCollector: {},
        paymentsByCollector: {},
        overdue: [],
        payments: []
      });
    }

    data = normalizeData(result.rows[0].data);
    data.debts = rebuildDebts(data);

    const report = {
      totalDebt: 0,
      totalPaid: 0,
      overdueDebt: 0,
      byStaff: {},
      byCustomer: {},
      byCollector: {},
      paymentsByCollector: {},
      overdue: [],
      payments: data.payments || []
    };

    data.debts.forEach(debt => {
      const staffKey = debt.deliveryStaff || 'Chưa gán NV giao';
      const customerKey = debt.customerCode || debt.customerName || 'Chưa có khách';

      if (!report.byStaff[staffKey]) report.byStaff[staffKey] = 0;
      if (!report.byCustomer[customerKey]) report.byCustomer[customerKey] = 0;

      if (Number(debt.debt) > 0) {
        report.totalDebt += Number(debt.debt) || 0;
        report.byStaff[staffKey] += Number(debt.debt) || 0;
        report.byCustomer[customerKey] += Number(debt.debt) || 0;
      }

      report.totalPaid += Number(debt.paid) || 0;

      if (debt.status === 'Quá hạn') {
        report.overdueDebt += Number(debt.debt) || 0;

        const due = debt.dueDate ? new Date(debt.dueDate) : null;
        let days = 0;

        if (due && !Number.isNaN(due.getTime())) {
          days = Math.floor((Date.now() - due.getTime()) / 86400000);
        }

        report.overdue.push({ ...debt, days });
      }
    });

    (data.payments || []).forEach(payment => {
      const collectorKey =
        payment.collectedBy ||
        payment.collector ||
        payment.staffName ||
        payment.deliveryStaffName ||
        'Chưa rõ người thu';

      if (!report.byCollector[collectorKey]) {
        report.byCollector[collectorKey] = 0;
      }

      if (!report.paymentsByCollector[collectorKey]) {
        report.paymentsByCollector[collectorKey] = {
          collector: collectorKey,
          role: payment.collectedByRole || '',
          code: payment.collectedByCode || '',
          cash: 0,
          bank: 0,
          total: 0,
          count: 0
        };
      }

      const amount = Number(payment.amount) || 0;

      report.byCollector[collectorKey] += amount;
      report.paymentsByCollector[collectorKey].total += amount;
      report.paymentsByCollector[collectorKey].count += 1;

      if (payment.type === 'bank' || payment.method === 'Chuyển khoản') {
        report.paymentsByCollector[collectorKey].bank += amount;
      } else {
        report.paymentsByCollector[collectorKey].cash += amount;
      }
    });

    res.json(report);
  } catch (err) {
    console.error('GET /api/debt-report error:', err);
    res.status(500).json({
      error: 'Không lấy được báo cáo công nợ',
      detail: err.message
    });
  }
});

module.exports = router;
