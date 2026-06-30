# Frontend Data Contract

## Mục tiêu

Frontend/mobile/report chỉ render dữ liệu nghiệp vụ đã được server chuẩn hóa, không trở thành nguồn tính toán nghiệp vụ lõi.

## API contract

Payload từ server phải có field rõ nghĩa:

- Công nợ: `debt`, `remainingDebtDisplay`, `debit`, `credit`, `status`, `source`.
- Tồn kho: `availableQty`, `onHand`, `reservedQty`, `warehouseCode`.
- Quỹ: `amount`, `direction`, `fundType`, `balance` nếu API đã tính.
- Staff: canonical + alias display nếu cần tương thích UI.

## Frontend được phép

- Format tiền/số lượng/ngày.
- Sort/filter UI trên payload đã chuẩn hóa.
- Tính tổng hiển thị tạm thời trên danh sách đã được server trả về.

## Frontend bị cấm

- Tính công nợ từ `totalAmount - paidAmount`.
- Suy luận tồn khả dụng từ snapshot/local cache làm SSoT.
- Tính fund balance từ raw fund ledger nếu không phải admin/audit view.

## Static guard

- `test/frontend-no-business-calculation-static.test.js`.
- `scripts/audit-frontend-business-calculation.js`.
