'use strict';

const ExpenseVoucher = require('../../models/ExpenseVoucher');
const DebtCollection = require('../../models/DebtCollection');
const Receipt = require('../../models/Receipt');
const SupplierPayment = require('../../models/SupplierPayment');
const dateUtil = require('../../utils/date.util');
const FundLedgerBalancePolicy = require('../accounting/FundLedgerBalancePolicy');
const { text, upper, constants: domainConstants } = require('./FundSummaryDomain');
const { vietnamUtcRange } = require('./FundSummaryFilters');

const { ACTIVE_LEDGER_STATUSES, BLOCKED_LEDGER_STATUSES } = domainConstants;

function mongoString(expression) {
  return {
    $trim: {
      input: {
        $convert: { input: expression, to: 'string', onError: '', onNull: '' }
      }
    }
  };
}

function mongoHasText(expression) {
  return { $gt: [{ $strLenCP: mongoString(expression) }, 0] };
}

function mongoFirstText(expressions = []) {
  return {
    $let: {
      vars: { candidates: expressions.map(mongoString) },
      in: {
        $ifNull: [
          {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$$candidates',
                  as: 'candidate',
                  cond: { $gt: [{ $strLenCP: '$$candidate' }, 0] }
                }
              },
              0
            ]
          },
          ''
        ]
      }
    }
  };
}

function lookupBySource(from, alias, sourceTypes = [], enforceTenant = false) {
  return {
    $lookup: {
      from,
      let: { sid: '$sourceId', scode: '$sourceCode', stype: '$_sourceTypeUpper', tenantId: '$tenantId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                sourceTypes.length ? { $in: ['$$stype', sourceTypes] } : { $literal: true },
                enforceTenant
                  ? { $and: [mongoHasText('$$tenantId'), { $eq: [mongoString('$tenantId'), mongoString('$$tenantId')] }] }
                  : { $literal: true },
                {
                  $or: [
                    { $and: [mongoHasText('$$sid'), { $eq: [mongoString('$id'), mongoString('$$sid')] }] },
                    { $and: [mongoHasText('$$scode'), { $eq: [mongoString('$code'), mongoString('$$scode')] }] }
                  ]
                }
              ]
            }
          }
        },
        { $limit: 1 }
      ],
      as: alias
    }
  };
}

function mongoRoleExpression(rawRoleExpression, fallbackRole = 'Khác') {
  const normalized = {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $toLower: mongoString(rawRoleExpression) },
          find: '_',
          replacement: ''
        }
      },
      find: '-',
      replacement: ''
    }
  };
  return {
    $switch: {
      branches: [
        { case: { $in: [normalized, ['sales', 'sale', 'nvbh', 'salesman', 'nhanvienbanhang']] }, then: 'NVBH' },
        { case: { $in: [normalized, ['delivery', 'shipper', 'nvgh', 'giaohang', 'nhanviengiaohang']] }, then: 'NVGH' },
        { case: { $in: [normalized, ['accountant', 'ketoan']] }, then: 'Kế toán' },
        { case: { $in: [normalized, ['cashier', 'thuquy']] }, then: 'Thủ quỹ' },
        { case: { $in: [normalized, ['supplier', 'nhacungcap']] }, then: 'Nhà cung cấp' },
        { case: { $in: [normalized, ['customer', 'khachhang']] }, then: 'Khách hàng' },
        { case: { $in: [normalized, ['internal', 'transfer', 'noibo']] }, then: 'Nội bộ' },
        { case: { $in: [normalized, ['unknown', 'unidentified', 'chuaxacdinh']] }, then: 'Chưa xác định' }
      ],
      default: fallbackRole
    }
  };
}

function mongoRoleKey(roleExpression) {
  return {
    $switch: {
      branches: [
        { case: { $eq: [roleExpression, 'NVBH'] }, then: 'SALES' },
        { case: { $eq: [roleExpression, 'NVGH'] }, then: 'DELIVERY' },
        { case: { $eq: [roleExpression, 'Kế toán'] }, then: 'ACCOUNTANT' },
        { case: { $eq: [roleExpression, 'Thủ quỹ'] }, then: 'CASHIER' },
        { case: { $eq: [roleExpression, 'Nhà cung cấp'] }, then: 'SUPPLIER' },
        { case: { $eq: [roleExpression, 'Khách hàng'] }, then: 'CUSTOMER' },
        { case: { $eq: [roleExpression, 'Nội bộ'] }, then: 'INTERNAL' },
        { case: { $eq: [roleExpression, 'Chưa xác định'] }, then: 'UNKNOWN' }
      ],
      default: 'OTHER'
    }
  };
}

