# V45 Delivery Engine Professional 5 Steps Report

## Mục tiêu
Chuẩn hoá màn `Đơn giao hôm nay` theo hướng kỹ sư phần mềm chuyên nghiệp: không để route/controller tự xử lý nghiệp vụ, app và web dùng chung lõi, trả hàng đọc/ghi một nguồn, thu tiền có đối soát và chặn vượt phải thu.

## 1. Tách lõi DeliveryEngine
- Nâng cấp `src/engines/delivery.engine.js` thành lõi nghiệp vụ giao hàng.
- `src/routes/deliveryRoutes.js` chỉ còn nhiệm vụ nhận request/response, không chứa logic tính tiền, trả hàng, xác nhận giao.
- Các API `/api/delivery/orders`, `/return`, `/payment`, `/confirm` đều đi qua DeliveryEngine.

## 2. Chuẩn hoá công nợ/tiền giao hàng
- DeliveryEngine tạo cấu trúc `amounts` chuẩn gồm: `receivable`, `cash`, `bank`, `reward`, `returnAmount`, `processed`, `debt`.
- Chặn thu vượt: `cash + bank + reward + returnAmount` không được vượt `receivable` quá ngưỡng 1.000đ.
- Khi lưu thu tiền, hệ thống lưu `deliveryPayment` và `paymentAllocations` làm cấu trúc chuẩn; các field cũ chỉ giữ làm mirror tương thích báo cáo cũ.

## 3. Chuẩn hoá trả hàng một nguồn
- Hàng trả vẫn ghi vào `returnOrders` bằng mã ổn định `RO-<mã đơn bán>`.
- Clear trả hàng về 0 vẫn set `totalReturnAmount = 0`, `amount = 0`, `debtReduction = 0` để tránh lỗi còn tiền hàng trả ảo.
- `buildCanonicalOrder()` luôn lấy hàng trả từ `returnOrders`, không lấy từ cache cũ.

## 4. Chuẩn hoá luồng UI
- Đổi tab chi tiết thành quy trình rõ ràng:
  1. Giao hàng
  2. Thu tiền
  3. Hoàn tất
- Danh sách đơn được gọn lại, chỉ nhấn mạnh phải thu và còn nợ; chi tiết tiền nằm trong tab hoàn tất.
- Nút `Đối soát` được thêm vào màn giao hàng.

## 5. Đối soát cuối ngày NVGH
- Thêm API `GET /api/delivery/reconciliation`.
- Trả về tổng: phải thu, tiền mặt, chuyển khoản, trả thưởng, hàng trả, còn nợ, chênh lệch, trạng thái cân đối.
- Tab hoàn tất hiển thị `Đối soát OK` hoặc cảnh báo chênh lệch.

## Test
Đã chạy:

```bash
npm install
npm run docs:generate
npm test
```

Kết quả:

```text
18 pass / 0 fail
```
