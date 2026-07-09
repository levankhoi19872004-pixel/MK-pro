# MK-Pro Action Contract Matrix — Phase214

Mục tiêu của ma trận này là khóa rõ **mỗi nút command = một API chính, một side-effect boundary, một request budget**. Các action bên dưới được lấy từ báo cáo quét Phase213 và được ưu tiên theo rủi ro tài chính/kho/performance.

## Quy tắc chung

| Rule | Chuẩn bắt buộc |
|---|---|
| Một nút command | Chỉ gọi 1 API chính. Không cascade API phụ nếu response chính đủ cập nhật UI. |
| Reload sau command | Không reload toàn màn tự động. Chỉ patch dòng/KPI liên quan hoặc yêu cầu người dùng bấm Tải lại. |
| Idempotency | Bắt buộc cho mọi command ghi tiền/kho/import/reset. |
| Read model | Không rebuild đồng bộ trong request. Chỉ enqueue sync job khi cần. |
| AR rule | Runtime đọc AR qua boundary; legacy/dirty AR không feed Phase87; canonical AR-SALE full contract vẫn hợp lệ. |
| Frontend guard | Command ghi phải có in-flight lock/chống double submit. List/search phải có request sequencing hoặc AbortController. |

## P0 — command tài chính/kho

| Action | Màn hình | Nút/label | Frontend file | Selector/data-action/id | API chính | API phụ được phép | API phụ bị cấm | Collections được phép ghi | Read model sync | Idempotency key | Request budget | Response contract | Frontend update strategy | Forbidden side effects | Static guard |
|---|---|---|---|---|---|---|---|---|---|---|---:|---|---|---|---|
| Chốt sổ giao hàng | Đơn giao hôm nay New | Chốt sổ giao hàng / Xác nhận chốt sổ | `public/js/app/new/91-delivery-today-new.js` | `#deliveryTodayNewCloseout`, `#deliveryCloseoutConfirm` | `POST /api/new/delivery-today/closeout` | Không, trừ user bấm Tải đơn thủ công | `/orders`, `/debt`, full KPI reload sau success | `salesOrders`, `arLedgers`, `fundLedgers`, `orderPaymentAllocations`, `readModelSyncJobs`, `audit_logs` | enqueue only | `closeout:{date}:{deliveryStaffCode}:{scopeHash}` | 1 | `ok/status/results/readModelSync/performance` | Patch các dòng đã chốt, cập nhật KPI selected/closed | rebuild debt read model đồng bộ, post lại đơn đã chốt, query `$or` rộng khi có stable id | `action-request-budget-static`, `frontend-command-binding-static`, closeout tests |
| Ghi nhận điều chỉnh đã chọn | Đơn giao hôm nay New | Ghi nhận điều chỉnh đã chọn | `public/js/app/new/91-delivery-today-new.js` | `#deliveryTodayNewBulkAdjustmentCommit` | `POST /api/new/delivery-today/adjustments/bulk-commit` | Không | gọi từng đơn qua API riêng; reload toàn màn ngay sau success | `deliveryCloseoutVersions`, `orderPaymentAllocations`, `arLedgers`, `readModelSyncJobs`, `audit_logs` | enqueue only | `bulk-adjustment:{date}:{deliveryStaffCode}:{selectedOrderHash}` | 1 | `ok/summary/results/performance` | Patch sync status các đơn đang chọn; user bấm Tải nếu muốn refresh full | per-order frontend loop, rebuild sync, ghi ngoài correction boundary | `action-request-budget-static` |
| Lưu điều chỉnh đơn giao | Popup Điều chỉnh đơn giao | Lưu điều chỉnh | `public/js/app/new/91-delivery-today-new.js` | `#deliveryAdjustmentSave` | `POST /api/new/delivery-today/closeouts/:id/corrections` | `GET versions` chỉ khi user mở tab lịch sử hoặc response thiếu version | reload toàn bộ delivery list sau save | `deliveryCloseoutVersions`, `returnOrders`, `orderPaymentAllocations`, `arLedgers`, `readModelSyncJobs`, `audit_logs` | enqueue only | `adjustment:{orderId}:{baseVersion}:{correctionHash}` | 1 | `ok/message/correction/returnUpdated/readModelSync/performance` | Cập nhật row đang mở, hiển thị message, giữ popup | rebuild debt model đồng bộ, bắt buộc reason, chặn no-change | adjustment static tests |
| Gửi phiếu thu chờ KT | Công nợ New / App giao hàng | Lập phiếu thu / Gửi phiếu thu chờ KT | `public/mobile/js/delivery-mobile-view.source.js`, debt web files | `#mDeliveryDebtCollectionForm`, web collection submit | `/api/mobile/debt-collections` hoặc `POST /api/new/debt/collections` | Không | post AR/Fund ngay, reload toàn bộ debt list nếu response đủ | `debtCollections`, `debtCollectionLocks` | none | `debt-submit:{collector}:{customer}:{allocationHash}:{formNonce}` | 1 | `ok/collection/message` | Reset form, patch khách/đơn pending hoặc reload page 1 có chủ đích | giảm công nợ ngay trước kế toán confirm, tin staff scope frontend | debt collection tests |
| Kế toán xác nhận phiếu thu | Thu nợ chờ xác nhận | Xác nhận | web debt collections UI | confirm action | `POST /api/debt-collections/:id/confirm`, `POST /api/new/debt/collections/:id/confirm` | Không | reload mọi debt report/dashboard trong request | `debtCollections`, `arLedgers`, `fundLedgers`, `externalDebtOrders`, `audit_logs`, `readModelSyncJobs` | enqueue if needed | `confirm-debt-collection:{collectionId}` | 1 | `ok/collection/arLedgerIds/fundLedgerIds/performance` | Patch phiếu sang confirmed; bỏ khỏi pending list | confirm lại tạo thêm AR/Fund, bỏ check remaining debt | debt collection confirm tests |
| Từ chối phiếu thu | Thu nợ chờ xác nhận | Từ chối | web debt collections UI | reject action | `POST /api/debt-collections/:id/reject`, `POST /api/new/debt/collections/:id/reject` | Không | post AR/Fund | `debtCollections`, `audit_logs` | none | `reject-debt-collection:{collectionId}:{reasonHash}` | 1 | `ok/collection/message` | Patch phiếu sang rejected | giảm công nợ, ghi fund | debt collection tests |
| Nhập kho đơn trả | Đơn trả hàng | Nhập kho | return order UI | dynamic return action | `POST /api/return-orders/:id/stock-in` | Không | closeout/accounting/post AR trong request nhập kho | `returnOrders`, `inventories`, `stockTransactions`, `audit_logs` | none | `return-stock-in:{returnOrderId}` | 1 | `ok/returnOrder/stockTransactionIds` | Patch dòng returnOrder sang stocked/posted | ghi tồn ngoài inventory boundary, post trùng stock | return stock tests |
| Thủ kho xác nhận hàng trả | App thủ kho | Xác nhận hàng trả | mobile warehouse UI | confirm return check | `/api/mobile/warehouse/return-checks/:id/confirm` | Không | tự nhập kho kế toán | `warehouseReturnChecks`, `returnOrders`, `audit_logs` | none | `warehouse-return-confirm:{returnCheckId}:{version}` | 1 | `ok/check/status` | Patch check status | nhập kho tự động, bỏ kế toán stock-in gate | warehouse return tests |

