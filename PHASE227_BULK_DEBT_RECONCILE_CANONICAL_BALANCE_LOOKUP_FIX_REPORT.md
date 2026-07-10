# PHASE227 — Bulk Debt Reconcile Canonical Balance Lookup Fix

## 1. Phạm vi bàn giao

Phase này sửa khoanh vùng lỗi bulk ghi nhận điều chỉnh công nợ tạo thêm `AR-DEBT-ADJUSTMENT` bằng toàn bộ số nợ kỳ vọng, mặc dù ledger mở nợ `AR-SALE` của cùng đơn đã tồn tại hợp lệ.

Case kiểm chứng:

- Khách hàng: `4501763 — LÊ Huế`
- Đơn hàng: `B0039116`
- Business order ID: `SO1783414766939439`
- Correction ID: `DCOC-SO1783414766939439-2-e00b3dfcf29f`
- AR-SALE hiện hữu: debit `7.909.502`
- AR-DEBT-ADJUSTMENT tạo sai: debit `7.909.502`
- Số dư bị nhân đôi: `15.819.004`

Phase227 **không sửa UI**, **không xóa/sửa trực tiếp ledger đã posted**, **không tự chạy reversal production** và **không thay đổi AR ledger SSoT**.

---

## 2. Tổng quan dự án

- Kiến trúc: Node.js/Express monolith.
- Database: MongoDB qua Mongoose.
- Runtime yêu cầu: Node.js `>=20.20 <23`, npm `>=10`.
- Quy mô bản bàn giao: khoảng `1.889` file, không gồm `node_modules`.
- Các miền liên quan trực tiếp:
  - Delivery closeout correction.
  - Bulk adjustment commit.
  - `orderPaymentAllocations`.
  - Canonical AR read policy.
  - AR debt reconciliation và idempotency.
- SSoT giữ nguyên: `arLedgers`.

### Đánh giá chất lượng trong phạm vi audit

Điểm tốt:

- Writer đã dùng idempotency key cho `AR-DEBT-ADJUSTMENT`.
- Phase226 đã có registry category active và provenance gate cho detailed accounting ledger.
- Reconcile đã có khái niệm so sánh current balance với expected debt.
- Ledger đã giữ các alias `orderId/orderCode/salesOrderId/salesOrderCode` tương đối đầy đủ.

Rủi ro nghiêm trọng được phát hiện:

1. Hai canonical reader có semantics khác nhau nhưng tên gần giống nhau.
2. Reconcile dùng reader legacy Phase87 chỉ đọc `AR-DEBT-*`, trong khi số dư thực tế còn phụ thuộc `AR-SALE`, `AR-RECEIPT`, `AR-RETURN`, `AR-REWARD-ALLOWANCE`.
3. Identity builder trộn correction source identity với business-order identity.
4. Khi canonical lookup bất thường trả `0`, writer vẫn có thể post toàn bộ expected debt.
5. Thiếu diagnostics đủ chi tiết để biết ledger bị loại tại Mongo match hay provenance validation.

Mức độ: **P0 — accounting over-post / công nợ bị nhân đôi**.

---

## 3. Runtime trace đã audit

Luồng được trace:

```text
DeliveryAdjustmentBulkCommitService.commitManyAdjustments
→ DeliveryAdjustmentCommitService.commitOneAdjustment
→ preflightReconcile
→ deliveryCloseoutCorrectionService.createCorrection
→ OrderPaymentDebtReconcileService.reconcileOrderDebt
→ reconcileOneOrder
→ getCurrentOrderArBalance
→ arLedgerReadService.getCanonicalLedgersByOrderKeys
→ buildCanonicalArLedgerMatch
→ buildDebtAdjustmentLedger
→ arPostingService.postArLedgerEntry
```

### Kết luận từng điểm

1. Business keys của case phải là:

```text
SO1783414766939439
B0039116
```

2. Correction identity sau không phải business-order identity:

```text
DCOC-SO1783414766939439-2-e00b3dfcf29f
```

3. `AR-SALE` có category hợp lệ trong canonical registry của Phase226.
4. Provenance gate hiện có chấp nhận:

```text
category = AR-SALE
sourceType = ORDER_PAYMENT_ALLOCATION
```

5. Tuy nhiên ledger không tới được provenance gate trong đường đọc cũ.
6. Ledger bị loại ngay tại Mongo match do `getCanonicalLedgersByOrderKeys()` dùng `buildCanonicalArLedgerMatch()`, giới hạn category vào nhóm Phase87:

```text
AR-DEBT-OPEN
AR-DEBT-PAYMENT
AR-DEBT-ADJUSTMENT
AR-DEBT-VOID
```

