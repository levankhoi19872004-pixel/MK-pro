# PHASE32_INFORMATION_REPORTS_COMPLETION_REPORT

## 1. Tổng quan dự án / baseline

Baseline: `MK-pro-phase31-information-reports-patched.zip`

Stack kiểm tra:

- Node.js / Express
- MongoDB / Mongoose
- Frontend admin HTML + JavaScript thuần
- Report Center V2: `public/js/app/admin/08a-reports.js`
- Service báo cáo thông tin: `src/services/reports/InformationReportService.js`

Phase31 đã có 3 báo cáo thông tin ở backend/report center, nhưng thiếu phần UI hoàn chỉnh theo prompt: filter riêng, ẩn filter ngày, click dòng xem chi tiết, sort cột và test riêng.

---

## 2. Khảo sát hệ thống

### File đã kiểm tra

| File | Vai trò |
|---|---|
| `src/services/reports/InformationReportService.js` | Lấy dữ liệu sản phẩm/khách hàng/nhân viên |
| `src/services/reports/ReportCenterService.js` | Định nghĩa catalog report, columns, run report |
| `public/js/app/admin/08a-reports.js` | UI Report Center, load/filter/render table/export |
| `public/fragments/index/05-index-body.html` | DOM Report Center modal |
| `public/js/app/state/00c-admin-system-state.js` | Cache DOM reference cho Report Center |
| `public/css/95-report-center-popup.css` | CSS modal/report center |
| `test/` | Khu vực test hiện có |

### API liên quan

- `GET /api/reports/catalog`
- `GET /api/reports/run/:code`
- ExcelInteraction `REPORT` export thông qua Report Center

---

## 3. Nguyên nhân Phase31 chưa đạt đủ

| Vấn đề | Nguyên nhân |
|---|---|
| Thiếu filter riêng | Report definition chưa expose metadata `filters`; frontend chỉ có search chung |
| Date filter chưa ẩn | UI luôn render Kỳ báo cáo/Từ ngày/Đến ngày dù `dateMode: 'none'` |
| Thiếu modal/detail | Table chỉ render row, chưa có handler click dòng |
| Thiếu sort | Header table chỉ là text, chưa có `data-report-sort-key` |
| Rủi ro staff report | `staffInformationReport()` query `User.find({ $or: [...] })` kể cả khi staffRows rỗng |
| Thiếu test | Chưa có test riêng cho information reports Phase31 |

---

## 4. File đã sửa

| File | Nội dung sửa |
|---|---|
| `src/services/reports/ReportCenterService.js` | Thêm metadata `filters` cho `info-products`, `info-customers`, `info-staffs`; expose filters qua `publicDefinition()` |
| `src/services/reports/InformationReportService.js` | Bổ sung filter `phone`, `salesStaff`; sửa null-safe cho `staffInformationReport()` |
| `public/fragments/index/05-index-body.html` | Thêm vùng dynamic filters và detail drawer |
| `public/js/app/state/00c-admin-system-state.js` | Thêm DOM reference cho dynamic filters/detail drawer |
| `public/js/app/admin/08a-reports.js` | Render dynamic filters, ẩn date controls, gửi filters lên API/export, sort client-side, click row mở detail drawer |
| `public/css/95-report-center-popup.css` | CSS dynamic filters, sort button, detail drawer |

## 5. File thêm mới

| File | Nội dung |
|---|---|
| `test/information-reports-phase32-static.test.js` | Static/service/frontend contract tests cho Phase32 |
| `PHASE32_INFORMATION_REPORTS_COMPLETION_REPORT.md` | Báo cáo triển khai |

---

## 6. Diff Old/New chính

### 6.1. Report definitions có filter riêng

Old:

```js
roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
columns: [...]
```

New:

```js
roles: BUSINESS_ROLES, dateMode: 'none', exportType: '',
filters: [
  { key: 'code', label: 'Mã sản phẩm' },
  { key: 'name', label: 'Tên sản phẩm' },
  { key: 'category', label: 'Nhóm hàng' },
  { key: 'status', label: 'Trạng thái', type: 'select' }
],
columns: [...]
```

Lý do: frontend có thể render filter động theo từng report, không hard-code từng màn.

---

### 6.2. Public definition expose filters

Old:

```js
columns: definition.columns,
chart: definition.chart || null
```

New:

```js
filters: definition.filters || [],
columns: definition.columns,
chart: definition.chart || null
```

Lý do: `/api/reports/catalog` trả đủ metadata để UI tự render filter.

---

### 6.3. Ẩn filter ngày khi `dateMode: none`

New:

```js
function syncReportDateControls(definition){
  const hide=definition?.dateMode==='none';
  reportDateControlElements().forEach(element=>{
    element.hidden=hide;
    element.setAttribute('aria-hidden',hide?'true':'false');
  });
}
```

