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

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function normalizeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function mapStaffRows(rows = [], amountField) {
  return rows.map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    orderCount: normalizeMoney(row.orderCount),
    returnCount: normalizeMoney(row.returnCount),
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

function productCatalogSalePriceExpression() {
  // Chỉ lấy giá đang lưu tại danh mục sản phẩm. Không fallback sang giá thực bán
  // hoặc amount/totalAmount trên đơn để Dashboard không bị ảnh hưởng bởi khuyến mại.
  return numberExpression([
    '_dashboardProduct.salePrice',
    '_dashboardProduct.price',
    '_dashboardProduct.sellPrice',
    '_dashboardProduct.giaBan'
  ], 0);
}

function catalogLineStages(quantityExpression) {
  return [
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    {
      $set: {
        _dashboardProductCode: itemProductCodeExpression(),
        _dashboardQuantity: quantityExpression
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
        localField: '_dashboardProductCode',
        foreignField: 'code',
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
        _dashboardCatalogSalePrice: productCatalogSalePriceExpression()
      }
    },
    {
      $set: {
        _dashboardCatalogAmount: {
          $round: [
            { $multiply: ['$_dashboardQuantity', '$_dashboardCatalogSalePrice'] },
            0
          ]
        },
        _dashboardMissingProduct: {
          $eq: [{ $ifNull: ['$_dashboardProduct._id', null] }, null]
        }
      }
    },
    {
      $set: {
        _dashboardZeroCatalogPrice: {
          $and: [
            { $eq: ['$_dashboardMissingProduct', false] },
            { $lte: ['$_dashboardCatalogSalePrice', 0] }
          ]
        }
      }
    }
  ];
}

function buildCatalogSalesPipeline(dateFrom, dateTo, options = {}) {
  const requireAccountingConfirmed = options.requireAccountingConfirmed !== false;
  const matchFilters = [activeDocumentFilter()];
  if (requireAccountingConfirmed) matchFilters.push(accountingConfirmedFilter());

  return [
    { $match: { $and: matchFilters } },
    ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
    ...catalogLineStages(salesQuantityExpression()),
    {
      $group: {
        _id: {
          documentId: '$_id',
          code: salesStaffCodeExpression(),
          name: salesStaffNameExpression()
        },
        salesAmount: { $sum: '$_dashboardCatalogAmount' },
        itemCount: { $sum: 1 },
        missingProductItemCount: { $sum: { $cond: ['$_dashboardMissingProduct', 1, 0] } },
        zeroSalePriceItemCount: { $sum: { $cond: ['$_dashboardZeroCatalogPrice', 1, 0] } }
      }
    },
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: {
                code: '$_id.code',
                name: '$_id.name'
              },
              orderCount: { $sum: 1 },
              salesAmount: { $sum: '$salesAmount' }
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
              itemCount: { $sum: '$itemCount' },
              missingProductItemCount: { $sum: '$missingProductItemCount' },
              zeroSalePriceItemCount: { $sum: '$zeroSalePriceItemCount' }
            }
          }
        ]
      }
    }
  ];
}

async function aggregateSales(dateFrom, dateTo, options = {}) {
  const requireAccountingConfirmed = options.requireAccountingConfirmed !== false;
  const result = await SalesOrder.aggregate(
    buildCatalogSalesPipeline(dateFrom, dateTo, { requireAccountingConfirmed })
  ).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'salesAmount'),
    totals: {
      orderCount: normalizeMoney(totals.orderCount),
      salesAmount: Math.max(0, normalizeMoney(totals.salesAmount))
    },
    dataQuality: {
      itemCount: normalizeCount(totals.itemCount),
      missingProductItemCount: normalizeCount(totals.missingProductItemCount),
      zeroSalePriceItemCount: normalizeCount(totals.zeroSalePriceItemCount)
    },
    source: requireAccountingConfirmed
      ? 'mongo:orders:catalog-sale-price:accounting-confirmed'
      : 'mongo:orders:catalog-sale-price:active'
  };
}

function buildCatalogReturnsPipeline(dateFrom, dateTo) {
  return [
    {
      $match: {
        $and: [activeDocumentFilter(), returnConfirmedFilter()]
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['returnDate', 'documentDate', 'date', 'deliveryDate']),
    ...catalogLineStages(returnQuantityExpression()),
    {
      $group: {
        _id: {
          documentId: '$_id',
          code: salesStaffCodeExpression(),
          name: salesStaffNameExpression()
        },
        returnAmount: { $sum: '$_dashboardCatalogAmount' },
        itemCount: { $sum: 1 },
        missingProductItemCount: { $sum: { $cond: ['$_dashboardMissingProduct', 1, 0] } },
        zeroSalePriceItemCount: { $sum: { $cond: ['$_dashboardZeroCatalogPrice', 1, 0] } }
      }
    },
    {
      $facet: {
        byStaff: [
          {
            $group: {
              _id: {
                code: '$_id.code',
                name: '$_id.name'
              },
              returnCount: { $sum: 1 },
              returnAmount: { $sum: '$returnAmount' }
            }
          }
        ],
        totals: [
          {
            $group: {
              _id: null,
              returnCount: { $sum: 1 },
              returnAmount: { $sum: '$returnAmount' },
              itemCount: { $sum: '$itemCount' },
              missingProductItemCount: { $sum: '$missingProductItemCount' },
              zeroSalePriceItemCount: { $sum: '$zeroSalePriceItemCount' }
            }
          }
        ]
      }
    }
  ];
}

async function aggregateReturns(dateFrom, dateTo) {
  const result = await ReturnOrder.aggregate(
    buildCatalogReturnsPipeline(dateFrom, dateTo)
  ).allowDiskUse(true).exec();

  const facet = result?.[0] || {};
  const totals = facet.totals?.[0] || {};
  return {
    rows: mapStaffRows(facet.byStaff, 'returnAmount'),
    totals: {
      returnCount: normalizeMoney(totals.returnCount),
      returnAmount: Math.max(0, normalizeMoney(totals.returnAmount))
    },
    dataQuality: {
      itemCount: normalizeCount(totals.itemCount),
      missingProductItemCount: normalizeCount(totals.missingProductItemCount),
      zeroSalePriceItemCount: normalizeCount(totals.zeroSalePriceItemCount)
    },
    source: 'mongo:returnOrders:catalog-sale-price:accounting-confirmed'
  };
}

module.exports = {
  itemProductCodeExpression,
  salesQuantityExpression,
  returnQuantityExpression,
  productCatalogSalePriceExpression,
  buildCatalogSalesPipeline,
  buildCatalogReturnsPipeline,
  aggregateSales,
  aggregateReturns
};
