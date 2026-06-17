'use strict';

const {
  comparableIndexOptions,
  sameIndexKey,
  sameIndexOptions
} = require('./mongoIndexService');

function stableString(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function indexHasTextKey(index = {}) {
  return Object.values(index.key || {}).some((value) => value === 'text')
    || Boolean(index.textIndexVersion)
    || Boolean(index.weights);
}

function isTtlIndex(index = {}) {
  return index.expireAfterSeconds !== undefined && index.expireAfterSeconds !== null;
}

function isProtectedIndex(index = {}) {
  return index.name === '_id_' || Boolean(index.unique) || isTtlIndex(index);
}

function keyEntries(index = {}) {
  return Object.entries(index.key || {});
}

function isExactKeyPrefix(prefix = {}, full = {}) {
  const left = Object.entries(prefix || {});
  const right = Object.entries(full || {});
  if (!left.length || left.length >= right.length) return false;
  return left.every(([field, direction], position) => {
    return right[position]?.[0] === field && right[position]?.[1] === direction;
  });
}

function sameCollation(left = {}, right = {}) {
  return stableString(comparableIndexOptions(left).collation)
    === stableString(comparableIndexOptions(right).collation);
}

function samePartialFilter(left = {}, right = {}) {
  return stableString(comparableIndexOptions(left).partialFilterExpression)
    === stableString(comparableIndexOptions(right).partialFilterExpression);
}

function managedIndexCoversExisting(existing = {}, managedFields = {}, managedOptions = {}) {
  if (existing.name === '_id_' || existing.unique || isTtlIndex(existing) || indexHasTextKey(existing)) return false;
  if (!isExactKeyPrefix(existing.key, managedFields)) return false;
  if (!sameCollation(existing, managedOptions)) return false;
  if (!samePartialFilter(existing, managedOptions)) return false;

  // Index sparse/partial không thể thay thế index bao phủ toàn collection.
  if (!existing.sparse && managedOptions.sparse) return false;
  return true;
}

function mergeIndexStats(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const name = String(row?.name || '').trim();
    if (!name) continue;
    const current = map.get(name) || { ops: 0, since: null };
    current.ops += Number(row?.accesses?.ops || 0);
    const since = row?.accesses?.since ? new Date(row.accesses.since) : null;
    if (since && !Number.isNaN(since.getTime())) {
      if (!current.since || since < current.since) current.since = since;
    }
    map.set(name, current);
  }
  return map;
}

