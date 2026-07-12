# PHASE255B — ENTERPRISE ROUTE AND STATIC ENTRY GOVERNANCE REPORT

## 1. Executive summary

Phase255B chuyển Enterprise từ trạng thái **mặc định bật và luôn được load/public** sang **explicit enable only** bằng `ENABLE_ENTERPRISE_CORE`.

Khi flag tắt hoặc không khai báo:

- `enterpriseRoutes.js`, `enterpriseController.js` và `EnterpriseStatusService.js` không được load qua route bootstrap;
- `/api/enterprise/*` giữ authentication boundary hiện hành, sau đó trả `404 FEATURE_DISABLED` cho người dùng đã đăng nhập;
- `/enterprise.html`, `/css/enterprise.css`, `/js/enterprise-app.js` bị chặn trước `express.static` với `Cache-Control: no-store`;
- hai link `/enterprise.html` bị loại khỏi HTML server-rendered;
- source Enterprise vẫn được giữ nguyên để rollback bằng cấu hình.

Khi flag bật, router thật và toàn bộ role policy cũ vẫn được giữ nguyên. Phase không thay scheduler ownership, outbox/integration drain writer hoặc bất kỳ writer ERP nào.

## 2. Baseline và root cause

Baseline sử dụng: `MK-pro-phase255a-r1-reproducible-release-finalization-fixed.zip`.

Manifest baseline được kiểm tra trước khi sửa:

```text
RELEASE_MANIFEST_OK Phase255A-R1-1.0.0-20260712092142
```

### Root cause

| Boundary | File/hàm | Trạng thái trước sửa |
|---|---|---|
| Feature flag | `src/config/featureFlags.js:12`, `FLAGS.enterpriseCore` | `readBoolean(..., true)` nên thiếu env vẫn bật |
| API bootstrap | `src/routes/index.js`, `registerApiRoutes()` | top-level `require('./enterpriseRoutes')`, sau đó luôn `app.use('/api/enterprise', enterpriseRoutes)` |
| Controller graph | `src/controllers/enterpriseController.js` | import `EnterpriseStatusService`, `outboxJob`, `integrationJob` ngay khi router được require |
| Static surface | `src/app.js` + `express.static(public)` | ba Enterprise assets luôn public |
| Index | `public/fragments/index/06-index-body.html`, `06c-system-start.html` | luôn chứa hai link “Trung tâm mở rộng” |
| Renderer cache | `src/services/web/indexPageRenderer.js` | một cache production duy nhất, không có feature key |

Load graph cũ:

```text
feature flag default true
→ src/routes/index.js top-level require enterpriseRoutes
→ enterpriseController
→ EnterpriseStatusService + outbox/integration dependencies
→ API luôn mount
→ express.static luôn phục vụ Enterprise assets
→ index luôn chứa Enterprise link
```

Baseline runtime evidence:

| Chỉ số | Before |
|---|---:|
| Enterprise enabled khi env thiếu | `true` |
| Enterprise route/controller/service loaded | `true/true/true` |
| API business router mounted | `true` |
| HTML/CSS/JS reachable | `true/true/true` |
| Enterprise link count | `2` |
| Project modules loaded sau registration | `1857` |
| Local registration duration | `1178.422 ms` |

## 3. Thiết kế sau sửa

### 3.1 Shared bootstrap snapshot

`src/app.js:createApp(options)` tạo một immutable snapshot:

```text
createApp()
→ createFeatureSnapshot()
→ Object.freeze(featureSnapshot)
→ registerApiRoutes(featureSnapshot)
→ registerStaticRoutes(featureSnapshot)
→ renderIndexPage(featureSnapshot)
```

Việc thay đổi `process.env` sau khi app đã tạo không làm API/static/index lệch trạng thái trong cùng process.

### 3.2 API registry

File mới: `src/routes/enterpriseFeatureRegistry.js`.

```text
registerEnterpriseApiRoute(snapshot)
├─ disabled: không gọi loadRouter(), mount lightweight 404 boundary
└─ enabled: require('./enterpriseRoutes') đúng một lần và mount router thật
```

Nếu enabled loader throw, registration throw `Enterprise route bootstrap failed`; không silent skip và không ghi mounted giả.

### 3.3 Static boundary

`src/routes/static.routes.js` đăng ký exact GET blockers trước `express.static` khi disabled:

- `/enterprise.html`
- `/css/enterprise.css`
- `/js/enterprise-app.js`

Blocker trả `404`, `Cache-Control: no-store`, không trả nội dung file và không tiết lộ path vật lý.

### 3.4 Server-rendered visibility

Hai link Enterprise được bao bằng marker cố định. `applyFeatureVisibility()`:

- disabled: xóa toàn bộ block;
- enabled: giữ nội dung link;
- cả hai trạng thái: loại marker khỏi HTML cuối.

Production cache đổi từ một biến duy nhất sang `Map` keyed theo `enterpriseCore:0|1`.

## 4. Feature matrix

| `ENABLE_ENTERPRISE_CORE` | API loaded | API mounted | Static served | Index link |
|---|---:|---:|---:|---:|
| missing/empty/false/0/off/disabled/random | No | Disabled boundary only | No | No |
| true/1/yes/on/enabled | Yes | Yes | Yes | Yes |

Default trước/sau:

```text
Before: true
After:  false
```

## 5. Route matrix

| Endpoint | Disabled | Enabled | Role giữ nguyên |
|---|---|---|---|
| `GET /api/enterprise/status` | anonymous `401`; authenticated `404 FEATURE_DISABLED` | router thật | admin, manager |
| `GET /api/enterprise/readiness` | anonymous `401`; authenticated `404 FEATURE_DISABLED` | router thật | admin, manager |
| `POST /api/enterprise/outbox/drain` | anonymous `401`; authenticated `404 FEATURE_DISABLED` | router thật | admin |
| `POST /api/enterprise/integrations/drain` | anonymous `401`; authenticated `404 FEATURE_DISABLED` | router thật | admin |

