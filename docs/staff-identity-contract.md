# Staff Identity Contract

## NVBH canonical fields

- `salesStaffCode`
- `salesmanCode`
- `employeeCode`
- `maNhanVien`

## NVBH canonical names

- `salesStaffName`
- `salesmanName`
- `employeeName`
- `fullName`
- `name`

## NVGH canonical fields

- `deliveryStaffCode`
- `shipperCode`
- `employeeCode`
- `maNhanVien`

## NVGH canonical names

- `deliveryStaffName`
- `shipperName`
- `employeeName`
- `fullName`
- `name`

## Forbidden for business staff matching

- `staffCode`
- `staffName`
- `username`
- `id`
- `_id`

## Allowed usage

- `staffCode` / `staffName`: legacy display/audit only.
- `username`: login/account identity only.
- `id` / `_id`: document identity only, such as `orderId`, `customerId`, `userId`.

Business modules must read NVBH/NVGH through `src/domain/staff/staffIdentity.js` instead of rebuilding fallback chains locally.
