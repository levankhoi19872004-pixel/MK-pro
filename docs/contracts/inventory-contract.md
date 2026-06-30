# Inventory Contract

## Mục tiêu

Chặn sai lệch tồn kho do runtime đọc snapshot hoặc update số tồn trực tiếp không qua stock posting.

## SSoT

- Ledger gốc: `stockTransactions`.
- Current model: `inventories`.
- Runtime service: `src/services/inventoryStock.service.js`.

## Luồng chuẩn

Business event → stock posting service → stock transaction idempotent → cập nhật inventories current model → inventory read service/API.

## Được phép

- `inventoryStock.service` đọc/ghi current model và stockTransactions.
- Script rebuild/reconcile có thể đọc nhiều nguồn để tạo plan.
- Frontend chỉ hiển thị `availableQty/onHand` đã được API chuẩn hóa.

## Bị cấm

- Runtime dùng `inventorySnapshots` làm SSoT.
- Controller tự `$inc` tồn không qua stock posting.
- Import replace trực tiếp collection inventories.

## Static guard

- `test/inventory-access-contract-static.test.js`.
- `scripts/audit-inventory-access-violations.js`.
