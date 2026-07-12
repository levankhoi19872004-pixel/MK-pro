# PHASE250A — PRODUCTION READ-ONLY RUNBOOK

## 1. Mục tiêu và giới hạn an toàn

Runbook này chỉ dùng để thu thập bằng chứng cho bốn finding Phase250A.

**Không được dùng:**

- Mongo URI có quyền ghi nếu có thể tạo user read-only riêng.
- `update`, `updateMany`, `replaceOne`, `delete`, `deleteMany`, `insert`, `bulkWrite`.
- migration, backfill, repair, rebuild hoặc cleanup.
- `npm test`, vì baseline hiện gọi cleanup source trước/trong test.
- API `PUT`, `PATCH`, `POST .../cancel`, `DELETE` trên production.

Khuyến nghị chạy trong bản giải nén sạch hoặc checkout read-only, lưu output vào thư mục ngoài source.

---

## 2. Chuẩn bị môi trường

### Linux/macOS/Git Bash

```bash
cd /path/to/MK-pro-phase250a
mkdir -p ../phase250a-evidence
export PHASE250A_MONGODB_URI='mongodb+srv://READ_ONLY_USER:***@cluster/database?retryWrites=false'
```

### Windows PowerShell

```powershell
Set-Location C:\path\to\MK-pro-phase250a
New-Item -ItemType Directory -Force ..\phase250a-evidence | Out-Null
$env:PHASE250A_MONGODB_URI='mongodb+srv://READ_ONLY_USER:***@cluster/database?retryWrites=false'
```

Tài khoản Mongo nên chỉ có role `read` trên database cần kiểm tra. Không ghi URI thật vào file `.env`, report hoặc log chia sẻ.

---

## 3. Kiểm tra warehouse distribution

### 3.1 Dry invocation không URI

```bash
unset PHASE250A_MONGODB_URI MONGODB_URI MONGO_URI
npm run audit:inventory-warehouse-distribution
```

Expected:

```text
INVENTORY_WAREHOUSE_AUDIT_SKIPPED_NO_URI
No database connection was attempted.
```

### 3.2 Production read-only audit

```bash
PHASE250A_MONGODB_URI="$PHASE250A_MONGODB_URI" \
  npm run audit:inventory-warehouse-distribution -- --limit=500 \
  > ../phase250a-evidence/inventory-warehouse-distribution.json
```

Script chỉ chạy aggregate/read trên collection inventory với:

- `readPreference: secondaryPreferred`;
- `autoIndex: false`;
- pool tối đa 2 connection;
- `maxTimeMS`;
- không gọi write method.

Output cần kiểm tra:

1. `warehouseDistribution`: số document/tổng quantity theo warehouse.
2. `productsAcrossMultipleWarehouses.totalCount`.
3. Danh sách product có cả MAIN và legacy warehouse.
4. `missingWarehouseCode.returnedCount`.

### 3.3 Tiêu chí diễn giải

| Tình trạng | Kết luận |
|---|---|
| Chỉ có `MAIN`, không row thiếu | Code vẫn sai invariant, nhưng production overcount hiện chưa phát sinh từ multiwarehouse |
| Có warehouse khác MAIN | Canonical helper hiện có thể cộng chồng |
| Có row thiếu `warehouseCode` | Cần quyết định mapping/archive trước khi enforce MAIN |
| Một product xuất hiện ở nhiều warehouse | Ưu tiên đối chiếu quantity và transaction origin trước Phase251 |

---

## 4. Kiểm tra order ownership read-only

### 4.1 Kiểm tra một đơn cụ thể

```bash
PHASE250A_MONGODB_URI="$PHASE250A_MONGODB_URI" \
  npm run audit:order-ownership -- --order=B0039112 --actor=33949 \
  > ../phase250a-evidence/order-B0039112-ownership.json
```

Script chỉ `findOne().select().lean()` và trả:

- order identity;
- canonical/fallback owner code;
- trạng thái;
- actor code có khớp owner hay không.

### 4.2 Thống kê owner distribution

```bash
PHASE250A_MONGODB_URI="$PHASE250A_MONGODB_URI" \
  npm run audit:order-ownership -- --limit=500 \
  > ../phase250a-evidence/order-owner-distribution.json
```

