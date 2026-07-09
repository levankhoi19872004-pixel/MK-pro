# MK-Pro Source Contract Audit

Phase: SOURCE CONTRACT AUDIT ONLY  
Date: 2026-07-09  
Scope: Node.js/Express/Mongoose/frontend JS trace from UI/API to service/model/collection.  
Guardrail: No source code changed, no refactor, no deletion, no Mongo index/drop, no migration.

## 1. Executive Summary

Audit đã trace các nhóm chính theo chuỗi UI -> frontend JS -> API -> route -> service/controller -> model/query -> collection đọc/ghi -> SSoT chuẩn.

Kết luận tổng quan:

- Runtime source contract nhìn chung đã đi đúng hướng SSoT cho các vùng trọng yếu: công nợ đọc/ghi qua `arLedgers`, quỹ qua `fundLedgers`, tồn kho qua `inventories`/`stockTransactions`, trả hàng qua `returnOrders`, delivery closeout qua `deliveryCloseoutVersions`/`orderPaymentAllocations`.
- Không phát hiện bằng chứng chắc chắn về màn hình production đang lấy `master_orders.totalAmount`, `products.stock`, `inventorySnapshots`, `salesOrders.debtAmount` hoặc `salesOrders.remainingDebt` làm SSoT chính.
- Có drift đáng kể ở tài liệu/registry cũ `config/canonical-flows.json` và `docs/CANONICAL_FLOW_MATRIX.md`: nhiều đường dẫn service/frontend/collection không còn khớp code hiện tại. Đây là lỗi source-governance, không nhất thiết là lỗi runtime.
- `npm test` không được chạy trong phase này vì `pretest`/test runner có cleanup và có thể sinh/xóa artifact, trái yêu cầu audit-only.

## 2. Check Scripts

| Command | Kết quả | Ghi chú |
|---|---:|---|
| `npm run check:syntax` | PASS | `SYNTAX_OK 1366 JavaScript files` |
| `npm run check:source-size` | PASS | `[source-size-budget] OK` |
| `npm run check:source-bundles` | PASS | `[source-bundles] OK 19 bundles` |
| `npm test` | NOT RUN | Bị skip có chủ đích: `pretest` chạy cleanup retired files và test suite có thể tạo/xóa artifact, không phù hợp "KHÔNG SỬA/KHÔNG XÓA" |

## 3. Tổng Số Theo Kết Luận

| Kết luận | Số dòng audit | Ý nghĩa |
|---|---:|---|
| PASS | 18 | Trace code cho thấy đúng SSoT chuẩn |
| PASS_WITH_CONCERN | 7 | Runtime có vẻ đúng nhưng có legacy/read-model/registry/export caveat |
| FAIL_WRONG_SOURCE | 5 | Sai ở source-contract registry/docs, cần sửa bản đồ hợp đồng nguồn |
| NEED_RUNTIME_EVIDENCE | 4 | Cần log production/network/API/Mongo profiler để kết luận chắc |

## 4. Source Contract Trace Table

