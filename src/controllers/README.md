# controllers

Tầng nhận request/response. Controller không truy cập database trực tiếp.
Luồng chuẩn: route -> controller -> service -> engine/model.

Các API cũ hiện vẫn nằm trong `src/legacy/legacyApp.js` để tránh vỡ frontend.
