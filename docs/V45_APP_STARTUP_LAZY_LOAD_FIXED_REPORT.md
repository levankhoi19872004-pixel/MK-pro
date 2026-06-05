# V45 App Startup Lazy Load Fixed

## Mục tiêu
Sửa lỗi mở phần mềm phản hồi rất lâu/đơ do frontend gọi đồng loạt nhiều API ngay khi khởi động.

## Đã chỉnh sửa

### 1. public/app.js
- Bỏ toàn bộ chuỗi gọi API khi mở trang:
  - loadProducts
  - loadCustomers
  - loadStock
  - loadImportOrders
  - loadSalesOrders
  - loadMasterOrderModule
  - loadUnmergedReturnOrders
  - loadMasterReturnOrders
  - loadDeliveryToday
  - loadDebts
  - loadReceipts
  - loadCashbook
  - loadUsers
  - loadPromotions
  - loadSystemStatus
- Thay bằng cơ chế mở tab nào load tab đó: `loadTabDataOnce(tabName)`.
- Server health, import field, custom import templates chạy nền bằng `setTimeout`, không khóa UI.
- Tab đang mở ban đầu mới được load dữ liệu.

### 2. public/js/app/01-utils-print-tabs.js
- `setupTabs()` không còn `await` nhiều API trực tiếp khi click tab.
- Click tab chỉ đổi giao diện ngay, sau đó gọi `window.V45LoadTabDataOnce()` để tải dữ liệu nền.
- `checkServer()` dùng timeout 5 giây, không treo ở trạng thái “Đang kiểm tra server...” quá lâu.

### 3. public/js/utils/v45-common-utils.js
- Thêm hàm dùng chung:
  - `window.debounce`
  - `window.fetchWithTimeout`
  - `window.runSoon`
- Tránh lỗi `debounce is not defined` ở các module.

### 4. public/js/app/02-products.js
- API danh sách sản phẩm dùng `fetchWithTimeout(..., 10000)`.
- Nếu API sản phẩm bị chậm, frontend tự thoát lỗi thay vì treo mãi.

### 5. public/js/app/03-customers-autocomplete.js
- API danh sách khách hàng dùng `fetchWithTimeout(..., 10000)`.
- Nếu API khách hàng bị chậm, frontend không khóa toàn bộ app.

## Hiệu quả kỳ vọng
- Mở phần mềm không còn gọi đồng loạt 10+ API.
- Giao diện chuyển tab phản hồi ngay.
- API nào chậm chỉ ảnh hưởng tab đó, không làm đơ toàn bộ phần mềm.
- Dễ kiểm tra tiếp API chậm bằng Network vì mỗi tab gọi ít request hơn.
