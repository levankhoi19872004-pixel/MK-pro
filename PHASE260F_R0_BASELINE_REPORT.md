# Phase260F R0 Baseline Report

Generated: 2026-07-18T00:36:34.165Z
Baseline: MK-pro-phase260e-canonical-ar-source-posting-fixed.zip
Baseline SHA256: 43dd771217d6c05eb3d7fd54c4e3797a0d98568a3e2590e9165d89c91fea2e0f
Git commit: 507b2a8e8d300b1853d1d9985eb54b5783fe9661
Checkpoint: Phase260F-R0

## Actual Result

Baseline Phase260E ZIP is present and SHA256 was verified. Required repository directories exist in the working tree: src, public, scripts, test, config, docs, package.json. Phase260E production audit status is PRODUCTION_AUDIT_NOT_EXECUTED, so Phase260F records production gates as blocked until DB evidence exists.

## Root Cause

Phase260E retired the AR-DEBT-ADJUSTMENT writer correctly but also removed AR-DEBT-ADJUSTMENT from debt projection before production audit/backfill verified replacements. Valid legacy credit rows, including the B0038754 fixture effect, could disappear from the debt-order balance while still being visible in history.

## Gate

R0 code/runtime verification passed for local repository inspection. Production audit is not executed.
