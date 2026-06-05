# Controllers

Controller chỉ xử lý HTTP request/response:
- đọc `req.query`, `req.body`, `req.mobileUser`
- gọi service tương ứng
- trả JSON/status code

Không viết nghiệp vụ, không đọc/ghi database trực tiếp trong controller.
