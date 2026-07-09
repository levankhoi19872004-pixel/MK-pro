'use strict';

const productRoutes = require('./productRoutes');
const customerRoutes = require('./customerRoutes');
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');
const orderRoutes = require('./orderRoutes');
const masterOrderRoutes = require('./masterOrderRoutes');
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
const dashboardRoutes = require('./dashboardRoutes');
const systemRoutes = require('./systemRoutes');
const printRoutes = require('./printRoutes');
const { importRouter, exportRouter } = require('./importExportRoutes');
const swaggerRoutes = require('./swaggerRoutes');
const mobileModule = require('./mobile');
const { createMobileContext } = require('../mobile/mobileContext');
const searchRoutes = require('./searchRoutes');
const catalogRoutes = require('./catalogRoutes');
const fundRoutes = require('./fundRoutes');
const deliveryRoutes = require('./deliveryRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const dmsInventoryRoutes = require('./dmsInventoryRoutes');
const excelInteractionRoutes = require('./excelInteractionRoutes');
const { retiredRoute } = require('../middlewares/retiredRoute.middleware');
const { inventoryMaintenanceGuard } = require('../middlewares/inventoryMaintenance.middleware');
const purchaseRoutes = require('./purchaseRoutes');
const warehouseAdvancedRoutes = require('./warehouseAdvancedRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const fieldOperationRoutes = require('./fieldOperationRoutes');
const deliveryPlanningRoutes = require('./deliveryPlanningRoutes');
const integrationRoutes = require('./integrationRoutes');
const platformRoutes = require('./platformRoutes');
const enterpriseRoutes = require('./enterpriseRoutes');
const backgroundJobRoutes = require('./backgroundJobRoutes');
const adminCorrectionRoutes = require('./adminCorrectionRoutes');
const newOperationsRoutes = require('./newOperationsRoutes');
const notificationRoutes = require('./notificationRoutes');
const orderSplitToolRoutes = require('./tools/orderSplit.routes');
const dmsGapSimulatorRoutes = require('./tools/dmsGapSimulator.routes');
const displayCheckRoutes = require('./tools/displayCheck.routes');


function registerApiRoutes(app) {
  // Khi chạy rebuild/normalize tồn kho, chặn mọi command có thể ghi tồn song song.
  app.use('/api', inventoryMaintenanceGuard);
  // API docs must be mounted before legacy guard.
  app.use('/api', swaggerRoutes);

  // Core system routes must be mounted before legacy guard.
  app.use('/api', systemRoutes);
  app.use('/api/admin', adminCorrectionRoutes);
  app.use('/api/new', newOperationsRoutes);

  // Unified login for web software + sales app + delivery app.
  app.use('/api/auth', authRoutes);

  // Event-driven Notification Center: auth is enforced by global API boundary.
  app.use('/api/notifications', notificationRoutes);

  // Out-of-flow Excel calculator tool. It must not touch ERP business collections.
  app.use('/api/tools/order-split', orderSplitToolRoutes);
  // Out-of-flow DMS gap simulator: in-memory preview/export only, no ERP writes.
  app.use('/api/tools/dms-gap-simulator', dmsGapSimulatorRoutes);
  // Display check manager: writes only display-check planning collections, never ERP business data.
  app.use('/api/tools/display-check', displayCheckRoutes);

  // Unified search engine for web + mobile autocomplete.
  app.use('/api/search', searchRoutes);

  // Phase 3.6: server-side catalog search + lazy cache.
  app.use('/api/catalog', catalogRoutes);

  // Canonical delivery routes: one core API for web + mobile delivery UIs.
  app.use('/api/delivery', deliveryRoutes);

  // Canonical inventory contract: all stock reads/checks go through inventoryStock.service.
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/dms-inventory', dmsInventoryRoutes);
  // Excel Interaction Platform: paste grid + context export dùng chung.
  app.use('/api/excel', excelInteractionRoutes);

  // MOBILE_MODULAR_ROUTE_MOUNT_START
  const mobileCtx = createMobileContext();

  mobileModule.registerMobileRoutes(app, mobileCtx);

  // Namespace legacy đã bị loại bỏ vĩnh viễn. Giữ 410 guard để phát hiện client cũ,
  // tuyệt đối không mount lại command path ghi dữ liệu thứ hai.
  app.use('/api/mobile-legacy', retiredRoute('mobile-legacy', {
    replacement: '/api/mobile',
    message: 'Mobile legacy đã ngừng hoạt động. Vui lòng cập nhật app để dùng /api/mobile.'
  }));
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
  // Legacy web delivery-today alias retired; New UI uses /api/new/delivery-today/*.
  app.use('/api/delivery-today', retiredRoute('legacy-web-delivery-today-alias', {
    replacement: '/api/new/delivery-today/orders',
    message: 'Module Đơn giao hôm nay cũ đã được thay thế bằng Đơn giao hôm nay (New).'
  }));

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
  app.use('/api/background-jobs', backgroundJobRoutes);
  app.use('/api/print', printRoutes);
  // Dashboard tổng quan là module đọc độc lập; route cũ /api/dashboard vẫn được giữ nguyên.
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api', reportRoutes);

  // Phase 80 enterprise expansion modules. Every module is feature-flagged and
  // uses tenant-scoped command/transaction boundaries.
  app.use('/api/purchase', purchaseRoutes);
  app.use('/api/warehouse-advanced', warehouseAdvancedRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/field-operations', fieldOperationRoutes);
  app.use('/api/delivery-planning', deliveryPlanningRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/enterprise', enterpriseRoutes);
}

module.exports = { registerApiRoutes };
