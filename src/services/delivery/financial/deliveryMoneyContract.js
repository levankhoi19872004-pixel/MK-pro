'use strict';

const { toNumber } = require('../../../utils/common.util');

const DEFAULT_DEBT_ZERO_TOLERANCE = 1000;
const REWARD_OFFSET_CONTRACT_VERSION = 2;
const REWARD_OFFSET_SEMANTICS = Object.freeze({
  INDEPENDENT: 'independent_components',
  OFFSET_INCLUDES_REWARD: 'offset_includes_reward',
  AMBIGUOUS_LEGACY: 'ambiguous_legacy'
});

const CASH_FIELDS = Object.freeze([
  'cashAmount', 'newCashAmount', 'cashCollectedAmount', 'newCashCollectedAmount',
  'cashReceivedAmount', 'paymentCashAmount', 'paidCashAmount', 'paidCash',
  'collectedCash', 'deliveryCashAmount', 'cashCollected', 'cash',
  'cashInAmount', 'cashPaymentAmount'
]);
const BANK_FIELDS = Object.freeze([
  'bankAmount', 'newBankAmount', 'transferAmount', 'newTransferAmount',
  'bankTransferAmount', 'paymentTransferAmount', 'paymentBankAmount',
  'paidBankAmount', 'paidTransferAmount', 'collectedBankAmount',
  'deliveryBankAmount', 'bankCollected', 'bankCollectedAmount',
  'newBankCollectedAmount', 'transferCollectedAmount', 'bankPaymentAmount'
]);
const REWARD_FIELDS = Object.freeze([
  'rewardAmount', 'newRewardAmount', 'bonusAmount', 'newBonusAmount',
  'allowanceAmount', 'newAllowanceAmount', 'promotionRewardAmount',
  'newPromotionRewardAmount', 'displayRewardAmount', 'newDisplayRewardAmount',
  'bonusReturnAmount', 'newBonusReturnAmount', 'rewardOffsetAmount',
  'newRewardOffsetAmount', 'promotionOffsetAmount', 'newPromotionOffsetAmount',
  'correctedRewardAmount', 'finalRewardAmount'
]);
const OFFSET_FIELDS = Object.freeze([
  'offsetAmount', 'newOffsetAmount', 'debtOffsetAmount', 'newDebtOffsetAmount',
  'otherOffsetAmount', 'newOtherOffsetAmount', 'deliveryOffsetAmount',
  'newDeliveryOffsetAmount', 'correctedOffsetAmount', 'finalOffsetAmount'
]);
const COLLECTED_FIELDS = Object.freeze([
  'collectedAmount', 'newCollectedAmount', 'cashCollectedTotal', 'paidAmount',
  'paymentAmount', 'deliveryCollectedAmount'
]);
const RECEIVABLE_FIELDS = Object.freeze([
  'receivableAmount', 'originalAmount', 'saleAmount', 'totalReceivable',
  'totalAmount', 'amount', 'total', 'finalAmount', 'orderAmount'
]);
const RETURN_FIELDS = Object.freeze([
  'returnAmount', 'newReturnAmount', 'returnedAmount', 'actualReturnAmount',
  'returnOrderAmount', 'returnAmountFromReturnOrders', 'syncedReturnAmountFromReturnOrders'
]);
const RAW_DEBT_FIELDS = Object.freeze(['rawFinalDebtAmount', 'rawDebtAmount']);
const NORMALIZED_DEBT_FIELDS = Object.freeze(['finalDebtAmount', 'debtAmount', 'normalizedDebtAmount']);

function text(value = '') {
  return String(value ?? '').trim();
}

function hasOwnValue(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, key)
    && source[key] !== undefined
    && source[key] !== null
    && source[key] !== '';
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') {
    return { present: false, valid: false, value: 0, reason: 'ABSENT' };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { present: true, valid: false, value: 0, reason: 'NON_FINITE' };
    return { present: true, valid: true, value: Math.round(value) };
  }
  const raw = text(value);
  if (!raw) return { present: false, valid: false, value: 0, reason: 'ABSENT' };
  if (!/[0-9]/.test(raw) || /(?:nan|infinity)/i.test(raw)) {
    return { present: true, valid: false, value: 0, reason: 'UNPARSEABLE' };
  }
  const parsed = Number(toNumber(raw));
  if (!Number.isFinite(parsed)) return { present: true, valid: false, value: 0, reason: 'NON_FINITE' };
  return { present: true, valid: true, value: Math.round(parsed) };
}

