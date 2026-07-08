# PHASE203 — Mobile Sales Debt dùng chung DebtNewService canonical

## 1. Tổng quan

Phase203 xử lý lỗi app bán hàng hiển thị công nợ lệch so với màn Web `Công nợ (New)`.

Mục tiêu là đưa endpoint mobile runtime:

```txt
GET /api/mobile/debts
```

về cùng nguồn đọc với web:

```txt
DebtNewService.listCustomers → arLedgers canonical read model
```

Không sinh AR ledger mới, không sửa dữ liệu DB, không thay đổi workflow thu nợ/chờ kế toán.

## 2. Nguyên nhân gốc

| Hạng mục | Trước Phase203 | Sau Phase203 |
|---|---|---|
| Web `Công nợ (New)` | `DebtNewService.listCustomers` | Giữ nguyên |
| App `/api/mobile/debts` | `DebtReadService.getMobileCustomerDebts` → `mobileDebtQuery.service.js` | `mobileDebtNewAdapter.service.js` → `DebtNewService.listCustomers` |
| Policy category | Mobile có list riêng gồm cả legacy category | Dùng chung category/policy của `DebtNewService` |
| Pending collection | Mobile tự query/tính riêng | Map từ state canonical của `DebtNewService` |
| Scope NVBH/NVGH | Mobile tự scope riêng | Mobile vẫn ép scope theo user, sau đó gọi canonical service |

Case lệch `4501426 - Anh Minh Hoa` có xác suất cao do app đọc theo nhánh `mobileDebtQuery.service.js`, nhánh này có category/grouping riêng nên có thể không trừ cùng dòng credit/payment/receipt `1.420.000` như Web `Công nợ (New)`.

## 3. File đã sửa

| File | Sửa gì | Lý do |
|---|---|---|
| `src/services/mobile/mobileDebtNewAdapter.service.js` | Thêm adapter canonical cho mobile debt | Map `DebtNewService.listCustomers` sang contract mobile cũ |
| `src/services/mobile/debts.service.js` | `/api/mobile/debts` gọi `listMobileDebtsFromDebtNew()` | Không cho app bán hàng dùng thuật toán mobile debt riêng |
| `src/services/DebtReadService.js` | `getMobileCustomerDebts` delegate sang adapter mới | Giữ tương thích cho route/service cũ nhưng vẫn đọc canonical |
| `src/services/mobile/mobileDebtQuery.service.js` | Thêm comment legacy | Khẳng định file này không còn là runtime source cho `/api/mobile/debts` |
| `test/mobile-sales-debt-uses-debtnew-service-static.test.js` | Thêm static guard | Chặn tái phát `/api/mobile/debts` quay lại nhánh cũ |
| `test/mobile-sales-debt-web-parity-static.test.js` | Thêm contract/parity test | Kiểm tra mapper giữ đúng nợ `3.500.785` và pending collection |
| `RELEASE_MANIFEST.json` | Cập nhật release `2026-07-08-04` | Source hash mới |

## 4. Contract mới của `/api/mobile/debts`

Response vẫn giữ contract mobile thân thiện với frontend:

```js
{
  ok: true,
  source: 'mobile-debtnew-arledgers',
  ledgerCollection: 'arLedgers',
  readModelVersion: 'mobile-debtnew-v1',
  summary: {
    totalDebt,
    totalDebit,
    totalCredit,
    pendingCollected,
    pendingCollectedAmount,
    availableDebt,
    availableDebtAmount,
    customerCount,
    orderCount,
    pageCustomerCount
  },
  items: [
    {
      customerCode,
      customerName,
      salesStaffCode,
      salesStaffName,
      deliveryStaffCode,
      deliveryStaffName,
      debtAmount,
      pendingCollectedAmount,
      availableDebtAmount,
      orderCount,
      oldestDebtDate,
      orders: [
        {
          orderCode,
          salesOrderCode,
          orderDate,
          debtAmount,
          pendingCollectedAmount,
          availableDebtAmount
        }
      ]
    }
  ],
  pagination: { page, limit, totalRows, totalPages, hasMore, nextPage }
}
```

Quy tắc quan trọng:

