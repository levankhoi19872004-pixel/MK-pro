# PHASE 28 — DMS DECIMAL PRICE INPUT FIX

## Phạm vi

Sửa lỗi trình duyệt chặn lưu đơn DMS khi đơn giá có phần thập phân do `input[type="number"]` mặc định dùng `step=1`.

## Nguyên nhân

Đơn giá DMS được tính từ `actualAmount / quantity`, nên có thể sinh giá như `95703.333333` hoặc `162830.875`. Ô giá frontend không khai báo `step`, vì vậy trình duyệt chỉ chấp nhận số nguyên và báo `stepMismatch`.

## Thay đổi

- `public/js/app/05-sales-orders.js`
  - Thêm `step="any"` vào ô giá từng dòng đơn.
- `public/index.html`
  - Thêm `step="any"` vào ô `#salesPrice`.
  - Tăng cache version của `05-sales-orders.js`.
- `test/sales-order-decimal-price-input.test.js`
  - Bổ sung test chống tái diễn.

## Không thay đổi

- Không làm tròn đơn giá.
- Không thay đổi tổng tiền DMS.
- Không thay đổi tồn kho, công nợ, thuế, khuyến mại hoặc backend API.
