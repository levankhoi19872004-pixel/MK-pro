# Phase105 — Delivery Today New order table header grid alignment

## Scope

This phase only changes the `Đơn giao hôm nay (New)` order list UI and related static guard tests.

## Files changed

| File | Reason | Main changes |
|---|---|---|
| `public/js/app/new/91-delivery-today-new.js` | Fix order table header alignment | Replaced the legacy joined header line with explicit grid cells; header and row now share `delivery-new-order-grid`; added header checkbox state sync. |
| `test/delivery-today-new-salesman-group-ui-static.test.js` | Prevent regression | Added static guards for separated header cells, shared grid contract, money-cell alignment, and removal of legacy `mk-delivery-list-head` / `delivery-new-list-grid`. |
| `RELEASE_MANIFEST.json` | Release integrity | Regenerated release manifest. |

## Root cause

The header was rendered with old list/header classes and inline `<span>` cells that did not share the same grid contract as the order rows. Because the order rows and header used separate CSS contracts, the header appeared as a joined string like `✓Đơn / Khách hàngPTTMCKTHHTCNTrạng tháiThao tác` and did not align with the amounts below.

## New layout contract

The header and every order row now share:

```css
.delivery-new-order-grid {
  display: grid;
  grid-template-columns:
    32px
    minmax(260px, 2fr)
    minmax(96px, .8fr)
    minmax(96px, .8fr)
    minmax(96px, .8fr)
    minmax(96px, .8fr)
    minmax(96px, .8fr)
    minmax(96px, .8fr)
    minmax(110px, .8fr)
    minmax(110px, .8fr);
}
```

The header uses explicit cells:

- Checkbox
- Đơn / Khách hàng
- PT
- TM
- CK
- TH
- HT
- CN
- Trạng thái
- Thao tác

Money cells use `text-align: right`, `tabular-nums`, and `white-space: nowrap`.

## Selection behavior preserved

- Checkbox per row is unchanged.
- `selectedOrderIds` is preserved.
- `Chọn tất cả`, `Bỏ chọn`, and `Chốt sổ giao hàng` are preserved.
- Header checkbox now mirrors selection state: unchecked, checked, or indeterminate.
- Closeout still sends only selected `orderIds`.

## Tests run

```text
node --test test/phase91-new-services-contract.test.js test/delivery-today-new-salesman-group-ui-static.test.js test/delivery-today-new-popup-ui-static.test.js test/delivery-closeout-correction-contract-static.test.js
```

Result:

```text
43 pass
0 fail
```

Syntax check:

```text
npm run check:syntax
```

Result:

```text
SYNTAX_OK 1181 JavaScript files
```

Release manifest:

```text
npm run release:manifest
npm run check:release-manifest
```

Result:

```text
RELEASE_MANIFEST_OK 2026-07-01-01
```

`npm run check:source-bundles` could not run in the sandbox because `node_modules/terser` is unavailable in this extracted environment.

## Manual UI check

1. Open `Đơn giao hôm nay (New)`.
2. Search by NVGH, for example `ghtp`.
3. In `Danh sách đơn`, the header must display as:
   `[ ] | Đơn / Khách hàng | PT | TM | CK | TH | HT | CN | Trạng thái | Thao tác`.
4. PT/TM/CK/TH/HT/CN amounts must align under the matching labels.
5. Tick one order: selected count updates and the row is highlighted.
6. Click `Chọn tất cả` / `Bỏ chọn`: header checkbox and selected count must update.
7. `Chốt sổ giao hàng (n)` still uses only selected orders.
