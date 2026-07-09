# PHASE223 - DELIVERY TODAY CANONICAL SOURCE REBUILD REPORT

## 1. Lỗi thực tế

Màn **Đơn giao hôm nay (New)** hiển thị nguồn `orders`, nhưng API `/api/new/delivery-today/orders` trong Phase222 vẫn có đường đọc cũ qua `masterOrderLegacy.service.listDeliveryToday()`. Điều này làm danh sách nền có thể bị quyết định bởi `masterOrders`, không phải `orders/salesOrders`.

Hệ quả nghiệp vụ:

- Đơn có trong `orders` nhưng chưa nằm trong `masterOrders` có nguy cơ không xuất hiện.
- KPI PT/TM/CK/TT/HT/CN có thể ghép từ nhiều nguồn khác nhau.
- `CN` có thể lấy từ field debt/finalDebt cũ trong khi `CK` lấy từ field mới, dẫn đến lỗi không trừ chuyển khoản.
- UI báo `Nguồn: orders` nhưng runtime không chứng minh được đang đọc `orders` làm primary source.

## 2. Luồng đọc cũ trước sửa

Luồng cũ trong `src/services/v2/deliveryTodayNew.service.js`:

```txt
GET /api/new/delivery-today/orders
→ newOperationsRoutes.js
→ deliveryTodayNewService.listOrders()
→ loadDeliveryOperationalOrders()
→ getDeliveryListService()
→ require('../master-order/masterOrderLegacy.service')
→ listDeliveryToday()
→ masterOrders/masterOrderRepository
```

Sau đó mới merge thêm `returnOrders`, `deliveryCloseoutVersions`, `orderPaymentAllocations`.

## 3. Root cause

Root cause là `DeliveryTodayNewService.listOrders()` dùng `masterOrderLegacy.service.listDeliveryToday()` làm nguồn đọc danh sách vận hành mặc định. `orders/salesOrders` chỉ là fallback khi bật `includeUnassignedSalesOrders=1` và delivery operational list rỗng.

Đây là sai contract vì SourceContractRegistry ghi `orders` là nguồn chính.

## 4. Luồng đọc mới sau sửa

Luồng mới:

```txt
GET /api/new/delivery-today/orders
→ newOperationsRoutes.js
→ deliveryTodayNewService.listOrders()
→ deliveryTodayCanonicalOrderReader.listSalesOrders()
→ SalesOrder/orders là source chính
→ masterOrders chỉ enrich metadata nếu có
→ returnOrders chỉ merge HT
→ deliveryCloseoutVersions latest correction
→ orderPaymentAllocations current payment state
→ deliveryTodayKpiCalculator tính KPI canonical
```

## 5. Vai trò từng collection

| Collection | Vai trò sau sửa |
|---|---|
| `orders/salesOrders` | Primary source cho danh sách đơn giao hôm nay |
| `masterOrders` | Metadata-only: masterOrderId/masterOrderCode, gán NVGH nếu order thiếu và master có mapping đáng tin cậy |
| `returnOrders` | Chỉ tính HT/hàng trả hợp lệ, không quyết định danh sách đơn chính |
| `deliveryCloseoutVersions` | Chỉ lấy latest/current correction |
| `orderPaymentAllocations` | Chỉ lấy final payment state current; nếu debt lệch công thức thì warning và display dùng computed debt để KPI reconcile |

Không dùng `master_orders.totalAmount`, `reporting_snapshots`, `masterReturnOrders` hoặc raw `arLedgers` cho màn này.

## 6. Công thức KPI mới

Tạo helper:

```txt
src/services/delivery/deliveryTodayKpiCalculator.js
```

Công thức chuẩn:

```txt
CN = PT - TM - CK - TT - HT
```

Trong đó:

- `PT` = receivableAmount/originalAmount của đơn trong scope.
- `TM` = cashAmount sau correction/allocation nếu có.
- `CK` = bankAmount sau correction/allocation nếu có.
- `TT` = rewardAmount + offset nếu có.
- `HT` = returnAmount từ returnOrders hợp lệ.
- `CN` = computed debt đã áp dụng Debt Zero Tolerance.

Nếu `PT` đã net hàng trả trong tương lai, helper có `returnHandling = receivableAlreadyNetted`, nhưng Phase223 mặc định dùng `subtractReturnInDebtFormula`.

## 7. Xử lý allocation/version lệch công thức

Nếu `orderPaymentAllocations.current` hoặc `deliveryCloseoutVersions.latest` đưa ra `preferredDebtAmount` lệch công thức vượt tolerance:

- API trả warning `DEBT_RECONCILE_MISMATCH`.
- `sourceBreakdown` giữ cả `preferredDebtAmount`, `computedDebtAmount`, `diff`, `tolerance`.
- `finalDebtAmount` hiển thị dùng computed debt để KPI hàng ngang reconcile đúng.

Case ảnh đã được test:

```txt
PT 42.960.436
TM 13.774.602
CK 4.989.971
TT 4.065.000
HT 350.774
CN đúng = 19.780.089
CN sai cũ = 24.770.060 (lệch đúng bằng CK)
```

