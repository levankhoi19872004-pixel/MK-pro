# Fund Ledger Contract

## Mục tiêu

Đảm bảo mọi biến động tiền mặt/ngân hàng có ledger canonical, source rõ ràng, idempotency và audit trail.

## SSoT

- Collection: `fundLedgers`.
- Repository chuẩn: `src/repositories/fundLedgerRepository.js`.
- Runtime service: `fundService`, `fundSummary.service`, report service có whitelist.

## Luồng chuẩn

Receipt/payment/deposit/expense event → fund posting/service → `fundLedgers` canonical → fund read/report service → API/dashboard.

## Canonical tối thiểu

```js
{
  fundType: 'cash|bank',
  direction: 'in|out',
  category: 'RECEIPT|EXPENSE|TRANSFER|...',
  amount: Number,
  sourceType: String,
  sourceId: String,
  idempotencyKey: String,
  accountingConfirmed: true,
  accountingStatus: 'confirmed'
}
```

## Bị cấm

- Thu tiền công nợ chỉ ghi payment/debtCollection mà không có `fundLedgers`.
- Dashboard cộng cashbook/bankbook legacy thay cho fund ledger canonical.
- Fund ledger thiếu source hoặc idempotency ở write path mới.

## Static guard

- `test/fund-ledger-access-contract-static.test.js`.
- `scripts/audit-fund-access-violations.js`.
