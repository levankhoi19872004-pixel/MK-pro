# PRODUCTION OPERATIONS HARDENING REPORT — MK-Pro Prompt 11

## 1. Tóm tắt điều hành

### Hiện trạng

Baseline là `MK-pro-phase10-production-configuration-hardening-patched.zip`, SHA-256 `bfc49bc30ec709b48af21ccc52d9f62b8244f98fd391c14839d0e974b035e5dd`. Dự án đã có pino, startup readiness gate, API monitor in-memory, background-job lease/retry và logical backup; tuy nhiên chưa có liveness riêng, request ID xuyên suốt, idle worker heartbeat, release manifest thực thi, restore drill có safety gates và bộ runbook đầy đủ.

### Vấn đề quan trọng tìm thấy

1. `SIGTERM` trong lúc Mongoose còn `connecting` làm baseline chờ deadline 5 giây rồi thoát mã 1; có thể gây deploy bị đánh dấu thất bại và shutdown không sạch.
2. Health/readiness chưa tách rõ dependency-free liveness với readiness dependency-aware.
3. Log chưa có request ID xuyên HTTP → background job/executor và redaction tập trung chưa đủ.
4. Worker chỉ có lease heartbeat cho active job, chưa có process heartbeat khi idle và trạng thái release.
5. Không có manifest liên kết source/bundle/package-lock/config/release operator.
6. Backup logical có file nhưng chưa có integrity digest kỹ thuật và restore procedure thực thi có guard.
7. Atlas backup/PITR, off-host retention và MongoDB staging restore chưa có bằng chứng trong môi trường này.

### Những gì đã thay đổi

- Thêm `/api/health/live`, `/api/health/ready` và alias tương thích `/api/health/readiness`.
- Thêm request context bằng `AsyncLocalStorage`, header `X-Request-Id`, propagate vào background job và executor.
- Chuẩn hóa structured logger/redaction/error classification, không log query string/secret/body tài chính.
- Thêm admin operations/release status, process memory, API summary, queue state và heartbeat.
- Thêm `operational_heartbeats` có TTL cho web/worker; worker heartbeat cả khi idle/busy/failure.
- Làm an toàn graceful shutdown và fix thực tế khi SIGTERM trong Mongo connecting.
- Thêm integrity digest vào logical backup; verify checksum/count/integrity.
- Thêm restore drill Mongo cô lập có guard và offline logical simulation.
- Thêm release manifest generator/checker và manifest thực tế.
- Thêm deployment/rollback/backup-restore/incident runbooks.

### Những gì không thay đổi

Không sửa công thức tồn kho, stock post/reverse, AR/fund ledger, return, accounting confirmation, VAT/SSE, giá, promotion, import Excel format, NVBH/NVGH permission, API contract nghiệp vụ hoặc schema MongoDB nghiệp vụ. Không có migration và không kết nối production.

### Mức độ sẵn sàng

**Code/operational controls:** đạt ở local test. **Production recovery proof:** chưa đạt vì chưa restore một backup đại diện vào MongoDB staging/test thật và chưa xác minh Atlas backup/PITR. Quyết định cuối: `NOT_APPROVED_FOR_PROMPT_12` cho tới khi đóng hai gate này.

## 2. Khảo sát ban đầu

### Sơ đồ vận hành

```text
User request
  -> Express web / request ID / structured log
  -> route/controller/service/repository
  -> MongoDB Atlas
  -> background_jobs persistent queue
  -> worker + child executor + GridFS artifact
  -> API monitor / operational heartbeats / release manifest
  -> logical backup + checksum + restore drill
```

### Production readiness audit

| Hạng mục | Trước | Sau | Bằng chứng |
|---|---|---|---|
| Health check | Một phần | Đạt | `src/routes/health.routes.js` |
| Readiness check | Một phần | Đạt local | Mongo ping, bootstrap, models, temp storage |
| Liveness check | Chưa có | Đạt | dependency-free `/api/health/live` |
| Structured logging | Một phần | Đạt | `src/observability/logger.js` |
| Request ID | Chưa xuyên suốt | Đạt | ALS + response header + job/executor |
| Error classification | Chưa chuẩn | Đạt | 10 class lỗi kỹ thuật |
| Graceful shutdown | Một phần, lỗi connecting | Đạt simulation | baseline exit 1/5012 ms; after exit 0/12 ms |
| Mongo reconnect | Một phần | Một phần | driver behavior; không có outage drill với Atlas |
| Worker recovery | Một phần | Nâng cao | lease/retry + process heartbeat + bounded stop |
| Job retry | Có | Giữ nguyên | side-effect jobs vẫn one-attempt |
| Job idempotency | Có | Giữ nguyên | không thay key/business rule |
| Metrics | In-memory | Nâng cao | p50/p95/p99, status, DB query count, process snapshot |
| Alerting | Chưa tích hợp | Tài liệu/đề xuất | chưa có external alert channel |
| Backup | Một phần | Nâng cao | checksum + integrity + release metadata |
| Restore test | Chưa có | Một phần | offline PASS; Mongo staging chưa chạy |
| Release manifest | Chưa có | Đạt | generator/check + `RELEASE_MANIFEST.json` |
| Rollback procedure | Mỏng | Đạt tài liệu/local evidence | `ROLLBACK_RUNBOOK.md` |
| Secret management | Một phần | Một phần | source/log redaction; nơi lưu production chưa xác minh |
| Deployment checklist | Có bản cũ | Đạt | runbook cụ thể release/worker/health |
| Incident runbook | Chưa đủ | Đạt tài liệu | 17 tình huống |

