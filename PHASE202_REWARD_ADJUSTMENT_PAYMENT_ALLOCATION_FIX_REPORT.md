# PHASE202 — Sửa lỗi điều chỉnh Trả thưởng không ghi nhận vào nguồn đọc

## 1. Bối cảnh lỗi

Màn:

```txt
Đơn giao hôm nay (New) → Điều chỉnh → tab Thu tiền
```

Người dùng nhập:

```txt
Trả thưởng sau điều chỉnh = 255.000
```

UI tính đúng:

```txt
Chênh lệch trả thưởng = +255.000
Tổng chênh lệch tiền thu = +255.000
```

Nhưng sau khi lưu/reload, số liệu không được phản ánh ổn định ở nguồn đọc chính của màn giao hàng/công nợ.

## 2. Kết luận kiểm tra

Frontend đã gửi đủ trường trả thưởng trong payload:

```js
paymentCorrection: {
  correctedRewardAmount: totals.newReward,
  rewardDeltaAmount: totals.rewardDeltaAmount
}
```

Backend `deliveryCloseoutCorrection.service.js` cũng đã tạo:

- `DeliveryCloseoutCorrection`
- `DeliveryCloseoutVersion`
- `AR-DEBT-ADJUSTMENT` reconcile nếu công nợ lệch

Tuy nhiên quy trình **chưa tích hợp final-state sau điều chỉnh vào `orderPaymentAllocations`**.

Trong khi đó màn `Đơn giao hôm nay (New)` ưu tiên đọc `orderPaymentAllocations(posted)` trước `deliveryCloseoutVersions`. Vì vậy nếu `orderPaymentAllocations` vẫn là bản cũ với `rewardAmount = 0`, màn danh sách có thể tiếp tục hiển thị sai, dù `deliveryCloseoutVersions` đã có version điều chỉnh.

## 3. Nguyên nhân gốc

| Lỗi | Nguyên nhân |
|---|---|
| Trả thưởng sau điều chỉnh không phản ánh ổn định | Save correction chỉ ghi version/correction và reconcile AR, chưa ghi final state vào `orderPaymentAllocations` |
| Màn danh sách vẫn thấy số cũ | `deliveryTodayNew.service.js` ưu tiên `postedAllocation` cũ hơn `latestVersion` |
| Người dùng tưởng chưa lưu | Sau reload, read model có thể lấy `rewardAmount` từ allocation stale thay vì closeout version mới |

## 4. Hướng sửa đã áp dụng

### 4.1 Backend correction ghi thêm mirror vào `orderPaymentAllocations`

Trong `src/services/deliveryCloseoutCorrection.service.js` thêm:

```js
upsertCorrectionPaymentAllocation(order, newCloseoutVersion, ...)
```

Sau khi tạo `newCloseoutVersion`, hệ thống tạo/upsert một dòng `orderPaymentAllocations` mới với:

```txt
sourceType = DELIVERY_CLOSEOUT_CORRECTION
sourceVersion = closeoutVersion mới
rewardAmount = rewardAmount sau điều chỉnh
cashAmount = cashAmount sau điều chỉnh
bankAmount = bankAmount sau điều chỉnh
returnAmount = returnAmount sau điều chỉnh
debtAmount = debtAmount sau điều chỉnh
```

Lưu ý an toàn:

- Không sinh lại AR-SALE/AR-RECEIPT/AR-REWARD từ allocation mirror này.
- AR delta vẫn đi qua `AR-DEBT-ADJUSTMENT` reconcile hiện có.
- Allocation mới chỉ là nguồn final-state để màn đọc/report không bị stale.

### 4.2 Màn Đơn giao hôm nay bỏ qua allocation cũ nếu có correction version mới hơn

Trong `src/services/v2/deliveryTodayNew.service.js` thêm:

```js
allocationIsCurrentForVersion(allocation, latestVersion)
```

Nếu có `deliveryCloseoutVersions.closeoutVersion` mới hơn `orderPaymentAllocations.sourceVersion`, service không dùng allocation cũ nữa mà dùng latest correction version.

Điều này xử lý cả dữ liệu cũ trước Phase202: nếu đã có version điều chỉnh nhưng chưa có allocation mirror, màn vẫn ưu tiên version mới thay vì allocation stale.

## 5. File đã sửa

