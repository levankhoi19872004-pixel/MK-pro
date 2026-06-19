'use strict';

const RETURN_STATES = Object.freeze({
  DRAFT: 'draft',
  WAITING_RECEIVE: 'waiting_receive',
  RECEIVED: 'received',
  ACCOUNTING_CONFIRMED: 'accounting_confirmed',
  POSTED_TO_AR: 'posted_to_ar',
  CANCELLED: 'cancelled'
});

const LEGACY_STATE_MAP = Object.freeze({
  pending: RETURN_STATES.WAITING_RECEIVE,
  pending_warehouse_receive: RETURN_STATES.WAITING_RECEIVE,
  active: RETURN_STATES.WAITING_RECEIVE,
  has_return: RETURN_STATES.WAITING_RECEIVE,
  merged: RETURN_STATES.WAITING_RECEIVE,
  grouped: RETURN_STATES.WAITING_RECEIVE,
  delivered: RETURN_STATES.WAITING_RECEIVE,

  warehouse_received: RETURN_STATES.RECEIVED,

  confirmed: RETURN_STATES.ACCOUNTING_CONFIRMED,

  posted: RETURN_STATES.POSTED_TO_AR,
  completed: RETURN_STATES.POSTED_TO_AR,

  canceled: RETURN_STATES.CANCELLED,
  cancelled: RETURN_STATES.CANCELLED,
  deleted: RETURN_STATES.CANCELLED,
  void: RETURN_STATES.CANCELLED,
  voided: RETURN_STATES.CANCELLED,
  duplicate_cancelled: RETURN_STATES.CANCELLED,

  // cleared là trạng thái kỹ thuật khi phiếu trả = 0.
  // Không đưa vào lifecycle chính, nhưng coi như cancelled để khóa chỉnh sửa nghiệp vụ.
  cleared: RETURN_STATES.CANCELLED
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [RETURN_STATES.DRAFT]: [
    RETURN_STATES.WAITING_RECEIVE,
    RETURN_STATES.CANCELLED
  ],
  [RETURN_STATES.WAITING_RECEIVE]: [
    RETURN_STATES.RECEIVED,
    RETURN_STATES.CANCELLED
  ],
  [RETURN_STATES.RECEIVED]: [
    RETURN_STATES.ACCOUNTING_CONFIRMED
  ],
  [RETURN_STATES.ACCOUNTING_CONFIRMED]: [
    RETURN_STATES.POSTED_TO_AR
  ],
  [RETURN_STATES.POSTED_TO_AR]: [],
  [RETURN_STATES.CANCELLED]: []
});

function normalizeReturnState(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return RETURN_STATES.DRAFT;
  if (Object.values(RETURN_STATES).includes(raw)) return raw;
  return LEGACY_STATE_MAP[raw] || raw;
}

function getReturnState(row = {}) {
  if (row.arPosted || row.arPostedAt) return RETURN_STATES.POSTED_TO_AR;

  const status = normalizeReturnState(row.returnState || row.status || row.returnStatus || '');
  const warehouseStatus = normalizeReturnState(row.warehouseReceiveStatus || '');
  const accountingStatus = normalizeReturnState(row.accountingStatus || '');

  if (status === RETURN_STATES.POSTED_TO_AR) return RETURN_STATES.POSTED_TO_AR;
  if (status === RETURN_STATES.ACCOUNTING_CONFIRMED) return RETURN_STATES.ACCOUNTING_CONFIRMED;
  if (status === RETURN_STATES.RECEIVED) return RETURN_STATES.RECEIVED;
  if (status === RETURN_STATES.CANCELLED) return RETURN_STATES.CANCELLED;

  if (accountingStatus === RETURN_STATES.ACCOUNTING_CONFIRMED) {
    return RETURN_STATES.ACCOUNTING_CONFIRMED;
  }

  if (warehouseStatus === RETURN_STATES.RECEIVED) {
    return RETURN_STATES.RECEIVED;
  }

  return status || RETURN_STATES.DRAFT;
}

function canTransition(from, to) {
  const source = normalizeReturnState(from);
  const target = normalizeReturnState(to);
  return (ALLOWED_TRANSITIONS[source] || []).includes(target);
}

function assertTransition(row = {}, nextState, action = 'transition') {
  const currentState = getReturnState(row);
  const targetState = normalizeReturnState(nextState);

  if (currentState === targetState) {
    return { currentState, nextState: targetState, noop: true };
  }

  if (!canTransition(currentState, targetState)) {
    const err = new Error(`Không cho phép chuyển trạng thái phiếu trả từ ${currentState} sang ${targetState}`);
    err.code = 'INVALID_RETURN_STATE_TRANSITION';
    err.currentState = currentState;
    err.nextState = targetState;
    err.action = action;
    throw err;
  }

  return { currentState, nextState: targetState, noop: false };
}

function assertCanEdit(row = {}) {
  const state = getReturnState(row);

  if (![RETURN_STATES.DRAFT, RETURN_STATES.WAITING_RECEIVE].includes(state)) {
    const err = new Error('Phiếu trả đã qua bước nhận kho/kế toán, không được sửa. Vui lòng tạo phiếu đảo nếu cần điều chỉnh.');
    err.code = 'RETURN_ORDER_LOCKED';
    err.currentState = state;
    throw err;
  }

  return true;
}

