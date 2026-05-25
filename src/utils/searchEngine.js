function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeKeyword(value) {
  return toText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getValueByPath(item, path) {
  if (!item || !path) return '';

  return String(path)
    .split('.')
    .reduce((current, key) => {
      if (current === null || current === undefined) return '';
      return current[key];
    }, item);
}

function getFieldValue(item, field) {
  if (typeof field === 'function') return field(item);
  return getValueByPath(item, field);
}

function parseFields(fields = []) {
  return fields.map(field => {
    if (typeof field === 'string') {
      return { key: field, path: field, weight: 1 };
    }

    return {
      key: field.key || field.path,
      path: field.path || field.key,
      weight: Number(field.weight || 1)
    };
  });
}

function buildSearchText(item, fields = []) {
  return parseFields(fields)
    .map(field => getFieldValue(item, field.path))
    .map(normalizeKeyword)
    .filter(Boolean)
    .join(' ');
}

function scoreItem(item, keyword, fields = []) {
  const key = normalizeKeyword(keyword);
  if (!key) return 1;

  const terms = key.split(' ').filter(Boolean);
  const parsedFields = parseFields(fields);
  let score = 0;

  for (const field of parsedFields) {
    const value = normalizeKeyword(getFieldValue(item, field.path));
    if (!value) continue;

    for (const term of terms) {
      if (value === term) score += 100 * field.weight;
      else if (value.startsWith(term)) score += 60 * field.weight;
      else if (value.includes(term)) score += 25 * field.weight;
    }
  }

  const fullText = buildSearchText(item, fields);
  if (fullText.includes(key)) score += 10;

  return score;
}

function matchFilters(item, filters = {}) {
  return Object.entries(filters).every(([path, expected]) => {
    if (expected === undefined || expected === null || expected === '') return true;

    const actual = getValueByPath(item, path);

    if (Array.isArray(expected)) {
      return expected.map(normalizeKeyword).includes(normalizeKeyword(actual));
    }

    return normalizeKeyword(actual) === normalizeKeyword(expected);
  });
}

function searchCollection(options = {}) {
  const {
    items = [],
    keyword = '',
    fields = [],
    filters = {},
    activeOnly = false,
    activeField = 'isActive',
    limit = 50,
    mapItem
  } = options;

  const key = normalizeKeyword(keyword);

  return items
    .filter(item => {
      if (activeOnly && item && item[activeField] === false) return false;
      if (!matchFilters(item, filters)) return false;
      if (!key) return true;
      return scoreItem(item, key, fields) > 0;
    })
    .map(item => ({ item, score: scoreItem(item, key, fields) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(limit || 50))
    .map(result => {
      if (typeof mapItem === 'function') {
        return mapItem(result.item, result.score);
      }

      return result.item;
    });
}

function makeSuggestion(item, config = {}) {
  const code = toText(getFieldValue(item, config.codeField || 'code'));
  const name = toText(getFieldValue(item, config.nameField || 'name'));
  const subTextFields = config.subTextFields || [];

  const subText = subTextFields
    .map(field => toText(getFieldValue(item, field)))
    .filter(Boolean)
    .join(' - ');

  return {
    code,
    name,
    text: [code, name, subText].filter(Boolean).join(' - '),
    raw: item
  };
}

function suggestCollection(options = {}) {
  const { suggestionConfig = {}, limit = 20 } = options;

  return searchCollection({
    ...options,
    limit,
    activeOnly: options.activeOnly !== false,
    mapItem: item => makeSuggestion(item, suggestionConfig)
  });
}

module.exports = {
  toText,
  normalizeKeyword,
  getValueByPath,
  buildSearchText,
  scoreItem,
  searchCollection,
  suggestCollection,
  makeSuggestion
};