Lý do: báo cáo thông tin không phải báo cáo theo kỳ, không cần Kỳ báo cáo/Từ ngày/Đến ngày.

---

### 6.4. Gửi filter riêng lên API

Old:

```js
const search=String(reportSearchInput?.value||'').trim();
if(search)params.set('q',search);
```

New:

```js
const search=String(reportSearchInput?.value||'').trim();
if(search)params.set('q',search);
appendReportFilterParams(params,collectReportDynamicFilters());
```

Lý do: các filter như `code`, `name`, `phone`, `route`, `salesStaff`, `role` được gửi đúng về backend.

---

### 6.5. Staff report null-safe

Old:

```js
const users = await User.find({ $or: [ ... ] }).lean();
```

New:

```js
if (!staffRows.length) {
  return {
    staffs: [],
    summary: { rowCount: 0, activeCount: 0, inactiveCount: 0 },
    source: 'staffs+users'
  };
}
const users = userQueryParts.length ? await User.find({ $or: userQueryParts }).lean() : [];
```

Lý do: không query `$or` rỗng/vô nghĩa; trả kết quả rỗng an toàn.

---

### 6.6. Sort cột client-side

New:

```js
<button data-report-sort-key="...">Tên cột ▲/▼</button>
```

và:

```js
if(reportCenterState.sortKey===key){
  reportCenterState.sortDirection=reportCenterState.sortDirection==='asc'?'desc':'asc';
}else{
  reportCenterState.sortKey=key;
  reportCenterState.sortDirection='asc';
}
renderReportTable(reportCenterState.activePayload);
```

Lý do: sort cơ bản text/number/date, không đổi backend contract.

---

### 6.7. Click dòng mở detail drawer

New:

```js
<tr data-report-row-index="0" class="is-detail-row" tabindex="0">
```

và:

```js
function openReportRowDetail(rowIndex){
  const row=reportCenterState.visibleRows?.[Number(rowIndex)];
  reportRowDetailBody.innerHTML=columns.map(...).join('');
  reportRowDetailDrawer.hidden=false;
}
```

Lý do: xem chi tiết ngay tại modal, không chuyển trang.

---

## 7. Test thực tế

### 7.1. Syntax check

Command:

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 964 JavaScript files
```

### 7.2. Test riêng Phase32

Command:

```bash
node --test test/information-reports-phase32-static.test.js
```

Kết quả:

```text
# pass 3
# fail 0
```

### 7.3. check:source-bundles

Command:

```bash
npm run check:source-bundles
```

Kết quả: Không chạy được trong môi trường kiểm tra do thiếu `node_modules/terser`:

```text
Error: Cannot find module 'terser'
```

Đây là hạn chế môi trường giải nén ZIP hiện tại, không phải lỗi syntax của source.

---

## 8. Regression checklist

| Hạng mục | Kết quả |
|---|---|
| Không tạo collection mới | Đạt |
| Không sửa schema MongoDB | Đạt |
| Không đổi business rule | Đạt |
| Không dùng `inventorySnapshots` | Đạt |
| Báo cáo doanh số | Không sửa logic |
| Báo cáo công nợ | Không sửa logic |
| Báo cáo tồn kho | Không sửa logic |
| Export Excel cũ | Không đổi contract; chỉ bổ sung dynamic filters cho REPORT export hiện hành |
| Menu báo cáo cũ | Không đổi cấu trúc cũ |
| App giao hàng | Không sửa |
| App bán hàng | Không sửa |

---

## 9. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---|---|
| Pagination vẫn là memory pagination sau khi service lấy tối đa 10.000 dòng | Medium | Phase32 cố ý chưa chuyển MongoDB skip/limit để tránh đụng rộng Report Center |
| Staff/User identity chưa hợp nhất triệt để | Medium | Phase32 chỉ null-safe; nếu có users không có staffs thì vẫn có thể thiếu trong báo cáo nhân viên |
| Detail drawer dùng dữ liệu row hiện có | Low | Chưa gọi API detail riêng; phù hợp P1 nội bộ |
| Sort client-side chỉ sort dữ liệu trang hiện tại | Low/Medium | Không phá pagination hiện có; nếu muốn sort toàn bộ dataset cần Phase sau với backend sort |

---

## 10. Kết luận

Phase32 đã hoàn thiện đúng phạm vi P1:

- Có filter riêng theo từng báo cáo thông tin.
- Report `dateMode: none` ẩn filter ngày/kỳ.
- Click dòng mở detail drawer.
- Header table sort được tăng/giảm.
- Staff report null-safe khi không có staffRows.
- Có test riêng cho 3 báo cáo thông tin.
- Syntax check pass.

Chưa làm pagination MongoDB production-grade vì phạm vi này ảnh hưởng rộng và nên tách thành Phase riêng nếu cần.
