# Phase260B-R1 Delivery Return Controlled Reversal Completion

## 1. Tổng quan vùng ảnh hưởng

- Backend lock contract: `ReturnMutationGuard`, projection Delivery Today, legacy return writer.
- Controlled reversal workflow: `ReturnCorrectionRequestService` và route `/api/new/delivery-today/return-correction-requests/:id/*`.
- Inventory/accounting boundary: stock reverse/repost đi qua `InventoryPostingService`; accounting finalize đi qua `DeliveryCloseoutVersion` và `OrderPaymentAllocationService`.
- Frontend desktop/mobile: sau khi kế toán/closeout/payment allocation locked, UI chỉ hiển thị hàng trả dạng read-only và không gửi return mutation payload.
- Evidence/audit: audit post-closeout mutation, repair planner, writer inventory, lock status matrix, state machine, test evidence.

## 2. Root cause

Phase260B đã khóa đa số writer sau accounting closeout, nhưng còn 4 lỗ hổng:

1. `updateReturnDraftItems` vẫn có đường ghi trực tiếp vào `returnOrders` mà chưa đi qua guard canonical.
2. Projection hot path của Delivery Today chưa mang đủ status lock từ `returnOrders`, khiến UI có thể không biết dòng đã khóa.
3. Desktop/mobile vẫn còn khả năng render hoặc gửi payload điều chỉnh hàng trả nếu backend row không được đánh dấu rõ.
4. Controlled correction request mới dừng ở mức tạo yêu cầu, chưa có state machine hoàn chỉnh để reverse stock, tạo version mới, warehouse recheck, stock repost và accounting finalize.

## 3. Phương án A production-grade đã triển khai

- Tách canonical lock contract vào `src/domain/returns/returnLockStatusContract.js`.
- Đóng writer còn sót `updateReturnDraftItems` bằng `guardLegacyReturnWrite`.
- Bổ sung lock projection vào Delivery Today và trả `returnMutationLocked/returnMutationLock` cho UI.
- Chuyển correction return sau closeout thành state machine:
  - `pending_approval -> approved/rejected`
  - `approved -> applying -> waiting_warehouse_recheck`
  - `waiting_warehouse_recheck -> waiting_stock_repost`
  - `waiting_stock_repost -> waiting_accounting_finalize`
  - `waiting_accounting_finalize -> applied`
  - lỗi apply vào `failed` để retry có kiểm soát.
- Stock reversal/repost dùng `InventoryPostingService`, có idempotency theo correction request.
- Accounting finalize dùng `DeliveryCloseoutVersion` và `OrderPaymentAllocationService`, không ghi ledger trực tiếp.
- Old return version bị supersede/inactive; new version reset warehouse/stock/accounting status và chỉ active/current sau finalize.

## 4. Phương án B effort thấp hơn

Chỉ chặn thêm UI và trả 409 ở một số route writer còn sót. Phương án này không đủ production-grade vì vẫn không có quy trình sửa dữ liệu hợp lệ sau khi stock/accounting đã post, và không đảm bảo reversal/repost/finalize theo SSoT.

## 5. Evidence

- `PHASE260B_R1_RETURN_MUTATION_WRITER_INVENTORY.json`
- `PHASE260B_R1_CANONICAL_LOCK_STATUS_MATRIX.json`
- `PHASE260B_R1_CONTROLLED_REVERSAL_STATE_MACHINE.json`
- `PHASE260B_R1_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.json`
- `PHASE260B_R1_POST_CLOSEOUT_RETURN_MUTATION_AUDIT.csv`
- `PHASE260B_R1_POST_CLOSEOUT_RETURN_REPAIR_PLAN.json`
- `PHASE260B_R1_TEST_EVIDENCE.json`
- `RELEASE_MANIFEST.json`

Mongo audit thực tế chưa chạy được do Atlas IP whitelist; artifact audit ghi `status: AUDIT_NOT_EXECUTED`, không được diễn giải là dữ liệu production không có lỗi.

## 6. Kiểm thử

- `node --test test/phase260b-r1-return-controlled-reversal.test.js`
- `node --test test/phase260b-return-post-closeout-immutability.test.js`
- `node --test test/delivery-adjustment-returnorders-contract-static.test.js`
- `node --test test/delivery-closeout-correction-contract-static.test.js`
- Combined 30 tests: PASS.
- `npm run check:syntax`: PASS.
- `npm run check:source-bundles`: PASS.
- `npm run docs:generate`: PASS, thêm 7 operation OpenAPI.
- `npm run docs:check`: PASS.

## 7. Rủi ro còn lại

- Cần chạy lại audit R1 trên môi trường có IP được whitelist để xác nhận các mã đơn production như `B0039602`, `B0039567`.
- Workflow mới chạm inventory/accounting posting ở bước explicit finalize, nên cần UAT theo role admin/accountant/warehouse trước rollout.
