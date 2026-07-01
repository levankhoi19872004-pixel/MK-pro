# PHASE108 — Delivery Correction Zero Value Final Amount Fix

## Mục tiêu
Sửa lỗi modal `Đơn giao hôm nay (New) → Điều chỉnh đơn giao → Thu tiền` không nhận giá trị `0` là số tiền sau điều chỉnh hợp lệ.

## Nguyên nhân
Các luồng correction tiền thu có nguy cơ dùng fallback kiểu truthy/falsy (`value || currentAmount`). Trong JavaScript, `0` là falsy nên `0 || currentAmount` trả về `currentAmount`, làm người dùng nhập 0 nhưng hệ thống giữ lại số tiền hiện tại.

## Thay đổi chính
- Thêm helper frontend `hasMoneyInputValue()` và `readCorrectedMoney()` để phân biệt input rỗng với input `0`.
- `0`, `0.000` được parse thành `0` và được giữ nguyên.
- Chỉ input rỗng mới fallback về giá trị hiện tại.
- Blur input không tự đổi input rỗng thành `0`; nếu có giá trị thì mới format tiền Việt Nam.
- Backend correction service dùng `hasOwnValue()` và `firstExplicitMoneyValue()` để giữ explicit zero.
- Backend không dùng `||` cho fallback tiền correction.
- Delta vẫn được tính theo công thức `newAmount - oldAmount`.

## File đã sửa
| File | Nội dung |
|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Sửa đọc số tiền sau điều chỉnh, preserve explicit `0`, blur format an toàn |
| `src/services/deliveryCloseoutCorrection.service.js` | Sửa fallback backend để `0` là giá trị hợp lệ |
| `test/delivery-today-new-popup-ui-static.test.js` | Thêm static guard cho zero-value frontend |
| `test/delivery-closeout-correction-contract-static.test.js` | Thêm static guard cho zero-value backend |
| `RELEASE_MANIFEST.json` | Cập nhật manifest |

## Công thức sau sửa
```text
cashDeltaAmount = correctedCashAmount - currentCashAmount
bankDeltaAmount = correctedBankAmount - currentBankAmount
rewardDeltaAmount = correctedRewardAmount - currentRewardAmount
```

## Case mẫu
```text
currentCashAmount = 1.999.989
correctedCashAmount = 0
cashDeltaAmount = -1.999.989
```

## Kết quả test
- `node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js`: 51 pass, 0 fail.
- `npm run check:syntax`: SYNTAX_OK 1182 JavaScript files.
- `npm run check:release-manifest`: RELEASE_MANIFEST_OK 2026-07-01-01.

## Chưa chạy được
`npm run check:source-bundles` chưa chạy được trong sandbox vì thiếu dependency `terser` trong `node_modules`.