| Module | Màn/Tab | Mục/Nút | Loại Read/Write | API | Service | Collection đọc | Collection ghi | SSoT chuẩn | Kết luận | Mức rủi ro | Cần sửa? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| App bán hàng | Mobile Sales | Tạo/sửa/xóa đơn | Write | `/api/mobile/sales/orders` | `src/routes/mobile/sales.routes.js` -> `controllers/mobile/sales.controller.js` -> `services/mobile/sales.service.js` | `products`, `customers`, `inventories`, `returnOrders`, `salesOrders` | `salesOrders`, `stockTransactions`, `inventories`, `MobileLog`; delete qua `SalesOrderDeletionService` | Đơn bán = `orders/salesOrders`; tồn = `inventories` + `stockTransactions` | PASS | Cao nếu sai nhưng trace đúng boundary | Không |
| App bán hàng | Mobile Sales | Tồn sản phẩm/catalog | Read | `/api/mobile/products`, `/api/mobile/stock`, `/api/catalog/products/search` | `services/mobile/catalog.service.js`, `inventoryStock.service` | `products`, `inventories` | Không ghi | Tồn thực tế = `inventories`; product chỉ master data | PASS | Trung bình | Không |
| App bán hàng | Mobile Sales | Tính khuyến mại | Read | `/api/promotions/calculate` | `promotionService.calculatePromotions` | `Promotion`, `PromotionProductRule`, `PromotionGroupItem`, `PromotionGroupRule`, `Product` | Không ghi | Promotion/Ontop = collections promotion riêng | PASS | Trung bình | Không |
| App giao hàng | Mobile Delivery | Danh sách đơn giao | Read | `/api/delivery/orders` | `services/mobile/delivery.service.js` + repository | `salesOrders`, `master_orders`, `returnOrders`, `arLedgers` | Không ghi | Đơn giao = `orders/salesOrders`; trả hàng = `returnOrders`; công nợ = `arLedgers` | PASS | Cao | Không |
| App giao hàng | Mobile Delivery | Xác nhận giao/thu tiền đơn | Write | `/api/delivery/confirm`, `/api/delivery/payment` | `DeliveryEngine`, `DeliverySettlementService`, `OrderPaymentAllocationService` | `salesOrders`, `returnOrders`, `arLedgers` | `salesOrders`, `orderPaymentAllocations`, `arLedgers`, `fundLedgers`, audit/mobile log | Thu tiền/AR = `orderPaymentAllocations` + `arLedgers` + `fundLedgers` | PASS | Cao | Không |
| App giao hàng | Mobile Delivery | Trả hàng khi giao | Write | `/api/delivery/return`, `/api/delivery/returns` | `DeliveryEngine`, `returnOrderService` | `salesOrders`, `returnOrders`, `stockTransactions` | `returnOrders`; stock-in theo lifecycle riêng | Trả hàng = `returnOrders`; tồn chỉ cộng khi confirm/stock-in đúng lifecycle | PASS | Cao | Không |
| App giao hàng | Mobile Debt | Gửi phiếu thu nợ chờ KT | Write | `/api/mobile/debt-collections` | `DebtCollectionService.submitDebtCollection` | `arLedgers`, `debtCollections` | `debtCollections`, `DebtCollectionLock` | Công nợ chính chưa giảm trước kế toán confirm | PASS | Cao | Không |
| Đơn bán hàng | Web Sales Orders | CRUD đơn bán | Read/Write | `/api/orders`, `/api/sales-orders` | `orderController` -> `orderService` -> `sales-order/*` | `salesOrders`, `products`, `customers` | `salesOrders`; posting tồn qua domain service khi cần | Đơn bán = `orders/salesOrders` | PASS | Cao | Không |
| Đơn bán hàng | Web Sales Orders | Xóa/hủy đơn | Write | `/api/orders/:id/delete`, `DELETE /api/orders/:id`, `/cancel` | `SalesOrderDeletionService`, `orderService` | `salesOrders`, `stockTransactions`, `arLedgers` | reverse/mark trên `salesOrders`, `stockTransactions`, event/audit | Xóa đơn đã post phải reverse stock/AR theo lifecycle | PASS_WITH_CONCERN | Cao; cần test dữ liệu đã post | Không trong audit; cần regression test |
| Đơn tổng | Web Master Orders | Tạo/cập nhật/gộp đơn | Read/Write | `/api/master-orders` | `masterOrderService`, `services/master-order/*` | `salesOrders`, `master_orders`, `returnOrders` | `master_orders`, child order links | `master_orders` là metadata/gom chuyến, không là nguồn tiền chính | PASS | Cao | Không |
| Đơn giao hôm nay New | Web New | Load danh sách giao | Read | `/api/new/delivery-today/orders` | `services/v2/deliveryTodayNew.service.js` | `SalesOrder`, `ReturnOrder`, `DeliveryCloseoutVersion`, `OrderPaymentAllocation` | Không ghi | `orders + returnOrders + deliveryCloseoutVersions + orderPaymentAllocations`; không lấy `master_orders.totalAmount` | PASS | Cao | Không |
| Đơn giao hôm nay New | Web New | Chốt sổ giao hàng | Write | `POST /api/new/delivery-today/closeout` | `AccountingCloseoutService`, `DeliveryAdjustmentCommitService`, `OrderPaymentAllocationService` | `salesOrders`, `returnOrders`, `deliveryCloseoutVersions`, `arLedgers` | `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers`, `fundLedgers` | Chốt/thu phải sinh ledger/allocation canonical | PASS | Cao | Không |
| Điều chỉnh đơn giao | Web New popup | Lưu correction | Write | `POST /api/new/delivery-today/closeouts/:id/corrections` | `deliveryCloseoutCorrection.service`, `DeliveryAdjustmentCommitService` | `salesOrders`, `returnOrders`, `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers` | `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers`, audit/read-model sync | Ảnh hưởng công nợ phải qua versions/allocation/AR | PASS | Cao | Không |
| Điều chỉnh đơn giao | Web New bulk | Bulk commit | Write | `POST /api/new/delivery-today/adjustments/bulk-commit` | `services/delivery/DeliveryAdjustmentBulkCommitService.js` | `deliveryCloseoutVersions`, `returnOrders`, `salesOrders` | `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers` | Bulk adjustment cùng contract với single correction | PASS | Cao | Không |
| Thu tiền | Web/Mobile | Phiếu thu công nợ confirm | Write | `/api/new/debt/collections/:id/confirm`, `/api/debt-collections/:id/confirm` | `DebtCollectionService.confirmDebtCollection` | `DebtCollection`, `arLedgers`, `DebtCollectionLock` | `arLedgers`, `fundLedgers`, `DebtCollection` status | Thu công nợ chỉ ảnh hưởng chính thức sau accounting confirm | PASS | Cao | Không |
| Công nợ khách hàng | Web Debt New | Danh sách/detail nợ | Read | `/api/new/debt/customers`, `/detail`, `/suggestions` | `services/v2/debtNew.service.js`, `arLedgerRead.service` | `arLedgers`, `debtCollections`, `orderPaymentAllocations` | Không ghi | AR SSoT = `arLedgers`; allocation chỉ enrich | PASS | Cao | Không |
| Công nợ khách hàng | Web Debt New | Manual debt posting | Write | `POST /api/new/debt/manual` | `manualDebtPostingService` | `arLedgers`, customer/order refs | `arLedgers` | Manual debt phải vào AR ledger domain | PASS | Cao | Không |
| Quỹ | Web Fund Ledger | Sổ quỹ/summary | Read | `/api/funds/ledger`, `/api/funds/summary`, `/api/reports/run/finance-*` | `fundService`, `fundSummary.service`, `FinanceReportService` | `fundLedgers` | Không ghi | Fund SSoT = `fundLedgers`; không lấy `cashbooks/bankbooks` làm chính | PASS | Cao | Không |
| Quỹ | Web Fund | Chi phí/chuyển quỹ/shortage repayment | Write | `/api/funds/expenses`, `/transfers`, `/delivery-shortage-repayments` | `fundService`, `FundPostingService` | `fundLedgers`, source docs | `fundLedgers`, source status docs | Fund movements phải sinh `fundLedgers` | PASS | Cao | Không |
| Tồn kho | Web Inventory | Tồn hiện tại/check | Read | `/api/inventory/current`, `/api/inventory/check` | `inventoryController` -> `inventoryStock.service` | `InventoryLegacy` model mapped to `inventories`, `products` | Không ghi | Current stock = `inventories`; movement = `stockTransactions` | PASS | Cao | Không |
| Tồn kho | Posting | Nhập/xuất/rebuild | Write | Domain/internal services | `inventoryService`, `InventoryPostingService` | `stockTransactions`, `inventories`, source docs | `stockTransactions`, `inventories` | Không dùng `inventorySnapshots` cho tồn thật | PASS | Cao | Không |
| Trả hàng | Web Return Orders | CRUD/stock-in/accounting confirm | Read/Write | `/api/return-orders`, `/api/returns` | `returnOrderController` -> `returnOrderService` -> `return-order/*` | `returnOrders`, `salesOrders`, `stockTransactions`, `arLedgers` | `returnOrders`, `stockTransactions`, `arLedgers` khi confirm | Return SSoT = `returnOrders`; AR return qua ledger service | PASS | Cao | Không |
| Import Excel/DMS | Import Excel | Preview/commit | Read/Write | `/api/excel-import/preview`, commit routes | `excelImportService`, `ImportHandlerRegistry`, `import/*` | `ImportSession`, `products`, `customers`, source Excel | target collections theo import type: `salesOrders`, `products`, `customers`, promotion collections, `arLedgers` for opening debt | Preview chưa ghi target; commit ghi đúng collection domain | PASS_WITH_CONCERN | Cao; import là vùng production | Cần runtime sample theo từng import type |
| Import Excel/DMS | Sales import DMS/Excel | Commit đơn bán | Write | import commit | `import/operations/salesImport.impl.js` | `products`, `customers`, `users`, `inventories` | `salesOrders`, `stockTransactions`, `inventories`, `ImportLog` | Đơn import = `salesOrders`; tồn xuất qua posting service | PASS | Cao | Không |
| Đối chiếu tồn DMS | Web DMS Inventory | Preview/commit/latest | Read/Write | `/api/dms-inventory/latest`, `/preview`, `/:id/commit` | `dmsInventoryReconciliation.service` | `DmsInventoryImport`, `DmsInventorySnapshot`, `InternalSaleAllocation`, live `inventories` | `DmsInventoryImport`, `DmsInventorySnapshot`, `InternalSaleAllocation` | DMS snapshot chỉ để đối chiếu/hạn mức; tồn thực tế vẫn live `inventories` | PASS_WITH_CONCERN | Trung bình-cao; tên snapshot dễ bị hiểu nhầm | Cần sửa registry/docs cũ |
| Khuyến mại/Ontop | Web Promotions | CRUD program/rule | Read/Write | `/api/promotions/*` | `promotionService` | `Promotion`, `PromotionProductRule`, `PromotionGroupItem`, `PromotionGroupRule`, `Product`, `Customer` | promotion collections | Promotion/Ontop ghi collection riêng, không tự tạo order/ledger | PASS | Trung bình | Không |
| Báo cáo doanh số | Report Center | Sales reports | Read/export | `/api/reports/catalog`, `/api/reports/run/*` | `ReportCenterService`, `SalesReportService`, `ReportSourceRegistry` | `orders/salesOrders`, `arLedgers`, `returnOrders`, `salesTargets` | Không ghi, trừ artifact export async nếu có | Sales KPI = orders confirmed + AR/returns canonical | PASS_WITH_CONCERN | Cao; report cần kiểm số | Cần đối soát sample với ledger |
| Báo cáo tồn kho | Report Center | Inventory reports | Read/export | `/api/reports/run/inventory-*`, `stock-card` | `InventoryReportService` | `inventories`, `stockTransactions` | Không ghi | Current = `inventories`; movement/card = `stockTransactions` | PASS | Cao | Không |
| Xuất Excel/SSE/VNPT | VAT/SSE export | Export invoice files | Read/export | `/api/export/invoice-orders.xlsx`, `/api/export/sse-invoice-orders.xlsx` | `sseInvoiceExport.service`, `invoiceExportQuery.service`, `VnptTt78TemplateExportService` | `salesOrders`, return data, customer/product/staff refs | Không ghi DB trong direct export; async job artifact có thể ghi artifact store | Export production chỉ đọc, amount phải recompute từ order/return/detail | PASS_WITH_CONCERN | Cao; external integration | Cần runtime evidence với file mẫu SSE/VNPT |
| Thông báo/audit log | Notification Center | Summary/list/read | Read/Write | `/api/notifications/*` | `notificationService`, `domainEventBus`, `auditEventService` | `notifications`, `auditEvents`, `users` | `notifications.readAt`, `auditEvents` on domain events | Audit/notification là nguồn riêng, không ghi ERP ledger | PASS | Trung bình | Không |
| Công cụ chấm DMS/chấm trưng bày | Display Check Manager | Plan/store/display check | Read/Write | `/api/tools/display-check/*` | `services/tools/displayCheck/displayCheck.service.js` | display check collections, products/customers if needed | display check collections only | Tool chỉ ghi collection riêng, không tạo orders/arLedgers/stockTransactions | PASS | Trung bình | Không |
| Công cụ chấm DMS | DMS Gap Simulator | Simulate/check | Read/Write? | `/api/tools/dms-gap-simulator/*` | `tools/dmsGapSimulator.service` | products/orders/import refs tùy mô phỏng | Không ghi ERP canonical | Tool mô phỏng không phải ERP posting flow | NEED_RUNTIME_EVIDENCE | Thấp-trung bình | Cần network/log nếu tool đang dùng production |
| Source contract registry | `config/canonical-flows.json` | `mobileSalesOrder` | Contract metadata | N/A | Registry trỏ `src/controllers/mobileController.js` | N/A | N/A | Runtime thật dùng modular `src/routes/mobile/sales.routes.js` + `controllers/mobile/sales.controller.js` + `services/mobile/sales.service.js` | FAIL_WRONG_SOURCE | Trung bình | Có, sửa docs/registry phase sau |
| Source contract registry | `config/canonical-flows.json` | `salesImportPreviewCommit` | Contract metadata | N/A | Registry trỏ `src/services/importService.js` và frontend `09-import.js` | N/A | N/A | Runtime thật dùng `excelImportService`, `src/services/import/*`, frontend `08d-import-excel*` | FAIL_WRONG_SOURCE | Trung bình | Có |
| Source contract registry | `config/canonical-flows.json` | `dmsInventoryComparison` | Contract metadata | N/A | Registry trỏ `dmsInventoryService.js`, collections `dmsInventoryComparisons/dmsInventoryQuotas` | N/A | N/A | Runtime thật dùng `dmsInventoryReconciliation.service`, `DmsInventoryImport`, `DmsInventorySnapshot`, `InternalSaleAllocation`, live `inventories` | FAIL_WRONG_SOURCE | Trung bình-cao | Có |
| Source contract registry | `config/canonical-flows.json` | `deliveryTodayNew/debtNew/mobileDebt` | Contract metadata | N/A | Registry trỏ service cũ/nonexistent: `deliveryTodayReadService`, `debtNewReadService`, `mobileDebtNewAdapter.service.js` top-level | N/A | N/A | Runtime thật dùng `services/v2/deliveryTodayNew.service.js`, `services/v2/debtNew.service.js`, `services/mobile/mobileDebtNewAdapter.service.js` | FAIL_WRONG_SOURCE | Trung bình | Có |
| Source contract registry | `config/canonical-flows.json` | `reportCenter/SSE export` | Contract metadata | N/A | Registry trỏ `reportCenterService.js`, `08b-vat-export.js` | N/A | N/A | Runtime thật dùng `services/reports/ReportCenterService.js`, `public/js/app/admin/08f-vat-export.js` | FAIL_WRONG_SOURCE | Trung bình | Có |
| External clients | API consumers ngoài web/mobile | Any undocumented API | Read/Write | Multiple mounted `/api/*` | Multiple | Multiple | Multiple | Không thể xác định chỉ bằng grep | NEED_RUNTIME_EVIDENCE | Cao | Cần access logs/API gateway logs |
| Production data quality | Ledger/idempotency integrity | Duplicate posting risk | Read check | N/A | `arPosting`, `OrderPaymentAllocationService`, `FundPostingService` | `arLedgers`, `fundLedgers`, `orderPaymentAllocations` | N/A | Code dùng idempotency key, nhưng cần Mongo index/data audit để chứng minh không có duplicate active ledger | NEED_RUNTIME_EVIDENCE | Cao | Cần audit Mongo |
| Runtime UI coverage | Tất cả tab/menu | Người dùng click thật | Read/Write | Multiple | Multiple | Multiple | Multiple | Static trace không thay thế browser/network evidence | NEED_RUNTIME_EVIDENCE | Trung bình | Cần Playwright/manual network trace |

