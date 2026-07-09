# PHASE216_READ_REQUEST_BUDGET_PERFORMANCE_CLEANUP_REPORT

## 1. Tổng quan Phase216

Phase216 tiếp tục từ Phase215, không đụng sâu vào command kế toán/kho đã pass. Trọng tâm là read/list/report performance:

- Tạo ngân sách request cho các màn đọc/lọc/tải dữ liệu.
- Chuẩn hóa read endpoint contract machine-readable.
- Chặn response cũ render đè response mới ở màn đơn trả hàng bằng AbortController.
- Bổ sung static tests cho list/search/lazy-load/no-write/report contract/ZIP sạch.
- Giữ chính sách cleanup an toàn: không xóa mù code legacy.

## 2. File đã sửa/thêm

| File | Loại | Nội dung |
|---|---|---|
| `docs/READ_REQUEST_BUDGET_MATRIX.md` | mới | Matrix request budget cho các màn đọc/lọc chính. |
| `src/config/readEndpointBudgets.js` | mới | Config machine-readable cho read/list endpoint budgets. |
| `public/js/app/debt/07b-return-orders.js` | sửa | Thêm `AbortController` cho `loadReturnOrders()` để hủy request cũ. |
| `docs/CODEBASE_CLEANUP_REPORT.md` | sửa | Bổ sung mục Phase216 read cleanup vòng 1. |
| `test/read-request-budget-static.test.js` | mới | Guard docs/config read budget. |
| `test/frontend-list-request-governance-static.test.js` | mới | Guard AbortController/requestSeq/lazy-load/polling. |
| `test/read-api-no-write-static.test.js` | mới | Guard read endpoint read-only/no inline DB writes ở route chọn lọc. |
| `test/report-read-performance-contract.test.js` | mới | Guard report preview abort/dashboard summary/SSE contract. |
| `test/source-zip-clean-static.test.js` | mới | Guard không ship `node_modules`/nested phase folder. |

## 3. Read Request Budget Matrix

Đã tạo `docs/READ_REQUEST_BUDGET_MATRIX.md` bao phủ các màn:

- Tổng quan
- Sản phẩm
- Khách hàng
- Nhập kho
- Bán hàng
- Tồn kho
- Đối chiếu DMS
- Đơn tổng
- Đơn giao hôm nay New
- Công nợ New
- Thu nợ chờ xác nhận
- Đơn trả hàng
- Quỹ tiền
- Báo cáo
- Xuất hóa đơn
- Tài khoản
- Khuyến mại
- Import dữ liệu Excel
- Chỉnh sửa số liệu
- Chia đơn theo giá trị
- Sinh đơn chấm DMS
- Quản lý chấm Trưng bày
- Hệ thống/API monitor
- Enterprise console
- App bán hàng
- App giao hàng
- App thủ kho

Mỗi màn có budget cho open/reload/search/clear, cơ chế AbortController hoặc request sequence guard, pagination/limit, lazy-load tab, cache policy, backend projection và forbidden behavior.

## 4. Read endpoint budget config

Đã tạo `src/config/readEndpointBudgets.js` với các endpoint lớn:

- `/api/products`
- `/api/customers`
- `/api/sales-orders`
- `/api/master-orders`
- `/api/new/delivery-today/orders`
- `/api/new/debt/customers`
- `/api/debt-collections`
- `/api/return-orders`
- `/api/funds/ledger`
- `/api/funds/summary`
- `/api/reports/*`
- `/api/dms-inventory/latest`
- `/api/dms-inventory/history`
- `/api/tools/dms-gap-simulator/preview`
- `/api/tools/display-check/*`
- `/api/mobile/customers`
- `/api/mobile/products`
- `/api/mobile/sales/orders`
- `/api/mobile/debts`
- `/api/delivery/orders`
- `/api/delivery/reconciliation`
- `/api/mobile/warehouse/return-checks`

Mỗi endpoint khai báo:

- `maxRequestsPerUserAction`
- `requiresPagination`
- `requiresAbortableFrontend` hoặc `acceptsSequenceGuard`
- `readOnly`
- `forbiddenWrites`
- `maxLimit`
- `projection`
- `reloadPolicy`
- `cachePolicy`

