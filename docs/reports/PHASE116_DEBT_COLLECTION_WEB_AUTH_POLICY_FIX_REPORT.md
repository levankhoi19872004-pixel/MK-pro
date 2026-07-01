# PHASE116 — Debt Collection Web Authorization Policy Fix

## 1. File đã kiểm tra

- `public/js/app/new/92-debt-new.js`
- `src/routes/newOperationsRoutes.js`
- `src/services/DebtCollectionService.js`
- `src/services/DebtReadService.js`
- `src/services/mobile/debts.service.js`
- `src/routes/mobile/debts.routes.js`
- `src/models/DebtCollection.js`
- `src/models/ArLedger.js`
- `test/debt-collection-pending-posting-static.test.js`
- `test/debt-collection-shared-pending-lock-static.test.js`
- `test/delivery-owner-scope-p0.test.js`
- `test/phase72-debt-collection-confirm-contract.test.js`
- `test/phase91-new-services-contract.test.js`

## 2. Nguyên nhân gốc

Message thực tế:

```text
Bạn không được thu công nợ của đơn ...
```

được sinh tại backend trong:

```text
src/services/DebtReadService.js
```

Cụ thể, `DebtReadService.checkAvailableDebt()` kiểm tra `scopeMatches(source, input.scope || input.query || {})`. Trước Phase116, `DebtCollectionService.submitDebtCollection()` luôn tạo `debtScope` theo `collector.collectorCode`:

```js
const debtScope = collector.collectorType === 'delivery'
  ? { delivery: collector.collectorCode }
  : { salesman: collector.collectorCode };
```

Với màn web Công nợ (New), user admin/kế toán không phải NVBH/NVGH của đơn. Vì vậy backend lấy mã user admin/kế toán làm `salesman` hoặc `delivery` scope, rồi `scopeMatches()` chặn nhầm đơn nợ hợp lệ của khách.

## 3. Cơ chế chặn cũ sai ở đâu

- Đúng với app mobile NVBH/NVGH: chỉ được thu đơn thuộc quyền.
- Sai với web kế toán/admin: đang bị áp cùng ownership rule của mobile.
- Sai ở service backend, không phải chỉ frontend.
- Frontend không sinh message này; frontend nhận lỗi backend rồi hiển thị trong popup qua `setPopupError()`.

## 4. File đã sửa

### `src/policies/debtCollection.policy.js`

Tạo policy backend mới:

```js
canCreateDebtCollection(user, debtOrder)
```

Policy trả về:

```js
{
  allowed: boolean,
  scope: 'all' | 'own' | 'none',
  reason: string
}
```

Logic:

- `admin`, `accountant`, `accounting`, `finance`, `ketoan`, `kế toán` hoặc user có `ar:collection:create:any` → `scope: 'all'`.
- `manager` chỉ có `scope: 'all'` nếu có permission create-any.
- `delivery`/NVGH → chỉ đơn có `deliveryStaffCode`/`deliveryStaffName` khớp.
- `sales`/NVBH → chỉ đơn có `salesStaffCode`/`salesStaffName` khớp.
- User khác → `scope: 'none'`.

### `src/services/DebtCollectionService.js`

Thay logic ép scope cũ bằng policy:

```js
const access = DebtCollectionPolicy.debtCollectionCreateScopeForUser(mobileUser, body, collector);
```

Khi user privileged:

```js
scope: {}
collectionScope: 'all'
actor: mobileUser
```

Khi user mobile NVGH/NVBH:

```js
scope: { delivery: collectorCode }
// hoặc
scope: { salesman: collectorCode }
collectionScope: 'own'
```

Phiếu thu tạo mới vẫn giữ:

```js
status: 'submitted'
```

Không gọi `ArPostingService.postReceipt()` ở bước lập phiếu.

### `src/services/DebtReadService.js`

Thêm kiểm tra theo policy per-order trong `checkAvailableDebt()`:

```js
debtCollectionAccessForSource(source, input)
```

Nếu có `actor`, backend dùng policy mới. Nếu không có `actor`, vẫn giữ legacy `scopeMatches()` để không phá các luồng cũ.

Khi chặn quyền, response có thêm code/reason:

```js
{
  ok: false,
  status: 403,
  code: 'DEBT_COLLECTION_ORDER_FORBIDDEN',
  reason: access.reason,
  message: `Bạn không được thu công nợ của đơn ${row.key}`
}
```

