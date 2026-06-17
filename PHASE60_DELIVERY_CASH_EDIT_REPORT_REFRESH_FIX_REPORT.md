# PHASE 60 — SỬA LỖI CẬP NHẬT PHIẾU NỘP QUỸ KHÔNG ĐỒNG BỘ SỐ BÁO CÁO

## 1. Tổng quan dự án

- Kiến trúc: Node.js/Express modular monolith.
- Cơ sở dữ liệu: MongoDB/Mongoose.
- Frontend: HTML/CSS/JavaScript thuần.
- Collection phiếu nộp quỹ: `deliveryCashSubmissions`.
- Nguồn ghi sổ tiền chuẩn: `fundLedgers`, chỉ phát sinh khi phiếu được xác nhận.

## 2. Kết quả khảo sát & đối chiếu

Hiện tượng:

- Popup sửa phiếu tải đúng dữ liệu giao hàng mới theo `Ngày giao + Mã NVGH`.
- KPI trong popup hiển thị `Tiền mặt cần thu` mới.
- Người dùng bấm **Cập nhật phiếu nộp quỹ** thành công.
- Danh sách cập nhật được cột `Thực nộp TM`, nhưng cột `Báo cáo TM` vẫn giữ giá trị cũ.

Ví dụ thực tế:

- Báo cáo TM cũ trong danh sách: `31.944.000`.
- Báo cáo TM hiện tại trong popup: `45.390.773`.
- Thực nộp TM: `45.441.000`.
- Chênh đúng sau cập nhật phải là: `+50.227`.

## 3. Nguyên nhân gốc rễ

File:

```text
src/services/fundService.js
```

Hàm:

```text
updateDeliveryCashSubmission()
```

Luồng cũ chỉ cập nhật:

- `submittedCashAmount`.
- `submittedBankAmount`.
- `differenceCashAmount` dựa trên `current.reportCashAmount` cũ.
- `differenceBankAmount` dựa trên `current.reportBankAmount` cũ.
- `note`.

Hàm cập nhật không gọi lại `buildDeliverySubmissionDraft()`, vì vậy các trường snapshot báo cáo vẫn bị giữ nguyên:

- `reportCashAmount`.
- `reportBankAmount`.
- `reportCurrentOrderCashAmount`.
- `reportCurrentOrderBankAmount`.
- `reportOldDebtCashAmount`.
- `reportOldDebtBankAmount`.
- `orderCodes`.
- `orderIds`.
- `deliveryStaffName`.

Frontend đã tải lại danh sách đúng sau khi lưu. Lỗi nằm ở dữ liệu backend được lưu chưa được làm mới, không phải lỗi render hoặc cache giao diện.

## 4. Giải pháp đã áp dụng

### 4.1. Dựng lại snapshot báo cáo khi sửa

`updateDeliveryCashSubmission()` hiện thực hiện:

```text
Đọc phiếu hiện tại
→ Kiểm tra phiếu chưa xác nhận
→ Lấy Ngày giao + Mã NVGH từ form
→ Gọi lại buildDeliverySubmissionDraft()
→ Tính lại tiền mặt/tài khoản từ danh sách đơn giao hiện tại
→ Giữ số thực nộp người dùng đã nhập
→ Tính lại chênh lệch
→ Ghi đè đúng bản ghi cũ
```

### 4.2. Cập nhật đúng bản ghi hiện hữu

File:

```text
src/repositories/deliveryCashSubmissionRepository.js
```

Thêm:

```text
patchByIdOrCode()
```

Việc cập nhật dùng bộ lọc theo `id/code` cũ thay vì upsert theo mã mới. Điều này tránh tạo thêm bản ghi nếu người dùng đổi ngày giao hoặc NVGH.

### 4.3. Chặn trùng phiếu

Nếu thay đổi ngày/NVGH làm phát sinh mã phiếu đã tồn tại, backend trả lỗi `409` thay vì ghi đè hoặc tạo trùng.

### 4.4. Giữ metadata và trạng thái an toàn

Khi cập nhật:

- Giữ nguyên `createdAt` và `createdBy`.
- Cập nhật `updatedAt`.
- Phiếu tiếp tục ở trạng thái `pending`.
- Không ghi `fundLedgers`.
- Không cho sửa phiếu đã xác nhận hoặc đã post quỹ.

## 5. Luồng dữ liệu sau sửa

```text
Popup sửa phiếu
    ↓
PUT /api/funds/delivery-cash-submissions/:id
    ↓
updateDeliveryCashSubmission()
    ↓
buildDeliverySubmissionDraft(Ngày giao + Mã NVGH)
    ↓
listDeliveryTodayOrdersCompact()
    ↓
Tính lại reportCashAmount/reportBankAmount/orderCodes/orderIds
    ↓
Giữ submittedCashAmount/submittedBankAmount từ form
    ↓
Tính lại differenceCashAmount/differenceBankAmount
    ↓
patch đúng phiếu hiện tại
    ↓
Frontend tải lại danh sách và hiển thị số mới
```

## 6. Phạm vi ảnh hưởng

Các file thay đổi nghiệp vụ:

```text
src/services/fundService.js
src/repositories/deliveryCashSubmissionRepository.js
```

Không thay đổi:

- HTML/CSS popup.
- API URL và request/response cơ bản.
- MongoDB schema.
- Quy trình xác nhận phiếu.
- Quy tắc ghi `fundLedgers`.
- Phiếu chi và nộp ngân hàng.

Không cần migration dữ liệu.

## 7. Kiểm thử

Đã bổ sung:

```text
test/fund-delivery-cash-update-refresh-behavior.test.js
test/fund-delivery-cash-update-refresh-static.test.js
```

Kết quả:

- JavaScript syntax: **648 file đạt**.
- Targeted regression: **18/18 đạt**.
- Behavior test xác nhận:
  - `reportCashAmount` đổi từ `31.944.000` thành `45.390.773`.
  - `submittedCashAmount` giữ `45.441.000`.
  - `differenceCashAmount` được tính lại thành `50.227`.
  - `reportBankAmount` và `differenceBankAmount` cập nhật đúng.
  - `orderCodes/orderIds` được đồng bộ lại.
  - Không dùng upsert tạo bản ghi thứ hai.

Full test suite chưa chạy trong sandbox vì ZIP không chứa `node_modules`.

## 8. Kết quả mong đợi

Sau deploy:

1. Mở phiếu pending và bấm **Sửa**.
2. Popup tải số báo cáo hiện tại theo ngày/NVGH.
3. Bấm **Cập nhật phiếu nộp quỹ**.
4. Danh sách hiển thị ngay:
   - `Báo cáo TM`: số mới.
   - `Thực nộp TM`: số đã nhập.
   - `Chênh`: tính trên số báo cáo mới.
5. Phiếu vẫn pending và chưa ghi `fundLedgers` cho đến khi bấm xác nhận.
