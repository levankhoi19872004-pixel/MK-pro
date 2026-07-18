# Phase260E Debt History Mapping Report

Generated: 2026-07-18T00:00:42.118Z
Baseline: MK-pro-phase260d-mixed-ledger-family-ownership-fixed.zip
Baseline SHA256: 5cd4430188826e141ea250d6b2621cd2aac73f7997293f531b201469dc7ee2b2
Git commit: 5001e448f02095879466746f93930c5fbc85ec42

Debt history now reads movement DTO fields returned by backend: ledgerId, occurredAt, category, orderId/orderCode, debit, credit, netEffect, sourceType/sourceId/sourceCode, accountingStatus, active, projectionIncluded, exclusionReason, legacyAdjustment, warningCode. The frontend no longer infers debit/credit from category names such as PAYMENT.

Legacy adjustment rows are shown with document debit/credit and marked as not included in canonical balance.
