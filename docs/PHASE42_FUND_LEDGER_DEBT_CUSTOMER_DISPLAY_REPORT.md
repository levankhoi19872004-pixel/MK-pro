# PHASE 42 - Sổ quỹ hiển thị khách hàng cho giao dịch thu công nợ

## Mục tiêu

Với dòng `fundLedgers` có nguồn `debtCollection`, cột đối tượng trên Sổ quỹ phải hiển thị khách hàng trả nợ thay vì NVBH/NVGH trực tiếp thu tiền.

## Nguyên nhân

`DebtCollectionService.confirmDebtCollection()` ghi đầy đủ cả:

- `customerCode/customerName` để xác định khách hàng trả nợ.
- `collectorCode/collectorName`, `deliveryStaffCode/deliveryStaffName` để audit người thu.

Frontend trước đây gọi `canonicalFundStaffLabel()` trước, nên khi ledger có NVGH thì khách hàng không được hiển thị.

## Phạm vi sửa

- `public/js/app/01-utils-print-tabs.js`
  - Thêm `canonicalCustomerLabel()`.
  - Thêm `isDebtCollectionFundEntry()`.
  - Thêm `canonicalFundCounterpartyLabel()` với quy tắc theo nguồn.
- `public/js/app/debt/07f-fund-ledger.js`
  - Dùng `canonicalFundCounterpartyLabel()` khi render cột đối tượng.
- `public/index.html`
  - Đổi tiêu đề cột `NVGH/KH` thành `Đối tượng`.
  - Tăng cache version cho hai script đã thay đổi.
- `test/fund-ledger-customer-counterparty-ui.test.js`
  - Kiểm thử thu công nợ, nộp quỹ giao hàng, dữ liệu cũ và cache busting.

## Quy tắc hiển thị

| Nguồn | Đối tượng ưu tiên |
|---|---|
| `debtCollection` / `debt_collection` | `customerCode - customerName` |
| `DELIVERY_CASH_SUBMISSION` | `deliveryStaffCode - deliveryStaffName` |
| Nguồn khác | Nhân viên, sau đó mới fallback khách hàng |

Nếu dòng công nợ lịch sử thiếu khách hàng, hệ thống fallback người thu để không hiển thị ô trống.

## An toàn dữ liệu

Không thay đổi MongoDB schema, không migration và không sửa quy trình:

- Xác nhận phiếu thu.
- Posting AR-RECEIPT.
- Posting fundLedger.
- Xác nhận kế toán.
- Nộp quỹ giao hàng.

Thông tin người thu vẫn được giữ nguyên trong fundLedger để audit và đối soát.

## Kiểm thử

- Targeted tests: 5/5 đạt.
- JavaScript syntax: 609 file đạt.
- OpenAPI: 252 operations, đồng bộ.
- Full regression: 469/469 đạt.
- Production dependency audit: 0 lỗ hổng.
