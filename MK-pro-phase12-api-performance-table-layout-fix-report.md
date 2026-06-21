# MK-Pro Phase 12 — API Performance Table Layout Fix Report

## 1. Tổng quan khảo sát

Baseline: `MK-pro-phase12-web-direct-import-commit-no-worker-patched.zip`.

Khu vực lỗi nằm trong tab hệ thống/API Monitor:

- HTML render màn hình: `public/fragments/index/07-index-body.html`
- JS render dữ liệu bảng: `public/js/app/09-system.js`
- Biến DOM liên quan: `public/js/app/state/00c-admin-system-state.js`
- CSS liên quan trực tiếp: `public/css/overrides/10-operational-02.css`
- CSS global có ảnh hưởng: `public/css/base/00-base-01.css`, `public/css/base/00-base-02.css`, `public/css/99-table-alignment.css`

Các bảng bị ảnh hưởng trong API Monitor:

- Tab 1 — Tất cả API: `#apiMonitorTable`
- Báo cáo API chạy chậm gần nhất: `#apiSlowTable`
- Tab 2 — Top API chậm nhất: `#apiTopSlowTable`
- Tab 3 — Top API gọi nhiều nhất: `#apiTopCalledTable`
- Tab 4 — API nhiều rows nhất: `#apiTopRowsTable`
- Tab 5 — Query Trace: `#apiTopQueryTraceTable`

## 2. Root cause

Nguyên nhân chính là bảng API Monitor đang dùng table global quá hẹp cho số lượng cột lớn.

Các điểm gây lỗi:

1. Bảng API Monitor có 9–13 cột nhưng đang dùng `<table>` mặc định, chỉ nhận `min-width` global khoảng 860–1050px.
2. CSS global `99-table-alignment.css` cho `.ui-data-table th` dùng:

```css
white-space: normal;
overflow-wrap: anywhere;
```

Khi bảng bị bóp hẹp, header như `MODULE`, `LẦN GỌI`, `TB QUERY` bị bẻ từng ký tự.

3. Các cột dài như `API` và `QUERY CHẬM NHẤT` không có width riêng, không có ellipsis/truncate rõ ràng.
4. Query Mongo dài làm table cố co giãn sai hoặc kéo cao row, dẫn đến layout rất khó đọc.
5. Các bảng trong API Monitor dùng chung `.table-wrap`, nên nếu sửa global `table`, `th`, `td` sẽ có nguy cơ làm lệch nhiều màn nghiệp vụ khác.

## 3. Vùng ảnh hưởng

Phạm vi sửa được giới hạn trong API Monitor.

Không sửa:

- Backend API
- Import/export
- Order/inventory/debt/fund business logic
- API contract
- Model/schema
- Worker/background job

Các class mới đều scoped dưới `.api-monitor-panel`, giảm rủi ro ảnh hưởng bảng khác.

## 4. Phương án đã triển khai

Đã triển khai theo Phương án A — tạo layout riêng cho API performance table.

### File 1: `public/fragments/index/07-index-body.html`

Thay các bảng API Monitor từ table mặc định:

```html
<div class="table-wrap api-monitor-table-wrap">
  <table>
```

sang table scoped:

```html
<div class="table-wrap api-monitor-table-wrap">
  <table class="api-performance-table api-performance-table--routes" data-table-align="off">
    <colgroup>
      <col class="api-col-module">
      <col class="api-col-api">
      <col class="api-col-number">
      <col class="api-col-query">
      <col class="api-col-status">
    </colgroup>
```

Ghi chú: mỗi bảng có `colgroup` riêng theo số cột thực tế.

### File 2: `public/css/overrides/10-operational-02.css`

Thêm CSS scoped:

```css
.api-monitor-panel .api-monitor-table-wrap {
  width: 100%;
  max-width: 100%;
  max-height: 360px !important;
  overflow: auto !important;
  overflow-y: auto !important;
  border-radius: 14px;
  scrollbar-gutter: stable;
}

.api-monitor-panel .api-performance-table {
  width: max-content !important;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed !important;
  background: #fff;
}

.api-monitor-panel .api-performance-table th,
.api-monitor-panel .api-performance-table td {
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  vertical-align: middle !important;
}
```

Bổ sung width riêng cho các nhóm cột:

```css
.api-col-time   { width: 165px; }
.api-col-module { width: 135px; }
.api-col-api    { width: 310px; }
.api-col-number { width: 92px; }
.api-col-query  { width: 520px; }
.api-col-input  { width: 260px; }
.api-col-status { width: 110px; }
```

Bổ sung ellipsis cho route/query dài:

```css
.api-monitor-panel .api-performance-table code,
.api-monitor-panel .api-monitor-api-cell,
.api-monitor-panel .api-monitor-query-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
```

### File 3: `public/js/app/09-system.js`

Bọc route/query bằng class riêng:

```html
<code class="api-monitor-api-cell" title="full route">...</code>
<code class="api-monitor-query-cell" title="full query">...</code>
```

Mục tiêu:

- Cột route/query dài không phá layout.
- Nội dung hiển thị ngắn bằng ellipsis.
- Full text vẫn xem được qua `title` khi hover.

