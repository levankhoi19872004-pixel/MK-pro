# MK-Pro — Restore Drill Result — Prompt 11

## Kết luận

- **Offline logical restore simulation:** `PASS`.
- **Restore thật vào MongoDB staging/test cô lập:** `NOT EXECUTED`.
- **Production touched:** `NO`.
- **Gate chuyển Prompt 12:** chưa đạt cho tới khi chạy `scripts/restore-drill.js` trên một MongoDB staging/test riêng bằng backup đại diện.

## Bằng chứng đã chạy

| Kiểm tra | Kết quả |
|---|---:|
| Backup format | `mk-pro-backup-v2` |
| Checksum sidecar | PASS |
| Integrity digest | PASS |
| Logical collections | 64 |
| Documents fixture | 8 |
| Duration | 53 ms |
| Inventory technical total | 12 |
| AR technical total | 8000 |
| Fund technical total | 2000 |

Lệnh đã chạy:

```bash
npm run restore:drill:offline -- --output=artifacts/prompt11-after/RESTORE_DRILL_OFFLINE_RESULT.json
```

## Nỗ lực chạy MongoDB cô lập

Đã cài `mongodb-memory-server` **ngoài source tree** để không thêm dependency cho MK-Pro. Việc tải binary `mongod` từ `fastdl.mongodb.org` thất bại do DNS `EAI_AGAIN`; máy chạy cũng không có `mongod`, Docker hoặc URI staging được cấp. Vì vậy không có bằng chứng trung thực cho index creation, Mongoose model restore và reconciliation trên MongoDB thật.

Không sử dụng MongoDB production, credential thật hoặc restore đè dữ liệu đang vận hành.

## Lệnh bắt buộc phải chạy tại staging trước Prompt 12

```bash
export RESTORE_DRILL_MONGODB_URI='mongodb+srv://.../mkpro_restore_drill'
export RESTORE_DRILL_CONFIRM='ISOLATED_NON_PRODUCTION_DB'
export RESTORE_DRILL_BACKUP_DIR='/secure/path/to/verified-backups'

npm run restore:drill -- \
  --backup=backup-YYYY-MM-DDTHH-MM-SS-Z.json.gz \
  --output=RESTORE_DRILL_MONGODB_RESULT.json
```

Chỉ phê duyệt khi JSON kết quả có `ok=true`, `productionTouched=false`, integrity khớp, index hoàn tất, reconciliation không có mismatch chưa giải thích và smoke-read đủ collection chính.