function pushDiagnostic(diagnostics, entry) {
  if (!Array.isArray(diagnostics)) return;
  diagnostics.push(entry);
}

function readFirstMoney(source = {}, keys = [], options = {}) {
  const diagnostics = options.diagnostics;
  const sourceName = options.sourceName || 'unknown';
  const component = options.component || 'money';
  for (const key of keys) {
    if (!hasOwnValue(source, key)) continue;
    const parsed = parseMoney(source[key]);
    if (!parsed.valid) {
      pushDiagnostic(diagnostics, {
        code: 'INVALID_MONEY', source: sourceName, component, field: key,
        reason: parsed.reason
      });
      continue;
    }
    if (options.nonNegative === true && parsed.value < 0) {
      pushDiagnostic(diagnostics, {
        code: 'NEGATIVE_INPUT_COMPONENT', source: sourceName, component,
        field: key, value: parsed.value
      });
      continue;
    }
    return { present: true, valid: true, value: parsed.value, field: key };
  }
  return { present: false, valid: false, value: 0, field: '' };
}

function firstDefinedMoney(source = {}, keys = []) {
  return readFirstMoney(source, keys).value;
}

function hasAnyExplicitField(source = {}, keys = []) {
  return keys.some((key) => hasOwnValue(source, key));
}

function normalizedDebt(value, tolerance = DEFAULT_DEBT_ZERO_TOLERANCE) {
  const rounded = Math.round(Number(value) || 0);
  return Math.abs(rounded) <= tolerance ? 0 : rounded;
}

function semanticMarker(source = {}) {
  const raw = text(
    source.rewardOffsetSemantics
    || source.rewardOffsetSemantic
    || source.rewardOffsetContract
    || (source.metadata && (source.metadata.rewardOffsetSemantics || source.metadata.rewardOffsetSemantic))
  ).toLowerCase();
  if (['independent_components', 'independent', 'reward_and_offset_independent'].includes(raw)) {
    return REWARD_OFFSET_SEMANTICS.INDEPENDENT;
  }
  if (['offset_includes_reward', 'aggregate_offset', 'reward_subcomponent_of_offset'].includes(raw)) {
    return REWARD_OFFSET_SEMANTICS.OFFSET_INCLUDES_REWARD;
  }
  if (source.offsetIncludesReward === true || (source.metadata && source.metadata.offsetIncludesReward === true)) {
    return REWARD_OFFSET_SEMANTICS.OFFSET_INCLUDES_REWARD;
  }
  const rawVersion = source.rewardOffsetContractVersion ?? (source.metadata && source.metadata.rewardOffsetContractVersion);
  const version = Number(rawVersion);
  if (Number.isFinite(version) && version >= REWARD_OFFSET_CONTRACT_VERSION) {
    return REWARD_OFFSET_SEMANTICS.INDEPENDENT;
  }
  return '';
}

