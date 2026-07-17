# Phase260B - Delivery Return Post-Closeout Immutability

## Tong quan vung anh huong

- Backend return mutation SSoT: DeliveryEngine, returnOrderLegacy service, closeout correction service.
- Lock resolver dung closeout/accounting signals tu sales order inline state, DeliveryCloseoutVersion va OrderPaymentAllocation.
- Warehouse guard dung ReturnOrder warehouse/stock state de chan sua item truc tiep sau khi thu kho da kiem hoac stock da post.
- Frontend Delivery Today New khong cho gui return payload khi don da chot ke toan.
- Mobile offline sync chan delivery_return_save trong offline queue; 409 duoc map thanh conflict.
- Audit/planner la read-only, khong sua returnOrders, inventories, arLedgers hay fundLedgers.

## Root cause

Truoc Phase260B, return mutation co nhieu duong ghi sau: delivery engine saveReturn, legacy return service upsert/cancel/restore, closeout correction adjustment, mobile/offline dispatch va popup Delivery Today. Guard closeout/warehouse khong nam o mot diem domain chung, nen UI/API co the khoa nhung writer sau van co rui ro tao/sua ReturnOrder sau khi accounting closeout da confirmed hoac warehouse da verify.

## Phuong an A production-grade da ap dung

- Them `ReturnMutationGuard` lam resolver/guard dung chung cho accounting closeout lock va warehouse/stock lock.
- Dat guard o writer sau: DeliveryEngine.saveReturn va cac duong create/upsert/clear/cancel/restore/update trong returnOrderLegacy service.
- Closeout correction service tu choi payload dieu chinh hang tra sau closeout truoc khi applyReturnOrderAdjustment; payment-only correction khong con goi apply return adjustment rong.
- Them controlled correction request endpoint cho ReturnOrder sau closeout, optimistic concurrency theo version/updatedAt, idempotency hash canonical recursive, ghi AdminCorrectionRequest va audit log, khong sua ReturnOrder truc tiep.
- Frontend Delivery Today New disable input return khi locked va omits correctedReturnItems/returnAdjustment payload.
- Mobile offline sync giu chinh sach khong queue financial/stock operation offline va map 409 thanh conflict.
- Them audit writer inventory, audit post-closeout mutation, read-only repair planner va Phase260B test.

## Phuong an B effort thap hon

Chi khoa UI/API Delivery Today va closeout correction route. Cach nay khong duoc chon vi khong chan duoc writer sau, mobile/offline replay, legacy service va cac duong goi noi bo.

## Evidence

- `node --test test\phase260b-return-post-closeout-immutability.test.js`: PASS, 9/9.
- `npm run check:source-bundles`: PASS, 19 bundles OK.
- `npm run docs:check`: PASS, OpenAPI up to date, 369 operations.
- `npm run check:syntax`: PASS, 1528 JavaScript files.
- `node scripts\audit-post-closeout-return-mutations.js --limit=5000`: BLOCKED by MongoDB Atlas whitelist in this environment.
- `node scripts\audit-post-closeout-return-mutations.js --limit=5000 --allow-disconnected`: wrote read-only evidence with `connection.ok=false`.
- `node scripts\plan-post-closeout-return-repair.js`: PASS, total 0 because DB audit could not scan rows here.

## Files changed

- `src/domain/returns/ReturnMutationGuard.js`
- `src/services/returns/DeliveryReturnMutationGuard.js`
- `src/services/returns/ReturnOrderLegacyMutationGuard.js`
- `src/services/returns/ReturnCorrectionRequestService.js`
- `src/engines/delivery.legacy.engine.source/part-01.jsfrag`
- `src/engines/delivery.legacy.engine.source/part-02.jsfrag`
- `src/engines/delivery.legacy.engine.js`
- `src/services/returnOrderLegacy.service.source/part-01.jsfrag`
- `src/services/returnOrderLegacy.service.source/part-02.jsfrag`
- `src/services/returnOrderLegacy.service.source/part-03.jsfrag`
- `src/services/returnOrderLegacy.service.js`
- `src/services/deliveryCloseoutCorrection.service.js`
- `src/routes/newOperationsRoutes.js`
- `public/js/app/new/91-delivery-today-new.js`
- `docs/openapi.json`
- `config/source-bundles.json`
- `scripts/audit-post-closeout-return-mutations.js`
- `scripts/plan-post-closeout-return-repair.js`
- `test/phase260b-return-post-closeout-immutability.test.js`

## Rui ro con lai

- Audit du lieu that chua chay duoc trong moi truong nay do MongoDB Atlas whitelist. Can chay lai audit read-only tren moi truong co quyen ket noi DB truoc production cutover.
- Controlled correction request hien tao request/audit va giu immutable source ReturnOrder; buoc approve/apply reversal can di theo workflow admin correction hien co hoac phase tiep theo neu can tu dong apply.
