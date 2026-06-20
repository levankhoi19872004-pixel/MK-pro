# WORKER_AND_EXPORT_SCALABILITY_REPORT

## 1. Phạm vi và baseline

- Baseline: `MK-pro-phase06-api-query-performance-patched.zip`.
- Phạm vi triển khai: import preview lớn, import commit, export Excel/VAT/SSE và reconciliation.
- Không thay đổi contract file VAT/SSE, quy tắc net quantity/hàng trả, schema nghiệp vụ, tồn kho, AR hoặc fund ledger.
- Không bổ sung Redis, BullMQ hoặc package mới. Queue sử dụng MongoDB hiện có.

### Hiện trạng trước Phase 07

| Luồng | Trước sửa | Rủi ro chính |
|---|---|---|
| Import preview | Child process cục bộ từ web process, queue trong RAM | Mất hàng đợi khi restart; không chia sẻ giữa nhiều web instance |
| Import commit | Controller gọi commit trực tiếp và chờ hoàn tất | CPU/RAM/DB cạnh tranh với API; request giữ lâu |
| VAT/SSE/Excel export | Web process query, dựng workbook thành `Buffer`, trả ngay | Heap tăng theo kích thước workbook; export đồng thời gây áp lực GC/CPU |
| Reconciliation | Timer trong từng web instance chạy domain service trực tiếp | Hai instance có thể chạy trùng; query nặng cạnh tranh với API |

### Root cause

1. Web process vừa phục vụ HTTP vừa chạy tác vụ CPU/heap dài.
2. Queue preview cũ không bền vững và không có lease dùng chung giữa instance.
3. Export tạo toàn bộ workbook trong heap của web process.
4. Reconciliation chỉ có khóa `running` trong RAM của từng process.
5. Import commit và reconciliation chưa chứng minh retry-idempotent, nên retry tự động có thể gây side effect trùng.

---

## 2. Kiến trúc sau sửa

```text
Browser / Mobile
       |
       v
Web process: npm start
- authenticate + validate
- enqueue background_jobs
- return HTTP 202 + jobId
- status/cancel endpoint
- stream completed artifact from GridFS
       |
       v
MongoDB
- background_jobs: persistent queue, idempotency, lease, progress, dead-letter
- background_job_artifacts.files/chunks: inputs + outputs
- import_sessions / audit_logs / reconciliation_reports
       ^
       |
Worker service: npm run worker:background
- atomic claim
- concurrency limit
- child executor/job
- timeout + max-old-space-size
- heartbeat/lease
- retry/backoff where safe
- TTL cleanup
```

Không cần shared filesystem. Web và worker phải dùng cùng `MONGO_URI` và tenant configuration.

---

## 3. Job contract và state machine

### Job types

```text
import_preview
import_commit
export_excel
reconciliation
```

### State

```text
pending -> running -> completed
                   -> pending (retry_wait)
                   -> dead_letter
pending -> cancelled
running export/import_preview -> cancel_requested -> cancelled
```

### Public job response

```json
{
  "id": "JOB...",
  "type": "export_excel",
  "status": "running",
  "progress": {
    "percent": 85,
    "step": "persisting_artifact",
    "message": ""
  },
  "attemptCount": 1,
  "maxAttempts": 3,
  "artifact": null,
  "createdAt": "...",
  "startedAt": "..."
}
```

### API vận hành mới

```text
GET  /api/background-jobs/:id
POST /api/background-jobs/:id/cancel
GET  /api/background-jobs/:id/artifact
```

Các endpoint được tenant-scope và giữ role management hiện có.

---

## 4. Data flow trước và sau

### 4.1 Import preview

**Trước**

```text
HTTP upload -> lưu temp filesystem -> in-memory queue -> fork child -> import session
```

**Sau**

```text
HTTP upload (giới hạn file hiện có)
  -> GridFS input artifact
  -> background_jobs(import_preview)
  -> worker lease
  -> child executor có memory cap
  -> import preview pipeline hiện có
  -> import_sessions/rows
  -> xóa input artifact
```

- Idempotency: `import-preview:<sessionId>`.
- Retry: tối đa 2 lần theo backoff.
- Web/worker restart: job `pending` hoặc lease hết hạn được worker khác claim lại.
- Stale import recovery không đánh dấu failed nếu còn persistent job active.

### 4.2 Import commit

**Trước**

```text
POST commit -> web process load session rows -> commit -> response
```

**Sau**

```text
POST commit -> validate session -> enqueue import_commit -> 202/jobId
worker -> load rows từ ImportSessionRow -> commit pipeline hiện có
```