function debtInvariantSemantics(source = {}, amounts = {}, options = {}) {
  const diagnostics = options.diagnostics || [];
  const sourceName = options.sourceName || 'unknown';
  const receivable = readFirstMoney(source, RECEIVABLE_FIELDS, {
    diagnostics, sourceName, component: 'receivableAmount', nonNegative: true
  });
  const returned = readFirstMoney(source, RETURN_FIELDS, {
    diagnostics, sourceName, component: 'returnAmount', nonNegative: true
  });
  if (!receivable.present) return { semantic: '', evidence: '' };

  const sourceCash = readFirstMoney(source, CASH_FIELDS, {
    diagnostics, sourceName, component: 'cashAmount', nonNegative: true
  });
  const sourceBank = readFirstMoney(source, BANK_FIELDS, {
    diagnostics, sourceName, component: 'bankAmount', nonNegative: true
  });
  const cashAmount = Number.isFinite(Number(amounts.cashAmount))
    ? Math.round(Number(amounts.cashAmount))
    : sourceCash.value;
  const bankAmount = Number.isFinite(Number(amounts.bankAmount))
    ? Math.round(Number(amounts.bankAmount))
    : sourceBank.value;
  const rewardAmount = Math.round(Number(amounts.rewardAmount) || 0);
  const offsetAmount = Math.round(Number(amounts.offsetAmount) || 0);
  const returnAmount = returned.present ? returned.value : 0;
  const aggregateRaw = Math.round(receivable.value - cashAmount - bankAmount - offsetAmount - returnAmount);
  const independentRaw = Math.round(receivable.value - cashAmount - bankAmount - rewardAmount - offsetAmount - returnAmount);

  const rawStored = readFirstMoney(source, RAW_DEBT_FIELDS, {
    diagnostics, sourceName, component: 'rawDebtAmount'
  });
  if (rawStored.present) {
    const aggregateMatches = Math.abs(rawStored.value - aggregateRaw) <= 1;
    const independentMatches = Math.abs(rawStored.value - independentRaw) <= 1;
    if (aggregateMatches && !independentMatches) {
      return { semantic: REWARD_OFFSET_SEMANTICS.OFFSET_INCLUDES_REWARD, evidence: 'raw_debt_invariant' };
    }
    if (independentMatches && !aggregateMatches) {
      return { semantic: REWARD_OFFSET_SEMANTICS.INDEPENDENT, evidence: 'raw_debt_invariant' };
    }
  }

  const storedDebt = readFirstMoney(source, NORMALIZED_DEBT_FIELDS, {
    diagnostics, sourceName, component: 'storedDebtAmount'
  });
  if (storedDebt.present) {
    const toleranceRaw = Number(source.zeroTolerance ?? options.zeroTolerance ?? DEFAULT_DEBT_ZERO_TOLERANCE);
    const tolerance = Number.isFinite(toleranceRaw) ? Math.max(0, Math.round(toleranceRaw)) : DEFAULT_DEBT_ZERO_TOLERANCE;
    const aggregateMatches = storedDebt.value === normalizedDebt(aggregateRaw, tolerance);
    const independentMatches = storedDebt.value === normalizedDebt(independentRaw, tolerance);
    if (aggregateMatches && !independentMatches) {
      return { semantic: REWARD_OFFSET_SEMANTICS.OFFSET_INCLUDES_REWARD, evidence: 'normalized_debt_invariant' };
    }
    if (independentMatches && !aggregateMatches) {
      return { semantic: REWARD_OFFSET_SEMANTICS.INDEPENDENT, evidence: 'normalized_debt_invariant' };
    }
  }
  return { semantic: '', evidence: '' };
}

