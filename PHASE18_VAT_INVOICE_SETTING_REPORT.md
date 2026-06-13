# PHASE 18 — VAT invoice requirement per sales order

## Scope

Adds a report-only VAT invoice requirement flag to each sales order. Changing the flag uses an isolated PATCH endpoint and does not reverse/repost inventory, AR, fund, return, delivery, or master-order state.

## Data contract

- `vatInvoiceRequired` — boolean, default `true`.
- `vatInvoiceDecisionSource` — `default` or `manual`.
- `vatInvoiceNote` — optional reason/note.
- `vatInvoiceUpdatedAt` — audit timestamp.
- `vatInvoiceUpdatedBy` — authenticated actor.

Missing `vatInvoiceRequired` is interpreted as `true` for backward compatibility.

## API

`PATCH /api/sales-orders/:id/vat-invoice-setting`

Allowed roles: `admin`, `accountant`.

Example body:

```json
{
  "vatInvoiceRequired": false,
  "note": "Khách hàng không lấy hóa đơn"
}
```

The service only calls `orderRepository.patchByIdentity()` for VAT fields and `updatedAt`.

## Creation defaults

Explicit default `true` was added to:

- Web/internal sales order creation.
- Modular mobile sales creation and update preservation.
- Legacy mobile service and legacy mobile route compatibility paths.
- Excel/DMS sales order import.

## Reports

### VAT TT78

Includes active orders where:

```js
order.vatInvoiceRequired !== false
```

Therefore old orders without the field remain included.

### Non-invoice order report

Export type:

`vat-non-invoice-orders`

Sheets:

- `DanhSachDon`
- `ChiTietHang`
- `ThongTin`

The report uses the same sales date fallback as TT78 and excludes inactive orders.

## UI

- Sales order modal defaults to `Xuất hóa đơn`.
- Admin/accountant can save the VAT setting separately from ordinary order editing.
- Sales history displays a VAT badge and a quick toggle action.
- Reports include `Xuất danh sách đơn không xuất HĐ`.

## Index

Added:

```js
{ vatInvoiceRequired: 1, orderDate: -1, status: 1 }
```

## Verification

- Syntax checks: passed.
- Static regression: 158 passed, 0 failed.
- OpenAPI generation/check: passed.
- Full dependency/integration suite was not executed because the supplied ZIP has no `node_modules`.
