# V45 - Sửa lỗi API trả HTML khi frontend đọc JSON

## Vấn đề
Popup lỗi:
`Unexpected token '<', "<!DOCTYPE ..." is not valid JSON`

Nguyên nhân trực tiếp: frontend gọi `response.json()` nhưng server trả về HTML, thường do:
- backend Render chưa deploy route mới `/api/funds/...`,
- API sai đường dẫn,
- route lỗi/404/500 nhưng trả HTML.

## Đã sửa
### 1. public/js/app/06-master-delivery.js
- Thêm hàm `deliveryReadJsonResponse()`.
- Thay đoạn `await res.json()` ở nút **Nộp quỹ** bằng hàm đọc JSON an toàn.
- Nếu API trả HTML, hệ thống sẽ báo rõ HTTP status và nội dung trả về rút gọn, không còn lỗi kỹ thuật khó hiểu `Unexpected token '<'`.

### 2. public/js/app/07-debt-cashbook.js
- Thêm hàm `fundReadJsonResponse()`.
- Áp dụng cho toàn bộ API quỹ:
  - `GET /api/funds/ledger`
  - `GET /api/funds/delivery-cash-submissions`
  - `GET /api/funds/expenses`
  - `GET /api/funds/transfers`
  - `POST /api/funds/delivery-cash-submissions`
  - `POST /api/funds/delivery-cash-submissions/:id/confirm`
  - `POST /api/funds/expenses`
  - `POST /api/funds/transfers`

## Kiểm tra route
Trong file hiện tại đã có:
- `src/routes/index.js`: `app.use('/api/funds', fundRoutes)`
- `src/routes/fundRoutes.js`: có route `POST /delivery-cash-submissions`

## Test đã chạy
- `node --check public/js/app/06-master-delivery.js`: OK
- `node --check public/js/app/07-debt-cashbook.js`: OK
- `node --check src/routes/fundRoutes.js`: OK
- `node --check src/controllers/fundController.js`: OK

## Lưu ý triển khai
Nếu sau khi deploy file này mà vẫn báo API trả HTML/404, cần kiểm tra Render đã chạy đúng bản backend mới chưa. Lỗi cũ là frontend mới đang gọi route quỹ nhưng server production có thể vẫn chạy backend cũ.
