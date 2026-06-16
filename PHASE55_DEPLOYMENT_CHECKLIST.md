# PHASE 55 — DEPLOYMENT CHECKLIST

## Trước deploy

- [ ] Backup MongoDB theo quy trình hiện hành.
- [ ] Xác nhận branch deploy là bản Phase 55.
- [ ] Không chạy migration: bản vá này chỉ thay đổi truy vấn đọc Dashboard.
- [ ] Ghi lại số liệu Dashboard cũ để đối chiếu: Thực đạt, Hàng trả, Doanh số ròng theo từng NVBH.

## Deploy

```bash
npm ci
npm run check:syntax
npm run docs:check
npm test
npm audit --omit=dev --audit-level=high
```

Deploy lên Render theo quy trình hiện tại.

## Sau deploy

1. Mở Dashboard và nhấn `Ctrl + F5`.
2. Chọn đúng tháng cần kiểm tra.
3. Nhấn `Tải lại` để gọi API với `force=1`.
4. Xác nhận các thẻ mới xuất hiện:
   - Thực đạt tháng;
   - Chờ xác nhận;
   - Hàng trả tháng;
   - Doanh số ròng;
   - Giá trị khuyến mại.
5. Kiểm tra `Thực đạt` chỉ gồm đơn đã xác nhận kế toán.
6. Kiểm tra đơn pending xuất hiện ở `Chờ xác nhận`, không cộng KPI.
7. Chọn ít nhất 3 NVBH và đối chiếu:

```text
Thực đạt = tổng totalAmount/netAmount của đơn đã xác nhận kế toán, đang hiệu lực
Doanh số ròng = Thực đạt - hàng trả đã xác nhận
```

8. Kiểm tra một đơn có hàng khuyến mại:
   - dòng KM không cộng vào Thực đạt;
   - giá trị KM xuất hiện ở cột Khuyến mại.
9. Kiểm tra một đơn đã hủy/xóa không xuất hiện trong tổng.
10. Kiểm tra response `GET /api/dashboard/home?...&force=1`:
    - `sources.sales = mongo:orders:actual-order-value:confirmed`;
    - `sources.pendingSales = mongo:orders:actual-order-value:pending`;
    - xem `dataQuality.warnings` nếu có.

## Tiêu chí nghiệm thu

- [ ] Tổng Thực đạt bằng tổng chứng từ đã xác nhận kế toán.
- [ ] Pending không còn làm tăng Thực đạt.
- [ ] Hàng khuyến mại không còn làm tăng doanh số.
- [ ] Giá thay đổi trong danh mục không làm đổi đơn có snapshot/tổng tiền đã khóa.
- [ ] Đơn hủy/xóa không được tính.
- [ ] Document trùng mã không bị cộng hai lần.
- [ ] Toàn bộ 529 test pass.

## Rollback

Không có migration dữ liệu. Nếu cần rollback, deploy lại artifact Phase 54. Không cần hoàn tác MongoDB.