- Queue payload chỉ giữ `sessionId`, type, selected order codes và metadata; **không sao chép toàn bộ rows** vào `background_jobs`.
- Idempotency: `import-commit:<sessionId>`.
- `maxAttempts = 1` vì nghiệp vụ ghi dữ liệu chưa chứng minh retry-idempotent ở mọi điểm lỗi.
- Running commit không bị kill giữa chừng. Chỉ hủy được trước khi worker claim.
- Client cũ không gửi `Prefer: respond-async` vẫn được compatibility adapter chờ kết quả và trả contract cũ; khi quá thời gian chờ sẽ trả 202 thay vì giữ vô hạn.

### 4.3 VAT/SSE/Excel export

**Trước**

```text
GET /api/export/:type.xlsx
 -> query + tạo workbook Buffer trong web heap
 -> trả file
```

**Sau**

```text
GET /api/export/:type.xlsx?async=1 + Prefer: respond-async
 -> enqueue export_excel
 -> 202 + jobId
 -> UI poll job
worker -> chạy export service hiện có -> tạo workbook trong child memory-capped
 -> lưu GridFS
 -> completed
UI -> GET artifact -> stream file
```

- Kết quả workbook vẫn do `importExportService.exportToExcel()` hiện có tạo ra.
- Không bỏ kiểm tra returnOrders/net quantity/VAT/SSE.
- Không đổi tên cột, nội dung hoặc định dạng file.
- Request không có idempotency header được server tạo key ổn định theo user, type, filter và cửa sổ 5 phút.
- Client cũ vẫn gọi URL file cũ; adapter chờ worker rồi stream artifact qua URL cũ.

### 4.4 Reconciliation

**Trước**

```text
setInterval trên mỗi web instance -> ReconciliationService.runReconciliation()
```

**Sau**

```text
setInterval trên web -> enqueue reconciliation với schedule-bucket idempotency
worker -> ReconciliationService.runReconciliation()
```

- Hai web instance cùng tick một bucket chỉ tạo một job do unique idempotency index.
- Manual duplicate trong cùng cửa sổ 5 phút cũng dùng deterministic key nếu client không gửi key.
- `maxAttempts = 1`; reconciliation không tự retry tạo thêm report khi chưa chứng minh idempotency toàn luồng.

---

## 5. Reliability controls

| Yêu cầu | Cơ chế |
|---|---|
| Concurrency limit | `BACKGROUND_JOB_CONCURRENCY`, mặc định 2 |
| Timeout | Timeout riêng trên job; parent kill executor khi quá hạn |
| Memory budget | Child executor dùng `--max-old-space-size=BACKGROUND_JOB_MAX_OLD_SPACE_MB` |
| Retry/backoff | Exponential backoff có cap cho export/import preview |
| Idempotency | Unique `(tenantId, idempotencyKey)` partial index |
| Dead-letter | Hết attempts hoặc lỗi non-retryable -> `dead_letter` |
| Progress | `progress.percent/step/message` trong Mongo |
| Cancellation | Pending: cancel ngay; running chỉ export/import preview; writer không bị kill |
| Worker crash | Lease hết hạn; safe job được claim lại, writer hết attempt vào dead-letter |
| Audit | Queue, claim, retry, complete, cancel, dead-letter ghi audit log |
| Artifact TTL | GridFS metadata có expiry; worker cleanup file hết hạn |
| Job TTL | `expireAt` TTL index trên `background_jobs` |
| Multi-instance scheduler | deterministic schedule bucket + unique index |

### Index mới

```javascript
{ tenantId: 1, id: 1 }                  // unique
{ tenantId: 1, idempotencyKey: 1 }      // unique partial
{ status: 1, availableAt: 1, createdAt: 1 }
{ status: 1, leaseExpiresAt: 1 }
{ expireAt: 1 }                          // TTL
```

Write cost: mỗi job phát sinh một document nhỏ và các update heartbeat/progress. Không thêm index vào collection nghiệp vụ bán hàng, tồn kho, AR hoặc quỹ.

---

## 6. Export memory strategy

Phase 07 bảo vệ web process bằng hai lớp:

1. Workbook được dựng trong child executor, không nằm trong heap của web.
2. Child có hard memory limit bằng V8 old-space cap.
3. Artifact tải xuống bằng GridFS stream; web không đọc toàn bộ file vào Buffer.
4. Import input lưu GridFS thay vì shared temp filesystem.

### Giới hạn còn lại

Export service hiện tại vẫn tạo một `Buffer` hoàn chỉnh **bên trong worker** để bảo toàn byte-level behavior của VAT/SSE/Excel. Phase 07 chưa thay writer hiện tại bằng true streaming XLSX writer vì việc đó có thể làm đổi output file. Vì vậy:

- Web heap đã được cách ly.
- Worker heap được giới hạn.
- Kích thước export tối đa vẫn cần được kiểm soát bằng limit hiện hữu và quan sát production.

---

## 7. Benchmark trước/sau

### Phương pháp

