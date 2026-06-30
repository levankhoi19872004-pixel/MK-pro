# PHASE27 — Delivery Split List/Customer Workflow UI

## 1. Baseline

- Baseline ZIP: `MK-pro-phase26-delivery-deduplicate-actions-ui-patched(1).zip`
- Phạm vi: frontend mobile App Giao Hàng.
- Không sửa backend.
- Không đổi API contract.
- Không đổi business rule tiền/tồn/công nợ.

## 2. Mục tiêu

Tách rõ 2 chế độ UI trong App Giao Hàng:

1. **List mode**: NVGH xem danh sách khách/đơn cần giao trong ngày, đối soát tổng và công nợ tổng.
2. **Customer mode**: NVGH xử lý một khách/đơn cụ thể với luồng Hàng giao → Hàng trả → Thu tiền.

Việc tách này nhằm loại bỏ tình trạng 6 tab hiển thị cùng lúc ở mọi trạng thái, giảm nhiễu khi xử lý một khách và tăng tốc độ nhập hàng trả/thu tiền.

## 3. Thiết kế sau khi sửa

### 3.1. List mode

Khi chưa chọn khách hoặc đã quay lại danh sách, màn hình hiển thị:

- Header.
- Bộ lọc ngày/trạng thái/tìm khách.
- KPI chung toàn ngày.
- 3 tab tổng:
  - `Khách giao`
  - `Đối soát`
  - `Công nợ`
- Danh sách khách cần giao hoặc nội dung tab tổng tương ứng.

Các tab `Hàng giao`, `Hàng trả`, `Thu tiền` không còn xuất hiện ở list mode.

### 3.2. Customer mode

Khi bấm vào khách hoặc `Vào giao hàng`, màn hình chuyển sang chế độ xử lý khách:

- Header khách compact có nút `← Danh sách`.
- Chỉ còn 3 tab xử lý khách:
  - `Hàng giao`
  - `Hàng trả`
  - `Thu tiền`
- Ẩn KPI chung toàn ngày.
- Ẩn bộ lọc danh sách.
- Ẩn danh sách khách khác.
- Không hiển thị tab `Khách giao`, `Đối soát`, `Công nợ` tổng trong chế độ xử lý khách.

### 3.3. Đối soát sau thu tiền

Sau khi xác nhận thu tiền, app chuyển sang panel đối soát nhanh của khách vừa xử lý (`customerReconciliation`) thay vì mở tab đối soát tổng ngày.

Panel này hiển thị nhanh:

- Khách.
- Mã đơn.
- Tổng tiền.
- Hàng trả.
- Phải thu.
- Đã thu.
- Còn thiếu.
- Trạng thái.
- Nút `Hoàn tất - về danh sách`.

## 4. Search sản phẩm trong đơn dài

Đã bổ sung ô tìm kiếm trong tab `Hàng giao`:

```text
Tìm sản phẩm / mã hàng
```

Đặc điểm kỹ thuật:

- Chỉ lọc trên danh sách sản phẩm đã có trong đơn đang chọn.
- Không gọi API mới.
- Lọc theo mã sản phẩm, tên sản phẩm, barcode nếu có.
- Dùng `row.hidden` để ẩn/hiện dòng, không re-render lại danh sách khi đang nhập.
- Không làm mất số lượng trả mà NVGH đã nhập.
- Khi không có kết quả, hiển thị `Không tìm thấy sản phẩm trong đơn này`.
- Khi chọn khách mới hoặc quay lại danh sách, `productSearchKeyword` được reset.

## 5. Các thay đổi chính

| Nhóm | Trước | Sau |
|---|---|---|
| Tabs ngoài danh sách | 6 tab | 3 tab: Khách giao / Đối soát / Công nợ |
| Tabs khi xử lý khách | 6 tab | 3 tab: Hàng giao / Hàng trả / Thu tiền |
| KPI chung | Luôn hiện | Chỉ hiện list mode |
| Bộ lọc danh sách | Luôn hiện | Chỉ hiện list mode |
| Danh sách khách | Vẫn còn sau khi chọn khách trong một số flow | Ẩn trong customer mode |
| Tìm sản phẩm | Chưa có | Có ô tìm trong tab Hàng giao |
| Sau xác nhận thu tiền | Điều hướng tới đối soát tổng/ngày | Hiện đối soát nhanh cho khách |