### Điểm lỗi im lặng/process/job/manual

- Process có thể chết khi fatal promise/exception: nay chuyển sang structured fatal + shutdown exit code 1.
- Dependency chưa ready: business API bị gate 503, liveness vẫn sống để platform không restart sai.
- Worker idle trước đây khó phân biệt “không có job” với “đã chết”: heartbeat giải quyết.
- Job active khi shutdown: worker ngừng claim, chờ bounded, sau đó lease-safe failure; không blind-complete.
- Backup trước đây verify file/count nhưng thiếu digest tổng kỹ thuật: đã bổ sung.
- Restore và release trước đây phụ thuộc thao tác nhớ tay: đã có executable scripts/runbooks.

## 3. Thay đổi đã triển khai

| File/module | Thay đổi | Lý do | Tác động/test |
|---|---|---|---|
| `src/observability/requestContext.js` | Tạo/validate request ID, ALS context | Trace HTTP/service/repository/job | 2 unit tests + HTTP test |
| `src/observability/redaction.js`, `logger.js` | Redact token/cookie/Mongo URI/secret; structured base fields | Điều tra lỗi không lộ secret | redaction tests, CSP scan |
| `src/observability/errorClassification.js` | Chuẩn hóa error code kỹ thuật | Nhóm lỗi/alert | unit tests |
| `src/routes/health.routes.js` | live/ready/readiness/db | Tách liveness/readiness | HTTP test 200/503 |
| `src/services/operationsService.js` | readiness, process/API/queue/worker summary | Admin operational visibility | role/static + HTTP tests |
| `src/models/OperationalHeartbeat.js`, `heartbeatService.js` | Web/worker heartbeat + TTL | Detect worker/web stale | schema/index/static tests |
| `src/jobs/backgroundJobWorker.js` | Idle/busy heartbeat, bounded stop, redacted executor output | Restart/job safety | existing queue tests + operational contract |
| `src/jobs/backgroundJobExecutor.worker.js` | request context + structured errors/signals | Trace child job | full regression |
| `src/services/background-jobs/BackgroundJobService.js` | requestId persisted, safe failure payload | Cross-process trace | full regression |
| `src/app.js` | logger, request middleware, fatal handlers, bounded shutdown | Process safety | SIGTERM regression test |
| `src/services/systemService.js` | backup integrity/release metadata | Detect corruption/wrong restore | backup unit + offline drill |
| `scripts/restore-drill*.js` | guarded Mongo drill + offline simulation | Executable recovery proof | offline PASS; Mongo blocked |
| `scripts/generate-release-manifest.js` | source/bundle/lock/config hashes | Trace release | generate/check PASS |
| `scripts/operations-failure-simulation.js` | Mongo unavailable, SIGTERM, bad env, bad temp path | Repeatable failure test | all scenarios PASS |
| `src/routes/systemRoutes.js` | private operations/release endpoints | Detail only for admin/manager | RBAC static/full tests |

### Old/New quan trọng — shutdown

**Old:** đóng HTTP rồi `await mongoose.disconnect()` không giới hạn riêng; khi state `connecting`, chờ server-selection tới watchdog và exit 1.

**New:** phát hiện state `connecting`, force-close native client không chặn deadline; bootstrap catch nhận biết shutdown request; request mới dừng, jobs dừng, heartbeat kết thúc và process exit đúng mã.

### Old/New — backup

**Old:** gzip + SHA-256 + collection counts.

**New:** giữ nguyên format tương thích, bổ sung release metadata, deterministic collection digest và technical totals; verify phát hiện file hợp lệ nhưng dữ liệu bên trong bị thay đổi.

## 4. Health và monitoring

### Public endpoints

- `GET /api/health/live`: 200 nếu process sống; không query DB, không trả version/host/secret.
- `GET /api/health/ready`: 200 chỉ khi startup ready, Mongo connected+ping, models initialized, temp storage writable; ngược lại 503.
- `GET /api/health/readiness`: alias tương thích.

