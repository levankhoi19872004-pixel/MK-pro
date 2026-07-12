# PHASE255A-R1 — REPRODUCIBLE RELEASE FINALIZATION REPORT

## 1. Phạm vi và kết luận

Phase255A-R1 chỉ sửa release tooling của artifact Phase255A. Logic optional-backend-route lazy-load, Enterprise, scheduler, route alias và toàn bộ writer nghiệp vụ không thay đổi.

Kết luận cuối: `PASS — release finalization gate đạt yêu cầu`.

## 2. Root cause

### 2.1 Manifest Phase255A stale

Manifest trong ZIP đầu vào ghi:

- `releasePhase`: `Phase255A`;
- `sourceFileCount`: `1617`;
- `sourceSha256`: `a6aee57152a91e475dafa7a6d964182c6f10058f0d710a125c7942f632c3bb9a`;
- `configurationVersion`: `0071c71c2487c6612f7c7e0c8ba64b75c90d05db8e45cea614d2bf2d33a3f190`.

Kiểm tra trực tiếp cây source giải nén cho kết quả:

- `sourceFileCount`: `1615`;
- `sourceSha256`: `1138d7e7707fce89bb7ce8d0d08878f23622eb23eaf7ba72e2cf2860c5e09c44`;
- `configurationVersion`: `8a91938e1b7749d2dd6097714d0180a6f3df7c50a91530f24f956ebc0d2b97d3`.

Đối chiếu với artifact Phase253 chứng minh hai file thuộc source-hash scope đã bị rơi khỏi ZIP Phase255A:

1. `.env.production.example`;
2. `test/fixtures/index-page/phase79-assembled.sha256`.

Phase255A report ghi canonical builder đã fail do thiếu binary `zip`, sau đó ZIP được tạo thủ công qua Node archiver. Script ad-hoc đó không nằm trong artifact nên không thể chỉ ra chính xác dòng include/exclude gây mất file; bằng chứng chắc chắn là hai file tồn tại ở Phase253, manifest Phase255A tính chúng trong count/hash, nhưng ZIP cuối không chứa chúng.

### 2.2 Deployment verifier không phát hiện manifest stale

Verifier cũ chỉ thực hiện:

```text
unzip -Z1
→ validate path policy
→ unzip ra temp
→ kiểm required files/directories
```

Nó chỉ kiểm `RELEASE_MANIFEST.json` tồn tại, không chạy cùng manifest contract trên cây đã giải nén. Vì vậy ZIP sạch về path vẫn pass dù hash/count trong manifest sai.

### 2.3 Canonical builder phụ thuộc môi trường

`scripts/create-deployment-artifact.js` cũ gọi trực tiếp:

```js
spawnSync('zip', ...)
```

Khi hệ điều hành không có binary `zip`, builder fail với `ENOENT`; quy trình sau đó dùng đường tạo ZIP khác ngoài canonical contract.

### 2.4 Quality runner phụ thuộc PATH

`scripts/run-quality-gate.js` cũ gọi trực tiếp:

```js
spawnSync('npm', ...)
```

Môi trường không expose `npm` trên PATH sẽ fail dù `npm_execpath` có sẵn. Runner không xử lý `npm.cmd` trên Windows và không dùng npm CLI đi cùng Node.

## 3. Thiết kế sau sửa

```text
Shared release policy
→ manifest generator/checker có rootDir
→ canonical JSZip builder
→ source artifact verifier bằng JSZip
→ deployment verifier bằng JSZip
→ extract vào temp
→ manifest checker chạy trên extracted root
→ CRC32 ZIP integrity
→ non-mutating quality checksum
```

### 3.1 ZIP implementation duy nhất

File mới `scripts/lib/zip-artifact.js` cung cấp:

- deterministic ZIP creation;
- sorted canonical entry ordering;
- normalized `/` path;
- CRC32 verification;
- ZIP list/extract không cần `zip`, `unzip`, `tar` hay PowerShell;
- path traversal và duplicate-entry guard.

`jszip@^3.10.1` được khai báo trực tiếp trong `package.json` và khóa trong `package-lock.json`.

### 3.2 Manifest checker dùng chung