- Dùng chính `excelWriter.util` production.
- 1x = 2.000 dòng, 5x = 10.000 dòng, 10x = 20.000 dòng.
- 5 lần chạy mỗi dataset.
- **Before:** tạo XLSX trong web process.
- **After web:** tạo command/idempotency payload bounded; không mang rows/workbook.
- **After worker:** cùng workbook được tạo trong child giới hạn 256 MB.
- Không bao gồm Mongo enqueue latency hoặc HTTP network vì không có MongoDB production-like.

| Scale | Rows | Web p50 trước | Web p95 trước | Web p99 trước | Web p95 sau | Cải thiện web p95 | Heap web p95 trước | Heap web p95 sau | Worker p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1x | 2.000 | 21,85 ms | 44,89 ms | 44,89 ms | 0,37 ms | 99,16% | 9,96 MB | 14,2 KB | 46,01 ms |
| 5x | 10.000 | 100,60 ms | 116,91 ms | 116,91 ms | 0,12 ms | 99,90% | 31,93 MB | 6,6 KB | 182,29 ms |
| 10x | 20.000 | 208,34 ms | 215,18 ms | 215,18 ms | 0,15 ms | 99,93% | 48,75 MB | 6,0 KB | 339,61 ms |

### Export đồng thời

```text
2 worker x 10.000 dòng
Wall time: 255,66 ms
Worker duration: 184,26 ms / 182,24 ms
Worker heap delta: 19,0 MB / 19,2 MB
Output: 442.511 byte mỗi file
```

Kết luận benchmark: workbook không nhanh hơn; CPU được chuyển sang worker. Giá trị đạt được là web process trả job nhanh và không giữ workbook lớn trong heap.

### Test suite duration

| Baseline | Sau Phase 07 |
|---:|---:|
| 923 PASS, 1 SKIP; wall 10,63 s | 936 PASS, 1 SKIP; wall 10,37–10,63 s tùy lần chạy |

Không có tăng thời gian test đáng kể ngoài số test mới.

---

## 8. Old/New diff chính

### Export controller

```diff
- sendWorkbook(res, await importExportService.exportToExcel(type, query, user));
+ const submitted = await JobSubmissionService.submitExport(...);
+ if (prefersAsync(req)) return res.status(202).json({ jobId: submitted.job.id });
+ const terminal = await BackgroundJobService.waitForTerminal(...); // legacy adapter
+ return ArtifactStore.openDownloadStream(terminal.artifact.fileId).pipe(res);
```

### Import commit

```diff
- const result = await importExportService.commitImport(req.body);
- return res.json(result);
+ const submitted = await AsyncJobHttpAdapter.submitImportCommit(req);
+ if (prefersAsync(req)) return res.status(202).json({ jobId: submitted.job.id });
+ return waitImportCompatibility(submitted, sessionId);
```

### Import job payload

```diff
 payload: {
   sessionId,
   type,
-  rows: payload.rows,
   selectedOrderCodes,
   userName
 }
```

### Reconciliation scheduler

```diff
- await ReconciliationService.runReconciliation('all', ...)
+ await JobSubmissionService.submitReconciliation({
+   idempotencyKey: `reconciliation:scheduled:${scheduleBucket()}`
+ })
```

---

## 9. File thêm/sửa/xóa

### Thêm — production

```text
src/models/BackgroundJob.js
src/services/background-jobs/GridFsArtifactStore.js
src/services/background-jobs/BackgroundJobService.js
src/services/background-jobs/BackgroundJobHandlers.js
src/services/background-jobs/JobSubmissionService.js
src/services/background-jobs/AsyncJobHttpAdapter.js
src/jobs/backgroundJobExecutor.worker.js
src/jobs/backgroundJobWorker.js
scripts/background-job-worker.js
src/controllers/backgroundJobController.js
src/routes/backgroundJobRoutes.js
WORKER_DEPLOYMENT_RUNBOOK.md
```

### Thêm — benchmark/test/report

```text
scripts/performance/background-job-benchmark-child.js
scripts/performance/background-job-isolation-benchmark.js
test/background-job-backoff-unit.test.js
test/background-job-flow-static.test.js
test/background-job-reliability-contract.test.js
test/background-job-submission-unit.test.js
BACKGROUND_JOB_BENCHMARK.json
BACKGROUND_JOB_BENCHMARK.csv
WORKER_AND_EXPORT_SCALABILITY_REPORT.md
```

### Sửa

```text
.env.example
.env.production.example
config/source-bundles.json
docs/openapi.json
package.json
public/fragments/index/07-index-body.html
public/js/app/admin/08d-import-excel.part03.js
public/js/app/admin/08d-import-excel.source/part-03.jsfrag
public/js/app/admin/08f-vat-export.js
src/constants/collectionKeys.js
src/controllers/excelImportController.js
src/controllers/importExportController.js
src/controllers/importRuntimeController.js
src/controllers/systemController.js
src/jobs/reconciliationJob.js
src/models/index.js
src/routes/index.js
src/services/import/preview/importPreview.impl.js
src/services/importSessionService.js
src/services/mongoIndexService.js
```

