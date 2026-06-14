# PHASE 35 - Bước 7: Loại bỏ Mobile Legacy Routes

## Đã thực hiện
- Xóa vật lý `src/routes/mobileRoutes.js`.
- Xóa flag `ENABLE_LEGACY_MOBILE_ROUTES` khỏi code và ENV mẫu.
- `/api/mobile` chỉ còn modular routes.
- `/api/mobile-legacy` luôn trả HTTP 410, không còn khả năng ghi dữ liệu.
- Bổ sung `retiredRoute.middleware` ghi log `[RETIRED_ROUTE_HIT]` và đếm số client cũ còn truy cập.

## Rollback an toàn
Rollback phải thực hiện bằng deploy lại phiên bản trước, không bật ENV để hồi sinh hai command path trong cùng release.

## Bước tiếp theo
Chạy full quality gate, rà soát dependency/cycle, cập nhật báo cáo tổng và đóng gói ZIP production candidate.
