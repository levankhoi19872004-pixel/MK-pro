# FLOW_RETIREMENT_REPORT

Sinh lúc: 2026-07-09T10:01:29.974Z

## Audit summary

| Metric | Value |
|---|---:|
| canonicalFlows | 29 |
| retiredFlows | 9 |
| backendRouteDeclarations | 449 |
| frontendFetches | 263 |
| dataActions | 5 |
| unmatchedFetches | 0 |
| retiredHits | 0 |

✅ Không có critical issue ở nhóm flow P0/P1 đã khai báo.

## Warnings cần rà thủ công

- Không có warning.

## Unmatched frontend fetch sample

- Không phát hiện frontend fetch orphan sau allowlist.

## Retired runtime references

- Không phát hiện UI runtime gọi retired token nghiêm trọng.

## Phase217→220 notes

- Phase217: tạo `docs/CANONICAL_FLOW_MATRIX.md`, `config/canonical-flows.json`, `config/retired-flows.json` và audit script.
- Phase218: audit broken/orphan; không phát hiện frontend `/api` fetch orphan sau allowlist; giữ UNKNOWN thay vì xóa bừa.
- Phase219: retire legacy master-return write flow. `src/routes/masterReturnOrderRoutes.js` chỉ giữ GET read-only compatibility, còn POST/PUT/PATCH/receive/cancel trả 410 qua `retiredRoute`.
- Phase220: final gate pass: canonical=29, retired=9, unmatched fetch=0, warnings=0.

## Legacy flow actions

| Flow | Status | Runtime action | Replacement |
|---|---|---|---|
| legacy-web-delivery-today-alias | retired | `/api/delivery-today` returns 410 | `/api/new/delivery-today/orders` |
| mobile-legacy-namespace | retired | `/api/mobile-legacy` returns 410 | `/api/mobile` |
| master-return-orders-write-flow | retired-write-blocked-readonly-compatibility | GET kept read-only; writes return 410 | `/api/return-orders` |
| master-return-orders-receive-flow | retired-route-410 | receive returns 410 | `/api/return-orders/:id/stock-in` |