## 8. SourceBreakdown API

Response `/api/new/delivery-today/orders` hiện trả thêm:

```json
{
  "source": {
    "primary": "orders",
    "service": "DeliveryTodayNewService.listOrders",
    "reader": "deliveryTodayCanonicalOrderReader",
    "metadataSources": ["masterOrders"],
    "correctionSources": ["deliveryCloseoutVersions"],
    "paymentSources": ["orderPaymentAllocations"],
    "returnSources": ["returnOrders"],
    "forbiddenSourcesUsed": [],
    "warnings": []
  },
  "sourceBreakdown": {
    "kpiFormulaVersion": "delivery-today-kpi-v3",
    "debtFormula": "CN = PT - TM - CK - TT - HT",
    "orderSource": "orders",
    "masterOrdersRole": "metadata-only",
    "allocationPolicy": "current-only; mismatched debt displays computed formula with warning",
    "closeoutVersionPolicy": "latest-only",
    "returnPolicy": "valid-returnOrders-only"
  }
}
```

## 9. Frontend source note sau sửa

File `public/js/app/new/91-delivery-today-new.js` không hardcode nguồn runtime. UI đọc `source` và `sourceBreakdown` từ API và hiển thị thêm mục **Chi tiết nguồn runtime**:

- Primary.
- Reader.
- MasterOrders role.
- Warnings.

Nếu API không báo primary là `orders`, UI không được tự khẳng định `Nguồn: orders · OK`.

## 10. File đã sửa/thêm

```txt
src/services/v2/deliveryTodayNew.service.js
src/services/delivery/deliveryTodayCanonicalOrderReader.js
src/services/delivery/deliveryTodayKpiCalculator.js
src/services/source-contracts/SourceContractRegistry.js
src/config/readEndpointBudgets.js
config/canonical-flows.json
public/js/app/new/91-delivery-today-new.js
test/phase91-new-services-contract.test.js
test/delivery-today-canonical-source-reader.test.js
test/delivery-today-kpi-horizontal-reconcile.test.js
test/delivery-today-no-masterorder-primary-static.test.js
test/delivery-today-source-note-contract.test.js
PHASE223_DELIVERY_TODAY_CANONICAL_SOURCE_REBUILD_REPORT.md
```

## 11. Test đã thêm

- `test/delivery-today-canonical-source-reader.test.js`
- `test/delivery-today-kpi-horizontal-reconcile.test.js`
- `test/delivery-today-no-masterorder-primary-static.test.js`
- `test/delivery-today-source-note-contract.test.js`

Các test chặn tái phát:

- Order có trong `orders` nhưng không có `masterOrders` vẫn xuất hiện.
- `masterOrders` chỉ enrich metadata.
- Service không gọi `masterOrderLegacy.service.listDeliveryToday` làm primary reader.
- KPI case ảnh bắt buộc trừ CK vào CN.
- UI không hardcode source note sai runtime.

## 12. Kết quả test/gate

Đã chạy PASS:

```bash
npm run check:syntax
npm run check:source-bundles
npm run check:source-size
node scripts/audit-dead-code.js
node scripts/audit-flow-usage.js
node scripts/verify-runtime-flows.js
node --test test/delivery-today-kpi-horizontal-reconcile.test.js test/delivery-today-canonical-source-reader.test.js test/delivery-today-no-masterorder-primary-static.test.js test/delivery-today-source-note-contract.test.js test/phase91-new-services-contract.test.js
node --test test/*delivery-today* test/*canonical* test/*kpi* test/*closeout* test/*adjustment* test/*allocation* test/*reward* test/*return* test/*debt* test/*flow*
```

Kết quả nổi bật:

```txt
check:syntax → SYNTAX_OK 1375 JavaScript files
check:source-bundles → OK 19 bundles
check:source-size → OK
audit-dead-code → OK
audit-flow-usage → OK canonical=29 retired=9 fetches=263 unmatched=0 warnings=0
verify-runtime-flows → OK canonical=29 retired=9 routeChecks=72 unmatchedFetches=0 retiredHits=0
Phase223 targeted → 42 pass / 0 fail
Expanded delivery/canonical/kpi/... → 500 pass / 0 fail
```

`npm test` full đã chạy trong sandbox nhưng timeout do tổng thời gian test rất dài. Log trước timeout không có `not ok`/fail; các nhóm liên quan Phase223 đã pass riêng.

## 13. Rủi ro còn lại

- Cần chạy runtime thật với MongoDB dev/staging để xác nhận dữ liệu thực tế ngày `06/07/2026`, NVGH `ghth`.
- Nếu `orders` thiếu `deliveryStaffCode` trên nhiều đơn và `masterOrders` metadata cũng thiếu code, filter theo NVGH có thể cần backfill deliveryStaffCode vào `orders`.
- Nếu `orderPaymentAllocations` đang có nhiều bản current không rõ trạng thái, cần audit riêng allocation current uniqueness.

## 14. Output ZIP

```txt
MK-pro-phase223-delivery-today-canonical-source-rebuild.zip
```