## 5. Các Điểm PASS Quan Trọng

- Công nợ New đọc qua `services/v2/debtNew.service.js`, `arLedgerRead.service` và join `orderPaymentAllocations`; không thấy dùng field nợ snapshot trên `salesOrders` làm SSoT.
- Delivery Today New đọc `SalesOrder`, `ReturnOrder`, `DeliveryCloseoutVersion`, `OrderPaymentAllocation`; write closeout/correction đi qua service kế toán/adjustment.
- Tồn kho web đọc `inventoryStock.service`; model `InventoryLegacy` map collection `inventories`. `Inventory.js` mới là snapshot legacy và có comment deprecated.
- DMS inventory dùng `DmsInventorySnapshot` để lưu snapshot file DMS, nhưng khi load latest có comment và payload `inventorySource: inventories`, so sánh với live `inventories`.
- Tool display-check nằm dưới `/api/tools/display-check` và route index ghi chú out-of-flow, chỉ dùng collection riêng.

## 6. PASS_WITH_CONCERN

| Khu vực | Concern | Rủi ro | Khuyến nghị |
|---|---|---|---|
| Import Excel/DMS | Nhiều handler/flow; static trace chưa chứng minh mọi import type production | Sai mapping có thể ghi sai collection | Chạy bộ sample file từng type trong môi trường staging |
| SSE/VNPT export | Export là external integration; cần kiểm file thực tế và mapping lỗi | Sai invoice/return net amount | Chạy sample theo NVGH, VAT/non-VAT, return offset |
| Report Center | Registry report đúng hướng nhưng cần đối soát số liệu thực tế | Báo cáo doanh số/công nợ sai nếu data ledger thiếu | Reconcile report với `arLedgers`, `fundLedgers`, `stockTransactions` |
| Delete/cancel sales order | Code có domain deletion service, nhưng data đã post cần test lifecycle | Double reverse hoặc thiếu reverse | Test xóa đơn đã post tồn/AR, đơn chưa post, đơn đã closeout |
| DMS inventory | Snapshot DMS đúng mục đích nhưng tên registry/docs cũ gây hiểu nhầm | Người vận hành hiểu nhầm snapshot là tồn thật | Sửa contract docs và UI source note nếu cần |

