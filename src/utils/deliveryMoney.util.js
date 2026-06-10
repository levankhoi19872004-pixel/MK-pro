'use strict';

function toNumber(v) {
  const n = Number(String(v ?? 0).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeDeliveryMoney(input = {}) {
  return {
    cashAmount: toNumber(input.cashAmount ?? input.cashCollected ?? input.cash ?? 0),
    bankAmount: toNumber(input.bankAmount ?? input.bankCollected ?? input.transferAmount ?? input.bank ?? 0),
    rewardAmount: toNumber(input.rewardAmount ?? input.bonusAmount ?? input.displayRewardAmount ?? input.reward ?? 0)
  };
}

function readDeliveryMoney(order = {}) {
  return {
    cashAmount: toNumber(order.cashAmount ?? order.cashCollected ?? 0),
    bankAmount: toNumber(order.bankAmount ?? order.bankCollected ?? order.transferAmount ?? 0),
    rewardAmount: toNumber(order.rewardAmount ?? order.bonusAmount ?? order.displayRewardAmount ?? 0)
  };
}

function withDeliveryMoneyAliases(order = {}) {
  const money = readDeliveryMoney(order);
  return {
    ...order,
    cashAmount: money.cashAmount,
    bankAmount: money.bankAmount,
    rewardAmount: money.rewardAmount,
    cashCollected: money.cashAmount,
    bankCollected: money.bankAmount,
    transferAmount: money.bankAmount,
    bonusAmount: money.rewardAmount,
    displayRewardAmount: money.rewardAmount
  };
}

module.exports = {
  toNumber,
  normalizeDeliveryMoney,
  readDeliveryMoney,
  withDeliveryMoneyAliases
};
