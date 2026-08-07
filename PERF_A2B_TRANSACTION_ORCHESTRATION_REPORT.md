# PERF-A2B — Transaction Orchestration và Bounded Concurrency

## 1. Kết luận gate

**Trạng thái: `PASS_WITH_DEFERRED_RUNTIME`**

- E1 source/static: **PASS**.
- E2 deterministic offline: **PASS**.
- E3 Mongo staging, production latency/p95 và canary concurrency 2/3: **DEFERRED_TO_PERF_A6**.
- Production default: **`PERF_BULK_CONCURRENCY=1`**.
- Không tạo transaction bao toàn batch; mỗi input vẫn có transaction riêng.

## 2. Root cause

A2A đã collapse initial reads nhưng `DeliveryAdjustmentBulkCommitService` vẫn `await` từng transaction theo thứ tự. Vì vậy các đơn độc lập không tận dụng được thời gian chờ I/O và một transaction chậm kéo dài toàn bộ batch.

RED-first được chạy trước khi sửa production source: 3 test mô tả legacy serial PASS, còn GREEN contract FAIL đúng dự kiến vì `BulkTransactionOrchestrator` chưa tồn tại. Log: `evidence/perf-a2b/A2B_RED_FIRST.log`.

## 3. Thiết kế scheduler

`BulkTransactionOrchestrator.runBoundedByIdentity()` sử dụng hàng đợi request-scoped:

- Giới hạn global bằng `PERF_BULK_CONCURRENCY`, mặc định 1, hard-cap 3 khi chưa có E3.
- Lock theo `batchContextItem.canonicalOrderKey`; cùng identity có parallelism tối đa 1.
- Kết quả được ghi vào index gốc, nên response luôn giữ đúng thứ tự input dù completion order khác.
- Chỉ bật parallelism >1 khi batch context đầy đủ và không có caller-owned session.
- Nếu batch context fallback legacy hoặc caller truyền session, effective concurrency tự hạ về 1.
- Không dùng global mutable cache và không chia sẻ scheduler giữa request.

Workload deterministic có một task chậm và một duplicate identity:

| Mode | Makespan work-unit | Max active | Max cùng identity | Speedup thuật toán |
|---|---:|---:|---:|---:|
| Serial 1 | 150 | 1 | 1 | 1,000x |
| Bounded 2 | 110 | 2 | 1 | 1,364x |
| Bounded 3 | 110 | 3 | 1 | 1,364x |

Work-unit chỉ chứng minh orchestration; không đại diện thời gian Mongo hoặc production p95.

## 4. Same-identity contract

Hai input cùng canonical order không chạy song song. Input sau chờ transaction trước commit/abort, sau đó đi qua scoped refresh để nhìn thấy write mới nhất. Kết quả test:

- `maxActivePerIdentity = 1` ở concurrency 1/2/3.
- Không double-post ledger.
- Không tạo closeout version cạnh tranh trong simulator.
- Result order vẫn theo input position.

## 5. Transaction và retry

- Transaction vẫn theo từng đơn qua `withOptionalMongoTransaction`.
- Commit/abort độc lập; một task lỗi không rollback task khác.
- Retry mặc định 1 lần, tối đa 2 lần cấu hình.
- Chỉ retry lỗi transient transaction rõ ràng như `TransientTransactionError`/`WriteConflict`.
- Không retry validation/business error.
- Không retry duplicate key toàn command.
- Không retry toàn command khi chỉ có `UnknownTransactionCommitResult`; Mongo driver `session.withTransaction` chịu trách nhiệm commit-result handling.
- Deterministic retry evidence: 2 attempts, 1 successful write; validation và duplicate key đều chỉ 1 attempt.

## 6. Correctness parity

Các batch 1/16/26/60/100 đều khớp A2A ở concurrency 1, 2 và 3:

- Financial snapshot: **MATCH**.
- Return state và payment allocation: **MATCH**.
- Error/result order: **MATCH**.
- Debt deviation: **0**.
- Duplicate ledger: **0**.
- Transaction count: đúng bằng số input.
- Commit/abort count: khớp A2A từng batch.

Batch 60 có 60 transaction; 55 commit và 5 abort ở cả A2A, concurrency 1, 2 và 3.

## 7. Test evidence

| Test | Trạng thái |
|---|---:|
| RED-first contract | Expected FAIL: 3 PASS / 1 FAIL |
| PERF-A2B GREEN | 16/16 PASS |
| PERF-A2A regression | 9/9 PASS |
| PERF-A1B regression | 9/9 PASS |
| Delivery/financial dependency-free regression | 47/47 PASS |
| JavaScript syntax | 1600/1600 PASS |
| Mongoose-dependent test | NOT_RUN — thiếu `node_modules/mongoose` |
| Mongo transaction integration | NOT_RUN — deferred E3 |
| Production p95/5xx/canary 2–3 | NOT_RUN — PERF-A6 |

## 8. Changed files

### Production

- `src/services/delivery/BulkTransactionOrchestrator.js` — thêm mới.
- `src/services/delivery/DeliveryAdjustmentBulkCommitService.js` — chuyển loop tuần tự sang bounded identity scheduler.

### Test và tooling

- `test/performance/perf-a1b/perf-a1b-offline-repro.test.js`.
- `test/performance/perf-a2b/perf-a2b-green-contract.test.js`.
- `test/performance/perf-a2b/perf-a2b-red-scheduler.test.js`.
- `test/performance/perf-a2b/perf-a2b-transaction-orchestration.test.js`.
- `test/performance/perf-a2b/transaction-orchestration-simulator.js`.
- `scripts/performance/perf-a2b/run-transaction-orchestration.js`.

Không xóa file và không có migration/schema change.

## 9. Release policy và rollback

Release candidate giữ `PERF_BULK_CONCURRENCY=1`. Concurrency 2 hoặc 3 chỉ được bật canary tại PERF-A6 sau khi có E3 về Mongo transaction, connection pool, physical query count, latency/p95, 5xx và duplicate-ledger audit.

Rollback tức thời: đặt `PERF_BULK_CONCURRENCY=1` hoặc tắt `PERF_BULK_BATCH_CONTEXT_V1`.
