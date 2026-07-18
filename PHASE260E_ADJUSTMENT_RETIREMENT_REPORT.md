# Phase260E Adjustment Retirement Report

Generated: 2026-07-18T00:00:42.118Z
Baseline: MK-pro-phase260d-mixed-ledger-family-ownership-fixed.zip
Baseline SHA256: 5cd4430188826e141ea250d6b2621cd2aac73f7997293f531b201469dc7ee2b2
Git commit: 5001e448f02095879466746f93930c5fbc85ec42

## Actual Result

New AR-DEBT-ADJUSTMENT posting is retired. The central facade returns `{ skipped: true, reason: "AR_DEBT_ADJUSTMENT_POSTING_RETIRED" }` and can throw the same code when caller requires rollback behavior. Manual debt now posts `AR-EXTERNAL-DEBT` debit. Debt New/customer read projection excludes legacy `AR-DEBT-ADJUSTMENT` from canonical balance while preserving document debit/credit in history.

## Commands

- node --test test\phase260e-canonical-ar-source-posting.test.js test\manual-debt-posting-service.test.js
- node --test test\phase260c-r1-stop-the-bleeding.test.js test\phase260c-r2-controlled-repair.test.js test\phase260c-r3-legacy-debt-projection.test.js

Scanned count: 0
Changed count: 0 production rows
Skipped reason: MONGO_CONNECTION_FAILED
Warnings: Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you're trying to access the database from an IP that isn't whitelisted. Make sure your current IP address is on your Atlas cluster's IP whitelist: https://www.mongodb.com/docs/atlas/security-whitelist/