Không thay đổi controller payload hoặc drain implementation.

## 6. Static matrix

| Path | Disabled | Enabled | Disabled cache policy |
|---|---:|---:|---|
| `/enterprise.html` | 404 | 200 | `no-store` |
| `/css/enterprise.css` | 404 | 200 | `no-store` |
| `/js/enterprise-app.js` | 404 | 200 | `no-store` |

`auth-guard.js` và CSP policy không bị sửa.

## 7. Measurement trước–sau

| Chỉ số | Before | After disabled | Enabled |
|---|---:|---:|---:|
| Enterprise route loaded | Yes | No | Yes |
| Enterprise controller loaded | Yes | No | Yes |
| Enterprise status service loaded | Yes | No | Yes |
| Enterprise business API mounted | Yes | No | Yes |
| Disabled API boundary mounted | No | Yes | No |
| Enterprise HTML reachable | Yes | No | Yes |
| Enterprise CSS reachable | Yes | No | Yes |
| Enterprise JS reachable | Yes | No | Yes |
| Enterprise link count | 2 | 0 | 2 |
| Project modules loaded | 1857 | 1854 | 1860 |
| Local registration duration | 1178.422 ms | 1653.274 ms | 1576.382 ms |

Giới hạn: module count và duration được đo local trên Node `v22.16.0`, không phải RSS/heap hoặc Render production benchmark. Duration có nhiễu cold-cache và không được dùng để tuyên bố production speedup. Acceptance chính là route/controller/service cache bằng 0 khi disabled.

## 8. Test evidence

| Lệnh | Kết quả thực tế |
|---|---|
| `npm run test:phase255b` | PASS — 8/8 |
| `npm run test:phase255a` | PASS — 9/9 |
| `npm run test:phase255a-r1` | PASS — 12/12 |
| `npm run test:release-governance` | PASS — 62/62 |
| `npm run check:syntax` | PASS — 1479 JavaScript files |
| `npm run test:artifact-clean` | PASS — 2029 entries trước report finalization |

Behavioral evidence gồm:

- explicit boolean allowlist và default off;
- `require.cache` isolation khi disabled;
- anonymous `401`, authenticated `404 FEATURE_DISABLED`;
- enabled router thật + role middleware;
- enabled load failure fail-closed;
- static 404/no-store và enabled 200;
- index link 0/2 và feature-keyed production cache;
- shared immutable snapshot;
- audit handler non-mutating.

## 9. File thay đổi

### File mới

- `src/routes/enterpriseFeatureRegistry.js`
- `scripts/audit-enterprise-runtime-surface.js`
- `test/phase255b-enterprise-route-static-entry-governance.test.js`
- `PHASE255B_ENTERPRISE_SURFACE_BASELINE.json`
- `PHASE255B_ENTERPRISE_SURFACE_AFTER.json`
- `PHASE255B_ENTERPRISE_ROUTE_STATIC_ENTRY_GOVERNANCE_REPORT.md`
- `PHASE255B_INTEGRITY_DIFF.json`

### File sửa

- `src/config/featureFlags.js`
- `src/routes/index.js`
- `src/routes/static.routes.js`
- `src/services/web/indexPageRenderer.js`
- `src/app.js`
- `public/fragments/index/06-index-body.html`
- `public/fragments/index/06c-system-start.html`
- `.env.example`
- `.env.production.example`
- `ENVIRONMENT_VARIABLES.md`
- `DEPLOYMENT_RUNBOOK.md`
- `package.json`
- `RELEASE_MANIFEST.json` — chỉ regenerate ở release-finalization step

File production bị xóa: **0**.

## 10. Phạm vi không sửa

```text
AR/Fund/Inventory/Delivery/accounting writers: không sửa
Scheduler ownership: không sửa
Outbox/integration drain logic: không sửa
Route aliases: không sửa
Database/schema/index: không sửa
Enterprise source: không xóa
Optional routes Phase255A: không regression
CSP: không nới lỏng
```

`outboxJob` và `integrationJob` vẫn có thể được `src/app.js` load cho web scheduler. Phase255B chỉ loại chúng khỏi Enterprise route load graph khi disabled; scheduler ownership thuộc Phase255C.

## 11. Rủi ro còn lại

1. Chưa có production access-log evidence xác nhận Enterprise console không được sử dụng.
2. Environment cũ không khai báo flag sẽ chuyển từ enabled sang disabled.
3. Rollback vận hành cần đặt `ENABLE_ENTERPRISE_CORE=true` và restart.
4. Outbox/integration/reconciliation/report projection jobs vẫn thuộc web bootstrap.
5. Enterprise source vẫn nằm trong artifact để rollback.
6. Bật Enterprise sẽ load lại controller/service graph theo thiết kế.
7. Local module/duration evidence không thay thế Render runtime evidence.

## 12. Rollback

Ưu tiên rollback bằng cấu hình:

```env
ENABLE_ENTERPRISE_CORE=true
```

Sau đó restart web process.

Code rollback chỉ cần phục hồi:

- feature flag fallback;
- Enterprise route bootstrap wiring;
- static boundary;
- index feature visibility/cache key;
- env documentation.

Không có database rollback.

## 13. Kết luận

Phase255B đạt mục tiêu governance: Enterprise mặc định off, không load API business graph, không public static console và không xuất hiện trong server-rendered index khi disabled; enabled behavior và role policy giữ nguyên.

Phase tiếp theo:

```text
Phase255C — Web Process Scheduler Ownership and Readiness Governance
```