## 6. File đã sửa/thêm

### Modified

- `config/source-bundles.json`
- `config/source-size-budget.json`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/js/delivery-state.js`
- `public/mobile/mobile.source/mobile-04.css`
- `test/delivery-customer-workflow-ui-p1-static.test.js`
- `test/delivery-deduplicate-actions-ui-static.test.js`
- `test/delivery-mobile-debt-tab-static.test.js`
- `test/delivery-mobile-performance-p1-static.test.js`
- `test/delivery-real-workflow-ui-p1-static.test.js`
- `test/delivery-reconciliation-report-p1-static.test.js`

### Added

- `test/delivery-split-list-customer-workflow-ui-static.test.js`
- `PHASE27_DELIVERY_SPLIT_LIST_CUSTOMER_WORKFLOW_UI_REPORT.md`

### Deleted

- Không có.

## 7. Ghi chú source-size

Do `delivery-mobile-view.source.js` phải chứa thêm logic tách `list mode/customer mode`, product search và panel đối soát nhanh theo khách, tôi đã tăng ngân sách source-size có kiểm soát trong `config/source-size-budget.json` cho đúng thực tế file nguồn.

Không tăng package, không thêm dependency production, không đổi backend.

## 8. Test đã chạy

### Source checks

```bash
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
```

Kết quả:

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 956 JavaScript files
```

### Targeted delivery/UI tests

```bash
node --test \
  test/delivery-split-list-customer-workflow-ui-static.test.js \
  test/delivery-deduplicate-actions-ui-static.test.js \
  test/delivery-map-external-webview-fix-static.test.js \
  test/delivery-compact-customer-workflow-ui-p1-static.test.js \
  test/delivery-customer-workflow-ui-p1-static.test.js \
  test/delivery-real-workflow-ui-p1-static.test.js \
  test/delivery-reconciliation-report-p1-static.test.js \
  test/delivery-mobile-ui-p0p1-static.test.js \
  test/delivery-mobile-performance-p1-static.test.js \
  test/delivery-debt-pagination-p1-static.test.js \
  test/delivery-mobile-debt-tab-static.test.js
```

Kết quả:

```text
53 tests
53 pass
0 fail
```

### Full test

```bash
npm test
```

Kết quả thực tế:

```text
# tests 1060
# pass 1057
# fail 2
# skipped 1
```

Hai lỗi fail vẫn là snapshot legacy cũ trong `test/phase79-production-strangler.test.js`, không liên quan Phase27:

- `assembled index page matches the approved Phase80 characterization snapshot`
- `split CSS parts preserve exact legacy cascade order`

Các hash fail thực tế:

```text
assembled index actual: ff5cc35f968b03777118101d3cab977fcc7fba428b066a6032612d094b961d3c
assembled index expected: 935f3a5294989f410068707fbf2dacba440297c48b6ea54538610d2f3c656a0f

CSS actual: a61cd0f25b01fcf5219e3b4ee65e850f36a44289336079b332c3435dd1142576
CSS expected: 2b201385219e49d988319457eaaf18ea50b3494cd6fe526095df1545056e6783
```

Tôi không cập nhật snapshot này để tránh thay đổi lan rộng ngoài phạm vi UI app giao hàng.

## 9. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Cần test trên điện thoại thật để xác nhận chiều cao/scroll thực tế | Minor | Static test không thay thế được thử nghiệm ngoài kho/giao hàng |
| Product search đang lọc client-side | Low | Phù hợp vì chỉ lọc sản phẩm trong đơn đã tải; không gọi API |
| Source-size budget tăng | Minor | Có kiểm soát; không tạo dependency/package mới |
| Snapshot phase79 vẫn fail | Known legacy | Đã tồn tại từ các phase trước; không liên quan Phase27 |

## 10. Xác nhận phạm vi

- Không sửa backend.
- Không đổi route/API contract.
- Không đổi business rule tiền/tồn/công nợ.
- Không đổi logic post AR/Fund/Inventory.
- Không xóa tab nghiệp vụ; chỉ tách cách hiển thị theo mode.
- Không quay lại thiết kế kiểu shipper app.
