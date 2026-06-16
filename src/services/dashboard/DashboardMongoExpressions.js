'use strict';

const INACTIVE_STATUSES = Object.freeze([
  'void',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'duplicate_cancelled'
]);

const ACCOUNTING_CONFIRMED_STATUSES = Object.freeze(['confirmed', 'locked', 'posted']);
const ACCOUNTING_REOPEN_STATUSES = Object.freeze(['reopened', 'needs_reconfirm', 'needs_repost']);
const RETURN_CONFIRMED_STATES = Object.freeze(['accounting_confirmed', 'posted_to_ar']);
const TRUTHY_DELETE_VALUES = Object.freeze([true, 'true', 1, '1', 'yes', 'YES', 'y', 'Y']);

function stringExpression(field) {
  return {
    $trim: {
      input: {
        $convert: {
          input: `$${field}`,
          to: 'string',
          onError: '',
          onNull: ''
        }
      }
    }
  };
}

function firstNonBlankExpression(fields = [], fallback = '') {
  return fields.reduceRight((next, field) => ({
    $let: {
      vars: { current: stringExpression(field) },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$current' }, 0] },
          '$$current',
          next
        ]
      }
    }
  }), fallback);
}

function numberExpression(fields = [], fallback = 0) {
  const source = fields.reduceRight((next, field) => ({ $ifNull: [`$${field}`, next] }), fallback);
  return {
    $convert: {
      input: source,
      to: 'double',
      onError: 0,
      onNull: 0
    }
  };
}

function dateToStringExpression(dateExpression) {
  return {
    $dateToString: {
      date: dateExpression,
      format: '%Y-%m-%d',
      timezone: 'Asia/Ho_Chi_Minh',
      onNull: ''
    }
  };
}

/**
 * Chuẩn hóa một field ngày thành YYYY-MM-DD ngay trong Mongo aggregation.
 * Hỗ trợ BSON Date, ISO/YYYY-MM-DD, YYYY/MM/DD và DD/MM/YYYY, DD-MM-YYYY,
 * DD.MM.YYYY. Giá trị không hợp lệ trả về chuỗi rỗng để field ưu tiên kế tiếp
 * được sử dụng; không OR createdAt với ngày nghiệp vụ.
 */
function normalizedDateFieldExpression(field) {
  return {
    $let: {
      vars: {
        rawValue: `$${field}`,
        rawText: stringExpression(field),
        rawType: { $type: `$${field}` }
      },
      in: {
        $switch: {
          branches: [
            {
              case: { $eq: ['$$rawType', 'date'] },
              then: dateToStringExpression('$$rawValue')
            },
            {
              case: {
                $regexMatch: {
                  input: '$$rawText',
                  regex: '^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}'
                }
              },
              then: dateToStringExpression({
                $dateFromString: {
                  dateString: {
                    $replaceAll: {
                      input: { $substrCP: ['$$rawText', 0, 10] },
                      find: '/',
                      replacement: '-'
                    }
                  },
                  onError: null,
                  onNull: null
                }
              })
            },
            {
              case: {
                $regexMatch: {
                  input: '$$rawText',
                  regex: '^\\d{2}/\\d{2}/\\d{4}'
                }
              },
              then: dateToStringExpression({
                $dateFromString: {
                  dateString: { $substrCP: ['$$rawText', 0, 10] },
                  format: '%d/%m/%Y',
                  onError: null,
                  onNull: null
                }
              })
            },
            {
              case: {
                $regexMatch: {
                  input: '$$rawText',
                  regex: '^\\d{2}-\\d{2}-\\d{4}'
                }
              },
              then: dateToStringExpression({
                $dateFromString: {
                  dateString: { $substrCP: ['$$rawText', 0, 10] },
                  format: '%d-%m-%Y',
                  onError: null,
                  onNull: null
                }
              })
            },
            {
              case: {
                $regexMatch: {
                  input: '$$rawText',
                  regex: '^\\d{2}\\.\\d{2}\\.\\d{4}'
                }
              },
              then: dateToStringExpression({
                $dateFromString: {
                  dateString: { $substrCP: ['$$rawText', 0, 10] },
                  format: '%d.%m.%Y',
                  onError: null,
                  onNull: null
                }
              })
            }
          ],
          default: ''
        }
      }
    }
  };
}