| File | Sửa gì |
|---|---|
| `src/services/deliveryCloseoutCorrection.service.js` | Tích hợp `OrderPaymentAllocationService`, thêm `upsertCorrectionPaymentAllocation()` |
| `src/services/deliveryCloseoutCorrection.service.js` | Sau khi tạo `DeliveryCloseoutVersion`, upsert final-state vào `orderPaymentAllocations` |
| `src/services/deliveryCloseoutCorrection.service.js` | Response trả thêm `paymentAllocationIntegrated`, `orderPaymentAllocation` |
| `src/services/v2/deliveryTodayNew.service.js` | Thêm guard bỏ qua `orderPaymentAllocations` cũ nếu có closeout version mới hơn |
| `test/delivery-adjustment-reward-allocation-integration-static.test.js` | Thêm static test chống tái phát lỗi không tích hợp trả thưởng |
| `RELEASE_MANIFEST.json` | Cập nhật release hash Phase202 |

## 6. Contract sau sửa

Khi lưu điều chỉnh trả thưởng, hệ thống phải có đủ 3 lớp:

| Collection / nguồn | Vai trò | Kỳ vọng |
|---|---|---|
| `deliveryCloseoutCorrections` | Audit/correction command | Có `newRewardAmount`, `rewardDeltaAmount` |
| `deliveryCloseoutVersions` | Version final-state immutable | Có `rewardAmount = số sau điều chỉnh` |
| `orderPaymentAllocations` | Nguồn đọc/report final allocation | Có dòng sourceType `DELIVERY_CLOSEOUT_CORRECTION`, sourceVersion mới, `rewardAmount` mới |
| `arLedgers` | Sổ công nợ | Có/không có `AR-DEBT-ADJUSTMENT` tùy chênh lệch balance |

## 7. Query kiểm tra sau deploy

Với đơn ví dụ `B0038706`:

```js
db.deliveryCloseoutCorrections.find(
  { orderCode: "B0038706" },
  { orderCode: 1, newRewardAmount: 1, rewardDeltaAmount: 1, newDebtAmount: 1, createdAt: 1 }
).sort({ createdAt: -1 }).limit(5).pretty()
```

```js
db.deliveryCloseoutVersions.find(
  { orderCode: "B0038706" },
  { orderCode: 1, closeoutVersion: 1, rewardAmount: 1, rewardDeltaAmount: 1, debtAmount: 1, finalDebtAmount: 1, createdAt: 1 }
).sort({ closeoutVersion: -1 }).limit(5).pretty()
```

```js
db.orderPaymentAllocations.find(
  {
    orderCode: "B0038706",
    sourceType: "DELIVERY_CLOSEOUT_CORRECTION"
  },
  { orderCode: 1, allocationCode: 1, sourceVersion: 1, rewardAmount: 1, debtAmount: 1, idempotencyKey: 1, updatedAt: 1 }
).sort({ sourceVersion: -1 }).limit(5).pretty()
```

Kỳ vọng sau khi lưu `Trả thưởng sau điều chỉnh = 255000`:

```txt
deliveryCloseoutVersions.rewardAmount = 255000
orderPaymentAllocations.rewardAmount = 255000
sourceVersion = closeoutVersion mới nhất
```

## 8. Test đã chạy

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | Pass — `SYNTAX_OK 1320 JavaScript files` |
| `node --test test/delivery-adjustment-reward-allocation-integration-static.test.js ...` | Pass — 31/31 |
| `npm run check:release-manifest` | Pass — `RELEASE_MANIFEST_OK 2026-07-08-03` |
| `npm run check:source-bundles` | Không chạy được do môi trường thiếu package `terser` |

## 9. Rủi ro còn lại

- Các correction đã lưu trước Phase202 có thể chưa có dòng mirror trong `orderPaymentAllocations`; màn danh sách đã có fallback bỏ allocation stale để đọc `deliveryCloseoutVersions` mới hơn.
- Nếu muốn dữ liệu lịch sử thật sạch, nên làm thêm script backfill một lần: quét `deliveryCloseoutVersions` có `rewardAmount > 0` nhưng không có `orderPaymentAllocations` sourceType `DELIVERY_CLOSEOUT_CORRECTION` tương ứng.
- Không sinh lại AR-REWARD từ allocation mirror để tránh trùng ledger; AR chênh lệch vẫn do `AR-DEBT-ADJUSTMENT` xử lý.
