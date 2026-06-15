# PHASE 41 - Mobile Debt Legacy AR Amount Validation Fix

## Mục tiêu

Sửa lỗi App bán hàng hiển thị đúng số tiền **Có thể thu**, nhưng API `POST /api/mobile/debt-collections` trả `409` với thông báo số tiền thu vượt công nợ.

Trường hợp tái hiện:

- Khách hàng: `4499569 - Vân Xô`
- Đơn nợ: `HU90203652`
- Có thể thu: `6.559.185`
- Số tiền nhập: `6.559.185`

## Nguyên nhân gốc

Màn danh sách công nợ và lớp xác thực phiếu thu sử dụng hai công thức AR khác nhau.

Báo cáo công nợ hỗ trợ dữ liệu legacy:

- Dòng SALE/EXTERNAL_DEBT không có `debit` thì lấy `amount` làm debit.
- Dòng RECEIPT/RETURN/BONUS không có `credit` thì lấy `amount` làm credit.

`DebtReadService.checkAvailableDebt()` trước đây chỉ tính:

```js
sum + debit - credit
```

Với dòng legacy chỉ có `amount`, backend tính công nợ bằng `0` hoặc thấp hơn số đang hiển thị, dẫn đến trả `409` dù người dùng nhập đúng số tiền.

## Giải pháp

### 1. Chuẩn hóa công thức AR dùng chung

File: `src/utils/arLedger.util.js`

Bổ sung:

- `isSaleLikeArEntry()`
- `effectiveArDebit()`
- `effectiveArCredit()`
- `arEntryBalanceEffect()`

Quy tắc tương thích với báo cáo công nợ Mongo hiện tại:

```text
SALE / EXTERNAL_DEBT:
  debit > 0 ? debit : amount

RECEIPT / RETURN / BONUS / loại giảm nợ khác:
  credit > 0 ? credit : amount
```

Dòng void, reversed và reversal không tham gia số dư.

### 2. Đồng bộ lớp xác thực phiếu thu

File: `src/services/DebtReadService.js`

`getOrderDebt()` và `checkAvailableDebt()` sử dụng `arEntryBalanceEffect()` thay cho phép tính trực tiếp `debit - credit`.

Kết quả:

- Số hiển thị và số backend xác thực dùng cùng một contract.
- Dữ liệu AR mới và dữ liệu AR legacy đều hoạt động.
- Phiếu đang chờ kế toán vẫn được trừ khỏi số có thể thu.
- Thu vượt thực tế vẫn bị chặn.

### 3. Chặn phân bổ trùng đơn

Backend từ chối payload có nhiều dòng phân bổ cho cùng một mã đơn. Điều này ngăn payload giả mạo chia nhỏ tiền thành nhiều dòng để vượt công nợ.

## Phạm vi không thay đổi

- Không thay đổi UI App bán hàng.
- Không thay đổi API contract.
- Không thay đổi collection MongoDB.
- Không migration dữ liệu.
- Không thay đổi thời điểm giảm công nợ.
- Không thay đổi quy trình kế toán xác nhận.
- Không thay đổi AR posting, fund ledger, tồn kho, bán hàng, trả hàng hoặc giao hàng.

## File thay đổi

- `src/utils/arLedger.util.js`
- `src/services/DebtReadService.js`
- `test/ar-ledger-business-guard.test.js`
- `test/mobile-debt-legacy-ar-amount-fallback.test.js`

## Kiểm thử

- Case lỗi `HU90203652 / 6.559.185`: đạt.
- AR-SALE legacy chỉ có `amount`: đạt.
- AR-RECEIPT legacy chỉ có `amount`: đạt.
- Thu đúng toàn bộ công nợ: đạt.
- Thu vượt 1 đồng: bị chặn.
- Phân bổ trùng cùng đơn: bị chặn.
- JavaScript syntax: `608/608` file đạt.
- Targeted tests: `7/7` đạt.
- Full regression: `464/464` đạt.
- OpenAPI: `252 operations`, đồng bộ.
- Production dependency audit: `0 vulnerabilities`.
