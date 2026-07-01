# PHASE115 — Mobile Sales/Delivery AR Ledger Debt Read Fix

## 1. Mục tiêu

Sửa lỗi tab Công nợ trên app bán hàng và app giao hàng có thể hiển thị 0 hoặc sai công nợ sau khi chuẩn AR Ledger thay đổi. Bản sửa chỉ xử lý đường đọc công nợ, không sinh ledger mới và không sửa posting/migration/return/fund/import.

## 2. File đã kiểm tra

| Nhóm | File |
|---|---|
| Mobile debt API | `src/services/mobile/debts.service.js`, `src/services/mobile/sales.service.source/part-03.jsfrag`, `src/services/mobile/catalog.service.js` |
| Debt read boundary | `src/services/DebtReadService.js`, `src/services/mobile/mobileDebtQuery.service.js` |
| Runtime debt cho customer list/order list | `src/services/accounting/arDebtRuntimeView.service.js`, `src/services/accounting/arBalanceService.js`, `src/services/mobileService.js` |
| AR canonical utility | `src/services/arLedgerRead.service.js`, `src/domain/ar/arLedgerQueryPolicy.js`, `src/utils/arLedger.util.js`, `src/utils/arLedgerStatus.util.js`, `src/utils/arLedgerCategoryEffect.util.js` |
| Test/guard | `test/mobile-ar-ledger-canonical-compat.test.js`, các test mobile debt hiện có |

## 3. Nguyên nhân gốc

| Mức độ | Vấn đề | Tác động |
|---|---|---|
| P0 | Đường đọc runtime của app phụ thuộc policy/read model chỉ nhận nhóm `AR-DEBT-*` | Nếu DB vẫn có ledger hợp lệ dạng `AR-SALE`, `AR-RETURN`, `AR-RECEIPT`, app có thể đọc ra 0 |
| P0 | `mobileDebtQuery.service.js` seed scope theo `type: ar_sale/ar_external_debt` | Khi ledger mới dùng `category/ledgerType` `AR-DEBT-*`, seed theo NVBH/NVGH có thể rỗng |
| P1 | `arBalanceService.loadCustomerBalances(['CODE'])` chưa xử lý primitive customer code đúng | Danh sách khách/app bán hàng có thể không map được debt theo mã khách |
| P1 | Một số category legacy như `AR-EXTERNAL` chưa được normalize nhất quán | Nợ ngoài luồng hợp lệ có thể không tăng công nợ trong mobile runtime |

## 4. File đã sửa

| File | Nội dung sửa |
|---|---|
| `src/services/mobile/mobileDebtQuery.service.js` | Viết lại query công nợ mobile để đọc trực tiếp `arLedgers` canonical, hỗ trợ cả `AR-DEBT-*` và `AR-SALE/AR-RETURN/AR-RECEIPT`; seed scope theo category/ledgerType/type; lọc confirmed/active/not reversed; giữ pagination và pending collection scope |
| `src/services/accounting/arDebtRuntimeView.service.js` | Customer debt map cho app dùng `arBalanceService.loadCustomerBalances()` để tương thích cả hai family ledger; không fallback sang customer/sales order debt cache |
| `src/services/accounting/arBalanceService.js` | Hỗ trợ input primitive customer/order code; lọc ledger confirmed/active; tính balance từ AR canonical amount policy |
| `src/services/DebtReadService.js` | Dùng `activeArFilter` của mobile debt query thay vì Phase87-only canonical match khi app check/collect debt |
| `src/utils/arLedgerCategoryEffect.util.js` | Chuẩn hóa `AR-EXTERNAL` như debt tăng công nợ |
| `src/utils/arLedgerStatus.util.js` | Nhận diện `AR-EXTERNAL` là nhóm AR sale/debt tăng công nợ |
| `test/mobile-ar-ledger-canonical-compat.test.js` | Thêm test chống tái phát cho app bán hàng/giao hàng đọc cả `AR-DEBT-*` và legacy canonical AR rows |

## 5. Contract công nợ mobile sau sửa

| Thành phần | Contract |
|---|---|
| Nguồn dữ liệu | `arLedgers` |
| Điều kiện ledger | `account: AR`, `accountingConfirmed: true`, `accountingStatus` thuộc confirmed/posted/locked/accounting_confirmed, `active !== false`, không reversed/deleted/reversal, không status inactive/draft/duplicate_cancelled |
| Category được đọc | `AR-DEBT-OPEN`, `AR-DEBT-PAYMENT`, `AR-DEBT-ADJUSTMENT`, `AR-DEBT-VOID`, `AR-SALE`, `AR-EXTERNAL`, `AR-EXTERNAL-DEBT`, `AR-RETURN`, `AR-RECEIPT`, `AR-BONUS`, `AR-ALLOWANCE`, `AR-BONUS-ALLOWANCE`, `AR-ADJUSTMENT`, reversal nghiệp vụ hợp lệ |
| Công thức | Dùng `effectiveArDebit(row) - effectiveArCredit(row)` / `arEntryBalanceEffect(row)` thay vì tự suy luận mù từ `direction` |
| Field API | `debtAmount`, `currentDebt`, `remainingDebt`, `totalRemainingDebt`, `source: mobile-ar-ledger-canonical`, `readModelVersion: mobile-canonical-ar-ledger-v3` |

