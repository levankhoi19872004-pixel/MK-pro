'use strict';

const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const Product = require('../../models/Product');
const {
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  businessDateStages,
  firstNonBlankExpression,
  numberExpression,
  salesStaffCodeExpression,
  salesStaffNameExpression
} = require('./DashboardMongoExpressions');

const ACCOUNTING_SCOPES = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  ACTIVE: 'active'
});

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function normalizeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function text(value) {
  return String(value || '').trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function parseYmd(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: match[1], month: match[2], day: match[3] };
}

function dateRangePrefilter(dateFrom, dateTo, fields = []) {
  const fromText = text(dateFrom).slice(0, 10);
  const toText = text(dateTo).slice(0, 10);
  if (!fromText || !toText) return null;

  const fromParts = parseYmd(fromText);
  const toParts = parseYmd(toText);
  const startDate = new Date(`${fromText}T00:00:00.000Z`);
  const endExclusive = new Date(`${toText}T00:00:00.000Z`);
  if (Number.isFinite(endExclusive.getTime())) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const sameMonth = fromParts && toParts && fromParts.year === toParts.year && fromParts.month === toParts.month;
  const legacyMonthRegex = sameMonth
    ? new RegExp(`^(\\d{1,2}[\\/\\-.]${fromParts.month}[\\/\\-.]${fromParts.year}|${fromParts.year}[\\/\\-.]${fromParts.month})`)
    : null;

  const clauses = [];
  for (const field of unique([...fields, 'createdAt'])) {
    clauses.push({ [field]: { $gte: fromText, $lte: toText } });
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endExclusive.getTime())) {
      clauses.push({ [field]: { $gte: startDate, $lt: endExclusive } });
    }
    if (legacyMonthRegex && field !== 'createdAt') {
      clauses.push({ [field]: { $regex: legacyMonthRegex } });
    }
  }

  return clauses.length ? { $match: { $or: clauses } } : null;
}

function salesDashboardProjection() {
  return {
    _id: 1,
    id: 1,
    code: 1,
    orderCode: 1,
    salesOrderCode: 1,
    documentCode: 1,
    invoiceCode: 1,
    orderDate: 1,
    date: 1,
    documentDate: 1,
    createdAt: 1,
    updatedAt: 1,
    modifiedAt: 1,
    stateChangedAt: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    salesmanCode: 1,
    salesmanName: 1,
    nvbhCode: 1,
    nvbhName: 1,
    afterPromoAmount: 1,
    totalAfterPromotion: 1,
    goodsAmountAfterPromotion: 1,
    netAmount: 1,
    totalAmount: 1,
    grandTotal: 1,
    amount: 1,
    total: 1,
    'items.productCode': 1,
    'items.code': 1,
    'items.sku': 1,
    'items.productId': 1,
    'items.barcode': 1,
    'items.quantity': 1,
    'items.qty': 1,
    'items.totalQty': 1,
    'items.stockQuantity': 1,
    'items.baseQuantity': 1,
    'items.lineType': 1,
    'items.type': 1,
    'items.kind': 1,
    'items.itemType': 1,
    'items.isPromo': 1,
    'items.promoQuantity': 1,
    'items.promotionQuantity': 1,
    'items.freeQty': 1,
    'items.freeQuantity': 1,
    'items.soldQuantity': 1,
    'items.saleQuantity': 1,
    'items.lineAmountAtOrder': 1,
    'items.finalAmount': 1,
    'items.netAmount': 1,
    'items.lineAmount': 1,
    'items.amount': 1,
    'items.totalAmount': 1,
    'items.finalPriceAtOrder': 1,
    'items.finalPrice': 1,
    'items.priceAfterTaxAfterPromotion': 1,
    'items.priceAfterPromotion': 1,
    'items.priceAfterDiscount': 1,
    'items.netPrice': 1,
    'items.unitPrice': 1,
    'items.salePrice': 1,
    'items.price': 1,
    'items.catalogSalePriceAtOrder': 1,
    'items.priceAfterTaxBeforePromotionAtOrder': 1,
    'items.listPriceAfterVat': 1,
    'items.productSnapshot.salePrice': 1,
    'items.catalogSalePrice': 1,
    'items.grossPrice': 1,
    'items.originalPrice': 1,
    'items.basePrice': 1,
    'items.listPrice': 1
  };
}

