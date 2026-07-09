# Phase216 Read Request Budget Matrix

Mục tiêu: mọi màn đọc/lọc/tải dữ liệu phải có ngân sách request rõ ràng để tránh một lần bấm `Tải lại` / `Tìm kiếm` / `Xóa lọc` sinh nhiều API phụ hoặc render dữ liệu cũ đè dữ liệu mới.

## Quy tắc chung

| Quy tắc | Chuẩn áp dụng |
|---|---|
| Open screen | Chỉ tải tab/màn đang active; tab nặng lazy-load lần đầu khi người dùng mở. |
| Tải lại | 1 request list chính, không cascade API phụ nếu response chính đủ dữ liệu. |
| Tìm kiếm | 1 request sau debounce hoặc submit; request cũ phải bị abort hoặc bị request-sequence guard loại bỏ. |
| Xóa lọc | Reset state rồi gọi đúng 1 request list. Không dispatch đồng thời input + change + click gây double request. |
| Pagination | Collection lớn phải có page/limit hoặc load-more bounded. |
| Backend read | Projection hẹp, batch query, không query từng item trong vòng lặp. |
| Read-only | GET/list/read route không ghi DB, không rebuild read model đồng bộ. |
| Cache | Chỉ cache nhẹ dữ liệu ít đổi; không cache công nợ/tồn/quỹ/trạng thái chốt sổ nếu có rủi ro stale. |

## Matrix theo màn

