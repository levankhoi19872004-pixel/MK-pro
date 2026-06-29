# Phase59 — AR Ledger SSoT / SalesOrder Debt Cache Governance

## A. Bản đồ nơi đọc công nợ

| Nhóm | File/API | Đọc công nợ từ đâu sau patch | Có dùng SalesOrder debt cache làm nguồn chính | Rủi ro còn lại |
|---|---|---|---:|---|
| A. Kế toán/công nợ chính | `src/services/reports/DebtReportService.js` | `arLedgers` | Không | Thấp |
| A. Kế toán/công nợ chính | `src/services/DebtReadService.js` | `DebtReportService` / `arLedgers` | Không | Thấp |
| A. Kế toán/công nợ chính | `src/services/mobile/mobileDebtQuery.service.js` | `arLedgers` / `arBalanceService` | Không | Thấp |
| A. Kế toán/công nợ chính | `src/services/financialService.js` | `arLedgers` qua `arBalanceService`; không sync cache | Không | Thấp |
| A. Kế toán/công nợ chính | `src/services/master-order/deliveryAccountingCore.impl.js` | AR posting + ledger; legacy customer hook read-only | Không | Thấp |
| B. Dashboard/report | `src/services/dashboard/DebtDashboardQuery.js` | `arLedgers` | Không | Thấp |
| B. Dashboard/report | `src/services/reports/InformationReportService.js` | `arLedgers` cho debt, `salesOrders` cho doanh số tháng | Không | Thấp |
| C. UI hiển thị nhanh | `src/services/mobile/catalog.service.js` | `DebtReadService.loadDebtBalancesForCustomers()` | Không | Thấp |
| C. UI hiển thị nhanh | `src/services/mobileService.js` legacy customers | `DebtReadService.loadDebtBalancesForCustomers()` | Không | Thấp |
| C. UI hiển thị nhanh | `src/services/searchService.js` unified customer search | `DebtReadService.loadDebtBalancesForCustomers()` | Không | Thấp |
| C. Delivery UI/read model | `src/services/master-order/delivery*` | Recomputed delivery amount + AR map where available | Có thể còn field display read-model | P1, không dùng làm số liệu kế toán chính |
| D. Legacy/dead/minified | `src/engines/delivery.legacy.engine.js`, `src/services/importExportLegacy.service.js` | Có dấu hiệu đọc field legacy | Có thể | P1, cần xử lý riêng nếu còn route active |

## B. Quyết định SSoT

- `arLedgers` là nguồn đúng duy nhất cho công nợ kế toán.
- `SalesOrder.debtAmount`, `SalesOrder.debt`, `SalesOrder.arBalance`, `SalesOrder.arDebtAmount`, `SalesOrder.remainingDebt` chỉ là read-model/legacy display cache.
- `Customer.currentDebt`, `Customer.debtAmount`, `Customer.debt`, `Customer.balance` chỉ là read-model/legacy display cache.
- GET/report công nợ không được âm thầm sync/sửa cache.

## C. Danh sách nơi còn dùng SalesOrder/Customer debt cache

Audit static còn cảnh báo P1 ở một số file vì có nhắc tới `debtAmount/currentDebt/arBalance` trong context delivery UI, schema, legacy hoặc import/export. Các case này không được xác nhận là số liệu kế toán chính và script audit sẽ tiếp tục cảnh báo để xử lý dần.

Các nơi đã chuyển trong patch này:

| File | Trước patch | Sau patch |
|---|---|---|
| `src/services/financialService.js` | `syncOrderDebtCacheFromAR()` gọi `orderRepository.upsert()` để ghi `debtAmount/debt/arBalance` | Không ghi SalesOrder; trả snapshot `officialDebt` từ `arLedgers` |
| `src/services/mobile/mobileDebtQuery.service.js` | Có hàm tự aggregate balance riêng | Dùng `arBalanceService.loadCustomerBalances()` |
| `src/services/mobileService.js` | Legacy customer API dùng `customer.debtAmount/currentDebt/debt/openingDebt` | Dùng `DebtReadService.loadDebtBalancesForCustomers()` |
| `src/services/searchService.js` | Unified search dùng customer cache | Dùng `DebtReadService.loadDebtBalancesForCustomers()` |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Legacy hook cộng `customer.currentDebt/debtAmount` rồi `customerRepository.save()` | Hook read-only, không ghi cache |