function sourceIdentityExpression() {
  return mongoFirstText([
    '$reversalOf', '$originalSourceId', '$sourceId', '$sourceCode',
    '$referenceId', '$referenceCode', '$refId', '$refCode', '$id', '$code', '$idempotencyKey'
  ]);
}

function normalizedSignedAmountExpression() {
  const raw = { $ifNull: ['$amount', { $ifNull: ['$debit', '$credit'] }] };
  const asString = mongoString(raw);
  const stripped = {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $replaceAll: { input: asString, find: ' ', replacement: '' } },
          find: '.',
          replacement: ''
        }
      },
      find: ',',
      replacement: ''
    }
  };
  return {
    $round: [
      {
        $cond: [
          { $isNumber: raw },
          { $convert: { input: raw, to: 'double', onError: 0, onNull: 0 } },
          { $convert: { input: stripped, to: 'double', onError: 0, onNull: 0 } }
        ]
      },
      0
    ]
  };
}

function normalizedAmountExpression() {
  return { $abs: normalizedSignedAmountExpression() };
}

function effectiveDirectionExpression() {
  const sourceType = { $toUpper: mongoString('$sourceType') };
  const rawDirection = { $toLower: mongoString('$direction') };
  const rawNumber = normalizedSignedAmountExpression();
  const isReversal = {
    $or: [
      { $eq: ['$isReversal', true] },
      { $lt: [rawNumber, 0] },
      { $regexMatch: { input: sourceType, regex: 'REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN' } }
    ]
  };
  return {
    $cond: [
      isReversal,
      { $cond: [{ $eq: [rawDirection, 'out'] }, 'in', 'out'] },
      rawDirection
    ]
  };
}

function transactionClassExpression() {
  return {
    $switch: {
      branches: [
        { case: { $eq: ['$_sourceTypeUpper', 'FUND_TRANSFER'] }, then: 'TRANSFER' },
        { case: { $eq: ['$_effectiveDirection', 'in'] }, then: 'DEPOSIT' },
        { case: { $eq: ['$_effectiveDirection', 'out'] }, then: 'EXPENSE' }
      ],
      default: 'OTHER'
    }
  };
}

function identityFieldExpressions() {
  return {
    expenseReceiverCode: mongoFirstText(['$receiverCode', '$payeeCode', '$_expenseSource.receiverCode']),
    expenseReceiverName: mongoFirstText(['$receiverName', '$payeeName', '$_expenseSource.receiverName']),
    supplierCode: mongoFirstText(['$supplierCode', '$_supplierSource.supplierCode']),
    supplierName: mongoFirstText(['$supplierName', '$_supplierSource.supplierName']),
    collectorCode: mongoFirstText(['$collectorCode', '$_debtSource.collectorCode']),
    collectorName: mongoFirstText(['$collectorName', '$_debtSource.collectorName']),
    collectorType: mongoFirstText(['$collectorType', '$_debtSource.collectorType']),
    customerCode: mongoFirstText(['$customerCode', '$_receiptSource.customerCode', '$_debtSource.customerCode']),
    customerName: mongoFirstText(['$customerName', '$_receiptSource.customerName', '$_debtSource.customerName']),
    genericCounterpartyCode: mongoFirstText(['$counterpartyCode', '$payerCode', '$depositorCode']),
    genericCounterpartyName: mongoFirstText(['$counterpartyName', '$payerName', '$depositorName']),
    genericCounterpartyRole: mongoFirstText(['$counterpartyRole', '$payerRole', '$depositorRole']),
    staffCode: mongoFirstText(['$staffCode']),
    staffName: mongoFirstText(['$staffName']),
    deliveryCode: mongoFirstText(['$deliveryStaffCode']),
    deliveryName: mongoFirstText(['$deliveryStaffName']),
    salesCode: mongoFirstText(['$salesStaffCode']),
    salesName: mongoFirstText(['$salesStaffName'])
  };
}

