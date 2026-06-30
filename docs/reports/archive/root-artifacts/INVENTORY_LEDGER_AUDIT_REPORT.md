# MK-Pro Phase48 - Inventory Ledger Audit & Admin Correction Inventory Fix

## 1. Tổng quan dự án

- Backend: Node.js / Express / Mongoose.
- Frontend: Vanilla JS + HTML fragments.
- Nguồn tồn kho chuẩn hiện tại: `stockTransactions` là ledger biến động; `inventories` là current-stock read model/cache chính.
- Kho nghiệp vụ chuẩn: `MAIN`; HC/PC chỉ phục vụ in/gộp, không tách tồn.

## 2. Bản đồ nghiệp vụ cộng/trừ tồn kho

| Nghiệp vụ | File/hàm | Cộng/trừ | Điều kiện đúng | SourceType/sourceId | Idempotency | Transaction | Rủi ro |
|---|---|---:|---|---|---|---|---|
| Tạo đơn bán web | `orderLegacy.service.source/*` -> `applySalesOrderPosting()` -> `InventoryPostingService.postSaleOut()` | OUT | Tạo đơn bán post ngay để chống oversell | `SALES_ORDER / order.id` | Có qua `idempotencyKey` | Có | Thấp |
| Tạo đơn bán mobile | `mobile/sales.service.source/*` -> `postSaleOut()` | OUT | Sau khi tạo `SalesOrder` trong session | `SALES_ORDER / order.id` | Có | Có | Thấp |
| Import đơn bán DMS/Excel | `salesImport.impl.js` -> `postSalesOrdersBulkOut()` | OUT | Commit import, không phải preview | `SALES_ORDER / order.id` | Có | Có | Thấp |
| Sửa đơn bán đã post | `orderLegacy.service.source/*`, `mobile/sales.service.source/*` -> `postSaleEditDelta()` | IN/OUT delta | Chỉ post chênh lệch qty | `SALES_ORDER_EDIT / order:EDIT:command` | Có | Có | Trung bình nếu thiếu test dữ liệu thật |
| Hủy/xóa đơn bán đã post | `SalesOrderDeletionService.js`, `orderLegacy.service.source/*` -> `reverseMovement()` | IN | Chỉ khi `stockPosted=true` | `SALES_ORDER / order.id` + type reversal | Có | Có | Thấp |
| Tạo đơn trả legacy | `returnOrderLegacy.service.source/*` -> `postReturnIn()` | IN | Legacy createReturnOrder post nhận kho ngay | `RETURN_ORDER / return.id` | Có | Có | Trung bình do legacy behavior |
| Phiếu trả từ giao hàng | `createPendingReturnOrder()` | Không đổi kho | Chỉ draft/waiting_receive | Không có | Không cần | Có khi upsert | Thấp |
| Nhận kho phiếu trả | `confirmReceiveReturnOrder()` -> `postReturnIn()` | IN | Chỉ từ waiting_receive sang received | `RETURN_ORDER / return.id` | Có | Có | Thấp |
| Hủy phiếu trả đã nhận kho | `ReturnStateMachine.assertCanCancel()` | Không hủy trực tiếp | Bắt tạo phiếu đảo | Không có | Không cần | N/A | Thấp |
| Tạo đơn tổng | `masterOrderCommand.impl.js` | Không đổi kho | Chỉ gán `masterOrderId/masterOrderCode` | Không có | Không cần | Có | Thấp |
| Bỏ đơn khỏi đơn tổng | `masterOrderCommand.impl.js` | Không đổi kho | Chỉ detach master fields | Không có | Không cần | Có | Thấp |
| Admin inventory correction | `AdminDataCorrectionService.createInventoryAdjustment()` | IN/OUT | Apply correction đã approved/pending đủ quyền | `ADMIN_CORRECTION / correction.id` | Đã sửa: có | Có | Đã fix P0 |
| Rebuild tồn kho | `InventoryRebuildService.rebuildInventoryFromTransactions()` | Rebuild read model | Chỉ chạy destructive operation có guard | từ `stockTransactions` | N/A | Shadow/replace | Trung bình - cần chạy có kiểm soát |