function mapStaffRows(rows = [], amountField) {
  return rows.map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    orderCount: normalizeCount(row.orderCount),
    returnCount: normalizeCount(row.returnCount),
    promotionValue: Math.max(0, normalizeMoney(row.promotionValue)),
    [amountField]: Math.max(0, normalizeMoney(row[amountField]))
  })).filter((row) => row.salesStaffCode || row.salesStaffName || row[amountField] > 0);
}

function itemProductCodeExpression() {
  return firstNonBlankExpression([
    'items.productCode',
    'items.code',
    'items.sku',
    'items.productId',
    'items.barcode'
  ], '');
}

function salesDocumentKeyExpression() {
  return firstNonBlankExpression([
    'code',
    'orderCode',
    'salesOrderCode',
    'documentCode',
    'invoiceCode',
    'id'
  ], { $toString: '$_id' });
}

function returnDocumentKeyExpression() {
  return firstNonBlankExpression([
    'code',
    'returnOrderCode',
    'documentCode',
    'id'
  ], { $toString: '$_id' });
}

function documentVersionExpression() {
  return firstNonBlankExpression([
    'updatedAt',
    'modifiedAt',
    'stateChangedAt',
    'createdAt'
  ], { $toString: '$_id' });
}

function salesQuantityExpression() {
  return numberExpression([
    'items.quantity',
    'items.qty',
    'items.totalQty',
    'items.stockQuantity',
    'items.baseQuantity'
  ], 0);
}

function returnQuantityExpression() {
  return numberExpression([
    'items.returnQty',
    'items.qtyReturn',
    'items.returnQuantity',
    'items.returnedQty',
    'items.quantity',
    'items.qty'
  ], 0);
}

function fieldHasValueExpression(field) {
  return {
    $let: {
      vars: {
        valueAsText: {
          $trim: {
            input: {
              $convert: {
                input: { $ifNull: [`$${field}`, ''] },
                to: 'string',
                onError: '',
                onNull: ''
              }
            }
          }
        }
      },
      in: { $ne: ['$$valueAsText', ''] }
    }
  };
}

function anyFieldHasValueExpression(fields = []) {
  if (!fields.length) return false;
  return { $or: fields.map(fieldHasValueExpression) };
}

function firstDefinedNumberExpression(fields = [], fallback = 0) {
  return fields.reduceRight((next, field) => ({
    $cond: [
      fieldHasValueExpression(field),
      {
        $convert: {
          input: `$${field}`,
          to: 'double',
          onError: 0,
          onNull: 0
        }
      },
      next
    ]
  }), fallback);
}

function firstPositiveNumberExpression(fields = [], fallback = 0) {
  return fields.reduceRight((next, field) => ({
    $let: {
      vars: { current: numberExpression([field], 0) },
      in: {
        $cond: [
          { $gt: ['$$current', 0] },
          '$$current',
          next
        ]
      }
    }
  }), fallback);
}

function lineTypeExpression() {
  return {
    $toUpper: firstNonBlankExpression([
      'items.lineType',
      'items.type',
      'items.kind',
      'items.itemType'
    ], '')
  };
}

function truthyItemExpression(field) {
  return {
    $in: [
      { $toLower: firstNonBlankExpression([field], '') },
      ['true', '1', 'yes', 'y']
    ]
  };
}

function promoLineExpression() {
  return {
    $or: [
      truthyItemExpression('items.isPromo'),
      { $in: [lineTypeExpression(), ['PROMO', 'PROMOTION', 'KM', 'FREE_GOOD', 'FREE GOODS']] },
      {
        $and: [
          {
            $gt: [
              numberExpression([
                'items.promoQuantity',
                'items.promotionQuantity',
                'items.freeQty',
                'items.freeQuantity'
              ], 0),
              0
            ]
          },
          {
            $lte: [
              numberExpression(['items.soldQuantity', 'items.saleQuantity'], 0),
              0
            ]
          }
        ]
      }
    ]
  };
}

