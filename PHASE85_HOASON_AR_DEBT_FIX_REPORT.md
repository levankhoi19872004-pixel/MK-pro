# Phase85 - Hoa Sơn AR Debt Re-accounting Fix Report

## 1. Executive Summary

Đã sửa lỗi công nợ khách hàng có thể bị mất/sai sau khi sửa lại đơn và sinh `AR-SALE-REVERSAL`.

Case thực tế từ ảnh/Mongo:

- Khách: `BBHOASON` - Hoa Sơn
- Đơn: `B0038442` / `SO1782723235234708`
- Có `AR-SALE` mới: `487.484.570`
- Có `AR-SALE-REVERSAL` active trỏ về ledger cũ
- Có `AR-RECEIPT`: `190.000.000`
- Có `AR-RETURN`: `549.540`

Trước fix, nếu ledger gốc đã bị mark `reversed/inactive` nhưng reversal vẫn `active:true`, màn công nợ vẫn có thể tính reversal như một credit độc lập. Kết quả là công nợ vừa thêm/sửa lại bị triệt tiêu hoặc biến mất khỏi danh sách khách còn nợ.

Sau fix, read model công nợ chỉ tính technical `AR-SALE-REVERSAL` khi trong cùng tập đọc còn có ledger gốc active tương ứng. Nếu reversal bị orphan do ledger gốc đã inactive/reversed, reversal đó bị loại khỏi current debt read model để không làm âm/mất công nợ.

## 2. Root Cause

### 2.1. Orphan active reversal

Một số luồng re-accounting/reverse đang có mô hình:

1. Sinh `AR-SALE-REVERSAL` active, confirmed.
2. Đồng thời mark `AR-SALE` gốc thành `accountingStatus: reversed`, `active: false`, `reversed: true`.

Trong khi công nợ hiện tại được tính theo tập active confirmed ledgers. Như vậy ledger gốc bị loại, còn reversal active vẫn còn lại như một credit độc lập.

### 2.2. Classify sai `AR-SALE-REVERSAL`

`arLedgerCategoryEffect.util.js` kiểm tra mẫu `AR-SALE` trước khi nhận diện `AR-SALE-REVERSAL`, nên một số màn/báo cáo có thể classify reversal thành sale thường, làm sai diễn giải cột AR Sale/credit.

## 3. Files Changed

| File | Mục đích |
|---|---|
| `src/domain/ar/arLedgerQueryPolicy.js` | Thêm policy loại technical orphan reversal khỏi debt read model. |
| `src/services/arLedgerRead.service.js` | Áp dụng policy khi đọc canonical AR ledgers. |
| `src/services/arDebtReadModel.service.js` | Áp dụng policy khi rebuild/group read model. |
| `src/services/accounting/arCustomerDebtReadModel.service.js` | Guard trực tiếp màn Công nợ khách hàng để không tính orphan `AR-SALE-REVERSAL`. |
| `src/utils/arLedgerCategoryEffect.util.js` | Nhận diện `AR-SALE-REVERSAL` trước `AR-SALE`; giữ `AR-RETURN-REVERSAL` là business debit ledger. |
| `test/debt-screen-direct-ar-ledger-source.test.js` | Thêm regression test đúng case Hoa Sơn. |
| `test/ar-debt-read-model-canonical.test.js` | Thêm regression test orphan reversal ở canonical read model. |
| `test/ar-ledger-category-effect-contract.test.js` | Thêm test classify `AR-SALE-REVERSAL`. |
| `test/ar-sale-reversal-idempotency.test.js` | Cập nhật kỳ vọng: orphan reversal không được tạo công nợ âm. |
| `RELEASE_MANIFEST.json` | Cập nhật source hash sau khi sửa code. |

## 4. Behavioral Contract Sau Fix

### Được tính vào công nợ

- `AR-SALE` active confirmed.
- `AR-RETURN` active confirmed.
- `AR-RECEIPT` active confirmed.
- `AR-RETURN-REVERSAL` active confirmed vì đây là business debit ledger để tăng lại công nợ khi đảo trả hàng.
- `AR-SALE-REVERSAL` chỉ được tính nếu ledger gốc active tương ứng vẫn có trong cùng tập đọc.

### Không được tính vào công nợ

- Dirty AR ledger thiếu contract.
- Ledger inactive/reversed/deleted/voided.
- Technical `AR-SALE-REVERSAL` active nhưng ledger gốc đã bị inactive/reversed hoặc không còn trong canonical read set.

## 5. Case Hoa Sơn Expected

Với dữ liệu:

```text
AR-SALE      487.484.570
AR-RECEIPT   190.000.000
AR-RETURN        549.540
ORPHAN AR-SALE-REVERSAL 487.484.570  => không tính vào current debt
```

Công nợ còn lại expected:

```text
487.484.570 - 190.000.000 - 549.540 = 296.935.030
```

Regression test đã khóa case này bằng test:

```text
orphan active AR-SALE-REVERSAL is ignored so Hoa Sơn re-accounting debt does not disappear
```

## 6. Command Results

| Command | Result |
|---|---|
| `npm ci --ignore-scripts` | PASS |
| `npm run check:syntax` | PASS - `SYNTAX_OK 1126 JavaScript files` |
| `npm run check:source-bundles` | PASS - `OK 19 bundles` |
| `npm test` | PASS - `1315 tests`, `1314 pass`, `1 skipped`, `0 fail` |
| `npm run check:release-manifest` | PASS |
| `npm run docs:check` | PASS - `343 operations` |
| `node scripts/audit-global-software-rules.js --strict` | PASS, còn 5 P3 legacy compatibility cũ |
| `node scripts/audit-ar-access-violations.js --strict` | PASS, còn 5 P3 legacy compatibility cũ |
| `node scripts/audit-inventory-access-violations.js --strict` | PASS, 0 issue |
| `node scripts/audit-fund-access-violations.js --strict` | PASS, 0 issue |
| `node scripts/audit-frontend-business-calculation.js --strict` | PASS, 0 issue |

## 7. Risk & Backlog

### Đã xử lý trong Phase85

- Chặn current debt read model tính orphan `AR-SALE-REVERSAL` làm mất công nợ.
- Giữ nguyên `AR-RETURN-REVERSAL` như business debit ledger.
- Không sửa API contract.
- Không đổi DB schema.
- Không sửa luồng quỹ/tồn kho/import/delivery ngoài phạm vi AR debt read.

### Backlog nên làm tiếp

1. Audit và chuẩn hóa lại các luồng re-accounting đang đồng thời sinh reversal active và mark original inactive.
2. Viết repair script tùy chọn để liệt kê orphan active `AR-SALE-REVERSAL` trong production, phục vụ kế toán đối chiếu.
3. Sau khi đối chiếu an toàn, có thể thêm migration đánh dấu technical orphan reversal bằng trạng thái audit riêng thay vì để active gây nhiễu.

## 8. Final Decision

GO.

Phase85 đủ an toàn để deploy nhằm sửa lỗi công nợ Hoa Sơn/nhóm đơn re-accounting bị mất do orphan `AR-SALE-REVERSAL`.
