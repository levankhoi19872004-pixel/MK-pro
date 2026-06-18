'use strict';

function requireFeature(flagGetter, featureName) {
  return function featureFlagGuard(req, res, next) {
    if (typeof flagGetter === 'function' && flagGetter()) return next();
    return res.status(404).json({
      ok: false,
      success: false,
      code: 'FEATURE_DISABLED',
      message: `Tính năng ${featureName || 'này'} chưa được bật`
    });
  };
}

module.exports = { requireFeature };
