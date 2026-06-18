# PHASE79A — BƯỚC 1: BASELINE VÀ VÙNG BẢO VỆ

## Mục tiêu

Thiết lập đường cơ sở trước refactor, xác định contract phải giữ nguyên và ngăn các God File tiếp tục tăng kích thước.

## Kết quả khảo sát

- Tổng số file đầu vào: **997**.
- Không có `node_modules`, log runtime hoặc database dump trong ZIP đầu vào.
- Năm vùng Critical được đưa vào phạm vi Phase79A:
  1. `src/services/master-order/masterOrderLegacy.service.js`
  2. `src/services/excelImportService.js`
  3. `public/index.html`
  4. `public/css/00-base.css`
  5. `public/css/10-operational-overrides.css`
- Contract Master Order được chụp tại `test/fixtures/master-order/before-refactor.json`.
- Hash HTML/CSS trước tách được dùng làm characterization baseline.

## Guard đã bổ sung

- `config/source-size-budget.json`: giới hạn kích thước facade, shell và module trích xuất.
- `scripts/check-source-size-budget.js`: quality gate thất bại khi file vượt ngân sách.
- `test/phase79-production-strangler.test.js`: kiểm tra contract export, hash HTML/CSS và giới hạn source.
- Các test helper đọc source tree/HTML lắp ghép để test cũ vẫn kiểm tra đầy đủ logic sau khi tách file.

## Tác động hệ thống

- Không thay đổi schema MongoDB.
- Không thay đổi API endpoint, request/response hoặc trạng thái nghiệp vụ.
- Không chạy migration dữ liệu.

## Rủi ro và kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| Refactor làm mất export cũ | Fixture contract + runtime export test |
| Tách file nhưng logic vẫn tăng trở lại | Source-size budget trong CI |
| Test tĩnh chỉ đọc facade nhỏ và bỏ sót logic | Test-only assembled source adapter |
| Thay đổi ngoài phạm vi | So sánh file/hash với ZIP gốc |

## Trạng thái

**HOÀN THÀNH** — Baseline và guard được thiết lập trước khi chuyển logic.
