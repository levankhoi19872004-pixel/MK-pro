# MongoDB V43 Setup

Bản này đã được gắn MongoDB theo hướng an toàn cho hệ thống V43.

## 1. Biến môi trường cần cấu hình trên Render

Vào Render → Service → Environment → Add Environment Variable:

```txt
MONGO_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
DB_NAME=kho_minh_khai_v43
```

Có thể dùng `MONGODB_URI` thay cho `MONGO_URI` nếu bạn đã đặt tên biến như vậy.

## 2. Cách lưu dữ liệu

Server dùng collection:

```txt
app_data
```

Document chính:

```txt
_id = kho_v43_main_data
```

Dữ liệu hiện tại trong `data/kho-data.json` sẽ được migrate lên MongoDB trong lần chạy đầu tiên nếu MongoDB chưa có dữ liệu.

## 3. Cơ chế an toàn

- Có MongoDB: đọc/ghi vào MongoDB.
- Chưa cấu hình MongoDB: tự chạy fallback bằng `data/kho-data.json` để không làm sập app khi test local.
- Nếu MongoDB lỗi khi ghi: ghi fallback vào `data/kho-data.json` và log lỗi.

## 4. Start command trên Render

```bash
npm start
```

hoặc:

```bash
node server.js
```

## 5. Kiểm tra kết nối

Mở:

```txt
/api/health
```

Nếu đúng sẽ thấy:

```json
"dataStore": { "mode": "mongo" }
```

Nếu chưa cấu hình biến môi trường sẽ thấy:

```json
"dataStore": { "mode": "json" }
```
