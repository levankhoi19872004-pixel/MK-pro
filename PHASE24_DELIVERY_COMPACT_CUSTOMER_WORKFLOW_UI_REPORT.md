# MK-Pro Phase24 — Delivery Compact Customer Workflow UI

## 1. Baseline

Sử dụng baseline mới nhất người dùng gửi:

```text
MK-pro-phase23-delivery-customer-workflow-ui-p1-patched(1).zip
```

## 2. Mục tiêu

Giảm thông tin dư thừa trên màn hình xử lý một khách hàng trong App Giao Hàng, đặc biệt tab **Hàng giao**, để NVGH thấy danh sách sản phẩm sớm hơn, nhập hàng trả nhanh hơn và không bị lặp lại tên khách/mã khách/số tiền ở nhiều vùng.

Không đổi quy trình Phase23 đã chốt:

```text
Danh sách khách cần giao
→ Chọn khách
→ Hàng giao: nhập số lượng trả trên từng sản phẩm
→ Xác nhận hàng & thu tiền
→ Thu tiền
→ Xác nhận thu tiền
→ Đối soát
→ Công nợ nếu cần
```

## 3. File đã sửa/thêm

### Modified

```text
config/source-bundles.json
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/js/delivery-ui-utils.js
public/mobile/mobile.source/mobile-04.css
public/mobile/mobile.css
test/delivery-customer-workflow-ui-p1-static.test.js
test/delivery-real-workflow-ui-p1-static.test.js
```

### Added

```text
test/delivery-compact-customer-workflow-ui-p1-static.test.js
PHASE24_DELIVERY_COMPACT_CUSTOMER_WORKFLOW_UI_REPORT.md
```

### Deleted

```text
Không có
```

## 4. Trước / sau UI

### Trước

Tab Hàng giao đang chiếm nhiều chiều cao bởi:

```text
Card khách lớn: mã khách / tên khách / địa chỉ
Block hướng dẫn xanh nhiều dòng: Bước 1...
3 KPI card lớn: Số dòng / Tổng SL giao / Giá trị hàng
Sticky bottom lặp tên khách / mã đơn / số tiền
Sticky bottom hiển thị nhiều nút Hàng / Trả / Thu cùng lúc
```

### Sau

Tab Hàng giao dùng cấu trúc compact:

```text
Header khách compact:
Chị Bình Thanh · B0037933
Đông Long · Phải thu 9.361.265

Tóm tắt compact:
40 dòng · 173 SL · Giá trị 9.361.265
Nhập SL trả trên từng dòng hàng...

Danh sách sản phẩm hiển thị ngay phía dưới

Sticky bottom:
[Trả hết đơn] [Xác nhận hàng & thu tiền]
```

## 5. Chi tiết thay đổi

### 5.1 Compact selected customer header

`selectedOrderSummary()` trong `public/mobile/js/delivery-ui-utils.js` được rút gọn:

- Không hiển thị card cao với nhiều dòng.
- Không hiển thị label dài `Địa chỉ:`.
- Chỉ giữ một header 2 dòng: tên khách/mã khách và địa chỉ/phải thu.

### 5.2 Rút gọn hướng dẫn Hàng giao

Trong `renderProducts()` của `public/mobile/js/delivery-mobile-view.source.js`:

- Bỏ block lớn `Bước 1 · Hàng giao kiêm nhập hàng trả`.
- Thay bằng `.m-product-compact-brief.phase24` ngắn gọn.

### 5.3 Gộp 3 KPI lớn thành một dòng

Bỏ 3 card lớn:

```text
Số dòng
Tổng SL giao
Giá trị hàng
```

Thay bằng:

```text
{n} dòng · {SL} SL · Giá trị {tiền}
```

### 5.4 Sticky bottom không lặp thông tin

`renderWorkflowBar()` được đổi thành action theo tab:

| Tab | Sticky bottom mới |
|---|---|
| Hàng giao | `Trả hết đơn` + `Xác nhận hàng & thu tiền` |
| Hàng trả | `Lưu hàng trả & sang Thu tiền` + `Xóa hàng trả` |
| Thu tiền | `Còn thiếu` + `Xác nhận thu tiền` |
| Đối soát | `Hoàn tất - về danh sách` |
| Công nợ | Không hiển thị sticky action mặc định |

Sticky bottom không còn lặp:

```text
Tên khách
Mã khách / mã đơn
Số tiền phải thu
Nút Hàng / Trả / Thu cùng lúc
```

## 6. Thông tin đã loại bỏ khỏi vùng hiển thị chính

```text
Card khách lớn bo góc cao
Block hướng dẫn xanh nhiều dòng
3 KPI card lớn trong tab Hàng giao
Tên khách/mã khách/số tiền ở sticky bottom
Nút Hàng/Trả/Thu hiển thị cùng lúc ở sticky bottom
```

## 7. Xác nhận phạm vi

```text
Không sửa backend.
Không đổi API contract.
Không đổi business rule.
Không đổi logic AR/Fund/Inventory.
Không xóa tab nghiệp vụ đã chốt.
Không quay lại thiết kế shipper app.
```

## 8. Test đã chạy

### Dependency

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

### Source bundle / size / syntax

```bash
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
```

Kết quả:

```text
[source-bundles] BUILT 19 bundles
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 953 JavaScript files
```

### Targeted UI tests

```bash
node --test \
 test/delivery-compact-customer-workflow-ui-p1-static.test.js \
 test/delivery-customer-workflow-ui-p1-static.test.js \
 test/delivery-real-workflow-ui-p1-static.test.js \
 test/delivery-mobile-ui-p0p1-static.test.js \
 test/delivery-mobile-performance-p1-static.test.js \
 test/delivery-reconciliation-report-p1-static.test.js
```

Kết quả:

```text
30 tests
30 pass
0 fail
```

### Broader manual targeted command note

Đã chạy thêm nhóm rộng gồm `delivery-*`, `mobile-delivery-*`, `fund-delivery-*`, `return-order-delivery-staff-list`, `search-fields-delivery-core-config-static` bằng `node --test` trực tiếp. Nhóm delivery/mobile liên quan pass; 5 lỗi phát sinh từ các test `fund-delivery-submission-split-tabs-static` khi chạy trực tiếp do test đọc `public/index.html`/CSS manifest theo cách không giống runner chính. `npm test` không có lỗi fund này.

### Full test

```bash
npm test
```

Kết quả:

```text
# tests 1044
# pass 1041
# fail 2
# skipped 1
```

Hai lỗi fail vẫn là snapshot legacy cũ, không liên quan Phase24:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

## 9. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Nút sticky bottom dùng `form=` submit ngoài form, cần test thật trên thiết bị mobile cũ | Minor | Trình duyệt mobile hiện đại hỗ trợ tốt; nên kiểm tra thực tế trên máy NVGH |
| Header compact có thể cắt địa chỉ dài bằng ellipsis | Minor | Cố ý để giảm chiều cao; địa chỉ đầy đủ vẫn có ở card danh sách khách trước đó |
| Công nợ không có sticky action mặc định | Minor | Không thuộc trọng tâm tab Hàng giao; chưa đổi nghiệp vụ công nợ |

## 10. Kết luận

Phase24 đã xử lý đúng vấn đề trong ảnh: giảm vùng thông tin lặp, nén header khách, bỏ block hướng dẫn lớn, bỏ 3 KPI lớn trong tab Hàng giao và chuyển sticky bottom thành action đúng theo tab hiện tại. Luồng Phase23 vẫn được giữ nguyên.
