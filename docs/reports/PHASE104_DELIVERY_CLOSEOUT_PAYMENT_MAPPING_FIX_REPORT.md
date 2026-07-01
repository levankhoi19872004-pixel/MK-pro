# Phase104 — Delivery closeout payment mapping fix

## Mục tiêu

Sửa lỗi `AR-DEBT-OPEN` sinh sai khi chốt sổ giao hàng do closeout bỏ qua tiền mặt/chuyển khoản đã thu khi giao. Case mẫu:

- Đơn `B0038522`
- PT `1.562.192`
- TM `942.000`
- CK `0`
- TH `0`
- HT `619.646`
- `CN_raw = 546`, theo tolerance ±1.000 => `CN = 0`

Trước phase này, luồng AR-DEBT có nguy cơ tính sai theo `PT - HT = 942.546` nếu payment mapping không đọc được TM/CK.

## Thay đổi chính

### 1. Công thức chung

Bổ sung `calculateDeliveryDebtAmount()` trong `src/constants/finance.constants.js`:

```js
CN_raw = PT - TM - CK - TH - HT
CN = normalizeDebtAmount(CN_raw)
```

### 2. Mapping tiền mặt/chuyển khoản

`DeliveryCloseoutService` đọc canonical và alias:

- Tiền mặt: `cashAmount`, `cashCollectedAmount`, `cashReceivedAmount`, `paymentCashAmount`, `paidCashAmount`, `paidCash`, `collectedCash`, `deliveryCashAmount`, `cashCollected`, `cash`, `paidAmount`
- Chuyển khoản: `bankAmount`, `transferAmount`, `bankTransferAmount`, `paymentTransferAmount`, `paymentBankAmount`, `paidBankAmount`, `paidTransferAmount`, `collectedBankAmount`, `deliveryBankAmount`, `bankCollected`, `bankCollectedAmount`
- Trả thưởng/offset: `rewardAmount`, `bonusAmount`, `allowanceAmount`, `promotionRewardAmount`, `displayRewardAmount`, `bonusReturnAmount`, `offsetAmount`, `debtOffsetAmount`
- Hàng trả: từ `returnOrders` hợp lệ

### 3. Closeout diagnostic

Response closeout có diagnostics theo từng đơn:

```js
{
  orderCode,
  customerCode,
  receivableAmount,
  cashAmount,
  bankAmount,
  rewardAmount,
  returnAmount,
  rawDebtAmount,
  normalizedDebtAmount,
  action
}
```

### 4. AR-DEBT-OPEN

`ArDebtOpenPostingService` lưu thêm `cashAmount`, `bankAmount`, `rewardAmount`, `rawFinalDebtAmount` trong ledger để truy vết.

### 5. Audit dry-run

Thêm script đọc-only:

```bash
node scripts/audit-delivery-closeout-ar-debt-payment-mismatch.js --strict
```

Script so sánh `AR-DEBT-OPEN` từ `delivery_closeout` với công thức chuẩn, không sửa dữ liệu.

## Test

Đã bổ sung test cho:

- Case `B0038522`: `PT 1.562.192 - TM 942.000 - HT 619.646 = 546 => CN 0`.
- CK thay TM vẫn về CN 0.
- TM + CK kết hợp vẫn về CN 0.
- Không còn pattern tạo công nợ kiểu `PT - HT`.
- Diagnostics có `cashAmount`, `bankAmount`, `rawDebtAmount`, `normalizedDebtAmount`.

## Rủi ro còn lại

Nếu production đã có `AR-DEBT-OPEN` sai trước phase này, phase này không tự sửa dữ liệu cũ. Cần chạy audit dry-run và làm phase repair riêng có backup/dry-run/apply/reconcile.
