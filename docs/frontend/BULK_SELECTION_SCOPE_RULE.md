# Bulk Selection Scope Rule

## Quy tắc bắt buộc

Mỗi khu vực danh sách chỉ có **một nút toggle** chuyển giữa `Chọn tất cả` và `Bỏ chọn tất cả`.

```text
Một toggle
→ một selection scope
→ một loại entity
→ một selection store
→ một tập bulk payload
```

Nút không được thay đổi checkbox, state hoặc payload của bảng, tab, popup hay loại thực thể khác.

## Selection scope

Mỗi container phải có mã duy nhất theo dạng:

```text
<module>-<entity>-<purpose>
```

Ví dụ:

- `delivery-order-list`
- `delivery-sales-staff-list`
- `debt-order-list`
- `sales-order-list`
- `master-order-list`
- `master-unmerged-child-list`
- `import-preview-valid-rows`

Nút toggle phải khai báo `data-selection-toggle`, `data-selection-scope`, `aria-controls`, `aria-label`, `aria-pressed` và `type="button"`.

## Caption

| Trạng thái | Caption |
| --- | --- |
| Chưa chọn hoặc chọn một phần | `Chọn tất cả` |
| Đã chọn toàn bộ dòng hợp lệ trong scope | `Bỏ chọn tất cả` |
| Không có dòng hợp lệ | Disabled |

Không dùng caption mơ hồ `Bỏ chọn`.

## Dataset

`Chọn tất cả` chỉ áp dụng cho các dòng hợp lệ đang hiển thị trong trang, tab và bộ lọc hiện tại. Không tự chọn dữ liệu chưa tải hoặc ở trang khác.

## View selection và command eligibility

- `viewSelectable`: được tick để xem, theo dõi hoặc tính KPI.
- `businessEligible`: được phép tham gia một command cụ thể.

Bulk payload command là giao của tập được chọn với tập đủ điều kiện nghiệp vụ. Không dùng eligibility của một command để khóa toàn bộ selection UI.

## Filter, reload, pagination và tab

- Đổi filter: mặc định clear/reconcile đúng scope, không clear scope khác.
- Reload: loại key không còn tồn tại hoặc không selectable rồi tính lại caption.
- Pagination: toggle chỉ áp dụng trang hiện tại.
- Đổi tab: mỗi tab có scope riêng.

## Không dùng selector toàn trang

Cấm dùng `document.querySelectorAll(':checked')` hoặc selector checkbox chung để dựng bulk payload. DOM fallback phải bắt đầu từ container của scope; ưu tiên state `Set` làm nguồn chuẩn.

## Delivery Today

`delivery-sales-staff-list` và `delivery-order-list` là hai scope độc lập:

- Nút toggle trong `Danh sách đơn` chỉ thay đổi `selectedOrderIds`.
- Checkbox NVBH chỉ thay đổi `selectedSalesmanKeys` qua thao tác NVBH.
- Bỏ chọn toàn bộ đơn không được bỏ tick NVBH.
- Payload closeout chỉ gồm đơn vừa selected vừa `closeoutEligible`.

## Test contract

Mỗi scope phải có test cho: chưa chọn, chọn một phần, chọn toàn bộ, không có dòng hợp lệ, dòng disabled, hai scope độc lập, duplicate/missing key, filter/reload và payload đúng scope.