function observationHours(stat = {}, now = new Date()) {
  if (!stat?.since) return null;
  const ms = now.getTime() - new Date(stat.since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 3_600_000;
}

function managedEquivalentMap(existingIndexes = [], managedDefinitions = []) {
  const keepers = new Map();

  for (const [fields, options] of managedDefinitions) {
    const equivalents = existingIndexes.filter((index) => {
      return sameIndexKey(index.key, fields) && sameIndexOptions(index, options);
    });
    if (!equivalents.length) continue;

    const exactName = equivalents.find((index) => index.name === options?.name);
    const keeper = exactName || [...equivalents].sort((a, b) => String(a.name).localeCompare(String(b.name)))[0];
    keepers.set(options?.name || stableString(fields), keeper.name);
  }

  return keepers;
}

function analyzeIndexes({
  collectionName,
  existingIndexes = [],
  managedDefinitions = [],
  indexStats = [],
  retiredNames = [],
  emptyRetiredCollection = false,
  documentCount = null,
  minObservationHours = 168,
  now = new Date()
} = {}) {
  const stats = indexStats instanceof Map ? indexStats : mergeIndexStats(indexStats);
  const retired = new Set(retiredNames || []);
  const keepers = managedEquivalentMap(existingIndexes, managedDefinitions);
  const missingManagedUniqueKeys = managedDefinitions
    .filter(([, options]) => Boolean(options?.unique))
    .filter(([fields, options]) => !existingIndexes.some((index) => {
      return sameIndexKey(index.key, fields) && sameIndexOptions(index, options);
    }));

  return existingIndexes.map((index) => {
    const stat = stats.get(index.name) || null;
    const hours = observationHours(stat, now);
    const ops = stat ? Number(stat.ops || 0) : null;
    const base = {
      collection: collectionName,
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
      sparse: Boolean(index.sparse),
      ttl: isTtlIndex(index),
      text: indexHasTextKey(index),
      ops,
      observationHours: hours,
      reason: 'unmanaged',
      dropDefault: false,
      dropUnusedEligible: false
    };

    if (index.name === '_id_') return { ...base, reason: 'primary_key' };

    for (const [fields, options] of managedDefinitions) {
      if (!sameIndexKey(index.key, fields) || !sameIndexOptions(index, options)) continue;
      const keeperName = keepers.get(options?.name || stableString(fields));
      if (keeperName === index.name) {
        return { ...base, reason: index.name === options?.name ? 'managed' : 'managed_equivalent_name' };
      }
      return { ...base, reason: 'duplicate_managed', dropDefault: true };
    }

    if (emptyRetiredCollection && Number(documentCount || 0) === 0) {
      return { ...base, reason: 'empty_retired_collection', dropDefault: true };
    }

    if (retired.has(index.name)) {
      const requiredUniqueReplacementMissing = missingManagedUniqueKeys.some(([fields]) => {
        return sameIndexKey(index.key, fields);
      });
      if (requiredUniqueReplacementMissing) {
        return { ...base, reason: 'required_unique_replacement_missing' };
      }

      const managedReplacementExists = managedDefinitions.some(([fields, options]) => {
        if (!sameIndexKey(index.key, fields)) return false;
        return existingIndexes.some((candidate) => {
          return candidate.name !== index.name
            && sameIndexKey(candidate.key, fields)
            && sameIndexOptions(candidate, options);
        });
      });
      if (managedReplacementExists) {
        return { ...base, reason: 'retired_replaced', dropDefault: true };
      }

      // Unique/TTL cũ không được tự động xóa khi collection đang có dữ liệu.
      if (isProtectedIndex(index) && Number(documentCount || 0) > 0) {
        return { ...base, reason: 'retired_but_protected' };
      }
      if (Number(documentCount || 0) === 0) {
        return { ...base, reason: 'retired_empty_collection', dropDefault: true };
      }

      const observedLongEnough = hours !== null && hours >= Number(minObservationHours || 0);
      if (ops === 0 && observedLongEnough) {
        return { ...base, reason: 'retired_unused_candidate', dropUnusedEligible: true };
      }
      if (ops !== null && ops > 0) return { ...base, reason: 'retired_but_used' };
      if (ops === 0) return { ...base, reason: 'retired_zero_ops_short_window' };
      return { ...base, reason: 'retired_unobserved' };
    }

    const covering = managedDefinitions.find(([fields, options]) => {
      return managedIndexCoversExisting(index, fields, options);
    });
    if (covering) {
      return {
        ...base,
        reason: 'covered_prefix',
        coveredBy: covering[1]?.name || stableString(covering[0]),
        dropDefault: true
      };
    }

    const observedLongEnough = hours !== null && hours >= Number(minObservationHours || 0);
    if (!isProtectedIndex(index) && ops === 0 && observedLongEnough) {
      return { ...base, reason: 'unused_candidate', dropUnusedEligible: true };
    }

    if (ops !== null && ops > 0) return { ...base, reason: 'unmanaged_used' };
    if (ops === 0) return { ...base, reason: 'unmanaged_zero_ops_short_window' };
    return base;
  });
}

function summarizeAnalysis(rows = []) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary.byReason[row.reason] = (summary.byReason[row.reason] || 0) + 1;
    if (row.dropDefault) summary.defaultDrop += 1;
    if (row.dropUnusedEligible) summary.unusedCandidates += 1;
    return summary;
  }, { total: 0, defaultDrop: 0, unusedCandidates: 0, byReason: {} });
}

module.exports = {
  analyzeIndexes,
  indexHasTextKey,
  isExactKeyPrefix,
  isProtectedIndex,
  isTtlIndex,
  managedIndexCoversExisting,
  mergeIndexStats,
  observationHours,
  summarizeAnalysis
};
