# PHASE 75 — REPORT CENTER POPUP & BÁO CÁO TRẢ THƯỞNG

## 1. Mục tiêu

1. Chuyển Trung tâm báo cáo khỏi bố cục toàn trang sang cửa sổ popup độc lập, giảm rối mắt và giữ màn hình nghiệp vụ chính gọn hơn.
2. Thêm báo cáo **Khách hàng đã trả thưởng** để lọc đúng các nhà có phát sinh trả thưởng/cấn trừ công nợ trong kỳ.
3. Giữ nguyên toàn bộ API báo cáo cũ và khả năng xuất Excel của Report Center V2/Excel Interaction Platform.

## 2. Kết quả khảo sát

- Report Center V2 trước đây render toàn bộ hero, KPI, danh mục, biểu đồ, bảng và kho mẫu Excel trực tiếp trong `#reportsTab`.
- Dữ liệu trả thưởng chuẩn được ghi vào collection `arLedgers` bằng bút toán:
  - `type = ar_bonus`
  - `refType = BONUS_ALLOWANCE`
  - `code = AR-BONUS-*`
  - `credit/amount > 0`
- Bút toán này được sinh bởi `postBonusAllowanceAR()` khi kế toán xác nhận giao hàng, vì vậy phù hợp làm nguồn xác định **đã trả thưởng**, thay vì đọc số tiền tạm nhập trên đơn giao.

## 3. Thiết kế đã áp dụng

### 3.1 Popup báo cáo

Tab Báo cáo chỉ còn launcher gọn:

- Nút `Mở trung tâm báo cáo`.
- Popup full-workspace có nút `Đóng`.
- Hỗ trợ đóng bằng:
  - Nút Đóng.
  - Click nền popup.
  - Phím Escape.
  - Chuyển sang tab nghiệp vụ khác.
- Click lại menu Báo cáo luôn mở lại popup, kể cả dữ liệu đã được lazy-load trước đó.
- Không tải trùng API khi popup và tab loader cùng khởi tạo.

### 3.2 Báo cáo Khách hàng đã trả thưởng

Mã báo cáo:

```text
rewards-by-customer
```

Nhóm:

```text
Công nợ
```

Nguồn dữ liệu:

```text
arLedgers / AR-BONUS
```

Một dòng trên báo cáo tương ứng một khách hàng trong kỳ, gồm:

- Mã khách hàng.
- Tên khách hàng.
- NVBH.
- NVGH.
- Số lần trả thưởng.
- Số đơn có trả thưởng.
- Tổng tiền trả thưởng.
- Bình quân mỗi lần.
- Ngày trả lần đầu.
- Ngày trả gần nhất.
- Mã đơn gần nhất.

Chỉ lấy bút toán trả thưởng có giá trị dương. Các dòng thu tiền thông thường hoặc dòng thưởng bằng 0 không được đưa vào báo cáo.

## 4. Vùng thay đổi

### File mới

- `src/services/reports/RewardReportService.js`
- `public/css/95-report-center-popup.css`
- `test/report-center-popup-reward.test.js`

### File cập nhật

- `src/services/reports/ReportCenterService.js`
- `public/index.html`
- `public/js/app/admin/08a-reports.js`
- `test/report-center-v2-unit.test.js`
- `test/report-center-v2-static.test.js`

## 5. Tương thích

Không thay đổi:

- API `/api/reports/catalog`, `/api/reports/overview`, `/api/reports/run/:code`.
- Các endpoint export Excel legacy.
- Excel Interaction Platform `POST /api/excel/export`.
- Logic bán hàng, tồn kho, công nợ và xác nhận kế toán.
- Schema MongoDB.

Không cần migration database.

## 6. Phân quyền

Báo cáo trả thưởng chỉ hiển thị cho:

- `admin`
- `manager`
- `accountant`

Các vai trò `warehouse` và `sales` không được truy cập báo cáo này.

## 7. Kiểm thử

- Targeted regression: **25/25 pass**.
- Kiểm tra popup launcher/modal/close/Escape: pass.
- Kiểm tra tổng hợp AR-BONUS theo khách hàng: pass.
- Kiểm tra bỏ qua receipt và thưởng bằng 0: pass.
- Kiểm tra summary + pagination: pass.
- Kiểm tra role access: pass.
- Kiểm tra tương thích Excel Interaction: pass.
- Kiểm tra cú pháp các file JavaScript thay đổi: pass.
- Kiểm tra ID HTML trùng: 0 lỗi.

`npm run check:syntax` toàn dự án đã được khởi chạy nhưng không hoàn tất trong giới hạn 120 giây của môi trường; các file trực tiếp thay đổi đều đã được `node --check` thành công.

## 8. Rủi ro còn lại

- Dữ liệu legacy chỉ có mô tả “trả thưởng” nhưng không có type/refType chuẩn vẫn được hỗ trợ qua nhận diện `source`, `sourceType`, `note`; tuy nhiên nên tiếp tục chuẩn hóa mọi bút toán mới về `AR-BONUS`.
- Báo cáo phản ánh khoản đã ghi vào AR Ledger. Khoản trả thưởng mới nhập nhưng chưa được kế toán xác nhận sẽ không xuất hiện; đây là hành vi chủ đích để tránh báo cáo nhầm dữ liệu tạm.
