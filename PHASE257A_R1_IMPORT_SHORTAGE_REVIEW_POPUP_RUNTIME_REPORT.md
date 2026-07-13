# PHASE257A-R1 Import Shortage Review Popup Runtime Report

## Tong quan vung anh huong
- Frontend import Excel sales order shortage review popup.
- State shared for import preview/shortage review.
- Source bundle for `public/js/app/admin/08d-import-excel.js`.
- Khong thay doi backend shortage gate/fingerprint.
- Khong thay doi Inventory/AR/Fund writer, shortage algorithm, MongoDB schema, `package.json`, dependency.

## Root cause
1. `ensureImportShortageReviewModal()` tao modal theo contract cu: `.modal` + `.modal-content` va chi bat `hidden=false`. MK-Pro modal runtime can `.modal-backdrop.show`, `.modal-card`, `aria-hidden="false"` va `body.modal-open`, nen popup co DOM nhung khong hien dung nhu modal chung.
2. Import shortage preview state bi dat trong lazy Reports module `public/js/app/admin/08a-reports.js`. Khi user chua mo tab Reports, import runtime co the thieu state/fn nen auto-open popup khong chay on-first-preview.

## Phuong an A da thuc hien
- Dua `importShortageReviewState`, `importPreviewSessionId`, `importSelectedRowKeySet`, `IMPORT_PREVIEW_RENDER_LIMIT`, `resetImportShortageReviewState()`, `invalidateImportShortageReviewState()` sang shared state `public/js/app/state/00c-admin-system-state.js`.
- Go phu thuoc import state khoi lazy Reports module `public/js/app/admin/08a-reports.js`.
- Sua shortage review popup dung MK-Pro modal contract:
  - root: `.modal-backdrop.import-shortage-review-modal`
  - content: `.modal-card.import-shortage-review-content`
  - open: add `.show`, `aria-hidden="false"`, `body.modal-open`
  - close: remove `.show`, `aria-hidden="true"`, remove `body.modal-open` khi khong con backdrop dang mo
- Sua auto-open retry:
  - khong set `autoOpened=true` truoc khi API GET thanh cong
  - GET loi thi reset `autoOpened=false`, `loading=false`
  - GET khong co shortage items thi khong mo popup
- Giu nut reopen tren banner voi label `Mo review`.
- Bo sung runtime DOM harness va test behavioral `test/phase257a-r1-import-shortage-popup-runtime.test.js`.
- Tao evidence runtime `PHASE257A_R1_IMPORT_SHORTAGE_POPUP_RUNTIME_EVIDENCE.json`.

## Diff pham vi
- `public/js/app/state/00c-admin-system-state.js`
- `public/js/app/admin/08a-reports.js`
- `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-02b.jsfrag`
- `public/js/app/admin/08d-import-excel.part02.js`
- `public/js/app/admin/08d-import-excel.part05.js`
- `public/css/40-import-sales.css`
- `config/source-bundles.json`
- `test/helpers/importShortageRuntimeHarness.js`
- `test/phase257a-r1-import-shortage-popup-runtime.test.js`
- `PHASE257A_R1_IMPORT_SHORTAGE_POPUP_RUNTIME_EVIDENCE.json`

## Evidence
`PHASE257A_R1_IMPORT_SHORTAGE_POPUP_RUNTIME_EVIDENCE.json`:

```json
{
  "modalExists": true,
  "modalVisible": true,
  "modalPosition": "fixed",
  "backdropVisible": true,
  "ariaHidden": "false",
  "bodyModalOpen": true,
  "shortageRows": 1,
  "reportsModuleLoaded": false
}
```

## Artifact
- ZIP: `MK-pro-phase257a-r1-import-shortage-review-popup-runtime-fixed.zip`
- SHA256: see `MK-pro-phase257a-r1-import-shortage-review-popup-runtime-fixed.zip.sha256`
- ZIP QA: 2073 entries, 0 nested `.zip/.zip.sha256/.git/node_modules` entries.

## Regression
- PASS: `npm run check:syntax`
- PASS: `node --test test/phase257a-import-shortage-review-popup-static.test.js test/phase257a-import-shortage-review-behavior.test.js test/phase257a-import-shortage-mode-quantity.test.js test/phase257a-import-shortage-mode-order.test.js test/phase257a-import-shortage-review-stale.test.js test/phase257a-r1-import-shortage-popup-runtime.test.js`
- PASS: `npm run build:source-bundles`
- FAIL on final scoped worktree: `npm run check:source-bundles`
  - Reason: existing/out-of-scope `src/services/inventoryService.js: generated file is stale`.
  - R1 does not retain Inventory generated writer changes because task explicitly forbids Inventory writer changes.
- PASS: `npm run docs:check`
- PASS: `npm run test:release-governance`

## Rui ro con lai
- `08d-import-excel.source/part-02.jsfrag` va `part-02b.jsfrag` dang sat gioi han source bundle 24576 bytes, hien tai 24575 bytes moi file.
- `check:source-bundles` con fail do Inventory generated file stale ngoai pham vi R1; can xu ly bang phase rieng neu muon workspace hoan toan xanh.

## Test nen chay lai khi QA
- Import salesOrders bang file co S3/order shortage.
- Chua mo Reports tab, bam preview, popup phai auto-open.
- Dong popup, bam `Mo review`, popup phai mo lai.
- Thu GET shortage-review loi tam thoi, preview sau phai retry auto-open duoc.
