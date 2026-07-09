# RUNTIME_FLOW_VERIFICATION_PLAN

Phase221: kế hoạch xác minh runtime bằng Network/API/log. Không dùng file này để kết luận sạch tuyệt đối nếu chưa chạy app với `FLOW_VERIFY_MODE=1` và có evidence thực tế.

## Điều kiện chung

- Chạy `FLOW_VERIFY_MODE=1 npm start`.
- Mở DevTools Network hoặc thu log `runtime-flow`.
- Mỗi nút command P0/P1 phải có actual API evidence.
- Không chấp nhận endpoint retired/orphan trong Network.

## authAndRole

Luồng runtime #1: **Đăng nhập / phân quyền**

| Field | Nội dung |
|---|---|
| Tên luồng | Đăng nhập / phân quyền |
| Role cần test | admin/accountant/sales/delivery/warehouse |
| URL/màn hình | /login.html, /mobile/*.html |
| Frontend entry | `public/login.html, public/index.html, public/mobile/sales.html, public/mobile/delivery.html, public/mobile/warehouse.html` |
| Nút/thao tác | Đăng nhập, kiểm tra phiên |
| Expected API chính | `POST /api/auth/login, GET /api/auth/me` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; không có forbidden source riêng |
| Expected write collections | `users, roles` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## productCatalog

Luồng runtime #2: **Sản phẩm**

| Field | Nội dung |
|---|---|
| Tên luồng | Sản phẩm |
| Role cần test | admin/accountant |
| URL/màn hình | Sản phẩm |
| Frontend entry | `public/js/app/02-products.js` |
| Nút/thao tác | Tải danh sách, tìm kiếm, tạo/sửa sản phẩm |
| Expected API chính | `GET /api/products, POST /api/products, PUT /api/products/:id, PATCH /api/products/:id` |
| API phụ được phép | `GET /api/mobile-sales/products` |
| API bị cấm | endpoint retired/orphan; inventorySnapshots |
| Expected write collections | `products` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## customerCatalog

Luồng runtime #3: **Khách hàng**

| Field | Nội dung |
|---|---|
| Tên luồng | Khách hàng |
| Role cần test | admin/accountant/sales |
| URL/màn hình | Khách hàng |
| Frontend entry | `public/js/app/03-customers-autocomplete.js` |
| Nút/thao tác | Tải danh sách, tìm kiếm, tạo/sửa khách |
| Expected API chính | `GET /api/customers, POST /api/customers, PUT /api/customers/:id` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; không có forbidden source riêng |
| Expected write collections | `customers` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## webSalesOrder

Luồng runtime #4: **Bán hàng web**

| Field | Nội dung |
|---|---|
| Tên luồng | Bán hàng web |
| Role cần test | admin/accountant |
| URL/màn hình | Bán hàng |
| Frontend entry | `public/js/app/05-sales-orders.js` |
| Nút/thao tác | Tạo đơn, xem đơn, xóa/hủy nếu được phép |
| Expected API chính | `GET /api/sales-orders, POST /api/sales-orders, GET /api/sales-orders/:id, DELETE /api/sales-orders/:id` |
| API phụ được phép | `/api/orders` |
| API bị cấm | endpoint retired/orphan; inventorySnapshots |
| Expected write collections | `salesOrders, inventories, stockTransactions` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## mobileSalesOrder

Luồng runtime #5: **Bán hàng app**

| Field | Nội dung |
|---|---|
| Tên luồng | Bán hàng app |
| Role cần test | sales |
| URL/màn hình | /mobile/sales.html |
| Frontend entry | `public/mobile/js/sales.source/part-01.jsfrag` |
| Nút/thao tác | Chọn KH, thêm SP, xác nhận đơn |
| Expected API chính | `GET /api/mobile/customers, GET /api/mobile/products, GET /api/mobile/sales/orders, POST /api/mobile/sales/orders` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; inventorySnapshots, reporting_snapshots |
| Expected write collections | `salesOrders, customers, products, inventories` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## salesImportPreviewCommit

Luồng runtime #6: **Import Excel preview/commit**

| Field | Nội dung |
|---|---|
| Tên luồng | Import Excel preview/commit |
| Role cần test | admin/accountant |
| URL/màn hình | Import dữ liệu Excel |
| Frontend entry | `public/js/app/admin/09-import.js` |
| Nút/thao tác | Dán Excel, preview, commit selected |
| Expected API chính | `POST /api/import/preview, POST /api/import/commit, GET /api/import/sessions/:id` |
| API phụ được phép | `/api/excel/*` |
| API bị cấm | endpoint retired/orphan; snapshotImports |
| Expected write collections | `import_sessions, salesOrders, inventories, stockTransactions` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## dmsInventoryComparison

Luồng runtime #7: **DMS tồn kho preview/commit**

| Field | Nội dung |
|---|---|
| Tên luồng | DMS tồn kho preview/commit |
| Role cần test | admin/accountant |
| URL/màn hình | Tồn kho / Đối chiếu DMS |
| Frontend entry | `public/js/app/10-dms-inventory.js` |
| Nút/thao tác | Upload DMS, preview, commit hạn mức |
| Expected API chính | `GET /api/dms-inventory/latest, GET /api/dms-inventory/history, POST /api/dms-inventory/preview, POST /api/dms-inventory/:id/commit` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; inventorySnapshots |
| Expected write collections | `dmsInventoryComparisons, dmsInventoryQuotas, inventories` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## dmsGapSimulator

Luồng runtime #8: **Sinh đơn chấm DMS**

| Field | Nội dung |
|---|---|
| Tên luồng | Sinh đơn chấm DMS |
| Role cần test | admin/manager |
| URL/màn hình | Sinh đơn chấm DMS |
| Frontend entry | `public/js/app/tools/dms-gap-simulator.js` |
| Nút/thao tác | Preview/export đơn tham khảo |
| Expected API chính | `POST /api/tools/dms-gap-simulator/preview, POST /api/tools/dms-gap-simulator/export` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; staleUploadOnlyProductSource |
| Expected write collections | `products, customers, promotions, dmsInventoryComparisons` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## displayCheckManager

Luồng runtime #9: **Display Check Manager**

| Field | Nội dung |
|---|---|
| Tên luồng | Display Check Manager |
| Role cần test | admin/manager |
| URL/màn hình | Quản lý chấm Trưng bày |
| Frontend entry | `public/js/app/tools/display-check-manager.js` |
| Nút/thao tác | Cài đặt, sinh đơn, xác nhận chấm |
| Expected API chính | `GET /api/tools/display-check/*, POST /api/tools/display-check/*` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; staleDailyState |
| Expected write collections | `displayCheckGroups, displayCheckStores, displayCheckRuns` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## masterOrder

Luồng runtime #10: **Đơn tổng**

| Field | Nội dung |
|---|---|
| Tên luồng | Đơn tổng |
| Role cần test | admin/accountant |
| URL/màn hình | Đơn tổng |
| Frontend entry | `public/js/app/06-master-delivery.js` |
| Nút/thao tác | Tạo/gộp/in/xuất đơn tổng |
| Expected API chính | `GET /api/master-orders, POST /api/master-orders, POST /api/print/master-orders/batch` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; master_orders.totalAmount as delivery-today SSoT |
| Expected write collections | `master_orders, salesOrders` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## deliveryMobilePhase23Workflow

Luồng runtime #11: **App giao hàng Phase23+**

| Field | Nội dung |
|---|---|
| Tên luồng | App giao hàng Phase23+ |
| Role cần test | delivery |
| URL/màn hình | /mobile/delivery.html |
| Frontend entry | `public/mobile/js/delivery-mobile-view.source.js, public/mobile/js/delivery-mobile-view.js` |
| Nút/thao tác | Danh sách khách, hàng giao, thu tiền, đối soát, công nợ |
| Expected API chính | `GET /api/delivery/orders, POST /api/delivery/return, POST /api/delivery/payment, GET /api/delivery/reconciliation, GET /api/mobile/debts, POST /api/mobile/debt-collections` |
| API phụ được phép | `/api/mobile/delivery/*` |
| API bị cấm | endpoint retired/orphan; deliveryReportSnapshot |
| Expected write collections | `salesOrders, returnOrders, debtCollections, arLedgers` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## deliveryTodayNewOrders

Luồng runtime #12: **Đơn giao hôm nay New - tải đơn**

| Field | Nội dung |
|---|---|
| Tên luồng | Đơn giao hôm nay New - tải đơn |
| Role cần test | admin/accountant |
| URL/màn hình | Đơn giao hôm nay New |
| Frontend entry | `public/js/app/new/91-delivery-today-new.js` |
| Nút/thao tác | Tải đơn, lọc NVGH/NVBH |
| Expected API chính | `GET /api/new/delivery-today/orders` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; master_orders.totalAmount, arLedgers as list SSoT, reporting_snapshots |
| Expected write collections | `salesOrders, returnOrders, deliveryCloseoutVersions` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## deliveryCloseout

Luồng runtime #13: **Chốt sổ giao hàng**

| Field | Nội dung |
|---|---|
| Tên luồng | Chốt sổ giao hàng |
| Role cần test | admin/accountant |
| URL/màn hình | Đơn giao hôm nay New |
| Frontend entry | `public/js/app/new/91-delivery-today-new.js` |
| Nút/thao tác | Chốt sổ giao hàng |
| Expected API chính | `POST /api/new/delivery-today/closeout` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; master_orders.totalAmount, reporting_snapshots |
| Expected write collections | `salesOrders, returnOrders, arLedgers, fundLedgers, orderPaymentAllocations, readModelSyncJobs` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## deliveryAdjustment

Luồng runtime #14: **Lưu điều chỉnh đơn giao**

| Field | Nội dung |
|---|---|
| Tên luồng | Lưu điều chỉnh đơn giao |
| Role cần test | admin/accountant |
| URL/màn hình | Đơn giao hôm nay New / Điều chỉnh |
| Frontend entry | `public/js/app/new/91-delivery-today-new.js` |
| Nút/thao tác | Lưu điều chỉnh |
| Expected API chính | `POST /api/new/delivery-today/closeouts/:id/corrections, GET /api/new/delivery-today/adjustments/resolve` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; DCOC/DCOA/DCOV as salesOrderCode |
| Expected write collections | `deliveryCloseoutVersions, returnOrders, orderPaymentAllocations, arLedgers` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## deliveryAdjustmentBulkCommit

Luồng runtime #15: **Ghi nhận điều chỉnh đã chọn**

| Field | Nội dung |
|---|---|
| Tên luồng | Ghi nhận điều chỉnh đã chọn |
| Role cần test | admin/accountant |
| URL/màn hình | Đơn giao hôm nay New |
| Frontend entry | `public/js/app/new/91-delivery-today-new.js` |
| Nút/thao tác | Bulk commit adjustment |
| Expected API chính | `POST /api/new/delivery-today/adjustments/bulk-commit` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; per-order frontend replay API calls |
| Expected write collections | `deliveryCloseoutVersions, orderPaymentAllocations, arLedgers, readModelSyncJobs` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## debtNew

Luồng runtime #16: **Công nợ New**

| Field | Nội dung |
|---|---|
| Tên luồng | Công nợ New |
| Role cần test | admin/accountant |
| URL/màn hình | Công nợ New |
| Frontend entry | `public/js/app/new/92-debt-new.js` |
| Nút/thao tác | Tải công nợ, lập phiếu thu |
| Expected API chính | `GET /api/new/debt/customers, GET /api/new/debt/customers/:customerCode/orders, POST /api/new/debt/manual` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; orders as debt SSoT, master_orders as debt SSoT, legacy AR categories in strict layer |
| Expected write collections | `arLedgers, arDebtCustomers, arDebtOrders` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## mobileDebt

Luồng runtime #17: **Mobile debt**

| Field | Nội dung |
|---|---|
| Tên luồng | Mobile debt |
| Role cần test | delivery/sales |
| URL/màn hình | App giao hàng/bán hàng mobile |
| Frontend entry | `public/mobile/js/delivery-mobile-view.source.js, public/mobile/js/sales.source/part-01.jsfrag` |
| Nút/thao tác | Mở công nợ, gửi phiếu thu chờ KT |
| Expected API chính | `GET /api/mobile/debts, POST /api/mobile/debt-collections` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; DCOC/DCOA/DCOV as orderCode, orders as debt SSoT |
| Expected write collections | `arLedgers, debtCollections` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## debtCollectionSubmit

Luồng runtime #18: **Lập phiếu thu chờ KT**

| Field | Nội dung |
|---|---|
| Tên luồng | Lập phiếu thu chờ KT |
| Role cần test | delivery/sales/accountant |
| URL/màn hình | Công nợ/Mobile debt |
| Frontend entry | `public/js/app/new/92-debt-new.js, public/mobile/js/delivery-mobile-view.source.js` |
| Nút/thao tác | Submit phiếu thu pending |
| Expected API chính | `POST /api/mobile/debt-collections, POST /api/new/debt/collections` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; direct AR/Fund posting before accounting confirm |
| Expected write collections | `debtCollections, debtCollectionLocks` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## debtCollectionConfirm

Luồng runtime #19: **Kế toán xác nhận phiếu thu**

| Field | Nội dung |
|---|---|
| Tên luồng | Kế toán xác nhận phiếu thu |
| Role cần test | accountant/admin |
| URL/màn hình | Thu nợ chờ xác nhận |
| Frontend entry | `public/js/app/new/92-debt-new.js` |
| Nút/thao tác | Xác nhận/từ chối phiếu thu |
| Expected API chính | `POST /api/debt-collections/:id/confirm, POST /api/new/debt/collections/:id/confirm` |
| API phụ được phép | `/api/debt-collections` |
| API bị cấm | endpoint retired/orphan; direct route-level AR posting |
| Expected write collections | `debtCollections, arLedgers, fundLedgers, readModelSyncJobs` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## fundLedger

Luồng runtime #20: **Quỹ tiền**

| Field | Nội dung |
|---|---|
| Tên luồng | Quỹ tiền |
| Role cần test | accountant/admin |
| URL/màn hình | Quỹ tiền |
| Frontend entry | `public/js/app/debt/07f-fund-ledger.js` |
| Nút/thao tác | Tải sổ quỹ, nộp quỹ, phiếu chi, chuyển quỹ |
| Expected API chính | `GET /api/funds/ledger, GET /api/funds/summary, POST /api/funds/delivery-cash-submissions, POST /api/funds/expenses, POST /api/funds/transfers` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; cashbook/bankbook as canonical fund SSoT |
| Expected write collections | `fundLedgers, deliveryCashSubmissions` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## returnOrders

Luồng runtime #21: **Đơn trả hàng**

| Field | Nội dung |
|---|---|
| Tên luồng | Đơn trả hàng |
| Role cần test | accountant/admin |
| URL/màn hình | Đơn trả hàng |
| Frontend entry | `public/js/app/debt/07b-return-orders.js` |
| Nút/thao tác | Tải list, xem chi tiết, hủy nếu được phép |
| Expected API chính | `GET /api/return-orders, POST /api/return-orders, POST /api/return-orders/:id/cancel` |
| API phụ được phép | `/api/returns` |
| API bị cấm | endpoint retired/orphan; masterReturnOrders as operational return SSoT |
| Expected write collections | `returnOrders` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## warehouseReturnCheck

Luồng runtime #22: **App thủ kho xác nhận hàng trả**

| Field | Nội dung |
|---|---|
| Tên luồng | App thủ kho xác nhận hàng trả |
| Role cần test | warehouse |
| URL/màn hình | /mobile/warehouse.html |
| Frontend entry | `public/mobile/warehouse.html, public/mobile/js/warehouse-return-check.js` |
| Nút/thao tác | Mở danh sách, lưu nháp, xác nhận hàng trả |
| Expected API chính | `GET /api/mobile/warehouse/return-checks, GET /api/mobile/warehouse/return-checks/:id, POST /api/mobile/warehouse/return-checks/:id/save, POST /api/mobile/warehouse/return-checks/:id/confirm` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; mobile direct inventory posting |
| Expected write collections | `warehouseReturnChecks, returnOrders` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## returnStockInAccounting

Luồng runtime #23: **Kế toán nhập kho hàng trả**

| Field | Nội dung |
|---|---|
| Tên luồng | Kế toán nhập kho hàng trả |
| Role cần test | accountant/admin |
| URL/màn hình | Đơn trả hàng |
| Frontend entry | `public/js/app/debt/07b-return-orders.js` |
| Nút/thao tác | Bấm Nhập kho từng đơn trả |
| Expected API chính | `POST /api/return-orders/:id/stock-in` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; warehouse mobile direct stockTransactions |
| Expected write collections | `returnOrders, inventories, stockTransactions` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## reportCenter

Luồng runtime #24: **Báo cáo**

| Field | Nội dung |
|---|---|
| Tên luồng | Báo cáo |
| Role cần test | admin/accountant/manager |
| URL/màn hình | Báo cáo |
| Frontend entry | `public/js/app/admin/08a-reports.js` |
| Nút/thao tác | Chạy preview/list báo cáo |
| Expected API chính | `GET /api/reports/*, POST /api/reports/export` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; master_orders.totalAmount as sales/debt SSoT, legacy debt math |
| Expected write collections | `arLedgers, salesOrders, returnOrders, fundLedgers, inventories` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## vatExport

Luồng runtime #25: **Xuất hóa đơn VAT/non-VAT**

| Field | Nội dung |
|---|---|
| Tên luồng | Xuất hóa đơn VAT/non-VAT |
| Role cần test | accountant/admin |
| URL/màn hình | Xuất hóa đơn |
| Frontend entry | `public/js/app/admin/08b-vat-export.js` |
| Nút/thao tác | Xuất VAT/non-VAT |
| Expected API chính | `GET /api/export/*` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; không có forbidden source riêng |
| Expected write collections | `salesOrders, returnOrders, products, customers` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## sseExportByDeliveryStaff

Luồng runtime #26: **Xuất Excel SSE theo NVGH**

| Field | Nội dung |
|---|---|
| Tên luồng | Xuất Excel SSE theo NVGH |
| Role cần test | accountant/admin |
| URL/màn hình | Xuất hóa đơn / SSE |
| Frontend entry | `public/js/app/admin/08b-vat-export.js` |
| Nút/thao tác | Xuất Excel SSE |
| Expected API chính | `GET /api/export/sse-invoice-orders.xlsx` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; store-scope-only grouping |
| Expected write collections | `salesOrders, returnOrders, products, customers, master_orders` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## backup

Luồng runtime #27: **Backup**

| Field | Nội dung |
|---|---|
| Tên luồng | Backup |
| Role cần test | admin |
| URL/màn hình | Hệ thống |
| Frontend entry | `public/js/app/admin/12-system.js` |
| Nút/thao tác | Tạo backup |
| Expected API chính | `POST /api/system/backup` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; không có forbidden source riêng |
| Expected write collections | `allCanonicalCollections` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## resetData

Luồng runtime #28: **Reset dữ liệu**

| Field | Nội dung |
|---|---|
| Tên luồng | Reset dữ liệu |
| Role cần test | admin |
| URL/màn hình | Hệ thống |
| Frontend entry | `public/js/app/admin/12-system.js` |
| Nút/thao tác | Reset dữ liệu có guard |
| Expected API chính | `POST /api/system/reset` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; production without explicit guard |
| Expected write collections | `selectedOperationalCollections` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

## enterpriseConsole

Luồng runtime #29: **Enterprise console**

| Field | Nội dung |
|---|---|
| Tên luồng | Enterprise console |
| Role cần test | admin |
| URL/màn hình | Enterprise console |
| Frontend entry | `public/enterprise.html` |
| Nút/thao tác | Mở console, queue/outbox/analytics |
| Expected API chính | `GET /api/enterprise/*, POST /api/enterprise/*` |
| API phụ được phép | `Không` |
| API bị cấm | endpoint retired/orphan; không có forbidden source riêng |
| Expected write collections | `backgroundJobs, outbox, analyticsProjections` nếu là command; GET/list không được ghi DB |
| Forbidden write collections | collection ngoài SSoT/side-effect contract, legacy snapshot/reporting source |
| Expected response | `ok/success=true`, HTTP 2xx hoặc 4xx nghiệp vụ rõ; không 500/stub 501 |
| Expected UI update | Patch đúng vùng/dòng/tab liên quan; không reload/cascade ngoài contract |
| Network evidence cần chụp | method, path, status, duration, requestId; không chứa token/password |
| Log evidence cần chụp | log `runtime-flow` khi `FLOW_VERIFY_MODE=1` |
| Kết quả runtime | Chưa xác minh thủ công trong source package; cần cập nhật sau khi chạy local/staging |

