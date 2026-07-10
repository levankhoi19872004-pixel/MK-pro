# PHASE231 - Fund Operations Dashboard Read Model & UI Rebuild

## 1. Executive summary

Phase231 rebuild module **Quỹ tiền** theo hướng operational dashboard:

- Thêm read model backend riêng: `src/services/accounting/FundDashboardReadService.js`.
- Thêm endpoint đọc duy nhất cho dashboard: `GET /api/funds/dashboard`.
- UI tab đầu tiên chuyển thành **Tổng quan quỹ**, gọi một endpoint dashboard thay vì tự ráp nhiều API.
- Giữ nguyên toàn bộ luồng ghi hiện hữu: phiếu nộp quỹ giao hàng, phiếu chi, chuyển quỹ, nộp bù thiếu quỹ, remittance lines Phase230.
- Thay các xác nhận tài chính trong module quỹ từ browser `confirm()` sang modal preview nội bộ.
- Rebuild source bundle bằng script chính thức, không sửa tay generated bundle.

## 2. Root cause

Module Quỹ trước Phase231 mở mặc định ở **Sổ quỹ** và các KPI vận hành bị phụ thuộc vào màn danh sách/summary cục bộ. Frontend phải tải từng tab riêng lẻ (`/ledger`, `/delivery-cash-submissions`, `/expenses`, `/transfers`) nên không có một read contract rõ ràng cho dashboard vận hành. Các thao tác ghi quỹ dùng browser `confirm()` nên thiếu preview nhất quán trước khi tạo bút toán `fundLedgers`.

## 3. Phương án

### Phương án A - implemented

Tạo read model dashboard backend riêng, tổng hợp từ SSoT và các service đọc hiện hữu:

- Số dư tiền mặt/ngân hàng: `fundLedgers` qua `FundBalanceReadService`.
- Tiền NVGH còn giữ: `DeliveryCashInTransitReportService`.
- Phiếu nộp chờ xác nhận: `deliveryCashSubmissions.remittanceLines`.
- Khoản thiếu chưa xử lý: `deliveryCashShortages`.
- Giao dịch gần nhất: `fundLedgers` qua `fundLedgerRepository`.

### Phương án B - không chọn

Chỉ chỉnh UI và tiếp tục gọi nhiều API cũ từ frontend. Cách này ít thay đổi hơn nhưng không đạt yêu cầu contract `GET /api/funds/dashboard` và vẫn để dashboard phụ thuộc vào stitching ở browser.

## 4. Backend changes

| File | Nội dung |
|---|---|
| `src/services/accounting/FundDashboardReadService.js` | Read-only dashboard service, contract version `fund-dashboard-v1`, không write DB |
| `src/controllers/fundController.js` | Thêm `getDashboard()` |
| `src/routes/fundRoutes.js` | Mount `GET /api/funds/dashboard` với quyền `viewFund` |

Endpoint response chính:

- `data.balances.cash`, `data.balances.bank`
- `data.workQueues.pendingRemittances`
- `data.workQueues.overdueDeliveryCash`
- `data.workQueues.unclassifiedShortages`
- `data.workQueues.unmatchedBankTransactions`
- `data.cashInTransit`
- `data.recentTransactions`
- `data.source`

## 5. Frontend changes

| Area | Nội dung |
|---|---|
| Tab Quỹ tiền | Thêm tab đầu **Tổng quan quỹ** |
| Dashboard UI | KPI tiền mặt, ngân hàng, NVGH còn giữ, khoản cần xử lý |
| Work queues | Pending remittances, overdue delivery cash, unclassified shortages, bank reconciliation placeholder |
| Tables | Tiền NVGH đang giữ, giao dịch quỹ gần nhất |
| Nộp quỹ giao hàng | Label lại cột: Phải nộp, Đã khai báo nộp, Đã xác nhận nhận, Đối soát, Ghi quỹ |
| Chuyển quỹ | Đổi nhãn từ “Nộp ngân hàng” sang “Chuyển quỹ” |
| Confirmation | Thêm `fundConfirmPreviewModal`, bỏ browser `confirm()` trong module quỹ |

