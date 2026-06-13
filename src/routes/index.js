'use strict';

const productRoutes = require('./productRoutes');
const customerRoutes = require('./customerRoutes');
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');
const orderRoutes = require('./orderRoutes');
const masterOrderRoutes = require('./masterOrderRoutes');
const masterOrderController = require('../controllers/masterOrderController');
const importOrderRoutes = require('./importOrderRoutes');
const returnRoutes = require('./returnRoutes');
const masterReturnOrderRoutes = require('./masterReturnOrderRoutes');
const receiptRoutes = require('./receiptRoutes');
const debtCollectionRoutes = require('./debtCollectionRoutes');
const externalDebtOrderRoutes = require('./externalDebtOrderRoutes');
const cashbookRoutes = require('./cashbookRoutes');
const bankbookRoutes = require('./bankbookRoutes');
const promotionRoutes = require('./promotionRoutes');
const reportRoutes = require('./reportRoutes');
const systemRoutes = require('./systemRoutes');
const printRoutes = require('./printRoutes');
const { importRouter, exportRouter } = require('./importExportRoutes');
const swaggerRoutes = require('./swaggerRoutes');
const mobileModule = require('./mobile');
const legacyMobileRoutes = require('./mobileRoutes');
const { createMobileContext } = require('../mobile/mobileContext');
const searchRoutes = require('./searchRoutes');
const catalogRoutes = require('./catalogRoutes');
const fundRoutes = require('./fundRoutes');
const deliveryRoutes = require('./deliveryRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const { requireRole } = require('../middlewares/auth.middleware');

function registerApiRoutes(app) {
  // API docs must be mounted before legacy guard.
  app.use('/api', swaggerRoutes);

  // Core system routes must be mounted before legacy guard.
  app.use('/api', systemRoutes);

  // Unified login for web software + sales app + delivery app.
  app.use('/api/auth', authRoutes);

  // Unified search engine for web + mobile autocomplete.
  app.use('/api/search', searchRoutes);

  // Phase 3.6: server-side catalog search + lazy cache.
  app.use('/api/catalog', catalogRoutes);

  // Canonical delivery routes: one core API for web + mobile delivery UIs.
  app.use('/api/delivery', deliveryRoutes);

  // Canonical inventory contract: all stock reads/checks go through inventoryStock.service.
  app.use('/api/inventory', inventoryRoutes);

  // MOBILE_MODULAR_ROUTE_MOUNT_START
  const mobileCtx = createMobileContext();

  mobileModule.registerMobileRoutes(app, mobileCtx);

  // Legacy chỉ được bật tạm thời trong cửa sổ rollback có kiểm soát.
  // Mặc định không mount để tránh hai command path ghi cùng một nghiệp vụ.
  if (process.env.ENABLE_LEGACY_MOBILE_ROUTES === 'true') {
    app.use('/api/mobile-legacy', legacyMobileRoutes);
    console.warn('⚠️ ENABLE_LEGACY_MOBILE_ROUTES=true: namespace mobile legacy đang được bật tạm thời');
  }
  // MOBILE_MODULAR_ROUTE_MOUNT_END

  // Step 1: Products / Customers / Users
  app.use('/api/products', productRoutes);
  // Alias cũ để các bản frontend/mobile-sales không bị lỗi API không tồn tại.
  app.use('/api/mobile-sales/products', productRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api', userRoutes);

  // Step 2: Sales Orders / Master Orders
  app.use('/api/sales-orders', orderRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/master-orders', masterOrderRoutes);
  // Web dashboard alias for delivery operation UI.
  app.get('/api/delivery-today', requireRole(['admin', 'manager', 'accountant', 'warehouse']), masterOrderController.listDeliveryToday);

  // Step 3: Import Orders / Return Orders
  app.use('/api/import-orders', importOrderRoutes);
  app.use('/api/return-orders', returnRoutes);
  app.use('/api/returns', returnRoutes);
  app.use('/api/master-return-orders', masterReturnOrderRoutes);

  // Step 4: Receipts / Cashbook / Bankbook
  app.use('/api/receipts', receiptRoutes);
  app.use('/api/debt-collections', debtCollectionRoutes);
  app.use('/api/external-debt-orders', externalDebtOrderRoutes);
  app.use('/api/cashbook', cashbookRoutes);
  app.use('/api/bankbook', bankbookRoutes);
  app.use('/api/funds', fundRoutes);

  // Step 5: Promotions / Reports / Import Templates
  app.use('/api/promotions', promotionRoutes);
  app.use('/api/import', importRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/print', printRoutes);
  app.use('/api', reportRoutes);
}

module.exports = { registerApiRoutes };
