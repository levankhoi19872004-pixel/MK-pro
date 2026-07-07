# PHASE184 - Delivery Closeout MongoDB update path conflict fix

## Phạm vi

Luồng: Đơn giao hôm nay (New) → Chốt sổ giao hàng.

Lỗi production:

```txt
Updating the path 'deliveryCloseout' would create a conflict at 'deliveryCloseout'
```

## Nguyên nhân gốc

`src/repositories/orderRepository.js` trong `patchAccountingCloseoutById(...)` đang gửi một lệnh MongoDB `updateOne` vừa `$set` nguyên object cha `deliveryCloseout`, vừa `$unset` các field con như `deliveryCloseout.versions`, `deliveryCloseout.auditTrail`, `deliveryCloseout.activeReturnOrders`, `deliveryCloseout.paymentRows`, `deliveryCloseout.offsetRows`.

MongoDB không cho phép update cùng lúc một path cha và path con trong cùng update operator set, nên ném lỗi path conflict trước khi ghi trạng thái chốt sổ.

## File đã sửa

- `src/repositories/orderRepository.js`
- `test/delivery-today-closeout-idempotent-fast-skip.test.js`

## Logic trước sửa

```js
{
  $set: canonicalizeOperationalStaff(patch),
  $unset: {
    'deliveryCloseout.versions': '',
    'deliveryCloseout.auditTrail': '',
    'deliveryCloseout.activeReturnOrders': '',
    'deliveryCloseout.paymentRows': '',
    'deliveryCloseout.offsetRows': ''
  },
  $inc: { version: 1 }
}
```

Khi `patch` có `deliveryCloseout: stripOperationalDetails(closeout)`, lệnh này trở thành vừa set `deliveryCloseout`, vừa unset `deliveryCloseout.xxx`.

## Logic sau sửa

```js
{
  $set: canonicalizeOperationalStaff(patch),
  $inc: { version: 1 }
}
```

## Vì sao không cần `$unset deliveryCloseout.xxx`

`deliveryCloseout` đã được build/sanitize ở service trước khi ghi. Khi `$set.deliveryCloseout` bằng object mới, MongoDB thay toàn bộ object cha bằng snapshot sạch. Các field operational không có trong object mới sẽ không còn tồn tại sau update.

Cách này giữ atomic update một lần, không tách thành hai update, không đổi nghiệp vụ kế toán, không đổi AR-DEBT-OPEN và không bỏ validate closeout.

## Test đã chạy

```bash
node --check src/repositories/orderRepository.js
node --check src/services/accounting/AccountingCloseoutService.js
npm run check:source-bundles
node --test test/delivery-closeout-selected-scope-ssot.test.js test/delivery-closeout-command-standard-v2.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js
```

Kết quả targeted test: `13/13 pass`.

Đã bổ sung test khóa lỗi MongoDB path conflict:

```txt
repository closeout update does not set deliveryCloseout and unset deliveryCloseout children in one Mongo update
```

## Rủi ro còn lại

Thấp. Đây là sửa khoanh vùng tại repository update operator. Không thay đổi công thức closeout, không thay đổi scopeHash, không thay đổi chốt AR-DEBT-OPEN.

