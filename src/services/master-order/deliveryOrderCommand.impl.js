'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const deliveryFinance = require('../../utils/deliveryFinance.util');
const { normalizeDeliveryMoney, readDeliveryMoney } = require('../../utils/deliveryMoney.util');
const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');

const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const findReturnOrdersForDeliveryChildren = lazyFunction('./masterOrderReturn.impl', 'findReturnOrdersForDeliveryChildren');
const getLockedReturnOrderForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'getLockedReturnOrderForSalesOrder');
const returnAmountForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'returnAmountForSalesOrder');
const returnItemsForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'returnItemsForSalesOrder');
const returnOrderTotalAmount = lazyFunction('./masterOrderReturn.impl', 'returnOrderTotalAmount');
const syncErpDeliveryReturnOrder = lazyFunction('./masterOrderReturn.impl', 'syncErpDeliveryReturnOrder');
const isAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingConfirmed');
const isAccountingReopenPending = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingReopenPending');
const isDeliveryCompletedStatus = lazyFunction('./deliveryAccountingCore.impl', 'isDeliveryCompletedStatus');
const orderDebtLifecycleStatus = lazyFunction('./deliveryAccountingCore.impl', 'orderDebtLifecycleStatus');
const addDebtToCustomerIfNeeded = lazyFunction('./deliveryAccountingCore.impl', 'addDebtToCustomerIfNeeded');
const postDeliveryArIfAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'postDeliveryArIfAccountingConfirmed');

