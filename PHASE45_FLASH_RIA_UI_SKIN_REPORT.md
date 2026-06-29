# MK-Pro Phase45 — Flash/RIA UI Skin Layer Report

## 1. Tổng quan UI hiện tại

Baseline: `MK-pro-phase44-profiler-performance-optimized-patched(2).zip`.

Frontend hiện tại là HTML/CSS/Vanilla JS phục vụ từ `public/` qua Express static và index page renderer.

### Cấu trúc frontend chính

- Admin/desktop:
  - Shell: `public/index.shell.html`
  - Body fragments: `public/fragments/index/*.html`
  - CSS chính: `public/css/base/*.css`, `public/css/*.css`
  - JS chính: `public/js/app/*.js`, `public/app.js`
- Login web:
  - `public/login.html`
- Mobile bán hàng:
  - `public/mobile/sales.html`
  - `public/mobile/mobile.css`
  - `public/mobile/mobile.source/*.css`
  - `public/mobile/js/sales*.js`
- Mobile giao hàng:
  - `public/mobile/delivery.html`
  - `public/mobile/js/delivery*.js`
  - `public/mobile/js/delivery-mobile-view*.js`

### Nhận xét

UI phase44 đã có cấu trúc chia CSS/JS khá tốt, nhiều module nghiệp vụ đã tách file. Vì vậy không nên đại tu HTML/JS. Hướng phù hợp là thêm một lớp theme skin an toàn, có thể rollback nhanh.

## 2. Vấn đề UI/UX chính trước phase45

- Giao diện admin đang thiên về ERP truyền thống, chưa có cảm giác Rich Internet Application.
- Dashboard/card/table nhìn rõ nhưng chưa tạo chiều sâu thị giác cao.
- Button/input/modal còn phẳng, ít micro-interaction.
- Mobile cần giữ nhẹ, nhưng vẫn có thể nâng cảm giác premium bằng màu, card, button và badge.
- Không nên đưa hiệu ứng nặng vào table lớn hoặc mobile field app.

## 3. Phương án A/B

### Phương án A — Flash UI Design System production-grade

- Tạo design system đầy đủ, refactor class ở nhiều màn hình.
- Áp dụng đồng bộ toàn bộ admin/mobile.
- Effort: Hard.
- Lợi ích: nhất quán cao, dễ mở rộng dài hạn.
- Rủi ro: phạm vi rộng, dễ ảnh hưởng HTML/JS hiện tại nếu refactor class/id quá tay.

### Phương án B — Flash Skin Layer an toàn

- Thêm CSS theme layer phủ lên UI hiện tại.
- Không đổi JS, API, route, schema.
- Không đổi flow app bán hàng/giao hàng.
- Effort: Medium.
- Lợi ích: nhanh thấy giao diện đẹp hơn, rollback dễ, ít rủi ro nghiệp vụ.
- Rủi ro: chưa đồng bộ tuyệt đối ở mọi màn hình rất sâu, nhưng đủ an toàn cho production.

## 4. Phương án đã chọn

Chọn **Phương án B — Flash Skin Layer an toàn**.

Lý do:

- MK-Pro là phần mềm vận hành thật, ưu tiên không phá nghiệp vụ.
- Phase44 đã có nhiều module quan trọng; không nên refactor HTML/JS diện rộng.
- App giao hàng đã chốt flow, chỉ nên thay màu/card/button/badge nhẹ.
- Cách này rollback bằng cách gỡ 2 file CSS và 5 link HTML.

## 5. File đã thêm

1. `public/css/00-flash-ria-theme.css`
   - Theme Flash/RIA cho admin web và login web.
   - Gồm CSS variables, glass card, glossy button, table skin, modal animation, badge glow.

2. `public/mobile/mobile-flash-ria.css`
   - Theme Flash/RIA bản nhẹ cho mobile bán hàng/giao hàng/login.
   - Giảm blur/shadow/animation so với desktop để tránh lag trên máy yếu.

## 6. File đã sửa

1. `public/index.shell.html`
   - Thêm link CSS admin Flash/RIA sau các CSS hiện có.

2. `public/login.html`
   - Thêm link CSS admin Flash/RIA sau inline login style để override an toàn.

3. `public/mobile/sales.html`
   - Thêm link `mobile-flash-ria.css`.

4. `public/mobile/delivery.html`
   - Thêm link `mobile-flash-ria.css`.

5. `public/mobile/login.html`
   - Thêm link `mobile-flash-ria.css`.

## 7. File đã xóa

Không xóa file nào.

## 8. Diff tóm tắt Old/New

### Old

- UI admin dùng nền sáng/ERP truyền thống.
- Card/table/button/modal ít chiều sâu.
- Mobile vẫn là layout nghiệp vụ sáng, đơn giản.

### New

- Admin có Futuristic Slate/Cyber DMS background.
- Header/sidebar/card/table/modal dùng glassmorphism có kiểm soát.
- Button có glossy overlay, hover scale nhẹ, active scale 0.96.
- Modal/panel có animation elastic nhẹ.
- Table có header slate, hover glow nhẹ nhưng không animate từng cell nặng.
- Mobile có Flash/RIA lite: card tối, button gradient, badge glow, giảm blur ở màn hình nhỏ.
- Có `prefers-reduced-motion` để tắt animation cho người dùng/máy yếu.

