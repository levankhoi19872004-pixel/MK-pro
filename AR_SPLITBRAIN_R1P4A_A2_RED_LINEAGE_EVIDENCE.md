# R1.4a A2 — RED -> GREEN Evidence

## Mandatory REDs written before the production repair-tool fix
File: `test/ar-splitbrain-r1p4a-lineage-preflight.red.test.js`

Initial R1.4 behavior reproduced four failures:
1. v3 forensic predecessor was sourced as version 1 instead of actual v2.
2. Plan items did not carry deterministic sequential AR before/after values.
3. Executor had no DB revalidation API (`revalidateRepairPlan`).
4. Executor had no atomic whole-plan sequence API (`executePlan`).

Initial run summary: **0/4 PASS, 4 FAIL**.

After implementation, the full R1.4a core/safety/B004 group is **11/11 PASS**.

Old REAL plan policy is also executable-tested: internal hash remains valid, but its stale v3 lineage makes DB revalidation return non-safe.

### Captured RED tail
```text
    TestContext.<anonymous> (/mnt/data/mkpro_r1p4a/test/ar-splitbrain-r1p4a-lineage-preflight.red.test.js:83:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
# Subtest: RED R1P4A: multi-item apply is atomic when second event fails
not ok 4 - RED R1P4A: multi-item apply is atomic when second event fails
  ---
  duration_ms: 0.278223
  type: 'test'
  location: '/mnt/data/mkpro_r1p4a/test/ar-splitbrain-r1p4a-lineage-preflight.red.test.js:103:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'undefined'
    - 'function'
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 'function'
  actual: 'undefined'
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/mnt/data/mkpro_r1p4a/test/ar-splitbrain-r1p4a-lineage-preflight.red.test.js:104:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
  ...
1..4
# tests 4
# suites 0
# pass 0
# fail 4
# cancelled 0
# skipped 0
# todo 0
# duration_ms 68.691434
```

### Final GREEN tail
```text
  ---
  duration_ms: 3.539993
  type: 'test'
  ...
# Subtest: R1P4A ambiguous predecessor produces AMBIGUOUS_LINEAGE and is never planned
ok 10 - R1P4A ambiguous predecessor produces AMBIGUOUS_LINEAGE and is never planned
  ---
  duration_ms: 6.572542
  type: 'test'
  ...
# Subtest: R1P4A multi-event executePlan succeeds in sequence and full retry has no duplicate effect
ok 11 - R1P4A multi-event executePlan succeeds in sequence and full retry has no duplicate effect
  ---
  duration_ms: 3.642916
  type: 'test'
  ...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 87.713252
```