## 7. FAIL_WRONG_SOURCE: Contract Registry/Docs Drift

Đây là lỗi bản đồ nguồn dữ liệu, không phải bằng chứng runtime đang ghi sai DB.

| File | Entry | Bằng chứng | Khuyến nghị |
|---|---|---|---|
| `config/canonical-flows.json` | `mobileSalesOrder` | Trỏ `src/controllers/mobileController.js`; runtime hiện dùng modular mobile sales route/controller/service | Cập nhật service path |
| `config/canonical-flows.json` | `salesImportPreviewCommit` | Trỏ `src/services/importService.js`, frontend `09-import.js`; runtime dùng `excelImportService`, `src/services/import/*`, `08d-import-excel*` | Cập nhật route/service/frontend |
| `config/canonical-flows.json` | `dmsInventoryComparison` | Trỏ service/collection cũ `dmsInventoryService`, `dmsInventoryComparisons`, `dmsInventoryQuotas`; runtime dùng import/snapshot/allocation collections | Cập nhật SSoT mô tả |
| `config/canonical-flows.json` | `deliveryTodayNew`, `debtNew`, `mobileDebt` | Trỏ service cũ/nonexistent hoặc sai folder | Cập nhật path đúng |
| `docs/CANONICAL_FLOW_MATRIX.md` | Report/SSE/import entries | Có `08b-vat-export.js`, `reportCenterService.js`, `importService.js` cũ | Regenerate docs từ registry/runtime |

