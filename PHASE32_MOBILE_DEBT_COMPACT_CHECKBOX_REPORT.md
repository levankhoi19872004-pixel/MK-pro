# PHASE 32 — Mobile debt compact checkbox

## Root cause

The shared mobile stylesheet applies `width: 100%`, padding, and a minimum height
of 36–40px to every `input`. Debt-order checkboxes in both the sales and delivery
apps did not have a scoped override, so the checkbox expanded like a text input on
small screens and occupied a large part of each debt row.

## Changes

- Added a scoped 18x18px checkbox style for sales debt collection rows.
- Added the same scoped style for delivery debt collection rows.
- Reduced the visual checkbox to 17x17px on screens up to 380px wide.
- Kept the entire debt-order label clickable, preserving a large touch target.
- Aligned order code and debt information in the second grid column.
- Did not add a global checkbox rule, preventing changes to other modules.
- Added regression tests for selector scope, dimensions, and narrow-screen rules.

## Scope

Only `public/mobile/mobile.css` and a static regression test were changed. No API,
MongoDB schema, debt calculation, collection submission, accounting confirmation,
or fund/AR ledger logic was modified.
