# PHASE 69 - Sửa tải lại danh sách đơn con chưa gộp

## Nguyên nhân gốc rễ

Popup **Tạo đơn tổng** chỉ gọi API danh sách đơn con khi mở popup hoặc khi chọn NVBH từ autocomplete. Các bộ lọc **Nguồn**, **Từ ngày**, **Đến ngày** và ô tìm kiếm không có event gọi lại API.

Vì vậy tình huống thực tế xảy ra như sau:

1. Popup mở với ngày mặc định 18/06/2026 và trả về 0 đơn.
2. Người dùng đổi sang 17/06/2026, chọn nguồn DMS và NVBH NPP3293.
3. Giao diện vẫn giữ response cũ nên tiếp tục báo 0 đơn, dù màn Bán hàng có các đơn DMS ngày 17/06/2026.

## Thay đổi

- Thêm nút **Tải lại** tại phần `2. Đơn con chưa gộp`.
- Nguồn và khoảng ngày tự tải lại ngay khi thay đổi.
- Ô tìm kiếm và mã NVBH tải lại theo debounce 350 ms.
- Thêm request sequence để response cũ không ghi đè response mới khi người dùng đổi bộ lọc nhanh.
- Hiển thị trạng thái `Đang tải...` và khóa nút trong lúc request đang chạy.
- Escape nội dung lỗi trả về trước khi render HTML.

## Phạm vi file

- `public/index.html`
- `public/js/app/state/00a-catalog-orders-state.js`
- `public/js/app/06-master-delivery.js`
- `test/master-order-popup-selection-ui-static.test.js`
- `test/master-order-unmerged-refresh-ui-static.test.js`

## Kết quả mong đợi

Khi chọn ngày 17/06/2026, nguồn DMS và NVBH NPP3293, danh sách đơn con chưa gộp được gọi lại bằng đúng bộ lọc hiện tại và hiển thị các đơn hợp lệ chưa có `masterOrderId/masterOrderCode` và chưa có `mergeStatus=merged`.

## Kiểm thử

- `node --check public/js/app/06-master-delivery.js`: đạt.
- `node --check public/js/app/state/00a-catalog-orders-state.js`: đạt.
- 30 kiểm thử hồi quy liên quan Đơn tổng, popup, detach, search và classic-script global scope: đạt 30/30.
- Kiểm thử hành vi API `master-order-unmerged-query-behavior`: xác nhận bộ lọc `17/06/2026 → 18/06/2026`, nguồn `DMS`, NVBH `NPP3293` chỉ trả đơn chưa gộp phù hợp.
- Full test suite đã chạy tới 376 test không ghi nhận lỗi nhưng runner không kết thúc trong giới hạn thời gian của môi trường kiểm tra; kết quả này không được tính là full-suite pass hoàn chỉnh.