## 9. Design system Flash mới

### Token chính

- `--mk-bg-main`
- `--mk-bg-panel`
- `--mk-border-soft`
- `--mk-cyan`
- `--mk-green`
- `--mk-orange`
- `--mk-red`
- `--mk-violet`
- `--mk-text-main`
- `--mk-text-muted`
- `--mk-radius-card`
- `--mk-radius-button`
- `--mk-ease-flash`

### Component class mới

Đã bổ sung class tái sử dụng cho các phase sau:

- `.mk-flash-shell`
- `.mk-glass-card`
- `.mk-flash-header`
- `.mk-flash-sidebar`
- `.mk-kpi-card`
- `.mk-glossy-btn`
- `.mk-btn-primary`
- `.mk-btn-warning`
- `.mk-btn-danger`
- `.mk-input`
- `.mk-select`
- `.mk-table`
- `.mk-status-badge`
- `.mk-modal`
- `.mk-slide-panel`
- `.mk-toast`
- `.mk-timeline`
- `.mk-mobile-card`

### Animation mới

- `mkElasticIn`
- `mkPanelSlideIn`
- `mkFadeSlideOut`
- `mkGlowPulse`
- `mkShimmer`
- `mkMobileElasticIn`
- `mkMobileGlow`

## 10. Ảnh hưởng đến dashboard/admin

- Dashboard hero và KPI card có nền glass/gradient.
- Sidebar/tab có trạng thái active glow.
- Table chuyển sang slate theme, giữ độ tương phản.
- Form/input/select/button được nâng cấp visual.
- Modal/popup có nền tối, backdrop blur và elastic animation.
- Không đổi HTML nghiệp vụ, không đổi JS event/query selector.

## 11. Ảnh hưởng đến app bán hàng

- Card khách hàng/giỏ hàng/sản phẩm có nền tối hiện đại.
- Button chính chuyển gradient xanh/cyan dễ nhận biết.
- Badge/tab bottom navigation có glow nhẹ.
- Không đổi flow chọn khách → đặt hàng → giỏ hàng → xác nhận.
- Không thêm animation nặng.

## 12. Ảnh hưởng đến app giao hàng

- Màn hình giao hàng dùng mobile Flash/RIA lite.
- Card, button, badge, sticky/header được nâng cấp nhẹ.
- Không thêm lại GPS/Tuyến giao.
- Không đổi flow giao hàng đã chốt.
- Không đổi JS render delivery.

## 13. Kết quả test thực tế

Đã chạy trong môi trường sandbox:

```bash
npm install
npm run check:syntax
npm run check:source-bundles
node -e "assemble index page smoke"
```

Kết quả:

- `npm install`: PASS.
- `npm run check:syntax`: PASS — `SYNTAX_OK 985 JavaScript files`.
- `npm run check:source-bundles`: PASS — `[source-bundles] OK 19 bundles`.
- Assemble index page smoke: PASS — phát hiện link `/css/00-flash-ria-theme.css`, HTML assembled dài 171905 bytes.

Các lệnh có cảnh báo/fail không liên quan trực tiếp đến thay đổi CSS phase45:

- `npm run check:source-size`: FAIL do baseline JS mobile vượt budget:
  - `public/mobile/js/delivery-mobile-view.js: 61486 bytes > budget 61440`
  - `public/mobile/js/delivery-mobile-view.source.js: 79222 bytes > budget 77824`
- `npm test`: FAIL do test suite hiện có chứa failure/budget gate không liên quan CSS phase45. Phase45 không sửa các file JS này.
- `npm run check:production`: FAIL do sandbox không có production env thật:
  - thiếu `JWT_SECRET`
  - thiếu `JWT_REFRESH_SECRET`
  - thiếu `MONGO_URI/MONGODB_URI`
  - chưa set `NODE_ENV=production`, `PUBLIC_APP_ORIGIN`, `TRUST_PROXY`, `BACKUP_DIR`
- `npm run build`: FAIL vì `package.json` không có script `build`.

## 14. Rủi ro còn lại

1. Theme tối có thể cần tinh chỉnh thêm ở một số modal rất sâu nếu module đó có CSS riêng mạnh hơn.
2. Một số bảng Excel/paste/import có thể cần kiểm tra thị giác thủ công trên browser thật.
3. Mobile app nên test trên LDPlayer/điện thoại thực tế để cân bằng độ tương phản ngoài hiện trường.
4. Test suite baseline đang có failure ngoài phạm vi CSS; cần xử lý ở phase riêng nếu muốn gate full xanh.

## 15. Rollback

Rollback nhanh bằng cách:

1. Xóa link `/css/00-flash-ria-theme.css` khỏi:
   - `public/index.shell.html`
   - `public/login.html`
2. Xóa link `./mobile-flash-ria.css` khỏi:
   - `public/mobile/sales.html`
   - `public/mobile/delivery.html`
   - `public/mobile/login.html`
3. Có thể giữ hoặc xóa 2 file CSS mới.

Không cần rollback database/API vì phase45 không thay đổi backend/schema/data.

## 16. Kết luận

Phase45 đã chuyển MK-Pro sang hướng Flash/RIA bằng skin layer an toàn, không đụng business logic. Đây là bước phù hợp để nâng giá trị cảm nhận của phần mềm mà vẫn giữ ổn định production.
