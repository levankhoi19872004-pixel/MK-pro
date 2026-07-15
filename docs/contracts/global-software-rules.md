# Global Software Rules Contract

## Mục tiêu

Tập trung toàn bộ rule nghiệp vụ lõi của MK-Pro về các SSoT và read/write service chuẩn. Contract này chặn kiểu sửa vá theo màn hình: controller, report, mobile hoặc frontend tự tính lại công nợ, tồn kho, quỹ hoặc trạng thái trả hàng.

## SSoT bắt buộc

| Nghiệp vụ | SSoT | Runtime bắt buộc đi qua |
|---|---|---|
| Công nợ AR | `arLedgers` canonical + `arDebtOrders/arDebtCustomers` read model | `arLedgerRead.service`, `arDebtReadModel.service` |
| Tồn kho | `stockTransactions` + `inventories` current model | `inventoryStock.service`, stock posting service |
| Quỹ | `fundLedgers` canonical | `fundLedgerRepository`, fund/fund summary service |
| Trả hàng | `returnOrders` | return service + AR/stock posting sau xác nhận kế toán |
| Staff identity | canonical staff fields | staff identity util/contract |

## Luồng dữ liệu chuẩn

Business event → write service có idempotency → canonical ledger/read model → read service → API → frontend/mobile/report.

## Được phép

- Controller gọi service/read model chuẩn.
- Script audit/reconcile/migration đọc raw collection với mục tiêu kiểm tra hoặc sửa dữ liệu có kế hoạch.
- Frontend format số, sort/filter UI, hoặc cộng tổng trên payload đã chuẩn hóa từ server.

## Bị cấm

- Controller/report/mobile trực tiếp đọc `arLedgers` để trả công nợ.
- Tính công nợ từ `salesOrders.totalAmount - paidAmount`.
- Dùng regex code như `^AR-SALE-` để xác định ledger canonical.
- Runtime dùng `inventorySnapshots` làm tồn chính.
- Ghi fund/AR/stock ledger thiếu source, idempotency hoặc audit.
- Lẫn `staffCode/staffName` với NVBH/NVGH.

## Static guard liên quan

- `test/global-software-rules-static.test.js`
- `docs/contracts/filter-kpi-scope-governance.md`
- `scripts/audit-filter-kpi-scope.js`
- `test/ar-ledger-access-contract-static.test.js`
- `test/inventory-access-contract-static.test.js`
- `test/fund-ledger-access-contract-static.test.js`
- `test/return-order-contract-static.test.js`
- `test/staff-identity-contract-static.test.js`
- `test/frontend-no-business-calculation-static.test.js`

## Ví dụ đúng/sai

Sai: controller gọi `ArLedger.aggregate()` rồi trả API công nợ.

Đúng: controller gọi `arDebtReadModel.service.getDebtCustomers()` hoặc endpoint chuyên biệt dùng read model chuẩn.