`checkManifest({ root, manifestPath })` dùng cùng `manifestContract()` cho:

- source workspace;
- extracted deployment artifact;
- test fixture.

CLI hỗ trợ:

```text
--root
--manifest
--phase
--version
--release-id
--environment
SOURCE_DATE_EPOCH
```

### 3.3 Canonical artifact builder

Builder mới:

1. yêu cầu workspace manifest đang hợp lệ;
2. lấy file list từ shared policy;
3. từ chối output nằm trong source root;
4. tạo ZIP bằng JSZip với timestamp từ manifest;
5. chạy source verifier;
6. chạy deployment verifier;
7. kiểm manifest extracted và CRC32;
8. xóa ZIP nếu bất kỳ gate nào fail.

Không có fallback thủ công.

### 3.4 Quality runner portable

NPM resolution:

```text
npm_execpath hợp lệ
→ process.execPath <npm-cli.js>
→ npm.cmd trên Windows
→ npm trên POSIX
```

Child process dùng argument array, `shell: false`, kiểm `error`, `signal`, `status` và fail-fast.

## 4. Manifest contract

| Field | Nguồn | Check lại | Deterministic |
|---|---|---:|---:|
| `releasePhase` | CLI/env | Dùng để tái tạo expected manifest | Có |
| `releaseVersion` | CLI/env/package | Có | Có |
| `releaseId` | CLI/env/generatedAt | Shape/identity giữ nguyên | Có khi timestamp cố định |
| `sourceSha256` | `manifestContract()` | Có | Có |
| `sourceFileCount` | Source hash scope | Có | Có |
| `bundleSha256` | `source-bundles.json` outputs | Có | Có |
| `bundleFileCount` | Bundle registry | Có | Có |
| `configurationVersion` | env templates được phép | Có | Có |
| `generatedAt` | `SOURCE_DATE_EPOCH` hoặc clock | Shape/identity giữ nguyên | Có khi `SOURCE_DATE_EPOCH` |
| `generatorVersion` | Release policy module | Có | Có |
| `policyVersion` | Release policy module | Có | Có |
| `packageLockSha256` | `package-lock.json` | Có | Có |
| `sourceHashScope` | Shared policy | Có | Có |

## 5. Artifact contract

| Gate | Workspace | ZIP entries | Extracted ZIP |
|---|---:|---:|---:|
| Path traversal/duplicate | — | Có | Có khi extract |
| Secret/backup/nested archive | Có | Có | Có |
| Required files/directories | Có | Có | Có |
| Generated bundle policy | Có | Có | Có theo config trong artifact |
| Manifest schema | Có | — | Có |
| Manifest hash/count | Có | — | Có |
| Extraction smoke test | — | — | Có |
| ZIP CRC32 integrity | — | Có | Có |

## 6. Test evidence

### 6.1 Targeted tests

| Lệnh | Kết quả thực tế |
|---|---|
| `npm run test:phase253` | PASS — 7/7 |
| `npm run test:phase255a` | PASS — 9/9 |
| `npm run test:phase255a-r1` | PASS — 12/12 |
| `npm run test:release-governance` | PASS — 54/54 |
| `npm run check:syntax` | PASS — 1.476 JavaScript files |
| `npm run test:artifact-clean` | PASS — 2.023 entries ở preflight |
| `npm run quality` | PASS — 54/54 targeted tests, artifact/manifest/deployment gates đều pass |

### 6.2 Test Phase255A-R1

Đã chứng minh bằng fixture thực:

1. manifest workspace đúng pass;
2. sửa source sau manifest fail;
3. thêm file sau manifest fail count/hash;
4. ZIP canonical pass extracted-manifest check;
5. ZIP chứa manifest stale fail với `DEPLOYMENT_ARTIFACT_MANIFEST_STALE`;
6. builder chạy khi PATH không có `zip`;
7. npm resolver chạy qua `npm_execpath` khi PATH không có npm;
8. Windows resolver chọn `npm.cmd`;
9. hai ZIP cùng source/timestamp có entry order và byte content giống nhau;
10. secret/backup/archive/generated file bị chặn;
11. manifest/artifact checks không mutate source;
12. release phase/version không hard-code phase cũ.

