# PHASE 56 — DEPLOYMENT & ACCEPTANCE CHECKLIST

## A. Trước khi deploy

- [ ] Backup MongoDB production.
- [ ] Ghi nhận số tồn hiện tại của 5 mã hàng mẫu.
- [ ] Ghi nhận công nợ của 3 khách hàng mẫu.
- [ ] Ghi nhận số dư tiền mặt/ngân hàng hiện tại.
- [ ] Không chạy script rebuild tồn kho trong quá trình deploy.

## B. Quality gate

```bash
npm ci
npm run check:syntax
npm run docs:check
node --test --test-force-exit --test-concurrency=4 --test-shard=1/4
node --test --test-force-exit --test-concurrency=4 --test-shard=2/4
node --test --test-force-exit --test-concurrency=4 --test-shard=3/4
node --test --test-force-exit --test-concurrency=4 --test-shard=4/4
npm audit --omit=dev --audit-level=high
```

Kỳ vọng: 535/535 test pass, OpenAPI 259 operations, 0 vulnerabilities mức high trở lên.

## C. Triển khai

- [ ] Deploy mã nguồn Phase 56.
- [ ] Không cần migration MongoDB.
- [ ] Khởi động lại service.
- [ ] Mở trình duyệt và nhấn `Ctrl + F5`.

## D. Nghiệm thu tồn kho

- [ ] “Xuất tồn kho hiện tại” không phụ thuộc ngày đang chọn.
- [ ] `Tồn vật lý - Đã giữ chỗ = Tồn khả dụng` trên các mã có reservedQty.
- [ ] “Xuất nhập - xuất - tồn” có đủ Tồn đầu/Tổng nhập/Tổng xuất/Tồn cuối.
- [ ] Kiểm tra công thức `Tồn đầu + Nhập - Xuất = Tồn cuối`.
- [ ] Reversal trả hàng/nhập hàng âm nằm ở chiều xuất, không bị cộng dương.
- [ ] Thẻ kho bắt đầu bằng tồn đầu kỳ, không bắt đầu từ 0.
- [ ] Kiểm tra cột `Chênh lệch đối soát`; nếu khác 0, khoanh vùng dữ liệu lịch sử trước khi can thiệp.

## E. Nghiệm thu bán hàng và trả hàng

- [ ] Báo cáo bán hàng chỉ có đơn đã xác nhận kế toán.
- [ ] Hàng khuyến mại không cộng vào số lượng bán/doanh số thực tế.
- [ ] Đơn giảm 100% giữ doanh số thực tế bằng 0.
- [ ] Thay đổi giá sản phẩm hiện tại không làm đổi giá trị đơn đã có snapshot.
- [ ] Báo cáo trả hàng chỉ có phiếu đã xác nhận/post AR.
- [ ] Giá trị trả hàng khớp AR-RETURN hoặc thể hiện rõ fallback chứng từ.

## F. Nghiệm thu công nợ và quỹ

- [ ] Báo cáo công nợ có Dư đầu kỳ, Phát sinh Nợ, Tiền thu, Trả hàng, Điều chỉnh, Dư cuối kỳ.
- [ ] Sổ chi tiết bắt đầu từ dư trước kỳ của từng khách.
- [ ] “Đã thu” không gom trả hàng/chiết khấu vào tiền thu.
- [ ] Báo cáo quỹ tách tiền mặt/ngân hàng và từng account.
- [ ] `Tồn đầu + Thu - Chi = Tồn cuối` cho từng quỹ.

## G. Nghiệm thu giao hàng

- [ ] Số đơn/tổng tiền được tính từ đơn con còn hiệu lực.
- [ ] Đơn con đã tháo khỏi đơn tổng không còn được tính.
- [ ] Tiền thu khớp `fundLedgers`.
- [ ] Cột lệch snapshot giúp phát hiện dữ liệu đơn tổng cũ.

## H. Rollback

Rollback code về Phase 55 nếu API lỗi. Không rollback/xóa dữ liệu vì Phase 56 không ghi migration. Dashboard report có thể tạm gọi `mode=legacy` để so sánh, nhưng không dùng số legacy làm số liệu kế toán chính thức.
