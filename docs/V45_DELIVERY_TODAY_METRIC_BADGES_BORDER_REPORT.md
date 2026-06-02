# V45 Delivery Today Metric Badges Border Fixed

## Yêu cầu
Trong phần Đơn đi giao hôm nay, các chỉ tiêu PT/TM/CK/TT/TH/CN ở dòng NVGH, NVBH và dòng đơn cần có viền màu giống các ô báo cáo tổng phía trên để dễ nhìn và đối soát.

## Đã chỉnh

### 1. Frontend logic
File: `public/js/app/06-master-delivery.js`

- Thêm `deliveryMetricValues(row)` để chuẩn hóa 6 chỉ tiêu:
  - PT: Tổng phải thu
  - TM: Tiền mặt
  - CK: Chuyển khoản
  - TT: Trả thưởng
  - TH: Trả hàng từ `returnOrders`
  - CN: Công nợ
- Thêm `deliveryMetricBadge()` và `deliveryMetricBadges()` để render mini badge có class riêng.
- Dòng NVGH và NVBH đổi từ chuỗi text:
  `30Đ | PT ... | TM ...`
  sang badge HTML:
  `30Đ [PT] [TM] [CK] [TT] [TH] [CN]`.
- Dòng đơn compact thêm class:
  - `money-pt`
  - `money-tm`
  - `money-ck`
  - `money-tt`
  - `money-th`
  - `money-cn`

### 2. CSS giao diện
File: `public/style.css`

- Thêm CSS mini badge cho khu vực `#deliveryTodayTab`.
- Màu viền đồng bộ với báo cáo tổng:
  - PT: xanh dương nhạt
  - TM: xanh dương
  - CK: xanh lá
  - TT: cam
  - TH: tím
  - CN: đỏ
- Tối ưu responsive để màn nhỏ tự wrap badge xuống dòng.

## Không thay đổi
- Không thay đổi backend.
- Không thay đổi API.
- Không thay đổi cách tính công nợ.
- TH vẫn lấy từ `returnOrders` do backend trả về.
- Không động vào AR Ledger.

## Test
- `node --check public/js/app/06-master-delivery.js`: OK
