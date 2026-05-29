# Routes layer - Phase 2

PHASE 2 đã chuẩn hóa thư mục routes/services/models để tách dần `server.js` theo Clean Architecture.
Hiện server vẫn giữ API cũ để tránh vỡ frontend/mobile, nhưng dữ liệu nghiệp vụ đã được gom về Mongo models trong `src/models/index.js` và lớp đồng bộ ở `src/services/mongoSyncService.js`.

Lộ trình phase sau: tách từng nhóm API từ `server.js` sang router riêng: products, customers, orders, debts, mobile.
