# V45 - Sửa màn Công nợ không còn bắt buộc khoảng thời gian

## Vấn đề
Màn Công nợ đã bỏ 2 ô ngày trên giao diện, nhưng API `/api/debts` vẫn dùng `requireReportDateRange()` nên khi tìm công nợ không truyền `dateFrom/dateTo`, backend trả lỗi:

```text
Vui lòng chọn khoảng thời gian
```

## Nguyên nhân
File `src/controllers/reportController.js` vẫn bắt buộc ngày cho các API công nợ:

- `/api/debts`
- `/api/debts/by-salesman`
- `/api/debts/by-delivery`

Trong khi nghiệp vụ công nợ mới phải lấy theo **số dư AR hiện tại**, không lấy theo khoảng thời gian.

## Đã sửa
Trong `src/controllers/reportController.js`:

- Bỏ `requireReportDateRange()` khỏi `debts()`.
- Bỏ `requireReportDateRange()` khỏi `debtsBySalesman()`.
- Bỏ `requireReportDateRange()` khỏi `debtsByDelivery()`.
- Giữ nguyên bắt buộc ngày cho các báo cáo khác như kho, bán hàng, tài chính, giao hàng.

## Kết quả mong đợi
Màn Công nợ:

- Không còn yêu cầu chọn khoảng thời gian.
- Chỉ hiện danh sách khi người dùng nhập khách hàng/NVBH/NVGH.
- API `/api/debts?q=...`, `/api/debts?salesman=...`, `/api/debts?delivery=...` chạy được không cần `dateFrom/dateTo`.

## Test
- `node --check src/controllers/reportController.js`: OK.
- `npm test`: 14/14 PASS.