## 8. NEED_RUNTIME_EVIDENCE

| Hạng mục | Evidence cần có | Lý do |
|---|---|---|
| External API consumers | Nginx/API access log 30-90 ngày, mobile app version logs | Static grep không biết client bên ngoài có gọi API cũ không |
| Ledger duplicate/idempotency | Mongo query kiểm duplicate active `arLedgers.idempotencyKey`, `fundLedgers.idempotencyKey`, `orderPaymentAllocations.idempotencyKey` | Code có guard nhưng cần dữ liệu thật để xác nhận |
| Full UI network trace | Browser network trace từng tab/menu/nút trong staging | Static trace không chứng minh mọi tab đã load đúng nhánh runtime |
| Report/export correctness | File export mẫu và đối soát tổng với ledger | Report/export là vùng production/high-stakes |

## 9. API Cleanup / Source Contract Map

| API | Route file | Frontend call | Service | Collection chính | Kết luận |
|---|---|---|---|---|---|
| `/api/new/delivery-today/orders` | `src/routes/newOperationsRoutes.js` | `public/js/app/new/91-delivery-today-new.js` | `deliveryTodayNew.service.js` | `salesOrders`, `returnOrders`, `deliveryCloseoutVersions`, `orderPaymentAllocations` | PASS |
| `/api/new/delivery-today/closeout` | `src/routes/newOperationsRoutes.js` | `91-delivery-today-new.js` | `AccountingCloseoutService` | `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers`, `fundLedgers` | PASS |
| `/api/new/debt/customers` | `src/routes/newOperationsRoutes.js` | `public/js/app/new/92-debt-new.js` | `debtNew.service.js` | `arLedgers`, `debtCollections`, `orderPaymentAllocations` | PASS |
| `/api/new/debt/collections` | `src/routes/newOperationsRoutes.js` | `92-debt-new.js`, mobile debt UI | `DebtCollectionService` | `debtCollections`, `arLedgers`, `fundLedgers` | PASS |
| `/api/inventory/current` | `src/routes/inventoryRoutes.js` | dashboard/inventory/report UI | `inventoryStock.service` | `inventories` | PASS |
| `/api/dms-inventory/*` | `src/routes/dmsInventoryRoutes.js` | `public/js/app/10-dms-inventory.js` | `dmsInventoryReconciliation.service` | `dmsInventoryImports`, `dmsInventorySnapshots`, `internalSaleAllocations`, `inventories` | PASS_WITH_CONCERN |
| `/api/export/sse-invoice-orders.xlsx` | `src/routes/importExportRoutes.js` | `public/js/app/admin/08f-vat-export.js` | `sseInvoiceExport.service` | `salesOrders` + return/order detail refs | PASS_WITH_CONCERN |
| `/api/tools/display-check/*` | `src/routes/index.js` mounted tools | `public/js/app/tools/display-check-manager.js` | `displayCheck.service.js` | display check collections | PASS |