function firstValidDateExpression(fields = [], fallbackField = 'createdAt') {
  const allFields = [...fields, fallbackField].filter(Boolean);
  return allFields.reduceRight((next, field) => ({
    $let: {
      vars: { normalized: normalizedDateFieldExpression(field) },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$normalized' }, 0] },
          '$$normalized',
          next
        ]
      }
    }
  }), '');
}

function businessDateStages(dateFrom, dateTo, fields = [], internalField = '_dashboardBusinessDate') {
  return [
    { $set: { [internalField]: firstValidDateExpression(fields, 'createdAt') } },
    { $match: { [internalField]: { $gte: dateFrom, $lte: dateTo } } }
  ];
}

function activeDocumentFilter() {
  // Một chứng từ chỉ được xem là còn hiệu lực khi toàn bộ các trường vòng đời
  // đều không ở trạng thái hủy/xóa. Dữ liệu legacy có thể chỉ cập nhật một
  // trong các field status/lifecycleStatus/deliveryStatus/returnState.
  return {
    status: { $nin: INACTIVE_STATUSES },
    lifecycleStatus: { $nin: INACTIVE_STATUSES },
    deliveryStatus: { $nin: INACTIVE_STATUSES },
    returnStatus: { $nin: INACTIVE_STATUSES },
    returnState: { $nin: INACTIVE_STATUSES },
    deleted: { $nin: TRUTHY_DELETE_VALUES },
    isDeleted: { $nin: TRUTHY_DELETE_VALUES },
    deletedAt: { $in: [null, ''] }
  };
}

function accountingConfirmedFilter() {
  return {
    $and: [
      {
        accountingStatus: { $nin: ACCOUNTING_REOPEN_STATUSES }
      },
      { accountingNeedsReconfirm: { $ne: true } },
      { needReAccounting: { $ne: true } },
      { reAccountingRequired: { $ne: true } },
      { adminAdjustmentOpen: { $ne: true } },
      {
        $or: [
          { accountingConfirmed: true },
          { accountingStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } },
          { arPosted: true },
          { arStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } }
        ]
      }
    ]
  };
}

function returnConfirmedFilter() {
  return {
    $or: [
      { arPosted: true },
      { returnState: { $in: RETURN_CONFIRMED_STATES } },
      { status: { $in: RETURN_CONFIRMED_STATES } },
      { accountingConfirmed: true },
      { accountingStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } }
    ]
  };
}

function salesStaffCodeExpression() {
  return firstNonBlankExpression(['salesStaffCode', 'salesmanCode', 'nvbhCode'], '');
}

function salesStaffNameExpression() {
  return firstNonBlankExpression(['salesStaffName', 'salesmanName', 'nvbhName'], '');
}

function deliveryStaffCodeExpression() {
  return firstNonBlankExpression(['deliveryStaffCode', 'deliveryCode', 'nvghCode'], '');
}

function deliveryStaffNameExpression() {
  return firstNonBlankExpression(['deliveryStaffName', 'deliveryName', 'nvghName'], '');
}

module.exports = {
  INACTIVE_STATUSES,
  ACCOUNTING_CONFIRMED_STATUSES,
  ACCOUNTING_REOPEN_STATUSES,
  RETURN_CONFIRMED_STATES,
  TRUTHY_DELETE_VALUES,
  stringExpression,
  firstNonBlankExpression,
  numberExpression,
  normalizedDateFieldExpression,
  firstValidDateExpression,
  businessDateStages,
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  salesStaffCodeExpression,
  salesStaffNameExpression,
  deliveryStaffCodeExpression,
  deliveryStaffNameExpression
};