| Màn hình | Frontend file chính | API list chính | API phụ được phép | Read actions | Open budget | Tải lại | Tìm kiếm | Xóa lọc | Debounce | Abort/seq guard | Pagination/limit | Lazy-load tab | Cache nhẹ | Backend projection | Forbidden behavior |
|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|
| Tổng quan | `public/js/app/00-dashboard.js` | `/api/dashboard/home` | lazy dashboard blocks | Tải lại dashboard | 1 delayed home + lazy blocks | 1 | N/A | N/A | N/A | AbortController | summary only | Có | short block cache | dashboard summary | Không gọi full report list để render dashboard |
| Sản phẩm | `public/js/app/02-products.js` | `/api/products` | catalog cache sync nền | Tải lại, Tìm kiếm, Xóa lọc, phân trang | 1 | 1 | 1 | 1 | submit/search guard | requestSeq | page/limit | Có | product catalog short cache | product list summary | Không load full catalog khi q rỗng nếu không allowAll |
| Khách hàng | `public/js/app/03-customers-autocomplete.js` | `/api/customers` | catalog cache invalidate khi write | Tải lại, Tìm kiếm, Xóa lọc, phân trang | 1 | 1 | 1 | 1 | submit/search guard | requestSeq | page/limit | Có | customer catalog short cache | customer list summary | Không reload customer + sales + debt đồng thời |
| Nhập kho | `public/js/app/04-import-orders.js` | `/api/import-orders` | stock refresh thủ công | Tải lại, Lọc | 1 | 1 | 1 | 1 | form submit | requestSeq preferred | limit required | Có | none | import order summary | Không tự load tồn kho sau mỗi read nếu không cần |
| Bán hàng | `public/js/app/05-sales-orders.source/*` | `/api/sales-orders` | product/customer background sync | Tải lại, tìm đơn, tải thêm | 1 | 1 | 1 | 1 | 250ms | AbortController | page/limit/load-more | Có | short form catalog cache | order list summary | Không query từng đơn con để render list |
| Tồn kho | stock module | `/api/inventory/summary` | none | Tìm kiếm, tải lại | 1 | 1 | 1 | 1 | form/search | sequence guard | page/limit | Có | none-for-stock | inventory summary projection | Không dùng snapshot cũ làm nguồn chính |
| Đối chiếu DMS | `public/js/app/10-dms-inventory.js` | `/api/dms-inventory/latest` | `/api/dms-inventory/history` khi mở history | Tải lại, Tìm kiếm, Lịch sử, Trang trước/sau | 1 | 1 | 1 | 1 | form submit | AbortController | page/limit | History lazy | none-for-inventory | dms comparison page | Không recompute toàn DB khi chỉ xem trang |
| Đơn tổng | `public/js/app/06-master-delivery.js` | `/api/master-orders` | child batch read khi mở chi tiết | Tìm kiếm, tải lại, phân trang | 1 | 1 | 1 | 1 | debounce | sequence guard | page/limit | Có | none | master list summary | Không per-id Promise.all 2,000 đơn |
| Đơn giao hôm nay New | `public/js/app/new/91-delivery-today-new.js` | `/api/new/delivery-today/orders` | adjustment resolver khi mở popup | Tải đơn, xóa lọc, filter NVGH/NVBH | 1 | 1 | 1 | 1 | suggest debounce | AbortController | scoped day list | Có | none-for-closeout-state | delivery row summary | Không reload returns/debts/kpi phụ sau list load |
| Công nợ New | `public/js/app/new/92-debt-new.js` | `/api/new/debt/customers` | suggestions khi nhập | Tải, xóa lọc, chi tiết khách | 1 | 1 | 1 | 1 | suggest debounce | requestSeq/scope guard | page/limit | Có | none-for-debt | debt customer/order summary | Không dùng read model cũ làm nguồn chính |
| Thu nợ chờ xác nhận | debt collection UI | `/api/debt-collections` | confirm/reject command only | Tải lại, tìm kiếm | 1 | 1 | 1 | 1 | form submit | sequence guard | page/limit | Có | none-for-debt | collection summary | GET không post AR/Fund |
| Đơn trả hàng | `public/js/app/debt/07b-return-orders.js` | `/api/return-orders` | detail from selected row | Tìm kiếm, xóa lọc, tải lại | 1 | 1 | 1 | 1 | form submit | AbortController | page/limit=50 | Có | none-for-return-state | return order summary | Không load chi tiết từng phiếu trong vòng lặp |
| Quỹ tiền | `public/js/app/debt/07f-fund-ledger.source/*` | `/api/funds/ledger`, `/api/funds/summary` | delivery cash preview | Tải lại, tìm kiếm, trang trước/sau | 1 active tab | 1 | 1 | 1 | debounce preview | AbortController/seq | page/limit | Tab nặng lazy | none-for-fund | ledger/summary projection | Không cache số quỹ stale |
| Báo cáo | `public/js/app/admin/08a-reports.js` | `/api/reports/*` | export only when clicked | Xem báo cáo, tìm kiếm, phân trang | catalog only | 1 active report | 1 | 1 | form/search | AbortController | preview cap/page | Report modal lazy | catalog cache | report preview page | Không gọi full report cho dashboard |
| Xuất hóa đơn | `public/js/app/admin/08f-vat-export.js` | export endpoints | error report URL | Export VAT/SSE | 0 until click | 1 download | filter only | 1 | customer search debounce | request guard | export cap by filter | Có | none | values-only export | Không trả fake XLSX khi mapping lỗi |
| Tài khoản | `public/js/app/admin/08b-users.js` | `/api/users` | none | Tải/tìm user | 1 | 1 | 1 | 1 | 250ms | sequence guard | list limit | Có | staff short cache | user summary | Không preload user cho mọi tab nếu không cần |
| Khuyến mại | promotion modules | `/api/promotions` | groups/rules by tab | Tải lại, tìm kiếm | 1 active type | 1 | 1 | 1 | 250ms | sequence guard | limit | Tab type lazy | promotion config cache | promo summary | Không tính KM toàn catalog khi chỉ xem list |
| Import Excel | `public/js/app/admin/08d-import-excel.source/*` | `/api/import/sessions/:id`, rows | polling bounded | Preview/session/poll | 0 until action | 1 status | 1 rows page | 1 | N/A | AbortController | session rows page | shortage lazy | session only | session/row projection | Không nhiều poll interval song song |
| Chỉnh sửa số liệu | admin correction UI | `/api/admin/corrections` | edit-context on demand | Tải lại, kiểm tra trước | 1 | 1 | 1 | 1 | form submit | sequence guard | page/limit | Có | none | correction summary | Không ghi khi chỉ xem standard |
| Chia đơn theo giá trị | order split tool | `/api/tools/order-split/preview` | export on click | Preview, export | 0 until preview | 1 | 1 preview | 1 | N/A | sequence guard | preview cap | Có | none | preview only | Không ghi DB trong preview |
| Sinh đơn chấm DMS | DMS gap simulator | `/api/tools/dms-gap-simulator/preview` | export on click | Sinh đơn tham khảo | 0 until click | 1 | 1 | 1 | N/A | sequence guard | preview cap | Có | none-for-inventory | preview only | Không tạo đơn thật khi preview |
| Quản lý chấm Trưng bày | display-check manager | `/api/tools/display-check/*` | bootstrap active tab | Tải lại, danh sách, chi tiết | 1 bootstrap | 1 active list | 1 | 1 | form submit | sequence guard | page/limit | Tab lazy | config cache | list summary | Không preload plan detail toàn bộ |
| Hệ thống/API monitor | system tab | `/api/system/status`, `/api/system/api-monitor` | monitor when opened | Tải lại status/monitor | active tab only | 1 | N/A | N/A | N/A | sequence guard | monitor limit | Monitor lazy | none | summary | Không reset/backup qua GET |
| Enterprise console | enterprise UI | `/api/enterprise/status` | queue/outbox/analytics by tab | Tải lại, xử lý ngay | 1 status | 1 active tab | N/A | N/A | N/A | sequence guard | limit | Tab lazy | status short cache | enterprise status | Không rebuild analytics khi chỉ mở status |
| App bán hàng | `public/mobile/js/sales.source/*` | `/api/mobile/customers`, `/products`, `/sales/orders`, `/mobile/debts` | load-more | Tải lại, tải thêm, tìm kiếm | 1 active tab | 1 | 1 | 1 | debounce/search guard | requestSeq | page/limit | Tab lazy | catalog short cache | mobile card projection | Không preload debt/products/orders cùng lúc |
| App giao hàng | `public/mobile/js/delivery-mobile-view.source.js` | `/api/delivery/orders`, `/api/mobile/debts`, `/api/delivery/reconciliation` | returns/debts tab lazy | Tải, công nợ, đối soát | orders only | 1 active tab | 1 | 1 | debounce/search guard | sequence guard | page/limit debt | Debt/reconciliation lazy | short order cache | mobile delivery projection | Không preload toàn bộ returns/debts |
| App thủ kho | `public/mobile/warehouse-return-check.html` | `/api/mobile/warehouse/return-checks` | detail/item-sources on demand | Tải danh sách, xem chi tiết | 1 | 1 | 1 | 1 | form/search | sequence guard | page/limit | Detail lazy | none-for-return-state | check list summary | Không post stock khi chỉ confirm check |

## Cache policy

| Loại dữ liệu | Cache được không | Ghi chú |
|---|---|---|
| Staff list, report catalog, promotion group, static options | Có, cache phiên ngắn | Invalidate khi write cấu hình. |
| Product/customer catalog cho autocomplete | Có, cache phiên ngắn | Không dùng thay list chính khi cần số liệu mới. |
| Công nợ, tồn kho, quỹ, returnOrders, closeout status | Không hoặc rất ngắn | Tránh stale số tiền/tồn/trạng thái kế toán. |

## Backend read API rule

- Read route/list route phải `readOnly: true` theo `src/config/readEndpointBudgets.js`.
- GET/read route không gọi `save/create/update/delete/bulkWrite`.
- List lớn phải có `page/limit` hoặc bounded load-more.
- Export được lấy toàn bộ trong phạm vi filter hợp lệ; preview trên UI phải có cap/pagination.
