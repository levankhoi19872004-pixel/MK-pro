# MK-Pro Content Security Policy

## Mục tiêu

CSP được triển khai theo hai giai đoạn để giảm rủi ro làm hỏng giao diện đang vận hành:

1. `CSP_MODE=report-only` — mặc định, ghi nhận vi phạm nhưng chưa chặn.
2. `CSP_MODE=enforce` — bật chặn sau khi staging/canary không còn vi phạm chưa xử lý.

Có thể tắt khẩn cấp bằng `CSP_MODE=off`. Đây chỉ là cơ chế rollback vận hành, không phải cấu hình production dài hạn.

## Policy mặc định

```text
default-src 'self';
script-src 'self';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
media-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
manifest-src 'self';
report-uri /csp-report
```

Trang `/api/docs` chỉ bổ sung origin cụ thể đang được Swagger UI sử dụng:

```text
script-src 'self' https://unpkg.com
style-src 'self' 'unsafe-inline' https://unpkg.com
```

Không có:

- `unsafe-eval`;
- wildcard origin `*`;
- inline JavaScript exception;
- inline event handler exception.

## Ngoại lệ còn lại

`style-src 'unsafe-inline'` vẫn được giữ tạm thời vì frontend hiện còn inline style và cập nhật `element.style` ở nhiều màn hình. Ngoại lệ này chỉ áp dụng cho CSS, không cho JavaScript. Việc loại bỏ cần một giai đoạn CSS riêng để tránh làm vỡ layout.

Các popup in sử dụng `document.write()` để ghi một tài liệu HTML hoàn chỉnh vào cửa sổ in riêng. Nguồn HTML vẫn phải qua template/escaping hiện có; CSP chính không được dùng làm lý do bỏ kiểm soát dữ liệu.

## CSP report endpoint

```text
POST /csp-report
```

- Không yêu cầu đăng nhập để trình duyệt có thể gửi violation report.
- Body limit: `64kb`.
- Rate limit mặc định: `120 request/phút/IP`.
- Cấu hình: `CSP_REPORT_RATE_LIMIT_MAX`.
- Dữ liệu log được chuẩn hóa, bỏ CR/LF/NUL và giới hạn chiều dài.

## Quy trình rollout

### Bước 1 — Report-only

```env
CSP_MODE=report-only
CSP_REPORT_RATE_LIMIT_MAX=120
```

Theo dõi log `event=csp_violation`, đặc biệt các directive:

- `script-src`;
- `script-src-attr`;
- `connect-src`;
- `style-src`.

### Bước 2 — Staging enforcement

Điều kiện chuyển bước:

- không còn vi phạm `script-src` hoặc `script-src-attr` trên các luồng đăng nhập, khách hàng, bán hàng, trả hàng, công nợ, quỹ, báo cáo và mobile;
- nguồn external cần thiết đã được allowlist chính xác;
- test browser staging đạt.

```env
CSP_MODE=enforce
```

### Bước 3 — Production canary

Bật enforcement trên một instance/canary trước. Theo dõi lỗi frontend và CSP report. Không tăng quyền bằng wildcard hoặc `unsafe-eval` để xử lý nhanh một violation.

### Rollback vận hành

```env
CSP_MODE=report-only
```

Nếu cần khẩn cấp:

```env
CSP_MODE=off
```

Sau rollback phải lưu lại violation và sửa nguồn, không để `off` thành cấu hình thường trực.
