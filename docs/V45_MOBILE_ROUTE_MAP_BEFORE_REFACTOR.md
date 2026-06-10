# Mobile route compatibility map after modular mount

Current mount point: `src/routes/index.js` now requires `./mobile` and calls `mobileRoutes.registerMobileRoutes(app)`.

Important: `src/routes/mobile/index.js` mounts compatibility aliases first, then the legacy router as rollback fallback. The old `src/routes/mobileRoutes.js` is kept and not deleted.

## Endpoint comparison

| Method | Endpoint | Legacy mobileRoutes.js | Modular routes/mobile/* | Classification | Note |
|---|---|---:|---|---|---|
| POST | `/cash/submit` | 1 | `src/routes/mobile/delivery.routes.js` | A - both |  |
| GET | `/customers` | 1 | `src/routes/mobile/catalog.routes.js` | A - both |  |
| GET | `/debts` | 1 | - | B - legacy only / fallback kept |  |
| GET | `/delivery-orders` | 1 | - | B - legacy only / fallback kept |  |
| POST | `/delivery/confirm` | 2 | `src/routes/mobile/delivery.routes.js` | A - both | Legacy duplicate count: 2 |
| GET | `/delivery/customer-debts` | 1 | - | B - legacy only / fallback kept |  |
| GET | `/delivery/orders` | 2 | `src/routes/mobile/delivery.routes.js` | A - both | Legacy duplicate count: 2 |
| POST | `/delivery/payment` | 1 | `src/routes/mobile/delivery.routes.js` | A - both |  |
| GET | `/delivery/report` | 0 | `src/routes/mobile/index.js` | C - modular alias only | Compatibility alias added in src/routes/mobile/index.js |
| POST | `/delivery/return` | 2 | `src/routes/mobile/delivery.routes.js` | A - both | Legacy duplicate count: 2 |
| GET | `/delivery/returns` | 1 | `src/routes/mobile/delivery.routes.js` | A - both |  |
| POST | `/delivery/save-money` | 0 | `src/routes/mobile/index.js` | C - modular alias only | Compatibility alias added in src/routes/mobile/index.js |
| POST | `/inventory/rebuild` | 1 | - | B - legacy only / fallback kept |  |
| POST | `/login` | 1 | `src/routes/mobile/auth.routes.js` | A - both |  |
| GET | `/me` | 1 | `src/routes/mobile/auth.routes.js` | A - both |  |
| POST | `/orders` | 0 | `src/routes/mobile/index.js` | C - modular alias only | Compatibility alias added in src/routes/mobile/index.js |
| GET | `/products` | 1 | `src/routes/mobile/catalog.routes.js` | A - both |  |
| POST | `/refresh` | 1 | `src/routes/mobile/auth.routes.js` | A - both |  |
| GET | `/roles` | 1 | `src/routes/mobile/auth.routes.js` | A - both |  |
| GET | `/sales/orders` | 1 | `src/routes/mobile/sales.routes.js` | A - both |  |
| POST | `/sales/orders` | 1 | `src/routes/mobile/sales.routes.js` | A - both |  |
| DELETE | `/sales/orders/:id` | 1 | `src/routes/mobile/sales.routes.js` | A - both |  |
| GET | `/sales/orders/:id` | 1 | `src/routes/mobile/sales.routes.js` | A - both |  |
| PUT | `/sales/orders/:id` | 1 | `src/routes/mobile/sales.routes.js` | A - both |  |
| GET | `/stock` | 1 | `src/routes/mobile/catalog.routes.js` | A - both |  |

## Hard safety decision

- Mount was moved to `./mobile`, but `mobileRoutes.js` remains as legacy fallback inside `src/routes/mobile/index.js`.
- Added aliases: `POST /orders`, `POST /delivery/save-money`, `GET /delivery/report`.
- Added `test/mobile-routes-compat.test.js` to prevent required mobile endpoints from falling through to 404.
- Request logger is disabled under `NODE_ENV=test`; `npm test` now sets that env cross-platform through `scripts/run-tests.js`.

## Audit result

- `xlsx` remains 1 high vulnerability.
- Classification: Direct dependency, Runtime dependency, used only for Excel export/template generation in current grep results; no `XLSX.read`/upload parse found.
- `npm audit fix` cannot fix it because no patched version is available; `--force` was not used.