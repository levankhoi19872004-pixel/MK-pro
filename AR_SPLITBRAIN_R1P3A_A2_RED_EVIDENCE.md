# R1P3A A2 — RED Evidence

## Command

`node --test /mnt/data/r1p3a_red_probe.test.js` executed against a clean extraction of the original R1.3 ZIP before modifying the audit script.

## Runtime-resolver evidence

The RED probe loaded the real Delivery return resolver and the real AR posting amount analysis. It printed:

```text
{"delivery":2000,"posting":1500,"snapshotDebt":8000,"canonicalArDebt":8500,"effectiveArReturnAmount":1500,"deviation":500,"classification":"no_mismatch","issues":"","returnIssues":"RETURN_AR_ALIGNED"}
```

The test then asserted that this structural divergence must not classify as `no_mismatch`; R1.3 failed as required.

- BEFORE exit code: 1
- Actual buggy classification: `no_mismatch`
- Actual buggy return issue: `RETURN_AR_ALIGNED`
- Raw AR deviation: 500
- Debt Zero Tolerance: 1000

This proves the source-field conflict was being hidden by the combination of reused posting-selected amount and debt tolerance.