Ngoài ra cập nhật các characterization/static test trực tiếp bị thay đổi bởi boundary mới.

### Xóa

```text
0 file
```

### Dependency

```text
Package thêm: 0
Package gỡ: 0
package-lock.json thay đổi: Không
```

---

## 10. Quality gate thực tế

| Gate | Kết quả |
|---|---:|
| Syntax | PASS — 896 JavaScript files |
| Source bundles | PASS — 18 bundles |
| Source-size budget | PASS |
| Path portability | PASS — 1.098 paths |
| Enterprise smoke | PASS — 10 modules / 11 flags |
| OpenAPI | PASS — 313 operations |
| Full test suite | PASS — 936; FAIL 0; SKIP 1 |
| Targeted worker/import/export/reconciliation | PASS — 32/32 |
| npm audit production | PASS — 0 vulnerability |
| `npm run quality` | PASS — 17,99 s |
| Web startup HTTP bind | PASS — 7 ms |
| Web DB readiness | NOT RUN — không có `MONGO_URI` |
| Worker DB startup | NOT RUN — không có `MONGO_URI` |
| Live lease/crash/restart với MongoDB | NOT RUN |
| Live two-web-instance scheduler race | NOT RUN |
| Browser/deploy canary | NOT RUN |

Các contract timeout, retry, dead-letter, cancellation, deterministic idempotency và lease được kiểm tra bằng unit/static tests. Không tuyên bố production end-to-end verified khi chưa chạy MongoDB integration.

---

## 11. Rủi ro còn lại

1. **MongoDB integration chưa chạy:** cần test lease reclaim, unique idempotency và GridFS trên replica set/Atlas thực tế.
2. **Worker là thành phần bắt buộc:** nếu chỉ deploy web mà không deploy worker, job sẽ nằm `pending`; legacy compatibility request cuối cùng trả 202.
3. **Workbook vẫn là Buffer trong worker:** web được bảo vệ nhưng worker vẫn cần memory budget phù hợp.
4. **Import commit/reconciliation không tự retry:** đây là lựa chọn an toàn để tránh duplicate side effect; dead-letter cần điều tra thủ công.
5. **Cancellation export/preview:** kill executor có thể để lại GridFS upload chưa hoàn tất; cleanup TTL xử lý file đã finalize, nhưng orphan chunk hiếm vẫn cần operational monitoring.
6. **Queue heartbeat tạo write load:** concurrency mặc định 2 để giới hạn write amplification.
7. **Compatibility adapter giữ HTTP mở:** client cũ vẫn có thể giữ request lâu; UI mới đã dùng 202/poll.

---

## 12. Deployment và rollback

Chi tiết vận hành nằm trong `WORKER_DEPLOYMENT_RUNBOOK.md`.

### Deploy

```bash
npm ci --omit=dev
npm start                     # web service
npm run worker:background     # worker service riêng
```

Cả hai process dùng cùng phiên bản ZIP và `MONGO_URI`.

### Rollback code

1. Dừng worker Phase 07.
2. Deploy lại:

```text
MK-pro-phase06-api-query-performance-patched.zip
```

3. `background_jobs` và GridFS artifact mới có thể giữ nguyên; Phase 06 không đọc chúng.
4. Không rollback hoặc xóa `returnOrders`, inventory ledger, AR ledger, fund ledger, import session, audit log hay reconciliation report.
5. Sau forward-fix, redeploy Phase 07 và worker có thể tiếp tục job còn `pending` nếu contract vẫn tương thích.

### Rollback index nếu bắt buộc

```javascript
db.background_jobs.dropIndex('uniq_background_jobs_tenant_id')
db.background_jobs.dropIndex('uniq_background_jobs_idempotency')
db.background_jobs.dropIndex('idx_background_jobs_status_available')
db.background_jobs.dropIndex('idx_background_jobs_status_lease')
db.background_jobs.dropIndex('ttl_background_jobs_expireAt')
```

Không cần chạy các lệnh trên khi rollback code thông thường; collection operational có thể để lại an toàn.

---

## 13. Kết luận nghiệm thu

- Kiến trúc worker/queue đã được triển khai và quality gate repository đạt.
- Web process không còn trực tiếp dựng VAT/SSE/Excel, commit import hoặc chạy reconciliation.
- API file cũ được giữ bằng compatibility adapter; UI mới dùng 202 + polling.
- Tồn kho, AR, quỹ và logic hàng trả/net quantity không bị thay đổi.
- Chưa thể đánh dấu **production end-to-end verified** cho lease/GridFS/multi-instance do môi trường không có MongoDB production-like.