### Private endpoints

- `GET /api/system/operations`: admin/manager; release, readiness, startup steps, process memory/load, Mongo state, p50/p95/p99 API, slowest routes, queue summary, worker heartbeat.
- `GET /api/system/release`: admin/manager; manifest đầy đủ.

### Metrics và alerting

Metrics hiện là in-memory + Mongo heartbeat; không thêm Prometheus/SaaS. Alert thresholds chưa tự đặt vì không có production baseline. Cần lấy ít nhất 7–14 ngày để đặt error rate/p95/memory/job stuck/heartbeat/backup alerts. In-memory API stats reset khi process restart; đây là rủi ro Medium.

## 5. Backup và restore

- Offline logical drill: PASS, 64 collections, 8 documents, 53 ms.
- Checksum/integrity: PASS.
- MongoDB staging restore: **không chạy được**; không có URI staging/mongod, memory-server binary download bị `EAI_AGAIN`.
- Atlas snapshot/PITR/retention: UNKNOWN, không giả định.
- RTO observed chỉ có offline 53 ms, không đại diện database thật.
- RPO thực tế phụ thuộc Atlas/logical backup frequency chưa được owner xác nhận.

Do đó câu hỏi “backup có thực sự khôi phục được trên MongoDB không?” hiện trả lời: **chưa chứng minh**.

## 6. Release và rollback

Manifest release `2026-06-20-01`:

- source SHA-256 `58e23f4002f4ad68152e2a13476e518b311519cbbcd8330998867a8eb270f893`;
- bundle SHA-256 `5028b4dbd5aedc798dd8ff42151208629b6bb78fc789021184b7418a711e8a66`;
- package-lock SHA-256 `0ee29e9f7858dd144d9ba6fa6e5b51b4ee4e9fa9024a2f6d9c56ca354d0b2d23`;
- config version `84ef3c5e422bf22fe01b52a75a2f02cad48da7f1b6e36fe01f30f190b91cc8c8`;
- migrations `[]`;
- git commit `unavailable` vì baseline là ZIP không có `.git`; pipeline production phải truyền `GIT_COMMIT`.

Rollback Prompt 11 không cần DB rollback. Prompt 10 artifact/hash đã xác minh và full baseline test đạt. Render rollback thực tế chưa chạy vì không triển khai production/staging.

## 7. Failure simulation

| Tình huống | Hành vi mong đợi | Kết quả thực tế |
|---|---|---|
| Mongo unavailable | live 200, ready 503, business 503 | PASS |
| SIGTERM giữa Mongo connecting | exit 0 trước deadline | PASS, 916 ms trong combined simulation |
| Missing/invalid env | fail fast, nêu tên biến, không lộ giá trị | PASS |
| Temp path không ghi được | readiness dependency fail | PASS |
| Release manifest stale | check command fail | PASS qua generator/check tests |
| Restore target không an toàn | script từ chối | Static/unit contract PASS |
| Worker restart giữa job | lease-safe, không blind complete | Contract/full tests PASS; chưa drill với Mongo thật |

Một lỗi shutdown thật đã được phát hiện trong lần simulation đầu và sửa; test regression riêng hiện PASS.

## 8. Regression nghiệp vụ

| Nhóm | Kết quả |
|---|---|
| Tồn kho/post/reverse/idempotency | Không đổi; tests cũ giữ nguyên và pass |
| Công nợ/AR | Không đổi; không migration |
| Quỹ/fund ledger | Không đổi |
| Return partial/full | Không đổi |
| VAT/SSE | Không đổi format/result |
| Import/export | Không đổi contract/format; worker observability בלבד |
| Xác nhận kế toán | Không đổi |
| Phân quyền | Business RBAC không đổi; operations detail chỉ admin/manager |

Full suite sau test-gate fix trên Linux: **974 tests, 973 pass, 0 fail, 1 skip**. Baseline Prompt 10: 962 tests, 961 pass, 0 fail, 1 skip.

## 9. Performance baseline trước/sau

| Chỉ số | Trước | Sau | Nhận xét |
|---|---:|---:|---|
| Startup/listen local | 1064.97 ms | 1027.05 ms | không suy giảm |
| Readiness p95 local | 1.847 ms | 1.401 ms | không query nặng |
| Web idle RSS | 221.15 MiB | 218.55 MiB | giảm nhẹ trong run này |
| Worker idle RSS | 148.28 MiB | 154.68 MiB | +6.40 MiB; chấp nhận, cần prod baseline |
| Health API p95 | 1.539 ms | 1.618 ms | +0.080 ms, không đáng kể |
| Error rate | 0 | 0 | local synthetic |
| Shutdown connecting | 5012 ms / exit 1 | 12 ms / exit 0 | lỗi được sửa |
| Mongo restore | N/A | Chưa đo | gate còn mở |
| Deploy/rollback Render | N/A | Chưa đo | không deploy production |