7. Vì vậy `AR-SALE-B0039116` không match raw query của reader cũ dù:
   - `accountingConfirmed=true`
   - `accountingStatus=confirmed`
   - `active=true`
   - `reversed=false`
   - `status=posted`
   - có đầy đủ alias order.
8. Session Mongo không phải root cause. Phase227 vẫn truyền cùng session và chạy các query kiểm tra tuần tự, tránh parallel operation trên cùng transaction/session.

---

## 4. Root cause chính xác

### Root cause chính

`OrderPaymentDebtReconcileService.getCurrentOrderArBalance()` sử dụng sai read policy:

```js
arLedgerReadService.getCanonicalLedgersByOrderKeys(...)
```

Reader này là contract legacy cho read model `AR-DEBT-*`, không phải canonical active AR balance của toàn bộ đơn hàng.

Do `AR-SALE` bị loại tại Mongo query, runtime nhận:

```text
currentArBalance = 0
expectedDebtAmount = 7.909.502
```

Từ đó logic cũ suy ra phải tạo debit adjustment `7.909.502`, dẫn đến cộng nợ lần hai.

### Root cause phụ

Lookup keys cũ có thể lấy thêm:

```text
allocation.sourceId
allocation.sourceCode
```

Trong correction flow, hai trường này là correction ID, không phải order ID. Điều này làm identity contract thiếu rõ ràng và có thể che giấu lỗi nếu một correction document lấn át business order aliases.

### Vì sao đây không chỉ là lỗi “post target thay vì delta”

Logic đã có ý định đối chiếu current với expected. Sai số phát sinh vì current balance bị đọc thiếu. Nếu chỉ đổi dấu/công thức mà không sửa canonical lookup, hệ thống vẫn có thể post sai toàn bộ số tiền trong những trường hợp reader trả `0` bất thường.

---

## 5. Giải pháp đã triển khai — Phương án A production-grade

### 5.1. Canonical business-order identity dùng chung

Thêm:

```text
src/domain/ar/arOrderIdentity.js
```

Các API:

```js
resolveCanonicalArOrderIdentity()
buildCanonicalArOrderLookupKeys()
```

Thứ tự ưu tiên:

1. `salesOrderId/orderId` của business order.
2. `salesOrderCode/orderCode` của business order.
3. Alias order từ allocation khi được khai báo rõ.
4. `sourceId/sourceCode` chỉ được dùng khi `sourceType` thực sự là business-order source.

Correction source aliases được đưa vào `ignoredSourceAliases`, không tham gia lookup.

Với B0039116:

```json
{
  "lookupKeys": [
    "SO1783414766939439",
    "B0039116"
  ],
  "ignoredSourceAliases": [
    "DCOC-SO1783414766939439-2-e00b3dfcf29f"
  ]
}
```

### 5.2. Active canonical AR reader theo contract Phase226

Bổ sung trong `src/services/arLedgerRead.service.js`:

```js
getActiveDebtReadModelLedgersByOrderKeys()
inspectActiveDebtReadModelLedgersByOrderKeys()
```

Reader mới sử dụng active debt category registry của Phase226, gồm tối thiểu:

- `AR-SALE`
- `AR-DEBT-OPEN`
- `AR-DEBT-ADJUSTMENT`
- `AR-RECEIPT`
- `AR-RECEIPT-CASH`
- `AR-RECEIPT-BANK`
- `AR-DEBT-PAYMENT`
- `AR-RETURN`
- `AR-REWARD-ALLOWANCE`

Vẫn loại:

- reversal category khỏi active balance thông thường;
- inactive/reversed/deleted;
- voided/cancelled;
- unconfirmed;
- detailed accounting ledger sai provenance;
- ledger vi phạm AR contract.

### 5.3. Diagnostics raw-versus-canonical

Inspection trả về:

- `lookupKeys`
- `rawMatch`
- `canonicalMatch`
- `rawMatchedLedgerCount`
- `rawActiveConfirmedLedgerCount`
- `canonicalMatchedLedgerCount`
- `excludedLedgerCount`
- `excludedLedgers[]`
  - `ledgerId`
  - `category`
  - `ledgerType`
  - `sourceType`
  - `exclusionReason`
  - `exclusionReasons`

Diagnostics reconcile bổ sung:

- `orderCode`
- `orderId`
- `customerCode`
- `lookupKeys`
- `ignoredSourceAliases`
- raw/canonical/excluded counts
- `currentArBalance`
- `currentArBalanceBeforePosting`
- `expectedDebtAmount`
- `deltaDebt`
- `action`
- `skipReason`
- `idempotencyKey`