## D. File đã sửa/tạo mới

| File | Nội dung |
|---|---|
| `src/services/accounting/arBalanceService.js` | Service canonical tính balance từ `arLedgers` |
| `src/services/financialService.js` | Loại bỏ SalesOrder debt cache write trong receipt/rollback/return allocation flows |
| `src/services/mobile/mobileDebtQuery.service.js` | Customer debt map chuyển sang `arBalanceService` |
| `src/services/mobileService.js` | Legacy mobile customer list không đọc Customer debt cache |
| `src/services/searchService.js` | Unified customer search không đọc Customer debt cache |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Legacy customer-debt hook không mutate Customer cache |
| `src/models/SalesOrder.js` | Gắn nhãn debt fields là read-model only; thêm metadata cache fields |
| `src/services/mongoIndexService.js` | Thêm non-unique index hỗ trợ audit/balance lookup |
| `scripts/lib/arSalesOrderDebtCacheAudit.js` | Pure audit helper cho cache mismatch/source risk |
| `scripts/audit-ar-salesorder-debt-cache.js` | CLI audit dry-run/json |
| `package.json` | Thêm lệnh audit |
| `test/prompt5-*.test.js` | Regression/static tests |

## E. Audit script

```bash
npm run audit:ar-salesorder-debt-cache
npm run audit:ar-salesorder-debt-cache:json
```

Script kiểm tra:

- SalesOrder debt cache lệch với AR ledger.
- Customer debt cache lệch với AR ledger.
- GET route/controller có dấu hiệu ghi cache công nợ.
- File còn có dấu hiệu đọc debt cache legacy để đưa vào danh sách P1.

## F. Index/migration

Deploy-safe non-unique indexes:

```js
db.salesOrders.createIndex({ debtCacheSyncedAt: 1 }, { name: 'idx_orders_debt_cache_synced_at', sparse: true })
db.salesOrders.createIndex({ customerCode: 1, debtAmount: 1 }, { name: 'idx_orders_debt_cache_audit_customer', sparse: true })
db.arLedgers.createIndex({ customerCode: 1, status: 1, reversed: 1, type: 1 }, { name: 'idx_ar_balance_customer_active_lookup', sparse: true })
db.arLedgers.createIndex({ orderCode: 1, status: 1, reversed: 1, type: 1 }, { name: 'idx_ar_balance_order_active_lookup', sparse: true })
```

Chạy qua:

```bash
npm run mongo:indexes
```

## G. Test evidence

```text
SYNTAX_OK 1030 JavaScript files
```

Focused tests:

```text
tests 10
pass 10
fail 0
```

Đã cover:

- AR ledger thay đổi thì service tính official debt từ ledger.
- SalesOrder cache cố tình sai thì audit phát hiện mismatch.
- `financialService` không còn `orderRepository.upsert()` trong `syncOrderDebtCacheFromAR()`.
- Legacy mobile customers và unified search không đọc Customer debt cache.
- `deliveryAccountingCore` không còn save customer debt cache.
- Debt report chính không require/use `SalesOrder`.
- GET route/controller scan không có debt-cache write side-effect.

## H. Rủi ro còn lại

| Rủi ro | Mức độ | Hướng xử lý |
|---|---:|---|
| Dữ liệu SalesOrder/Customer cache cũ vẫn lệch | P1 | Chạy audit, chỉ dùng để cảnh báo; không tự sửa trong GET/report |
| Legacy/minified code còn nhắc `debtAmount` | P1 | Tách phase xử lý legacy/dead code nếu route còn active |
| Một số màn delivery dùng `debtAmount` như read-model vận hành | P1 | Không dùng cho kế toán chính; nếu cần nâng cấp, hydrate bằng `arBalanceService` theo batch |
| Audit thật cần kết nối MongoDB production | P1 | Chạy trên Render/local có `MONGODB_URI` |

## Kết luận

Số liệu công nợ chính không còn phụ thuộc vào SalesOrder debt cache. `arLedgers` là SSoT; SalesOrder/Customer debt fields chỉ còn là read-model phụ/legacy và được audit lệch, không âm thầm sync trong GET/report.