## 10. UI Cleanup / Source Contract Map

| UI/Tab | Fragment/JS | API | Trạng thái | Khuyến nghị |
|---|---|---|---|---|
| Đơn giao hôm nay New | `public/js/app/new/91-delivery-today-new.js` | `/api/new/delivery-today/*` | PASS | Giữ; production-critical |
| Công nợ New | `public/js/app/new/92-debt-new.js` | `/api/new/debt/*`, `/api/search/*` | PASS | Giữ; production-critical |
| Tồn kho & DMS | `public/js/app/10-dms-inventory.js` | `/api/dms-inventory/*`, `/api/inventory/*` | PASS_WITH_CONCERN | Sửa docs/source note nếu cần để tránh hiểu DMS snapshot là tồn thật |
| Report Center | `public/js/app/admin/08a-reports.js` | `/api/reports/*` | PASS_WITH_CONCERN | Đối soát số liệu mẫu |
| VAT/SSE export | `public/js/app/admin/08f-vat-export.js` | `/api/export/*`, `/api/background-jobs/*` | PASS_WITH_CONCERN | Cần file mẫu integration |
| Promotion Programs | `public/js/app/admin/08e-promotion-programs.js` | `/api/promotions/*` | PASS | Giữ |
| Display Check Manager | `public/js/app/tools/display-check-manager.js` | `/api/tools/display-check/*` | PASS | Giữ out-of-flow |

