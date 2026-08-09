# R1.2 Debt New Zero-Tolerance Consistency

B0041181 public list + suggestion path is reverified with the actual correction event writer and actual Debt New service; only persistence/model boundaries are faked because Mongoose cannot be installed in this environment.

Final invariant for the same order projection:
`debt === debtAmount === remainingDebt` after Debt Zero Tolerance normalization.

Verified boundaries through actual event writer + Debt New grouping:
- raw 0 -> 0
- raw 999 -> 0
- raw 1000 -> 0
- raw 1001 -> 1001

B0041181: raw canonical debt 85 -> list debt 0, order debt 0, remainingDebt 0, suggestion debtAmount 0, subLabel does not display 85.

The fix does not read OrderPaymentAllocation as debt SSoT and does not broaden tolerance.
