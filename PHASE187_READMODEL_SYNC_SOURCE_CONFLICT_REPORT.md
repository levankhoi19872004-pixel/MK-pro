# Phase 187 - Fix MongoDB update path conflict at `source`

## Lỗi production

Khi chốt sổ giao hàng, backend trả lỗi MongoDB:

```txt
Updating the path 'source' would create a conflict at 'source'
```

## File đã sửa

- `src/services/readModelSyncJob.service.js`
- `test/ar-debt-readmodel-outbox-projector.test.js`

## Nguyên nhân

Trong `enqueueArDebtSyncJobs`, update upsert của `ReadModelSyncJob.updateOne()` đang dùng:

```js
$setOnInsert: doc,
$set: {
  ...,
  source: normalized.source,
  ...
}
```

Trong khi `doc` cũng chứa `source`, `status`, `updatedAt`, `nextRunAt`, `sourceIds`, `customerCode`, `actor`, `reason`, `metadata`.

MongoDB không cho phép cùng một field xuất hiện đồng thời trong `$set` và `$setOnInsert` ở cùng một lệnh update/upsert. Vì vậy thao tác chốt sổ fail khi hàng đợi read-model sync được enqueue.

## Cách sửa

Tách payload insert-only riêng:

```js
const insertOnlyDoc = {
  id: doc.id,
  type: doc.type,
  idempotencyKey: doc.idempotencyKey,
  attempts: doc.attempts,
  lastError: doc.lastError,
  createdAt: doc.createdAt,
  processedAt: doc.processedAt,
  lockedAt: doc.lockedAt,
  lockedBy: doc.lockedBy
};
```

Sau đó dùng:

```js
const update = {
  $setOnInsert: insertOnlyDoc,
  $set: {
    status: 'pending',
    updatedAt: now,
    nextRunAt: now,
    sourceIds: normalized.sourceIds,
    customerCode: normalized.customerCode,
    actor: normalized.actor,
    reason: normalized.reason,
    source: normalized.source,
    metadata: normalized.metadata
  }
};
```

Như vậy:

- `$setOnInsert` chỉ giữ field chỉ cần tạo lần đầu.
- `$set` giữ các field cần refresh khi enqueue lại.
- Không còn field trùng giữa `$set` và `$setOnInsert`.
- Field `source` vẫn được giữ đúng contract, không đổi tên, không xóa.

## Guard test đã thêm

Bổ sung static test trong `test/ar-debt-readmodel-outbox-projector.test.js` để chặn tái lỗi:

- Không cho `$setOnInsert: doc` quay lại.
- Bắt buộc dùng `insertOnlyDoc`.
- Đảm bảo các field đang nằm trong `$set` như `source`, `status`, `updatedAt`, `nextRunAt`, `sourceIds`, `customerCode`, `actor`, `reason`, `metadata` không xuất hiện trong `insertOnlyDoc`.

## Phạm vi không đụng

Không sửa:

- Notification center
- Audit event
- Orders/master_orders
- AR ledger logic
- Inventory/stock logic
- Fund ledger
- Delivery adjustment deep-link
- Module Công cụ → Chia đơn theo giá trị

## Lệnh đã chạy

```txt
npm run check:syntax
npm run check:source-size
node --test test/ar-debt-readmodel-outbox-projector.test.js
```

Kết quả: PASS.

## Lệnh chưa chạy được trong sandbox

```txt
npm run check:source-bundles
npm test
```

Lý do: sandbox thiếu dependency `terser` trong `node_modules`. `npm test` của dự án có `pretest` chạy `check:source-bundles`, nên cũng sẽ dừng ở lỗi thiếu `terser` nếu không chạy `npm install` trước.

## Kỳ vọng sau sửa

Khi thao tác:

```txt
Đơn giao hôm nay (New) → Chốt sổ giao hàng → Xác nhận chốt sổ
```

MongoDB không còn báo conflict tại `source`. Read-model sync job vẫn enqueue được, `source` vẫn được cập nhật đúng cho job tracking.
