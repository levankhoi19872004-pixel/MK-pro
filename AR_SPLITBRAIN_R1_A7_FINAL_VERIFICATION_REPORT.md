# AR Split-brain R1 — Final Verification Report

Generated: 2026-08-09T05:26:36.066861+00:00

## Final verdict

**R1 implementation correctness: PASS. Release certification: BLOCKED/PARTIAL bởi environment.**

Không có bằng chứng regression mới trong targeted scope. Full suite không thể được dùng làm PASS vì dependency install bị chặn.

## What is fixed

1. Post-closeout correction không còn gọi final-state `reconcileOrderDebt()`.
2. Canonical AR effect của correction là event delta trên AR thực tế ngay trước correction.
3. Confirmed receipt được bảo toàn; test 10m - 4m receipt + 2m cash correction => 4m, không revive lên 8m.
4. B0041181: raw AR 23.800.085 + (-23.800.000) = 85; Debt New ±1.000 => 0.
5. Correction runtime không tạo `AR-DEBT-ADJUSTMENT`.
6. Return correction không double-count AR-RETURN.
7. Posting/idempotency/invariant failure rollback transaction.
8. Historical audit không còn dùng unsafe snapshot-final-state reconciliation.

## Verification

| Gate | Result |
|---|---|
| RED unsafe final-state receipt scenario | PASS evidence: failed 8m vs expected 4m before fix |
| Actual event writer + actual arPosting + actual arLedgerRead | 14/14 PASS |
| Targeted regression | 101/101 PASS |
| Syntax | 1705 JS PASS |
| B0041181 | PASS: raw 85, normalized debt 0 |
| Confirmed receipt preservation | PASS |
| Return ownership / no double count | PASS |
| Retry idempotency / payload conflict | PASS |
| Transaction rollback | PASS |
| Historical event-delta dry-run | PASS (fixture) |
| npm ci | BLOCKED: internal registry 404 zip-stream@4.1.1 |
| Dependency-heavy tests | BLOCKED: mongoose and other packages unavailable |
| Full `npm test` | exit 1; not release PASS |
| Source bundle check | BLOCKED: terser unavailable |
| Built-in artifact verifier | BLOCKED: jszip unavailable |

## Full-suite baseline comparison

R1 final full run và A input baseline đều có cùng **40 non-module failing subtest names**. R1 không thêm non-module failure mới so với A baseline. Phần lớn failures còn lại là module-load failures do thiếu dependencies. Điều này **không** biến full suite thành PASS; nó chỉ chứng minh không thấy regression mới từ R1 trong phần so sánh có thể thực hiện.

## Residual risk

`AccountingCloseoutService` và offline `backfill-order-payment-allocations.js` vẫn gọi legacy final-state reconcile ngoài post-closeout correction scope. Vì `OrderPaymentDebtReconcileService` còn có thể tạo `AR-DEBT-ADJUSTMENT` cho các source không bị guard, yêu cầu “không tạo AR-DEBT-ADJUSTMENT ở bất kỳ đâu trong toàn hệ thống” **chưa được giải quyết**. R1 chỉ bảo đảm correction/bulk correction runtime không tạo category này.

## Release recommendation

Không gắn nhãn READY cho production cho đến khi chạy lại trên environment cài được lockfile dependencies:

- `npm ci`
- targeted R1 suite
- `npm test`
- `npm run check:syntax`
- `npm run check:source-bundles`
- release/artifact governance checks

Không cần và không được tự repair production data trong release này. Historical mismatch phải đi qua audit/event-history review riêng.