function resolveRewardOffsetComponents(source = {}, options = {}) {
  const diagnostics = options.diagnostics || [];
  const sourceName = options.sourceName || 'unknown';
  const reward = readFirstMoney(source, REWARD_FIELDS, {
    diagnostics, sourceName, component: 'rewardAmount', nonNegative: true
  });
  const offset = readFirstMoney(source, OFFSET_FIELDS, {
    diagnostics, sourceName, component: 'offsetAmount', nonNegative: true
  });
  const rawRewardAmount = reward.value;
  const rawOffsetAmount = offset.value;

  if (!reward.present || rawRewardAmount === 0) {
    return {
      rewardAmount: 0,
      offsetAmount: rawOffsetAmount,
      handledRewardOffsetAmount: rawOffsetAmount,
      rawRewardAmount,
      rawOffsetAmount,
      rewardField: reward.field,
      offsetField: offset.field,
      semantic: REWARD_OFFSET_SEMANTICS.INDEPENDENT,
      classification: rawOffsetAmount > 0 ? 'offset_only' : 'zero',
      evidence: offset.present ? 'single_component' : 'absent',
      ambiguous: false
    };
  }
  if (!offset.present || rawOffsetAmount === 0) {
    return {
      rewardAmount: rawRewardAmount,
      offsetAmount: 0,
      handledRewardOffsetAmount: rawRewardAmount,
      rawRewardAmount,
      rawOffsetAmount,
      rewardField: reward.field,
      offsetField: offset.field,
      semantic: REWARD_OFFSET_SEMANTICS.INDEPENDENT,
      classification: 'reward_only',
      evidence: 'single_component',
      ambiguous: false
    };
  }

  let semantic = semanticMarker(source);
  let evidence = semantic ? 'explicit_contract_marker' : '';
  if (!semantic && Object.values(REWARD_OFFSET_SEMANTICS).includes(options.semanticHint)) {
    semantic = options.semanticHint;
    evidence = text(options.semanticEvidence || 'trusted_caller_semantic_hint');
  }
  if (!semantic) {
    const inferred = debtInvariantSemantics(source, {
      cashAmount: options.cashAmount,
      bankAmount: options.bankAmount,
      rewardAmount: rawRewardAmount,
      offsetAmount: rawOffsetAmount
    }, { diagnostics, sourceName, zeroTolerance: options.zeroTolerance });
    semantic = inferred.semantic;
    evidence = inferred.evidence;
  }

  if (semantic === REWARD_OFFSET_SEMANTICS.OFFSET_INCLUDES_REWARD) {
    if (rawOffsetAmount >= rawRewardAmount) {
      const independentOffsetAmount = rawOffsetAmount - rawRewardAmount;
      const duplicateAlias = independentOffsetAmount === 0;
      if (duplicateAlias && evidence !== 'explicit_contract_marker') {
        pushDiagnostic(diagnostics, {
          code: 'LEGACY_REWARD_OFFSET_LABEL_AMBIGUOUS',
          source: sourceName,
          rewardAmount: rawRewardAmount,
          offsetAmount: rawOffsetAmount,
          message: 'Tổng tiền được xác định an toàn là một khoản, nhưng dữ liệu legacy không đủ provenance để biết nhãn gốc là reward hay independent offset.'
        });
      }
      pushDiagnostic(diagnostics, {
        code: 'LEGACY_REWARD_OFFSET_NORMALIZED',
        source: sourceName,
        evidence,
        rewardAmount: rawRewardAmount,
        storedOffsetAmount: rawOffsetAmount,
        normalizedOffsetAmount: independentOffsetAmount
      });
      return {
        rewardAmount: rawRewardAmount,
        offsetAmount: independentOffsetAmount,
        handledRewardOffsetAmount: rawOffsetAmount,
        rawRewardAmount,
        rawOffsetAmount,
        rewardField: reward.field,
        offsetField: offset.field,
        semantic,
        classification: duplicateAlias ? 'safe_duplicate_alias' : 'legacy_offset_includes_reward',
        evidence,
        ambiguous: duplicateAlias && evidence !== 'explicit_contract_marker'
      };
    }
    pushDiagnostic(diagnostics, {
      code: 'REWARD_OFFSET_CONTRACT_INCONSISTENT',
      source: sourceName,
      semantic,
      rewardAmount: rawRewardAmount,
      offsetAmount: rawOffsetAmount
    });
    return {
      rewardAmount: rawRewardAmount,
      offsetAmount: 0,
      handledRewardOffsetAmount: rawRewardAmount,
      rawRewardAmount,
      rawOffsetAmount,
      rewardField: reward.field,
      offsetField: offset.field,
      semantic: REWARD_OFFSET_SEMANTICS.AMBIGUOUS_LEGACY,
      classification: 'ambiguous',
      evidence: evidence || 'inconsistent_contract',
      ambiguous: true
    };
  }

  if (semantic === REWARD_OFFSET_SEMANTICS.INDEPENDENT) {
    return {
      rewardAmount: rawRewardAmount,
      offsetAmount: rawOffsetAmount,
      handledRewardOffsetAmount: rawRewardAmount + rawOffsetAmount,
      rawRewardAmount,
      rawOffsetAmount,
      rewardField: reward.field,
      offsetField: offset.field,
      semantic,
      classification: 'independent_reward_offset',
      evidence,
      ambiguous: false
    };
  }

  pushDiagnostic(diagnostics, {
    code: 'AMBIGUOUS_LEGACY_REWARD_OFFSET',
    source: sourceName,
    rewardAmount: rawRewardAmount,
    offsetAmount: rawOffsetAmount,
    message: 'Không đủ provenance/invariant để xác định rewardAmount và offsetAmount là independent hay legacy aggregate; giữ nguyên hai component và yêu cầu audit.'
  });
  return {
    rewardAmount: rawRewardAmount,
    offsetAmount: rawOffsetAmount,
    handledRewardOffsetAmount: rawRewardAmount + rawOffsetAmount,
    rawRewardAmount,
    rawOffsetAmount,
    rewardField: reward.field,
    offsetField: offset.field,
    semantic: REWARD_OFFSET_SEMANTICS.AMBIGUOUS_LEGACY,
    classification: 'ambiguous',
    evidence: 'insufficient_provenance',
    ambiguous: true
  };
}