## P1 — tác vụ nặng cần ngân sách rõ

| Action | API chính | Request budget | Ghi DB/side effect | Ghi chú siết |
|---|---|---:|---|---|
| Import các dòng đã chọn | `POST /api/import/commit` / session commit route | 1 command + polling có giới hạn | orders, inventories, stockTransactions, import_sessions | Không lưu preview rows trùng trong queue; chunk bounded; không query từng dòng nếu batch được. |
| Xác nhận cập nhật hạn mức bán App DMS | `POST /api/dms-inventory/:id/commit` | 1 | dmsInventory, quota/appSellingLimit, audit_logs | Không rebuild tồn kho; recompute actual inventory trong transaction đã giới hạn. |
| Xuất Excel SSE | SSE export route | 1 request hoặc async export job | GridFS artifact nếu async | Streaming/values-only, không giữ workbook lớn quá lâu, không fake XLSX khi mapping error. |
| Tạo backup | `/api/system/backup` | 1 command/job | backup artifact | Không block UI quá lâu; trả job/status nếu nặng. |
| Reset dữ liệu | `/api/system/reset` | 1 command | nhiều collection | Bắt buộc confirmation, role, dry-run/summary trước apply. |
| Rebuild báo cáo Enterprise | enterprise rebuild route | 1 enqueue command | reporting projections/jobs | Không rebuild trong route nếu có thể enqueue. |

## Module audit checklist

Với mỗi module trong báo cáo action inventory, phân loại nút theo 3 nhóm:

1. **Command ghi**: bắt buộc in-flight lock, idempotency, side-effect manifest, request budget.
2. **Read/filter**: cần debounce/AbortController/request sequence, projection gọn, pagination.
3. **Export/job**: cần streaming/job status, không fake success artifact, không đọc unbounded.

## Response patching guideline

Command response nên trả tối thiểu:

```json
{
  "ok": true,
  "message": "...",
  "results": [{ "orderId": "...", "orderCode": "...", "status": "confirmed" }],
  "readModelSync": { "mode": "queued", "queued": 1, "status": "pending" },
  "performance": { "totalMs": 0, "stages": [] }
}
```

Frontend chỉ reload full khi response thiếu dữ liệu hoặc có conflict/stale version.

## Phase215 bổ sung P1/P2 — command nặng còn lại

