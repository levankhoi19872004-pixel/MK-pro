# PHASE86 AR-RETURN AmountField Fix Report

## 1. Executive Summary

Sửa lỗi phát sinh sau Phase85: AR-RETURN của Hoa Sơn vẫn bị mất khỏi màn Công nợ nếu ledger đã sinh theo legacy contract có `amountField: "amount"`.

Nguyên nhân: Phase85 siết canonical validator yêu cầu ledger credit phải có `amountField: "credit"`. Trong dữ liệu thực tế, AR-RETURN được sinh từ `returnArPostingService` có `amountField` mang tên field nguồn của phiếu trả hàng, ví dụ `amount`, `returnAmount`, `totalAmount`. Vì vậy AR-RETURN bị `isCanonicalArDebtLedger()` loại khỏi read model, dẫn đến công nợ không trừ trả hàng.

## 2. Root Cause

Dòng AR-RETURN Hoa Sơn thực tế:

```text
category = AR-RETURN
credit = 549.540
direction = credit
amount = 549.540
amountField = amount
```

Validator Phase85 coi `amountField = amount` là sai contract credit-only, nên read model loại AR-RETURN.

## 3. Fixed Files

| File | Thay đổi |
|---|---|
| `src/domain/ar/arLedgerValidator.js` | Cho phép AR-RETURN legacy có `amountField` là field nguồn (`amount`, `returnAmount`, `totalAmount`, `items`,...) miễn là `credit > 0`, `debit = 0`, `direction = credit`, `amount = credit`. |
| `src/services/accounting/returnArPostingService.js` | AR-RETURN mới sinh ra dùng canonical `amountField: 'credit'`; field nguồn được lưu riêng vào `amountSourceField`. |
| `test/debt-screen-direct-ar-ledger-source.test.js` | Regression Hoa Sơn: AR-RETURN `amountField: 'amount'` vẫn được tính vào công nợ. |
| `test/ar-customer-debt-read-model-ssot.test.js` | Regression read model: AR-RETURN legacy amountField vẫn được group đúng vào đơn bán. |
| `test/ar-return-reaccounting-posts-return.test.js` | Guard builder: AR-RETURN mới phải sinh `amountField: 'credit'` và giữ `amountSourceField`. |
| `RELEASE_MANIFEST.json` | Cập nhật sourceSha256 sau thay đổi source/test. |

## 4. Expected Hoa Sơn Formula

```text
AR-SALE      487.484.570
AR-RECEIPT -190.000.000
AR-RETURN     -549.540
--------------------------------
Còn nợ      296.935.030
```

Nếu màn hình ra `297.484.570` nghĩa là AR-RETURN vẫn chưa được tính.
Nếu màn hình ra `296.935.030` nghĩa là Phase86 đã đúng.

## 5. Safety Notes

- Không đổi API contract.
- Không đổi DB schema.
- Không sửa quỹ, tồn kho, delivery, import.
- Không chấp nhận AR-RETURN bẩn có debit dương hoặc direction sai.
- Chỉ tương thích legacy `amountField` của AR-RETURN credit hợp lệ.

## 6. Command Results

| Command | Result |
|---|---|
| `npm run check:syntax` | PASS — 1126 JavaScript files |
| `node --test` targeted AR/debt/return tests | PASS — 22 tests |
| `npm test` | PASS — 1316 tests, 1315 pass, 1 skipped, 0 fail |
| `npm run check:path-portability` | PASS |
| `npm run check:source-bundles` | PASS — 19 bundles |
| `npm run check:release-manifest` | PASS |
| `npm run docs:check` | PASS — 343 operations |
| `audit-global-software-rules --strict` | PASS, còn 5 P3 legacy compatibility cũ |
| `audit-ar-access-violations --strict` | PASS, còn 5 P3 legacy compatibility cũ |
| `audit-inventory-access-violations --strict` | PASS |
| `audit-fund-access-violations --strict` | PASS |
| `audit-frontend-business-calculation --strict` | PASS |

## 7. Final Decision

GO.

Deploy Phase86 rồi tìm lại `BBHOASON` / `Hoa Sơn` với NVGH `ghnpp`. Giá trị đúng kỳ vọng là `296.935.030` nếu dữ liệu DB đúng như case đã gửi.
