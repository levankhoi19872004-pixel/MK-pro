# PHASE80B — CHECKLIST TRIỂN KHAI

## Trước triển khai

- [ ] Sao lưu artifact Phase80A đang chạy.
- [ ] Kiểm tra biến môi trường hiện tại, không cần thêm biến mới.
- [ ] Không chạy migration database.
- [ ] Dùng toàn bộ artifact Phase80B, không chép lẻ file generated/source bundle.

## Render

Build Command:

```bash
npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
```

Start Command:

```bash
npm start
```

Khuyến nghị chọn `Manual Deploy → Clear build cache & deploy` để tránh giữ asset JavaScript/CSS cũ.

## Smoke test sau deploy

- [ ] Xuất Excel đơn con: có Quy cách, Giá bán, Giá sau KM.
- [ ] Đối chiếu Giá bán với danh mục sản phẩm.
- [ ] Quy cách hiển thị số như `24`, không hiển thị câu mô tả.
- [ ] Xuất đơn tổng: sheet sản phẩm có Quy cách và Giá bán.
- [ ] Xuất phiếu nhập: vẫn có Giá nhập, đồng thời có Giá bán danh mục.
- [ ] Xuất một báo cáo tồn kho/sản phẩm: có hai cột chuẩn.
- [ ] Mở bản in đơn con: bố cục giấy không thay đổi.
- [ ] Bấm Xuất Excel trong cửa sổ in: hai cột catalog xuất hiện.

## Rollback

Không có migration. Khi cần rollback:

1. Redeploy artifact Phase80A.
2. Clear build cache.
3. Không cần xử lý lại dữ liệu MongoDB.
