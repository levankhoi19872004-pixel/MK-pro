# PHASE A3 — FRONTEND/UI PAYLOAD ISOLATION REPORT

## 1. Phạm vi và mục tiêu

Phase A3 tiếp tục trực tiếp từ working ZIP Phase A2. Mục tiêu là sửa lớp frontend của popup **Điều chỉnh đơn giao** để thao tác trên tab **Thu tiền** không còn mang theo hoặc kích hoạt nghiệp vụ **Hàng trả**.

Phạm vi production chỉ thay đổi một file:

```text
public/js/app/new/91-delivery-today-new.js
```

Không sửa backend production, model, route, ledger, quỹ, kho hoặc return repository trong Phase A3. Toàn bộ thư mục `src/` được đối chiếu SHA256 với Phase A2 và không thay đổi.

## 2. Kết luận lỗi trước khi sửa

Payload frontend Phase A2 của case `B0040961` vẫn có lỗi contract:

- Người dùng chỉ sửa tiền mặt `1.932.000 → 0`.
- Không thay đổi số lượng hàng trả.
- Frontend vẫn tính `returnDelta = returnAfter - row.returnedAmount`.
- Frontend gửi toàn bộ `returnAdjustmentItems`, `returnAdjustment`, `correctedReturnItems` và `returnAdjustmentAmount`.
- Vì tổng dòng popup và `row.returnedAmount` đến từ hai read source khác nhau, frontend tự sinh `returnAdjustmentAmount = 1.931.784` dù người dùng không sửa hàng trả.

Payload trước sửa được chạy và chụp trực tiếp từ source Phase A2, không phải dữ liệu mô phỏng bằng tay.

## 3. Thay đổi production

### A3-REQ-01 — Dirty state tách biệt

Bổ sung state độc lập:

```js
adjustmentDirty: {
  payment: false,
  returns: false
}
```

Bổ sung `adjustmentPaymentDraft` để giữ giá trị tiền khi người dùng chuyển qua lại giữa các tab.

Nguyên tắc mới:

- `paymentDirty` chỉ đúng khi giá trị cuối của tiền mặt/chuyển khoản/trả thưởng khác baseline của đơn.
- `returnDirty` chỉ đúng khi `newReturnQty !== oldReturnQty` trên ít nhất một dòng.
- Mở tab Hàng trả hoặc tải canonical return rows không tự đánh dấu `returnDirty`.
- Khi người dùng sửa rồi trả lại đúng số lượng ban đầu, `returnDirty` quay về `false`.
- Canonical return response đến muộn không ghi đè dữ liệu return mà người dùng đã thực sự chỉnh.

### A3-REQ-02 — Payload PAYMENT_ONLY tối thiểu

Payload mới của case `B0040961`:

```json
{
  "changeType": "PAYMENT_ONLY",
  "reason": "",
  "note": "B0040961 evidence",
  "expectedVersion": "7",
  "paymentCorrection": {
    "correctedCashAmount": 0,
    "correctedBankAmount": 0,
    "correctedRewardAmount": 0
  }
}
```

Không còn các trường:

```text
correctedCashLines
currentCashAmount
cashDeltaAmount
currentBankAmount
bankDeltaAmount
currentRewardAmount
rewardDeltaAmount
currentTotalCollected
correctedTotalCollected
totalCollectedDelta
correctedReturnItems
returnAdjustmentItems
returnAdjustment
returnAdjustmentAmount
```

Frontend chỉ gửi **final state** cần thiết. Backend Phase A2 chịu trách nhiệm đọc trạng thái canonical và tự tính delta.

### A3-REQ-03 — Loại bỏ false return delta

Đã bỏ logic:

```js
returnAfter - row.returnedAmount
```

Logic mới:

```js
returnDelta = sum(item.adjustmentAmount)
returnAfter = oldReturn + returnDelta
```

Vì `adjustmentAmount` chỉ khác `0` khi người dùng đổi số lượng hàng trả, việc hai read source có tổng khác nhau không còn tự tạo return mutation.

### A3-REQ-04 — RETURN_ONLY và COMBINED

Frontend xác định intent theo thay đổi thực tế:

| Payment changed | Return changed | Intent |
|---|---|---|
| Có | Không | `PAYMENT_ONLY` |
| Không | Có | `RETURN_ONLY` |
| Có | Có | `COMBINED` |
| Đơn đã chốt | Theo correction hợp lệ | `POST_CLOSEOUT_CORRECTION` |

Đối với `RETURN_ONLY`/`COMBINED`:

- Chỉ gửi các dòng có quantity thay đổi.
- Chỉ gửi `productCode`, `productName`, `newReturnQty`, `desiredReturnQty`.
- Không gửi client aggregate `returnAdjustmentAmount`.
- Backend tiếp tục canonicalize số lượng hiện tại, giá và tổng tiền.

### A3-REQ-05 — Version và tab state

Bổ sung `expectedVersion` từ version canonical tốt nhất đang có trên row:

1. latest correction version;
2. correction version;
3. closeout version;
4. delivery closeout version;
5. order version.

Giá trị version `0` không được ưu tiên hơn `order.version > 0`, tránh gửi nhầm `expectedVersion = 0` cho open order đã có version.