function identitySourceStages(fields) {
  return [
    {
      $addFields: {
        _expenseSource: { $ifNull: [{ $arrayElemAt: ['$expenseSource', 0] }, {}] },
        _debtSource: { $ifNull: [{ $arrayElemAt: ['$debtSource', 0] }, {}] },
        _supplierSource: { $ifNull: [{ $arrayElemAt: ['$supplierSource', 0] }, {}] },
        _receiptSource: { $ifNull: [{ $arrayElemAt: ['$receiptSource', 0] }, {}] }
      }
    },
    {
      $addFields: {
        _expenseReceiverCode: fields.expenseReceiverCode,
        _expenseReceiverName: fields.expenseReceiverName,
        _expenseReceiverRole: mongoFirstText(['$receiverRole', '$_expenseSource.receiverRole']),
        _supplierCode: fields.supplierCode,
        _supplierName: fields.supplierName,
        _collectorCode: fields.collectorCode,
        _collectorName: fields.collectorName,
        _collectorType: fields.collectorType,
        _customerCode: fields.customerCode,
        _customerName: fields.customerName,
        _genericCounterpartyCode: fields.genericCounterpartyCode,
        _genericCounterpartyName: fields.genericCounterpartyName,
        _genericCounterpartyRole: fields.genericCounterpartyRole,
        _staffCode: fields.staffCode,
        _staffName: fields.staffName,
        _deliveryCode: fields.deliveryCode,
        _deliveryName: fields.deliveryName,
        _salesCode: fields.salesCode,
        _salesName: fields.salesName
      }
    }
  ];
}

