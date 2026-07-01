# PHASE118 — Debt Collection Available-To-Collect Fix

## 1. File đã kiểm tra

- `public/js/app/new/92-debt-new.js`
- `src/services/v2/debtNew.service.js`
- `src/services/DebtReadService.js`
- `src/services/DebtCollectionService.js`
- `src/routes/newOperationsRoutes.js`
- `src/models/DebtCollection.js`
- `test/debt-collection-shared-pending-lock-static.test.js`
- `test/debt-read-model-ar-return-contract.test.js`
- `test/debt-collection-web-accounting-policy.test.js`
- `test/phase91-new-services-contract.test.js`

## 2. Nguyên nhân gốc

Lỗi “Số tiền thu vượt công nợ còn có thể thu...” không phải do 190.365 lớn hơn 190.366. Nguyên nhân nằm ở việc frontend và backend không cùng nhìn một khái niệm “còn có thể thu”.

Backend `DebtReadService.checkAvailableDebt()` validate theo:

```text
availableDebt = officialDebt - pendingAmount
```

Trong khi popup Công nợ New trước đó phân bổ theo `order.debt / remainingDebt` và không hiển thị số tiền đã bị khóa bởi phiếu thu `submitted / pending`. Vì vậy người dùng thấy “Còn nợ 190.366” nhưng backend có thể đang thấy “Còn có thể thu” thấp hơn do có phiếu thu chờ xác nhận, hoặc frontend dùng sai field ưu tiên.

Ngoài ra frontend có rủi ro parse tiền Việt Nam sai:

```js
Number("190.366") // 190.366, không phải 190366
```

## 3. File đã sửa

| File | Nội dung sửa |
|---|---|
| `src/services/DebtReadService.js` | Chuẩn hóa `collectibleStateFromRows()` và `getDebtOrderCollectibleState()`; trả `remainingDebt`, `pendingCollectionAmount`, `availableToCollect`; validate theo `allocatedAmount <= availableToCollect`; trả detail debug khi fail |
| `src/services/v2/debtNew.service.js` | Gắn pending collection lock vào dữ liệu Công nợ New; mỗi order/customer có `pendingCollectionAmount` và `availableToCollect` |
| `public/js/app/new/92-debt-new.js` | Popup hiển thị “Còn nợ”, “Đã lập phiếu chờ xác nhận”, “Còn có thể thu”; phân bổ theo `availableToCollect`; sửa parser tiền Việt Nam |
| `src/services/DebtCollectionService.js` | Giữ detail/code từ `DebtReadService.checkAvailableDebt()` khi submit fail |
| `src/routes/newOperationsRoutes.js` | Trả `detail` debug cho frontend khi backend validate fail |
| `test/debt-collection-collectible-state.test.js` | Thêm regression test cho case 190.366 / 190.365 |
| `test/debt-new-collection-available-ui-static.test.js` | Thêm static guard cho UI phân bổ theo `availableToCollect` |
| `test/debt-collection-shared-pending-lock-static.test.js` | Cập nhật guard pending statuses và available contract |
| `test/debt-read-model-ar-return-contract.test.js` | Cập nhật guard contract mới |

## 4. Contract mới

```text
remainingDebt = công nợ chính thức theo AR canonical/read model
pendingCollectionAmount = tổng tiền phiếu thu chờ xác nhận còn hiệu lực theo đơn
availableToCollect = max(0, remainingDebt - pendingCollectionAmount)
allocatedAmount = số tiền phân bổ người dùng gửi lên từng đơn
```

Validate đúng:

```js
allocatedAmount <= availableToCollect
```

Các trạng thái pending lock được tính:

```text
submitted
under_review
pending
waiting_confirm
accounting_pending
```

Các phiếu `accounting_confirmed`, `rejected`, `cancelled`, `canceled`, `voided` không nằm trong pending lock này, tránh trừ hai lần sau khi AR-RECEIPT đã làm giảm công nợ.

## 5. Cách validate mới

Backend dùng cùng một helper tính khả năng thu:

