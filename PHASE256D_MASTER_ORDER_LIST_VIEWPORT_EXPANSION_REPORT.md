# Phase256D - Master Order List Viewport Expansion

## Root Cause

The main Master Order list-only screen already has scoped HTML:

```html
<main class="grid master-order-grid master-order-list-only-grid">
  <section class="card master-list-card master-list-only-card">
```

However, it still inherited legacy two-panel heights from older CSS:

- `public/css/base/00-base-06.css`
  - `#masterOrdersTab .master-filter-card, #masterOrdersTab .master-list-card`
  - `height/min-height/max-height: 520px !important`
- `public/css/base/00-base-06.css`
  - `#masterOrdersTab #unmergedOrderList, #masterOrdersTab #masterOrderList`
  - `height/max-height: 420px !important`
- `public/css/overrides/10-operational-04.css`
  - `.master-order-fixed-list`
  - `max-height: 430px`

Those fixed caps kept the main list around the middle of the viewport while empty space remained below.

## Files Changed

- `public/css/30-master-orders.css`
- `public/index.shell.html`
- `test/phase256d-master-order-list-viewport-layout.test.js`
- `RELEASE_MANIFEST.json`
- `PHASE256D_MASTER_ORDER_LIST_VIEWPORT_EXPANSION_REPORT.md`

No JavaScript business logic, API, database, Phase256C working-set code, popup sizing, selection behavior, print, Excel, AR, Fund, Inventory, Return, or Delivery Today files were changed.

## Selectors Before And After

Before, inherited shared selectors controlled the list-only view:

```css
#masterOrdersTab .master-list-card {
  height: 520px !important;
  max-height: 520px !important;
}

#masterOrdersTab #masterOrderList {
  height: 420px !important;
  max-height: 420px !important;
}

.master-order-fixed-list {
  max-height: 430px;
}
```

After, a more specific list-only override in `public/css/30-master-orders.css` wins only for the main list-only screen:

```css
#masterOrdersTab .master-order-list-only-grid .master-list-only-card {
  height: calc(100vh - 128px) !important;
  height: calc(100dvh - 128px) !important;
  min-height: 620px !important;
  max-height: none !important;
  overflow: hidden !important;
}

#masterOrdersTab .master-order-list-only-grid .master-list-only-card #masterOrderList {
  flex: 1 1 auto !important;
  height: auto !important;
  max-height: none !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}
```

## Viewport Height Calculation

The main desktop card now uses viewport height, not another fixed pixel cap:

- Fallback: `height: calc(100vh - 128px)`
- Preferred modern unit: `height: calc(100dvh - 128px)`

For a `1694 x 864` viewport, the card target is:

- Before: `520px` card, `420px` list cap.
- After: `864 - 128 = 736px` card target.

That keeps the card near the bottom of the viewport while leaving room for the surrounding app header/tab area and bottom breathing space.

For shorter laptop heights:

```css
@media(max-height:720px) {
  height: calc(100dvh - 104px) !important;
  min-height: 480px !important;
}
```

For narrow/mobile layouts:

```css
@media(max-width:768px) {
  height: auto !important;
  min-height: 520px !important;
}
```

## Scroll Ownership

The card is a flex column with `overflow: hidden`. Toolbar and column header are fixed within the card:

```css
.ui-list-toolbar,
.master-order-list-head {
  flex: 0 0 auto !important;
}
```

Only `#masterOrderList` owns vertical scrolling:

```css
#masterOrderList {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}
```

This keeps the filter/header area visible and avoids nested scroll between card and list.

## Tests

Passed:

- `npm run check:syntax`
  - `SYNTAX_OK 1492 JavaScript files`
- `node --test test/phase256d-master-order-list-viewport-layout.test.js test/master-order-popup-selection-ui-static.test.js test/master-order-unmerged-refresh-ui-static.test.js test/phase256c-master-order-edit-working-set-persistence.test.js`
  - 13/13 passed
- `npm run docs:check`
  - OpenAPI document is up to date, 368 operations scanned
- `npm run test:release-governance`
  - 85/85 passed

Known unrelated failures retained:

- `npm run check:source-bundles`
  - Existing stale generated file: `src/services/inventoryService.js`
- `npm run test:artifact-clean`
  - Existing root ZIP artifacts are reported as nested archives, including earlier phase ZIPs
- `npm run quality`
  - Syntax and release-governance pass, then artifact-clean fails on the same root ZIP artifacts

Browser measurement was not claimed as passed. Static layout contract and viewport calculation were verified; production verification should confirm visual bottom spacing in the deployed browser.

## Production Verification

1. Open `Don tong`.
2. Confirm `Danh sach don tong` extends close to the bottom of the browser viewport.
3. Confirm more rows are visible than the old 420px list.
4. Scroll inside the list and confirm toolbar/filter/header remain visible.
5. Confirm no horizontal overflow.
6. Open create/edit master order popup and confirm Phase256C behavior is unchanged.
7. Reduce browser height and confirm the list remains usable with internal scroll.

## Rollback

Revert the Phase256D block in `public/css/30-master-orders.css` and restore the CSS cache marker in `public/index.shell.html` to the previous value:

```html
/css/30-master-orders.css?v=phase64-master-order-dates-v1
```
