# V45 Business Core Standardized Report

## Mục tiêu
Chuẩn hoá nghiệp vụ theo nguyên tắc: dữ liệu tiền hàng quan trọng chỉ có một nguồn chuẩn, không sửa cache trực tiếp, mọi thay đổi tài chính phải đi qua ledger/chứng từ.

## Nội dung đã chuẩn hoá

### 1. Công nợ AR Ledger là nguồn chuẩn
- Thêm `src/utils/arLedger.util.js` để tính công nợ mở từ các dòng AR Ledger active.
- Bỏ tư duy cộng/trừ trực tiếp `customer.currentDebt` trong luồng post/hủy đơn bán.
- Hủy đơn bán chỉ tạo bút toán đảo AR, không tự sửa công nợ khách hàng.

### 2. Chặn thu vượt công nợ theo từng đơn
- `createReceipt()` kiểm tra allocations trước khi ghi phiếu thu.
- `createDebtCollection()` kiểm tra allocations trước khi tách tiền mặt/chuyển khoản/trả hàng.
- Nếu số tiền phân bổ lớn hơn công nợ còn lại của đơn, API trả lỗi 400.

### 3. Test bảo vệ nghiệp vụ
- Thêm test cho AR guard:
  - chỉ tính ledger active;
  - bỏ qua dòng void/cancelled;
  - chặn allocation vượt nợ còn lại.
- Cập nhật test hủy đơn bán theo nguyên tắc mới: không mutate trực tiếp công nợ khách.

## Kết quả kiểm thử

```text
npm test
16 pass / 0 fail
```

## Ý nghĩa
Bản này giảm rủi ro lệch công nợ do có nhiều nguồn tính khác nhau. Công nợ khách hàng về lâu dài phải được dựng từ AR Ledger hoặc cache được rebuild từ AR Ledger, không lấy `customer.currentDebt` làm sổ gốc.
