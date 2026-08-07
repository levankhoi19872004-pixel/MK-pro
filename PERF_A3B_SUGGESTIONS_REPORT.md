# PERF-A3B — Suggestions Search Optimization

## 1. Gate decision

**Status: `PASS_WITH_DEFERRED_RUNTIME`**

- E1 source/static evidence: **PASS**.
- E2 deterministic offline evidence: **PASS**.
- E3 Mongo `explain`, index usage, production p95 and 5xx: **DEFERRED_TO_PERF_A6**.
- Feature flag `PERF_SUGGESTIONS_SEARCH_V1`: **OFF by default**.
- Production data migration/index apply: **NOT PERFORMED**.
- Production p95 claim: **NOT MADE**.

Input ZIP SHA-256: `fb68991248c32603420aa31a5146b9836d8ddb7a1545e5b39bb7bec7fb689e19`  
Final source-tree SHA-256 before packaging artifacts: `ec25c9eca366ed5f6f1f67911e519929ae6d515375a747b5bde9b4424f72a12e`

## 2. Root cause / RED evidence

Legacy `GET /api/new/delivery-today/suggestions` built one unanchored case-insensitive regex from user input and applied it across 13 order/customer/staff fields. The database limit was applied after broad matching, then JavaScript normalized rows, filtered again, deduplicated and ranked.

RED-first result:

- Broad-regex proof: **PASS**.
- GREEN contract before implementation: **expected FAIL** because `DeliverySuggestionSearchService` did not exist.
- Fixture: **10,000 deterministic orders**, seed `PERF-A3B-FIXTURE-V1`.

The old path also had weak diacritic relevance: unaccented `nguyen anh`, `le loi` and `cua hang` could miss accented source values while still scanning a broad candidate space.

## 3. New search contract

### 3.1 Normalization

The optimized reader normalizes:

- Unicode NFKD.
- Lowercase.
- Vietnamese diacritics and `đ/Đ`.
- Trim and collapsed whitespace.
- Canonical order/customer/staff codes.
- Phone digits.
- Maximum four bounded search tokens, maximum 32 characters per token.

Order/customer keyword rules:

- Minimum length: **2** characters.
- Maximum length: **80** characters.
- Output hard limit: **10** suggestions.
- Candidate hard limit: **80** rows.

### 3.2 Ranking

Stable ranking is:

1. Exact order/customer code.
2. Prefix order/customer code.
3. Phone prefix.
4. Customer-name prefix.
5. Bounded token match across normalized name/address.

Ranking uses a stable label/type tie-breaker. Customer and order identities are deduplicated independently.

### 3.3 Scope-first security

Every fast-path query applies active-order and selected scope before search:

- Delivery date key.
- NVBH code.
- NVGH code.
- Customer code when supplied.

A defense-in-depth post-filter revalidates every repository row. Deterministic malicious-repository testing confirmed that an out-of-scope customer is rejected even if the repository returns it.

### 3.4 Regex and ReDoS policy

- Fast path uses normalized equality, escaped anchored prefixes and bounded token matching.
- User input is never executed as an unescaped substring regex.
- Regex metacharacters such as `.*(a+)+$` are treated as literal data.
- Legacy scope aliases use escaped exact/anchored regex only.
- Candidate counts remain hard bounded.

## 4. Legacy fallback and migration strategy

Feature flag OFF preserves the legacy endpoint behavior.

When the feature flag is ON:

1. The reader attempts normalized fields with `suggestSearchVersion=1`.
2. If fewer than the requested results are found, it executes a bounded legacy fallback.
3. Fallback searches escaped raw prefixes and a bounded recent scoped set, then applies the same normalized relevance and scope checks.
4. Legacy `DD/MM/YYYY`, alias NVBH/NVGH and non-backfilled orders remain recoverable.
5. Diagnostics emit either `delivery_suggestions_normalized_fast_path` or `delivery_suggestions_legacy_fallback`, allowing fallback-rate aggregation outside the request process.

A dry-run-first backfill tool was added:

```bash
npm run performance:perf-a3b:backfill:dry
```

Apply requires the explicit contract:

```bash
npm run performance:perf-a3b:backfill
# expands to --apply --confirm-backfill
```

No backfill, migration or index command was run in this gate.

## 5. Logical work comparison

| Case | Legacy rows scanned | Optimized rows inspected | Candidate rows | Repository calls | Reduction |
|---|---:|---:|---:|---:|---:|
| Common keyword `cua hang` | 10,000 | 43 | 40 | 4 | **99.57%** |
| Exact customer code | 10,000 | 510 | 2 | 6 | **94.90%** |

These are deterministic offline logical-row metrics. They are not Mongo `docsExamined`, latency or production p95.

## 6. Relevance and scope evidence

All relevance checks passed:

- Exact customer code first.
- Customer-code prefix.
- Accented/unaccented Vietnamese parity.
- Phone prefix.
- Address tokens.
- Stable ranking.
- Duplicate customer removal.
- Regex-injection input returns no false matches.
- NVBH/NVGH canonical code and diacritic-free name matching.
- Legacy aliases and legacy date fallback.

All scope/security checks passed:

- Customer outside selected staff scope absent.
- In-scope customer present.
- Alternate scope exposes only its own customer.
- Scope applied before search.
- Candidate limit respected.
- Defense-in-depth scope rejection works.

## 7. Frontend request control

`public/js/app/new/91-delivery-today-new.js` now provides:

- Existing 250 ms debounce retained.
- No request for order/customer keyword shorter than two characters.
- `AbortController` cancellation for stale requests.
- In-flight duplicate request suppression.
- Completed-query reuse to avoid issuing the same request repeatedly.
- Selected NVBH/NVGH scope included in customer/order suggestion requests.
- No unrelated UX flow changed.

## 8. Desired indexes

The managed source registry now contains desired indexes for normalized order code, customer code, customer name, phone, token/date and staff-scoped searches.

These are source desired state only. Production existence and actual query-plan usage must be verified with Mongo index audit and `explain("executionStats")` in PERF-A6.

## 9. Test evidence

| Test group | Result |
|---|---:|
| RED-first | 1 PASS / 1 expected FAIL |
| PERF-A3B GREEN | **27/27 PASS** |
| PERF-A1B → PERF-A3B regression | **100/100 PASS** |
| Targeted autocomplete/read-only static regression | **23/23 PASS** |
| JavaScript syntax | **1,632 files PASS** |
| Functional failures | **0** |

### NOT_RUN_DEPENDENCY

- `test/phase91-new-services-contract.test.js`: source ZIP lacks `node_modules/mongoose`.
- `node scripts/build-source-bundles.js --check`: source ZIP lacks `node_modules/terser`.

These are recorded as dependency-limited checks, not functional failures.

## 10. Changed files

- Added: **13**.
- Modified: **6**.
- Deleted: **0**.

Production-impacting files:

- `src/services/delivery/DeliverySuggestionSearchService.js`.
- `src/services/delivery/deliverySuggestionSearchContract.js`.
- `src/services/v2/deliveryTodayNew.service.js`.
- `src/models/SalesOrder.js`.
- `src/services/mongoIndexService.js`.
- `public/js/app/new/91-delivery-today-new.js`.
- `ENVIRONMENT_VARIABLES.md`.
- `package.json`.

Test/tooling files are listed in `PERF_A3B_CHANGED_FILES.json`.

## 11. Rollout and rollback

Release candidate default:

```bash
PERF_SUGGESTIONS_SEARCH_V1=0
```

After backfill and PERF-A6 index/explain verification, canary:

```bash
PERF_SUGGESTIONS_SEARCH_V1=1
```

Immediate rollback:

```bash
PERF_SUGGESTIONS_SEARCH_V1=0
```

No schema migration is required to roll back the reader. Normalized fields are read-model helpers and do not change financial SSoT.

## 12. Conclusion

PERF-A3B satisfies E1/E2 acceptance criteria and is **`PASS_WITH_DEFERRED_RUNTIME`**. Search relevance, scope isolation, duplicate removal, frontend request control and regex/ReDoS defenses are proven offline. Mongo plan quality and production p95 remain deferred to PERF-A6.