function identityKindStage() {
  return {
    $addFields: {
      _identityKind: {
        $switch: {
          branches: [
            { case: { $eq: ['$_transactionClass', 'TRANSFER'] }, then: 'internal' },
            {
              case: {
                $and: [
                  { $or: [{ $eq: ['$_sourceTypeUpper', 'EXPENSE_VOUCHER'] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                  { $or: [mongoHasText('$_expenseReceiverCode'), mongoHasText('$_expenseReceiverName')] }
                ]
              },
              then: 'receiver'
            },
            {
              case: {
                $and: [
                  { $or: [{ $in: ['$_sourceTypeUpper', ['SUPPLIERPAYMENT', 'SUPPLIER_PAYMENT']] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                  { $or: [mongoHasText('$_supplierCode'), mongoHasText('$_supplierName')] }
                ]
              },
              then: 'supplier'
            },
            {
              case: {
                $and: [
                  { $in: ['$_sourceTypeUpper', ['DELIVERY_CASH_SUBMISSION', 'DELIVERY_SHORTAGE_REPAYMENT']] },
                  { $or: [mongoHasText('$_deliveryCode'), mongoHasText('$_deliveryName')] }
                ]
              },
              then: 'delivery'
            },
            { case: { $or: [mongoHasText('$_collectorCode'), mongoHasText('$_collectorName')] }, then: 'collector' },
            { case: { $or: [mongoHasText('$_genericCounterpartyCode'), mongoHasText('$_genericCounterpartyName')] }, then: 'counterparty' },
            {
              case: {
                $and: [
                  { $in: ['$_sourceTypeUpper', ['AR_RECEIPT', 'RECEIPT']] },
                  { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }
                ]
              },
              then: 'customer'
            },
            { case: { $or: [mongoHasText('$_salesCode'), mongoHasText('$_salesName')] }, then: 'sales' },
            {
              case: {
                $and: [
                  { $or: [{ $eq: ['$_sourceTypeUpper', 'EXPENSE_VOUCHER'] }, { $eq: ['$_transactionClass', 'EXPENSE'] }] },
                  { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }
                ]
              },
              then: 'customer'
            },
            { case: { $or: [mongoHasText('$_staffCode'), mongoHasText('$_staffName')] }, then: 'staff' },
            { case: { $or: [mongoHasText('$_customerCode'), mongoHasText('$_customerName')] }, then: 'customer' }
          ],
          default: 'unknown'
        }
      }
    }
  };
}

function identityProjectionStage() {
  return {
    $addFields: {
      personCode: {
        $switch: {
          branches: [
            { case: { $eq: ['$_identityKind', 'receiver'] }, then: '$_expenseReceiverCode' },
            { case: { $eq: ['$_identityKind', 'supplier'] }, then: '$_supplierCode' },
            { case: { $eq: ['$_identityKind', 'delivery'] }, then: '$_deliveryCode' },
            { case: { $eq: ['$_identityKind', 'collector'] }, then: '$_collectorCode' },
            { case: { $eq: ['$_identityKind', 'counterparty'] }, then: '$_genericCounterpartyCode' },
            { case: { $eq: ['$_identityKind', 'sales'] }, then: '$_salesCode' },
            { case: { $eq: ['$_identityKind', 'staff'] }, then: '$_staffCode' },
            { case: { $eq: ['$_identityKind', 'customer'] }, then: '$_customerCode' }
          ],
          default: ''
        }
      },
      personName: {
        $switch: {
          branches: [
            { case: { $eq: ['$_identityKind', 'internal'] }, then: 'Chuyển quỹ nội bộ' },
            { case: { $eq: ['$_identityKind', 'receiver'] }, then: mongoFirstText(['$_expenseReceiverName', '$_expenseReceiverCode']) },
            { case: { $eq: ['$_identityKind', 'supplier'] }, then: mongoFirstText(['$_supplierName', '$_supplierCode']) },
            { case: { $eq: ['$_identityKind', 'delivery'] }, then: mongoFirstText(['$_deliveryName', '$_deliveryCode']) },
            { case: { $eq: ['$_identityKind', 'collector'] }, then: mongoFirstText(['$_collectorName', '$_collectorCode']) },
            { case: { $eq: ['$_identityKind', 'counterparty'] }, then: mongoFirstText(['$_genericCounterpartyName', '$_genericCounterpartyCode']) },
            { case: { $eq: ['$_identityKind', 'sales'] }, then: mongoFirstText(['$_salesName', '$_salesCode']) },
            { case: { $eq: ['$_identityKind', 'staff'] }, then: mongoFirstText(['$_staffName', '$_staffCode']) },
            { case: { $eq: ['$_identityKind', 'customer'] }, then: mongoFirstText(['$_customerName', '$_customerCode']) }
          ],
          default: 'Chưa xác định'
        }
      },
      personRole: {
        $switch: {
          branches: [
            { case: { $eq: ['$_identityKind', 'internal'] }, then: 'Nội bộ' },
            { case: { $eq: ['$_identityKind', 'receiver'] }, then: mongoRoleExpression('$_expenseReceiverRole', 'Khác') },
            { case: { $eq: ['$_identityKind', 'supplier'] }, then: 'Nhà cung cấp' },
            { case: { $eq: ['$_identityKind', 'delivery'] }, then: 'NVGH' },
            { case: { $eq: ['$_identityKind', 'collector'] }, then: mongoRoleExpression('$_collectorType', 'Khác') },
            { case: { $eq: ['$_identityKind', 'counterparty'] }, then: mongoRoleExpression('$_genericCounterpartyRole', 'Khác') },
            { case: { $eq: ['$_identityKind', 'sales'] }, then: 'NVBH' },
            { case: { $eq: ['$_identityKind', 'staff'] }, then: mongoRoleExpression('$staffRole', 'Khác') },
            { case: { $eq: ['$_identityKind', 'customer'] }, then: 'Khách hàng' }
          ],
          default: 'Chưa xác định'
        }
      },
      sourceField: {
        $switch: {
          branches: [
            { case: { $eq: ['$_identityKind', 'internal'] }, then: 'sourceType:FUND_TRANSFER' },
            { case: { $eq: ['$_identityKind', 'receiver'] }, then: 'receiver*' },
            { case: { $eq: ['$_identityKind', 'supplier'] }, then: 'supplier*' },
            { case: { $eq: ['$_identityKind', 'delivery'] }, then: 'deliveryStaff*' },
            { case: { $eq: ['$_identityKind', 'collector'] }, then: 'collector*' },
            { case: { $eq: ['$_identityKind', 'counterparty'] }, then: 'counterparty/payer/depositor' },
            { case: { $eq: ['$_identityKind', 'sales'] }, then: 'salesStaff*' },
            { case: { $eq: ['$_identityKind', 'staff'] }, then: 'staff*' },
            { case: { $eq: ['$_identityKind', 'customer'] }, then: 'customer*' }
          ],
          default: 'unresolved'
        }
      }
    }
  };
}

function personKeyStage() {
  return {
    $addFields: {
      _personRoleKey: mongoRoleKey('$personRole'),
      personKey: {
        $cond: [
          { $eq: ['$_identityKind', 'internal'] },
          'INTERNAL:TRANSFER',
          {
            $cond: [
              mongoHasText('$personCode'),
              { $concat: [mongoRoleKey('$personRole'), ':CODE:', { $toUpper: mongoString('$personCode') }] },
              {
                $cond: [
                  { $and: [mongoHasText('$personName'), { $ne: ['$personName', 'Chưa xác định'] }] },
                  { $concat: [mongoRoleKey('$personRole'), ':NAME:', { $toLower: mongoString('$personName') }] },
                  'UNKNOWN:UNIDENTIFIED'
                ]
              }
            ]
          }
        ]
      }
    }
  };
}

function buildIdentityStages() {
  const fields = identityFieldExpressions();
  return [
    ...identitySourceStages(fields),
    identityKindStage(),
    identityProjectionStage(),
    personKeyStage()
  ];
}

function buildEarlyMatch(filters) {
  const { start, end } = vietnamUtcRange(filters.fromDate, filters.toDate);
  const match = {
    $and: [
      {
        $or: [
          { status: { $exists: false } },
          { status: null },
          { status: { $in: ACTIVE_LEDGER_STATUSES } }
        ]
      },
      { isDeleted: { $ne: true } },
      { deletedAt: { $in: [null, ''] } },
      FundLedgerBalancePolicy.balanceAffectingMongoFilter(),
      {
        $or: [
          { date: { $gte: filters.fromDate, $lte: filters.toDate } },
          {
            $and: [
              { $or: [{ date: { $exists: false } }, { date: '' }, { date: null }] },
              { createdAt: { $gte: start.toISOString(), $lt: end.toISOString() } }
            ]
          }
        ]
      }
    ]
  };
  if (filters.multiTenant && filters.tenantId) match.$and.push({ tenantId: filters.tenantId });
  if (filters.fundCode === 'cash' || filters.fundCode === 'bank') match.$and.push({ fundType: filters.fundCode });
  else if (filters.fundCode) match.$and.push({ account: upper(filters.fundCode) });
  return match;
}

function baseNormalizationStages(filters) {
  return [
    { $match: buildEarlyMatch(filters) },
    {
      $addFields: {
        _sourceTypeUpper: { $toUpper: mongoFirstText(['$sourceType', '$refType', '$referenceType', 'UNKNOWN']) },
        _normalizedAmount: normalizedAmountExpression(),
        _effectiveDirection: effectiveDirectionExpression(),
        _sourceIdentity: sourceIdentityExpression(),
        _statusLower: { $toLower: mongoString('$status') },
        _isReversal: {
          $or: [
            { $eq: ['$isReversal', true] },
            { $lt: [normalizedSignedAmountExpression(), 0] },
            { $regexMatch: { input: { $toUpper: mongoFirstText(['$sourceType', '$refType', '$referenceType']) }, regex: 'REVERS(AL|E)|HOAN_TAC|DAO_BUT_TOAN' } }
          ]
        },
        _effectiveDate: {
          $cond: [
            { $regexMatch: { input: mongoString('$date'), regex: /^\d{4}-\d{2}-\d{2}$/ } },
            mongoString('$date'),
            {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $convert: { input: '$createdAt', to: 'date', onError: new Date(`${filters.fromDate}T00:00:00+07:00`), onNull: new Date(`${filters.fromDate}T00:00:00+07:00`) } },
                timezone: dateUtil.VIETNAM_TIME_ZONE
              }
            }
          ]
        }
      }
    },
    { $addFields: { _transactionClass: transactionClassExpression() } },
    { $match: { _normalizedAmount: { $gt: 0 }, _transactionClass: { $ne: 'OTHER' } } },
    lookupBySource(ExpenseVoucher.collection.name, 'expenseSource', ['EXPENSE_VOUCHER'], filters.multiTenant),
    lookupBySource(DebtCollection.collection.name, 'debtSource', ['DEBTCOLLECTION', 'DEBT_COLLECTION'], filters.multiTenant),
    lookupBySource(SupplierPayment.collection.name, 'supplierSource', ['SUPPLIERPAYMENT', 'SUPPLIER_PAYMENT'], filters.multiTenant),
    lookupBySource(Receipt.collection.name, 'receiptSource', ['AR_RECEIPT', 'RECEIPT'], filters.multiTenant),
    ...buildIdentityStages()
  ];
}

function identityMatchStages(filters) {
  const identityMatch = {};
  if (filters.personCode) identityMatch.$expr = { $eq: [{ $toUpper: mongoString('$personCode') }, upper(filters.personCode)] };
  if (filters.personRole) identityMatch.personRole = filters.personRole;
  if (filters.q) {
    const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    identityMatch.$or = [
      { personCode: { $regex: escaped, $options: 'i' } },
      { personName: { $regex: escaped, $options: 'i' } }
    ];
  }
  return Object.keys(identityMatch).length ? [{ $match: identityMatch }] : [];
}

function voucherAggregationStages() {
  return [
    {
      $addFields: {
        _ledgerDedupeKey: {
          $cond: [
            mongoHasText('$idempotencyKey'),
            { $concat: ['IDEMP:', mongoString('$idempotencyKey')] },
            {
              $concat: [
                'LEGACY:', '$_sourceTypeUpper', ':', mongoString('$_sourceIdentity'), ':',
                mongoString('$fundType'), ':', mongoString('$_effectiveDirection'), ':', mongoString('$account'), ':',
                { $toString: '$_normalizedAmount' }
              ]
            }
          ]
        },
        _voucherKey: { $concat: ['$_sourceTypeUpper', ':', mongoString('$_sourceIdentity')] },
        _signedAmount: {
          $switch: {
            branches: [
              { case: { $eq: ['$_transactionClass', 'DEPOSIT'] }, then: '$_normalizedAmount' },
              { case: { $eq: ['$_transactionClass', 'EXPENSE'] }, then: { $multiply: ['$_normalizedAmount', -1] } }
            ],
            default: 0
          }
        },
        _transactionAt: mongoFirstText(['$createdAt', { $concat: ['$_effectiveDate', 'T00:00:00+07:00'] }]),
        _voucherCode: mongoFirstText(['$sourceCode', '$referenceCode', '$refCode', '$code'])
      }
    },
    {
      $group: {
        _id: '$_ledgerDedupeKey',
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        sourceField: { $first: '$sourceField' },
        voucherKey: { $first: '$_voucherKey' },
        transactionClass: { $first: '$_transactionClass' },
        signedAmount: { $first: '$_signedAmount' },
        normalizedAmount: { $first: '$_normalizedAmount' },
        transactionAt: { $max: '$_transactionAt' },
        transactionDate: { $max: '$_effectiveDate' },
        voucherCode: { $first: '$_voucherCode' },
        sourceType: { $first: '$_sourceTypeUpper' },
        fundType: { $first: '$fundType' },
        account: { $first: '$account' },
        note: { $first: '$note' },
        createdBy: { $first: '$createdBy' },
        status: { $first: '$status' }
      }
    },
    {
      $group: {
        _id: { personKey: '$personKey', voucherKey: '$voucherKey' },
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        sourceField: { $first: '$sourceField' },
        voucherKey: { $first: '$voucherKey' },
        sourceType: { $first: '$sourceType' },
        voucherCode: { $first: '$voucherCode' },
        signedAmount: { $sum: '$signedAmount' },
        transferAmount: { $max: { $cond: [{ $eq: ['$transactionClass', 'TRANSFER'] }, '$normalizedAmount', 0] } },
        hasTransfer: { $max: { $cond: [{ $eq: ['$transactionClass', 'TRANSFER'] }, 1, 0] } },
        transactionAt: { $max: '$transactionAt' },
        transactionDate: { $max: '$transactionDate' },
        fundTypes: { $addToSet: '$fundType' },
        accounts: { $addToSet: '$account' },
        notes: { $addToSet: '$note' },
        creators: { $addToSet: '$createdBy' },
        statuses: { $addToSet: '$status' },
        underlyingLedgerCount: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        personKey: 1,
        personCode: 1,
        personName: 1,
        personRole: 1,
        sourceField: 1,
        voucherKey: 1,
        sourceType: 1,
        voucherCode: 1,
        transactionAt: 1,
        transactionDate: 1,
        fundTypes: 1,
        accounts: 1,
        notes: 1,
        creators: 1,
        statuses: 1,
        underlyingLedgerCount: 1,
        transactionClass: { $cond: [{ $eq: ['$hasTransfer', 1] }, 'TRANSFER', { $cond: [{ $gt: ['$signedAmount', 0] }, 'DEPOSIT', 'EXPENSE'] }] },
        depositedAmount: { $cond: [{ $and: [{ $eq: ['$hasTransfer', 0] }, { $gt: ['$signedAmount', 0] }] }, '$signedAmount', 0] },
        expenseAmount: { $cond: [{ $and: [{ $eq: ['$hasTransfer', 0] }, { $lt: ['$signedAmount', 0] }] }, { $abs: '$signedAmount' }, 0] },
        netAmount: { $cond: [{ $eq: ['$hasTransfer', 1] }, 0, '$signedAmount'] },
        internalTransferAmount: { $cond: [{ $eq: ['$hasTransfer', 1] }, '$transferAmount', 0] }
      }
    },
    { $match: { $or: [{ transactionClass: 'TRANSFER' }, { netAmount: { $ne: 0 } }] } }
  ];
}

function finalFilterStages(filters, options) {
  const stages = [];
  if (filters.transactionType !== 'all') {
    const map = { deposit: 'DEPOSIT', expense: 'EXPENSE', transfer: 'TRANSFER' };
    stages.push({ $match: { transactionClass: map[filters.transactionType] } });
  }
  if (options.personKey) stages.push({ $match: { personKey: text(options.personKey) } });
  return stages;
}

function buildNormalizedVoucherPipeline(filters, options = {}) {
  return [
    ...baseNormalizationStages(filters),
    ...identityMatchStages(filters),
    ...voucherAggregationStages(),
    ...finalFilterStages(filters, options)
  ];
}

function personGroupStages(filters) {
  const match = filters.transactionType === 'transfer'
    ? { transactionClass: 'TRANSFER' }
    : { transactionClass: { $ne: 'TRANSFER' } };
  return [
    { $match: match },
    {
      $group: {
        _id: '$personKey',
        personKey: { $first: '$personKey' },
        personCode: { $first: '$personCode' },
        personName: { $first: '$personName' },
        personRole: { $first: '$personRole' },
        depositedAmount: { $sum: '$depositedAmount' },
        depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
        expenseAmount: { $sum: '$expenseAmount' },
        expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } },
        internalTransferAmount: { $sum: '$internalTransferAmount' },
        internalTransferCount: { $sum: { $cond: [{ $gt: ['$internalTransferAmount', 0] }, 1, 0] } },
        lastTransactionAt: { $max: '$transactionAt' }
      }
    },
    {
      $project: {
        _id: 0,
        personKey: 1,
        personCode: 1,
        personName: 1,
        personRole: 1,
        depositedAmount: 1,
        depositVoucherCount: 1,
        expenseAmount: 1,
        expenseVoucherCount: 1,
        internalTransferAmount: 1,
        internalTransferCount: 1,
        netAmount: { $subtract: ['$depositedAmount', '$expenseAmount'] },
        lastTransactionAt: 1
      }
    }
  ];
}

function summarySort(filters) {
  const direction = filters.sortOrder === 'asc' ? 1 : -1;
  return { [filters.sortBy]: direction, personName: 1, personCode: 1 };
}

module.exports = {
  buildNormalizedVoucherPipeline,
  personGroupStages,
  summarySort
};