Logger được truyền dưới dạng callback tùy chọn; diagnostics không được phép làm hỏng accounting flow.

### 5.4. Delta posting rõ nghĩa

Công thức sau được áp dụng trực tiếp:

```text
deltaDebt = expectedDebtAmount - currentCanonicalArBalance
```

Quy tắc:

```text
deltaDebt > tolerance   → debit deltaDebt
deltaDebt < -tolerance  → credit abs(deltaDebt)
abs(deltaDebt) <= tolerance → skip NO_DEBT_DELTA
```

Case B0039116 sau sửa:

```text
currentCanonicalArBalance = 7.909.502
expectedDebtAmount       = 7.909.502
deltaDebt                = 0
action                   = skip
skipReason               = NO_DEBT_DELTA
```

Không tạo `AR-DEBT-ADJUSTMENT` mới.

### 5.5. Safety guard trước khi post

Ngay trước post, service:

1. Re-read raw và canonical AR balance trong cùng session.
2. Tính lại delta.
3. Nếu canonical trả `0`, expected > tolerance, nhưng raw lookup thấy opening debit active/confirmed bị canonical policy loại:

```text
manualReviewRequired = true
skipReason = CANONICAL_AR_LOOKUP_EXCLUDED_EXISTING_LEDGER
```

4. Không post full expected debt.
5. Re-check idempotency key để ngăn race/duplicate.

Guard này bảo vệ hệ thống nếu category/provenance contract lại lệch trong tương lai.

---

## 6. Phương án B đã cân nhắc nhưng không chọn

Phương án B là chỉ truyền thêm một mảng keys lớn vào reader cũ và bỏ correction ID.

Ưu điểm:

- Effort thấp hơn.
- Ít file thay đổi.

Nhược điểm:

- Reader cũ vẫn loại `AR-SALE` theo category ở Mongo match.
- Không giải quyết `AR-RECEIPT`/`AR-RETURN`/reward allowance trong current balance.
- Không có anomaly guard.
- Dễ tái phát khi thêm category accounting mới.

Effort: **Medium**. Rủi ro kế toán còn cao, nên không chọn.

Phương án A đã triển khai có effort **Hard**, nhưng contract rõ, testable và production-safe hơn.

---

## 7. Diff logic trước/sau

### Trước

```js
const currentArBalance = await getCurrentOrderArBalance(orderCode, customerCode, {
  keys,
  session
});

// getCurrentOrderArBalance → getCanonicalLedgersByOrderKeys
// query chỉ chứa AR-DEBT-* legacy
```

Kết quả case lỗi:

```text
AR-SALE không match query
currentArBalance = 0
writer post debit toàn bộ expected debt
```

### Sau

```js
const identity = resolveCanonicalArOrderIdentity({ order, allocation });

const details = await inspectActiveDebtReadModelLedgersByOrderKeys(
  identity.lookupKeys,
  { customerCode, status: 'all' },
  { session }
);

const currentArBalance = sum(debit - credit);
const deltaDebt = expectedDebtAmount - currentArBalance;
```

Trước post có re-read + anomaly guard + idempotency re-check.

---

## 8. Danh sách file thay đổi

| File | Thay đổi |
|---|---|
| `package.json` | Thêm npm script cho audit Phase227 |
| `src/domain/ar/arOrderIdentity.js` | Mới: canonical business-order identity resolver |
| `src/services/arLedgerRead.service.js` | Active AR lookup và raw/canonical inspection |
| `src/services/accounting/OrderPaymentDebtReconcileService.js` | Dùng reader mới, delta posting, diagnostics, safety re-read/guard |
| `scripts/audit-bulk-debt-reconcile-balance-lookup.js` | Mới: audit read-only/dry-run |
| `test/phase227-bulk-debt-reconcile-canonical-balance-lookup.test.js` | Mới: 9 test Phase227 |
| `PHASE227_BULK_DEBT_RECONCILE_CANONICAL_BALANCE_LOOKUP_FIX_REPORT.md` | Báo cáo bàn giao |

Không sửa frontend, inventory, returnOrders, reward report, fund workflow hoặc source-bundle không liên quan.

---

## 9. Test đã thêm

1. Regression `B0039116`: đọc được `AR-SALE`, delta 0, không tạo adjustment.
2. Correction ID không thay business-order identity.
3. `AR-SALE + ORDER_PAYMENT_ALLOCATION` được canonical reader chấp nhận.
4. Tăng nợ thật: `7.000.000 → 7.909.502`, debit đúng `909.502`.
5. Giảm nợ thật: `7.909.502 → 7.000.000`, credit đúng `909.502`.
6. Lookup anomaly guard chặn post và yêu cầu manual review.
7. Bulk và manual dùng cùng resolver.
8. Phase226 `AR-RECEIPT` vẫn được tính: debit `2.499.694` + credit `2.499.694` = 0.
9. Audit fixture xác định over-post và chỉ lập reversal plan.