Giá trị tiền người dùng nhập được lưu trong draft, nên chuyển từ tab Thu tiền sang Hàng trả rồi quay lại không làm mất thay đổi và vẫn có thể tạo `COMBINED` đúng contract.

## 4. Case B0040961 sau sửa

| Chỉ số | Kết quả |
|---|---:|
| Phải thu | 1.931.784 |
| Tiền mặt hiện tại | 1.932.000 |
| Tiền mặt sau điều chỉnh | 0 |
| `cashDelta` | -1.932.000 |
| Hàng trả hiện tại | 1.931.784 |
| Người dùng sửa hàng trả | Không |
| `returnDelta` | **0** |
| Công nợ sau điều chỉnh | **0** |
| Intent | `PAYMENT_ONLY` |
| Return fields trong request | **Không có** |
| Backend return read/write | **0 / 0** |
| AR receipt/adjustment cho open payment-only | **0** |

Payload mới đã được đưa qua service contract Phase A2 bằng runtime test và được backend chấp nhận.

## 5. Test đã bổ sung/cập nhật

### Test hành vi mới

```text
test/phase-a3-delivery-adjustment-frontend-payload.test.js
```

Bao phủ:

1. B0040961 payment-only không gửi return fields.
2. Mở/tải tab Hàng trả không tạo dirty state hoặc mutation.
3. Dirty state chỉ đổi theo input thực tế và tự xóa khi revert.
4. Return-only gửi đúng một dòng thay đổi và không gửi payment section.
5. Combined gửi `COMBINED` với hai section độc lập.

### Red → Green

A1 baseline Phase A2:

```text
3 tests: 2 PASS, 1 FAIL
exit code: 1
```

A1 regression sau A3:

```text
3 tests: 3 PASS, 0 FAIL
exit code: 0
```

### Backend integration bổ sung

Bổ sung test chứng minh payload tối thiểu Phase A3 được service Phase A2 chấp nhận:

- `PAYMENT_ONLY`;
- `cashDelta = -1.932.000` do server tính;
- `returnAdjustmentAmount = 0`;
- `newDebtAmount = 0`;
- không đọc/ghi `returnOrders`;
- không ghi AR adjustment/receipt;
- optimistic version `7` hợp lệ.

### Static contract tests cập nhật

Ba static test cũ đang bảo vệ payload legacy đã được cập nhật theo contract mới:

- không còn yêu cầu gửi full return list;
- không còn yêu cầu `correctedCashLines`;
- không còn yêu cầu client gửi reward delta;
- yêu cầu `changeType`, final payment state và changed return lines.

## 6. Kết quả kiểm thử

### Mandatory Phase A3 suite

```text
49 tests
49 PASS
0 FAIL
0 SKIP
exit code 0
```

Gồm:

- A1 regression;
- A2 backend/data/domain tests;
- A3 frontend runtime payload tests;
- return-order static contract;
- popup UI contract;
- reward allocation frontend contract;
- closeout correction contract.

### Syntax toàn dự án

```text
SYNTAX_OK 1562 JavaScript files
exit code 0
```

## 7. Danh sách file thay đổi

### Production

```text
public/js/app/new/91-delivery-today-new.js
```

### Test

```text
test/phase-a1-delivery-adjustment-payment-return-isolation.red.test.js
test/phase-a2-delivery-adjustment-backend.test.js
test/phase-a3-delivery-adjustment-frontend-payload.test.js
test/delivery-adjustment-returnorders-contract-static.test.js
test/delivery-adjustment-reward-allocation-integration-static.test.js
test/delivery-today-new-popup-ui-static.test.js
```

Không có backend production file nào thay đổi.

## 8. Diff tóm tắt

| File | Thay đổi |
|---|---|
| `91-delivery-today-new.js` | Dirty state tách biệt, payment draft, return delta theo explicit line delta, intent resolver, payload tối thiểu, changed-return-only payload, expected version |
| A1 test | Chuyển RED expectation sang regression GREEN sau khi lỗi được sửa |
| A2 test | Thêm integration test cho payload tối thiểu A3 |
| A3 test | Thêm 5 runtime payload/dirty-state scenarios |
| 3 static tests | Loại contract legacy và bảo vệ contract intent-isolated mới |

## 9. Giới hạn môi trường

ZIP không chứa `node_modules`. Các suite phụ thuộc package runtime như `mongoose` không thể chạy full bằng `npm test` trong môi trường hiện tại. Mandatory A1/A2/A3 tests được thiết kế bằng Node built-ins và đã chạy hoàn chỉnh.

Không có thay đổi backend trong Phase A3, vì vậy các bảo vệ production-grade đã hoàn thành ở Phase A2 vẫn được giữ nguyên byte-for-byte.

## 10. Kết luận gate

Phase A3 đạt toàn bộ acceptance criteria:

- `PAYMENT_ONLY` không còn return field.
- Tải/mở Hàng trả không tạo `returnDelta`.
- B0040961 có `cashDelta = -1.932.000`, `returnDelta = 0`, debt sau = `0`.
- `RETURN_ONLY` và `COMBINED` có contract rõ ràng.
- Backend Phase A2 chấp nhận payload mới và không ghi dữ liệu ngoài intent.
- Popup/UI contract tests và syntax đều GREEN.

Phase A3 dừng tại đây, chưa thực hiện Phase A4 release verification.
