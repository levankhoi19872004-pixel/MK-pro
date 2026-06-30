# PHASE80 AR Debt Reconciliation Report

## Scope

Phase80 chuẩn hóa read layer. Reconciliation production phải chạy trên DB thật sau deploy, không sửa `arLedgers` gốc.

## Rebuild/reconcile commands

```bash
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/audit-ar-read-standard.js --markdown
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

Nếu dry-run ổn:

```bash
node scripts/rebuild-ar-debt-read-model.js --all
node scripts/reconcile-ar-debt-after-rebuild.js --all
```

## Sandbox result

Không chạy được DB scripts trong sandbox vì thiếu `mongoose` và không có DB runtime:

```text
Error: Cannot find module 'mongoose'
Require stack: scripts/rebuild-ar-debt-read-model.js
```

## Reconciliation invariant

```text
canonical arLedgers aggregate by source/customer
= arDebtOrders
= arDebtCustomers
```

## MongoDB checks

```js
db.arDebtCustomers.countDocuments({})
db.arDebtOrders.countDocuments({})

db.arDebtCustomers.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)
db.arDebtOrders.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)

db.arDebtCustomers.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] }, remainingDebt: { $gt: 1000 } }).limit(20)
db.arDebtOrders.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] }, remainingDebt: { $gt: 1000 } }).limit(20)

db.arDebtCustomers.find({ salesStaffCode: '35095', remainingDebt: { $gt: 1000 } }).limit(20)
db.arDebtOrders.find({ salesStaffCode: '35095', remainingDebt: { $gt: 1000 } }).limit(20)
```

## Conclusion

Phase80 không sửa dữ liệu production. Rebuild read model chỉ ghi `arDebtCustomers/arDebtOrders` từ canonical `arLedgers`. Nếu reconcile lệch, phải fail gate và đọc report trước khi apply index/repair.
