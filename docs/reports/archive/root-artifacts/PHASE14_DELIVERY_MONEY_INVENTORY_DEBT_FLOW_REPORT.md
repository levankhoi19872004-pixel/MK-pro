# PHASE14 — P0 Delivery Money / Inventory / Debt Flow Verification

## Baseline

- Input ZIP: `MK-pro-phase13-delivery-offline-queue-p0-patched(1).zip`
- Scope: kiểm chứng 5 luồng giao hàng ảnh hưởng tiền / tồn / công nợ.
- Mức can thiệp: **không sửa business code** vì chưa phát hiện sai nghiệp vụ rõ ràng trong phạm vi test regression. Chỉ bổ sung test khóa luồng P0.

## Tổng quan dự án

- Kiến trúc: Node.js / CommonJS backend, Express routes, MongoDB/Mongoose-style model layer.
- Nguồn chuẩn nghiệp vụ đang dùng:
  - Đơn bán: `SalesOrder` / `salesOrders`.
  - Trả hàng: `returnOrders`.
  - Công nợ: `arLedgers` / `DebtReadService`.
  - Quỹ: `fundLedgers` qua `FundPostingService`.
  - Tồn kho: `InventoryPostingService` / inventory ledger.
- Module kiểm tra chính:
  - `src/engines/delivery.legacy.engine.js`
  - `src/engines/delivery.legacy.engine.source/*`
  - `src/services/DebtCollectionService.js`
  - `src/services/mobile/mobileDebtQuery.service.js`
  - `src/domain/lifecycle/ReturnLifecycleService.js`
  - `src/services/invoiceNetSales.service.js`

## Đánh giá chất lượng theo 5 luồng

| Case | Kết quả kiểm chứng | Nhận xét |
|---|---|---|
| 1. Giao đủ + thu đủ | PASS | `savePayment()` đưa debt về 0, `confirm()` chuyển delivered, không sinh `returnOrders`. |
| 2. Trả một phần | PASS | `saveReturn()` tạo/upsert `returnOrders`; công nợ còn lại = phải thu - tiền thu - hàng trả. |
| 3. Trả hết hàng | PASS | Return đủ số lượng đưa debt về 0, không duplicate return, net-sale/VAT/SSE loại toàn bộ dòng exportable. |
| 4. Thu thiếu | PASS | Phần còn lại vẫn nằm trên debt, trạng thái thanh toán là partial, không bị coi là paid. |
| 5. Thu nợ cũ | PASS | Submit chỉ tạo `DebtCollection.status=submitted`; chưa post AR/Fund; idempotency chặn submit trùng; kế toán confirm mới post AR/Fund. |

## Thay đổi đã thực hiện

### Added

- `test/delivery-money-inventory-debt-flow.test.js`

### Modified

- Không có file nghiệp vụ backend bị sửa.

### Deleted

- Không có.

## Nội dung test mới

Test mới dùng fixture in-memory production-shaped để tránh phụ thuộc DB thật nhưng vẫn chạy qua các service thật:

1. `DeliveryEngine.savePayment()` + `DeliveryEngine.confirm()` cho giao đủ / thu đủ.
2. `DeliveryEngine.saveReturn()` + `savePayment()` + `confirm()` cho trả một phần.
3. `DeliveryEngine.saveReturn()` full return + net-sale dataset để khóa rule đơn trả hết không còn dòng xuất.
4. `DeliveryEngine.savePayment()` thu thiếu để khóa debt còn lại.
5. `DebtCollectionService.submitDebtCollection()` + `confirmDebtCollection()` với stub repository/posting để xác nhận pending-before-accounting và post-after-accounting.
6. Static boundary: `DeliveryEngine.saveReturn()` không post tồn trực tiếp; post tồn trả hàng nằm sau lifecycle receiving/accounting boundary qua `InventoryPostingService.postReturnIn()`.

## Kết quả test thực tế

### Syntax

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 939 JavaScript files
```

### Source bundle integrity

```bash
npm run check:source-bundles
```

Kết quả:

```text
[source-bundles] OK 19 bundles
```

### Targeted P0 flow test

```bash
node --test --test-concurrency=1 test/delivery-money-inventory-debt-flow.test.js
```

Kết quả:

```text
# tests 6
# pass 6
# fail 0
```

### Full test

```bash
npm test
```

Kết quả:

```text
# tests 997
# pass 994
# fail 2
# skipped 1
```

Hai test fail là snapshot characterization cũ, không liên quan file test mới hoặc 5 luồng giao hàng vừa kiểm chứng:

- `test/phase79-production-strangler.test.js:38`
- `test/phase79-production-strangler.test.js:46`

## Rủi ro còn lại

1. Bộ test mới là in-memory integration regression, không thay thế kiểm thử E2E với MongoDB thật / dữ liệu production copy.
2. Luồng tồn kho trả hàng vẫn phụ thuộc boundary lifecycle nhận hàng/kế toán. Test đã khóa việc DeliveryEngine không post tồn trực tiếp, nhưng chưa chạy đối soát tồn kho thật sau nhận hàng vì ngoài phạm vi không sửa AR/Fund/Inventory.
3. Full test suite vẫn còn 2 snapshot cũ fail từ phase79; không sửa để tránh thay đổi lan rộng ngoài phạm vi P0 này.

## Phương án tiếp theo

### Phương án A — Khuyến nghị production-grade

- Dựng bộ fixture MongoDB thật có seed `salesOrders`, `returnOrders`, `arLedgers`, `fundLedgers`, `inventories`.
- Chạy 5 luồng qua HTTP/API thật với token NVGH/kế toán/admin.
- Sau mỗi step snapshot toàn bộ ledger và đối soát.
- Effort: Hard.
- Lợi ích: gần production nhất, bắt được lỗi middleware/API/transaction thật.
- Rủi ro: cần chuẩn hóa seed dữ liệu và teardown tránh flaky.

### Phương án B — Cân bằng effort

- Giữ test in-memory hiện tại làm regression nhanh.
- Bổ sung thêm 2 test static cho route `/api/mobile/debts` và `/api/mobile/debt-collections` kiểm tra scope + pending posting.
- Effort: Medium.
- Lợi ích: nhanh, ít rủi ro, phù hợp CI hiện tại.
- Rủi ro: vẫn chưa xác nhận được toàn bộ Mongo transaction thật.
