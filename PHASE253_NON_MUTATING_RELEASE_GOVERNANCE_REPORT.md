# PHASE253 — NON-MUTATING RELEASE GOVERNANCE REPORT

## 1. Mục tiêu

Phase253 chuẩn hóa release governance để source artifact verifier, deployment artifact verifier, release manifest và artifact-clean test sử dụng cùng một policy; đồng thời loại toàn bộ cleanup side effect khỏi `npm test` và quality gate.

Baseline: `MK-pro-phase252-sales-order-authorization-boundary-fixed(1).zip`.

## 2. Root cause

| Finding | Root cause |
|---|---|
| Manifest stale | Generator cũ chỉ so một số hash field, metadata còn ghi Phase204 và schema thiếu phase/generator/policy version. |
| Hai verifier bất đồng | Source verifier tự định nghĩa rule và dùng `tar -tf`; deployment verifier có rule khác và dùng `unzip -Z1`. |
| Quality gate thiếu release checks | `quality` không gọi artifact-clean, deployment verification hoặc release-manifest check. |
| Test tự sửa source | `pretest` gọi `cleanup:retired`; `run-tests.js` require trực tiếp cleanup script. |
| Cleanup che source bẩn | Retired file bị xóa trước test nên checkout bẩn có thể trở thành xanh giả. |

## 3. Thiết kế sau sửa

### 3.1 Một policy duy nhất

File mới:

```text
scripts/lib/release-artifact-policy.js
```

Policy này là SSoT cho:

- file/root bắt buộc;
- segment và extension bị cấm;
- `.env.example` và `.env.production.example` được phép;
- `.env.production`, `.env`, key/certificate/secret thật bị cấm;
- registered generated bundle từ `config/source-bundles.json`;
- unregistered generated/compiled file bị cấm;
- phase report hợp lệ;
- retired file inventory;
- source hash scope;
- bundle hash scope;
- manifest schema và hash/count contract.

Policy version:

```text
phase253-release-policy-v1
```

### 3.2 Verifier thống nhất

| File | Thay đổi |
|---|---|
| `scripts/verify-source-artifact-clean.js` | Dùng shared policy; ZIP reader đổi sang `unzip -Z1`; mặc định kiểm thư mục hiện tại khi không truyền target. |
| `scripts/verify-deployment-artifact.js` | Dùng cùng shared policy; chỉ bổ sung extraction smoke test. |
| `scripts/create-deployment-artifact.js` | Artifact được verify bằng cùng deployment verifier; artifact lỗi bị xóa. |

Do cùng gọi `validateArtifactEntries()`, một path không thể được source verifier cho phép nhưng deployment verifier từ chối vì policy khác.

### 3.3 Release manifest mới

Manifest bắt buộc có:

```text
releasePhase
releaseVersion
releaseId
sourceSha256
sourceFileCount
bundleSha256
bundleFileCount
configurationVersion
generatedAt
generatorVersion
policyVersion
packageLockSha256
sourceHashScope
```

Hash source bao gồm code, scripts, tests, configuration template và source bundle definitions/runtime files theo scope policy; `RELEASE_MANIFEST.json` không tự hash chính nó để tránh vòng lặp.

Generator hỗ trợ `SOURCE_DATE_EPOCH` để tạo timestamp tái lập khi CI yêu cầu deterministic metadata.

### 3.4 Test và quality không mutate source

- Xóa `pretest` khỏi `package.json`.
- Xóa `require('./cleanup-retired-files')` khỏi `scripts/run-tests.js`.
- `cleanup-retired-files.js` chỉ chạy khi truyền `--apply`.
- Retired file được artifact policy phát hiện và làm gate fail, nhưng không tự xóa.
- `scripts/run-quality-gate.js` hash toàn bộ checkout trước và sau gate.
- Temporary deployment ZIP được tạo ngoài source tree và xóa sau verification.

Quality mới chạy theo thứ tự:

```text
node --check toàn bộ JavaScript
→ targeted regression tests Phase250B/251/252/253
→ source artifact-clean
→ release manifest check
→ temporary deployment artifact build
→ deployment artifact verifier
→ checksum before/after
```

Quality không cleanup, rewrite manifest, regenerate bundle hay sửa lỗi để tự pass.

## 4. Test bắt buộc

File mới:

```text
test/phase253-non-mutating-release-governance.test.js
```

| Test | Kết quả |
|---|---|
| `.env.production.example` giống nhau ở source ZIP/source directory/deployment verifier | PASS |
| `.env.production` bị từ chối ở mọi verifier | PASS |
| Manifest stale fail | PASS |
| Manifest regenerate đúng pass | PASS |
| Retired file tồn tại làm gate fail nhưng file vẫn còn nguyên | PASS |
| Checksum trước/sau verifier và manifest check không đổi | PASS |
| Backup và unregistered generated file bị từ chối | PASS |
| `npm test` orchestration không còn cleanup; cleanup manual-only | PASS |

Kết quả Phase253 riêng:

```text
7 pass, 0 fail
```

Targeted release governance regression:

```text
33 pass, 0 fail
```

Các regression bổ sung:

| Lệnh | Kết quả |
|---|---|
| `npm run test:phase249` | 13/13 PASS |
| `npm run test:phase250b` | 17/17 PASS |
| `npm run test:phase251` | 13/13 PASS |
| `npm run test:phase252` | 26/26 PASS |
| `npm run check:syntax` | PASS — 1.471 JavaScript files |
| `npm run test:artifact-clean` | PASS |

## 5. Manifest stale evidence

Trước khi generate manifest Phase253:

```text
RELEASE_MANIFEST_STALE:
releasePhase
releaseVersion
bundleFileCount
generatedAt
generatorVersion
policyVersion
packageLockSha256
```

Manifest Phase253 được generate sau khi code, tests và report đã hoàn tất. `quality` chỉ check manifest, không tự generate.

## 6. File thay đổi

### File mới

- `scripts/lib/release-artifact-policy.js`
- `scripts/run-quality-gate.js`
- `test/phase253-non-mutating-release-governance.test.js`
- `PHASE253_NON_MUTATING_RELEASE_GOVERNANCE_REPORT.md`

### File sửa

- `scripts/verify-source-artifact-clean.js`
- `scripts/verify-deployment-artifact.js`
- `scripts/generate-release-manifest.js`
- `scripts/create-deployment-artifact.js`
- `scripts/cleanup-retired-files.js`
- `scripts/run-tests.js`
- `package.json`
- `RELEASE_MANIFEST.json`

## 7. Phạm vi không sửa

Không sửa:

- AR writer;
- Fund writer;
- Inventory writer/posting/reverse;
- Delivery closeout;
- accounting command;
- database schema;
- migration/backfill/repair;
- runtime route/business policy.

## 8. Rủi ro còn lại

1. `quality:legacy` vẫn được giữ để tham chiếu nhưng có thể phụ thuộc network/dependencies và không phải release gate chuẩn.
2. Full `npm test` có thể cần dependency/test environment đầy đủ; Phase253 chỉ chứng minh orchestration không còn tự cleanup source.
3. Release phase phải được cung cấp khi generate manifest; CI nên set `RELEASE_PHASE` và `SOURCE_DATE_EPOCH`.
4. Registered generated bundle được tin theo `config/source-bundles.json`; source-bundle content consistency vẫn do `check:source-bundles` quản lý ở build pipeline có dependency đầy đủ.

## 9. Rollback

Rollback Phase253 chỉ cần phục hồi các file release tooling/package/manifest nêu trên. Không cần rollback database hoặc business data vì phase này không chạy writer và không thay đổi runtime nghiệp vụ.
