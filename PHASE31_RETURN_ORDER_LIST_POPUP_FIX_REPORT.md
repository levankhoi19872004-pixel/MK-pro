# PHASE 31 — Return order list 500 fix and detail popup

## Root cause

`GET /api/return-orders` failed before MongoDB was queried because
`src/services/returnOrderService.js:listReturnOrders()` called `uniqueClean()`.
That helper does not exist in the module and was not imported, so Node.js raised
`ReferenceError: uniqueClean is not defined`. The controller converted this into
HTTP 500 with the generic message “Không tải được phiếu trả hàng từ MongoDB”.

A second scoped runtime defect was found in the cancel path:
`cancelReturnOrderById()` called `ReturnStateMachine.patchForState(existing, ...)`
although `existing` is not defined in that function. It now uses the loaded
`current` return order.

## Changes

- Replaced the undefined `uniqueClean()` call with the existing null-safe
  `uniqueStrings()` helper.
- Fixed cancellation state transition to use `current`.
- Added structured error logging with `requestId` and safe production responses.
- Replaced the 40/60 split screen with a full-width return-order list.
- Added a readonly detail popup opened by row click, Enter/Space, or the
  “Xem chi tiết” button.
- Popup supports close button, backdrop click, and Escape.
- Mobile popup becomes full screen; desktop popup is capped at 1120px / 92vh.
- The list no longer auto-opens the first return order after loading.

## Scope

No MongoDB schema, posting, inventory, AR ledger, fund ledger, import, or delivery
write flow was changed. The patch is isolated to return-order list/cancel runtime
safety, diagnostics, and the web return-order presentation layer.