## 3. Lỗi phát hiện

### P0 - Admin inventory correction tạo ledger nhưng không cập nhật current inventory

- File: `src/services/admin-correction/AdminDataCorrectionService.js`
- Hàm: `createInventoryAdjustment()`
- Nguyên nhân: code tạo trực tiếp `StockTransaction.create([tx])` và `InventoryAdjustment.create(...)`, nhưng không gọi boundary `inventoryService.postStockMovement()` nên collection `inventories` không tăng/giảm ngay.
- Tác động: Admin thấy phiếu điều chỉnh và stock transaction đã có, nhưng app bán hàng/báo cáo tồn hiện tại vẫn đọc `inventories` cũ; tồn chỉ đúng sau khi rebuild thủ công.
- Cách tái hiện:
  1. Tạo correction `inventory_adjustment` tăng `SP001 +10`.
  2. Apply correction.
  3. Kiểm tra `stockTransactions` có dòng mới.
  4. Kiểm tra `inventories.availableQty` chưa tăng nếu không rebuild.
- Cách sửa: thay direct `StockTransaction.create` bằng `inventoryService.postStockMovement()` để ghi ledger và cập nhật `inventories` trong cùng transaction.

### P1 - Rollback có nguy cơ dùng lại custom idempotencyKey

- File: `src/services/admin-correction/AdminDataCorrectionService.js`
- Hàm: `createRollbackLedger()`
- Nguyên nhân: rollback clone toàn bộ correction, nếu correction gốc có `idempotencyKey`, rollback có thể dùng lại key cũ.
- Tác động: rollback fund/inventory có thể bị duplicate key hoặc không tạo bút toán đảo như kỳ vọng.
- Cách sửa: khi tạo rollback correction, reset `idempotencyKey`, gắn `isRollback`, `rollbackOf`, và dùng correctionCode `-RB` làm nguồn idempotency mới.

### P2 - Thiếu static invariant test cho tồn kho

- Trước sửa: chưa có test bảo vệ rằng master order không post kho và admin inventory correction không tạo orphan stock transaction.
- Sau sửa: thêm `test/inventory-ledger-invariants-static.test.js`.

## 4. Thay đổi đã thực hiện

| File | Thay đổi | Lý do |
|---|---|---|
| `src/services/admin-correction/AdminDataCorrectionService.js` | Import `inventoryService` | Dùng inventory posting boundary chuẩn |
| `src/services/admin-correction/AdminDataCorrectionService.js` | Thêm `findInventoryAdjustmentByCorrectionCode()` | Chống apply trùng adjustment |
| `src/services/admin-correction/AdminDataCorrectionService.js` | Viết lại `createInventoryAdjustment()` | Ghi `stockTransactions` + cập nhật `inventories` atomically qua `postStockMovement()` |
| `src/services/admin-correction/AdminDataCorrectionService.js` | Sửa rollback correction | Reset idempotencyKey, đánh dấu rollback |
| `test/admin-data-correction-static.test.js` | Cập nhật invariant test | Không còn cho direct `StockTransaction.create` trong inventory correction |
| `test/inventory-ledger-invariants-static.test.js` | Thêm test mới | Bảo vệ session/idempotency/master-order-no-stock/admin-correction-posting-boundary |

## 5. Quy chuẩn tồn kho đề xuất cho MK-Pro

1. `stockTransactions` là ledger nguồn; `inventories` là current-stock read model.
2. Mọi nghiệp vụ làm thay đổi kho phải đi qua một boundary chuẩn: `inventoryService.postStockMovement()` hoặc `InventoryPostingService`.
3. Không nghiệp vụ nào được tự `StockTransaction.create()` rồi bỏ qua cập nhật `inventories`.
4. OUT stock phải chạy trong Mongo session, có atomic filter `availableQty >= requiredQty`.
5. Mỗi movement phải có idempotency key ổn định theo `sourceType + sourceId + product + warehouse + movementType`.
6. Đơn tổng, in ấn, lọc báo cáo, gán NVGH, đổi tuyến/khu vực không được cộng/trừ kho.
7. Sửa đơn đã post chỉ ghi delta IN/OUT, không đảo toàn bộ rồi post lại nếu không cần.
8. Rollback không xóa ledger cũ; rollback tạo transaction đảo dấu.
9. Admin chỉ được chỉnh tồn bằng adjustment/correction, không sửa trực tiếp `availableQty/currentQty/onHand`.
10. Rebuild tồn chỉ dùng khi đối soát/bảo trì, phải có guard destructive operation và backup trước.

