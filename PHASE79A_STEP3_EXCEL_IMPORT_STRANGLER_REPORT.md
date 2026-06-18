# PHASE79A — BƯỚC 3: EXCEL IMPORT STRANGLER

## Mục tiêu

Tách `excelImportService.js` theo pipeline parse → preview → commit/persistence mà không thay đổi thuật toán import.

## Kết quả

| Chỉ số | Trước | Sau |
|---|---:|---:|
| `excelImportService.js` | khoảng 175 KB / 4.322 dòng | 454 byte / 15 dòng |
| Logic import | 1 God Service | 9 module chính |
| Module lớn nhất | khoảng 175 KB | 38.712 byte |

## Cấu trúc mới

```text
src/services/import/
├── core/
│   ├── importValue.util.js
│   ├── importPersistence.util.js
│   └── importRow.util.js
├── operations/
│   ├── catalogImport.impl.js
│   ├── salesImport.impl.js
│   ├── financeImport.impl.js
│   └── adminImport.impl.js
├── preview/
│   └── importPreview.impl.js
└── importCommit.impl.js
```

## Public API được giữ nguyên

- `buildPreviewFromRows`
- `previewPastedRows`
- `preview`
- `getSessionStatus`
- `getSessionRows`
- `commit`
- `importDirect`
- `logs`

## Kiểm soát dữ liệu

- Các bulk write tồn kho hiện hữu không bị nhân bản hoặc mở rộng.
- Quality gate ghim chính xác theo file + hàm + số lần gọi:
  - `applyInventoryMovementsBulk`
  - `setOpeningStockInventoriesBulk`
  - `importOpeningStock`
- Facade mới không được phép lấy lại dependency `StockTransaction` hoặc `InventoryLegacy`.

## Vùng ảnh hưởng

- Không thay đổi mapping cột, xử lý thùng/lẻ, giá, khuyến mại, khách hàng mới hoặc session import.
- Không thay đổi transaction/commit semantics.
- Không thay đổi collection hoặc index.

## Trạng thái

**HOÀN THÀNH** — Pipeline import được chia theo trách nhiệm và facade cũ vẫn tương thích.