## 11. Service/Model Cleanup Map Theo SSoT

| Service/Model | Vai trò SSoT | Kết luận | Ghi chú |
|---|---|---|---|
| `arLedgerRead.service`, `arPosting.service`, `domain/posting/ArPostingService` | AR/công nợ | PASS | Boundary đúng cho debt read/write |
| `fundService`, `domain/posting/FundPostingService` | Quỹ | PASS | `cashbook/bankbook` không là SSoT chính cho fund report |
| `inventoryStock.service`, `inventoryService`, `InventoryLegacy` | Tồn hiện tại/posting | PASS | `InventoryLegacy` map `inventories`; tên legacy gây nhầm nhưng comment rõ |
| `Inventory.js` | Snapshot legacy | PASS_WITH_CONCERN | Không thấy dùng làm nguồn tồn thật trong trace chính |
| `ReturnOrder*`, `return-order/*` | Trả hàng | PASS | Return SSoT đúng |
| `DeliveryCloseoutVersion`, `OrderPaymentAllocation` | Closeout/payment allocation | PASS | Đúng cho adjustment/closeout |
| `SourceContractRegistry`, `ReportSourceRegistry` | Runtime source notes/report registry | PASS_WITH_CONCERN | Đúng hướng nhưng chưa bao phủ hết flow trong `canonical-flows.json` |
| `config/canonical-flows.json` | Canonical docs/contract registry cũ | FAIL_WRONG_SOURCE | Cần cập nhật sau audit |