```js
availableToCollect = Math.max(0, normalizeDebtAmount(remainingDebt - pendingCollectionAmount))
```

Khi lỗi validate, backend trả detail dạng:

```json
{
  "orderCode": "DCOC-SO1782830072433596-2-950e16ede9c8",
  "allocatedAmount": 190365,
  "remainingDebt": 190366,
  "pendingCollectionAmount": 0,
  "availableToCollect": 190366,
  "readModelVersion": "canonical-ar-ledger-collectible-v1"
}
```

Message người dùng vẫn ngắn gọn, còn detail dùng cho debug/console.

## 6. UI sau sửa

Popup `Công nợ (New) → Chi tiết khách hàng → Lập phiếu thu` hiển thị thêm:

- `Còn nợ`
- `Đã lập phiếu chờ xác nhận`
- `Còn có thể thu`
- `Phân bổ`

Frontend phân bổ tối đa theo `availableToCollect`, không còn dùng `remainingDebt` làm giới hạn nếu backend đang trừ pending lock.

Parser tiền được đổi sang parser VND an toàn:

```js
parseVndAmount("190.366") === 190366
parseVndAmount("190365") === 190365
```

## 7. Test đã thêm/chạy

Đã chạy PASS:

```text
npm run check:syntax
npm run check:release-manifest
node --test test/debt-collection-shared-pending-lock-static.test.js test/debt-read-model-ar-return-contract.test.js test/phase91-new-services-contract.test.js test/debt-collection-web-accounting-policy.test.js test/debt-collection-collectible-state.test.js test/debt-new-collection-available-ui-static.test.js
```

Kết quả targeted tests:

```text
51 tests pass / 0 fail
SYNTAX_OK 1190 JavaScript files
RELEASE_MANIFEST_OK 2026-07-01-01
```

Không chạy được `npm run check:source-bundles` trong sandbox này vì môi trường thiếu dependency `terser`:

```text
Error: Cannot find module 'terser'
Require stack:
- scripts/build-source-bundles.js
```

Vì `npm test` có `pretest` gọi `check:source-bundles`, full `npm test` cũng dừng ở lỗi môi trường trên trước khi chạy test suite.

## 8. Cách kiểm tra thủ công

1. Mở `Công nợ (New)`.
2. Tìm khách `BBHOASON / Hoa Sơn`.
3. Mở `Chi tiết`.
4. Vào tab `Đơn nợ`, tick đơn `DCOC-SO1782830072433596-2-950e16ede9c8`.
5. Sang tab `Lập phiếu thu`.
6. Kiểm tra popup có hiển thị:
   - `Còn nợ`
   - `Đã lập phiếu chờ xác nhận`
   - `Còn có thể thu`
7. Nhập `190365`.
8. Bấm `Tạo phiếu thu chờ xác nhận`.
9. Kỳ vọng:
   - Nếu `Đã lập phiếu chờ xác nhận = 0`, tạo phiếu thành công.
   - Nếu có pending lock, UI phải hiển thị rõ pending và chỉ cho phân bổ tối đa theo `Còn có thể thu`.

## 9. Rủi ro còn lại

- Nếu production đã có nhiều phiếu `submitted/pending` cũ cho cùng đơn, UI sau Phase118 sẽ hiển thị pending lock rõ ràng. Có thể cần xử lý nghiệp vụ: xác nhận, từ chối, hoặc hủy phiếu trùng.
- Nếu dữ liệu cũ dùng status pending khác ngoài danh sách trên, cần bổ sung vào pending status policy sau khi audit thực tế.
- Nếu số dư official AR read model đã lệch, Phase118 không sửa read model/AR posting; cần phase audit AR riêng.

## 10. Kết luận

Phase118 sửa đúng điểm lệch giữa UI và backend: cả hai cùng dùng `availableToCollect`. Case `remainingDebt = 190366`, `allocated = 190365`, `pending = 0` không còn bị báo vượt. Validate thu vượt thật vẫn được giữ, không bypass security và không sinh AR-RECEIPT khi lập phiếu thu.