function assertCanCancel(row = {}) {
  const state = getReturnState(row);

  if (![RETURN_STATES.DRAFT, RETURN_STATES.WAITING_RECEIVE].includes(state)) {
    const err = new Error('Phiếu trả đã nhận kho/ghi AR, không được hủy trực tiếp. Vui lòng tạo phiếu đảo.');
    err.code = 'RETURN_ORDER_REVERSE_REQUIRED';
    err.currentState = state;
    throw err;
  }

  return true;
}

function assertCanConfirmAccounting(row = {}) {
  const state = getReturnState(row);

  if (state !== RETURN_STATES.RECEIVED) {
    const err = new Error('Chỉ phiếu trả đã nhận kho mới được kế toán xác nhận.');
    err.code = 'RETURN_ACCOUNTING_CONFIRM_INVALID_STATE';
    err.currentState = state;
    throw err;
  }

  return true;
}

function assertCanPostAR(row = {}) {
  const state = getReturnState(row);

  if (state !== RETURN_STATES.ACCOUNTING_CONFIRMED) {
    const err = new Error('Chỉ phiếu trả đã được kế toán xác nhận mới được ghi AR-RETURN.');
    err.code = 'RETURN_AR_POST_INVALID_STATE';
    err.currentState = state;
    throw err;
  }

  return true;
}

function patchForState(row = {}, nextState) {
  const state = normalizeReturnState(nextState);
  const now = new Date().toISOString();

  if (state === RETURN_STATES.DRAFT) {
    return {
      status: RETURN_STATES.DRAFT,
      returnStatus: RETURN_STATES.DRAFT,
      returnState: RETURN_STATES.DRAFT,
      warehouseReceiveStatus: RETURN_STATES.DRAFT,
      accountingStatus: RETURN_STATES.DRAFT,
      accountingConfirmed: false,
      arPosted: false,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  if (state === RETURN_STATES.WAITING_RECEIVE) {
    return {
      status: RETURN_STATES.WAITING_RECEIVE,
      returnStatus: RETURN_STATES.WAITING_RECEIVE,
      returnState: RETURN_STATES.WAITING_RECEIVE,
      warehouseReceiveStatus: RETURN_STATES.WAITING_RECEIVE,
      accountingStatus: 'pending',
      accountingConfirmed: false,
      arPosted: false,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  if (state === RETURN_STATES.RECEIVED) {
    return {
      status: RETURN_STATES.RECEIVED,
      returnStatus: RETURN_STATES.RECEIVED,
      returnState: RETURN_STATES.RECEIVED,
      warehouseReceiveStatus: RETURN_STATES.RECEIVED,
      accountingStatus: 'pending',
      accountingConfirmed: false,
      arPosted: false,
      arPostedAt: '',
      receivedAt: row.receivedAt || now,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  if (state === RETURN_STATES.ACCOUNTING_CONFIRMED) {
    return {
      status: RETURN_STATES.ACCOUNTING_CONFIRMED,
      returnStatus: RETURN_STATES.ACCOUNTING_CONFIRMED,
      returnState: RETURN_STATES.ACCOUNTING_CONFIRMED,
      warehouseReceiveStatus: RETURN_STATES.RECEIVED,
      accountingStatus: RETURN_STATES.ACCOUNTING_CONFIRMED,
      accountingConfirmed: true,
      arPosted: false,
      arPostedAt: '',
      accountingConfirmedAt: row.accountingConfirmedAt || now,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  if (state === RETURN_STATES.POSTED_TO_AR) {
    return {
      status: RETURN_STATES.POSTED_TO_AR,
      returnStatus: RETURN_STATES.POSTED_TO_AR,
      returnState: RETURN_STATES.POSTED_TO_AR,
      warehouseReceiveStatus: RETURN_STATES.RECEIVED,
      accountingStatus: RETURN_STATES.ACCOUNTING_CONFIRMED,
      accountingConfirmed: true,
      arPosted: true,
      arPostedAt: row.arPostedAt || now,
      postedAt: row.postedAt || now,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  if (state === RETURN_STATES.CANCELLED) {
    return {
      status: RETURN_STATES.CANCELLED,
      returnStatus: RETURN_STATES.CANCELLED,
      returnState: RETURN_STATES.CANCELLED,
      warehouseReceiveStatus: RETURN_STATES.CANCELLED,
      accountingStatus: RETURN_STATES.CANCELLED,
      cancelledAt: row.cancelledAt || now,
      stateChangedAt: now,
      updatedAt: now
    };
  }

  return { status: state, returnStatus: state, returnState: state, stateChangedAt: now, updatedAt: now };
}

module.exports = {
  RETURN_STATES,
  normalizeReturnState,
  getReturnState,
  canTransition,
  assertTransition,
  assertCanEdit,
  assertCanCancel,
  assertCanConfirmAccounting,
  assertCanPostAR,
  patchForState
};