## 6. App bán hàng đã được bảo vệ thế nào

- Danh sách khách hàng/current debt map đi qua `arDebtRuntimeView.getCustomerDebtMap()` và nay đọc từ `arBalanceService` trên `arLedgers` canonical.
- Tab Công nợ app bán hàng đi qua `DebtReadService.getMobileCustomerDebts()` → `mobileDebtQuery.service.js`.
- Không còn bị lệ thuộc riêng vào Phase87 `AR-DEBT-*` khi production còn dữ liệu hợp lệ dạng `AR-SALE`, `AR-RETURN`, `AR-RECEIPT`.
- Giá trị 0 vẫn là giá trị hợp lệ, không dùng fallback `||` trong phần sửa mới.

## 7. App giao hàng đã được bảo vệ thế nào

- Tab Công nợ giao hàng dùng cùng debt read boundary với app bán hàng.
- Filter `deliveryStaffCode`, `salesStaffCode`, `customerCode`, keyword vẫn được giữ.
- Scope theo NVGH/NVBH không còn chỉ seed từ `type: ar_sale`; nay seed theo category/ledgerType/type hợp lệ.
- Pending collection vẫn chỉ tính trong scope order/customer được phép.

## 8. Test đã chạy

```text
npm run check:syntax
npm run check:source-bundles
npm run check:release-manifest
node --test test/mobile-ar-ledger-canonical-compat.test.js test/mobile-debt-legacy-ar-amount-fallback.test.js test/mobile-sales-uses-ar-debt-runtime-view.test.js test/mobile-service-legacy-debt-redirects-to-ar-v2.test.js test/mobile-sales-debts-report-service-static.test.js test/mobile-sales-phase2-api-performance.test.js test/delivery-debt-pagination-p1-static.test.js
```

Kết quả:

```text
SYNTAX_OK 1186 JavaScript files
[source-bundles] OK 19 bundles
RELEASE_MANIFEST_OK 2026-07-01-01
31 tests pass / 0 fail
```

Kiểm tra full suite:

```text
npm test
```

Kết quả full suite còn 1 lỗi ngoài phạm vi Phase115:

```text
strict delivery closeout does not infer collectedAmount from AR-RECEIPT-like or legacy cash fields
Expected: 0
Actual: 200000
File: test/strict-delivery-cash-no-ar-receipt-inference.test.js
```

Lỗi này thuộc strict delivery closeout/accounting cash inference, không thuộc đường đọc công nợ mobile nên không sửa trong Phase115.

## 9. Cách tự kiểm tra UI

1. Mở app bán hàng bằng user NVBH.
2. Chọn khách có ledger `AR-SALE` đã xác nhận kế toán, kiểm tra Nợ hiện tại > 0.
3. Kiểm tra khách có `AR-RECEIPT`, nợ phải giảm.
4. Kiểm tra khách có `AR-RETURN`, nợ phải giảm.
5. Kiểm tra khách có `reversed=true`, `active=false`, `accountingConfirmed=false` không bị tính.
6. Mở app giao hàng bằng user NVGH.
7. Vào tab Công nợ, kiểm tra danh sách khách trong scope NVGH/NVBH có nợ đúng.
8. Kiểm tra thu công nợ không cho thu vượt `debtAmount` đang hiển thị.

## 10. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---|---|
| DB production có ledger thiếu `accountingStatus` dù `accountingConfirmed=true` | Medium | Query mới yêu cầu confirmed/posted/locked/accounting_confirmed để tránh tính ledger chưa chốt |
| Dữ liệu legacy thiếu staff code trên credit rows | Low | Mobile query lấy scope từ debit/open rows rồi gom credit/return/payment cùng order/customer |
| Full test còn lỗi strict closeout ngoài scope | Medium | Nên xử lý bằng phase riêng vì liên quan tiền giao hàng/accounting cash inference |

## 11. Tiêu chí hoàn thành Phase115

- App bán hàng/giao hàng đọc công nợ từ `arLedgers` canonical.
- Hỗ trợ cả chuẩn mới `AR-DEBT-*` và ledger hợp lệ cũ `AR-SALE/AR-RETURN/AR-RECEIPT`.
- Không dùng `master_orders CN` hoặc `salesOrders.remainingDebt` làm nguồn chính.
- `active=false`, `reversed=true`, `accountingConfirmed=false` không bị tính.
- Có test chống tái phát cho mobile AR ledger compatibility.