function readPaymentBreakdown(source = {}, options = {}) {
  const diagnostics = options.diagnostics || [];
  const sourceName = options.sourceName || 'unknown';
  const cash = readFirstMoney(source, CASH_FIELDS, { diagnostics, sourceName, component: 'cashAmount', nonNegative: true });
  const bank = readFirstMoney(source, BANK_FIELDS, { diagnostics, sourceName, component: 'bankAmount', nonNegative: true });
  const explicitCollected = readFirstMoney(source, COLLECTED_FIELDS, { diagnostics, sourceName, component: 'totalCollectedAmount', nonNegative: true });

  let cashAmount = cash.value;
  let bankAmount = bank.value;
  const rewardOffset = resolveRewardOffsetComponents(source, {
    diagnostics,
    sourceName,
    cashAmount,
    bankAmount,
    zeroTolerance: options.zeroTolerance
  });
  const hasComponentField = cash.present || bank.present
    || hasAnyExplicitField(source, REWARD_FIELDS)
    || hasAnyExplicitField(source, OFFSET_FIELDS);

  // Legacy documents sometimes only stored a total collected amount. Preserve that
  // behavior without using truthiness and without double counting explicit components.
  if (!hasComponentField && explicitCollected.present) cashAmount = explicitCollected.value;

  const totalCollectedAmount = cashAmount + bankAmount + rewardOffset.handledRewardOffsetAmount;
  return {
    cashAmount,
    bankAmount,
    rewardAmount: rewardOffset.rewardAmount,
    offsetAmount: rewardOffset.offsetAmount,
    handledRewardOffsetAmount: rewardOffset.handledRewardOffsetAmount,
    rewardOffsetClassification: rewardOffset.classification,
    rewardOffsetSemantic: rewardOffset.semantic,
    rewardOffsetEvidence: rewardOffset.evidence,
    rewardOffsetAmbiguous: rewardOffset.ambiguous,
    totalCollectedAmount,
    collectedAmount: totalCollectedAmount,
    hasExplicitPayment: hasComponentField || explicitCollected.present,
    invalid: diagnostics.some((row) => row && row.source === sourceName
      && ['INVALID_MONEY', 'NEGATIVE_INPUT_COMPONENT'].includes(row.code))
  };
}

function readReceivableAmount(source = {}, options = {}) {
  const result = readFirstMoney(source, options.keys || RECEIVABLE_FIELDS, {
    diagnostics: options.diagnostics,
    sourceName: options.sourceName || 'unknown',
    component: 'receivableAmount',
    nonNegative: true
  });
  return result;
}

function calculateDebt({ receivableAmount = 0, cashAmount = 0, bankAmount = 0, rewardAmount = 0, offsetAmount = 0, handledRewardOffsetAmount, returnAmount = 0 } = {}, options = {}) {
  const tolerance = Number.isFinite(Number(options.zeroTolerance))
    ? Math.max(0, Math.round(Number(options.zeroTolerance)))
    : DEFAULT_DEBT_ZERO_TOLERANCE;
  const rewardOffsetTotal = Number.isFinite(Number(handledRewardOffsetAmount))
    ? Math.round(Number(handledRewardOffsetAmount))
    : Math.round(Number(rewardAmount || 0) + Number(offsetAmount || 0));
  const totalCollectedAmount = Math.round(Number(cashAmount || 0) + Number(bankAmount || 0) + rewardOffsetTotal);
  const totalHandledAmount = Math.round(totalCollectedAmount + Number(returnAmount || 0));
  const debtRaw = Math.round(Number(receivableAmount || 0) - totalHandledAmount);
  const debtAmount = Math.abs(debtRaw) <= tolerance ? 0 : debtRaw;
  return {
    totalCollectedAmount,
    collectedAmount: totalCollectedAmount,
    handledRewardOffsetAmount: rewardOffsetTotal,
    totalHandledAmount,
    debtRaw,
    debtAmount,
    openDebtAmount: Math.max(0, debtAmount),
    overpaidAmount: Math.max(0, -debtAmount),
    zeroTolerance: tolerance,
    zeroToleranceApplied: debtAmount === 0 && debtRaw !== 0
  };
}

module.exports = {
  DEFAULT_DEBT_ZERO_TOLERANCE,
  REWARD_OFFSET_CONTRACT_VERSION,
  REWARD_OFFSET_SEMANTICS,
  CASH_FIELDS,
  BANK_FIELDS,
  REWARD_FIELDS,
  OFFSET_FIELDS,
  COLLECTED_FIELDS,
  RECEIVABLE_FIELDS,
  RETURN_FIELDS,
  text,
  hasOwnValue,
  parseMoney,
  readFirstMoney,
  firstDefinedMoney,
  hasAnyExplicitField,
  resolveRewardOffsetComponents,
  readPaymentBreakdown,
  readReceivableAmount,
  calculateDebt
};