## 5. Các màn đã thêm/kiểm soát AbortController, debounce, lazy-load

| Màn | Cơ chế hiện tại |
|---|---|
| Đơn giao hôm nay New | `AbortController` trong `load()` đã có từ Phase214. |
| Bán hàng | `salesOrderAbortController` trong sales-order list. |
| DMS latest/history | `loadAbortController` và `historyAbortController`. |
| Báo cáo | `activeRequestController` + abort khi đóng modal/request mới. |
| Import session polling | `importCommitPollController`, dừng poll cũ trước poll mới. |
| Đơn trả hàng | Phase216 thêm `returnOrderAbortController`. |
| Sản phẩm/Khách hàng | Có request sequence guard + queue để response cũ không render đè. |
| Bootstrap tab | `V45_BOOT_LOADED_TABS` lazy-load tab active, không preload toàn bộ module. |

## 6. Backend read API governance

Phase216 không viết lại service lớn, nhưng thêm guard/static contract:

- Read endpoint config bắt buộc `readOnly: true` và `forbiddenWrites: true`.
- Static test kiểm tra các route đọc trọng tâm không inline DB write trong GET handlers.
- Matrix quy định projection hẹp, pagination/limit, không query từng item trong vòng lặp.

## 7. Report/export read safety

Static guard mới xác nhận:

- Report preview có request sequence/AbortController.
- Dashboard không gọi full report list.
- SSE export giữ delivery staff summary contract.
- SSE/error mapping không trả fake XLSX khi lỗi mapping theo contract hiện hữu.

## 8. Code dead/legacy cleanup

Phase216 chưa xóa vật lý file nghiệp vụ. Đã bổ sung cleanup report theo hướng:

- Candidate-only nếu chưa đủ bằng chứng.
- Không xóa DMS simulator, display-check manager, SSE export, DebtNew canonical adapter, AR governance, app giao hàng Phase23+, warehouse return check.
- `node scripts/audit-dead-code.js` pass.

## 9. Static tests mới/cập nhật

Thêm 5 test files:

```txt
read-request-budget-static.test.js
frontend-list-request-governance-static.test.js
read-api-no-write-static.test.js
report-read-performance-contract.test.js
source-zip-clean-static.test.js
```

Nhóm targeted Phase216 + guard Phase214/215 đã chạy:

```txt
23 pass / 0 fail
```

## 10. Kết quả test trong sandbox

Đã chạy thành công:

```bash
npm run check:syntax
# SYNTAX_OK 1351 JavaScript files

npm run check:source-size
# [source-size-budget] OK

node scripts/audit-dead-code.js
# [dead-code-audit] OK

node --test \
  test/read-request-budget-static.test.js \
  test/frontend-list-request-governance-static.test.js \
  test/read-api-no-write-static.test.js \
  test/report-read-performance-contract.test.js \
  test/source-zip-clean-static.test.js \
  test/dead-code-audit-static.test.js \
  test/action-request-budget-static.test.js \
  test/backend-command-boundary-static.test.js
# 23 pass / 0 fail
```

Không chạy được trong sandbox:

```bash
npm run check:source-bundles
npm test
```

Lý do: ZIP không có `node_modules`; sandbox thiếu package `terser`, trong khi `check:source-bundles` require `terser`. Trên máy dev/CI có dependency đầy đủ cần chạy lại:

```bash
npm install
npm run check:source-bundles
npm test
```

## 11. Rủi ro còn lại

- Phase216 mới dựng read/list governance và thêm một sửa nhỏ ở Đơn trả hàng; chưa tối ưu sâu từng query/index.
- Các API list lớn vẫn cần phase sau đo query thực tế bằng log/telemetry trước khi thêm index.
- Source-bundles chưa verify trong sandbox do thiếu `terser`; bản này không sửa source-bundle target/canonical source.

## 12. ZIP output

```txt
MK-pro-phase216-read-request-budget-performance-cleanup.zip
```
