'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const customerMonthlySalesService = require('../src/services/customerMonthlySales.service');

const { summarizeMonthlySales, orderRevenue, isOrderInMonth, buildMonthlyOrderFilter } = customerMonthlySalesService._internal;

test('monthly customer sales accepts ISO and Vietnamese order dates and excludes inactive orders', () => {
  const metrics = summarizeMonthlySales([
    { customerCode: '4499704', orderDate: '2026-06-01', totalAmount: 100000, status: 'pending' },
    { customerCode: '4499704', orderDate: '13/06/2026', afterPromoAmount: 250000, totalAmount: 300000, status: 'delivered' },
    { customerCode: '4499704', orderDate: '2026-06-14', totalAmount: 500000, status: 'cancelled' },
    { customerCode: '4499704', orderDate: '2026-06-15', totalAmount: 600000, deletedAt: '2026-06-15T10:00:00.000Z' },
    { customerCode: '4499704', orderDate: '2026-05-31', totalAmount: 700000, status: 'delivered' },
    { customerCode: '4499370', date: '01.06.2026', totalAmount: 800000, status: 'pending' }
  ], '2026-06');

  assert.deepEqual(metrics.get('4499704'), { revenue: 350000, orderCount: 2 });
  assert.deepEqual(metrics.get('4499370'), { revenue: 800000, orderCount: 1 });
});

test('monthly revenue prefers after-promotion total and preserves explicit zero', () => {
  assert.equal(orderRevenue({ afterPromoAmount: 0, totalAmount: 999999 }), 0);
  assert.equal(orderRevenue({ totalAfterPromotion: 123456, totalAmount: 999999 }), 123456);
  assert.equal(orderRevenue({ totalAmount: 345678 }), 345678);
});

test('month matcher uses Vietnam date normalization', () => {
  assert.equal(isOrderInMonth({ orderDate: '2026-06-14' }, '2026-06'), true);
  assert.equal(isOrderInMonth({ orderDate: '14/06/2026' }, '2026-06'), true);
  assert.equal(isOrderInMonth({ orderDate: '14.05.2026' }, '2026-06'), false);
});

test('monthly query is scoped by customer code and active order flags', () => {
  const filter = buildMonthlyOrderFilter(['4499704', '4499370'], '2026-06');
  assert.deepEqual(filter.customerCode.$in, ['4499704', '4499370']);
  assert.ok(filter.status.$nin.includes('cancelled'));
  assert.ok(Array.isArray(filter.$or));
  assert.ok(filter.$or.length >= 7);
});

test('mobile catalog customer response is enriched with monthly sales fields', () => {
  const rows = customerMonthlySalesService.attachMonthlySales([
    { code: '4499704', name: 'Chị Giang Điệp' },
    { code: '4499370', name: 'Anh Dũng' }
  ], new Map([
    ['4499704', { revenue: 1234567, orderCount: 3 }]
  ]), '2026-06');

  assert.equal(rows[0].monthRevenue, 1234567);
  assert.equal(rows[0].monthSales, 1234567);
  assert.equal(rows[0].monthOrderCount, 3);
  assert.equal(rows[0].salesMonth, '2026-06');
  assert.equal(rows[1].monthRevenue, 0);
});
