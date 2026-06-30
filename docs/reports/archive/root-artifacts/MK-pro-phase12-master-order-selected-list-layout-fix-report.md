# MK-pro Phase 12 — Master Order Selected List Layout Fix Report

## 1. Phạm vi

Sửa lỗi hiển thị trong modal **Tạo đơn tổng**, khu vực **3. Danh sách đơn con được gộp**.

Không sửa backend, không sửa API contract, không sửa logic tạo/gộp đơn, không sửa import/export/tồn kho/công nợ/trả hàng.

## 2. File render và file liên quan

| Nhóm | File | Vai trò |
|---|---|---|
| HTML fragment | `public/fragments/index/03-index-body.html` | Khai báo modal `#masterOrderModal`, panel `#selectedMasterChildOrderList` |
| Frontend JS | `public/js/app/06-master-delivery.js` | Hàm `renderSelectedGroupedChildOrders()` render header và dòng đơn con đã đưa vào danh sách gộp |
| CSS scoped modal | `public/css/30-master-orders.css` | Layout modal tạo đơn tổng và bản vá riêng cho panel Layer 3 |
| CSS nền liên quan | `public/css/base/00-base-06.css` | Định nghĩa chung `.master-child-one-line`, `.master-child-header` |
| CSS global liên quan | `public/css/base/00-base-01.css` | `.order-list { display:grid; gap:... }` gây ảnh hưởng đến panel Layer 3 |

## 3. Root cause

Nguyên nhân chính nằm ở việc `#selectedMasterChildOrderList` có class:

```html
class="order-list compact-order-list selected-master-child-list"
```

Trong CSS nền, `.order-list` đang dùng:

```css
.order-list {
  display: grid;
  gap: 14px;
}
```

Trong modal tạo đơn tổng, `#selectedMasterChildOrderList` lại được đặt `flex: 1 1 auto` và chiếm toàn bộ chiều cao còn lại của panel. Khi một grid container có chiều cao lớn và các auto-row không được khóa chiều cao, browser có thể stretch các grid rows theo chiều dọc. Kết quả:

- Header trở thành một grid item bị kéo cao.
- Dòng dữ liệu là grid item khác cũng bị tách xuống vùng dưới.
- Header và row không còn nằm sát nhau.
- Panel tạo ra khoảng trắng lớn như ảnh lỗi.

Đây là lỗi layout do CSS grid/flex kết hợp, không phải lỗi dữ liệu hay API.

## 4. Phương án đã chọn

Chọn **Phương án A — Scoped CSS + chỉnh render nhẹ**.

Mục tiêu:

- Chỉ sửa panel Layer 3: `#selectedMasterChildOrderList.selected-master-child-list`.
- Không sửa global `.order-list`, `.card`, `.panel`, `table`, `th`, `td`.
- Không ảnh hưởng panel bên trái `#unmergedOrderList`.
- Không ảnh hưởng logic checkbox/bỏ khỏi danh sách gộp.

## 5. File đã sửa

### 5.1. `public/js/app/06-master-delivery.js`

Hàm sửa:

```js
renderSelectedGroupedChildOrders()
```

Thay đổi:

- Header Layer 3 có thêm class `master-selected-child-header`.
- Row Layer 3 có thêm class `master-selected-child-row`.
- Header + rows được bọc trong `.master-selected-child-list-shell` để CSS có thể điều khiển layout theo `flex-column`, tránh kế thừa grid auto-row stretch từ `.order-list`.

### 5.2. `public/css/30-master-orders.css`

Thêm block:

```css
/* MASTER_ORDER_SELECTED_LIST_LAYOUT_FIX_START ... */
```

Nội dung chính:

- Override riêng `#selectedMasterChildOrderList.selected-master-child-list` về `display:block`.
- Tạo `.master-selected-child-list-shell` dạng `flex-column`, `gap:4px`.
- Header sticky, chiều cao gọn.
- Row min-height gọn, nằm ngay dưới header.
- Checkbox căn giữa.
- Cột tiền căn phải, giữ numeric tabular.
- Empty state gọn, không chiếm chiều cao bất thường.
- Nếu bảng hẹp, cho scroll ngang trong panel Layer 3.

## 6. Old/New diff quan trọng

### JS — trước