## 10. Kết quả kiểm thử thực tế

- Syntax: 932 JS files PASS.
- Full test Linux: 974 / pass 973 / fail 0 / skip 1.
- Operations tests Linux: 12/12 PASS.
- Windows local: hai integration test dùng POSIX `SIGTERM` được skip có lý do vì `child.kill(SIGTERM)` cưỡng bức kết thúc process; kiểm chứng bắt buộc thực hiện trên Linux/Render staging.
- Source bundles: 19 PASS.
- OpenAPI: 315 operations, 2 tests PASS, document up-to-date.
- CSP/XSS: 334 findings, blocking 0.
- Enterprise smoke: 10 modules/11 flags PASS.
- Path portability: 1202 paths PASS.
- Lock registry: PASS.
- npm audit production: 0 vulnerability.
- Production readiness simulated config: OK, một warning chủ động vì auto-index để pipeline quản lý.
- Failure simulation: PASS.
- Offline restore: PASS.
- Actual Mongo restore: NOT EXECUTED.

## 11. Rủi ro còn lại

### Critical

- Không có rủi ro code Critical đã biết trong phạm vi patch.

### High

1. Chưa chứng minh backup đại diện restore thành công vào MongoDB staging/test và reconciliation sạch.
2. Chưa có bằng chứng Atlas backup/PITR/retention/restore permission hiện đang bật đúng.

### Medium

1. Metrics API in-memory mất khi restart; chưa có alert channel tự động.
2. Git commit unavailable khi build từ ZIP; pipeline phải truyền `GIT_COMMIT`.
3. Secret manager/rotation và off-host backup storage chưa được xác minh bằng quyền thực tế.
4. Worker restart/failover chưa drill với MongoDB thật và job fixture đại diện.
5. Deployment/rollback duration trên Render chưa được đo.

### Low

1. Heartbeat collection thêm write nhỏ theo interval; benchmark local chưa thấy suy giảm đáng kể.
2. Một số operational constants cũ trong API monitor vẫn đọc env trực tiếp; giữ để tránh mở rộng Prompt 11.

## 12. Hướng rollback bản vá Prompt 11

Redeploy Prompt 10 ZIP/hash nêu trong `ROLLBACK_RUNBOOK.md`, dùng config snapshot cũ, dừng worker trước web, không rollback DB. Giữ `operational_heartbeats`/`background_jobs.requestId`; chúng additive và không ảnh hưởng nghiệp vụ. Smoke-test và đối chiếu chứng từ trong cửa sổ deploy.

## 13. Kết luận bắt buộc

1. **Backup có thực sự khôi phục được không?** Offline logical: có. MongoDB staging/Atlas: chưa được chứng minh.
2. **Release có truy vết được không?** Có bằng manifest/hash/release endpoint; Git commit cần pipeline cung cấp.
3. **Rollback đã được chạy thử chưa?** Baseline artifact/test được xác minh; rollback Render thực tế chưa chạy.
4. **Worker restart có an toàn không?** Thiết kế lease/bounded stop và tests cho thấy an toàn hơn; chưa drill với Mongo thật/job đại diện nên chưa thể tuyên bố tuyệt đối.
5. **Log có đủ điều tra không?** Đủ cho request/job/release/error class cơ bản, có redaction; chưa có centralized retention/search ngoài platform log.
6. **Monitoring phát hiện lỗi chính không?** Có cho health, DB, API, process, queue, worker heartbeat; alerting external chưa tích hợp.
7. **Có thay đổi nghiệp vụ không?** Không phát hiện; contract/schema/domain rules giữ nguyên.
8. **Đủ điều kiện chuyển Prompt 12 không?** **Không**, cho tới khi có actual isolated Mongo restore PASS, Atlas backup evidence và một staging deploy/rollback drill.

# NOT_APPROVED_FOR_PROMPT_12


## Phụ lục — Test gate portability fix 2026-06-21

- Loại bỏ phụ thuộc ngày cố định trong hai test API query performance bằng business date hiện tại.
- Sửa audit-service casing test bằng directory entry chính xác, tương thích filesystem Windows không phân biệt hoa/thường.
- `pretest` tự xóa đúng hai fragment canonical-source đã được chứng minh retired.
- Hai SIGTERM integration tests tiếp tục chạy đầy đủ trên Linux; Windows skip có lý do do giới hạn nền tảng, không tuyên bố graceful SIGTERM đã được chứng minh trên Windows.
- Không sửa code nghiệp vụ, API contract, MongoDB schema hoặc worker job semantics.