| Action | Màn hình | Nút/label | Frontend file | Selector/data-action/id | API chính | API phụ được phép | API phụ bị cấm | Collections được phép ghi | Read model sync | Idempotency key | Request budget | Response contract | Frontend update strategy | Forbidden side effects | Static guard |
|---|---|---|---|---|---|---|---|---|---|---|---:|---|---|---|---|
| Import các dòng đã chọn | Import dữ liệu Excel | Import các dòng đã chọn / Xác nhận import | `public/js/app/admin/08d-import-excel.source/part-03.jsfrag` | `#commitImportButton`, `#commitImportFromModalButton` | `POST /api/import/sessions/:sessionId/commit` | `GET /api/import/sessions/:sessionId` polling có AbortController và timeout | commit từng dòng, giữ nhiều interval/poll song song, reload catalog/customer toàn bộ nếu response đủ | `import_sessions`, `salesOrders`, `inventories`, `stockTransactions`, `audit_logs` | none/enqueue theo loại import | `import-commit:{sessionId}:{selectedRowsHash}` | 1 command + bounded polling | `ok/accepted/jobId/imported/updated/skipped/shortageReport/performance` | Patch bảng preview/báo cáo thiếu; chỉ tải báo cáo thiếu khi import salesOrders và cần hiển thị | tạo đơn/tồn trùng khi retry, background worker bắt buộc cho web-direct import | `action-request-budget-static`, import tests |
| Xác nhận cập nhật hạn mức bán App DMS | Tồn kho & DMS | Xác nhận cập nhật hạn mức bán App | `public/js/app/10-dms-inventory.js` | `#dmsInventoryCommitButton` | `POST /api/dms-inventory/:id/commit` | `GET /api/dms-inventory/latest` sau success để refresh đúng panel DMS | reload toàn bộ hệ thống, recompute toàn DB, ghi tồn kho thực tế | `dmsInventoryComparisons`, `dmsInventoryQuotas`, `audit_logs` | none | `dms-inventory-commit:{comparisonId}` | 1 | `ok/data/summary/performance` | Đóng modal, reset upload, reload đúng panel DMS | dùng inventory snapshot cũ, ghi quota ngoài transaction | `action-request-budget-static` |
| Xuất Excel SSE | Xuất hóa đơn | Xuất Excel SSE | `public/js/app/admin/08f-vat-export.js` | `#exportSseInvoiceButton` | `GET /api/export/sse-invoice-orders.xlsx` | async export job/artifact nếu server trả 202 JSON | ghi salesOrders/AR/Fund/Inventory, fake XLSX khi mapping lỗi | Không ghi DB trong direct export; optional `exportArtifacts` nếu async job | none | `sse-export:{filtersHash}` | 1 | XLSX stream hoặc JSON lỗi `422/errorReportUrl` | Tải file hoặc hiện nút tải báo cáo lỗi mapping | xóa `deliveryStaffCode/summaryBy`, export theo cửa hàng cũ | SSE integration/static tests |
| Tạo backup | Hệ thống | Tạo backup | `public/js/app/09-system.js` | `#createSystemBackupButton` | `POST /api/system/backup` | `GET /api/system/status`, `GET /api/system/data-source` sau success | reload mọi module nghiệp vụ | `backupArtifacts`/file backup | none | `backup:{date}:{requestId}` | 1 | `ok/data/performance` | Patch trạng thái backup + số lượng dữ liệu nếu đang mở | thiếu checksum/gzip/collection canonical | backup/system tests |
| Reset dữ liệu | Hệ thống | Reset dữ liệu | `public/js/app/09-system.js` | `#resetSystemDataButton` | `POST /api/system/reset` | `GET /api/system/status`, `GET /api/system/data-source` sau success | auto reload sản phẩm/khách/đơn/công nợ/tồn kho toàn màn | selected operational collections + backup artifact | none | `system-reset:{scope}:{confirmationHash}` | 1 | `ok/scope/backup/clearedCollections/performance` | Patch trạng thái hệ thống; người dùng tự tải lại từng module | reset không role/ENV/confirmation, xóa source trước backup | backup/system tests |
| Nhập kho đơn trả | Đơn trả hàng | Nhập kho | return order UI | dynamic return action | `POST /api/return-orders/:id/stock-in` | Không | post AR/Fund hoặc bypass lifecycle stock service | `returnOrders`, `inventories`, `stockTransactions`, `audit_logs` | none | `return-stock-in:{returnOrderId}` | 1 | `ok/returnOrder/stockTransactions/performance` | Patch trạng thái dòng đơn trả | nhập kho 2 lần, ghi stock ngoài boundary | return tests |
| Thủ kho xác nhận hàng trả | App thủ kho | Xác nhận hàng trả | mobile warehouse UI | `/return-checks/confirm` form | `POST /api/mobile/warehouse/return-checks/confirm` | Không | tự nhập kho/tự post stock | `warehouseReturnChecks`, `returnOrders`, `audit_logs` | none | `warehouse-return-confirm:{returnCheckId}:{version}` | 1 | `ok/check/performance` | Patch trạng thái check | thủ kho ghi trực tiếp tồn kho | warehouse tests |

Phase215 guard note: Không reload toàn bộ hệ thống sau các command P1; chỉ reload đúng panel/list liên quan hoặc patch local state.