### `test/debt-collection-web-accounting-policy.test.js`

Thêm guard cho:

- Admin tạo phiếu thu bất kỳ: PASS.
- Kế toán tạo phiếu thu bất kỳ: PASS.
- Manager thiếu permission: FAIL.
- Manager có `ar:collection:create:any`: PASS.
- NVGH đúng đơn: PASS.
- NVGH sai đơn: FAIL.
- NVBH đúng đơn: PASS.
- User không quyền: FAIL.
- Submit web admin dùng `scope: {}` và `collectionScope: 'all'`.
- Submit vẫn tạo `submitted`, không post AR/Fund.
- Frontend popup nhận lỗi backend qua `setPopupError()`, không dùng main error.

## 5. Policy mới hoạt động thế nào

| User | Scope | Kết quả |
|---|---:|---|
| Admin | all | Được lập phiếu thu mọi đơn còn nợ |
| Kế toán | all | Được lập phiếu thu mọi đơn còn nợ |
| Manager + `ar:collection:create:any` | all | Được lập phiếu thu mọi đơn còn nợ |
| Manager không permission | none | Bị chặn 403 |
| NVGH | own | Chỉ được thu đơn thuộc NVGH đó |
| NVBH | own | Chỉ được thu đơn thuộc NVBH đó |
| User khác | none | Bị chặn 403 |

## 6. AR posting/công nợ có bị đổi không

Không.

Phase116 không sửa:

- Công thức công nợ.
- AR read model.
- AR posting.
- `returnOrders`.
- `fundLedgers`.
- Inventory.
- Delivery closeout.

Lập phiếu thu vẫn chỉ tạo `DebtCollection.status = submitted`. Chỉ `confirmDebtCollection()` mới gọi:

```js
ArPostingService.postReceipt()
FundPostingService.postCashIn()
```

## 7. Test đã chạy

### Pass

```text
npm run check:syntax
npm run check:source-bundles
npm run check:release-manifest
node --test test/debt-collection-web-accounting-policy.test.js test/debt-collection-pending-posting-static.test.js test/debt-collection-shared-pending-lock-static.test.js test/delivery-owner-scope-p0.test.js test/phase72-debt-collection-confirm-contract.test.js test/phase91-new-services-contract.test.js
```

Kết quả targeted tests:

```text
54 tests pass / 0 fail
```

### Full `npm test`

Full suite vẫn còn 1 lỗi đã tồn tại ngoài phạm vi Phase116:

```text
strict delivery closeout does not infer collectedAmount from AR-RECEIPT-like or legacy cash fields
Expected: 0
Actual: 200000
File: test/strict-delivery-cash-no-ar-receipt-inference.test.js
```

Lỗi này thuộc `DeliveryCloseoutService`/strict cash inference, không thuộc authorization lập phiếu thu Công nợ (New), nên không sửa trong Phase116 để tránh sửa lan.

## 8. Hướng kiểm tra thủ công trên UI

1. Đăng nhập web bằng tài khoản admin hoặc kế toán.
2. Vào `Công nợ (New)`.
3. Tìm khách `BBHOASON / Hoa Sơn`.
4. Mở `Chi tiết khách hàng`.
5. Vào tab `Lập phiếu thu`.
6. Tick đơn `DCOC-SO1782830072433596-2-950e16ede9c8` hoặc đơn còn nợ tương ứng.
7. Nhập số tiền thu hợp lệ.
8. Bấm `Tạo phiếu thu chờ xác nhận`.
9. Kết quả đúng: tạo phiếu thu thành công, status `submitted`, popup báo thành công.
10. Kiểm tra công nợ chưa giảm ngay.
11. Chỉ khi kế toán bấm `Xác nhận`, hệ thống mới sinh `AR-RECEIPT` và giảm công nợ.

## 9. Rủi ro còn lại

- Nếu JWT của manager không chứa `permissions`, manager sẽ bị chặn dù route web đang cho role manager đi vào. Đây là đúng theo policy mới: manager chỉ được all-scope khi có quyền công nợ rõ ràng.
- Nếu tài khoản kế toán đang dùng role name lạ không nằm trong whitelist (`accountant`, `accounting`, `finance`, `ketoan`, `kế toán`), cần bổ sung mapping role chính thức.
- Full test còn 1 lỗi strict delivery closeout ngoài phạm vi, nên nên xử lý ở phase riêng.