## 6. Code/pattern chính

```js
async function applyInventoryAdjustment({ correction, patch, actor, session }) {
  const adjustQty = Number(patch.adjustQty || patch.qty || 0);
  const direction = adjustQty >= 0 ? 'IN' : 'OUT';

  return inventoryService.postStockMovement({
    id: correction.id,
    code: correction.correctionCode,
    items: [{ productCode: patch.productCode, quantity: Math.abs(adjustQty) }]
  }, {
    type: direction === 'IN' ? 'ADMIN_ADJUSTMENT_IN' : 'ADMIN_ADJUSTMENT_OUT',
    direction,
    sourceType: 'ADMIN_CORRECTION',
    refType: 'ADMIN_CORRECTION',
    refId: correction.id,
    refCode: correction.correctionCode,
    note: correction.reason
  }, { session });
}
```

## 7. Test/kiểm chứng

Đã chạy:

```bash
npm run check:syntax
node --test test/admin-data-correction-static.test.js test/inventory-ledger-invariants-static.test.js test/master-order-popup-selection-ui-static.test.js
```

Kết quả:

- `SYNTAX_OK 998 JavaScript files`
- `14/14` test pass.

Chưa chạy full `npm test` trong sandbox vì thiếu `node_modules/terser`. Sau khi deploy/chạy thật cần `npm install` rồi chạy lại full test.

## 8. Hướng dẫn deploy

1. Upload/push code.
2. Trên Render chạy build/install như bình thường.
3. Chạy:
   ```bash
   npm install
   npm run check:syntax
   node --test test/admin-data-correction-static.test.js test/inventory-ledger-invariants-static.test.js
   npm test
   ```
4. Chạy ensure index nếu chưa chạy:
   ```bash
   npm run mongo:indexes
   ```
5. Không bắt buộc migrate.
6. Không bắt buộc rebuild tồn kho chỉ để nhận bản fix này.
7. Nếu nghi ngờ dữ liệu tồn đã lệch từ trước, backup DB rồi chạy đối soát/rebuild theo runbook riêng.
8. Restart Render Web Service.

## 9. Phương án triển khai

### Phương án A - Production-grade dài hạn

- Chuẩn hóa toàn bộ stock posting thành một service duy nhất `InventoryLedgerService`.
- Cấm lint/static rule với `StockTransaction.create` ngoài service.
- Thêm integration test Mongo cho bán hàng, hủy đơn, trả hàng, admin adjustment, rollback.
- Thêm reconciliation job so sánh `sum(stockTransactions)` với `inventories` hằng ngày.

Effort: Hard  
Rủi ro: Medium  
Ưu điểm: sạch kiến trúc, giảm rủi ro lệch kho lâu dài.

### Phương án B - Cân bằng effort, phù hợp nội bộ hiện tại

- Giữ `inventoryService` hiện tại.
- Vá P0 admin correction để dùng đúng posting boundary.
- Thêm static tests và quy chuẩn không cho module mới tạo orphan stock transaction.
- Chỉ rebuild tồn khi có bằng chứng lệch.

Effort: Medium  
Rủi ro: Low-Medium  
Ưu điểm: ít đụng code, phù hợp vận hành nội bộ hiện tại.

## 10. Kết luận

Bản sửa hiện tại theo Phương án B. Lỗi nghiêm trọng nhất nằm ở Admin Data Correction phase47: tạo stock transaction nhưng không cập nhật `inventories`. Đã sửa để Admin chỉnh tồn đi qua boundary chuẩn, có idempotency, transaction, ledger và current-stock đồng bộ.
