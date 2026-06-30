# AR Ledger Contract

## Mục tiêu

Đảm bảo công nợ khách hàng chỉ được đọc từ AR ledger canonical và read model được rebuild/reconcile từ canonical ledger.

## SSoT

- Collection gốc: `arLedgers`.
- Read model: `arDebtOrders`, `arDebtCustomers`.
- Read service: `src/services/arLedgerRead.service.js`, `src/services/arDebtReadModel.service.js`.
- Validator: `src/domain/ar/arLedgerValidator.js`.

## Canonical ledger tối thiểu

```js
{
  account: 'AR',
  category: 'AR-SALE|AR-RETURN|AR-RECEIPT|AR-ADJUSTMENT|...',
  ledgerType: '...',
  entryType: 'normal|reversal',
  accountingConfirmed: true,
  accountingStatus: 'confirmed',
  active: true,
  reversed: false,
  amount: Number,
  debit: Number,
  credit: Number,
  direction: 'debit|credit',
  sourceType: String,
  sourceId: String,
  customerCode: String,
  idempotencyKey: String,
  auditTrail: Array
}
```

## Luồng chuẩn

Kế toán xác nhận → posting service tạo AR ledger canonical → `arDebtReadModel.service` rebuild scope liên quan → API công nợ đọc read model.

## Được phép

- `arPosting.service` ghi ledger thông qua builder/validator.
- `arLedgerRead.service` đọc ledger canonical.
- Scripts `audit`, `plan`, `reconcile`, `migration` đọc raw ledger có báo cáo.

## Bị cấm

- Fallback canonical bằng `code /^AR-SALE-/`.
- Tính công nợ từ sales order hoặc payment collection.
- API/UI tự diễn giải raw AR ledger bẩn.

## Static guard

- `test/ar-ledger-access-contract-static.test.js`.
- `scripts/audit-ar-access-violations.js`.
