# Phase260H - Warehouse Login App Target Contract Report

## Executive summary

Phase260H implements a single browser-safe App Target Contract for the shared login target list, labels, URLs, allowed roles, select rendering, quick links, and role/target tests. The common login screen now exposes four targets: web, sales, delivery, and warehouse. Warehouse users can choose "App thủ kho" and are directed to `/mobile/warehouse.html`; admin is allowed by the same contract. Unauthorized roles fail closed before navigation, while existing backend warehouse guards remain unchanged.

Scoped Phase260H result: PASS. Full `npm test` was executed and returned exit code 1 due to unrelated baseline failures outside Phase260H.

## Root cause

The shared login page had three independent hard-coded surfaces:

- Static `<option>` entries in `public/login.html`.
- Static quick links in `public/login.html`.
- Role and URL logic in `public/js/auth-login.js`.

The warehouse app and backend route existed, but the login target matrix did not include `warehouse`. Unknown targets also fell back to `/`, which was not fail-closed.

## Architecture before

- `public/login.html` maintained a three-target select and three quick links.
- `public/js/auth-login.js` duplicated role and target URL decisions.
- `public/mobile/js/auth.js` separately hard-coded role home URLs.
- Backend `/api/mobile/warehouse/*` routes already used `requireMobileLogin` and `requireMobileRole(['warehouse'])`.

## Architecture after

- `public/js/app-target-contract.js` is the single client-side source of truth.
- `public/login.html` loads the contract before `auth-login.js`.
- `auth-login.js` renders select options and quick links from the contract.
- `auth-login.js` calls `canRoleOpenTarget()` and `getTargetUrl()` from the contract.
- `public/mobile/js/auth.js` resolves role home URLs through the same contract.
- Backend warehouse route guards are preserved.

## App Target Contract

Targets:

| Key | Label | URL | Allowed roles |
| --- | --- | --- | --- |
| web | Phần mềm quản trị | `/` | admin, manager, accountant, warehouse |
| sales | App bán hàng | `/mobile/sales.html` | admin, sales |
| delivery | App giao hàng | `/mobile/delivery.html` | admin, delivery |
| warehouse | App thủ kho | `/mobile/warehouse.html` | admin, warehouse |

Helpers:

- `getAppTarget(targetKey)`
- `canRoleOpenTarget(role, targetKey)`
- `getTargetUrl(targetKey)`
- `listVisibleTargets()`
- `listSelectTargets()`
- `listQuickLinkTargets()`

Security behavior:

- Roles are trimmed and lowercased before comparison.
- Unknown roles fail closed.
- Unknown targets fail closed.
- URLs are taken only from the internal contract.
- No eval or dynamic code execution.
- No query string target URL or open redirect behavior.

## Role target matrix

| Role | web | sales | delivery | warehouse |
| --- | --- | --- | --- | --- |
| admin | yes | yes | yes | yes |
| manager | yes | no | no | no |
| accountant | yes | no | no | no |
| warehouse | yes | no | no | yes |
| sales | no | yes | no | no |
| delivery | no | no | yes | no |

Negative cases verified:

- Empty role
- Unknown role
- Partial role name such as `sale` or `salesman`
- Empty target
- Unknown target
- Target with unusual characters

## Files changed

- `public/login.html`
- `public/js/auth-login.js`
- `public/mobile/login.html`
- `public/mobile/js/auth.js`

## Files created

- `public/js/app-target-contract.js`
- `test/phase260h-warehouse-login-app-target-contract.test.js`
- `PHASE260H_TEST_EVIDENCE.json`
- `PHASE260H_WAREHOUSE_LOGIN_APP_TARGET_CONTRACT_REPORT.md`
- `RELEASE_MANIFEST.json`

## Security assessment

Backend authorization remains the security boundary. Warehouse business endpoints still use `requireMobileLogin` and `requireMobileRole(['warehouse'])`; existing middleware behavior lets admin pass. Client-side navigation checks are UX hardening only and do not replace backend guards.

No changes were made to:

- User schema
- Role names
- Login API
- JWT structure
- Session lifetime
- Cookie policy
- Warehouse, return, inventory, AR, fund, closeout, or accounting business logic

## Test commands

| Command | Exit | Pass | Fail | Skip |
| --- | ---: | ---: | ---: | ---: |
| `node --test test/phase260h-warehouse-login-app-target-contract.test.js` | 0 | 7 | 0 | 0 |
| `npm run check:syntax` | 0 | 1558 JS syntax files | 0 | 0 |
| `node --test test/access-cookie-csrf-security.test.js test/refresh-token-cookie-security.test.js test/web-auth-rate-limit-static.test.js test/web-auth-fetch-boundary-static.test.js test/mobile-routes-compat.test.js test/mobile-modular-route-boundary-behavior.test.js test/role-catalog-consistency.test.js` | 0 | 13 | 0 | 0 |
| `npm test` | 1 | 2019 | 45 | 3 |

## Full regression notes

Full regression executed. It failed on unrelated baseline areas outside Phase260H, including trust proxy static ordering, AR/global access governance, Debt New UI static expectations, Delivery Today UI selection tests, enterprise/global governance, Phase246/247 release governance, sales-order cancel tests, artifact verifier, and source-size budget. These were not modified because Phase260H explicitly forbids broad fixes in finance, stock, sales-order lifecycle, release governance, or unrelated UI areas.

## Intentional non-changes

- Did not change `src/routes/mobile/warehouse.routes.js`.
- Did not change `src/mobile/mobileContext.js`.
- Did not change `src/routes/authRoutes.js`.
- Did not change `src/models/User.js`.
- Did not change warehouse return-check services/controllers.
- Did not change inventory, AR, fund, closeout, delivery confirmation, accounting confirmation, KPI, report center, or Phase260G financial component identity logic.

## Risks remaining

- Existing full-suite failures remain outside this phase.
- The client-side contract prevents wrong target navigation in the login UI, but direct API access still depends on backend guards as designed.

## Rollback

Revert these files:

- `public/js/app-target-contract.js`
- `public/login.html`
- `public/js/auth-login.js`
- `public/mobile/login.html`
- `public/mobile/js/auth.js`
- `test/phase260h-warehouse-login-app-target-contract.test.js`
- `PHASE260H_TEST_EVIDENCE.json`
- `PHASE260H_WAREHOUSE_LOGIN_APP_TARGET_CONTRACT_REPORT.md`
- `RELEASE_MANIFEST.json`

## Conclusion

PASS for Phase260H scoped acceptance. Full regression is recorded as FAIL due to unrelated baseline failures.
