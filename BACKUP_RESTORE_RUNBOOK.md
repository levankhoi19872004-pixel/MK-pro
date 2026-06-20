# MK-Pro — Backup & Restore Runbook — Prompt 11

## 1. Phạm vi backup

| Thành phần | Cơ chế yêu cầu | Trạng thái bằng chứng Prompt 11 |
|---|---|---|
| MongoDB | Atlas snapshot/PITR và/hoặc logical backup MK-Pro | Atlas: chưa xác minh; logical format/checksum: đã kiểm thử |
| Source | Git remote + release ZIP + SHA-256 + manifest | Manifest/ZIP baseline có bằng chứng; Git commit unavailable trong ZIP |
| Config | `.env.example`, danh mục biến, snapshot/fingerprint config | Có tài liệu; nơi lưu secret production chưa được xác minh |
| Secret | Render/secret manager, quyền hạn, rotate procedure | Không lưu trong Git; trạng thái vận hành thực tế cần owner xác nhận |
| Export/import cần giữ | Persistent storage hoặc external object storage | Chính sách production chưa được xác minh |
| Runbook | Lưu cùng release và bản sao ngoài app host | Có trong Prompt 11 |

## 2. Logical backup MK-Pro

API quản trị tạo backup dùng format `mk-pro-backup-v2`, gzip, SHA-256 sidecar, mode file hạn chế, release metadata và integrity digest kỹ thuật.

Các bước:

1. Chỉ admin gọi chức năng backup trong cửa sổ kiểm soát.
2. Ghi `fileName`, `createdAt`, `sizeBytes`, SHA-256, release ID và counts.
3. Gọi verify; yêu cầu checksum, gzip/JSON, collection presence/count và integrity PASS.
4. Sao chép file `.json.gz` và `.sha256` ra kho ngoài Render host.
5. Không gửi backup qua chat/email không mã hóa.

Integrity kỹ thuật theo dõi tổng tồn, AR balance, fund balance và count đơn/return. Đây là control phát hiện thay đổi, không thay thế báo cáo nghiệp vụ chính thức.

## 3. Atlas backup/PITR

Owner phải xác nhận trên Atlas:

- backup enabled;
- snapshot frequency/retention;
- PITR availability;
- project/cluster lưu snapshot;
- người có quyền restore;
- cảnh báo backup failure;
- có bản sao/strategy ngoài failure domain chính hay không.

Không đánh dấu “đã có” chỉ dựa vào việc dùng Atlas. Chụp evidence không chứa credential và lưu trong release ticket.

## 4. Retention đề xuất — chưa tự áp dụng

- Daily: 7–14 bản.
- Weekly: 4–8 bản.
- Monthly: 6–12 bản.
- Release backup: giữ theo vòng đời audit nội bộ.

Owner phải duyệt theo dung lượng, RPO/RTO và yêu cầu kế toán. Prompt 11 không thay policy production.

## 5. Restore drill MongoDB cô lập

### Safety gates trong script

- Bắt buộc `RESTORE_DRILL_MONGODB_URI`.
- URI không được trùng `MONGO_URI/MONGODB_URI`.
- Tên database phải chứa `restore`, `drill`, `staging`, `test` hoặc `sandbox`.
- Bắt buộc `RESTORE_DRILL_CONFIRM=ISOLATED_NON_PRODUCTION_DB`.
- Từ chối database không rỗng trừ khi chủ động bật `RESTORE_DRILL_ALLOW_REPLACE=true`.
- Không nhận path traversal ở tên backup.

### Lệnh

```bash
export RESTORE_DRILL_MONGODB_URI='mongodb+srv://USER:PASSWORD@CLUSTER/mkpro_restore_drill'
export RESTORE_DRILL_CONFIRM='ISOLATED_NON_PRODUCTION_DB'
export RESTORE_DRILL_BACKUP_DIR='/secure/verified-backups'

npm run restore:drill -- \
  --backup=backup-YYYY-MM-DDTHH-MM-SS-Z.json.gz \
  --output=RESTORE_DRILL_MONGODB_RESULT.json
```

### Chuỗi xác minh

1. Verify checksum/format/count/integrity.
2. Kết nối DB cô lập.
3. Xác nhận target rỗng hoặc có phê duyệt replace.
4. Restore toàn bộ logical collections.
5. Ensure indexes.
6. Reload snapshot và so integrity.
7. Chạy reconciliation stock/AR/fund ở môi trường drill.
8. Smoke-read products, customers, users, salesOrders, returnOrders, inventories, arLedgers, fundLedgers.
9. Ghi duration/RTO observed và RPO dựa trên thời điểm backup.
10. Không promote database drill thành production bằng đổi URI tùy tiện.

## 6. Kết quả Prompt 11

- Offline logical restore: PASS, 64 collections, 8 fixture documents, 53 ms, checksum và integrity khớp.
- MongoDB restore: chưa chạy do không có URI staging/local mongod. Nỗ lực dùng memory server bị chặn khi tải binary bởi DNS `EAI_AGAIN`.
- Vì vậy backup **chưa được chứng minh khôi phục trên MongoDB thật** và gate Prompt 12 vẫn đóng.

## 7. Restore production khi sự cố thật

1. Declare incident, dừng hoặc hạn chế write.
2. Chụp artifact/config/log/job state hiện tại.
3. Xác định recovery point và dữ liệu sẽ mất theo RPO.
4. Restore vào cluster/database mới trước, không đè trực tiếp.
5. Chạy cùng toàn bộ verify/index/reconciliation/smoke-read.
6. Kiểm tra người dùng/role và secret không nằm trong backup output công khai.
7. Đổi app sang database đã xác minh theo change record.
8. Theo dõi và đối chiếu chứng từ sau cutover.
9. Giữ database cũ read-only cho điều tra theo policy.

Không tự viết script sửa ledger trong quá trình restore.