## 6. Source-bundle governance

Đã chỉnh source fragments trước:

- `public/js/app/debt/07f-fund-ledger.source/*.jsfrag`

Sau đó chạy script chính thức:

- `npm run source-bundles:refresh`
- `npm run check:source-bundles`

Generated bundles được tạo lại từ source, không sửa tay.

## 7. Business invariants

- Không đổi schema MongoDB.
- Không đổi `package.json`.
- Không đổi service ghi ledger.
- Không đổi idempotency/posting guard.
- Không thay đổi Phase230 remittance line writer.
- Dashboard read balance vẫn dùng SSoT `fundLedgers`.
- Luồng thiếu quỹ/nộp bù vẫn ghi qua service domain hiện hữu.

## 8. Tests

| Command | Kết quả |
|---|---|
| `npm run check:syntax` | PASS - `SYNTAX_OK 1398 JavaScript files` |
| `npm run check:source-bundles` | PASS - `OK 19 bundles` |
| `node --test test/phase231-fund-dashboard-readmodel-ui-static.test.js` | PASS |
| `node --test test/phase228-canonical-fund-balance-read-service.test.js` | PASS |
| `node --test test/phase230-delivery-remittance-lines-accounting-date.test.js` | PASS |
| `node --test test/fund-ledger-access-contract-static.test.js` | PASS |
| `node --test test/fund-summary.test.js` | PASS |
| `node --test test/fund-summary-ui-static.test.js` | PASS |
| `node --test test/fund-delivery-cash-preview-static.test.js test/fund-delivery-cash-update-refresh-static.test.js test/fund-delivery-shortage-repayment.test.js` | PASS |
| `npm run audit:fund-ending-balance` | BLOCKED: Atlas connection/IP whitelist |
| `npm run audit:delivery-remittance-accounting-date` | BLOCKED: Atlas connection/IP whitelist |
| `npm test` | FAIL do local `node_modules` tồn tại, test `source-zip-clean-static.test.js` yêu cầu root không có `node_modules` |
| `git diff --check` | PASS, chỉ có cảnh báo CRLF |

## 9. Known runtime evidence needed

- Cần chạy hai audit DB trên môi trường có MongoDB/Atlas whitelist:
  - `npm run audit:fund-ending-balance`
  - `npm run audit:delivery-remittance-accounting-date`
- Cần smoke test UI trên browser thật:
  - mở Quỹ tiền
  - dashboard load `GET /api/funds/dashboard`
  - jump từ dashboard sang Nộp quỹ giao hàng/Sổ quỹ
  - xác nhận phiếu/dòng/nộp bù/phiếu chi/chuyển quỹ qua modal preview

## 10. Risk assessment

| Risk | Mức | Ghi chú |
|---|---:|---|
| Dashboard cash-in-transit load có thể đọc nhiều dòng trước khi slice | Medium | Reuse service hiện hữu, chưa đổi query contract để tránh refactor rộng |
| Bank reconciliation queue | Low | Hiện là placeholder `supported: false`, không giả dữ liệu |
| UI generated bundle thay đổi | Low | Đã rebuild bằng source-bundle script và check OK |
| Full `npm test` fail | Low | Fail do `node_modules` ở root local, ZIP Phase231 loại dependency folder |

## 11. Next phase recommendation

1. Thêm limit trực tiếp vào `DeliveryCashInTransitReportService` để dashboard không cần load rồi slice.
2. Bổ sung runtime log dashboard: request time, section partial error, row counts.
3. Nếu có bank statement collection, thay placeholder `unmatchedBankTransactions` bằng queue thật.
4. Chạy smoke test browser và audit DB trên môi trường production/staging có whitelist.