## 5. Danh sách file đã sửa

| File | Loại thay đổi | Ghi chú |
|---|---|---|
| `public/fragments/index/07-index-body.html` | Sửa HTML | Thêm class table scoped, `data-table-align="off"`, `colgroup` cho 6 bảng API Monitor |
| `public/css/overrides/10-operational-02.css` | Sửa CSS | Thêm layout riêng cho API performance table, chống wrap từng ký tự, cố định width cột, ellipsis query |
| `public/js/app/09-system.js` | Sửa JS render | Thêm class `api-monitor-api-cell`, `api-monitor-query-cell`, bổ sung `title` cho route chậm |

Không thêm/xóa file nghiệp vụ.

## 6. Old/New diff quan trọng

### HTML

Old:

```html
<table>
```

New:

```html
<table class="api-performance-table api-performance-table--routes" data-table-align="off">
  <colgroup>
    <col class="api-col-module">
    <col class="api-col-api">
    <col class="api-col-number">
    <col class="api-col-query">
    <col class="api-col-status">
  </colgroup>
```

### CSS

Old:

```css
.api-monitor-table-wrap { max-height: 360px; overflow: auto; }
.api-monitor-table-wrap code { white-space: nowrap; font-size: 12px; }
```

New:

```css
.api-monitor-panel .api-performance-table th,
.api-monitor-panel .api-performance-table td {
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}
```

### JS

Old:

```js
<td><code title="${apiMonitorSafeText(row.slowestQueryLabel || '')}">${apiMonitorSlowestQueryText(row)}</code></td>
```

New:

```js
<td><code class="api-monitor-query-cell" title="${apiMonitorSafeText(row.slowestQueryLabel || '')}">${apiMonitorSlowestQueryText(row)}</code></td>
```

## 7. Kết quả test thực tế

### Syntax check

```text
npm run check:syntax
SYNTAX_OK 936 JavaScript files
```

### JS file check trực tiếp

```text
node --check public/js/app/09-system.js
OK

node --check public/js/app/state/00c-admin-system-state.js
OK
```

### Source bundle check

```text
npm run check:source-bundles
FAILED: Cannot find module 'terser'
```

Đây là lỗi môi trường test do ZIP giải nén không có `node_modules/terser`, không phải lỗi phát sinh từ thay đổi UI.

### Test suite

```text
node scripts/run-tests.js
FAILED do thiếu dependencies như mongoose/jsonwebtoken/@faker-js/faker/terser trong môi trường ZIP giải nén.
```

Một số test không phụ thuộc dependency vẫn pass, nhưng không thể kết luận full suite từ môi trường này. Cần chạy lại trên máy/CI đã `npm install` đầy đủ.

## 8. Kiểm tra acceptance criteria

| Tiêu chí | Trạng thái |
|---|---|
| Header không bị xuống từng ký tự | Đã xử lý bằng `white-space: nowrap`, `word-break: normal`, `overflow-wrap: normal` scoped |
| `Import/Export`, `Khác` không bị dọc từng ký tự | Đã xử lý bằng cột module 135px |
| Cột API đủ rộng | Đã xử lý bằng cột API 310px + ellipsis |
| Cột số liệu gọn | Đã xử lý bằng cột số 92px, tabular nums, căn phải |
| Query dài không phá layout | Đã xử lý bằng cột query 520px + monospace + ellipsis + title |
| Bảng không kéo cao bất thường | Đã xử lý bằng nowrap và code ellipsis |
| Scroll ngang trong container | Đã xử lý bằng `.api-monitor-table-wrap { overflow:auto }` và min-width riêng |
| Không ảnh hưởng màn khác | Đã scoped dưới `.api-monitor-panel` và dùng `data-table-align="off"` riêng cho API Monitor |

## 9. Rủi ro còn lại

1. Chưa chụp lại ảnh UI bằng browser thật trong môi trường này.
2. Nếu sau này thêm cột mới vào API Monitor, cần cập nhật `colgroup` tương ứng.
3. Nếu muốn xem full query dễ hơn, nên bổ sung popover/modal copy query ở phase sau. Hiện tại full query xem bằng `title` khi hover.

## 10. Hướng rollback

Rollback 3 file sau về baseline:

```text
public/fragments/index/07-index-body.html
public/css/overrides/10-operational-02.css
public/js/app/09-system.js
```

Hoặc xóa phần CSS bắt đầu từ comment:

```css
/* Phase12 API performance table layout fix */
```

và bỏ class `api-performance-table*`, `data-table-align="off"`, `colgroup` trong HTML.

## 11. Kết luận

Lỗi hiển thị trong ảnh là lỗi layout frontend do bảng API Monitor có quá nhiều cột nhưng đang chịu CSS table global. Bản vá đã tạo contract riêng cho API performance table, cố định width theo loại cột, tắt auto alignment global cho riêng bảng này, và dùng ellipsis cho route/query dài. Thay đổi nằm đúng phạm vi UI/CSS/JS của màn API Monitor, không tác động nghiệp vụ backend.