- `debtAmount` là công nợ chính thức từ `arLedgers` canonical.
- `pendingCollectedAmount` là phiếu thu `submitted/under_review`, chưa trừ công nợ chính thức.
- `availableDebtAmount = debtAmount - pendingCollectedAmount`.
- Phiếu thu chỉ làm giảm `debtAmount` sau khi kế toán xác nhận và phát sinh AR ledger hợp lệ.

## 5. Luồng sau sửa

```txt
App bán hàng
→ GET /api/mobile/debts
→ src/services/mobile/debts.service.js
→ src/services/mobile/mobileDebtNewAdapter.service.js
→ DebtNewService.listCustomers(scopedQuery)
→ arLedgers canonical
→ map về mobile contract
```

`mobileDebtQuery.service.js` được giữ lại cho lịch sử/diagnostic, không còn là runtime source của `/api/mobile/debts`.

## 6. Kết quả test

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run check:syntax` | PASS | `SYNTAX_OK 1323 JavaScript files` |
| `node --test test/mobile-sales-debt-uses-debtnew-service-static.test.js test/mobile-sales-debt-web-parity-static.test.js` | PASS | 6/6 |
| `node --test test/mobile-sales-debt-uses-debtnew-service-static.test.js test/mobile-sales-debt-web-parity-static.test.js test/mobile-sales-debts-report-service-static.test.js test/mobile-sales-does-not-calculate-debt-from-sales-orders.test.js test/no-runtime-sales-order-debt-calculation.test.js` | PASS | 11/11 |
| `npm run check:release-manifest` | PASS | `RELEASE_MANIFEST_OK 2026-07-08-04` |
| `npm run check:source-bundles` | FAIL môi trường | Sandbox thiếu package `terser`, không phải lỗi code Phase203 |

## 7. Cách kiểm tra production

1. Deploy ZIP Phase203.
2. Login app bán hàng bằng NVBH `42162 - Lương Thị Lan`.
3. Vào tab `Công nợ`.
4. Tìm khách `4501426 - Anh Minh Hoa`.
5. So sánh với Web `Công nợ (New)` cùng filter NVBH `42162`, trạng thái `Còn nợ`.
6. Kỳ vọng:

```txt
App Công nợ = Web Công nợ (New)
4501426 - Anh Minh Hoa = 3.500.785
```

Nếu có phiếu thu chờ kế toán:

```txt
Công nợ: số chính thức từ arLedgers
Chờ KT: tiền phiếu thu submitted/under_review
Có thể thu: Công nợ - Chờ KT
```

## 8. MongoDB verification

```js
db.arLedgers.find(
  {
    customerCode: '4501426',
    $or: [
      { salesStaffCode: '42162' },
      { salesmanCode: '42162' },
      { nvbhCode: '42162' }
    ],
    account: 'AR',
    accountingConfirmed: true,
    active: true,
    reversed: { $ne: true }
  },
  {
    code: 1,
    category: 1,
    ledgerType: 1,
    sourceCode: 1,
    orderCode: 1,
    salesOrderCode: 1,
    debit: 1,
    credit: 1,
    amount: 1,
    direction: 1,
    status: 1,
    salesStaffCode: 1,
    customerCode: 1,
    customerName: 1,
    createdAt: 1
  }
).sort({ createdAt: 1 }).pretty()
```

Tính:

```txt
Nợ đúng = tổng debit canonical - tổng credit canonical
```

Sau đó gọi hai API:

```txt
/api/new/debt/customers?salesStaffCode=42162&status=open
/api/mobile/debts?collectorType=sales&includePendingCollections=1
```

Hai kết quả phải khớp cho customer `4501426`.

## 9. Rủi ro còn lại

| Rủi ro | Ghi chú |
|---|---|
| `DebtNewService.listCustomers` vẫn giới hạn ledger window mặc định 500 như web | Mobile dùng cùng web để parity; nếu dữ liệu NVBH quá lớn cần phase riêng phân trang canonical theo customer/order aggregation |
| Một số badge nợ trong tab Khách hàng có thể dùng endpoint khác | Phase203 tập trung `/api/mobile/debts`; nếu còn lệch ở badge khách hàng cần phase tiếp theo đồng bộ toàn bộ customer debt badge |
| `check:source-bundles` chưa chạy được trong sandbox | Thiếu `terser`; package-lock có devDependency nhưng node_modules sandbox không có |

