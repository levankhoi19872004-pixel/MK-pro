# PHASE 70 - Tối giản chỉ tiêu nhân viên bán hàng

## 1. Mục tiêu nghiệp vụ

Khu vực **Chỉ tiêu nhân viên bán hàng theo tháng** chỉ giữ lại các thông tin quản trị thực sự cần theo từng NVBH:

1. Chỉ tiêu tổng.
2. Tổng bán ra.
3. Tổng trả về.
4. Thực đạt.
5. Công nợ.
6. Doanh số hôm nay.

Các cột phụ như chờ xác nhận, tỷ lệ, khuyến mại, trạng thái và chi tiết số lượng đơn được bỏ khỏi bảng để giảm nhiễu và tăng diện tích hiển thị.

## 2. Quy tắc tính toán

| Chỉ số | Trường dữ liệu | Quy tắc |
|---|---|---|
| Chỉ tiêu tổng | `targetAmount` | Chỉ tiêu tháng đã giao cho NVBH |
| Tổng bán ra | `totalSalesAmount` | `salesAmount + pendingSalesAmount` |
| Tổng trả về | `returnAmount` | Tổng giá trị phiếu trả đã xác nhận |
| Thực đạt | `netSalesAmount` | `salesAmount - returnAmount` |
| Công nợ | `debtAmount` | Số dư hiện tại từ nguồn chuẩn `arLedgers` |
| Doanh số hôm nay | `todaySalesAmount` | Doanh số phát sinh hôm nay, gồm cả đơn chờ xác nhận |

`Tổng bán ra` được bổ sung thành trường API rõ nghĩa tại `HomeDashboardService` thay vì chỉ ghép số liệu trong giao diện. Frontend vẫn có fallback cộng hai trường cũ để tương thích với cache hoặc response cũ trong thời gian triển khai.

## 3. Phạm vi thay đổi

- `public/index.html`
  - Đổi tiêu đề khu vực thành **Chỉ tiêu nhân viên bán hàng theo tháng**.
  - Rút bảng từ 12 cột xuống 8 cột, gồm 2 cột định danh và 6 KPI.
  - Bổ sung tooltip giải thích nguồn và công thức.
  - Cache bust bundle Dashboard sang `phase70-dashboard-sales-staff-kpi-v1`.

- `public/js/app/00-dashboard.js`
  - Render đúng 6 KPI được yêu cầu.
  - Loại bỏ trạng thái, tỷ lệ, khuyến mại, chờ xác nhận và dòng mô tả số đơn khỏi từng NVBH.
  - Điều chỉnh `colspan` từ 12 xuống 8.
  - Có fallback cho `totalSalesAmount` khi backend/cache cũ chưa có trường mới.

- `src/services/dashboard/HomeDashboardService.js`
  - Bổ sung `totalSalesAmount` cho từng NVBH và phần tổng hợp.
  - Không thay đổi nguồn dữ liệu chuẩn hoặc nghiệp vụ xác nhận kế toán hiện tại.

- `test/home-dashboard.test.js`
  - Kiểm tra công thức `totalSalesAmount`.
  - Kiểm tra bảng chỉ còn đúng các KPI đã yêu cầu.
  - Kiểm tra các cột không cần thiết không còn trong bảng NVBH.

## 4. Đánh giá rủi ro

- **Rủi ro dữ liệu:** Thấp. Không ghi hoặc migration dữ liệu MongoDB.
- **Rủi ro API:** Thấp. Chỉ bổ sung trường mới, không xóa trường cũ.
- **Rủi ro giao diện:** Thấp. Frontend hỗ trợ cả response mới và cache cũ.
- **Ảnh hưởng module khác:** Không. Báo cáo giao hàng, báo cáo tổng hợp và các API cũ giữ nguyên.

## 5. Kiểm thử

- `node --check public/js/app/00-dashboard.js`: đạt.
- `node --check src/services/dashboard/HomeDashboardService.js`: đạt.
- `node --test test/home-dashboard.test.js test/dashboard-summary-only.test.js`: **25/25 đạt**.
- Bộ kiểm tra cú pháp toàn dự án chưa hoàn tất trong giới hạn thời gian môi trường vì phải khởi tạo tiến trình `node --check` riêng cho 667 file JavaScript; các file thay đổi trực tiếp đều đã kiểm tra đạt.
