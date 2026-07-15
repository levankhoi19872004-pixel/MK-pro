# Filter / KPI Scope Governance Contract

## Mục tiêu

Mọi màn hình có filter/search/list/KPI/summary/chart/export phải khai báo và giữ cùng một canonical scope. Khi có ngoại lệ hợp lệ, ngoại lệ phải explicit để người dùng và test hiểu đúng phạm vi số liệu.

## EXACT_SCOPE

Mặc định cho list API có KPI. Toàn bộ active filters áp dụng đồng nhất cho list, KPI, summary, count/total, chart và export.

Đúng: `q`, `status`, `collectorType`, `fromDate`, `toDate` cùng đi vào query canonical, list dùng pagination, summary dùng aggregate trên full matching scope.

Sai: list lọc `q` ở frontend nhưng KPI lấy summary backend chưa có `q`.

## FACET_SCOPE

Dùng khi KPI là breakdown của một dimension. Base filters vẫn phải áp dụng cho KPI; chỉ facet dimension được bỏ khỏi KPI một cách explicit.

Ví dụ DMS Inventory: `search` là base filter, `type` là facet dimension. KPI tính trong `search` scope, list tính `search + type`.

## SELECTION_SCOPE

Dùng khi KPI cố ý tính trên tập user tick/chọn. Query scope và selection scope phải được phân biệt rõ.

Ví dụ Đơn giao hôm nay New: backend trả rows theo query filters; KPI thao tác/chốt sổ có thể tính theo NVBH/order được chọn trên UI.

## GLOBAL_EXPLICIT_SCOPE

Dùng cho KPI thật sự toàn cục hoặc balance snapshot. UI phải ghi rõ phạm vi, không được giả làm KPI của filtered list.

Ví dụ Fund Ledger: tồn tiền mặt/ngân hàng toàn quỹ cuối ngày là balance snapshot. Tổng thu/chi giao dịch vẫn là EXACT_SCOPE theo active transaction filters.

## Search Rules

Search phải được normalize, trim, giới hạn độ dài và escape regex. Không dùng raw user RegExp hoặc cho phép Mongo operator từ input.

## Pagination Rules

Pagination chỉ giới hạn rows/items của trang hiện tại. Pagination không được làm thay đổi KPI, summary, totalAmount, totalCount, status count hoặc export dataset.

## Export Rules

Export gắn với "bộ lọc hiện tại" phải dùng cùng canonical scope như list nhưng bỏ page/skip/limit. Nếu có hard safety limit, response phải có warning/truncation metadata.

## Frontend Post-Filter Rules

Main business table không được biến backend rows scope A thành scope B bằng `rows.filter(...)` trong khi KPI vẫn là scope A. Client-side filtering chỉ hợp lệ cho autocomplete, display-only local search, explicit facet, selection scope, hoặc payload đã tải toàn bộ và KPI cũng derive từ cùng scope.

## Summary Aggregation Rules

Không tính full-looking summary từ paginated rows:

```js
const items = await Model.find(filter).skip(skip).limit(limit);
const summary = items.reduce(...);
```

Summary full scope phải dùng cùng canonical filter qua `aggregate`, `$facet`, `countDocuments`, hoặc read-model summary query riêng.

## Performance Rules

Không sửa correctness bằng cách load toàn bộ collection vào Node.js rồi reduce. Ưu tiên aggregate, countDocuments, `$facet`, indexed match hoặc dedicated read-model summary.

## Security Rules

Search text phải escape regex, giới hạn độ dài và không cho raw Mongo operator. Tái sử dụng helper hiện có như `escapeRegex`/query guard khi phù hợp.

## Examples

Đúng: Debt Collections `q=33949` được gửi backend, list và summary cùng dùng filter đó, summary không bị `limit`.

Sai: Return Orders request `limit=50`, frontend hiển thị tổng giảm nợ bằng `rows.reduce(...)` rồi gọi đó là tổng toàn bộ.

Đúng: Fund balance label ghi "Tồn tiền mặt toàn quỹ cuối ngày"; transaction totals ghi "theo bộ lọc".

## Test Contract

Tests/audit guards phải phát hiện:

- summary sau `limit`;
- frontend post-filter main rows + backend summary;
- page rows reduce nhưng label là tổng;
- export/list param drift;
- truncated working set nhưng KPI không có metadata.

Tests/audit guards không được flag:

- `SELECTION_SCOPE` explicit;
- `FACET_SCOPE` explicit;
- `GLOBAL_EXPLICIT_SCOPE` explicit;
- autocomplete/local lookup.
