# PHASE225 - Sửa nguồn canonical Báo cáo Khách hàng đã trả thưởng

## 1. Lỗi thực tế

Màn **Báo cáo → Chi tiết báo cáo → Khách hàng đã trả thưởng** đang hiển thị nguồn:

```txt
Nguồn dữ liệu: orders
Service: RewardReportService.rewardByCustomerReport
Nguồn: orders_delivery_closeout_reward
```

Nhưng nghiệp vụ trả thưởng sau các phase closeout/adjustment có thể nằm ở nhiều nguồn final/current hơn `orders.deliveryCloseout.rewardAmount`, đặc biệt:

- `orderPaymentAllocations` sau kế toán chốt hoặc sau điều chỉnh được sync.
- `deliveryCloseoutVersions` latest/current sau popup Điều chỉnh hoặc bulk commit.
- `orders.deliveryCloseout` chỉ là fallback khi chưa có allocation/version.

Nếu report chỉ query `orders` với `$or` các field reward cũ thì sẽ thiếu đơn có `orders.rewardAmount = 0` nhưng allocation/version mới có reward.

## 2. Nguồn cũ đang đọc

File cũ:

```txt
src/services/reports/RewardReportService.js
```

Luồng cũ:

```txt
orderRepository.findAll(rewardOrderFilter)
→ rewardOrderFilter chỉ lấy orders có field reward/offset > 0
→ rewardAmountOf(order) đọc deliveryCloseout.rewardAmount/rewardAmount/offset fields trên order
→ aggregate theo khách hàng
```

`rewardOrderFilter()` cũ có dạng:

```js
{
  ...activeDocumentFilter(),
  ...accountingConfirmedFilter(),
  $or: REWARD_AMOUNT_FIELDS.map(field => ({ [field]: { $gt: 0 } }))
}
```

Đây là nguyên nhân chính làm thiếu vì order có reward final trong `orderPaymentAllocations` hoặc `deliveryCloseoutVersions` nhưng order field cũ bằng 0 sẽ không được đưa vào tập scan.

## 3. Vì sao nguồn cũ thiếu

Các nghiệp vụ mới đã sinh hoặc cập nhật final reward state ở:

```txt
orderPaymentAllocations.current.rewardAmount
deliveryCloseoutVersions.latest.rewardAmount
```

Trong khi report cũ chỉ dựa vào các field reward/offset trên `orders`. Vì vậy các case sau bị thiếu:

- Trả thưởng sau điều chỉnh nhưng order field chưa sync.
- Bulk “Ghi nhận điều chỉnh đã chọn” đã tạo correction/allocation nhưng order fallback field vẫn 0.
- Allocation current có reward mới hơn version/order.
- Version latest có reward nhưng `orders.deliveryCloseout.rewardAmount` không phản ánh.

## 4. Nguồn canonical sau sửa

Nguồn primary vẫn là `orders` để xác định tập đơn đã xác nhận kế toán, khách hàng, NVBH, NVGH và kỳ báo cáo.

Reward amount từng order được resolve theo priority:

```txt
1. orderPaymentAllocations.current.rewardAmount
2. deliveryCloseoutVersions.latest.rewardAmount
3. orders.deliveryCloseout.rewardAmount
4. orders.rewardAmount / offset fallback legacy
```

Không dùng `arLedgers` làm nguồn operational reward. Không dùng `master_orders.totalAmount`, `reporting_snapshots` hay fake export.

## 5. Priority chọn rewardAmount

Đã tạo helper:

```txt
src/services/reports/rewardReportSourceResolver.js
```

Helper chính:

```txt
resolveRewardSource({ order, latestCloseoutVersion, currentPaymentAllocation })
```

Output gồm:

```js
{
  rewardAmount,
  rewardSource,
  rewardSourcePriority,
  sourceBreakdown,
  warnings
}
```

Ví dụ khi allocation current có reward:

```txt
rewardSource = orderPaymentAllocations.current.rewardAmount
rewardSourcePriority = 1
```

Nếu allocation stale/non-current thì bỏ qua và tạo warning:

```txt
STALE_ORDER_PAYMENT_ALLOCATION_IGNORED
```

## 6. Cách chống double count

Mỗi sales order chỉ được tính một lần trong tập order primary.

Dedupe/identity dùng các key:

```txt
id, code, orderCode, salesOrderId, salesOrderCode, documentCode, invoiceCode
```

`orderPaymentAllocations` và `deliveryCloseoutVersions` chỉ join vào order gốc. Không tạo thêm dòng report riêng từ allocation/version nên không bị cộng trùng khi một order có cả latestVersion và currentAllocation.

## 7. Cách lọc kỳ báo cáo

Report vẫn giữ scope đơn đã xác nhận kế toán qua:

```txt
activeDocumentFilter()
accountingConfirmedFilter()
```

