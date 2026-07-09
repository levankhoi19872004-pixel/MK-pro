# CANONICAL_FLOW_MATRIX - Phase217→220

Mục tiêu: mỗi nghiệp vụ chính của MK-Pro có đúng một owner canonical, route/service/SSoT rõ ràng; legacy chỉ còn compatibility có kiểm soát hoặc retired.

## authAndRole

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | authAndRole |
| Trạng thái | canonical |
| Domain | auth |
| Luồng chuẩn | core-auth |
| Frontend entry | public/login.html<br>public/index.html<br>public/mobile/sales.html<br>public/mobile/delivery.html<br>public/mobile/warehouse.html |
| API chính | POST /api/auth/login<br>GET /api/auth/me |
| Service chính | src/middlewares/auth.middleware.js |
| Collections SSoT | users<br>roles |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | - |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## productCatalog

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | productCatalog |
| Trạng thái | canonical |
| Domain | catalog |
| Luồng chuẩn | catalog |
| Frontend entry | public/js/app/02-products.js |
| API chính | GET /api/products<br>POST /api/products<br>PUT /api/products/:id<br>PATCH /api/products/:id |
| Service chính | src/controllers/productController.js<br>src/services/productService.js |
| Collections SSoT | products |
| Legacy/compatibility route | GET /api/mobile-sales/products |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | inventorySnapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## customerCatalog

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | customerCatalog |
| Trạng thái | canonical |
| Domain | catalog |
| Luồng chuẩn | catalog |
| Frontend entry | public/js/app/03-customers-autocomplete.js |
| API chính | GET /api/customers<br>POST /api/customers<br>PUT /api/customers/:id |
| Service chính | src/controllers/customerController.js<br>src/services/customerService.js |
| Collections SSoT | customers |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | - |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## webSalesOrder

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | webSalesOrder |
| Trạng thái | canonical |
| Domain | sales |
| Luồng chuẩn | sales |
| Frontend entry | public/js/app/05-sales-orders.js |
| API chính | GET /api/sales-orders<br>POST /api/sales-orders<br>GET /api/sales-orders/:id<br>DELETE /api/sales-orders/:id |
| Service chính | src/controllers/orderController.js<br>src/services/orderService.js |
| Collections SSoT | salesOrders<br>inventories<br>stockTransactions |
| Legacy/compatibility route | /api/orders |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | inventorySnapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## mobileSalesOrder

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | mobileSalesOrder |
| Trạng thái | canonical |
| Domain | mobile-sales |
| Luồng chuẩn | mobile-sales |
| Frontend entry | public/mobile/js/sales.source/part-01.jsfrag |
| API chính | GET /api/mobile/customers<br>GET /api/mobile/products<br>GET /api/mobile/sales/orders<br>POST /api/mobile/sales/orders |
| Service chính | src/routes/mobile/sales.routes.js<br>src/controllers/mobileController.js |
| Collections SSoT | salesOrders<br>customers<br>products<br>inventories |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-mobile-sales-snapshot-flow |
| Forbidden source/behavior | inventorySnapshots<br>reporting_snapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## salesImportPreviewCommit

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | salesImportPreviewCommit |
| Trạng thái | canonical |
| Domain | import |
| Luồng chuẩn | import |
| Frontend entry | public/js/app/admin/09-import.js |
| API chính | POST /api/import/preview<br>POST /api/import/commit<br>GET /api/import/sessions/:id |
| Service chính | src/routes/importExportRoutes.js<br>src/controllers/importRuntimeController.js<br>src/services/importService.js |
| Collections SSoT | import_sessions<br>salesOrders<br>inventories<br>stockTransactions |
| Legacy/compatibility route | /api/excel/* |
| Luồng cũ bị thay thế | worker-only-import-commit |
| Forbidden source/behavior | snapshotImports |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## dmsInventoryComparison

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | dmsInventoryComparison |
| Trạng thái | canonical |
| Domain | dms |
| Luồng chuẩn | inventory |
| Frontend entry | public/js/app/10-dms-inventory.js |
| API chính | GET /api/dms-inventory/latest<br>GET /api/dms-inventory/history<br>POST /api/dms-inventory/preview<br>POST /api/dms-inventory/:id/commit |
| Service chính | src/controllers/dmsInventoryController.js<br>src/services/dmsInventoryService.js |
| Collections SSoT | dmsInventoryComparisons<br>dmsInventoryQuotas<br>inventories |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | dms-snapshot-quota-flow |
| Forbidden source/behavior | inventorySnapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## dmsGapSimulator

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | dmsGapSimulator |
| Trạng thái | canonical |
| Domain | tools |
| Luồng chuẩn | tools |
| Frontend entry | public/js/app/tools/dms-gap-simulator.js |
| API chính | POST /api/tools/dms-gap-simulator/preview<br>POST /api/tools/dms-gap-simulator/export |
| Service chính | src/routes/tools/dmsGapSimulator.routes.js |
| Collections SSoT | products<br>customers<br>promotions<br>dmsInventoryComparisons |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | dms-gap-simulator-static-source |
| Forbidden source/behavior | staleUploadOnlyProductSource |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## displayCheckManager

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | displayCheckManager |
| Trạng thái | canonical |
| Domain | tools |
| Luồng chuẩn | tools |
| Frontend entry | public/js/app/tools/display-check-manager.js |
| API chính | GET /api/tools/display-check/*<br>POST /api/tools/display-check/* |
| Service chính | src/routes/tools/displayCheck.routes.js |
| Collections SSoT | displayCheckGroups<br>displayCheckStores<br>displayCheckRuns |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | staleDailyState |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## masterOrder

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | masterOrder |
| Trạng thái | canonical |
| Domain | delivery |
| Luồng chuẩn | delivery |
| Frontend entry | public/js/app/06-master-delivery.js |
| API chính | GET /api/master-orders<br>POST /api/master-orders<br>POST /api/print/master-orders/batch |
| Service chính | src/controllers/masterOrderController.js<br>src/services/masterOrderService.js |
| Collections SSoT | master_orders<br>salesOrders |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | master_orders.totalAmount as delivery-today SSoT |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## deliveryMobilePhase23Workflow

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | deliveryMobilePhase23Workflow |
| Trạng thái | canonical |
| Domain | mobile-delivery |
| Luồng chuẩn | mobile-delivery |
| Frontend entry | public/mobile/js/delivery-mobile-view.source.js<br>public/mobile/js/delivery-mobile-view.js |
| API chính | GET /api/delivery/orders<br>POST /api/delivery/return<br>POST /api/delivery/payment<br>GET /api/delivery/reconciliation<br>GET /api/mobile/debts<br>POST /api/mobile/debt-collections |
| Service chính | src/routes/mobile/delivery.routes.js<br>src/routes/deliveryRoutes.js |
| Collections SSoT | salesOrders<br>returnOrders<br>debtCollections<br>arLedgers |
| Legacy/compatibility route | /api/mobile/delivery/* |
| Luồng cũ bị thay thế | legacy-delivery-report-tab<br>mobile-legacy-namespace |
| Forbidden source/behavior | deliveryReportSnapshot |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## deliveryTodayNewOrders

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | deliveryTodayNewOrders |
| Trạng thái | canonical |
| Domain | delivery-closeout |
| Luồng chuẩn | delivery-closeout |
| Frontend entry | public/js/app/new/91-delivery-today-new.js |
| API chính | GET /api/new/delivery-today/orders |
| Service chính | src/routes/newOperationsRoutes.js<br>src/services/deliveryTodayReadService.js |
| Collections SSoT | salesOrders<br>returnOrders<br>deliveryCloseoutVersions |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-web-delivery-today-alias |
| Forbidden source/behavior | master_orders.totalAmount<br>arLedgers as list SSoT<br>reporting_snapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## deliveryCloseout

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | deliveryCloseout |
| Trạng thái | canonical |
| Domain | delivery-closeout |
| Luồng chuẩn | delivery-closeout |
| Frontend entry | public/js/app/new/91-delivery-today-new.js |
| API chính | POST /api/new/delivery-today/closeout |
| Service chính | src/services/accounting/AccountingCloseoutService.js |
| Collections SSoT | salesOrders<br>returnOrders<br>arLedgers<br>fundLedgers<br>orderPaymentAllocations<br>readModelSyncJobs |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-web-delivery-today-alias |
| Forbidden source/behavior | master_orders.totalAmount<br>reporting_snapshots |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## deliveryAdjustment

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | deliveryAdjustment |
| Trạng thái | canonical |
| Domain | delivery-closeout |
| Luồng chuẩn | delivery-closeout |
| Frontend entry | public/js/app/new/91-delivery-today-new.js |
| API chính | POST /api/new/delivery-today/closeouts/:id/corrections<br>GET /api/new/delivery-today/adjustments/resolve |
| Service chính | src/services/deliveryCloseoutCorrection.service.js<br>src/services/deliveryAdjustmentResolver.service.js |
| Collections SSoT | deliveryCloseoutVersions<br>returnOrders<br>orderPaymentAllocations<br>arLedgers |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | DCOC/DCOA/DCOV as salesOrderCode |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## deliveryAdjustmentBulkCommit

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | deliveryAdjustmentBulkCommit |
| Trạng thái | canonical |
| Domain | delivery-closeout |
| Luồng chuẩn | delivery-closeout |
| Frontend entry | public/js/app/new/91-delivery-today-new.js |
| API chính | POST /api/new/delivery-today/adjustments/bulk-commit |
| Service chính | src/services/deliveryAdjustmentBulkCommit.service.js |
| Collections SSoT | deliveryCloseoutVersions<br>orderPaymentAllocations<br>arLedgers<br>readModelSyncJobs |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | per-order frontend replay API calls |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## debtNew

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | debtNew |
| Trạng thái | canonical |
| Domain | debt |
| Luồng chuẩn | debt |
| Frontend entry | public/js/app/new/92-debt-new.js |
| API chính | GET /api/new/debt/customers<br>GET /api/new/debt/customers/:customerCode/orders<br>POST /api/new/debt/manual |
| Service chính | src/services/DebtReadService.js<br>src/services/debtNewReadService.js |
| Collections SSoT | arLedgers<br>arDebtCustomers<br>arDebtOrders |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-web-debt-from-orders |
| Forbidden source/behavior | orders as debt SSoT<br>master_orders as debt SSoT<br>legacy AR categories in strict layer |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## mobileDebt

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | mobileDebt |
| Trạng thái | canonical |
| Domain | debt |
| Luồng chuẩn | debt |
| Frontend entry | public/mobile/js/delivery-mobile-view.source.js<br>public/mobile/js/sales.source/part-01.jsfrag |
| API chính | GET /api/mobile/debts<br>POST /api/mobile/debt-collections |
| Service chính | src/services/mobileDebtNewAdapter.service.js<br>src/routes/mobile/debts.routes.js |
| Collections SSoT | arLedgers<br>debtCollections |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-mobile-debt-from-orders |
| Forbidden source/behavior | DCOC/DCOA/DCOV as orderCode<br>orders as debt SSoT |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## debtCollectionSubmit

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | debtCollectionSubmit |
| Trạng thái | canonical |
| Domain | debt |
| Luồng chuẩn | debt |
| Frontend entry | public/js/app/new/92-debt-new.js<br>public/mobile/js/delivery-mobile-view.source.js |
| API chính | POST /api/mobile/debt-collections<br>POST /api/new/debt/collections |
| Service chính | src/services/DebtCollectionService.js |
| Collections SSoT | debtCollections<br>debtCollectionLocks |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | direct AR/Fund posting before accounting confirm |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## debtCollectionConfirm

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | debtCollectionConfirm |
| Trạng thái | canonical |
| Domain | debt |
| Luồng chuẩn | debt |
| Frontend entry | public/js/app/new/92-debt-new.js |
| API chính | POST /api/debt-collections/:id/confirm<br>POST /api/new/debt/collections/:id/confirm |
| Service chính | src/services/DebtCollectionService.js |
| Collections SSoT | debtCollections<br>arLedgers<br>fundLedgers<br>readModelSyncJobs |
| Legacy/compatibility route | /api/debt-collections |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | direct route-level AR posting |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## fundLedger

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | fundLedger |
| Trạng thái | canonical |
| Domain | fund |
| Luồng chuẩn | fund |
| Frontend entry | public/js/app/debt/07f-fund-ledger.js |
| API chính | GET /api/funds/ledger<br>GET /api/funds/summary<br>POST /api/funds/delivery-cash-submissions<br>POST /api/funds/expenses<br>POST /api/funds/transfers |
| Service chính | src/controllers/fundController.js<br>src/services/fundService.js |
| Collections SSoT | fundLedgers<br>deliveryCashSubmissions |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | cashbook/bankbook as canonical fund SSoT |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## returnOrders

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | returnOrders |
| Trạng thái | canonical |
| Domain | returns |
| Luồng chuẩn | returns |
| Frontend entry | public/js/app/debt/07b-return-orders.js |
| API chính | GET /api/return-orders<br>POST /api/return-orders<br>POST /api/return-orders/:id/cancel |
| Service chính | src/controllers/returnOrderController.js<br>src/services/returnOrderService.js |
| Collections SSoT | returnOrders |
| Legacy/compatibility route | /api/returns |
| Luồng cũ bị thay thế | master-return-orders-write-flow |
| Forbidden source/behavior | masterReturnOrders as operational return SSoT |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## warehouseReturnCheck

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | warehouseReturnCheck |
| Trạng thái | canonical |
| Domain | warehouse |
| Luồng chuẩn | warehouse |
| Frontend entry | public/mobile/warehouse.html<br>public/mobile/js/warehouse-return-check.js |
| API chính | GET /api/mobile/warehouse/return-checks<br>GET /api/mobile/warehouse/return-checks/:id<br>POST /api/mobile/warehouse/return-checks/:id/save<br>POST /api/mobile/warehouse/return-checks/:id/confirm |
| Service chính | src/routes/mobile/warehouse.routes.js<br>src/controllers/warehouseController.js |
| Collections SSoT | warehouseReturnChecks<br>returnOrders |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | mobile direct inventory posting |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## returnStockInAccounting

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | returnStockInAccounting |
| Trạng thái | canonical |
| Domain | returns |
| Luồng chuẩn | returns |
| Frontend entry | public/js/app/debt/07b-return-orders.js |
| API chính | POST /api/return-orders/:id/stock-in |
| Service chính | src/services/returnOrderStockIn.service.js<br>src/controllers/returnOrderController.js |
| Collections SSoT | returnOrders<br>inventories<br>stockTransactions |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | master-return-orders-receive-flow |
| Forbidden source/behavior | warehouse mobile direct stockTransactions |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## reportCenter

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | reportCenter |
| Trạng thái | canonical |
| Domain | reports |
| Luồng chuẩn | reports |
| Frontend entry | public/js/app/admin/08a-reports.js |
| API chính | GET /api/reports/*<br>POST /api/reports/export |
| Service chính | src/controllers/reportController.js<br>src/services/reportCenterService.js |
| Collections SSoT | arLedgers<br>salesOrders<br>returnOrders<br>fundLedgers<br>inventories |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | legacy-report-master-orders-totalAmount |
| Forbidden source/behavior | master_orders.totalAmount as sales/debt SSoT<br>legacy debt math |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## sseExportByDeliveryStaff

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | sseExportByDeliveryStaff |
| Trạng thái | canonical |
| Domain | export |
| Luồng chuẩn | export |
| Frontend entry | public/js/app/admin/08b-vat-export.js |
| API chính | GET /api/export/sse-invoice-orders.xlsx |
| Service chính | src/controllers/importExportController.js<br>src/services/sseExportService.js |
| Collections SSoT | salesOrders<br>returnOrders<br>products<br>customers<br>master_orders |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | sse-export-by-customer-store-flow |
| Forbidden source/behavior | store-scope-only grouping |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## vatExport

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | vatExport |
| Trạng thái | canonical |
| Domain | export |
| Luồng chuẩn | export |
| Frontend entry | public/js/app/admin/08b-vat-export.js |
| API chính | GET /api/export/* |
| Service chính | src/controllers/importExportController.js |
| Collections SSoT | salesOrders<br>returnOrders<br>products<br>customers |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | - |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## backup

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | backup |
| Trạng thái | canonical |
| Domain | system |
| Luồng chuẩn | system |
| Frontend entry | public/js/app/admin/12-system.js |
| API chính | POST /api/system/backup |
| Service chính | src/controllers/systemController.js<br>src/services/backupService.js |
| Collections SSoT | allCanonicalCollections |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | - |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## resetData

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | resetData |
| Trạng thái | canonical |
| Domain | system |
| Luồng chuẩn | system |
| Frontend entry | public/js/app/admin/12-system.js |
| API chính | POST /api/system/reset |
| Service chính | src/controllers/systemController.js |
| Collections SSoT | selectedOperationalCollections |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | production without explicit guard |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## enterpriseConsole

| Field | Nội dung |
|---|---|
| Tên nghiệp vụ | enterpriseConsole |
| Trạng thái | canonical |
| Domain | enterprise |
| Luồng chuẩn | enterprise |
| Frontend entry | public/enterprise.html |
| API chính | GET /api/enterprise/*<br>POST /api/enterprise/* |
| Service chính | src/controllers/enterpriseController.js |
| Collections SSoT | backgroundJobs<br>outbox<br>analyticsProjections |
| Legacy/compatibility route | - |
| Luồng cũ bị thay thế | - |
| Forbidden source/behavior | - |
| Test bảo vệ | canonical-flow, retired-flow, orphan-route, legacy-delegation static tests |

## Retired/Compatibility flow register

| Flow id | Status | Replacement | Reason |
|---|---|---|---|
| legacy-web-delivery-today-alias | retired | deliveryTodayNewOrders | Đơn giao hôm nay cũ đã thay bằng Đơn giao hôm nay (New). /api/delivery-today hiện trả 410 qua retiredRoute. |
| mobile-legacy-namespace | retired | deliveryMobilePhase23Workflow | Namespace /api/mobile-legacy đã ngừng; mobile hiện dùng /api/mobile và /api/delivery. |
| legacy-delivery-report-tab | retired | deliveryMobilePhase23Workflow | App giao hàng Phase23+ dùng workflow khách hàng, hàng giao, thu tiền, đối soát, công nợ; tab báo cáo cũ không còn là entry chuẩn. |
| legacy-web-debt-from-orders | retired | debtNew | Công nợ New đọc qua AR read boundary; không tính nợ từ orders/master_orders. |
| legacy-mobile-debt-from-orders | retired | mobileDebt | Mobile debt dùng DebtNew canonical adapter, không dùng DCOC/DCOA/DCOV làm salesOrderCode chính. |
| master-return-orders-write-flow | compatibility-quarantined | returnOrders | UI Đơn tổng trả hàng đã bỏ khỏi menu chính; operational return SSoT là returnOrders. Các write route master-return-orders phải bị chặn/retired hoặc giữ compatibility có kiểm soát. |
| master-return-orders-receive-flow | retired | returnStockInAccounting | Kế toán nhập kho từng returnOrder qua /api/return-orders/:id/stock-in; không nhập kho qua đơn tổng trả hàng. |
| worker-only-import-commit | retired | salesImportPreviewCommit | Hiện tại chọn web-direct import, worker không bắt buộc cho commit import. |
| sse-export-by-customer-store-flow | retired | sseExportByDeliveryStaff | Xuất SSE theo NVGH/gộp đơn tổng/trừ trả hàng, không xuất theo cửa hàng làm grouping chính. |
