# Phase 68 — Import stock allocation trace and selected-order recalculation

## Root cause
The shortage calculation was cumulative across orders in file order, but the inline preview only showed the missing quantity. This made users compare a later order against the full current stock and conclude the stock was read incorrectly.

The commit path also reused adjusted preview rows. If earlier orders were unchecked after preview, their reserved quantities could still affect later selected orders.

## Changes
- Expose `initialAvailableQuantity`, `allocatedBeforeQuantity`, and remaining `availableQuantity` for every imported sales line.
- Explain sequential allocation directly in the preview UI.
- Rename `Thiếu N SP` to `Thiếu N mã hàng`.
- Rebuild selected sales-order preview at commit time using only selected orders and current Mongo inventory.
- Preserve the no-negative-stock guard and sequential first-order-first allocation policy.

## Example verified with 11.xlsx
- Current stock for 64330134: 106/8 at pack 15 = 1,598 SU.
- B0037747 requests 1,500 SU = 100/0.
- Remaining before B0037751: 98 SU = 6/8.
- B0037751 requests 750 SU = 50/0.
- Missing: 652 SU = 43/7.

The arithmetic is correct; the previous presentation lacked the cumulative allocation trace.
