# PHASE214 — Action Command Governance & Performance Cleanup Report

## Mục tiêu

Siết MK-Pro theo hướng **action/command contract**, tránh một nút bấm sinh request thừa, reload thừa hoặc rebuild đồng bộ. Phase214 ưu tiên các command P0/P1 theo báo cáo action inventory Phase213.

## File đã sửa/thêm

| File | Loại | Nội dung |
|---|---|---|
| `docs/ACTION_CONTRACT_MATRIX.md` | Thêm | Ma trận contract cho P0/P1 actions: API chính, API phụ cấm/cho phép, collections được ghi, idempotency, request budget, response/patch UI. |
| `src/config/actionCommandContracts.js` | Thêm | Contract machine-readable cho closeout, bulk adjustment, adjustment save, debt collection, return stock-in, warehouse confirm, import, DMS, SSE. |
| `src/utils/commandTelemetry.js` | Thêm | Helper telemetry nhẹ: `mark()` / `finish()`, stage có cả `name`, `stage`, `ms`, `durationMs`, `elapsedMs`. |
| `src/services/accounting/AccountingCloseoutService.js` | Sửa | Dùng command telemetry cho closeout, vẫn giữ enqueue read-model sync, không rebuild đồng bộ. |
| `src/services/DebtCollectionService.js` | Sửa | Thêm telemetry cho submit/confirm debt collection; giữ rule submit chỉ tạo pending, confirm mới post AR/Fund. |
| `public/js/app/new/91-delivery-today-new.js` | Sửa | Thêm `runCommandOnce`, `AbortController` cho load, patch UI sau closeout/bulk/adjustment thay vì auto reload toàn màn. |
| `public/mobile/js/delivery-mobile-view.source.js` | Sửa | Thêm mobile command lock và form-scoped idempotency key cho gửi phiếu thu chờ KT. |
| `public/mobile/js/delivery-mobile-view.js` / `.map` | Generated | Rebuild từ canonical source. |
| `config/source-bundles.json` | Sửa | Refresh hash cho mobile delivery source bundle. |
| `config/retired-files.json` | Thêm | Policy retired/dead-code candidate, không xóa mù. |
| `scripts/audit-dead-code.js` | Thêm | Audit retired references và chặn nested phase/work folder trong ZIP/deploy root. |
| `docs/CODEBASE_CLEANUP_REPORT.md` | Thêm | Báo cáo cleanup policy Phase214. |
| `package.json` | Sửa | Thêm script `audit:dead-code`. |
| `test/action-request-budget-static.test.js` | Thêm | Guard request budget, in-flight lock, abort stale list, không auto reload sau command. |
| `test/backend-command-boundary-static.test.js` | Thêm | Guard command contracts + telemetry + closeout no sync rebuild. |
| `test/dead-code-audit-static.test.js` | Thêm | Guard dead-code audit script/config/report. |

## Các nút P0/P1 đã siết

| Action | Kết quả |
|---|---|
| Chốt sổ giao hàng | 1 command request; dùng `runCommandOnce`; sau success patch các dòng đã chốt/KPI, không `await load({ silent: true })`. |
| Ghi nhận điều chỉnh đã chọn | 1 command request; dùng `runCommandOnce`; patch trạng thái sync cục bộ, không reload toàn màn ngay. |
| Lưu điều chỉnh đơn giao | 1 command request; dùng `runCommandOnce`; patch row đang mở, không reload full delivery list. |
| Gửi phiếu thu chờ KT trên app giao hàng | Dùng `runMobileCommandOnce`; hidden form idempotency key ổn định trong một form submit, chống double submit tạo key khác nhau. |
| Kế toán xác nhận phiếu thu | Có telemetry stage; vẫn chỉ confirm mới post AR/Fund, submit không post. |
| Closeout backend | Có telemetry stage chuẩn hóa; vẫn enqueue read-model sync. |

## Request/reload thừa đã bỏ

| Trước | Sau |
|---|---|
| Closeout success gọi `await load({ silent: true })` reload lại danh sách. | Patch các dòng đã chốt từ response/results/submitted rows. |
| Bulk adjustment success gọi `await load({ silent: true })`. | Patch trạng thái `bulkAdjustmentSyncedAt/bulkAdjustmentSyncStatus` của các dòng đang chọn. |
| Adjustment save success gọi `await load({ silent: true })`. | Patch row hiện tại: `hasCorrection`, `lastCorrectionId`, `returnUpdated`. |
| Load đơn dùng request sequence nhưng request cũ vẫn chạy đến server/client. | Thêm `AbortController` để hủy request list/filter cũ. |
| Mobile debt idempotency key dùng `Date.now()` trực tiếp trong submit body. | Key sinh theo form nonce, ổn định cho cùng form submit, chống double click/retry trong cùng form. |

## Dead-code cleanup

Phase214 chưa xóa vật lý file nghiệp vụ vì mục tiêu là dựng guard an toàn trước. Đã thêm:

- `config/retired-files.json`
- `scripts/audit-dead-code.js`
- `docs/CODEBASE_CLEANUP_REPORT.md`

Script hiện tại pass:

```txt
[dead-code-audit] OK
```

## Rule nghiệp vụ giữ nguyên

- AR SSoT vẫn là `arLedgers`, runtime đọc qua boundary.
- Phase87 strict không ăn legacy/dirty AR.
- Canonical AR-SALE full contract giữ nguyên từ Phase213.
- Closeout không rebuild read model đồng bộ, chỉ enqueue sync job.
- Mobile debt vẫn dùng DebtNew canonical adapter và DCOC chỉ là correction source.
- Không đổi workflow app giao hàng Phase23+.
- Source bundle mobile đã sửa source rồi build generated.

## Test đã chạy

```bash
npm run check:syntax
# SYNTAX_OK 1344 JavaScript files

npm run check:source-bundles
# [source-bundles] OK 19 bundles

npm run check:source-size
# [source-size-budget] OK

node --test test/action-request-budget-static.test.js test/backend-command-boundary-static.test.js test/dead-code-audit-static.test.js
# 9 pass / 0 fail

node --test test/closeout-api-performance-static.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/delivery-today-closeout-performance-static.test.js test/delivery-today-closeout-readmodel-safety.test.js test/debt-collection-pending-posting-static.test.js test/debt-collection-shared-pending-lock-static.test.js test/debt-collection-web-accounting-policy.test.js test/mobile-debt-canonical-correction-identity.test.js test/delivery-mobile-debt-tab-static.test.js test/delivery-debt-pagination-p1-static.test.js test/action-request-budget-static.test.js test/backend-command-boundary-static.test.js test/dead-code-audit-static.test.js
# 49 pass / 0 fail
```

`npm test` đã chạy được một phần lớn và chưa thấy fail trước khi timeout của sandbox; log ghi nhận nhiều suite pass, nhưng lệnh bị dừng do giới hạn thời gian chạy trong môi trường này. Cần chạy lại full `npm test` trên máy dev/CI không giới hạn thời gian để xác nhận toàn bộ.

## Rủi ro còn lại

1. Một số module P1/P2 trong action inventory mới được đưa vào matrix/guard, chưa refactor sâu từng route.
2. Patch UI sau command dựa vào response hiện có; nếu backend trả thiếu chi tiết, UI sẽ patch trạng thái tối thiểu và người dùng vẫn có thể bấm Tải đơn thủ công.
3. Dead-code cleanup mới là candidate/guard, chưa xóa file legacy để tránh xóa nhầm.

## ZIP output

```txt
MK-pro-phase214-action-command-governance-performance-cleanup.zip
```
