# PHASE 75 — DEPLOYMENT CHECKLIST

## Trước deploy

- [ ] Backup phiên bản production hiện tại.
- [ ] Xác nhận MongoDB không cần migration.
- [ ] Xác nhận `public/css/95-report-center-popup.css` được commit.
- [ ] Xác nhận cache bust trong `public/index.html` là `phase75-report-popup-reward-v1`.
- [ ] Chạy targeted tests trong `PHASE75_TARGETED_TEST_OUTPUT.txt`.

## Sau deploy

- [ ] Đăng nhập bằng admin/manager/accountant.
- [ ] Click menu **Báo cáo** và xác nhận popup tự mở.
- [ ] Đóng popup bằng nút Đóng.
- [ ] Mở lại popup bằng nút `Mở trung tâm báo cáo`.
- [ ] Đóng bằng Escape và click nền tối.
- [ ] Chuyển tab khi popup đang mở và xác nhận màn hình không bị khóa scroll.
- [ ] Trong nhóm Công nợ, mở **Khách hàng đã trả thưởng**.
- [ ] Chọn kỳ có bút toán `AR-BONUS` và đối chiếu tổng tiền với `arLedgers`.
- [ ] Tìm theo mã/tên khách hàng.
- [ ] Xuất Excel báo cáo theo bộ lọc hiện tại.
- [ ] Đăng nhập vai trò warehouse/sales và xác nhận báo cáo trả thưởng không xuất hiện.

## Rollback

Rollback toàn bộ artifact Phase 75 về Phase 74. Không cần rollback database vì Phase 75 không ghi schema hoặc migration.
