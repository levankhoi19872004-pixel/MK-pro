# V45 - Sửa lỗi chữ đè nhau ở khung sản phẩm bên phải

## File đã sửa
- `public/style.css`

## Nguyên nhân
Rule CSS cuối của `#deliveryTodayTab #deliveryReturnItems .mobile-return-line` đã ghi đè layout gốc và đặt `min-height:0!important`, đồng thời khung con `.mobile-return-scroll` tự cuộn bên trong khung cha `#deliveryReturnItems` cũng đang cuộn. Khi nhiều sản phẩm, từng dòng bị nén chiều cao nên chữ và ô `SL trả` chồng lên nhau.

## Cách sửa
- Bỏ cuộn lồng trong `.mobile-return-scroll`, chỉ để khung cha `#deliveryReturnItems` cuộn.
- Ép từng dòng sản phẩm trở lại layout `grid`: `minmax(0,1fr) 96px`.
- Đặt `height:auto`, `min-height:58px`, `overflow:visible` cho từng dòng.
- Đặt `line-height`, `white-space:normal`, `overflow-wrap:anywhere` cho mã, tên sản phẩm và thông tin SL/giá.
- Giữ thiết kế phẳng, chỉ còn đường kẻ mờ giữa các dòng.

## Kết quả mong muốn
Khung bên phải hiển thị danh sách sản phẩm theo từng dòng rõ ràng, không đè chữ, không chồng dòng, chỉ có một thanh cuộn ngoài.
