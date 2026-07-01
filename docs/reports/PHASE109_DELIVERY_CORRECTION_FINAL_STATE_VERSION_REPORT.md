# Phase109 — Delivery correction final-state version

## Mục tiêu

Sửa luồng `Đơn giao hôm nay (New) → Điều chỉnh đơn giao → Thu tiền` theo nguyên tắc final-state:

- Người dùng nhập `Tiền mặt sau điều chỉnh`, `Chuyển khoản sau điều chỉnh`, `Trả thưởng sau điều chỉnh` là giá trị cuối cùng muốn xác nhận.
- Version mới lưu thẳng các giá trị cuối cùng này.
- Delta chỉ dùng cho lịch sử/audit, không dùng để dựng lại current state lần sau.

## Nguyên nhân lỗi

Luồng cũ có các điểm dễ gây sai:

- `cashAdjustmentAmount` là tổng chênh lệch tiền thu nhưng có nơi dùng lại như chênh lệch riêng tiền mặt.
- Current state có thể bị dựng bằng `baseCash + latestVersion.cashAdjustmentAmount`.
- Sau nhiều lần correction, tiền mặt có thể bị đảo âm/dương theo lịch sử version.

## File đã sửa

| File | Nội dung |
|---|---|
| `src/services/deliveryCloseoutCorrection.service.js` | Lưu correction version theo final-state, thêm `cashAmount`, `bankAmount`, `rewardAmount`, delta riêng từng khoản, tính công nợ từ final values |
| `src/services/v2/deliveryTodayNew.service.js` | Đọc current state từ latest version final fields, không replay delta vào cash |
| `public/js/app/new/91-delivery-today-new.js` | Cập nhật note UI và bảng lịch sử version hiển thị final state + delta riêng |
| `src/models/DeliveryCloseoutVersion.js` | Bổ sung field final-state và delta từng khoản |
| `src/models/DeliveryCloseoutCorrection.js` | Bổ sung field final-state và delta từng khoản |
| `test/delivery-closeout-correction-contract-static.test.js` | Thêm guard chống dùng delta làm current state |
| `test/delivery-today-new-popup-ui-static.test.js` | Thêm guard UI final-state và lịch sử đầy đủ |

## Contract mới

Khi lưu correction:

```js
{
  paymentCorrection: {
    correctedCashAmount,
    correctedBankAmount,
    correctedRewardAmount
  }
}
```

Backend tính:

```js
newCashAmount = correctedCashAmount;
newBankAmount = correctedBankAmount;
newRewardAmount = correctedRewardAmount;

cashDeltaAmount = newCashAmount - previousCashAmount;
bankDeltaAmount = newBankAmount - previousBankAmount;
rewardDeltaAmount = newRewardAmount - previousRewardAmount;
```

Current state lần sau:

```js
currentCashAmount = latestVersion.cashAmount;
currentBankAmount = latestVersion.bankAmount;
currentRewardAmount = latestVersion.rewardAmount;
```

Không dùng:

```js
baseCashAmount + latestVersion.cashAdjustmentAmount
baseCashAmount + latestVersion.totalCollectedDelta
```

## Rủi ro còn lại

Các version cũ đã sinh trước Phase109 có thể thiếu `cashAmount/bankAmount/rewardAmount`. Code mới ưu tiên final-state fields, fallback an toàn về `cashCollectedAmount` hoặc base values, nhưng dữ liệu version cũ bị sai nên audit/repair riêng vẫn cần nếu production đã có lịch sử đảo dấu.

## Kiểm tra

- `node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js`
- `npm run check:syntax`
- `npm run release:manifest`
- `npm run check:release-manifest`

`npm run check:source-bundles` chưa chạy được trong sandbox do thiếu dependency `terser`.