### 6.3 Non-mutating evidence

```text
Quality gate cuối ghi `NON_MUTATING_CHECK_OK` với cùng checksum/file-count trước và sau.
Checksum cụ thể được lưu trong `phase255a_r1_quality_final.log` ngoài source artifact để tránh báo cáo tự chứa hash của chính nó.
Result: PASS
```

## 7. Final manifest và artifact

```text
releasePhase: Phase255A-R1
releaseVersion: 1.0.0
releaseId: Phase255A-R1-1.0.0-20260712092142
sourceFileCount: 1619
sourceSha256: 3baf6fbd12e2529dad4f98f88bbe9dfa1187f90b215125e46afca1198ca25fe2
bundleFileCount: 32
bundleSha256: 3112aea9adfc20f08c502c4775b85c760d99b43a6bf6cd7bf8f11e8ee63c3974
configurationVersion: 0071c71c2487c6612f7c7e0c8ba64b75c90d05db8e45cea614d2bf2d33a3f190
policyVersion: phase255a-r1-release-policy-v1
generatorVersion: phase255a-r1-manifest-generator-v1
```

| Gate cuối | Kết quả |
|---|---|
| Workspace manifest check | PASS |
| Source artifact verifier | PASS |
| Deployment artifact verifier | PASS |
| Extracted manifest check | PASS |
| ZIP CRC32/integrity | PASS — JSZip CRC32 |
| Canonical builder cần system `zip` | Không |
| Workspace/extracted source hash trùng nhau | PASS |

## 8. File thay đổi

### File mới

- `.env.production.example` — phục hồi file bị rơi khỏi Phase255A artifact;
- `test/fixtures/index-page/phase79-assembled.sha256` — phục hồi fixture bị rơi;
- `PHASE255A_R1_RELEASE_BASELINE.json`;
- `scripts/lib/zip-artifact.js`;
- `test/phase255a-r1-reproducible-release-finalization.test.js`;
- `PHASE255A_R1_REPRODUCIBLE_RELEASE_FINALIZATION_REPORT.md`;
- `PHASE255A_R1_INTEGRITY_DIFF.json`.

### File sửa

- `package.json`;
- `package-lock.json`;
- `scripts/lib/release-artifact-policy.js`;
- `scripts/generate-release-manifest.js`;
- `scripts/create-deployment-artifact.js`;
- `scripts/verify-source-artifact-clean.js`;
- `scripts/verify-deployment-artifact.js`;
- `scripts/run-quality-gate.js`;
- `test/phase253-non-mutating-release-governance.test.js`;
- `RELEASE_MANIFEST.json`.

### File xóa

- Không có.

## 9. Phạm vi không sửa

```text
Phase255A optional-route lazy-load behavior: không đổi
AR writer: không đổi
Fund writer: không đổi
Inventory posting/reverse: không đổi
Delivery/closeout writer: không đổi
Accounting writer: không đổi
Enterprise API/static entry: không đổi
Scheduler: không đổi
Route alias: không đổi
Frontend: không đổi
Database/schema/index: không đổi
Migration/backfill/repair: không chạy
```

## 10. Rủi ro còn lại

1. CI vẫn phải chạy `npm ci` trước quality; artifact không chứa `node_modules`.
2. Deterministic ZIP phụ thuộc cùng source, manifest timestamp, JSZip version và compression options; Phase255A-R1 đã khóa các yếu tố này và test byte parity local.
3. Production nên dùng Node version theo `engines`; test hiện chạy trên Node `v22.16.0`.
4. Artifact build cần đủ RAM/temp disk để nén và giải nén khoảng 2.000 file.
5. Phase255B thay source nên bắt buộc generate manifest mới sau khi report/evidence hoàn tất.

## 11. Rollback

Rollback chỉ phục hồi release tooling và package metadata đã liệt kê. Không có database rollback. Hai file bị rơi được phục hồi từ artifact Phase253 và nên được giữ để artifact source không mất nội dung.

## 12. Phase tiếp theo

Chỉ sau khi toàn bộ final gates pass, phase tiếp theo là:

```text
Phase255B — Enterprise Route and Static Entry Governance
```