### Kết quả

| Lệnh/nhóm | Kết quả | Exit code |
|---|---:|---:|
| Phase227 tests | 9/9 pass | 0 |
| Regression liên quan | 65/65 pass | 0 |
| Full test suite | 1.836 total; 1.835 pass; 1 skip; 0 fail | 0 |
| `npm run check:syntax` | 1.386 JavaScript files hợp lệ | 0 |
| `npm run check:source-bundles` | 19/19 bundles hợp lệ | 0 |

Dependency được đặt ngoài project root khi chạy full suite; bản ZIP không chứa `node_modules`.

---

## 10. Audit script production — read-only

File:

```text
scripts/audit-bulk-debt-reconcile-balance-lookup.js
```

Lọc đúng các ledger:

```text
category   = AR-DEBT-ADJUSTMENT
ledgerType = AR-DEBT-ADJUSTMENT
sourceType = DELIVERY_CLOSEOUT_CORRECTION
reason     = Bulk ghi nhận lại điều chỉnh công nợ
```

Chạy toàn bộ:

```bash
npm run audit:bulk-debt-reconcile-balance-lookup
```

Chạy riêng case:

```bash
node scripts/audit-bulk-debt-reconcile-balance-lookup.js \
  --order-code=B0039116 \
  --json
```

Chạy fixture không kết nối production:

```bash
node scripts/audit-bulk-debt-reconcile-balance-lookup.js \
  --fixture \
  --json
```

Script:

- chỉ `find/lean`;
- không `update`;
- không `delete`;
- không tự reversal;
- real run trả exit code `2` nếu phát hiện P0 để CI/ops nhận biết.

### Kết quả fixture

```text
rawBalanceBefore       = 7.909.502
canonicalBalanceBefore = 7.909.502
expectedDebtAmount     = 7.909.502
expectedDelta          = 0
postedDebit            = 7.909.502
overPostedAmount       = 7.909.502
severity               = P0
```

Đây là fixture tái hiện bằng dữ liệu do người dùng cung cấp, không phải kết quả query trực tiếp MongoDB production.

---

## 11. Kế hoạch remediation dữ liệu cũ

Phase227 chỉ ngăn phát sinh sai mới. Deploy code **không tự làm số dư đã nhân đôi về đúng**, vì ledger sai đã posted trước đó vẫn là dữ liệu kế toán active.

Với B0039116, sau khi chạy audit production và kế toán xác nhận:

```text
rawBalanceBefore   = 7.909.502
expectedDebtAmount = 7.909.502
expectedDelta      = 0
postedDebit        = 7.909.502
```

Kế hoạch an toàn:

1. Xác định chính xác original adjustment ledger ID/idempotency key.
2. Tạo reversal ledger accounting-safe tham chiếu original ledger.
3. Reversal direction: `credit`.
4. Reversal amount: `7.909.502`.
5. Giữ audit trail, actor, timestamp, reason và original reference.
6. Chạy dry-run và được kế toán phê duyệt.
7. Chỉ sau đó mới apply bằng phase/remediation riêng.

Tuyệt đối không:

- hard delete ledger;
- sửa trực tiếp debit/credit của ledger posted;
- loại `AR-DEBT-ADJUSTMENT` khỏi read model để che lỗi;
- tạo receipt giả;
- tự động reversal trong Phase227.

---

## 12. Xác nhận Phase226 không bị rollback

Phase227 sử dụng active category registry/read policy được hoàn thiện ở Phase226, không quay lại reader chỉ có `AR-DEBT-*`.

Regression test xác nhận:

```text
AR-SALE debit       2.499.694
AR-RECEIPT credit   2.499.694
canonical balance           0
```

Do đó fix `AR-RECEIPT` của Phase226 được giữ nguyên.

---

## 13. Kết luận case B0039116

Sau deploy Phase227, khi bulk/manual correction reconcile lại đúng business order:

```text
lookupKeys = [SO1783414766939439, B0039116]
AR-SALE matched = true
currentArBalanceBeforePosting = 7.909.502
expectedDebtAmount = 7.909.502
deltaDebt = 0
action = skip
skipReason = NO_DEBT_DELTA
```

Hệ thống sẽ không tạo thêm `AR-DEBT-ADJUSTMENT` cho trường hợp này.

Ledger adjustment sai đã tạo ngày `2026-07-10T01:07:12.820Z` vẫn cần audit production và reversal accounting-safe theo kế hoạch ở mục 11.
