'use strict';

module.exports = {
  order: {
    id: 'SO-B0040961',
    _id: 'SO-B0040961',
    orderId: 'SO-B0040961',
    orderCode: 'B0040961',
    salesOrderId: 'SO-B0040961',
    salesOrderCode: 'B0040961',
    customerCode: 'FIXTURE-CUSTOMER',
    customerName: 'B0040961 fixture',
    totalAmount: 1931784,
    cashAmount: 0,
    cashCollected: 0,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    status: 'delivered',
    deliveryStatus: 'delivered',
    items: [
      {
        productCode: 'FIXTURE-SKU',
        productName: 'Fixture product',
        quantity: 1,
        salePrice: 1931784
      }
    ]
  },
  allocation: {
    id: 'OPA-B0040961-V1',
    allocationCode: 'OPA-B0040961-V1',
    orderId: 'SO-B0040961',
    orderCode: 'B0040961',
    salesOrderId: 'SO-B0040961',
    salesOrderCode: 'B0040961',
    status: 'posted',
    active: true,
    sourceVersion: 1,
    receivableAmount: 1931784,
    cashAmount: 1932000,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    debtAmount: 0
  },
  closeoutVersion: {
    id: 'DCV-B0040961-V1',
    code: 'DCV-B0040961-V1',
    orderId: 'SO-B0040961',
    orderCode: 'B0040961',
    salesOrderId: 'SO-B0040961',
    salesOrderCode: 'B0040961',
    status: 'accounting_confirmed',
    closeoutVersion: 1,
    sourceVersion: 1,
    originalAmount: 1931784,
    cashAmount: 1932000,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 0,
    finalDebtAmount: 0
  },
  returnItems: [
    {
      productCode: 'FIXTURE-SKU',
      productName: 'Fixture product',
      returnQty: 1,
      salePrice: 1931784,
      returnAmount: 1931784
    }
  ]
};
