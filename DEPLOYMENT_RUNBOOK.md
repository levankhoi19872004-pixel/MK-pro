# MK-Pro — Deployment Runbook — Prompt 11

## 1. Mục tiêu và phạm vi

Runbook này dùng cho một web service Node.js/Express và một background worker dùng chung MongoDB Atlas. Không chứa secret thật, không tự chạy migration, không thay đổi business rule.

Release hiện tại trong artifact này:

| Thuộc tính | Giá trị |
|---|---|
| Release ID | `2026-06-20-01` |
| Version | `1.0.0` |
| Source SHA-256 | `58e23f4002f4ad68152e2a13476e518b311519cbbcd8330998867a8eb270f893` |
| Bundle SHA-256 | `5028b4dbd5aedc798dd8ff42151208629b6bb78fc789021184b7418a711e8a66` |
| Package-lock SHA-256 | `0ee29e9f7858dd144d9ba6fa6e5b51b4ee4e9fa9024a2f6d9c56ca354d0b2d23` |
| Previous release | `phase10` |
| Database migration | Không có |

## 2. Trách nhiệm tối thiểu

- **Release owner:** xác nhận artifact, manifest, biến môi trường, thời điểm và người deploy.
- **Business verifier:** kiểm tra mẫu đơn/tồn/công nợ/quỹ/hàng trả/VAT-SSE sau deploy; không tự sửa dữ liệu.
- **Incident owner:** quyết định rollback khi health, error rate hoặc đối soát không đạt.
- **Backup owner:** xác nhận backup gần nhất, checksum và restore-drill hợp lệ.

Một người có thể giữ nhiều vai trò trong NPP, nhưng từng mục phải được ghi tên trong release record.

## 3. Trước deploy

### 3.1. Xác minh artifact

```bash
sha256sum MK-pro-phase11-production-operations-hardened.zip
unzip -t MK-pro-phase11-production-operations-hardened.zip
npm ci
npm run check:syntax
npm run check:source-bundles
npm run docs:check
npm run check:release-manifest
npm test
npm audit --omit=dev --audit-level=high
```

Không deploy khi `RELEASE_MANIFEST.json` stale hoặc source/bundle hash không khớp.

### 3.2. Xác minh cấu hình

- So sánh biến production với `.env.production.example` và `ENVIRONMENT_VARIABLES.md`.
- Secret nằm trong Render/secret store, không nằm trong ZIP, Git, log hoặc chat.
- Ghi lại giá trị **không nhạy cảm** và fingerprint/version của secret; không chép secret vào checklist.
- Xác nhận web và worker dùng cùng `MONGO_URI`, release ID và cấu hình tenant hiện hữu.
- `OPERATIONS_HEARTBEAT_STALE_MS > OPERATIONS_HEARTBEAT_INTERVAL_MS`.
- `BACKGROUND_JOB_CONCURRENCY` giữ theo baseline trừ khi đã có benchmark riêng.

### 3.3. Backup gate

- Xác minh Atlas backup/PITR trên giao diện Atlas; Prompt 11 không có quyền chứng minh trạng thái này.
- Tạo hoặc xác minh logical backup gần nhất:
  - checksum PASS;
  - thời điểm nằm trong RPO được duyệt;
  - có bản sao ngoài filesystem của Render;
  - có kết quả restore drill MongoDB staging/test còn hiệu lực.
- Nếu chưa có restore drill thật: **không coi release là production-approved**.

### 3.4. Release record

Ghi vào ticket/file vận hành:

```text
releaseId:
sourceZipSha256:
sourceSha256:
bundleSha256:
packageLockHash:
configurationVersion:
previousReleaseId:
startedAt:
releasedBy:
backupFile/checksum:
restoreDrillResult:
rollbackArtifact:
```

## 4. Trình tự deploy

1. Dừng worker trước để ngừng claim job mới.
2. Gửi `SIGTERM`; chờ log `Graceful shutdown completed`.
3. Kiểm tra không còn job `running` quá lease hoặc job side-effect bị tự retry.
4. Deploy web artifact mới trên Render.
5. Theo dõi startup log có `releaseId=2026-06-20-01`.
6. Kiểm tra:

```text
GET /api/health/live  -> 200
GET /api/health/ready -> 200 chỉ sau khi Mongo/config/model/temp storage sẵn sàng
```

7. Đăng nhập bằng tài khoản quản trị và kiểm tra `GET /api/system/release` khớp manifest.
8. Kiểm tra `GET /api/system/operations`: DB connected, heartbeat web healthy, không có lỗi queue bất thường.
9. Deploy worker từ **cùng artifact/release**.
10. Kiểm tra heartbeat worker và một job export/import nhỏ không tạo side effect tài chính ngoài dự kiến.

Không chạy đồng thời web/worker có contract queue không tương thích. Prompt 11 không thay contract nghiệp vụ và không có migration, nhưng vẫn phải cùng release để truy vết.

## 5. Smoke test sau deploy

- Login/refresh/logout.
- Danh sách đơn bán và một chi tiết đơn.
- Tồn kho một sản phẩm mẫu.
- Công nợ một khách mẫu.
- Sổ quỹ một ngày mẫu.
- Một return order partial và một full-return chỉ ở chế độ đọc/đối chiếu.
- Xuất VAT/SSE phạm vi nhỏ và so sánh baseline.
- Import preview file nhỏ; không commit dữ liệu thật nếu không có kế hoạch.
- Worker nhận/hoàn tất một export không tài chính.
- `X-Request-Id` xuất hiện trong response và log liên quan.
- Không có token, cookie, Mongo URI hoặc body tài chính trong log.

## 6. Theo dõi 30 phút đầu

- Error rate và HTTP 5xx.
- API p95/p99 theo route.
- Memory/RSS và restart count.
- Mongo connection errors.
- Worker heartbeat, queued/running/failed/dead-letter.
- Job duration và stuck lease.
- Temp/disk capacity.
- Reconciliation mismatch; không tự sửa.

Ngưỡng ban đầu phải lấy từ baseline thực tế. Không áp ngưỡng tùy ý chỉ vì tài liệu mẫu.

## 7. Điều kiện rollback

Rollback ngay khi:

- readiness không lên trong cửa sổ deploy đã duyệt;
- web/worker restart lặp lại;
- lỗi 5xx hoặc latency tăng rõ rệt so baseline;
- xuất hiện duplicate posting/retry không chứng minh idempotency;
- stock/AR/fund/return/VAT-SSE khác baseline;
- release endpoint không khớp artifact;
- log lộ secret;
- job side-effect bị kẹt không xác định trạng thái.

Thực hiện `ROLLBACK_RUNBOOK.md`; không tự restore database chỉ để chữa lỗi code.

## 8. Kết thúc deploy

Ghi `finishedAt`, kết quả health/smoke, dashboard/log evidence, job IDs đã thử, người xác nhận nghiệp vụ và quyết định giữ release/rollback. Tag/release artifact và lưu SHA-256 ở nơi độc lập với máy chạy.
