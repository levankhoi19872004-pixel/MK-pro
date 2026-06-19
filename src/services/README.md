# Services

Service chứa nghiệp vụ chính của hệ thống:
- kiểm tra điều kiện nghiệp vụ
- tính toán công nợ, giao hàng, trả hàng, nộp quỹ
- gọi repository để đọc/ghi dữ liệu

Service không phụ thuộc trực tiếp Express để sau này dễ test và dễ chuyển Mongo.
