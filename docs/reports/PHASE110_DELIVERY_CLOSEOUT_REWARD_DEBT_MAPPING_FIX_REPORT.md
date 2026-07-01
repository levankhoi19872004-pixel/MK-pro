# PHASE110 — Delivery Closeout Reward / TH Debt Mapping Fix

## Mục tiêu

Sửa lỗi `TH` (trả thưởng/cấn trừ) đã hiển thị đúng ở màn **Đơn giao hôm nay (New)** nhưng khi chốt sổ giao hàng lại không được trừ vào `AR-DEBT-OPEN`, làm **Công nợ (New)** hiển thị sai.

## Nguyên nhân

Các luồng closeout/AR diagnostic trước đó chưa chuẩn hóa đủ alias `reward/bonus/offset`. Một số nơi dùng `rewardAmount || offsetAmount`, làm rơi mất phần offset khi cả hai cùng tồn tại, hoặc không có diagnostic đủ rõ để phát hiện closeout sinh nợ thiếu `TH`.

## Công thức chuẩn

```text
CN_raw = PT - TM - CK - TH - HT
CN = normalizeDebtAmount(CN_raw)
```

Trong đó `TH` được chuẩn hóa vào `rewardAmount` trong công thức debt, bao gồm các alias hợp lệ:

- `rewardAmount`
- `bonusAmount`
- `allowanceAmount`
- `promotionRewardAmount`
- `displayRewardAmount`
- `bonusReturnAmount`
- `offsetAmount`
- `debtOffsetAmount`
- `deliveryOffsetAmount`
- `rewardOffsetAmount`
- `promotionOffsetAmount`

## File đã sửa

| File | Nội dung |
|---|---|
| `src/constants/finance.constants.js` | Thêm alias money fields và `pickExplicitMoneyValue`; `calculateDeliveryDebtAmount()` nhận đủ reward/offset alias |
| `src/services/accounting/DeliveryCloseoutService.js` | Chuẩn hóa TH/reward/offset khi build closeout, chống double-count khi `offsetAmount` và `rewardAmount` cùng giá trị |
| `src/services/accounting/AccountingCloseoutService.js` | Diagnostic closeout trả `rewardAmount`/`offsetAmount` rõ ràng |
| `src/services/accounting/ArDebtOpenPostingService.js` | Ledger `AR-DEBT-OPEN` lưu diagnostic `rewardAmount`, `offsetAmount`, `rawFinalDebtAmount`, `finalDebtAmount` |
| `src/services/v2/deliveryTodayNew.service.js` | UI row dùng công thức debt từ PT/TM/CK/TH/HT để tránh hiển thị nợ lệch do closeout legacy |
| `scripts/audit-delivery-closeout-reward-debt-mismatch.js` | Script dry-run audit ledger đã sinh sai do không trừ TH |
| `test/phase91-new-services-contract.test.js` | Test công thức Hương Thủy/Hồng vân và alias reward/offset |
| `test/delivery-closeout-correction-contract-static.test.js` | Static guard chống công thức thiếu reward |

## Case kiểm chứng

### Hương Thủy

```text
PT = 5.400.573
TM = 0
CK = 0
TH = 1.820.000
HT = 0
CN = 3.580.573
```

### Hồng vân

```text
PT = 3.525.946
TM = 0
CK = 2.600.000
TH = 925.000
HT = 0
CN_raw = 946
CN = 0 theo ngưỡng ±1.000
```

## Dữ liệu cũ

Phase này không tự sửa ledger production đã sinh sai. Cần chạy audit dry-run:

```bash
node scripts/audit-delivery-closeout-reward-debt-mismatch.js --strict
```

Nếu có mismatch, cần phase repair riêng theo quy trình:

```text
backup → dry-run → repair plan → apply → reconcile
```