function rootActualSalesAmountExpression() {
  return firstPositiveNumberExpression([
    'afterPromoAmount',
    'totalAfterPromotion',
    'goodsAmountAfterPromotion',
    'netAmount',
    'totalAmount',
    'grandTotal',
    'amount',
    'total'
  ], 0);
}

function lineExplicitSalesAmountExpression() {
  return firstDefinedNumberExpression([
    'items.lineAmountAtOrder',
    'items.finalAmount',
    'items.netAmount',
    'items.lineAmount',
    'items.amount',
    'items.totalAmount'
  ], 0);
}

function lineActualSalePriceExpression() {
  return firstDefinedNumberExpression([
    'items.finalPriceAtOrder',
    'items.finalPrice',
    'items.priceAfterTaxAfterPromotion',
    'items.priceAfterPromotion',
    'items.priceAfterDiscount',
    'items.netPrice',
    'items.unitPrice',
    'items.salePrice',
    'items.price'
  ], 0);
}

function historicalCatalogSalePriceExpression() {
  return firstPositiveNumberExpression([
    'items.catalogSalePriceAtOrder',
    'items.priceAfterTaxBeforePromotionAtOrder',
    'items.listPriceAfterVat',
    'items.productSnapshot.salePrice',
    'items.catalogSalePrice',
    'items.grossPrice',
    'items.originalPrice',
    'items.basePrice',
    'items.listPrice'
  ], 0);
}

function currentProductSalePriceExpression() {
  return firstPositiveNumberExpression([
    '_dashboardProduct.salePrice',
    '_dashboardProduct.price',
    '_dashboardProduct.sellPrice',
    '_dashboardProduct.giaBan'
  ], 0);
}

