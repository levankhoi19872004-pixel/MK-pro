# PROMPT 3 — Chuẩn hóa postReturnAllocations, chặn nhiều AR-RETURN cho một returnOrder

## A. Hiện trạng trước patch

| File | Hàm | Source là returnOrder hay allocation | Có tạo AR-RETURN không | Có thể tạo nhiều dòng không | Rủi ro |
|---|---|---|---:|---:|---|
| `src/domain/posting/ArPostingService.js` | `postReturnAllocations()` | Allocation được biến thành returnOrder giả bằng cách đổi `id/code` | Có, qua `postReturn()` | Có | P0: nhiều allocation của cùng một phiếu trả có thể thành nhiều AR-RETURN |
| `src/services/financialService.js` | `createDebtCollection()` | Tạo một `returnOrder` thủ công, truyền `returnAllocations` | Có, qua `ArPostingService.postReturnAllocations()` | Trước patch có thể nhiều dòng nếu nhiều allocation | P0: giảm công nợ lặp theo allocation |
| `src/services/accounting/returnArPostingService.js` | `postReturnOrderToAR()` | ReturnOrder canonical | Có | Đã có idempotency guard | Đây là writer chuẩn cần dùng |
| `src/engines/posting.engine.js` | `postReturnOrderAR()` | Compatibility wrapper | Có, nhưng delegate service | Không tự build writer chính | OK sau phase55/56 |
| `scripts/reconcile-return-ar.js` | reconcile | AR ledger + ReturnOrder | Không tạo trừ `--fix` missing canonical | Không | Cần bổ sung rule nhận diện allocation-source legacy |

## B. Quyết định thiết kế allocation mới

- `ReturnOrder` là chứng từ kế toán gốc.
- `AR-RETURN` là bút toán công nợ cấp chứng từ, không phải cấp allocation.
- Allocation chỉ là chi tiết phân bổ nội bộ, được giữ trong cùng một ledger qua:
  - `allocationDetails`
  - `metadata.allocations`
  - `returnAllocationRefs`
- `postReturnAllocations()` gom theo `returnOrderId/returnOrderCode` duy nhất trước khi post.
- Nếu không xác định được `returnOrder` gốc, hàm trả skip reason và không ghi AR-RETURN.
- Writer duy nhất cho AR-RETURN vẫn là `returnArPostingService.postReturnOrderToAR()`.

## C. File đã sửa/tạo

| File | Thay đổi |
|---|---|
| `src/domain/posting/ArPostingService.js` | Viết lại `postReturnAllocations()` để group unique returnOrder, không đổi `id/code` theo allocation, delegate sang `returnArPostingService` |
| `src/services/accounting/returnArPostingService.js` | Cho phép lưu metadata allocation vào cùng AR-RETURN (`allocationDetails`, `metadata.allocations`, `returnAllocationRefs`) |
| `scripts/reconcile-return-ar.js` | Bổ sung rule phát hiện AR-RETURN nguồn allocation và duplicate theo returnOrderCode/allocation source |
| `test/financial-service-return-posting-boundary-static.test.js` | Cập nhật guard static: allocation wrapper không gọi `postReturn()` |
| `test/prompt3-return-allocation-posting.test.js` | Test runtime cho 3 allocations cùng returnOrder, 2 returnOrders khác nhau, missing returnOrderId, chạy lại không duplicate |
| `test/prompt3-return-allocation-reconcile-static.test.js` | Test static reconcile rule mới |
| `AR_RETURN_ALLOCATION_IDEMPOTENCY_REPORT.md` | Báo cáo patch |

## D. Reconcile rule mới

`scripts/reconcile-return-ar.js` phát hiện thêm:

| Rule | Ý nghĩa |
|---|---|
| `duplicate_ar_return_same_returnOrderCode` | Nhiều AR-RETURN active cùng `returnOrderCode/returnOrderId/sourceCode/sourceId` |
| `ar_return_sourceType_allocation_should_be_returnOrder` | Ledger AR-RETURN có source/ref/category dạng allocation thay vì returnOrder |
| `duplicate_ar_return_same_allocation_source_and_returnOrder` | Nhiều AR-RETURN active cùng allocation source và cùng returnOrder |

Counters mới trong summary:

- `duplicateArReturnByReturnOrderCode`
- `duplicateArReturnSameReturnOrderAllocationSource`
- `arReturnAllocationSourceType`

## E. Test evidence

Đã chạy syntax check:

```text
SYNTAX_OK 1018 JavaScript files
```

Đã chạy focused tests:

```bash
node --test \
  test/prompt3-return-allocation-posting.test.js \
  test/prompt3-return-allocation-reconcile-static.test.js \
  test/financial-service-return-posting-boundary-static.test.js \
  test/ar-return-idempotency-service.test.js \
  test/ar-return-idempotency-audit.test.js \
  test/prompt2-delivery-accounting-ar-return-writer-static.test.js \
  test/prompt2-delivery-accounting-ar-return-service-call.test.js
```

Kết quả:

```text
tests 16
pass 16
fail 0
```

## F. Rủi ro còn lại

| Rủi ro | Mức độ | Ghi chú |
|---|---:|---|
| Dữ liệu cũ đã có nhiều AR-RETURN theo allocation | P0 dữ liệu lịch sử | Reconcile chỉ báo cáo, không tự xóa |
| Allocation thiếu returnOrderId và cũng không có returnOrder gốc | P1 | Không tạo AR-RETURN, trả skip reason để xử lý nghiệp vụ |
| Nhiều ReturnOrder cùng SalesOrder | P1 | Service hiện vẫn ưu tiên guard theo returnOrder; cần audit riêng nếu nghiệp vụ cho phép nhiều RO trên một SO |

## Kết luận

`postReturnAllocations()` không còn có thể tạo nhiều AR-RETURN cho cùng một `returnOrder`. Mọi AR-RETURN từ allocation/returnOrder đều đi qua `returnArPostingService.postReturnOrderToAR()`.