```js
const header = `<div class="master-child-one-line master-child-header" aria-hidden="true">
  <span></span><span>Mã đơn</span><span>Khách hàng</span><span>NVBH</span><span>Ngày bán</span><span>Giá trị</span>
</div>`;

return `<label class="master-child-one-line${selectedClass}" ...>`;

selectedMasterChildOrderList.innerHTML = header + body;
```

### JS — sau

```js
const header = `<div class="master-child-one-line master-child-header master-selected-child-header" aria-hidden="true">
  <span></span><span>Mã đơn</span><span>Khách hàng</span><span>NVBH</span><span>Ngày bán</span><span>Giá trị</span>
</div>`;

return `<label class="master-child-one-line master-selected-child-row${selectedClass}" ...>`;

selectedMasterChildOrderList.innerHTML = `<div class="master-selected-child-list-shell">${header}${body}</div>`;
```

### CSS — bản vá chính

```css
#masterOrderModal #selectedMasterChildOrderList.selected-master-child-list{
  display:block!important;
  align-content:start!important;
  gap:0!important;
  min-height:0!important;
  padding:6px!important;
  overflow-y:auto!important;
  overflow-x:auto!important;
}

#masterOrderModal #selectedMasterChildOrderList.selected-master-child-list .master-selected-child-list-shell{
  display:flex!important;
  flex-direction:column!important;
  gap:4px!important;
  min-width:720px;
  width:100%;
}
```

## 7. Kết quả mong đợi sau sửa

| Tiêu chí | Kết quả |
|---|---|
| Header và row còn tách xa nhau | Đã xử lý |
| Header và row cùng hệ cột | Đã xử lý bằng grid-template scoped |
| Row nằm ngay dưới header | Đã xử lý bằng flex-column shell |
| Checkbox căn giữa | Đã xử lý |
| Cột `Giá trị` căn phải | Đã xử lý |
| Empty state không kéo cao bất thường | Đã xử lý |
| Danh sách nhiều đơn có scroll | Giữ `overflow-y:auto` |
| Không ảnh hưởng panel trái | Scoped theo `#selectedMasterChildOrderList.selected-master-child-list` |

## 8. Test đã chạy

### Syntax check

```text
npm run check:syntax
SYNTAX_OK 936 JavaScript files
```

### JS syntax check trực tiếp file đã sửa

```text
node --check public/js/app/06-master-delivery.js
OK
```

### Source bundle check

```text
npm run check:source-bundles
FAILED: Cannot find module 'terser'
```

Lý do: môi trường ZIP giải nén hiện tại thiếu dependency `terser`. Đây là lỗi môi trường test/dependency chưa cài `node_modules`, không phải lỗi cú pháp từ bản vá.

### Full test

```text
npm test
FAILED tại pretest vì npm run check:source-bundles thiếu module 'terser'
```

Do `npm test` chạy `pretest` gồm `check:source-bundles`, nên cũng dừng vì thiếu `terser`.

## 9. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Cần kiểm chứng trực quan trên trình duyệt thật | Medium | Đã sửa đúng root cause CSS, nhưng vẫn cần mở màn hình thật để xác nhận khoảng cách/cột theo data thực tế |
| Nếu có CSS khác load sau `30-master-orders.css` override cùng selector | Low | Selector bản vá có độ cụ thể cao và dùng scoped `!important` cho các thuộc tính quan trọng |
| Danh sách có mã đơn/NVBH quá dài | Low | Đã dùng ellipsis và scroll ngang trong panel |

## 10. Hướng rollback

Rollback 2 thay đổi:

1. Xóa block CSS:

```css
/* MASTER_ORDER_SELECTED_LIST_LAYOUT_FIX_START ... */
```

trong `public/css/30-master-orders.css`.

2. Khôi phục `renderSelectedGroupedChildOrders()` trong `public/js/app/06-master-delivery.js` về dạng:

```js
selectedMasterChildOrderList.innerHTML = header + body;
```

và bỏ class `master-selected-child-header`, `master-selected-child-row`, wrapper `master-selected-child-list-shell`.

## 11. Ghi chú triển khai

Sau khi deploy lên Render, cần hard refresh trình duyệt hoặc xóa cache CSS/JS nếu vẫn nhìn thấy layout cũ. File CSS hiện được link với query version cũ trong `public/index.shell.html`, nên nếu Render/CDN/browser cache mạnh, có thể cần tăng version query cho CSS ở lần deploy tiếp theo.