function lineValuationStages(quantityExpression, options = {}) {
  const explicitAmountFields = options.explicitAmountFields || [];
  const actualPriceFields = options.actualPriceFields || [];
  const explicitAmountExpression = options.explicitAmountExpression;
  const actualPriceExpression = options.actualPriceExpression;

  return [
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    {
      $set: {
        _dashboardProductCode: itemProductCodeExpression(),
        _dashboardQuantity: quantityExpression,
        _dashboardIsPromo: promoLineExpression(),
        _dashboardHasExplicitAmount: anyFieldHasValueExpression(explicitAmountFields),
        _dashboardExplicitAmount: explicitAmountExpression,
        _dashboardHasActualUnitPrice: anyFieldHasValueExpression(actualPriceFields),
        _dashboardActualUnitPrice: actualPriceExpression,
        _dashboardHistoricalCatalogPrice: historicalCatalogSalePriceExpression()
      }
    },
    {
      $match: {
        _dashboardProductCode: { $ne: '' },
        _dashboardQuantity: { $gt: 0 }
      }
    },
    {
      $lookup: {
        from: Product.collection.name,
        let: { productCode: '$_dashboardProductCode' },
        pipeline: [
          { $match: { $expr: { $eq: ['$code', '$$productCode'] } } },
          { $project: { code: 1, salePrice: 1, price: 1, sellPrice: 1, giaBan: 1 } }
        ],
        as: '_dashboardProductMatches'
      }
    },
    {
      $set: {
        _dashboardProduct: { $arrayElemAt: ['$_dashboardProductMatches', 0] }
      }
    },
    {
      $set: {
        _dashboardCurrentCatalogPrice: currentProductSalePriceExpression()
      }
    },
    {
      $set: {
        _dashboardResolvedCatalogPrice: {
          $cond: [
            { $gt: ['$_dashboardHistoricalCatalogPrice', 0] },
            '$_dashboardHistoricalCatalogPrice',
            '$_dashboardCurrentCatalogPrice'
          ]
        },
        _dashboardResolvedActualUnitPrice: {
          $cond: [
            '$_dashboardHasActualUnitPrice',
            { $max: [0, '$_dashboardActualUnitPrice'] },
            {
              $cond: [
                { $gt: ['$_dashboardHistoricalCatalogPrice', 0] },
                '$_dashboardHistoricalCatalogPrice',
                '$_dashboardCurrentCatalogPrice'
              ]
            }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardActualLineAmount: {
          $cond: [
            '$_dashboardIsPromo',
            0,
            {
              $round: [
                {
                  $cond: [
                    '$_dashboardHasExplicitAmount',
                    { $max: [0, '$_dashboardExplicitAmount'] },
                    { $multiply: ['$_dashboardQuantity', '$_dashboardResolvedActualUnitPrice'] }
                  ]
                },
                0
              ]
            }
          ]
        },
        _dashboardCatalogLineAmount: {
          $round: [
            { $multiply: ['$_dashboardQuantity', '$_dashboardResolvedCatalogPrice'] },
            0
          ]
        },
        _dashboardMissingProduct: {
          $eq: [{ $ifNull: ['$_dashboardProduct._id', null] }, null]
        },
        _dashboardUsedSnapshotFallback: {
          $and: [
            { $eq: ['$_dashboardIsPromo', false] },
            { $eq: ['$_dashboardHasExplicitAmount', false] },
            { $eq: ['$_dashboardHasActualUnitPrice', false] },
            { $gt: ['$_dashboardHistoricalCatalogPrice', 0] }
          ]
        },
        _dashboardUsedCurrentPriceFallback: {
          $and: [
            { $eq: ['$_dashboardIsPromo', false] },
            { $eq: ['$_dashboardHasExplicitAmount', false] },
            { $eq: ['$_dashboardHasActualUnitPrice', false] },
            { $lte: ['$_dashboardHistoricalCatalogPrice', 0] },
            { $gt: ['$_dashboardCurrentCatalogPrice', 0] }
          ]
        }
      }
    },
    {
      $set: {
        _dashboardPromotionValue: {
          $cond: [
            '$_dashboardIsPromo',
            '$_dashboardCatalogLineAmount',
            {
              $max: [
                0,
                { $subtract: ['$_dashboardCatalogLineAmount', '$_dashboardActualLineAmount'] }
              ]
            }
          ]
        },
        _dashboardMissingActualValue: {
          $and: [
            { $eq: ['$_dashboardIsPromo', false] },
            { $eq: ['$_dashboardHasExplicitAmount', false] },
            { $eq: ['$_dashboardHasActualUnitPrice', false] },
            { $lte: ['$_dashboardHistoricalCatalogPrice', 0] },
            { $lte: ['$_dashboardCurrentCatalogPrice', 0] }
          ]
        },
        _dashboardCurrentCatalogUsedForReference: {
          $and: [
            { $lte: ['$_dashboardHistoricalCatalogPrice', 0] },
            { $gt: ['$_dashboardCurrentCatalogPrice', 0] }
          ]
        }
      }
    }
  ];
}

function normalizeAccountingScope(options = {}) {
  const explicit = String(options.accountingScope || '').trim().toLowerCase();
  if (Object.values(ACCOUNTING_SCOPES).includes(explicit)) return explicit;
  return options.requireAccountingConfirmed === false
    ? ACCOUNTING_SCOPES.ACTIVE
    : ACCOUNTING_SCOPES.CONFIRMED;
}

function accountingScopeFilter(scope) {
  if (scope === ACCOUNTING_SCOPES.CONFIRMED) return accountingConfirmedFilter();
  if (scope === ACCOUNTING_SCOPES.PENDING) return { $nor: [accountingConfirmedFilter()] };
  return null;
}

function salesDocumentAggregationStages() {
  return [
    {
      $group: {
        _id: { documentId: '$_id' },
        businessKey: { $first: '$_dashboardBusinessKey' },
        versionSort: { $first: '$_dashboardVersionSort' },
        code: { $first: salesStaffCodeExpression() },
        name: { $first: salesStaffNameExpression() },
        rootActualAmount: { $first: '$_dashboardRootActualAmount' },
        lineActualAmount: {
          $sum: { $cond: [{ $eq: ['$_dashboardIsPromo', false] }, '$_dashboardActualLineAmount', 0] }
        },
        promotionValue: { $sum: '$_dashboardPromotionValue' },
        saleLineCount: { $sum: { $cond: [{ $eq: ['$_dashboardIsPromo', false] }, 1, 0] } },
        promoLineCount: { $sum: { $cond: ['$_dashboardIsPromo', 1, 0] } },
        itemCount: { $sum: 1 },
        missingProductItemCount: { $sum: { $cond: ['$_dashboardMissingProduct', 1, 0] } },
        missingActualValueItemCount: { $sum: { $cond: ['$_dashboardMissingActualValue', 1, 0] } },
        snapshotFallbackItemCount: { $sum: { $cond: ['$_dashboardUsedSnapshotFallback', 1, 0] } },
        currentPriceFallbackItemCount: { $sum: { $cond: ['$_dashboardUsedCurrentPriceFallback', 1, 0] } },
        currentCatalogReferenceItemCount: { $sum: { $cond: ['$_dashboardCurrentCatalogUsedForReference', 1, 0] } }
      }
    },
    {
      $set: {
        salesAmount: {
          $cond: [
            { $gt: ['$rootActualAmount', 0] },
            '$rootActualAmount',
            '$lineActualAmount'
          ]
        },
        rootLineMismatch: {
          $and: [
            { $gt: ['$rootActualAmount', 0] },
            { $gt: ['$lineActualAmount', 0] },
            { $gt: [{ $abs: { $subtract: ['$rootActualAmount', '$lineActualAmount'] } }, 1] }
          ]
        }
      }
    },
    { $match: { saleLineCount: { $gt: 0 } } },
    { $sort: { businessKey: 1, versionSort: -1, '_id.documentId': -1 } },
    {
      $group: {
        _id: '$businessKey',
        selected: { $first: '$$ROOT' },
        documentCount: { $sum: 1 },
        duplicateGroupSalesAmount: { $sum: '$salesAmount' }
      }
    },
    {
      $set: {
        'selected.duplicateDocumentCount': {
          $max: [0, { $subtract: ['$documentCount', 1] }]
        },
        'selected.duplicateDiscardedAmount': {
          $max: [0, { $subtract: ['$duplicateGroupSalesAmount', '$selected.salesAmount'] }]
        }
      }
    },
    { $replaceRoot: { newRoot: '$selected' } }
  ];
}

function salesFacetStage() {
  return {
    $facet: {
      byStaff: [
        {
          $group: {
            _id: { code: '$code', name: '$name' },
            orderCount: { $sum: 1 },
            salesAmount: { $sum: '$salesAmount' },
            promotionValue: { $sum: '$promotionValue' }
          }
        },
        { $sort: { '_id.name': 1, '_id.code': 1 } }
      ],
      totals: [
        {
          $group: {
            _id: null,
            orderCount: { $sum: 1 },
            salesAmount: { $sum: '$salesAmount' },
            promotionValue: { $sum: '$promotionValue' },
            itemCount: { $sum: '$itemCount' },
            saleLineCount: { $sum: '$saleLineCount' },
            promoLineCount: { $sum: '$promoLineCount' },
            missingProductItemCount: { $sum: '$missingProductItemCount' },
            missingActualValueItemCount: { $sum: '$missingActualValueItemCount' },
            snapshotFallbackItemCount: { $sum: '$snapshotFallbackItemCount' },
            currentPriceFallbackItemCount: { $sum: '$currentPriceFallbackItemCount' },
            currentCatalogReferenceItemCount: { $sum: '$currentCatalogReferenceItemCount' },
            rootLineMismatchOrderCount: { $sum: { $cond: ['$rootLineMismatch', 1, 0] } },
            duplicateGroupCount: { $sum: { $cond: [{ $gt: ['$duplicateDocumentCount', 0] }, 1, 0] } },
            duplicateDocumentCount: { $sum: '$duplicateDocumentCount' },
            duplicateDiscardedAmount: { $sum: '$duplicateDiscardedAmount' }
          }
        }
      ]
    }
  };
}

function buildActualSalesPipeline(dateFrom, dateTo, options = {}) {
  const accountingScope = normalizeAccountingScope(options);
  const matchFilters = [activeDocumentFilter()];
  const scopeFilter = accountingScopeFilter(accountingScope);
  if (scopeFilter) matchFilters.push(scopeFilter);

  const explicitAmountFields = [
    'items.lineAmountAtOrder',
    'items.finalAmount',
    'items.netAmount',
    'items.lineAmount',
    'items.amount',
    'items.totalAmount'
  ];
  const actualPriceFields = [
    'items.finalPriceAtOrder',
    'items.finalPrice',
    'items.priceAfterTaxAfterPromotion',
    'items.priceAfterPromotion',
    'items.priceAfterDiscount',
    'items.netPrice',
    'items.unitPrice',
    'items.salePrice',
    'items.price'
  ];

  const salesDatePrefilter = dateRangePrefilter(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']);
  const earlyMatchFilters = [...matchFilters];
  if (salesDatePrefilter?.$match) earlyMatchFilters.push(salesDatePrefilter.$match);

  return [
    { $match: { $and: earlyMatchFilters } },
    { $project: salesDashboardProjection() },
    ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
    {
      $set: {
        _dashboardBusinessKey: salesDocumentKeyExpression(),
        _dashboardVersionSort: documentVersionExpression(),
        _dashboardRootActualAmount: rootActualSalesAmountExpression()
      }
    },
    ...lineValuationStages(salesQuantityExpression(), {
      explicitAmountFields,
      actualPriceFields,
      explicitAmountExpression: lineExplicitSalesAmountExpression(),
      actualPriceExpression: lineActualSalePriceExpression()
    }),
    ...salesDocumentAggregationStages(),
    salesFacetStage()
  ];
}

// Tên cũ được giữ như alias để các module ngoài Dashboard không bị gãy sau deploy.
function buildCatalogSalesPipeline(dateFrom, dateTo, options = {}) {
  return buildActualSalesPipeline(dateFrom, dateTo, options);
}

async function aggregateSales(dateFrom, dateTo, options = {}) {
  const accountingScope = normalizeAccountingScope(options);
  const result = await SalesOrder.aggregate(
    buildActualSalesPipeline(dateFrom, dateTo, { ...options, accountingScope })
  ).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'salesAmount'),
    totals: {
      orderCount: normalizeCount(totals.orderCount),
      salesAmount: Math.max(0, normalizeMoney(totals.salesAmount)),
      promotionValue: Math.max(0, normalizeMoney(totals.promotionValue))
    },
    dataQuality: {
      itemCount: normalizeCount(totals.itemCount),
      saleLineCount: normalizeCount(totals.saleLineCount),
      promoLineCount: normalizeCount(totals.promoLineCount),
      missingProductItemCount: normalizeCount(totals.missingProductItemCount),
      missingActualValueItemCount: normalizeCount(totals.missingActualValueItemCount),
      snapshotFallbackItemCount: normalizeCount(totals.snapshotFallbackItemCount),
      currentPriceFallbackItemCount: normalizeCount(totals.currentPriceFallbackItemCount),
      currentCatalogReferenceItemCount: normalizeCount(totals.currentCatalogReferenceItemCount),
      rootLineMismatchOrderCount: normalizeCount(totals.rootLineMismatchOrderCount),
      duplicateGroupCount: normalizeCount(totals.duplicateGroupCount),
      duplicateDocumentCount: normalizeCount(totals.duplicateDocumentCount),
      duplicateDiscardedAmount: Math.max(0, normalizeMoney(totals.duplicateDiscardedAmount)),
      promotionValue: Math.max(0, normalizeMoney(totals.promotionValue))
    },
    source: `mongo:orders:actual-order-value:${accountingScope}`
  };
}

function rootReturnAmountExpression() {
  return firstPositiveNumberExpression([
    'returnAmount',
    'totalReturnAmount',
    'totalAmount',
    'amount',
    'debtReduction'
  ], 0);
}

function lineExplicitReturnAmountExpression() {
  return firstDefinedNumberExpression([
    'items.returnAmount',
    'items.amount',
    'items.lineAmountAtOrder',
    'items.lineAmount',
    'items.totalAmount'
  ], 0);
}

function lineActualReturnPriceExpression() {
  return firstDefinedNumberExpression([
    'items.unitPrice',
    'items.price',
    'items.salePrice',
    'items.finalPriceAtOrder',
    'items.finalPrice',
    'items.priceAfterPromotion',
    'items.priceAfterDiscount'
  ], 0);
}

function returnDocumentAggregationStages() {
  return [
    {
      $group: {
        _id: { documentId: '$_id' },
        businessKey: { $first: '$_dashboardBusinessKey' },
        versionSort: { $first: '$_dashboardVersionSort' },
        code: { $first: salesStaffCodeExpression() },
        name: { $first: salesStaffNameExpression() },
        rootReturnAmount: { $first: '$_dashboardRootReturnAmount' },
        lineReturnAmount: {
          $sum: { $cond: [{ $eq: ['$_dashboardIsPromo', false] }, '$_dashboardActualLineAmount', 0] }
        },
        returnLineCount: { $sum: { $cond: [{ $eq: ['$_dashboardIsPromo', false] }, 1, 0] } },
        promoLineCount: { $sum: { $cond: ['$_dashboardIsPromo', 1, 0] } },
        itemCount: { $sum: 1 },
        missingProductItemCount: { $sum: { $cond: ['$_dashboardMissingProduct', 1, 0] } },
        missingActualValueItemCount: { $sum: { $cond: ['$_dashboardMissingActualValue', 1, 0] } },
        snapshotFallbackItemCount: { $sum: { $cond: ['$_dashboardUsedSnapshotFallback', 1, 0] } },
        currentPriceFallbackItemCount: { $sum: { $cond: ['$_dashboardUsedCurrentPriceFallback', 1, 0] } }
      }
    },
    {
      $set: {
        returnAmount: {
          $cond: [
            { $gt: ['$rootReturnAmount', 0] },
            '$rootReturnAmount',
            '$lineReturnAmount'
          ]
        },
        rootLineMismatch: {
          $and: [
            { $gt: ['$rootReturnAmount', 0] },
            { $gt: ['$lineReturnAmount', 0] },
            { $gt: [{ $abs: { $subtract: ['$rootReturnAmount', '$lineReturnAmount'] } }, 1] }
          ]
        }
      }
    },
    { $match: { returnLineCount: { $gt: 0 } } },
    { $sort: { businessKey: 1, versionSort: -1, '_id.documentId': -1 } },
    {
      $group: {
        _id: '$businessKey',
        selected: { $first: '$$ROOT' },
        documentCount: { $sum: 1 },
        duplicateGroupReturnAmount: { $sum: '$returnAmount' }
      }
    },
    {
      $set: {
        'selected.duplicateDocumentCount': {
          $max: [0, { $subtract: ['$documentCount', 1] }]
        },
        'selected.duplicateDiscardedAmount': {
          $max: [0, { $subtract: ['$duplicateGroupReturnAmount', '$selected.returnAmount'] }]
        }
      }
    },
    { $replaceRoot: { newRoot: '$selected' } }
  ];
}

function buildActualReturnsPipeline(dateFrom, dateTo) {
  const explicitAmountFields = [
    'items.returnAmount',
    'items.amount',
    'items.lineAmountAtOrder',
    'items.lineAmount',
    'items.totalAmount'
  ];
  const actualPriceFields = [
    'items.unitPrice',
    'items.price',
    'items.salePrice',
    'items.finalPriceAtOrder',
    'items.finalPrice',
    'items.priceAfterPromotion',
    'items.priceAfterDiscount'
  ];

  return [
    { $match: { $and: [activeDocumentFilter(), returnConfirmedFilter()] } },
    ...businessDateStages(dateFrom, dateTo, ['returnDate', 'documentDate', 'date', 'deliveryDate']),
    {
      $set: {
        _dashboardBusinessKey: returnDocumentKeyExpression(),
        _dashboardVersionSort: documentVersionExpression(),
        _dashboardRootReturnAmount: rootReturnAmountExpression()
      }
    },
    ...lineValuationStages(returnQuantityExpression(), {
      explicitAmountFields,
      actualPriceFields,
      explicitAmountExpression: lineExplicitReturnAmountExpression(),
      actualPriceExpression: lineActualReturnPriceExpression()
    }),
    ...returnDocumentAggregationStages(),
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: { code: '$code', name: '$name' },
              returnCount: { $sum: 1 },
              returnAmount: { $sum: '$returnAmount' }
            }
          },
          { $sort: { '_id.name': 1, '_id.code': 1 } }
        ],
        totals: [
          {
            $group: {
              _id: null,
              returnCount: { $sum: 1 },
              returnAmount: { $sum: '$returnAmount' },
              itemCount: { $sum: '$itemCount' },
              returnLineCount: { $sum: '$returnLineCount' },
              promoLineCount: { $sum: '$promoLineCount' },
              missingProductItemCount: { $sum: '$missingProductItemCount' },
              missingActualValueItemCount: { $sum: '$missingActualValueItemCount' },
              snapshotFallbackItemCount: { $sum: '$snapshotFallbackItemCount' },
              currentPriceFallbackItemCount: { $sum: '$currentPriceFallbackItemCount' },
              rootLineMismatchOrderCount: { $sum: { $cond: ['$rootLineMismatch', 1, 0] } },
              duplicateGroupCount: { $sum: { $cond: [{ $gt: ['$duplicateDocumentCount', 0] }, 1, 0] } },
              duplicateDocumentCount: { $sum: '$duplicateDocumentCount' },
              duplicateDiscardedAmount: { $sum: '$duplicateDiscardedAmount' }
            }
          }
        ]
      }
    }
  ];
}