async function updateDeliveryTodayOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể chỉnh sửa giao hàng', status: 400 };
  if (isAccountingConfirmed(current) && !isAccountingReopenPending(current)) return { error: 'Kế toán đã xác nhận, đơn giao đã khóa. Admin phải bấm mở khóa điều chỉnh trước khi sửa', status: 400 };

  const debtBeforeCollection = deliveryFinance.deliveryDebtBase({ ...current, ...body });
  const currentMoney = readDeliveryMoney(current);
  const bodyMoney = normalizeDeliveryMoney(body);
  const hasMoneyInput = body.cashAmount !== undefined
    || body.bankAmount !== undefined
    || body.rewardAmount !== undefined
    || body.cashCollected !== undefined
    || body.bankCollected !== undefined
    || body.transferAmount !== undefined
    || body.bonusAmount !== undefined
    || body.displayRewardAmount !== undefined;
  const cashCollected = hasMoneyInput ? bodyMoney.cashAmount : currentMoney.cashAmount;
  const bankCollected = hasMoneyInput ? bodyMoney.bankAmount : currentMoney.bankAmount;
  const rewardAmount = hasMoneyInput ? bodyMoney.rewardAmount : currentMoney.rewardAmount;

  // Danh sách trả hàng trên phần mềm là read-only. Nguồn chuẩn luôn là returnOrders,
  // không nhận returnItems/returnAmount từ form web để tránh ghi đè dữ liệu app giao hàng.
  // V45 speed fix: chỉ query returnOrders theo đúng đơn đang sửa, không load toàn bộ collection.
  const relatedReturnOrders = await findReturnOrdersForDeliveryChildren([current]);
  const lockedReturnOrder = getLockedReturnOrderForSalesOrder(relatedReturnOrders, current);
  const syncedReturnItems = returnItemsForSalesOrder(relatedReturnOrders, current);
  const syncedReturnAmount = returnAmountForSalesOrder(relatedReturnOrders, current);
  if (Array.isArray(body.returnItems)) {
    return { error: 'Danh sách hàng trả chỉ được sửa trên app giao hàng. Phần mềm chỉ xem/duyệt và không được ghi đè returnOrders.', status: 400 };
  }
  const effectiveReturnItems = lockedReturnOrder ? returnItemsForSalesOrder([lockedReturnOrder], current) : syncedReturnItems;
  const effectiveReturnAmount = lockedReturnOrder ? returnOrderTotalAmount(lockedReturnOrder) : syncedReturnAmount;

  // Chặn nghiệp vụ trả vượt phải thu ngay tại service để tránh âm công nợ/AR Ledger sai,
  // kể cả khi người dùng bỏ qua kiểm tra ở giao diện.
  const totalEntered = Math.round(cashCollected + bankCollected + effectiveReturnAmount + rewardAmount);
  const receivable = Math.round(debtBeforeCollection);
  if ((totalEntered - receivable) > DEBT_ZERO_TOLERANCE) {
    const overAmount = totalEntered - receivable;
    return {
      error: `Khách đang trả vượt số phải thu\n\nPhải thu: ${receivable.toLocaleString('vi-VN')}\nĐã nhập: ${totalEntered.toLocaleString('vi-VN')}\n\nVượt: ${overAmount.toLocaleString('vi-VN')}\n\n[Quay lại chỉnh]`,
      status: 400
    };
  }

  // Công thức chuẩn duy nhất cho toàn bộ luồng giao hàng:
  // Còn nợ = Phải thu - Tiền mặt - Chuyển khoản - Trả thưởng - Tổng tiền hàng trả
  let debtAmount = deliveryFinance.calculateDeliveryDebt({ debtBeforeCollection, cashAmount: cashCollected, bankAmount: bankCollected, returnAmount: effectiveReturnAmount, rewardAmount });
  debtAmount = Math.max(0, normalizeDebtAmount(debtAmount));
  const deliveryStatus = String(body.deliveryStatus || current.deliveryStatus || 'waiting').trim();

  const updated = {
    ...current,
    deliveryDate: dateUtil.toDateOnly(body.deliveryDate || current.deliveryDate || current.date || dateUtil.todayVN()),
    deliveryStatus,
    status: deliveryStatus === 'delivered' ? 'delivered' : (current.status || 'posted'),
    deliveryStaffCode: String(body.deliveryStaffCode ?? current.deliveryStaffCode ?? '').trim(),
    deliveryStaffName: String(body.deliveryStaffName ?? current.deliveryStaffName ?? '').trim(),
    routeName: String(body.routeName ?? current.routeName ?? current.deliveryRoute ?? '').trim(),
    deliveryRoute: String(body.routeName ?? current.deliveryRoute ?? current.routeName ?? '').trim(),
    debtBeforeCollection,
    cashAmount: cashCollected,
    bankAmount: bankCollected,
    returnAmount: effectiveReturnAmount,
    returnedAmount: effectiveReturnAmount,
    rewardAmount,
    returnItems: effectiveReturnItems,
    deliveryReturnItems: effectiveReturnItems,
    debtAmount,
    debt: debtAmount,
    arBalance: debtAmount,
    accountingStatus: isAccountingReopenPending(current) ? 'reopened' : (current.accountingStatus || 'draft_delivery'),
    accountingConfirmed: isAccountingReopenPending(current) ? false : Boolean(current.accountingConfirmed),
    accountingLocked: isAccountingReopenPending(current) ? false : Boolean(current.accountingLocked),
    editLocked: isAccountingReopenPending(current) ? false : Boolean(current.editLocked),
    accountingNeedsReconfirm: isAccountingReopenPending(current) ? true : Boolean(current.accountingNeedsReconfirm),
    needReAccounting: isAccountingReopenPending(current) ? true : Boolean(current.needReAccounting),
    reAccountingRequired: isAccountingReopenPending(current) ? true : Boolean(current.reAccountingRequired),
    adminAdjustmentOpen: isAccountingReopenPending(current) ? true : Boolean(current.adminAdjustmentOpen),
    arStatus: isAccountingReopenPending(current) ? 'needs_reconfirm' : orderDebtLifecycleStatus(debtAmount, deliveryStatus, current),
    lifecycleStatus: isAccountingReopenPending(current) ? 'needs_reconfirm' : (isDeliveryCompletedStatus(deliveryStatus)
      ? 'pending_accounting'
      : (current.lifecycleStatus || 'assigned_delivery')),
    arPostedAt: isAccountingReopenPending(current) ? '' : (current.arPostedAt || ''),
    deliveryNote: String(body.deliveryNote ?? current.deliveryNote ?? '').trim(),
    updatedAt: dateUtil.nowIso()
  };

  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(updated, { session });
  });

  // Phần mềm không sinh/chỉnh phiếu returnOrders ở màn giao hàng hôm nay.
  // returnOrders phải phát sinh từ app giao hàng để giữ đúng nguồn nghiệp vụ.

  return { salesOrder: updated };
}

module.exports = {
  updateDeliveryTodayOrder
};