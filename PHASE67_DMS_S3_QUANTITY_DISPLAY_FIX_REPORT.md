# Phase 67 - DMS S3 quantity / shortage display fix

## Root cause

The S3 workbook stores `Số lượng` as total loose units (SU) and stores the carton size in `Qc`.
The shortage calculation remained in SU, but preview/report shortage rows did not carry `conversionRate`.
The browser therefore defaulted to packing rate `1`, so a shortage of `652 SU` was displayed as `652/0` instead of `43/7` for a product packed `15` units per case.

## Changes

- Read `Qc`, `QC`, `Q/c`, and `Q/C` as the line packing snapshot.
- Keep `Số lượng` as SU; do not multiply it by `Qc`.
- Add `conversionRate`, `sourcePackingRate`, and unit metadata to shortage/detail rows in preview and commit flows.
- Persist the correct conversion rate in `import_shortage_reports`.
- Infer packing from product names for old Phase 66 reports that were saved with rate `1`.
- Show cross-product aggregate shortages in `SU` because carton totals from different SKUs cannot be combined safely.

## Verification

- Uploaded `11.xlsx`: row 28 / order `B0037751` / product `64330134` contains `Qc = 15`, `Số lượng = 750`.
- JavaScript syntax check: passed for 664 files.
- Targeted import tests: 13/13 passed.
- Full regression: 590/590 passed.
