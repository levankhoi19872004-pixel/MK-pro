# V45 Response Speed Monitor

Đã thêm bộ đo tốc độ phản hồi API trên thanh tiêu đề cho:
- Web quản trị
- App bán hàng mobile
- App giao hàng mobile

## Cách xem
Trên thanh tiêu đề sẽ có ô "Tốc độ":
- Xanh: phản hồi tốt
- Vàng: phản hồi trung bình
- Đỏ: API chậm hoặc lỗi

Di chuột vào ô tốc độ để xem 8 request gần nhất.

## Chỉ số
- API: số request đã đo gần nhất
- TB: thời gian trung bình
- Chậm: số request >= 1000ms hoặc lỗi
- Dòng cuối: API vừa chạy + thời gian ms + HTTP status

## Console
Request chậm sẽ log:
```txt
[V45_SPEED_SLOW]
```

Request bình thường sẽ log:
```txt
[V45_SPEED]
```

Có thể xem toàn bộ bằng:
```js
window.V45SpeedMonitor.getMetrics()
```

Xóa số đo:
```js
window.V45SpeedMonitor.clear()
```

## File đã thêm/sửa
- public/js/utils/v45-speed-monitor.js
- public/index.html
- public/mobile/sales.html
- public/mobile/delivery.html
- public/style.css
- public/mobile/mobile.css