Mục tiêu: tìm đơn thiếu `salesStaffCode`/alias owner trước khi thiết kế Phase252. Đây không phải test exploit và không gọi API writer.

### 4.3 Xác minh authorization end-to-end

Không được chạy cross-owner `PUT/PATCH/cancel` trên production. Dùng test/staging database riêng:

```bash
npm run test:phase250a
```

Test hiện xác minh deterministic call path bằng route/controller/service harness. Trước khi deploy Phase252, bổ sung API integration trên test DB với ma trận:

| Actor | Owner | Command | Expected sau Phase252 |
|---|---|---|---|
| sales A | A | update | Theo status policy |
| sales B | A | update | 403, document không đổi |
| sales B | A | cancel | 403, stock/AR/order không đổi |
| admin | A | update | Theo admin policy |
| accountant | A | cancel | Theo accountant policy |

---

## 5. Chạy targeted tests không cleanup source

```bash
npm run check:syntax
npm run test:phase249
npm run audit:scoped-bulk-selection
npm run test:phase250a
```

Không chạy:

```bash
npm test
```

Lý do: baseline có `pretest=cleanup:retired...` và `run-tests.js` require trực tiếp cleanup script dùng `fs.rmSync`.

---

## 6. Kiểm tra release manifest và artifact

### 6.1 Manifest check — read-only

```bash
npm run check:release-manifest \
  > ../phase250a-evidence/release-manifest-check.log 2>&1
```

`--check` chỉ build hash trong memory và so sánh; không ghi lại manifest.

### 6.2 Source artifact policy trên thư mục

```bash
npm run test:artifact-clean -- --directory . \
  > ../phase250a-evidence/source-artifact-clean.log 2>&1
```

Expected ở baseline Phase249: fail do `.env.production.example` bị source verifier cấm.

### 6.3 Deployment artifact verifier trên ZIP

```bash
node scripts/verify-deployment-artifact.js \
  --zip /path/to/MK-pro-phase249-global-scoped-bulk-selection-governance-fixed.zip \
  > ../phase250a-evidence/deployment-artifact-check.log 2>&1
```

Baseline audit đã pass 2.139 entries.

### 6.4 Source verifier trên ZIP

```bash
node scripts/verify-source-artifact-clean.js \
  --zip /path/to/MK-pro-phase249-global-scoped-bulk-selection-governance-fixed.zip \
  > ../phase250a-evidence/source-zip-artifact-check.log 2>&1
```

Trong môi trường GNU tar của audit, lệnh fail vì script dùng `tar -tf` cho ZIP. Không diễn giải lỗi parser này thành artifact bẩn; đây là release-tool inconsistency cần Phase253.

---

## 7. Kiểm tra source không bị thay đổi

Nếu source nằm trong Git:

```bash
git status --short
git diff -- src public
```

Expected sau các lệnh read-only:

- không diff dưới `src/`;
- không diff dưới `public/`;
- không file bị xóa.

Không có Git, tạo hash trước/sau:

```bash
find . -type f \
  -not -path './node_modules/*' \
  -not -path './.git/*' \
  -print0 | sort -z | xargs -0 sha256sum \
  > ../phase250a-evidence/source-after.sha256
```

So sánh với baseline hash đã tạo trước khi chạy.

---

## 8. Evidence package tối thiểu

Lưu các file sau, không chứa secret:

```text
phase250a-evidence/
├── inventory-warehouse-distribution.json
├── order-owner-distribution.json
├── order-<code>-ownership.json
├── phase250a-tests.log
├── release-manifest-check.log
├── source-artifact-clean.log
├── deployment-artifact-check.log
└── source-after.sha256
```

Trước khi chia sẻ, xóa URI/token/username nhạy cảm khỏi terminal history và log.

---

## 9. Stop conditions

Dừng ngay và không chạy tiếp nếu:

- URI có quyền `readWrite`, `dbOwner` hoặc admin mà chưa có phê duyệt.
- script/log xuất hiện method write.
- database name hoặc environment không đúng mục tiêu.
- lệnh yêu cầu `--write`, `--apply`, `--repair`, `--migrate`, `--rebuild`.
- test muốn gọi production API writer.

Phase250A chỉ thu thập bằng chứng. Mọi thay đổi dữ liệu/code nghiệp vụ phải chuyển sang phase sửa riêng có rollback và test gate tương ứng.
