# R1P3A A1 — Canonical Return Amount Contract Audit

## Verified runtime selection contracts

### Delivery canonical return resolver

`src/services/delivery/financial/deliveryReturnStateReader.js::returnOrderAmount()` delegates to `deliveryMoneyContract.readFirstMoney()` with this exact direct-field priority:

1. `totalReturnAmount`
2. `returnAmount`
3. `totalAmount`
4. `amount`
5. `debtReduction`

Explicit zero is authoritative because `readFirstMoney()` treats a present valid `0` as present and returns immediately.

### AR posting amount analysis

`src/services/accounting/returnArPostingService.js::returnOrderAmountAnalysis()` uses this positive-candidate priority:

1. `amount`
2. `debtReduction`
3. `returnAmount`
4. `totalReturnAmount`
5. `totalAmount`
6. `returnedAmount`
7. `totalValue`
8. item-derived amount only when no positive direct candidate exists

It already emits warning code `return_amount_field_mismatch` when multiple positive candidate values differ.

## Proven divergence

For `{ returnAmount: 2000, amount: 1500 }`:

- Delivery canonical return amount = **2000**.
- AR posting selected amount = **1500** from field `amount`.
- Existing R1.3 audit reused AR posting analysis as its expected return amount, so the audit compared 1500 against an AR-RETURN of 1500 and could call it aligned even though the delivery snapshot had used 2000.

## Comparison matrix

| Field | Delivery priority | AR posting priority | Can conflict | Existing warning | R1.3a handling |
|---|---:|---:|---|---|---|
| totalReturnAmount | 1 | 4 | Yes | possible posting warning | preserve Delivery amount separately |
| returnAmount | 2 | 3 | Yes | possible posting warning | preserve Delivery amount separately |
| totalAmount | 3 | 5 | Yes | possible posting warning | evidence field |
| amount | 4 | 1 | Yes | preferred by AR posting | preserve posting amount separately |
| debtReduction | 5 | 2 | Yes | preferred by AR posting | evidence field |
| returnedAmount | not direct Delivery field | 6 | Yes | posting candidate | evidence field |
| totalValue | not direct Delivery field | 7 | Yes | posting candidate | evidence field |

## Decision

R1.3a does **not** alter either runtime resolver. The historical audit now performs a three-way comparison:

`Delivery canonical amount ↔ AR-posting selected amount ↔ effective AR-RETURN amount`.
