# MK-Pro Automated QA / Forensic Test Suite

Bộ kiểm tra này gom các contract test, architectural audit và kiểm tra dữ liệu cốt lõi của MK-Pro vào một release gate thống nhất. Mục tiêu chính là phát hiện sớm các lỗi có thể làm sai **tồn kho, công nợ, quỹ, idempotency và transaction flow**.

## Nguyên tắc an toàn

- Mặc định không kết nối database.
- Profile `forensic` chỉ chạy các truy vấn đọc; không gọi repair/rebuild/apply script.
- Ưu tiên đặt `QA_MONGO_URI` là connection string của user MongoDB chỉ có quyền đọc.
- `MONGO_URI`/`MONGODB_URI` chỉ là fallback để tương thích môi trường hiện có.
- Các lỗi Stock/AR/Fund/idempotency/architecture được coi là blocking; source-size debt chỉ là warning.
- Báo cáo được ghi vào `qa-reports/`, thư mục này đã được ignore khỏi Git.

## Lệnh sử dụng

```bash
npm ci
npm run qa:quick
npm run qa
npm run qa:forensic
npm run qa:full
```

### `npm run qa:quick`

Dùng trong lúc lập trình. Chạy syntax check và một nhóm contract test nhỏ cho:

- Inventory posting/session/idempotency.
- Cấm direct ledger write ngoài boundary được duyệt.
- Cross-ledger invariant Sales/Return/Receipt/Fund Transfer.
- Reconciliation service contract.

### `npm run qa` / `npm run qa:core`

Release gate mặc định. Ngoài quick checks còn chạy critical-path tests cho request idempotency, stock posting, AR/Fund posting, payment/debt reconciliation, import atomicity, concurrency và delivery accounting. Đồng thời chạy global Stock/AR/Fund access audit.

Source-size budget được ghi nhận nhưng không chặn release vì đây là maintainability debt, không phải invariant tài chính.

### `npm run qa:forensic`

Chạy `core` và thêm hai tầng đọc database:

1. `qa-db-forensics.js`: duplicate idempotency, negative/duplicate inventory, missing ledger source identity, FundLedger canonical contract, stale idempotency request và required indexes.
2. `reconcile-core-read-models.js --json`: đối chiếu AR read model, current inventory và FundLedger contract hiện hữu.

Nếu không có URI, DB checks được `SKIP`. Muốn bắt buộc DB phải sẵn sàng:

```bash
npm run qa:forensic:require-db
```

Khuyến nghị:

```bash
QA_MONGO_URI="mongodb://readonly-user:***@host/mkpro" npm run qa:forensic:require-db
```

### `npm run qa:full`

Thêm toàn bộ regression suite (`scripts/run-tests.js`). Nếu môi trường đã có Mongo URI thì DB forensic phase cũng được thêm tự động.

## Các invariant DB được kiểm tra

### Inventory

- Không tồn tại current stock âm.
- Một `(tenantId, productCode, warehouseCode)` không có nhiều current-stock row.
- Mỗi inventory row phải có product và warehouse identity.

### StockTransaction

- `idempotencyKey` không trùng.
- Kiểm tra DB unique index `uniq_stock_tx_idempotency_key`.

### AR

- Active `ArLedger.idempotencyKey` không trùng.
- Active AR row phải truy ra được source identity.
- Đối chiếu canonical AR ledgers với read models qua `reconcile-core-read-models`.

### Fund

- Active `FundLedger.idempotencyKey` không trùng.
- Kiểm tra `fundType`, `direction`, amount, source identity, confirmation và idempotency fields.
- Kiểm tra unique index `uniq_fund_ledger_idempotency_key`.

### Request idempotency

- `idempotency_requests.key` không trùng.
- Required unique/TTL ownership được kiểm tra ở release architecture; QA DB kiểm tra unique key index.
- Request ở trạng thái đang xử lý quá `QA_IDEMPOTENCY_STALE_MINUTES` (mặc định 30 phút) được báo WARN để điều tra stuck command.

## Báo cáo

Mỗi lần chạy tạo:

```text
qa-reports/
  qa-core-<timestamp>.json
  qa-core-<timestamp>.md
  latest-core.json
  latest-core.md
```

Trạng thái:

- `PASS`: kiểm tra đạt.
- `FAIL`: invariant/release gate lỗi; exit code suite là 2.
- `WARN`: khoản nợ hoặc dấu hiệu cần kiểm tra nhưng mặc định không block release.
- `SKIP`: phase không chạy, điển hình là không có DB URI.

Dùng `--fail-on-warn` khi muốn CI nghiêm ngặt hơn:

```bash
node scripts/qa-forensic-suite.js --profile=core --fail-on-warn
```

## CI đề xuất

Pull request:

```bash
npm ci
npm run qa:quick
```

Build/release candidate:

```bash
npm ci
npm run qa
```

Trước deploy production, chạy trên replica/read-only database gần production:

```bash
QA_MONGO_URI="$READONLY_MONGO_URI" npm run qa:forensic:require-db
```

Không chạy repair tự động từ QA. Khi forensic phát hiện mismatch, phải điều tra lineage/source trước rồi chạy repair script tương ứng theo runbook.