## 12. Đề Xuất Phase Tiếp Theo

1. Phase A - Contract registry repair: chỉ cập nhật `config/canonical-flows.json` và docs canonical để khớp runtime hiện tại.
2. Phase B - Runtime evidence capture: chạy staging với Playwright/network trace cho từng tab/nút production-critical.
3. Phase C - Ledger data audit: query duplicate/idempotency và đối soát AR/Fund/Inventory trên Mongo production snapshot read-only.
4. Phase D - Export/report reconciliation: dùng bộ đơn mẫu có trả hàng, thu thiếu, closeout correction, VAT/SSE để đối soát file export.
5. Phase E - Cleanup candidates: chỉ sau khi có runtime logs chứng minh API/tab cũ không còn traffic.

## 13. Test Bắt Buộc Trước/Sau Khi Sửa Contract Hoặc Cleanup

| Nhóm | Test bắt buộc |
|---|---|
| Syntax/source | `npm run check:syntax`, `npm run check:source-size`, `npm run check:source-bundles` |
| Sales order | Create/update/delete order; delete posted order reverses stock; no double posting |
| Mobile sales | Create order offline/online; idempotency client request; inventory deduction |
| Mobile delivery | Return partial/full, save payment, confirm delivery, debt tab submit |
| Delivery New | Load list, closeout, correction, bulk commit, versions/history |
| Debt New | Customer debt list/detail, manual debt, debt collection submit/confirm/reject |
| Return orders | Create/update, stock-in, accounting confirm, AR-RETURN idempotency |
| Fund | Expense, transfer, delivery cash submission, shortage repayment |
| Inventory | Current stock, stock card, movement report, DMS latest compare |
| Import | Product/customer/order/opening stock/opening debt/promotion import with valid and invalid rows |
| Reports | Sales/debt/fund/inventory/return report vs ledger totals |
| Export | VAT, non-VAT, SSE by NVGH, VNPT TT78 template |
| Notifications | Domain event creates audit event + notification; read/read-all |

## 14. Final Audit Position

Không đề xuất sửa code trong phase này. Các lỗi chắc chắn hiện tại nằm ở lớp source-contract registry/docs drift, không phải bằng chứng trực tiếp về runtime đang ghi sai SSoT. Các vùng kế toán/tồn kho/công nợ/delivery/mobile vẫn phải được coi là DANGEROUS_DO_NOT_DELETE trong mọi cleanup phase cho đến khi có runtime evidence và test regression đầy đủ.
