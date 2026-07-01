# PHASE107 — Delivery Correction Final Amount Label + Tab UX

## Mục tiêu

Cải thiện modal **Đơn giao hôm nay (New) → Điều chỉnh đơn giao** sau Phase106:

- Tab bị khóa/disabled vẫn phải đọc rõ, không bị trắng/mờ gây hiểu nhầm.
- Các ô nhập tiền phải thể hiện rõ đây là **số tiền sau điều chỉnh / final amount**, không phải số tiền cộng thêm hoặc trừ bớt.
- Delta tiền thu phải tiếp tục tính theo công thức `sau điều chỉnh - hiện tại`.

## File đã sửa

| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Đổi label tiền thu sang “sau điều chỉnh”, thêm note final amount, thêm `deltaMoney()`, cải thiện CSS tab active/disabled |
| `src/services/deliveryCloseoutCorrection.service.js` | Thông báo lỗi backend theo từng khoản “sau điều chỉnh”, tiếp tục chỉ validate `newAmount` không âm |
| `test/delivery-today-new-popup-ui-static.test.js` | Thêm static guard cho label final amount, tab disabled readable, công thức delta |
| `test/delivery-closeout-correction-contract-static.test.js` | Thêm guard backend message final amount |

## Thay đổi UI

Label cũ:

- `Tiền mặt đúng`
- `Chuyển khoản đúng`
- `Trả thưởng đúng`

Label mới:

- `Tiền mặt sau điều chỉnh`
- `Chuyển khoản sau điều chỉnh`
- `Trả thưởng sau điều chỉnh`

Thêm note nghiệp vụ:

> Nhập số tiền cuối cùng muốn ghi nhận sau điều chỉnh. Hệ thống tự tính chênh lệch = số tiền sau điều chỉnh - số tiền hiện tại.

## Công thức giữ nguyên và làm rõ

```js
cashDeltaAmount = correctedCashAmount - currentCashAmount;
bankDeltaAmount = correctedBankAmount - currentBankAmount;
rewardDeltaAmount = correctedRewardAmount - currentRewardAmount;
```

Không dùng `current + corrected`.

## Tab UX

Bổ sung CSS để tab disabled vẫn đọc rõ:

```css
.delivery-new-tab:disabled,
.delivery-new-tab.is-disabled {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #cbd5e1;
  opacity: 1;
  cursor: not-allowed;
}
```

Tab active rõ ràng hơn với nền xanh và chữ trắng.

## Backend contract

Backend vẫn tự tính delta từ:

```js
adjustmentAmount = newAmount - oldAmount;
```

Validation chỉ reject khi `newAmount` âm. Nếu `oldAmount` đang âm do dữ liệu cũ nhưng người dùng nhập final amount hợp lệ như `0`, correction vẫn được phép tạo.

## Rủi ro còn lại

Phase này không repair dữ liệu production đã có tiền mặt âm. Nếu production còn bản ghi âm, cần chạy script audit read-only từ Phase106 và lập repair plan riêng trước khi sửa dữ liệu thật.
