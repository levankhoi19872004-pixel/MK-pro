# PHASE79C — Bước 1: Nguyên nhân gốc

## Hiện tượng
Render thất bại trong `npm ci` với `ETIMEDOUT` khi tải `multer-2.2.0.tgz`.

## Nguyên nhân
`package-lock.json` chứa 11 trường `resolved` trỏ tới registry nội bộ `packages.applied-caas-gateway1.internal.api.openai.org`. Host này chỉ tồn tại trong môi trường tạo artifact và không thể truy cập từ Render.

`npm ci --registry=https://registry.npmjs.org/` vẫn có thể dùng URL tuyệt đối trong lockfile, do đó tham số registry của Render không đủ để sửa lỗi.

## Rủi ro phụ
Render đang dùng Node 20.20.2 trong khi package cũ khóa `>=22 <23`.
