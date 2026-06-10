# V45 Delivery Today - Customer List By NVGH

## Mục tiêu
Chuyển màn **Đơn đi giao hôm nay** từ dạng nhóm accordion theo nhân viên giao hàng sang dạng **list khách hàng/đơn giao** dễ nhìn hơn.

## Thay đổi chính

1. Danh sách bên trái chỉ hiển thị khi đã chọn/gõ **Nhân viên giao hàng**.
2. Khi chưa chọn NVGH, hệ thống không tải toàn bộ danh sách đơn, chỉ hiển thị hướng dẫn:
   - Vui lòng chọn nhân viên giao hàng.
3. Khi đã chọn NVGH, hệ thống gọi trực tiếp:
   - `GET /api/master-orders/delivery-today-orders`
4. Bỏ luồng hiển thị accordion:
   - NVGH → NVBH → đơn
5. Chuyển sang list trực tiếp:
   - Khách hàng / đơn giao
   - Thông tin thu tiền
6. KPI phía trên tính từ đúng danh sách đơn của NVGH đang chọn.
7. Nút đẩy công nợ chỉ bật khi có danh sách đơn của NVGH.
8. Giữ cấu trúc bố cục 70% / 30% hiện tại.

## File đã sửa

- `public/index.html`
- `public/js/app/06-master-delivery.js`
- `public/style.css`

## Test đã chạy

- `node -c public/js/app/06-master-delivery.js`: OK
- `node -c public/js/app/00-dom-state.js`: OK
- `npm run docs:generate`: OK

## Ghi chú nghiệp vụ
Màn này phù hợp hơn cho thao tác thực tế của NVGH/kế toán vì sau khi chọn một NVGH, mỗi dòng là một khách hàng/đơn giao, không phải mở nhiều tầng nhóm.