function buildCatalogReturnsPipeline(dateFrom, dateTo) {
  return buildActualReturnsPipeline(dateFrom, dateTo);
}

async function aggregateReturns(dateFrom, dateTo) {
  const result = await ReturnOrder.aggregate(
    buildActualReturnsPipeline(dateFrom, dateTo)
  ).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'returnAmount'),
    totals: {
      returnCount: normalizeCount(totals.returnCount),
      returnAmount: Math.max(0, normalizeMoney(totals.returnAmount))
    },
    dataQuality: {
      itemCount: normalizeCount(totals.itemCount),
      returnLineCount: normalizeCount(totals.returnLineCount),
      promoLineCount: normalizeCount(totals.promoLineCount),
      missingProductItemCount: normalizeCount(totals.missingProductItemCount),
      missingActualValueItemCount: normalizeCount(totals.missingActualValueItemCount),
      snapshotFallbackItemCount: normalizeCount(totals.snapshotFallbackItemCount),
      currentPriceFallbackItemCount: normalizeCount(totals.currentPriceFallbackItemCount),
      rootLineMismatchOrderCount: normalizeCount(totals.rootLineMismatchOrderCount),
      duplicateGroupCount: normalizeCount(totals.duplicateGroupCount),
      duplicateDocumentCount: normalizeCount(totals.duplicateDocumentCount),
      duplicateDiscardedAmount: Math.max(0, normalizeMoney(totals.duplicateDiscardedAmount))
    },
    source: 'mongo:returnOrders:actual-return-value:accounting-confirmed'
  };
}

module.exports = {
  ACCOUNTING_SCOPES,
  itemProductCodeExpression,
  salesQuantityExpression,
  returnQuantityExpression,
  promoLineExpression,
  historicalCatalogSalePriceExpression,
  buildActualSalesPipeline,
  buildCatalogSalesPipeline,
  buildActualReturnsPipeline,
  buildCatalogReturnsPipeline,
  aggregateSales,
  aggregateReturns
};
