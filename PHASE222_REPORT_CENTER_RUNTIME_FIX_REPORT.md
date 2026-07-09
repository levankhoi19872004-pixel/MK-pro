# PHASE222_REPORT_CENTER_RUNTIME_FIX_REPORT

## 1. Lỗi thực tế

Màn **Báo cáo / Report Center V2** mở được khung giao diện nhưng phần **Danh mục báo cáo** báo lỗi `Lỗi hệ thống, vui lòng thử lại sau`; danh sách báo cáo không hiển thị nên các thao tác Tìm kiếm / Xóa lọc / Tải lại không có dữ liệu để thao tác.

## 2. Root cause chính xác

Root cause là backend route `GET /api/reports/catalog` vẫn còn mounted, nhưng khi controller gọi `reportService.catalog()` thì lazy facade `src/services/reports/ReportServiceFacade.js` require sai đường dẫn module.

File lỗi:

```txt
src/services/reports/ReportServiceFacade.js
```

Các module path cũ dạng:

```js
'./reports/ReportCenterService'
'./reports/SalesReportService'
'./reports/InventoryReportService'
```

Trong khi `ReportServiceFacade.js` đã nằm trong thư mục:

```txt
src/services/reports/
```

Nên Node resolve thành đường dẫn sai:

```txt
src/services/reports/reports/ReportCenterService.js
```

Kết quả là `GET /api/reports/catalog` phát sinh `MODULE_NOT_FOUND`, backend trả 500, frontend chỉ hiện generic error.

## 3. Endpoint frontend đã gọi lúc lỗi

Frontend Report Center V2 gọi đúng endpoint canonical:

```txt
GET /api/reports/catalog
```

Endpoint không sai. Lỗi nằm ở backend lazy facade require path.

## 4. Backend status/error lúc lỗi

Reproduce trực tiếp trước khi sửa:

```bash
node -e "const s=require('./src/services/reportService'); console.log(s.catalog({role:'admin'}))"
```

Lỗi:

```txt
Error: Cannot find module './reports/ReportCenterService'
Require stack:
- src/services/reports/ReportServiceFacade.js
- src/services/reportService.js
```

Trong runtime Express, lỗi này tương ứng `GET /api/reports/catalog` trả 500 và UI hiện `Lỗi hệ thống, vui lòng thử lại sau`.

## 5. File đã sửa

```txt
src/services/reports/ReportServiceFacade.js
public/js/app/admin/08a-reports.js
src/config/readEndpointBudgets.js
config/canonical-flows.json
test/report-center-route-contract.test.js
test/report-center-frontend-fetch-static.test.js
test/report-center-catalog-runtime-static.test.js
PHASE222_REPORT_CENTER_RUNTIME_FIX_REPORT.md
```

## 6. API contract sau sửa

Route catalog giữ nguyên canonical contract:

```txt
GET /api/reports/catalog
```

Response contract:

```json
{
  "ok": true,
  "categories": [],
  "reports": []
}
```

Route này:

- Có auth/role guard qua `reportCenterAccess`.
- Chỉ trả catalog definition.
- Không ghi DB.
- Không khởi tạo workbook Excel/SSE khi chỉ load catalog.
- Không load dataset báo cáo nặng.

## 7. Report catalog đã tải lại thế nào

Sau sửa, kiểm chứng trực tiếp:

```bash
node -e "const s=require('./src/services/reportService'); console.log(typeof s.catalog); console.log(s.catalog({role:'admin'}).reports.length);"
```

Kết quả:

```txt
function
19
```

Controller `reportCatalog` cũng được test trực tiếp và trả JSON `{ ok: true, reports: [...], categories: [...] }`.

## 8. Xuất hóa đơn/SSE có bị ảnh hưởng không

Không sửa logic SSE/VAT export.

Các phần sau được giữ nguyên:

```txt
Xuất hóa đơn VAT
Xuất hóa đơn không VAT
Xuất Excel SSE
SSE export theo NVGH
Không quay về export theo cửa hàng
Không fake XLSX khi mapping lỗi
```

Targeted test nhóm SSE/report đã pass.

## 9. Test đã chạy

Đã chạy pass:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run check:syntax
npm run check:source-bundles
npm run check:source-size
node scripts/audit-dead-code.js
node scripts/audit-flow-usage.js
node scripts/verify-runtime-flows.js
node --test test/report-center-route-contract.test.js test/report-center-frontend-fetch-static.test.js test/report-center-catalog-runtime-static.test.js test/report-center-v2-unit.test.js test/report-center-v2-static.test.js
node --test test/*report* test/*sse* test/*runtime* test/*flow* test/*read*
```

Kết quả chính:

```txt
check:syntax → SYNTAX_OK 1369 JavaScript files
check:source-bundles → OK 19 bundles
check:source-size → OK
audit-dead-code → OK
audit-flow-usage → OK canonical=29 retired=9 fetches=263 unmatched=0 warnings=0
verify-runtime-flows → OK canonical=29 retired=9 routeChecks=72 unmatchedFetches=0 retiredHits=0
Report Center targeted tests → 13 pass / 0 fail
Report/SSE/runtime/flow/read targeted tests → 267 pass / 0 fail / 1 skipped
```

`npm test` full đã chạy sau khi cài dependency nhưng bị timeout bởi giới hạn sandbox. Trước timeout chưa ghi nhận `not ok` trong log kiểm tra được; một batch 133 tests cuối cùng pass 133/0. Cần chạy lại full `npm test` trên máy dev/CI nếu muốn bằng chứng full suite hoàn tất 100%.

## 10. Kết quả runtime/manual nếu có

Không chạy browser manual trong sandbox. Đã xác minh bằng route/controller/service contract và audit script:

```txt
GET /api/reports/catalog không còn lỗi MODULE_NOT_FOUND.
Frontend không fetch endpoint retired/orphan cho Report Center.
Audit flow không có unmatched fetch.
```

Khi deploy/dev local, mở màn **Báo cáo** và kiểm tra Network:

```txt
GET /api/reports/catalog → 200 JSON
Không còn toast Lỗi hệ thống
Danh mục báo cáo hiển thị
Tìm kiếm/Xóa lọc/Tải lại hoạt động trên catalog
```

## 11. Rủi ro còn lại

- Chưa có bằng chứng browser Network thật trong sandbox.
- Full `npm test` chưa hoàn tất do timeout môi trường, dù targeted suite liên quan đã pass.
- Nếu production user có role ngoài `admin/manager/accountant/warehouse/sales`, route có thể trả 403 theo guard hiện tại; không thay đổi guard vì ảnh chụp là tài khoản admin và root cause thực là `MODULE_NOT_FOUND`.

## 12. ZIP output

```txt
MK-pro-phase222-report-center-runtime-fix.zip
```
