# PHASE221_RUNTIME_FLOW_VERIFICATION_REPORT

## 1. Input ZIP

`MK-pro-phase220-final-canonical-flow-clean.zip`

## 2. Mục tiêu Phase221

Phase221 không refactor/xóa lan. Trọng tâm là xác minh runtime-flow trên nền Phase220:

- Bật runtime telemetry bằng `FLOW_VERIFY_MODE=1`.
- Kiểm tra source-bundle đầy đủ sau khi có dependency.
- Chạy `npm test` đầy đủ.
- Tạo runtime verification plan cho 29 luồng canonical.
- Tạo script xác minh route/fetch/retired flow ở mức runtime contract.
- Chỉ sửa khi có bằng chứng flow còn gọi endpoint retired.

## 3. Full dependency/test gate

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm install --ignore-scripts` | PASS | Dùng để có dependency `terser`, `mongoose` cho gate đầy đủ. Không đưa `node_modules` vào ZIP. |
| `npm run check:syntax` | PASS | `SYNTAX_OK 1366 JavaScript files` |
| `npm run check:source-bundles` | PASS | `[source-bundles] OK 19 bundles` |
| `npm run check:source-size` | PASS | `[source-size-budget] OK` |
| `node scripts/audit-dead-code.js` | PASS | `[dead-code-audit] OK` |
| `node scripts/audit-flow-usage.js` | PASS | `canonical=29 retired=9 fetches=263 unmatched=0 warnings=0` |
| `node scripts/verify-runtime-flows.js` | PASS | `routeChecks=72 unmatchedFetches=0 retiredHits=0` |
| `FLOW_VERIFY_MODE=1 NODE_ENV=test node scripts/smoke-runtime-flows.js` | PASS | Static smoke không ghi DB, skip command ghi vì không có seed/test DB runtime. |
| `npm test` | PASS | Chạy full test sau khi để dependency ở parent path, project root không có `node_modules`; 1 suite có 1 skipped hiện hữu, không có fail. |

## 4. Runtime Flow Verification Plan

Đã tạo:

- `docs/RUNTIME_FLOW_VERIFICATION_PLAN.md`

Plan có đủ 29 canonical flows Phase220:

- authAndRole
- productCatalog
- customerCatalog
- webSalesOrder
- mobileSalesOrder
- salesImportPreviewCommit
- dmsInventoryComparison
- dmsGapSimulator
- displayCheckManager
- masterOrder
- deliveryMobilePhase23Workflow
- deliveryTodayNewOrders
- deliveryCloseout
- deliveryAdjustment
- deliveryAdjustmentBulkCommit
- debtNew
- mobileDebt
- debtCollectionSubmit
- debtCollectionConfirm
- fundLedger
- returnOrders
- warehouseReturnCheck
- returnStockInAccounting
- reportCenter
- sseExportByDeliveryStaff
- vatExport
- backup
- resetData
- enterpriseConsole

Mỗi flow có role, màn hình, nút/thao tác, expected API, API phụ được phép, API bị cấm, expected/forbidden write collections, network evidence và log evidence cần chụp.

## 5. Runtime telemetry

Đã thêm:

- `src/middlewares/runtimeFlowTelemetry.js`
- `src/middleware/runtimeFlowTelemetry.js`

Đã mount trong `src/app.js` sau auth/security/tenant boundary:

```txt
app.use('/api', tenantContext);
app.use('/api', createRuntimeFlowTelemetry({ logger }));
```

Telemetry chỉ bật khi:

```txt
FLOW_VERIFY_MODE=1
```

Không log body, không log authorization, không log password/token, path được strip query string.

Log mẫu:

```json
{
  "type": "runtime-flow",
  "method": "POST",
  "path": "/api/new/delivery-today/closeout",
  "status": 200,
  "durationMs": 123,
  "flow": "deliveryCloseout",
  "classification": "canonical",
  "requestId": "...",
  "warnings": []
}
```

## 6. Runtime flow audit script

Đã thêm:

- `scripts/verify-runtime-flows.js`
- `scripts/smoke-runtime-flows.js`

Script xuất:

- `reports/runtime-flow-verification.json`
- `docs/RUNTIME_FLOW_VERIFICATION_REPORT.md`
- `reports/runtime-smoke-flows.json`

Kết quả hiện tại:

```txt
[runtime-flow-verification] OK canonical=29 retired=9 routeChecks=72 unmatchedFetches=0 retiredHits=0
```

Summary:

| Metric | Value |
|---|---:|
| canonicalFlows | 29 |
| retiredFlows | 9 |
| requiredRuntimeFlows | 29 |
| backendRouteChecks | 72 |
| missingBackendRoutes | 0 |
| frontendFetches | 263 |
| unmatchedFetches | 0 |
| retiredFrontendHits | 0 |
| retiredMasterReturnWriteFetches | 0 |
| masterReturnWriteFlowBlocked | 1 |

## 7. Lỗi runtime/static-network phát hiện và đã sửa

Phase221 phát hiện một lỗi thật còn sót từ luồng retired:

```txt
public/js/app/debt/07d-master-return-orders.js
```

Trước Phase221, file này vẫn còn các call runtime tới luồng write đã retired:

- `POST /api/master-return-orders`
- `PATCH /api/master-return-orders/:id`
- `POST /api/master-return-orders/:id/receive`
- `POST /api/master-return-orders/:id/cancel`

Đây là bằng chứng rõ ràng rằng Phase220 vẫn chưa sạch tuyệt đối ở runtime/static-network level.

Đã sửa khoanh vùng:

- Không cho submit tạo/gộp đơn tổng trả nữa.
- Không cho sửa đơn tổng trả từ UI legacy.
- Không cho nhập kho qua đơn tổng trả.
- Không cho hủy đơn tổng trả.
- Các hàm legacy chỉ hiển thị thông báo retired, không gọi fetch write.
- Vẫn giữ GET/read-only compatibility và print read-only nếu cần lịch sử.

Luồng chuẩn được nhắc lại trong UI:

```txt
returnOrders → thủ kho kiểm hàng trả → kế toán bấm Nhập kho trên từng đơn trả
```

## 8. Endpoint cũ/retired còn bị gọi không

Theo static runtime/network gate sau sửa:

| Nhóm | Kết quả |
|---|---:|
| frontend fetch orphan | 0 |
| frontend hit retired token nghiêm trọng | 0 |
| frontend master-return write fetch | 0 |
| master-return write route active | Không, route trả retired/410 |

## 9. Luồng pass hoàn toàn ở mức source/runtime-contract

Các nhóm sau pass static runtime-flow gate:

- delivery closeout / adjustment / bulk commit
- debt new / mobile debt / debt collection confirm
- returnOrders / warehouse return check / return stock-in accounting
- import preview/commit contract
- DMS inventory / DMS gap simulator / display check
- report center / VAT export / SSE export theo NVGH
- master-return retired write flow

## 10. Luồng còn cần manual browser Network evidence

Sandbox không có production/staging DB và không thao tác được browser UI thật, nên chưa thể kết luận sạch tuyệt đối ở mức người dùng thật.

Cần chạy trên máy dev/staging:

```bash
FLOW_VERIFY_MODE=1 npm start
```

Sau đó thao tác và lưu Network/log cho:

- Đơn giao hôm nay New: tải đơn, điều chỉnh, bulk adjustment, chốt sổ.
- Công nợ New/Mobile debt: lập phiếu thu, kế toán xác nhận.
- App thủ kho/Đơn trả hàng: xác nhận hàng trả, kế toán nhập kho.
- Import Excel: preview, commit selected.
- DMS/Gap Simulator/Display Check.
- Báo cáo/SSE/VAT export.

## 11. File đã sửa/thêm

### Thêm mới

```txt
src/middlewares/runtimeFlowTelemetry.js
src/middleware/runtimeFlowTelemetry.js
scripts/verify-runtime-flows.js
scripts/smoke-runtime-flows.js
docs/RUNTIME_FLOW_VERIFICATION_PLAN.md
docs/RUNTIME_FLOW_VERIFICATION_REPORT.md
reports/runtime-flow-verification.json
reports/runtime-smoke-flows.json
test/runtime-flow-telemetry-static.test.js
test/runtime-flow-verification-plan-static.test.js
test/runtime-flow-audit-script-static.test.js
test/no-retired-runtime-network-static.test.js
test/master-return-retirement-runtime-static.test.js
```

### Sửa

```txt
src/app.js
public/js/app/debt/07d-master-return-orders.js
test/master-return-lifecycle-separation.test.js
test/master-return-popup-production-grade.test.js
```

## 12. Static tests mới

Đã thêm/cập nhật guard cho:

- FLOW_VERIFY_MODE không bật mặc định production.
- Telemetry không log password/token/body/header nhạy cảm.
- Runtime plan đủ 29 canonical flows.
- verify-runtime-flows xuất JSON + Markdown report.
- Frontend không gọi retired master-return write routes.
- Master-return write routes vẫn retired tại runtime.

Targeted flow/runtime tests:

```txt
133 pass / 0 fail
```

## 13. Rủi ro còn lại

Chỉ còn một rủi ro cần kiểm tra thủ công:

```txt
Chưa có browser Network evidence từ thao tác thật trên local/staging có DB seed.
```

Vì vậy không nên nói “sạch tuyệt đối 100% production runtime” nếu chưa chạy UI thật. Có thể nói:

```txt
Phase221 đã xác minh sạch ở mức full test + source-bundle + static runtime-flow contract.
Đã phát hiện và chặn luồng write master-return còn sót.
Cần chạy FLOW_VERIFY_MODE=1 trên dev/staging để thu actual Network evidence trước khi kết luận sạch tuyệt đối.
```

## 14. Khuyến nghị Phase222

Nếu cần làm tiếp Phase222, không refactor lan. Chỉ nên làm:

```txt
Runtime Manual Evidence Capture
```

Nghĩa là chạy app trên DB staging/dev, thao tác 6 nhóm P0/P1, lưu `runtime-flow` log và ảnh/chụp Network, rồi chỉ sửa nếu có endpoint retired/orphan thật sự xuất hiện.

## 15. Output ZIP

```txt
MK-pro-phase221-runtime-flow-verification.zip
```
