'use strict';

const productRoutes = require('./productRoutes');
const customerRoutes = require('./customerRoutes');
const userRoutes = require('./userRoutes');
const orderRoutes = require('./orderRoutes');
const masterOrderRoutes = require('./masterOrderRoutes');
const importOrderRoutes = require('./importOrderRoutes');
const returnRoutes = require('./returnRoutes');
const receiptRoutes = require('./receiptRoutes');
const cashbookRoutes = require('./cashbookRoutes');
const bankbookRoutes = require('./bankbookRoutes');
const promotionRoutes = require('./promotionRoutes');
const reportRoutes = require('./reportRoutes');
const systemRoutes = require('./systemRoutes');
const printRoutes = require('./printRoutes');
const { importRouter, exportRouter } = require('./importExportRoutes');
const swaggerRoutes = require('./swaggerRoutes');

function registerApiRoutes(app) {
  // API docs must be mounted before legacy guard.
  app.use('/api', swaggerRoutes);

  // Core system routes must be mounted before legacy guard.
  app.use('/api', systemRoutes);

  // Step 1: Products / Customers / Users
  app.use('/api/products', productRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api', userRoutes);

  // Step 2: Sales Orders / Master Orders
  app.use('/api/sales-orders', orderRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/master-orders', masterOrderRoutes);

  // Step 3: Import Orders / Return Orders
  app.use('/api/import-orders', importOrderRoutes);
  app.use('/api/return-orders', returnRoutes);
  app.use('/api/returns', returnRoutes);

  // Step 4: Receipts / Cashbook / Bankbook
  app.use('/api/receipts', receiptRoutes);
  app.use('/api/cashbook', cashbookRoutes);
  app.use('/api/bankbook', bankbookRoutes);

  // Step 5: Promotions / Reports / Import Templates
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/import', importRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/print', printRoutes);
  app.use('/api', reportRoutes);
}

module.exports = { registerApiRoutes };
