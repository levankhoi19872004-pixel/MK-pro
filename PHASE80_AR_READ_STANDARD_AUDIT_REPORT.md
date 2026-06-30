# PHASE80 AR Read Standard Audit

- Generated at: 2026-06-30T02:44:19.507Z
- Issue count: 628
- P0: 0
- P1: 120
- P2: 273
- P3 legacy compatibility: 235

| Severity | Code | File | Line | Message |
|---|---|---:|---:|---|
| P1 | RAW_AR_LEDGER_COLLECTION | src/app.js | 474 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/constants/collectionKeys.js | 25 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | LEGACY_DEBT_COLLECTION_NAME | src/controllers/reportController.js | 101 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P2 | LEGACY_DEBT_COLLECTION_NAME | src/controllers/reportController.js | 111 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/print/builders/DmsExactSalesInvoiceBuilder.js | 276 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/print/builders/MasterPickingBuilder.js | 159 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/print/builders/ReturnPickingBuilder.js | 96 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/domain/reconciliation/ReconciliationService.js | 154 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/domain/settlement/DeliveryCashInTransitReportService.js | 139 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 108 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 133 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 158 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 183 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 203 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 223 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliveryCashInTransitReportService.js | 247 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/settlement/DeliverySettlementService.js | 98 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/staff/customerOwnership.js | 56 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/staff/staffIdentity.js | 108 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/staff/staffIdentity.js | 110 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/domain/staff/staffIdentity.js | 120 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 82 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 82 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 153 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 154 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 155 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 168 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 178 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 189 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 189 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 190 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 190 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 192 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 192 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.js | 192 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-02.jsfrag | 14 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-02.jsfrag | 16 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-02.jsfrag | 469 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-02.jsfrag | 471 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-02.jsfrag | 473 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 48 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 117 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 173 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 173 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 177 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 177 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 184 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 185 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/engines/delivery.legacy.engine.source/part-03.jsfrag | 185 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | PAYMENT_REPOSITORY_AR_READ | src/engines/posting.engine.js | 131 | paymentRepository.findAll có thể bypass AR read standard. |
| P1 | PAYMENT_REPOSITORY_AR_READ | src/engines/posting.engine.js | 218 | paymentRepository.findAll có thể bypass AR read standard. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 71 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 347 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 349 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 368 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 370 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 403 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 405 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 407 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 447 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 449 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/engines/posting.engine.js | 451 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/mobile/mobileContext.js | 57 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/mobile/mobileContext.js | 188 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArDebtCustomer.js | 8 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArDebtCustomer.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArDebtOrder.js | 11 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArDebtOrder.js | 13 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/models/ArLedger.js | 3 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArLedger.js | 14 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArLedger.js | 16 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ArLedger.js | 18 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DebtCollection.js | 20 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DebtCollection.js | 22 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryCashShortage.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryCashSubmission.js | 8 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryLocationPoint.js | 9 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryRoutePlan.js | 11 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryRouteSession.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/DeliveryShortageRepayment.js | 12 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ExternalDebtOrder.js | 17 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ExternalDebtOrder.js | 21 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/FundLedger.js | 28 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/FundLedger.js | 30 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/MasterOrder.js | 6 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/MasterReturnOrder.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ReturnOrder.js | 17 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ReturnOrder.js | 19 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ReturnOrder.js | 22 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/ReturnOrder.js | 24 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/SalesOrder.js | 42 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/SalesOrder.js | 49 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/SalesOrder.js | 67 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/SalesOrder.js | 69 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/SalesTarget.js | 23 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/models/VisitPlan.js | 11 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/models/index.js | 14 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/operations/backupIntegrity.js | 48 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/operations/backupIntegrity.js | 48 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/operations/backupIntegrity.js | 52 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/operations/backupIntegrity.js | 61 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/repositories/exportRepository.js | 28 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/repositories/exportRepository.js | 28 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | src/repositories/mobile/delivery.repository.js | 127 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/repositories/paymentRepository.js | 9 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | src/repositories/salesOrderDeletion.repository.js | 129 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/repositories/salesOrderDeletion.repository.js | 154 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/repositories/searchRepository.js | 325 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/routes/authRoutes.js | 70 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/routes/deliveryRoutes.js | 34 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/rules/importRules.js | 291 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/DebtCollectionService.js | 343 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/DebtCollectionService.js | 400 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 89 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 89 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 91 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 91 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 179 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 181 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 313 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 315 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 326 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 328 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 330 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 381 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtCollectionService.js | 385 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | LEGACY_DEBT_COLLECTION_NAME | src/services/DebtReadService.js | 253 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 185 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 187 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 214 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 216 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 218 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 328 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/DebtReadService.js | 330 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/ExternalDebtOrderService.js | 110 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/ExternalDebtOrderService.js | 112 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/ExternalDebtOrderService.js | 114 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/ExternalDebtOrderService.js | 244 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/ExternalDebtOrderService.js | 248 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/arAdjustmentService.js | 161 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/arAdjustmentService.js | 172 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/arAdjustmentService.js | 359 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/arAdjustmentService.js | 364 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/arAdjustmentService.js | 389 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/accounting/arCustomerDebtReadModel.service.js | 321 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/accounting/arCustomerDebtReadModel.service.js | 764 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 732 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 739 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 751 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 794 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 812 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 837 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/accounting/arCustomerDebtReadModel.service.js | 840 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | LEGACY_DEBT_COLLECTION_NAME | src/services/accounting/arCustomerDebtReadModel.service.js | 776 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P3-legacy-compatibility | LEGACY_DEBT_COLLECTION_NAME | src/services/accounting/arCustomerDebtReadModel.service.js | 857 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 223 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 225 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 235 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 237 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 409 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 411 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 413 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 452 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 454 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 456 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 542 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 544 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/accounting/arCustomerDebtReadModel.service.js | 546 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/accounting/externalDebtArPostingService.js | 138 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/accounting/externalDebtArPostingService.js | 207 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/accounting/externalDebtArPostingService.js | 209 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/accounting/externalDebtArPostingService.js | 211 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/accounting/returnArPostingService.js | 459 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/admin-correction/AdminDataCorrectionService.js | 212 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/analytics/ProjectionService.js | 133 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/analytics/ProjectionService.js | 78 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/arLedgerMigrationService.js | 33 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/arLedgerMigrationService.js | 42 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/arLedgerMigrationService.js | 48 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DashboardDailyStatsService.js | 174 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DashboardDailyStatsService.js | 219 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DashboardDailyStatsService.js | 240 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/dashboard/DebtDashboardQuery.js | 28 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DebtDashboardQuery.js | 23 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 111 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 158 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 201 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 203 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 207 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 249 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 251 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 255 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 257 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 318 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 363 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/DeliveryDashboardQuery.js | 377 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 107 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 109 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 116 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 120 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 219 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/HomeDashboardService.js | 299 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesDashboardQuery.js | 94 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesDashboardQuery.js | 96 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesDashboardQuery.js | 158 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesTargetService.js | 115 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesTargetService.js | 201 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesTargetService.js | 235 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/dashboard/SalesTargetService.js | 285 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/delivery/DeliveryPlanningService.js | 89 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 178 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 180 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 180 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 457 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 464 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 477 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 486 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/deliveryReconciliation.service.js | 486 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryReconciliation.service.js | 213 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryReconciliation.service.js | 215 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryReconciliation.service.js | 247 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryReconciliation.service.js | 285 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryRouteTracking.service.js | 163 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/deliveryRouteTracking.service.js | 225 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/excel/ExcelInteractionService.js | 331 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/field/FieldOperationService.js | 64 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/financialService.js | 78 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/financialService.js | 95 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fund-summary/FundSummaryQueryBuilder.js | 223 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fund-summary/FundSummaryQueryBuilder.js | 257 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 33 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 61 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 62 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 78 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 116 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 119 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 141 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/fundService.js | 154 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-01.jsfrag | 209 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-01.jsfrag | 406 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-01.jsfrag | 408 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | PAYMENT_REPOSITORY_AR_READ | src/services/fundService.source/part-02.jsfrag | 264 | paymentRepository.findAll có thể bypass AR read standard. |
| P3-legacy-compatibility | PAYMENT_REPOSITORY_AR_READ | src/services/fundService.source/part-02.jsfrag | 307 | paymentRepository.findAll có thể bypass AR read standard. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-02.jsfrag | 188 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-02.jsfrag | 202 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-02.jsfrag | 326 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/fundService.source/part-02.jsfrag | 395 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importRow.util.js | 229 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importRow.util.js | 229 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importRow.util.js | 231 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importRow.util.js | 231 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importValue.util.js | 104 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/core/importValue.util.js | 111 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/operations/salesImport.impl.js | 610 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/import/preview/importPreview.impl.js | 413 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/importExportLegacy.service.js | 107 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/importExportLegacy.service.js | 111 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/importExportLegacy.service.source/part-02.jsfrag | 205 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/importExportLegacy.service.source/part-02.jsfrag | 210 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCommand.impl.js | 442 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCommand.impl.js | 444 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCommand.impl.js | 448 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/master-order/deliveryAccountingCore.impl.js | 55 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | PAYMENT_REPOSITORY_AR_READ | src/services/master-order/deliveryAccountingCore.impl.js | 312 | paymentRepository.findAll có thể bypass AR read standard. |
| P1 | PAYMENT_REPOSITORY_AR_READ | src/services/master-order/deliveryAccountingCore.impl.js | 752 | paymentRepository.findAll có thể bypass AR read standard. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 276 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 278 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 460 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 462 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 560 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 562 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 597 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 599 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 646 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryAccountingCore.impl.js | 648 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrderCommand.impl.js | 84 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 57 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 59 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 101 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 105 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 107 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 321 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryOrdersCompact.impl.js | 323 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 51 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 67 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 72 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 101 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 106 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 145 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 149 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 151 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 217 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 219 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 252 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySalesSummary.impl.js | 254 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 55 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 57 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 95 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 99 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 101 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 159 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 161 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliverySummary.impl.js | 193 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryTodayList.impl.js | 107 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryTodayList.impl.js | 109 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/deliveryTodayList.impl.js | 191 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 191 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 294 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 350 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 422 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 427 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 476 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderCommand.impl.js | 521 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderPrintLegacy.impl.js | 204 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderQuery.impl.js | 248 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 101 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 101 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 102 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 102 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 347 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 349 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 352 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/master-order/masterOrderReturn.impl.js | 607 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/masterReturnOrderService.js | 194 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/masterReturnOrderService.js | 196 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/masterReturnOrderService.js | 409 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/masterReturnOrderService.js | 413 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/masterReturnOrderService.js | 633 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/MobileSyncService.js | 52 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/MobileSyncService.js | 54 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/MobileSyncService.js | 72 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/mobile/delivery.service.js | 306 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/mobile/delivery.service.js | 312 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/mobile/delivery.service.js | 314 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/delivery.service.js | 244 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/delivery.service.js | 414 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/delivery.service.js | 699 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/mobile/mobileDebtQuery.service.js | 104 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/mobile/mobileDebtQuery.service.js | 269 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 62 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 63 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 82 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 83 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 282 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 284 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 304 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 306 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 332 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 334 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 406 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 408 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mobile/mobileDebtQuery.service.js | 410 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/mobile/sales.service.js | 175 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 10 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 83 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 84 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 116 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 116 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 147 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 149 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 169 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 169 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 180 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.js | 181 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-01.jsfrag | 113 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-01.jsfrag | 115 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-01b.jsfrag | 211 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-01b.jsfrag | 218 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/mobile/sales.service.source/part-02.jsfrag | 159 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-02.jsfrag | 119 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-02.jsfrag | 121 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-02.jsfrag | 352 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-02.jsfrag | 354 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/mobile/sales.service.source/part-03.jsfrag | 34 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-03.jsfrag | 326 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-03.jsfrag | 330 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-03.jsfrag | 409 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobile/sales.service.source/part-03.jsfrag | 413 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/mobileService.js | 185 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/mobileService.js | 369 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobileService.js | 347 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobileService.js | 349 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobileService.js | 449 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/mobileService.js | 451 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/mongoIndexService.js | 111 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/mongoIndexService.js | 32 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 27 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 28 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 49 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 71 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 72 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 85 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 86 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 93 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 93 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 94 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 122 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 122 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 124 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 132 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 132 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 155 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.js | 156 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-01.jsfrag | 247 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-01.jsfrag | 253 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-01.jsfrag | 422 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 114 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 118 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 228 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 230 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 281 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 285 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 294 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 527 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 528 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-02.jsfrag | 543 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/orderLegacy.service.source/part-03.jsfrag | 46 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/orderLegacy.service.source/part-03.jsfrag | 173 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-03.jsfrag | 32 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-03.jsfrag | 34 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-03.jsfrag | 184 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/orderLegacy.service.source/part-03.jsfrag | 186 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/reportLegacy.service.js | 163 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/reportLegacy.service.js | 170 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/reportLegacy.service.js | 227 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | LEGACY_DEBT_COLLECTION_NAME | src/services/reportLegacy.service.js | 230 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 63 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 64 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 91 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 91 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 92 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 92 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 114 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 114 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 115 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 115 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 131 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 132 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 142 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 143 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 148 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 149 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 153 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 154 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 190 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 192 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 213 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.js | 216 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-01.jsfrag | 478 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-01.jsfrag | 480 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/reportLegacy.service.source/part-02.jsfrag | 165 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/reportLegacy.service.source/part-02.jsfrag | 244 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/reportLegacy.service.source/part-02.jsfrag | 510 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/reportLegacy.service.source/part-02.jsfrag | 538 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 108 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 110 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 121 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 123 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 274 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 276 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 282 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 284 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 381 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 383 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 415 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 417 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 452 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 454 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 491 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-02.jsfrag | 493 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/reportLegacy.service.source/part-03.jsfrag | 29 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | DIRECT_AR_LEDGER_READ | src/services/reportLegacy.service.source/part-03.jsfrag | 435 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P3-legacy-compatibility | RAW_AR_LEDGER_COLLECTION | src/services/reportLegacy.service.source/part-03.jsfrag | 50 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P3-legacy-compatibility | SALES_ORDER_DEBT_CALC | src/services/reportLegacy.service.source/part-03.jsfrag | 476 | Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount. |
| P3-legacy-compatibility | LEGACY_DEBT_COLLECTION_NAME | src/services/reportLegacy.service.source/part-03.jsfrag | 10 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P3-legacy-compatibility | LEGACY_DEBT_COLLECTION_NAME | src/services/reportLegacy.service.source/part-03.jsfrag | 513 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-03.jsfrag | 198 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-03.jsfrag | 208 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-03.jsfrag | 385 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/reportLegacy.service.source/part-03.jsfrag | 395 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/reports/DashboardReportService.js | 31 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/DebtReportService.js | 139 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/DebtReportService.js | 209 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | LEGACY_DEBT_COLLECTION_NAME | src/services/reports/DebtReportService.js | 223 | Cần thống nhất collection read model arDebtCustomers/arDebtOrders. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/DebtReportService.js | 60 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/DebtReportService.js | 62 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/DeliveryReportService.js | 154 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/DeliveryReportService.js | 182 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/reports/InformationReportService.js | 145 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/InformationReportService.js | 174 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/ReportCenterService.js | 143 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/ReportCenterService.js | 456 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/reports/ReturnReportService.js | 42 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/ReturnReportService.js | 126 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/ReturnReportService.js | 98 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/ReturnReportService.js | 100 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/reports/RewardReportService.js | 118 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/RewardReportService.js | 171 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/RewardReportService.js | 76 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/RewardReportService.js | 78 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | src/services/reports/SalesReportService.js | 183 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/reports/SalesReportService.js | 345 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/SalesReportService.js | 253 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/SalesReportService.js | 255 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/reports/SalesReportService.js | 314 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/return-order/ReturnOrderDeliveryStaffHydrator.js | 181 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/return-order/ReturnOrderDeliveryStaffHydrator.js | 183 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/return-order/ReturnOrderDeliveryStaffHydrator.js | 201 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/return-order/ReturnOrderDeliveryStaffHydrator.js | 203 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/return-order/ReturnOrderDeliveryStaffHydrator.js | 282 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 39 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 39 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 39 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 49 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 50 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 51 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 51 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 53 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 53 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 85 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 85 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 86 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 113 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 113 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 114 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 156 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 157 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 178 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 185 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.js | 185 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 285 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 285 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 286 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 349 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 349 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 354 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 354 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 362 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-01.jsfrag | 362 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 53 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 55 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 58 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 207 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 209 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-02.jsfrag | 212 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-03.jsfrag | 66 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-03.jsfrag | 74 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-03.jsfrag | 206 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-03.jsfrag | 267 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | src/services/returnOrderLegacy.service.source/part-03.jsfrag | 269 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/searchService.js | 228 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/searchService.js | 223 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/searchService.js | 225 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/services/searchService.js | 375 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | src/services/systemService.js | 299 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | PAYMENT_REPOSITORY_AR_READ | src/utils/arLedger.util.js | 105 | paymentRepository.findAll có thể bypass AR read standard. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/utils/staffIdentity.js | 14 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | src/utils/staffIdentity.js | 21 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/00-dashboard.js | 408 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/05-sales-orders.part04.js | 12 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | public/js/app/05-sales-orders.source/part-04.jsfrag | 42 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | public/js/app/debt/07a-debt-core.js | 127 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 214 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 216 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 268 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 270 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 300 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07a-debt-core.js | 300 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07f-fund-ledger.js | 94 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P3-legacy-compatibility | STAFF_NAME_FILTER_DRIFT | public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag | 298 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/delivery/delivery-core.js | 451 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | public/js/delivery/delivery-core.js | 453 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-adjustment-idempotency.js | 18 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-ledger-integrity.js | 276 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-return-duplicates.js | 75 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-return-idempotency.js | 20 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-return-idempotency.js | 26 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-ar-salesorder-debt-cache.js | 33 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-ar-salesorder-debt-cache.js | 24 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-ar-salesorder-debt-cache.js | 38 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 22 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 23 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 61 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 61 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 69 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-duplicate-business-keys.js | 69 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/audit-mobile-query-plans.js | 66 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-mobile-query-plans.js | 64 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/audit-mobile-query-plans.js | 65 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/backfill-ar-return-from-return-orders.js | 99 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/create-ar-adjustment-unique-index.js | 52 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/create-ar-return-active-idempotency-index.js | 78 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/create-ar-return-unique-index.js | 37 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/create-ar-return-unique-index.js | 40 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/debug-delivery-accounting-order.js | 114 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/debug-delivery-accounting-order.js | 130 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/debug-delivery-accounting-order.js | 165 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/drop-replaced-nonunique-indexes.js | 11 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/arSalesOrderDebtCacheAudit.js | 72 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/arSalesOrderDebtCacheAudit.js | 78 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/arSalesOrderDebtCacheAudit.js | 95 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/arSalesOrderDebtCacheAudit.js | 165 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/arSalesOrderDebtCacheAudit.js | 172 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/externalDebtArReconcile.js | 116 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/externalDebtArReconcile.js | 118 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/lib/externalDebtArReconcile.js | 124 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/migrate-canonical-staff-identity.js | 16 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/migrate-duplicate-business-keys.js | 22 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/migrate-duplicate-business-keys.js | 23 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/migrate-tenant-boundary.js | 19 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P2 | STAFF_NAME_FILTER_DRIFT | scripts/mobile-browser-smoke.js | 106 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/plan-ar-ledger-repair.js | 313 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/rebuild-ar-ledger.js | 94 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/reconcile-ar-ledger-after-repair.js | 176 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/reconcile-external-debt-ar.js | 24 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/reconcile-external-debt-ar.js | 19 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/reconcile-external-debt-ar.js | 38 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/reconcile-return-ar.js | 184 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/reconcile-return-ar.js | 185 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/reconcile-return-ar.js | 189 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/repair-ar-return-duplicates.js | 258 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/repair-delivery-accounting-ar-ledgers.js | 90 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P1 | DIRECT_AR_LEDGER_READ | scripts/repair-delivery-accounting-ar-ledgers.js | 166 | Đọc arLedgers trực tiếp thay vì arLedgerRead.service. |
| P2 | STAFF_NAME_FILTER_DRIFT | scripts/repair-detached-delivery-assignments.js | 116 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P2 | STAFF_NAME_FILTER_DRIFT | scripts/repair-detached-delivery-assignments.js | 162 | Kiểm tra filter staff name; chuẩn là code-only khi có mã. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/restore-drill-offline.js | 24 | Tham chiếu raw collection arLedgers cần được kiểm soát. |
| P1 | RAW_AR_LEDGER_COLLECTION | scripts/restore-drill.js | 55 | Tham chiếu raw collection arLedgers cần được kiểm soát. |