Business date ưu tiên:

```txt
deliveryCloseout.confirmedAt
accountingConfirmedAt
deliveryDate
```

Các field legacy như `date`, `orderDate`, `documentDate`, `createdAt` chỉ còn là fallback cho dữ liệu cũ đã confirmed. SourceBreakdown trả rõ:

```txt
businessDateField = deliveryCloseout.confirmedAt || accountingConfirmedAt || deliveryDate fallback
fallbackDateFieldsUsed = deliveryDate, date, orderDate, documentDate
```

## 8. Source note trên UI sau sửa

Đã cập nhật source contract và UI source note.

Sau sửa source chính hiển thị đúng bản chất:

```txt
orders + orderPaymentAllocations.current + deliveryCloseoutVersions.latest + orders.deliveryCloseout + orders.rewardAmount fallback
```

Chi tiết nguồn hiển thị thêm:

```txt
Nguồn trả thưởng
Ưu tiên nguồn trả thưởng
Source key = reward_final_state_current
```

## 9. Excel export có dùng cùng nguồn không

Report Center export đi qua:

```txt
ReportCenterService.run('rewards-by-customer')
→ RewardReportService.rewardByCustomerReport()
```

Không có Excel service riêng đọc `orders.deliveryCloseout.rewardAmount` cũ. Test static đã chặn việc export quay lại source cũ.

## 10. File đã sửa/thêm

```txt
src/services/reports/RewardReportService.js
src/services/reports/rewardReportSourceResolver.js
src/services/reports/ReportCenterService.js
src/services/reports/ReportSourceRegistry.js
public/js/app/admin/08a-reports.js
test/reward-report-final-source.test.js
test/reward-report-excel-source-contract.test.js
test/report-center-popup-reward.test.js
test/report-rewards-source-contract.test.js
test/report-rewards-source-static.test.js
PHASE225_REWARD_REPORT_CANONICAL_SOURCE_FIX_REPORT.md
```

## 11. Test đã thêm

```txt
test/reward-report-final-source.test.js
test/reward-report-excel-source-contract.test.js
```

Các case chính:

- `order.rewardAmount = 0`, `order.deliveryCloseout.rewardAmount = 0`, nhưng allocation current reward = 255.000 → report lấy 255.000.
- `orders.deliveryCloseout` thiếu, latest version reward = 848.000 → report lấy 848.000.
- Allocation stale/non-current bị bỏ qua.
- Một order có cả version và allocation không bị đếm trùng; priority chọn allocation current.
- Source note có `orderPaymentAllocations.current`, `deliveryCloseoutVersions.latest`, `orders.deliveryCloseout fallback`.
- Excel export dùng cùng `RewardReportService` / resolver canonical.

## 12. Kết quả test

Đã chạy:

```bash
npm install --ignore-scripts
npm run check:syntax
npm run check:source-bundles
npm run check:source-size
node scripts/audit-dead-code.js
node scripts/audit-flow-usage.js
node scripts/verify-runtime-flows.js
```

Kết quả:

```txt
check:syntax → SYNTAX_OK 1380 JavaScript files
check:source-bundles → OK 19 bundles
check:source-size → OK
audit-dead-code → OK
audit-flow-usage → OK canonical=29 retired=9 fetches=263 unmatched=0 warnings=0
verify-runtime-flows → OK canonical=29 retired=9 routeChecks=72 unmatchedFetches=0 retiredHits=0
```

Targeted tests:

```txt
node --test test/reward-report-final-source.test.js test/reward-report-excel-source-contract.test.js test/report-center-popup-reward.test.js test/report-rewards-source-contract.test.js test/report-rewards-source-static.test.js test/source-forbidden-collections-static.test.js
→ 17 pass / 0 fail

node --test test/*reward* test/*report* test/*excel* test/*delivery* test/*allocation* test/*closeout* test/*flow*
→ 532 pass / 0 fail
```

`npm test` full đã chạy nhưng timeout 300s trong sandbox; trước timeout các batch đã chạy đều pass, log cuối trước timeout có 117 pass / 0 fail cho batch đang chạy. Không thấy fail liên quan reward/report/excel/flow.

## 13. Rủi ro còn lại

- Cần chạy lại trên dev/staging có MongoDB thật để đối chiếu số đơn reward canonical theo dry-run MongoDB.
- Nếu dữ liệu cũ thiếu cả `accountingConfirmedAt` và `deliveryCloseout.confirmedAt`, report vẫn fallback theo `deliveryDate/date/orderDate/documentDate`; đây là tương thích legacy, không phải source chính.
- Nếu allocation/version không có key order gốc mà chỉ có correction code DCOC/DCOA/DCOV, resolver sẽ cảnh báo và không dùng correction code làm order chính.

## 14. ZIP output

```txt
MK-pro-phase225-reward-report-canonical-source-fix.zip
```
