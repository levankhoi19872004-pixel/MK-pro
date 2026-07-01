# Phase120 — Delivery Today New Lazy Load + Grouped NVBH Header

## Phạm vi

Chỉnh màn **Đơn giao hôm nay (New)** theo hướng không tải toàn bộ đơn khi mở màn hoặc khi chỉ có ngày giao mặc định. Chỉ thay đổi trong module New, không chỉnh nghiệp vụ tiền, closeout, AR, returnOrders hoặc module Đơn giao hôm nay cũ/mobile.

## Hiện trạng phát hiện

- Frontend `public/js/app/new/91-delivery-today-new.js` đã có `load()` thủ công nhưng điều kiện `hasValidSearchCriteria()` vẫn xem `date` là tiêu chí hợp lệ. Vì ngày giao được set mặc định hôm nay, người dùng bấm tải hoặc flow gọi load sẽ query theo ngày và có thể kéo toàn bộ danh sách trong ngày.
- Backend `src/services/v2/deliveryTodayNew.service.js` cũng xem `date/deliveryDate` là search criteria hợp lệ, nên API `/api/new/delivery-today/orders` vẫn cho phép date-only scan.
- Khối NVBH trước đó render riêng dưới dạng nhiều dòng KPI, mỗi KPI lặp nhãn dài `Phải thu/Tiền mặt/Chuyển khoản...`, gây rối khi danh sách lớn.

## Thay đổi đã triển khai

### Frontend

File: `public/js/app/new/91-delivery-today-new.js`

- Không coi ngày giao là tiêu chí đủ để tải đơn.
- Initial empty state hướng dẫn: chọn NVGH, NVBH hoặc nhập mã đơn/khách hàng rồi bấm **Tải đơn**.
- Đổi ngày giao sẽ clear kết quả đang hiển thị và yêu cầu bấm **Tải đơn**, tránh nhìn nhầm dữ liệu cũ.
- Thay đổi filter sau khi đã tải sẽ đưa màn về trạng thái chờ tải lại, không giữ kết quả cũ.
- Thêm `loadRequestSeq` để chống response cũ ghi đè response mới.
- KPI tổng và danh sách chỉ hiện sau khi có dữ liệu hợp lệ.
- Chuyển NVBH thành **group header trong danh sách đơn**:
  - Checkbox nằm ngay trên tiêu đề NVBH.
  - KPI nhóm hiển thị dạng compact: `PT/TM/CK/TT/HT/CN`.
  - Đơn thuộc NVBH nằm ngay dưới header nhóm.
  - Bỏ chọn NVBH sẽ ẩn đơn nhóm đó và cập nhật KPI tổng.
- Khối NVBH riêng được chuyển thành chú giải KPI compact thay vì bảng KPI dài.

### Backend

File: `src/services/v2/deliveryTodayNew.service.js`

- `hasSearchCriteria()` không còn coi `date/deliveryDate` là tiêu chí đủ để query.
- Date chỉ còn là điều kiện phụ khi đã có NVGH/NVBH/search hợp lệ.
- Khi thiếu filter hợp lệ, service trả guarded empty result với:
  - `requireFilter: true`
  - `groups: []`
  - message hướng dẫn chọn filter
- Bổ sung `summarizeGroups(rows)` để API có sẵn group theo NVBH cho contract dài hạn.

### Test/static contract

File: `test/phase91-new-services-contract.test.js`

- Cập nhật expectation: `date` đơn lẻ không phải search criteria hợp lệ.
- Cập nhật static contract để phản ánh lazy-load mới.

## Acceptance Criteria đã xử lý

- Mở màn không tự tải toàn bộ đơn.
- Date-only không còn đủ điều kiện query danh sách đơn.
- KPI tổng không hiện dữ liệu khi chưa tải.
- Xóa lọc đưa về empty state, không load all.
- NVBH hiển thị dạng tiêu đề nhóm trong danh sách đơn.
- KPI nhóm dùng nhãn compact `PT/TM/CK/TT/HT/CN`, không lặp nhãn dài ở từng dòng.
- Checkbox NVBH nằm ở group header và cập nhật KPI tổng theo nhóm đang chọn.
- Không thay đổi công thức tiền, closeout, returnOrders, AR.

## Kết quả kiểm tra

Đã chạy thành công:

```text
npm run check:syntax
SYNTAX_OK 1188 JavaScript files
```

Đã chạy thành công các static tests không cần dependency ngoài:

```text
node --test \
  test/delivery-today-new-salesman-group-ui-static.test.js \
  test/delivery-today-new-popup-ui-static.test.js \
  test/new-screens-autocomplete-clear-static.test.js \
  test/search-fields-delivery-core-config-static.test.js

21 tests pass
```

Không chạy được full `npm test` / `check:source-bundles` trong sandbox hiện tại vì ZIP không kèm `node_modules` và thiếu dependency runtime/dev như `mongoose`, `terser`.

## Test thủ công khuyến nghị

1. Vào **Đơn giao hôm nay (New)**: chỉ thấy empty state, chưa có KPI/danh sách.
2. Chỉ đổi ngày giao: không tải đơn, màn vẫn yêu cầu chọn NVGH/NVBH/search.
3. Click chọn NVGH rồi bấm **Tải đơn**: hiển thị KPI + danh sách group theo NVBH.
4. Click chọn NVBH rồi bấm **Tải đơn**: chỉ hiện nhóm liên quan.
5. Nhập tìm kiếm tối thiểu 2 ký tự rồi bấm **Tải đơn**: chỉ query theo search.
6. Tick/bỏ tick checkbox tại tiêu đề NVBH: KPI tổng và danh sách đơn cập nhật đúng.
7. Bấm **Xóa lọc**: quay về empty state, không load all.
